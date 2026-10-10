import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArchivedSessions } from '../apps/harness-react/src/components/session/ArchivedSessions'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessHistoryPage } from '../src/config/harness'

const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true } }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))

function page(ids: string[], total = ids.length, number = 1): HarnessHistoryPage {
  return { rows: ids.map(id => ({ id, title: id, createdAt: 1, updatedAt: 2, archivedAt: 3, status: 'active', permissionMode: 'default' })), total, page: number, pageSize: 50, stats: {} as never, facets: { projects: [], models: [] } }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
function mount(queryHistory = vi.fn(async () => page(['archived']))) {
  const controller = { queryHistory, restoreSession: vi.fn(async () => undefined), deleteSession: vi.fn(async () => undefined), supportsArchivedDeletion: true, getArchivedSnapshot: vi.fn(async () => ({ snapshotId: 'selection', count: 63 })), deleteArchivedSessions: vi.fn(async (_id: string) => ({ deletedIds: ['archived'], skippedIds: [], failedIds: [] } as { deletedIds: string[]; skippedIds: string[]; failedIds: string[]; refreshError?: string })), refreshSessions: vi.fn(async () => undefined) }
  let sort: 'created' | 'updated' = 'updated', refreshKey = 'active'
  let active = true, currentController = controller
  let tree: React.ReactNode, mounted = true
  const onOpen = vi.fn()
  const render = () => { hooks.cursor = 0; hooks.dirty = false; tree = ArchivedSessions({ controller: currentController as unknown as PilotController, sort, refreshKey, onOpen, active }); hooks.effects.splice(0).forEach(effect => effect()) }
  const drain = async () => { for (let i = 0; i < 30; i++) { await Promise.resolve(); if (hooks.dirty && mounted) render() } }
  function props(match: (value: Record<string, unknown>) => boolean) {
    const visit = (node: React.ReactNode): Record<string, unknown> | undefined => Array.isArray(node) ? node.map(visit).find(Boolean) : React.isValidElement<Record<string, unknown>>(node) ? match(node.props) ? node.props : visit(node.props.children as React.ReactNode) : undefined
    return visit(tree)
  }
  const unmount = () => { mounted = false; hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) }
  render()
  return { controller, onOpen, drain, props, unmount, setSort: (next: typeof sort) => { sort = next; render() }, setRefresh: (next: string) => { refreshKey = next; render() }, setActive: (next: boolean) => { active = next; render() }, setController: (next: typeof controller) => { currentController = next; render() }, prepare: async () => { (props(p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('删除所有归档任务'))!.onSelect as () => void)(); await drain() }, confirm: () => (props(p => p['aria-label'] === '确认删除归档任务')!.onClick as () => void)() }
}
beforeEach(() => { hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })

