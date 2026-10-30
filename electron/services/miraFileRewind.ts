import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { isUtf8 } from 'node:buffer'
import type { ExecutionEnv } from '@earendil-works/pi-agent-core'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { HarnessSession } from '../../src/config/harness'
import type { MiraFileRewindFile, MiraFileRewindPreview, MiraFileRewindReason, MiraFileRewindResult } from '../../src/config/miraFileRewind'
import { createSandboxedEnv, publicHarnessText } from './agentTools'

/** Private host data; full file bytes never enter renderer snapshots or IPC. */
export interface MiraFileCheckpoint {
  sequence: number; toolId: string; messageId: string; directory: string; path: string
  before: string | null; beforeKnown: number; after: string | null; afterKnown: number; settled: number
}
export interface MiraFileRewindOperation { path: string; expected: string | null; restored: string | null; sequences: number[] }
export interface MiraFileRewindPlan { preview: MiraFileRewindPreview; directory?: string; operations: MiraFileRewindOperation[] }
export interface MiraFileRewindJournal { id: string; sessionId: string; messageId: string; directory: string; operations: MiraFileRewindOperation[]; cursor: number }
type FileRewindHistory = { records: MiraFileCheckpoint[]; limited: boolean; rewoundToolIds?: string[] }
export function miraCheckpointText(value: string | null | undefined) {
  return value === null || typeof value === 'string' && Buffer.byteLength(value) <= 1024 * 1024 && !value.includes('\0') ? value : undefined
}

/** Recovery must reproduce bytes, never text decoded with replacement characters. */
export async function readMiraCheckpointFile(env: ExecutionEnv, path: string): Promise<string | null | undefined> {
  const info = await env.fileInfo(path)
  if (!info.ok) return info.error.code === 'not_found' ? null : undefined
  if (info.value.kind !== 'file' || info.value.size > 1024 * 1024) return undefined
  const bytes = await env.readBinaryFile(path)
  if (!bytes.ok || bytes.value.byteLength > 1024 * 1024 || !isUtf8(bytes.value)) return undefined
  return miraCheckpointText(Buffer.from(bytes.value).toString('utf8'))
}

/** A lexical alias may later point at another file with identical bytes. */
export function miraCheckpointPathStable(root: string, path: string) {
  const location = relative(root, resolve(root, path))
  if (!location || location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location)) return false
  let current = root
  for (const part of location.split(sep)) {
    current = resolve(current, part)
    try { const stat = lstatSync(current); if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1) return false }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' }
  }
  return true
}

