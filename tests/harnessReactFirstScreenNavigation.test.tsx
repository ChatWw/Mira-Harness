import * as React from 'react'
import { useExternalStoreRuntime } from '@assistant-ui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessWorkbench } from '../apps/harness-react/src/components/workbench/HarnessWorkbench'
import { HarnessCommandCenter, type HarnessCommandCenterProps } from '../apps/harness-react/src/components/search/HarnessCommandCenter'
import { HarnessComposer, type HarnessComposerHandle } from '../apps/harness-react/src/components/composer/HarnessComposer'
import type { ComposerTaskDraft } from '../apps/harness-react/src/lib/composer-drafts'
import { AutomationsView, type AutomationsNavigationHandle } from '../apps/harness-react/src/components/automations/AutomationsView'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessSession } from '../src/config/harness'
import { parseFirstPartyNavigationPath } from '../src/platform/firstPartyNavigation'
import { SidebarPreferenceStore } from '../apps/harness-react/src/components/session/sidebar-preferences'
import { ProjectFileDrawer } from '../apps/harness-react/src/components/workspace/ProjectFileDrawer'
import type { MiraAppNavigationCommand, MiraAppNavigationSnapshot, MiraAppNavigationState, MiraAppNavigationTarget } from '../src/platform/appNavigation'

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
function fixture({ autoRestore = true, snapshot }: { autoRestore?: boolean; snapshot?: MiraAppNavigationSnapshot } = {}) {
  let records = [task('a', 'project-a'), task('b', 'project-b')]
  const commands = new Set<(command: MiraAppNavigationCommand) => void>(), restores = new Set<(snapshot: MiraAppNavigationSnapshot | undefined) => void>()
  const host = {
    getPreference: vi.fn(async (_key: string) => null), setPreference: vi.fn(async (_key: string, _value: unknown) => undefined), navigate: vi.fn(async (_path: string) => undefined),
    getSession: vi.fn(async (id: string) => records.find(item => item.id === id) ?? task(id)), listPendingPermissions: vi.fn(async () => []),
    listSessions: vi.fn(async () => records), listProjects: vi.fn(async () => [{ id: 'project-a', name: 'A', directory: '/project-a', directoryExists: true }, { id: 'project-b', name: 'B', directory: '/project-b', directoryExists: true }, { id: 'empty', name: 'Empty', directory: '/empty', directoryExists: true }]),
    createSession: vi.fn(async () => task('created', 'empty')), prepareSession: vi.fn(async () => ({ ...task('created', 'empty'), draftState: 'prepared' as const })), setSessionUnread: vi.fn(async () => undefined),
    openSessionProject: vi.fn(async (_id: string, _target: 'file-manager' | 'terminal') => ''),
    deleteSession: vi.fn(async (id: string) => { records = records.filter(item => item.id !== id) }),
    archiveSession: vi.fn(async (id: string) => { records = records.map(item => item.id === id ? { ...item, status: 'archived' } : item) }),
    publishNavigationState: vi.fn<(state: MiraAppNavigationState) => void>(),
    onNavigationCommand: vi.fn((listener: (command: MiraAppNavigationCommand) => void) => { commands.add(listener); return () => { commands.delete(listener) } }),
    onNavigationRestore: vi.fn((listener: (snapshot: MiraAppNavigationSnapshot | undefined) => void) => { restores.add(listener); if (autoRestore) listener(snapshot); return () => { restores.delete(listener) } }),
  }
  const controller = new PilotController(host as unknown as PilotHost)
  Object.assign(controller.getSnapshot(), { initialized: true, session: records[0], sessions: records, projects: projectFixtures() })
  const navigation = () => host.publishNavigationState.mock.lastCall![0]
  return { controller, host, navigation, restore: (value?: MiraAppNavigationSnapshot) => restores.forEach(listener => listener(value)), go: (direction: 'back' | 'forward', expectedRevision = navigation().revision) => commands.forEach(listener => listener({ type: 'mira:app-navigation-command', direction, expectedRevision })) }
}
function projectFixtures() { return [{ id: 'project-a', name: 'A', directory: '/project-a', directoryExists: true }, { id: 'project-b', name: 'B', directory: '/project-b', directoryExists: true }, { id: 'empty', name: 'Empty', directory: '/empty', directoryExists: true }] }

