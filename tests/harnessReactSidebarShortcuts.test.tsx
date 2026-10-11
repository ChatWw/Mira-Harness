// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionSidebar, useHarnessSessionShortcuts } from '../apps/harness-react/src/components/session/SessionSidebar'
import { SidebarPreferenceStore } from '../apps/harness-react/src/components/session/sidebar-preferences'
import type { PilotController, PilotState } from '../apps/harness-react/src/state/pilot-state'
import { MiraPromptEditor } from '../apps/harness-react/src/components/composer/MiraPromptEditor'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })

async function mount(withComposer = false) {
  const actions = { newTask: vi.fn(), search: vi.fn(), sidebar: vi.fn() }
  const composerKeydown = vi.fn(), composerChanged = vi.fn()
  let current = actions
  function App() {
    const activeActions = current
    const [sidebarOpen, setSidebarOpen] = useState(true), [searchOpen, setSearchOpen] = useState(false)
    const openSearch = () => { activeActions.search(); setSearchOpen(true) }
    const toggleSidebar = () => { activeActions.sidebar(); setSidebarOpen(value => !value) }
    useHarnessSessionShortcuts(() => activeActions.newTask(), openSearch, toggleSidebar)
    return <main>
      {sidebarOpen && <aside aria-label="会话侧栏">任务列表</aside>}
      <button aria-label="切换侧栏" onClick={toggleSidebar}>侧栏</button>
      <button aria-label="侧栏搜索" onClick={openSearch}>搜索</button>
      <input aria-label="输入框" /><textarea aria-label="多行输入" /><select aria-label="选择框"><option>选项</option></select>
      <div contentEditable suppressContentEditableWarning aria-label="编辑器"><span>嵌套文本</span></div>
      <div role="textbox" aria-label="文本控件"><span>嵌套控件</span></div>
      <div className="xterm" aria-label="终端"><span>终端文本</span></div>
      {withComposer && <MiraPromptEditor text="保留的任务内容" aria-label="实际 Composer" onChange={composerChanged} onKeyDown={composerKeydown} />}
      {searchOpen && <div role="dialog" aria-modal="true" aria-label="全局搜索"><button aria-label="关闭搜索" onClick={() => setSearchOpen(false)}>关闭</button></div>}
    </main>
  }
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const render = async () => { await act(async () => root!.render(<React.StrictMode><App /></React.StrictMode>)) }
  await render()
  const element = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!
  const key = async (value: string, options: KeyboardEventInit = {}, target: EventTarget = document.body, legacyIme = false) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: value, ...options })
    if (legacyIme) Object.defineProperty(event, 'keyCode', { value: 229 })
    await act(async () => target.dispatchEvent(event)); return event
  }
  const closeSearch = async () => { await act(async () => element('关闭搜索').click()) }
  return { actions, composerKeydown, composerChanged, container, element, key, closeSearch, replace: async () => { current = { newTask: vi.fn(), search: vi.fn(), sidebar: vi.fn() }; await render(); return current } }
}

