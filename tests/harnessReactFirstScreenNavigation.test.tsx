import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessWorkbench } from '../apps/harness-react/src/components/workbench/HarnessWorkbench'
import { HarnessCommandCenter, type HarnessCommandCenterProps } from '../apps/harness-react/src/components/search/HarnessCommandCenter'
import { HarnessComposer, type HarnessComposerHandle } from '../apps/harness-react/src/components/composer/HarnessComposer'
import { MiraPromptEditor, type MiraPromptEditorHandle, type MiraPromptEditorProps } from '../apps/harness-react/src/components/composer/MiraPromptEditor'
import { createMiraPromptDocument } from '../apps/harness-react/src/lib/prompt-editor-document'
import type { ComposerTaskDraft } from '../apps/harness-react/src/lib/composer-drafts'
import { AutomationsView, type AutomationsNavigationHandle } from '../apps/harness-react/src/components/automations/AutomationsView'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessActiveRun, HarnessMessage, HarnessProject, HarnessRunSummary, HarnessSession, HarnessSubtask } from '../src/config/harness'
import { parseFirstPartyNavigationPath } from '../src/platform/firstPartyNavigation'
import { SidebarPreferenceStore } from '../apps/harness-react/src/components/session/sidebar-preferences'
import { ProjectFileDrawer } from '../apps/harness-react/src/components/workspace/ProjectFileDrawer'
import { MiraTaskTitleEditor } from '../apps/harness-react/src/components/workbench/MiraTaskTitleEditor'
import { TaskSummary } from '../apps/harness-react/src/components/conversation/TaskSummary'
import { WorkspaceTabs } from '../apps/harness-react/src/components/workspace/WorkspaceTabs'
import { OverviewPanel } from '../apps/harness-react/src/components/workspace/OverviewPanel'
import { MiraCommandPane } from '../apps/harness-react/src/components/workspace/MiraCommandPane'
import { MiraSubtaskPanel } from '../apps/harness-react/src/components/workspace/MiraSubtaskPanel'
import { MiraSideConversation } from '../apps/harness-react/src/components/workspace/MiraSideConversation'
import { MiraTaskGrid } from '../apps/harness-react/src/components/workspace/MiraTaskGrid'
import { ConversationTurnRail } from '../apps/harness-react/src/components/conversation/ConversationTurnRail'
import { MiraTaskChangesPanel } from '../apps/harness-react/src/components/workspace/MiraTaskChangesPanel'
import { MiraPlanDetail } from '../apps/harness-react/src/components/workspace/MiraPlanDetail'
import { miraTaskPaneIds } from '../apps/harness-react/src/state/mira-task-layout'
import { PermissionResponseCard, type PermissionResponseCardProps } from '../apps/harness-react/src/components/conversation/AssistantMessageParts'
import { MiraTaskFind } from '../apps/harness-react/src/components/conversation/MiraTaskFind'
import { TerminalPanel } from '../apps/harness-react/src/components/workspace/TerminalPanel'
import { MiraBottomTerminal } from '../apps/harness-react/src/components/workspace/MiraBottomTerminal'
import { MiraBrowserPanel } from '../apps/harness-react/src/components/workspace/MiraBrowserPanel'
import { WorkspaceEditorButton } from '../apps/harness-react/src/components/workspace/WorkspaceEditorButton'
import { MiraWorkbenchHelp } from '../apps/harness-react/src/components/workbench/MiraWorkbenchHelp'
import type { MiraAppNavigationCommand, MiraAppNavigationSnapshot, MiraAppNavigationState, MiraAppNavigationTarget } from '../src/platform/appNavigation'

