// @vitest-environment happy-dom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AssistantRuntimeProvider, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraWorkbenchViewport } from '../apps/harness-react/src/components/workbench/HarnessWorkbench'
import { ConversationTurnRail } from '../apps/harness-react/src/components/conversation/ConversationTurnRail'
import { useConversationScroll, type ConversationScrollActions } from '../apps/harness-react/src/hooks/useConversationScroll'
import { conversationScrollMemory } from '../apps/harness-react/src/lib/conversation-scroll'
import type { ConversationScrollPosition } from '../apps/harness-react/src/lib/conversation-scroll'
import type { ConversationTimelineActions } from '../apps/harness-react/src/lib/conversation-timeline'

const hooks = vi.hoisted(() => ({ realLifecycle: false, cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>()
  return {
  ...original,
  useRef: (initial: unknown) => { if (hooks.realLifecycle) return original.useRef(initial); const slot = hooks.slots[hooks.cursor++] ??= { value: { current: initial } }; return slot.value },
  useState: (initial: unknown) => {
    if (hooks.realLifecycle) return original.useState(initial)
    const slot = hooks.slots[hooks.cursor++] ??= { value: initial }
    return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
  },
  useCallback: (callback: unknown, deps: readonly unknown[]) => {
    if (hooks.realLifecycle) return original.useCallback(callback as (...args: unknown[]) => unknown, deps)
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => value !== slot.deps![index])) { slot.value = callback; slot.deps = deps }
    return slot.value
  },
  useLayoutEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    if (hooks.realLifecycle) return original.useLayoutEffect(callback, deps)
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => value !== slot.deps![index])) {
      slot.deps = deps
      hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
    }
  },
  }
})

