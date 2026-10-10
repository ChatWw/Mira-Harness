import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupSidebarTimeline, SessionMenuItems, SessionSidebar, type SessionDrawerProps } from '../apps/harness-react/src/components/session/SessionSidebar'
import type { HarnessSessionSummary } from '../src/config/harness'
import { SidebarCollectionMenu, SidebarCollectionSection, type SidebarCollectionProps } from '../apps/harness-react/src/components/session/SidebarCollectionSection'
import { SidebarPreferenceStore, type SidebarPreferences } from '../apps/harness-react/src/components/session/sidebar-preferences'
import { KeyboardSensor, useSensor, type KeyboardCoordinateGetter } from '@dnd-kit/core'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }] },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (!slot.deps || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = factory(); slot.deps = deps }; return slot.value },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return; slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) },
}))
vi.mock('@dnd-kit/core', async original => ({ ...await original<typeof import('@dnd-kit/core')>(), DndContext: 'dnd-context', DragOverlay: 'drag-overlay', KeyboardSensor: 'keyboard', PointerSensor: 'pointer', useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })), useSensor: vi.fn(), useSensors: vi.fn() }))
vi.mock('@dnd-kit/sortable', async original => ({ ...await original<typeof import('@dnd-kit/sortable')>(), useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: undefined, transition: undefined, isDragging: false }) }))

beforeEach(() => { hooks.cursor = 0; hooks.slots = []; hooks.effects = []; vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }); vi.stubGlobal('crypto', { randomUUID: () => 'new-group' }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })

function renderedSlots(props: Record<string, unknown>): React.ReactNode[] {
  const items = Array.isArray(props.items) && typeof props.renderItem === 'function' ? props.items.map((item, index) => (props.renderItem as (item: unknown, index: number) => React.ReactNode)(item, index)) : []
  return [props.children as React.ReactNode, props.action as React.ReactNode, ...items]
}
function find(node: React.ReactNode, match: (props: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  return Array.isArray(node) ? node.map(child => find(child, match)).find(Boolean) : React.isValidElement<Record<string, unknown>>(node) ? match(node.props) ? node.props : find(renderedSlots(node.props), match) : undefined
}
function findAll(node: React.ReactNode, match: (props: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(child => findAll(child, match))
  if (!React.isValidElement<Record<string, unknown>>(node)) return []
  return [...(match(node.props) ? [node.props] : []), ...findAll(renderedSlots(node.props), match)]
}
function mount(renderComponent: () => React.ReactNode) {
  let tree: React.ReactNode
  const render = () => { hooks.cursor = 0; tree = renderComponent(); hooks.effects.splice(0).forEach(effect => effect()) }
  const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); render() } }
  render()
  return { render, drain, props: (match: (props: Record<string, unknown>) => boolean) => find(tree, match)!, allProps: (match: (props: Record<string, unknown>) => boolean) => findAll(tree, match) }
}
function sidebar(view: 'group' | 'project' = 'group', overrides: Partial<SessionDrawerProps> = {}, savedPreferences: Partial<SidebarPreferences> = {}) {
  const preferences: SidebarPreferences = { projectSectionOpen: true, personalSectionOpen: true, sectionOrder: ['projects', 'personal'], expandedProjectIds: ['p'], collapsedProjectIds: [], view, projectView: 'collections', sort: 'manual', hiddenProjectIds: [], ungroupedSessionOrder: [], groupedRootOrder: [], groups: [{ id: 'g1', name: '研究', color: 'blue', collapsed: false, sessionIds: ['s2', 's1'] }, { id: 'g2', name: '写作', color: 'green', collapsed: false, sessionIds: [] }], ...savedPreferences }
  const state = { sessions: [{ id: 's1', title: '个人任务', createdAt: 1, updatedAt: 2, status: 'active' }, { id: 's2', title: '项目任务', projectId: 'p', createdAt: 2, updatedAt: 3, status: 'active' }] as HarnessSessionSummary[], projects: [{ id: 'p', name: 'Mira', directory: '/tmp/mira', directoryExists: true, createdAt: 1, updatedAt: 1, sessionCount: 1 }], runningSessionIds: [] as string[], pendingPermissions: {} as Record<string, unknown>, unreadSessionIds: [], session: undefined as { id: string; projectId?: string } | undefined }
  const controller = {
    getPreference: vi.fn(async () => preferences), setPreference: vi.fn(async () => undefined), registerBeforeNavigation: vi.fn(() => () => undefined), getSnapshot: () => state,
    createConversation: vi.fn(async () => ({ id: 'new-session' })), open: vi.fn(async () => undefined), renameProject: vi.fn(async () => undefined), openProject: vi.fn(async () => undefined), selectProject: vi.fn(async () => null as { id: string } | null), reportError: vi.fn(), reorderProjects: vi.fn(async () => undefined), reorderSessions: vi.fn(async () => undefined), moveSession: vi.fn(), deleteSession: vi.fn(),
  }
  const onNewProjectConversation = vi.fn(), onOpenProjectFiles = vi.fn(), onOpenSession = vi.fn()
  const mounted = mount(() => SessionSidebar({ state, controller, width: 260, onClose: vi.fn(), onNewProjectConversation, onOpenProjectFiles, onOpenSession, ...overrides } as unknown as SessionDrawerProps))
  const saved = () => controller.setPreference.mock.calls.at(-1)?.[1] as SidebarPreferences
  return { ...mounted, state, controller, saved, onNewProjectConversation, onOpenProjectFiles, onOpenSession }
}
function dragTask(view: ReturnType<typeof sidebar>, id: string, overId: string, deltaY = 10) {
  const event = { active: { id }, over: { id: overId }, delta: { x: 0, y: deltaY } }
  ;(view.props(p => typeof p.onDragStart === 'function').onDragStart as (event: unknown) => void)(event)
  ;(view.props(p => typeof p.onDragMove === 'function').onDragMove as (event: unknown) => void)(event)
  return { end: () => (view.props(p => typeof p.onDragEnd === 'function').onDragEnd as (event: unknown) => void)(event), cancel: () => (view.props(p => typeof p.onDragCancel === 'function').onDragCancel as () => void)() }
}
function rootOrder(view: ReturnType<typeof sidebar>) {
  return find(view.props(p => 'data-sidebar-root' in p).children as React.ReactNode, p => Array.isArray(p.items))!.items
}

