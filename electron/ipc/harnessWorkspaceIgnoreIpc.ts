import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { HARNESS_SEARCH_IGNORE_ERRORS, type HarnessWorkspaceSearchIgnoreTarget } from '../../src/config/harness'
import type { PlatformDatabase } from '../storage/database'
import { readHarnessWorkspaceSearchIgnore, transformHarnessWorkspaceSearchIgnore, writeHarnessWorkspaceSearchIgnore } from '../services/harnessWorkspaceIgnore'

const safeErrors = new Set<string>(HARNESS_SEARCH_IGNORE_ERRORS)

function parseTarget(value: unknown): HarnessWorkspaceSearchIgnoreTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工作区无效')
  const target = value as Record<string, unknown>
  if ((target.kind !== 'project' && target.kind !== 'session') || typeof target.id !== 'string'
    || !target.id.trim() || target.id.length > 256 || /[\u0000-\u001f\u007f]/.test(target.id)) throw new Error('工作区无效')
  return { kind: target.kind, id: target.id }
}

function validateContent(content: unknown): asserts content is string {
  if (typeof content !== 'string' || content.includes('\0')) throw new Error('规则内容无效')
  if (Buffer.byteLength(content, 'utf8') > 256 * 1024) throw new Error('规则内容不能超过 256 KiB')
}

export function registerHarnessWorkspaceIgnoreIpcHandlers(database: PlatformDatabase) {
  function resolveDirectory(target: HarnessWorkspaceSearchIgnoreTarget) {
    if (target.kind === 'project') return database.harness.getProject(target.id).directory
    const session = database.harness.getSession(target.id)
    return session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
  }

  async function run<T>(event: IpcMainInvokeEvent, value: unknown, action: (directory: string, assertAuthorized: () => void) => Promise<T>) {
    if (!event.senderFrame || event.senderFrame.parent !== null) throw new Error('搜索规则仅可在平台设置中管理')
    const target = parseTarget(value)
    try {
      const directory = resolveDirectory(target)
      if (!directory) throw new Error('该工作区没有可用目录')
      const assertAuthorized = () => {
        if (event.sender.isDestroyed() || !event.senderFrame || event.senderFrame.parent !== null
          || resolveDirectory(target) !== directory) throw new Error('工作目录已变化，请重新加载规则')
      }
      assertAuthorized()
      const result = await action(directory, assertAuthorized)
      assertAuthorized()
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      throw new Error(safeErrors.has(message) ? message : '搜索规则操作失败，请检查目录访问权限后重试')
    }
  }

  ipcMain.handle('harness:read-search-ignore', (event, target: unknown) => run(event, target, directory => readHarnessWorkspaceSearchIgnore(directory)))
  ipcMain.handle('harness:transform-search-ignore', (event, target: unknown, content: unknown, transform: unknown) => {
    validateContent(content)
    if (transform !== 'sync-gitignore' && transform !== 'reset-defaults') throw new Error('规则操作无效')
    return run(event, target, directory => transformHarnessWorkspaceSearchIgnore(directory, content, transform))
  })
  ipcMain.handle('harness:write-search-ignore', (event, target: unknown, content: unknown, revision: unknown) => {
    validateContent(content)
    if (typeof revision !== 'string' || !revision || revision.length > 256 || /[\u0000-\u001f\u007f]/.test(revision)) throw new Error('规则版本无效')
    return run(event, target, (directory, assertAuthorized) => writeHarnessWorkspaceSearchIgnore(directory, content, revision, assertAuthorized))
  })
}
