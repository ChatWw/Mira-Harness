import * as React from 'react'
import { Window } from 'happy-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessMessage } from '../src/config/harness'
import { projectTimelineRenderMessages, type TimelineRenderMessage } from '../apps/harness-react/src/components/conversation/conversation-model'
import { buildConversationRenderTurns, createConversationHeightCache, indexConversationTurnMessages, type ConversationTimelineActions } from '../apps/harness-react/src/lib/conversation-timeline'
import { MiraConversationTimeline } from '../apps/harness-react/src/components/conversation/MiraConversationTimeline'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, layout: [] as Array<() => void>, effects: [] as Array<() => void>, virtualizer: undefined as unknown, virtualOptions: undefined as unknown }))
vi.mock('react', async importOriginal => {
  const memo = (factory: () => unknown, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => value !== slot.deps![index])) { slot.value = factory(); slot.deps = deps }
    return slot.value
  }
  const effect = (queue: Array<() => void>, callback: () => (() => void) | undefined, deps?: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!deps || !slot.deps || deps.some((value, index) => value !== slot.deps![index])) {
      slot.deps = deps
      queue.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
    }
  }
  return {
    ...await importOriginal<typeof import('react')>(),
    useState: (initial: unknown) => {
      const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slot.value, (next: unknown) => { slot.value = typeof next === 'function' ? next(slot.value) : next }]
    },
    useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
    useMemo: memo,
    useCallback: (callback: unknown, deps: readonly unknown[]) => memo(() => callback, deps),
    useLayoutEffect: (callback: () => (() => void) | undefined, deps?: readonly unknown[]) => effect(hooks.layout, callback, deps),
    useEffect: (callback: () => (() => void) | undefined, deps?: readonly unknown[]) => effect(hooks.effects, callback, deps),
  }
})
vi.mock('@tanstack/react-virtual', async importOriginal => ({ ...await importOriginal<typeof import('@tanstack/react-virtual')>(), useVirtualizer: (options: unknown) => { hooks.virtualOptions = options; return hooks.virtualizer } }))

let nextFrame = 0
const frames = new Map<number, FrameRequestCallback>()
const resizeObservers = new Set<{ callback: ResizeObserverCallback; targets: Set<Element> }>()
beforeEach(() => {
  hooks.cursor = 0; hooks.slots = []; hooks.layout = []; hooks.effects = []; frames.clear(); resizeObservers.clear()
  vi.stubGlobal('React', React)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('document', { activeElement: null })
  vi.stubGlobal('HTMLElement', class {})
  vi.stubGlobal('ResizeObserver', class {
    targets = new Set<Element>()
    constructor(public callback: ResizeObserverCallback) { resizeObservers.add(this) }
    observe(target: Element) { this.targets.add(target) }
    disconnect() { resizeObservers.delete(this); this.targets.clear() }
  })
})
afterEach(() => { hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }); vi.unstubAllGlobals() })

