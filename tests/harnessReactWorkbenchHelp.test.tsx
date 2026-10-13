// @vitest-environment happy-dom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraWorkbenchHelp } from '../apps/harness-react/src/components/workbench/MiraWorkbenchHelp'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import { resolveHarnessNavigationPath } from '../src/platform/firstPartyNavigation'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await React.act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function mount(save = async () => undefined, navigate = vi.fn(async (_path: string) => undefined)) {
  const controller = new PilotController({ navigate } as unknown as PilotHost)
  controller.registerBeforeNavigation(save)
  await React.act(async () => root.render(<><div contentEditable suppressContentEditableWarning role="textbox">尚未发送的草稿</div><MiraWorkbenchHelp onNavigate={path => controller.navigate(path, true)} /></>))
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="帮助"]')!
  await React.act(async () => trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })))
  const select = async (label: string) => {
    const item = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(value => value.textContent === label)!
    await React.act(async () => item.click())
  }
  return { controller, navigate, select, trigger }
}

describe('workbench help navigation', () => {
  it.each([
    ['键盘快捷键', '/settings/keyboard-shortcuts'],
    ['设置', '/settings/general'],
    ['问题反馈与关于', '/settings/about'],
  ])('opens the existing %s page only after the workbench has saved', async (label, path) => {
    const order: string[] = []
    const navigate = vi.fn(async (destination: string) => { order.push('navigate'); expect(resolveHarnessNavigationPath(destination)).toContain('from=%2Fworkspace%2Fharness-react') })
    const view = await mount(async () => { order.push('save') }, navigate)
    await view.select(label)
    expect(order).toEqual(['save', 'navigate']); expect(navigate).toHaveBeenCalledExactlyOnceWith(path)
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  it('keeps the menu and input available after a save failure and retries the same page', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('write failed')).mockResolvedValueOnce(undefined)
    const view = await mount(save)
    await view.select('键盘快捷键')
    expect(view.navigate).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('当前输入已保留')
    expect(container.querySelector('[role="menu"]')).not.toBeNull()
    expect(container.querySelector('[role="textbox"]')?.textContent).toBe('尚未发送的草稿')
    await view.select('键盘快捷键')
    expect(save).toHaveBeenCalledTimes(2); expect(view.navigate).toHaveBeenCalledExactlyOnceWith('/settings/keyboard-shortcuts')
  })

  it('blocks a second page selection while a save is pending, and reports navigation rejection', async () => {
    let finish!: () => void
    const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const navigate = vi.fn(async (_path: string) => { throw new Error('route rejected') })
    const view = await mount(save, navigate)
    await view.select('设置'); await view.select('问题反馈与关于')
    expect(save).toHaveBeenCalledOnce(); expect(navigate).not.toHaveBeenCalled()
    expect([...container.querySelectorAll('[role="menuitem"]')].every(value => value.getAttribute('aria-disabled') === 'true')).toBe(true)
    await React.act(async () => finish())
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/settings/general')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('请重试')
    expect(container.querySelector('[role="menu"]')).not.toBeNull()
  })
})