/** Preview only. Compare every boundary in reverse order, including outside edits between tools. */
export async function buildMiraFileRewindPlan(session: HarnessSession, messageId: string, history: FileRewindHistory): Promise<MiraFileRewindPlan> {
  const message = session.messages.find(message => message.id === messageId && message.role === 'user')
  if (!message) throw new Error('只能预览用户消息对应的文件恢复')
  const preview: MiraFileRewindPreview = { messageId, safeFiles: [], unsafeFiles: [], ignoredTools: [], canApply: false }
  const plan: MiraFileRewindPlan = { preview, operations: [] }
  if (history.limited) { preview.unsafeFiles.push({ path: '本段文件修改', operationCount: 0, reason: 'history_limit' }); return plan }
  const grouped = new Map<string, MiraFileCheckpoint[]>()
  for (const record of history.records) {
    const key = JSON.stringify([record.directory, record.path])
    grouped.set(key, [...(grouped.get(key) ?? []), record])
  }
  const recorded = new Set(history.records.map(record => record.toolId))
  const rewound = new Set(history.rewoundToolIds)
  const suffix = new Set(session.messages.slice(session.messages.indexOf(message)).filter(message => message.role === 'user').map(message => message.id))
  const untracked = new Map<string, number>()
  for (const tool of session.toolCalls) {
    const knownOwner = Boolean(tool.messageId && session.messages.some(message => message.id === tool.messageId))
    if (knownOwner && !suffix.has(tool.messageId!)) continue
    if (rewound.has(tool.id) || tool.inherited || !knownOwner && tool.createdAt < message.createdAt || tool.skipReason || tool.status === 'waiting-confirm' || tool.status === 'running') continue
    if (['edit', 'write', 'delete'].includes(tool.tool)) {
      if (!recorded.has(tool.id)) {
        const path = publicHarnessText(tool.target || '未知文件').text
        const existing = preview.unsafeFiles.find(file => file.path === path && file.reason === 'checkpoint_missing')
        if (existing) existing.operationCount++
        else preview.unsafeFiles.push({ path, operationCount: 1, reason: 'checkpoint_missing' })
      }
    } else if (tool.tool === 'bash' || tool.tool.startsWith('mcp')) untracked.set(tool.tool === 'bash' ? '终端命令' : 'MCP 工具', (untracked.get(tool.tool === 'bash' ? '终端命令' : 'MCP 工具') ?? 0) + 1)
  }
  preview.ignoredTools = [...untracked].map(([name, count]) => ({ name, count }))
  let root: string | undefined
  try { root = session.workingDirectory ? realpathSync(session.workingDirectory) : undefined } catch { /* The preview reports an unavailable directory below. */ }
  const env = root ? createSandboxedEnv(root) : undefined
  try {
    for (const records of grouped.values()) {
      const first = records[0]!, last = records[records.length - 1]!
      const file: MiraFileRewindFile = { path: publicHarnessText(first.path).text, operationCount: records.length, action: first.before === null ? 'delete' : 'restore' }
      let reason: MiraFileRewindReason | undefined
      let originalRoot: string | undefined
      try { originalRoot = realpathSync(first.directory) } catch { /* Original project may have been moved or removed. */ }
      const location = relative(first.directory, resolve(first.directory, first.path))
      if (location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location)) reason = 'external_path'
      else if (!root || originalRoot !== root || first.directory !== root || !location) reason = 'workspace_changed'
      else if (records.some(record => !record.settled)) reason = 'operation_interrupted'
      else if (records.some(record => !record.beforeKnown || !record.afterKnown)) reason = 'checkpoint_unavailable'
      else {
        const current = await readMiraCheckpointFile(env!, location)
        if (current === undefined || !miraCheckpointPathStable(root, location)) reason = 'file_read_failed'
        else if (current !== last.after || records.some((record, index) => index > 0 && record.before !== records[index - 1]!.after)) reason = 'external_modified'
        else try { if (currentFile(root, location) !== current) reason = 'external_modified' } catch { reason = 'file_read_failed' }
      }
      if (reason) preview.unsafeFiles.push({ ...file, reason })
      else { preview.safeFiles.push(file); plan.operations.push({ path: location, expected: last.after, restored: first.before, sequences: records.map(record => record.sequence) }) }
    }
  } finally { await env?.cleanup() }
  preview.canApply = preview.safeFiles.length > 0 && preview.unsafeFiles.length === 0
  plan.directory = root
  if (preview.canApply) preview.snapshotToken = createHash('sha256').update(JSON.stringify([session.id, session.projectId, root, messageId, session.messages.map(message => [message.id, message.role, message.content]), history.records, history.rewoundToolIds ?? []])).digest('hex')
  return plan
}

export async function previewMiraFileRewind(session: HarnessSession, messageId: string, history: FileRewindHistory) { return (await buildMiraFileRewindPlan(session, messageId, history)).preview }

function currentFile(root: string, path: string): string | null {
  if (realpathSync(root) !== root || !miraCheckpointPathStable(root, path)) throw new Error('文件路径已变化')
  const target = resolve(root, path)
  // Restoring a deleted file must not recreate a directory removed outside the tools.
  if (!lstatSync(dirname(target)).isDirectory()) throw new Error('文件目录已变化')
  let stat
  try { stat = lstatSync(target) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024) throw new Error('文件无法安全恢复')
  const descriptor = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const bytes = readFileSync(descriptor)
    if (!isUtf8(bytes) || bytes.byteLength > 1024 * 1024 || bytes.includes(0)) throw new Error('文件无法安全恢复')
    return bytes.toString('utf8')
  } finally { closeSync(descriptor) }
}