function mountTimeline(messages = projected([message('task-1', 'user'), message('answer-1', 'assistant'), message('task-2', 'user'), message('answer-2', 'assistant')]), liveMessageId?: string) {
  const listeners = new Map<string, EventListener>()
  const row = (id: string, top: number, bottom: number, index: number) => ({ dataset: { miraTurnId: id, userMessageId: id, index: String(index) }, top, bottom, querySelectorAll: () => [{}, {}], getBoundingClientRect: vi.fn(function (this: { top: number; bottom: number }) { return { top: this.top, bottom: this.bottom, height: this.bottom - this.top } }) })
  const first = row(messages[0].rendererId, 0, 500, 0), second = row('task-2', 600, 1200, 1)
  const users = [first, second], turns = [first, second]
  const viewport = {
    clientHeight: 600, scrollTop: 0,
    getBoundingClientRect: vi.fn(() => ({ top: 0 })),
    querySelectorAll: vi.fn((selector: string) => selector === '[data-user-message-id]' ? users : turns),
    closest: () => null,
    addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string, listener: EventListener) => { if (listeners.get(name) === listener) listeners.delete(name) }),
  }
  const column = { getBoundingClientRect: vi.fn(() => ({ width: 760 })) }
  const viewportRef = { current: viewport as unknown as HTMLDivElement }, actionsRef = { current: null as ConversationTimelineActions | null }
  let editingTurnIds: string[] = [], focusedTurnId: string | undefined
  const container = {
    closest: (selector: string) => selector === '.mira-message-column' ? column : viewportRef.current,
    getBoundingClientRect: () => ({ top: 0 }),
    firstElementChild: { style: { height: '1200px' } },
    querySelectorAll: (selector: string) => selector === '[data-mira-turn-id]' ? turns : editingTurnIds.map(id => ({ closest: () => ({ dataset: { miraTurnId: id } }) })),
    contains: () => Boolean(focusedTurnId),
  }
  const onActiveTurnChange = vi.fn()
  const props = { messages, memoryKey: null, liveMessageId, viewportRef, scrollActionsRef: { current: null }, actionsRef, components: { UserMessage: () => null, AssistantMessage: () => null }, onActiveTurnChange }
  let totalSize = 1200
  hooks.virtualizer = {
    getVirtualItems: () => { const options = hooks.virtualOptions as { count: number; getItemKey: (index: number) => string }; return Array.from({ length: options.count }, (_, index) => ({ index, key: options.getItemKey(index), start: index * 500 + 64, end: index * 500 + 564, size: 500 })) },
    getTotalSize: () => (hooks.virtualOptions as { count: number }).count ? totalSize : 0,
    measureElement: vi.fn(), resizeItem: vi.fn(), scrollToIndex: vi.fn(),
  }
  let retainInteractions: () => void = () => undefined
  const attach = (node: React.ReactNode) => {
    if (Array.isArray(node)) { node.forEach(attach); return }
    if (!React.isValidElement<Record<string, unknown>>(node)) return
    const ref = node.props.ref as { current: unknown } | undefined
    if (ref && typeof ref !== 'function') ref.current = node.props['data-mira-live-turn'] ? first : container
    if (node.props.onFocusCapture) retainInteractions = node.props.onFocusCapture as () => void
    attach(node.props.children as React.ReactNode)
  }
  const render = (updates: Partial<typeof props> = {}) => {
    Object.assign(props, updates); hooks.cursor = 0
    attach(MiraConversationTimeline(props))
    hooks.layout.splice(0).forEach(effect => effect()); hooks.effects.splice(0).forEach(effect => effect())
  }
  render()
  return {
    viewport, viewportRef, first, second, users, turns, onActiveTurnChange, render, actionsRef, scrollActionsRef: props.scrollActionsRef,
    editing: (ids: string[]) => { editingTurnIds = ids; retainInteractions(); render() },
    focusTurn: (id?: string) => {
      focusedTurnId = id
      document.activeElement = id ? Object.assign(new HTMLElement(), { closest: () => ({ dataset: { miraTurnId: id } }) }) : null
      retainInteractions(); render()
    },
    retainedRange: (startIndex: number, endIndex: number, count: number) => (hooks.virtualOptions as { rangeExtractor: (range: unknown) => number[] }).rangeExtractor({ startIndex, endIndex, count, overscan: 0 }),
    setTotalSize: (height: number) => { totalSize = height },
    frame: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)) },
    scroll: () => listeners.get('scroll')?.({} as Event),
    resize: (target = first) => resizeObservers.forEach(observer => { if (observer.targets.has(target as unknown as Element)) observer.callback([{ borderBoxSize: [{ blockSize: target.bottom - target.top }] } as unknown as ResizeObserverEntry], {} as ResizeObserver) }),
    unmount: () => hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }),
  }
}

function message(id: string, role: HarnessMessage['role'], extra: Partial<HarnessMessage> = {}): HarnessMessage {
  return { id, role, content: id, createdAt: 1, ...extra }
}
function projected(messages: HarnessMessage[]): TimelineRenderMessage[] {
  return projectTimelineRenderMessages(messages, 'timeline-session')
}

