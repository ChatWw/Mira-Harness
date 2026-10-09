import * as React from 'react'
import { useExternalStoreRuntime } from '@assistant-ui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessWorkbench } from '../apps/harness-react/src/components/workbench/HarnessWorkbench'
import { HarnessCommandCenter, type HarnessCommandCenterProps } from '../apps/harness-react/src/components/search/HarnessCommandCenter'
import { HarnessComposer, type HarnessComposerHandle } from '../apps/harness-react/src/components/composer/HarnessComposer'
import { AutomationsView } from '../apps/harness-react/src/components/automations/AutomationsView'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessSession } from '../src/config/harness'
import { parseFirstPartyNavigationPath } from '../src/platform/firstPartyNavigation'
import { SidebarPreferenceStore } from '../apps/harness-react/src/components/session/sidebar-preferences'
import { ProjectFileDrawer } from '../apps/harness-react/src/components/workspace/ProjectFileDrawer'

const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, (value: unknown) => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true } }] },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (!slot.deps || deps.length !== slot.deps.length || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = factory(); slot.deps = deps }; return slot.value },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useImperativeHandle: (ref: { current: unknown } | null, create: () => unknown) => { if (ref) ref.current = create() },
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return; slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) },
}))
vi.mock('@assistant-ui/react', () => ({ AssistantRuntimeProvider: 'runtime', MessagePrimitive: {}, ThreadPrimitive: { Root: 'thread', Viewport: 'viewport', Messages: 'messages', ScrollToBottom: 'scroll-to-bottom' }, useAuiState: vi.fn(), useExternalStoreRuntime: vi.fn(() => ({})) }))
vi.mock('../apps/harness-react/src/components/session/SessionSidebar', () => ({ SessionSidebar: 'session-sidebar', SessionMenuItems: 'session-menu', useHarnessSessionShortcuts: vi.fn() }))
vi.mock('../apps/harness-react/src/hooks/useModalFocusTrap', () => ({ useModalFocusTrap: vi.fn() }))

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (value: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
const task = (id: string, projectId?: string): HarnessSession => ({ version: 1, id, title: id, ...(projectId ? { projectId } : {}), workingDirectory: '/project', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false })
function fixture() {
  const records = [task('a', 'project-a'), task('b', 'project-b')]
  const host = {
    getPreference: vi.fn(async (_key: string) => null), setPreference: vi.fn(async (_key: string, _value: unknown) => undefined), navigate: vi.fn(async (_path: string) => undefined),
    getSession: vi.fn(async (id: string) => records.find(item => item.id === id) ?? task(id)), listPendingPermissions: vi.fn(async () => []),
    listSessions: vi.fn(async () => records), listProjects: vi.fn(async () => [{ id: 'project-a', name: 'A', directory: '/project-a', directoryExists: true }, { id: 'project-b', name: 'B', directory: '/project-b', directoryExists: true }, { id: 'empty', name: 'Empty', directory: '/empty', directoryExists: true }]),
    createSession: vi.fn(async () => task('created', 'empty')), setSessionUnread: vi.fn(async () => undefined),
  }
  const controller = new PilotController(host as unknown as PilotHost)
  Object.assign(controller.getSnapshot(), { session: records[0], sessions: records, projects: projectFixtures() })
  return { controller, host }
}
function projectFixtures() { return [{ id: 'project-a', name: 'A', directory: '/project-a', directoryExists: true }, { id: 'project-b', name: 'B', directory: '/project-b', directoryExists: true }, { id: 'empty', name: 'Empty', directory: '/empty', directoryExists: true }] }

function mount(controller: PilotController) {
  let tree: React.ReactNode, mounted = true
  const composer = { prepareSession: vi.fn(async (_isCurrent?: () => boolean) => undefined), addFileReference: vi.fn() } as unknown as HarnessComposerHandle
  const visit = (node: React.ReactNode, callback: (node: React.ReactElement<Record<string, unknown>>) => void) => { if (Array.isArray(node)) { node.forEach(child => visit(child, callback)); return }; if (!React.isValidElement<Record<string, unknown>>(node)) return; callback(node); visit(node.props.children as React.ReactNode, callback) }
  const props = (match: (props: Record<string, unknown>, element: React.ReactElement<Record<string, unknown>>) => boolean) => { let found: Record<string, unknown> | undefined; visit(tree, element => { if (!found && match(element.props, element)) found = element.props }); if (!found) throw new Error('Missing workbench element'); return found }
  const render = () => { hooks.cursor = 0; hooks.dirty = false; tree = HarnessWorkbench({ controller }); visit(tree, element => { if (element.type === HarnessComposer) (element.props.ref as React.RefObject<unknown>).current = composer }); hooks.effects.splice(0).forEach(callback => callback()) }
  const drain = async () => { for (let i = 0; i < 32; i++) { await Promise.resolve(); if (mounted) render() } }
  const sidebar = () => props((_, element) => element.type === 'session-sidebar')
  const commandCenter = () => props((_, element) => element.type === HarnessCommandCenter) as unknown as HarnessCommandCenterProps
  const command = (id: string) => commandCenter().commands.find(item => item.id === id)!.action()
  const newTask = () => { (sidebar().onNewConversation as () => void)(); render() }
  const view = (name: 'automations' | 'extensions') => { (sidebar()[name === 'automations' ? 'onOpenAutomations' : 'onOpenExtensions'] as () => void)() }
  render()
  return { composer, render, drain, sidebar, commandCenter, command, newTask, view, props, unmount: () => { mounted = false; hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) } }
}
beforeEach(() => { hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; vi.useFakeTimers(); vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }); vi.stubGlobal('window', { setTimeout, clearTimeout, requestAnimationFrame: (callback: () => void) => callback(), addEventListener: vi.fn(), removeEventListener: vi.fn(), matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('first-screen navigation owns each awaited transition', () => {
  it('enables the runtime send action while running only when all queue capabilities exist', async () => {
    const { controller, host } = fixture()
    Object.assign(controller.getSnapshot(), { selection: { providerId: 'provider', modelId: 'model' }, running: true })
    const view = mount(controller); await view.drain()
    const options = () => vi.mocked(useExternalStoreRuntime).mock.calls.at(-1)![0]
    expect(options().isSendDisabled).toBe(true)
    Object.assign(host, { submitMessage: vi.fn(), getMessageQueue: vi.fn(), withdrawMessage: vi.fn(), resumeMessageQueue: vi.fn() })
    view.render()
    expect(options().isSendDisabled).toBe(false)
    Object.assign(controller.getSnapshot(), { sessionLoading: true }); view.render()
    expect(options().isSendDisabled).toBe(true)
  })
  it('disables reply regeneration while a paused queue still owns the next messages', async () => {
    const { controller } = fixture()
    const state = controller.getSnapshot()
    Object.assign(state, { selection: { providerId: 'provider', modelId: 'model' }, queue: { sessionId: 'a', revision: 1, items: [{ id: 'pending' }], paused: 'stopped' } })
    const view = mount(controller); await view.drain()
    const context = () => view.props(p => Boolean(p.value && typeof p.value === 'object' && 'canRerun' in p.value)).value as { canRerun: boolean }
    expect(context().canRerun).toBe(false)
    Object.assign(state, { queue: { sessionId: 'a', revision: 2, items: [] } }); view.render()
    expect(context().canRerun).toBe(true)
  })
  it('does not open a stale task after a newer new-task action wins during draft flush', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const flush = deferred<void>(); controller.registerBeforeNavigation(() => flush.promise)
    const opening = view.commandCenter().onOpenSession({ id: 'b', title: 'b', snippet: '', updatedAt: 1 })
    await view.drain(); view.newTask(); flush.resolve(); await opening; await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined(); expect(host.getSession).not.toHaveBeenCalled()
  })
  it('does not commit a stale task when another main view wins while getSession is pending', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const loaded = deferred<HarnessSession>(); host.getSession.mockReturnValueOnce(loaded.promise)
    const opening = view.commandCenter().onOpenSession({ id: 'b', title: 'b', snippet: '', updatedAt: 1 }); await view.drain()
    expect(controller.getSnapshot()).toMatchObject({ session: { id: 'a' }, sessionLoading: true })
    view.view('automations'); await view.drain(); loaded.resolve(task('b')); await opening; await view.drain()
    expect(controller.getSnapshot()).toMatchObject({ session: { id: 'a' }, sessionLoading: false })
    expect(view.sidebar().automationsActive).toBe(true)
    expect(host.setPreference.mock.calls.some(([key, value]) => key === 'active-session' && value === 'b')).toBe(false)
  })
  it('opens project files without waiting for a conversation draft flush or changing the task', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const flush = vi.fn(() => new Promise<void>(() => {})); controller.registerBeforeNavigation(flush)
    ;(view.sidebar().onOpenProjectFiles as (id: string) => void)('empty'); await view.drain()
    const drawer = view.props((_, element) => element.type === ProjectFileDrawer)
    expect(drawer).toMatchObject({ projectId: 'empty', directory: '/empty' })
    expect(drawer.sessionId).toBeUndefined()
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(flush).not.toHaveBeenCalled()
    expect(host.createSession).not.toHaveBeenCalled(); expect(host.getSession).not.toHaveBeenCalled()
  })
  it('keeps the automation view while browsing files for a project without any tasks', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    view.view('automations'); await view.drain()
    ;(view.sidebar().onOpenProjectFiles as (id: string) => void)('empty'); await view.drain()
    const drawer = view.props((_, element) => element.type === ProjectFileDrawer)
    expect(drawer.projectId).toBe('empty')
    expect(view.props((_, element) => element.type === AutomationsView).active).toBe(true)
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(host.createSession).not.toHaveBeenCalled(); expect(host.getSession).not.toHaveBeenCalled()
    ;(drawer.onBack as () => void)(); await view.drain()
    expect(view.sidebar().automationsActive).toBe(true)
  })
  it('opens the sidebar project tree from an empty draft without preparing a task', async () => {
    const { controller, host } = fixture(); controller.newConversation()
    const view = mount(controller); await view.drain()
    ;(view.sidebar().onOpenProjectFiles as (id: string) => void)('empty'); await view.drain()
    expect(view.props((_, element) => element.type === ProjectFileDrawer).projectId).toBe('empty')
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(view.composer.prepareSession).not.toHaveBeenCalled()
    expect(host.createSession).not.toHaveBeenCalled(); expect(host.getSession).not.toHaveBeenCalled()
  })
  it('does not render task status or file-tree controls in the conversation header', async () => {
    const { controller } = fixture()
    Object.assign(controller.getSnapshot(), { messages: [{ id: 'message', role: 'user', content: 'Header test', createdAt: 1 }] })
    const view = mount(controller); await view.drain()
    expect(() => view.props(p => p['aria-label'] === '查看文件')).toThrow('Missing workbench element')
    expect(() => view.props(p => p.className === 'pilot-inspector__state')).toThrow('Missing workbench element')
  })
  it('does not reopen a searched file or its panel after a newer new-task action wins', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const flush = deferred<void>(); controller.registerBeforeNavigation(() => flush.promise)
    const opening = view.commandCenter().onOpenFile('b', 'README.md'); await view.drain(); view.newTask(); flush.resolve(); await opening; await view.drain()
    expect(host.getSession).not.toHaveBeenCalled(); expect(controller.getSnapshot().session).toBeUndefined()
    expect(view.props(p => p['aria-label'] === '工作区')['aria-expanded']).toBe(false)
  })
  it('does not create a task merely to open files when no project is selected', async () => {
    const { controller, host } = fixture(); controller.newConversation(); const view = mount(controller); await view.drain()
    await view.command('files'); await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(controller.getSnapshot().error).toBe('请先在侧栏选择项目')
    expect(view.composer.prepareSession).not.toHaveBeenCalled(); expect(host.createSession).not.toHaveBeenCalled()
  })
  it.each(['terminal', 'browser'])('threads the live navigation guard through no-session %s preparation', async id => {
    const { controller, host } = fixture(); controller.newConversation(); const view = mount(controller); await view.drain()
    const created = deferred<HarnessSession>(); host.createSession.mockReturnValueOnce(created.promise)
    const prepare = view.composer.prepareSession as ReturnType<typeof vi.fn>
    prepare.mockImplementationOnce(async (isCurrent: () => boolean) => await controller.create(undefined, isCurrent) ? controller.getSnapshot().session?.id : undefined)
    const opening = view.command(id); await view.drain(); expect(prepare).toHaveBeenCalledWith(expect.any(Function))
    view.newTask(); created.resolve(task('created')); await opening; await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined(); expect(host.getSession).not.toHaveBeenCalled()
    expect(view.props(p => p['aria-label'] === '工作区')['aria-expanded']).toBe(false)
  })
  it('does not hide search failures behind a successful result callback', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    host.getSession.mockRejectedValueOnce(new Error('目标任务已删除'))
    await expect(view.commandCenter().onOpenSession({ id: 'b', title: 'b', snippet: '', updatedAt: 1 })).rejects.toThrow('目标任务已删除')
    expect(controller.getSnapshot().session?.id).toBe('a')
  })
  it('discards guarded session completion after the workbench unmounts', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const loaded = deferred<HarnessSession>(); host.getSession.mockReturnValueOnce(loaded.promise)
    const opening = view.commandCenter().onOpenSession({ id: 'b', title: 'b', snippet: '', updatedAt: 1 }); await view.drain(); view.unmount(); loaded.resolve(task('b')); await opening
    expect(controller.getSnapshot().session?.id).toBe('a')
  })
  it('routes automation model management to the actual first-party allowlisted settings', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain(); view.view('automations'); await view.drain()
    ;(view.props((_, element) => element.type === AutomationsView).onManageModels as () => void)(); await view.drain()
    expect(host.navigate).toHaveBeenCalledExactlyOnceWith('/settings/model-config')
  })
  it('opens the command-center settings entry through the actual first-party allowlist', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    host.navigate.mockImplementationOnce(async path => { parseFirstPartyNavigationPath(path) })
    await view.command('settings'); await view.drain()
    expect(host.navigate).toHaveBeenCalledExactlyOnceWith('/settings/general')
    expect(controller.getSnapshot().error).toBeUndefined()
  })
})

