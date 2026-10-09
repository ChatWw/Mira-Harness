import { randomUUID } from 'node:crypto'
import { constants, watch } from 'node:fs'
import { access, lstat, realpath } from 'node:fs/promises'
import type { HarnessEvent, HarnessWorkspaceWatchResult } from '../../src/config/harness'
import { resolveHarnessWorkspacePath } from './harnessWorkspaceFiles'

const MAX_WATCH_PATHS = 256
const MAX_OWNER_WATCHES = 8
const CHANGE_BATCH_MS = 150

interface WatchSender {
  id: number
  isDestroyed(): boolean
  send(channel: string, event: HarnessEvent): void
}
interface DirectoryWatcher {
  close(): void
  on(event: 'error', listener: (error: Error) => void): unknown
}
type WatchDirectory = (directory: string, changed: (filename: string | Buffer | null) => void) => DirectoryWatcher
type DirectoryBinding = { directory: string; identity: string; paths: string[]; handle?: DirectoryWatcher }
type WatchEntry = {
  watchId: string; ownerId: number; grantId: string; sessionId: string; sender: WatchSender
  directory: string; identity: string; resolveWorkspace: () => string | Promise<string>; isAuthorized: () => boolean
  requestedPaths: string[]; bindings: Map<string, DirectoryBinding>; dirty: Set<string>; allDirty: boolean
  flushing: boolean; error?: string; timer?: ReturnType<typeof setTimeout>
}

function safeWatchError(error: unknown) {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'EACCES' || code === 'EPERM') return '没有权限监听文件或目录，请检查系统访问权限后重试。'
  if (code === 'ENOENT' || code === 'ENOTDIR') return '监听目录已不存在，请刷新文件列表后重试。'
  if (code === 'EMFILE' || code === 'ENFILE' || code === 'ENOSPC') return '系统文件监听资源不足，请关闭部分目录后重试。'
  const message = error instanceof Error ? error.message : ''
  if (['路径无效', '路径不能离开工作目录', '目标不是目录', '文件监听授权已失效', '工作目录已变化，请重新打开文件工作区。', '一次最多监听 256 个目录', '当前窗口的文件监听数量已达上限，请关闭部分文件工作区后重试。'].includes(message)) return message
  return '文件变化监听失败，请刷新后重试。'
}

async function directoryIdentity(directory: string) {
  const canonical = await realpath(directory)
  const stat = await lstat(canonical)
  if (!stat.isDirectory()) throw new Error('目标不是目录')
  return { directory: canonical, identity: `${stat.dev}:${stat.ino}` }
}

/** Only the displayed directories are watched. Every notification remains bound to its grant and canonical workspace. */
export class HarnessWorkspaceWatch {
  private readonly entries = new Map<string, WatchEntry>()

  constructor(private readonly watchDirectory: WatchDirectory = (directory, changed) => watch(directory, { recursive: false, persistent: false }, (_event, filename) => changed(filename))) {}

  async start(sender: WatchSender, grantId: string, sessionId: string, paths: string[], resolveWorkspace: () => string | Promise<string>, isAuthorized: () => boolean): Promise<HarnessWorkspaceWatchResult> {
    if (!Array.isArray(paths) || !paths.length || paths.length > MAX_WATCH_PATHS) throw new Error('一次最多监听 256 个目录')
    const requestedPaths = [...new Set(['', ...paths])]
    if (requestedPaths.length > MAX_WATCH_PATHS) throw new Error('一次最多监听 256 个目录')
    if ([...this.entries.values()].filter(entry => entry.ownerId === sender.id).length >= MAX_OWNER_WATCHES) throw new Error('当前窗口的文件监听数量已达上限，请关闭部分文件工作区后重试。')
    const watchId = randomUUID()
    const entry: WatchEntry = { watchId, ownerId: sender.id, grantId, sessionId, sender, directory: '', identity: '', resolveWorkspace, isAuthorized, requestedPaths, bindings: new Map(), dirty: new Set(), allDirty: false, flushing: true }
    // Register before the first await so a revoke can also cancel an opening watch.
    this.entries.set(watchId, entry)
    try {
      this.requireActive(entry)
      const root = await directoryIdentity(await resolveWorkspace())
      this.requireActive(entry)
      entry.directory = root.directory
      entry.identity = root.identity
      await this.reconcile(entry, false)
      await this.validateWorkspace(entry)
      entry.flushing = false
      if (entry.dirty.size || entry.allDirty) this.changed(entry, [], false)
      return { watchId }
    } catch (error) {
      this.close(entry)
      throw new Error(safeWatchError(error))
    }
  }

