import { describe, expect, it, vi } from 'vitest'
import { FileTreeDataSource, fileTreeAbsolutePath, fileTreeAncestors, fileTreeFocusPath, fileTreeKeyAction, flattenFileTree, type FileTreeSnapshot } from '../apps/harness-react/src/lib/file-tree'
import type { HarnessWorkspaceFileEntry } from '../src/config/harness'

const file = (path: string): HarnessWorkspaceFileEntry => ({ name: path.split('/').pop()!, path, type: 'file' })
const folder = (path: string): HarnessWorkspaceFileEntry => ({ ...file(path), type: 'directory' })
const directories: FileTreeSnapshot['directories'] = {
  '': { entries: [file('README.md'), folder('src'), file('.env'), folder('docs')], loading: false },
  docs: { entries: [file('docs/guide.md')], loading: false },
  src: { entries: [file('src/main.ts'), folder('src/lib')], loading: false },
  'src/lib': { entries: [file('src/lib/tree.ts')], loading: false },
}

describe('Mira project file tree rows', () => {
  it('keeps directories first and hidden files while flattening multiple expanded siblings', () => {
    const rows = flattenFileTree(directories, ['docs', 'src', 'src/lib'])
    expect(rows.map(row => [row.path, row.depth, row.parent])).toEqual([
      ['docs', 0, ''], ['docs/guide.md', 1, 'docs'], ['src', 0, ''], ['src/lib', 1, 'src'],
      ['src/lib/tree.ts', 2, 'src/lib'], ['src/main.ts', 1, 'src'], ['.env', 0, ''], ['README.md', 0, ''],
    ])
    expect(rows[2]).toMatchObject({ position: 2, siblings: 4, expanded: true })
    expect(rows[4]).toMatchObject({ position: 1, siblings: 1 })
  })

  it('hides a collapsed subtree without changing its saved descendants', () => {
    expect(flattenFileTree(directories, ['docs', 'src/lib']).map(row => row.path)).toEqual(['docs', 'docs/guide.md', 'src', '.env', 'README.md'])
    expect(flattenFileTree(directories, ['src', 'src/lib']).map(row => row.path)).toContain('src/lib/tree.ts')
  })

  it('projects loading, failure and empty state onto the fixed directory row', () => {
    const rows = flattenFileTree({ ...directories, docs: { loading: true }, src: { entries: [], loading: false, error: '无权访问目录' } }, ['docs', 'src'])
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ loading: true, expanded: true })
    expect(rows[1]).toMatchObject({ empty: true, error: '无权访问目录' })
  })

  it('joins displayed absolute paths without rewriting the relative host path', () => {
    expect(fileTreeAbsolutePath('/work/project/', 'src/main.ts')).toBe('/work/project/src/main.ts')
    expect(fileTreeAbsolutePath('/', '.env')).toBe('/.env')
    expect(fileTreeAbsolutePath('C:\\project\\', 'src/main.ts')).toBe('C:\\project\\src\\main.ts')
    expect(fileTreeAbsolutePath('C:\\', '.env')).toBe('C:\\.env')
    expect(fileTreeAncestors('src/lib/tree.ts')).toEqual(['src', 'src/lib'])
  })
})