describe('Header and sidebar own one persisted grouping store', () => {
  const saved = { view: 'group', projectView: 'timeline', expandedProjectIds: ['project-b'], collapsedProjectIds: ['project-a'], groups: [{ id: 'research', name: '研究', color: 'blue', collapsed: false, sessionIds: ['a'] }, { id: 'writing', name: '写作', color: 'green', collapsed: true, sessionIds: [] }] }
  function headerFixture(read?: () => Promise<unknown>) {
    const value = fixture()
    const message = { id: 'question', role: 'user' as const, content: 'Header test', createdAt: 1 }
    Object.assign(value.controller.getSnapshot(), { messages: [message] })
    value.host.getPreference.mockImplementation(async key => key === 'session-drawer' ? read ? read() : structuredClone(saved) : null)
    const view = mount(value.controller)
    const header = () => view.props((_, element) => element.type === 'session-menu')
    return { ...value, ...view, header }
  }
  it('updates sidebar membership immediately from the Header without changing project or active task', async () => {
    const view = headerFixture(); await view.drain()
    const store = view.sidebar().preferenceStore as SidebarPreferenceStore
    expect(view.header().currentGroupId).toBe('research')
    ;(view.header().onMoveGroup as (id: string) => void)('writing'); await view.drain()
    expect(view.header().currentGroupId).toBe('writing')
    expect(store.getSnapshot().preferences.groups.map(group => group.sessionIds)).toEqual([[], ['a']])
    expect(view.sidebar().preferenceStore).toBe(store)
    expect(view.controller.getSnapshot().session).toMatchObject({ id: 'a', projectId: 'project-a' })
    expect(view.host.getSession).not.toHaveBeenCalled()
  })
  it('preserves the same store while the sidebar is closed and reopens with Header changes and collapse preferences', async () => {
    const view = headerFixture(); await view.drain()
    const store = view.sidebar().preferenceStore as SidebarPreferenceStore
    ;(view.props(p => p['aria-label'] === '会话').onClick as () => void)(); await view.drain()
    expect(() => view.sidebar()).toThrow('Missing workbench element')
    ;(view.header().onMoveGroup as (id?: string) => void)(); await view.drain()
    expect(view.header().currentGroupId).toBeUndefined()
    ;(view.props(p => p['aria-label'] === '会话').onClick as () => void)(); await view.drain()
    expect(view.sidebar().preferenceStore).toBe(store)
    expect(store.getSnapshot().preferences).toMatchObject({ projectView: 'timeline', expandedProjectIds: ['project-b'], collapsedProjectIds: ['project-a'], ungroupedSessionOrder: ['a'], groups: [{ collapsed: false, sessionIds: [] }, { collapsed: true, sessionIds: [] }] })
    expect(view.host.getPreference.mock.calls.filter(([key]) => key === 'session-drawer')).toHaveLength(1)
  })
  it('saves Header membership before navigation and restores it after a new Workbench mount', async () => {
    const view = headerFixture(); await view.drain()
    let stored: unknown
    view.host.setPreference.mockImplementation(async (key, value) => { if (key === 'session-drawer') stored = structuredClone(value) })
    ;(view.header().onMoveGroup as (id: string) => void)('writing'); await view.drain()
    await view.controller.navigate('/settings/general')
    view.unmount(); hooks.cursor = 0; hooks.slots = []; hooks.effects = []
    view.host.getPreference.mockImplementation(async key => key === 'session-drawer' ? stored : null)
    const restored = mount(view.controller); await restored.drain()
    expect(restored.props((_, element) => element.type === 'session-menu').currentGroupId).toBe('writing')
    expect((restored.sidebar().preferenceStore as SidebarPreferenceStore).getSnapshot().preferences).toMatchObject({ projectView: 'timeline', collapsedProjectIds: ['project-a'] })
  })
  it('blocks Header grouping while hydration is pending and retries failed preferences without resetting the current task', async () => {
    const reading = deferred<unknown>()
    const view = headerFixture(() => reading.promise)
    expect(view.header().groupsReady).toBe(false)
    ;(view.header().onMoveGroup as (id: string) => void)('writing')
    reading.reject(new Error('读取分组失败')); await view.drain()
    expect(view.header().groupsReady).toBe(false)
    expect(view.host.setPreference.mock.calls.filter(([key]) => key === 'session-drawer')).toHaveLength(0)
    view.host.getPreference.mockImplementation(async key => key === 'session-drawer' ? structuredClone(saved) : null)
    ;(view.props(p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('重试分组偏好')).onSelect as () => void)(); await view.drain()
    expect(view.header().groupsReady).toBe(true); expect(view.header().currentGroupId).toBe('research')
    expect(view.controller.getSnapshot().session?.id).toBe('a')
  })
})

