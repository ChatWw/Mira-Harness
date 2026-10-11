import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraBrowserResidency, type MiraBrowserTabIdentity } from '../apps/harness-react/src/state/mira-browser-residency'

const tabs = (count = 33) => Array.from({ length: count }, (_, index) => ({ sessionId: index % 2 ? 'b' : 'a', tabId: `browser:${index}` }))
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
function fixture() {
  const protectedTab = vi.fn(async (_tab: MiraBrowserTabIdentity) => false)
  const close = vi.fn(async (_tab: MiraBrowserTabIdentity, current: () => boolean) => current())
  const onError = vi.fn(), policy = new MiraBrowserResidency({ protected: protectedTab, close, onError })
  return { policy, protectedTab, close, onError }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('Mira logical browser residency matching ZCode window limit', () => {
  it('counts all logical tabs across tasks, including blanks, and keeps the current selection', async () => {
    const view = fixture(), list = tabs()
    view.policy.sync(list, list[0]); await view.policy.whenIdle()
    expect(view.close.mock.calls.map(([tab]) => tab.tabId)).toEqual(['browser:1'])
    expect(vi.getTimerCount()).toBe(0); view.policy.dispose()
  })
  it('does no work or polling with 32 logical tabs', async () => {
    const view = fixture(); view.policy.sync(tabs(32)); await view.policy.whenIdle()
    expect(view.protectedTab).not.toHaveBeenCalled(); expect(view.close).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
    view.policy.dispose()
  })
  it('evicts least recently active rather than the last background selection by default', async () => {
    const view = fixture(), list = tabs(32)
    view.policy.sync(list, list[0]); view.policy.report(list[1], false)
    view.policy.sync([...list, ...tabs(33).slice(32)], list[32]); await view.policy.whenIdle()
    expect(view.close.mock.calls.map(([tab]) => tab.tabId)).toEqual(['browser:2']); view.policy.dispose()
  })
  it('protects loading tabs, native media/capture/downloads and closes enough eligible tabs', async () => {
    const view = fixture(), list = tabs(32)
    view.policy.sync(list); view.policy.report(list[0], true)
    view.protectedTab.mockImplementation(async tab => tab.tabId === list[1].tabId)
    view.policy.sync(tabs(35), tabs(35)[34]); await view.policy.whenIdle()
    expect(view.close.mock.calls.map(([tab]) => tab.tabId)).toEqual(['browser:2', 'browser:3', 'browser:4'])
    expect(view.protectedTab.mock.calls.some(([tab]) => tab.tabId === 'browser:0')).toBe(false); view.policy.dispose()
  })
  it('rechecks a tab selected while its native protection request waits', async () => {
    const view = fixture(), list = tabs(), pending = deferred<boolean>()
    view.protectedTab.mockImplementationOnce(() => pending.promise)
    view.policy.sync(list); view.policy.sync(list, list[0]); pending.resolve(false); await view.policy.whenIdle()
    expect(view.close.mock.calls.map(([tab]) => tab.tabId)).toEqual(['browser:1']); view.policy.dispose()
  })
  it('invalidates a closing candidate when page activity arrives during durable storage', async () => {
    const view = fixture(), list = tabs(), pending = deferred<void>()
    view.close.mockImplementationOnce(async (tab, current) => { await pending.promise; return current() })
    view.policy.sync(list); await Promise.resolve(); view.policy.report(list[0], false); pending.resolve(); await view.policy.whenIdle()
    expect(view.close.mock.calls.map(([tab]) => tab.tabId)).toEqual(['browser:0', 'browser:1']); view.policy.dispose()
  })
  it('keeps all protected tabs temporarily, retries when activity ends and stops its timer at the limit', async () => {
    const view = fixture(), list = tabs(); view.protectedTab.mockResolvedValue(true)
    view.policy.sync(list); await view.policy.whenIdle(); expect(view.close).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1)
    view.protectedTab.mockResolvedValue(false); await vi.advanceTimersByTimeAsync(1000); await view.policy.whenIdle()
    expect(view.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0); view.policy.dispose()
  })
  it('retains guests on storage/protection failure and does not retry an error every second', async () => {
    const view = fixture(); view.close.mockRejectedValueOnce(Error('保存失败'))
    view.policy.sync(tabs()); await view.policy.whenIdle()
    expect(view.onError).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    view.policy.sync(tabs()); await view.policy.whenIdle(); expect(view.close).toHaveBeenCalledTimes(2); view.policy.dispose()
  })
  it('keeps windows isolated and discards pending results after disconnect', async () => {
    const first = fixture(), second = fixture(), pending = deferred<boolean>()
    first.protectedTab.mockImplementationOnce(() => pending.promise); first.policy.sync(tabs()); second.policy.sync(tabs(32))
    first.policy.dispose(); pending.resolve(false); await first.policy.whenIdle(); await second.policy.whenIdle()
    expect(first.close).not.toHaveBeenCalled(); expect(second.close).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); second.policy.dispose()
  })
})
