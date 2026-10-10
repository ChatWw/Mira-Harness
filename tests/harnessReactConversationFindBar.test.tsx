import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraConversationFindBar, type MiraConversationFindBarProps } from '../apps/harness-react/src/components/conversation/MiraConversationFindBar'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useId: () => 'mira-find-description',
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))

const listeners = new Set<(event: KeyboardEvent) => void>()
const frames = new Map<number, FrameRequestCallback>()
const keyboard = (key: string, options: Record<string, unknown> = {}) => {
  const event = { key, shiftKey: false, isComposing: false, keyCode: 0, defaultPrevented: false, preventDefault: vi.fn(() => { event.defaultPrevented = true }), ...options }
  return event
}

function fixture(overrides: Partial<MiraConversationFindBarProps> = {}) {
  const props: MiraConversationFindBarProps = { open: true, focusRequestId: 1, query: 'Mira', scope: 'conversation', count: 3, index: 0, onQueryChange: vi.fn(), onScopeChange: vi.fn(), onNavigate: vi.fn(), onClose: vi.fn(), ...overrides }
  const input = { focus: vi.fn() }
  let tree: React.ReactNode
  const visit = (node: React.ReactNode, callback: (element: React.ReactElement<Record<string, unknown>>) => void) => {
    if (Array.isArray(node)) return node.forEach(child => visit(child, callback))
    if (!React.isValidElement<Record<string, unknown>>(node)) return
    callback(node); visit(node.props.children as React.ReactNode, callback)
  }
  const find = (match: (props: Record<string, unknown>, element: React.ReactElement<Record<string, unknown>>) => boolean) => {
    let found: Record<string, unknown> | undefined
    visit(tree, element => { if (!found && match(element.props, element)) found = element.props })
    if (!found) throw new Error('Find control not found')
    return found
  }
  const render = () => {
    hooks.cursor = 0; tree = MiraConversationFindBar(props)
    visit(tree, element => { if (element.type === 'input') (element.props.ref as React.RefObject<unknown>).current = input })
    hooks.effects.splice(0).forEach(effect => effect())
  }
  const flushFrames = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }
  const inputProps = () => find((_, element) => element.type === 'input')
  const key = (value: string, options: Record<string, unknown> = {}) => {
    const native = keyboard(value, options)
    ;(inputProps().onKeyDown as (event: unknown) => void)({ ...native, nativeEvent: native })
    return native
  }
  const dispatch = (value: string, options: Record<string, unknown> = {}) => { const native = keyboard(value, options); listeners.forEach(listener => listener(native as unknown as KeyboardEvent)); return native }
  const click = (label: string) => { (find(props => props['aria-label'] === label).onClick as () => void)() }
  render()
  return { props, input, inputProps, render, flushFrames, find, key, dispatch, click, tree: () => tree }
}

beforeEach(() => {
  hooks.cursor = 0; hooks.slots = []; hooks.effects = []; listeners.clear(); frames.clear()
  vi.stubGlobal('React', React)
  vi.stubGlobal('document', { getElementById: () => null })
  let nextFrame = 0
  vi.stubGlobal('window', { requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame }, cancelAnimationFrame: (id: number) => frames.delete(id), addEventListener: (_: string, listener: (event: KeyboardEvent) => void) => listeners.add(listener), removeEventListener: (_: string, listener: (event: KeyboardEvent) => void) => listeners.delete(listener) })
})
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })

describe('Mira conversation find bar shipped interactions', () => {
  it('renders a nonmodal labelled bar and controlled input without mutating the query', () => {
    const view = fixture()
    expect(view.find(props => props.role === 'dialog')['aria-modal']).toBe('false')
    expect(view.inputProps().value).toBe('Mira')
    expect(view.find(props => props.className === 'mira-conversation-find__count').children).toBe('1/3')
    ;(view.inputProps().onChange as (event: unknown) => void)({ target: { value: '新词' } })
    expect(view.props.onQueryChange).toHaveBeenCalledExactlyOnceWith('新词')
    expect(view.inputProps().value).toBe('Mira')
    expect(view.props.onClose).not.toHaveBeenCalled()
  })

  it('focuses on open and repeated focus requests while cancelling stale scheduled focus', () => {
    const view = fixture(); view.flushFrames(); expect(view.input.focus).toHaveBeenCalledOnce()
    view.render(); view.flushFrames(); expect(view.input.focus).toHaveBeenCalledOnce()
    view.props.focusRequestId++; view.render(); view.flushFrames(); expect(view.input.focus).toHaveBeenCalledTimes(2)
    view.props.focusRequestId++; view.render()
    view.props.open = false; view.render(); view.flushFrames()
    expect(view.input.focus).toHaveBeenCalledTimes(2)
    expect(view.tree()).toBeNull(); expect(listeners.size).toBe(0)
  })

  it('uses the same directional callbacks for buttons, Enter and arrow keys including a single match', () => {
    const view = fixture({ count: 1 })
    view.click('上一处匹配'); view.click('下一处匹配')
    for (const [key, shiftKey] of [['Enter', false], ['Enter', true], ['ArrowUp', false], ['ArrowDown', false]] as const) expect(view.key(key, { shiftKey }).preventDefault).toHaveBeenCalledOnce()
    expect(vi.mocked(view.props.onNavigate).mock.calls).toEqual([[-1], [1], [1], [-1], [-1], [1]])
  })

  it.each([{ count: 0, query: 'missing' }, { count: 3, query: '   ' }])('rejects empty navigation even when callbacks are invoked directly: %o', initial => {
    const view = fixture(initial)
    expect(view.find(props => props['aria-label'] === '下一处匹配').disabled).toBe(true)
    expect(view.find(props => props.className === 'mira-conversation-find__count').children).toBe('0/0')
    view.key('Enter'); view.key('ArrowUp'); view.click('下一处匹配')
    expect(view.props.onNavigate).not.toHaveBeenCalled()
  })

  it('yields navigation and Escape to active IME composition or already-consumed events', () => {
    const view = fixture()
    for (const options of [{ isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }]) {
      expect(view.key('Enter', options).preventDefault).not.toHaveBeenCalled()
      expect(view.dispatch('Escape', options).preventDefault).not.toHaveBeenCalled()
    }
    ;(view.inputProps().onCompositionStart as () => void)()
    view.key('ArrowDown'); view.dispatch('Escape')
    expect(view.props.onNavigate).not.toHaveBeenCalled(); expect(view.props.onClose).not.toHaveBeenCalled()
    ;(view.inputProps().onCompositionEnd as () => void)()
    view.key('Enter'); expect(view.props.onNavigate).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('does not handle Escape consumed by a nested Radix layer and closes only on an unconsumed Escape', () => {
    const view = fixture()
    // Radix DismissableLayer runs document capture before this window bubble listener.
    const consumed = view.dispatch('Escape', { defaultPrevented: true })
    expect(consumed.preventDefault).not.toHaveBeenCalled(); expect(view.props.onClose).not.toHaveBeenCalled()
    expect(view.dispatch('Escape').preventDefault).toHaveBeenCalledOnce()
    expect(view.props.onClose).toHaveBeenCalledOnce()
    expect(view.props.onQueryChange).not.toHaveBeenCalled()
    expect(view.props.onScopeChange).not.toHaveBeenCalled()
  })

  it('requests both search scopes and delegates close without clearing parent-owned state', () => {
    const view = fixture()
    view.click('切换到文件变更查找'); expect(view.props.onScopeChange).toHaveBeenCalledWith('changes')
    view.props.scope = 'changes'; view.render()
    expect(view.inputProps()['aria-label']).toBe('查找文件变更')
    view.click('切换到对话查找'); expect(view.props.onScopeChange).toHaveBeenCalledWith('conversation')
    view.click('关闭查找'); expect(view.props.onClose).toHaveBeenCalledOnce()
    expect(view.props.onQueryChange).not.toHaveBeenCalled()
    expect(view.find(props => props.role === 'status')['aria-live']).toBe('polite')
  })

  it('does not retain an abandoned IME composition after close and reopen', () => {
    const view = fixture()
    ;(view.inputProps().onCompositionStart as () => void)()
    view.props.open = false; view.render()
    view.props.open = true; view.render(); view.flushFrames()
    view.key('Enter')
    expect(view.props.onNavigate).toHaveBeenCalledExactlyOnceWith(1)
  })
})
