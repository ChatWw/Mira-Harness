// @vitest-environment happy-dom
import React, { act } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraSidebarStickyHeader, resolveMiraSidebarStickyGroup, type MiraSidebarStickyGroup } from '../apps/harness-react/src/components/session/MiraSidebarStickyHeader'

let root: Root | undefined
let nextFrame = 0
const frames = new Map<number, FrameRequestCallback>()
const disconnects: ReturnType<typeof vi.fn>[] = []
const resizes: Array<{ observe: ReturnType<typeof vi.fn>; unobserve: ReturnType<typeof vi.fn> }> = []
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { const id = ++nextFrame; frames.set(id, callback); return id })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); constructor() { disconnects.push(this.disconnect); resizes.push(this) } })
})
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined
  frames.clear(); disconnects.length = 0; resizes.length = 0; vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren()
})

const groups: MiraSidebarStickyGroup[] = [
  { id: 'a', name: 'Alpha', color: 'blue', count: 83, collapsed: false },
  { id: 'b', name: 'Beta', color: 'green', count: 14, collapsed: false },
]

function geometry() {
  const scroll = document.createElement('div'); document.body.append(scroll)
  Object.defineProperties(scroll, { scrollHeight: { configurable: true, value: 1300 }, clientHeight: { value: 400 } })
  scroll.getBoundingClientRect = () => ({ top: 100, bottom: 500, height: 400 } as DOMRect)
  const positions = new Map([['a', { top: 90, bottom: 700 }], ['b', { top: 710, bottom: 1300 }]])
  const sections = new Map<string, HTMLElement>()
  for (const group of groups) {
    const section = document.createElement('section'); section.dataset.collectionId = `sidebar-group:${group.id}`; section.dataset.collectionExpanded = 'true'
    const header = document.createElement('div'); header.dataset.collectionHeader = ''
    header.getBoundingClientRect = () => ({ top: positions.get(group.id)!.top, height: 32 } as DOMRect)
    section.getBoundingClientRect = () => ({ bottom: positions.get(group.id)!.bottom } as DOMRect)
    section.append(header); scroll.append(section); sections.set(group.id, section)
  }
  return { scroll, positions, sections }
}

async function mount() {
  const layout = geometry()
  const callbacks = { onToggle: vi.fn(), onNewTask: vi.fn<(id: string) => void | Promise<void>>(), onColor: vi.fn(), onUngroup: vi.fn(), onError: vi.fn() }
  let props = { scrollElement: layout.scroll, groups, active: true, dragging: false, ...callbacks }
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
  const node = () => <React.StrictMode><Tooltip.Provider><MiraSidebarStickyHeader {...props} /></Tooltip.Provider></React.StrictMode>
  const render = async (patch: Partial<typeof props> = {}) => { props = { ...props, ...patch }; await act(async () => root!.render(node())) }
  await render()
  const button = (label: string) => { const element = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); if (!element) throw new Error(`Missing ${label}`); return element }
  const click = async (element: HTMLElement) => { await act(async () => element.click()) }
  const flushFrames = async () => { await act(async () => { const pending = [...frames]; frames.clear(); pending.forEach(([, callback]) => callback(0)) }) }
  const scroll = async () => { await act(async () => layout.scroll.dispatchEvent(new Event('scroll'))); await flushFrames() }
  const slot = () => container.querySelector<HTMLElement>('.mira-sidebar-sticky-slot')
  return { ...layout, list: layout.scroll, ...callbacks, container, render, button, click, scroll, flushFrames, slot, replaceImmediately: (patch: Partial<typeof props>) => { props = { ...props, ...patch }; flushSync(() => root!.render(node())) } }
}