describe('actual archived-list component callbacks', () => {
  it('confirms the host snapshot count instead of the loaded page and deduplicates preparation/deletion', async () => {
    const view = mount(); await view.drain()
    const snapshot = deferred<{ snapshotId: string; count: number }>()
    view.controller.getArchivedSnapshot.mockReturnValueOnce(snapshot.promise)
    await view.prepare(); await view.prepare()
    expect(view.controller.getArchivedSnapshot).toHaveBeenCalledOnce()
    expect(view.controller.deleteArchivedSessions).not.toHaveBeenCalled()
    snapshot.resolve({ snapshotId: 'frozen', count: 63 }); await view.drain()
    expect(view.props(p => Array.isArray(p.children) && p.children.includes(63))).toBeDefined()
    const deletion = deferred<{ deletedIds: string[]; skippedIds: string[]; failedIds: string[] }>()
    view.controller.deleteArchivedSessions.mockReturnValueOnce(deletion.promise)
    view.confirm(); view.confirm()
    expect(view.controller.deleteArchivedSessions).toHaveBeenCalledExactlyOnceWith('frozen')
    deletion.resolve({ deletedIds: ['archived'], skippedIds: ['restored'], failedIds: ['failed'] }); await view.drain()
    expect(view.props(p => p.role === 'status' && p.children === '已删除 1 个，跳过 1 个，失败 1 个。')).toBeDefined()
  })
  it.each(['cancel', 'close'] as const)('never deletes on %s', async action => {
    const view = mount(); await view.drain(); await view.prepare()
    if (action === 'cancel') (view.props(p => p.children === '取消')!.onClick as () => void)()
    else (view.props(p => typeof p.onOpenChange === 'function' && 'open' in p && !('onSelect' in p) && JSON.stringify(p.children).includes('确认删除归档任务'))!.onOpenChange as (open: boolean) => void)(false)
    await view.drain()
    expect(view.controller.deleteArchivedSessions).not.toHaveBeenCalled()
  })
  it('does not reopen a late snapshot after hiding the app, changing controller or unmounting', async () => {
    for (const leave of ['hide', 'controller', 'unmount']) {
      hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []
      const view = mount(); await view.drain()
      const waiting = deferred<{ snapshotId: string; count: number }>(); view.controller.getArchivedSnapshot.mockReturnValueOnce(waiting.promise)
      await view.prepare()
      if (leave === 'hide') view.setActive(false)
      else if (leave === 'controller') view.setController({ ...view.controller, getArchivedSnapshot: vi.fn(async () => ({ snapshotId: 'new', count: 2 })) })
      else view.unmount()
      hooks.dirty = false; waiting.resolve({ snapshotId: 'old', count: 63 }); await view.drain()
      expect(view.controller.deleteArchivedSessions).not.toHaveBeenCalled()
      if (leave === 'unmount') expect(hooks.dirty).toBe(false)
      view.unmount()
    }
  })
  it('retries only reads after a completed deletion reports list refresh failure', async () => {
    const view = mount(); await view.drain(); await view.prepare()
    view.controller.deleteArchivedSessions.mockResolvedValueOnce({ deletedIds: ['archived'], skippedIds: [], failedIds: [], refreshError: '刷新失败' })
    view.confirm(); await view.drain()
    expect(view.props(p => p.children === '重试刷新')).toBeDefined()
    ;(view.props(p => p.children === '重试刷新')!.onClick as () => void)(); await view.drain()
    expect(view.controller.refreshSessions).toHaveBeenCalledOnce()
    expect(view.controller.deleteArchivedSessions).toHaveBeenCalledOnce()
  })
  it('keeps an already confirmed late deletion response from reviving a hidden modal or message', async () => {
    const view = mount(); await view.drain(); await view.prepare()
    const deletion = deferred<{ deletedIds: string[]; skippedIds: string[]; failedIds: string[] }>(); view.controller.deleteArchivedSessions.mockReturnValueOnce(deletion.promise)
    view.confirm(); view.setActive(false); hooks.dirty = false
    deletion.resolve({ deletedIds: ['archived'], skippedIds: [], failedIds: [] }); await view.drain()
    expect(hooks.dirty).toBe(false)
    expect(view.props(p => p.children === '已删除 1 个，跳过 0 个，失败 0 个。')).toBeUndefined()
  })
  it('reads an archived page and opens a row without restoring or deleting it', async () => {
    const view = mount(); await view.drain()
    expect(view.controller.queryHistory).toHaveBeenCalledWith({ archiveView: 'archived', sort: 'updated-desc', page: 1, pageSize: 50 })
    ;(view.props(p => p.title === 'archived')!.onClick as () => void)()
    expect(view.onOpen).toHaveBeenCalledWith('archived')
    expect(view.controller.restoreSession).not.toHaveBeenCalled(); expect(view.controller.deleteSession).not.toHaveBeenCalled()
  })
  it('recovers from a read error and loads the next real page', async () => {
    const query = vi.fn().mockRejectedValueOnce(new Error('读取失败')).mockResolvedValueOnce(page(['first'], 2)).mockResolvedValueOnce(page(['second'], 2, 2))
    const view = mount(query); await view.drain()
    expect(view.props(p => p.role === 'alert')).toBeDefined()
    ;(view.props(p => p.children === '重试')!.onClick as () => void)(); await view.drain()
    ;(view.props(p => p.children === '加载更多')!.onClick as () => void)(); await view.drain()
    expect(query).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    expect(view.props(p => p.title === 'first')).toBeDefined(); expect(view.props(p => p.title === 'second')).toBeDefined()
  })
  it('restores exactly the chosen row and refreshes, rejecting duplicate clicks', async () => {
    const view = mount(); await view.drain()
    const operation = deferred<void>(); view.controller.restoreSession.mockReturnValueOnce(operation.promise)
    const restore = view.props(p => p['aria-label'] === '恢复 archived')!.onClick as () => void
    restore(); restore()
    expect(view.controller.restoreSession).toHaveBeenCalledExactlyOnceWith('archived')
    view.controller.queryHistory.mockResolvedValueOnce(page([])); operation.resolve(); await view.drain()
    expect(view.props(p => p.title === 'archived')).toBeUndefined()
  })
  it('only deletes after selecting the explicit destructive confirmation', async () => {
    const view = mount(); await view.drain()
    expect(view.controller.deleteSession).not.toHaveBeenCalled()
    ;(view.props(p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('确认删除'))!.onSelect as () => void)(); await view.drain()
    expect(view.controller.deleteSession).toHaveBeenCalledExactlyOnceWith('archived')
  })
  it.each(['restore', 'delete'] as const)('refreshes the current sort and releases controls when %s completes after a sort change', async action => {
    const view = mount(vi.fn(async () => page(['archived', 'other']))); await view.drain()
    const operation = deferred<void>()
    if (action === 'restore') {
      view.controller.restoreSession.mockReturnValueOnce(operation.promise)
      ;(view.props(p => p['aria-label'] === '恢复 archived')!.onClick as () => void)()
    } else {
      view.controller.deleteSession.mockReturnValueOnce(operation.promise)
      ;(view.props(p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('确认删除') && JSON.stringify(p.children).includes('archived'))!.onSelect as () => void)()
    }
    await view.drain(); view.setSort('created'); await view.drain()
    expect(view.controller.queryHistory).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'created-desc' }))
    view.controller.queryHistory.mockResolvedValueOnce(page(['other']))
    operation.resolve(); await view.drain()
    expect(view.controller.queryHistory).toHaveBeenCalledTimes(3)
    expect(view.controller.queryHistory).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'created-desc' }))
    expect(view.props(p => p.title === 'archived')).toBeUndefined()
    expect(view.props(p => p['aria-label'] === '恢复 other')!.disabled).toBe(false)
  })
  it('does not update state when a pending restoration completes after unmount', async () => {
    const view = mount(); await view.drain()
    const operation = deferred<void>(); view.controller.restoreSession.mockReturnValueOnce(operation.promise)
    ;(view.props(p => p['aria-label'] === '恢复 archived')!.onClick as () => void)(); await view.drain()
    view.unmount(); hooks.dirty = false; operation.resolve(); await view.drain()
    expect(hooks.dirty).toBe(false)
    expect(view.controller.queryHistory).toHaveBeenCalledTimes(1)
  })
  it('ignores a late page after sort changes and after unmount', async () => {
    const old = deferred<HarnessHistoryPage>(), fresh = deferred<HarnessHistoryPage>()
    const view = mount(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise))
    view.setSort('created'); fresh.resolve(page(['new'])); await view.drain()
    old.resolve(page(['old'])); await view.drain()
    expect(view.props(p => p.title === 'new')).toBeDefined(); expect(view.props(p => p.title === 'old')).toBeUndefined()
    const final = deferred<HarnessHistoryPage>(); view.controller.queryHistory.mockReturnValueOnce(final.promise)
    view.setRefresh('changed'); view.unmount(); hooks.dirty = false
    final.resolve(page(['late'])); await view.drain()
    expect(hooks.dirty).toBe(false)
  })
})