describe('Mira sidebar collections through actual component callbacks', () => {
  it.each([
    ['projects', 'personal', 'ArrowDown', 'ArrowUp'],
    ['personal', 'projects', 'ArrowUp', 'ArrowDown'],
  ])('lets keyboard section dragging return from %s through %s to its original position', async (source, target, forward, backward) => {
    const view = sidebar('project', {}, { sort: 'updated' }); await view.drain()
    const getter = vi.mocked(useSensor).mock.calls.filter(([sensor]) => sensor === KeyboardSensor).at(-1)![1]!.coordinateGetter as KeyboardCoordinateGetter
    const rects = new Map([['sidebar-section:projects', { left: 8, top: 40 }], ['sidebar-section:personal', { left: 8, top: 280 }]])
    const args = (over: string) => ({ active: `sidebar-section:${source}`, currentCoordinates: { x: 8, y: 40 }, context: { active: { id: `sidebar-section:${source}` }, over: { id: `sidebar-section:${over}` }, collisionRect: {}, droppableContainers: { getEnabled: () => [...rects.keys()].map(id => ({ id })) }, droppableRects: rects } }) as unknown as Parameters<KeyboardCoordinateGetter>[1]
    expect(getter({ code: forward, preventDefault: vi.fn() } as unknown as KeyboardEvent, args(source))).toEqual({ x: 8, y: rects.get(`sidebar-section:${target}`)!.top })
    expect(getter({ code: backward, preventDefault: vi.fn() } as unknown as KeyboardEvent, args(target))).toEqual({ x: 8, y: rects.get(`sidebar-section:${source}`)!.top })
    expect(view.controller.setPreference).not.toHaveBeenCalled()
  })

  it('creates a custom group, persists its name, color and collapse state, then dissolves it without deleting sessions', async () => {
    const view = sidebar(); await view.drain()
    ;(view.props(p => p['aria-label'] === '新建分组').onClick as () => void)(); await view.drain()
    const collection = view.props(p => p.id === 'sidebar-group:new-group')
    expect(collection.renaming).toBe(true)
    ;(collection.onRename as (name: string) => void)('资料')
    ;(collection.onColor as (color: string) => void)('red')
    ;(collection.onToggle as () => void)(); await view.drain()
    expect(view.saved().groups.find(group => group.id === 'new-group')).toMatchObject({ name: '资料', color: 'red', collapsed: true })
    ;(view.props(p => p.id === 'sidebar-group:g1').onUngroup as () => void)(); await view.drain()
    expect(view.saved().groups.map(group => group.id)).not.toContain('g1')
    expect(view.saved().ungroupedSessionOrder).toEqual(['s2', 's1'])
    expect(view.controller.deleteSession).not.toHaveBeenCalled(); expect(view.controller.moveSession).not.toHaveBeenCalled()
  })
  it('moves tasks between groups and back out through the real task menu without changing project membership', async () => {
    const writes: SidebarPreferences[] = []
    const store = new SidebarPreferenceStore(async () => ({ groups: [{ id: 'g1', name: 'A', color: 'gray', sessionIds: ['s'], collapsed: false }, { id: 'g2', name: 'B', color: 'blue', sessionIds: [], collapsed: false }] }), async value => { writes.push(value) })
    await store.load()
    const menu = () => SessionMenuItems({ session: { id: 's', projectId: 'p' } as never, projects: [], controller: { getSnapshot: () => ({ unreadSessionIds: [] }) } as never, onRename: vi.fn(), run: vi.fn(), groups: store.getSnapshot().preferences.groups, currentGroupId: store.getSnapshot().preferences.groups.find(group => group.sessionIds.includes('s'))?.id, onMoveGroup: groupId => store.moveSessionToGroup('s', groupId) })
    ;(find(menu(), p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('B'))!.onSelect as () => void)(); await store.save()
    expect(writes.at(-1)!.groups.map(group => group.sessionIds)).toEqual([[], ['s']])
    ;(find(menu(), p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('移出分组'))!.onSelect as () => void)(); await store.save()
    expect(writes.at(-1)!.groups.map(group => group.sessionIds)).toEqual([[], []])
    expect(writes.at(-1)!.ungroupedSessionOrder).toEqual(['s'])
  })
  it('persists manual group and intra-group order from actual drag callbacks', async () => {
    const view = sidebar(); await view.drain()
    const drag = view.props(p => typeof p.onDragEnd === 'function').onDragEnd as (event: unknown) => void
    ;(view.props(p => typeof p.onDragStart === 'function').onDragStart as (event: unknown) => void)({ active: { id: 'sidebar-group:g2' } })
    drag({ active: { id: 'sidebar-group:g2' }, over: { id: 'sidebar-group:g1' } }); await view.drain()
    expect(view.saved().groups.map(group => group.id)).toEqual(['g2', 'g1'])
    ;(view.props(p => typeof p.onDragStart === 'function').onDragStart as (event: unknown) => void)({ active: { id: 's1' } })
    ;(view.props(p => typeof p.onDragMove === 'function').onDragMove as (event: unknown) => void)({ active: { id: 's1' }, over: { id: 's2' }, delta: { x: 0, y: -10 } })
    ;(view.props(p => typeof p.onDragEnd === 'function').onDragEnd as typeof drag)({ active: { id: 's1' }, over: { id: 's2' } }); await view.drain()
    expect(view.saved().groups.find(group => group.id === 'g1')!.sessionIds).toEqual(['s1', 's2'])
    expect(view.controller.reorderSessions).not.toHaveBeenCalled()
  })
  it('drops a project task into an empty custom group without opening it or changing its project', async () => {
    const view = sidebar(); await view.drain()
    ;(view.props(p => typeof p.onDragStart === 'function').onDragStart as (event: unknown) => void)({ active: { id: 's2' } })
    ;(view.props(p => typeof p.onDragEnd === 'function').onDragEnd as (event: unknown) => void)({ active: { id: 's2' }, over: { id: 'sidebar-drop:g2' } }); await view.drain()
    expect(view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's2').currentGroupId).toBe('g2')
    expect(view.saved().groups.map(group => group.sessionIds)).toEqual([['s1'], ['s2']])
    expect(view.controller.setPreference).toHaveBeenCalledOnce()
    expect(view.state.sessions.find(session => session.id === 's2')!.projectId).toBe('p')
    expect(view.onOpenSession).not.toHaveBeenCalled(); expect(view.controller.moveSession).not.toHaveBeenCalled(); expect(view.controller.reorderSessions).not.toHaveBeenCalled()
  })
  it('moves a grouped project task to the root first position in one complete snapshot, without pinning or navigation', async () => {
    const view = sidebar('group', {}, { groupedRootOrder: [{ type: 'group', id: 'g2' }, { type: 'group', id: 'g1' }] }); await view.drain()
    await (view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's2').onMoveTop as () => Promise<void>)(); await view.drain()
    expect(view.saved().groups.map(group => group.sessionIds)).toEqual([['s1'], []])
    expect(view.saved().ungroupedSessionOrder).toEqual(['s2'])
    expect(view.saved().groupedRootOrder).toEqual([{ type: 'session', id: 's2' }, { type: 'group', id: 'g2' }, { type: 'group', id: 'g1' }])
    expect(view.controller.setPreference).toHaveBeenCalledOnce()
    expect(view.state.sessions.find(session => session.id === 's2')).toMatchObject({ projectId: 'p' })
    expect(view.state.sessions.find(session => session.id === 's2')!.pinned).toBeUndefined()
    expect(view.onOpenSession).not.toHaveBeenCalled(); expect(view.controller.open).not.toHaveBeenCalled(); expect(view.controller.moveSession).not.toHaveBeenCalled()
    await (view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's2').onMoveTop as () => Promise<void>)(); await view.drain()
    expect(view.controller.setPreference).toHaveBeenCalledOnce()
  })
  it('gives project, pinned and timeline rows confirmation semantics, and exposes task file trees without opening tasks', async () => {
    const onOpenSessionFiles = vi.fn()
    const view = sidebar('group', { onOpenSessionFiles }); view.state.sessions = view.state.sessions.map((session, index) => index === 0 ? { ...session, pinned: true } : session); await view.drain()
    const projectRow = () => view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's2')
    expect(view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's1').groupedActions).toBe(false)
    expect(projectRow().groupedActions).toBe(true)
    ;(projectRow().onOpenFiles as () => void)()
    expect(onOpenSessionFiles).toHaveBeenCalledExactlyOnceWith('s2')
    expect(view.onOpenSession).not.toHaveBeenCalled(); expect(view.controller.open).not.toHaveBeenCalled()
    ;(view.props(p => p['aria-pressed'] !== undefined && JSON.stringify(p.children).includes('项目')).onClick as () => void)(); await view.drain()
    expect(projectRow().groupedActions).toBe(false); expect(projectRow().onMoveTop).toBeUndefined()
    ;(view.props(p => p.value === 'collections' && typeof p.onValueChange === 'function').onValueChange as (value: string) => void)('timeline'); await view.drain()
    expect(projectRow()).toMatchObject({ groupedActions: false, showProject: true })
  })
  it('does not expose task file-tree actions without a directory, and keeps only one row awaiting archive confirmation', async () => {
    const view = sidebar('project', { onOpenSessionFiles: vi.fn() }); await view.drain()
    const personalRow = () => view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's1')
    const projectRow = () => view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's2')
    expect(personalRow().onOpenFiles).toBeUndefined()
    ;(personalRow().onArchiveConfirmation as (confirming: boolean) => void)(true); await view.drain()
    expect(personalRow().archiveConfirming).toBe(true)
    ;(projectRow().onArchiveConfirmation as (confirming: boolean) => void)(true); await view.drain()
    expect(projectRow().archiveConfirming).toBe(true); expect(personalRow().archiveConfirming).toBe(false)
    ;(view.props(p => p['aria-pressed'] !== undefined && JSON.stringify(p.children).includes('分组')).onClick as () => void)(); await view.drain()
    expect(projectRow().archiveConfirming).toBe(false)
  })
  it.each([-10, 10])('inserts a task before/after a task in another group (direction %s), previews without saving and persists once', async direction => {
    const view = sidebar('group', {}, { groups: [{ id: 'g1', name: '研究', color: 'blue', collapsed: false, sessionIds: ['s1'] }, { id: 'g2', name: '写作', color: 'green', collapsed: false, sessionIds: ['s2'] }] }); await view.drain()
    const drag = dragTask(view, 's1', 's2', direction); await view.drain()
    expect(view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's1').currentGroupId).toBe('g2')
    expect(view.controller.setPreference).not.toHaveBeenCalled()
    drag.end(); await view.drain()
    expect(view.saved().groups.map(group => group.sessionIds)).toEqual([[], direction < 0 ? ['s1', 's2'] : ['s2', 's1']])
    expect(view.controller.setPreference).toHaveBeenCalledOnce()
    expect(view.controller.moveSession).not.toHaveBeenCalled(); expect(view.onOpenSession).not.toHaveBeenCalled()
  })
  it.each([-10, 10])('places a task at the root before/after a collapsed group (%s), preserving collapse and existing members', async direction => {
    const view = sidebar('group', {}, { groups: [{ id: 'g1', name: '研究', color: 'blue', collapsed: false, sessionIds: ['s1'] }, { id: 'g2', name: '写作', color: 'green', collapsed: true, sessionIds: ['s2'] }] }); await view.drain()
    const drag = dragTask(view, 's1', 'sidebar-head:g2', direction); await view.drain()
    expect(rootOrder(view)).toEqual(direction < 0 ? ['sidebar-group:g1', 's1', 'sidebar-group:g2'] : ['sidebar-group:g1', 'sidebar-group:g2', 's1'])
    expect(view.controller.setPreference).not.toHaveBeenCalled()
    drag.end(); await view.drain()
    expect(view.saved().groups).toMatchObject([{ sessionIds: [] }, { collapsed: true, sessionIds: ['s2'] }])
    expect(view.saved().ungroupedSessionOrder).toEqual(['s1'])
    expect(view.saved().groupedRootOrder).toEqual(direction < 0 ? [{ type: 'group', id: 'g1' }, { type: 'session', id: 's1' }, { type: 'group', id: 'g2' }] : [{ type: 'group', id: 'g1' }, { type: 'group', id: 'g2' }, { type: 'session', id: 's1' }])
    expect(view.controller.setPreference).toHaveBeenCalledOnce()
  })
  it.each([
    ['sidebar-head:g2', -10, false], ['sidebar-head:g2', 10, true],
    ['sidebar-tail:g2', -10, true], ['sidebar-tail:g2', 10, false],
  ] as const)('matches expanded-group edge semantics at %s with direction %s', async (target, direction, inside) => {
    const view = sidebar('group', {}, { groups: [{ id: 'g1', name: '研究', color: 'blue', collapsed: false, sessionIds: ['s1'] }, { id: 'g2', name: '写作', color: 'green', collapsed: false, sessionIds: ['s2'] }] }); await view.drain()
    dragTask(view, 's1', target, direction).end(); await view.drain()
    expect(view.saved().groups.map(group => group.sessionIds)).toEqual([[], inside ? target.includes('head') ? ['s1', 's2'] : ['s2', 's1'] : ['s2']])
    expect(view.saved().ungroupedSessionOrder).toEqual(inside ? [] : ['s1'])
    if (!inside) expect(rootOrder(view)).toEqual(direction < 0 ? ['sidebar-group:g1', 's1', 'sidebar-group:g2'] : ['sidebar-group:g1', 'sidebar-group:g2', 's1'])
  })
  it('moves out to an empty root and back into a group without losing interleaved group order', async () => {
    const view = sidebar(); await view.drain()
    dragTask(view, 's1', 'sidebar-root:end').end(); await view.drain()
    expect(rootOrder(view)).toEqual(['sidebar-group:g1', 'sidebar-group:g2', 's1'])
    expect(view.saved().groups.map(group => group.sessionIds)).toEqual([['s2'], []])
    dragTask(view, 's1', 'sidebar-drop:g2').end(); await view.drain()
    expect(rootOrder(view)).toEqual(['sidebar-group:g1', 'sidebar-group:g2'])
    expect(view.saved().ungroupedSessionOrder).toEqual([])
    expect(view.saved().groups.map(group => group.sessionIds)).toEqual([['s2'], ['s1']])
    expect(view.controller.setPreference).toHaveBeenCalledTimes(2)
  })
  it('restores the original display on Escape and rejects a late end callback without any save', async () => {
    const view = sidebar(); await view.drain()
    const drag = dragTask(view, 's1', 'sidebar-drop:g2'); await view.drain()
    expect(view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's1').currentGroupId).toBe('g2')
    drag.cancel(); await view.drain(); drag.end(); await view.drain()
    expect(view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's1').currentGroupId).toBe('g1')
    expect(view.controller.setPreference).not.toHaveBeenCalled()
  })
  it('rolls a failed drop back, shows the actual save error and retries the restored order', async () => {
    const view = sidebar(); await view.drain()
    view.controller.setPreference.mockRejectedValueOnce(new Error('保存任务顺序失败'))
    dragTask(view, 's1', 'sidebar-drop:g2').end(); await view.drain()
    expect(view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's1').currentGroupId).toBe('g1')
    expect(view.props(p => p.role === 'alert')).toBeDefined()
    expect(view.props(p => p.children === '保存任务顺序失败')).toBeDefined()
    expect(view.controller.setPreference).toHaveBeenCalledOnce()
    ;(view.props(p => p.children === '重试').onClick as () => void)(); await view.drain()
    expect(view.saved()).toMatchObject({ groups: [{ sessionIds: ['s2', 's1'] }, { sessionIds: [] }], ungroupedSessionOrder: [], groupedRootOrder: [] })
    expect(view.props(p => p.children === '保存任务顺序失败')).toBeUndefined()
  })
  it.each(['deleted-task', 'deleted-group', 'moved-task'] as const)('does not commit a stale drag after %s', async change => {
    const view = sidebar(); await view.drain()
    const move = view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's1').onMoveGroup as (id?: string) => void
    const drag = dragTask(view, 's1', 'sidebar-drop:g2'); await view.drain()
    if (change === 'deleted-task') view.state.sessions = view.state.sessions.filter(session => session.id !== 's1')
    if (change === 'deleted-group') (view.props(p => p.id === 'sidebar-group:g2').onUngroup as () => void)()
    if (change === 'moved-task') move()
    await view.drain(); view.controller.setPreference.mockClear(); drag.end(); await view.drain()
    expect(view.controller.setPreference).not.toHaveBeenCalled()
  })
  it('preserves the old groups-first root order and sorts groups around existing root tasks', async () => {
    const view = sidebar('group', {}, { groups: [{ id: 'g1', name: '研究', color: 'blue', collapsed: false, sessionIds: ['s1'] }, { id: 'g2', name: '写作', color: 'green', collapsed: false, sessionIds: [] }], ungroupedSessionOrder: ['s2'] }); await view.drain()
    expect(rootOrder(view)).toEqual(['sidebar-group:g1', 'sidebar-group:g2', 's2'])
    dragTask(view, 'sidebar-group:g1', 's2').end(); await view.drain()
    expect(rootOrder(view)).toEqual(['sidebar-group:g2', 's2', 'sidebar-group:g1'])
    expect(view.saved().groups.map(group => group.id)).toEqual(['g2', 'g1'])
    expect(view.saved().groups.find(group => group.id === 'g1')!.sessionIds).toEqual(['s1'])
    expect(view.controller.reorderProjects).not.toHaveBeenCalled(); expect(view.onOpenSession).not.toHaveBeenCalled()
  })
  it('temporarily collapses a dragged group and restores its persisted collapse state on cancel', async () => {
    const view = sidebar(); await view.drain()
    const drag = dragTask(view, 'sidebar-group:g1', 'sidebar-group:g2'); await view.drain()
    expect(view.props(p => p.id === 'sidebar-group:g1').expanded).toBe(false)
    expect(view.controller.setPreference).not.toHaveBeenCalled()
    drag.cancel(); await view.drain()
    expect(view.props(p => p.id === 'sidebar-group:g1').expanded).toBe(true)
    expect(view.controller.setPreference).not.toHaveBeenCalled()
  })
  it('respects time sorting without overwriting manual root interleaving and restores manual ordering when selected again', async () => {
    const view = sidebar('group', {}, { groups: [{ id: 'g1', name: '研究', color: 'blue', collapsed: false, sessionIds: [] }], groupedRootOrder: [{ type: 'session', id: 's1' }, { type: 'group', id: 'g1' }, { type: 'session', id: 's2' }] }); await view.drain()
    expect(rootOrder(view)).toEqual(['s1', 'sidebar-group:g1', 's2'])
    const sort = () => view.props(p => typeof p.onValueChange === 'function' && ['manual', 'updated'].includes(String(p.value))).onValueChange as (value: string) => void
    sort()('updated'); await view.drain()
    expect(rootOrder(view)).toEqual(['sidebar-group:g1', 's2', 's1'])
    expect(view.saved().groupedRootOrder).toEqual([{ type: 'session', id: 's1' }, { type: 'group', id: 'g1' }, { type: 'session', id: 's2' }])
    sort()('manual'); await view.drain()
    expect(rootOrder(view)).toEqual(['s1', 'sidebar-group:g1', 's2'])
  })
  it('does not save when the task remains at the same effective position in legacy preferences', async () => {
    const view = sidebar(); await view.drain()
    dragTask(view, 's1', 's2', 10).end(); await view.drain()
    expect(view.controller.setPreference).not.toHaveBeenCalled()
  })
  it('uses the real collision algorithms to separate task, group and pinned drop targets', async () => {
    const view = sidebar('group', {}, { groups: [{ id: 'g1', name: '研究', color: 'blue', collapsed: false, sessionIds: ['s1'] }, { id: 'g2', name: '写作', color: 'green', collapsed: false, sessionIds: ['s2'] }] })
    view.state.sessions = [...view.state.sessions, { ...view.state.sessions[0]!, id: 'pin', pinned: true }]; await view.drain()
    const rect = { top: 100, bottom: 132, left: 0, right: 200, width: 200, height: 32 }
    const ids = ['sidebar-group:g2', 's2', 'sidebar-drop:g2']
    const args = { active: { id: 's1' }, droppableContainers: ids.map(id => ({ id })), droppableRects: new Map(ids.map(id => [id, rect])), collisionRect: rect, pointerCoordinates: { x: 80, y: 115 } }
    const collision = view.props(p => typeof p.collisionDetection === 'function').collisionDetection as (args: unknown) => Array<{ id: string }>
    expect(collision(args).map(item => item.id)).toEqual(['s2', 'sidebar-drop:g2'])
    expect(collision({ ...args, active: { id: 'sidebar-group:g1' } }).map(item => item.id)).toEqual(['sidebar-group:g2'])
    expect(collision({ ...args, active: { id: 'pin' } })).toEqual([])
  })
  it('retains pinned-only reordering and rejects drops that cross the pinned boundary', async () => {
    const view = sidebar(); view.state.sessions = [{ ...view.state.sessions[0]!, pinned: true }, view.state.sessions[1]!, { ...view.state.sessions[0]!, id: 'pin2', pinned: true }]; await view.drain()
    dragTask(view, 's1', 'sidebar-drop:g2').end(); await view.drain()
    expect(view.controller.setPreference).not.toHaveBeenCalled(); expect(view.controller.reorderSessions).not.toHaveBeenCalled()
    dragTask(view, 's1', 'pin2').end(); await view.drain()
    expect(view.controller.reorderSessions).toHaveBeenCalledExactlyOnceWith({ type: 'pinned' }, ['pin2', 's1'])
    dragTask(view, 's2', 'pin2').end(); await view.drain()
    expect(view.controller.setPreference).not.toHaveBeenCalled()
  })
  it('retains same-project reordering and does not move project or personal tasks across projects', async () => {
    const view = sidebar('project'); view.state.sessions = [...view.state.sessions, { ...view.state.sessions[1]!, id: 'p2' }]; await view.drain()
    dragTask(view, 's1', 's2').end(); await view.drain()
    expect(view.controller.reorderSessions).not.toHaveBeenCalled(); expect(view.controller.setPreference).not.toHaveBeenCalled()
    dragTask(view, 's2', 'p2').end(); await view.drain()
    expect(view.controller.reorderSessions).toHaveBeenCalledExactlyOnceWith({ type: 'project', projectId: 'p' }, ['p2', 's2'])
    expect(view.controller.moveSession).not.toHaveBeenCalled()
  })
  it('requests a draft in the group, expands it and leaves session creation and assignment to the host', async () => {
    const onNewGroupConversation = vi.fn()
    const view = sidebar('group', { onNewGroupConversation }, { groups: [{ id: 'g2', name: '写作', color: 'green', collapsed: true, sessionIds: [] }] }); await view.drain()
    await (view.props(p => p.id === 'sidebar-group:g2').onNewTask as () => Promise<void>)(); await view.drain()
    expect(onNewGroupConversation).toHaveBeenCalledExactlyOnceWith('g2')
    expect(view.saved().groups).toMatchObject([{ collapsed: false, sessionIds: [] }])
    expect(view.controller.createConversation).not.toHaveBeenCalled(); expect(view.onOpenSession).not.toHaveBeenCalled()
  })
  it('does not reopen a task or assign membership when a draft request finishes after navigation', async () => {
    const onNewConversation = vi.fn()
    let complete!: () => void
    const onNewGroupConversation = vi.fn(() => new Promise<void>(resolve => { complete = resolve }))
    const view = sidebar('group', { onNewConversation, onNewGroupConversation }); await view.drain()
    const creation = (view.props(p => p.id === 'sidebar-group:g2').onNewTask as () => Promise<void>)()
    ;(view.props(p => p['aria-label'] === '新建任务').onClick as () => void)()
    complete(); await creation; await view.drain()
    expect(onNewConversation).toHaveBeenCalledOnce(); expect(view.onOpenSession).not.toHaveBeenCalled()
    expect(view.saved().groups.find(group => group.id === 'g2')!.sessionIds).toEqual([])
    expect(view.controller.createConversation).not.toHaveBeenCalled()
  })
  it.each(['extensionsActive', 'automationsActive'] as const)('preserves %s view after a late group draft request', async active => {
    let complete!: () => void
    const overrides: Partial<SessionDrawerProps> = { extensionsActive: false, automationsActive: false, onNewGroupConversation: () => new Promise<void>(resolve => { complete = resolve }) }
    const view = sidebar('group', overrides); await view.drain()
    const creation = (view.props(p => p.id === 'sidebar-group:g2').onNewTask as () => Promise<void>)()
    overrides[active] = true; view.render()
    complete(); await creation; await view.drain()
    expect(view.saved().groups.find(group => group.id === 'g2')!.sessionIds).toEqual([])
    expect(view.onOpenSession).not.toHaveBeenCalled()
  })
  it('reports an unavailable group draft entry without creating an empty real session', async () => {
    const view = sidebar(); await view.drain()
    await (view.props(p => p.id === 'sidebar-group:g2').onNewTask as () => Promise<void>)()
    expect(view.controller.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: '分组草稿入口不可用' }))
    expect(view.controller.createConversation).not.toHaveBeenCalled(); expect(view.onOpenSession).not.toHaveBeenCalled()
  })
  it('places a draft first in its group, counts it once and replaces the empty new-task placeholder', async () => {
    const onOpenDraft = vi.fn(), onCloseDraft = vi.fn()
    const view = sidebar('group', { draft: { draftId: 'draft', groupId: 'g2', selected: true, preparedSessionId: 's2', workspaceLabel: 'Mira' }, onOpenDraft, onCloseDraft }); await view.drain()
    const group = view.props(p => p.id === 'sidebar-group:g2')
    expect(group.count).toBe(1)
    expect(view.props(p => p.groupId === 'g2' && typeof p.onNewTask === 'function')).toBeUndefined()
    const row = (group.children as React.ReactElement[])[0]!.props as { draft: { draftId: string }; active: boolean; onOpen: () => void; onClose: () => void }
    expect(row.draft.draftId).toBe('draft'); expect(row.active).toBe(true)
    row.onOpen(); row.onClose(); await view.drain()
    expect(onOpenDraft).toHaveBeenCalledExactlyOnceWith('draft'); expect(onCloseDraft).toHaveBeenCalledExactlyOnceWith('draft')
    expect(view.allProps(p => Array.isArray(p.items)).flatMap(p => p.items)).not.toContain('draft')
    expect(view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's2')).toBeUndefined()
    expect(view.props(p => p.id === 'sidebar-group:g1').count).toBe(1)
  })
  it('places an ungrouped draft above root items and hides selection in the extension and automation views', async () => {
    const overrides: Partial<SessionDrawerProps> = { draft: { draftId: 'root-draft', selected: true } }
    const view = sidebar('group', overrides); await view.drain()
    view.state.session = { id: 's1' }; view.render()
    expect(view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's1').active).toBe(false)
    const first = (view.props(p => 'data-sidebar-root' in p).children as React.ReactElement[])[0]!
    expect((first.props as { draft: { draftId: string } }).draft.draftId).toBe('root-draft')
    expect(rootOrder(view)).toEqual(['sidebar-group:g1', 'sidebar-group:g2'])
    overrides.extensionsActive = true; view.render()
    expect(view.props(p => (p.draft as { draftId?: string } | undefined)?.draftId === 'root-draft').active).toBe(false)
    overrides.extensionsActive = false; overrides.automationsActive = true; view.render()
    expect(view.props(p => (p.draft as { draftId?: string } | undefined)?.draftId === 'root-draft').active).toBe(false)
  })
  it.each(['collections', 'timeline'] as const)('hides prepared sessions from project %s and pinned candidates', async projectView => {
    const view = sidebar('project', { draft: { draftId: 'draft', selected: false, preparedSessionId: 's2' } }, { projectView });
    view.state.sessions = view.state.sessions.map(session => session.id === 's2' ? { ...session, pinned: true } : session); await view.drain()
    expect(view.props(p => (p.session as HarnessSessionSummary | undefined)?.id === 's2')).toBeUndefined()
    expect(view.allProps(p => Array.isArray(p.items)).flatMap(p => p.items)).not.toContain('s2')
    if (projectView === 'collections') expect(view.props(p => p.id === 'sidebar-project:p').count).toBe(0)
  })
  it('routes project hover actions to the correct project and hides/restores only its sidebar entry', async () => {
    const view = sidebar('project'); await view.drain()
    const project = view.props(p => p.id === 'sidebar-project:p')
    ;(project.onNewTask as () => void)(); (project.onOpenFiles as () => void)()
    await (project.onRename as (name: string) => Promise<void>)('Mira Next')
    await (project.onOpenDirectory as (target: string) => Promise<void>)('terminal')
    expect(view.onNewProjectConversation).toHaveBeenCalledExactlyOnceWith('p'); expect(view.onOpenProjectFiles).toHaveBeenCalledExactlyOnceWith('p')
    expect(view.controller.renameProject).toHaveBeenCalledExactlyOnceWith('p', 'Mira Next'); expect(view.controller.openProject).toHaveBeenCalledExactlyOnceWith('p', 'terminal')
    ;(project.onHide as () => void)(); await view.drain()
    expect(view.saved().hiddenProjectIds).toEqual(['p']); expect(view.props(p => p.id === 'sidebar-project:p')).toBeUndefined()
    ;(view.props(p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('Mira')).onSelect as () => void)(); await view.drain()
    expect(view.saved().hiddenProjectIds).toEqual([]); expect(view.props(p => p.id === 'sidebar-project:p')).toBeDefined()
    expect(view.controller.deleteSession).not.toHaveBeenCalled()
  })
  it('adds a project through the native selection callback and expands/unhides it', async () => {
    const view = sidebar('project'); await view.drain()
    ;(view.props(p => p.id === 'sidebar-project:p').onHide as () => void)(); await view.drain()
    view.controller.selectProject.mockResolvedValueOnce({ id: 'p' })
    ;(view.props(p => p['aria-label'] === '添加项目').onClick as () => void)(); await view.drain()
    expect(view.controller.selectProject).toHaveBeenCalledOnce()
    expect(view.saved()).toMatchObject({ hiddenProjectIds: [], expandedProjectIds: ['p'] })
  })
  it('allows only one native project picker while the selection is pending', async () => {
    const view = sidebar('project'); await view.drain()
    let complete!: (value: null) => void
    view.controller.selectProject.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const select = view.props(p => p['aria-label'] === '添加项目').onClick as () => void
    select(); select(); await view.drain()
    expect(view.controller.selectProject).toHaveBeenCalledOnce(); expect(view.props(p => p['aria-label'] === '添加项目').disabled).toBe(true)
    complete(null); await view.drain()
    expect(view.props(p => p['aria-label'] === '添加项目').disabled).toBe(false)
  })
  it('uses the host search and React automation callbacks without a second local search entry or task highlight', async () => {
    const onSearch = vi.fn(), onOpenAutomations = vi.fn()
    const view = sidebar('group', { onSearch, onOpenAutomations, automationsActive: true }); view.state.session = { id: 's1' }; await view.drain()
    ;(view.props(p => p['aria-label'] === '搜索会话').onClick as () => void)()
    ;(view.props(p => typeof p.onClick === 'function' && JSON.stringify(p.children).includes('自动化')).onClick as () => void)()
    expect(onSearch).toHaveBeenCalledOnce(); expect(onOpenAutomations).toHaveBeenCalledOnce()
    expect(view.props(p => p['aria-label'] === '搜索任务或项目')).toBeUndefined()
    expect(view.props(p => (p.session as { id?: string } | undefined)?.id === 's1').active).toBe(false)
  })
  it('keeps grouped running tasks in their collection without duplicate priority rows', async () => {
    const view = sidebar(); view.state.runningSessionIds.push('s1'); await view.drain()
    expect(view.props(p => p.id === 'sidebar-group:g1').count).toBe(2)
    expect(view.props(p => p.title === '运行中')).toBeUndefined()
  })
  it.each(['running', 'permission', 'failed', 'plan-input', 'plan-confirmation'] as const)('keeps %s tasks in their original project or personal list and counts', async state => {
    const view = sidebar('project'); view.state.session = { id: 's2', projectId: 'p' }; await view.drain()
    const ids = (node: React.ReactNode) => findAll(node, props => Boolean((props.session as HarnessSessionSummary | undefined)?.id)).map(props => (props.session as HarnessSessionSummary).id)
    for (const session of view.state.sessions) {
      if (state === 'failed') session.status = 'failed'
      if (state === 'plan-input') session.planStatus = 'needs_input'
      if (state === 'plan-confirmation') session.planStatus = 'awaiting_confirmation'
    }
    if (state === 'running') view.state.runningSessionIds = ['s1', 's2']
    if (state === 'permission') view.state.pendingPermissions = { s1: {}, s2: {} }
    view.state.sessions = view.state.sessions.map(session => ({ ...session }))
    await view.drain()
    expect(view.props(p => p.id === 'sidebar-project:p').count).toBe(1)
    expect(ids(view.props(p => p.id === 'sidebar-project:p').children as React.ReactNode)).toEqual(['s2'])
    expect(ids(view.props(p => p.title === '个人工作区').children as React.ReactNode)).toEqual(['s1'])
    expect(view.allProps(p => (p.session as HarnessSessionSummary | undefined)?.id === 's1')).toHaveLength(1)
    expect(view.allProps(p => (p.session as HarnessSessionSummary | undefined)?.id === 's2')).toHaveLength(1)
    expect(view.props(p => p.title === '运行中')).toBeUndefined(); expect(view.props(p => p.title === '需要处理')).toBeUndefined()
    expect(view.state.session).toEqual({ id: 's2', projectId: 'p' }); expect(view.onOpenSession).not.toHaveBeenCalled()
    expect(view.controller.setPreference).not.toHaveBeenCalled()
  })
  it('expands/collapses custom groups and projects independently without switching the active task', async () => {
    const view = sidebar(); view.state.session = { id: 's2', projectId: 'p' }; await view.drain()
    ;(view.props(p => p['aria-label'] === '全部折叠').onClick as () => void)(); await view.drain()
    expect(view.saved().groups.every(group => group.collapsed)).toBe(true)
    expect(view.saved().expandedProjectIds).toEqual(['p'])
    ;(view.props(p => p['aria-pressed'] !== undefined && JSON.stringify(p.children).includes('项目')).onClick as () => void)(); await view.drain()
    ;(view.props(p => p['aria-label'] === '全部折叠').onClick as () => void)(); await view.drain()
    expect(view.saved()).toMatchObject({ expandedProjectIds: [], collapsedProjectIds: ['p'] })
    expect(view.saved().groups.every(group => group.collapsed)).toBe(true)
    ;(view.props(p => p['aria-pressed'] !== undefined && JSON.stringify(p.children).includes('分组')).onClick as () => void)(); await view.drain()
    ;(view.props(p => p['aria-label'] === '全部展开').onClick as () => void)(); await view.drain()
    expect(view.saved().groups.every(group => !group.collapsed)).toBe(true)
    expect(view.saved().collapsedProjectIds).toEqual(['p'])
    expect(view.state.session).toEqual({ id: 's2', projectId: 'p' })
    expect(view.onOpenSession).not.toHaveBeenCalled(); expect(view.controller.open).not.toHaveBeenCalled()
  })
  it('includes projects beyond the first page in bulk expansion while preserving hidden-project preferences', async () => {
    const view = sidebar('project', {}, { expandedProjectIds: ['p', 'hidden'], hiddenProjectIds: ['hidden'] })
    view.state.projects = [...view.state.projects, ...Array.from({ length: 8 }, (_, index) => ({ ...view.state.projects[0]!, id: `p${index}`, name: `项目${index}` })), { ...view.state.projects[0]!, id: 'hidden', name: '隐藏项目' }]
    await view.drain()
    expect(view.allProps(p => typeof p.id === 'string' && p.id.startsWith('sidebar-project:'))).toHaveLength(6)
    ;(view.props(p => p['aria-label'] === '全部展开').onClick as () => void)(); await view.drain()
    expect(view.saved().expandedProjectIds).toEqual(['p', 'hidden', ...Array.from({ length: 8 }, (_, index) => `p${index}`)])
    ;(view.props(p => p['aria-label'] === '全部折叠').onClick as () => void)(); await view.drain()
    expect(view.saved().expandedProjectIds).toEqual(['hidden'])
    expect(view.saved().collapsedProjectIds).toEqual(['p', ...Array.from({ length: 8 }, (_, index) => `p${index}`)])
    expect(view.saved().hiddenProjectIds).toEqual(['hidden'])
  })
  it('keeps exactly two primary tabs and restores the selected project timeline after visiting groups or archive', async () => {
    const view = sidebar('project'); await view.drain()
    ;(view.props(p => p.value === 'collections' && typeof p.onValueChange === 'function').onValueChange as (value: string) => void)('timeline'); await view.drain()
    expect(view.saved().projectView).toBe('timeline')
    expect(view.props(p => p['aria-label'] === '任务时间线')).toBeDefined()
    expect(view.props(p => p['aria-label'] === '全部折叠')).toBeUndefined()
    expect(view.props(p => p.id === 'sidebar-project:p')).toBeUndefined()
    expect(view.allProps(p => p['aria-pressed'] !== undefined && Array.isArray(p.children))).toHaveLength(2)
    ;(view.props(p => p['aria-pressed'] !== undefined && JSON.stringify(p.children).includes('分组')).onClick as () => void)(); await view.drain()
    expect(view.props(p => p.id === 'sidebar-group:g1')).toBeDefined()
    ;(view.props(p => p['aria-pressed'] !== undefined && JSON.stringify(p.children).includes('项目')).onClick as () => void)(); await view.drain()
    expect(view.props(p => p['aria-label'] === '任务时间线')).toBeDefined()
    ;(view.props(p => p['aria-label'] === '查看已归档任务').onClick as () => void)(); await view.drain()
    expect(view.props(p => p['aria-label'] === '任务时间线')).toBeUndefined()
    ;(view.props(p => p['aria-label'] === '返回任务列表').onClick as () => void)(); await view.drain()
    expect(view.props(p => p['aria-label'] === '任务时间线')).toBeDefined()
    expect(view.onOpenSession).not.toHaveBeenCalled()
  })
  it('uses one 20-task chronological page with running/pending rows, excludes pinned/hidden tasks and loads more', async () => {
    const view = sidebar('project', {}, { projectView: 'timeline', hiddenProjectIds: ['hidden'] })
    const now = Date.now()
    view.state.sessions = Array.from({ length: 23 }, (_, index) => ({ id: `t${index}`, title: `任务${index}`, createdAt: now - (23 - index) * 1000, updatedAt: now - index * 1000, status: 'active', projectId: index % 2 ? 'p' : undefined }))
    view.state.sessions.push({ ...view.state.sessions[0]!, id: 'pinned', pinned: true }, { ...view.state.sessions[0]!, id: 'hidden', projectId: 'hidden' })
    view.state.runningSessionIds = ['t0']; view.state.pendingPermissions = { t1: {} }; view.state.session = { id: 't2' }
    await view.drain()
    const timelineRows = () => view.allProps(p => p.showProject === true)
    expect(timelineRows().map(row => (row.session as HarnessSessionSummary).id)).toEqual(Array.from({ length: 20 }, (_, index) => `t${index}`))
    expect(timelineRows().every(row => row.sortable === false)).toBe(true)
    expect(view.props(p => p.title === '运行中')).toBeUndefined(); expect(view.props(p => p.title === '需要处理')).toBeUndefined()
    expect(view.allProps(p => (p.session as HarnessSessionSummary | undefined)?.id === 'pinned')).toHaveLength(1)
    ;(view.props(p => p.children === '显示更多任务').onClick as () => void)(); await view.drain()
    expect(timelineRows()).toHaveLength(23)
    expect(view.props(p => p.children === '显示更多任务')).toBeUndefined()
    ;(view.props(p => p.value === 'updated' && typeof p.onValueChange === 'function').onValueChange as (value: string) => void)('created'); await view.drain()
    expect(timelineRows()).toHaveLength(20)
    expect((timelineRows()[0]!.session as HarnessSessionSummary).id).toBe('t22')
    expect(view.props(p => p.value === 'manual')).toBeUndefined()
    expect(view.state.session).toEqual({ id: 't2' }); expect(view.onOpenSession).not.toHaveBeenCalled()
    ;(timelineRows()[0]!.onOpen as () => void)()
    expect(view.onOpenSession).toHaveBeenCalledExactlyOnceWith('t22')
  })
  it('restores hidden projects from the project view menu without adding another toolbar button', async () => {
    const view = sidebar('project', {}, { hiddenProjectIds: ['p'], projectView: 'timeline' }); await view.drain()
    expect(view.props(p => p['aria-label'] === '恢复隐藏项目')).toBeUndefined()
    expect(view.props(p => p['aria-label'] === '任务视图选项')).toBeDefined()
    expect(view.allProps(p => p.showProject === true)).toHaveLength(1)
    ;(view.props(p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('Mira')).onSelect as () => void)(); await view.drain()
    expect(view.allProps(p => p.showProject === true)).toHaveLength(2)
    expect(view.saved().hiddenProjectIds).toEqual([])
  })
  it('does not overwrite saved collapse state when search temporarily reveals collection results', async () => {
    const view = sidebar('project', {}, { expandedProjectIds: [], collapsedProjectIds: ['p'] }); await view.drain()
    expect(view.props(p => p.id === 'sidebar-project:p').expanded).toBe(false)
    ;(view.props(p => p['aria-label'] === '搜索会话').onClick as () => void)(); await view.drain()
    ;(view.props(p => p['aria-label'] === '搜索任务或项目').onChange as (event: unknown) => void)({ target: { value: '项目任务' } }); await view.drain()
    expect(view.props(p => p.id === 'sidebar-project:p').expanded).toBe(true)
    expect(view.props(p => p['aria-label'] === '全部展开')).toBeUndefined()
    expect(view.controller.setPreference).not.toHaveBeenCalled()
    ;(view.props(p => p['aria-label'] === '关闭搜索').onClick as () => void)(); await view.drain()
    expect(view.props(p => p.id === 'sidebar-project:p').expanded).toBe(false)
  })
  it('matches ZCode date buckets and groups by the selected real task timestamp', () => {
    const now = new Date(2026, 9, 25, 12).getTime()
    const dates = [[9, 25], [9, 24], [9, 23], [9, 22], [9, 21], [9, 18], [9, 11], [8, 30], [7, 1]]
    const sessions = dates.map(([month, day], index) => ({ id: `d${index}`, createdAt: now, updatedAt: new Date(2026, month!, day!, 10).getTime() })) as HarnessSessionSummary[]
    expect(groupSidebarTimeline(sessions, 'updated', now).map(group => group.label)).toEqual(['今天', '昨天', '2 天前', '3 天前', '本周', '上周', '本月', '上个月', '更早'])
    expect(groupSidebarTimeline(sessions, 'created', now)).toEqual([{ label: '今天', sessions }])
  })
  it('keeps the rename editor open on failure and ignores IME Enter', async () => {
    const onRename = vi.fn().mockRejectedValueOnce(new Error('保存失败')), onCancelRename = vi.fn()
    const view = mount(() => SidebarCollectionSection({ id: 'p', name: '项目', count: 0, expanded: true, sortable: false, renaming: true, onRename, onCancelRename, onBeginRename: vi.fn(), onNewTask: vi.fn(), onToggle: vi.fn(), children: null } as SidebarCollectionProps))
    const input = view.props(p => p['aria-label'] === '重命名项目'), event = { key: 'Enter', nativeEvent: { isComposing: true }, preventDefault: vi.fn() }
    ;(input.onKeyDown as (event: unknown) => void)(event)
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(onRename).not.toHaveBeenCalled()
    ;(view.props(p => typeof p.onSubmit === 'function').onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() }); await view.drain()
    expect(view.props(p => p.role === 'alert').children).toBe('保存失败'); expect(onCancelRename).not.toHaveBeenCalled()
  })
  it('preserves history semantics in the actual project/group menus', () => {
    const hide = vi.fn(), ungroup = vi.fn(), open = vi.fn()
    const menu = SidebarCollectionMenu({ kind: 'dropdown', name: 'Mira', onNewTask: vi.fn(), onBeginRename: vi.fn(), onHide: hide, onUngroup: ungroup, onOpenDirectory: open })
    ;(find(menu, p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('从侧栏隐藏'))!.onSelect as () => void)()
    ;(find(menu, p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('解散'))!.onSelect as () => void)()
    ;(find(menu, p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('在文件管理器中打开'))!.onSelect as () => void)()
    expect(hide).toHaveBeenCalledOnce(); expect(ungroup).toHaveBeenCalledOnce(); expect(open).toHaveBeenCalledExactlyOnceWith('file-manager')
  })
})
