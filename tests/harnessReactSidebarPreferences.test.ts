import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarPreferenceStore } from '../apps/harness-react/src/components/session/sidebar-preferences'
import { SessionSidebar, type SessionDrawerProps } from '../apps/harness-react/src/components/session/SessionSidebar'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = factory(); slot.deps = deps }
    return slot.value
  },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))
vi.mock('@dnd-kit/core', () => ({ DndContext: 'dnd-context', KeyboardSensor: 'keyboard', PointerSensor: 'pointer', closestCenter: vi.fn(), useSensor: vi.fn(), useSensors: vi.fn() }))

beforeEach(() => { hooks.cursor = 0; hooks.slots = []; hooks.effects = []; vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })

function mountSidebar(read: () => Promise<unknown>) {
  const controller = { getPreference: vi.fn(read), setPreference: vi.fn(async () => undefined), registerBeforeNavigation: vi.fn(() => () => undefined) }
  const state = { sessions: [], projects: [], runningSessionIds: [], pendingPermissions: {}, unreadSessionIds: [], session: { projectId: 'active' } }
  let tree: React.ReactNode
  const render = () => { hooks.cursor = 0; tree = SessionSidebar({ state, controller, width: 260, onClose: vi.fn() } as unknown as SessionDrawerProps); hooks.effects.splice(0).forEach(effect => effect()) }
  const props = (match: (value: Record<string, unknown>) => boolean) => {
    const visit = (node: React.ReactNode): Record<string, unknown> | undefined => Array.isArray(node) ? node.map(visit).find(Boolean) : React.isValidElement<Record<string, unknown>>(node) ? match(node.props) ? node.props : visit(node.props.children as React.ReactNode) : undefined
    return visit(tree)
  }
  const drain = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); render() } }
  render()
  return { controller, props, drain }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

