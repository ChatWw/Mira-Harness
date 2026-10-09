import { describe, expect, it, vi } from 'vitest'
import { buildFileGitIndex, fileGitChangedRows, fileGitDecoration, FileGitDataSource, fileGitTreeDirectories } from '../apps/harness-react/src/lib/file-git'
import { flattenFileTree, type FileTreeSnapshot } from '../apps/harness-react/src/lib/file-tree'
import { fileSearchRows } from '../apps/harness-react/src/lib/file-search'
import type { HarnessWorkspaceGitSnapshot } from '../src/config/harness'

const repository = (entries: HarnessWorkspaceGitSnapshot['entries'] = []): HarnessWorkspaceGitSnapshot => ({ available: true, entries })
const settle = async () => { for (let index = 0; index < 24; index++) await Promise.resolve() }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('Mira file Git decorations', () => {
  it('keeps exact Unicode, whitespace and case-sensitive paths and all five status letters', () => {
    const entries: HarnessWorkspaceGitSnapshot['entries'] = [
      { path: '资料/写作.md', status: 'modified' }, { path: 'new file.ts', status: 'added' },
      { path: 'old.ts', status: 'deleted' }, { path: 'RENAMED.ts', status: 'renamed' }, { path: 'new.ts', status: 'untracked' },
    ]
    const index = buildFileGitIndex(entries)
    expect(entries.map(entry => fileGitDecoration(index, entry.path, 'file').indicator)).toEqual(['M', 'A', 'D', 'R', 'U'])
    expect(fileGitDecoration(index, '资料/写作.md', 'file').label).toBe('已修改')
    expect(fileGitDecoration(index, 'renamed.ts', 'file').status).toBeUndefined()
    expect(fileGitDecoration(index, '资料/写作.md/child', 'file').status).toBeUndefined()
  })

  it('aggregates unloaded/deleted descendants without inventing file rows, following the upstream descending priority and insertion-order ties', () => {
    const index = buildFileGitIndex([
      { path: 'src/modified.ts', status: 'modified' }, { path: 'src/deleted.ts', status: 'deleted' },
      { path: 'src/deep/new.ts', status: 'added' }, { path: 'src/renamed.ts', status: 'renamed' },
      { path: 'src/untracked.ts', status: 'untracked' }, { path: 'src-other/file.ts', status: 'modified' },
    ], new Set(['src/cache/ignored.tmp']))
    expect(fileGitDecoration(index, 'src', 'directory')).toMatchObject({ status: 'modified', statuses: ['modified', 'deleted', 'added', 'renamed', 'untracked'], label: '已修改、已删除、已新增、已重命名、未跟踪' })
    expect(fileGitDecoration(index, 'src/cache', 'directory').status).toBeUndefined()
    expect(fileGitDecoration(index, 'src/deep', 'directory').status).toBe('added')
    expect(fileGitDecoration(index, 'sr', 'directory').status).toBeUndefined()
    expect(fileGitDecoration(index, 'src', 'file').status).toBeUndefined()
  })

  it('uses direct directory status before descendant priority, and never inherits ignored/untracked parent status', () => {
    const index = buildFileGitIndex([{ path: 'src', status: 'modified' }, { path: 'src/new.ts', status: 'added' }, { path: 'nested-repo', status: 'untracked' }], new Set(['cache', 'cache/ignored.tmp']))
    expect(fileGitDecoration(index, 'src', 'directory')).toMatchObject({ status: 'modified', statuses: ['added'], label: '已修改', indicator: 'M' })
    expect(fileGitDecoration(index, 'nested-repo/file.ts', 'file').status).toBeUndefined()
    expect(fileGitDecoration(index, 'cache', 'directory')).toMatchObject({ status: 'ignored' })
    expect(fileGitDecoration(index, 'cache/kept.ts', 'file').status).toBeUndefined()
    expect(fileGitDecoration(index, 'cache/ignored.tmp', 'file')).toMatchObject({ status: 'ignored', label: '已忽略' })
    expect(fileGitDecoration(index, 'cache/ignored.tmp', 'file').indicator).toBeUndefined()
  })

  it('matches the upstream per-file merge priority and preserves literal backslashes/newlines in filesystem paths', () => {
    const index = buildFileGitIndex([
      { path: 'both.ts', status: 'modified' }, { path: 'both.ts', status: 'added' }, { path: 'both.ts', status: 'deleted' },
      { path: 'both.ts', status: 'untracked' }, { path: 'both.ts', status: 'renamed' },
      { path: 'literal\\name\nfile.ts', status: 'modified' },
    ])
    expect(fileGitDecoration(index, 'both.ts', 'file').indicator).toBe('U')
    expect(fileGitDecoration(index, 'literal\\name\nfile.ts', 'file').indicator).toBe('M')
    expect(fileGitDecoration(index, 'literal/name\nfile.ts', 'file').status).toBeUndefined()
  })

  it('keeps ignored descendants out of ancestor dots and lets tracked direct changes override an ignored lookup', () => {
    const index = buildFileGitIndex([{ path: 'src/kept.ts', status: 'modified' }], new Set(['src/ignored.tmp', 'src/kept.ts', 'cache/deep/ignored.tmp']))
    expect(fileGitDecoration(index, 'src', 'directory')).toMatchObject({ status: 'modified', statuses: ['modified'] })
    expect(fileGitDecoration(index, 'cache', 'directory').status).toBeUndefined()
    expect(fileGitDecoration(index, 'cache/deep', 'directory').status).toBeUndefined()
    expect(fileGitDecoration(index, 'src/kept.ts', 'file').indicator).toBe('M')
  })
})

