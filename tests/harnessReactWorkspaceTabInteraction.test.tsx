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
