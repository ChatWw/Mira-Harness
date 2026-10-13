import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessSession } from '../src/config/harness'
import { HarnessWorkbench } from '../apps/harness-react/src/components/workbench/HarnessWorkbench'
import { miraTaskPaneIds } from '../apps/harness-react/src/state/mira-task-layout'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import { createWorkspaceFileTab, createWorkspaceSession, openWorkspaceTab, readWorkspaceSessions } from '../apps/harness-react/src/state/workspace-state'

const hooks = vi.hoisted(() => ({
  cursor: 0, dirty: false,
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void; effect?: () => (() => void) | undefined }>,
  effects: [] as Array<() => void>,
}))

// Exercise the workbench's own effects and event callbacks without mounting its child tools.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    const slot = hooks.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => {
      const next = typeof value === 'function' ? value(slot.value) : value
      if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true }
    }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.length !== slot.deps.length || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = factory(); slot.deps = deps }
    return slot.value
  },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useEffect: (effect: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps
    slot.effect = effect
    hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() })
  },
}))
vi.mock('../apps/harness-react/src/components/session/SessionSidebar', () => ({ SessionSidebar: 'session-sidebar', SessionMenuItems: 'session-menu', useHarnessSessionShortcuts: vi.fn() }))
vi.mock('../apps/harness-react/src/hooks/useModalFocusTrap', () => ({ useModalFocusTrap: vi.fn() }))

const KEY = 'harness-react-workspace'
const workspace = (path: string) => openWorkspaceTab(createWorkspaceSession(), createWorkspaceFileTab(path))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

function fixture(read: () => Promise<unknown> = async () => null) {
  const getPreference = vi.fn((key: string) => key === KEY ? read() : Promise.resolve(null))
  const setPreference = vi.fn(async (_key: string, _value: unknown) => undefined)
  const navigate = vi.fn(async (_path: string) => undefined)
  const browserProtected = vi.fn(async (_id: string, _browser: string) => ({ protected: false }))
  const browserListeners = new Set<(event: any) => void>()
  const host = { onEvent: vi.fn(() => () => undefined), getPreference, setPreference, navigate, browserProtected, onBrowserEvent: (listener: (event: any) => void) => { browserListeners.add(listener); return () => browserListeners.delete(listener) } } as unknown as PilotHost
  const controller = new PilotController(host)
  const session: HarnessSession = { version: 1, id: 'a', title: 'a', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false }
  Object.assign(controller.getSnapshot(), { initialized: true, session, sessions: [session] })
  return { controller, host, getPreference, setPreference, navigate, browserProtected, browserListeners }
}

function mount(controller: PilotController) {
  let tree: React.ReactElement
  let mounted = true
  const render = () => {
    hooks.cursor = 0
    hooks.dirty = false
    tree = HarnessWorkbench({ controller })
    hooks.effects.splice(0).forEach(effect => effect())
  }
  const drain = async () => {
    for (let index = 0; index < 24; index++) {
      await Promise.resolve()
      if (hooks.dirty && mounted) render()
    }
  }
  function props(match: (props: Record<string, unknown>) => boolean): Record<string, unknown> {
    const visit = (node: React.ReactNode): Record<string, unknown> | undefined => {
      if (Array.isArray(node)) return node.map(visit).find(Boolean)
      if (!React.isValidElement<Record<string, unknown>>(node)) return
      return match(node.props) ? node.props : visit(node.props.children as React.ReactNode)
    }
    const found = visit(tree)
    if (!found) throw new Error('Workbench control not found')
    return found
  }
  const showFiles = async () => {
    ;(props(props => props['aria-label'] === '工作区' && typeof props.onClick === 'function').onClick as () => void)()
    render()
    ;(props(props => typeof props.onOpen === 'function' && Array.isArray(props.tabs)).onOpen as (id: string) => void)('files')
    await drain()
  }
  const openFile = (path: string) => (props(props => typeof props.onOpenFile === 'function').onOpenFile as (path: string) => void)(path)
  const showWorkspace = async () => { (props(props => props['aria-label'] === '工作区' && typeof props.onClick === 'function').onClick as () => void)(); render(); await drain() }
  const unmount = () => { mounted = false; hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) }
  const replayEffects = () => {
    hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined })
    hooks.slots.forEach(slot => { if (slot.effect) slot.cleanup = slot.effect() })
  }
  render()
  return { render, drain, showFiles, showWorkspace, openFile, unmount, replayEffects, props }
}

