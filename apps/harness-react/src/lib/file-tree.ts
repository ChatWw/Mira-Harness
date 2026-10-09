/* File tree behavior adapted from ZCode's workspace-file-tree implementation.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: relative-path data, complete tree navigation and session-scoped loading.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import type { HarnessWorkspaceFileEntry } from '../../../../src/config/harness'

export type FileTreeDirectory = { entries?: HarnessWorkspaceFileEntry[]; loading: boolean; error?: string }
export type FileTreeSnapshot = { directories: Record<string, FileTreeDirectory>; refreshing: boolean }
export type FileTreeRow = HarnessWorkspaceFileEntry & {
  parent: string; depth: number; expanded: boolean; loading: boolean; error?: string; empty: boolean; position: number; siblings: number
}

export function flattenFileTree(directories: FileTreeSnapshot['directories'], expandedPaths: readonly string[]): FileTreeRow[] {
  const expanded = new Set(expandedPaths)
  const rows: FileTreeRow[] = []
  const visit = (parent: string, depth: number) => {
    const entries = [...(directories[parent]?.entries || [])].sort((left, right) => Number(right.type === 'directory') - Number(left.type === 'directory') || left.name.localeCompare(right.name))
    entries.forEach((entry, index) => {
      const state = directories[entry.path]
      const isExpanded = entry.type === 'directory' && expanded.has(entry.path)
      rows.push({ ...entry, parent, depth, expanded: isExpanded, loading: Boolean(state?.loading), error: state?.error, empty: state?.entries?.length === 0, position: index + 1, siblings: entries.length })
      if (isExpanded) visit(entry.path, depth + 1)
    })
  }
  visit('', 0)
  return rows
}

export function fileTreeAncestors(path: string): string[] {
  const parts = path.split('/')
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'))
}

export function fileTreeAbsolutePath(directory: string, path: string): string {
  if (!path) return directory
  const separator = directory.includes('\\') ? '\\' : '/'
  return `${directory.replace(/[\\/]+$/, '')}${separator}${path.replace(/\//g, separator)}`
}

export function fileTreeFocusPath(rows: FileTreeRow[], focusedPath?: string, selectedPath?: string): string | undefined {
  const visible = new Set(rows.map(row => row.path))
  let path = focusedPath
  while (path) {
    if (visible.has(path)) return path
    path = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : undefined
  }
  return selectedPath && visible.has(selectedPath) ? selectedPath : rows[0]?.path
}

export type FileTreeKeyAction = { kind: 'focus' | 'expand' | 'collapse' | 'open' | 'reload' | 'menu'; path: string } | { kind: 'none' }

export function fileTreeKeyAction(rows: FileTreeRow[], path: string, key: string, shiftKey = false): FileTreeKeyAction {
  const index = rows.findIndex(row => row.path === path)
  const row = rows[index]
  if (!row) return { kind: 'none' }
  if (key === 'ContextMenu' || key === 'F10' && shiftKey) return { kind: 'menu', path }
  if (key === 'Home' || key === 'End' || key === 'ArrowUp' || key === 'ArrowDown') {
    const next = key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (key === 'ArrowUp' ? -1 : 1)))
    return { kind: 'focus', path: rows[next].path }
  }
  if (key === 'ArrowLeft') {
    if (row.expanded) return { kind: 'collapse', path }
    return row.parent ? { kind: 'focus', path: row.parent } : { kind: 'none' }
  }
  if (key === 'ArrowRight' && row.type === 'directory') {
    if (!row.expanded) return { kind: 'expand', path }
    if (row.error) return { kind: 'reload', path }
    if (rows[index + 1]?.parent === path) return { kind: 'focus', path: rows[index + 1].path }
  }
  if (key === 'Enter' || key === ' ') return { kind: row.type === 'file' ? 'open' : row.error && row.expanded ? 'reload' : row.expanded ? 'collapse' : 'expand', path }
  return { kind: 'none' }
}

export class FileTreeDataSource {
  private snapshot: FileTreeSnapshot = { directories: {}, refreshing: false }
  private listeners = new Set<() => void>()
  private versions = new Map<string, number>()
  private epoch = 0
  private active = false
  private changedPaths = new Set<string>()
  private changedRefresh?: Promise<void>
  private reading = 0
  private readQueue: Array<{ path: string; isCurrent: () => boolean; resolve: (entries: HarnessWorkspaceFileEntry[] | undefined) => void; reject: (cause: unknown) => void }> = []

  constructor(private readDirectory: (path: string) => Promise<HarnessWorkspaceFileEntry[]>) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  guard() { const epoch = this.epoch; return () => this.active && epoch === this.epoch }
  activate() { this.active = true; this.epoch++; this.changedPaths.clear(); this.changedRefresh = undefined; this.discardQueuedReads(); this.publish({ directories: {}, refreshing: false }) }
  deactivate() { this.active = false; this.epoch++; this.changedPaths.clear(); this.discardQueuedReads() }
  private publish(snapshot: FileTreeSnapshot) { this.snapshot = snapshot; this.listeners.forEach(listener => listener()) }
  private updateDirectory(path: string, state: FileTreeDirectory) {
    this.publish({ ...this.snapshot, directories: { ...this.snapshot.directories, [path]: state } })
  }

  private discardQueuedReads() {
    this.readQueue = this.readQueue.filter(request => {
      if (request.isCurrent()) return true
      request.resolve(undefined)
      return false
    })
  }
  private drainReads() {
    this.discardQueuedReads()
    while (this.reading < 2 && this.readQueue.length) {
      const request = this.readQueue.shift()!
      this.reading++
      try {
        void this.readDirectory(request.path).then(request.resolve, request.reject).finally(() => { this.reading--; this.drainReads() })
      } catch (cause) { this.reading--; request.reject(cause) }
    }
  }
  private queuedRead(path: string, isCurrent: () => boolean): Promise<HarnessWorkspaceFileEntry[] | undefined> {
    return new Promise((resolve, reject) => {
      this.readQueue.push({ path, isCurrent, resolve, reject })
      this.drainReads()
    })
  }

  async loadDirectory(path: string, force = false): Promise<void> {
    const current = this.snapshot.directories[path]
    if (!this.active || !force && (current?.loading || current?.entries !== undefined)) return
    const version = (this.versions.get(path) || 0) + 1
    this.versions.set(path, version)
    const isCurrentEpoch = this.guard()
    const isCurrent = () => isCurrentEpoch() && this.versions.get(path) === version
    this.updateDirectory(path, { entries: current?.entries, loading: true })
    try {
      const entries = await this.queuedRead(path, isCurrent)
      if (entries !== undefined && isCurrent()) this.updateDirectory(path, { entries, loading: false })
    } catch (cause) {
      if (isCurrent()) this.updateDirectory(path, { entries: current?.entries, loading: false, error: cause instanceof Error ? cause.message : '文件列表加载失败，请重试' })
    }
  }

  async refresh(expandedPaths: readonly string[]): Promise<void> {
    if (!this.active || this.snapshot.refreshing) return
    const isCurrent = this.guard()
    const queue = [...new Set(['', ...Object.keys(this.snapshot.directories).filter(path => this.snapshot.directories[path].entries !== undefined), ...expandedPaths])]
    this.publish({ ...this.snapshot, refreshing: true })
    const worker = async () => {
      while (queue.length && isCurrent()) await this.loadDirectory(queue.shift()!, true)
    }
    await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker))
    if (isCurrent()) this.publish({ ...this.snapshot, refreshing: false })
  }

  async refreshChanged(paths: readonly string[]): Promise<void> {
    if (!this.active) return
    paths.filter(path => this.snapshot.directories[path] !== undefined).forEach(path => this.changedPaths.add(path))
    if (this.changedRefresh) return this.changedRefresh
    const isCurrent = this.guard()
    const worker = async () => {
      while (this.changedPaths.size && isCurrent()) {
        const path = this.changedPaths.values().next().value!
        this.changedPaths.delete(path)
        await this.loadDirectory(path, true)
      }
    }
    const refresh = Promise.all(Array.from({ length: Math.min(2, this.changedPaths.size) }, worker)).then(() => undefined)
    this.changedRefresh = refresh
    try { await refresh } finally { if (this.changedRefresh === refresh) this.changedRefresh = undefined }
  }

  async revealPath(path: string, directory = false): Promise<void> {
    const isCurrent = this.guard()
    // Search can discover paths created after cached ancestor listings were read.
    for (const parent of ['', ...fileTreeAncestors(path), ...(directory ? [path] : [])]) {
      if (!isCurrent()) return
      await this.loadDirectory(parent, true)
      if (!isCurrent() || this.snapshot.directories[parent]?.error) return
    }
  }
}