describe('Mira virtual conversation turn boundaries', () => {
  it('keeps accepted guides and assistant segments in their original task and canonical order', () => {
    const messages = projected([
      message('task', 'user'),
      message('first-segment', 'assistant', { runId: 'run' }),
      message('guide-1', 'user', { delivery: 'guide', runId: 'run' }),
      message('second-segment', 'assistant', { runId: 'run' }),
      message('guide-2', 'user', { delivery: 'guide', runId: 'run' }),
      message('stream-last-segment', 'assistant', { runId: 'run' }),
      message('next-task', 'user'),
      message('next-response', 'assistant', { runId: 'next-run' }),
    ])
    const turns = buildConversationRenderTurns(messages, 'stream-last-segment')
    const ids = turns.map(turn => turn.messageIndexes.map(index => messages[index].original.id))
    expect(ids).toEqual([
      ['task', 'first-segment', 'guide-1', 'second-segment', 'guide-2', 'stream-last-segment'],
      ['next-task', 'next-response'],
    ])
    expect(turns.map(turn => turn.id)).toEqual(['task', 'next-task'])
    expect(turns.flatMap(turn => turn.messageIndexes)).toEqual(messages.map((_, index) => index))
  })

  it('preserves orphan assistant history and a leading guide without inventing a user prompt', () => {
    const messages = projected([
      message('orphan-a', 'assistant'),
      message('orphan-b', 'assistant'),
      message('orphan-guide', 'user', { delivery: 'guide' }),
      message('task', 'user'),
      message('answer', 'assistant'),
    ])
    const turns = buildConversationRenderTurns(messages)
    expect(turns.map(turn => turn.messageIndexes.map(index => messages[index].original.id))).toEqual([
      ['orphan-a', 'orphan-b', 'orphan-guide'],
      ['task', 'answer'],
    ])
    const leadingGuide = projected([message('first-guide', 'user', { delivery: 'guide' }), message('answer', 'assistant')])
    expect(buildConversationRenderTurns(leadingGuide).map(turn => turn.messageIndexes)).toEqual([[0, 1]])
    expect(buildConversationRenderTurns([])).toEqual([])
  })

  it('marks only the explicitly current assistant as running, ignoring stale stream prefixes', () => {
    const messages = projected([
      message('old-task', 'user'),
      message('stream-old', 'assistant', { runId: 'old-run' }),
      message('new-task', 'user'),
      message('stream-current', 'assistant', { runId: 'current-run' }),
    ])
    expect(buildConversationRenderTurns(messages).map(turn => turn.running)).toEqual([false, false])
    expect(buildConversationRenderTurns(messages, 'missing').map(turn => turn.running)).toEqual([false, false])
    expect(buildConversationRenderTurns(messages, 'stream-current').map(turn => turn.running)).toEqual([false, true])
    expect(buildConversationRenderTurns(messages, messages[3].rendererId).map(turn => turn.running)).toEqual([false, true])
    // A stale active identity may mark its historical unit; it never marks the last unit as live.
    expect(buildConversationRenderTurns(messages, 'stream-old').at(-1)?.running).toBe(false)
  })

  it('keeps the task identity and assistant renderer identity stable when the live segment is persisted', () => {
    const before = projected([
      message('task', 'user'),
      message('stream-segment', 'assistant', { runId: 'run' }),
    ])
    const after = projected([
      message('task', 'user'),
      message('segment', 'assistant', { runId: 'run' }),
    ])
    expect(before[1].rendererId).toBe(after[1].rendererId)
    expect(buildConversationRenderTurns(before, 'stream-segment')[0].id).toBe(buildConversationRenderTurns(after)[0].id)
    expect(buildConversationRenderTurns(after)[0].running).toBe(false)
  })
})

