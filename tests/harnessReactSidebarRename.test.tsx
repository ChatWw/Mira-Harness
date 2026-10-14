// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionSidebar } from '../apps/harness-react/src/components/session/SessionSidebar'
import { SidebarCollectionSection } from '../apps/harness-react/src/components/session/SidebarCollectionSection'
import { SidebarPreferenceStore } from '../apps/harness-react/src/components/session/sidebar-preferences'
import type { PilotController, PilotState } from '../apps/harness-react/src/state/pilot-state'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

async function mountCollection() {
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
  const save = vi.fn(async (_name: string) => undefined), cancel = vi.fn()
  let id = 'project-a', renaming = true
  const render = async () => { await act(async () => root!.render(<React.StrictMode><Tooltip.Provider><SidebarCollectionSection id={id} name="项目名称" count={0} expanded sortable={false} renaming={renaming} onRename={save} onCancelRename={cancel} onBeginRename={() => undefined} onNewTask={() => undefined} onToggle={() => undefined}>{null}</SidebarCollectionSection></Tooltip.Provider></React.StrictMode>)) }
  await render()
  const input = () => container.querySelector<HTMLInputElement>('input')!
  const change = async (value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value); input().dispatchEvent(new Event('input', { bubbles: true })) }) }
  const submit = async () => { await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }
  const key = async (value: string, options: KeyboardEventInit = {}) => { const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options }); await act(async () => input().dispatchEvent(event)); return event }
  return { container, save, cancel, input, change, submit, key, switchTo: async (next: string) => { id = next; await render() }, reopen: async () => { renaming = false; await render(); renaming = true; await render() } }
}

describe('sidebar project and group rename ownership', () => {
  it('does not submit or cancel while composition or legacy IME keys own the editor', async () => {
    const view = await mountCollection(); await view.change('中文名称')
    await act(async () => view.input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    await view.submit(); await view.key('Enter'); await view.key('Escape')
    expect(view.save).not.toHaveBeenCalled(); expect(view.cancel).not.toHaveBeenCalled()
    await act(async () => view.input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    await view.key('Enter', { keyCode: 229 }); await view.key('Escape', { keyCode: 229 })
    expect(view.save).not.toHaveBeenCalled(); expect(view.cancel).not.toHaveBeenCalled()
    await view.key('Enter')
    expect(view.save).toHaveBeenCalledExactlyOnceWith('中文名称'); expect(view.cancel).toHaveBeenCalledOnce()
  })

  it('accepts a single save before React renders its disabled input', async () => {
    const view = await mountCollection(); await view.change('只保存一次')
    const pending = deferred<void>(); view.save.mockReturnValueOnce(pending.promise)
    await act(async () => { const form = view.container.querySelector('form')!; form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(view.save).toHaveBeenCalledExactlyOnceWith('只保存一次')
    expect(view.input().disabled).toBe(true); await view.key('Escape'); expect(view.cancel).not.toHaveBeenCalled()
    await act(async () => pending.resolve()); expect(view.cancel).toHaveBeenCalledOnce()
  })

  it.each(['another-owner', 'same-owner-reopened'] as const)('does not let a pending save close the %s editor', async next => {
    const view = await mountCollection(); await view.change('旧名称')
    const pending = deferred<void>(); view.save.mockReturnValueOnce(pending.promise); await view.submit()
    if (next === 'another-owner') await view.switchTo('project-b'); else await view.reopen()
    expect(view.input().disabled).toBe(false)
    await view.change('新的待保存名称'); await act(async () => pending.resolve())
    expect(view.cancel).not.toHaveBeenCalled(); expect(view.input().value).toBe('新的待保存名称')
    await view.submit(); expect(view.save).toHaveBeenLastCalledWith('新的待保存名称'); expect(view.cancel).toHaveBeenCalledOnce()
  })
})

async function mount(statePatch: Partial<PilotState> = {}, preferences: Record<string, unknown> = { view: 'group', sort: 'manual' }, taskPaneEntry?: { open(id: string): Promise<unknown>; canOpen(id: string): boolean }) {
  const state = { sessions: ['a', 'b'].map(id => ({ id, title: `任务 ${id.toUpperCase()}`, createdAt: 1, updatedAt: 1, status: 'active' })), projects: [], messages: [], providers: [], running: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {}, error: undefined } as PilotState
  const controller = { getSnapshot: () => state, deleteSession: vi.fn(async (_id: string) => undefined), renameSession: vi.fn<PilotController['renameSession']>(async () => false), setSessionPinned: vi.fn<PilotController['setSessionPinned']>(async () => undefined), navigate: vi.fn<PilotController['navigate']>(async () => undefined), open: vi.fn(), reportError: vi.fn(), removeProject: vi.fn(async () => undefined), supportsProjectRemoval: true }
  Object.assign(state, statePatch)
  const store = new SidebarPreferenceStore(async () => preferences, async () => undefined)
  await store.load()
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
  const render = async () => { await act(async () => root!.render(<React.StrictMode><SessionSidebar state={state} controller={controller as unknown as PilotController} width={264} onClose={() => undefined} preferenceStore={store} taskPaneEntry={taskPaneEntry} /></React.StrictMode>)) }
  await render()
  const row = (id = 'a') => container.querySelector<HTMLElement>(`[data-sidebar-session-id="${id}"]`)!
  const input = (id = 'a') => row(id).querySelector<HTMLInputElement>('input')!
  const rename = async (id = 'a') => {
    await act(async () => row(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    const action = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent === '重命名')!
    await act(async () => action.click())
  }
  const change = async (text: string, id = 'a') => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(id), text); input(id).dispatchEvent(new Event('input', { bubbles: true })) }) }
  const submit = async (id = 'a') => { await act(async () => row(id).querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }
  const key = async (value: string, options: KeyboardEventInit = {}, id = 'a') => { const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: value, ...options }); await act(async () => input(id).dispatchEvent(event)); return event }
  return { container, state, controller, store, render, row, input, rename, change, submit, key }
}

