// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceTabs } from '../apps/harness-react/src/components/workspace/WorkspaceTabs'
import { MiraTaskGrid, MIRA_TASK_DRAG_MIME, miraTaskPointerDrag, endMiraTaskDrag } from '../apps/harness-react/src/components/workspace/MiraTaskGrid'
import { miraInitialTaskLayout, splitMiraTaskLayout } from '../apps/harness-react/src/state/mira-task-layout'
import { closeWorkspaceTab, createWorkspaceSession, openWorkspaceTab, type WorkspaceTabId } from '../apps/harness-react/src/state/workspace-state'

let root: Root | undefined
describe('Mira task grid keeps editors alive while changing splits', () => {
  it('accepts whole-row sidebar pointer drags, cancels previews and preserves editors', async () => {
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    const placed = vi.fn(async () => undefined)
    await act(async () => root!.render(<MiraTaskGrid layout={miraInitialTaskLayout()} active canPlace={id => id === 'task'} onPlace={placed} onResize={() => undefined}><textarea data-mira-task-leaf="$primary" defaultValue="保留草稿" /></MiraTaskGrid>))
    const editor = container.querySelector('textarea')!, pane = container.querySelector<HTMLElement>('[data-task-leaf]')!
    vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue({ left: 400, right: 1000, top: 0, bottom: 600, width: 600, height: 600 } as DOMRect)
    await act(async () => { expect(miraTaskPointerDrag('task', 999, 300, false)).toBe(true) })
    expect(container.querySelector('.mira-task-grid__drop--right')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.mira-task-grid__drop')?.textContent).toBe('')
    await act(async () => endMiraTaskDrag())
    expect(container.querySelector('.mira-task-grid__drop')).toBeNull(); expect(placed).not.toHaveBeenCalled()
    await act(async () => { expect(miraTaskPointerDrag('task', 300, 300, true)).toBe(false); expect(miraTaskPointerDrag('missing', 999, 300, true)).toBe(false) })
    await act(async () => { expect(miraTaskPointerDrag('task', 999, 300, true)).toBe(true) })
    expect(placed).toHaveBeenCalledExactlyOnceWith('task', '$primary', 'right')
    expect(container.querySelector('textarea')).toBe(editor); expect(editor.value).toBe('保留草稿')
  })

  it('previews pointer geometry without React rerenders or persistence, cancels with Escape and commits once on release', async () => {
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    let renders = 0
    const initial = splitMiraTaskLayout(miraInitialTaskLayout(), '$primary', 'b', 'right'), committed = vi.fn()
    function View() {
      const [layout, setLayout] = useState(initial); renders++
      return <MiraTaskGrid layout={layout} active canPlace={() => false} onPlace={async () => undefined} onResize={layout => { committed(layout); setLayout(layout) }}><textarea data-mira-task-leaf="$primary" defaultValue="主草稿" /><textarea data-mira-task-leaf="b" defaultValue="侧草稿" /></MiraTaskGrid>
    }
    await act(async () => root!.render(<View />))
    const grid = container.querySelector<HTMLElement>('.mira-task-grid')!, separator = container.querySelector<HTMLElement>('[role="separator"]')!, pane = container.querySelector<HTMLElement>('[data-task-leaf="$primary"]')!, editor = pane.querySelector('textarea')!
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 600 } as DOMRect)
    const pointer = async (target: EventTarget, type: string, x: number) => { await act(async () => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x, clientY: 100 }))) }
    await pointer(separator, 'pointerdown', 500)
    for (let i = 0; i < 20; i++) await pointer(window, 'pointermove', 600 + i)
    expect(committed).not.toHaveBeenCalled(); expect(renders).toBe(1); expect(pane.style.width).toBe('61.9%'); expect(pane.querySelector('textarea')).toBe(editor)
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(committed).not.toHaveBeenCalled(); expect(pane.style.width).toBe('50%')
    await pointer(separator, 'pointerdown', 500); await pointer(window, 'pointermove', 700); await pointer(window, 'pointerup', 700)
    expect(committed).toHaveBeenCalledOnce(); expect(renders).toBe(2); expect(separator.getAttribute('aria-valuenow')).toBe('70'); expect(pane.querySelector('textarea')).toBe(editor)
  })

  it('resizes with keyboard without remounting either editor, clamps ratios and rejects central/task duplicate drops', async () => {
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    const placed = vi.fn(async () => undefined)
    const initial = splitMiraTaskLayout(miraInitialTaskLayout(), '$primary', 'b', 'right')
    function View() {
      const [layout, setLayout] = useState(initial)
      return <MiraTaskGrid layout={layout} active canPlace={id => id === 'c'} onPlace={placed} onResize={setLayout}><textarea data-mira-task-leaf="$primary" aria-label="主输入" defaultValue="主草稿" /><textarea data-mira-task-leaf="b" aria-label="侧输入" defaultValue="侧草稿" /></MiraTaskGrid>
    }
    await act(async () => root!.render(<View />))
    const editor = container.querySelector<HTMLTextAreaElement>('[aria-label="侧输入"]')!, separator = container.querySelector<HTMLElement>('[role="separator"]')!
    editor.value = '尚未发送的侧草稿'; editor.focus()
    await act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
    expect(separator.getAttribute('aria-valuenow')).toBe('75')
    expect(container.querySelector('[aria-label="侧输入"]')).toBe(editor)
    expect(document.activeElement).toBe(editor); expect(editor.value).toBe('尚未发送的侧草稿')
    const pane = container.querySelector<HTMLElement>('[data-task-leaf="$primary"]')!
    vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 600, height: 600 } as DOMRect)
    const drag = async (type: string, id: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, dataTransfer: { value: { types: [MIRA_TASK_DRAG_MIME], getData: () => id, dropEffect: '' } } })
      await act(async () => pane.dispatchEvent(event)); return event
    }
    await drag('dragover', 'c', 300, 300); expect(container.querySelector('.mira-task-grid__drop')).toBeNull()
    await drag('drop', 'b', 599, 300); expect(placed).not.toHaveBeenCalled()
    await drag('dragover', 'c', 300, 599); expect(container.querySelector('.mira-task-grid__drop--down')?.getAttribute('aria-hidden')).toBe('true')
    await drag('drop', 'c', 300, 599); expect(placed).toHaveBeenCalledExactlyOnceWith('c', '$primary', 'down')
    expect(container.querySelector('.mira-task-grid__drop')).toBeNull(); expect(editor.value).toBe('尚未发送的侧草稿')
  })
})
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined)
})
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function fixture(delayed = false, faviconUrl?: string) {
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
  let finishClose: (() => void) | undefined
  function View() {
    const [state, setState] = useState(() => openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), { id: 'terminal:a', label: 'Mira' }), { id: 'browser', label: '浏览器', faviconUrl }))
    const close = (id: WorkspaceTabId) => { const apply = () => setState(previous => closeWorkspaceTab(previous, id)); if (delayed) finishClose = apply; else apply() }
    return <><WorkspaceTabs tabs={state.tabs} active={state.activeTab} changes={0} recentClosedTabs={state.recentClosedTabs} onOpen={() => undefined} onActivate={id => setState(previous => ({ ...previous, activeTab: id }))} onClose={close} onCloseOthers={() => undefined} onCloseAll={() => undefined} onReopen={() => undefined} onReorder={() => undefined} onDismiss={() => undefined} /><textarea aria-label="main draft" /></>
  }
  await act(async () => root!.render(<View />))
  const close = async (label: string) => { const button = container.querySelector<HTMLButtonElement>(`[aria-label="关闭${label}"]`)!; await act(async () => { button.focus(); button.click() }) }
  return { container, close, finish: async () => { await act(async () => finishClose?.()) } }
}

