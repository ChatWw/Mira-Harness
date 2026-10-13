// @vitest-environment happy-dom
import React, { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownIt from 'markdown-it'
import { MiraTaskFind } from '../apps/harness-react/src/components/conversation/MiraTaskFind'
import { applyTaskFindHighlights, clearTaskFindHighlights } from '../apps/harness-react/src/lib/conversation-find-dom'
import { taskFindTargetKey } from '../apps/harness-react/src/lib/conversation-find'
import type { ConversationTimelineActions } from '../apps/harness-react/src/lib/conversation-timeline'

let root: Root | undefined
const registry = new Map<string, Set<Range>>()
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('')
  vi.stubGlobal('CSS', { highlights: registry }); vi.stubGlobal('Highlight', class extends Set<Range> { priority = 0 })
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({ top: 100, left: 0, right: 100, height: 20 } as DOMRect)
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 200, height: 20 }] as unknown as DOMRectList)
})
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined
  clearTaskFindHighlights(); registry.clear(); document.body.replaceChildren()
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})
async function fixture() {
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
  function Pane({ id, focused, onFocus }: { id: string; focused: boolean; onFocus: () => void }) {
    const viewport = useRef<HTMLDivElement>(null)
    const timeline = useRef<ConversationTimelineActions>({ restore: () => undefined, jumpToInteraction: () => false, jumpToMessage: (_id, _align, ready) => { ready?.(); return () => undefined } })
    return <section data-pane={id} className={id === 'main' ? 'mira-conversation-layout' : 'mira-side-conversation'} onFocusCapture={onFocus}>
      <MiraTaskFind active keyboardActive={focused} sessionId={id} loading={false} requestId={0} viewportRef={viewport} timelineRef={timeline} messages={[{ rendererId: id, original: { id, role: 'user', content: `needle ${id}`, createdAt: 1 } }]} />
      <textarea aria-label={`${id} composer`} />
      <div ref={viewport}><p data-mira-find-target={taskFindTargetKey(id)}>needle {id}</p></div>
    </section>
  }
  function View() { const [focused, setFocused] = useState('main'); return <>{['main', 'side'].map(id => <Pane key={id} id={id} focused={focused === id} onFocus={() => setFocused(id)} />)}<aside id="pilot-workspace"><div className="xterm"><textarea aria-label="terminal" /></div><input aria-label="browser address" /><div tabIndex={0} aria-label="file source" /><button type="button">resource action</button></aside><section id="mira-bottom-terminal"><textarea aria-label="bottom terminal" /></section></> }
  await act(async () => root!.render(<View />))
  const pane = (id: string) => container.querySelector<HTMLElement>(`[data-pane="${id}"]`)!
  const focus = async (id: string) => { await act(async () => pane(id).querySelector('textarea')!.focus()) }
  const key = async (key: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
    await act(async () => { document.activeElement!.dispatchEvent(event) })
    await act(async () => { await vi.advanceTimersByTimeAsync(20) })
    return event
  }
  const query = async (id: string, text: string) => {
    const input = pane(id).querySelector('input')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })); await vi.advanceTimersByTimeAsync(100) })
  }
  return { container, pane, focus, key, query }
}