describe('Mira virtual conversation message navigation index', () => {
  it.each(['true', 'false'])('expands the matching user body before find positions a live turn (measured overflow %s)', measured => {
    const dom = new Window(), view = mountTimeline(undefined, 'answer-2')
    dom.document.body.innerHTML = '<div data-user-message-id="task-2"><div data-mira-user-body data-expandable="true" data-expanded="false"><p data-mira-find-target="user-body">隐藏的匹配</p></div></div>'
    const target = dom.document.querySelector<HTMLElement>('[data-user-message-id]')!, body = target.querySelector<HTMLElement>('[data-mira-user-body]')!
    body.dataset.expandable = measured
    target.scrollIntoView = vi.fn()
    const ready = vi.fn(), reveal = vi.fn(() => { body.dataset.expanded = 'true' })
    body.addEventListener('mira-reveal-user-body', reveal)
    vi.stubGlobal('CustomEvent', dom.CustomEvent); vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    view.viewport.querySelectorAll.mockImplementation(selector => (selector === '[data-user-message-id], [data-assistant-message-id]' ? [target] : view.turns) as never)
    view.actionsRef.current!.jumpToMessage('task-2', 'center', ready, 'user-body')
    view.frame(); expect(reveal).toHaveBeenCalledOnce(); expect(ready).not.toHaveBeenCalled()
    view.frame(); expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'auto' }); expect(ready).toHaveBeenCalledOnce()
    body.dataset.expanded = 'false'; reveal.mockClear()
    view.actionsRef.current!.jumpToMessage('task-2'); view.frame()
    expect(reveal).not.toHaveBeenCalled(); expect(body.dataset.expanded).toBe('false')
  })

  it('focuses only its owner dock outside the scroll viewport without targeting another pane', () => {
    const dom = new Window(), view = mountTimeline()
    dom.document.body.innerHTML = '<div class="mira-conversation-root"><section tabindex="-1" data-interaction-id="main"></section></div><div class="mira-conversation-root" id="side-root"><div id="viewport"></div><section tabindex="-1" aria-label="计划确认" data-interaction-id="side"></section></div>'
    const card = dom.document.querySelector<HTMLElement>('[data-interaction-id="side"]')!
    card.scrollIntoView = vi.fn(); vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    view.viewportRef.current = dom.document.getElementById('viewport') as unknown as HTMLDivElement
    expect(view.actionsRef.current!.jumpToInteraction({ kind: 'interaction', id: 'main' })).toBe(false)
    expect(view.actionsRef.current!.jumpToInteraction({ kind: 'interaction', id: 'side' })).toBe(true)
    expect(dom.document.activeElement).toBe(card)
    expect(view.actionsRef.current!.jumpToInteraction()).toBe(true)
  })

  it('reveals an owner permission dock without pausing or scrolling the transcript', () => {
    const dom = new Window(), view = mountTimeline(), pause = vi.fn()
    dom.document.body.innerHTML = '<div class="mira-conversation-root"><section data-permission-request-id="other"></section></div><div class="mira-conversation-root"><div id="viewport"></div><div class="harness-composer-region"><div class="mira-interaction-dock"><section tabindex="-1" data-permission-request-id="owner"><p class="mira-tool-permission__detail"></p></section></div></div></div>'
    const card = dom.document.querySelector<HTMLElement>('[data-permission-request-id="owner"]')!, scroller = card.closest<HTMLElement>('.harness-composer-region')!
    const body = card.querySelector<HTMLElement>('.mira-tool-permission__detail')!; body.scrollTop = 100
    card.scrollIntoView = vi.fn(); scroller.scrollTop = 180
    view.scrollActionsRef.current = { pause } as never
    view.viewportRef.current = dom.document.getElementById('viewport') as unknown as HTMLDivElement
    expect(view.actionsRef.current!.jumpToInteraction({ kind: 'permission', id: 'other' })).toBe(false)
    expect(view.actionsRef.current!.jumpToInteraction({ kind: 'permission', id: 'owner' })).toBe(true)
    expect(dom.document.activeElement).toBe(card)
    expect(scroller.scrollTop).toBe(0)
    expect(body.scrollTop).toBe(0)
    expect(card.scrollIntoView).not.toHaveBeenCalled()
    expect(pause).not.toHaveBeenCalled()
  })

  it('reveals the exact owner card, ignores memory and other panes, and makes it keyboard reachable', () => {
    const dom = new Window(), view = mountTimeline()
    dom.document.body.innerHTML = '<div id="main"><section data-permission-request-id="main"></section></div><div id="side"><section class="pilot-action">记忆</section><section tabindex="-1" data-permission-request-id="side"></section><section tabindex="-1" aria-label="计划确认" data-interaction-id="plan"></section><section tabindex="-1" aria-label="澄清问题" data-interaction-id="question"></section></div>'
    const side = dom.document.getElementById('side')!, permission = side.querySelector<HTMLElement>('[data-permission-request-id]')!, plan = side.querySelector<HTMLElement>('[data-interaction-id="plan"]')!, question = side.querySelector<HTMLElement>('[data-interaction-id="question"]')!
    const wrong = vi.fn(), scrollPermission = vi.fn(), scrollPlan = vi.fn(), scrollQuestion = vi.fn()
    dom.document.querySelector<HTMLElement>('#main section')!.scrollIntoView = wrong
    side.querySelector<HTMLElement>('.pilot-action')!.scrollIntoView = wrong
    permission.scrollIntoView = scrollPermission; plan.scrollIntoView = scrollPlan; question.scrollIntoView = scrollQuestion
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    view.viewportRef.current = side as unknown as HTMLDivElement
    expect(view.actionsRef.current!.jumpToInteraction({ kind: 'permission', id: 'side' })).toBe(true)
    expect(scrollPermission).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'auto' }); expect(dom.document.activeElement).toBe(permission)
    expect(view.actionsRef.current!.jumpToInteraction({ kind: 'interaction', id: 'question' })).toBe(true)
    expect(scrollQuestion).toHaveBeenCalledOnce(); expect(dom.document.activeElement).toBe(question)
    expect(view.actionsRef.current!.jumpToInteraction()).toBe(true)
    expect(scrollPlan).toHaveBeenCalledOnce(); expect(dom.document.activeElement).toBe(plan)
    expect(view.actionsRef.current!.jumpToInteraction({ kind: 'permission', id: 'main' })).toBe(false)
    expect(wrong).not.toHaveBeenCalled()
  })

  it('mounts an offscreen approval message before revealing its card and cancels navigation on owner change', () => {
    const view = mountTimeline(), card = { dataset: { permissionRequestId: 'request' }, scrollIntoView: vi.fn(), focus: vi.fn(), closest: () => null }
    const answer = { dataset: { assistantMessageId: 'answer-1' }, scrollIntoView: vi.fn() }
    let mounted = false
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    view.viewport.querySelectorAll.mockImplementation((selector: string) => (selector === '[data-permission-request-id]' ? mounted ? [card] : [] : selector === '[data-user-message-id], [data-assistant-message-id]' ? mounted ? [answer] : [] : view.turns) as never)
    const virtualizer = hooks.virtualizer as { scrollToIndex: ReturnType<typeof vi.fn> }
    expect(view.actionsRef.current!.jumpToInteraction({ kind: 'permission', id: 'request', messageId: 'answer-1' })).toBe(true)
    expect(virtualizer.scrollToIndex).toHaveBeenCalledExactlyOnceWith(0, { align: 'start', behavior: 'auto' })
    expect(card.focus).not.toHaveBeenCalled(); mounted = true; view.frame()
    expect(card.scrollIntoView).toHaveBeenCalledOnce(); expect(card.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
    mounted = false; card.focus.mockClear()
    view.actionsRef.current!.jumpToInteraction({ kind: 'permission', id: 'request', messageId: 'answer-1' })
    view.render({ memoryKey: 'other-owner' }); mounted = true; view.frame()
    expect(card.focus).not.toHaveBeenCalled()
    expect(view.actionsRef.current!.jumpToInteraction({ kind: 'permission', id: 'missing', messageId: 'missing-message' })).toBe(false)
  })

  it('maps guide, original, stable renderer and unprefixed stream IDs to the same containing turn', () => {
    const messages = projected([
      message('first-task', 'user'),
      message('first-response', 'assistant', { runId: 'first-run' }),
      message('task', 'user'),
      message('before-guide', 'assistant', { runId: 'run' }),
      message('guide', 'user', { runId: 'run', delivery: 'guide' }),
      message('stream-after-guide', 'assistant', { runId: 'run' }),
    ])
    const index = indexConversationTurnMessages(buildConversationRenderTurns(messages, 'stream-after-guide'), messages)
    expect(index.get('first-task')).toBe(0)
    expect(index.get('first-response')).toBe(0)
    expect(index.get(messages[1].rendererId)).toBe(0)
    for (const id of ['task', 'before-guide', 'guide', 'stream-after-guide', 'after-guide', messages[3].rendererId, messages[5].rendererId]) {
      expect(index.get(id), id).toBe(1)
    }
    expect(index.get('missing')).toBeUndefined()
  })
})