function mount(controller: PilotController) {
  let tree: React.ReactNode, mounted = true
  let boundAutomations: React.Ref<AutomationsNavigationHandle> | undefined, automationTarget: MiraAppNavigationTarget = { kind: 'automations' }, automationDraft = false
  const composer = { prepareSession: vi.fn(async (_isCurrent?: () => boolean) => undefined), addFileReference: vi.fn() } as unknown as HarnessComposerHandle
  const automations = { navigate: vi.fn<AutomationsNavigationHandle['navigate']>(async (target, isCurrent = () => true, restoreNewDraft = false) => { await Promise.resolve(); if (!isCurrent()) return false; automationTarget = target; automationDraft = restoreNewDraft; return true }) }
  const visit = (node: React.ReactNode, callback: (node: React.ReactElement<Record<string, unknown>>) => void) => { if (Array.isArray(node)) { node.forEach(child => visit(child, callback)); return }; if (!React.isValidElement<Record<string, unknown>>(node)) return; callback(node); visit(node.props.children as React.ReactNode, callback) }
  const props = (match: (props: Record<string, unknown>, element: React.ReactElement<Record<string, unknown>>) => boolean, node = tree) => { let found: Record<string, unknown> | undefined; visit(node, element => { if (!found && match(element.props, element)) found = element.props }); if (!found) throw new Error('Missing workbench element'); return found }
  const pageProps = (match: Parameters<typeof props>[0]) => props(match, props((p, element) => element.type === 'main' && !p.hidden && String(p.className).includes('mira-thread-panel')).children as React.ReactNode)
  const render = () => {
    hooks.cursor = 0; hooks.dirty = false; tree = HarnessWorkbench({ controller })
    visit(tree, element => {
      if (element.type === HarnessComposer) (element.props.ref as React.RefObject<unknown>).current = composer
      if (element.type === AutomationsView && element.props.ref !== boundAutomations) {
        boundAutomations = element.props.ref as React.Ref<AutomationsNavigationHandle>
        if (typeof boundAutomations === 'function') boundAutomations(automations)
        else if (boundAutomations) boundAutomations.current = automations
      }
    })
    hooks.effects.splice(0).forEach(callback => callback())
  }
  const drain = async () => { for (let i = 0; i < 32; i++) { await Promise.resolve(); if (mounted) render() } }
  const sidebar = () => props((_, element) => element.type === 'session-sidebar')
  const commandCenter = () => props((_, element) => element.type === HarnessCommandCenter) as unknown as HarnessCommandCenterProps
  const command = (id: string) => commandCenter().commands.find(item => item.id === id)!.action()
  const newTask = () => { (sidebar().onNewConversation as () => void)(); render() }
  const view = (name: 'automations' | 'extensions') => { (sidebar()[name === 'automations' ? 'onOpenAutomations' : 'onOpenExtensions'] as () => void)() }
  const automationProps = () => props((_, element) => element.type === AutomationsView)
  render()
  return { composer, automations, automationProps, automationTarget: () => automationTarget, automationDraft: () => automationDraft, selectAutomation: (target: Extract<MiraAppNavigationTarget, { kind: 'automations' }>) => { automationTarget = target; automationDraft = false; (automationProps().onNavigationChange as (target: MiraAppNavigationTarget) => void)(target) }, newAutomation: () => { automationDraft = true; (automationProps().onDraftNavigation as () => void)() }, render, drain, sidebar, commandCenter, command, newTask, view, props, pageProps, unmount: () => { mounted = false; if (typeof boundAutomations === 'function') boundAutomations(null); hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) } }
}
beforeEach(() => { hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; vi.useFakeTimers(); vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }); vi.stubGlobal('window', { setTimeout, clearTimeout, requestAnimationFrame: (callback: () => void) => callback(), addEventListener: vi.fn(), removeEventListener: vi.fn(), matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('first-screen navigation owns each awaited transition', () => {
  it('refocuses every Shell search request and returns only the latest opening identity on dismissal', async () => {
    const setup = fixture()
    const listeners = new Set<(focusRequestId?: string) => void>()
    const dismiss = vi.fn(() => true)
    Object.assign(setup.host, { onCommandCenterOpen: (listener: (focusRequestId?: string) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, dismissCommandCenterFocus: dismiss })
    const view = mount(setup.controller)
    listeners.forEach(listener => listener('shell-search-1')); await view.drain()
    const first = view.commandCenter().focusRequest!
    expect(view.commandCenter().open).toBe(true)
    listeners.forEach(listener => listener('shell-search-2')); await view.drain()
    expect(view.commandCenter().focusRequest).toBe(first + 1)
    expect(view.commandCenter().onDismiss!()).toBe(true)
    expect(dismiss).toHaveBeenCalledExactlyOnceWith('shell-search-2')
    expect(view.commandCenter().onDismiss!()).toBe(false)
    view.unmount()
  })
  it('does not republish unchanged messages when the visible rail or bottom indicator changes', () => {
    const { controller } = fixture(), view = mount(controller)
    const options = () => vi.mocked(useExternalStoreRuntime).mock.calls.at(-1)![0]
    const previous = options()
    ;(view.props(p => typeof p.onActiveTurnChange === 'function').onActiveTurnChange as (id: string) => void)('a-user')
    view.render()
    expect(options()).toBe(previous)
    ;(view.props(p => typeof p.onBottomChange === 'function').onBottomChange as (bottom: boolean) => void)(false)
    view.render()
    expect(options()).toBe(previous)
  })

  it('refreshes the runtime adapter when planning, message content or send availability changes', async () => {
    const { controller } = fixture(), view = mount(controller)
    const send = vi.spyOn(controller, 'send').mockResolvedValue(undefined)
    const options = () => vi.mocked(useExternalStoreRuntime).mock.calls.at(-1)![0]
    let previous = options()
    ;(view.props(p => typeof p.setPlanning === 'function').setPlanning as (enabled: boolean) => void)(true)
    view.render()
    expect(options()).not.toBe(previous)
    await options().onNew!({ content: [{ type: 'text', text: 'Plan this task' }] } as Parameters<NonNullable<ReturnType<typeof options>['onNew']>>[0])
    expect(send).toHaveBeenCalledWith('Plan this task', true)
    previous = options()
    Object.assign(controller.getSnapshot(), { messages: [{ id: 'a-user', role: 'user', content: 'New real message', createdAt: 1 }] })
    view.render()
    expect(options()).not.toBe(previous)
    expect(options().messages).toHaveLength(1)
    previous = options()
    Object.assign(controller.getSnapshot(), { selection: { providerId: 'p', modelId: 'm' } })
    view.render()
    expect(options()).not.toBe(previous)
    expect(options().isSendDisabled).toBeFalsy()
  })

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
  it('opens another task project tree without flushing or selecting that task', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const flush = vi.fn(() => new Promise<void>(() => {})); controller.registerBeforeNavigation(flush)
    await (view.sidebar().onOpenSessionFiles as (id: string) => Promise<void>)('b'); await view.drain()
    expect(view.props((_, element) => element.type === ProjectFileDrawer)).toMatchObject({ projectId: 'project-b', directory: '/project-b' })
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(flush).not.toHaveBeenCalled(); expect(host.getSession).not.toHaveBeenCalled(); expect(host.createSession).not.toHaveBeenCalled()
  })
  it('captures a personal task directory while the automation page and another task stay active', async () => {
    const { controller, host } = fixture()
    const snapshot = controller.getSnapshot()
    snapshot.sessions = snapshot.sessions.map(item => item.id === 'b' ? { ...item, projectId: undefined, workingDirectory: '/personal-b' } : item)
    const view = mount(controller); await view.drain(); view.view('automations'); await view.drain()
    await (view.sidebar().onOpenSessionFiles as (id: string) => Promise<void>)('b'); await view.drain()
    const drawer = () => view.props((_, element) => element.type === ProjectFileDrawer)
    expect(drawer()).toMatchObject({ sessionId: 'b', directory: '/personal-b', expandedPaths: [] })
    expect(drawer().projectId).toBeUndefined()
    ;(drawer().onExpandedPathsChange as (paths: string[]) => void)(['src']); await view.drain()
    expect(drawer().expandedPaths).toEqual(['src'])
    ;(drawer().onOpenDirectory as () => void)(); await view.drain()
    expect(host.openSessionProject).toHaveBeenCalledExactlyOnceWith('b', 'file-manager')
    expect(view.automationProps().active).toBe(true)
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(host.getSession).not.toHaveBeenCalled(); expect(host.createSession).not.toHaveBeenCalled()
    ;(drawer().onBack as () => void)(); await view.drain()
    expect(view.sidebar().automationsActive).toBe(true)
  })
  it('reports personal-directory host error strings and ignores callbacks from a replaced file tree', async () => {
    const { controller, host } = fixture()
    const snapshot = controller.getSnapshot()
    snapshot.sessions = snapshot.sessions.map(item => item.id === 'b' ? { ...item, projectId: undefined, workingDirectory: '/personal-b' } : item)
    const view = mount(controller); await view.drain()
    const open = view.sidebar().onOpenSessionFiles as (id: string) => Promise<void>
    await open('b'); await view.drain()
    const oldTree = view.props((_, element) => element.type === ProjectFileDrawer)
    host.openSessionProject.mockResolvedValueOnce('目录不可用')
    ;(oldTree.onOpenDirectory as () => void)(); await view.drain()
    expect(controller.getSnapshot().error).toBe('目录不可用')
    await open('a'); await view.drain()
    ;(oldTree.onExpandedPathsChange as (paths: string[]) => void)(['old-path']); await view.drain()
    const tree = view.props((_, element) => element.type === ProjectFileDrawer)
    expect(tree).toMatchObject({ projectId: 'project-a', directory: '/project-a', expandedPaths: [] })
    ;(tree.onExpandedPathsChange as (paths: string[]) => void)(['src'])
    ;(tree.onExpandedPathsChange as (paths: string[]) => void)(['src', 'src/lib']); await view.drain()
    expect(view.props((_, element) => element.type === ProjectFileDrawer).expandedPaths).toEqual(['src', 'src/lib'])
    expect(controller.getSnapshot().session?.id).toBe('a')
  })
  it('rejects missing tasks and unavailable directories instead of browsing the active task', async () => {
    const { controller, host } = fixture()
    controller.getSnapshot().sessions.push({ ...task('no-directory'), workingDirectory: undefined })
    const view = mount(controller); await view.drain()
    const open = view.sidebar().onOpenSessionFiles as (id: string) => Promise<void>
    await expect(open('deleted')).rejects.toThrow('任务已不在当前列表')
    await expect(open('no-directory')).rejects.toThrow('当前任务没有可用工作目录')
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(() => view.props((_, element) => element.type === ProjectFileDrawer)).toThrow('Missing workbench element')
    expect(host.getSession).not.toHaveBeenCalled(); expect(host.createSession).not.toHaveBeenCalled()
  })
  it('watches the current personal task tree and releases its subscription when a different owner is browsed', async () => {
    const { controller, host } = fixture()
    const snapshot = controller.getSnapshot()
    snapshot.session = { ...snapshot.session!, projectId: undefined, workingDirectory: '/personal-a' }
    snapshot.sessions = snapshot.sessions.map(item => item.id === 'a' ? { ...item, projectId: undefined, workingDirectory: '/personal-a' } : item)
    const watchFiles = vi.fn(async (_id: string, _paths: string[]) => ({ watchId: 'personal-tree' }))
    const unwatchFiles = vi.fn(async (_id: string, _watchId: string) => undefined)
    Object.assign(host, { watchFiles, unwatchFiles })
    const view = mount(controller); await view.drain()
    expect(watchFiles).not.toHaveBeenCalled()
    const open = view.sidebar().onOpenSessionFiles as (id: string) => Promise<void>
    await open('a'); await view.drain()
    expect(watchFiles).toHaveBeenCalledExactlyOnceWith('a', [''])
    const drawer = view.props((_, element) => element.type === ProjectFileDrawer)
    ;(drawer.onWatchDirectoriesChange as (paths: string[]) => void)(['src']); await view.drain()
    expect(watchFiles.mock.lastCall).toEqual(['a', ['', 'src']])
    await open('b'); await view.drain()
    expect(unwatchFiles).toHaveBeenCalledWith('a', 'personal-tree')
    expect(watchFiles.mock.calls.every(([id]) => id === 'a')).toBe(true)
    expect(watchFiles).toHaveBeenCalledTimes(2)
    expect(view.props((_, element) => element.type === ProjectFileDrawer).workspaceWatch).toBeUndefined()
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
    const created = deferred<HarnessSession>(); host.prepareSession.mockReturnValueOnce(created.promise)
    const prepare = view.composer.prepareSession as ReturnType<typeof vi.fn>
    prepare.mockImplementationOnce(async (isCurrent: () => boolean) => await controller.prepare(undefined, isCurrent) ? controller.getSnapshot().session?.id : undefined)
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

describe('Workbench publishes and replays its actual visible navigation', () => {
  const conversation = (sessionId: string): MiraAppNavigationTarget => ({ kind: 'conversation', sessionId })
  const composerProps = (view: ReturnType<typeof mount>) => view.props((_, element) => element.type === HarnessComposer)
  async function open(view: ReturnType<typeof mount>, id: string) {
    const opening = view.commandCenter().onOpenSession({ id, title: id, snippet: '', updatedAt: 1 })
    await view.drain(); await opening; await view.drain()
  }
  it('returns through tasks, automation details and tabs, and extensions without adding replay entries', async () => {
    const api = fixture(), view = mount(api.controller); await view.drain()
    await open(view, 'b'); view.view('automations'); await view.drain()
    view.selectAutomation({ kind: 'automations', taskId: 'daily' }); await view.drain()
    view.selectAutomation({ kind: 'automations', taskId: 'daily', tab: 'history' }); await view.drain()
    view.view('extensions'); await view.drain()
    const entries: MiraAppNavigationTarget[] = [conversation('a'), conversation('b'), { kind: 'automations' }, { kind: 'automations', taskId: 'daily' }, { kind: 'automations', taskId: 'daily', tab: 'history' }, { kind: 'extensions' }]
    expect(api.navigation()).toMatchObject({ busy: false, canGoBack: true, canGoForward: false, snapshot: { entries, cursor: 5, detached: false } })
    for (const cursor of [4, 3, 2, 1, 0]) {
      api.go('back'); await view.drain()
      expect(api.navigation().snapshot).toEqual({ entries, cursor, detached: false })
      const target = entries[cursor]
      if (target.kind === 'conversation') {
        expect(api.controller.getSnapshot().session?.id).toBe(target.sessionId)
        expect(view.sidebar()).toMatchObject({ automationsActive: false, extensionsActive: false })
      } else { expect(view.sidebar().automationsActive).toBe(true); expect(view.automationTarget()).toEqual(target) }
    }
    expect(api.navigation()).toMatchObject({ canGoBack: false, canGoForward: true })
    for (const cursor of [1, 2, 3, 4, 5]) {
      api.go('forward'); await view.drain()
      expect(api.navigation().snapshot).toEqual({ entries, cursor, detached: false })
    }
    expect(view.sidebar().extensionsActive).toBe(true)
    expect(api.navigation()).toMatchObject({ canGoBack: true, canGoForward: false })
    expect(api.host.onNavigationCommand).toHaveBeenCalledOnce(); expect(api.host.onNavigationRestore).toHaveBeenCalledOnce()
  })
  it.each(['automations', 'extensions'] as const)('keeps %s and its cursor when a searched task fails and shows a dismissible alert on that page', async name => {
    const api = fixture(), view = mount(api.controller); await view.drain()
    view.view('automations'); await view.drain(); view.selectAutomation({ kind: 'automations', taskId: 'daily', tab: 'history' }); await view.drain()
    if (name === 'extensions') { view.view(name); await view.drain() }
    const saved = api.navigation().snapshot
    api.host.getSession.mockRejectedValueOnce(new Error('任务读取失败'))
    await expect(view.commandCenter().onOpenSession({ id: 'b', title: 'b', snippet: '', updatedAt: 1 })).rejects.toThrow('任务读取失败')
    await view.drain()
    expect(view.sidebar()).toMatchObject({ automationsActive: name === 'automations', extensionsActive: name === 'extensions' }); expect(view.automationTarget()).toEqual({ kind: 'automations', taskId: 'daily', tab: 'history' })
    expect(api.controller.getSnapshot().session?.id).toBe('a')
    expect(api.navigation()).toMatchObject({ busy: false, snapshot: saved })
    expect(view.pageProps(p => p.role === 'alert')).toBeDefined()
    expect(view.pageProps(p => p.children === '任务读取失败')).toBeDefined()
    ;(view.pageProps(p => p['aria-label'] === '关闭页面错误提示').onClick as () => void)(); await view.drain()
    expect(() => view.pageProps(p => p.role === 'alert')).toThrow('Missing workbench element')
    expect(view.sidebar()).toMatchObject({ automationsActive: name === 'automations', extensionsActive: name === 'extensions' })
    expect(api.navigation().snapshot).toEqual(saved)
    expect(api.controller.getSnapshot().error).toBe('任务读取失败')
  })
  it('keeps the visible automation page and allows Back to be retried when its task load fails', async () => {
    const api = fixture(), view = mount(api.controller); await view.drain()
    await open(view, 'b'); view.view('automations'); await view.drain()
    const saved = api.navigation().snapshot
    api.host.getSession.mockRejectedValueOnce(new Error('暂时无法读取'))
    api.go('back'); await view.drain()
    expect(view.sidebar().automationsActive).toBe(true)
    expect(api.navigation()).toMatchObject({ busy: false, canGoBack: true, snapshot: saved })
    expect(api.controller.getSnapshot().error).toBe('暂时无法读取')
    api.go('back'); await view.drain()
    expect(view.sidebar().automationsActive).toBe(false)
    expect(api.controller.getSnapshot().session?.id).toBe('b')
    expect(api.navigation().snapshot).toEqual({ ...saved, cursor: 1 })
  })
  it.each(['task', 'project'] as const)('preserves the previous project draft when a new %s cannot flush it', async action => {
    const api = fixture(), view = mount(api.controller); await view.drain()
    ;(view.sidebar().onNewProjectConversation as (id: string) => void)('project-a'); await view.drain()
    expect(composerProps(view).draftProjectId).toBe('project-a')
    const saved = api.navigation().snapshot, previous = api.controller.getSnapshot()
    const flush = vi.fn(async () => { throw new Error('草稿保存失败') }); api.controller.registerBeforeNavigation(flush)
    api.host.setPreference.mockClear()
    if (action === 'task') view.newTask()
    else (view.sidebar().onNewProjectConversation as (id: string) => void)('project-b')
    await view.drain()
    expect(flush).toHaveBeenCalledOnce(); expect(composerProps(view).draftProjectId).toBe('project-a')
    expect(api.controller.getSnapshot()).toMatchObject({ session: previous.session, error: '草稿保存失败' })
    expect(api.navigation()).toMatchObject({ busy: false, snapshot: saved })
    expect(api.host.setPreference.mock.calls.filter(([key]) => key === 'active-session')).toHaveLength(0)
    expect(api.host.createSession).not.toHaveBeenCalled()
  })
  it('waits for both controller initialization and the host restore handshake before publishing history', async () => {
    const api = fixture({ autoRestore: false }), view = mount(api.controller)
    Object.assign(api.controller.getSnapshot(), { initialized: false }); view.render(); await view.drain()
    expect(api.navigation().snapshot.entries).toEqual([])
    expect(await view.command('extensions')).toBe(false)
    const saved: MiraAppNavigationSnapshot = { entries: [conversation('a'), { kind: 'automations', taskId: 'daily', tab: 'history' }, { kind: 'extensions' }], cursor: 1, detached: false }
    api.restore(saved); await view.drain()
    expect(view.automations.navigate).not.toHaveBeenCalled(); expect(api.navigation().snapshot.entries).toEqual([])
    Object.assign(api.controller.getSnapshot(), { initialized: true }); view.render(); await view.drain()
    expect(view.sidebar().automationsActive).toBe(true)
    expect(view.automationTarget()).toEqual(saved.entries[1])
    expect(api.navigation()).toMatchObject({ busy: false, canGoBack: true, canGoForward: true, snapshot: saved })
    expect(api.host.getSession).not.toHaveBeenCalled()
  })
  it('does not enable restored history or switch pages until its awaited task has loaded', async () => {
    const saved: MiraAppNavigationSnapshot = { entries: [conversation('a'), conversation('b'), { kind: 'extensions' }], cursor: 1, detached: false }
    const api = fixture({ snapshot: saved }), pending = deferred<HarnessSession>(); api.host.getSession.mockReturnValueOnce(pending.promise)
    const view = mount(api.controller); await view.drain()
    expect(api.controller.getSnapshot()).toMatchObject({ session: { id: 'a' }, sessionLoading: true })
    expect(api.navigation()).toMatchObject({ busy: true, canGoBack: false, canGoForward: false, snapshot: { entries: [] } })
    pending.resolve(task('b')); await view.drain()
    expect(api.controller.getSnapshot().session?.id).toBe('b')
    expect(api.navigation()).toMatchObject({ busy: false, canGoBack: true, canGoForward: true, snapshot: saved })
  })
  it.each(['conversation', 'automations'] as const)('restores a detached %s draft independently from the saved history cursor', async draft => {
    const saved: MiraAppNavigationSnapshot = { entries: [conversation('a'), { kind: 'automations', taskId: 'daily' }], cursor: 1, detached: true, draft }
    const api = fixture({ snapshot: saved }), view = mount(api.controller); await view.drain()
    expect(api.navigation()).toMatchObject({ busy: false, canGoBack: true, canGoForward: false, snapshot: saved })
    if (draft === 'automations') {
      expect(view.sidebar().automationsActive).toBe(true); expect(view.automationDraft()).toBe(true)
      expect(view.automations.navigate).toHaveBeenCalledWith({ kind: 'automations' }, expect.any(Function), true)
      expect(api.controller.getSnapshot().session?.id).toBe('a')
    } else {
      expect(view.sidebar().automationsActive).toBe(false); expect(api.controller.getSnapshot().session).toBeUndefined()
      expect(view.automations.navigate).not.toHaveBeenCalled()
    }
    api.go('back'); await view.drain()
    expect(view.sidebar().automationsActive).toBe(true); expect(view.automationDraft()).toBe(false)
    expect(view.automationTarget()).toEqual(saved.entries[1])
    expect(api.navigation().snapshot).toEqual({ entries: saved.entries, cursor: 1, detached: false })
  })
  it('preserves hydrated project and planning settings on draft restoration and returning from automations', async () => {
    const api = fixture({ autoRestore: false }); api.controller.newConversation()
    const view = mount(api.controller); await view.drain()
    ;(composerProps(view).onDraftProjectChange as (id: string) => void)('project-a')
    ;(composerProps(view).setPlanning as (value: boolean) => void)(true); await view.drain()
    const saved: MiraAppNavigationSnapshot = { entries: [conversation('a')], cursor: 0, detached: true, draft: 'conversation' }
    api.restore(saved); await view.drain()
    expect(composerProps(view)).toMatchObject({ draftProjectId: 'project-a', planning: true })
    expect(api.navigation().snapshot).toEqual(saved)
    view.view('automations'); await view.drain()
    ;(view.props(p => typeof p.onClick === 'function' && Array.isArray(p.children) && p.children.includes('返回对话')).onClick as () => void)(); await view.drain()
    expect(view.sidebar().automationsActive).toBe(false)
    expect(composerProps(view)).toMatchObject({ draftProjectId: 'project-a', planning: true })
    expect(api.controller.getSnapshot().session).toBeUndefined()
    view.newTask(); await view.drain()
    expect(composerProps(view)).toMatchObject({ draftProjectId: undefined, planning: false })
  })
  it('keeps the current page and exposes an unavailable automation replay error for retry', async () => {
    const api = fixture(), view = mount(api.controller); await view.drain()
    view.view('automations'); await view.drain(); view.selectAutomation({ kind: 'automations', taskId: 'missing', tab: 'history' }); await view.drain()
    view.view('extensions'); await view.drain(); const saved = api.navigation().snapshot
    view.automations.navigate.mockResolvedValueOnce(false)
    api.go('back'); await view.drain()
    expect(view.sidebar().extensionsActive).toBe(true)
    expect(api.controller.getSnapshot().error).toBe('自动化页面打开失败，请重试或确认任务仍存在')
    expect(api.navigation()).toMatchObject({ busy: false, canGoBack: true, snapshot: saved })
    expect(view.pageProps(p => p.role === 'alert')).toBeDefined()
    expect(view.pageProps(p => p.children === '自动化页面打开失败，请重试或确认任务仍存在')).toBeDefined()
    ;(view.pageProps(p => p['aria-label'] === '关闭页面错误提示').onClick as () => void)(); await view.drain()
    expect(() => view.pageProps(p => p.role === 'alert')).toThrow('Missing workbench element')
    expect(view.sidebar().extensionsActive).toBe(true); expect(api.navigation().snapshot).toEqual(saved)
    api.go('back'); await view.drain()
    expect(view.sidebar().automationsActive).toBe(true)
    expect(view.automationTarget()).toEqual({ kind: 'automations', taskId: 'missing', tab: 'history' })
    expect(api.navigation().snapshot).toEqual({ ...saved, cursor: saved.cursor - 1 })
  })
  it('publishes a user-created automation draft outside the stack and reattaches on Back', async () => {
    const api = fixture(), view = mount(api.controller); await view.drain()
    view.view('automations'); await view.drain(); view.selectAutomation({ kind: 'automations', taskId: 'daily' }); await view.drain()
    const saved = api.navigation().snapshot
    view.newAutomation(); await view.drain()
    expect(api.navigation().snapshot).toEqual({ ...saved, detached: true, draft: 'automations' })
    api.go('back'); await view.drain()
    expect(view.automationTarget()).toEqual({ kind: 'automations', taskId: 'daily' }); expect(view.automationDraft()).toBe(false)
    expect(api.navigation().snapshot).toEqual(saved)
  })
  it('removes only deleted session and automation targets including run filters from history', async () => {
    const api = fixture(), view = mount(api.controller); await view.drain()
    await open(view, 'b'); view.view('automations'); await view.drain()
    view.selectAutomation({ kind: 'automations', taskId: 'daily' }); await view.drain()
    view.selectAutomation({ kind: 'automations', taskId: 'daily', tab: 'history' }); await view.drain()
    view.selectAutomation({ kind: 'automations', section: 'runs', runTaskId: 'daily', runStatus: 'failed' }); await view.drain()
    view.view('extensions'); await view.drain()
    await api.controller.deleteSession('b'); await view.drain()
    expect(api.navigation().snapshot.entries.some(target => target.kind === 'conversation' && target.sessionId === 'b')).toBe(false)
    ;(view.automationProps().onDeleteTask as (id: string) => void)('daily'); await view.drain()
    const entries: MiraAppNavigationTarget[] = [conversation('a'), { kind: 'automations' }, { kind: 'extensions' }]
    expect(api.navigation().snapshot).toEqual({ entries, cursor: 2, detached: false })
    expect(view.sidebar().extensionsActive).toBe(true)
    api.go('back'); await view.drain(); expect(view.automationTarget()).toEqual({ kind: 'automations' })
    api.go('back'); await view.drain(); expect(api.controller.getSnapshot().session?.id).toBe('a')
  })
  it('does not remove a session from history when its host deletion fails', async () => {
    const api = fixture(), view = mount(api.controller); await view.drain(); await open(view, 'b'); view.view('extensions'); await view.drain()
    const saved = api.navigation().snapshot
    api.host.deleteSession.mockRejectedValueOnce(new Error('删除失败'))
    await expect(api.controller.deleteSession('b')).rejects.toThrow('删除失败'); await view.drain()
    expect(api.navigation().snapshot).toEqual(saved); expect(view.sidebar().extensionsActive).toBe(true)
  })
  it('retains archived tasks in history and can return to their stored conversation', async () => {
    const api = fixture(), view = mount(api.controller); await view.drain(); await open(view, 'b'); view.view('extensions'); await view.drain()
    const saved = api.navigation().snapshot
    await api.controller.archiveSession('b'); await view.drain()
    expect(api.navigation().snapshot).toEqual(saved); expect(view.sidebar().extensionsActive).toBe(true)
    api.go('back'); await view.drain()
    expect(api.controller.getSnapshot().session).toMatchObject({ id: 'b', status: 'archived' })
    expect(api.navigation().snapshot).toEqual({ ...saved, cursor: 1 })
  })
  it('discards a late automation replay when a newer direct task navigation wins', async () => {
    const api = fixture(), view = mount(api.controller); await view.drain()
    view.view('automations'); await view.drain(); view.selectAutomation({ kind: 'automations', taskId: 'daily', tab: 'history' }); await view.drain()
    view.view('extensions'); await view.drain()
    const pending = deferred<boolean>(); let current!: () => boolean
    view.automations.navigate.mockImplementationOnce(async (_target, isCurrent = () => true) => { current = isCurrent; const result = await pending.promise; return result && current() })
    api.go('back'); await view.drain(); expect(api.navigation().busy).toBe(true)
    expect(view.automationProps().navigationBusy).toBe(true)
    await open(view, 'b'); expect(current()).toBe(false)
    const saved = api.navigation().snapshot
    pending.resolve(true); await view.drain()
    expect(api.controller.getSnapshot().session?.id).toBe('b')
    expect(view.sidebar()).toMatchObject({ automationsActive: false, extensionsActive: false })
    expect(api.navigation()).toMatchObject({ busy: false, snapshot: saved })
    expect(view.automationProps().navigationBusy).toBe(false)
  })
  it('unregisters host listeners and ignores delayed commands after unmount', async () => {
    const api = fixture(), view = mount(api.controller); await view.drain(); await open(view, 'b')
    const count = api.host.publishNavigationState.mock.calls.length
    view.unmount(); api.go('back'); api.restore({ entries: [{ kind: 'extensions' }], cursor: 0, detached: false }); await view.drain()
    expect(api.host.publishNavigationState).toHaveBeenCalledTimes(count)
    expect(api.controller.getSnapshot().session?.id).toBe('b')
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

describe('Workbench admits the captured group draft without changing navigation', () => {
  function groupFixture() {
    const value = fixture()
    value.host.getPreference.mockImplementation(async key => key === 'session-drawer' ? {
      view: 'group', groups: [
        { id: 'research', name: '研究', color: 'blue', collapsed: false, sessionIds: ['b'] },
        { id: 'writing', name: '写作', color: 'green', collapsed: false, sessionIds: [] },
      ], groupedRootOrder: [{ type: 'group', id: 'research' }, { type: 'session', id: 'a' }, { type: 'group', id: 'writing' }],
    } : null)
    const view = mount(value.controller)
    const composer = () => view.props((_, element) => element.type === HarnessComposer)
    const accepted = (id: string, owner: ComposerTaskDraft) => (composer().onDraftAccepted as (id: string, owner: ComposerTaskDraft) => Promise<void>)(id, owner)
    return { ...value, ...view, composerProps: composer, accepted, store: () => view.sidebar().preferenceStore as SidebarPreferenceStore }
  }

  it('preserves draft configuration when routing group and root entries without creating a formal task', async () => {
    const view = groupFixture(); await view.drain()
    ;(view.composerProps().onDraftProjectChange as (id: string) => void)('project-a')
    ;(view.composerProps().setPlanning as (enabled: boolean) => void)(true); await view.drain()
    const startDraft = vi.fn<HarnessComposerHandle['startDraft']>(async (groupId, _projectId, current) => {
      if (current && !current()) return false
      expect(view.composerProps()).toMatchObject({ draftProjectId: 'project-a', planning: true })
      view.controller.newConversation()
      ;(view.composerProps().onDraftChange as (draft: ComposerTaskDraft) => void)({ id: 'anonymous', groupId })
      return true
    })
    view.composer.startDraft = startDraft
    await (view.sidebar().onNewGroupConversation as (id: string) => Promise<boolean>)('research'); await view.drain()
    expect(startDraft).toHaveBeenCalledExactlyOnceWith('research', undefined, expect.any(Function))
    expect(view.sidebar().draft).toMatchObject({ draftId: 'anonymous', groupId: 'research', selected: true })
    expect(view.controller.getSnapshot().session).toBeUndefined()
    expect(view.host.createSession).not.toHaveBeenCalled(); expect(view.host.prepareSession).not.toHaveBeenCalled()
    expect(view.store().getSnapshot().preferences.groups.map(group => group.sessionIds)).toEqual([['b'], []])
    expect(view.navigation().snapshot).toMatchObject({ detached: true, draft: 'conversation' })
    view.newTask(); await view.drain()
    expect(startDraft).toHaveBeenLastCalledWith(undefined, undefined, expect.any(Function))
    expect(view.composerProps()).toMatchObject({ draftProjectId: 'project-a', planning: true })
    expect(view.sidebar().draft).toMatchObject({ draftId: 'anonymous', groupId: undefined })
  })

  it('puts first admission at its captured group head while preserving a newer draft and page', async () => {
    const view = groupFixture(); await view.drain()
    ;(view.composerProps().onDraftChange as (draft: ComposerTaskDraft) => void)({ id: 'newer', groupId: 'writing' })
    view.view('extensions'); await view.drain()
    const before = view.navigation().snapshot, active = view.controller.getSnapshot().session
    Object.assign(view.controller.getSnapshot(), { sessions: [...view.controller.getSnapshot().sessions, task('accepted')] })
    await view.accepted('accepted', { id: 'submitted', groupId: 'research', sessionId: 'accepted' }); await view.drain()
    expect(view.store().getSnapshot().preferences.groups.map(group => group.sessionIds)).toEqual([['accepted', 'b'], []])
    expect(view.sidebar()).toMatchObject({ draft: { draftId: 'newer', groupId: 'writing' }, extensionsActive: true })
    expect(view.controller.getSnapshot().session).toBe(active)
    expect(view.navigation().snapshot).toEqual(before)
    expect(view.host.createSession).not.toHaveBeenCalled(); expect(view.host.getSession).not.toHaveBeenCalled()
  })

  it('falls back to the root head after its captured group is dissolved without recreating the group', async () => {
    const view = groupFixture(); await view.drain()
    const store = view.store(); store.removeGroup('research'); await store.save(); await view.drain()
    Object.assign(view.controller.getSnapshot(), { sessions: [...view.controller.getSnapshot().sessions, task('accepted')] })
    const before = view.navigation().snapshot
    await view.accepted('accepted', { id: 'submitted', groupId: 'research', sessionId: 'accepted' }); await view.drain()
    const preferences = store.getSnapshot().preferences
    expect(preferences.groups.map(group => group.id)).toEqual(['writing'])
    expect(preferences.groupedRootOrder).toEqual([{ type: 'session', id: 'accepted' }, { type: 'session', id: 'b' }, { type: 'session', id: 'a' }, { type: 'group', id: 'writing' }])
    expect(preferences.ungroupedSessionOrder).toEqual(['accepted', 'b', 'a'])
    expect(view.controller.getSnapshot().session?.id).toBe('a'); expect(view.navigation().snapshot).toEqual(before)
  })

  it('retains admitted local membership on sidebar save failure and persists it through the existing retry', async () => {
    const view = groupFixture(); await view.drain()
    const store = view.store(), before = view.navigation().snapshot
    Object.assign(view.controller.getSnapshot(), { sessions: [...view.controller.getSnapshot().sessions, task('accepted')] })
    view.host.setPreference.mockImplementation(async key => { if (key === 'session-drawer') throw new Error('分组保存失败') })
    await expect(view.accepted('accepted', { id: 'submitted', groupId: 'research', sessionId: 'accepted' })).rejects.toThrow('分组保存失败')
    await view.drain()
    expect(store.getSnapshot()).toMatchObject({ ready: true, error: '分组保存失败', preferences: { groups: [{ sessionIds: ['accepted', 'b'] }, { sessionIds: [] }] } })
    expect(view.controller.getSnapshot().session?.id).toBe('a'); expect(view.navigation().snapshot).toEqual(before)
    let saved: unknown
    view.host.setPreference.mockImplementation(async (key, value) => { if (key === 'session-drawer') saved = structuredClone(value) })
    await store.retry(); await view.drain()
    expect(store.getSnapshot().error).toBe('')
    expect(saved).toMatchObject({ groups: [{ sessionIds: ['accepted', 'b'] }, { sessionIds: [] }] })
    expect(view.host.createSession).not.toHaveBeenCalled(); expect(view.host.getSession).not.toHaveBeenCalled()
  })

  it('awaits draft hydration through the Composer handle before restoring a prepared owner outside navigation history', async () => {
    const view = groupFixture(); await view.drain()
    view.controller.newConversation(); await view.drain()
    const hydration = deferred<void>(), prepared = { ...task('prepared', 'project-a'), draftState: 'prepared' as const }
    view.host.getSession.mockResolvedValueOnce(prepared)
    const openDraft = vi.fn<HarnessComposerHandle['openDraft']>(async (_id, current) => {
      await hydration.promise
      if (current && !current()) return false
      ;(view.composerProps().onDraftChange as (draft: ComposerTaskDraft) => void)({ id: 'restored', groupId: 'research', sessionId: prepared.id })
      return await view.controller.open(prepared.id, current)
    })
    view.composer.openDraft = openDraft
    view.view('extensions'); await view.drain()
    ;(view.pageProps(p => Array.isArray(p.children) && p.children.includes('返回对话')).onClick as () => void)(); await view.drain()
    expect(openDraft).toHaveBeenCalledExactlyOnceWith(undefined, expect.any(Function))
    expect(view.sidebar().extensionsActive).toBe(true); expect(view.host.getSession).not.toHaveBeenCalled()
    expect(view.navigation().busy).toBe(true)
    hydration.resolve(); await view.drain()
    expect(view.controller.getSnapshot().session).toEqual(prepared)
    expect(view.sidebar()).toMatchObject({ extensionsActive: false, draft: { draftId: 'restored', preparedSessionId: prepared.id, selected: true } })
    expect(view.navigation().snapshot).toMatchObject({ detached: true, draft: 'conversation' })
    expect(view.navigation().snapshot.entries).not.toContainEqual({ kind: 'conversation', sessionId: prepared.id })
    expect(view.host.createSession).not.toHaveBeenCalled(); expect(view.host.prepareSession).not.toHaveBeenCalled()
  })

  it('restores a prepared draft on startup without a Shell snapshot or formal session fallback', async () => {
    const api = fixture(); api.controller.newConversation()
    const view = mount(api.controller), hydration = deferred<void>()
    const prepared = { ...task('prepared', 'project-a'), draftState: 'prepared' as const }
    api.host.getSession.mockResolvedValueOnce(prepared)
    const openDraft = vi.fn<HarnessComposerHandle['openDraft']>(async (_id, current) => {
      await hydration.promise
      if (current && !current()) return false
      ;(view.props((_, element) => element.type === HarnessComposer).onDraftChange as (draft: ComposerTaskDraft) => void)({ id: 'restored', groupId: 'research', sessionId: prepared.id })
      return await api.controller.open(prepared.id, current)
    })
    view.composer.openDraft = openDraft
    await view.drain()
    expect(openDraft).toHaveBeenCalledExactlyOnceWith(undefined, expect.any(Function))
    expect(api.navigation()).toMatchObject({ busy: true, canGoBack: false, canGoForward: false })
    expect(api.host.getSession).not.toHaveBeenCalled(); expect(api.controller.getSnapshot().session).toBeUndefined()
    hydration.resolve(); await view.drain()
    expect(api.controller.getSnapshot().session).toEqual(prepared)
    expect(view.sidebar().draft).toMatchObject({ draftId: 'restored', preparedSessionId: prepared.id, selected: true })
    expect(api.navigation()).toMatchObject({ busy: false, canGoBack: false, canGoForward: false, snapshot: { entries: [], cursor: -1, detached: true, draft: 'conversation' } })
    expect(api.host.setPreference).toHaveBeenCalledWith('active-session', null)
    expect(api.host.createSession).not.toHaveBeenCalled(); expect(api.host.prepareSession).not.toHaveBeenCalled()
  })

  it('invalidates draft hydration restoration when another page wins the navigation transaction', async () => {
    const view = groupFixture(); await view.drain()
    view.controller.newConversation(); await view.drain()
    const hydration = deferred<void>()
    let restoreGuard!: () => boolean
    view.composer.openDraft = vi.fn<HarnessComposerHandle['openDraft']>(async (_id, current = () => true) => {
      restoreGuard = current
      await hydration.promise
      return current() && await view.controller.open('prepared', current)
    })
    view.view('extensions'); await view.drain()
    ;(view.pageProps(p => Array.isArray(p.children) && p.children.includes('返回对话')).onClick as () => void)(); await view.drain()
    expect(restoreGuard()).toBe(true)
    view.view('automations'); await view.drain()
    const currentHistory = view.navigation().snapshot
    hydration.resolve(); await view.drain()
    expect(restoreGuard()).toBe(false); expect(view.host.getSession).not.toHaveBeenCalled()
    expect(view.sidebar().automationsActive).toBe(true); expect(view.controller.getSnapshot().session).toBeUndefined()
    expect(view.navigation()).toMatchObject({ busy: false, snapshot: currentHistory })
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
  it('restores prepared metadata without opening a task until an explicit guarded draft restoration', async () => {
    const { controller, host } = fixture(); controller.newConversation()
    const prepared = { ...task('prepared', 'project-a'), draftState: 'prepared' as const }
    host.getPreference.mockImplementation(async key => key === 'harness-react-composer-drafts' ? { draft: { id: 'restored', groupId: 'research', sessionId: prepared.id }, drafts: { prepared: '已保存的草稿输入' } } : null)
    host.getSession.mockResolvedValueOnce(prepared)
    const view = mountComposer(controller); await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined(); expect(host.getSession).not.toHaveBeenCalled()
    expect(await view.handle.current!.openDraft(undefined, () => true)).toBe(true); await view.drain()
    expect(host.getSession).toHaveBeenCalledExactlyOnceWith(prepared.id)
    expect(controller.getSnapshot().session).toEqual(prepared); expect(view.text()).toBe('已保存的草稿输入')
    expect(host.createSession).not.toHaveBeenCalled(); expect(host.prepareSession).not.toHaveBeenCalled()
  })

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
    const created = deferred<HarnessSession>(); host.prepareSession.mockReturnValueOnce(created.promise)
    let current = true
    const preparing = view.handle.current!.prepareSession(() => current); await view.drain()
    current = false; created.resolve(task('created')); await preparing; await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined(); expect(host.getSession).not.toHaveBeenCalled(); expect(view.text()).toBe('未发送原稿')
  })
})