let nextFrame = 0, nextMemory = 0
const frames = new Map<number, FrameRequestCallback>()
const resizeCallbacks = new Set<() => void>()
beforeEach(() => {
  hooks.realLifecycle = false; hooks.cursor = 0; hooks.slots = []; hooks.effects = []; frames.clear(); resizeCallbacks.clear()
  vi.stubGlobal('React', React)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class {
    private targets = new Set<HTMLElement>()
    private notify = () => this.callback([...this.targets].map(target => ({ target, borderBoxSize: [{ inlineSize: target.offsetWidth ?? 0, blockSize: target.offsetHeight ?? 0 }] })) as ResizeObserverEntry[])
    constructor(private callback: (entries: ResizeObserverEntry[]) => void) {}
    observe(target: HTMLElement) { this.targets.add(target); resizeCallbacks.add(this.notify) }
    unobserve(target: HTMLElement) { this.targets.delete(target); if (!this.targets.size) resizeCallbacks.delete(this.notify) }
    disconnect() { this.targets.clear(); resizeCallbacks.delete(this.notify) }
  })
})
const domRoots = new Set<Root>()
afterEach(async () => {
  if (domRoots.size) await React.act(async () => { domRoots.forEach(root => root.unmount()); domRoots.clear() })
  document.body.replaceChildren()
  hooks.slots.forEach(slot => slot.cleanup?.()); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

async function mountReactViewport() {
  hooks.realLifecycle = true
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const metrics = { height: 1800 }
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-message-viewport') ? 600 : this.classList.contains('mira-turn-rail__items') ? 200 : 0 })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-turn-rail__items') ? 200 : 0 })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () { return this.classList.contains('mira-turn-rail__items') ? 36 : 0 })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-message-viewport') ? metrics.height : this.classList.contains('mira-turn-rail__items') ? Number.parseFloat((this.firstElementChild as HTMLElement)?.style.height ?? '0') : 0 })
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function (options) {
    this.scrollTop = typeof options === 'object' ? options.top ?? 0 : 0
    queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
  })
  const refs: Array<HTMLDivElement | null> = []
  let node: HTMLDivElement | null = null
  const viewportRef = {
    get current() { return node },
    set current(value: HTMLDivElement | null) {
      refs.push(value); node = value
      if (value) value.scrollTo = options => { value.scrollTop = Math.min(Math.max(0, metrics.height - 600), (options as ScrollToOptions)?.top ?? 0) }
    },
  }
  const actionsRef = { current: null as ConversationScrollActions | null }, timelineRef = { current: null as ConversationTimelineActions | null }
  const onBottomChange = vi.fn(), onNavigate = vi.fn()
  const memoryPrefix = 'react-viewport-' + ++nextMemory
  const options = { parentVersion: 0, text: '原回复', approval: '', owner: 'first', ready: true, count: 3 }
  const railMessages = [{ id: 'u1', role: 'user' as const, content: '第一轮', createdAt: 1 }, { id: 'a1', role: 'assistant' as const, content: '回复', createdAt: 2 }, { id: 'u2', role: 'user' as const, content: '第二轮', createdAt: 3 }]
  function Host() {
    const messages = React.useMemo(() => railMessages.slice(0, options.count).map(message => ({ id: message.id, role: message.role, content: [{ type: 'text' as const, text: message.content }], createdAt: new Date(message.createdAt) })), [options.count])
    const adapter = React.useMemo(() => ({ messages, convertMessage: (message: typeof messages[number]) => message, onNew: async () => undefined }), [messages])
    const runtime = useExternalStoreRuntime(adapter)
    const [activeId, setActiveId] = React.useState('u1')
    return React.createElement(AssistantRuntimeProvider, { runtime }, React.createElement(ThreadPrimitive.Root, null,
      React.createElement('span', null, options.parentVersion),
      React.createElement(ConversationTurnRail, { messages: railMessages, activeId, onNavigate: id => { onNavigate(id, options.parentVersion); setActiveId(id); actionsRef.current?.pause(); if (node) { node.scrollTop = id === 'u1' ? 0 : 400; node.dispatchEvent(new Event('scroll')) } } }),
      React.createElement(MiraWorkbenchViewport, {
        key: options.owner, memoryKey: memoryPrefix + options.owner, viewportRef, actionsRef, timelineRef, active: true, ready: options.ready, hasContent: true,
        messageWindow: JSON.stringify([messages.length, messages[0]?.id, messages.at(-1)?.id]), onBottomChange,
        children: React.createElement('div', null, React.createElement('article', { 'aria-label': '回复正文' }, options.text), options.approval && React.createElement('section', { 'aria-label': '审批确认' }, options.approval)),
      }),
    ))
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container); domRoots.add(root)
  const flushFrames = async () => {
    for (let iteration = 0; frames.size && iteration < 10; iteration++) await React.act(async () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(performance.now())) })
    expect(frames.size).toBe(0)
  }
  const render = async (updates: Partial<typeof options> = {}) => {
    Object.assign(options, updates)
    await React.act(async () => root.render(React.createElement(Host)))
    await flushFrames()
  }
  await render()
  refs.length = 0
  return {
    refs, viewportRef, actionsRef, container, metrics, onNavigate, render,
    resize: async () => { await React.act(async () => resizeCallbacks.forEach(callback => callback())); await flushFrames() },
    unmount: async () => { await React.act(async () => root.unmount()); domRoots.delete(root) },
  }
}

function mount(saved?: ConversationScrollPosition, timelineRef?: { current: ConversationTimelineActions | null }) {
  const listeners = new Map<string, (event: unknown) => void>()
  const node = {
    scrollTop: 0, scrollHeight: 2400, clientHeight: 600, firstElementChild: {},
    getBoundingClientRect: vi.fn(() => ({ top: 0 })), querySelectorAll: vi.fn(() => []),
    addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  }
  const memoryKey = 'follow-race-' + ++nextMemory
  if (saved) conversationScrollMemory.save(memoryKey, saved)
  const viewportRef = { current: null as HTMLDivElement | null }
  const actionsRef = { current: null as ConversationScrollActions | null }
  const onBottomChange = vi.fn()
  let scroll: ReturnType<typeof useConversationScroll>
  const render = () => {
    hooks.cursor = 0
    scroll = useConversationScroll({ memoryKey, active: true, ready: true, viewportRef, actionsRef, timelineRef, onBottomChange })
    return scroll
  }
  render().ref(node as unknown as HTMLDivElement)
  hooks.effects.splice(0).forEach(effect => effect())
  for (let frame = 0; frame < 2; frame++) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(frame)) }
  return {
    node, actionsRef, onBottomChange,
    following: () => render().autoScroll,
    saved: () => conversationScrollMemory.read(memoryKey),
    emit: (name: string, event: unknown = {}) => listeners.get(name)!(event),
    resize: () => resizeCallbacks.forEach(callback => callback()),
    frame: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)) },
    rebind: () => { scroll.ref(null); scroll.ref(node as unknown as HTMLDivElement) },
    detach: () => scroll.ref(null),
    unmount: () => hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }),
  }
}

