// @vitest-environment happy-dom
import React, { act, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMiraComposerMenuFocus } from '../apps/harness-react/src/hooks/useMiraComposerMenuFocus'
import { useMiraComposerToolbar } from '../apps/harness-react/src/hooks/useMiraComposerToolbar'
import { MiraPromptEditor, type MiraPromptEditorHandle } from '../apps/harness-react/src/components/composer/MiraPromptEditor'
import { MiraContextUsage } from '../apps/harness-react/src/components/composer/MiraContextUsage'
import { ComposerSuggestionPanel } from '../apps/harness-react/src/components/composer/ComposerSuggestionPanel'

let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)) }) }

describe('Composer candidate panel ownership', () => {
  async function scrollFixture() {
    let agentTop = 230, viewportHeight = 224
    const frames = new Map<number, FrameRequestCallback>(), observers: Array<{ update: () => void; targets: Set<Element> }> = []
    let frameId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    vi.stubGlobal('ResizeObserver', class {
      targets = new Set<Element>()
      constructor(readonly update: () => void) { observers.push(this) }
      observe(element: Element) { this.targets.add(element) }
      disconnect() { this.targets.clear() }
    })
    const outerScroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement, list = element.closest<HTMLElement>('[role="listbox"]')
      const top = element.getAttribute('role') === 'listbox' ? 100 : (element.dataset.suggestionId === 'agent' ? agentTop : 140) - (list?.scrollTop || 0)
      const height = element.getAttribute('role') === 'listbox' ? viewportHeight : 32
      return { top, bottom: top + height, height, left: 0, right: 400, width: 400 } as DOMRect
    })
    function View({ loading }: { loading: boolean }) {
      const [selectedIndex, setSelectedIndex] = useState(0)
      return <div onKeyDown={event => { if (event.key === 'ArrowDown') setSelectedIndex(1); if (event.key === 'ArrowUp') setSelectedIndex(0) }}><div data-timeline /><ComposerSuggestionPanel listId="scroll-candidates" hasQuery={false} sections={[{ id: 'files', title: '文件', loading, items: [{ id: 'file', label: 'README.md', action: { type: 'file', value: 'README.md' } }] }, { id: 'agents', title: '智能体', items: [{ id: 'agent', label: 'my-reviewer', action: { type: 'agent', value: 'my-reviewer' } }] }]} selectedIndex={selectedIndex} onHighlight={setSelectedIndex} onSelect={() => {}} onTrigger={() => {}} /></div>
    }
    const render = async (loading = false) => { await act(async () => root.render(<View loading={loading} />)) }
    const frame = async () => { await act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }) }
    await render()
    const list = container.querySelector<HTMLElement>('[role="listbox"]')!, timeline = container.querySelector<HTMLElement>('[data-timeline]')!
    timeline.scrollTop = 70
    return { list, timeline, outerScroll, render, frame, observers, moveAgent: (top: number) => { agentTop = top }, resize: async (height: number) => { viewportHeight = height; await act(async () => observers.findLast(observer => observer.targets.has(list))!.update()) } }
  }

  it('reveals keyboard-selected rows by scrolling only its own list in both directions', async () => {
    const view = await scrollFixture()
    view.moveAgent(365)
    await key(view.list, 'ArrowDown')
    expect(view.list.scrollTop).toBe(73)
    expect(view.list.querySelector('[aria-selected="true"]')?.getAttribute('data-suggestion-id')).toBe('agent')
    await key(view.list, 'ArrowUp')
    expect(view.list.scrollTop).toBe(40)
    expect(view.timeline.scrollTop).toBe(70); expect(view.outerScroll).not.toHaveBeenCalled()
  })

  it('reveals the same selection after async catalog layout changes, then a popup viewport resize', async () => {
    const view = await scrollFixture()
    await key(view.list, 'ArrowDown'); await view.frame()
    view.moveAgent(365)
    await view.render(true)
    expect(view.list.scrollTop).toBe(73)
    await view.frame(); await view.resize(180)
    expect(view.list.scrollTop).toBe(117)
    view.list.scrollTop = 0
    await view.render(true); await view.frame()
    expect(view.list.scrollTop).toBe(0)
    expect(view.timeline.scrollTop).toBe(70); expect(view.outerScroll).not.toHaveBeenCalled()
    await act(async () => root.render(<div />))
    expect(view.observers.every(observer => observer.targets.size === 0)).toBe(true)
  })

  it('corrects a popup layout change on its bounded next frame', async () => {
    const view = await scrollFixture()
    await key(view.list, 'ArrowDown')
    view.moveAgent(365)
    await view.frame()
    expect(view.list.scrollTop).toBe(73)
    expect(view.outerScroll).not.toHaveBeenCalled()
  })

  it('keeps identical candidates in separate panes independently addressable and preserves disabled reasons', async () => {
    const selected = vi.fn(), highlighted = vi.fn(), trigger = vi.fn()
    const sections = [{ id: 'files', title: '文件', items: [{ id: 'same', label: 'README.md', description: '项目目录不可用，请重新选择项目', disabled: true, action: { type: 'file' as const, value: 'README.md' } }] }]
    await act(async () => root.render(<><ComposerSuggestionPanel listId="main-candidates" hasQuery={false} sections={sections} selectedIndex={0} onHighlight={highlighted} onSelect={selected} onTrigger={trigger} /><ComposerSuggestionPanel listId="side-candidates" hasQuery sections={sections} selectedIndex={0} onHighlight={highlighted} onSelect={selected} onTrigger={trigger} /></>))
    const main = document.getElementById('main-candidates-same') as HTMLButtonElement
    const side = document.getElementById('side-candidates-same') as HTMLButtonElement
    expect(main).not.toBe(side)
    expect(main.closest('[role="listbox"]')?.id).toBe('main-candidates')
    expect(side.closest('[role="listbox"]')?.id).toBe('side-candidates')
    expect(side.title).toContain('项目目录不可用')
    expect(side.disabled).toBe(true)
    expect(container.querySelectorAll('.mira-composer-suggestions__footer')).toHaveLength(1)
    expect(container.querySelectorAll('.mira-composer-suggestions__heading')).toHaveLength(0)
    await act(async () => { main.click(); side.click() })
    expect(selected).not.toHaveBeenCalled()
  })
})

