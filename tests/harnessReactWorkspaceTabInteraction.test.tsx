// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceTabs } from '../apps/harness-react/src/components/workspace/WorkspaceTabs'
import type { WorkspaceTab } from '../apps/harness-react/src/state/workspace-state'

const drag = vi.hoisted(() => ({ id: '' }))
vi.mock('@dnd-kit/sortable', async original => ({
  ...await original<typeof import('@dnd-kit/sortable')>(),
  useSortable: ({ id }: { id: string }) => ({ attributes: {}, listeners: {}, setNodeRef: () => undefined, isDragging: drag.id === id }),
}))
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); drag.id = ''; vi.unstubAllGlobals() })

async function fixture() {
  const tabs: WorkspaceTab[] = [{ id: 'overview', label: '任务活动' }, { id: 'file:docs/notes.md', label: 'notes.md', path: 'docs/notes.md' }]
  const activate = vi.fn(), close = vi.fn(), reorder = vi.fn()
  const render = async () => { await act(async () => root.render(<WorkspaceTabs tabs={tabs} active="overview" changes={0} recentClosedTabs={[]} onOpen={vi.fn()} onActivate={activate} onClose={close} onCloseOthers={vi.fn()} onCloseAll={vi.fn()} onReopen={vi.fn()} onReorder={reorder} onDismiss={vi.fn()} />)) }
  await render()
  const select = () => container.querySelector<HTMLButtonElement>('[data-workspace-tab-id="file:docs/notes.md"] .pilot-side-tab__select')!
  return { render, select, activate, close, reorder }
}

describe('workspace tab drag and hover interaction', () => {
  it('does not activate the dragged background resource on the release click', async () => {
    const view = await fixture()
    drag.id = 'file:docs/notes.md'; await view.render(); drag.id = ''; await view.render()
    await act(async () => view.select().click())
    expect(view.activate).not.toHaveBeenCalled()
    await act(async () => view.select().click())
    expect(view.activate).toHaveBeenCalledExactlyOnceWith('file:docs/notes.md')
  })
  it('allows a fresh pointer gesture after a drag without a generated release click', async () => {
    const view = await fixture()
    drag.id = 'file:docs/notes.md'; await view.render(); drag.id = ''; await view.render()
    await act(async () => { view.select().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); view.select().click() })
    expect(view.activate).toHaveBeenCalledExactlyOnceWith('file:docs/notes.md')
  })
  it('allows Enter activation after a keyboard drag is cancelled', async () => {
    const view = await fixture()
    drag.id = 'file:docs/notes.md'; await view.render(); drag.id = ''; await view.render()
    await act(async () => { view.select().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); view.select().click() })
    expect(view.activate).toHaveBeenCalledExactlyOnceWith('file:docs/notes.md')
  })
  it('shows the complete resource path on focus and clears it when dragging starts', async () => {
    const view = await fixture()
    await act(async () => view.select().focus())
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe('docs/notes.md')
    drag.id = 'file:docs/notes.md'; await view.render()
    expect(container.querySelector('[role="tooltip"]')).toBeNull()
  })
  it('keeps middle-click close separate from resource activation', async () => {
    const view = await fixture()
    await act(async () => view.select().dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true })))
    expect(view.close).toHaveBeenCalledExactlyOnceWith('file:docs/notes.md'); expect(view.activate).not.toHaveBeenCalled()
  })
})


it('places the add button after tabs and shares the warm tooltip delay between panel controls', async () => {
  const add = vi.fn(), expand = vi.fn(), dismiss = vi.fn()
  await act(async () => root.render(<WorkspaceTabs tabs={[{ id: 'new-tab:first', label: '新标签页' }]} active="new-tab:first" changes={0} recentClosedTabs={[]} onNewTab={add} onOpen={vi.fn()} onActivate={vi.fn()} onClose={vi.fn()} onCloseOthers={vi.fn()} onCloseAll={vi.fn()} onReopen={vi.fn()} onReorder={vi.fn()} onDismiss={dismiss} onFullView={expand} />))
  const list = container.querySelector('.pilot-side-tabs__list')!
  expect(list.firstElementChild?.getAttribute('data-workspace-tab-id')).toBe('new-tab:first')
  const plus = list.lastElementChild as HTMLButtonElement
  expect(plus.getAttribute('aria-label')).toBe('新建标签页')
  await act(async () => plus.click())
  expect(add).toHaveBeenCalledOnce()
  const controls = container.querySelectorAll<HTMLButtonElement>('.pilot-side-tabs__actions button')
  expect([...controls].map(button => button.querySelector('svg')?.getAttribute('width'))).toEqual(['16', '16'])
  const hover = async (button: HTMLButtonElement, wait: number) => act(async () => {
    button.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }))
    await new Promise(resolve => setTimeout(resolve, wait))
  })
  await hover(controls[0], 30)
  expect(container.querySelector('[role="tooltip"]')).toBeNull()
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 370)) })
  expect(container.querySelector('[role="tooltip"]')?.textContent).toContain('进入完整视图')
  await act(async () => controls[0].dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' })))
  await hover(controls[1], 30)
  expect(container.querySelector('[role="tooltip"]')?.textContent).toContain('切换面板')
  await act(async () => controls[0].click())
  expect(expand).toHaveBeenCalledOnce()
  await act(async () => controls[1].click())
  expect(dismiss).toHaveBeenCalledOnce()
})


it('keeps the tab overview before the fixed conversation tab in full view and preserves activation', async () => {
  const activate = vi.fn(), conversation = vi.fn()
  await act(async () => root.render(<WorkspaceTabs fullView={{ surface: 'resource', floating: 'collapsed' }} conversationTitle="当前任务" onConversation={conversation} tabs={[{ id: 'overview', label: '任务活动' }]} active="overview" changes={0} recentClosedTabs={[]} onOpen={vi.fn()} onActivate={activate} onClose={vi.fn()} onCloseOthers={vi.fn()} onCloseAll={vi.fn()} onReopen={vi.fn()} onReorder={vi.fn()} onDismiss={vi.fn()} />))
  const nav = container.querySelector('nav')!
  const overview = nav.firstElementChild as HTMLButtonElement
  expect(overview.getAttribute('aria-label')).toBe('标签页')
  expect(overview.nextElementSibling?.classList.contains('mira-conversation-tab')).toBe(true)
  await act(async () => overview.click())
  const resource = container.querySelector<HTMLElement>('[aria-label="切换到任务活动"]')!
  expect(resource).not.toBeNull()
  await act(async () => resource.click())
  expect(activate).toHaveBeenCalledExactlyOnceWith('overview')
  await act(async () => container.querySelector<HTMLButtonElement>('.mira-conversation-tab button')!.click())
  expect(conversation).toHaveBeenCalledOnce()
})