describe('sidebar task rename through real React and Radix DOM', () => {
  it('opens the project-style delete dialog from the menu and cancels without deleting', async () => {
    const view = await mount()
    await act(async () => view.row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(e => e.textContent === '删除会话')!.click())
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.className).toContain('mira-confirm'); expect(dialog.textContent).toContain('删除会话「任务 A」？')
    expect(dialog.textContent).toContain('无法恢复'); expect(view.controller.deleteSession).not.toHaveBeenCalled()
    await act(async () => [...dialog.querySelectorAll('button')].find(e => e.textContent === '取消')!.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(view.controller.deleteSession).not.toHaveBeenCalled()
  })

  it('keeps delete failures in the dialog and blocks duplicate confirmation while pending', async () => {
    const view = await mount(); view.controller.deleteSession.mockRejectedValueOnce(new Error('请先处理待发送消息'))
    await act(async () => view.row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(e => e.textContent === '删除会话')!.click())
    const confirm = () => document.querySelector<HTMLButtonElement>('[aria-label="确认删除会话"]')!
    await act(async () => confirm().click())
    expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe('请先处理待发送消息')
    const pending = deferred<void>(); view.controller.deleteSession.mockReturnValueOnce(pending.promise)
    await act(async () => { confirm().click(); confirm().click() })
    expect(view.controller.deleteSession).toHaveBeenCalledTimes(2); expect(confirm().disabled).toBe(true)
    await act(async () => pending.resolve())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(view.controller.deleteSession).toHaveBeenLastCalledWith('a')
  })

  it.each(['group', 'project', 'timeline'] as const)('shows status instead of time until a task is read in %s view', async mode => {
    const now = Date.now()
    const view = await mount({ sessions: [{ id: 'a', title: '任务 A', createdAt: now, updatedAt: now, status: 'active' }], runningSessionIds: ['a'] }, { view: mode === 'group' ? 'group' : 'project', projectView: mode === 'timeline' ? 'timeline' : 'collections', sort: 'manual' })
    const badge = () => view.row().querySelector('.mira-session-status')?.getAttribute('aria-label')
    const time = () => view.row().querySelector('time')
    expect(badge()).toBe('执行中'); expect(time()).toBeNull()
    view.state.runningSessionIds = []; view.state.unreadSessionIds = ['a']; await view.render()
    expect(badge()).toBe('未读'); expect(time()).toBeNull()
    view.state.unreadSessionIds = []; await view.render()
    expect(badge()).toBeUndefined(); expect(time()?.textContent).toBe('刚刚')
    view.state.sessions = view.state.sessions.map(session => ({ ...session, planStatus: 'executing' })); await view.render()
    expect(view.row().querySelector('.pilot-spin')).not.toBeNull(); expect(time()).toBeNull()
    view.state.sessions = view.state.sessions.map(session => ({ ...session, planStatus: 'completed' })); await view.render()
    expect(time()?.textContent).toBe('刚刚')
  })

  it('omits model settings from the conversation context menu', async () => {
    const view = await mount()
    await act(async () => view.row('b').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    const items = [...view.container.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(element => element.textContent)
    expect(items).toContain('重命名')
    expect(items).not.toContain('模型设置')
    expect(view.controller.navigate).not.toHaveBeenCalled()
    expect(view.controller.open).not.toHaveBeenCalled()
  })

  it('groups project-task management before resources in the upstream action order', async () => {
    const view = await mount({ projects: [{ id: 'p', name: '项目', directory: '/tmp/mira', directoryExists: true, createdAt: 1, updatedAt: 1 }], sessions: [{ id: 'a', title: '项目任务', projectId: 'p', createdAt: 1, updatedAt: 1, status: 'active' }] }, { view: 'project', sort: 'manual', expandedProjectIds: ['p'] })
    await act(async () => view.row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    const items = [...view.container.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(item => item.textContent)
    expect(items.slice(0, 4)).toEqual(['置顶', '重命名', '归档', '标记为未读'])
    expect(items.filter(item => item === '归档')).toHaveLength(1)
  })

  it('starts grouped-task menus with group movement followed by rename, archive and unread', async () => {
    const view = await mount({}, { view: 'group', sort: 'manual', groups: [{ id: 'g', name: '研究', color: 'blue', collapsed: false, sessionIds: ['a', 'b'] }] })
    await act(async () => view.row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    const items = [...view.container.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(item => item.textContent)
    expect(items.slice(0, 5)).toEqual(['移动到分组', '移动到顶部', '重命名', '归档', '标记为未读'])
    expect(items).toContain('置顶'); expect(items).toContain('复制'); expect(items).toContain('删除会话')
  })

  it.each([
    { added: 2, removed: 1, incomplete: false, estimated: false },
    { added: 0, removed: 0, incomplete: true, estimated: false },
    { added: 600, removed: 0, incomplete: false, estimated: true },
  ])('keeps file change counts out of sidebar rows: %j', async counts => {
    const view = await mount()
    view.state.sessions[0].changeSummary = { files: [], ...counts }; await view.render()
    expect(view.row().querySelector('.mira-session-row__changes')).toBeNull()
    expect(view.row().querySelector('time')).not.toBeNull()
    expect(view.controller.open).not.toHaveBeenCalled()
  })

  it.each(['needs_input', 'awaiting_confirmation', 'permission'] as const)('shows a visible %s capsule without time or navigation', async state => {
    const view = await mount()
    if (state === 'permission') view.state.pendingPermissions.a = { requestId: 'permission-a', sessionId: 'a', title: '允许读取', detail: '真实权限' }
    else view.state.sessions[0].planStatus = state
    await view.render()
    const expected = state === 'needs_input' ? '需输入' : state === 'awaiting_confirmation' ? '待确认' : '待授权'
    expect(view.row().querySelector('.mira-session-interaction')?.textContent).toBe(expected)
    expect(view.row().querySelector('time')).toBeNull()
    expect(view.row().querySelectorAll('.mira-session-row__action')).toHaveLength(0)
    expect(view.controller.open).not.toHaveBeenCalled()
  })
  it('offers same-group move to top through the real context menu', async () => {
    const view = await mount({}, { view: 'group', sort: 'manual', groups: [{ id: 'g', name: '研究', color: 'blue', collapsed: false, sessionIds: ['b', 'a'] }] })
    await act(async () => view.row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    const move = [...view.container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === '移动到顶部')!
    expect(move).toBeDefined()
    await act(async () => move.click())
    expect(view.store.getSnapshot().preferences.groups[0].sessionIds).toEqual(['a', 'b'])
    expect(view.store.getSnapshot().preferences.ungroupedSessionOrder).toEqual([])
    expect(view.controller.open).not.toHaveBeenCalled()
  })
  it('keeps the actual task directory out of sidebar tooltips', async () => {
    const view = await mount({ sessions: [{ id: 'a', title: '目录任务', workingDirectory: '/tmp/mira/真实目录', createdAt: 1, updatedAt: 1, status: 'active' }] })
    const open = view.row().querySelector<HTMLButtonElement>('.mira-session-row__open')!
    await act(async () => open.focus())
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    expect(open.hasAttribute('title')).toBe(false); expect(view.controller.open).not.toHaveBeenCalled()
    await act(async () => view.row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  })
  it('keeps a real pending authorization visible even when an older plan status says executing', async () => {
    const view = await mount()
    view.state.sessions[0].planStatus = 'executing'
    view.state.pendingPermissions.a = { requestId: 'permission-a', sessionId: 'a', title: '允许读取', detail: '真实权限' }
    await view.render()
    const capsule = view.row().querySelector('.mira-session-interaction')!
    expect(capsule.textContent).toBe('待授权'); expect(capsule.getAttribute('aria-label')).toBe('等待审批')
    delete view.state.pendingPermissions.a; await view.render()
    expect(view.row().querySelector('.mira-session-interaction')).toBeNull(); expect(view.row().querySelector('.mira-session-status')?.getAttribute('aria-label')).toBe('执行中')
  })
  it('opens the requested existing task through Radix and keeps failures on its owning row', async () => {
    const entry = { open: vi.fn(async (_id: string) => { throw new Error('侧面任务打开失败') }), canOpen: vi.fn((_id: string) => true) }
    const view = await mount({}, { view: 'project', sort: 'manual' }, entry)
    const menu = async (id: string) => {
      await act(async () => view.row(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
      return [...view.container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent === '在侧面打开任务')!
    }
    await act(async () => (await menu('b')).click())
    expect(entry.open).toHaveBeenCalledExactlyOnceWith('b')
    expect(view.row('b').querySelector('[role="alert"]')?.textContent).toBe('侧面任务打开失败')
    expect(view.row('a').querySelector('[role="alert"]')).toBeNull()
    expect(view.controller.open).not.toHaveBeenCalled()
    entry.canOpen.mockReturnValue(false)
    const unavailable = await menu('a')
    expect(unavailable.getAttribute('data-disabled')).not.toBeNull()
    await act(async () => unavailable.click()); expect(entry.open).toHaveBeenCalledTimes(1)
  })
  it('pins through the leading project action without navigating, ignores repeated clicks in flight and retains failure for retry', async () => {
    const view = await mount({}, { view: 'project', sort: 'manual' })
    const pin = () => view.row().querySelector<HTMLButtonElement>('.mira-session-row__pin')!
    expect(pin()).not.toBeNull()
    expect(pin().getAttribute('aria-label')).toBe('置顶 任务 A')
    expect(pin().getAttribute('aria-pressed')).toBe('false')
    let reject!: (error: Error) => void
    const first = new Promise<void>((_resolve, fail) => { reject = fail })
    view.controller.setSessionPinned.mockReturnValueOnce(first)
    await act(async () => { pin().click(); pin().click() })
    expect(view.controller.setSessionPinned).toHaveBeenCalledExactlyOnceWith('a', true)
    expect(pin().disabled).toBe(true)
    await act(async () => reject(new Error('置顶未保存，请重试')))
    expect(view.row().querySelector('[role="alert"]')?.textContent).toBe('置顶未保存，请重试')
    expect(pin().disabled).toBe(false)
    view.controller.setSessionPinned.mockImplementationOnce(async (id, pinned) => { view.state.sessions = view.state.sessions.map(session => session.id === id ? { ...session, pinned } : session) })
    await act(async () => pin().click()); await view.render()
    expect(pin().getAttribute('aria-label')).toBe('取消置顶 任务 A')
    expect(pin().getAttribute('aria-pressed')).toBe('true')
    expect(view.row().querySelector('[role="alert"]')).toBeNull()
    await act(async () => pin().click())
    expect(view.controller.setSessionPinned).toHaveBeenLastCalledWith('a', false)
    expect(view.controller.open).not.toHaveBeenCalled()
    expect(view.state.session).toBeUndefined()
  })

  it('retains grouped drag and menu actions without inserting a project-style pin action', async () => {
    const view = await mount()
    expect(view.row().querySelector('.mira-session-row__pin')).toBeNull()
    expect(view.row().querySelector('.mira-session-row__grip')).toBeNull()
    expect(view.row().getAttribute('data-sidebar-draggable')).toBe('true')
    expect(view.row().getAttribute('tabindex')).toBe('0')
    await act(async () => view.row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    expect([...view.container.querySelectorAll('[role="menuitem"]')].some(item => item.textContent === '置顶')).toBe(true)
  })

  it('exposes a single accessible title copy without a native tooltip and cancels delayed motion when its context menu opens', async () => {
    const observers: Array<{ callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }> = []
    vi.stubGlobal('ResizeObserver', class { disconnect = vi.fn(); observe = vi.fn(); constructor(callback: ResizeObserverCallback) { observers.push({ callback, disconnect: this.disconnect }) } })
    const animations: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions; cancel: ReturnType<typeof vi.fn> }> = []
    vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation((frames, options) => { const animation = { frames: frames as Keyframe[], options: options as KeyframeAnimationOptions, cancel: vi.fn() }; animations.push(animation); return animation as unknown as Animation })
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    vi.spyOn(window, 'matchMedia').mockReturnValue(motion)
    const view = await mount({ sessions: [{ id: 'a', title: '任务标题足够长，需要完整阅读后再执行', createdAt: 1, updatedAt: 1, status: 'active' }] })
    const title = view.row().querySelector<HTMLElement>('[data-mira-task-title]')!
    expect(title).not.toBeNull()
    const original = title.querySelector<HTMLElement>('[data-mira-title-copy="original"]')!
    Object.defineProperty(title, 'clientWidth', { configurable: true, value: 90 }); Object.defineProperty(original, 'scrollWidth', { configurable: true, value: 260 })
    await act(async () => observers.forEach(observer => observer.callback([], {} as ResizeObserver)))
    expect(title.querySelector('[data-mira-title-copy="duplicate"]')?.getAttribute('aria-hidden')).toBe('true')
    expect(view.row().querySelector('.mira-session-row__open')?.getAttribute('aria-label')).toBe('任务标题足够长，需要完整阅读后再执行')
    expect(view.row().querySelector('.mira-session-row__open')?.hasAttribute('title')).toBe(false)
    vi.useFakeTimers()
    try {
      await act(async () => view.row().dispatchEvent(new MouseEvent('mouseenter')))
      await act(async () => vi.advanceTimersByTimeAsync(999)); expect(animations).toHaveLength(0)
      await act(async () => vi.advanceTimersByTimeAsync(1)); expect(animations).toHaveLength(2)
      expect(animations[0].frames[1].transform).toBe('translate3d(-284px, 0, 0)')
      expect(animations[0].options).toMatchObject({ duration: 9100, iterations: Infinity, easing: 'linear' })
      await act(async () => view.row().dispatchEvent(new MouseEvent('mouseleave')))
      expect(animations.every(animation => animation.cancel.mock.calls.length === 1)).toBe(true)
      await act(async () => view.row().querySelector<HTMLButtonElement>('.mira-session-row__open')!.focus())
      await act(async () => vi.advanceTimersByTimeAsync(1000)); expect(animations).toHaveLength(4)
      await act(async () => view.row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
      expect(view.row().getAttribute('data-menu-open')).toBe('true')
      expect(animations.slice(2).every(animation => animation.cancel.mock.calls.length === 1)).toBe(true)
      await act(async () => vi.advanceTimersByTimeAsync(1500)); expect(animations).toHaveLength(4)
      expect(document.querySelector('[role="tooltip"]')).toBeNull()
      await act(async () => view.container.querySelector<HTMLElement>('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
      await act(async () => view.row().querySelector<HTMLButtonElement>('.mira-session-row__open')!.focus())
      await act(async () => vi.advanceTimersByTimeAsync(1000)); expect(animations).toHaveLength(6)
      Object.defineProperty(motion, 'matches', { configurable: true, value: true })
      await act(async () => motion.dispatchEvent(new Event('change')))
      expect(animations.slice(4).every(animation => animation.cancel.mock.calls.length === 1)).toBe(true)
      await act(async () => view.row().dispatchEvent(new MouseEvent('mouseenter')))
      await act(async () => vi.advanceTimersByTimeAsync(1500)); expect(animations).toHaveLength(6)
      Object.defineProperty(title, 'clientWidth', { configurable: true, value: 400 })
      await act(async () => observers.forEach(observer => observer.callback([], {} as ResizeObserver)))
      expect(title.hasAttribute('data-overflow')).toBe(false)
      expect(title.querySelector('[data-mira-title-copy="duplicate"]')).toBeNull()
    } finally { vi.useRealTimers(); vi.restoreAllMocks() }
    expect(view.state.session).toBeUndefined()
  })

  it('keeps project titles free of hints and restores keyboard focus after closing', async () => {
    const view = await mount({ projects: [{ id: 'p', name: 'Mira', directory: '/tmp/mira', directoryExists: true, createdAt: 1, updatedAt: 1 }] }, { view: 'project' })
    const header = view.container.querySelector<HTMLElement>('[data-collection-header]')!
    const title = header.querySelector<HTMLButtonElement>('.mira-collection-title')!
    await act(async () => title.focus())
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    await act(async () => header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    expect(header.getAttribute('data-menu-open')).toBe('true')
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    const menu = view.container.querySelector<HTMLElement>('[role="menu"]')!
    await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(header.hasAttribute('data-menu-open')).toBe(false)
    await act(async () => title.focus())
    expect(document.activeElement).toBe(title)
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    expect(view.state.session).toBeUndefined()
  })

  it('explains unavailable project actions to keyboard users while keeping history and metadata reachable', async () => {
    const view = await mount({
      sessions: [{ id: 'a', title: '已有项目任务', projectId: 'p', createdAt: 1, updatedAt: 1, status: 'active' }],
      projects: [{ id: 'p', name: 'Mira', directory: '/missing/mira', directoryExists: false, createdAt: 1, updatedAt: 1, sessionCount: 1 }],
    }, { view: 'project', expandedProjectIds: ['p'] })
    const collection = () => view.container.querySelector<HTMLElement>('[data-collection-id="sidebar-project:p"]')!
    const marker = () => collection().querySelector<HTMLElement>('.mira-collection-status--unavailable')!
    const more = () => collection().querySelector<HTMLButtonElement>('[aria-label="Mira 的菜单"]')!
    const openMenu = async () => { await act(async () => more().focus()); await act(async () => more().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))) }
    expect(view.row()).not.toBeNull()
    await act(async () => marker().focus())
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('项目目录不可用')
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('/missing/mira')
    expect(document.activeElement).toBe(marker())
    await openMenu()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    const menu = () => view.container.querySelector<HTMLElement>('[role="menu"]')!
    expect(menu().textContent).toContain('历史任务仍可查看')
    expect([...menu().querySelectorAll('[data-disabled]')].map(element => element.textContent)).toEqual(['新建任务', '打开方式'])
    expect([...menu().querySelectorAll('[role="menuitem"]:not([data-disabled])')].map(element => element.textContent)).toContain('移除项目')
    await act(async () => menu().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    await act(async () => collection().querySelector<HTMLButtonElement>('.mira-collection-title')!.click())
    expect(view.row()).toBeNull(); expect(marker()).not.toBeNull(); expect(view.state.session).toBeUndefined()
    view.state.projects[0].directoryExists = true; await view.render()
    expect(marker()).toBeNull(); await openMenu()
    expect(menu().textContent).not.toContain('项目目录不可用')
    expect(menu().querySelector('[data-disabled]')).toBeNull()
  })

  it('removes a project only after the confirmation dialog and keeps host failures inside it', async () => {
    const view = await mount({
      sessions: [{ id: 'a', title: '项目任务', projectId: 'p', createdAt: 1, updatedAt: 1, status: 'active' }],
      projects: [{ id: 'p', name: 'Mira', directory: '/tmp/mira', directoryExists: true, createdAt: 1, updatedAt: 1, sessionCount: 1 }],
    }, { view: 'project', sort: 'manual', expandedProjectIds: ['p'] })
    const more = view.container.querySelector<HTMLButtonElement>('[aria-label="Mira 的菜单"]')!
    await act(async () => more.focus())
    await act(async () => more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    const remove = [...view.container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent === '移除项目')!
    expect(remove).toBeDefined()
    await act(async () => remove.click())
    expect(view.controller.removeProject).not.toHaveBeenCalled()
    const dialog = () => view.container.querySelector<HTMLElement>('.mira-confirm')!
    expect(dialog().textContent).toContain('移除项目「Mira」？')
    expect(dialog().textContent).toContain('磁盘文件不受影响')
    const confirm = () => dialog().querySelector<HTMLButtonElement>('[aria-label="确认移除项目"]')!
    view.controller.removeProject.mockRejectedValueOnce(new Error('请先停止项目任务并处理待发送消息'))
    await act(async () => confirm().click())
    expect(view.controller.removeProject).toHaveBeenCalledExactlyOnceWith('p')
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe('请先停止项目任务并处理待发送消息')
    await act(async () => confirm().click())
    expect(view.controller.removeProject).toHaveBeenCalledTimes(2)
    expect(dialog()).toBeNull()
  })

  it('shows the archive tooltip above its button without opening a menu or task', async () => {
    const view = await mount({}, { view: 'project' }), more = view.row().querySelector<HTMLButtonElement>('[aria-label="归档 任务 A"]')!
    await act(async () => more.focus())
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('归档任务')
    expect(more.getAttribute('title')).toBeNull()
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(view.state.session).toBeUndefined()
  })

  it('opens the task context menu without an ellipsis button and closes it with Escape', async () => {
    const view = await mount()
    expect(view.row().querySelector('.mira-session-row__more')).toBeNull()
    await act(async () => view.row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    expect(view.row().getAttribute('data-menu-open')).toBe('true')
    const menu = view.container.querySelector<HTMLElement>('[role="menu"]')!
    await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(view.row().hasAttribute('data-menu-open')).toBe(false)
    expect(view.state.session).toBeUndefined()
  })

  it.each(['group', 'project'] as const)('keeps %s collapsed markers live and independent of pagination or selected task', async mode => {
    const sessions = Array.from({ length: 8 }, (_, index) => ({ id: `s${index}`, title: `任务 ${index}`, projectId: 'p', status: 'active' as const, createdAt: index + 1, updatedAt: index + 1, unread: index === 7, planStatus: index === 6 ? 'awaiting_confirmation' as const : undefined }))
    const view = await mount({ sessions, projects: [{ id: 'p', name: 'Mira', directory: '/tmp/mira', directoryExists: true, sessionCount: 8, createdAt: 1, updatedAt: 1 }], runningSessionIds: ['s0', 's6'] }, mode === 'project' ? { view: mode, expandedProjectIds: [], collapsedProjectIds: ['p'] } : { view: mode, groups: [{ id: 'g', name: 'Mira', color: 'blue', sessionIds: sessions.map(item => item.id), collapsed: true }] })
    const collection = () => view.container.querySelector<HTMLElement>(`[data-collection-id="sidebar-${mode === 'project' ? 'project:p' : 'group:g'}"]`)!
    const markers = () => [...collection().querySelectorAll('[role="img"]')].map(element => element.getAttribute('aria-label'))
    expect(markers()).toEqual(['Mira 有未读回复', 'Mira 有 1 个任务执行中', 'Mira 有 1 个任务待确认'])
    expect(collection().querySelector('[data-sidebar-session-id]')).toBeNull()
    const running = collection().querySelector<HTMLElement>('[aria-label="Mira 有 1 个任务执行中"]')!
    await act(async () => running.focus())
    expect(document.activeElement).toBe(running); expect(running.tabIndex).toBe(0)
    view.state.runningSessionIds = []; view.state.sessions = sessions.map(session => ({ ...session, unread: false, planStatus: undefined })); await view.render()
    expect(markers()).toHaveLength(0); expect(collection().getAttribute('data-collection-expanded')).toBe('false')
    view.state.unreadSessionIds = ['s7']; await view.render(); expect(markers()).toEqual(['Mira 有未读回复'])
    await act(async () => collection().querySelector<HTMLButtonElement>('.mira-collection-title')!.click())
    expect(markers()).toHaveLength(0); expect(collection().querySelector('[data-sidebar-session-id]')).not.toBeNull()
    expect(view.state.unreadSessionIds).toEqual(['s7'])
    await act(async () => collection().querySelector<HTMLButtonElement>('.mira-collection-title')!.click())
    expect(markers()).toEqual(['Mira 有未读回复'])
  })

  it('keeps the typed title after a failed save and closes only after a successful retry', async () => {
    const view = await mount(); await view.rename(); await view.change('新的任务名称')
    view.state.error = '名称保存失败'; await view.submit()
    expect(view.input()?.value).toBe('新的任务名称')
    expect(view.row().querySelector('[role="alert"]')?.textContent).toContain('名称保存失败')
    view.controller.renameSession.mockResolvedValueOnce(true); await view.submit()
    expect(view.controller.renameSession).toHaveBeenNthCalledWith(1, 'a', '新的任务名称')
    expect(view.controller.renameSession).toHaveBeenNthCalledWith(2, 'a', '新的任务名称')
    expect(view.input()).toBeNull()
  })

  it('yields Enter and Escape to composition and submits only the later ordinary Enter', async () => {
    const view = await mount(); await view.rename(); await view.change('中文任务')
    await act(async () => view.input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    expect((await view.key('Enter')).defaultPrevented).toBe(true)
    await view.submit(); await view.key('Escape')
    expect(view.input()?.value).toBe('中文任务'); expect(view.controller.renameSession).not.toHaveBeenCalled()
    await act(async () => view.input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    await view.key('Enter', { isComposing: true })
    const legacy = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }); Object.defineProperty(legacy, 'keyCode', { value: 229 })
    await act(async () => view.input().dispatchEvent(legacy))
    expect(view.controller.renameSession).not.toHaveBeenCalled()
    view.controller.renameSession.mockResolvedValueOnce(true); await view.key('Enter')
    expect(view.controller.renameSession).toHaveBeenCalledExactlyOnceWith('a', '中文任务')
    expect(view.input()).toBeNull()
  })

  it('allows one save while pending and retains the title when the request rejects', async () => {
    const view = await mount(); await view.rename(); await view.change('保留待保存标题')
    const pending = deferred<boolean>(); view.controller.renameSession.mockReturnValueOnce(pending.promise)
    await view.submit(); await view.submit(); await view.key('Escape')
    expect(view.controller.renameSession).toHaveBeenCalledExactlyOnceWith('a', '保留待保存标题')
    expect(view.input().disabled).toBe(true)
    expect(view.row().querySelector<HTMLButtonElement>('[aria-label="保存标题"]')!.disabled).toBe(true)
    await act(async () => pending.resolve(false))
    expect(view.input().value).toBe('保留待保存标题'); expect(view.input().disabled).toBe(false)
    view.controller.renameSession.mockRejectedValueOnce(new Error('宿主暂时不可用')); await view.submit()
    expect(view.row().querySelector('[role="alert"]')?.textContent).toContain('宿主暂时不可用')
    expect(view.input().value).toBe('保留待保存标题')
    view.controller.renameSession.mockResolvedValueOnce(true); await view.submit()
    expect(view.input()).toBeNull()
  })

  it('does not let an older save close or overwrite a later editor, including reopening the same task', async () => {
    const view = await mount(); await view.rename(); await view.change('旧请求标题')
    const pending = deferred<boolean>(); view.controller.renameSession.mockReturnValueOnce(pending.promise); await view.submit()
    await view.rename('b'); await view.change('B 的未保存名称', 'b')
    expect(view.input()).toBeNull(); expect(view.input('b').value).toBe('B 的未保存名称')
    await view.rename(); await view.change('A 的新编辑名称')
    await act(async () => pending.resolve(true))
    expect(view.input().value).toBe('A 的新编辑名称'); expect(view.input().disabled).toBe(false)
    expect(view.row().querySelector('[role="alert"]')).toBeNull()
    view.controller.renameSession.mockResolvedValueOnce(true); await view.submit()
    expect(view.controller.renameSession).toHaveBeenNthCalledWith(2, 'a', 'A 的新编辑名称')
    expect(view.input()).toBeNull()
  })

  it('cancels only the current idle editor and permits a later rename without sending the cancelled title', async () => {
    const view = await mount(); await view.rename(); await view.change('取消的草稿'); await view.key('Escape')
    expect(view.input()).toBeNull(); expect(view.controller.renameSession).not.toHaveBeenCalled()
    await view.rename(); expect(view.input().value).toBe('任务 A')
    await view.change('重新命名'); view.controller.renameSession.mockResolvedValueOnce(true); await view.submit()
    expect(view.controller.renameSession).toHaveBeenCalledExactlyOnceWith('a', '重新命名')
  })
})