describe('conversation follow intent across streamed layout changes', () => {
  it('keeps bottom-follow memory without measuring an unused historical anchor', () => {
    const view = mount()
    expect(view.saved()?.following).toBe(true)
    expect(view.node.getBoundingClientRect).not.toHaveBeenCalled()
    expect(view.node.querySelectorAll).not.toHaveBeenCalled()
    view.node.scrollHeight = 2800; view.resize()
    expect(view.node.scrollTop).toBe(2200)
    expect(view.node.getBoundingClientRect).not.toHaveBeenCalled()
  })

  it('does not read layout or replace saved history when assistant-ui recomposes the same viewport ref', () => {
    const view = mount()
    view.emit('wheel', { deltaY: -400 }); view.node.scrollTop = 900; view.emit('scroll')
    const saved = view.saved()
    view.node.getBoundingClientRect.mockClear(); view.node.querySelectorAll.mockClear()
    view.rebind(); view.rebind()
    expect(view.node.getBoundingClientRect).not.toHaveBeenCalled()
    expect(view.node.querySelectorAll).not.toHaveBeenCalled()
    expect(view.saved()).toEqual(saved)
    expect(view.following()).toBe(false)
  })

  it('captures the owning viewport on real cleanup even after the library detached its ref', () => {
    const view = mount()
    view.actionsRef.current!.pause()
    view.detach()
    // A final browser layout may settle before the owning effect cleans up.
    view.node.scrollTop = 950; view.node.scrollHeight = 2600
    view.unmount()
    expect(view.saved()).toMatchObject({ scrollTop: 950, scrollHeight: 2600, following: false })
    expect(view.actionsRef.current).toBeNull()
  })

  it('keeps following when a delayed scroll comes from content shrinkage and regrowth without a user gesture', () => {
    const view = mount()
    expect(view.node.scrollTop).toBe(1800)
    // Browser clamps during a temporary shrink, then new text grows before its queued scroll event.
    view.node.scrollTop = 1500; view.node.scrollHeight = 2300
    view.emit('scroll')
    expect(view.following()).toBe(true)
    view.resize()
    expect(view.node.scrollTop).toBe(1700)
    expect(view.saved()?.following).toBe(true)
  })

  it('resumes following the new bottom even when text grows before the library observes the resumed render', () => {
    const view = mount()
    view.emit('wheel', { deltaY: -400 }); view.node.scrollTop = 900; view.emit('scroll')
    expect(view.following()).toBe(false)
    view.actionsRef.current!.resume()
    expect(view.node.scrollTop).toBe(1800)
    view.node.scrollHeight = 3000
    view.resize()
    expect(view.node.scrollTop).toBe(2400)
    expect(view.following()).toBe(true)
    view.node.scrollHeight = 3300; view.resize()
    expect(view.node.scrollTop).toBe(2700)
  })

  it('honors scrollbar ownership when an upward gesture coincides with growing output', () => {
    const view = mount()
    view.emit('pointerdown', { target: view.node })
    view.node.scrollTop = 1100; view.node.scrollHeight = 2800; view.emit('scroll')
    view.resize()
    expect(view.node.scrollTop).toBe(1100)
    expect(view.following()).toBe(false)
    expect(view.saved()?.following).toBe(false)
  })

  it('keeps historical reading fixed while new output resizes the content', () => {
    const view = mount()
    view.emit('wheel', { deltaY: -500 }); view.node.scrollTop = 1000; view.emit('scroll')
    view.node.scrollHeight = 3600; view.resize()
    expect(view.node.scrollTop).toBe(1000)
    expect(view.following()).toBe(false)
  })

  it('resumes from a multi-event wheel scroll that reaches the bottom and follows later growth', () => {
    const view = mount()
    view.emit('wheel', { deltaY: -600 }); view.node.scrollTop = 900; view.emit('scroll')
    view.emit('wheel', { deltaY: 1000 })
    for (const top of [1100, 1500, 1800]) { view.node.scrollTop = top; view.emit('scroll') }
    expect(view.following()).toBe(true)
    view.node.scrollHeight = 3000; view.resize()
    expect(view.node.scrollTop).toBe(2400)
  })

  it('retains the historical anchor until its offscreen virtual turn has mounted and measured', () => {
    const saved = { scrollTop: 12000, scrollHeight: 20000, clientHeight: 600, following: false, anchor: { turnId: 'older-turn', offset: -130 } }
    const restore = vi.fn(() => false)
    const view = mount(saved, { current: { restore, jumpToMessage: vi.fn(), jumpToInteraction: () => false } })
    expect(restore).toHaveBeenCalledWith(saved, view.node)
    expect(view.saved()).toEqual(saved)
    expect(view.actionsRef.current!.isRestoring()).toBe(true)
    restore.mockImplementation(() => { view.node.scrollTop = 1400; return true })
    view.frame()
    expect(view.node.scrollTop).toBe(1400)
    expect(view.saved()?.following).toBe(false)
    expect(view.actionsRef.current!.isRestoring()).toBe(false)
  })

  it('lets user history navigation cancel a pending virtual restoration', () => {
    const saved = { scrollTop: 12000, scrollHeight: 20000, clientHeight: 600, following: false, anchor: { turnId: 'older-turn', offset: -130 } }
    const restore = vi.fn(() => false)
    const view = mount(saved, { current: { restore, jumpToMessage: vi.fn(), jumpToInteraction: () => false } })
    view.actionsRef.current!.pause()
    const calls = restore.mock.calls.length
    view.frame(); view.resize()
    expect(restore).toHaveBeenCalledTimes(calls)
    expect(view.actionsRef.current!.isRestoring()).toBe(false)
    expect(view.following()).toBe(false)
  })
})

