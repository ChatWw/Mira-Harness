import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceWatchDataSource, workspaceFileParent, workspaceWatchPaths } from '../apps/harness-react/src/lib/workspace-watch'
import type { PilotWorkspaceFileEvent } from '../apps/harness-react/src/state/pilot-state'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture(sessionId = 'alpha') {
  let emit: ((event: PilotWorkspaceFileEvent) => void) | undefined
  let sequence = 0
  const controller = {
    supportsWorkspaceWatch: true,
    watchFilesFor: vi.fn(async () => ({ watchId: `watch-${++sequence}` })),
    unwatchFilesFor: vi.fn(async () => undefined),
    onWorkspaceFilesChanged: vi.fn((listener: (event: PilotWorkspaceFileEvent) => void) => { emit = listener; return () => { emit = undefined } }),
  }
  const source = new WorkspaceWatchDataSource(controller, sessionId)
  const changed = (paths: string[], watchId = `watch-${sequence}`, error?: string, id = sessionId) => emit?.({ sessionId: id, watchId, directory: '/private/tmp/project', paths, error })
  source.activate()
  return { source, controller, changed }
}

describe('React workspace directory watch ownership', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('watches root, only visible expanded directories, and open preview parents without recursion', () => {
    expect(workspaceWatchPaths(['src', 'src/lib', 'hidden/deep', 'docs'], ['notes.md', 'src/index.ts', 'src/lib/tree.ts'], true, true)).toEqual(['', 'docs', 'src', 'src/lib'])
    expect(workspaceWatchPaths(['src', 'src/lib'], ['src/index.ts'], false, true)).toEqual(['', 'src'])
    expect(workspaceWatchPaths(['src'], ['src/index.ts'], true, false)).toEqual(['', 'src'])
    expect(workspaceWatchPaths(['src'], ['src/index.ts'], false, false)).toEqual([])
    expect(workspaceWatchPaths([], [], false, true)).toEqual([])
    expect(workspaceFileParent('index.ts')).toBe('')
    expect(workspaceFileParent('src/lib/index.ts')).toBe('src/lib')
  })

  it('deduplicates path order and re-reads once after registration to close the first-read gap', async () => {
    const { source, controller } = fixture()
    source.setPaths(['src', '', 'src'])
    await Promise.resolve()
    expect(source.getSnapshot()).toEqual({ revision: 0, paths: [], error: undefined })
    await vi.advanceTimersByTimeAsync(300)
    expect(source.getSnapshot()).toEqual({ revision: 1, paths: ['', 'src'], error: undefined })
    source.setPaths(['', 'src'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(controller.watchFilesFor).toHaveBeenCalledOnce()
    expect(controller.watchFilesFor).toHaveBeenCalledWith('alpha', ['', 'src'])
    expect(source.getSnapshot().revision).toBe(1)
    source.deactivate()
  })

  it('merges changes for 300 ms and excludes unrelated paths, sessions, and old watch IDs', async () => {
    const { source, changed } = fixture()
    source.setPaths(['', 'src', 'docs'])
    await vi.advanceTimersByTimeAsync(300)
    changed(['src']); changed(['docs', 'src']); changed(['unwatched'])
    changed([''], 'old'); changed([''], 'watch-1', undefined, 'beta')
    await vi.advanceTimersByTimeAsync(299)
    expect(source.getSnapshot().revision).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(source.getSnapshot()).toEqual({ revision: 2, paths: ['src', 'docs'], error: undefined })
    source.deactivate()
  })

  it('falls back to watched root and expanded directory refresh for a batch over 50 changes', async () => {
    const { source, changed } = fixture()
    const paths = ['', ...Array.from({ length: 60 }, (_, index) => `folder-${index}`)].sort()
    source.setPaths(paths)
    await vi.advanceTimersByTimeAsync(300)
    changed(paths.slice(1, 52))
    await vi.advanceTimersByTimeAsync(300)
    expect(source.getSnapshot()).toEqual({ revision: 2, paths, error: undefined })
    source.deactivate()
  })

  it('refreshes all subscribed directories when the host cannot identify a changed parent', async () => {
    const { source, changed } = fixture()
    source.setPaths(['', 'src', 'src/lib'])
    await vi.advanceTimersByTimeAsync(300)
    changed([])
    await vi.advanceTimersByTimeAsync(300)
    expect(source.getSnapshot()).toEqual({ revision: 2, paths: ['', 'src', 'src/lib'], error: undefined })
    source.deactivate()
  })

  it('releases a pending registration after unmount and ignores its late result', async () => {
    const { source, controller } = fixture()
    const pending = deferred<{ watchId: string }>()
    controller.watchFilesFor.mockReturnValueOnce(pending.promise)
    source.setPaths([''])
    source.deactivate()
    pending.resolve({ watchId: 'late' }); await Promise.resolve()
    expect(controller.unwatchFilesFor).toHaveBeenCalledWith('alpha', 'late')
    await vi.advanceTimersByTimeAsync(1000)
    expect(source.getSnapshot().revision).toBe(0)
  })

  it('captures events delivered before the registration response, including an immediate host failure', async () => {
    const { source, controller, changed } = fixture()
    const pending = deferred<{ watchId: string }>()
    controller.watchFilesFor.mockReturnValueOnce(pending.promise)
    source.setPaths(['', 'src'])
    changed([], 'early', '目录已经不可读取')
    pending.resolve({ watchId: 'early' }); await Promise.resolve()
    expect(source.getSnapshot().error).toContain('目录已经不可读取')
    expect(controller.unwatchFilesFor).toHaveBeenCalledWith('alpha', 'early')
    await vi.advanceTimersByTimeAsync(1000)
    expect(source.getSnapshot().revision).toBe(0)
    source.deactivate()
  })

  it('closes old watchers when paths change and ignores old root events and responses', async () => {
    const { source, controller, changed } = fixture()
    const old = deferred<{ watchId: string }>()
    controller.watchFilesFor.mockReturnValueOnce(old.promise)
    source.setPaths(['', 'old-root'])
    source.setPaths(['', 'new-root'])
    await vi.advanceTimersByTimeAsync(300)
    old.resolve({ watchId: 'old' }); await Promise.resolve()
    expect(controller.unwatchFilesFor).toHaveBeenCalledWith('alpha', 'old')
    changed([''], 'old')
    await vi.advanceTimersByTimeAsync(300)
    expect(source.getSnapshot()).toEqual({ revision: 1, paths: ['', 'new-root'], error: undefined })
    source.setPaths([])
    expect(controller.unwatchFilesFor).toHaveBeenCalledWith('alpha', 'watch-1')
    changed(['new-root'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(source.getSnapshot().revision).toBe(1)
    source.deactivate()
  })

  it('reports concrete registration and runtime errors, then re-registers on retry without polling', async () => {
    const { source, controller, changed } = fixture()
    controller.watchFilesFor.mockRejectedValueOnce(new Error('无权访问 src'))
    source.setPaths(['', 'src'])
    await Promise.resolve()
    expect(source.getSnapshot().error).toContain('无权访问 src')
    expect(vi.getTimerCount()).toBe(0)
    source.retry(); await vi.advanceTimersByTimeAsync(300)
    expect(source.getSnapshot()).toEqual({ revision: 1, paths: ['', 'src'], error: undefined })
    changed([], 'watch-1', '没有权限监听文件或目录，请检查系统访问权限后重试。')
    expect(source.getSnapshot().error).toBe('文件自动刷新已停止：没有权限监听文件或目录，请检查系统访问权限后重试。')
    expect(controller.unwatchFilesFor).toHaveBeenCalledWith('alpha', 'watch-1')
    source.retry(); await vi.advanceTimersByTimeAsync(300)
    expect(source.getSnapshot()).toEqual({ revision: 2, paths: ['', 'src'], error: undefined })
    source.deactivate()
  })

  it('supports React strict-mode deactivate/reactivate without leaking or disabling subscriptions', async () => {
    const { source, controller } = fixture()
    source.setPaths([''])
    await vi.advanceTimersByTimeAsync(300)
    source.deactivate(); source.activate(); source.setPaths([''])
    await vi.advanceTimersByTimeAsync(300)
    expect(controller.watchFilesFor).toHaveBeenCalledTimes(2)
    expect(controller.unwatchFilesFor).toHaveBeenCalledWith('alpha', 'watch-1')
    expect(source.getSnapshot().revision).toBe(2)
    source.deactivate()
    expect(controller.unwatchFilesFor).toHaveBeenCalledWith('alpha', 'watch-2')
  })

  it('does not call older fixture hosts and gives an actionable limit rather than silently losing directories', async () => {
    const { source, controller } = fixture()
    controller.supportsWorkspaceWatch = false
    source.setPaths([''])
    expect(controller.watchFilesFor).not.toHaveBeenCalled()
    expect(source.getSnapshot().error).toBeUndefined()
    controller.supportsWorkspaceWatch = true
    source.setPaths(Array.from({ length: 257 }, (_, index) => `folder-${index}`))
    expect(source.getSnapshot().error).toContain('256')
    expect(controller.watchFilesFor).not.toHaveBeenCalled()
    source.setPaths([''])
    await vi.advanceTimersByTimeAsync(300)
    expect(source.getSnapshot().error).toBeUndefined()
    expect(controller.watchFilesFor).toHaveBeenCalledOnce()
    source.deactivate()
  })
})