describe('Mira file tree keyboard navigation', () => {
  const rows = flattenFileTree(directories, ['docs', 'src', 'src/lib'])
  it('moves across multiple siblings and clamps at the first and last rows', () => {
    expect(fileTreeKeyAction(rows, 'docs/guide.md', 'ArrowDown')).toEqual({ kind: 'focus', path: 'src' })
    expect(fileTreeKeyAction(rows, 'src', 'ArrowUp')).toEqual({ kind: 'focus', path: 'docs/guide.md' })
    expect(fileTreeKeyAction(rows, 'docs', 'ArrowUp')).toEqual({ kind: 'focus', path: 'docs' })
    expect(fileTreeKeyAction(rows, 'README.md', 'ArrowDown')).toEqual({ kind: 'focus', path: 'README.md' })
    expect(fileTreeKeyAction(rows, 'src/main.ts', 'Home')).toEqual({ kind: 'focus', path: 'docs' })
    expect(fileTreeKeyAction(rows, 'src/main.ts', 'End')).toEqual({ kind: 'focus', path: 'README.md' })
  })

  it('expands then enters a child and collapses then returns to the parent', () => {
    const closed = flattenFileTree(directories, [])
    expect(fileTreeKeyAction(closed, 'src', 'ArrowRight')).toEqual({ kind: 'expand', path: 'src' })
    expect(fileTreeKeyAction(rows, 'src', 'ArrowRight')).toEqual({ kind: 'focus', path: 'src/lib' })
    expect(fileTreeKeyAction(rows, 'src/lib/tree.ts', 'ArrowLeft')).toEqual({ kind: 'focus', path: 'src/lib' })
    expect(fileTreeKeyAction(rows, 'src/lib', 'ArrowLeft')).toEqual({ kind: 'collapse', path: 'src/lib' })
    const nestedClosed = flattenFileTree(directories, ['src'])
    expect(fileTreeKeyAction(nestedClosed, 'src/lib', 'ArrowLeft')).toEqual({ kind: 'focus', path: 'src' })
    expect(fileTreeKeyAction(closed, 'src', 'ArrowLeft')).toEqual({ kind: 'none' })
  })

  it('opens files, toggles folders and supports keyboard context-menu triggers', () => {
    expect(fileTreeKeyAction(rows, 'src/main.ts', 'Enter')).toEqual({ kind: 'open', path: 'src/main.ts' })
    expect(fileTreeKeyAction(rows, 'src', 'Enter')).toEqual({ kind: 'collapse', path: 'src' })
    expect(fileTreeKeyAction(rows, 'src/main.ts', 'ContextMenu')).toEqual({ kind: 'menu', path: 'src/main.ts' })
    expect(fileTreeKeyAction(rows, 'src/main.ts', 'F10', true)).toEqual({ kind: 'menu', path: 'src/main.ts' })
    expect(fileTreeKeyAction(rows, 'src/main.ts', 'F10')).toEqual({ kind: 'none' })
  })

  it('retries expanded errors and does not enter a loading or empty folder', () => {
    const pending = flattenFileTree({ ...directories, src: { loading: true } }, ['src'])
    expect(fileTreeKeyAction(pending, 'src', 'ArrowRight')).toEqual({ kind: 'none' })
    const failed = flattenFileTree({ ...directories, src: { loading: false, error: '读取失败' } }, ['src'])
    expect(fileTreeKeyAction(failed, 'src', 'ArrowRight')).toEqual({ kind: 'reload', path: 'src' })
    expect(fileTreeKeyAction(failed, 'src', 'Enter')).toEqual({ kind: 'reload', path: 'src' })
  })

  it('keeps path focus after insertions and falls back to the nearest visible parent', () => {
    expect(fileTreeFocusPath(rows, 'src/main.ts', 'README.md')).toBe('src/main.ts')
    const collapsed = flattenFileTree(directories, [])
    expect(fileTreeFocusPath(collapsed, 'src/lib/tree.ts', 'README.md')).toBe('src')
    expect(fileTreeFocusPath(collapsed, 'removed/file.ts', 'README.md')).toBe('README.md')
    expect(fileTreeFocusPath(collapsed)).toBe('docs')
    expect(fileTreeFocusPath([])).toBeUndefined()
  })
})

