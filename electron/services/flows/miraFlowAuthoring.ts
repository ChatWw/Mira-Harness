import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { ModelSelection, PermissionMode } from '../../../src/config/harness'
import type { MiraWorkflowScope, MiraWorkflowWrite } from '../../../src/config/miraWorkflows'
import type { MiraFlowReview } from '../../../src/config/miraFlowReview'
import { parseMiraWorkflowSource } from '../../storage/miraWorkflowDefinitions'
import { readHarnessWorkspaceFile } from '../harnessWorkspaceFiles'

export type MiraFlowAuthoringContext = {
  sender: WebContents; sessionId: string; creatorRunId: string; toolCallId: string; inputId: string
  selection: ModelSelection; permissionMode: PermissionMode; signal: AbortSignal; assertCurrent(): void
}
export type MiraFlowAuthoringSource = { name?: string; script?: string; saved?: { name: string; scope?: MiraWorkflowScope; args?: Record<string, unknown> }; path?: string; args?: Record<string, unknown>; max_concurrency?: number }
export type MiraFlowAuthoringSave = { name: string; scope: MiraWorkflowScope; description: string; whenToUse?: string; args?: MiraWorkflowWrite['meta']['args']; script?: string; script_path?: string }
export interface MiraFlowAuthoringHost {
  authoringCatalog(sessionId: string): unknown[]
  submitFromAgent(context: MiraFlowAuthoringContext, input: MiraFlowAuthoringSource, confirm: (review: MiraFlowReview) => Promise<boolean>): Promise<{ sessionId: string; runId: string; scriptPath?: string }>
  saveFromAgent(context: MiraFlowAuthoringContext, input: MiraFlowAuthoringSave, confirm: (review: MiraFlowReview) => Promise<boolean>): Promise<unknown>
}

export async function readMiraFlowAuthoringSource(directory: string, path: string) {
  const file = await readHarnessWorkspaceFile(directory, path)
  if (Buffer.byteLength(file.content, 'utf8') > 256 * 1024) throw new Error('工作流脚本超过 256 KiB')
  const parsed = parseMiraWorkflowSource(file.content)
  if (parsed.ok === true) return { source: file.content, script: parsed.script, meta: parsed.meta, path: join(directory, file.path) }
  if (parsed.reason !== 'missing_frontmatter') throw new Error(parsed.detail)
  return { source: file.content, script: file.content, path: join(directory, file.path) }
}

export async function writeMiraFlowDraft(directory: string, source: string) {
  const parent = join(directory, '.mira')
  try { if ((await lstat(parent)).isSymbolicLink()) throw new Error('工作流草稿目录不能经过符号链接') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  await mkdir(parent, { recursive: true })
  if (await realpath(parent) !== parent) throw new Error('工作流草稿目录不能经过符号链接')
  const root = join(parent, 'workflow-drafts')
  await mkdir(root, { recursive: true })
  const canonical = await realpath(root)
  if (canonical !== root) throw new Error('工作流草稿目录不能经过符号链接')
  const path = join(root, `mira-flow-${randomUUID()}.dwf.ts`)
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await file.writeFile(source, 'utf8') } finally { await file.close() }
  return relative(directory, path)
}