  stop(ownerId: number, grantId: string, sessionId: string, watchId: string) {
    const entry = this.entries.get(watchId)
    if (!entry) return
    if (entry.ownerId !== ownerId || entry.grantId !== grantId || entry.sessionId !== sessionId) throw new Error('文件监听授权已失效')
    this.close(entry)
  }

  closeForGrant(grantId: string, ownerId: number) {
    for (const entry of this.entries.values()) if (entry.grantId === grantId && entry.ownerId === ownerId) this.close(entry)
  }
  closeForWebContents(ownerId: number) {
    for (const entry of this.entries.values()) if (entry.ownerId === ownerId) this.close(entry)
  }
  closeForSession(sessionId: string) {
    for (const entry of this.entries.values()) if (entry.sessionId === sessionId) this.close(entry)
  }
  closeInvalid() {
    for (const entry of this.entries.values()) if (entry.sender.isDestroyed() || !entry.isAuthorized()) this.close(entry)
  }
  closeAll() { for (const entry of this.entries.values()) this.close(entry) }

  private requireActive(entry: WatchEntry) {
    if (this.entries.get(entry.watchId) !== entry || entry.sender.isDestroyed() || !entry.isAuthorized()) {
      this.close(entry)
      throw new Error('文件监听授权已失效')
    }
  }
  private async validateWorkspace(entry: WatchEntry) {
    this.requireActive(entry)
    const current = await directoryIdentity(await entry.resolveWorkspace())
    this.requireActive(entry)
    if (current.directory !== entry.directory || current.identity !== entry.identity) throw new Error('工作目录已变化，请重新打开文件工作区。')
  }
  private async resolveDirectory(entry: WatchEntry, requestedPath: string, allowMissing: boolean) {
    let path = requestedPath
    for (;;) {
      try {
        const resolved = await resolveHarnessWorkspacePath(entry.directory, path)
        const target = await directoryIdentity(resolved.target)
        await access(target.directory, constants.R_OK | constants.X_OK)
        const verified = await resolveHarnessWorkspacePath(entry.directory, path)
        this.requireActive(entry)
        if (verified.target !== target.directory) throw new Error('工作目录已变化，请重新打开文件工作区。')
        return { ...target, path: resolved.path }
      } catch (error) {
        this.requireActive(entry)
        const code = (error as NodeJS.ErrnoException | undefined)?.code
        if (!allowMissing || !path || !(['ENOENT', 'ENOTDIR'].includes(code || '') || error instanceof Error && error.message === '目标不是目录')) throw error
        // Keep the closest surviving ancestor so a restored subtree can bind again without polling.
        path = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
      }
    }
  }
  private async reconcile(entry: WatchEntry, allowMissing: boolean): Promise<boolean> {
    await this.validateWorkspace(entry)
    const desired = new Map<string, DirectoryBinding>()
    const resolvedPaths: Awaited<ReturnType<HarnessWorkspaceWatch['resolveDirectory']>>[] = []
    let next = 0
    const worker = async () => {
      while (next < entry.requestedPaths.length) {
        this.requireActive(entry)
        const index = next++
        resolvedPaths[index] = await this.resolveDirectory(entry, entry.requestedPaths[index], allowMissing)
      }
    }
    const results = await Promise.allSettled(Array.from({ length: Math.min(8, entry.requestedPaths.length) }, worker))
    const failed = results.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    this.requireActive(entry)
    for (const resolved of resolvedPaths) {
      const previous = desired.get(resolved.directory)
      if (previous) { if (!previous.paths.includes(resolved.path)) previous.paths.push(resolved.path) }
      else desired.set(resolved.directory, { directory: resolved.directory, identity: resolved.identity, paths: [resolved.path] })
    }
    let rebound = false
    for (const binding of entry.bindings.values()) {
      const next = desired.get(binding.directory)
      if (!next || next.identity !== binding.identity) {
        entry.bindings.delete(binding.directory)
        binding.handle?.close()
        rebound = true
      }
    }
    for (const [directory, target] of desired) {
      const current = entry.bindings.get(directory)
      if (current) {
        if (current.paths.length !== target.paths.length || current.paths.some(path => !target.paths.includes(path))) rebound = true
        current.paths = target.paths
        continue
      }
      this.requireActive(entry)
      entry.bindings.set(directory, target)
      const active = () => this.entries.get(entry.watchId) === entry && entry.bindings.get(directory) === target
      target.handle = this.watchDirectory(directory, filename => { if (active()) this.changed(entry, target.paths, filename === null) })
      target.handle.on('error', error => {
        if (!active()) return
        entry.error = safeWatchError(error)
        this.changed(entry, [], true)
      })
      const opened = await this.resolveDirectory(entry, target.paths[0], false)
      this.requireActive(entry)
      if (opened.directory !== directory || opened.identity !== target.identity) throw new Error('工作目录已变化，请重新打开文件工作区。')
      rebound = true
    }
    await this.validateWorkspace(entry)
    return rebound
  }
  private changed(entry: WatchEntry, paths: string[], allDirty: boolean) {
    if (this.entries.get(entry.watchId) !== entry) return
    entry.allDirty ||= allDirty
    for (const path of paths) entry.dirty.add(path)
    if (entry.dirty.size > MAX_WATCH_PATHS) { entry.allDirty = true; entry.dirty.clear() }
    if (!entry.timer && !entry.flushing) {
      entry.timer = setTimeout(() => { entry.timer = undefined; void this.flush(entry) }, CHANGE_BATCH_MS)
      entry.timer.unref()
    }
  }
  private async flush(entry: WatchEntry) {
    if (entry.flushing || this.entries.get(entry.watchId) !== entry) return
    entry.flushing = true
    const paths = entry.allDirty ? [] : [...entry.dirty]
    entry.allDirty = false
    entry.dirty.clear()
    try {
      const rebound = await this.reconcile(entry, true)
      entry.sender.send('harness:event', {
        sessionId: entry.sessionId, eventId: randomUUID(), occurredAt: Date.now(), type: 'workspace-files-changed',
        payload: { grantId: entry.grantId, watchId: entry.watchId, directory: entry.directory, paths: rebound ? [] : paths, ...(entry.error ? { error: entry.error } : {}) },
      })
      if (entry.error) this.close(entry)
    } catch (error) {
      // Revoked/deleted resources cannot publish into a replacement frame or workspace.
      if (this.entries.get(entry.watchId) === entry && !entry.sender.isDestroyed() && entry.isAuthorized()) {
        try {
          entry.sender.send('harness:event', {
            sessionId: entry.sessionId, eventId: randomUUID(), occurredAt: Date.now(), type: 'workspace-files-changed',
            payload: { grantId: entry.grantId, watchId: entry.watchId, directory: entry.directory, paths: [], error: safeWatchError(error) },
          })
        } catch { /* The owning window can disappear after the authorization check. */ }
      }
      this.close(entry)
    } finally {
      entry.flushing = false
      if (entry.dirty.size || entry.allDirty) this.changed(entry, [], false)
    }
  }
  private close(entry: WatchEntry) {
    if (this.entries.get(entry.watchId) !== entry) return
    this.entries.delete(entry.watchId)
    if (entry.timer) clearTimeout(entry.timer)
    entry.bindings.forEach(binding => binding.handle?.close())
    entry.bindings.clear()
    entry.dirty.clear()
  }
}