describe('Composer context usage disclosure', () => {
  it('opens from focus, reports measured capacity, returns Escape focus, and never compacts implicitly', async () => {
    const compact = vi.fn(async () => {})
    await act(async () => root.render(<MiraContextUsage usage={{ usedTokens: 1300, contextWindow: 1000, source: 'reported', updatedAt: 1 }} disabled={false} compactDisabled={false} compactQueued={false} compactPending={false} onCompact={compact} />))
    const trigger = container.querySelector<HTMLButtonElement>('button')!
    await act(async () => trigger.focus()); await settle()
    expect(document.querySelector('[aria-label="上下文详情"]')?.textContent).toContain('模型实测 · 已使用 1,300 tokens')
    expect(document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100')
    expect(document.activeElement).toBe(trigger)
    await key(trigger, 'ArrowDown'); await settle()
    expect(document.activeElement?.textContent).toBe('压缩上下文')
    await key(document.activeElement as HTMLElement, 'Escape'); await settle()
    expect(document.querySelector('[aria-label="上下文详情"]')).toBeNull(); expect(document.activeElement).toBe(trigger)
    expect(compact).not.toHaveBeenCalled()
  })

  it('does not fabricate unused capacity or allow repeated compaction while queued, and closes on task replacement', async () => {
    const compact = vi.fn(async () => {})
    const view = (owner: string) => <MiraContextUsage key={owner} contextWindow={100000} disabled={false} compactDisabled={false} compactQueued compactPending={false} onCompact={compact} />
    await act(async () => root.render(view('a')))
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click()); await settle()
    const panel = document.querySelector('[aria-label="上下文详情"]')!
    expect(panel.textContent).toContain('发送任务后显示上下文用量'); expect(panel.textContent).toContain('100K tokens')
    expect(panel.querySelector('button')?.disabled).toBe(true); expect(panel.querySelector('[role="progressbar"]')).toBeNull()
    await act(async () => root.render(view('b'))); await settle()
    expect(document.querySelector('[aria-label="上下文详情"]')).toBeNull(); expect(compact).not.toHaveBeenCalled()
  })
})

