// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMiraWorkbenchShortcuts } from '../apps/harness-react/src/hooks/useMiraWorkbenchShortcuts'
import { MiraPromptEditor } from '../apps/harness-react/src/components/composer/MiraPromptEditor'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.spyOn(navigator, 'platform', 'get').mockReturnValue('') })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function mount() {
  let action = vi.fn((_command: 'theme' | 'project') => true)
  const first = action, changed = vi.fn(), editorKey = vi.fn()
  function App() { useMiraWorkbenchShortcuts(action); return <main><MiraPromptEditor text="保留项目草稿" aria-label="任务输入" onChange={changed} onKeyDown={editorKey} /><input /><div className="xterm"><span>终端</span></div></main> }
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const render = async () => { await act(async () => root!.render(<React.StrictMode><App /></React.StrictMode>)) }; await render()
  const key = async (options: KeyboardEventInit = {}, target: EventTarget = container.querySelector('[aria-label="任务输入"]')!) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'l', metaKey: true, shiftKey: true, ...options })
    await act(async () => target.dispatchEvent(event)); return event
  }
  return { first, changed, editorKey, container, key, replace: async () => { action = vi.fn(() => false); await render(); return action } }
}
describe('workbench Shell command shortcuts', () => {
  it.each(['MacIntel', 'Win32'])('keeps theme and project shortcuts platform-specific on %s', async platform => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
    const view = await mount()
    const primary = platform === 'MacIntel' ? 'metaKey' : 'ctrlKey', other = primary === 'metaKey' ? 'ctrlKey' : 'metaKey'
    for (const shortcut of [{ key: 'l', shiftKey: true }, { key: 'o', shiftKey: false }]) {
      await view.key({ ...shortcut, metaKey: false, ctrlKey: false, [other]: true })
      await view.key({ ...shortcut, metaKey: true, ctrlKey: true })
    }
    expect(view.first).not.toHaveBeenCalled()
    await view.key({ metaKey: false, ctrlKey: false, [primary]: true })
    await view.key({ key: 'o', shiftKey: false, metaKey: false, ctrlKey: false, [primary]: true })
    expect(view.first.mock.calls).toEqual([['theme'], ['project']]); expect(view.changed).not.toHaveBeenCalled()
  })

  it.each(['metaKey', 'ctrlKey'] as const)('dispatches %s theme/project keys before Lexical without changing its draft', async modifier => {
    const view = await mount()
    expect((await view.key({ metaKey: false, [modifier]: true })).defaultPrevented).toBe(true)
    expect((await view.key({ key: 'O', shiftKey: false, metaKey: false, [modifier]: true })).defaultPrevented).toBe(true)
    expect(view.first.mock.calls).toEqual([['theme'], ['project']])
    expect(view.editorKey).not.toHaveBeenCalled(); expect(view.changed).not.toHaveBeenCalled()
    expect(view.container.querySelector('[aria-label="任务输入"]')!.textContent).toBe('保留项目草稿')
  })
  it('protects editors, terminal, repeated/IME and unrelated bindings', async () => {
    const view = await mount()
    for (const target of view.container.querySelectorAll('input, .xterm span')) expect((await view.key({}, target)).defaultPrevented).toBe(false)
    for (const options of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { altKey: true }, { metaKey: false }, { shiftKey: false }, { key: 'o' }, { key: 'm' }]) expect((await view.key(options)).defaultPrevented).toBe(false)
    expect(view.first).not.toHaveBeenCalled()
  })
  it.each(['modal', 'menu', 'popover'] as const)('preserves the %s owner', async kind => {
    const view = await mount(), overlay = document.createElement('div'), button = document.createElement('button')
    overlay.setAttribute('role', kind === 'menu' ? 'menu' : 'dialog')
    if (kind === 'modal') overlay.setAttribute('aria-modal', 'true')
    if (kind === 'menu') overlay.setAttribute('data-state', 'open')
    overlay.append(button); document.body.append(overlay)
    expect((await view.key({}, kind === 'popover' ? button : document.body)).defaultPrevented).toBe(false)
    expect(view.first).not.toHaveBeenCalled()
  })
  it('uses the current availability and removes its listener on unmount', async () => {
    const view = await mount(), action = await view.replace()
    expect((await view.key({}, document.body)).defaultPrevented).toBe(false)
    expect(action).toHaveBeenCalledOnce(); expect(view.first).not.toHaveBeenCalled()
    await act(async () => root!.unmount()); root = undefined
    await view.key({}, document.body); expect(action).toHaveBeenCalledOnce()
  })
})