/** Bounded synchronous mutations prevent another in-process run entering midway. */
function replaceFile(root: string, path: string, expected: string | null, next: string | null) {
  if (currentFile(root, path) !== expected) throw new Error('文件在确认后被修改')
  if (expected === next) return
  const target = resolve(root, path)
  if (next === null) { unlinkSync(target); return }
  const temporary = resolve(dirname(target), `.mira-recovery-${randomUUID()}.tmp`)
  const mode = expected === null ? 0o600 : lstatSync(target).mode & 0o777
  let descriptor: number | undefined
  let created = false
  try {
    descriptor = openSync(temporary, 'wx', mode); created = true
    writeFileSync(descriptor, next, 'utf8'); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined
    if (currentFile(root, path) !== expected) throw new Error('文件在确认后被修改')
    renameSync(temporary, target)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    if (created) try { unlinkSync(temporary) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}

/** Never overwrite an external edit while compensating a failed/crashed batch. */
export function compensateMiraFileRewind(journal: MiraFileRewindJournal): string[] {
  const conflicts: string[] = []
  for (const operation of journal.operations.slice(0, journal.cursor).reverse()) {
    try {
      const current = currentFile(journal.directory, operation.path)
      if (current === operation.expected) continue
      if (current !== operation.restored) throw new Error('恢复期间有外部修改')
      replaceFile(journal.directory, operation.path, current, operation.expected)
    } catch { conflicts.push(operation.path) }
  }
  return conflicts
}

export function applyMiraFileRewind(plan: MiraFileRewindPlan, snapshotToken: string, hooks: { begin: () => MiraFileRewindJournal; advance: (journal: MiraFileRewindJournal, cursor: number) => void; commit: (journal: MiraFileRewindJournal) => void; rollback: (id: string) => void }): MiraFileRewindResult {
  if (!plan.preview.canApply || !plan.directory || plan.preview.snapshotToken !== snapshotToken) return { applied: false, preview: plan.preview, message: '文件或快照已变化，请重新核对预览后确认。' }
  // Validate the whole batch before recording or changing the first file.
  try { for (const operation of plan.operations) if (currentFile(plan.directory, operation.path) !== operation.expected) throw new Error('文件已变化') }
  catch { return { applied: false, preview: { ...plan.preview, canApply: false, snapshotToken: undefined }, message: '文件已变化或无法安全写入，请刷新预览。' } }
  const journal = hooks.begin()
  try {
    for (const [index, operation] of journal.operations.entries()) { hooks.advance(journal, index + 1); journal.cursor = index + 1; replaceFile(journal.directory, operation.path, operation.expected, operation.restored) }
    hooks.commit(journal)
    return { applied: true, preview: plan.preview, message: `已恢复 ${plan.preview.safeFiles.length} 个文件，对话保持不变。` }
  } catch {
    const conflicts = compensateMiraFileRewind(journal)
    if (!conflicts.length) { hooks.rollback(journal.id); return { applied: false, preview: { ...plan.preview, canApply: false, snapshotToken: undefined }, message: '恢复未完成，已撤销本次文件改动。请刷新预览后重试。' } }
    return { applied: false, preview: miraPendingFileRewindPreview(journal, conflicts), message: '恢复未完成，部分文件无法撤销。请核对工作区后重试撤销；不会覆盖外部修改。' }
  }
}

export function miraPendingFileRewindPreview(journal: MiraFileRewindJournal, paths = journal.operations.map(operation => operation.path)): MiraFileRewindPreview {
  return { messageId: journal.messageId, safeFiles: [], unsafeFiles: paths.map(path => ({ path: publicHarnessText(path).text, operationCount: 0, reason: 'recovery_incomplete' })), ignoredTools: [], canApply: false, recoveryId: journal.id }
}