describe('Mira bounded virtual turn measurements', () => {
  it('measures only the completed live turn after its final content has committed', () => {
    const messages = projected([message('task-1', 'user'), message('stream-answer', 'assistant')])
    const view = mountTimeline(messages, 'stream-answer')
    view.first.getBoundingClientRect.mockClear(); view.second.getBoundingClientRect.mockClear()
    view.first.bottom = 750
    view.render({ messages: projected([message('task-1', 'user'), message('answer', 'assistant', { content: 'Final answer grows the same keyed turn' })]), liveMessageId: undefined })
    expect((hooks.virtualizer as { resizeItem: ReturnType<typeof vi.fn> }).resizeItem).toHaveBeenCalledWith(0, 750)
    expect(view.first.getBoundingClientRect).toHaveBeenCalled()
    expect(view.second.getBoundingClientRect).not.toHaveBeenCalled()
  })

  it('keeps the latest live height when the same previously measured turn returns to history', () => {
    const view = mountTimeline()
    const options = hooks.virtualOptions as { measureElement: (element: Element, entry: ResizeObserverEntry | undefined, instance?: unknown) => number }
    const instance = { options: { getItemKey: () => 'task-1' }, indexFromElement: () => 0, itemSizeCache: new Map([['task-1', 500]]) }
    view.first.bottom = 750
    expect(options.measureElement(view.first as unknown as Element, undefined)).toBe(750)
    // The keyed DOM row keeps the same size across completion, so another
    // ResizeObserver event is not guaranteed to replace the older history size.
    expect(options.measureElement(view.first as unknown as Element, undefined, instance)).toBe(750)
    expect(view.first.getBoundingClientRect).toHaveBeenCalledTimes(1)
  })

  it('ignores zero-width observations while a pane collapses instead of caching wrapped or hidden heights', () => {
    const view = mountTimeline()
    const options = hooks.virtualOptions as { measureElement: (element: Element, entry: ResizeObserverEntry | undefined, instance?: unknown) => number }
    const instance = { options: { getItemKey: () => 'task-1', estimateSize: () => 72 }, indexFromElement: () => 0, itemSizeCache: new Map([['task-1', 500]]) }
    const element = view.first as unknown as Element
    const observation = (inlineSize: number, blockSize: number) => ({ borderBoxSize: [{ inlineSize, blockSize }] } as unknown as ResizeObserverEntry)
    expect(options.measureElement(element, observation(560, 500), instance)).toBe(500)
    for (const height of [0, 17671]) {
      expect(options.measureElement(element, observation(0, height), instance)).toBe(500)
      expect(options.measureElement(element, observation(0, height))).toBe(500)
    }
    instance.itemSizeCache.clear()
    expect(options.measureElement(element, undefined, instance)).toBe(500)
    // Real nonzero-width reflow measurements still replace the preserved size.
    expect(options.measureElement(element, observation(480, 750), instance)).toBe(750)
    expect(options.measureElement(element, undefined, instance)).toBe(750)
    expect(view.first.getBoundingClientRect).not.toHaveBeenCalled()
  })

  it('does not force layout for a newly mounted historical row before ResizeObserver reports its size', () => {
    const view = mountTimeline()
    const options = hooks.virtualOptions as { measureElement: (element: Element, entry: ResizeObserverEntry | undefined, instance?: unknown) => number }
    const instance = { options: { getItemKey: () => 'task-1', estimateSize: () => 72 }, indexFromElement: () => 0, itemSizeCache: new Map() }
    const element = Object.defineProperty(view.first, 'offsetHeight', { get() { throw new Error('Synchronous row layout') } })
    expect(options.measureElement(element as unknown as Element, undefined, instance)).toBe(72)
    expect(view.first.getBoundingClientRect).not.toHaveBeenCalled()
    expect(options.measureElement(element as unknown as Element, { borderBoxSize: [{ blockSize: 750 }] } as unknown as ResizeObserverEntry, instance)).toBe(750)
    // A remounted turn can reuse the observed height even before the virtualizer sees it.
    expect(options.measureElement(element as unknown as Element, undefined, instance)).toBe(750)
    expect(view.first.getBoundingClientRect).not.toHaveBeenCalled()
  })

  it('reuses a known row height on commit and accepts a fresh ResizeObserver height', () => {
    const view = mountTimeline()
    const options = hooks.virtualOptions as { measureElement: (element: Element, entry: ResizeObserverEntry | undefined, instance?: unknown) => number }
    const instance = { options: { getItemKey: (index: number) => `task-${index + 1}`, estimateSize: () => 72 }, indexFromElement: () => 0, itemSizeCache: new Map([['task-1', 500]]) }
    const element = view.first as unknown as Element
    view.first.bottom = 750
    expect(options.measureElement(element, undefined, instance)).toBe(500)
    expect(view.first.getBoundingClientRect).not.toHaveBeenCalled()
    expect(options.measureElement(element, { borderBoxSize: [{ blockSize: 750 }] } as unknown as ResizeObserverEntry, instance)).toBe(750)
    expect(view.first.getBoundingClientRect).not.toHaveBeenCalled()
    // Live completion does not have a virtualizer instance and must read its final size.
    expect(options.measureElement(element, undefined)).toBe(750)
    expect(view.first.getBoundingClientRect).toHaveBeenCalledTimes(1)
  })

  it('reads every restored row before applying size corrections, preserving the reading offset', () => {
    const view = mountTimeline()
    const events: string[] = []
    for (const row of view.turns) row.getBoundingClientRect.mockImplementation(() => { events.push(`read:${row.dataset.index}`); return { top: row.top, bottom: row.bottom, height: row.bottom - row.top } })
    const virtualizer = hooks.virtualizer as { measureElement: ReturnType<typeof vi.fn>; resizeItem: ReturnType<typeof vi.fn> }
    virtualizer.resizeItem.mockImplementation((index: number) => events.push(`resize:${index}`))
    virtualizer.measureElement.mockImplementation((element: typeof view.first) => { element.getBoundingClientRect(); events.push(`resize:${element.dataset.index}`) })
    const actions = view.actionsRef.current as unknown as { restore: (position: unknown, viewport: HTMLDivElement) => boolean }
    expect(actions.restore({ following: false, anchor: { turnId: 'task-1', offset: -120 } }, view.viewport as unknown as HTMLDivElement)).toBe(true)
    expect(events.slice(0, 4)).toEqual(['read:0', 'read:1', 'resize:0', 'resize:1'])
    expect(view.viewport.scrollTop).toBe(120)
  })

  it('retains 4000 measured turns and evicts the oldest written measurement', () => {
    const cache = createConversationHeightCache()
    for (let index = 0; index < 4000; index++) cache.save('turn-' + index, index + 100)
    expect(cache.estimate('turn-0')).toBe(100)
    expect(cache.estimate('turn-3999')).toBe(4099)
    cache.save('turn-4000', 4100)
    expect(cache.estimate('turn-0')).toBe(72)
    expect(cache.estimate('turn-1')).toBe(101)
    expect(cache.estimate('turn-3999')).toBe(4099)
    expect(cache.estimate('turn-4000')).toBe(4100)
  })

  it('refreshes overwritten measurements without consuming an additional cache slot', () => {
    const cache = createConversationHeightCache(2)
    cache.save('old-active-turn', 120)
    cache.save('inactive-turn', 200)
    cache.save('old-active-turn', 360)
    expect(cache.estimate('inactive-turn')).toBe(200)
    cache.save('new-turn', 480)
    expect(cache.estimate('old-active-turn')).toBe(360)
    expect(cache.estimate('inactive-turn')).toBe(72)
    expect(cache.estimate('new-turn')).toBe(480)
  })

  it('ignores invalid measurements without losing valid height or advancing eviction order', () => {
    const cache = createConversationHeightCache(2)
    cache.save('first', 160)
    cache.save('second', 240)
    for (const height of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      cache.save('first', height)
      cache.save('invalid', height)
    }
    expect(cache.estimate('first')).toBe(160)
    expect(cache.estimate('second')).toBe(240)
    expect(cache.estimate('invalid')).toBe(72)
    cache.save('third', 320)
    expect(cache.estimate('first')).toBe(72)
    expect(cache.estimate('second')).toBe(240)
    expect(cache.estimate('third')).toBe(320)
  })
})