function mountComposer(controller: PilotController) {
  let active = true, tree: React.ReactNode
  const handle = { current: null as HarnessComposerHandle | null }
  const textarea = { style: {} as Record<string, string>, scrollHeight: 40, selectionStart: 0, selectionEnd: 0, focus: vi.fn(), closest: () => null }
  const visit = (node: React.ReactNode): Record<string, unknown> | undefined => { if (Array.isArray(node)) return node.map(visit).find(Boolean); if (!React.isValidElement<Record<string, unknown>>(node)) return; return node.type === 'textarea' ? node.props : visit(node.props.children as React.ReactNode) }
  const render = () => {
    hooks.cursor = 0; hooks.dirty = false
    tree = (HarnessComposer as unknown as { render(props: unknown, ref: unknown): React.ReactElement }).render({ state: controller.getSnapshot(), controller, active, planning: false, setPlanning: vi.fn() }, handle)
    const input = visit(tree)!; (input.ref as React.RefObject<unknown>).current = textarea
    hooks.effects.splice(0).forEach(callback => callback())
  }
  const drain = async () => { for (let i = 0; i < 30; i++) { await Promise.resolve(); render() } }
  render()
  return { handle, drain, text: () => visit(tree)!.value, type: async (value: string) => { textarea.selectionStart = value.length; textarea.selectionEnd = value.length; (visit(tree)!.onChange as (event: unknown) => void)({ target: { value, selectionStart: value.length, selectionEnd: value.length } }); await drain() }, hide: async () => { active = false; render(); await drain() } }
}

describe('real Composer imperative preparation keeps navigation ownership', () => {
  it('can prepare a hidden draft only for an explicit live workbench transition', async () => {
    const { controller } = fixture(); controller.newConversation(); const view = mountComposer(controller); await view.drain()
    await view.type('原有工作区草稿'); await view.hide()
    expect(await view.handle.current!.prepareSession()).toBeUndefined()
    expect(await view.handle.current!.prepareSession(() => true)).toBe('created'); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('created'); expect(view.text()).toBe('原有工作区草稿')
  })
  it('preserves the original draft and does not open a created session after a canceled hidden transition', async () => {
    const { controller, host } = fixture(); controller.newConversation(); const view = mountComposer(controller); await view.drain()
    await view.type('未发送原稿'); await view.hide()
    const created = deferred<HarnessSession>(); host.createSession.mockReturnValueOnce(created.promise)
    let current = true
    const preparing = view.handle.current!.prepareSession(() => current); await view.drain()
    current = false; created.resolve(task('created')); await preparing; await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined(); expect(host.getSession).not.toHaveBeenCalled(); expect(view.text()).toBe('未发送原稿')
  })
})
