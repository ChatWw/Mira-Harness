// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraModelMenu, type MiraModelOption } from '../apps/harness-react/src/components/composer/MiraModelMenu'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const models: MiraModelOption[] = [
  { providerId: 'a', providerName: '供应商 A', modelId: 'b:c', reasoning: true, multimodal: true },
  { providerId: 'a:b', providerName: '供应商 B', modelId: 'c', reasoning: false },
  { providerId: 'a:b', providerName: '供应商 B', modelId: 'mira-text', reasoning: false },
]
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) }) }
async function key(element: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  await act(async () => element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))); await settle()
}
async function fixture(options = models) {
  const selected = vi.fn(), manage = vi.fn(), focus = vi.fn(() => container.querySelector<HTMLElement>('[aria-label="旁路任务内容"]')?.focus())
  function View() {
    const [open, setOpen] = useState(false), [selection, setSelection] = useState(options[0])
    return <><div contentEditable suppressContentEditableWarning role="textbox" aria-label="任务内容">主草稿</div><div contentEditable suppressContentEditableWarning role="textbox" aria-label="旁路任务内容">旁草稿</div><DropdownMenu.Root modal={false} open={open} onOpenChange={setOpen}><DropdownMenu.Trigger aria-label="模型">模型</DropdownMenu.Trigger><MiraModelMenu open={open} ownerKey="side" models={options} selected={selection} disabled={false} onSelect={model => { selected(model); setSelection(model) }} onManage={manage} onReturnFocus={focus} /></DropdownMenu.Root><button aria-label="外部操作">外部</button></>
  }
  await act(async () => root.render(<View />))
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="模型"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false, pointerType: 'mouse' }))); await settle()
  const input = document.querySelector<HTMLInputElement>('[aria-label="搜索模型"]')!
  const search = async (text: string) => {
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })) }); await settle()
  }
  return { input, search, selected, manage, focus }
}