describe('Mira floating group selection from ordinary sidebar layout', () => {
  it('requires the original title to leave the viewport and enough group content to remain', () => {
    const view = geometry()
    expect(resolveMiraSidebarStickyGroup(view.scroll, groups)).toBe('a')
    view.positions.get('a')!.top = 100
    expect(resolveMiraSidebarStickyGroup(view.scroll, groups)).toBeNull()
    view.positions.get('a')!.top = 99.49
    view.positions.get('a')!.bottom = 132.5
    expect(resolveMiraSidebarStickyGroup(view.scroll, groups)).toBeNull()
    view.positions.get('a')!.bottom = 133
    expect(resolveMiraSidebarStickyGroup(view.scroll, groups)).toBe('a')
  })

  it('ignores collapsed, renaming, absent and project collections, then chooses the last covering group', () => {
    const view = geometry()
    view.positions.get('b')!.top = 60
    expect(resolveMiraSidebarStickyGroup(view.scroll, groups)).toBe('b')
    view.sections.get('b')!.dataset.collectionExpanded = 'false'
    expect(resolveMiraSidebarStickyGroup(view.scroll, groups)).toBe('a')
    view.sections.get('a')!.dataset.collectionRenaming = 'true'
    expect(resolveMiraSidebarStickyGroup(view.scroll, groups)).toBeNull()
    view.sections.get('a')!.dataset.collectionRenaming = 'false'
    expect(resolveMiraSidebarStickyGroup(view.scroll, [{ ...groups[0], collapsed: true }])).toBeNull()
    view.sections.get('a')!.dataset.collectionId = 'sidebar-project:a'
    expect(resolveMiraSidebarStickyGroup(view.scroll, groups)).toBeNull()
  })

  it('does not float for a non-scrollable or hidden viewport', () => {
    const view = geometry()
    Object.defineProperty(view.scroll, 'scrollHeight', { value: 400 })
    expect(resolveMiraSidebarStickyGroup(view.scroll, groups)).toBeNull()
    Object.defineProperty(view.scroll, 'scrollHeight', { value: 1300 })
    view.scroll.getBoundingClientRect = () => ({ height: 0 } as DOMRect)
    expect(resolveMiraSidebarStickyGroup(view.scroll, groups)).toBeNull()
  })
})