beforeEach(() => {
  hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []
  vi.stubGlobal('React', React)
  vi.stubGlobal('document', { getElementById: () => null })
  vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn(), matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('React Harness workspace preference lifecycle', () => {
  it.each([false, true])('opens an existing task beside a main task or anonymous draft without creating a child: draft=%s', async draft => {
    const fixtureView = fixture(), target: HarnessSession = { ...fixtureView.controller.getSnapshot().session!, id: 'b', title: 'Existing B' }
    fixtureView.host.getSession = vi.fn(async () => target)
    fixtureView.host.createSession = vi.fn(async () => target)
    Object.assign(fixtureView.controller.getSnapshot(), { sessions: [target, fixtureView.controller.getSnapshot().session], ...(draft ? { session: undefined } : {}) })
    const view = mount(fixtureView.controller); await view.drain()
    const entry = () => view.props(props => Boolean(props.taskPaneEntry)).taskPaneEntry as { open(id: string): Promise<boolean>; canOpen(id: string): boolean }
    expect(entry().canOpen('b')).toBe(true)
    await expect(entry().open('b')).resolves.toBe(true); await view.drain()
    const grid = () => view.props(props => Boolean(props.layout) && typeof props.onResize === 'function') as unknown as { layout: Parameters<typeof miraTaskPaneIds>[0] }
    expect(miraTaskPaneIds(grid().layout)).toEqual(['$primary', 'b'])
    expect(view.props(props => props.existingTask === true).childSessionId).toBe('b')
    await entry().open('b'); await view.drain(); expect(miraTaskPaneIds(grid().layout)).toHaveLength(2)
    expect(fixtureView.controller.getSnapshot().session?.id).toBe(draft ? undefined : 'a')
    expect(fixtureView.host.createSession).not.toHaveBeenCalled()
    await fixtureView.controller.flushBeforeNavigation()
    expect(fixtureView.setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ [draft ? 'draft' : 'a']: expect.objectContaining({ activeTab: 'task:b' }) }))
    view.unmount(); await view.drain(); fixtureView.controller.dispose()
  })

  it('discards a delayed task opening after the main owner has changed', async () => {
    const fixtureView = fixture(), target: HarnessSession = { ...fixtureView.controller.getSnapshot().session!, id: 'b' }, pending = deferred<HarnessSession>()
    fixtureView.host.getSession = vi.fn(() => pending.promise)
    Object.assign(fixtureView.controller.getSnapshot(), { sessions: [target] })
    const view = mount(fixtureView.controller); await view.drain()
    const entry = view.props(props => Boolean(props.taskPaneEntry)).taskPaneEntry as { open(id: string): Promise<boolean> }
    const opening = entry.open('b'); await view.drain()
    Object.assign(fixtureView.controller.getSnapshot(), { session: { ...target, id: 'c' } }); view.render()
    pending.resolve(target); await expect(opening).resolves.toBe(false); await view.drain()
    expect(fixtureView.setPreference.mock.calls.filter(([key]) => key === KEY)).toHaveLength(0)
    view.unmount(); await view.drain(); fixtureView.controller.dispose()
  })

  it('removes a deleted background task from another owner pane and closed history', async () => {
    const task = { id: 'task:b' as const, label: 'B', taskSessionId: 'b' }
    const fixtureView = fixture(async () => ({ a: { ...workspace('keep.md'), tabs: [...workspace('keep.md').tabs, task], activeTab: task.id }, draft: { ...createWorkspaceSession(), recentClosedTabs: [task] } }))
    fixtureView.host.deleteSession = vi.fn(async () => undefined)
    fixtureView.host.listSessions = vi.fn(async () => fixtureView.controller.getSnapshot().sessions)
    const view = mount(fixtureView.controller); await view.drain()
    await fixtureView.controller.deleteSession('b'); await view.drain(); await fixtureView.controller.flushBeforeNavigation()
    expect(fixtureView.setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ activeTab: 'file:keep.md', tabs: [expect.objectContaining({ id: 'file:keep.md' })] }), draft: expect.objectContaining({ recentClosedTabs: [] }) }))
    view.unmount(); await view.drain(); fixtureView.controller.dispose()
  })
  it('durably removes a background browser before unmounting it, keeps other resources and permits reopen', async () => {
    const browsers = Array.from({ length: 33 }, (_, index) => ({ id: `browser:${index}` as const, label: `Web ${index}`, url: `https://mira.test/${index}` }))
    const initial = { a: { ...workspace('keep.md'), tabs: [...workspace('keep.md').tabs, ...browsers] } }
    const saved = deferred<void>(), fixtureView = fixture(async () => initial)
    fixtureView.setPreference.mockImplementationOnce(() => saved.promise)
    const view = mount(fixtureView.controller); await view.drain(); await view.showWorkspace()
    const panel = () => view.props(props => Array.isArray(props.tabs) && typeof props.onReopen === 'function')
    expect((panel().tabs as Array<{ id: string }>).some(tab => tab.id === 'browser:0')).toBe(true)
    expect(fixtureView.setPreference.mock.calls[0][1]).toMatchObject({ a: { recentClosedTabs: [browsers[0]] } })
    saved.resolve(); await view.drain()
    expect((panel().tabs as Array<{ id: string }>).filter(tab => tab.id.startsWith('browser:'))).toHaveLength(32)
    expect((panel().tabs as Array<{ id: string }>).some(tab => tab.id === 'file:keep.md')).toBe(true)
    expect(fixtureView.setPreference.mock.calls).toHaveLength(1)
    ;(panel().onReopen as (id: string) => void)('browser:0'); await view.drain()
    const restored = (panel().tabs as Array<{ id: string; url?: string }>).find(tab => tab.url === browsers[0].url)!
    expect(restored.id).not.toBe('browser:0')
    view.unmount(); await view.drain(); fixtureView.controller.dispose()
  })

  it('keeps a browser and reports a failed durable close without deleting its workspace entry', async () => {
    const initial = { a: { ...createWorkspaceSession(), tabs: Array.from({ length: 33 }, (_, index) => ({ id: `browser:${index}`, label: `Web ${index}`, url: '' })) } }
    const fixtureView = fixture(async () => initial)
    fixtureView.setPreference.mockRejectedValue(Error('关闭保存失败'))
    const view = mount(fixtureView.controller); await view.drain(); await view.showWorkspace()
    const panel = view.props(props => Array.isArray(props.tabs) && typeof props.onReopen === 'function')
    expect((panel.tabs as unknown[])).toHaveLength(33)
    expect(fixtureView.controller.getSnapshot().error).toBe('关闭保存失败')
    view.unmount(); await view.drain(); fixtureView.controller.dispose()
  })

  it('restores durable state when native protection starts during a pending close', async () => {
    const initial = { a: { ...createWorkspaceSession(), tabs: Array.from({ length: 33 }, (_, index) => ({ id: `browser:${index}`, label: `Web ${index}`, url: '' })) } }
    const saved = deferred<void>(), fixtureView = fixture(async () => initial)
    fixtureView.setPreference.mockImplementationOnce(() => saved.promise)
    const view = mount(fixtureView.controller); await view.drain(); await view.showWorkspace()
    fixtureView.browserProtected.mockResolvedValue({ protected: true }); saved.resolve(); await view.drain()
    const panel = view.props(props => Array.isArray(props.tabs) && typeof props.onReopen === 'function')
    expect((panel.tabs as unknown[])).toHaveLength(33)
    expect(fixtureView.setPreference.mock.calls.at(-1)![1]).toEqual(readWorkspaceSessions(initial))
    view.unmount(); await view.drain(); fixtureView.controller.dispose()
  })

  it('restores durable state if the final native protection check fails', async () => {
    const initial = { a: { ...workspace('keep.md'), tabs: [...workspace('keep.md').tabs, ...Array.from({ length: 33 }, (_, index) => ({ id: `browser:${index}`, label: `Web ${index}`, url: '' }))] } }
    const saved = deferred<void>(), fixtureView = fixture(async () => initial)
    fixtureView.setPreference.mockImplementationOnce(() => saved.promise)
    const view = mount(fixtureView.controller); await view.drain(); await view.showWorkspace()
    fixtureView.browserProtected.mockRejectedValue(Error('页面保护检查失败')); saved.resolve(); await view.drain()
    const panel = view.props(props => Array.isArray(props.tabs) && typeof props.onReopen === 'function')
    expect((panel.tabs as Array<{ id: string }>).filter(tab => tab.id.startsWith('browser:'))).toHaveLength(33)
    expect(fixtureView.setPreference.mock.calls.at(-1)![1]).toEqual(readWorkspaceSessions(initial))
    expect(fixtureView.controller.getSnapshot().error).toBe('页面保护检查失败')
    view.unmount(); await view.drain(); fixtureView.controller.dispose()
  })

  it('cancels a pending close when its browser is selected and retains concurrent file edits', async () => {
    const initial = { a: { ...workspace('keep.md'), fileTreeOpen: true, tabs: [...workspace('keep.md').tabs, ...Array.from({ length: 33 }, (_, index) => ({ id: `browser:${index}`, label: `Web ${index}`, url: '' }))] } }
    const saved = deferred<void>(), fixtureView = fixture(async () => initial)
    fixtureView.setPreference.mockImplementationOnce(() => saved.promise)
    const view = mount(fixtureView.controller); await view.drain(); await view.showWorkspace()
    const panel = () => view.props(props => Array.isArray(props.tabs) && typeof props.onActivate === 'function')
    view.openFile('new.md'); await view.drain()
    ;(panel().onActivate as (id: string) => void)('browser:0'); await view.drain()
    saved.resolve(); await view.drain()
    const state = fixtureView.setPreference.mock.calls.at(-1)![1] as typeof initial
    expect(state.a.activeTab).toBe('browser:0')
    expect(state.a.tabs.some(tab => tab.id === 'browser:0')).toBe(true)
    expect(state.a.tabs.some(tab => tab.id === 'file:new.md')).toBe(true)
    expect(state.a.tabs.filter(tab => tab.id.startsWith('browser:'))).toHaveLength(32)
    expect(state.a.recentClosedTabs?.[0].id).toBe('browser:1')
    view.unmount(); await view.drain(); fixtureView.controller.dispose()
  })

  it.each([false, true])('removes deleted-task workspace records even when hydration is delayed: %s', async delayed => {
    const read = deferred<unknown>(), fixtureView = fixture(() => read.promise)
    fixtureView.host.deleteSession = vi.fn(async () => undefined)
    fixtureView.host.listSessions = vi.fn(async () => fixtureView.controller.getSnapshot().sessions)
    const view = mount(fixtureView.controller)
    const initial = { a: workspace('keep.md'), deleted: workspace('gone.md') }
    if (!delayed) { read.resolve(initial); await view.drain() }
    await fixtureView.controller.deleteSession('deleted'); await view.drain()
    if (delayed) { read.resolve(initial); await view.drain() }
    await fixtureView.controller.flushBeforeNavigation()
    expect(fixtureView.setPreference).toHaveBeenLastCalledWith(KEY, { a: readWorkspaceSessions(initial).a })
    view.unmount(); await view.drain(); fixtureView.controller.dispose()
  })

  it('survives the shipped StrictMode effect replay without saving an untouched or empty snapshot', async () => {
    const read = deferred<unknown>()
    const { controller, getPreference, setPreference } = fixture(() => read.promise)
    const view = mount(controller)
    view.replayEffects()
    await view.drain()
    expect(getPreference.mock.calls.filter(([key]) => key === KEY)).toHaveLength(1)
    read.resolve({ a: workspace('saved.md') })
    await view.drain()
    await controller.flushBeforeNavigation()
    expect(setPreference).not.toHaveBeenCalled()
    view.unmount(); await view.drain(); controller.dispose()
  })

  it('does not write an empty workspace or allow navigation after failed hydration', async () => {
    const { controller, setPreference, navigate } = fixture(async () => { throw new Error('工作区读取失败') })
    const view = mount(controller)
    await view.drain()
    expect(setPreference).not.toHaveBeenCalled()
    expect(controller.getSnapshot().error).toBe('工作区读取失败')
    await controller.navigate('/settings')
    expect(navigate).not.toHaveBeenCalled()
    expect(setPreference).not.toHaveBeenCalled()
    view.unmount()
    await view.drain()
    controller.dispose()
  })

  it('waits for delayed hydration and preserves same-session local edits before navigation', async () => {
    const read = deferred<unknown>()
    const { controller, setPreference, navigate } = fixture(() => read.promise)
    const view = mount(controller)
    await view.showFiles()
    view.openFile('new.md')
    const leaving = controller.navigate('/settings')
    await view.drain()
    expect(navigate).not.toHaveBeenCalled()
    expect(setPreference).not.toHaveBeenCalled()
    read.resolve({ a: workspace('old.md'), untouched: workspace('other.md') })
    await leaving
    await view.drain()
    expect(setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({
      a: expect.objectContaining({ tabs: [expect.objectContaining({ path: 'new.md' })] }),
      untouched: expect.objectContaining({ tabs: [expect.objectContaining({ path: 'other.md' })] }),
    }))
    expect(navigate).toHaveBeenCalledOnce()
    view.unmount(); await view.drain(); controller.dispose()
  })

  it('flushes an edit made immediately before navigation and waits for the host acknowledgement', async () => {
    const { controller, setPreference, navigate } = fixture()
    const view = mount(controller)
    await view.showFiles()
    const saved = deferred<void>()
    setPreference.mockImplementationOnce(() => saved.promise)
    view.openFile('latest.md')
    const leaving = controller.navigate('/settings')
    await view.drain()
    expect(navigate).not.toHaveBeenCalled()
    expect(setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ selectedFilePath: 'latest.md' }) }))
    saved.resolve()
    await leaving
    expect(navigate).toHaveBeenCalledOnce()
    view.unmount(); await view.drain(); controller.dispose()
  })

  it('keeps newer edits ordered behind a pending save and flushes the latest snapshot', async () => {
    const { controller, setPreference, navigate } = fixture()
    const view = mount(controller)
    await view.showFiles()
    const first = deferred<void>()
    setPreference.mockClear()
    setPreference.mockImplementationOnce(() => first.promise)
    view.openFile('first.md')
    await view.drain()
    view.openFile('second.md')
    await view.drain()
    expect(setPreference).toHaveBeenCalledOnce()
    const leaving = controller.navigate('/settings')
    expect(navigate).not.toHaveBeenCalled()
    first.resolve()
    await leaving
    expect(setPreference).toHaveBeenCalledTimes(2)
    expect(setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ selectedFilePath: 'second.md', tabs: expect.arrayContaining([expect.objectContaining({ path: 'first.md' }), expect.objectContaining({ path: 'second.md' })]) }) }))
    view.unmount(); await view.drain(); controller.dispose()
  })

  it('reports save failure, blocks leaving, and retries the unsaved snapshot', async () => {
    const { controller, setPreference, navigate } = fixture()
    const view = mount(controller)
    await view.showFiles()
    setPreference.mockImplementation(async () => { throw new Error('工作区保存失败') })
    view.openFile('keep.md')
    await view.drain()
    expect(controller.getSnapshot().error).toBe('工作区保存失败')
    await controller.navigate('/settings')
    expect(navigate).not.toHaveBeenCalled()
    setPreference.mockImplementation(async () => undefined)
    await controller.navigate('/settings')
    expect(setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ selectedFilePath: 'keep.md' }) }))
    expect(navigate).toHaveBeenCalledOnce()
    view.unmount(); await view.drain(); controller.dispose()
  })

  it('retries a failed read without overwriting local edits or unrelated saved sessions', async () => {
    let fail = true
    const untouched = workspace('other.md')
    const { controller, setPreference, navigate } = fixture(async () => {
      if (fail) throw new Error('首次读取失败')
      return { a: workspace('old.md'), untouched }
    })
    const view = mount(controller)
    await view.showFiles()
    view.openFile('keep.md')
    await view.drain()
    expect(setPreference).not.toHaveBeenCalled()
    fail = false
    await controller.navigate('/settings')
    expect(navigate).toHaveBeenCalledOnce()
    expect(setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ selectedFilePath: 'keep.md' }), untouched }))
    view.unmount(); await view.drain(); controller.dispose()
  })

  it('flushes an edit on rapid unmount after the delayed read completes', async () => {
    const untouched = workspace('other.md')
    const read = deferred<unknown>()
    const { controller, setPreference } = fixture(() => read.promise)
    const view = mount(controller)
    await view.showFiles()
    view.openFile('keep.md')
    view.unmount()
    read.resolve({ untouched })
    await view.drain()
    expect(setPreference).toHaveBeenCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ selectedFilePath: 'keep.md' }), untouched }))
    controller.dispose()
  })

  it('does not dispatch a pending unmount save after controller destruction', async () => {
    const read = deferred<unknown>()
    const { controller, setPreference } = fixture(() => read.promise)
    const view = mount(controller)
    await view.showFiles()
    view.openFile('keep.md')
    view.unmount(); controller.dispose()
    read.resolve(null)
    await view.drain()
    expect(setPreference).not.toHaveBeenCalled()
    await expect(controller.flushBeforeNavigation()).rejects.toThrow('连接已关闭')
  })

  it('preserves an intentional same-session clear when hydration finishes late', async () => {
    const untouched = workspace('other.md')
    const read = deferred<unknown>()
    const { controller, setPreference } = fixture(() => read.promise)
    const view = mount(controller)
    await view.showFiles()
    view.openFile('temporary.md')
    await view.drain()
    ;(view.props(props => typeof props.onCloseAll === 'function').onCloseAll as () => void)()
    read.resolve({ a: workspace('old.md'), untouched })
    await view.drain()
    await controller.flushBeforeNavigation()
    expect(setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ tabs: [], recentClosedTabs: [expect.objectContaining({ path: 'temporary.md' })] }), untouched }))
    view.unmount(); await view.drain(); controller.dispose()
  })

  it('reports an unmount save failure without swallowing the pending data', async () => {
    const { controller, setPreference } = fixture()
    const view = mount(controller)
    await view.showFiles()
    setPreference.mockRejectedValue(new Error('卸载保存失败'))
    view.openFile('keep.md')
    view.unmount()
    await view.drain()
    expect(controller.getSnapshot().error).toBe('卸载保存失败')
    expect(setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ selectedFilePath: 'keep.md' }) }))
    controller.dispose()
  })

  it('reports a failed host prepare-leave flush and rejects until saving is retried', async () => {
    const { controller, setPreference } = fixture()
    const view = mount(controller)
    await view.showFiles()
    setPreference.mockRejectedValue(new Error('宿主离开前保存失败'))
    view.openFile('keep.md')
    await expect(controller.flushBeforeNavigation()).rejects.toThrow('宿主离开前保存失败')
    expect(controller.getSnapshot().error).toBe('宿主离开前保存失败')
    setPreference.mockResolvedValue(undefined)
    await expect(controller.flushBeforeNavigation()).resolves.toBeUndefined()
    expect(setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ selectedFilePath: 'keep.md' }) }))
    view.unmount(); await view.drain(); controller.dispose()
  })
})