describe('workbench-owned shortcuts through real React keyboard events', () => {
  it('shows the search alias on focus while keeping only K in the sidebar button', async () => {
    const state: PilotState = { sessions: [], projects: [], messages: [], providers: [], running: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {} }
    const controller = { getSnapshot: () => state } as PilotController
    const preferences = new SidebarPreferenceStore(async () => ({}), async () => undefined); await preferences.load()
    const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
    await act(async () => root!.render(<SessionSidebar state={state} controller={controller} width={264} onClose={() => undefined} onSearch={() => undefined} preferenceStore={preferences} />))
    const search = container.querySelector<HTMLElement>('[aria-label="搜索会话"]')!
    expect(search.getAttribute('aria-keyshortcuts')).toBe('Meta+K Control+K Meta+Shift+P Control+Shift+P')
    expect(search.querySelector('kbd')!.textContent).toMatch(/K$/); expect(search.textContent).not.toContain('Shift')
    await act(async () => search.focus())
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('Shift P')
  })

  it.each(['metaKey', 'ctrlKey'] as const)('toggles the sidebar with %s+B while it is open and closed', async modifier => {
    const view = await mount()
    expect((await view.key('b', { [modifier]: true })).defaultPrevented).toBe(true)
    expect(view.element('会话侧栏')).toBeNull()
    expect((await view.key('B', { [modifier]: true })).defaultPrevented).toBe(true)
    expect(view.element('会话侧栏')).not.toBeNull(); expect(view.actions.sidebar).toHaveBeenCalledTimes(2)
    await view.key('b', { [modifier]: true }); await view.key('n', { [modifier]: true })
    expect(view.actions.newTask).toHaveBeenCalledOnce()
  })

  it('handles B once before the actual PlainText Composer consumes it, while keeping its text', async () => {
    const view = await mount(true), composer = view.element('实际 Composer')
    for (const modifier of ['metaKey', 'ctrlKey'] as const) {
      expect((await view.key('b', { [modifier]: true }, composer)).defaultPrevented).toBe(true)
      expect(view.actions.sidebar).toHaveBeenCalledTimes(modifier === 'metaKey' ? 1 : 2)
    }
    expect(view.composerKeydown).not.toHaveBeenCalled(); expect(view.composerChanged).not.toHaveBeenCalled()
    expect(composer.textContent).toBe('保留的任务内容')
    expect(view.element('会话侧栏')).not.toBeNull()
  })

  it('retains repeat, IME and already-consumed guards in Composer capture', async () => {
    const view = await mount(true), composer = view.element('实际 Composer')
    for (const options of [{ repeat: true }, { isComposing: true }]) await view.key('b', { metaKey: true, ...options }, composer)
    await view.key('b', { ctrlKey: true }, composer, true)
    const consumed = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'b', ctrlKey: true }); consumed.preventDefault()
    await act(async () => composer.dispatchEvent(consumed))
    expect(view.actions.sidebar).not.toHaveBeenCalled(); expect(view.element('会话侧栏')).not.toBeNull()
  })

  it.each(['metaKey', 'ctrlKey'] as const)('routes K, Shift+P and the button to the same search with %s', async modifier => {
    const view = await mount(); await view.key('b', { [modifier]: true })
    for (const shortcut of [{ key: 'k' }, { key: 'P', shiftKey: true }]) {
      expect((await view.key(shortcut.key, { [modifier]: true, shiftKey: shortcut.shiftKey })).defaultPrevented).toBe(true)
      expect(view.container.querySelectorAll('[aria-label="全局搜索"]')).toHaveLength(1)
      await view.closeSearch()
    }
    await act(async () => view.element('侧栏搜索').click())
    expect(view.container.querySelectorAll('[aria-label="全局搜索"]')).toHaveLength(1)
    expect(view.actions.search).toHaveBeenCalledTimes(3); expect(view.element('会话侧栏')).toBeNull()
  })

  it.each(['输入框', '多行输入', '选择框', '编辑器', '文本控件', '终端'])('leaves B to %s, including nested editable content', async label => {
    const view = await mount(), target = view.element(label).querySelector('span') ?? view.element(label)
    expect((await view.key('b', { metaKey: true }, target)).defaultPrevented).toBe(false)
    expect(view.actions.sidebar).not.toHaveBeenCalled(); expect(view.element('会话侧栏')).not.toBeNull()
  })

  it('preserves editing B when the active editor receives a window-level event', async () => {
    const view = await mount(); view.element('输入框').focus()
    expect((await view.key('b', { ctrlKey: true }, window)).defaultPrevented).toBe(false)
    expect(view.actions.sidebar).not.toHaveBeenCalled()
  })

  it('keeps new task and both search bindings available from the composer', async () => {
    const view = await mount(), input = view.element('输入框')
    await view.key('n', { metaKey: true }, input); expect(view.actions.newTask).toHaveBeenCalledOnce()
    await view.key('k', { metaKey: true }, input); await view.closeSearch()
    await view.key('p', { ctrlKey: true, shiftKey: true }, input)
    expect(view.actions.search).toHaveBeenCalledTimes(2)
  })

  it('ignores repeats, composing events, legacy IME and previously consumed events', async () => {
    const view = await mount()
    for (const shortcut of [{ key: 'n' }, { key: 'k' }, { key: 'b' }, { key: 'p', shiftKey: true }]) {
      const options = { metaKey: true, shiftKey: shortcut.shiftKey }
      for (const guard of [{ repeat: true }, { isComposing: true }]) expect((await view.key(shortcut.key, { ...options, ...guard })).defaultPrevented).toBe(false)
      expect((await view.key(shortcut.key, options, document.body, true)).defaultPrevented).toBe(false)
      const consume = (event: Event) => event.preventDefault()
      view.container.addEventListener('keydown', consume, { once: true })
      expect((await view.key(shortcut.key, options, view.element('切换侧栏'))).defaultPrevented).toBe(true)
    }
    Object.values(view.actions).forEach(action => expect(action).not.toHaveBeenCalled())
  })

  it.each(['modal', 'menu', 'dialog'] as const)('keeps workspace commands outside an open %s', async kind => {
    const view = await mount(), overlay = document.createElement(kind === 'dialog' ? 'dialog' : 'div')
    if (kind === 'modal') { overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true') }
    else if (kind === 'menu') { overlay.setAttribute('role', 'menu'); overlay.setAttribute('data-state', 'open') }
    else overlay.setAttribute('open', '')
    document.body.append(overlay)
    for (const shortcut of [{ key: 'n' }, { key: 'k' }, { key: 'b' }, { key: 'p', shiftKey: true }]) expect((await view.key(shortcut.key, { ctrlKey: true, shiftKey: shortcut.shiftKey })).defaultPrevented).toBe(false)
    Object.values(view.actions).forEach(action => expect(action).not.toHaveBeenCalled())
    overlay.remove(); await view.key('b', { ctrlKey: true }); expect(view.actions.sidebar).toHaveBeenCalledOnce()
  })

  it('leaves nonmodal Popover input shortcuts local, without suppressing task-find or unrelated inputs', async () => {
    const view = await mount(), popover = document.createElement('div'), search = document.createElement('input')
    popover.setAttribute('role', 'dialog'); popover.append(search); view.container.append(popover)
    for (const modifier of ['metaKey', 'ctrlKey']) for (const shortcut of [{ key: 'n' }, { key: 'k' }, { key: 'b' }, { key: 'p', shiftKey: true }]) {
      expect((await view.key(shortcut.key, { [modifier]: true, shiftKey: shortcut.shiftKey }, search)).defaultPrevented).toBe(false)
    }
    Object.values(view.actions).forEach(action => expect(action).not.toHaveBeenCalled())
    search.focus(); await view.key('n', { metaKey: true }, window); expect(view.actions.newTask).not.toHaveBeenCalled()
    popover.className = 'mira-conversation-find'; popover.setAttribute('aria-modal', 'false')
    await view.key('k', { metaKey: true }, search); expect(view.actions.search).toHaveBeenCalledOnce()
  })

  it('ignores unrelated key combinations and uses current callbacks once after a rerender', async () => {
    const view = await mount()
    for (const shortcut of [{ key: 'b' }, { key: 'b', metaKey: true, altKey: true }, { key: 'b', ctrlKey: true, shiftKey: true }, { key: 'n', metaKey: true, shiftKey: true }, { key: 'k', metaKey: true, shiftKey: true }, { key: 'p', ctrlKey: true }]) expect((await view.key(shortcut.key, shortcut)).defaultPrevented).toBe(false)
    const current = await view.replace(); await view.key('b', { ctrlKey: true }); await view.key('n', { ctrlKey: true })
    expect(current.sidebar).toHaveBeenCalledOnce(); expect(current.newTask).toHaveBeenCalledOnce()
    Object.values(view.actions).forEach(action => expect(action).not.toHaveBeenCalled())
    await act(async () => root!.unmount()); root = undefined
    expect((await view.key('b', { ctrlKey: true })).defaultPrevented).toBe(false)
    expect(current.sidebar).toHaveBeenCalledOnce()
  })
})