async function toolbarFixture() {
  let width = 600, modelWidth = 180, plan = true
  const observers: Array<{ update: () => void; targets: Set<Element>; disconnect: ReturnType<typeof vi.fn> }> = []
  vi.stubGlobal('ResizeObserver', class {
    targets = new Set<Element>(); disconnect = vi.fn(() => this.targets.clear())
    constructor(readonly update: () => void) { observers.push(this) }
    observe(element: Element) { this.targets.add(element) }
  })
  const controlWidth = (element: HTMLElement) => {
    if (element.dataset.miraCompact === 'icon') return 28
    if (element.dataset.miraCompact) return element.dataset.miraToolbarPriority === '3' ? 36 : 28
    return Number(element.dataset.wide)
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const element = this as HTMLElement, toolbar = element.closest<HTMLElement>('[data-toolbar]')
    const trailing = () => (toolbar?.dataset.miraModelIcon ? 28 : modelWidth) + controlWidth(toolbar!.querySelector<HTMLElement>('[data-mira-toolbar-priority="3"]')!) + 36
    const content = () => [...toolbar!.querySelectorAll<HTMLElement>('[data-mira-toolbar-content] > *')].reduce((sum, control) => sum + controlWidth(control), 0) + (plan ? 8 : 4)
    const measured = element.hasAttribute('data-toolbar') ? width : element.hasAttribute('data-mira-toolbar-trailing') ? trailing() : element.hasAttribute('data-mira-toolbar-content') ? content() : element.hasAttribute('data-mira-toolbar-leading') ? width - trailing() - 12 : 0
    return { width: measured, height: 28, top: 0, left: 0, right: measured, bottom: 28 } as DOMRect
  })
  function View({ plan }: { plan: boolean }) {
    const ref = useMiraComposerToolbar()
    return <div><div ref={ref} data-toolbar style={{ columnGap: '12px' }}><div data-mira-toolbar-leading><div data-mira-toolbar-content><button data-wide="28" aria-label="add">+</button><button data-wide="110" data-mira-toolbar-priority="1" aria-label="permission">权限</button>{plan && <button data-wide="68" data-mira-toolbar-priority="2" aria-label="plan">计划</button>}</div></div><div data-mira-toolbar-trailing><button aria-label="model">模型</button><button data-wide="70" data-mira-toolbar-priority="3" aria-label="thought">推理</button><button aria-label="send">发送</button></div></div></div>
  }
  await act(async () => root.render(<View plan={plan} />)); await settle()
  const toolbar = container.querySelector<HTMLElement>('[data-toolbar]')!
  const resize = async (value: number) => { width = value; await act(async () => observers.find(observer => observer.targets.has(toolbar))!.update()); await settle() }
  return { toolbar, observers, resize, changeModel: async (value: number) => { modelWidth = value; await resize(width) }, changePlan: async (value: boolean) => { plan = value; await act(async () => root.render(<View plan={plan} />)); await settle() } }
}