describe('Pilot controller preference write ordering', () => {
  it('serializes a key while allowing unrelated keys to save independently', async () => {
    const { controller, setPreference } = fixture()
    const first = deferred<void>()
    setPreference.mockImplementationOnce(() => first.promise)
    const old = controller.setPreference(KEY, { version: 1 }, true)
    const latest = controller.setPreference(KEY, { version: 2 }, true)
    await controller.setPreference('other', { version: 3 }, true)
    expect(setPreference.mock.calls.map(([key]) => key)).toEqual([KEY, 'other'])
    first.resolve()
    await old; await latest
    expect(setPreference).toHaveBeenLastCalledWith(KEY, { version: 2 })
    controller.dispose()
  })

  it('does not poison the write queue after a failure', async () => {
    const { controller, setPreference } = fixture()
    setPreference.mockRejectedValueOnce(new Error('写入失败'))
    const failed = controller.setPreference(KEY, { version: 1 }, true)
    const retried = controller.setPreference(KEY, { version: 2 }, true)
    await expect(failed).rejects.toThrow('写入失败')
    await expect(retried).resolves.toBeUndefined()
    expect(setPreference).toHaveBeenLastCalledWith(KEY, { version: 2 })
    controller.dispose()
  })

  it('rejects queued strict writes instead of dispatching them after disposal', async () => {
    const { controller, setPreference } = fixture()
    const first = deferred<void>()
    setPreference.mockImplementationOnce(() => first.promise)
    const old = controller.setPreference(KEY, { version: 1 }, true)
    const latest = controller.setPreference(KEY, { version: 2 }, true)
    controller.dispose()
    const oldResult = expect(old).rejects.toThrow('连接已关闭')
    const latestResult = expect(latest).rejects.toThrow('连接已关闭')
    first.resolve()
    await oldResult; await latestResult
    expect(setPreference).toHaveBeenCalledOnce()
  })

  it('turns synchronous host throws into observable strict errors', async () => {
    const { controller, setPreference } = fixture()
    setPreference.mockImplementation(() => { throw new Error('同步写入失败') })
    await expect(controller.setPreference(KEY, {}, true)).rejects.toThrow('同步写入失败')
    await expect(controller.setPreference(KEY, {})).resolves.toBeUndefined()
    controller.dispose()
  })

  it('keeps a search attached to the captured session and explicitly rejects unavailable hosts', async () => {
    const { controller, host } = fixture()
    await expect(controller.searchFilesFor('a', 'file')).rejects.toThrow('不支持工作目录搜索')
    host.searchFiles = vi.fn(async () => ({ entries: [{ name: 'file.md', path: 'src/file.md', type: 'file' as const }], truncated: false }))
    await expect(controller.searchFilesFor('b', 'file', true)).resolves.toMatchObject({ entries: [{ path: 'src/file.md' }], truncated: false })
    expect(host.searchFiles).toHaveBeenCalledWith('b', 'file', true)
    controller.dispose()
  })
})