describe('Mira file tree incremental watch refresh', () => {
  it('reloads only changed cached parents, deduplicates them, and leaves unrelated/uncached directories alone', async () => {
    const load = vi.fn(async (path: string) => path ? [file(`${path}/file.ts`)] : [folder('src'), folder('docs')])
    const source = new FileTreeDataSource(load)
    source.activate(); await source.loadDirectory(''); await source.loadDirectory('src'); await source.loadDirectory('docs')
    load.mockClear()
    await source.refreshChanged(['src', 'src', 'unloaded/deep'])
    expect(load.mock.calls).toEqual([['src']])
    expect(source.getSnapshot().directories.docs.entries).toEqual([file('docs/file.ts')])
  })

  it('bounds changed-directory reads to two and cancels the queue when the root lifecycle ends', async () => {
    const pending = deferred<HarnessWorkspaceFileEntry[]>()
    const load = vi.fn(async (_path: string) => [] as HarnessWorkspaceFileEntry[])
    const source = new FileTreeDataSource(load)
    source.activate()
    await Promise.all(['', 'src', 'docs', 'other'].map(path => source.loadDirectory(path)))
    load.mockClear(); load.mockImplementation(() => pending.promise)
    const refreshing = source.refreshChanged(['', 'src', 'docs', 'other'])
    expect(load.mock.calls).toEqual([[''], ['src']])
    source.deactivate(); source.activate()
    pending.resolve([file('stale.md')]); await refreshing
    expect(load).toHaveBeenCalledTimes(2)
    expect(source.getSnapshot().directories).toEqual({})
  })

  it('shares the two-reader budget across later watch batches and re-reads a parent changed during its old read', async () => {
    const load = vi.fn(async (_path: string) => [] as HarnessWorkspaceFileEntry[])
    const source = new FileTreeDataSource(load)
    source.activate()
    await Promise.all(['', 'src', 'docs', 'other'].map(path => source.loadDirectory(path)))
    const reads: Array<{ path: string; result: ReturnType<typeof deferred<HarnessWorkspaceFileEntry[]>> }> = []
    let running = 0, maximum = 0
    load.mockClear(); load.mockImplementation(path => {
      running++; maximum = Math.max(maximum, running)
      const result = deferred<HarnessWorkspaceFileEntry[]>()
      reads.push({ path, result })
      return result.promise.finally(() => { running-- })
    })
    const first = source.refreshChanged(['', 'src'])
    const second = source.refreshChanged(['src', 'docs', 'other'])
    expect(reads.map(read => read.path)).toEqual(['', 'src'])
    for (let index = 0; index < 5; index++) {
      reads[index].result.resolve([])
      await vi.waitFor(() => expect(reads.length).toBe(Math.min(5, index + 3)))
    }
    await Promise.all([first, second])
    expect(reads.map(read => read.path)).toEqual(['', 'src', 'src', 'docs', 'other'])
    expect(maximum).toBe(2)
  })

  it('shares one two-read budget across watch refresh, reveal, manual refresh and the first expanded-directory load', async () => {
    const load = vi.fn(async (_path: string) => [] as HarnessWorkspaceFileEntry[])
    const source = new FileTreeDataSource(load)
    source.activate()
    await Promise.all(['', 'src', 'docs'].map(path => source.loadDirectory(path)))
    const pending = controlledDirectoryReads()
    load.mockImplementation(pending.read)
    const operations = [source.refreshChanged(['src', 'docs']), source.revealPath('src/lib/selected.ts'), source.refresh(['src', 'docs']), source.loadDirectory('newly-expanded')]
    expect(pending.maximum()).toBe(2)
    await pending.finish(Promise.all(operations))
    expect(pending.maximum()).toBe(2)
    expect(pending.paths()).toContain('newly-expanded')
    expect(pending.paths()).toContain('src/lib')
    expect(source.getSnapshot().refreshing).toBe(false)
  })

  it('also budgets simultaneous first reads of directories that have never been loaded', async () => {
    const pending = controlledDirectoryReads()
    const source = new FileTreeDataSource(pending.read)
    source.activate()
    const loading = Promise.all(['', 'src', 'docs', 'newly-expanded', 'src/deep'].map(path => source.loadDirectory(path)))
    expect(pending.paths()).toEqual(['', 'src'])
    expect(pending.maximum()).toBe(2)
    await pending.finish(loading)
    expect(pending.paths()).toEqual(['', 'src', 'docs', 'newly-expanded', 'src/deep'])
    expect(pending.maximum()).toBe(2)
    expect(Object.values(source.getSnapshot().directories).every(directory => !directory.loading)).toBe(true)
  })

  it('cancels unstarted old-epoch promises but keeps active old reads in the budget across reactivation', async () => {
    const pending = controlledDirectoryReads()
    const source = new FileTreeDataSource(pending.read)
    source.activate()
    const first = source.loadDirectory('old-first'), second = source.loadDirectory('old-second')
    const neverStarted = source.loadDirectory('old-queued')
    expect(pending.paths()).toEqual(['old-first', 'old-second'])
    source.deactivate(); source.activate()
    await neverStarted
    const fresh = source.loadDirectory('new-root')
    expect(pending.paths()).toEqual(['old-first', 'old-second'])
    await pending.finish(Promise.all([first, second, fresh]))
    expect(pending.paths()).toEqual(['old-first', 'old-second', 'new-root'])
    expect(pending.maximum()).toBe(2)
    expect(source.getSnapshot().directories).toEqual({ 'new-root': { entries: [], loading: false } })
  })

  it('settles superseded queued reads and returns the read budget after a rejection', async () => {
    const first = deferred<HarnessWorkspaceFileEntry[]>(), second = deferred<HarnessWorkspaceFileEntry[]>()
    const load = vi.fn<(path: string) => Promise<HarnessWorkspaceFileEntry[]>>()
      .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue([file('queued/fresh.ts')])
    const source = new FileTreeDataSource(load)
    source.activate()
    const readingFirst = source.loadDirectory('first'), readingSecond = source.loadDirectory('second')
    const replaced = source.loadDirectory('queued')
    const latest = source.loadDirectory('queued', true)
    await replaced
    expect(load.mock.calls).toEqual([['first'], ['second']])
    first.reject(new Error('无权访问 first')); await readingFirst; await latest
    expect(load.mock.calls).toEqual([['first'], ['second'], ['queued']])
    expect(source.getSnapshot().directories.first.error).toBe('无权访问 first')
    expect(source.getSnapshot().directories.queued).toEqual({ entries: [file('queued/fresh.ts')], loading: false })
    second.resolve([]); await readingSecond
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function controlledDirectoryReads() {
  const requests: Array<{ path: string; result: ReturnType<typeof deferred<HarnessWorkspaceFileEntry[]>> }> = []
  let running = 0, maximum = 0
  const read = (path: string) => {
    running++; maximum = Math.max(maximum, running)
    const result = deferred<HarnessWorkspaceFileEntry[]>()
    requests.push({ path, result })
    return result.promise.finally(() => { running-- })
  }
  const finish = async (operation: Promise<unknown>) => {
    let done = false, index = 0
    void operation.then(() => { done = true })
    for (let turn = 0; turn < 50 && !done; turn++) {
      if (index < requests.length) requests[index++].result.resolve([])
      for (let step = 0; step < 20; step++) await Promise.resolve()
    }
    expect(done).toBe(true)
    await operation
  }
  return { read, finish, paths: () => requests.map(request => request.path), maximum: () => maximum }
}

describe('Mira file tree directory loading', () => {
  it('reveals searched files and directories added after ancestor listings were cached', async () => {
    let created = false
    const load = vi.fn(async (path: string) => path === '' ? created ? [folder('new-folder')] : [] : path === 'new-folder' ? [folder('new-folder/deep')] : [file('new-folder/deep/file.md')])
    const source = new FileTreeDataSource(load)
    source.activate(); await source.loadDirectory('')
    created = true
    await source.revealPath('new-folder/deep', true)
    expect(flattenFileTree(source.getSnapshot().directories, ['new-folder', 'new-folder/deep']).map(row => row.path)).toEqual(['new-folder', 'new-folder/deep', 'new-folder/deep/file.md'])
    expect(load.mock.calls.map(([path]) => path)).toEqual(['', '', 'new-folder', 'new-folder/deep'])
    await source.revealPath('new-folder/deep/file.md')
    expect(load.mock.calls.at(-1)).toEqual(['new-folder/deep'])
  })

  it('stops ancestor reveal reads when the captured workspace is disposed', async () => {
    const pending = deferred<HarnessWorkspaceFileEntry[]>()
    const load = vi.fn().mockReturnValue(pending.promise)
    const source = new FileTreeDataSource(load)
    source.activate()
    const reveal = source.revealPath('new-folder/deep', true)
    source.deactivate(); source.activate()
    pending.resolve([folder('new-folder')]); await reveal
    expect(load).toHaveBeenCalledTimes(1)
    expect(source.getSnapshot().directories).toEqual({})
  })

  it('lazily loads each directory once and allows a failed directory to retry', async () => {
    const load = vi.fn<(path: string) => Promise<HarnessWorkspaceFileEntry[]>>().mockResolvedValueOnce([folder('src')]).mockRejectedValueOnce(new Error('目录读取失败')).mockResolvedValueOnce([file('src/main.ts')])
    const source = new FileTreeDataSource(load)
    source.activate()
    await source.loadDirectory('')
    await source.loadDirectory('')
    expect(load.mock.calls).toEqual([['']])
    await source.loadDirectory('src')
    expect(source.getSnapshot().directories.src).toMatchObject({ error: '目录读取失败', loading: false })
    await source.loadDirectory('src', true)
    expect(source.getSnapshot().directories.src).toEqual({ entries: [file('src/main.ts')], loading: false })
  })

  it('refreshes root and every expanded directory with at most two simultaneous reads', async () => {
    const requests: Array<{ path: string; result: ReturnType<typeof deferred<HarnessWorkspaceFileEntry[]>> }> = []
    let running = 0
    let maximum = 0
    const source = new FileTreeDataSource(path => {
      running++; maximum = Math.max(maximum, running)
      const result = deferred<HarnessWorkspaceFileEntry[]>()
      requests.push({ path, result })
      return result.promise.finally(() => { running-- })
    })
    source.activate()
    const refresh = source.refresh(['docs', 'src', 'src/lib', 'docs'])
    expect(requests.map(request => request.path)).toEqual(['', 'docs'])
    for (let index = 0; index < 4; index++) {
      requests[index].result.resolve(index === 0 ? [folder('docs'), folder('src')] : [file(`${requests[index].path}/new.md`)])
      await vi.waitFor(() => { expect(requests.length).toBe(Math.min(4, index + 3)) })
    }
    await refresh
    expect(requests.map(request => request.path)).toEqual(['', 'docs', 'src', 'src/lib'])
    expect(maximum).toBe(2)
    expect(source.getSnapshot().refreshing).toBe(false)
    expect(flattenFileTree(source.getSnapshot().directories, ['docs', 'src']).map(row => row.path)).toContain('docs/new.md')
  })

  it('retains cached rows when a refresh fails and reloads cached collapsed directories', async () => {
    const load = vi.fn<(path: string) => Promise<HarnessWorkspaceFileEntry[]>>().mockResolvedValueOnce([folder('src')]).mockResolvedValueOnce([file('src/main.ts')]).mockRejectedValue(new Error('暂时不可读取'))
    const source = new FileTreeDataSource(load)
    source.activate()
    await source.loadDirectory('')
    await source.loadDirectory('src')
    await source.refresh([])
    expect(load.mock.calls).toEqual([[''], ['src'], [''], ['src']])
    expect(source.getSnapshot().directories.src).toEqual({ entries: [file('src/main.ts')], loading: false, error: '暂时不可读取' })
  })

  it('ignores old success and old failure after the session/directory epoch changes', async () => {
    const old = deferred<HarnessWorkspaceFileEntry[]>()
    const fresh = deferred<HarnessWorkspaceFileEntry[]>()
    const source = new FileTreeDataSource(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise))
    source.activate()
    const oldRequest = source.loadDirectory('')
    const oldGuard = source.guard()
    source.deactivate()
    source.activate()
    const newRequest = source.loadDirectory('')
    fresh.resolve([file('new-session.md')]); await newRequest
    old.resolve([file('old-session.md')]); await oldRequest
    expect(oldGuard()).toBe(false)
    expect(source.getSnapshot().directories[''].entries).toEqual([file('new-session.md')])
    const failing = deferred<HarnessWorkspaceFileEntry[]>()
    const separate = new FileTreeDataSource(() => failing.promise)
    separate.activate()
    const failure = separate.loadDirectory('')
    separate.deactivate(); separate.activate()
    failing.reject(new Error('旧目录错误')); await failure
    expect(separate.getSnapshot().directories).toEqual({})
  })

  it('prevents an older same-directory load from replacing a newer forced response', async () => {
    const old = deferred<HarnessWorkspaceFileEntry[]>()
    const fresh = deferred<HarnessWorkspaceFileEntry[]>()
    const source = new FileTreeDataSource(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise))
    source.activate()
    const first = source.loadDirectory('src')
    const second = source.loadDirectory('src', true)
    fresh.resolve([file('src/new.ts')]); await second
    old.resolve([file('src/old.ts')]); await first
    expect(source.getSnapshot().directories.src.entries).toEqual([file('src/new.ts')])
  })

  it('stops a refresh queue after disposal and lets the new lifecycle refresh independently', async () => {
    const pending = deferred<HarnessWorkspaceFileEntry[]>()
    const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue([])
    const source = new FileTreeDataSource(load)
    source.activate()
    const old = source.refresh(['src', 'docs', 'deep'])
    source.deactivate(); source.activate()
    await source.refresh([])
    pending.resolve([file('stale.md')]); await old
    expect(load.mock.calls.map(([path]) => path)).toEqual(['', 'src', ''])
    expect(source.getSnapshot()).toEqual({ directories: { '': { entries: [], loading: false } }, refreshing: false })
  })
})