describe('Composer toolbar fit keeps its live controls', () => {
  it('collapses permission, plan, thought meter, then model in order and restores full labels without remounting or focus loss', async () => {
    const view = await toolbarFixture()
    const permission = view.toolbar.querySelector<HTMLElement>('[aria-label="permission"]')!, model = view.toolbar.querySelector<HTMLElement>('[aria-label="model"]')!
    const compact = (priority: string) => view.toolbar.querySelector<HTMLElement>(`[data-mira-toolbar-priority="${priority}"]`)?.dataset.miraCompact
    permission.focus()
    expect(compact('1')).toBeUndefined()
    await view.resize(430); expect(compact('1')).toBe('true'); expect(compact('2')).toBeUndefined()
    await view.resize(390); expect(compact('2')).toBe('true'); expect(compact('3')).toBeUndefined()
    await view.resize(356); expect(compact('3')).toBe('true'); expect(view.toolbar.dataset.miraModelIcon).toBeUndefined()
    await view.resize(348); expect(compact('3')).toBe('icon'); expect(view.toolbar.dataset.miraModelIcon).toBeUndefined()
    await view.resize(300); expect(view.toolbar.dataset.miraModelIcon).toBe('true')
    expect(document.activeElement).toBe(permission); expect(view.toolbar.querySelector('[aria-label="model"]')).toBe(model)
    expect(container.querySelectorAll('[data-toolbar]')).toHaveLength(1)
    await view.resize(600); expect(compact('1')).toBeUndefined(); expect(compact('2')).toBeUndefined(); expect(compact('3')).toBeUndefined(); expect(view.toolbar.dataset.miraModelIcon).toBeUndefined()
  })
  it('remeasures changed content, skips hidden geometry, and disconnects observers when removed', async () => {
    const view = await toolbarFixture()
    await view.resize(430); expect(view.toolbar.querySelector('[data-mira-compact="true"]')).not.toBeNull()
    await view.resize(0); expect(view.toolbar.querySelector('[data-mira-compact="true"]')).not.toBeNull()
    await view.resize(430); await view.changeModel(90)
    expect(view.toolbar.querySelector('[data-mira-compact]')).toBeNull()
    await view.changeModel(180); await view.changePlan(false)
    expect(view.toolbar.querySelector('[data-mira-toolbar-priority="2"]')).toBeNull()
    expect(view.toolbar.querySelector('[data-mira-toolbar-priority="3"]')?.hasAttribute('data-mira-compact')).toBe(false)
    await act(async () => root.render(<div />))
    expect(view.observers.every(observer => observer.targets.size === 0)).toBe(true)
  })
})
async function key(element: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  await act(async () => element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))); await settle()
}
async function fixture(slow = false) {
  const selected = vi.fn(), focus = vi.fn(() => document.querySelector<HTMLElement>('[aria-label="旁路任务内容"]')?.focus())
  let ownerKey = 'side', active = true, release!: () => void
  function View({ ownerKey, active }: { ownerKey: string; active: boolean }) {
    const [open, setOpen] = useState(false), [ready, setReady] = useState(true)
    const menu = useMiraComposerMenuFocus({ open: open && active, ownerKey, active, ready, onReturnFocus: focus })
    useEffect(() => setOpen(false), [ownerKey])
    return <><div contentEditable suppressContentEditableWarning role="textbox" aria-label="任务内容">主草稿</div><div contentEditable={ready} suppressContentEditableWarning role="textbox" aria-label="旁路任务内容">旁草稿</div><DropdownMenu.Root modal={false} open={open && active} onOpenChange={setOpen}><DropdownMenu.Trigger aria-label="配置">配置</DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="mira-test-menu" {...menu.contentProps}><DropdownMenu.Item onSelect={() => {
      selected()
      if (slow) { setReady(false); release = () => setReady(true) }
    }}>选择配置</DropdownMenu.Item><DropdownMenu.Item onSelect={() => menu.cancelReturnFocus()}>管理配置</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root><button aria-label="外部操作">外部</button></>
  }
  const render = async (changes: { ownerKey?: string; active?: boolean } = {}) => {
    ownerKey = changes.ownerKey ?? ownerKey; active = changes.active ?? active
    await act(async () => root.render(<View ownerKey={ownerKey} active={active} />)); await settle()
  }
  await render()
  await act(async () => container.querySelector<HTMLElement>('[aria-label="配置"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false, pointerType: 'mouse' }))); await settle()
  const item = document.querySelector<HTMLElement>('[role="menuitem"]')!
  await act(async () => item.focus())
  return { item, selected, focus, render, release: async (beforeFrame?: () => void) => { await act(async () => release()); if (beforeFrame) await act(async () => beforeFrame()); await settle() } }
}

describe('Composer menu focus and input ownership', () => {
  it.each([{ isComposing: true }, { keyCode: 229 }])('does not activate or close a menu for an IME event (%j)', async composing => {
    const view = await fixture(); await key(view.item, 'Enter', composing); await key(view.item, 'Escape', composing)
    expect(view.selected).not.toHaveBeenCalled(); expect(document.querySelector('.mira-test-menu')).not.toBeNull()
    await key(view.item, 'Escape')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('旁路任务内容'); expect(view.focus).toHaveBeenCalledOnce()
  })
  it('preserves external focus when dismissed outside', async () => {
    const view = await fixture(), outside = container.querySelector<HTMLElement>('[aria-label="外部操作"]')!
    await act(async () => { outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); outside.focus() }); await settle()
    expect(document.activeElement).toBe(outside); expect(view.focus).not.toHaveBeenCalled()
  })
  it('waits for configuration ACK before returning to its editor', async () => {
    const view = await fixture(true); await key(view.item, 'Enter')
    expect(view.selected).toHaveBeenCalledOnce(); expect(view.focus).not.toHaveBeenCalled()
    expect(document.querySelector('.mira-test-menu')).toBeNull()
    await view.release()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('旁路任务内容'); expect(view.focus).toHaveBeenCalledOnce()
    expect(container.querySelector('[aria-label="任务内容"]')?.textContent).toBe('主草稿')
    expect(container.querySelector('[aria-label="旁路任务内容"]')?.textContent).toBe('旁草稿')
  })
  it('abandons delayed focus when the user moves to an outside button', async () => {
    const view = await fixture(true); await key(view.item, 'Enter')
    const outside = container.querySelector<HTMLElement>('[aria-label="外部操作"]')!
    await act(async () => { outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); outside.focus() }); await settle()
    await view.release(); expect(document.activeElement).toBe(outside); expect(view.focus).not.toHaveBeenCalled()
  })
  it('does not steal focus between readiness and the editor DOM update frame', async () => {
    let frame!: FrameRequestCallback
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1 })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const view = await fixture(true); await key(view.item, 'Enter')
    const outside = container.querySelector<HTMLElement>('[aria-label="外部操作"]')!
    await view.release(() => outside.focus())
    await act(async () => frame(0))
    expect(document.activeElement).toBe(outside); expect(view.focus).not.toHaveBeenCalled()
  })
  it('keeps delayed focus when closing removes the focused menu item', async () => {
    const focus = vi.fn(), item = document.createElement('button')
    document.body.append(item)
    let props!: ReturnType<typeof useMiraComposerMenuFocus>['contentProps']
    function View({ ready }: { ready: boolean }) {
      props = useMiraComposerMenuFocus({ open: true, ownerKey: 'side', active: true, ready, onReturnFocus: focus }).contentProps
      return null
    }
    await act(async () => root.render(<View ready={false} />))
    item.focus()
    item.addEventListener('close', event => props.onCloseAutoFocus(event))
    await act(async () => { item.dispatchEvent(new Event('close', { cancelable: true })); item.remove(); document.body.focus() })
    await act(async () => root.render(<View ready />))
    await settle()
    expect(focus).toHaveBeenCalledOnce()
  })
  it('does not arm a late close callback after the user has already focused another control', async () => {
    const focus = vi.fn(), outside = document.createElement('button')
    document.body.append(outside)
    let props!: ReturnType<typeof useMiraComposerMenuFocus>['contentProps']
    function View({ ready }: { ready: boolean }) {
      props = useMiraComposerMenuFocus({ open: true, ownerKey: 'side', active: true, ready, onReturnFocus: focus }).contentProps
      return <div data-testid="menu" />
    }
    await act(async () => root.render(<View ready={false} />))
    const menu = container.querySelector('[data-testid="menu"]')!
    menu.addEventListener('close', event => props.onCloseAutoFocus(event))
    outside.focus()
    await act(async () => menu.dispatchEvent(new Event('close', { cancelable: true })))
    await act(async () => root.render(<View ready />)); await settle()
    expect(document.activeElement).toBe(outside); expect(focus).not.toHaveBeenCalled()
  })
  it('waits for Lexical to restore its contenteditable DOM before returning focus', async () => {
    const focusability = vi.fn()
    let props!: ReturnType<typeof useMiraComposerMenuFocus>['contentProps']
    function View({ ready }: { ready: boolean }) {
      const editor = useRef<MiraPromptEditorHandle>(null)
      props = useMiraComposerMenuFocus({ open: true, ownerKey: 'side', active: true, ready, onReturnFocus: () => { focusability(editor.current?.getElement()?.getAttribute('contenteditable')); editor.current?.focus() } }).contentProps
      return <MiraPromptEditor ref={editor} text="保留草稿" disabled={!ready} onChange={() => {}} aria-label="旁路任务内容" />
    }
    await act(async () => root.render(<View ready={false} />))
    await act(async () => props.onCloseAutoFocus(new Event('close', { cancelable: true })))
    await act(async () => root.render(<View ready />))
    await settle()
    expect(container.querySelector('[aria-label="旁路任务内容"]')?.getAttribute('contenteditable')).toBe('true')
    expect(focusability).toHaveBeenCalledWith('true')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('旁路任务内容')
  })
  it.each([{ active: false }, { ownerKey: 'new-task' }])('does not reclaim focus after its owner is changed (%j)', async change => {
    const view = await fixture(true); await key(view.item, 'Enter'); await view.render(change); await view.release()
    expect(view.focus).not.toHaveBeenCalled()
  })
  it('does not reclaim focus when an open menu is hidden or navigated away', async () => {
    const view = await fixture(); await view.render({ active: false }); expect(view.focus).not.toHaveBeenCalled()
  })
  it('leaves focus to a management action', async () => {
    const view = await fixture(); const manager = document.querySelectorAll<HTMLElement>('[role="menuitem"]')[1]
    await act(async () => manager.focus()); await key(manager, 'Enter')
    expect(document.querySelector('.mira-test-menu')).toBeNull(); expect(view.focus).not.toHaveBeenCalled()
  })
})
