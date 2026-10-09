import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupSidebarTimeline, SessionMenuItems, SessionSidebar, type SessionDrawerProps } from '../apps/harness-react/src/components/session/SessionSidebar'
import type { HarnessSessionSummary } from '../src/config/harness'
import { SidebarCollectionMenu, SidebarCollectionSection, type SidebarCollectionProps } from '../apps/harness-react/src/components/session/SidebarCollectionSection'
import { SidebarPreferenceStore, type SidebarPreferences } from '../apps/harness-react/src/components/session/sidebar-preferences'

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
vi.mock('@dnd-kit/sortable', async original => ({ ...await original<typeof import('@dnd-kit/sortable')>(), useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: undefined, transition: undefined, isDragging: false }) }))

beforeEach(() => { hooks.cursor = 0; hooks.slots = []; hooks.effects = []; vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }); vi.stubGlobal('crypto', { randomUUID: () => 'new-group' }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })

function find(node: React.ReactNode, match: (props: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  return Array.isArray(node) ? node.map(child => find(child, match)).find(Boolean) : React.isValidElement<Record<string, unknown>>(node) ? match(node.props) ? node.props : find(node.props.children as React.ReactNode, match) : undefined
}
function findAll(node: React.ReactNode, match: (props: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(child => findAll(child, match))
  if (!React.isValidElement<Record<string, unknown>>(node)) return []
  return [...(match(node.props) ? [node.props] : []), ...findAll(node.props.children as React.ReactNode, match)]
}
function mount(renderComponent: () => React.ReactNode) {
  let tree: React.ReactNode
  const render = () => { hooks.cursor = 0; tree = renderComponent(); hooks.effects.splice(0).forEach(effect => effect()) }
  const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); render() } }
  render()
  return { render, drain, props: (match: (props: Record<string, unknown>) => boolean) => find(tree, match)!, allProps: (match: (props: Record<string, unknown>) => boolean) => findAll(tree, match) }
}
function sidebar(view: 'group' | 'project' = 'group', overrides: Partial<SessionDrawerProps> = {}, savedPreferences: Partial<SidebarPreferences> = {}) {
  const preferences: SidebarPreferences = { expandedProjectIds: ['p'], collapsedProjectIds: [], view, projectView: 'collections', sort: 'manual', hiddenProjectIds: [], ungroupedSessionOrder: [], groups: [{ id: 'g1', name: '研究', color: 'blue', collapsed: false, sessionIds: ['s2', 's1'] }, { id: 'g2', name: '写作', color: 'green', collapsed: false, sessionIds: [] }], ...savedPreferences }
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

describe('Mira sidebar collections through actual component callbacks', () => {
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
    const menu = () => SessionMenuItems({ session: { id: 's', projectId: 'p' } as never, projects: [], controller: {} as never, onRename: vi.fn(), run: vi.fn(), groups: store.getSnapshot().preferences.groups, currentGroupId: store.getSnapshot().preferences.groups.find(group => group.sessionIds.includes('s'))?.id, onMoveGroup: groupId => store.moveSessionToGroup('s', groupId) })
    ;(find(menu(), p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('B'))!.onSelect as () => void)(); await store.save()
    expect(writes.at(-1)!.groups.map(group => group.sessionIds)).toEqual([[], ['s']])
    ;(find(menu(), p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('移出分组'))!.onSelect as () => void)(); await store.save()
    expect(writes.at(-1)!.groups.map(group => group.sessionIds)).toEqual([[], []])
    expect(writes.at(-1)!.ungroupedSessionOrder).toEqual(['s'])
  })
  it('persists manual group and intra-group order from actual drag callbacks', async () => {
    const view = sidebar(); await view.drain()
    const drag = view.props(p => typeof p.onDragEnd === 'function').onDragEnd as (event: unknown) => void
    drag({ active: { id: 'sidebar-group:g2' }, over: { id: 'sidebar-group:g1' } }); await view.drain()
    expect(view.saved().groups.map(group => group.id)).toEqual(['g2', 'g1'])
    ;(view.props(p => typeof p.onDragEnd === 'function').onDragEnd as typeof drag)({ active: { id: 's1' }, over: { id: 's2' } }); await view.drain()
    expect(view.saved().groups.find(group => group.id === 'g1')!.sessionIds).toEqual(['s1', 's2'])
    expect(view.controller.reorderSessions).not.toHaveBeenCalled()
  })
  it('creates a real task in a group and preserves assignment when the user switches away before it resolves', async () => {
    const view = sidebar(); await view.drain()
    let complete!: (value: { id: string }) => void
    view.controller.createConversation.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const creation = (view.props(p => p.id === 'sidebar-group:g2').onNewTask as () => Promise<void>)()
    view.state.session = { id: 'other' }; complete({ id: 'new-session' }); await creation; await view.drain()
    expect(view.saved().groups.find(group => group.id === 'g2')!.sessionIds).toEqual(['new-session'])
    expect(view.onOpenSession).not.toHaveBeenCalled()
  })
  it('does not steal a fresh task draft when group creation finishes late', async () => {
    const onNewConversation = vi.fn()
    const view = sidebar('group', { onNewConversation }); await view.drain()
    let complete!: (value: { id: string }) => void
    view.controller.createConversation.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const creation = (view.props(p => p.id === 'sidebar-group:g2').onNewTask as () => Promise<void>)()
    ;(view.props(p => p['aria-label'] === '新建任务').onClick as () => void)()
    complete({ id: 'new-session' }); await creation; await view.drain()
    expect(onNewConversation).toHaveBeenCalledOnce(); expect(view.onOpenSession).not.toHaveBeenCalled()
    expect(view.saved().groups.find(group => group.id === 'g2')!.sessionIds).toEqual(['new-session'])
  })
  it.each(['extensionsActive', 'automationsActive'] as const)('preserves %s view after a late group task is created', async active => {
    const overrides: Partial<SessionDrawerProps> = { extensionsActive: false, automationsActive: false }
    const view = sidebar('group', overrides); await view.drain()
    let complete!: (value: { id: string }) => void
    view.controller.createConversation.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const creation = (view.props(p => p.id === 'sidebar-group:g2').onNewTask as () => Promise<void>)()
    overrides[active] = true; view.render()
    complete({ id: 'new-session' }); await creation; await view.drain()
    expect(view.saved().groups.find(group => group.id === 'g2')!.sessionIds).toEqual(['new-session'])
    expect(view.onOpenSession).not.toHaveBeenCalled()
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