describe('Workbench viewport real React lifecycle', () => {
  it('keeps the viewport ref attached during unrelated parent renders and live reply or approval updates', async () => {
    const view = await mountReactViewport()
    const original = view.viewportRef.current
    for (let parentVersion = 1; parentVersion <= 3; parentVersion++) await view.render({ parentVersion })
    expect(view.refs).toEqual([])
    await view.render({ text: '新增流式回复', approval: '允许执行工具吗？' })
    expect(view.container.querySelector('[aria-label="回复正文"]')?.textContent).toBe('新增流式回复')
    expect(view.container.querySelector('[aria-label="审批确认"]')?.textContent).toBe('允许执行工具吗？')
    expect(view.viewportRef.current).toBe(original)
    expect(view.refs).toEqual([])
    await view.render({ approval: '' })
    expect(view.container.querySelector('[aria-label="审批确认"]')).toBeNull()
    expect(view.refs).toEqual([])
  })

  it('retains real rail handlers and pause/resume intent through parent updates and content growth', async () => {
    const view = await mountReactViewport()
    expect(view.viewportRef.current!.scrollTop).toBe(1200)
    await view.render({ parentVersion: 7 })
    await React.act(async () => (view.container.querySelector('button[aria-label="跳转到第 2 轮"]') as HTMLButtonElement).click())
    expect(view.onNavigate).toHaveBeenLastCalledWith('u2', 7)
    expect(view.container.querySelector('[aria-current="location"]')?.getAttribute('data-turn-id')).toBe('u2')
    expect(view.actionsRef.current!.isFollowing()).toBe(false)
    expect(view.viewportRef.current!.scrollTop).toBe(400)
    view.refs.length = 0
    await view.render({ text: '继续输出', parentVersion: 8 })
    expect(view.refs).toEqual([])
    view.metrics.height = 2300; await view.resize()
    expect(view.viewportRef.current!.scrollTop).toBe(400)
    await React.act(async () => view.actionsRef.current!.resume())
    expect(view.actionsRef.current!.isFollowing()).toBe(true)
    view.metrics.height = 2600; await view.resize()
    expect(view.viewportRef.current!.scrollTop).toBe(2000)
  })

  it('allows readiness and message-window updates, replaces a keyed owner, and cleans up the real unmount', async () => {
    const view = await mountReactViewport()
    const original = view.viewportRef.current!
    await view.render({ ready: false })
    expect(original.style.visibility).toBe('hidden')
    await view.render({ ready: true, count: 2 })
    expect(original.style.visibility).toBe('')
    view.refs.length = 0
    await view.render({ owner: 'second' })
    expect(original.isConnected).toBe(false)
    expect(view.viewportRef.current).not.toBe(original)
    expect(view.refs).toContain(null)
    await view.unmount()
    expect(view.viewportRef.current).toBeNull()
    expect(view.actionsRef.current).toBeNull()
    expect(frames.size).toBe(0)
    expect(resizeCallbacks.size).toBe(0)
  })
})