describe('Mira file Git tree overlays and changed rows', () => {
  it('adds deleted files only to loaded immediate parents, without duplicating filesystem rows or inventing missing ancestors', () => {
    const directories: FileTreeSnapshot['directories'] = {
      '': { entries: [{ path: 'src', name: 'src', type: 'directory' }, { path: 'existing.ts', name: 'existing.ts', type: 'file' }], loading: false },
      src: { entries: [], loading: false },
      pending: { loading: true },
    }
    const before = structuredClone(directories)
    const index = buildFileGitIndex([
      { path: 'existing.ts', status: 'deleted' }, { path: 'root-gone.ts', status: 'deleted' }, { path: 'src/gone.ts', status: 'deleted' },
      { path: 'src/missing/deep.ts', status: 'deleted' }, { path: 'pending/gone.ts', status: 'deleted' }, { path: 'absent/gone.ts', status: 'deleted' },
      { path: 'src/added.ts', status: 'added' }, { path: 'src/modified.ts', status: 'modified' },
    ])
    const overlaid = fileGitTreeDirectories(directories, index)
    expect(overlaid[''].entries!.map(entry => entry.path)).toEqual(['src', 'existing.ts', 'root-gone.ts'])
    expect(overlaid.src.entries).toEqual([{ path: 'src/gone.ts', name: 'gone.ts', type: 'file' }])
    expect(Object.keys(overlaid)).toEqual(['', 'src', 'pending'])
    expect(overlaid.pending).toBe(directories.pending)
    expect(directories).toEqual(before)
    expect(fileGitTreeDirectories(overlaid, index)).toBe(overlaid)
  })

  it('preserves literal deleted basenames and directory refresh state, leaving untouched snapshots reference-identical', () => {
    const directories: FileTreeSnapshot['directories'] = {
      '': { entries: [], loading: true, error: 'previous read failed' },
      '资料': { entries: [], loading: false },
    }
    const path = '资料/ 空格\\名称\n.md'
    const index = buildFileGitIndex([{ path, status: 'deleted' }, { path: 'gone.ts', status: 'deleted' }])
    const overlaid = fileGitTreeDirectories(directories, index)
    expect(overlaid['资料'].entries).toEqual([{ path, name: ' 空格\\名称\n.md', type: 'file' }])
    expect(overlaid['']).toMatchObject({ loading: true, error: 'previous read failed' })
    expect(overlaid[''].entries).toEqual([{ path: 'gone.ts', name: 'gone.ts', type: 'file' }])
    expect(fileGitTreeDirectories(directories, buildFileGitIndex([{ path: 'new.ts', status: 'added' }]))).toBe(directories)
  })

  it('keeps changed files, directly changed directories and descendant ancestors while excluding ignored and clean rows', () => {
    const directories: FileTreeSnapshot['directories'] = {
      '': { loading: false, entries: [
        { path: 'src', name: 'src', type: 'directory' }, { path: 'direct', name: 'direct', type: 'directory' },
        { path: 'cache', name: 'cache', type: 'directory' }, { path: 'clean', name: 'clean', type: 'directory' },
        { path: 'modified.ts', name: 'modified.ts', type: 'file' }, { path: 'ignored.tmp', name: 'ignored.tmp', type: 'file' },
      ] },
      src: { loading: false, entries: [
        { path: 'src/added.ts', name: 'added.ts', type: 'file' }, { path: 'src/clean.ts', name: 'clean.ts', type: 'file' },
        { path: 'src/ignored.tmp', name: 'ignored.tmp', type: 'file' }, { path: 'src/renamed.ts', name: 'renamed.ts', type: 'file' },
        { path: 'src/untracked.ts', name: 'untracked.ts', type: 'file' },
      ] },
    }
    const index = buildFileGitIndex([
      { path: 'direct', status: 'modified' }, { path: 'modified.ts', status: 'modified' }, { path: 'src/added.ts', status: 'added' },
      { path: 'src/deleted.ts', status: 'deleted' }, { path: 'src/renamed.ts', status: 'renamed' }, { path: 'src/untracked.ts', status: 'untracked' },
    ], new Set(['cache', 'cache/ignored.tmp', 'ignored.tmp', 'src/ignored.tmp']))
    const rows = flattenFileTree(fileGitTreeDirectories(directories, index), ['src'])
    const before = structuredClone(rows)
    const filtered = fileGitChangedRows(rows, index)
    expect(filtered.map(row => row.path)).toEqual(['direct', 'src', 'src/added.ts', 'src/deleted.ts', 'src/renamed.ts', 'src/untracked.ts', 'modified.ts'])
    expect(filtered.filter(row => row.parent === '').map(row => [row.position, row.siblings])).toEqual([[1, 3], [2, 3], [3, 3]])
    expect(filtered.filter(row => row.parent === 'src').map(row => [row.position, row.siblings])).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]])
    expect(filtered.find(row => row.path === 'src')).toMatchObject({ depth: 0, expanded: true })
    expect(filtered.find(row => row.path === 'src/deleted.ts')).toMatchObject({ depth: 1, parent: 'src', type: 'file' })
    expect(rows).toEqual(before)
  })

  it('filters search using exact nonignored direct changes without ancestor summaries or invented deleted results', () => {
    const index = buildFileGitIndex([
      { path: 'src/modified.ts', status: 'modified' }, { path: 'src/gone.ts', status: 'deleted' },
      { path: 'direct', status: 'untracked' }, { path: 'cache/changed.ts', status: 'added' },
    ], new Set(['cache', 'ignored.tmp']))
    const rows = fileSearchRows([
      { path: 'src', name: 'src', type: 'directory' }, { path: 'src/modified.ts', name: 'modified.ts', type: 'file' },
      { path: 'src/clean.ts', name: 'clean.ts', type: 'file' }, { path: 'direct', name: 'direct', type: 'directory' },
      { path: 'cache', name: 'cache', type: 'directory' }, { path: 'ignored.tmp', name: 'ignored.tmp', type: 'file' },
    ])
    const before = structuredClone(rows)
    const filtered = fileGitChangedRows(rows, index, true)
    expect(filtered.map(row => row.path)).toEqual(['src/modified.ts', 'direct'])
    expect(filtered.map(row => [row.position, row.siblings, row.depth])).toEqual([[1, 2, 0], [2, 2, 0]])
    expect(rows).toEqual(before)
    expect(fileGitChangedRows(rows, buildFileGitIndex([]), true)).toEqual([])
  })
})