describe('Harness sidebar persisted preferences', () => {
  it('preserves changed view and sort when hydration arrives late', async () => {
    const reading = deferred<unknown>()
    const write = vi.fn(async () => undefined)
    const store = new SidebarPreferenceStore(() => reading.promise, write)
    const load = store.load()
    store.change({ sort: 'created', view: 'project' })
    reading.resolve({ sort: 'manual', view: 'group', expandedProjectIds: ['project', 'project', null] })
    await load; await store.save()
    expect(store.getSnapshot().preferences).toEqual({ sort: 'created', view: 'project', projectView: 'collections', expandedProjectIds: ['project'], collapsedProjectIds: [], groups: [], hiddenProjectIds: [], ungroupedSessionOrder: [] })
    expect(write).toHaveBeenLastCalledWith(store.getSnapshot().preferences)
  })
  it('never writes defaults after failed hydration and retries without losing local edits', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('磁盘读取失败')).mockResolvedValueOnce({ view: 'group', expandedProjectIds: ['a'] })
    const write = vi.fn(async () => undefined)
    const store = new SidebarPreferenceStore(read, write)
    await expect(store.load()).rejects.toThrow('磁盘读取失败')
    store.change({ sort: 'created' })
    expect(write).not.toHaveBeenCalled()
    await store.retry(); await store.save()
    expect(store.getSnapshot()).toMatchObject({ ready: true, error: '', preferences: { view: 'group', sort: 'created', expandedProjectIds: ['a'] } })
  })
  it('serializes saves and flushes the last change before navigation completes', async () => {
    const first = deferred<void>()
    const write = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => null, write)
    await store.load()
    store.change({ sort: 'manual' })
    store.change({ sort: 'created' })
    expect(write).toHaveBeenCalledTimes(1)
    const flush = store.save()
    first.resolve(); await flush
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith({ expandedProjectIds: [], collapsedProjectIds: [], view: 'project', projectView: 'collections', sort: 'created', groups: [], hiddenProjectIds: [], ungroupedSessionOrder: [] })
    const restored = new SidebarPreferenceStore(async () => write.mock.calls.at(-1)?.[0], async () => undefined)
    await restored.load()
    expect(restored.getSnapshot().preferences.sort).toBe('created')
  })
  it('surfaces save failures and retries the unchanged snapshot', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('磁盘写入失败')).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => null, write)
    await store.load()
    store.change({ view: 'group' })
    await vi.waitFor(() => expect(store.getSnapshot().error).toBe('磁盘写入失败'))
    await store.retry()
    expect(store.getSnapshot().error).toBe('')
    expect(write.mock.calls[0][0]).toEqual(write.mock.calls[1][0])
  })
  it('waits for hydration before automatically expanding the active project, preserving other expanded projects', async () => {
    const reading = deferred<unknown>()
    const view = mountSidebar(() => reading.promise)
    expect(view.controller.setPreference).not.toHaveBeenCalled()
    reading.resolve({ expandedProjectIds: ['saved-a', 'saved-b'], view: 'project', sort: 'created' })
    await view.drain()
    expect(view.controller.setPreference).toHaveBeenLastCalledWith('session-drawer', { expandedProjectIds: ['saved-a', 'saved-b', 'active'], collapsedProjectIds: [], view: 'project', projectView: 'collections', sort: 'created', groups: [], hiddenProjectIds: [], ungroupedSessionOrder: [] }, true)
  })
  it('does not touch automatic expansion after a failed read and merges the saved projects after retry', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('读取失败')).mockResolvedValueOnce({ expandedProjectIds: ['saved'], view: 'project', sort: 'updated' })
    const view = mountSidebar(read); await view.drain()
    expect(view.controller.setPreference).not.toHaveBeenCalled()
    ;(view.props(p => p.children === '重试')!.onClick as () => void)(); await view.drain()
    expect(view.controller.setPreference).toHaveBeenLastCalledWith('session-drawer', { expandedProjectIds: ['saved', 'active'], collapsedProjectIds: [], view: 'project', projectView: 'collections', sort: 'updated', groups: [], hiddenProjectIds: [], ungroupedSessionOrder: [] }, true)
  })
  it('migrates old preferences and sanitizes duplicate group membership and persisted lists', async () => {
    const store = new SidebarPreferenceStore(async () => ({
      groups: [{ id: 'a', name: '  研究  ', color: 'blue', sessionIds: ['one', 'one', null], collapsed: true }, { id: 'a', name: 'duplicate', sessionIds: ['two'] }, { id: 'b', name: '写作', color: 'invalid', sessionIds: ['one', 'two'] }, null],
      hiddenProjectIds: ['p', 'p', null], ungroupedSessionOrder: ['third', 'third'],
    }), async () => undefined)
    await store.load()
    expect(store.getSnapshot().preferences).toEqual({ expandedProjectIds: [], collapsedProjectIds: [], view: 'project', projectView: 'collections', sort: 'updated', hiddenProjectIds: ['p'], ungroupedSessionOrder: ['third'], groups: [{ id: 'a', name: '研究', color: 'blue', collapsed: true, sessionIds: ['one'] }, { id: 'b', name: '写作', color: 'gray', collapsed: false, sessionIds: ['two'] }] })
  })
  it('restores the timeline choice and independent project/group collapse state', async () => {
    const write = vi.fn(async () => undefined)
    const store = new SidebarPreferenceStore(async () => ({ expandedProjectIds: ['p1'], collapsedProjectIds: ['p2'], groups: [{ id: 'g', name: '研究', collapsed: false, sessionIds: ['s'] }] }), write)
    await store.load()
    store.setGroupsExpanded(false)
    store.change({ view: 'project', projectView: 'timeline' })
    await store.save()
    const restored = new SidebarPreferenceStore(async () => write.mock.calls.at(-1)![0], async () => undefined)
    await restored.load()
    expect(restored.getSnapshot().preferences).toMatchObject({ view: 'project', projectView: 'timeline', expandedProjectIds: ['p1'], collapsedProjectIds: ['p2'], groups: [{ id: 'g', collapsed: true, sessionIds: ['s'] }] })
    restored.setProjectsExpanded(['p2'], true)
    expect(restored.getSnapshot().preferences).toMatchObject({ expandedProjectIds: ['p1', 'p2'], collapsedProjectIds: [], groups: [{ collapsed: true }] })
  })
  it('does not re-expand an explicitly collapsed active project after restart', async () => {
    const view = mountSidebar(async () => ({ expandedProjectIds: ['saved'], collapsedProjectIds: ['active'], projectView: 'timeline' }))
    await view.drain()
    expect(view.controller.setPreference).not.toHaveBeenCalled()
  })
  it('sanitizes the new display preference and gives expanded entries precedence over conflicting collapsed IDs', async () => {
    const store = new SidebarPreferenceStore(async () => ({ projectView: 'unknown', expandedProjectIds: ['p1'], collapsedProjectIds: ['p1', 'p2', 'p2', null] }), async () => undefined)
    await store.load()
    expect(store.getSnapshot().preferences).toMatchObject({ projectView: 'collections', expandedProjectIds: ['p1'], collapsedProjectIds: ['p2'] })
  })
  it('preserves a timeline selection made before preference hydration finishes', async () => {
    const reading = deferred<unknown>()
    const store = new SidebarPreferenceStore(() => reading.promise, async () => undefined)
    const load = store.load()
    store.change({ projectView: 'timeline' })
    reading.resolve({ projectView: 'collections', expandedProjectIds: ['p'] })
    await load; await store.save()
    expect(store.getSnapshot().preferences).toMatchObject({ projectView: 'timeline', expandedProjectIds: ['p'] })
  })
})
