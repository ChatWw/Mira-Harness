import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSearchDataSource, fileSearchRows } from '../apps/harness-react/src/lib/file-search'
import type { HarnessWorkspaceFileSearchResult } from '../src/config/harness'

const result = (path: string): HarnessWorkspaceFileSearchResult => ({ entries: [{ name: path.split('/').pop()!, path, type: 'file' }], truncated: false })
function deferred() {
  let resolve!: (value: HarnessWorkspaceFileSearchResult) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<HarnessWorkspaceFileSearchResult>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('whole-workspace file search lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces host calls while immediately clearing stale results and exposing loading', async () => {
    const load = vi.fn().mockResolvedValue(result('unopened/deep/first.ts'))
    const source = new FileSearchDataSource(load)
    source.activate(); source.setQuery('fir'); source.setQuery('first')
    expect(source.getSnapshot()).toMatchObject({ query: 'first', loading: true, entries: [] })
    await vi.advanceTimersByTimeAsync(120)
    expect(load.mock.calls).toEqual([['first', true]])
    expect(source.getSnapshot().entries[0].path).toBe('unopened/deep/first.ts')
    source.setQuery('second')
    expect(source.getSnapshot()).toMatchObject({ query: 'second', loading: true, entries: [] })
    await vi.advanceTimersByTimeAsync(120)
    expect(load.mock.calls[1]).toEqual(['second', false])
  })

  it('ignores older success and failure after a newer query succeeds', async () => {
    const old = deferred(), current = deferred(), staleError = deferred()
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(staleError.promise).mockReturnValueOnce(current.promise)
    const source = new FileSearchDataSource(load)
    source.activate(); source.setQuery('old'); await vi.advanceTimersByTimeAsync(120)
    source.setQuery('failure'); await vi.advanceTimersByTimeAsync(120)
    source.setQuery('current'); await vi.advanceTimersByTimeAsync(120)
    current.resolve(result('current.md')); await Promise.resolve()
    old.resolve(result('old.md')); staleError.reject(new Error('旧请求失败')); await Promise.resolve()
    expect(source.getSnapshot()).toMatchObject({ query: 'current', entries: result('current.md').entries, loading: false })
    expect(source.getSnapshot().error).toBeUndefined()
    expect(load.mock.calls.map(call => call[1])).toEqual([true, false, false])
  })

  it('clears blank queries without reading and cannot repopulate from in-flight responses', async () => {
    const pending = deferred()
    const load = vi.fn().mockReturnValue(pending.promise)
    const source = new FileSearchDataSource(load)
    source.activate(); source.setQuery('file'); await vi.advanceTimersByTimeAsync(120)
    source.setQuery('   '); pending.resolve(result('old.md')); await Promise.resolve()
    await vi.advanceTimersByTimeAsync(500)
    expect(load).toHaveBeenCalledTimes(1)
    expect(source.getSnapshot()).toMatchObject({ query: '   ', entries: [], loading: false })
  })

  it('cancels scheduled reads and ignores old results after session/root disposal', async () => {
    const pending = deferred()
    const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(result('fresh.md'))
    const source = new FileSearchDataSource(load)
    source.activate(); source.setQuery('old'); await vi.advanceTimersByTimeAsync(120)
    source.deactivate(); source.activate(); source.setQuery('fresh'); await vi.advanceTimersByTimeAsync(120)
    pending.resolve(result('old.md')); await Promise.resolve()
    expect(source.getSnapshot().entries).toEqual(result('fresh.md').entries)
    expect(load.mock.calls.map(call => call[1])).toEqual([true, true])
    source.setQuery('scheduled'); source.deactivate(); await vi.advanceTimersByTimeAsync(500)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('forces manual refresh, errors instead of partial results, and supports retry', async () => {
    const load = vi.fn().mockResolvedValueOnce(result('old.md')).mockRejectedValueOnce(new Error('无权访问，请重试')).mockResolvedValueOnce({ ...result('new.md'), truncated: true })
    const source = new FileSearchDataSource(load)
    source.activate(); source.setQuery('md'); await vi.advanceTimersByTimeAsync(120)
    source.refresh(); await Promise.resolve(); await Promise.resolve()
    expect(source.getSnapshot()).toMatchObject({ query: 'md', entries: [], loading: false, error: '无权访问，请重试' })
    source.refresh(); await Promise.resolve(); await Promise.resolve()
    expect(source.getSnapshot()).toMatchObject({ entries: result('new.md').entries, truncated: true })
    expect(source.getSnapshot().error).toBeUndefined()
    expect(load.mock.calls).toEqual([['md', true], ['md', true], ['md', true]])
  })

  it('invalidates a cached index even when the tree is refreshed before another search', async () => {
    const load = vi.fn().mockResolvedValue(result('new.md'))
    const source = new FileSearchDataSource(load)
    source.activate(); source.setQuery('md'); await vi.advanceTimersByTimeAsync(120)
    source.setQuery(''); source.refresh(); source.setQuery('md'); await vi.advanceTimersByTimeAsync(120)
    expect(load.mock.calls).toEqual([['md', true], ['md', true]])
  })

  it('projects ranked results flat without sorting by tree order or losing same-name paths', () => {
    const rows = fileSearchRows([...result('deep/one.md').entries, { name: 'deep', path: 'deep', type: 'directory' }, ...result('other/one.md').entries])
    expect(rows.map(row => [row.path, row.depth, row.position, row.siblings])).toEqual([['deep/one.md', 0, 1, 3], ['deep', 0, 2, 3], ['other/one.md', 0, 3, 3]])
    expect(rows.every(row => !row.expanded)).toBe(true)
  })
})
