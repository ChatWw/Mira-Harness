// @vitest-environment happy-dom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessWorkspaceContext } from '../apps/harness-react/src/components/workbench/HarnessWorkspaceContext'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await React.act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function mount() {
  const controller = { listGitBranches: vi.fn(async () => [{ name: 'main', current: true, uncommittedFileCount: 2 }]), openSessionProject: vi.fn(async () => undefined) }
  const onAction = vi.fn((action: () => Promise<unknown>) => { void action() })
  await React.act(async () => root.render(<HarnessWorkspaceContext controller={controller as unknown as PilotController} project={{ id: 'p', name: 'Mira 项目', icon: '', directory: '/project/mira', directoryExists: true, isGitRepository: true, gitBranch: 'main', createdAt: 1, updatedAt: 1, sessionCount: 1 }} sessionId="task" directory="/project/mira" onAction={onAction} />))
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="工作目录信息"]')!
  const pointer = async (type: string, element: HTMLElement = trigger) => { await React.act(async () => element.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerType: 'mouse' }))) }
  const hover = async () => { await pointer('pointermove'); await React.act(async () => new Promise(resolve => setTimeout(resolve, 350))) }
  const click = async () => { await pointer('pointerdown'); await pointer('pointerup'); await React.act(async () => trigger.click()) }
  const key = async (value: string) => { await React.act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value }))) }
  const settle = async () => { await React.act(async () => new Promise(resolve => setTimeout(resolve, 30))) }
  return { controller, onAction, trigger, pointer, hover, click, key, settle, tooltip: () => container.querySelector('[role="tooltip"]'), menu: () => container.querySelector<HTMLElement>('[role="menu"]') }
}

describe('header working directory pointer and keyboard interaction', () => {
  it('shows only a short hover hint without querying Git, then opens the complete menu on click', async () => {
    const view = await mount()
    await view.hover()
    expect(view.tooltip()?.textContent).toBe('工作目录')
    expect(view.menu()).toBeNull(); expect(view.controller.listGitBranches).not.toHaveBeenCalled()
    await view.click()
    expect(view.tooltip()).toBeNull()
    expect(container.querySelector('.mira-sidebar-tooltip')).toBeNull()
    expect(view.menu()?.textContent).toContain('Mira 项目')
    expect(view.menu()?.textContent).toContain('/project/mira')
    expect(view.menu()?.textContent).toContain('main')
    expect(view.menu()?.textContent).toContain('2 个未提交文件')
    expect(view.menu()?.textContent).toContain('复制工作目录')
    expect(view.menu()?.textContent).toContain('在文件管理器中打开')
    expect(view.controller.listGitBranches).toHaveBeenCalledExactlyOnceWith('p')
    await view.hover()
    expect(view.tooltip()).toBeNull()
  })

  it('restores focus after Escape without reopening the hint, and allows a fresh hover', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const view = await mount()
    await view.hover(); await view.click(); await view.key('Escape'); await view.settle()
    expect(view.menu()).toBeNull(); expect(document.activeElement).toBe(view.trigger)
    await React.act(async () => new Promise(resolve => setTimeout(resolve, 350)))
    expect(view.tooltip()).toBeNull()
    await view.pointer('pointerout'); await view.hover()
    expect(view.tooltip()?.textContent).toBe('工作目录')
    expect(warning.mock.calls.flat().join(' ')).not.toMatch(/controlled.*uncontrolled|uncontrolled.*controlled/)
  })

  it.each(['Enter', ' ', 'ArrowDown'])('opens using %s and executes the existing directory action without a returning hint', async value => {
    const view = await mount()
    await React.act(async () => view.trigger.focus())
    expect(view.tooltip()).toBeNull()
    await view.key(value)
    expect(view.menu()).not.toBeNull(); expect(view.tooltip()).toBeNull()
    const item = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent === '在文件管理器中打开')!
    await React.act(async () => item.click()); await view.settle()
    expect(view.controller.openSessionProject).toHaveBeenCalledExactlyOnceWith('task')
    expect(view.onAction).toHaveBeenCalledOnce(); expect(view.menu()).toBeNull()
    expect(document.activeElement).toBe(view.trigger); expect(view.tooltip()).toBeNull()
  })

  it('copies the working directory and closes without reopening the hint', async () => {
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const view = await mount(); await view.click()
    const item = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent === '复制工作目录')!
    await React.act(async () => item.click()); await view.settle()
    expect(copy).toHaveBeenCalledExactlyOnceWith('/project/mira')
    expect(view.menu()).toBeNull(); expect(view.tooltip()).toBeNull()
  })

  it('dismisses the menu on an outside click without a returning hint', async () => {
    const view = await mount(); await view.hover(); await view.click(); await view.settle()
    await view.pointer('pointerdown', document.body); await view.settle()
    expect(view.menu()).toBeNull(); expect(view.tooltip()).toBeNull()
  })
})
