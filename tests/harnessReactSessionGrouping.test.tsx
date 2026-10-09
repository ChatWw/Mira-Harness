import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionMenuItems, SessionSidebar, type SessionDrawerProps } from '../apps/harness-react/src/components/session/SessionSidebar'
import { SidebarPreferenceStore, type SidebarTaskGroup } from '../apps/harness-react/src/components/session/sidebar-preferences'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }] },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (!slot.deps || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = factory(); slot.deps = deps }; return slot.value },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return; slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) },
}))
vi.mock('@dnd-kit/core', () => ({ DndContext: 'dnd-context', KeyboardSensor: 'keyboard', PointerSensor: 'pointer', closestCenter: vi.fn(), useSensor: vi.fn(), useSensors: vi.fn() }))
beforeEach(() => { hooks.cursor = 0; hooks.slots = []; hooks.effects = []; vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })

const groups = (): SidebarTaskGroup[] => [
  { id: 'research', name: '研究', color: 'blue', collapsed: false, sessionIds: ['task', 'first'] },
  { id: 'writing', name: '写作', color: 'green', collapsed: false, sessionIds: [] },
]
function find(node: React.ReactNode, match: (props: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  return Array.isArray(node) ? node.map(child => find(child, match)).find(Boolean) : React.isValidElement<Record<string, unknown>>(node) ? match(node.props) ? node.props : find(node.props.children as React.ReactNode, match) : undefined
}
const action = (tree: React.ReactNode, label: string) => find(tree, props => typeof props.onSelect === 'function' && JSON.stringify(props.children).includes(label))!
const makeStore = (write = vi.fn(async (_value: unknown) => undefined)) => ({ write, store: new SidebarPreferenceStore(async () => ({ groups: groups(), view: 'group', hiddenProjectIds: ['hidden'], collapsedProjectIds: ['project'], projectView: 'timeline' }), write) })
function sidebar(store: SidebarPreferenceStore) {
  const session = { id: 'task', title: '保持选中的任务', projectId: 'project', createdAt: 1, updatedAt: 1, status: 'active', pinned: false }
  const state = { session, sessions: [session], projects: [{ id: 'project', name: '项目', directory: '/project', directoryExists: true, createdAt: 1, updatedAt: 1 }], runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {} }
  const controller = { getSnapshot: () => state, open: vi.fn(), moveSession: vi.fn(), deleteSession: vi.fn() }
  let tree: React.ReactNode
  const render = () => { hooks.cursor = 0; tree = SessionSidebar({ state, controller, width: 260, preferenceStore: store, onClose: vi.fn() } as unknown as SessionDrawerProps); hooks.effects.splice(0).forEach(effect => effect()) }
  const drain = async () => { for (let index = 0; index < 12; index++) { await Promise.resolve(); render() } }
  render()
  return { state, controller, render, drain, row: () => find(tree, props => typeof props.onMoveGroup === 'function' && (props.session as { id?: string })?.id === 'task')!, props: (match: (props: Record<string, unknown>) => boolean) => find(tree, match)! }
}

describe('shared Header and sidebar task group actions', () => {
  it.each(['context', 'dropdown'] as const)('guards disabled %s grouping callbacks while preferences are loading', kind => {
    const onMoveGroup = vi.fn()
    const tree = SessionMenuItems({ kind, session: { id: 'task' } as never, projects: [], controller: {} as never, groups: groups(), groupsReady: false, currentGroupId: 'research', onMoveGroup, onRename: vi.fn(), run: vi.fn() })
    expect(action(tree, '移出分组').disabled).toBe(true); expect(action(tree, '写作').disabled).toBe(true)
    ;(action(tree, '移出分组').onSelect as () => void)(); (action(tree, '写作').onSelect as () => void)()
    expect(onMoveGroup).not.toHaveBeenCalled()
  })

  it('does not invoke disabled current-group or ungrouped removal callbacks', () => {
    const onMoveGroup = vi.fn()
    const menu = (currentGroupId?: string) => SessionMenuItems({ session: { id: 'task' } as never, projects: [], controller: {} as never, groups: groups(), currentGroupId, onMoveGroup, onRename: vi.fn(), run: vi.fn() })
    ;(action(menu('research'), '研究').onSelect as () => void)(); (action(menu(), '移出分组').onSelect as () => void)()
    expect(onMoveGroup).not.toHaveBeenCalled()
  })

  it('does not let a menu callback mutate groups before the authoritative preferences load', async () => {
    const { store, write } = makeStore()
    store.change({ groups: groups() })
    store.moveSessionToGroup('task', 'writing')
    await store.load(); await store.save()
    expect(store.getSnapshot().preferences.groups.map(group => group.sessionIds)).toEqual([['task', 'first'], []])
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('passes readiness to sidebar rows and keeps their callbacks safe before late hydration', async () => {
    const { store, write } = makeStore(), view = sidebar(store)
    expect(view.row().groupsReady).toBe(false)
    ;(view.row().onMoveGroup as (groupId?: string) => void)()
    await store.load(); await view.drain()
    expect(view.row().groupsReady).toBe(true)
    expect(store.getSnapshot().preferences.groups[0]!.sessionIds).toEqual(['task', 'first'])
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps same-group moves and removing an already ungrouped task as persistence no-ops', async () => {
    const { store, write } = makeStore(); await store.load()
    expect(store.moveSessionToGroup('task', 'research')).toBe(false)
    expect(store.moveSessionToGroup('free')).toBe(false)
    await store.save()
    expect(store.getSnapshot().preferences.groups[0]!.sessionIds).toEqual(['task', 'first'])
    expect(store.getSnapshot().preferences.ungroupedSessionOrder).toEqual([])
    expect(write).not.toHaveBeenCalled()
  })

  it('treats null as an explicit ungrouped menu snapshot and rejects it after later assignment', async () => {
    const { store, write } = makeStore(); await store.load()
    expect(store.moveSessionToGroup('free', 'research', null)).toBe(true); await store.save(); write.mockClear()
    expect(store.moveSessionToGroup('free', 'writing', null)).toBe(false); await store.save()
    expect(store.getSnapshot().preferences.groups.map(group => group.sessionIds)).toEqual([['task', 'first', 'free'], []])
    expect(write).not.toHaveBeenCalled()
  })

  it('ignores a stale removal callback after another surface moves the task to a different group', async () => {
    const { store, write } = makeStore(); await store.load()
    const view = sidebar(store), staleRemove = view.row().onMoveGroup as (groupId?: string) => void
    store.moveSessionToGroup('task', 'writing'); await store.save(); write.mockClear()
    staleRemove(); await store.save()
    expect(store.getSnapshot().preferences.groups.map(group => group.sessionIds)).toEqual([['first'], ['task']])
    expect(write).not.toHaveBeenCalled()
  })

  it('ignores stale sidebar callbacks after their task is removed from the live list', async () => {
    const { store, write } = makeStore(); await store.load()
    const view = sidebar(store), staleMove = view.row().onMoveGroup as (groupId?: string) => void
    view.state.sessions = []
    staleMove('writing'); await store.save()
    expect(store.getSnapshot().preferences.groups[0]!.sessionIds).toEqual(['task', 'first'])
    expect(write).not.toHaveBeenCalled()
  })

  it('moves and removes an active task without changing project scope or navigation', async () => {
    const { store } = makeStore(); await store.load()
    const view = sidebar(store)
    ;(view.row().onMoveGroup as (groupId?: string) => void)('writing'); await store.save(); await view.drain()
    expect(view.row().currentGroupId).toBe('writing'); expect(view.row().active).toBe(true)
    ;(view.row().onMoveGroup as (groupId?: string) => void)(); await store.save(); await view.drain()
    expect(view.row().currentGroupId).toBeUndefined(); expect(view.row().active).toBe(true)
    expect(view.state.session).toMatchObject({ id: 'task', projectId: 'project' })
    expect(store.getSnapshot().preferences).toMatchObject({ ungroupedSessionOrder: ['task'], projectView: 'timeline', collapsedProjectIds: ['project'], hiddenProjectIds: ['hidden'] })
    expect(view.controller.moveSession).not.toHaveBeenCalled(); expect(view.controller.open).not.toHaveBeenCalled()
  })

  it('dissolves a group without deleting tasks or projects and ignores deleted-group menu callbacks', async () => {
    const { store, write } = makeStore(); await store.load()
    const view = sidebar(store), staleMove = view.row().onMoveGroup as (groupId?: string) => void
    store.removeGroup('research'); await store.save(); await view.drain(); write.mockClear()
    store.removeGroup('research'); staleMove('research'); await store.save()
    expect(store.getSnapshot().preferences).toMatchObject({ groups: [{ id: 'writing', sessionIds: [] }], ungroupedSessionOrder: ['task', 'first'], collapsedProjectIds: ['project'], hiddenProjectIds: ['hidden'] })
    expect(view.state.session).toMatchObject({ id: 'task', projectId: 'project' }); expect(view.row().active).toBe(true)
    expect(view.state.projects).toHaveLength(1); expect(view.state.sessions).toHaveLength(1)
    expect(write).not.toHaveBeenCalled(); expect(view.controller.deleteSession).not.toHaveBeenCalled(); expect(view.controller.moveSession).not.toHaveBeenCalled()
  })

  it('shows a group save failure and retries the exact membership snapshot without resetting the active task', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('分组保存失败')).mockResolvedValue(undefined), { store } = makeStore(write)
    await store.load(); const view = sidebar(store)
    ;(view.row().onMoveGroup as (groupId?: string) => void)('writing'); await view.drain()
    expect(view.props(props => props.role === 'alert')).toBeDefined(); expect(store.getSnapshot().error).toBe('分组保存失败')
    ;(view.props(props => props.children === '重试').onClick as () => void)(); await view.drain()
    expect(store.getSnapshot().error).toBe(''); expect(write).toHaveBeenCalledTimes(2); expect(write.mock.calls[1]![0]).toEqual(write.mock.calls[0]![0])
    expect(view.row().currentGroupId).toBe('writing'); expect(view.row().active).toBe(true); expect(view.state.session.projectId).toBe('project')
  })
})