describe('floating group actual React and Radix DOM interactions', () => {
  it('uses the real group count and color, and only the explicit title toggles the group', async () => {
    const view = await mount()
    expect(view.slot()?.dataset.stickyGroupId).toBe('a')
    expect(view.slot()?.querySelector('.mira-sidebar-sticky-card')?.getAttribute('data-group-color')).toBe('blue')
    expect(view.slot()?.querySelector('.mira-sidebar-sticky-count')?.textContent).toBe('83')
    await view.click(view.button('折叠 Alpha'))
    expect(view.onToggle).toHaveBeenCalledExactlyOnceWith('a')
    await view.render({ groups: [{ ...groups[0], count: 84 }, groups[1]] })
    expect(view.slot()?.querySelector('.mira-sidebar-sticky-count')?.textContent).toBe('84')
    expect(view.onNewTask).not.toHaveBeenCalled()
    expect(view.slot()?.querySelector('[data-collection-id], [data-sidebar-drop-id]')).toBeNull()
  })

  it('creates through the existing raw-group callback once while pending, then shows failure and allows retry', async () => {
    const view = await mount()
    let reject!: (error: Error) => void
    view.onNewTask.mockReturnValueOnce(new Promise<void>((_resolve, fail) => { reject = fail }))
    await view.click(view.button('在 Alpha 新建任务')); await view.click(view.button('在 Alpha 新建任务'))
    expect(view.onNewTask).toHaveBeenCalledExactlyOnceWith('a')
    expect(view.button('在 Alpha 新建任务').disabled).toBe(true)
    await act(async () => reject(new Error('草稿创建失败')))
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('草稿创建失败')
    expect(view.button('在 Alpha 新建任务').disabled).toBe(false)
    await view.click(view.button('在 Alpha 新建任务'))
    expect(view.onNewTask).toHaveBeenCalledTimes(2)
    expect(view.onToggle).not.toHaveBeenCalled()
  })

  it('opens real color and context menus without toggling, and routes color/ungroup to the selected raw id', async () => {
    const view = await mount()
    await act(async () => view.button('Alpha 的颜色').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    const color = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(element => element.textContent?.includes('紫色'))!
    expect(color).toBeDefined(); await view.click(color)
    expect(view.onColor).toHaveBeenCalledExactlyOnceWith('a', 'purple')
    expect(view.onToggle).not.toHaveBeenCalled()
    await act(async () => view.slot()!.querySelector('.mira-sidebar-sticky-card')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })))
    const ungroup = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent === '解散「Alpha」')!
    expect(ungroup).toBeDefined(); await view.click(ungroup)
    expect(view.onUngroup).toHaveBeenCalledExactlyOnceWith('a')
    expect(view.onToggle).not.toHaveBeenCalled()
  })

  it('disables the exiting copy immediately, removes it at 150 ms and cancels removal on a new covering group', async () => {
    const view = await mount()
    view.positions.get('a')!.top = 100; await view.scroll()
    expect(view.slot()?.classList.contains('is-visible')).toBe(false)
    expect(view.slot()?.getAttribute('aria-hidden')).toBe('true')
    expect(view.slot()?.hasAttribute('inert')).toBe(true)
    await view.click(view.button('折叠 Alpha'))
    expect(view.onToggle).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(149)); expect(view.slot()).not.toBeNull()
    view.positions.get('b')!.top = 90; await view.scroll()
    await act(async () => vi.advanceTimersByTime(200))
    expect(view.slot()?.dataset.stickyGroupId).toBe('b')
    expect(view.slot()?.classList.contains('is-visible')).toBe(true)
    view.positions.get('b')!.top = 100; await view.scroll()
    await act(async () => vi.advanceTimersByTime(150)); expect(view.slot()).toBeNull()
  })

  it('immediately hides during any drag or view exit, closes old menus and rejects a queued action for the old group', async () => {
    const view = await mount()
    await act(async () => view.button('Alpha 的颜色').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    await view.render({ dragging: true })
    expect(view.slot()?.hidden).toBe(true); expect(document.querySelector('[role="menu"]')).toBeNull()
    await view.render({ dragging: false })
    await act(async () => { view.button('在 Alpha 新建任务').click(); view.replaceImmediately({ groups: [groups[1]] }) })
    expect(view.onNewTask).not.toHaveBeenCalled()
    view.positions.get('b')!.top = 90; await view.scroll()
    await view.render({ active: false })
    expect(view.slot()?.hidden).toBe(true)
    await act(async () => vi.advanceTimersByTime(150)); expect(view.slot()).toBeNull()
  })

  it('remeasures virtual groups mounted after the scroll frame without changing the group data', async () => {
    const view = await mount()
    const original = view.sections.get('a')!, replacement = original.cloneNode(true) as HTMLElement
    replacement.getBoundingClientRect = () => ({ bottom: 700 } as DOMRect)
    replacement.querySelector<HTMLElement>('[data-collection-header]')!.getBoundingClientRect = () => ({ top: 90, height: 32 } as DOMRect)
    await act(async () => original.remove())
    await view.flushFrames()
    expect(view.slot()?.classList.contains('is-visible')).toBe(false)
    expect(resizes[resizes.length - 1]?.unobserve).toHaveBeenCalledWith(original)
    await act(async () => view.list.prepend(replacement))
    expect(resizes[resizes.length - 1]?.observe).toHaveBeenCalledWith(replacement)
    await view.flushFrames()
    expect(view.slot()?.dataset.stickyGroupId).toBe('a')
    expect(view.slot()?.classList.contains('is-visible')).toBe(true)
    await act(async () => root!.unmount()); root = undefined
    await act(async () => view.list.replaceChildren())
    expect(frames.size).toBe(0)
  })

  it('respects reduced motion and cleans scheduled measurement and observers on unmount', async () => {
    const view = await mount()
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    view.positions.get('a')!.top = 100; await view.scroll()
    await act(async () => vi.advanceTimersByTime(0)); expect(view.slot()).toBeNull()
    await act(async () => view.list.dispatchEvent(new Event('scroll')))
    expect(frames.size).toBeGreaterThan(0)
    await act(async () => root!.unmount()); root = undefined
    expect(frames.size).toBe(0); expect(disconnects.every(disconnect => disconnect.mock.calls.length === 1)).toBe(true)
  })
})