describe('resource strip close focus', () => {
  it('shows a real browser icon and falls back to the globe on image failure without losing the tab', async () => {
    const view = await fixture(false, 'https://mira.test/icon.png')
    const tab = view.container.querySelector('[data-workspace-tab-id="browser"]')!, image = tab.querySelector('img')!
    expect(image.getAttribute('src')).toBe('https://mira.test/icon.png'); expect(image.getAttribute('alt')).toBe(''); expect(image.referrerPolicy).toBe('no-referrer')
    await act(async () => image.dispatchEvent(new Event('error')))
    expect(tab.querySelector('img')).toBeNull(); expect(tab.querySelector('.pilot-side-tab__select > svg')).not.toBeNull()
    expect(tab.querySelector('span')?.textContent).toBe('浏览器')
  })
  it('returns a removed close control to the selected adjacent resource, then the empty strip menu', async () => {
    const view = await fixture(); await view.close('浏览器')
    expect(document.activeElement).toBe(view.container.querySelector('.pilot-side-tab.is-active .pilot-side-tab__select'))
    await view.close('Mira')
    expect(document.activeElement).toBe(view.container.querySelector('[aria-label="标签页"]'))
  })
  it('keeps a newer draft focus when an asynchronous close finally removes the old resource', async () => {
    const view = await fixture(true); await view.close('浏览器')
    const draft = view.container.querySelector<HTMLTextAreaElement>('[aria-label="main draft"]')!
    draft.value = 'new draft'; await act(async () => draft.focus()); await view.finish()
    expect(document.activeElement).toBe(draft); expect(draft.value).toBe('new draft')
  })
})
