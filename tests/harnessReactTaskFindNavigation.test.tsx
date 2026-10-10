import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraTaskFind } from '../apps/harness-react/src/components/conversation/MiraTaskFind'
import type { MiraConversationFindBarProps } from '../apps/harness-react/src/components/conversation/MiraConversationFindBar'
import type { TimelineRenderMessage } from '../apps/harness-react/src/components/conversation/conversation-model'

// Exercise the shipped component's state, effect dependencies and cleanups in the
// Node test environment; DOM ranges and virtual-row landing are controlled below.
const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
const highlight = vi.hoisted(() => ({ apply: vi.fn(), clear: vi.fn(), reveal: vi.fn() }))
vi.mock('../apps/harness-react/src/lib/conversation-find-dom', () => ({ applyTaskFindHighlights: highlight.apply, clearTaskFindHighlights: highlight.clear, revealTaskFindRange: highlight.reveal }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true } }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useMemo: (callback: () => unknown, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = callback(); slot.deps = deps }
    return slot.value
  },
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))

type TaskFindProps = React.ComponentProps<typeof MiraTaskFind>
const frames = new Map<number, FrameRequestCallback>()
const observers = new Set<() => void>()
let nextFrame = 0
beforeEach(() => {
  hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; frames.clear(); observers.clear(); vi.clearAllMocks()
  vi.stubGlobal('React', React)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('MutationObserver', class {
    constructor(private callback: () => void) {}
    observe() { observers.add(this.callback) }
    disconnect() { observers.delete(this.callback) }
  })
})
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })

function messagesFor(session = 'task-a', complete = false): TimelineRenderMessage[] {
  return [
    { rendererId: `${session}-user`, original: { id: `${session}-user`, role: 'user', content: 'A task', createdAt: 1 } },
    { rendererId: `${session}-answer`, original: { id: `stream-${session}-answer`, role: 'assistant', content: 'needle and needle', runId: 'run', parts: [{ id: 'body', type: 'text', text: 'needle and needle', state: complete ? 'complete' : 'streaming', startedAt: 2 }], createdAt: 2 } },
    { rendererId: `${session}-guide`, original: { id: `${session}-guide`, role: 'user', delivery: 'guide', content: 'Continue', createdAt: 3 } },
    { rendererId: `${session}-tail`, original: { id: `stream-${session}-tail`, role: 'assistant', content: 'Still running', runId: 'run', createdAt: 4 } },
  ]
}

function mount(complete = false) {
  const listeners = new Map<string, Set<(event: Event) => void>>()
  const keys = new Set<(event: KeyboardEvent) => void>()
  const readerChild = { name: 'message body', closest: () => null }, findControl = { name: 'find control' }
  const readerInput = { name: 'input inside transcript', closest: () => ({ tagName: 'INPUT' }) }
  const composer = { name: 'composer', closest: () => null, focus: vi.fn() }
  const viewport = { contains: (target: unknown) => target === viewport || target === readerChild || target === readerInput }
  const root = {
    addEventListener(name: string, callback: (event: Event) => void) { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set) },
    removeEventListener(name: string, callback: (event: Event) => void) { listeners.get(name)?.delete(callback) },
  }
  vi.stubGlobal('document', { activeElement: composer, getElementById: () => root, querySelector: () => null })
  vi.stubGlobal('window', { addEventListener: (_: string, callback: (event: KeyboardEvent) => void) => keys.add(callback), removeEventListener: (_: string, callback: (event: KeyboardEvent) => void) => keys.delete(callback) })
  const range = { getBoundingClientRect: () => ({ top: 180 }) }
  highlight.apply.mockReturnValue(range)
  const jumps: Array<{ id: string; ready?: () => void; cancel: ReturnType<typeof vi.fn>; cancelled: boolean }> = []
  const jumpToMessage = vi.fn((id: string, _align?: ScrollLogicalPosition, ready?: () => void) => {
    const jump = { id, ready, cancel: vi.fn(), cancelled: false }
    jump.cancel.mockImplementation(() => { jump.cancelled = true })
    jumps.push(jump)
    return jump.cancel
  })
  const props: TaskFindProps = {
    active: true, sessionId: 'task-a', loading: false, requestId: 1,
    messages: messagesFor('task-a', complete), liveMessageId: 'stream-task-a-tail', changes: [],
    viewportRef: { current: viewport as unknown as HTMLDivElement },
    timelineRef: { current: { restore: () => undefined, jumpToMessage, jumpToInteraction: () => false } },
    changesRef: { current: null }, onOpenChanges: vi.fn(async () => undefined),
  }
  let tree: React.ReactElement<MiraConversationFindBarProps>
  const render = () => {
    let renders = 0
    do {
      hooks.cursor = 0; hooks.dirty = false
      tree = MiraTaskFind(props)
      hooks.effects.splice(0).forEach(effect => effect())
      if (++renders > 15) throw new Error('Task find state did not settle')
    } while (hooks.dirty)
  }
  const frame = () => {
    const pending = [...frames.entries()]
    for (const [id, callback] of pending) { frames.delete(id); callback(0) }
    if (hooks.dirty) render()
  }
  const flush = () => { for (let index = 0; index < 8 && frames.size; index++) frame() }
  const update = (patch: Partial<TaskFindProps>) => { Object.assign(props, patch); render() }
  const emit = (name: string, target: unknown, options: Record<string, unknown> = {}) => listeners.get(name)?.forEach(callback => callback({ target, key: '', defaultPrevented: false, isComposing: false, metaKey: false, ctrlKey: false, altKey: false, ...options } as unknown as Event))
  const ready = (index = jumps.length - 1) => { if (!jumps[index].cancelled) jumps[index].ready?.() }
  render()
  return {
    props, jumps, jumpToMessage, readerChild, readerInput, findControl, composer, viewport, frame, flush, ready, update, emit,
    bar: () => tree.props,
    query: () => { tree.props.onQueryChange('needle'); render() },
    next: () => { tree.props.onNavigate(1); render() },
    close: () => { tree.props.onClose(); render() },
    mutate: () => observers.forEach(callback => callback()),
    unmount: () => hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }),
  }
}