describe('Mira file Git data source', () => {
  it('does not call unsupported hosts or query ignored files in a nonrepository', async () => {
    const unavailable = new FileGitDataSource()
    unavailable.activate(); await unavailable.refresh(); unavailable.setVisiblePaths(['one.ts']); await settle()
    expect(unavailable.getSnapshot()).toMatchObject({ available: false, loading: false })
    expect(unavailable.getSnapshot().error).toBeUndefined()
    const ignored = vi.fn(async () => [] as string[])
    const read = vi.fn(async () => ({ available: false, entries: [] }))
    const source = new FileGitDataSource(read, ignored)
    source.activate(); source.setVisiblePaths(['one.ts']); await source.refresh(); await settle()
    expect(read).toHaveBeenCalledOnce(); expect(ignored).not.toHaveBeenCalled()
    expect(source.getSnapshot()).toMatchObject({ available: false, loading: false })
    expect(source.getSnapshot().error).toBeUndefined()
  })

  it('coalesces status refreshes into one latest follow-up, retaining a single actual read in flight', async () => {
    const first = deferred<HarnessWorkspaceGitSnapshot>(), second = deferred<HarnessWorkspaceGitSnapshot>()
    const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const source = new FileGitDataSource(read, vi.fn(async () => []))
    source.activate()
    const initial = source.refresh()
    const latest = source.refresh(); source.refresh(); source.refresh()
    expect(read).toHaveBeenCalledOnce()
    first.resolve(repository([{ path: 'stale.ts', status: 'modified' }]))
    await settle()
    expect(read).toHaveBeenCalledTimes(2)
    expect(fileGitDecoration(source.getSnapshot().index, 'stale.ts', 'file').status).toBeUndefined()
    second.resolve(repository([{ path: 'fresh.ts', status: 'added' }]))
    await Promise.all([initial, latest])
    expect(fileGitDecoration(source.getSnapshot().index, 'fresh.ts', 'file').indicator).toBe('A')
    expect(source.getSnapshot().loading).toBe(false)
  })

  it('does not lose a refresh queued between the last read finishing and the queue promise finalizing', async () => {
    const first = deferred<HarnessWorkspaceGitSnapshot>()
    const read = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(repository([{ path: 'latest.ts', status: 'added' }]))
    const source = new FileGitDataSource(read, vi.fn(async () => []))
    source.activate(); const initial = source.refresh()
    const requested = first.promise.then(() => source.refresh())
    first.resolve(repository())
    await settle()
    expect(read).toHaveBeenCalledTimes(2)
    await Promise.all([initial, requested])
    expect(source.getSnapshot().loading).toBe(false)
    expect(fileGitDecoration(source.getSnapshot().index, 'latest.ts', 'file').indicator).toBe('A')
  })

  it('discards late success/failure after disposal and waits for the old read before reactivation starts a new one', async () => {
    const old = deferred<HarnessWorkspaceGitSnapshot>()
    const read = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(repository([{ path: 'new.ts', status: 'untracked' }]))
    const source = new FileGitDataSource(read, vi.fn(async () => []))
    source.activate(); const reading = source.refresh()
    source.deactivate(); source.activate(); const next = source.refresh()
    expect(read).toHaveBeenCalledOnce()
    old.reject(new Error('old failure')); await Promise.all([reading, next])
    expect(read).toHaveBeenCalledTimes(2)
    expect(source.getSnapshot().error).toBeUndefined()
    expect(fileGitDecoration(source.getSnapshot().index, 'new.ts', 'file').indicator).toBe('U')
  })

  it('keeps the last successful view during refresh, then replaces it or clears it on a definite failure', async () => {
    const next = deferred<HarnessWorkspaceGitSnapshot>(), failed = deferred<HarnessWorkspaceGitSnapshot>()
    const read = vi.fn().mockResolvedValueOnce(repository([{ path: 'gone.md', status: 'deleted' }])).mockReturnValueOnce(next.promise).mockReturnValueOnce(failed.promise)
    const source = new FileGitDataSource(read, vi.fn(async () => ['cache.tmp']))
    source.activate(); source.setVisiblePaths(['cache.tmp']); await source.refresh(); await settle()
    const previous = source.getSnapshot().index
    const refresh = source.refresh()
    expect(source.getSnapshot()).toMatchObject({ available: true, loading: true })
    expect(source.getSnapshot().index).toBe(previous)
    expect(fileGitDecoration(previous, 'gone.md', 'file').indicator).toBe('D')
    expect(fileGitDecoration(previous, 'cache.tmp', 'file').status).toBe('ignored')
    next.resolve(repository([{ path: 'new.md', status: 'added' }]))
    await refresh; await settle()
    expect(fileGitDecoration(source.getSnapshot().index, 'gone.md', 'file').status).toBeUndefined()
    expect(fileGitDecoration(source.getSnapshot().index, 'new.md', 'file').indicator).toBe('A')
    const failing = source.refresh()
    expect(source.getSnapshot().available).toBe(true)
    failed.reject(new Error('Git unavailable'))
    await failing
    expect(source.getSnapshot()).toMatchObject({ available: false, loading: false, error: 'Git 状态读取失败：Git unavailable' })
    expect(source.getSnapshot().index.direct.size).toBe(0)
  })

  it('clears existing decoration on status errors and allows a full retry', async () => {
    const read = vi.fn().mockResolvedValueOnce(repository([{ path: 'file.ts', status: 'modified' }])).mockRejectedValueOnce(new Error('Git process failed')).mockResolvedValue(repository([{ path: 'file.ts', status: 'added' }]))
    const source = new FileGitDataSource(read, vi.fn(async () => []))
    source.activate(); await source.refresh()
    expect(fileGitDecoration(source.getSnapshot().index, 'file.ts', 'file').indicator).toBe('M')
    await source.refresh()
    expect(source.getSnapshot().error).toBe('Git 状态读取失败：Git process failed')
    expect(fileGitDecoration(source.getSnapshot().index, 'file.ts', 'file').status).toBeUndefined()
    await source.refresh()
    expect(source.getSnapshot().error).toBeUndefined()
    expect(fileGitDecoration(source.getSnapshot().index, 'file.ts', 'file').indicator).toBe('A')
  })

  it('only batches current visible/focused paths in chunks of 512, caches positive and negative results, and ignores unsolicited paths', async () => {
    const ignored = vi.fn(async (paths: string[]) => [...paths.filter(path => path === 'cache/ignored.tmp'), 'outside.tmp'])
    const source = new FileGitDataSource(async () => repository(), ignored)
    const paths = ['cache', 'cache/ignored.tmp', 'cache/kept.ts', ...Array.from({ length: 600 }, (_, index) => `file-${index}.ts`)]
    source.activate(); source.setVisiblePaths(paths); await source.refresh(); await settle()
    expect(ignored.mock.calls.map(([batch]) => batch.length)).toEqual([512, 91])
    expect(fileGitDecoration(source.getSnapshot().index, 'cache/ignored.tmp', 'file').status).toBe('ignored')
    expect(fileGitDecoration(source.getSnapshot().index, 'cache/kept.ts', 'file').status).toBeUndefined()
    expect(fileGitDecoration(source.getSnapshot().index, 'outside.tmp', 'file').status).toBeUndefined()
    source.setVisiblePaths(['cache/kept.ts', 'cache/ignored.tmp']); await settle()
    expect(ignored).toHaveBeenCalledTimes(2)
    source.setVisiblePaths(['next.ts', 'cache/ignored.tmp']); await settle()
    expect(ignored.mock.calls.at(-1)).toEqual([['next.ts']])
  })

  it('replaces pending ignored paths with the latest visible set rather than queuing every scroll event', async () => {
    const first = deferred<string[]>()
    const ignored = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue([])
    const source = new FileGitDataSource(async () => repository(), ignored)
    source.activate(); source.setVisiblePaths(['first.ts']); await source.refresh()
    expect(ignored).toHaveBeenCalledOnce()
    source.setVisiblePaths(['second.ts']); source.setVisiblePaths(['third.ts']); source.setVisiblePaths(['last.ts'])
    expect(ignored).toHaveBeenCalledOnce()
    first.resolve([]); await settle()
    expect(ignored.mock.calls).toEqual([[['first.ts']], [['last.ts']]])
  })

  it('invalidates old ignored results on refresh, keeps one actual ignored call in flight, and rechecks visible paths', async () => {
    const old = deferred<string[]>()
    const ignored = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue([])
    const source = new FileGitDataSource(async () => repository(), ignored)
    source.activate(); source.setVisiblePaths(['visible.ts']); await source.refresh()
    await source.refresh()
    expect(ignored).toHaveBeenCalledOnce()
    old.resolve(['visible.ts']); await settle()
    expect(ignored.mock.calls).toEqual([[['visible.ts']], [['visible.ts']]])
    expect(fileGitDecoration(source.getSnapshot().index, 'visible.ts', 'file').status).toBeUndefined()
  })

  it('suppresses an old ignored failure across disposal/reactivation and uses the latest captured visible set', async () => {
    const old = deferred<string[]>()
    const ignored = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(['new.ts'])
    const source = new FileGitDataSource(async () => repository(), ignored)
    source.activate(); source.setVisiblePaths(['old.ts']); await source.refresh()
    source.deactivate(); source.activate(); source.setVisiblePaths(['new.ts']); await source.refresh()
    expect(ignored).toHaveBeenCalledOnce()
    old.reject(new Error('old ignore failed')); await settle()
    expect(ignored.mock.calls).toEqual([[['old.ts']], [['new.ts']]])
    expect(source.getSnapshot().error).toBeUndefined()
    expect(fileGitDecoration(source.getSnapshot().index, 'new.ts', 'file').status).toBe('ignored')
  })

  it('clears all stale decoration on ignored lookup failure and retries through a new full status refresh', async () => {
    const ignored = vi.fn().mockRejectedValueOnce(new Error('ignore failed')).mockResolvedValue(['file.ts'])
    const read = vi.fn(async () => repository([{ path: 'other.ts', status: 'added' }]))
    const source = new FileGitDataSource(read, ignored)
    source.activate(); source.setVisiblePaths(['file.ts']); await source.refresh(); await settle()
    expect(source.getSnapshot().error).toBe('Git 状态读取失败：ignore failed')
    expect(fileGitDecoration(source.getSnapshot().index, 'other.ts', 'file').status).toBeUndefined()
    source.setVisiblePaths(['more.ts']); await settle()
    expect(ignored).toHaveBeenCalledOnce()
    await source.refresh(); await settle()
    expect(read).toHaveBeenCalledTimes(2)
    expect(source.getSnapshot().error).toBeUndefined()
  })
})
