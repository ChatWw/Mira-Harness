/* Scoped directory watching adapted from ZCode's workspace-file-tree data hook.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: grant-owned host subscriptions, shared file previews and lifecycle guards.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { useEffect, useMemo } from 'react'
import type { PilotController, PilotWorkspaceFileEvent } from '../state/pilot-state'
import { fileTreeAncestors } from './file-tree'

export type WorkspaceWatchSnapshot = { revision: number; paths: string[]; error?: string }
export const emptyWorkspaceWatch: WorkspaceWatchSnapshot = { revision: 0, paths: [] }
export const subscribeWithoutWorkspaceWatch = () => () => undefined
export const getEmptyWorkspaceWatch = () => emptyWorkspaceWatch

export function workspaceFileParent(path: string) { return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '' }

export function workspaceWatchPaths(expandedPaths: readonly string[], filePaths: readonly string[], treeOpen: boolean, workspaceOpen: boolean): string[] {
  if (!treeOpen && (!workspaceOpen || !filePaths.length)) return []
  const expanded = new Set(expandedPaths)
  const visible = treeOpen ? expandedPaths.filter(path => fileTreeAncestors(path).every(parent => expanded.has(parent))) : []
  return [...new Set(['', ...visible, ...(workspaceOpen ? filePaths.map(workspaceFileParent) : [])])].sort()
}

// One subscription belongs to one captured session/root; it never drives the chat reducer.
export class WorkspaceWatchDataSource {
  private snapshot: WorkspaceWatchSnapshot = emptyWorkspaceWatch
  private listeners = new Set<() => void>()
  private active = false
  private version = 0
  private paths: string[] = []
  private watchId?: string
  private opening = false
  private earlyEvents: PilotWorkspaceFileEvent[] = []
  private pendingPaths = new Set<string>()
  private timer?: ReturnType<typeof setTimeout>
  private unsubscribe?: () => void

  constructor(private controller: Pick<PilotController, 'supportsWorkspaceWatch' | 'watchFilesFor' | 'unwatchFilesFor' | 'onWorkspaceFilesChanged'>, private sessionId: string) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(snapshot: WorkspaceWatchSnapshot) { this.snapshot = snapshot; this.listeners.forEach(listener => listener()) }
  activate() { this.active = true; this.unsubscribe = this.controller.onWorkspaceFilesChanged(this.handleEvent); if (this.paths.length) this.open() }
  deactivate() { this.active = false; this.unsubscribe?.(); this.unsubscribe = undefined; this.release() }

  setPaths(paths: readonly string[]) {
    const next = [...new Set(paths)].sort()
    if (JSON.stringify(next) === JSON.stringify(this.paths)) return
    this.paths = next
    this.open()
  }
  retry = () => this.open()

  private release() {
    this.version++
    clearTimeout(this.timer)
    this.timer = undefined
    this.pendingPaths.clear()
    this.earlyEvents = []
    this.opening = false
    const watchId = this.watchId
    this.watchId = undefined
    if (watchId) void this.controller.unwatchFilesFor(this.sessionId, watchId).catch(() => undefined)
  }
  private open() {
    this.release()
    this.publish({ ...this.snapshot, paths: [], error: undefined })
    if (!this.active || !this.paths.length || !this.controller.supportsWorkspaceWatch) return
    if (this.paths.length > 256) {
      this.publish({ ...this.snapshot, error: '自动刷新最多支持 256 个目录，请收起部分目录或关闭文件标签后重试；仍可手动刷新。' })
      return
    }
    const version = this.version
    const paths = [...this.paths]
    this.opening = true
    void this.controller.watchFilesFor(this.sessionId, paths).then(({ watchId }) => {
      if (!this.active || version !== this.version) { void this.controller.unwatchFilesFor(this.sessionId, watchId).catch(() => undefined); return }
      this.opening = false
      this.watchId = watchId
      // Re-read once after registration: changes between first read and fs.watch must not be missed.
      this.queue(paths)
      const early = this.earlyEvents
      this.earlyEvents = []
      early.forEach(this.handleEvent)
    }, cause => {
      if (!this.active || version !== this.version) return
      this.opening = false
      this.earlyEvents = []
      this.publish({ ...this.snapshot, error: `文件自动刷新未能启动：${cause instanceof Error ? cause.message : '目录监听失败，请重试或手动刷新。'}` })
    })
  }
  private handleEvent = (event: PilotWorkspaceFileEvent) => {
    if (!this.active || event.sessionId !== this.sessionId) return
    if (this.opening) { if (this.earlyEvents.length < 256) this.earlyEvents.push(event); return }
    // directory is canonical on the host; watch ID binds it to this source's captured root.
    if (!this.watchId || event.watchId !== this.watchId) return
    if (event.error) {
      this.release()
      this.publish({ ...this.snapshot, paths: [], error: `文件自动刷新已停止：${event.error}` })
      return
    }
    this.queue(event.paths.length ? event.paths.filter(path => this.paths.includes(path)) : this.paths)
  }
  private queue(paths: readonly string[]) {
    paths.forEach(path => this.pendingPaths.add(path))
    if (!this.pendingPaths.size || this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.active) return
      const changed = this.pendingPaths.size > 50 ? [...this.paths] : [...this.pendingPaths]
      this.pendingPaths.clear()
      this.publish({ revision: this.snapshot.revision + 1, paths: changed, error: this.snapshot.error })
    }, 300)
  }
}

export function useWorkspaceWatch(controller: PilotController, sessionId: string | undefined, directory: string | undefined, paths: readonly string[]) {
  const source = useMemo(() => new WorkspaceWatchDataSource(controller, sessionId || ''), [controller, sessionId, directory])
  const key = JSON.stringify(paths)
  useEffect(() => { source.activate(); return () => source.deactivate() }, [source])
  useEffect(() => { source.setPaths(directory && sessionId ? paths : []) }, [source, directory, sessionId, key])
  return source
}