describe('task find navigation lifecycle across live and virtual history', () => {
  it('waits for row readiness again before revealing a text part that became complete', () => {
    const view = mount(); view.query()
    expect(view.bar().count).toBe(2); expect(view.jumpToMessage).toHaveBeenCalledExactlyOnceWith('task-a-answer', 'center', expect.any(Function))
    view.flush(); expect(highlight.reveal).not.toHaveBeenCalled()
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalledWith(expect.anything(), view.viewport)
    highlight.reveal.mockClear()
    view.update({ messages: messagesFor('task-a', true) })
    expect(view.jumps[0].cancel).toHaveBeenCalled(); expect(view.jumps).toHaveLength(2)
    view.mutate(); view.flush(); expect(highlight.reveal).not.toHaveBeenCalled()
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled()
  })

  it('repositions an already-complete earlier part when its guided live turn finally becomes history', () => {
    const view = mount(true); view.query(); view.ready(); view.flush()
    expect(view.jumps).toHaveLength(1)
    highlight.reveal.mockClear()
    // The selected part did not change; only the later segment ending removes the live tail.
    view.update({ liveMessageId: undefined })
    expect(view.jumps).toHaveLength(2); expect(view.jumps[1].id).toBe('task-a-answer')
    view.flush(); expect(highlight.reveal).not.toHaveBeenCalled()
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled()
  })

  it.each(['wheel', 'pointerdown'])('preserves %s takeover through completion and lets explicit next start new navigation', event => {
    const view = mount(); view.query()
    view.emit(event, view.readerChild)
    expect(view.jumps[0].cancel).toHaveBeenCalled()
    view.ready(); view.flush(); expect(highlight.reveal).not.toHaveBeenCalled()
    view.update({ messages: messagesFor('task-a', true), liveMessageId: undefined })
    view.mutate(); view.flush()
    expect(view.jumps).toHaveLength(1); expect(highlight.reveal).not.toHaveBeenCalled()
    expect(highlight.apply).toHaveBeenCalled()
    view.next()
    expect(view.bar().index).toBe(1); expect(view.jumps).toHaveLength(2)
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled()
  })

  it('keeps a reader who moved away after successful positioning from being pulled back on terminal migration', () => {
    const view = mount(true); view.query(); view.ready(); view.flush()
    expect(highlight.reveal).toHaveBeenCalled(); highlight.reveal.mockClear()
    view.emit('wheel', view.viewport)
    view.update({ liveMessageId: undefined }); view.mutate(); view.flush()
    expect(view.jumps).toHaveLength(1); expect(highlight.reveal).not.toHaveBeenCalled()
  })

  it.each([{ key: 'PageUp', settled: false }, { key: 'Home', settled: true }])('preserves $key keyboard takeover through terminal migration (settled=$settled)', ({ key, settled }) => {
    const view = mount(true); view.query()
    if (settled) { view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled(); highlight.reveal.mockClear() }
    view.emit('keydown', view.readerChild, { key })
    expect(view.jumps[0].cancel).toHaveBeenCalled()
    view.ready(); view.flush(); expect(highlight.reveal).not.toHaveBeenCalled()
    view.update({ liveMessageId: undefined }); view.mutate(); view.flush()
    expect(view.jumps).toHaveLength(1); expect(highlight.reveal).not.toHaveBeenCalled()
    view.next(); view.ready(); view.flush()
    expect(view.jumps).toHaveLength(2); expect(highlight.reveal).toHaveBeenCalled()
  })

  it.each([
    { label: 'already consumed', options: { defaultPrevented: true } },
    { label: 'IME composition', options: { isComposing: true } },
    { label: 'Meta modified', options: { metaKey: true } },
    { label: 'Control modified', options: { ctrlKey: true } },
    { label: 'Alt modified', options: { altKey: true } },
  ])('does not treat $label PageUp as keyboard reading takeover', ({ options }) => {
    const view = mount(true); view.query()
    view.emit('keydown', view.readerChild, { key: 'PageUp', ...options })
    expect(view.jumps[0].cancel).not.toHaveBeenCalled()
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled(); highlight.reveal.mockClear()
    view.update({ liveMessageId: undefined })
    expect(view.jumps).toHaveLength(2)
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled()
  })

  it('does not cancel find navigation for keys in an input within the transcript', () => {
    const view = mount(true); view.query()
    view.emit('keydown', view.readerInput, { key: 'Home' })
    expect(view.jumps[0].cancel).not.toHaveBeenCalled()
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled(); highlight.reveal.mockClear()
    view.update({ liveMessageId: undefined })
    expect(view.jumps).toHaveLength(2)
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled()
  })

  it.each(['findControl', 'composer'] as const)('does not treat a %s click as transcript reading takeover', target => {
    const view = mount(); view.query()
    view.emit('pointerdown', view[target])
    expect(view.jumps[0].cancel).not.toHaveBeenCalled()
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled()
    highlight.reveal.mockClear()
    view.update({ messages: messagesFor('task-a', true), liveMessageId: undefined })
    expect(view.jumps).toHaveLength(2)
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled()
  })

  it('cancels pending landing and highlighting when closed, even if a stale ready callback arrives', () => {
    const view = mount(); view.query(); const old = view.jumps[0]
    view.close()
    expect(view.bar()).toMatchObject({ open: false, query: '' }); expect(old.cancel).toHaveBeenCalled()
    highlight.apply.mockClear(); highlight.reveal.mockClear()
    old.ready?.(); view.mutate(); view.flush()
    expect(highlight.apply).not.toHaveBeenCalled(); expect(highlight.reveal).not.toHaveBeenCalled()
    expect(observers.size).toBe(0); expect(frames.size).toBe(0); expect(highlight.clear).toHaveBeenCalled()
  })

  it('cancels the old task landing and waits for the new task before revealing', () => {
    const view = mount(); view.query(); const old = view.jumps[0]
    view.update({ sessionId: 'task-b', messages: messagesFor('task-b'), liveMessageId: 'stream-task-b-tail' })
    expect(old.cancel).toHaveBeenCalled(); expect(view.jumps.at(-1)?.id).toBe('task-b-answer')
    old.ready?.(); view.flush(); expect(highlight.reveal).not.toHaveBeenCalled()
    view.ready(); view.flush(); expect(highlight.reveal).toHaveBeenCalled()
  })

  it('cancels pending navigation and observer work on unmount', () => {
    const view = mount(); view.query(); const old = view.jumps[0]
    view.unmount(); old.ready?.(); view.mutate(); view.flush()
    expect(old.cancel).toHaveBeenCalled(); expect(highlight.reveal).not.toHaveBeenCalled()
    expect(observers.size).toBe(0); expect(frames.size).toBe(0)
  })
})
