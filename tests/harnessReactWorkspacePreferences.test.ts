import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessSession } from '../src/config/harness'
import { HarnessWorkbench } from '../apps/harness-react/src/components/workbench/HarnessWorkbench'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import { createWorkspaceFileTab, createWorkspaceSession, openWorkspaceTab } from '../apps/harness-react/src/state/workspace-state'

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
vi.mock('@assistant-ui/react', () => ({
  AssistantRuntimeProvider: 'runtime', MessagePrimitive: {},
  ThreadPrimitive: { Root: 'thread', Viewport: 'viewport', Messages: 'messages', ScrollToBottom: 'scroll-to-bottom' },
  useAuiState: vi.fn(), useExternalStoreRuntime: () => ({}),
}))
vi.mock('../apps/harness-react/src/components/session/SessionSidebar', () => ({ SessionSidebar: 'session-sidebar', useHarnessSessionShortcuts: vi.fn() }))
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
  const host = { getPreference, setPreference, navigate } as unknown as PilotHost
  const controller = new PilotController(host)
  const session: HarnessSession = { version: 1, id: 'a', title: 'a', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false }
  Object.assign(controller.getSnapshot(), { initialized: true, session, sessions: [session] })
  return { controller, host, getPreference, setPreference, navigate }
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
  const unmount = () => { mounted = false; hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) }
  const replayEffects = () => {
    hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined })
    hooks.slots.forEach(slot => { if (slot.effect) slot.cleanup = slot.effect() })
  }
  render()
  return { render, drain, showFiles, openFile, unmount, replayEffects, props }
}

beforeEach(() => {
  hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []
  vi.stubGlobal('React', React)
  vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn(), matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('React Harness workspace preference lifecycle', () => {
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
    const { controller, setPreference, navigate } = fixture(async () => {
      if (fail) throw new Error('首次读取失败')
      return { a: workspace('old.md'), untouched: workspace('other.md') }
    })
    const view = mount(controller)
    await view.showFiles()
    view.openFile('keep.md')
    await view.drain()
    expect(setPreference).not.toHaveBeenCalled()
    fail = false
    await controller.navigate('/settings')
    expect(navigate).toHaveBeenCalledOnce()
    expect(setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ selectedFilePath: 'keep.md' }), untouched: workspace('other.md') }))
    view.unmount(); await view.drain(); controller.dispose()
  })

  it('flushes an edit on rapid unmount after the delayed read completes', async () => {
    const read = deferred<unknown>()
    const { controller, setPreference } = fixture(() => read.promise)
    const view = mount(controller)
    await view.showFiles()
    view.openFile('keep.md')
    view.unmount()
    read.resolve({ untouched: workspace('other.md') })
    await view.drain()
    expect(setPreference).toHaveBeenCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ selectedFilePath: 'keep.md' }), untouched: workspace('other.md') }))
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
    const read = deferred<unknown>()
    const { controller, setPreference } = fixture(() => read.promise)
    const view = mount(controller)
    await view.showFiles()
    view.openFile('temporary.md')
    await view.drain()
    ;(view.props(props => typeof props.onCloseAll === 'function').onCloseAll as () => void)()
    read.resolve({ a: workspace('old.md'), untouched: workspace('other.md') })
    await view.drain()
    await controller.flushBeforeNavigation()
    expect(setPreference).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ a: expect.objectContaining({ tabs: [], recentClosedTabs: [expect.objectContaining({ path: 'temporary.md' })] }), untouched: workspace('other.md') }))
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