const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, (value: unknown) => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true } }] },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (!slot.deps || deps.length !== slot.deps.length || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = factory(); slot.deps = deps }; return slot.value },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useImperativeHandle: (ref: { current: unknown } | null, create: () => unknown) => { if (ref) ref.current = create() },
  useLayoutEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return; slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) },
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return; slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) },
}))
vi.mock('../apps/harness-react/src/components/session/SessionSidebar', () => ({ SessionSidebar: 'session-sidebar', SessionMenuItems: 'session-menu', useHarnessSessionShortcuts: vi.fn() }))
vi.mock('../apps/harness-react/src/hooks/useModalFocusTrap', () => ({ useModalFocusTrap: vi.fn() }))
vi.mock('../src/utils/documentMotion', () => ({ installDocumentMotion: vi.fn() }))

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (value: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
const task = (id: string, projectId?: string): HarnessSession => ({ version: 1, id, title: id, ...(projectId ? { projectId } : {}), workingDirectory: '/project', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false })
function fixture({ autoRestore = true, snapshot }: { autoRestore?: boolean; snapshot?: MiraAppNavigationSnapshot } = {}) {
  let records = [task('a', 'project-a'), task('b', 'project-b')]
  const commands = new Set<(command: MiraAppNavigationCommand) => void>(), restores = new Set<(snapshot: MiraAppNavigationSnapshot | undefined) => void>()
  let theme: 'light' | 'dark' = 'light'
  let closeContext: (() => Promise<boolean>) | undefined
  const host = {
    onEvent: vi.fn(() => () => undefined),
    onCloseContext: (callback: () => Promise<boolean>) => { closeContext = callback; return () => { if (closeContext === callback) closeContext = undefined } },
    requestWorkflow: vi.fn(async () => []),
    getTheme: () => theme, toggleTheme: vi.fn(async () => { theme = theme === 'light' ? 'dark' : 'light'; return theme }),
    selectProject: vi.fn<() => Promise<HarnessProject | null>>(async () => null),
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
  return { controller, host, navigation, close: () => closeContext!(), restore: (value?: MiraAppNavigationSnapshot) => restores.forEach(listener => listener(value)), go: (direction: 'back' | 'forward', expectedRevision = navigation().revision) => commands.forEach(listener => listener({ type: 'mira:app-navigation-command', direction, expectedRevision })) }
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
  it.each(['tab', 'all', 'shortcut'] as const)('collapses an automatically opened workspace after its last resource closes via %s', async method => {
    const api = fixture(), view = mount(api.controller); await view.drain()
    const toggle = () => view.props(props => props['aria-label'] === '切换面板' && typeof props.onClick === 'function')
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    await (view.sidebar().onOpenModelTrace as (id: string) => Promise<void>)('a'); await view.drain()
    await tabs().onOpen('browser'); await view.drain()
    await tabs().onClose(tabs().active); await view.drain()
    expect(view.props(props => props.id === 'pilot-workspace')['aria-hidden']).toBe(false)
    expect(tabs().tabs).toHaveLength(1)
    if (method === 'all') await tabs().onCloseAll()
    else if (method === 'shortcut') await api.close()
    else await tabs().onClose(tabs().active)
    await view.drain()
    expect(tabs().tabs).toEqual([])
    expect(toggle()['aria-expanded']).toBe(false)
    view.unmount()
  })

  it('keeps an explicitly opened empty workspace, then resets that intent when dismissed', async () => {
    const { controller } = fixture(), view = mount(controller); await view.drain()
    const toggle = () => view.props(props => props['aria-label'] === '切换面板' && typeof props.onClick === 'function')
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    ;(toggle().onClick as () => void)(); await view.drain()
    await (view.sidebar().onOpenModelTrace as (id: string) => Promise<void>)('a'); await view.drain()
    await tabs().onCloseAll(); await view.drain()
    expect(tabs().tabs).toEqual([])
    expect(view.props(props => props.id === 'pilot-workspace')['aria-hidden']).toBe(false)
    tabs().onDismiss(); await view.drain()
    await (view.sidebar().onOpenModelTrace as (id: string) => Promise<void>)('a'); await view.drain()
    await tabs().onClose(tabs().active); await view.drain()
    expect(toggle()['aria-expanded']).toBe(false)
    view.unmount()
  })

  it('uses the ZCode draft and task header action order without an editor on an unsent task', async () => {
    const { controller } = fixture(), view = mount(controller); await view.drain()
    const actions = () => React.Children.toArray(view.props(p => String(p.className).startsWith('harness-thread-header__actions')).children as React.ReactNode).filter(React.isValidElement)
    expect(actions().some(element => element.type === WorkspaceEditorButton)).toBe(false)
    expect(actions()[0].type).toBe(MiraWorkbenchHelp)
    controller.getSnapshot().messages = [{ id: 'user', role: 'user', content: '已有任务', createdAt: 1 }]
    view.render(); await view.drain()
    expect(actions()[0].type).toBe(WorkspaceEditorButton)
    expect(actions()[1].type).toBe(MiraWorkbenchHelp)
    controller.getSnapshot().messages = []
    view.render(); await view.drain()
    expect(actions().some(element => element.type === WorkspaceEditorButton)).toBe(false)
    view.unmount()
  })
  it('collapses the panel and restores its toggle entry without removing resources', async () => {
    const { controller } = fixture(), view = mount(controller); await view.drain()
    ;(view.props(p => p['aria-label'] === '切换面板' && typeof p.onClick === 'function').onClick as () => void)(); await view.drain()
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    await tabs().onOpen('browser'); await view.drain()
    const resourceId = tabs().active
    expect(() => view.props(p => p['aria-label'] === '切换面板' && typeof p.onClick === 'function')).toThrow('Missing workbench element')
    tabs().onDismiss(); await view.drain()
    expect(view.props(p => p.id === 'pilot-workspace')['aria-hidden']).toBe(true)
    expect(tabs().active).toBe(resourceId); expect(tabs().tabs).toHaveLength(1)
    ;(view.props(p => p['aria-label'] === '切换面板' && typeof p.onClick === 'function').onClick as () => void)(); await view.drain()
    expect(view.props(p => p.id === 'pilot-workspace')['aria-hidden']).toBe(false)
    expect(tabs().active).toBe(resourceId)
    view.unmount()
  })
  it('closes a measured bottom terminal even when the panel library resets its previous-size snapshot', () => {
    const { controller } = fixture(), onClose = vi.fn()
    const tree = MiraBottomTerminal({ controller, sessionId: 'a', directory: '/project', retainedSessionIds: ['a'], open: true, active: true, onClose, onFocus: vi.fn(), onOpenAddress: vi.fn(), children: null })
    const panel = React.Children.toArray(tree.props.children).find(node => React.isValidElement<{ className: string }>(node) && node.props.className === 'mira-bottom-terminal-panel') as React.ReactElement<{ onResize(size: { asPercentage: number; inPixels: number }, id: string, previous?: { asPercentage: number; inPixels: number }): void }>
    panel.props.onResize({ asPercentage: 0, inPixels: 0 }, 'mira-bottom-terminal-panel')
    expect(onClose).not.toHaveBeenCalled()
    panel.props.onResize({ asPercentage: 30, inPixels: 240 }, 'mira-bottom-terminal-panel')
    panel.props.onResize({ asPercentage: 0, inPixels: 0 }, 'mira-bottom-terminal-panel', { asPercentage: 0, inPixels: 0 })
    expect(onClose).toHaveBeenCalledOnce()
    panel.props.onResize({ asPercentage: 0, inPixels: 0 }, 'mira-bottom-terminal-panel')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps terminal collapse synchronized when ResizeObserver coalesces a requested reopen and End', () => {
    const { controller } = fixture(), onClose = vi.fn(), resize = vi.fn()
    const tree = MiraBottomTerminal({ controller, sessionId: 'a', retainedSessionIds: ['a'], open: true, active: true, onClose, onFocus: vi.fn(), onOpenAddress: vi.fn(), children: null })
    const panel = React.Children.toArray(tree.props.children).find(node => React.isValidElement<{ className: string }>(node) && node.props.className === 'mira-bottom-terminal-panel') as React.ReactElement<{ panelRef: { current: unknown }; onResize(size: { asPercentage: number; inPixels: number }, id: string): void }>
    panel.props.onResize({ asPercentage: 0, inPixels: 0 }, 'mira-bottom-terminal-panel'); expect(onClose).not.toHaveBeenCalled()
    panel.props.panelRef.current = { resize }
    hooks.effects.splice(0).forEach(effect => effect())
    expect(resize).toHaveBeenCalledWith('240px')
    panel.props.onResize({ asPercentage: 0, inPixels: 0 }, 'mira-bottom-terminal-panel')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each(['MacIntel', 'Win32'])('matches resource and terminal physical keys when the layout changes characters on %s', async platform => {
    vi.stubGlobal('navigator', { platform })
    const listeners = new Set<(event: KeyboardEvent) => void>()
    vi.mocked(window.addEventListener).mockImplementation((type, listener) => { if (type === 'keydown') listeners.add(listener as (event: KeyboardEvent) => void) })
    vi.mocked(window.removeEventListener).mockImplementation((type, listener) => { if (type === 'keydown') listeners.delete(listener as (event: KeyboardEvent) => void) })
    const { controller } = fixture(), view = mount(controller); await view.drain()
    const key = async (options: Partial<KeyboardEvent>) => {
      const event = { key: '∫', code: 'KeyB', metaKey: platform === 'MacIntel', ctrlKey: platform === 'Win32', altKey: true, shiftKey: false, repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false, target: null, preventDefault() { this.defaultPrevented = true }, stopPropagation: vi.fn(), ...options } as unknown as KeyboardEvent
      listeners.forEach(listener => listener(event)); await view.drain(); return event
    }
    const workspace = () => String(view.props(props => props.id === 'mira-inspector').className).includes(' is-open')
    for (const options of [{ metaKey: true, ctrlKey: true }, { metaKey: platform === 'Win32', ctrlKey: platform === 'MacIntel' }, { shiftKey: true }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }, { code: 'KeyV' }, { altKey: false }]) {
      await key(options); expect(workspace()).toBe(false)
    }
    const querySelector = vi.fn(() => ({})); Object.assign(document, { querySelector })
    expect((await key({})).defaultPrevented).toBe(false); expect(workspace()).toBe(false)
    querySelector.mockReturnValue(null as any)
    expect((await key({})).defaultPrevented).toBe(true); expect(workspace()).toBe(true)
    expect((await key({ key: 'B', code: '' })).defaultPrevented).toBe(true); expect(workspace()).toBe(false)
    expect((await key({ key: 'о', code: 'KeyJ', altKey: false })).defaultPrevented).toBe(true)
    expect(view.props((_, element) => element.type === MiraBottomTerminal).open).toBe(true)
    expect((await key({ key: 'J', code: '', altKey: false })).defaultPrevented).toBe(true)
    expect(view.props((_, element) => element.type === MiraBottomTerminal).open).toBe(false)
    view.unmount(); expect(listeners.size).toBe(0)
  })

  it('closes only the visible active resource and grants window fallback only after drafts save', async () => {
    const { controller, close } = fixture(), view = mount(controller); await view.drain()
    const flush = vi.spyOn(controller, 'flushBeforeNavigation')
    expect(await close()).toBe(false); expect(flush).toHaveBeenCalledWith(false)
    ;(view.props(props => props['aria-label'] === '切换面板').onClick as () => void)(); await view.drain()
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    await tabs().onOpen('terminal'); await view.drain(); const first = tabs().active
    await tabs().onOpen('browser'); await view.drain(); const second = tabs().active
    expect(await close()).toBe(true); await view.drain()
    expect(tabs().tabs.map(tab => tab.id)).toEqual([first]); expect(tabs().recentClosedTabs?.some(tab => tab.id === second)).toBe(true)
    flush.mockRejectedValueOnce(new Error('save blocked'))
    expect(await close()).toBe(true); await view.drain(); expect(tabs().tabs.map(tab => tab.id)).toEqual([first])
    expect(controller.getSnapshot().error).toContain('工作台保存失败')
    tabs().onDismiss(); await view.drain()
    expect(await close()).toBe(false); await view.drain(); expect(tabs().tabs.map(tab => tab.id)).toEqual([first])
    flush.mockRejectedValueOnce(new Error('fallback save blocked')); expect(await close()).toBe(true)
    expect(controller.getSnapshot().error).toContain('已保留当前标签和窗口')
    view.unmount()
  })
  it('consumes a stale window fallback when a new resource opens during its save', async () => {
    const { controller, close } = fixture(), view = mount(controller); await view.drain()
    const held = deferred<void>(); vi.spyOn(controller, 'flushBeforeNavigation').mockReturnValueOnce(held.promise)
    const closing = close()
    ;(view.props(props => props['aria-label'] === '切换面板').onClick as () => void)(); await view.drain()
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    await tabs().onOpen('browser'); await view.drain(); held.resolve(); expect(await closing).toBe(true)
    expect(tabs().tabs).toHaveLength(1); view.unmount()
  })
  it('does not publish a late failed close into a newly selected task', async () => {
    const { controller, close } = fixture(), view = mount(controller); await view.drain()
    const held = deferred<void>(); vi.spyOn(controller, 'flushBeforeNavigation').mockReturnValueOnce(held.promise)
    const report = vi.spyOn(controller, 'reportError'), closing = close()
    await view.sidebar().onOpenSession('b'); await view.drain(); held.reject(new Error('old save failed'))
    expect(await closing).toBe(true); expect(controller.getSnapshot().session?.id).toBe('b'); expect(report).not.toHaveBeenCalled()
    view.unmount()
  })
  it('switches the Shell theme without navigating or flushing task drafts', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const flush = vi.spyOn(controller, 'flushBeforeNavigation')
    expect(view.commandCenter().commands.find(command => command.id === 'theme')?.label).toBe('切换为深色模式')
    expect(await view.command('theme')).toBe(true); await view.drain()
    expect(view.commandCenter().commands.find(command => command.id === 'theme')?.label).toBe('切换为浅色模式')
    expect(host.toggleTheme).toHaveBeenCalledOnce(); expect(flush).not.toHaveBeenCalled()
    expect(controller.getSnapshot().session?.id).toBe('a'); expect(host.navigate).not.toHaveBeenCalled()
    view.unmount()
  })
  it('holds duplicate theme toggles and allows retry after the owner rejects', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const held = deferred<'light' | 'dark'>(); host.toggleTheme.mockReturnValueOnce(held.promise)
    const first = view.command('theme'); expect(await view.command('theme')).toBe(false)
    held.reject(new Error('主题切换失败')); await expect(first).rejects.toThrow('主题切换失败')
    expect(await view.command('theme')).toBe(true); expect(host.toggleTheme).toHaveBeenCalledTimes(2)
    view.unmount()
  })
  it('preserves the current task on project picker cancellation and save failure', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    expect(await view.command('open-project')).toBe(false); expect(controller.getSnapshot().session?.id).toBe('a')
    vi.spyOn(controller, 'flushBeforeNavigation').mockRejectedValueOnce(new Error('输入未保存'))
    await expect(view.command('open-project')).rejects.toThrow('输入未保存')
    expect(host.selectProject).toHaveBeenCalledOnce(); expect(host.createSession).not.toHaveBeenCalled()
    view.unmount()
  })
  it('opens the selected project as a draft only after saving, without creating or submitting a task', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const order: string[] = []; vi.spyOn(controller, 'flushBeforeNavigation').mockImplementation(async () => { order.push('save') })
    host.selectProject.mockImplementationOnce(async () => { order.push('select'); return projectFixtures()[2] })
    expect(await view.command('open-project')).toBe(true); await view.drain()
    expect(order[0]).toBe('save'); expect(order[1]).toBe('select')
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(view.pageProps((_, element) => element.type === HarnessComposer).draftProjectId).toBe('empty')
    expect(host.createSession).not.toHaveBeenCalled(); expect(host.prepareSession).not.toHaveBeenCalled()
    view.unmount()
  })
  it('does not let a late directory picker replace a newer task, and prevents duplicate pickers', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const held = deferred<HarnessProject | null>(); host.selectProject.mockReturnValueOnce(held.promise)
    const first = view.command('open-project'); await view.drain()
    expect(await view.command('open-project')).toBe(false); expect(host.selectProject).toHaveBeenCalledOnce()
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('b'); await view.drain()
    held.resolve(projectFixtures()[2]); expect(await first).toBe(false); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('b')
    view.unmount()
  })
  it('rejects an unavailable project directory without changing the current task', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    host.selectProject.mockResolvedValueOnce({ ...projectFixtures()[2], directoryExists: false })
    await expect(view.command('open-project')).rejects.toThrow('所选项目目录不可用')
    expect(controller.getSnapshot().session?.id).toBe('a'); view.unmount()
  })
  it('exposes adjacent tasks separately from history and saves drafts before opening', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const saved = deferred<void>(), flush = vi.spyOn(controller, 'flushBeforeNavigation').mockReturnValueOnce(saved.promise).mockResolvedValue(undefined)
    const switching = view.command('next-task')
    expect(host.getSession).not.toHaveBeenCalled()
    expect(await view.command('next-task')).toBe(false)
    saved.resolve(); expect(await switching).toBe(true); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('b')
    expect(flush).toHaveBeenCalled(); expect(host.getSession).toHaveBeenCalledExactlyOnceWith('b')
    expect(await view.command('next-task')).toBe(false)
    expect(await view.command('previous-task')).toBe(true); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(view.commandCenter().commands.find(command => command.id === 'next-task')?.shortcut).toContain(']')
    view.unmount()
  })

  it('keeps the original task and history if saving before adjacent navigation fails', async () => {
    const { controller, host, navigation } = fixture(), view = mount(controller); await view.drain()
    const before = navigation().snapshot
    vi.spyOn(controller, 'flushBeforeNavigation').mockRejectedValueOnce(new Error('任务草稿保存失败'))
    await expect(view.command('next-task')).rejects.toThrow('任务草稿保存失败'); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('a'); expect(navigation().snapshot).toEqual(before)
    expect(host.getSession).not.toHaveBeenCalled()
    expect(await view.command('next-task')).toBe(true); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('b')
    view.unmount()
  })

  it('does not navigate to another directory even when it shares the project', async () => {
    const { controller, host } = fixture()
    controller.getSnapshot().sessions[1].workingDirectory = '/other-directory'
    controller.getSnapshot().sessions[1].projectId = 'project-a'
    const view = mount(controller); await view.drain()
    expect(await view.command('next-task')).toBe(false); expect(host.getSession).not.toHaveBeenCalled()
    view.unmount()
  })

  it('switches relative to the focused side task without replacing the main task', async () => {
    const { controller } = fixture(), view = mount(controller); await view.drain()
    const entry = view.sidebar().taskPaneEntry as { open: (id: string) => Promise<boolean> }
    await entry.open('b'); await view.drain()
    expect(view.sidebar().activeSessionId).toBe('b')
    expect(await view.command('previous-task')).toBe(true); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('a'); expect(view.sidebar().activeSessionId).toBe('a')
    view.unmount()
  })

  it('replaces only the focused anonymous side pane when selecting another ungrouped sidebar task', async () => {
    const { controller, host } = fixture()
    Object.assign(controller.getSnapshot(), { session: undefined })
    const view = mount(controller); await view.drain()
    const grid = () => view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>
    await grid().onPlace('b', '$primary', 'left'); await view.drain()
    const before = grid().layout
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('a'); await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(miraTaskPaneIds(grid().layout)).toEqual(['a', '$primary'])
    expect(grid().layout).toMatchObject({ ...before, first: { kind: 'task', id: 'a' } })
    expect(view.sidebar().activeSessionId).toBe('a')
    await controller.flushBeforeNavigation()
    const saved = host.setPreference.mock.calls.filter(([key]) => key === 'harness-react-workspace').at(-1)![1] as Record<string, { recentClosedTabs: Array<{ taskSessionId?: string }> }>
    expect(saved.draft.recentClosedTabs[0].taskSessionId).toBe('b')
    expect(host.createSession).not.toHaveBeenCalled(); expect(host.prepareSession).not.toHaveBeenCalled()
    view.unmount()
  })

  it('keeps an anonymous split and the original task after replacement draft saving fails', async () => {
    const { controller } = fixture()
    Object.assign(controller.getSnapshot(), { session: undefined })
    const view = mount(controller); await view.drain()
    const grid = () => view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>
    await grid().onPlace('b', '$primary', 'down'); await view.drain()
    vi.spyOn(controller, 'flushBeforeNavigation').mockRejectedValueOnce(new Error('替换前草稿保存失败'))
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('a'); await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary', 'b'])
    expect(controller.getSnapshot().error).toBe('切换任务前未能保存工作台，当前输入已保留；请重试。')
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('a'); await view.drain()
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary', 'a'])
    expect(controller.getSnapshot().error).toBeUndefined()
    view.unmount()
  })

  it('preserves a different controller error when an anonymous secondary replacement succeeds', async () => {
    const { controller } = fixture()
    Object.assign(controller.getSnapshot(), { session: undefined })
    const view = mount(controller); await view.drain()
    const grid = () => view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>
    await grid().onPlace('b', '$primary', 'right'); await view.drain()
    controller.reportError(new Error('另一个操作仍有错误'))
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('a'); await view.drain()
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary', 'a'])
    expect(controller.getSnapshot().error).toBe('另一个操作仍有错误')
    view.unmount()
  })

  it('discards a late anonymous pane replacement after the user focuses the primary input', async () => {
    const { controller } = fixture()
    Object.assign(controller.getSnapshot(), { session: undefined })
    const view = mount(controller); await view.drain()
    const grid = () => view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>
    await grid().onPlace('b', '$primary', 'right'); await view.drain()
    const held = deferred<void>()
    vi.spyOn(controller, 'flushBeforeNavigation').mockReturnValueOnce(held.promise).mockResolvedValue(undefined)
    const selecting = (view.sidebar().onOpenSession as (id: string) => Promise<void>)('a')
    ;(view.pageProps(p => Boolean(p.onFocusCapture)).onFocusCapture as () => void)(); view.render()
    held.resolve(); await selecting; await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary', 'b'])
    view.unmount()
  })

  it('keeps a split task summary, changes, turn navigation and actions scoped to that task', async () => {
    const { controller: parentController } = fixture(), { controller: sideController } = fixture()
    const activity = { id: 'side-step', kind: 'plan' as const, label: '侧面步骤', status: 'running' as const, startedAt: 1 }
    const side = { ...task('b'), activeRun: { id: 'side-run', startedAt: 1, activities: [activity], subtasks: [] }, activePlan: { id: 'side-plan', status: 'awaiting_confirmation' as const, request: '侧面计划', understanding: '仅确认侧面任务', steps: [], risks: [], createdAt: 1, updatedAt: 1 }, pendingInteraction: { id: 'side-review', kind: 'plan-review' as const, status: 'waiting' as const, planId: 'side-plan', createdAt: 1 } }
    side.toolCalls = [{ id: 'side-submission', tool: 'present_plan', status: 'ok', createdAt: 1, input: { text: JSON.stringify({ understanding: '# 侧面方案', steps: [{ label: '仅修改侧面任务' }] }), truncated: false } }]
    const messages: HarnessMessage[] = [{ id: 'side-user', role: 'user', content: '侧面请求', createdAt: 1 }, { id: 'side-reply', role: 'assistant', content: '侧面回复', createdAt: 2, fileChanges: [{ path: 'side-only.md', tool: 'write', toolCallId: 'side-write', diff: '+侧面内容' }] }]
    Object.assign(sideController.getSnapshot(), { session: side, messages })
    parentController.getSnapshot().messages = [{ id: 'main-reply', role: 'assistant', content: '主任务', createdAt: 2, fileChanges: [{ path: 'main-only.md', tool: 'write', toolCallId: 'main-write' }] }]
    const createSide = vi.spyOn(parentController, 'createTaskPaneController').mockReturnValue(sideController)
    const stop = vi.spyOn(sideController, 'stopSubtasks').mockResolvedValue(undefined)
    const props: React.ComponentProps<typeof MiraSideConversation> = { parentController, parentId: 'draft', childSessionId: 'b', existingTask: true, active: true, keyboardActive: true, requests: [], onConsume: vi.fn(), onFocus: vi.fn(), onOpenFile: vi.fn() }
    let tree: React.ReactNode
    const find = (match: (node: React.ReactElement<Record<string, unknown>>) => boolean) => {
      const visit = (node: React.ReactNode): React.ReactElement<Record<string, unknown>> | undefined => {
        if (Array.isArray(node)) return node.map(visit).find(Boolean)
        if (!React.isValidElement<Record<string, unknown>>(node)) return
        return match(node) ? node : visit(node.props.children as React.ReactNode)
      }
      const node = visit(tree); if (!node) throw new Error('Missing scoped task element'); return node.props
    }
    const render = () => { hooks.cursor = 0; tree = MiraSideConversation(props) }
    render()
    const summary = () => find(node => node.type === TaskSummary) as unknown as React.ComponentProps<typeof TaskSummary>
    expect(summary().activities).toEqual([activity]); expect(summary().changes).toBe(1)
    expect(summary().plans?.map(plan => plan.id)).toEqual(['side-submission'])
    summary().onOpenPlan!('side-submission'); render()
    expect((find(node => node.type === MiraPlanDetail).plan as { id: string }).id).toBe('side-submission')
    expect(find(node => node.props.className === 'mira-side-conversation__header').children).toEqual(expect.arrayContaining([expect.objectContaining({ props: expect.objectContaining({ children: '方案详情' }) })]))
    expect(find(node => node.type === HarnessComposer).active).toBe(false)
    expect(side.pendingInteraction.status).toBe('waiting')
    ;(find(node => node.props['aria-label'] === '返回侧面任务').onClick as () => void)(); render()
    expect(find(node => node.type === HarnessComposer).active).toBe(true)
    summary().onOpenPlan!('unknown-plan'); render()
    expect(() => find(node => node.type === MiraPlanDetail)).toThrow('Missing scoped task element')
    summary().onOpenProgress!(); render()
    expect(find(node => node.type === OverviewPanel)).toMatchObject({ sessionId: 'b', runId: 'side-run' })
    ;(find(node => node.props['aria-label'] === '返回侧面任务').onClick as () => void)(); render()
    summary().onOpenChanges(); render()
    expect(find(node => node.type === MiraTaskChangesPanel).changes).toEqual([expect.objectContaining({ path: 'side-only.md' })])
    ;(find(node => node.props['aria-label'] === '返回侧面任务').onClick as () => void)(); render()
    const timelineRef = find(node => node.type === MiraTaskFind).timelineRef as React.RefObject<{ jumpToMessage: ReturnType<typeof vi.fn>; jumpToInteraction: ReturnType<typeof vi.fn> }>
    timelineRef.current = { jumpToMessage: vi.fn(), jumpToInteraction: vi.fn() }
    ;(find(node => node.type === ConversationTurnRail).onNavigate as (id: string) => void)('side-user')
    expect(timelineRef.current.jumpToMessage).toHaveBeenCalledWith('side-user')
    summary().onReviewPlan()
    expect(timelineRef.current.jumpToInteraction).toHaveBeenCalledWith({ kind: 'interaction', id: 'side-review' })
    await summary().onStopSubtask('side-agent'); expect(stop).toHaveBeenCalledWith('side-agent')
    props.parentId = 'prepared'; render(); expect(createSide).toHaveBeenCalledOnce()
    expect(find(node => node.type === HarnessComposer).state).toBe(sideController.getSnapshot())
    sideController.getSnapshot().session!.pendingInteraction = undefined; render()
    summary().onReviewPlan(); render()
    expect(find(node => node.type === OverviewPanel)).toMatchObject({ sessionId: 'b', runId: 'side-run' })
  })

  it('promotes an anonymous split workspace without replacing its primary Composer or losing task bindings', async () => {
    const { controller, host } = fixture()
    Object.assign(controller.getSnapshot(), { session: undefined })
    const view = mount(controller); await view.drain()
    let gridKey: React.Key | null = null
    const grid = () => view.props((_, element) => { if (element.type !== MiraTaskGrid) return false; gridKey = element.key; return true }) as unknown as React.ComponentProps<typeof MiraTaskGrid>
    await grid().onPlace('b', '$primary', 'left'); await view.drain()
    const originalLayout = grid().layout, originalKey = gridKey
    Object.assign(controller.getSnapshot(), { session: { ...task('prepared'), draftState: 'prepared' } })
    view.render(); await view.drain()
    expect(grid().layout).toEqual(originalLayout)
    expect(gridKey).toBe(originalKey)
    await controller.flushBeforeNavigation()
    const saved = host.setPreference.mock.calls.filter(([key]) => key === 'harness-react-workspace').at(-1)![1] as Record<string, unknown>
    expect(saved.draft).toBeUndefined()
    expect(saved.prepared).toMatchObject({ taskLayout: originalLayout, tabs: [expect.objectContaining({ taskSessionId: 'b' })] })
    Object.assign(controller.getSnapshot(), { session: { ...task('prepared'), draftState: 'accepted' } })
    view.render(); await view.drain()
    expect(grid().layout).toEqual(originalLayout); expect(gridKey).toBe(originalKey)
    view.unmount()
  })

  it('allows dragging project and personal tasks from different directories into the current split', async () => {
    const { controller, host } = fixture()
    const records = [task('a', 'project-a'), task('b', 'project-b'), task('personal')].map((session, index) => ({ ...session, workingDirectory: ['/project-a', '/project-b', '/personal'][index] }))
    host.getSession.mockImplementation(async id => records.find(session => session.id === id)!)
    Object.assign(controller.getSnapshot(), { session: records[0], sessions: records })
    const view = mount(controller); await view.drain()
    const grid = () => view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>
    expect(grid().canPlace('b')).toBe(true)
    await grid().onPlace('b', '$primary', 'right'); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary', 'b'])
    expect(grid().canPlace('personal')).toBe(true)
    await grid().onPlace('personal', 'b', 'down'); await view.drain()
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary', 'b', 'personal'])
    expect(grid().canPlace('b')).toBe(false)
    await controller.flushBeforeNavigation()
    const saved = host.setPreference.mock.calls.filter(([key]) => key === 'harness-react-workspace').at(-1)![1] as Record<string, { taskLayout: unknown }>
    expect(saved.a.taskLayout).toEqual(grid().layout)
    view.unmount()
  })

  it('places four tasks around their requested anchors, keeps resource closure independent and restores a task group from a later selection', async () => {
    const { controller, host } = fixture()
    const records = ['a', 'b', 'c', 'd', 'outside'].map(id => task(id, 'project-a'))
    host.getSession.mockImplementation(async id => records.find(task => task.id === id)!)
    controller.getSnapshot().sessions = records
    const view = mount(controller); await view.drain()
    const grid = () => view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>
    await grid().onPlace('b', '$primary', 'right'); await view.drain()
    await grid().onPlace('c', '$primary', 'down'); await view.drain()
    await grid().onPlace('d', 'b', 'down'); await view.drain()
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary', 'c', 'b', 'd'])
    expect(grid().canPlace('outside')).toBe(false)
    expect(controller.getSnapshot().session?.id).toBe('a')
    ;(view.props(p => p['aria-label'] === '切换面板').onClick as () => void)(); await view.drain()
    const resources = view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    expect(resources.tabs).toHaveLength(0); await resources.onCloseAll(); await view.drain()
    expect(miraTaskPaneIds(grid().layout)).toHaveLength(4)
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('outside'); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('outside')
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('c'); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(miraTaskPaneIds(grid().layout)).toHaveLength(4)
    expect(view.sidebar().activeSessionId).toBe('c')
    view.unmount()
  })

  it('dissolves a deleted primary split without promoting its secondary and keeps the remaining task independently navigable', async () => {
    const { controller, host } = fixture()
    await controller.open('a')
    const view = mount(controller); await view.drain()
    const grid = () => view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>
    await grid().onPlace('b', '$primary', 'right'); await view.drain()
    host.getSession.mockClear()
    await controller.deleteSession('a'); await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary'])
    expect(controller.getSnapshot().sessions.map(item => item.id)).toEqual(['b'])
    expect(host.getSession).not.toHaveBeenCalled()
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('b'); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('b')
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary'])
    view.unmount()
  })

  it.each(['archiveSession', 'deleteSession'] as const)('retains a visible secondary and split geometry when %s draft saving fails', async action => {
    const { controller, host } = fixture()
    await controller.open('a')
    const view = mount(controller); await view.drain()
    const grid = () => view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>
    await grid().onPlace('b', '$primary', 'down'); await view.drain()
    const layout = grid().layout
    const unregister = controller.registerBeforeNavigation(async () => { throw new Error('分屏草稿未保存') })
    await expect(controller[action]('b')).rejects.toThrow('分屏草稿未保存'); await view.drain()
    expect(host[action]).not.toHaveBeenCalled()
    expect(grid().layout).toEqual(layout)
    expect(controller.getSnapshot().session?.id).toBe('a')
    unregister(); await controller[action]('b'); await view.drain()
    expect(host[action]).toHaveBeenCalledExactlyOnceWith('b')
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(miraTaskPaneIds(grid().layout)).toEqual(action === 'deleteSession' ? ['$primary'] : ['$primary', 'b'])
    view.unmount()
  })

  it('closes only the side task tab after successful draft flush, without aborting its runtime', async () => {
    const { controller } = fixture(), view = mount(controller); await view.drain()
    await (view.sidebar().taskPaneEntry as { open: (id: string) => Promise<boolean> }).open('b'); await view.drain()
    const side = () => view.props((_, element) => element.type === MiraSideConversation) as unknown as React.ComponentProps<typeof MiraSideConversation>
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    const stop = vi.spyOn(controller, 'stop'), flush = vi.spyOn(controller, 'flushBeforeNavigation').mockRejectedValueOnce(new Error('草稿保存失败'))
    expect(side().primaryDirectory).toBe('/project-a')
    await expect(side().onClose!()).rejects.toThrow('草稿保存失败'); await view.drain()
    expect(side().childSessionId).toBe('b')
    flush.mockResolvedValue(undefined)
    expect(await side().onClose!()).toBe(true); await view.drain()
    expect(miraTaskPaneIds((view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>).layout)).toEqual(['$primary'])
    ;(view.props(p => p['aria-label'] === '切换面板').onClick as () => void)(); await view.drain()
    expect(tabs().tabs).toHaveLength(0)
    expect(tabs().recentClosedTabs[0].taskSessionId).toBe('b')
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(stop).not.toHaveBeenCalled()
    view.unmount()
  })

  it('ignores a pending pane close when the primary task changes during draft flush', async () => {
    const { controller } = fixture(), view = mount(controller); await view.drain()
    await (view.sidebar().taskPaneEntry as { open: (id: string) => Promise<boolean> }).open('b'); await view.drain()
    const side = view.props((_, element) => element.type === MiraSideConversation) as unknown as React.ComponentProps<typeof MiraSideConversation>
    const held = deferred<void>(), flush = vi.spyOn(controller, 'flushBeforeNavigation').mockReturnValueOnce(held.promise).mockResolvedValue(undefined)
    const closing = side.onClose!()
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('created'); await view.drain()
    held.resolve(); expect(await closing).toBe(false); await view.drain()
    expect(controller.getSnapshot().session?.id).toBe('created')
    flush.mockRestore(); view.unmount()
  })

  it('shows only floating pane chrome and a truthful cross-workspace badge, retaining detail navigation', () => {
    const { controller: parentController } = fixture(), { controller: sideController } = fixture()
    Object.assign(sideController.getSnapshot(), { session: { ...task('b'), title: '独立侧面任务', workingDirectory: '/research/长项目名📚' } })
    parentController.getSnapshot().sessions.find(session => session.id === 'b')!.title = '独立侧面任务'
    vi.spyOn(parentController, 'createTaskPaneController').mockReturnValue(sideController)
    const props: React.ComponentProps<typeof MiraSideConversation> = { parentController, parentId: 'a', childSessionId: 'b', existingTask: true, primaryDirectory: '/project', active: true, keyboardActive: true, requests: [], onConsume: vi.fn(), onFocus: vi.fn(), onOpenFile: vi.fn(), onClose: vi.fn(async () => true) }
    const visit = (node: React.ReactNode, match: (node: React.ReactElement<Record<string, unknown>>) => boolean): React.ReactElement<Record<string, unknown>> | undefined => {
      if (Array.isArray(node)) { for (const child of node) { const found = visit(child, match); if (found) return found }; return }
      if (!React.isValidElement<Record<string, unknown>>(node)) return
      return match(node) ? node : visit(node.props.children as React.ReactNode, match)
    }
    const render = () => { hooks.cursor = 0; return MiraSideConversation(props) }
    let tree = render()
    expect(visit(tree, node => node.type === 'header')).toBeUndefined()
    expect(visit(tree, node => node.props['data-task-title'] === '独立侧面任务')?.props.className).toBe('sr-only')
    expect(visit(tree, node => node.props.className === 'mira-side-conversation__workspace')?.props.title).toBe('/research/长项目名📚')
    props.primaryDirectory = '/research/长项目名📚/'
    expect(visit(render(), node => node.props.className === 'mira-side-conversation__workspace')).toBeUndefined()
    props.active = false
    expect(visit(render(), node => node.props['aria-label'] === '关闭侧面任务窗格')?.props.disabled).toBe(true)
    props.active = true
    tree = render()
    const context = visit(tree, node => Boolean((node.props.value as { openFile?: unknown } | undefined)?.openFile))!.props.value as { openFile: (path: string) => void }
    context.openFile('notes/README.md'); tree = render()
    expect(visit(tree, node => node.type === 'header')).toBeDefined()
    expect(visit(tree, node => node.props['aria-label'] === '返回侧面任务')).toBeDefined()
    expect(visit(tree, node => node.props.className === 'mira-side-conversation__actions')).toBeUndefined()
  })

  it('guards duplicate floating closes and restores removed focus without stealing newer input focus', async () => {
    const { controller: parentController } = fixture(), { controller: sideController } = fixture()
    vi.spyOn(parentController, 'createTaskPaneController').mockReturnValue(sideController)
    const held = deferred<boolean>(), onClose = vi.fn(() => held.promise)
    const selected = { focus: vi.fn() }, workspace = { isConnected: true, querySelector: vi.fn(() => selected) }, pane = { isConnected: true, closest: () => workspace }, focused = { isConnected: true }
    const doc = { body: {}, activeElement: focused as unknown, getElementById: () => null }; vi.stubGlobal('document', doc)
    const props: React.ComponentProps<typeof MiraSideConversation> = { parentController, parentId: 'a', childSessionId: 'b', existingTask: true, active: true, keyboardActive: true, requests: [], onConsume: vi.fn(), onFocus: vi.fn(), onOpenFile: vi.fn(), onClose }
    const render = () => { hooks.cursor = 0; return MiraSideConversation(props) }
    const button = (tree: React.ReactElement) => {
      let result: Record<string, unknown> | undefined
      const visit = (node: React.ReactNode) => { if (Array.isArray(node)) { node.forEach(visit); return }; if (!React.isValidElement<Record<string, unknown>>(node)) return; if (node.props['aria-label'] === '关闭侧面任务窗格') result = node.props; visit(node.props.children as React.ReactNode) }
      visit(tree); return result!
    }
    const tree = render(); (tree.props.ref as React.RefObject<unknown>).current = pane
    const click = button(tree).onClick as () => void
    click(); click(); expect(onClose).toHaveBeenCalledTimes(1); expect(button(render()).disabled).toBe(true)
    pane.isConnected = false; focused.isConnected = false; doc.activeElement = doc.body
    held.resolve(true); await held.promise; await Promise.resolve()
    expect(selected.focus).toHaveBeenCalledOnce()
    pane.isConnected = true; focused.isConnected = true; doc.activeElement = focused
    const next = deferred<boolean>(); onClose.mockReturnValue(next.promise)
    ;(button(render()).onClick as () => void)()
    pane.isConnected = false; focused.isConnected = false; doc.activeElement = { isConnected: true }
    next.resolve(true); await next.promise; await Promise.resolve()
    expect(selected.focus).toHaveBeenCalledOnce()
    pane.isConnected = true
    onClose.mockRejectedValueOnce(new Error('保存失败'))
    ;(button(render()).onClick as () => void)(); await Promise.resolve(); await Promise.resolve()
    const failedTree = render()
    let alert: Record<string, unknown> | undefined
    const findAlert = (node: React.ReactNode) => { if (Array.isArray(node)) { node.forEach(findAlert); return }; if (!React.isValidElement<Record<string, unknown>>(node)) return; if (node.props.className === 'mira-side-conversation__close-error') alert = node.props; findAlert(node.props.children as React.ReactNode) }
    findAlert(failedTree)
    expect(alert?.role).toBe('alert')
    expect(button(failedTree).disabled).toBe(false)
    expect(selected.focus).toHaveBeenCalledOnce()
  })

  it('tracks sidebar focus across task panes and locates searched messages/files without navigating the primary', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    const paneEntry = () => view.sidebar().taskPaneEntry as { open: (id: string) => Promise<boolean> }
    await paneEntry().open('b'); await view.drain()
    const side = () => view.props((_, element) => element.type === MiraSideConversation) as unknown as React.ComponentProps<typeof MiraSideConversation>
    const grid = () => view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>
    expect(view.sidebar().activeSessionId).toBe('b')
    expect(view.commandCenter().session?.id).toBe('b')
    expect(controller.getSnapshot().session?.id).toBe('a')
    ;(view.props((_, element) => element.type === MiraBottomTerminal).onFocus as () => void)(); await view.drain()
    expect(view.sidebar().activeSessionId).toBe('a')
    side().onFocus(); await view.drain(); expect(view.sidebar().activeSessionId).toBe('b')
    const revision = side().focusRequest!
    await view.commandCenter().onOpenSession({ id: 'b', messageId: 'b-answer', title: 'b', snippet: '', updatedAt: 1 }); await view.drain()
    expect(side().navigationTarget).toMatchObject({ messageId: 'b-answer' })
    expect(side().focusRequest).toBeGreaterThan(revision)
    await view.commandCenter().onOpenFile('b', 'README.md'); await view.drain()
    expect(side().navigationTarget).toMatchObject({ filePath: 'README.md' })
    expect(side().navigationTarget?.messageId).toBeUndefined()
    const fileRevision = side().focusRequest!
    side().onFocusRequestHandled?.(fileRevision - 1); await view.drain()
    expect(side().navigationTarget?.filePath).toBe('README.md')
    side().onFocusRequestHandled?.(fileRevision); await view.drain()
    expect(side().navigationTarget).toBeUndefined()
    expect(side().focusRequest).toBe(0)
    await (view.sidebar().onOpenExecution as (id: string) => Promise<void>)('b'); await view.drain()
    expect(side().navigationTarget).toMatchObject({ execution: true })
    expect(side().focusRequest).toBeGreaterThan(fileRevision)
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary', 'b'])
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(host.setPreference).not.toHaveBeenCalledWith('active-session', 'b')
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('a'); await view.drain()
    expect(view.sidebar().activeSessionId).toBe('a'); expect(miraTaskPaneIds(grid().layout)).toHaveLength(2)
    expect(view.props(p => p['aria-label'] === '切换面板')['aria-expanded']).toBe(false)
    view.unmount()
  })

  it('discards delayed side search placement after closing that pane', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    await (view.sidebar().taskPaneEntry as { open: (id: string) => Promise<boolean> }).open('b'); await view.drain()
    const loaded = deferred<HarnessSession>(); host.getSession.mockReturnValueOnce(loaded.promise)
    const opening = view.commandCenter().onOpenSession({ id: 'b', messageId: 'b-answer', title: 'b', snippet: '', updatedAt: 1 }); await view.drain()
    const side = view.props((_, element) => element.type === MiraSideConversation) as unknown as React.ComponentProps<typeof MiraSideConversation>
    await side.onClose!(); await view.drain()
    loaded.resolve(task('b')); expect(await opening).toBe(false); await view.drain()
    expect(miraTaskPaneIds((view.props((_, element) => element.type === MiraTaskGrid) as unknown as React.ComponentProps<typeof MiraTaskGrid>).layout)).toEqual(['$primary'])
    expect(controller.getSnapshot().session?.id).toBe('a')
    view.unmount()
  })

  it('lets only the latest side search request place its target', async () => {
    const { controller, host } = fixture(), view = mount(controller); await view.drain()
    await (view.sidebar().taskPaneEntry as { open: (id: string) => Promise<boolean> }).open('b'); await view.drain()
    const loaded = deferred<HarnessSession>(); host.getSession.mockReturnValueOnce(loaded.promise)
    const older = view.commandCenter().onOpenSession({ id: 'b', messageId: 'old', title: 'b', snippet: '', updatedAt: 1 }); await view.drain()
    await view.commandCenter().onOpenSession({ id: 'b', messageId: 'new', title: 'b', snippet: '', updatedAt: 1 }); await view.drain()
    loaded.resolve(task('b')); expect(await older).toBe(false); await view.drain()
    const side = view.props((_, element) => element.type === MiraSideConversation) as unknown as React.ComponentProps<typeof MiraSideConversation>
    expect(side.navigationTarget).toMatchObject({ messageId: 'new' })
    expect(controller.getSnapshot().session?.id).toBe('a')
    view.unmount()
  })

  it('toggles the bottom terminal without adding a side resource, yields main shortcuts, and rejects hidden links', async () => {
    const { controller } = fixture()
    const view = mount(controller); await view.drain()
    const toggle = () => view.props(props => props['aria-label'] === '打开终端')
    const bottom = () => view.props((_, element) => element.type === MiraBottomTerminal) as unknown as React.ComponentProps<typeof MiraBottomTerminal>
    const mainFind = () => view.props((_, element) => element.type === MiraTaskFind)
    const composer = () => view.props((_, element) => element.type === HarnessComposer)
    ;(toggle().onClick as () => void)(); await view.drain()
    expect(bottom().open).toBe(true); expect(toggle()['aria-expanded']).toBe(true)
    expect(view.props(props => props['aria-label'] === '切换面板')['aria-expanded']).toBe(false)
    bottom().onFocus(); await view.drain()
    expect(mainFind().keyboardActive).toBe(false); expect(composer().keyboardActive).toBe(false)
    const staleLink = bottom().onOpenAddress
    ;(toggle().onClick as () => void)(); await view.drain()
    expect(bottom().open).toBe(false); expect(mainFind().keyboardActive).toBe(true)
    staleLink('a', 'https://mira.test/hidden'); await view.drain()
    expect(view.props(props => props['aria-label'] === '切换面板')['aria-expanded']).toBe(false)
    await view.command('terminal'); await view.drain()
    expect(bottom().open).toBe(true)
    bottom().onOpenAddress('a', 'https://mira.test/bottom'); await view.drain()
    const tabs = view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    expect(tabs.tabs).toHaveLength(1); expect(tabs.tabs[0].url).toBe('https://mira.test/bottom')
    expect(tabs.tabs[0].id).toMatch(/^browser:/)
    view.unmount()
  })
  it('ignores a bottom-terminal preparation completed after navigation switched tasks', async () => {
    const { controller } = fixture()
    controller.newConversation()
    const view = mount(controller); await view.drain()
    const prepare = deferred<string | undefined>()
    view.composer.prepareSession = vi.fn(() => prepare.promise)
    ;(view.props(props => props['aria-label'] === '打开终端').onClick as () => void)(); await view.drain()
    await (view.sidebar().onOpenSession as (id: string) => Promise<void>)('b'); await view.drain()
    prepare.resolve('b'); await view.drain()
    expect(view.props((_, element) => element.type === MiraBottomTerminal).open).toBe(false)
    view.unmount()
  })
  it('keeps an idle side conversation writable without offering history edit or regeneration', () => {
    const { controller: parentController } = fixture(), { controller: childController } = fixture()
    Object.assign(childController.getSnapshot(), { session: { ...task('side'), parentSessionId: 'a' }, selection: { providerId: 'provider', modelId: 'model' } })
    vi.spyOn(parentController, 'createSideController').mockReturnValue(childController)
    vi.spyOn(childController, 'start').mockResolvedValue(undefined)
    const tree = MiraSideConversation({ parentController, parentId: 'a', childSessionId: 'side', active: true, keyboardActive: true, requests: [], onConsume: vi.fn(), onFocus: vi.fn(), onOpenFile: vi.fn() })
    let context: { canRerun: boolean } | undefined, composer: Record<string, unknown> | undefined
    const visit = (node: React.ReactNode) => {
      if (Array.isArray(node)) { node.forEach(visit); return }
      if (!React.isValidElement<Record<string, unknown>>(node)) return
      const value = node.props.value as { canRerun?: boolean } | undefined
      if (value && 'canRerun' in value) context = value as { canRerun: boolean }
      if (node.type === HarnessComposer) composer = node.props
      visit(node.props.children as React.ReactNode)
    }
    visit(tree)
    expect(context?.canRerun).toBe(false)
    expect(composer?.active).toBe(true)
    expect(composer?.state).toBe(childController.getSnapshot())
  })

  it('places main permission only in the Composer dock, retaining its exact owner', async () => {
    const { controller } = fixture(), request = { requestId: 'main-permission', sessionId: 'a', title: '允许执行？', detail: 'printf main' }
    controller.getSnapshot().permission = request
    const view = mount(controller); await view.drain()
    const composer = view.pageProps((_, element) => element.type === HarnessComposer)
    const slot = composer.interactionSlot as React.ReactElement<PermissionResponseCardProps>
    expect(slot.type).toBe(PermissionResponseCard)
    expect(slot.props.request).toBe(request)
    expect(slot.props.placement).toBe('dock')
    expect(view.pageProps(props => props['data-confirmation'] === true)).toBeDefined()
    // Permission remains available even if no tool message exists or is mounted.
    expect(controller.getSnapshot().messages).toEqual([])
    view.unmount()
  })

  it('guards immediate side permission replies and scopes retry errors to the same request', async () => {
    const { controller: parentController } = fixture(), { controller: childController } = fixture()
    const request = { requestId: 'side-permission', sessionId: 'side', title: '允许执行？', detail: 'printf side' }
    Object.assign(childController.getSnapshot(), { session: { ...task('side'), parentSessionId: 'a' }, permission: request })
    vi.spyOn(parentController, 'createSideController').mockReturnValue(childController)
    vi.spyOn(childController, 'start').mockResolvedValue(undefined)
    const held = deferred<void>(), respond = vi.spyOn(childController, 'permission').mockReturnValueOnce(held.promise).mockResolvedValue(undefined)
    const render = () => {
      hooks.cursor = 0
      const tree = MiraSideConversation({ parentController, parentId: 'a', childSessionId: 'side', active: true, keyboardActive: true, requests: [], onConsume: vi.fn(), onFocus: vi.fn(), onOpenFile: vi.fn() })
      let slot: React.ReactElement<PermissionResponseCardProps> | undefined
      const visit = (node: React.ReactNode) => {
        if (Array.isArray(node)) return node.forEach(visit)
        if (!React.isValidElement<Record<string, unknown>>(node)) return
        if (node.type === HarnessComposer) slot = node.props.interactionSlot as typeof slot
        visit(node.props.children as React.ReactNode)
      }
      visit(tree); return slot!.props
    }
    const card = render()
    expect(card.placement).toBe('dock')
    const pending = card.onRespond(request.requestId, true)
    await card.onRespond(request.requestId, false)
    expect(respond).toHaveBeenCalledExactlyOnceWith(true, request.requestId)
    expect(render().responding).toBe(true)
    childController.getSnapshot().error = '发送失败'
    held.resolve(); await pending
    expect(render().error).toBe('发送失败')
    childController.getSnapshot().permission = { ...request, requestId: 'side-next' }
    expect(render().error).toBeUndefined()
    await card.onRespond(request.requestId, true)
    expect(respond).toHaveBeenCalledTimes(1)
    childController.getSnapshot().permission = request
    await render().onRespond(request.requestId, false)
    expect(respond).toHaveBeenLastCalledWith(false, request.requestId)
  })

  it('hands task find to the side focus, restores main on workspace close, and explicitly targets main from the command center', async () => {
    const { controller, host } = fixture()
    controller.getSnapshot().messages = [{ id: 'user', role: 'user', content: '查找任务正文', createdAt: 1 }]
    Object.assign(host, { createSideConversation: vi.fn(async () => ({ ...task('side'), parentSessionId: 'a' })) })
    const view = mount(controller); await view.drain()
    const workspace = () => view.props(props => props['aria-label'] === '切换面板')
    ;(workspace().onClick as () => void)(); await view.drain()
    await (view.props((_, element) => element.type === WorkspaceTabs).onOpen as (id: string) => Promise<void>)('side-chat'); await view.drain()
    const side = () => view.props((_, element) => element.type === MiraSideConversation)
    const mainFind = () => view.props((_, element) => element.type === MiraTaskFind)
    ;(side().onFocus as () => void)(); await view.drain()
    expect(side().keyboardActive).toBe(true); expect(mainFind().keyboardActive).toBe(false)
    await view.command('find'); await view.drain()
    expect(mainFind().keyboardActive).toBe(true); expect(side().keyboardActive).toBe(false)
    if (view.props(props => props.id === 'pilot-workspace')['aria-hidden']) { (workspace().onClick as () => void)(); await view.drain() }
    ;(side().onFocus as () => void)(); await view.drain()
    ;(view.props((_, element) => element.type === WorkspaceTabs).onDismiss as () => void)(); await view.drain()
    expect(mainFind().keyboardActive).toBe(true); expect(side().active).toBe(false)
    view.unmount()
  })
  it('yields main find and composer shortcuts to resources, including tab switches, and restores main on close', async () => {
    const { controller } = fixture()
    const view = mount(controller); await view.drain()
    const toggle = () => view.props(props => props['aria-label'] === '切换面板')
    ;(toggle().onClick as () => void)(); await view.drain()
    const resource = () => view.props(props => props.id === 'pilot-workspace')
    const mainFind = () => view.props((_, element) => element.type === MiraTaskFind)
    const composer = () => view.props((_, element) => element.type === HarnessComposer)
    ;(resource().onFocusCapture as () => void)(); await view.drain()
    expect(mainFind().keyboardActive).toBe(false); expect(composer().keyboardActive).toBe(false)
    await (view.props((_, element) => element.type === WorkspaceTabs).onOpen as (id: string) => Promise<void>)('browser'); await view.drain()
    expect(mainFind().keyboardActive).toBe(false); expect(composer().keyboardActive).toBe(false)
    ;(view.props(props => String(props.className).startsWith('mira-conversation-layout')).onPointerDownCapture as () => void)(); await view.drain()
    expect(mainFind().keyboardActive).toBe(true); expect(composer().keyboardActive).toBe(true)
    ;(resource().onPointerDownCapture as () => void)(); await view.drain()
    expect(composer().keyboardActive).toBe(false)
    ;(view.props((_, element) => element.type === WorkspaceTabs).onDismiss as () => void)(); await view.drain()
    expect(mainFind().keyboardActive).toBe(true); expect(composer().keyboardActive).toBe(true)
    view.unmount()
  })
  it('opens independent browser resources for terminal links and rejects stale owners, tabs and closed views', async () => {
    const { controller } = fixture(), view = mount(controller); await view.drain()
    ;(view.props(props => props['aria-label'] === '切换面板').onClick as () => void)(); await view.drain()
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    const terminal = () => view.props((_, element) => element.type === TerminalPanel) as unknown as React.ComponentProps<typeof TerminalPanel>
    const browser = () => view.props((props, element) => element.type === MiraBrowserPanel && props.active === true) as unknown as React.ComponentProps<typeof MiraBrowserPanel>
    await tabs().onOpen('terminal'); await view.drain()
    const terminalId = tabs().active, oldCallback = terminal().onOpenAddress!
    oldCallback('https://mira.test/first'); await view.drain()
    const firstBrowserId = tabs().active
    expect(firstBrowserId.startsWith('browser:')).toBe(true); expect(browser().request).toEqual({ sessionId: 'a', browserId: firstBrowserId, url: 'https://mira.test/first' })
    const firstRequest = browser().request!
    browser().onRequestHandled(firstRequest); await view.drain()
    oldCallback('https://mira.test/stale'); await view.drain(); expect(browser().request).toBeUndefined()
    tabs().onActivate(terminalId); await view.drain(); terminal().onOpenAddress!('https://mira.test/second'); await view.drain()
    expect(tabs().tabs.filter(tab => tab.id.startsWith('browser:'))).toHaveLength(2); expect(tabs().active).not.toBe(firstBrowserId)
    browser().onRequestHandled(firstRequest); await view.drain(); expect(browser().request?.url).toBe('https://mira.test/second')
    browser().onRequestHandled(browser().request!); await view.drain()
    tabs().onActivate(terminalId); await view.drain()
    tabs().onDismiss(); await view.drain()
    oldCallback('https://mira.test/closed'); await view.drain(); expect(tabs().active).toBe(terminalId)
    await view.sidebar().onOpenSession('b'); await view.drain()
    oldCallback('https://mira.test/wrong-task'); await view.drain(); expect(tabs().tabs).toEqual([])
    view.unmount()
  })
  it('keeps browser metadata with its task and reopens a closed resource with a new identity', async () => {
    const { controller } = fixture(), view = mount(controller); await view.drain()
    ;(view.props(props => props['aria-label'] === '切换面板').onClick as () => void)(); await view.drain()
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    const browser = (id: string) => view.props((props, element) => element.type === MiraBrowserPanel && props.browserId === id) as unknown as React.ComponentProps<typeof MiraBrowserPanel>
    await tabs().onOpen('browser'); await view.drain(); const firstId = tabs().active
    const background = browser(firstId)
    background.onUrlChange('https://mira.test/first'); background.onPageTitle!('First page'); await view.drain()
    await tabs().onOpen('browser'); await view.drain(); const secondId = tabs().active
    expect(secondId).not.toBe(firstId); expect(browser(firstId).active).toBe(false); expect(browser(secondId).active).toBe(true)
    await view.sidebar().onOpenSession('b'); await view.drain()
    background.onUrlChange('https://mira.test/redirect'); background.onPageTitle!('Redirected page'); await view.drain()
    expect(tabs().tabs).toEqual([])
    await view.sidebar().onOpenSession('a'); await view.drain()
    expect(tabs().tabs.find(tab => tab.id === firstId)).toMatchObject({ url: 'https://mira.test/redirect', label: 'Redirected page' })
    tabs().onClose(firstId); await view.drain(); expect(() => browser(firstId)).toThrow('Missing workbench element')
    background.onPageTitle!('Detached title'); await view.drain()
    tabs().onReopen(firstId); await view.drain(); const reopenedId = tabs().active
    expect(reopenedId).not.toBe(firstId); expect(tabs().tabs.find(tab => tab.id === reopenedId)).toMatchObject({ url: 'https://mira.test/redirect', label: 'Redirected page' })
    expect(browser(reopenedId).initialUrl).toBe('https://mira.test/redirect')
    tabs().onCloseOthers(reopenedId); await view.drain(); expect(() => browser(secondId)).toThrow('Missing workbench element')
    expect(browser(reopenedId).active).toBe(true)
    tabs().onCloseAll(); await view.drain(); expect(tabs().tabs).toEqual([]); expect(() => browser(reopenedId)).toThrow('Missing workbench element')
    view.unmount()
  })
  it('owns each terminal in the resource strip, restarts only its view, and closes/reopens its exact identity', async () => {
    const { controller } = fixture(), view = mount(controller); await view.drain()
    ;(view.props(props => props['aria-label'] === '切换面板').onClick as () => void)(); await view.drain()
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    await tabs().onOpen('terminal'); await view.drain()
    await tabs().onOpen('terminal'); await view.drain()
    const [first, second] = tabs().tabs
    expect(first.id).not.toBe(second.id); expect(first.label).toBe('project'); expect(second.label).toBe('project 2')
    const panel = (id: string) => view.props(props => props['data-terminal-tab-id'] === id)
    const child = (id: string) => panel(id).children as React.ReactElement<React.ComponentProps<typeof TerminalPanel>>
    expect(child(first.id).type).toBe(TerminalPanel); expect(child(first.id).props.active).toBe(false); expect(child(second.id).props.active).toBe(true)
    const firstKey = child(first.id).key, secondKey = child(second.id).key
    tabs().onRestartTerminal!(first.id); await view.drain()
    expect(tabs().active).toBe(first.id); expect(child(first.id).props.active).toBe(true); expect(child(second.id).props.active).toBe(false)
    expect(child(first.id).key).not.toBe(firstKey); expect(child(second.id).key).toBe(secondKey)
    tabs().onClose(first.id); await view.drain()
    expect(tabs().tabs.map(tab => tab.id)).toEqual([second.id]); expect(tabs().active).toBe(second.id)
    expect(() => panel(first.id)).toThrow('Missing workbench element'); expect(child(second.id).props.active).toBe(true)
    tabs().onReopen(first.id); await view.drain()
    expect(tabs().tabs.map(tab => tab.id)).toEqual([second.id, first.id]); expect(tabs().active).toBe(first.id)
    tabs().onCloseAll(); await view.drain()
    expect(tabs().tabs).toEqual([]); expect(() => panel(first.id)).toThrow('Missing workbench element'); expect(() => panel(second.id)).toThrow('Missing workbench element')
    view.unmount()
  })
  it('keeps a late side creation under its original parent without stealing newer navigation', async () => {
    const { controller, host } = fixture()
    const creation = deferred<HarnessSession>()
    const createSideConversation = vi.fn(() => creation.promise)
    Object.assign(host, { createSideConversation })
    const view = mount(controller); await view.drain()
    ;(view.props(props => props['aria-label'] === '切换面板').onClick as () => void)(); await view.drain()
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs)
    const opening = (tabs().onOpen as (id: string) => Promise<void>)('side-chat')
    await view.drain(); view.newTask(); await view.drain()
    creation.resolve({ ...task('side'), parentSessionId: 'a' })
    await opening; await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(createSideConversation).toHaveBeenCalledExactlyOnceWith('a')
    expect(host.getSession).not.toHaveBeenCalled()
    const saved = host.setPreference.mock.calls.filter(call => call[0] === 'harness-react-workspace').at(-1)?.[1] as Record<string, { tabs: Array<{ childSessionId?: string }> }>
    expect(saved.a.tabs).toEqual([expect.objectContaining({ childSessionId: 'side' })])
    view.unmount()
  })
  it('admits each side first input independently from a bare side creation', async () => {
    const { controller, host } = fixture()
    const bare = deferred<HarnessSession>(), first = deferred<HarnessSession>(), second = deferred<HarnessSession>()
    const createSideConversation = vi.fn((_parent: string, input?: { submissionId: string }) => input?.submissionId === 'first' ? first.promise : input ? second.promise : bare.promise)
    Object.assign(host, { createSideConversation })
    const view = mount(controller); await view.drain()
    const open = view.pageProps((_, element) => element.type === HarnessComposer).onOpenSideConversation as (input?: { submissionId: string; text: string; selection: { providerId: string; modelId: string } }) => Promise<boolean>
    const input = { submissionId: 'first', text: '检查问题', selection: { providerId: 'provider', modelId: 'model' } }
    const empty = open(), one = open(input), two = open({ ...input, submissionId: 'second', text: '另一个问题' })
    await view.drain()
    expect(createSideConversation).toHaveBeenCalledTimes(3)
    expect(createSideConversation).toHaveBeenNthCalledWith(2, 'a', input)
    bare.resolve({ ...task('bare'), parentSessionId: 'a' }); first.resolve({ ...task('first'), parentSessionId: 'a' }); second.resolve({ ...task('second'), parentSessionId: 'a' })
    await expect(one).resolves.toBe(true); await expect(two).resolves.toBe(true); await empty; await view.drain()
    const saved = host.setPreference.mock.calls.filter(call => call[0] === 'harness-react-workspace').at(-1)?.[1] as Record<string, { tabs: Array<{ childSessionId?: string }> }>
    expect(saved.a.tabs.map(tab => tab.childSessionId)).toEqual(['bare', 'first', 'second'])
    view.unmount()
  })
  it('propagates side first-input failure to preserve the Composer draft and allow a retry', async () => {
    const { controller, host } = fixture()
    const createSideConversation = vi.fn().mockRejectedValueOnce(new Error('提交失败')).mockResolvedValueOnce({ ...task('side'), parentSessionId: 'a' })
    Object.assign(host, { createSideConversation })
    const view = mount(controller); await view.drain()
    const input = { submissionId: 'retry', text: '保持原问题', selection: { providerId: 'provider', modelId: 'model' } }
    const open = view.pageProps((_, element) => element.type === HarnessComposer).onOpenSideConversation as (request: typeof input) => Promise<boolean>
    await expect(open(input)).rejects.toThrow('提交失败'); await view.drain()
    await expect(open(input)).resolves.toBe(true); await view.drain()
    expect(createSideConversation.mock.calls).toEqual([['a', input], ['a', input]])
    view.unmount()
  })
  it('attaches an accepted side first input to its original owner after navigation', async () => {
    const { controller, host } = fixture()
    const creation = deferred<HarnessSession>()
    Object.assign(host, { createSideConversation: vi.fn(() => creation.promise) })
    const view = mount(controller); await view.drain()
    const input = { submissionId: 'late', text: '原任务问题', selection: { providerId: 'provider', modelId: 'model' } }
    const open = view.pageProps((_, element) => element.type === HarnessComposer).onOpenSideConversation as (request: typeof input) => Promise<boolean>
    const opening = open(input); await view.drain(); view.newTask(); await view.drain()
    creation.resolve({ ...task('side'), parentSessionId: 'a' })
    await expect(opening).resolves.toBe(true); await view.drain()
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(host.getSession).not.toHaveBeenCalled()
    const saved = host.setPreference.mock.calls.filter(call => call[0] === 'harness-react-workspace').at(-1)?.[1] as Record<string, { tabs: Array<{ childSessionId?: string }> }>
    expect(saved.a.tabs).toEqual([expect.objectContaining({ childSessionId: 'side' })])
    view.unmount()
  })
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
  it('keeps canonical message identities when the visible rail or bottom indicator changes', () => {
    const { controller } = fixture(), view = mount(controller)
    const options = () => view.props(p => typeof p.onActiveTurnChange === 'function').messages
    const previous = options()
    ;(view.props(p => typeof p.onActiveTurnChange === 'function').onActiveTurnChange as (id: string) => void)('a-user')
    view.render()
    expect(options()).toBe(previous)
    ;(view.props(p => typeof p.onBottomChange === 'function').onBottomChange as (bottom: boolean) => void)(false)
    view.render()
    expect(options()).toBe(previous)
  })

  it('passes planning and current message state to the real composer without a second runtime', () => {
    const { controller } = fixture(), view = mount(controller)
    const composer = () => view.props((_, element) => element.type === HarnessComposer)
    const messages = () => view.props(p => typeof p.onActiveTurnChange === 'function').messages as Array<{ original: HarnessMessage }>
    const previous = messages()
    ;(view.props(p => typeof p.setPlanning === 'function').setPlanning as (enabled: boolean) => void)(true)
    view.render()
    expect(composer().planning).toBe(true)
    expect(messages()).toBe(previous)
    Object.assign(controller.getSnapshot(), { messages: [{ id: 'a-user', role: 'user', content: 'New real message', createdAt: 1 }] })
    view.render()
    expect(messages()).not.toBe(previous)
    expect(messages()).toHaveLength(1)
    expect(messages()[0].original).toBe(controller.getSnapshot().messages[0])
    Object.assign(controller.getSnapshot(), { selection: { providerId: 'p', modelId: 'm' } })
    view.render()
    expect(composer().state).toBe(controller.getSnapshot())
    expect((composer().state as ReturnType<PilotController['getSnapshot']>).selection).toEqual({ providerId: 'p', modelId: 'm' })
  })

  it('keeps current queue and loading ownership on the composer while a task runs', async () => {
    const { controller, host } = fixture()
    Object.assign(controller.getSnapshot(), { selection: { providerId: 'provider', modelId: 'model' }, running: true })
    const view = mount(controller); await view.drain()
    const composer = () => view.props((_, element) => element.type === HarnessComposer)
    expect(composer().controller).toBe(controller)
    expect(controller.supportsMessageQueue).toBe(false)
    Object.assign(host, { submitMessage: vi.fn(), getMessageQueue: vi.fn(), withdrawMessage: vi.fn(), resumeMessageQueue: vi.fn() })
    view.render()
    expect(controller.supportsMessageQueue).toBe(true)
    Object.assign(controller.getSnapshot(), { sessionLoading: true }); view.render()
    expect((composer().state as ReturnType<PilotController['getSnapshot']>).sessionLoading).toBe(true)
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
    expect(view.props(p => p['aria-label'] === '切换面板')['aria-expanded']).toBe(false)
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
    expect(view.props(p => p['aria-label'] === '切换面板')['aria-expanded']).toBe(false)
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
  it('binds the Header rename menu to its original task and removes the editor on task switch', async () => {
    const view = headerFixture(); await view.drain()
    const rename = view.header().onRename as () => void
    rename(); await view.drain()
    const editor = view.props((_, element) => element.type === MiraTaskTitleEditor)
    expect(editor).toMatchObject({ sessionId: 'a', title: 'a', controller: view.controller })
    await view.controller.open('b'); await view.drain()
    expect(() => view.props((_, element) => element.type === MiraTaskTitleEditor)).toThrow('Missing workbench element')
    // A queued callback from the old Header menu cannot start renaming B.
    rename(); (editor.onClose as () => void)(); await view.drain()
    expect(view.controller.getSnapshot().session?.id).toBe('b')
    expect(() => view.props((_, element) => element.type === MiraTaskTitleEditor)).toThrow('Missing workbench element')
  })
  it('preserves the same store while the sidebar is closed and reopens with Header changes and collapse preferences', async () => {
    const view = headerFixture(); await view.drain()
    const store = view.sidebar().preferenceStore as SidebarPreferenceStore
    const commandKey = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl '
    expect(view.props(p => p['aria-label'] === '会话')['aria-keyshortcuts']).toBe(commandKey === '⌘' ? 'Meta+B' : typeof navigator === 'undefined' || !navigator.platform ? 'Meta+B Control+B' : 'Control+B')
    expect(view.props(p => p.title === `收起会话侧栏 (${commandKey}B)`)).toBeDefined()
    ;(view.props(p => p['aria-label'] === '会话').onClick as () => void)(); await view.drain()
    expect(view.props(p => p.className === 'mira-sidebar-panel')).toMatchObject({ 'aria-hidden': true, inert: true })
    expect(view.props(p => p.title === `展开会话侧栏 (${commandKey}B)`)).toBeDefined()
    expect(view.sidebar().preferenceStore).toBe(store)
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
    expect(startDraft).toHaveBeenCalledExactlyOnceWith('research', undefined, expect.any(Function), undefined)
    expect(view.sidebar().draft).toMatchObject({ draftId: 'anonymous', groupId: 'research', selected: true })
    expect(view.controller.getSnapshot().session).toBeUndefined()
    expect(view.host.createSession).not.toHaveBeenCalled(); expect(view.host.prepareSession).not.toHaveBeenCalled()
    expect(view.store().getSnapshot().preferences.groups.map(group => group.sessionIds)).toEqual([['b'], []])
    expect(view.navigation().snapshot).toMatchObject({ detached: true, draft: 'conversation' })
    view.newTask(); await view.drain()
    expect(startDraft).toHaveBeenLastCalledWith(undefined, undefined, expect.any(Function), undefined)
    expect(view.composerProps()).toMatchObject({ draftProjectId: 'project-a', planning: true })
    expect(view.sidebar().draft).toMatchObject({ draftId: 'anonymous', groupId: undefined })
  })

  it('routes personal new-task entry to an explicit outside-project selection after saving', async () => {
    const view = groupFixture(); await view.drain()
    const startDraft = vi.fn<HarnessComposerHandle['startDraft']>(async () => true)
    view.composer.startDraft = startDraft
    const saved = deferred<void>(); view.controller.registerBeforeNavigation(() => saved.promise)
    ;(view.sidebar().onNewPersonalConversation as () => void)(); await view.drain()
    expect(startDraft).not.toHaveBeenCalled()
    saved.resolve(); await view.drain()
    expect(startDraft).toHaveBeenCalledExactlyOnceWith(undefined, null, expect.any(Function), undefined)
    view.unmount()
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
  let active = true, tree: React.ReactNode, interactionSlot: React.ReactNode
  const handle = { current: null as HarnessComposerHandle | null }
  let range = { start: 0, end: 0 }
  const element = { style: {} as Record<string, string>, scrollHeight: 40, focus: vi.fn(), closest: () => null, contains: () => false }
  const editor: MiraPromptEditorHandle = { getElement: () => element as unknown as HTMLDivElement, focus: element.focus, getSelectionRange: () => range, setSelectionRange: (start, end) => { range = { start, end } }, replaceRange: () => undefined }
  const visit = (node: React.ReactNode): Record<string, unknown> | undefined => { if (Array.isArray(node)) return node.map(visit).find(Boolean); if (!React.isValidElement<Record<string, unknown>>(node)) return; return node.type === MiraPromptEditor ? node.props : visit(node.props.children as React.ReactNode) }
  const render = () => {
    hooks.cursor = 0; hooks.dirty = false
    tree = (HarnessComposer as unknown as { render(props: unknown, ref: unknown): React.ReactElement }).render({ state: controller.getSnapshot(), controller, active, interactionSlot, planning: false, setPlanning: vi.fn() }, handle)
    const input = visit(tree)!; (input.ref as React.RefObject<unknown>).current = editor
    hooks.effects.splice(0).forEach(callback => callback())
  }
  const drain = async () => { for (let i = 0; i < 30; i++) { await Promise.resolve(); render() } }
  render()
  return { handle, drain, text: () => visit(tree)!.text, inputDisabled: () => visit(tree)!.disabled, block: async (blocked: boolean) => { interactionSlot = blocked ? <section aria-label="澄清问题">确认</section> : undefined; render(); await drain() }, type: async (value: string) => { range = { start: value.length, end: value.length }; (visit(tree)!.onChange as MiraPromptEditorProps['onChange'])(createMiraPromptDocument(value), range); await drain() }, hide: async () => { active = false; render(); await drain() } }
}

describe('Composer yields to the owner interaction without losing its draft', () => {
  it('retains the mounted input and draft through a blocking question and restores editing afterwards', async () => {
    const { controller } = fixture(), view = mountComposer(controller)
    await view.drain(); await view.type('保留正文和原输入身份')
    const handle = view.handle.current
    await view.block(true)
    expect(view.inputDisabled()).toBe(true); expect(view.text()).toBe('保留正文和原输入身份')
    await view.type('隐藏输入不应覆盖正文')
    expect(view.text()).toBe('保留正文和原输入身份')
    await view.block(false)
    expect(view.inputDisabled()).toBe(false); expect(view.text()).toBe('保留正文和原输入身份')
    expect(Boolean(handle && view.handle.current)).toBe(true)
  })
})

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

describe('Workbench run and child panels keep their captured owners', () => {
  const child = (id: string): HarnessSubtask => ({ id, parentToolCallId: `public-${id}`, role: 'reviewer', task: `检查 ${id}`, status: 'running', createdAt: 2, activities: [] })
  const activeRun = (id: string, subtasks = [child('shared-child')]): HarnessActiveRun => ({ id, startedAt: 1, activities: [{ id: 'activity', label: '检查中', status: 'running', startedAt: 1 }], subtasks })
  const completedRun = (active: HarnessActiveRun): HarnessRunSummary => ({ startedAt: active.startedAt, completedAt: 10, durationMs: 9, status: 'completed', activities: active.activities.map(activity => ({ ...activity, status: 'completed' })), subtasks: active.subtasks.map(subtask => ({ ...subtask, status: 'completed' })) })
  function runFixture() {
    const api = fixture(), selected = { ...task('a', 'project-a'), activeRun: activeRun('run-a', [child('shared-child'), child('other-child')]) }
    const stop = vi.fn(async (_sessionId: string, _subtaskId?: string) => undefined)
    Object.assign(api.host, { stopSubtasks: stop })
    Object.assign(api.controller.getSnapshot(), { session: selected, messages: selected.messages, running: true, runningSessionIds: ['a'] })
    const view = mount(api.controller)
    const summary = () => view.props((_, element) => element.type === TaskSummary) as unknown as React.ComponentProps<typeof TaskSummary>
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    const overview = () => view.props((_, element) => element.type === OverviewPanel) as unknown as React.ComponentProps<typeof OverviewPanel>
    const panel = (subtaskId = 'shared-child') => view.props((props, element) => element.type === MiraSubtaskPanel && props.subtaskId === subtaskId) as unknown as React.ComponentProps<typeof MiraSubtaskPanel>
    const nextRun = () => {
      const session = api.controller.getSnapshot().session!
      const previous = session.activeRun!
      const messages = [...session.messages, { id: `reply-${previous.id}`, role: 'assistant' as const, content: '已完成', runId: previous.id, run: completedRun(previous), createdAt: 1 }]
      Object.assign(api.controller.getSnapshot(), { session: { ...session, messages, activeRun: activeRun('run-next') }, messages, running: true })
      view.render()
    }
    const openOtherSession = async () => {
      api.host.getSession.mockResolvedValueOnce({ ...task('b', 'project-b'), activeRun: activeRun('run-b') })
      await api.controller.open('b'); await view.drain()
    }
    return { ...api, view, summary, tabs, overview, panel, stop, nextRun, openOtherSession }
  }

  it('opens a real overview tab from TaskSummary with the exact current run metadata', async () => {
    const api = runFixture(); await api.view.drain()
    api.summary().onOpenProgress!(); await api.view.drain()
    expect(api.tabs()).toMatchObject({ active: 'overview', tabs: [{ id: 'overview', runId: 'run-a' }] })
    expect(api.overview()).toMatchObject({ sessionId: 'a', runId: 'run-a', active: true, session: api.controller.getSnapshot().session })
    expect(api.view.props(props => props.id === 'pilot-workspace')['aria-hidden']).toBe(false)
    expect(api.host.prepareSession).not.toHaveBeenCalled(); expect(api.host.createSession).not.toHaveBeenCalled()
  })

  it('opens the exact command from summary, retains history on a new run and rejects a stale task callback', async () => {
    const api = runFixture()
    api.controller.getSnapshot().session!.toolCalls = [{ id: 'bash-one', runId: 'run-a', tool: 'bash', status: 'running', createdAt: 1, input: { text: JSON.stringify({ command: 'npm run build' }), truncated: false }, output: { text: 'real snapshot', truncated: false } }]
    await api.view.drain()
    const opening = api.summary().onOpenCommand!
    expect(api.summary().commands?.map(tool => tool.id)).toEqual(['bash-one'])
    opening('run-a', 'bash-one'); await api.view.drain()
    const original = api.tabs().tabs[0]
    expect(original).toMatchObject({ runId: 'run-a', commandToolId: 'bash-one', label: 'npm run build' })
    const pane = () => api.view.props((_, element) => element.type === MiraCommandPane) as unknown as React.ComponentProps<typeof MiraCommandPane>
    expect(pane()).toMatchObject({ sessionId: 'a', runId: 'run-a', toolId: 'bash-one', active: true })
    api.nextRun(); await api.view.drain()
    expect(api.summary().commands).toEqual([])
    expect(pane()).toMatchObject({ runId: 'run-a', toolId: 'bash-one' })
    api.tabs().onClose(original.id); await api.view.drain()
    api.tabs().onReopen(original.id); await api.view.drain()
    expect(pane()).toMatchObject({ runId: 'run-a', toolId: 'bash-one' })
    await api.openOtherSession(); opening('run-a', 'bash-one'); await api.view.drain()
    expect(api.tabs().tabs).toEqual([])
    expect(api.host.prepareSession).not.toHaveBeenCalled()
  })

  it('routes overview commands to output and never substitutes a different run or ambiguous execution', async () => {
    const api = runFixture()
    const tool = { id: 'bash-one', runId: 'run-a', tool: 'bash', status: 'ok' as const, createdAt: 1, target: 'printf result' }
    api.controller.getSnapshot().session!.toolCalls = [tool]
    await api.view.drain(); api.summary().onOpenProgress!(); await api.view.drain()
    api.overview().onOpenCommand!('run-a', 'bash-one'); await api.view.drain()
    expect(api.tabs().tabs).toHaveLength(2)
    const before = api.tabs().active
    api.summary().onOpenCommand!('other-run', 'bash-one'); await api.view.drain()
    expect(api.tabs().active).toBe(before)
    api.controller.getSnapshot().session!.toolCalls = [tool, { ...tool }]
    api.tabs().onActivate('overview'); await api.view.drain()
    api.overview().onOpenCommand!('run-a', 'bash-one'); await api.view.drain()
    expect(api.tabs().active).toBe('overview')
  })

  it('opens the captured Header run, including a historical run after a newer run starts', async () => {
    const api = runFixture(); await api.view.drain()
    const menu = () => api.view.props((_, element) => element.type === 'session-menu')
    const opening = menu().onOpenExecution as () => Promise<void>
    api.nextRun(); await api.view.drain()
    await opening(); await api.view.drain()
    expect(api.overview()).toMatchObject({ sessionId: 'a', runId: 'run-a', active: true })
    await (menu().onOpenExecution as () => Promise<void>)(); await api.view.drain()
    expect(api.overview()).toMatchObject({ sessionId: 'a', runId: 'run-next', active: true })
    await api.openOtherSession(); await opening(); await api.view.drain()
    expect(api.tabs().tabs).toEqual([])
  })

  it('opens another sidebar task and its exact latest stored run without preparing a session', async () => {
    const api = runFixture(); await api.view.drain()
    const previous = activeRun('historical-b')
    const stored = { ...task('b', 'project-b'), messages: [{ id: 'b-reply', role: 'assistant' as const, content: '已完成', runId: previous.id, run: completedRun(previous), createdAt: 1 }] }
    api.host.getSession.mockResolvedValueOnce(stored)
    await (api.view.sidebar().onOpenExecution as (id: string) => Promise<unknown>)('b'); await api.view.drain()
    expect(api.overview()).toMatchObject({ sessionId: 'b', runId: 'historical-b', active: true, session: stored })
    expect(api.host.prepareSession).not.toHaveBeenCalled(); expect(api.host.createSession).not.toHaveBeenCalled()
  })

  it('keeps newer navigation in control when a sidebar execution opening returns late', async () => {
    const api = runFixture(); await api.view.drain()
    const pending = deferred<HarnessSession>(); api.host.getSession.mockReturnValueOnce(pending.promise)
    const opening = (api.view.sidebar().onOpenExecution as (id: string) => Promise<unknown>)('b'); await api.view.drain()
    api.view.view('extensions'); await api.view.drain()
    pending.resolve({ ...task('b', 'project-b'), activeRun: activeRun('late-b') })
    await opening; await api.view.drain()
    expect(api.controller.getSnapshot().session?.id).toBe('a')
    expect(api.view.sidebar().extensionsActive).toBe(true)
  })

  it('opens an honest empty activity panel for a sidebar task without runtime records', async () => {
    const api = runFixture(); await api.view.drain()
    api.host.getSession.mockResolvedValueOnce(task('b', 'project-b'))
    await (api.view.sidebar().onOpenExecution as (id: string) => Promise<unknown>)('b'); await api.view.drain()
    expect(api.overview()).toMatchObject({ sessionId: 'b', runId: undefined, active: true })
    expect(api.tabs().tabs).toMatchObject([{ id: 'overview', runId: undefined }])
  })

  it('opens independent dynamic child tabs and binds panel actions to each child owner', async () => {
    const api = runFixture(); await api.view.drain()
    api.summary().onOpenSubtask!('shared-child'); await api.view.drain()
    const first = api.tabs().tabs[0]
    expect(first).toMatchObject({ runId: 'run-a', subtaskId: 'shared-child', label: '检查 shared-child' })
    expect(first.id).toMatch(/^subtask:/)
    expect(api.panel()).toMatchObject({ sessionId: 'a', runId: 'run-a', subtaskId: 'shared-child', active: true })
    api.summary().onOpenSubtask!('other-child'); await api.view.drain()
    const second = api.tabs().tabs[1]
    expect(second.id).not.toBe(first.id)
    expect(second).toMatchObject({ runId: 'run-a', subtaskId: 'other-child' })
    expect(api.tabs().active).toBe(second.id)
    expect(api.panel().active).toBe(false)
    expect(api.panel('other-child').active).toBe(true)
    await api.panel('other-child').onStopSubtask('other-child')
    expect(api.stop).toHaveBeenCalledExactlyOnceWith('a', 'other-child')
  })

  it('retains the historical overview owner when a newer run begins until an explicit opening replaces it', async () => {
    const api = runFixture(); await api.view.drain()
    api.summary().onOpenProgress!(); await api.view.drain()
    api.nextRun(); await api.view.drain()
    expect(api.tabs().tabs).toEqual([{ id: 'overview', label: '调用轨迹', runId: 'run-a', openedAt: expect.any(Number) }])
    const openedAt = api.tabs().tabs[0].openedAt
    expect(api.overview()).toMatchObject({ runId: 'run-a', session: { activeRun: { id: 'run-next' } } })
    api.summary().onOpenProgress!(); await api.view.drain()
    expect(api.tabs().tabs).toEqual([{ id: 'overview', label: '调用轨迹', runId: 'run-next', openedAt }])
    expect(api.overview().runId).toBe('run-next')
  })

  it('preserves child metadata through closing and reopening after the parent run changes', async () => {
    const api = runFixture(); await api.view.drain()
    api.summary().onOpenSubtask!('shared-child'); await api.view.drain()
    const original = api.tabs().tabs[0]
    api.tabs().onClose(original.id); await api.view.drain()
    expect(api.tabs().tabs).toEqual([])
    expect(api.tabs().recentClosedTabs).toEqual([{ ...original, closedAt: expect.any(Number) }])
    api.nextRun(); await api.view.drain()
    api.tabs().onReopen(original.id); await api.view.drain()
    expect(api.tabs()).toMatchObject({ active: original.id, tabs: [{ ...original, openedAt: expect.any(Number) }], recentClosedTabs: [] })
    expect(api.tabs().tabs[0].openedAt).toBeGreaterThanOrEqual(original.openedAt!)
    expect(api.panel()).toMatchObject({ sessionId: 'a', runId: 'run-a', subtaskId: 'shared-child', active: true })
    await api.panel().onStopSubtask('shared-child')
    expect(api.stop).not.toHaveBeenCalled()
  })

  it('does not let retained session-A summary or panel callbacks open or stop session-B children', async () => {
    const api = runFixture(); await api.view.drain()
    const oldSummary = api.summary()
    oldSummary.onOpenSubtask!('shared-child'); await api.view.drain()
    const oldPanel = api.panel()
    await api.openOtherSession()
    expect(api.controller.getSnapshot().session?.id).toBe('b')
    oldSummary.onOpenProgress!(); oldSummary.onOpenSubtask!('shared-child')
    await oldSummary.onStopSubtask('shared-child'); await oldPanel.onStopSubtask('shared-child'); await api.view.drain()
    expect(api.tabs().tabs).toEqual([])
    expect(api.stop).not.toHaveBeenCalled()
    api.summary().onOpenSubtask!('shared-child'); await api.view.drain()
    expect(api.tabs().tabs[0]).toMatchObject({ runId: 'run-b', subtaskId: 'shared-child' })
    expect(api.panel()).toMatchObject({ sessionId: 'b', runId: 'run-b' })
  })

  it('keeps old openings historical and never stops a newer run that reuses the same child ID', async () => {
    const api = runFixture(); await api.view.drain()
    const oldSummary = api.summary()
    oldSummary.onOpenSubtask!('shared-child'); await api.view.drain()
    const oldPanel = api.panel()
    api.nextRun(); await api.view.drain()
    oldSummary.onOpenProgress!(); oldSummary.onOpenSubtask!('shared-child'); await api.view.drain()
    expect(api.tabs().tabs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'overview', runId: 'run-a' }),
      expect.objectContaining({ runId: 'run-a', subtaskId: 'shared-child' }),
    ]))
    await oldSummary.onStopSubtask('shared-child'); await oldPanel.onStopSubtask('shared-child')
    expect(api.stop).not.toHaveBeenCalled()
    api.summary().onOpenSubtask!('shared-child'); await api.view.drain()
    expect(api.tabs().tabs.filter(tab => tab.subtaskId === 'shared-child').map(tab => tab.runId)).toEqual(['run-a', 'run-next'])
    await api.summary().onStopSubtask('shared-child')
    expect(api.stop).toHaveBeenCalledExactlyOnceWith('a', 'shared-child')
  })

  it.each(['session', 'run', 'main-view'] as const)('does not publish a late stop failure after the %s owner changes', async owner => {
    const api = runFixture(); await api.view.drain()
    const pending = deferred<void>(), original = api.summary(), onError = vi.fn(original.onError)
    api.stop.mockReturnValueOnce(pending.promise)
    const stopping = original.onStopSubtask('shared-child').catch(onError)
    expect(api.stop).toHaveBeenCalledExactlyOnceWith('a', 'shared-child')
    if (owner === 'session') await api.openOtherSession()
    else if (owner === 'run') { api.nextRun(); await api.view.drain() }
    else { api.view.view('extensions'); await api.view.drain() }
    pending.reject(new Error('旧停止请求失败'))
    await stopping; await api.view.drain()
    expect(onError).not.toHaveBeenCalled()
    expect(api.controller.getSnapshot().error).toBeUndefined()
  })

  it('still reports a stop failure while its original run remains current', async () => {
    const api = runFixture(); await api.view.drain()
    const original = api.summary(), failure = new Error('停止失败'), onError = vi.fn(original.onError)
    api.stop.mockRejectedValueOnce(failure)
    await original.onStopSubtask('shared-child').catch(onError); await api.view.drain()
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure)
    expect(api.controller.getSnapshot().error).toBe('停止失败')
  })

  it('does not prepare or create a session when a draft opens overview from the workspace launcher', async () => {
    const api = fixture(); api.controller.newConversation()
    const view = mount(api.controller); await view.drain()
    ;(view.props(props => props['aria-label'] === '切换面板').onClick as () => void)(); await view.drain()
    const tabs = () => view.props((_, element) => element.type === WorkspaceTabs) as unknown as React.ComponentProps<typeof WorkspaceTabs>
    tabs().onOpen('overview'); await view.drain()
    expect(tabs().tabs).toEqual([])
    expect(api.controller.getSnapshot().session).toBeUndefined()
    expect(view.composer.prepareSession).not.toHaveBeenCalled()
    expect(api.host.prepareSession).not.toHaveBeenCalled(); expect(api.host.createSession).not.toHaveBeenCalled()
  })
})