describe('Mira virtual history retains only active editing and keyboard interactions', () => {
  it('keeps an offscreen editor through blur, releases it after cancel, and ignores deleted turn identities', () => {
    const view = mountTimeline()
    expect(view.retainedRange(1, 1, 2)).toEqual([1])
    view.editing(['task-1']); expect(view.retainedRange(1, 1, 2)).toEqual([0, 1])
    view.focusTurn('task-1'); view.focusTurn(); expect(view.retainedRange(1, 1, 2)).toEqual([0, 1])
    view.editing([]); expect(view.retainedRange(1, 1, 2)).toEqual([1])
    view.editing(['deleted-task']); expect(view.retainedRange(1, 1, 2)).toEqual([1])
  })

  it('keeps a focused tool in its owning turn and releases it when focus moves outside the conversation', () => {
    const view = mountTimeline()
    view.focusTurn('task-1'); expect(view.retainedRange(1, 1, 2)).toEqual([0, 1])
    view.focusTurn(); expect(view.retainedRange(1, 1, 2)).toEqual([1])
    view.focusTurn('task-2'); expect(view.retainedRange(0, 0, 2)).toEqual([0, 1])
    view.render({ messages: projected([message('task-1', 'user'), message('answer-1', 'assistant')]) })
    expect(view.retainedRange(0, 0, 1)).toEqual([0])
  })
})

