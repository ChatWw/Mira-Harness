/* Git decorations adapted from ZCode's workspace-file-tree model and statusStyles.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: bounded session-scoped readers, exact ignored cache and stale-result suppression.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import type { HarnessWorkspaceFileEntry, HarnessWorkspaceGitSnapshot, HarnessWorkspaceGitStatus } from '../../../../src/config/harness'
import type { FileTreeRow, FileTreeSnapshot } from './file-tree'

const filePriority: Record<HarnessWorkspaceGitStatus, number> = { ignored: 0, modified: 1, renamed: 2, deleted: 3, added: 4, untracked: 5 }
const directoryPriority: Record<HarnessWorkspaceGitStatus, number> = { added: 1, deleted: 1, renamed: 1, untracked: 1, modified: 2, ignored: 3 }
const indicators: Partial<Record<HarnessWorkspaceGitStatus, string>> = { modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: 'U' }
export const fileGitStatusLabel: Record<HarnessWorkspaceGitStatus, string> = { modified: '已修改', added: '已新增', deleted: '已删除', renamed: '已重命名', untracked: '未跟踪', ignored: '已忽略' }

export type FileGitIndex = { direct: ReadonlyMap<string, HarnessWorkspaceGitStatus>; directories: ReadonlyMap<string, HarnessWorkspaceGitStatus[]> }
export type FileGitSnapshot = { available: boolean; loading: boolean; error?: string; index: FileGitIndex }
const emptySnapshot = (): FileGitSnapshot => ({ available: false, loading: false, index: buildFileGitIndex([]) })
const pathKey = (path: string) => path.replace(/\/+$/, '')

export function buildFileGitIndex(entries: HarnessWorkspaceGitSnapshot['entries'], ignored: ReadonlySet<string> = new Set()): FileGitIndex {
  const direct = new Map<string, HarnessWorkspaceGitStatus>()
  for (const entry of entries) {
    const path = pathKey(entry.path), previous = direct.get(path)
    if (!previous || filePriority[entry.status] > filePriority[previous]) direct.set(path, entry.status)
  }
  const descendants = new Map<string, Set<HarnessWorkspaceGitStatus>>()
  for (const [path, status] of direct) {
    let parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    while (parent) {
      if (!descendants.has(parent)) descendants.set(parent, new Set())
      descendants.get(parent)!.add(status)
      if (!parent.includes('/')) break
      parent = parent.slice(0, parent.lastIndexOf('/'))
    }
  }
  const directories = new Map([...descendants].map(([path, statuses]) => [path, [...statuses].sort((left, right) => directoryPriority[right] - directoryPriority[left])]))
  // Ignored paths decorate only the exact row, not its ancestors.
  for (const path of ignored) if (!direct.has(pathKey(path))) direct.set(pathKey(path), 'ignored')
  return { direct, directories }
}

export function fileGitDecoration(index: FileGitIndex, path: string, type: 'file' | 'directory') {
  const direct = index.direct.get(pathKey(path))
  const statuses = type === 'directory' ? index.directories.get(pathKey(path)) || [] : []
  return {
    status: direct || statuses[0], statuses, indicator: direct && indicators[direct],
    label: direct ? fileGitStatusLabel[direct] : statuses.length ? statuses.map(status => fileGitStatusLabel[status]).join('、') : undefined,
  }
}

export function fileGitTreeDirectories(directories: FileTreeSnapshot['directories'], index: FileGitIndex): FileTreeSnapshot['directories'] {
  const additions = new Map<string, HarnessWorkspaceFileEntry[]>()
  const existing = new Map<string, Set<string>>()
  for (const [path, status] of index.direct) {
    if (status !== 'deleted') continue
    const separator = path.lastIndexOf('/')
    const parent = separator === -1 ? '' : path.slice(0, separator)
    const directory = directories[parent]
    if (!directory?.entries) continue
    if (!existing.has(parent)) existing.set(parent, new Set(directory.entries.map(entry => entry.path)))
    const paths = existing.get(parent)!
    if (paths.has(path)) continue
    paths.add(path)
    if (!additions.has(parent)) additions.set(parent, [])
    additions.get(parent)!.push({ name: path.slice(separator + 1), path, type: 'file' })
  }
  if (!additions.size) return directories
  // Copy each touched directory once, including large staged deletion sets.
  const result = { ...directories }
  for (const [parent, entries] of additions) result[parent] = { ...directories[parent], entries: [...directories[parent].entries!, ...entries] }
  return result
}

export function fileGitChangedRows(rows: FileTreeRow[], index: FileGitIndex, searching = false): FileTreeRow[] {
  const visible = rows.filter(row => {
    const status = index.direct.get(pathKey(row.path))
    return Boolean(status && status !== 'ignored' || !searching && row.type === 'directory' && index.directories.get(pathKey(row.path))?.length)
  })
  const sizes = new Map<string, number>()
  const positions = new Map<string, number>()
  visible.forEach(row => sizes.set(row.parent, (sizes.get(row.parent) || 0) + 1))
  return visible.map(row => {
    const position = (positions.get(row.parent) || 0) + 1
    positions.set(row.parent, position)
    return { ...row, position, siblings: sizes.get(row.parent)! }
  })
}

export class FileGitDataSource {
  private snapshot = emptySnapshot()
  private listeners = new Set<() => void>()
  private active = false
  private version = 0
  private statusRequested = false
  private statusReading?: Promise<void>
  private ignoredReading = false
  private entries: HarnessWorkspaceGitSnapshot['entries'] = []
  private visiblePaths = new Set<string>()
  private checkedPaths = new Set<string>()
  private ignoredPaths = new Set<string>()

  constructor(private readStatus?: () => Promise<HarnessWorkspaceGitSnapshot>, private readIgnored?: (paths: string[]) => Promise<string[]>) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(snapshot: FileGitSnapshot) { this.snapshot = snapshot; this.listeners.forEach(listener => listener()) }
  activate() {
    this.active = true; this.version++; this.statusRequested = false
    this.entries = []; this.visiblePaths.clear(); this.checkedPaths.clear(); this.ignoredPaths.clear()
    this.publish(emptySnapshot())
  }
  deactivate() { this.active = false; this.version++; this.statusRequested = false; this.visiblePaths.clear() }
  setVisiblePaths(paths: readonly string[]) {
    this.visiblePaths = new Set(paths.map(pathKey).filter(Boolean))
    this.drainIgnored()
  }
  refresh(): Promise<void> {
    if (!this.active || !this.readStatus || !this.readIgnored) return Promise.resolve()
    this.version++; this.statusRequested = true
    this.entries = []; this.checkedPaths.clear(); this.ignoredPaths.clear()
    // Keep mounted rows and their menus stable until the refreshed status is known.
    this.publish({ ...this.snapshot, loading: true, error: undefined })
    return this.statusReading || this.startStatus()
  }
  private startStatus(): Promise<void> {
    const reading = this.drainStatus().finally(() => {
      if (this.statusReading === reading) this.statusReading = undefined
      if (this.active && this.statusRequested) return this.startStatus()
    })
    this.statusReading = reading
    return reading
  }
  private async drainStatus() {
    while (this.active && this.statusRequested) {
      this.statusRequested = false
      const version = this.version
      try {
        const result = await this.readStatus!()
        if (!this.active || version !== this.version) continue
        this.entries = result.available ? result.entries : []
        this.publish({ available: result.available, loading: false, index: buildFileGitIndex(this.entries) })
        this.drainIgnored()
      } catch (cause) { if (this.active && version === this.version) this.fail(cause) }
    }
  }
  private fail(cause: unknown) {
    this.entries = []; this.checkedPaths.clear(); this.ignoredPaths.clear()
    this.publish({ ...emptySnapshot(), error: cause instanceof Error ? `Git 状态读取失败：${cause.message}` : 'Git 状态读取失败，请重试' })
  }
  private drainIgnored() {
    if (!this.active || this.ignoredReading || !this.snapshot.available || this.snapshot.loading || this.snapshot.error || !this.readIgnored) return
    const batch = [...this.visiblePaths].filter(path => !this.checkedPaths.has(path)).slice(0, 512)
    if (!batch.length) return
    const version = this.version
    this.ignoredReading = true
    void (async () => {
      try {
        const result = new Set((await this.readIgnored!(batch)).map(pathKey))
        if (!this.active || version !== this.version) return
        batch.forEach(path => { this.checkedPaths.add(path); if (result.has(path)) this.ignoredPaths.add(path) })
        this.publish({ ...this.snapshot, index: buildFileGitIndex(this.entries, this.ignoredPaths) })
      } catch (cause) { if (this.active && version === this.version) this.fail(cause) }
      finally { this.ignoredReading = false; this.drainIgnored() }
    })()
  }
}
