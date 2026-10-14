import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { closeSync, cpSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type Database from 'better-sqlite3'
import {
  DEFAULT_PERMISSION_CONFIG,
  DEFAULT_HARNESS_GIT_CONFIG,
  DEFAULT_PROJECT_ICON,
  isProjectIcon,
  normalizeAutoTitle,
  type HarnessMessage,
  type HarnessConversationSearchResult,
  type HarnessFileReference,
  type HarnessAttachmentImportFile,
  type HarnessFileChange,
  type HarnessGitBranch,
  type HarnessGitConfig,
  type HarnessHistoryArchiveView,
  type HarnessHistoryPage,
  type HarnessHistoryQuery,
  type HarnessHistoryRange,
  type HarnessHistoryRow,
  type HarnessHistorySort,
  type HarnessMessageAttachment,
  type HarnessProject,
  type HarnessPlan,
  type HarnessPendingInteraction,
  type HarnessPlanSessionStatus,
  type HarnessUserAnswer,
  type HarnessRunSummary,
  type HarnessSession,
  type HarnessSideConversationInput,
  type HarnessSessionOrderScope,
  type HarnessSource,
  type HarnessSessionSummary,
  type HarnessTrashEntry,
  type HarnessUsageBucket,
  type HarnessUsageStats,
  type PermissionConfig,
  type PermissionMode,
  type ToolCallRecord,
} from '../../src/config/harness'
import { atomicMove } from './miraDataMigration'
import { buildMiraTaskFileChange, type MiraTaskFileSnapshot } from '../services/miraTaskChanges'
import type { MiraTaskChangeSummary, MiraTaskChangedFile } from '../../src/config/miraTaskChanges'
import { miraCheckpointPathStable, miraCheckpointText, type MiraFileCheckpoint, type MiraFileRewindJournal, type MiraFileRewindOperation } from '../services/miraFileRewind'
import { MiraPaths } from './miraPaths'
import { MiraCommandOutputs } from './miraCommandOutputs'
import { assertHarnessAttachmentTotals, decodeHarnessAttachmentImport, HARNESS_ATTACHMENT_LIMITS, HARNESS_ATTACHMENT_PREFIX, harnessAttachmentFromBytes, harnessAttachmentMediaType } from '../services/harnessAttachmentContent'

type ProjectRow = { id: string, name: string, icon: string, directory: string, default_model_provider_id: string | null, sort_order: number, created_at: number, updated_at: number, last_session_at: number | null }
type SessionRow = { id: string, project_id: string | null, title: string, model_provider_id: string | null, model_id: string | null, permission_mode: PermissionMode, status: HarnessSession['status'], pinned: number, unread: number, archived_at: number | null, draft_state: HarnessSession['draftState'] | null, sort_order: number, path: string, working_directory: string | null, created_at: number, updated_at: number }

const IGNORED_FILE_DIRECTORIES = new Set(['.git', '.mira', 'node_modules', 'dist', 'build', 'coverage'])
const MAX_FILE_REFERENCES = 12
const MAX_ATTACHMENT_FILE_BYTES = 256 * 1024
const MAX_ATTACHMENT_TOTAL_BYTES = 1024 * 1024
const MAX_LISTED_PROJECT_FILES = 240
const TEMPORARY_PROJECT_ID = '__temporary__'

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function now() { return Date.now() }
function trashTime(token: string, directory: string) {
  const value = Number(token.match(/^(\d+)-/)?.[1])
  return Number.isFinite(value) && value > 0 ? value : statSync(directory).mtimeMs
}
function trashPaths(root: string, relativePath = ''): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const next = relativePath ? join(relativePath, entry.name) : entry.name
    if (!entry.isDirectory()) return [next]
    const children = trashPaths(join(root, entry.name), next)
    return children.length ? children : [next]
  })
}
function createSessionId() { return randomUUID() }
function titleFor(content: string) { return content.trim().replace(/\s+/g, ' ').slice(0, 42) || '新对话' }
function projectIcon(value?: string) { return isProjectIcon(value) ? value : DEFAULT_PROJECT_ICON }
function validateProjectIcon(value?: string) {
  if (value !== undefined && !isProjectIcon(value)) throw new Error('项目图标无效')
  return value || DEFAULT_PROJECT_ICON
}
function runGit(directory: string, args: string[]) {
  try {
    return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 })
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr || '').trim() : ''
    throw new Error(stderr || (error instanceof Error ? error.message : 'Git 命令执行失败'))
  }
}
function isGitRepository(directory: string) {
  try {
    return runGit(directory, ['rev-parse', '--is-inside-work-tree']).trim() === 'true'
  } catch {
    return false
  }
}
function gitBranch(directory: string) {
  try { return runGit(directory, ['branch', '--show-current']).trim() || undefined } catch { return undefined }
}
function gitMetadata(directory: string) {
  const isRepository = isGitRepository(directory)
  return { isGitRepository: isRepository || undefined, gitBranch: isRepository ? gitBranch(directory) : undefined }
}
function isValidGitPrefix(value: string) {
  return !value || (value.endsWith('/') && !/[\s~^:?*[\\]/.test(value) && !value.includes('//') && !value.includes('..') && !value.includes('@{') && !/(?:^|\/)\.|\.lock(?:\/|$)/.test(value))
}
function gitPrefix(value: unknown, fallback = DEFAULT_HARNESS_GIT_CONFIG.branchPrefix) {
  const prefix = typeof value === 'string' ? value.trim() : fallback
  if (!isValidGitPrefix(prefix)) throw new Error('分支前缀无效')
  return prefix
}
function startOfRange(range: HarnessHistoryRange) {
  if (range === 'all') return undefined
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  if (range === 'week') date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  if (range === 'month') date.setDate(1)
  return date.getTime()
}
function previewFor(session: HarnessSession) {
  const message = [...session.messages].reverse().find(item => item.content.trim())
  return message?.content.replace(/\s+/g, ' ').trim().slice(0, 80) || undefined
}

export class HarnessStore {
  private readonly paths: MiraPaths
  readonly commandOutputs: MiraCommandOutputs

  constructor(private readonly database: Database.Database, paths: MiraPaths | string) {
    this.database.function('mira_search_fold', { deterministic: true }, (value: unknown) => typeof value === 'string' ? value.toLowerCase() : '')
    this.paths = typeof paths === 'string' ? new MiraPaths(paths) : paths
    this.commandOutputs = new MiraCommandOutputs(join(this.paths.logs, 'command-output'))
    mkdirSync(this.paths.workspace, { recursive: true })
    mkdirSync(this.paths.sessions, { recursive: true })
    this.ensureStructuredSchema()
  }

  private ensureStructuredSchema() {
    const sessionColumns = this.database.prepare('PRAGMA table_info(harness_sessions)').all() as Array<{ name: string }>
    if (sessionColumns.length && !sessionColumns.some(column => column.name === 'draft_state')) this.database.exec('ALTER TABLE harness_sessions ADD COLUMN draft_state TEXT')
    if (sessionColumns.length && !sessionColumns.some(column => column.name === 'parent_session_id')) this.database.exec('ALTER TABLE harness_sessions ADD COLUMN parent_session_id TEXT')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS harness_session_state (session_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS harness_messages (session_id TEXT NOT NULL, message_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id, message_id));
      CREATE TABLE IF NOT EXISTS harness_tool_calls (session_id TEXT NOT NULL, tool_id TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id, tool_id));
      CREATE TABLE IF NOT EXISTS harness_plans (session_id TEXT NOT NULL, plan_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(session_id, plan_id));
      CREATE TABLE IF NOT EXISTS harness_interactions (session_id TEXT NOT NULL, interaction_id TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id, interaction_id));
      CREATE TABLE IF NOT EXISTS harness_runs (session_id TEXT NOT NULL, run_id TEXT NOT NULL, payload TEXT NOT NULL, started_at INTEGER NOT NULL, PRIMARY KEY(session_id, run_id));
      CREATE TABLE IF NOT EXISTS harness_run_activities (session_id TEXT NOT NULL, run_id TEXT NOT NULL, activity_id TEXT NOT NULL, payload TEXT NOT NULL, started_at INTEGER NOT NULL, PRIMARY KEY(session_id, run_id, activity_id));
      CREATE TABLE IF NOT EXISTS harness_subtasks (session_id TEXT NOT NULL, run_id TEXT NOT NULL, subtask_id TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id, run_id, subtask_id));
      CREATE TABLE IF NOT EXISTS harness_attachments (session_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(session_id, id));
      CREATE TABLE IF NOT EXISTS harness_task_files (session_id TEXT NOT NULL, path TEXT NOT NULL, first_content TEXT, first_known INTEGER NOT NULL, public_payload TEXT NOT NULL, PRIMARY KEY(session_id, path));
      CREATE TABLE IF NOT EXISTS harness_file_checkpoints (sequence INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, tool_id TEXT NOT NULL, message_id TEXT NOT NULL, message_chain TEXT NOT NULL, directory TEXT NOT NULL, path TEXT NOT NULL, before_content TEXT, before_known INTEGER NOT NULL, after_content TEXT, after_known INTEGER NOT NULL DEFAULT 0, settled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, UNIQUE(session_id, tool_id));
      CREATE INDEX IF NOT EXISTS harness_file_checkpoints_owner ON harness_file_checkpoints(session_id, created_at, sequence);
      CREATE TABLE IF NOT EXISTS harness_file_rewinds (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, message_id TEXT NOT NULL, directory TEXT NOT NULL, payload TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL);
    `)
    const checkpointColumns = this.database.prepare('PRAGMA table_info(harness_file_checkpoints)').all() as Array<{ name: string }>
    if (!checkpointColumns.some(column => column.name === 'rewind_id')) this.database.exec('ALTER TABLE harness_file_checkpoints ADD COLUMN rewind_id TEXT')
  }

  private sessionPath(session: HarnessSession) { return this.paths.session(session.id) }

  private ensureInside(root: string, candidate: string) {
    const rootPath = resolve(root)
    const target = resolve(candidate)
    if (target !== rootPath && !target.startsWith(`${rootPath}${sep}`)) throw new Error('路径不在项目目录内')
    return target
  }

  private workspaceFilePath(directory: string, filePath: string) {
    if (!filePath || isAbsolute(filePath)) throw new Error('引用文件路径无效')
    const candidate = this.ensureInside(directory, join(directory, filePath))
    if (!existsSync(candidate)) throw new Error(`引用文件不存在：${filePath}`)
    const root = realpathSync(directory)
    const resolved = realpathSync(candidate)
    if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) throw new Error('引用文件不能通过符号链接离开项目目录')
    if (!statSync(resolved).isFile()) throw new Error(`引用文件不存在：${filePath}`)
    return resolved
  }

  private externalFilePath(filePath: string) {
    if (!filePath || !isAbsolute(filePath)) throw new Error('引用文件路径无效')
    if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new Error(`引用文件不存在：${filePath}`)
    return realpathSync(filePath)
  }

  private attachmentFilePath(directory: string, filePath: string, allowExternal: boolean) {
    if (isAbsolute(filePath)) {
      if (!allowExternal) throw new Error('个人工作区只能引用工作目录内的相对路径文件')
      return this.externalFilePath(filePath)
    }
    return this.workspaceFilePath(directory, filePath)
  }

  private readAttachmentFile(target: string, path: string, name: string, textBytes = 0, imageBytes = 0) {
    const size = statSync(target).size
    if (size > HARNESS_ATTACHMENT_LIMITS.imageFileBytes) throw new Error(`引用文件过大：${name}；图片、PDF 或视频不得超过 20 MiB`)
    // 先读取有限签名，再决定文本/图片限额，避免为过大的文本分配整文件内存。
    const header = Buffer.alloc(Math.min(size, 32))
    const descriptor = openSync(target, 'r')
    try { readSync(descriptor, header, 0, header.length, 0) } finally { closeSync(descriptor) }
    const image = harnessAttachmentMediaType(header, name)
    if (!image && size > MAX_ATTACHMENT_FILE_BYTES) throw new Error(`引用文件过大：${name}；文本附件不得超过 256 KiB`)
    if (image ? imageBytes + size > HARNESS_ATTACHMENT_LIMITS.imageTotalBytes : textBytes + size > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error(image ? '图片、PDF 和视频附件总大小不得超过 40 MiB' : '引用文件总大小超过限制；文本附件总大小不得超过 1 MiB')
    return harnessAttachmentFromBytes(path, name, readFileSync(target))
  }

  private stagedAttachment(sessionId: string, path: string): HarnessMessageAttachment {
    const id = path.slice(HARNESS_ATTACHMENT_PREFIX.length)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('附件引用无效或不属于当前会话')
    const row = this.database.prepare('SELECT payload FROM harness_attachments WHERE session_id = ? AND id = ?').get(sessionId, id) as { payload: string } | undefined
    if (!row) throw new Error('附件引用无效或不属于当前会话')
    return JSON.parse(row.payload) as HarnessMessageAttachment
  }

  private resolveAttachments(directory: string, references: HarnessFileReference[], allowExternal: boolean, sessionId?: string) {
    if (references.length > MAX_FILE_REFERENCES) throw new Error(`一次最多引用 ${MAX_FILE_REFERENCES} 个文件`)
    const uniquePaths = new Set<string>()
    let textBytes = 0, imageBytes = 0
    return references.map(reference => {
      if (!reference || typeof reference.path !== 'string' || uniquePaths.has(reference.path)) throw new Error('引用文件重复或无效')
      uniquePaths.add(reference.path)
      let attachment: HarnessMessageAttachment
      if (reference.path.startsWith(HARNESS_ATTACHMENT_PREFIX)) {
        if (!sessionId) throw new Error('附件引用无效或不属于当前会话')
        attachment = this.stagedAttachment(sessionId, reference.path)
      } else {
        const target = this.attachmentFilePath(directory, reference.path, allowExternal)
        attachment = this.readAttachmentFile(target, reference.path, basename(target), textBytes, imageBytes)
      }
      if (attachment.mediaType) imageBytes += attachment.size!
      else textBytes += Buffer.byteLength(attachment.content, 'utf8')
      if (textBytes > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error('引用文件总大小超过限制；文本附件总大小不得超过 1 MiB')
      if (imageBytes > HARNESS_ATTACHMENT_LIMITS.imageTotalBytes) throw new Error('图片、PDF 和视频附件总大小不得超过 40 MiB')
      return attachment
    })
  }

  private isTextProjectFile(path: string) {
    try {
      const stat = lstatSync(path)
      return stat.size <= MAX_ATTACHMENT_FILE_BYTES && !readFileSync(path).includes(0)
    } catch {
      return false
    }
  }

  private freezeSessionMedia(session: HarnessSession): HarnessSession {
    const messages = session.messages.map(message => {
      if (!message.attachments?.some(file => file.mediaType && file.content)) return message
      const attachments = message.attachments.map(file => {
        if (!file.mediaType || !file.content) return file
        let frozen: HarnessMessageAttachment
        if (file.path.startsWith(HARNESS_ATTACHMENT_PREFIX)) {
          frozen = this.stagedAttachment(session.id, file.path)
          if (frozen.content !== file.content || frozen.mediaType !== file.mediaType) throw new Error('附件内容已冻结，不能覆盖已发送的媒体文件')
        } else {
          const bytes = decodeHarnessAttachmentImport({ name: file.name, mediaType: file.mediaType, data: file.content })
          frozen = harnessAttachmentFromBytes(`${HARNESS_ATTACHMENT_PREFIX}${randomUUID()}`, file.name, bytes, file.mediaType)
          this.database.prepare('INSERT INTO harness_attachments(session_id, id, payload) VALUES (?, ?, ?)').run(session.id, frozen.path.slice(HARNESS_ATTACHMENT_PREFIX.length), JSON.stringify(frozen))
        }
        // 媒体只在不可变附件表存一次；状态增量、会话JSON、消息表和renderer快照仅传元数据。
        return { path: frozen.path, name: frozen.name, mediaType: frozen.mediaType, size: frozen.size, content: '' }
      })
      return { ...message, attachments }
    })
    return messages.some((message, index) => message !== session.messages[index]) ? { ...session, messages } : session
  }

  hydrateMessageAttachments(sessionId: string, message: HarnessMessage): HarnessMessage {
    if (!message.attachments?.some(file => file.mediaType && !file.content)) return message
    return { ...message, attachments: message.attachments.map(file => file.mediaType && !file.content ? this.stagedAttachment(sessionId, file.path) : file) }
  }

  private saveSession(session: HarnessSession, preserveUpdatedAt = false, assistantUpdate?: { insert: boolean }, writeSnapshot = true) {
    // An old configuration/run snapshot cannot demote a task after admission.
    const stored = this.database.prepare('SELECT draft_state, parent_session_id FROM harness_sessions WHERE id = ?').get(session.id) as { draft_state: HarnessSession['draftState'] | null; parent_session_id: string | null } | undefined
    if (stored?.draft_state) session = { ...session, draftState: stored.draft_state }
    if (stored?.parent_session_id) session = { ...session, parentSessionId: stored.parent_session_id }
    const path = this.sessionPath(session)
    mkdirSync(dirname(path), { recursive: true })
    if (!preserveUpdatedAt) session.updatedAt = now()
    const persist = this.database.transaction(() => {
      const beforeFreeze = session
      session = this.freezeSessionMedia(session)
      this.database.prepare(`INSERT INTO harness_sessions(id, project_id, title, model_provider_id, model_id, permission_mode, status, pinned, unread, archived_at, draft_state, path, working_directory, created_at, updated_at, parent_session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, title = excluded.title, model_provider_id = excluded.model_provider_id,
      model_id = excluded.model_id, permission_mode = excluded.permission_mode, status = excluded.status, pinned = excluded.pinned, unread = excluded.unread, archived_at = excluded.archived_at, path = excluded.path,
      draft_state = excluded.draft_state, working_directory = excluded.working_directory, updated_at = excluded.updated_at, parent_session_id = excluded.parent_session_id`)
      .run(session.id, session.projectId || null, session.title, session.modelProviderId || null, session.modelId || null, session.permissionMode,
        session.status, Number(session.pinned), Number(session.unread), session.archivedAt || null, session.draftState || null, path, session.workingDirectory || null, session.createdAt, session.updatedAt, session.parentSessionId || null)
      // Streaming changes only the current assistant row. Keep the full recovery
      // snapshot, but do not delete/reinsert immutable history on every flush.
      const message = session.messages.at(-1)!
      let savedAssistant = false
      if (assistantUpdate && session === beforeFreeze) {
        if (assistantUpdate.insert) {
          this.database.prepare('INSERT INTO harness_messages(session_id, message_id, role, content, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(session.id, message.id, message.role, message.content, JSON.stringify(message), message.createdAt)
          savedAssistant = true
        } else {
          savedAssistant = this.database.prepare('UPDATE harness_messages SET content = ?, payload = ? WHERE session_id = ? AND message_id = ? AND role = ?').run(message.content, JSON.stringify(message), session.id, message.id, 'assistant').changes === 1
        }
      }
      if (savedAssistant) this.database.prepare('INSERT INTO harness_session_state(session_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at').run(session.id, JSON.stringify(session), session.updatedAt)
      else this.persistStructuredSession(session)
      if (session.projectId && session.draftState !== 'prepared' && !session.parentSessionId) this.database.prepare('UPDATE harness_projects SET updated_at = ?, last_session_at = ? WHERE id = ?').run(session.updatedAt, session.updatedAt, session.projectId)
    })
    persist()
    if (writeSnapshot) this.writeSessionSnapshot(session, path)
    return clone(session)
  }

  private writeSessionSnapshot(session: HarnessSession, path = this.sessionPath(session)) {
    const temporaryPath = `${path}.${process.pid}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(session, null, 2), 'utf8')
    renameSync(temporaryPath, path)
  }

  private persistStructuredSession(session: HarnessSession) {
    this.database.prepare('INSERT INTO harness_session_state(session_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at').run(session.id, JSON.stringify(session), session.updatedAt)
    this.database.prepare('DELETE FROM harness_messages WHERE session_id = ?').run(session.id)
    const insertMessage = this.database.prepare('INSERT INTO harness_messages(session_id, message_id, role, content, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    session.messages.forEach(message => insertMessage.run(session.id, message.id, message.role, message.content, JSON.stringify(message), message.createdAt))
    this.database.prepare('DELETE FROM harness_tool_calls WHERE session_id = ?').run(session.id)
    const insertTool = this.database.prepare('INSERT INTO harness_tool_calls(session_id, tool_id, payload, created_at) VALUES (?, ?, ?, ?)')
    session.toolCalls.forEach(tool => insertTool.run(session.id, tool.id, JSON.stringify(tool), tool.createdAt))
    this.database.prepare('DELETE FROM harness_plans WHERE session_id = ?').run(session.id)
    if (session.activePlan) this.database.prepare('INSERT INTO harness_plans(session_id, plan_id, payload, updated_at) VALUES (?, ?, ?, ?)').run(session.id, session.activePlan.id, JSON.stringify(session.activePlan), session.activePlan.updatedAt)
    this.database.prepare('DELETE FROM harness_interactions WHERE session_id = ?').run(session.id)
    const insertInteraction = this.database.prepare('INSERT INTO harness_interactions(session_id, interaction_id, payload, created_at) VALUES (?, ?, ?, ?)')
    ;(session.interactions || []).forEach(interaction => insertInteraction.run(session.id, interaction.id, JSON.stringify(interaction), interaction.createdAt))
    this.database.prepare('DELETE FROM harness_runs WHERE session_id = ?').run(session.id)
    this.database.prepare('DELETE FROM harness_run_activities WHERE session_id = ?').run(session.id)
    this.database.prepare('DELETE FROM harness_subtasks WHERE session_id = ?').run(session.id)
    if (session.activeRun) {
      this.database.prepare('INSERT INTO harness_runs(session_id, run_id, payload, started_at) VALUES (?, ?, ?, ?)').run(session.id, session.activeRun.id, JSON.stringify(session.activeRun), session.activeRun.startedAt)
      const insertActivity = this.database.prepare('INSERT INTO harness_run_activities(session_id, run_id, activity_id, payload, started_at) VALUES (?, ?, ?, ?, ?)')
      const insertSubtask = this.database.prepare('INSERT INTO harness_subtasks(session_id, run_id, subtask_id, payload, created_at) VALUES (?, ?, ?, ?, ?)')
      session.activeRun.activities.forEach(activity => insertActivity.run(session.id, session.activeRun!.id, activity.id, JSON.stringify(activity), activity.startedAt))
      session.activeRun.subtasks.forEach(task => insertSubtask.run(session.id, session.activeRun!.id, task.id, JSON.stringify(task), task.createdAt))
    }
  }

  migrateStructuredSessions() {
    const rows = this.database.prepare('SELECT id, path FROM harness_sessions').all() as Array<{ id: string, path: string }>
    const migrate = this.database.transaction(() => {
      for (const row of rows) {
        const raw = readFileSync(row.path, 'utf8')
        const session = this.parseSession(raw)
        const backupPath = `${row.path}.legacy.bak`
        if (!existsSync(backupPath)) copyFileSync(row.path, backupPath)
        this.persistStructuredSession(session)
      }
    })
    migrate()
  }

  private parseSession(raw: string | Partial<HarnessSession>): HarnessSession {
    const value = typeof raw === 'string' ? JSON.parse(raw) as Partial<HarnessSession> : raw
    if (value.version !== 1 || !value.id || !Array.isArray(value.messages) || !Array.isArray(value.toolCalls)) throw new Error('会话文件格式无效')
    const session = {
      ...value,
      titleSource: value.titleSource === 'auto' ? 'auto' : 'manual',
      titleRevision: typeof value.titleRevision === 'number' && Number.isSafeInteger(value.titleRevision) && value.titleRevision >= 0 ? value.titleRevision : 0,
      pinned: Boolean(value.pinned),
      unread: Boolean(value.unread),
      delegationEnabled: value.delegationEnabled !== false,
      archivedAt: typeof value.archivedAt === 'number' ? value.archivedAt : undefined,
    } as HarnessSession
    const legacy = value.activePlan as (HarnessPlan & { questions?: unknown[] }) | undefined
    if (legacy?.status === 'ready') session.activePlan = { ...legacy, status: 'awaiting_confirmation' }
    if (session.activePlan) {
      const { questions: _questions, ...plan } = session.activePlan as HarnessPlan & { questions?: unknown[] }
      session.activePlan = plan
      if (!session.pendingInteraction && Array.isArray(legacy?.questions) && legacy.questions.length) {
        session.pendingInteraction = { id: randomUUID(), kind: 'question', status: 'waiting', questions: legacy.questions.filter((item): item is { question: string, context?: string } => Boolean(item && typeof item === 'object' && typeof (item as { question?: unknown }).question === 'string')).map((item, index) => ({ id: `legacy-${index + 1}`, question: item.question, context: item.context })), createdAt: now() }
      }
    }
    if (!session.projectId && !session.workingDirectory) session.workingDirectory = this.paths.workspace
    return session
  }

  private planStatus(session: HarnessSession): HarnessPlanSessionStatus | undefined {
    if (session.pendingInteraction?.status === 'waiting') return session.pendingInteraction.kind === 'question' ? 'needs_input' : 'awaiting_confirmation'
    switch (session.activePlan?.status) {
      case 'executing': return 'executing'
      case 'completed': return 'completed'
      // 已取消的计划无需在侧边栏保留状态，视为终止即可。
      case 'cancelled': return undefined
      default: return undefined
    }
  }

  private sessionOrderWhere(scope: HarnessSessionOrderScope) {
    if (!scope || typeof scope !== 'object' || !['pinned', 'recent', 'project'].includes(scope.type)) throw new Error('会话排序范围无效')
    if (scope.type === 'pinned') return { where: "pinned = 1 AND archived_at IS NULL AND COALESCE(draft_state, '') <> 'prepared' AND parent_session_id IS NULL", parameters: [] as string[] }
    if (scope.type === 'recent') return { where: "pinned = 0 AND project_id IS NULL AND archived_at IS NULL AND COALESCE(draft_state, '') <> 'prepared' AND parent_session_id IS NULL", parameters: [] as string[] }
    if (!scope.projectId) throw new Error('项目排序范围无效')
    this.getProject(scope.projectId)
    return { where: "pinned = 0 AND project_id = ? AND archived_at IS NULL AND COALESCE(draft_state, '') <> 'prepared' AND parent_session_id IS NULL", parameters: [scope.projectId] }
  }

  private promoteSessionOrder(id: string) {
    const row = this.database.prepare('SELECT project_id, pinned, archived_at, draft_state, parent_session_id FROM harness_sessions WHERE id = ?').get(id) as Pick<SessionRow, 'project_id' | 'pinned' | 'archived_at' | 'draft_state'> & { parent_session_id: string | null } | undefined
    if (!row || row.archived_at || row.draft_state === 'prepared' || row.parent_session_id) return
    const scope: HarnessSessionOrderScope = row.pinned ? { type: 'pinned' } : row.project_id ? { type: 'project', projectId: row.project_id } : { type: 'recent' }
    const { where, parameters } = this.sessionOrderWhere(scope)
    const maximum = (this.database.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS value FROM harness_sessions WHERE ${where}`).get(...parameters) as { value: number }).value
    this.database.prepare('UPDATE harness_sessions SET sort_order = ? WHERE id = ?').run(maximum + 1, id)
  }

  listProjects(): HarnessProject[] {
    const counts = this.database.prepare("SELECT project_id, COUNT(*) AS count FROM harness_sessions WHERE project_id IS NOT NULL AND COALESCE(draft_state, '') <> 'prepared' AND parent_session_id IS NULL GROUP BY project_id").all() as Array<{ project_id: string, count: number }>
    const countMap = new Map(counts.map(row => [row.project_id, row.count]))
    return (this.database.prepare('SELECT * FROM harness_projects ORDER BY sort_order DESC, created_at DESC').all() as ProjectRow[]).map(row => {
      const directoryExists = existsSync(row.directory)
      return {
        id: row.id, name: row.name, icon: projectIcon(row.icon), directory: row.directory, directoryExists, createdAt: row.created_at, updatedAt: row.updated_at,
        ...(directoryExists ? gitMetadata(row.directory) : {}), lastSessionAt: row.last_session_at || undefined,
        defaultModelProviderId: row.default_model_provider_id || undefined, sessionCount: countMap.get(row.id) || 0,
      }
    })
  }

  reorderProjects(ids: string[]) {
    const orderedIds = [...new Set((Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string' && id))]
    const existingIds = (this.database.prepare('SELECT id FROM harness_projects').all() as Array<{ id: string }>).map(row => row.id)
    if (orderedIds.length !== existingIds.length || existingIds.some(id => !orderedIds.includes(id))) throw new Error('项目排序列表无效')
    const update = this.database.prepare('UPDATE harness_projects SET sort_order = ? WHERE id = ?')
    this.database.transaction(() => orderedIds.forEach((id, index) => update.run(orderedIds.length - index, id)))()
    return this.listProjects()
  }

  getProjectDirectory(id: string): string {
    const row = this.database.prepare('SELECT directory FROM harness_projects WHERE id = ?').get(id) as { directory: string } | undefined
    if (!row) throw new Error('未找到项目')
    return row.directory
  }

  getProject(id: string): HarnessProject {
    const row = this.database.prepare('SELECT * FROM harness_projects WHERE id = ?').get(id) as ProjectRow | undefined
    if (!row) throw new Error('未找到项目')
    const sessionCount = (this.database.prepare("SELECT COUNT(*) AS count FROM harness_sessions WHERE project_id = ? AND COALESCE(draft_state, '') <> 'prepared' AND parent_session_id IS NULL").get(id) as { count: number }).count
    const directoryExists = existsSync(row.directory)
    return { id: row.id, name: row.name, icon: projectIcon(row.icon), directory: row.directory, directoryExists, ...(directoryExists ? gitMetadata(row.directory) : {}), createdAt: row.created_at, updatedAt: row.updated_at, lastSessionAt: row.last_session_at || undefined, defaultModelProviderId: row.default_model_provider_id || undefined, sessionCount }
  }

  listGitBranches(projectId: string): HarnessGitBranch[] {
    const project = this.getProject(projectId)
    if (!project.isGitRepository) throw new Error('项目不是 Git 仓库')
    const current = gitBranch(project.directory)
    const names = runGit(project.directory, ['for-each-ref', '--format=%(refname:short)', '--sort=refname', 'refs/heads']).trim().split('\n').filter(Boolean)
    const status = runGit(project.directory, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    let uncommittedFileCount = 0
    const records = status.split('\0')
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index]
      if (!record || record[2] !== ' ') continue
      uncommittedFileCount += 1
      if (record.slice(0, 2).includes('R') || record.slice(0, 2).includes('C')) index += 1
    }
    return names.map(name => ({ name, current: name === current, ...(name === current && uncommittedFileCount ? { uncommittedFileCount } : {}) }))
  }

  private validateGitBranchName(project: HarnessProject, value: string) {
    const name = value.trim()
    if (!name) throw new Error('分支名称不能为空')
    if (name.endsWith('/')) throw new Error('分支名不能以“/”结尾')
    try { runGit(project.directory, ['check-ref-format', '--branch', name]) } catch { throw new Error('分支名称无效') }
    if (this.listGitBranches(project.id).some(branch => branch.name === name)) throw new Error('分支已存在')
    return name
  }

  checkoutGitBranch(projectId: string, branchName: string) {
    const project = this.getProject(projectId)
    if (!project.isGitRepository) throw new Error('项目不是 Git 仓库')
    if (!this.listGitBranches(projectId).some(branch => branch.name === branchName)) throw new Error('未找到本地分支')
    runGit(project.directory, ['switch', branchName])
    return this.listGitBranches(projectId)
  }

  createAndCheckoutGitBranch(projectId: string, branchName: string) {
    const project = this.getProject(projectId)
    if (!project.isGitRepository) throw new Error('项目不是 Git 仓库')
    const name = this.validateGitBranchName(project, branchName)
    runGit(project.directory, ['switch', '-c', name])
    return this.listGitBranches(projectId)
  }

  createProject(directory: string, name?: string, icon?: string) {
    const selectedIcon = validateProjectIcon(icon)
    const canonical = resolve(directory)
    if (!existsSync(canonical)) throw new Error('项目目录不存在')
    const existing = this.database.prepare('SELECT id FROM harness_projects WHERE directory = ?').get(canonical) as { id: string } | undefined
    if (existing) return this.getProject(existing.id)
    const id = randomUUID(); const createdAt = now()
    const displayName = name?.trim() || canonical.split(sep).filter(Boolean).pop() || '未命名项目'
    const sortOrder = (this.database.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM harness_projects').get() as { value: number }).value + 1
    this.database.prepare('INSERT INTO harness_projects(id, name, icon, directory, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, displayName, selectedIcon, canonical, sortOrder, createdAt, createdAt)
    return this.getProject(id)
  }

  renameProject(id: string, name: string, icon?: string) {
    if (!name.trim()) throw new Error('项目名称不能为空')
    if (icon === undefined) this.database.prepare('UPDATE harness_projects SET name = ?, updated_at = ? WHERE id = ?').run(name.trim(), now(), id)
    else this.database.prepare('UPDATE harness_projects SET name = ?, icon = ?, updated_at = ? WHERE id = ?').run(name.trim(), validateProjectIcon(icon), now(), id)
    return this.getProject(id)
  }

  deleteProject(id: string) {
    const project = this.getProject(id)
    this.deleteSessions((this.database.prepare('SELECT id FROM harness_sessions WHERE project_id = ?').all(id) as Array<{ id: string }>).map(row => row.id))
    rmSync(this.paths.projectTrash(project.id), { recursive: true, force: true })
    this.database.prepare('DELETE FROM harness_sessions WHERE project_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_projects WHERE id = ?').run(id)
  }

  createSession(projectId?: string, permissionMode: PermissionMode = this.getPermissionConfig().globalDefaultMode, prepared = false) {
    const project = projectId ? this.getProject(projectId) : undefined
    const time = now()
    const session: HarnessSession = {
      version: 1, id: createSessionId(), ...(prepared ? { draftState: 'prepared' as const } : {}), title: '新对话', titleSource: 'auto', titleRevision: 0, projectId: project?.id, workingDirectory: project?.directory || this.paths.workspace,
      permissionMode, messages: [], toolCalls: [], createdAt: time, updatedAt: time, status: 'active', pinned: false, unread: false, delegationEnabled: true,
    }
    const saved = this.saveSession(session)
    this.promoteSessionOrder(saved.id)
    return saved
  }

  forkConversation(sourceId: string, messageId: string, requestId: string): HarnessSession {
    const id = `fork-${requestId}`
    const existing = this.database.prepare('SELECT id FROM harness_sessions WHERE id = ?').get(id)
    if (existing) {
      const previous = this.getSession(id)
      if (previous.forkSource?.sessionId !== sourceId || previous.forkSource.messageId !== messageId || previous.archivedAt) throw new Error('分支请求已失效，请重新打开任务')
      return previous
    }
    const source = this.getSession(sourceId)
    if (source.archivedAt || source.parentSessionId || source.draftState === 'prepared' || source.activeRun || source.pendingInteraction?.status === 'waiting') throw new Error('请先结束当前任务的运行或确认，再创建分支')
    const index = source.messages.findIndex(message => message.id === messageId)
    const target = source.messages[index]
    if (!target || target.role !== 'assistant' || target.internal || target.interrupted || !target.content.trim() || target.id.startsWith('stream-') || target.run?.status === 'failed' || target.run?.status === 'stopped' || target.parts?.some(part => part.type !== 'tool' && part.state !== 'complete')) throw new Error('只能从已完成的助手回复创建分支')
    const messages = source.messages.slice(0, index + 1).map(message => {
      const copy = this.hydrateMessageAttachments(source.id, message)
      // Composite SQLite keys scope historical identities to this new task.
      return { ...copy, inherited: true, submissionId: undefined, attachments: copy.attachments?.map(file => file.mediaType ? { ...file, path: `fork-image-${randomUUID()}` } : file) }
    })
    const runIds = new Set(messages.flatMap(message => message.runId ? [message.runId] : []))
    const toolIds = new Set(messages.flatMap(message => (message.parts || []).flatMap(part => part.type === 'tool' ? [part.toolCallId] : [])))
    const toolCalls = source.toolCalls.filter(tool => toolIds.has(tool.id) || Boolean(tool.runId && runIds.has(tool.runId))).map(tool => ({ ...tool, inherited: true }))
    if (toolCalls.some(tool => tool.status === 'running' || tool.status === 'waiting-confirm')) throw new Error('请等待工具执行结束后创建分支')
    const compactedIndex = source.context?.compactedThroughMessageId ? source.messages.findIndex(message => message.id === source.context!.compactedThroughMessageId) : -1
    const context = compactedIndex >= 0 && compactedIndex <= index ? { summary: source.context?.summary, compactedThroughMessageId: source.context?.compactedThroughMessageId, compactedAt: source.context?.compactedAt } : undefined
    const time = now()
    const fork = this.saveSession({
      version: 1, id, forkSource: { sessionId: source.id, messageId, title: source.title }, draftState: 'accepted',
      title: `${source.title} · 分支`.slice(0, 120), titleSource: 'manual', titleRevision: 0,
      projectId: source.projectId, workingDirectory: source.workingDirectory,
      modelProviderId: source.modelProviderId, modelId: source.modelId, modelThinkingLevel: source.modelThinkingLevel,
      permissionMode: source.permissionMode, activeSkillIds: source.activeSkillIds, activeMcpServerIds: source.activeMcpServerIds,
      pluginCatalog: source.pluginCatalog, delegationEnabled: source.delegationEnabled,
      messages, toolCalls, context,
      createdAt: time, updatedAt: time, status: 'completed', pinned: false, unread: false,
    })
    this.promoteSessionOrder(fork.id)
    return fork
  }

  getSideConversationForInput(parentId: string, input: HarnessSideConversationInput): HarnessSession | undefined {
    const parent = this.getSession(parentId)
    if (parent.archivedAt || parent.parentSessionId || parent.draftState === 'prepared') throw new Error('请先打开一个可用的主任务')
    const id = this.sideInputId(parentId, input.submissionId)
    const row = this.database.prepare('SELECT value FROM harness_settings WHERE key = ?').get(`side-input:${id}`) as { value: string } | undefined
    if (!row) return undefined
    const reservation = JSON.parse(row.value) as { parentId: string; fingerprint: string }
    if (reservation.parentId !== parentId || reservation.fingerprint !== this.sideInputFingerprint(input)) throw new Error('旁路问题内容已变化，请重新发送')
    if (!this.database.prepare('SELECT 1 FROM harness_sessions WHERE id = ?').get(id)) throw new Error('侧边栏对话已不存在，请重新发送')
    const child = this.getSession(id)
    if (child.parentSessionId !== parentId || child.archivedAt) throw new Error('侧边栏对话不可用，请重新发送')
    return child
  }

  private sideInputId(parentId: string, submissionId: string) {
    const bytes = createHash('sha256').update(JSON.stringify(['mira-side-input', parentId, submissionId])).digest().subarray(0, 16)
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  private sideInputFingerprint(input: HarnessSideConversationInput) {
    return createHash('sha256').update(JSON.stringify([input.text.trim(), input.selection.providerId, input.selection.modelId, input.selection.thinkingLevel ?? null, input.permissionMode ?? null])).digest('hex')
  }

  /** Fork only settled history; inherited messages are model context, never child bubbles. */
  createSideConversation(parentId: string, input?: HarnessSideConversationInput): HarnessSession {
    if (input) {
      const previous = this.getSideConversationForInput(parentId, input)
      if (previous) return previous
    }
    const parent = this.getSession(parentId)
    if (parent.archivedAt || parent.parentSessionId || parent.draftState === 'prepared') throw new Error('请先打开一个可用的主任务')
    let boundary = parent.messages.length
    if (parent.activeRun) {
      const start = parent.messages.findIndex(message => message.runId === parent.activeRun!.id || message.createdAt >= parent.activeRun!.startedAt)
      if (start >= 0) {
        boundary = start
        while (boundary > 0 && parent.messages[boundary - 1].role !== 'assistant') boundary--
      }
    }
    const compacted = parent.context?.compactedThroughMessageId ? parent.messages.findIndex(message => message.id === parent.context!.compactedThroughMessageId) + 1 : 0
    const inherited = parent.messages.slice(compacted, boundary).filter(message => !message.id.startsWith('stream-'))
    const id = input ? this.sideInputId(parentId, input.submissionId) : createSessionId(), time = now()
    const messages = inherited.map(message => {
      const hydrated = this.hydrateMessageAttachments(parent.id, message)
      // Runtime history uses message content and attachments; run/part/tool identities stay in the parent.
      return { id: randomUUID(), role: message.role, content: message.content, createdAt: message.createdAt, internal: true,
        ...(message.command ? { command: message.command } : {}),
        ...(hydrated.attachments?.length ? { attachments: hydrated.attachments.map(file => ({ ...file, path: file.mediaType ? `inherited-${randomUUID()}` : file.path })) } : {}) }
    })
    if (parent.context?.summary) messages.unshift({ id: randomUUID(), role: 'user', content: parent.context.summary, createdAt: parent.createdAt, internal: true })
    return this.database.transaction(() => {
      const child = this.saveSession({
        version: 1, id, parentSessionId: parent.id, draftState: 'accepted', title: '侧边栏对话', titleSource: 'manual', titleRevision: 0,
        projectId: parent.projectId, workingDirectory: parent.workingDirectory, modelProviderId: parent.modelProviderId, modelId: parent.modelId,
        modelThinkingLevel: parent.modelThinkingLevel,
        permissionMode: parent.permissionMode, activeSkillIds: parent.activeSkillIds, activeMcpServerIds: parent.activeMcpServerIds,
        delegationEnabled: parent.delegationEnabled, messages, toolCalls: [], createdAt: time, updatedAt: time, status: 'active', pinned: false, unread: false,
      })
      // Reservation survives deletion and failed admission; retries never refork newer parent history.
      if (input) this.database.prepare('INSERT INTO harness_settings(key, value) VALUES (?, ?)').run(`side-input:${id}`, JSON.stringify({ parentId, fingerprint: this.sideInputFingerprint(input) }))
      return child
    })()
  }

  /** Lifecycle and optional first-message persistence share one admission transaction. */
  acceptPreparedSession(id: string, persist?: () => void) {
    this.database.transaction(() => {
      const session = this.getSession(id)
      if (session.archivedAt) throw new Error('目标会话不可用')
      if (session.draftState === 'prepared') {
        session.draftState = 'accepted'
        session.updatedAt = now()
        this.database.prepare("UPDATE harness_sessions SET draft_state = 'accepted', updated_at = ? WHERE id = ?").run(session.updatedAt, id)
        this.persistStructuredSession(session)
        this.promoteSessionOrder(id)
        if (session.projectId) this.database.prepare('UPDATE harness_projects SET updated_at = ?, last_session_at = ? WHERE id = ?').run(session.updatedAt, session.updatedAt, session.projectId)
      }
      persist?.()
    })()
  }

  listSessions(query = ''): HarnessSessionSummary[] {
    const text = `%${query.trim()}%`
    const rows = this.database.prepare(`SELECT s.*, p.name AS project_name FROM harness_sessions s LEFT JOIN harness_projects p ON p.id = s.project_id
      WHERE s.archived_at IS NULL AND COALESCE(s.draft_state, '') <> 'prepared' AND s.parent_session_id IS NULL AND s.title LIKE ? ORDER BY s.pinned DESC, s.sort_order DESC, s.updated_at DESC`).all(text) as Array<SessionRow & { project_name: string | null }>
    return rows.map(row => {
      const session = this.getSession(row.id)
      return { id: row.id, title: row.title, projectId: row.project_id || undefined, projectName: row.project_name || undefined,
      modelProviderId: row.model_provider_id || undefined, modelId: row.model_id || undefined, permissionMode: row.permission_mode,
      status: row.status, pinned: Boolean(row.pinned), unread: Boolean(row.unread), workingDirectory: row.working_directory || this.paths.workspace, createdAt: row.created_at, updatedAt: row.updated_at,
      planStatus: this.planStatus(session), changeSummary: this.getTaskChangeSummary(row.id, false, session) }
    })
  }

  reorderSessions(scope: HarnessSessionOrderScope, ids: string[]) {
    const { where, parameters } = this.sessionOrderWhere(scope)
    const orderedIds = [...new Set((Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string' && id))]
    const existingIds = (this.database.prepare(`SELECT id FROM harness_sessions WHERE ${where}`).all(...parameters) as Array<{ id: string }>).map(row => row.id)
    if (orderedIds.length !== existingIds.length || existingIds.some(id => !orderedIds.includes(id))) throw new Error('会话排序列表无效')
    const update = this.database.prepare('UPDATE harness_sessions SET sort_order = ? WHERE id = ?')
    this.database.transaction(() => orderedIds.forEach((id, index) => update.run(orderedIds.length - index, id)))()
    return this.listSessions()
  }

  async searchConversations(query: string): Promise<HarnessConversationSearchResult[]> {
    const needle = query.trim().toLowerCase()
    if (!needle || needle.length > 256 || /[\u0000-\u001f\u007f]/.test(needle)) throw new Error('搜索关键词无效')
    const rows = this.database.prepare(`WITH matches AS (
      SELECT m.session_id, m.message_id, m.content,
        ROW_NUMBER() OVER (PARTITION BY m.session_id ORDER BY m.created_at, m.rowid) AS position
      FROM harness_messages m JOIN harness_sessions s ON s.id = m.session_id
      WHERE s.archived_at IS NULL AND COALESCE(s.draft_state, '') <> 'prepared' AND s.parent_session_id IS NULL AND m.role IN ('user', 'assistant')
        AND COALESCE(json_extract(m.payload, '$.internal'), 0) = 0 AND instr(mira_search_fold(m.content), @query) > 0
    ) SELECT s.id, s.title, s.updated_at, p.name AS project_name, m.message_id, m.content
      FROM harness_sessions s LEFT JOIN harness_projects p ON p.id = s.project_id
      LEFT JOIN matches m ON m.session_id = s.id AND m.position = 1
      WHERE s.archived_at IS NULL AND COALESCE(s.draft_state, '') <> 'prepared' AND s.parent_session_id IS NULL AND (m.message_id IS NOT NULL OR instr(mira_search_fold(s.title), @query) > 0 OR instr(mira_search_fold(p.name), @query) > 0)
      ORDER BY s.updated_at DESC LIMIT 50`).all({ query: needle }) as Array<Pick<SessionRow, 'id' | 'title' | 'updated_at'> & { project_name: string | null; message_id: string | null; content: string | null }>
    return rows.map(row => {
      const text = row.content ?? `${row.title} ${row.project_name || ''}`
      const index = text.toLowerCase().indexOf(needle)
      const start = Math.max(0, index - 60)
      return { id: row.id, title: row.title, ...(row.project_name ? { projectName: row.project_name } : {}), ...(row.message_id ? { messageId: row.message_id } : {}), snippet: `${start ? '…' : ''}${text.slice(start, start + 180)}${text.length > start + 180 ? '…' : ''}`, updatedAt: row.updated_at }
    })
  }

  queryHistory(query: HarnessHistoryQuery = {}, providerKeys = new Map<string, string>()): HarnessHistoryPage {
    const archiveView: HarnessHistoryArchiveView = query.archiveView === 'archived' ? 'archived' : 'visible'
    const range: HarnessHistoryRange = ['today', 'week', 'month'].includes(query.range || '') ? query.range as HarnessHistoryRange : 'all'
    const sort: HarnessHistorySort = ['created-desc', 'title-asc'].includes(query.sort || '') ? query.sort as HarnessHistorySort : 'updated-desc'
    const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize || 20)))
    const page = Math.max(1, Math.floor(query.page || 1))
    const where = [archiveView === 'archived' ? 's.archived_at IS NOT NULL' : 's.archived_at IS NULL', "COALESCE(s.draft_state, '') <> 'prepared' AND s.parent_session_id IS NULL"]
    const parameters: Array<string | number> = []
    const search = query.q?.trim()
    if (search) {
      const text = `%${search}%`
      where.push('(s.title LIKE ? OR COALESCE(p.name, \'\') LIKE ? OR COALESCE(s.model_id, \'\') LIKE ?)')
      parameters.push(text, text, text)
    }
    const projectIds = [...new Set((query.projectIds || []).filter(value => typeof value === 'string' && value))]
    if (projectIds.length) {
      const includesTemporary = projectIds.includes(TEMPORARY_PROJECT_ID)
      const ids = projectIds.filter(id => id !== TEMPORARY_PROJECT_ID)
      const parts: string[] = []
      if (ids.length) { parts.push(`s.project_id IN (${ids.map(() => '?').join(', ')})`); parameters.push(...ids) }
      if (includesTemporary) parts.push('s.project_id IS NULL')
      where.push(`(${parts.join(' OR ')})`)
    }
    const modelIds = [...new Set((query.modelIds || []).filter(value => typeof value === 'string' && value))]
    if (modelIds.length) { where.push(`s.model_id IN (${modelIds.map(() => '?').join(', ')})`); parameters.push(...modelIds) }
    const statuses = [...new Set((query.statuses || []).filter((value): value is HarnessSession['status'] => ['active', 'completed', 'failed'].includes(value)))]
    if (statuses.length) { where.push(`s.status IN (${statuses.map(() => '?').join(', ')})`); parameters.push(...statuses) }
    const rangeStart = startOfRange(range)
    if (rangeStart) { where.push('s.updated_at >= ?'); parameters.push(rangeStart) }
    const order = sort === 'created-desc' ? 's.created_at DESC' : sort === 'title-asc' ? 's.title COLLATE NOCASE ASC' : 's.updated_at DESC'
    const rows = this.database.prepare(`SELECT s.*, p.name AS project_name, p.icon AS project_icon FROM harness_sessions s LEFT JOIN harness_projects p ON p.id = s.project_id WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...parameters) as Array<SessionRow & { project_name: string | null, project_icon: string | null }>
    const total = rows.length
    const today = startOfRange('today')!
    const yesterday = today - 24 * 60 * 60 * 1000
    const todayNew = rows.filter(row => row.created_at >= today).length
    const yesterdayNew = rows.filter(row => row.created_at >= yesterday && row.created_at < today).length
    const activeRows = rows.filter(row => row.status === 'active')
    const modelCounts = new Map<string, { count: number, providerKey?: string }>()
    rows.forEach(row => {
      const id = row.model_id || '默认模型'
      const current = modelCounts.get(id) || { count: 0, providerKey: row.model_provider_id ? providerKeys.get(row.model_provider_id) : undefined }
      current.count += 1
      modelCounts.set(id, current)
    })
    const top = [...modelCounts.entries()].sort((left, right) => right[1].count - left[1].count)[0]
    const resolvedPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)))
    const offset = (resolvedPage - 1) * pageSize
    const pageRows = rows.slice(offset, offset + pageSize).map(row => {
      let preview: string | undefined
      try { preview = previewFor(this.getSession(row.id)) } catch { /* unavailable session files remain listable */ }
      const result: HarnessHistoryRow = {
        id: row.id, title: row.title, projectId: row.project_id || undefined, projectName: row.project_name || undefined, projectIcon: row.project_icon ? projectIcon(row.project_icon) : undefined,
        modelProviderId: row.model_provider_id || undefined, modelId: row.model_id || undefined, providerKey: row.model_provider_id ? providerKeys.get(row.model_provider_id) as HarnessHistoryRow['providerKey'] : undefined,
        permissionMode: row.permission_mode, status: row.status, pinned: Boolean(row.pinned), archivedAt: row.archived_at || undefined,
        workingDirectory: row.working_directory || this.paths.workspace, createdAt: row.created_at, updatedAt: row.updated_at, preview,
      }
      return result
    })
    const facetRows = this.database.prepare(`SELECT DISTINCT s.project_id, p.name AS project_name, p.icon AS project_icon, s.model_id, s.model_provider_id FROM harness_sessions s LEFT JOIN harness_projects p ON p.id = s.project_id WHERE ${archiveView === 'archived' ? 's.archived_at IS NOT NULL' : 's.archived_at IS NULL'} AND COALESCE(s.draft_state, '') <> 'prepared' AND s.parent_session_id IS NULL`).all() as Array<{ project_id: string | null, project_name: string | null, project_icon: string | null, model_id: string | null, model_provider_id: string | null }>
    const projects = facetRows.flatMap(row => row.project_id && row.project_name ? [{ id: row.project_id, name: row.project_name, icon: projectIcon(row.project_icon || undefined) }] : []).filter((item, index, source) => source.findIndex(candidate => candidate.id === item.id) === index)
    const models = facetRows.flatMap(row => row.model_id ? [{ id: row.model_id, providerKey: row.model_provider_id ? providerKeys.get(row.model_provider_id) as HarnessHistoryRow['providerKey'] : undefined }] : []).filter((item, index, source) => source.findIndex(candidate => candidate.id === item.id) === index)
    return {
      rows: pageRows, total, page: resolvedPage, pageSize,
      stats: { total, todayNew, todayNewDelta: todayNew - yesterdayNew, activeCount: activeRows.length, activeStaleCount: activeRows.filter(row => row.updated_at < now() - 60 * 60 * 1000).length, ...(top ? { topModel: { id: top[0], providerKey: top[1].providerKey as HarnessHistoryRow['providerKey'], count: top[1].count, ratio: total ? top[1].count / total : 0 } } : {}) },
      facets: { projects, models },
    }
  }

  usageStats(providerNames = new Map<string, string>()): HarnessUsageStats {
    type UsageRow = Pick<SessionRow, 'id' | 'project_id' | 'model_provider_id' | 'model_id' | 'title'> & { project_name: string | null }
    const rows = this.database.prepare(`SELECT s.id, s.project_id, s.model_provider_id, s.model_id, s.title, p.name AS project_name
      FROM harness_sessions s LEFT JOIN harness_projects p ON p.id = s.project_id WHERE COALESCE(s.draft_state, '') <> 'prepared' ORDER BY s.updated_at DESC`).all() as UsageRow[]
    const empty = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costs: {} as Record<string, number>, pricedRuns: 0, unpricedRuns: 0 })
    const providers = new Map<string, HarnessUsageBucket>()
    const projects = new Map<string, HarnessUsageBucket>()
    const sessions = new Map<string, HarnessUsageBucket>()
    const total = empty()
    const add = (bucket: HarnessUsageBucket | typeof total, usage: NonNullable<HarnessMessage['usage']>) => {
      bucket.input += usage.input; bucket.output += usage.output; bucket.cacheRead += usage.cacheRead; bucket.cacheWrite += usage.cacheWrite; bucket.totalTokens += usage.totalTokens
      if (usage.cost?.priced) { bucket.costs[usage.cost.currency] = (bucket.costs[usage.cost.currency] || 0) + usage.cost.total; bucket.pricedRuns += 1 } else bucket.unpricedRuns += 1
    }
    const get = (map: Map<string, HarnessUsageBucket>, id: string, label: string) => {
      let bucket = map.get(id)
      if (!bucket) { bucket = { id, label, ...empty() }; map.set(id, bucket) }
      return bucket
    }
    for (const row of rows) {
      let session: HarnessSession
      try { session = this.getSession(row.id) } catch { continue }
      const providerId = row.model_provider_id || 'unknown-provider'
      const providerLabel = row.model_id ? `${providerNames.get(providerId) || '未知供应商'} / ${row.model_id}` : '未选择模型'
      const projectId = row.project_id || TEMPORARY_PROJECT_ID
      const projectLabel = row.project_name || '未关联项目'
      for (const message of session.messages) {
        if (message.role !== 'assistant' || message.inherited || !message.usage) continue
        add(total, message.usage)
        add(get(providers, providerId, providerLabel), message.usage)
        add(get(projects, projectId, projectLabel), message.usage)
        add(get(sessions, row.id, session.title), message.usage)
      }
    }
    const totalCost = (bucket: HarnessUsageBucket) => Object.values(bucket.costs).reduce((sum, value) => sum + value, 0)
    const sort = (items: HarnessUsageBucket[]) => items.sort((left, right) => totalCost(right) - totalCost(left) || right.totalTokens - left.totalTokens || left.label.localeCompare(right.label))
    return { total, providers: sort([...providers.values()]), projects: sort([...projects.values()]), sessions: sort([...sessions.values()]) }
  }

  getSession(id: string) {
    const lifecycle = this.database.prepare('SELECT draft_state FROM harness_sessions WHERE id = ?').get(id) as { draft_state: HarnessSession['draftState'] | null } | undefined
    const structured = this.database.prepare('SELECT payload FROM harness_session_state WHERE session_id = ?').get(id) as { payload?: string } | undefined
    if (structured?.payload) {
      const stored = JSON.parse(structured.payload) as Partial<HarnessSession>
      const session = this.parseSession(stored)
      session.draftState = lifecycle?.draft_state || undefined
      if (session.messages.some(message => message.attachments?.some(file => file.mediaType && file.content))) return this.saveSession(session, true)
      if (!session.projectId && !stored.workingDirectory) return this.saveSession({ ...session, workingDirectory: this.paths.workspace }, true)
      return session
    }
    const row = this.database.prepare('SELECT path FROM harness_sessions WHERE id = ?').get(id) as { path?: string } | undefined
    if (!row?.path || !existsSync(row.path)) throw new Error('未找到会话')
    const raw = readFileSync(row.path, 'utf8')
    const stored = JSON.parse(raw) as Partial<HarnessSession>
    const session = this.parseSession(stored)
    session.draftState = lifecycle?.draft_state || undefined
    if (!session.projectId && !stored.workingDirectory) return this.saveSession({ ...session, workingDirectory: this.paths.workspace }, true)
    if (session.messages.some(message => message.attachments?.some(file => file.mediaType && file.content))) return this.saveSession(session, true)
    this.persistStructuredSession(session)
    return session
  }

  updateSession(session: HarnessSession) { return this.saveSession(session) }

  setPinned(id: string, pinned: boolean) {
    const session = this.getSession(id)
    session.pinned = Boolean(pinned)
    const saved = this.saveSession(session)
    this.promoteSessionOrder(id)
    return saved
  }

  setUnread(id: string, unread: boolean) {
    const session = this.getSession(id)
    session.unread = Boolean(unread)
    return this.saveSession(session)
  }

  moveSession(id: string, projectId?: string) {
    const session = this.getSession(id)
    if (!projectId && session.draftState !== 'prepared') throw new Error('只能将未发送的任务草稿切换到个人工作区')
    const project = projectId ? this.getProject(projectId) : undefined
    if (project && !project.directoryExists) throw new Error('所选项目目录不可用，请重新选择')
    const previousProjectId = session.projectId
    this.preserveFileChangeDirectory(session)
    session.projectId = project?.id
    session.workingDirectory = project?.directory || this.paths.workspace
    if (session.draftState === 'prepared' && previousProjectId !== project?.id) session.activeMcpServerIds = session.activeMcpServerIds?.filter(id => !id.startsWith('project:'))
    const saved = this.saveSession(session)
    if (!saved.pinned) this.promoteSessionOrder(id)
    if (previousProjectId && previousProjectId !== project?.id) {
      this.database.prepare(`UPDATE harness_projects SET last_session_at = (
        SELECT MAX(updated_at) FROM harness_sessions WHERE project_id = harness_projects.id AND COALESCE(draft_state, '') <> 'prepared' AND parent_session_id IS NULL
      ) WHERE id = ?`).run(previousProjectId)
    }
    return saved
  }

  renameSession(id: string, title: string) {
    const nextTitle = title.trim().slice(0, 42)
    if (!nextTitle) throw new Error('聊天名称不能为空')
    const session = this.getSession(id)
    session.title = nextTitle
    session.titleSource = 'manual'
    session.titleRevision = (session.titleRevision || 0) + 1
    return this.saveSession(session)
  }

  reserveAutoTitle(id: string) {
    const session = this.getSession(id)
    if (session.titleSource !== 'auto') return undefined
    session.titleRevision = (session.titleRevision || 0) + 1
    this.saveSession(session)
    return session.titleRevision
  }

  isAutoTitleCurrent(id: string, revision: number) {
    const session = this.getSession(id)
    return session.titleSource === 'auto' && session.titleRevision === revision
  }

  applyAutoTitle(id: string, title: string, revision: number) {
    const nextTitle = normalizeAutoTitle(title)
    if (!nextTitle || !this.isAutoTitleCurrent(id, revision)) return undefined
    const session = this.getSession(id)
    session.title = nextTitle
    return this.saveSession(session)
  }

  archiveSessions(ids: string[]) {
    const sessions = [...new Set(ids.filter(id => typeof id === 'string' && id))].map(id => this.getSession(id))
    const archivedAt = now()
    return sessions.map(session => this.saveSession({ ...session, archivedAt }))
  }

  restoreSessions(ids: string[]) {
    const sessions = [...new Set(ids.filter(id => typeof id === 'string' && id))].map(id => this.getSession(id))
    return sessions.map(session => {
      const saved = this.saveSession({ ...session, archivedAt: undefined })
      this.promoteSessionOrder(saved.id)
      return saved
    })
  }

  addMessage(id: string, role: HarnessMessage['role'], content: string, attachments?: HarnessMessageAttachment[], internal = false, permissionMode?: PermissionMode, command?: HarnessMessage['command'], backgroundCommands?: HarnessMessage['backgroundCommands']) {
    const session = this.getSession(id)
    if (permissionMode !== undefined) session.permissionMode = permissionMode
    session.messages.push({ id: randomUUID(), role, content, ...(command ? { command } : {}), ...(attachments?.length ? { attachments } : {}), ...(internal ? { internal: true } : {}), ...(internal && backgroundCommands?.length ? { backgroundCommands: structuredClone(backgroundCommands) } : {}), createdAt: now() })
    if (!internal && role === 'user' && session.titleSource === 'auto' && session.title === '新对话') session.title = titleFor(content)
    const saved = this.saveSession(session)
    if (!internal && role === 'user') this.promoteSessionOrder(id)
    return saved
  }

  appendAssistantDelta(id: string, content: string, ordered?: Pick<HarnessMessage, 'runId' | 'parts' | 'model'> & { messageId?: string }) {
    if (!content && !ordered) return this.getSession(id)
    const session = this.getSession(id)
    const last = session.messages.at(-1)
    const { messageId, ...metadata } = ordered || {}
    const continuation = last?.role === 'assistant' && (!ordered || last.runId === ordered.runId) && (!messageId || last.id === messageId)
    // Legacy plan normalization can also change interactions during getSession;
    // in that case retain the complete structured migration path.
    const storedPlan = this.database.prepare('SELECT payload FROM harness_plans WHERE session_id = ?').get(id) as { payload: string } | undefined
    const incremental = Boolean(messageId && ordered?.runId && session.activeRun?.id === ordered.runId
      && session.activeRun.messageId === messageId && storedPlan?.payload === (session.activePlan ? JSON.stringify(session.activePlan) : undefined))
    if (continuation) {
      last.content += content
      if (ordered) Object.assign(last, metadata)
    } else session.messages.push({ id: messageId || randomUUID(), role: 'assistant', content, createdAt: now(), ...metadata })
    return this.saveSession(session, false, incremental ? { insert: !continuation } : undefined)
  }

  appendGuidanceMessage(id: string, message: HarnessMessage, previous: Pick<HarnessMessage, 'id' | 'content' | 'parts' | 'sources'>, nextAssistantMessageId: string) {
    const session = this.getSession(id)
    const last = session.messages.at(-1)
    if (!session.activeRun || session.activeRun.id !== message.runId || last?.role !== 'assistant' || last.id !== previous.id || session.messages.some(item => item.id === message.id)) throw new Error('当前任务已变化，请刷新后重试')
    Object.assign(last, previous)
    session.messages.push(message)
    session.activeRun.messageId = nextAssistantMessageId
    return this.saveSession(session)
  }

  finalizeAssistantMessage(id: string, options: { content?: string, run?: HarnessRunSummary, usage?: HarnessMessage['usage'], interrupted?: boolean, sources?: HarnessSource[], runId?: string, messageId?: string, parts?: HarnessMessage['parts'], model?: HarnessMessage['model'] } = {}) {
    const session = this.getSession(id)
    let last = session.messages.at(-1)
    if (!last || last.role !== 'assistant' || options.runId && last.runId !== options.runId || options.messageId && last.id !== options.messageId) {
      if (!options.run) throw new Error('没有可完成的助手回复')
      last = { id: options.messageId || randomUUID(), role: 'assistant', content: '', createdAt: options.run.startedAt }
      session.messages.push(last)
    }
    if (options.content !== undefined) last.content = options.content
    if (options.runId) last.runId = options.runId
    if (options.parts) last.parts = options.parts
    if (options.model) last.model = options.model
    if (options.run) last.run = options.run
    if (options.usage) last.usage = options.usage
    if (options.sources?.length) last.sources = options.sources
    else delete last.sources
    if (options.run) {
      const changes = session.toolCalls
        .filter(tool => tool.status === 'ok' && tool.createdAt >= options.run!.startedAt && tool.createdAt <= options.run!.completedAt && (tool.tool === 'edit' || tool.tool === 'write' || tool.tool === 'delete') && tool.target)
        .map(tool => ({ toolCallId: tool.id, tool: tool.tool as HarnessFileChange['tool'], path: tool.target!, ...(tool.diff ? { diff: tool.diff } : {}) } satisfies HarnessFileChange))
      if (changes.length) last.fileChanges = changes
      else delete last.fileChanges
    }
    if (options.interrupted) last.interrupted = true
    else delete last.interrupted
    return this.saveSession(session)
  }

  appendAssistantText(id: string, content: string, run?: HarnessRunSummary, usage?: HarnessMessage['usage'], interrupted?: boolean, sources?: HarnessSource[]) {
    if (content) this.appendAssistantDelta(id, content)
    return this.finalizeAssistantMessage(id, { run, usage, interrupted, sources })
  }

  regenerate(id: string) {
    const session = this.getSession(id)
    const last = session.messages.at(-1)
    if (last?.role === 'assistant') session.messages.pop()
    return this.saveSession(session)
  }

  editUserMessageAndTruncate(id: string, messageId: string, content: string, command?: HarnessMessage['command'], attachments?: HarnessMessageAttachment[], writeSnapshot = true) {
    const value = content.trim()
    const session = this.getSession(id)
    const index = session.messages.findIndex(message => message.id === messageId)
    if (index < 0 || session.messages[index].role !== 'user') throw new Error('只能编辑用户消息')
    if (!value && !(attachments ?? session.messages[index].attachments)?.length) throw new Error('消息不能为空')
    session.messages[index].content = value
    if (attachments !== undefined) session.messages[index].attachments = attachments
    if (command) session.messages[index].command = command
    else delete session.messages[index].command
    session.messages = session.messages.slice(0, index + 1)
    session.context = undefined
    return this.saveSession(session, false, undefined, writeSnapshot)
  }

  /** Retained references use their historical bytes; only newly added references are read. */
  resolveEditedMessageAttachments(id: string, messageId: string, references: HarnessFileReference[]) {
    const message = this.getSession(id).messages.find(message => message.id === messageId && message.role === 'user')
    if (!message) throw new Error('只能编辑用户消息')
    if (references.length > 12 || new Set(references.map(file => file.path)).size !== references.length) throw new Error('编辑附件列表无效')
    let textBytes = 0, imageBytes = 0
    return references.map(file => {
      const retained = message.attachments?.find(attachment => attachment.path === file.path)
      const attachment = retained?.mediaType && !retained.content ? this.stagedAttachment(id, retained.path) : retained ?? this.resolveMessageAttachments(id, [file])[0]!
      if (attachment.mediaType) imageBytes += attachment.size!
      else textBytes += Buffer.byteLength(attachment.content, 'utf8')
      if (textBytes > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error('引用文件总大小超过限制；文本附件总大小不得超过 1 MiB')
      if (imageBytes > HARNESS_ATTACHMENT_LIMITS.imageTotalBytes) throw new Error('图片、PDF 和视频附件总大小不得超过 40 MiB')
      return attachment
    })
  }

  setStatus(id: string, status: HarnessSession['status']) {
    const session = this.getSession(id); session.status = status; return this.saveSession(session)
  }

  setPermission(id: string, permissionMode: PermissionMode) {
    if (!['default', 'auto-approve', 'full'].includes(permissionMode)) throw new Error('无效的权限档位')
    const config = this.getPermissionConfig()
    if (permissionMode === 'auto-approve' && !config.autoApproveEnabled) throw new Error('自动审核权限未启用')
    if (permissionMode === 'full' && !config.fullAccessEnabled) throw new Error('完全访问权限未启用')
    const session = this.getSession(id); session.permissionMode = permissionMode; return this.saveSession(session)
  }

  setActiveSkills(id: string, skillIds: string[]) {
    const session = this.getSession(id)
    session.activeSkillIds = [...new Set(skillIds.filter(value => typeof value === 'string' && /^[a-f0-9]{16}$/.test(value)))]
    return this.saveSession(session)
  }

  setActiveMcpServers(id: string, serverIds: string[]) {
    const session = this.getSession(id)
    session.activeMcpServerIds = [...new Set(serverIds.filter(value => typeof value === 'string' && value.trim()))]
    return this.saveSession(session)
  }

  setDelegationEnabled(id: string, enabled: boolean) {
    const session = this.getSession(id)
    session.delegationEnabled = Boolean(enabled)
    return this.saveSession(session)
  }

  setActiveRun(id: string, activeRun: HarnessSession['activeRun']) {
    const session = this.getSession(id)
    session.activeRun = activeRun
    return this.saveSession(session)
  }

  setActivePlan(id: string, plan: HarnessPlan | undefined) {
    const session = this.getSession(id)
    session.activePlan = plan
    return this.saveSession(session)
  }

  setPendingInteraction(id: string, interaction: HarnessPendingInteraction | undefined) {
    const session = this.getSession(id)
    session.pendingInteraction = interaction
    if (interaction?.status === 'waiting') session.interactions = [...(session.interactions || []).filter(item => item.id !== interaction.id), interaction]
    return this.saveSession(session)
  }

  resolvePendingInteraction(id: string, interactionId: string, status: HarnessPendingInteraction['status'], answers?: HarnessUserAnswer[]) {
    const session = this.getSession(id)
    const interaction = session.pendingInteraction
    if (!interaction || interaction.id !== interactionId || interaction.status !== 'waiting') throw new Error('交互当前不可处理')
    if (interaction.kind === 'question') session.pendingInteraction = { ...interaction, status: status === 'cancelled' ? 'cancelled' : 'answered', ...(answers ? { answers } : {}), resolvedAt: now() }
    else session.pendingInteraction = { ...interaction, status: status === 'cancelled' ? 'cancelled' : status === 'discussing' ? 'discussing' : 'approved', resolvedAt: now() }
    session.interactions = [...(session.interactions || []).filter(item => item.id !== interaction.id), session.pendingInteraction]
    return this.saveSession(session)
  }

  updatePlan(id: string, patch: Partial<HarnessPlan>) {
    const session = this.getSession(id)
    if (!session.activePlan) throw new Error('当前没有计划')
    session.activePlan = { ...session.activePlan, ...patch, updatedAt: now() }
    return this.saveSession(session)
  }

  confirmPlan(id: string, planId: string) {
    const session = this.getSession(id)
    if (!session.activePlan || session.activePlan.id !== planId) throw new Error('计划不存在')
    if (session.activePlan.status !== 'awaiting_confirmation') throw new Error('计划当前不可执行')
    session.activePlan = { ...session.activePlan, status: 'executing', confirmedAt: now(), updatedAt: now() }
    return this.saveSession(session)
  }

  cancelPlan(id: string, planId: string) {
    const session = this.getSession(id)
    if (!session.activePlan || session.activePlan.id !== planId) throw new Error('计划不存在')
    session.activePlan = { ...session.activePlan, status: 'cancelled', cancelledAt: now(), updatedAt: now() }
    return this.saveSession(session)
  }

  recoverInterruptedSubtasks() {
    const rows = this.database.prepare('SELECT id FROM harness_sessions').all() as Array<{ id: string }>
    for (const row of rows) {
      let session: HarnessSession
      try { session = this.getSession(row.id) } catch { continue }
      if (!session.activeRun) continue
      let changed = false
      const interrupted = new Set<string>()
      for (const task of session.activeRun.subtasks) {
        if (task.status === 'queued' || task.status === 'running' || task.status === 'stopping') {
          task.status = 'interrupted'; task.completedAt = now(); changed = true
          interrupted.add(task.id)
          for (const activity of task.activities) if (activity.status === 'running') { activity.status = 'failed'; activity.completedAt = task.completedAt }
          for (const part of task.parts || []) if (part.type !== 'tool' && part.state === 'streaming') { part.state = 'interrupted'; part.completedAt = task.completedAt }
        }
      }
      for (const tool of session.toolCalls) if (tool.runId === session.activeRun.id && tool.subtaskId && interrupted.has(tool.subtaskId) && (tool.status === 'running' || tool.status === 'waiting-confirm')) {
        tool.status = 'cancelled'; tool.completedAt = now(); tool.error = '应用重启，子任务已中断'; changed = true
      }
      if (changed) this.saveSession(session)
    }
  }

  recoverInterruptedCommands() {
    const rows = this.database.prepare('SELECT id FROM harness_sessions').all() as Array<{ id: string }>
    for (const row of rows) {
      const session = this.getSession(row.id)
      let changed = false
      for (const tool of session.toolCalls) if (!tool.inherited && tool.commandJob?.status === 'running') {
        tool.commandJob = { ...tool.commandJob, status: 'interrupted', revision: tool.commandJob.revision + 1, completedAt: now(), error: '应用重启，已失去原命令的控制；不会自动重跑。' }
        if (tool.status === 'running') { tool.status = 'cancelled'; tool.completedAt = now() }
        changed = true
      }
      if (changed) this.saveSession(session)
    }
  }

  attachDirectory(sessionId: string, directory: string) {
    const session = this.getSession(sessionId)
    const project = this.createProject(directory)
    this.preserveFileChangeDirectory(session)
    session.projectId = project.id; session.workingDirectory = project.directory
    return this.saveSession(session)
  }

  listProjectFiles(projectId: string, query = ''): HarnessFileReference[] {
    const project = this.getProject(projectId)
    const term = query.trim().toLocaleLowerCase()
    const files: HarnessFileReference[] = []
    const visit = (directory: string) => {
      if (files.length >= MAX_LISTED_PROJECT_FILES) return
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (files.length >= MAX_LISTED_PROJECT_FILES) return
        if (entry.isDirectory()) {
          if (!IGNORED_FILE_DIRECTORIES.has(entry.name)) visit(join(directory, entry.name))
          continue
        }
        if (!entry.isFile()) continue
        const target = join(directory, entry.name)
        if (!this.isTextProjectFile(target)) continue
        const path = relative(project.directory, target)
        if (!term || path.toLocaleLowerCase().includes(term)) files.push({ path, name: entry.name })
      }
    }
    visit(project.directory)
    return files.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
  }

  selectFileReferences(projectId: string, filePaths: string[]): HarnessFileReference[] {
    const project = this.getProject(projectId)
    const references = filePaths.map(filePath => {
      if (typeof filePath !== 'string' || !isAbsolute(filePath)) throw new Error('引用文件路径无效')
      const candidate = resolve(filePath)
      const relativePath = relative(project.directory, candidate)
      if (relativePath && !relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath)) {
        const target = this.workspaceFilePath(project.directory, relativePath)
        // 引用路径沿用“原始相对路径”（而非用 realpath 回算 relative），
        // 避免 macOS（/var → /private/var）与 Windows（符号链接 / junction / 盘符大小写）
        // 下 project.directory 与 realpath 前缀不一致，从而拼出 ../.. 逃逸路径。
        return { path: relativePath, name: basename(target) }
      }
      // 外部文件：存 resolve 后的绝对路径（非 realpath）作为引用；读取端会经
      // attachmentFilePath → externalFilePath 再次 realpathSync，跨平台稳定且显示与来源一致。
      return { path: candidate, name: basename(candidate) }
    })
    this.resolveAttachments(project.directory, references, true)
    return references
  }

  assertAttachmentSessionWritable(sessionId: string) {
    const row = this.database.prepare('SELECT id, working_directory, archived_at FROM harness_sessions WHERE id = ?').get(sessionId) as Pick<SessionRow, 'id' | 'working_directory' | 'archived_at'> | undefined
    if (!row) throw new Error('未找到会话')
    if (row.archived_at) throw new Error('归档会话不能新增附件，请先恢复任务')
    return { id: row.id, workingDirectory: row.working_directory || undefined }
  }

  private stageAttachments(sessionId: string, attachments: HarnessMessageAttachment[]): HarnessFileReference[] {
    this.assertAttachmentSessionWritable(sessionId)
    assertHarnessAttachmentTotals(attachments)
    const records = attachments.map(attachment => ({ ...attachment, path: `${HARNESS_ATTACHMENT_PREFIX}${randomUUID()}`, size: attachment.mediaType ? attachment.size : Buffer.byteLength(attachment.content, 'utf8') }))
    const insert = this.database.prepare('INSERT INTO harness_attachments(session_id, id, payload) VALUES (?, ?, ?)')
    // 只有整批验证通过才发布引用；事务失败不会留下可见的半批附件。
    this.database.transaction(() => records.forEach(record => insert.run(sessionId, record.path.slice(HARNESS_ATTACHMENT_PREFIX.length), JSON.stringify(record))))()
    return records.map(({ path, name, mediaType, size }) => ({ path, name, ...(mediaType ? { mediaType } : {}), size }))
  }

  importMessageAttachments(sessionId: string, files: HarnessAttachmentImportFile[]): HarnessFileReference[] {
    this.assertAttachmentSessionWritable(sessionId)
    if (!Array.isArray(files) || !files.length || files.length > MAX_FILE_REFERENCES) throw new Error('一次最多引用 12 个文件')
    const attachments: HarnessMessageAttachment[] = []
    let textBytes = 0, imageBytes = 0
    for (const file of files) {
      if (!file || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 512 || /[\\/\u0000-\u001f\u007f]/.test(file.name)) throw new Error('附件文件名无效')
      if (typeof file.mediaType !== 'string' || file.mediaType.length > 128) throw new Error('附件媒体类型无效')
      const bytes = decodeHarnessAttachmentImport(file)
      const image = harnessAttachmentMediaType(bytes, file.name)
      if (image) imageBytes += bytes.length
      else textBytes += bytes.length
      if (textBytes > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error('引用文件总大小超过限制；文本附件总大小不得超过 1 MiB')
      if (imageBytes > HARNESS_ATTACHMENT_LIMITS.imageTotalBytes) throw new Error('图片、PDF 和视频附件总大小不得超过 40 MiB')
      attachments.push(harnessAttachmentFromBytes('', file.name, bytes, file.mediaType))
    }
    return this.stageAttachments(sessionId, attachments)
  }

  selectMessageAttachments(sessionId: string, filePaths: string[]): HarnessFileReference[] {
    this.assertAttachmentSessionWritable(sessionId)
    if (filePaths.length > MAX_FILE_REFERENCES) throw new Error('一次最多引用 12 个文件')
    const attachments: HarnessMessageAttachment[] = []
    let textBytes = 0, imageBytes = 0
    for (const path of filePaths) {
      const target = this.externalFilePath(path)
      const attachment = this.readAttachmentFile(target, '', basename(target), textBytes, imageBytes)
      attachments.push(attachment)
      if (attachment.mediaType) imageBytes += attachment.size!
      else textBytes += Buffer.byteLength(attachment.content, 'utf8')
      assertHarnessAttachmentTotals(attachments)
    }
    return this.stageAttachments(sessionId, attachments)
  }

  getMessageAttachment(sessionId: string, path: string): HarnessMessageAttachment {
    if (path.startsWith(HARNESS_ATTACHMENT_PREFIX)) {
      if (!this.database.prepare('SELECT 1 FROM harness_sessions WHERE id = ?').get(sessionId)) throw new Error('未找到会话')
      return this.stagedAttachment(sessionId, path)
    }
    return this.resolveMessageAttachments(sessionId, [{ path, name: basename(path) }])[0]!
  }

  stageMessageAttachment(sessionId: string, path: string): HarnessFileReference {
    this.assertAttachmentSessionWritable(sessionId)
    if (isAbsolute(path) || /^[a-z][a-z\d+.-]*:/i.test(path)) throw new Error('只能暂存工作目录中的相对路径文件')
    return this.stageAttachments(sessionId, [this.getMessageAttachment(sessionId, path)])[0]!
  }

  resolveMessageAttachments(sessionId: string, references: HarnessFileReference[] = []): HarnessMessageAttachment[] {
    if (!references.length) return []
    const session = this.getSession(sessionId)
    const directory = session.projectId ? this.getProject(session.projectId).directory : session.workingDirectory
    if (!directory) throw new Error('该会话没有可用工作目录')
    return this.resolveAttachments(directory, references, Boolean(session.projectId), sessionId)
  }

  removeEmptySessions(retainedIds: ReadonlySet<string> = new Set()) {
    const rows = this.database.prepare("SELECT id FROM harness_sessions WHERE COALESCE(draft_state, '') <> 'accepted'").all() as Array<{ id: string }>
    const emptyIds = rows.flatMap(row => {
      if (retainedIds.has(row.id)) return []
      if (this.database.prepare('SELECT 1 FROM harness_messages WHERE session_id = ? LIMIT 1').get(row.id)) return []
      try {
        const session = this.getSession(row.id)
        return session.id !== row.id || session.messages.length ? [] : [row.id]
      } catch { return [] }
    })
    if (!emptyIds.length) return 0
    this.deleteSessions(emptyIds)
    this.database.prepare(`UPDATE harness_projects SET last_session_at = (
      SELECT MAX(updated_at) FROM harness_sessions WHERE project_id = harness_projects.id AND COALESCE(draft_state, '') <> 'prepared' AND parent_session_id IS NULL
    )`).run()
    return emptyIds.length
  }

  /** Startup only: durable history/drafts are complete roots before any runtime queue exists. */
  reclaimStagedAttachments(references: ReadonlyMap<string, ReadonlySet<string>>, protectedOwners: ReadonlySet<string> = new Set()) {
    const owners = this.database.prepare('SELECT DISTINCT session_id FROM harness_attachments').all() as Array<{ session_id: string }>
    const remove = this.database.prepare('DELETE FROM harness_attachments WHERE session_id = ? AND id = ?')
    return this.database.transaction(() => {
      let removed = 0
      for (const { session_id: owner } of owners) {
        if (protectedOwners.has(owner)) continue
        const paths = new Set(references.get(owner))
        const retainMessage = (message: unknown) => {
          if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('未知消息格式')
          const attachments = (message as { attachments?: unknown }).attachments
          if (attachments === undefined) return
          if (!Array.isArray(attachments)) throw new Error('未知附件格式')
          for (const file of attachments) {
            if (!file || typeof file !== 'object' || typeof file.path !== 'string' || !file.path.trim()) throw new Error('未知附件引用')
            paths.add(file.path)
          }
        }
        try {
          const state = this.database.prepare('SELECT payload FROM harness_session_state WHERE session_id = ?').get(owner) as { payload: string } | undefined
          const row = this.database.prepare('SELECT path FROM harness_sessions WHERE id = ?').get(owner) as { path: string } | undefined
          // 老会话尚未结构化时读取原文件；损坏/无法读取的 owner 保留全部附件。
          if (state || row) {
            const session = JSON.parse(state ? state.payload : readFileSync(row!.path, 'utf8')) as { version?: unknown; id?: unknown; messages?: unknown } | null
            if (!session || session.version !== 1 || session.id !== owner || !Array.isArray(session.messages)) throw new Error('未知会话格式')
            session.messages.forEach(retainMessage)
          }
          const messages = this.database.prepare('SELECT payload FROM harness_messages WHERE session_id = ?').all(owner) as Array<{ payload: string }>
          messages.forEach(message => retainMessage(JSON.parse(message.payload)))
        } catch { continue }
        const attachments = this.database.prepare('SELECT id FROM harness_attachments WHERE session_id = ?').all(owner) as Array<{ id: string }>
        for (const { id } of attachments) {
          if (!paths.has(`${HARNESS_ATTACHMENT_PREFIX}${id}`)) removed += remove.run(owner, id).changes
        }
      }
      return removed
    })()
  }

  sideConversationIds(parentId: string): string[] {
    return (this.database.prepare('SELECT id FROM harness_sessions WHERE parent_session_id = ?').all(parentId) as Array<{ id: string }>).map(row => row.id)
  }

  deleteSession(id: string) { this.deleteSessions([id]) }

  archivedSessionIds() {
    // Selection is independent of sidebar pages, hidden projects, pinning and title filters.
    return (this.database.prepare("SELECT id FROM harness_sessions WHERE archived_at IS NOT NULL AND COALESCE(draft_state, '') <> 'prepared' AND parent_session_id IS NULL ORDER BY id").all() as Array<{ id: string }>).map(row => row.id)
  }

  isSessionArchived(id: string) {
    return Boolean(this.database.prepare('SELECT 1 FROM harness_sessions WHERE id = ? AND archived_at IS NOT NULL').get(id))
  }

  deleteArchivedSession(id: string) {
    return this.database.transaction(() => {
      // Conditional write and dependent cleanup share one synchronous transaction.
      const row = this.database.prepare('DELETE FROM harness_sessions WHERE id = ? AND archived_at IS NOT NULL RETURNING path').get(id) as { path?: string } | undefined
      if (!row) return false
      this.deleteSessions(this.sideConversationIds(id))
      if (row.path) rmSync(row.path, { force: true })
      this.deleteStructuredSession(id)
      return true
    })()
  }

  deleteSessions(ids: string[]) {
    const uniqueIds = [...new Set(ids.filter(id => typeof id === 'string' && id))]
    if (!uniqueIds.length) return
    // Parent deletion also removes its hidden conversations and frozen attachments.
    for (let index = 0; index < uniqueIds.length; index++) {
      const children = this.database.prepare('SELECT id FROM harness_sessions WHERE parent_session_id = ?').all(uniqueIds[index]) as Array<{ id: string }>
      children.forEach(child => { if (!uniqueIds.includes(child.id)) uniqueIds.push(child.id) })
    }
    const placeholders = uniqueIds.map(() => '?').join(', ')
    const rows = this.database.prepare(`SELECT path FROM harness_sessions WHERE id IN (${placeholders})`).all(...uniqueIds) as Array<{ path: string }>
    const remove = this.database.transaction(() => {
      rows.forEach(row => rmSync(row.path, { force: true }))
      uniqueIds.forEach(id => this.deleteStructuredSession(id))
      this.database.prepare(`DELETE FROM harness_sessions WHERE id IN (${placeholders})`).run(...uniqueIds)
    })
    remove()
  }

  private deleteStructuredSession(id: string) {
    this.commandOutputs.removeSession(id)
    this.database.prepare('DELETE FROM harness_file_checkpoints WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_file_rewinds WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_task_files WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_attachments WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_session_state WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_messages WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_tool_calls WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_plans WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_interactions WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_runs WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_run_activities WHERE session_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_subtasks WHERE session_id = ?').run(id)
  }

  private preserveFileChangeDirectory(session: HarnessSession) {
    for (const tool of session.toolCalls) if (['edit', 'write', 'delete'].includes(tool.tool) && !tool.fileChangeDirectory) tool.fileChangeDirectory = session.workingDirectory
  }

  recordTool(id: string, record: ToolCallRecord) {
    const session = this.getSession(id)
    const linked = { ...record, messageId: record.messageId || [...session.messages].reverse().find(message => message.role === 'user')?.id }
    session.toolCalls.push(['edit', 'write', 'delete'].includes(record.tool) ? { ...linked, fileChangeDirectory: session.workingDirectory } : linked)
    return this.saveSession(session)
  }

  /** Persist before touching disk. A crash or incomplete write stays explicitly unavailable. */
  beginFileCheckpoint(id: string, toolId: string, path: string, before: string | null | undefined) {
    const session = this.getSession(id), tool = session.toolCalls.find(tool => tool.id === toolId)
    if (!tool || tool.inherited || !['edit', 'write', 'delete'].includes(tool.tool)) return
    const messageIndex = session.messages.findIndex(message => message.id === tool.messageId && message.role === 'user')
    const message = session.messages[messageIndex]
    const originalDirectory = tool.fileChangeDirectory || session.workingDirectory
    if (!message || !originalDirectory) return
    const directory = realpathSync(originalDirectory)
    const value = miraCheckpointPathStable(directory, path) ? miraCheckpointText(before) : undefined
    const target = resolve(directory, path)
    const location = relative(directory, existsSync(target) && value !== undefined ? realpathSync(target) : target).split(sep).join('/')
    const chain = JSON.stringify(session.messages.slice(0, messageIndex + 1).filter(message => message.role === 'user').map(message => message.id))
    this.database.prepare('INSERT INTO harness_file_checkpoints(session_id, tool_id, message_id, message_chain, directory, path, before_content, before_known, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, toolId, message.id, chain, directory, location, value ?? null, Number(value !== undefined), tool.createdAt)
  }

  finishFileCheckpoint(id: string, toolId: string, after: string | null | undefined) {
    const value = miraCheckpointText(after)
    this.database.prepare('UPDATE harness_file_checkpoints SET after_content = ?, after_known = ?, settled = 1 WHERE session_id = ? AND tool_id = ? AND settled = 0').run(value ?? null, Number(value !== undefined), id, toolId)
  }

  fileRewindHistory(id: string, messageId: string) {
    const message = this.getSession(id).messages.find(message => message.id === messageId && message.role === 'user')
    if (!message) throw new Error('只能预览用户消息对应的文件恢复')
    const ancestry = 'session_id = ? AND EXISTS (SELECT 1 FROM json_each(message_chain) WHERE value = ?)'
    const scope = `${ancestry} AND rewind_id IS NULL`
    const size = this.database.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(COALESCE(length(CAST(before_content AS BLOB)), 0) + COALESCE(length(CAST(after_content AS BLOB)), 0)), 0) AS bytes FROM harness_file_checkpoints WHERE ${scope}`).get(id, messageId) as { count: number; bytes: number }
    // Fetch metadata first so a large journal cannot materialize unbounded private file bytes.
    if (size.count > 128 || size.bytes > 16 * 1024 * 1024) return { records: [] as MiraFileCheckpoint[], limited: true }
    const records = this.database.prepare(`SELECT sequence, tool_id AS toolId, message_id AS messageId, directory, path, before_content AS before, before_known AS beforeKnown, after_content AS after, after_known AS afterKnown, settled FROM harness_file_checkpoints WHERE ${scope} ORDER BY sequence`).all(id, messageId) as MiraFileCheckpoint[]
    const rewound = this.database.prepare(`SELECT tool_id AS toolId FROM harness_file_checkpoints WHERE ${ancestry} AND rewind_id IS NOT NULL ORDER BY sequence`).all(id, messageId) as Array<{ toolId: string }>
    return { records, limited: false, ...(rewound.length ? { rewoundToolIds: rewound.map(row => row.toolId) } : {}) }
  }

  pendingFileRewinds() {
    return this.database.prepare("SELECT id, session_id AS sessionId, message_id AS messageId, directory FROM harness_file_rewinds WHERE status = 'pending'").all() as Array<Omit<MiraFileRewindJournal, 'operations' | 'cursor'>>
  }

  getPendingFileRewind(sessionId: string, id: string): MiraFileRewindJournal {
    const row = this.database.prepare("SELECT message_id AS messageId, directory, payload, cursor FROM harness_file_rewinds WHERE id = ? AND session_id = ? AND status = 'pending'").get(id, sessionId) as { messageId: string; directory: string; payload: string; cursor: number } | undefined
    if (!row) throw new Error('未完成的文件恢复已变化，请刷新预览')
    return { id, sessionId, messageId: row.messageId, directory: row.directory, operations: JSON.parse(row.payload), cursor: row.cursor }
  }

  beginFileRewind(sessionId: string, messageId: string, directory: string, operations: MiraFileRewindOperation[]): MiraFileRewindJournal {
    const id = randomUUID()
    this.database.prepare('INSERT INTO harness_file_rewinds(id, session_id, message_id, directory, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, sessionId, messageId, directory, JSON.stringify(operations), now())
    return { id, sessionId, messageId, directory, operations, cursor: 0 }
  }

  advanceFileRewind(journal: MiraFileRewindJournal, cursor: number) {
    const result = this.database.prepare("UPDATE harness_file_rewinds SET cursor = ? WHERE id = ? AND session_id = ? AND status = 'pending' AND cursor = ?").run(cursor, journal.id, journal.sessionId, cursor - 1)
    if (result.changes !== 1) throw new Error('文件恢复记录已变化')
  }

  rollbackFileRewind(id: string) { this.database.prepare("UPDATE harness_file_rewinds SET status = 'rolled_back', payload = '[]' WHERE id = ? AND status = 'pending'").run(id) }

  commitFileRewind(journal: MiraFileRewindJournal, secrets: string[] = [], edit?: { content: string; command?: HarnessMessage['command']; attachments?: HarnessMessageAttachment[] }) {
    let updated: HarnessSession | undefined
    this.database.transaction(() => {
      this.getPendingFileRewind(journal.sessionId, journal.id)
      const retired = this.database.prepare('UPDATE harness_file_checkpoints SET rewind_id = ? WHERE session_id = ? AND sequence = ? AND rewind_id IS NULL')
      for (const operation of journal.operations) {
        for (const sequence of operation.sequences) if (retired.run(journal.id, journal.sessionId, sequence).changes !== 1) throw new Error('文件快照已变化')
        const path = resolve(journal.directory, operation.path)
        const previous = this.database.prepare('SELECT first_content, first_known, public_payload FROM harness_task_files WHERE session_id = ? AND path = ?').get(journal.sessionId, path) as { first_content: string | null; first_known: number; public_payload: string } | undefined
        if (previous) {
          const old = JSON.parse(previous.public_payload) as MiraTaskChangedFile
          const file = buildMiraTaskFileChange(old.key, old.path, old.tool, old.writes, previous.first_known ? previous.first_content : undefined, operation.restored, secrets)
          this.database.prepare('UPDATE harness_task_files SET public_payload = ? WHERE session_id = ? AND path = ?').run(JSON.stringify(file), journal.sessionId, path)
        }
      }
      if (edit) updated = this.editUserMessageAndTruncate(journal.sessionId, journal.messageId, edit.content, edit.command, edit.attachments, false)
      this.database.prepare("UPDATE harness_file_rewinds SET status = 'committed', payload = '[]' WHERE id = ?").run(journal.id)
    })()
    // SQLite is authoritative. A failed backup must never undo an already committed edit.
    if (updated) try { this.writeSessionSnapshot(updated) } catch { console.warn('[Mira Harness] 文件恢复后的会话备份未写入；已提交状态仍保存在 SQLite。') }
    return updated
  }

  recordTaskFileChange(id: string, toolId: string, snapshot: MiraTaskFileSnapshot, secrets: string[] = []) {
    this.finishFileCheckpoint(id, toolId, snapshot.after)
    const session = this.getSession(id), tool = session.toolCalls.find(tool => tool.id === toolId)
    if (!tool || !['edit', 'write', 'delete'].includes(tool.tool) || !session.workingDirectory) return
    const directory = tool.fileChangeDirectory || session.workingDirectory
    const path = resolve(directory, snapshot.path)
    const previous = this.database.prepare('SELECT first_content, first_known, public_payload FROM harness_task_files WHERE session_id = ? AND path = ?').get(id, path) as { first_content: string | null; first_known: number; public_payload: string } | undefined
    const legacyWrites = !previous ? session.toolCalls.filter(record => record.id !== toolId && !record.inherited && record.status === 'ok' && ['edit', 'write', 'delete'].includes(record.tool) && record.target && resolve(record.fileChangeDirectory || session.workingDirectory!, record.target) === path).length : 0
    const legacy = legacyWrites > 0
    const known = previous ? Boolean(previous.first_known) : snapshot.before !== undefined && !legacy
    const before = known ? previous ? previous.first_content : snapshot.before : undefined
    const writes = previous ? (JSON.parse(previous.public_payload) as MiraTaskChangedFile).writes + 1 : legacyWrites + 1
    const file = buildMiraTaskFileChange(createHash('sha256').update(path).digest('hex'), relative(directory, path).split(sep).join('/'), tool.tool as MiraTaskChangedFile['tool'], writes, before, snapshot.after, secrets)
    this.database.prepare('INSERT INTO harness_task_files(session_id, path, first_content, first_known, public_payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT(session_id, path) DO UPDATE SET public_payload = excluded.public_payload').run(id, path, before ?? null, Number(known), JSON.stringify(file))
  }

  getTaskChangeSummary(id: string, includeDiff = false, session = this.getSession(id)): MiraTaskChangeSummary | undefined {
    const rows = this.database.prepare('SELECT path, public_payload FROM harness_task_files WHERE session_id = ?').all(id) as Array<{ path: string; public_payload: string }>
    let remaining = 64 * 1024
    const files = rows.map(row => {
      const file = JSON.parse(row.public_payload) as MiraTaskChangedFile
      const location = session.workingDirectory ? relative(session.workingDirectory, row.path) : undefined
      if (location && (location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location))) file.path = `其他项目/${location.split(sep).join('/')}`
      if (includeDiff) {
        if (!file.diff) return file
        const bytes = Buffer.byteLength(file.diff)
        if (bytes <= remaining) { remaining -= bytes; return file }
        return { ...file, diff: undefined, diffTruncated: true }
      }
      const { diff: _diff, diffTruncated: _truncated, ...metadata } = file
      return metadata
    })
    const recorded = new Set(rows.map(row => row.path))
    const legacyFiles = new Map<string, MiraTaskChangedFile>()
    for (const tool of session.toolCalls) {
      if (tool.inherited || tool.status !== 'ok' || !['edit', 'write', 'delete'].includes(tool.tool) || !tool.target || !session.workingDirectory) continue
      const path = resolve(tool.fileChangeDirectory || session.workingDirectory, tool.target)
      if (recorded.has(path)) continue
      const legacy = legacyFiles.get(path)
      if (legacy) { legacy.writes++; legacy.tool = tool.tool as MiraTaskChangedFile['tool'] }
      else legacyFiles.set(path, { key: createHash('sha256').update(path).digest('hex'), path: relative(session.workingDirectory, path).split(sep).join('/'), tool: tool.tool as MiraTaskChangedFile['tool'], writes: 1, unavailable: true })
    }
    files.push(...legacyFiles.values())
    if (!files.length) return undefined
    return { files: files.sort((a, b) => a.path.localeCompare(b.path)), added: files.reduce((sum, file) => sum + (file.added || 0), 0), removed: files.reduce((sum, file) => sum + (file.removed || 0), 0), incomplete: files.some(file => file.unavailable), estimated: files.some(file => file.estimated) }
  }

  updateTool(id: string, toolId: string, patch: Partial<ToolCallRecord>) {
    const session = this.getSession(id); const tool = session.toolCalls.find(item => item.id === toolId)
    if (tool) Object.assign(tool, patch)
    return this.saveSession(session)
  }

  getPermissionConfig(): PermissionConfig {
    const row = this.database.prepare('SELECT value FROM harness_settings WHERE key = ?').get('permission') as { value?: string } | undefined
    try {
      const stored = row?.value ? JSON.parse(row.value) as Partial<PermissionConfig> : {}
      const globalDefaultMode = ['default', 'auto-approve', 'full'].includes(stored.globalDefaultMode || '')
        ? stored.globalDefaultMode as PermissionMode
        : DEFAULT_PERMISSION_CONFIG.globalDefaultMode
      return {
        ...DEFAULT_PERMISSION_CONFIG,
        ...stored,
        autoApproveEnabled: typeof stored.autoApproveEnabled === 'boolean' ? stored.autoApproveEnabled : DEFAULT_PERMISSION_CONFIG.autoApproveEnabled,
        fullAccessEnabled: typeof stored.fullAccessEnabled === 'boolean' ? stored.fullAccessEnabled : DEFAULT_PERMISSION_CONFIG.fullAccessEnabled,
        globalDefaultMode,
      }
    } catch { return clone(DEFAULT_PERMISSION_CONFIG) }
  }

  savePermissionConfig(config: PermissionConfig) {
    const current = this.getPermissionConfig()
    const next: PermissionConfig = {
      ...current,
      autoApproveEnabled: typeof config.autoApproveEnabled === 'boolean' ? config.autoApproveEnabled : current.autoApproveEnabled,
      fullAccessEnabled: typeof config.fullAccessEnabled === 'boolean' ? config.fullAccessEnabled : current.fullAccessEnabled,
      trashRetentionDays: Number.isInteger(config.trashRetentionDays) && config.trashRetentionDays >= 1 && config.trashRetentionDays <= 30
        ? config.trashRetentionDays
        : current.trashRetentionDays,
      globalDefaultMode: ['default', 'auto-approve', 'full'].includes(config.globalDefaultMode)
        ? config.globalDefaultMode
        : current.globalDefaultMode,
    }
    if ((next.globalDefaultMode === 'auto-approve' && !next.autoApproveEnabled) || (next.globalDefaultMode === 'full' && !next.fullAccessEnabled)) next.globalDefaultMode = 'default'
    this.database.prepare('INSERT OR REPLACE INTO harness_settings(key, value) VALUES (?, ?)').run('permission', JSON.stringify(next))
    return this.getPermissionConfig()
  }

  getGitConfig(): HarnessGitConfig {
    const row = this.database.prepare('SELECT value FROM harness_settings WHERE key = ?').get('git') as { value?: string } | undefined
    try {
      const stored = row?.value ? JSON.parse(row.value) as Partial<HarnessGitConfig> : {}
      return {
        branchPrefix: gitPrefix(stored.branchPrefix),
        pullRequestMergeMethod: stored.pullRequestMergeMethod === 'squash' ? 'squash' : 'merge',
        alwaysForcePush: typeof stored.alwaysForcePush === 'boolean' ? stored.alwaysForcePush : DEFAULT_HARNESS_GIT_CONFIG.alwaysForcePush,
        createDraftPullRequest: typeof stored.createDraftPullRequest === 'boolean' ? stored.createDraftPullRequest : DEFAULT_HARNESS_GIT_CONFIG.createDraftPullRequest,
        reviewDelivery: stored.reviewDelivery === 'separate' ? 'separate' : 'inline',
        commitInstructions: typeof stored.commitInstructions === 'string' ? stored.commitInstructions : '',
        pullRequestInstructions: typeof stored.pullRequestInstructions === 'string' ? stored.pullRequestInstructions : '',
      }
    } catch { return clone(DEFAULT_HARNESS_GIT_CONFIG) }
  }

  saveGitConfig(config: HarnessGitConfig) {
    const current = this.getGitConfig()
    const next: HarnessGitConfig = {
      branchPrefix: gitPrefix(config.branchPrefix),
      pullRequestMergeMethod: config.pullRequestMergeMethod === 'squash' ? 'squash' : 'merge',
      alwaysForcePush: typeof config.alwaysForcePush === 'boolean' ? config.alwaysForcePush : current.alwaysForcePush,
      createDraftPullRequest: typeof config.createDraftPullRequest === 'boolean' ? config.createDraftPullRequest : current.createDraftPullRequest,
      reviewDelivery: config.reviewDelivery === 'separate' ? 'separate' : 'inline',
      commitInstructions: typeof config.commitInstructions === 'string' ? config.commitInstructions : current.commitInstructions,
      pullRequestInstructions: typeof config.pullRequestInstructions === 'string' ? config.pullRequestInstructions : current.pullRequestInstructions,
    }
    this.database.prepare('INSERT OR REPLACE INTO harness_settings(key, value) VALUES (?, ?)').run('git', JSON.stringify(next))
    return this.getGitConfig()
  }

  moveToTrash(sessionId: string, relativePath: string) {
    const session = this.getSession(sessionId)
    if (!session.projectId || !session.workingDirectory) throw new Error('请先选择项目目录')
    const project = this.getProject(session.projectId)
    const source = this.ensureInside(project.directory, join(project.directory, relativePath))
    if (!existsSync(source)) throw new Error('文件不存在')
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`
    const destination = join(this.paths.projectTrash(project.id), stamp, relativePath)
    mkdirSync(dirname(destination), { recursive: true }); renameSync(source, destination)
    return { token: stamp, path: relativePath }
  }

  listTrash(projectId?: string): HarnessTrashEntry[] {
    const projects = projectId ? [this.getProject(projectId)] : this.listProjects()
    return projects.flatMap(project => {
      const root = this.paths.projectTrash(project.id)
      if (!existsSync(root)) return []
      return readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
        const directory = join(root, entry.name)
        try {
          return [{ token: entry.name, projectId: project.id, projectName: project.name, deletedAt: trashTime(entry.name, directory), paths: trashPaths(directory) }]
        } catch (error) {
          console.warn(`[Mira] 无法读取回收站记录：${directory}`, error)
          return []
        }
      })
    }).sort((a, b) => b.deletedAt - a.deletedAt)
  }

  restoreTrash(projectId: string, token: string) {
    if (!/^[a-zA-Z0-9-]+$/.test(token)) throw new Error('回收站记录无效')
    const project = this.getProject(projectId)
    if (!existsSync(project.directory)) throw new Error('项目目录不存在，无法还原')
    const root = join(this.paths.projectTrash(projectId), token)
    if (!existsSync(root)) throw new Error('未找到回收站记录')
    const paths = trashPaths(root)
    const conflict = paths.find(path => existsSync(this.ensureInside(project.directory, join(project.directory, path))))
    if (conflict) throw new Error(`目标路径已存在，无法还原：${conflict}`)
    for (const entry of readdirSync(root)) cpSync(join(root, entry), join(project.directory, entry), { recursive: true, force: false })
    rmSync(root, { recursive: true, force: true })
  }

  cleanupExpiredTrash(referenceTime = now()) {
    const cutoff = referenceTime - this.getPermissionConfig().trashRetentionDays * 24 * 60 * 60 * 1000
    if (!existsSync(this.paths.trash)) return 0
    let removed = 0
    for (const project of readdirSync(this.paths.trash, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      const root = join(this.paths.trash, project.name)
      for (const entry of readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
        const directory = join(root, entry.name)
        try {
          if (trashTime(entry.name, directory) < cutoff) {
            rmSync(directory, { recursive: true, force: true })
            removed += 1
          }
        } catch (error) {
          console.warn(`[Mira] 无法清理回收站记录：${directory}`, error)
        }
      }
    }
    return removed
  }

  migrateLegacyStorage() {
    const sessions = this.database.prepare('SELECT id, path FROM harness_sessions').all() as Array<{ id: string, path: string }>
    for (const session of sessions) {
      const target = this.paths.session(session.id)
      if (session.path !== target && existsSync(session.path)) {
        atomicMove(session.path, target)
        if (!existsSync(target)) throw new Error(`迁移会话失败：${session.id}`)
        this.database.prepare('UPDATE harness_sessions SET path = ? WHERE id = ?').run(target, session.id)
      }
    }
    for (const project of this.listProjects()) {
      const legacyTrash = join(project.directory, '.mira', 'trash')
      const target = this.paths.projectTrash(project.id)
      if (existsSync(legacyTrash) && lstatSync(legacyTrash).isDirectory() && !lstatSync(join(project.directory, '.mira')).isSymbolicLink()) {
        for (const entry of readdirSync(legacyTrash, { withFileTypes: true })) {
          // File trash used timestamp + eight UUID characters; other entries belong to project configuration.
          if (entry.isDirectory() && /^\d+-[a-f0-9]{8}$/.test(entry.name)) atomicMove(join(legacyTrash, entry.name), join(target, entry.name))
        }
      }
      // Project MCP, agents, hooks and commands now share .mira; never recursively remove its root.
    }
  }
}