describe('Mira Timeline active query lifecycle', () => {
  it('defers the first layout read and keeps one listener across unchanged renders', () => {
    const view = mountTimeline()
    expect(view.viewport.getBoundingClientRect).not.toHaveBeenCalled()
    expect(view.onActiveTurnChange).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    view.frame()
    expect(view.onActiveTurnChange).toHaveBeenCalledExactlyOnceWith('task-1')
    view.render(); view.render()
    expect(frames.size).toBe(0)
    expect(view.viewport.addEventListener).toHaveBeenCalledTimes(1)
    expect(view.viewport.removeEventListener).not.toHaveBeenCalled()
  })

  it('coalesces a scroll burst into one frame using the final visible query', () => {
    const view = mountTimeline()
    view.frame(); view.onActiveTurnChange.mockClear(); view.viewport.getBoundingClientRect.mockClear()
    for (let index = 0; index < 20; index++) view.scroll()
    view.first.top = -450; view.first.bottom = 20; view.second.top = 20
    expect(frames.size).toBe(1)
    expect(view.viewport.getBoundingClientRect).not.toHaveBeenCalled()
    expect(view.onActiveTurnChange).not.toHaveBeenCalled()
    view.frame()
    expect(view.viewport.getBoundingClientRect).toHaveBeenCalledTimes(1)
    expect(view.onActiveTurnChange).toHaveBeenCalledExactlyOnceWith('task-2')
  })

  it.each(['streaming messages', 'measured total height'])('updates the visible query after %s change without a scroll event', change => {
    const view = mountTimeline()
    view.frame(); view.onActiveTurnChange.mockClear(); view.viewport.getBoundingClientRect.mockClear()
    view.first.top = -450; view.first.bottom = 20; view.second.top = 20
    if (change === 'streaming messages') view.render({ messages: projected([message('task-1', 'user'), message('answer-1', 'assistant', { content: '新增流式回复' }), message('task-2', 'user'), message('answer-2', 'assistant')]) })
    else { view.setTotalSize(2200); view.render() }
    expect(view.viewport.getBoundingClientRect).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    view.frame()
    expect(view.onActiveTurnChange).toHaveBeenCalledExactlyOnceWith('task-2')
    expect(view.viewport.addEventListener).toHaveBeenCalledTimes(1)
  })

  it('updates an accepted guide when a tool expands above it in the live tail', () => {
    const view = mountTimeline(projected([
      message('task', 'user'), message('segment', 'assistant', { runId: 'run' }),
      message('guide', 'user', { delivery: 'guide', runId: 'run' }), message('stream-live', 'assistant', { runId: 'run' }),
    ]), 'stream-live')
    view.first.top = -300; view.first.bottom = 2000
    view.second.dataset.userMessageId = 'guide'; view.second.top = 20
    view.turns.splice(1)
    view.frame()
    expect(view.onActiveTurnChange).toHaveBeenLastCalledWith('guide')
    view.onActiveTurnChange.mockClear(); view.viewport.getBoundingClientRect.mockClear()
    // A tool's local expansion changes layout without changing messages, virtual history, or scrollTop.
    view.second.top = 180; view.first.bottom = 2400
    view.resize(); view.resize(); view.resize()
    expect(view.onActiveTurnChange).not.toHaveBeenCalled()
    expect(view.viewport.getBoundingClientRect).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    view.frame()
    expect(view.onActiveTurnChange).toHaveBeenCalledExactlyOnceWith('task')
  })

  it('cancels a queued update and removes its listener on unmount', () => {
    const view = mountTimeline()
    view.frame(); view.onActiveTurnChange.mockClear()
    view.scroll()
    expect(frames.size).toBe(1)
    view.unmount()
    expect(frames.size).toBe(0)
    expect(view.viewport.removeEventListener).toHaveBeenCalledExactlyOnceWith('scroll', view.viewport.addEventListener.mock.calls[0][1])
    expect(resizeObservers.size).toBe(0)
    view.scroll(); view.frame()
    expect(view.onActiveTurnChange).not.toHaveBeenCalled()
  })

  it.each(['hidden', 'replaced'])('does not publish active state from a %s viewport', kind => {
    const view = mountTimeline()
    view.frame(); view.onActiveTurnChange.mockClear(); view.viewport.getBoundingClientRect.mockClear()
    view.scroll()
    if (kind === 'hidden') view.viewport.clientHeight = 0
    else view.viewportRef.current = { clientHeight: 600 } as HTMLDivElement
    view.frame()
    expect(view.viewport.getBoundingClientRect).not.toHaveBeenCalled()
    expect(view.onActiveTurnChange).not.toHaveBeenCalled()
  })
})