describe('pane-owned conversation find', () => {
  it.each(['MacIntel', 'Win32'])('opens task find only with the platform primary modifier on %s', async platform => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
    const view = await fixture(); await view.focus('main')
    const primary = platform === 'MacIntel' ? 'metaKey' : 'ctrlKey', other = primary === 'metaKey' ? 'ctrlKey' : 'metaKey'
    await view.key('f', { [other]: true }); await view.key('f', { metaKey: true, ctrlKey: true })
    expect(view.pane('main').querySelector('input')).toBeNull()
    await view.key('f', { [primary]: true })
    expect(view.pane('main').querySelector('input')).toBe(document.activeElement)
    expect(view.pane('side').querySelector('input')).toBeNull()
  })

  it('opens long-history find before parsing the full history and cancels unfinished indexing on close', async () => {
    const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
    let elapsed = 0
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed++)
    const renderMarkdown = vi.spyOn(MarkdownIt.prototype, 'render')
    const messages = Array.from({ length: 4000 }, (_, index) => ({ rendererId: String(index), original: { id: String(index), role: 'assistant' as const, content: `**answer** ${index}`, createdAt: index } }))
    function View() {
      const viewport = useRef<HTMLDivElement>(null), timeline = useRef<ConversationTimelineActions | null>(null)
      return <><MiraTaskFind active sessionId="large-task" loading={false} requestId={0} messages={messages} viewportRef={viewport} timelineRef={timeline} /><textarea aria-label="composer" /><div ref={viewport} /></>
    }
    await act(async () => root!.render(<View />))
    expect(renderMarkdown).not.toHaveBeenCalled()
    await act(async () => { container.querySelector('textarea')!.focus(); document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true })) })
    expect(container.querySelector('[aria-label="查找对话"]')).not.toBeNull()
    expect(renderMarkdown.mock.calls.length).toBeLessThan(messages.length)
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="关闭查找"]')!.click() })
    const parsedOnClose = renderMarkdown.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(renderMarkdown.mock.calls.length).toBe(parsedOnClose)
    expect(container.querySelector('[aria-label="查找对话"]')).toBeNull()
  })

  it('drops an unfinished old-task index when the open find bar moves to another task', async () => {
    const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
    let elapsed = 0
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed++)
    const renderMarkdown = vi.spyOn(MarkdownIt.prototype, 'render')
    const oldMessages = Array.from({ length: 4000 }, (_, index) => ({ rendererId: String(index), original: { id: String(index), role: 'assistant' as const, content: `**needle** ${index}`, createdAt: index } }))
    const newMessages = [{ rendererId: 'new-answer', original: { id: 'new-answer', role: 'assistant' as const, content: '**different**', createdAt: 1 } }]
    function View({ id, messages }: { id: string; messages: typeof oldMessages }) {
      const viewport = useRef<HTMLDivElement>(null), timeline = useRef<ConversationTimelineActions | null>(null)
      return <><MiraTaskFind active sessionId={id} loading={false} requestId={1} messages={messages} viewportRef={viewport} timelineRef={timeline} /><div ref={viewport} /></>
    }
    await act(async () => root!.render(<View id="old-task" messages={oldMessages} />))
    const input = container.querySelector<HTMLInputElement>('[aria-label="查找对话"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'needle')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.querySelector('[role="status"]')?.textContent).toBe('正在查找')
    await act(async () => root!.render(<View id="new-task" messages={newMessages} />))
    const parsedAfterSwitch = renderMarkdown.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(renderMarkdown.mock.calls.length).toBe(parsedAfterSwitch)
    expect(container.querySelector('[role="status"]')?.textContent).toBe('没有匹配结果')
    expect(container.querySelector('[aria-label="下一处匹配"]')?.hasAttribute('disabled')).toBe(true)
  })

  it('yields terminal, browser and file shortcuts even before stale conversation ownership updates', async () => {
    const view = await fixture()
    for (const selector of ['.xterm textarea', '[aria-label="browser address"]', '[aria-label="file source"]', '#pilot-workspace button', '#mira-bottom-terminal textarea']) {
      await view.focus('main')
      const resource = view.container.querySelector<HTMLElement>(selector)!
      await act(async () => resource.focus())
      for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
        expect((await view.key('f', modifier)).defaultPrevented).toBe(false)
        expect(document.activeElement).toBe(resource)
        expect(view.pane('main').querySelector('input')).toBeNull()
        expect(view.pane('side').querySelector('input')).toBeNull()
      }
    }
  })
  it('routes Cmd+F to the focused side, then retains independent queries and closes only the focused bar', async () => {
    const view = await fixture(); await view.focus('side'); await view.key('f', { metaKey: true })
    expect(view.pane('main').querySelector('input')).toBeNull()
    expect(view.pane('side').querySelector('input')).toBe(document.activeElement)
    await view.query('side', 'side'); await view.focus('main'); await view.key('f', { ctrlKey: true }); await view.query('main', 'main')
    expect(view.pane('side').querySelector('input')?.value).toBe('side')
    expect(view.pane('main').querySelector('input')?.value).toBe('main')
    await view.focus('side'); await view.key('f', { metaKey: true }); await view.key('Escape')
    expect(view.pane('side').querySelector('input')).toBeNull()
    expect(view.pane('main').querySelector('input')?.value).toBe('main')
    expect(document.activeElement).toBe(view.pane('side').querySelector('textarea'))
  })

  it('keeps composer focus when moving between already open find bars and does not offer unavailable file changes', async () => {
    const view = await fixture(); await view.focus('main'); await view.key('f', { metaKey: true }); await view.query('main', 'needle')
    await view.focus('side'); await view.key('f', { metaKey: true }); await view.query('side', 'needle')
    await view.focus('main'); await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(document.activeElement).toBe(view.pane('main').querySelector('textarea'))
    expect(view.pane('side').querySelector('[aria-label="切换到文件变更查找"]')).toBeNull()
    const ranges = [...registry.get('mira-task-find-active') ?? []]
    expect(ranges).toHaveLength(1); expect(view.pane('main').contains(ranges[0].startContainer)).toBe(true)
  })

  it('does not consume composition, repeated or modal-blocked find shortcuts', async () => {
    const view = await fixture(); await view.focus('side')
    for (const options of [{ metaKey: true, isComposing: true }, { metaKey: true, repeat: true }, { ctrlKey: true, altKey: true }]) expect((await view.key('f', options)).defaultPrevented).toBe(false)
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog)
    expect((await view.key('f', { metaKey: true })).defaultPrevented).toBe(false)
    expect(view.pane('side').querySelector('input')).toBeNull()
  })

  it('does not let a delayed cleanup from the former pane erase the current highlight owner', () => {
    const main = document.createElement('div'), side = document.createElement('div'), mainOwner = {}, sideOwner = {}
    main.innerHTML = '<p data-mira-find-target="main">main needle</p>'; side.innerHTML = '<p data-mira-find-target="side">side needle</p>'
    applyTaskFindHighlights(main, 'needle', undefined, mainOwner)
    applyTaskFindHighlights(side, 'needle', undefined, sideOwner)
    clearTaskFindHighlights(mainOwner)
    const ranges = [...registry.get('mira-task-find') ?? []]
    expect(ranges).toHaveLength(1); expect(side.contains(ranges[0].startContainer)).toBe(true)
    clearTaskFindHighlights(sideOwner); expect(registry.size).toBe(0)
  })
})