describe('Mira provider model menu', () => {
  it('returns from a provider submenu to the model menu on Escape before closing the model menu', async () => {
    const view = await fixture()
    await key(view.input, 'ArrowDown')
    const provider = document.activeElement as HTMLElement
    await key(provider, 'ArrowRight')
    expect(document.activeElement?.getAttribute('role')).toBe('menuitemradio')
    await key(document.activeElement as HTMLElement, 'Escape')
    expect(document.querySelector('.mira-model-menu__submenu')).toBeNull()
    expect(document.querySelector('.harness-composer__model-menu')).not.toBeNull()
    expect(document.activeElement).toBe(provider)
    expect(view.focus).not.toHaveBeenCalled()
    await key(provider, 'Escape')
    expect(document.querySelector('.harness-composer__model-menu')).toBeNull()
    expect(view.focus).toHaveBeenCalledOnce()
  })

  it('opens searchable provider groups and selects the exact model through keyboard submenus', async () => {
    const view = await fixture()
    expect(document.activeElement).toBe(view.input)
    expect(document.querySelectorAll('.mira-model-menu__provider')).toHaveLength(2)
    expect(document.querySelector('[aria-label="当前供应商"]')).not.toBeNull()
    await key(view.input, 'ArrowDown')
    expect(document.activeElement?.textContent).toContain('供应商 A')
    await key(document.activeElement as HTMLElement, 'ArrowDown')
    await key(document.activeElement as HTMLElement, 'ArrowRight')
    expect(document.activeElement?.getAttribute('role')).toBe('menuitemradio')
    await key(document.activeElement as HTMLElement, 'Enter')
    expect(view.selected).toHaveBeenCalledExactlyOnceWith(models[1])
    expect(document.activeElement?.getAttribute('aria-label')).toBe('旁路任务内容')
    expect(container.querySelector('[aria-label="任务内容"]')?.textContent).toBe('主草稿')
  })
  it('searches across providers with capabilities and keeps colon-containing identities separate', async () => {
    const view = await fixture(); await view.search('c')
    expect(document.querySelectorAll('[role="menuitemradio"]')).toHaveLength(2)
    expect(document.querySelector('[aria-label="支持图片输入"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="支持推理"]')).not.toBeNull()
    await key(view.input, 'ArrowDown'); await key(document.activeElement as HTMLElement, 'ArrowDown'); await key(document.activeElement as HTMLElement, 'Enter')
    expect(view.selected).toHaveBeenCalledExactlyOnceWith(models[1])
  })
  it.each([{ isComposing: true }, { keyCode: 229 }])('does not navigate or dismiss while IME owns the search (%j)', async composing => {
    const view = await fixture(); await key(view.input, 'ArrowDown', composing); await key(view.input, 'Enter', composing); await key(view.input, 'Escape', composing)
    expect(document.activeElement).toBe(view.input); expect(view.selected).not.toHaveBeenCalled()
    expect(document.querySelector('.harness-composer__model-menu')).not.toBeNull()
    await key(view.input, 'Escape')
    expect(document.querySelector('.harness-composer__model-menu')).toBeNull()
    expect(view.focus).toHaveBeenCalledOnce()
  })
  it('preserves external focus on outside dismissal', async () => {
    const view = await fixture()
    const outside = container.querySelector<HTMLElement>('[aria-label="外部操作"]')!
    await act(async () => { outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); outside.focus() }); await settle()
    expect(document.querySelector('.harness-composer__model-menu')).toBeNull()
    expect(document.activeElement).toBe(outside); expect(view.focus).not.toHaveBeenCalled()
  })
  it.each([{ isComposing: true }, { keyCode: 229 }])('does not select a focused result when Enter belongs to an input method (%j)', async composing => {
    const view = await fixture(); await view.search('mira-text'); await key(view.input, 'ArrowDown')
    await key(document.activeElement as HTMLElement, 'Enter', composing)
    expect(view.selected).not.toHaveBeenCalled()
    expect(document.querySelector('.harness-composer__model-menu')).not.toBeNull()
  })
  it.each([{ isComposing: true }, { keyCode: 229 }])('protects selection and Escape inside a provider submenu (%j)', async composing => {
    const view = await fixture(); await key(view.input, 'ArrowDown'); await key(document.activeElement as HTMLElement, 'ArrowRight')
    const row = document.activeElement as HTMLElement
    expect(row.getAttribute('role')).toBe('menuitemradio')
    await key(row, 'Enter', composing); await key(row, 'Escape', composing)
    expect(view.selected).not.toHaveBeenCalled()
    expect(document.querySelector('.mira-model-menu__submenu')).not.toBeNull()
    await key(row, 'ArrowLeft')
    expect(document.querySelector('.mira-model-menu__submenu')).toBeNull()
    expect(document.querySelector('.harness-composer__model-menu')).not.toBeNull()
    await key(document.activeElement as HTMLElement, 'Escape')
    expect(document.querySelector('.harness-composer__model-menu')).toBeNull()
    expect(view.focus).toHaveBeenCalledOnce()
  })
  it('offers settings for no models and no results without returning focus after navigation', async () => {
    const view = await fixture([])
    expect(document.body.textContent).toContain('请先在设置中配置模型')
    await key(view.input, 'ArrowDown'); await key(document.activeElement as HTMLElement, 'Enter')
    expect(view.manage).toHaveBeenCalledOnce(); expect(view.focus).not.toHaveBeenCalled()
  })
  it('keeps the settings action reachable when search has no matching model', async () => {
    const view = await fixture(); await view.search('不存在')
    expect(document.querySelector('[role="status"]')?.textContent).toBe('没有匹配的模型')
    await key(view.input, 'ArrowUp'); await key(document.activeElement as HTMLElement, 'Enter')
    expect(view.manage).toHaveBeenCalledOnce(); expect(view.selected).not.toHaveBeenCalled()
  })
})
