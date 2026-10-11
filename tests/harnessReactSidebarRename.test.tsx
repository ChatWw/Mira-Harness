// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionSidebar } from '../apps/harness-react/src/components/session/SessionSidebar'
import { SidebarPreferenceStore } from '../apps/harness-react/src/components/session/sidebar-preferences'
import type { PilotController, PilotState } from '../apps/harness-react/src/state/pilot-state'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

async function mount(statePatch: Partial<PilotState> = {}, preferences: Record<string, unknown> = { view: 'group', sort: 'manual' }, taskPaneEntry?: { open(id: string): Promise<unknown>; canOpen(id: string): boolean }) {
  const state = { sessions: ['a', 'b'].map(id => ({ id, title: `任务 ${id.toUpperCase()}`, createdAt: 1, updatedAt: 1, status: 'active' })), projects: [], messages: [], providers: [], running: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {}, error: undefined } as PilotState
  const controller = { getSnapshot: () => state, renameSession: vi.fn<PilotController['renameSession']>(async () => false), setSessionPinned: vi.fn<PilotController['setSessionPinned']>(async () => undefined), open: vi.fn(), reportError: vi.fn() }
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
    expect(view.row().querySelector('.mira-session-row__grip')).not.toBeNull()
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

  it('suspends project hints while the context menu is open and restores keyboard focus after closing', async () => {
    const view = await mount({ projects: [{ id: 'p', name: 'Mira', directory: '/tmp/mira', directoryExists: true, createdAt: 1, updatedAt: 1 }] }, { view: 'project' })
    const header = view.container.querySelector<HTMLElement>('[data-collection-header]')!
    const title = header.querySelector<HTMLButtonElement>('.mira-collection-title')!
    await act(async () => title.focus())
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('/tmp/mira')
    await act(async () => header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    expect(header.getAttribute('data-menu-open')).toBe('true')
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    const menu = view.container.querySelector<HTMLElement>('[role="menu"]')!
    await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(header.hasAttribute('data-menu-open')).toBe(false)
    await act(async () => title.focus())
    expect(document.activeElement).toBe(title)
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('/tmp/mira')
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
    expect([...menu().querySelectorAll('[data-disabled]')].map(element => element.textContent)).toEqual(['新建任务', '在文件管理器中打开', '在终端中打开'])
    expect([...menu().querySelectorAll('[role="menuitem"]:not([data-disabled])')].map(element => element.textContent)).toContain('从侧栏隐藏')
    await act(async () => menu().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    await act(async () => collection().querySelector<HTMLButtonElement>('.mira-collection-title')!.click())
    expect(view.row()).toBeNull(); expect(marker()).not.toBeNull(); expect(view.state.session).toBeUndefined()
    view.state.projects[0].directoryExists = true; await view.render()
    expect(marker()).toBeNull(); await openMenu()
    expect(menu().textContent).not.toContain('项目目录不可用')
    expect(menu().querySelector('[data-disabled]')).toBeNull()
  })

  it('shows the task action tooltip to keyboard users without opening its menu or task', async () => {
    const view = await mount(), more = view.row().querySelector<HTMLButtonElement>('.mira-session-row__more')!
    await act(async () => more.focus())
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('任务操作')
    expect(more.getAttribute('title')).toBeNull()
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(view.state.session).toBeUndefined()
  })

  it('retains the task menu anchor independently of Tooltip data-state and closes it with Escape', async () => {
    const view = await mount(), more = view.row().querySelector<HTMLButtonElement>('.mira-session-row__more')!
    await act(async () => more.focus())
    await act(async () => more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    expect(view.row().getAttribute('data-menu-open')).toBe('true')
    const menu = view.container.querySelector<HTMLElement>('[role="menu"]')!
    expect(menu).not.toBeNull()
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
