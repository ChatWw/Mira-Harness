import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useMiraPaneGeometry } from '../apps/harness-react/src/hooks/useMiraPaneGeometry'
import { MIRA_PANE_PREFERENCE_KEY, miraNarrowPaneAction, miraPanePreferences, miraWorkspaceRatio } from '../apps/harness-react/src/lib/pane-geometry'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }] },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return; slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) },
}))

function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
function element(width: () => number) {
  const styles = new Map<string, string>(), classes = new Set<string>()
  const node = {
    getBoundingClientRect: () => ({ width: width() }),
    style: { setProperty: (key: string, value: string) => styles.set(key, value), removeProperty: (key: string) => styles.delete(key), get width() { return styles.get('width') ?? '' }, set width(value: string) { styles.set('width', value) } },
    classList: { add: (value: string) => classes.add(value), remove: (value: string) => classes.delete(value), contains: (value: string) => classes.has(value) },
  }
  return { node: node as unknown as HTMLDivElement, styles, classes }
}
let events: EventTarget, frames: Map<number, FrameRequestCallback>, nextFrame: number
function flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(frame => frame(0)) }
function pointer(type: string, clientX: number, pointerId = 1) { const event = Object.assign(new Event(type), { clientX, pointerId }); events.dispatchEvent(event) }
async function flush() { for (let count = 0; count < 8; count++) await Promise.resolve() }

function mount(saved: Promise<unknown> = Promise.resolve(null)) {
  const beforeNavigation = new Set<() => Promise<void>>()
  const host = { getPreference: vi.fn(() => saved), setPreference: vi.fn(async (_key: string, _value: unknown, _reportFailure?: boolean) => undefined), reportError: vi.fn(), registerBeforeNavigation: vi.fn((flush: () => Promise<void>) => { beforeNavigation.add(flush); return () => { beforeNavigation.delete(flush) } }) }
  let bodyWidth = 1000, conversationWidth = 700, inspectorWidth = 0
  const shell = element(() => bodyWidth + 268), body = element(() => bodyWidth), conversation = element(() => conversationWidth), inspector = element(() => inspectorWidth), content = element(() => inspectorWidth)
  const panel = { resize: vi.fn((size: string | number) => { inspectorWidth = parseFloat(String(size)) * bodyWidth / 100 }), collapse: vi.fn(() => { inspectorWidth = 0 }), expand: vi.fn(), isCollapsed: () => inspectorWidth === 0, getSize: () => ({ asPercentage: inspectorWidth / bodyWidth * 100, inPixels: inspectorWidth }) }
  const options = { host, conversation: true, workspaceOpen: false, sessionsOpen: true, closeWorkspace: vi.fn(() => { options.workspaceOpen = false }), closeSessions: vi.fn(() => { options.sessionsOpen = false }) }
  let geometry!: ReturnType<typeof useMiraPaneGeometry>
  const render = () => {
    hooks.cursor = 0; geometry = useMiraPaneGeometry(options)
    geometry.shellRef.current = shell.node; geometry.bodyRef.current = body.node; geometry.conversationRef.current = conversation.node
    geometry.workspaceElementRef.current = inspector.node; geometry.workspaceContentRef.current = content.node; geometry.workspacePanelRef.current = panel
    hooks.effects.splice(0).forEach(effect => effect())
    return geometry
  }
  render()
  return { host, shell, body, inspector, content, panel, options, render, geometry: () => geometry, bodyWidth: (value: number) => { bodyWidth = value }, conversationWidth: (value: number) => { conversationWidth = value }, flushBeforeNavigation: async () => { for (const callback of beforeNavigation) await callback() }, unmount: () => { hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) } }
}
function key(value: string) { return { key: value, preventDefault: vi.fn() } as unknown as ReactKeyboardEvent<HTMLDivElement> }
function drag(value = 100) { return { button: 0, pointerId: 1, clientX: value, currentTarget: { setPointerCapture: vi.fn() } } as unknown as ReactPointerEvent<HTMLDivElement> }

beforeEach(() => {
  hooks.cursor = 0; hooks.slots = []; hooks.effects = []; vi.useFakeTimers()
  events = new EventTarget(); frames = new Map(); nextFrame = 0
  vi.stubGlobal('window', { setTimeout, clearTimeout, requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame }, cancelAnimationFrame: (id: number) => frames.delete(id), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) })
})
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Mira desktop panel geometry', () => {
  it('restores ratios and migrates legacy pixel width against the available body', () => {
    expect(miraPanePreferences({ sessions: 999, workspaceRatio: .9 })).toEqual({ sessions: 420, workspaceRatio: .65, legacyWorkspace: undefined })
    const legacy = miraPanePreferences({ sessions: 264, workspace: 420 })
    expect(miraWorkspaceRatio(legacy.workspaceRatio, 1200, legacy.legacyWorkspace)).toBe(.35)
    expect(miraWorkspaceRatio(.1, 800)).toBe(.3)
    expect(miraPanePreferences({ sessions: NaN, workspaceRatio: Infinity })).toMatchObject({ sessions: 264, workspaceRatio: .45 })
  })

  it('opens at 45%, restores the last completed resize, and never saves animation intermediate sizes', async () => {
    const view = mount(); await flush(); view.render(); flushFrames(); vi.advanceTimersByTime(240)
    view.options.workspaceOpen = true; view.render(); flushFrames()
    expect(view.panel.resize).toHaveBeenLastCalledWith('45%')
    expect(view.content.styles.get('width')).toBe('450px')
    view.geometry().workspaceLayoutChanged({ 'mira-inspector': 28, 'mira-conversation': 72 }); await flush()
    expect(view.host.setPreference).not.toHaveBeenCalled()
    vi.advanceTimersByTime(240)
    expect(view.content.styles.has('width')).toBe(false)
    view.geometry().workspaceLayoutChanged({ 'mira-inspector': 55, 'mira-conversation': 45 }); await flush()
    expect(view.host.setPreference).toHaveBeenLastCalledWith(MIRA_PANE_PREFERENCE_KEY, { sessions: 264, workspaceRatio: .55 }, true)
    view.options.workspaceOpen = false; view.render(); flushFrames(); vi.advanceTimersByTime(240)
    view.bodyWidth(1600); view.options.workspaceOpen = true; view.render(); flushFrames()
    expect(parseFloat(String(view.panel.resize.mock.lastCall![0]))).toBeCloseTo(55)
    expect(parseFloat(view.content.styles.get('width')!)).toBeCloseTo(880)
    expect(view.host.setPreference).toHaveBeenCalledTimes(1)
  })

  it('accepts a manual resize during opening instead of dropping the final mouse or keyboard size', async () => {
    const view = mount(); await flush(); view.render(); flushFrames(); vi.advanceTimersByTime(240)
    view.options.workspaceOpen = true; view.render()
    view.geometry().beginWorkspaceResize()
    expect(frames.size).toBe(0)
    expect(view.inspector.classes.has('mira-pane-toggling')).toBe(false)
    view.geometry().workspaceLayoutChanged({ 'mira-inspector': 58 }); await flush()
    expect(view.host.setPreference).toHaveBeenLastCalledWith(MIRA_PANE_PREFERENCE_KEY, { sessions: 264, workspaceRatio: .58 }, true)
    vi.advanceTimersByTime(1000); flushFrames()
    expect(view.panel.resize).not.toHaveBeenCalled()
  })

  it('writes sidebar CSS during dragging and saves the final size once, including keyboard resizing', async () => {
    const view = mount(); await flush(); view.render(); flushFrames(); vi.advanceTimersByTime(240)
    view.geometry().resizeSessions(drag())
    pointer('pointermove', 150); pointer('pointermove', 180)
    expect(view.shell.styles.get('--mira-sidebar-width')).toBe('344px')
    expect(view.geometry().sessionsWidth).toBe(264)
    expect(view.host.setPreference).not.toHaveBeenCalled()
    pointer('pointerup', 180); await flush(); view.render()
    expect(view.geometry().sessionsWidth).toBe(344)
    expect(view.host.setPreference).toHaveBeenCalledExactlyOnceWith(MIRA_PANE_PREFERENCE_KEY, { sessions: 344, workspaceRatio: .45 }, true)
    view.geometry().resizeSessionsWithKeyboard(key('ArrowRight')); await flush(); view.render()
    expect(view.geometry().sessionsWidth).toBe(360)
    expect(view.host.setPreference).toHaveBeenLastCalledWith(MIRA_PANE_PREFERENCE_KEY, { sessions: 360, workspaceRatio: .45 }, true)
  })

  it('serializes preference writes so an earlier slow save cannot overwrite a newer keyboard size', async () => {
    const view = mount(); const firstSave = deferred<void>()
    view.host.setPreference.mockImplementationOnce(() => firstSave.promise)
    view.geometry().resizeSessionsWithKeyboard(key('ArrowRight')); await flush()
    view.geometry().resizeSessionsWithKeyboard(key('ArrowRight')); await flush()
    expect(view.host.setPreference).toHaveBeenCalledTimes(1)
    firstSave.resolve(); await flush()
    expect(view.host.setPreference).toHaveBeenLastCalledWith(MIRA_PANE_PREFERENCE_KEY, { sessions: 296, workspaceRatio: .45 }, true)
  })

  it('blocks navigation on a failed pending save and retries the same pane preferences on the next flush', async () => {
    const view = mount(), firstSave = deferred<void>(), error = new Error('面板偏好保存失败')
    view.host.setPreference.mockImplementationOnce(() => firstSave.promise)
    view.geometry().resizeSessionsWithKeyboard(key('ArrowRight')); await flush()
    const navigation = expect(view.flushBeforeNavigation()).rejects.toThrow('面板偏好保存失败')
    firstSave.reject(error); await navigation
    expect(view.host.reportError).toHaveBeenCalledWith(error)
    await expect(view.flushBeforeNavigation()).resolves.toBeUndefined()
    expect(view.host.setPreference).toHaveBeenCalledTimes(2)
    expect(view.host.setPreference).toHaveBeenLastCalledWith(MIRA_PANE_PREFERENCE_KEY, { sessions: 280, workspaceRatio: .45 }, true)
  })

  it('continues queued newer writes after an earlier failure without poisoning navigation', async () => {
    const view = mount(), firstSave = deferred<void>()
    view.host.setPreference.mockImplementationOnce(() => firstSave.promise)
    view.geometry().resizeSessionsWithKeyboard(key('ArrowRight')); await flush()
    view.geometry().resizeSessionsWithKeyboard(key('ArrowRight')); await flush()
    firstSave.reject(new Error('第一次写入失败')); await flush()
    await expect(view.flushBeforeNavigation()).resolves.toBeUndefined()
    expect(view.host.setPreference).toHaveBeenCalledTimes(2)
    expect(view.host.setPreference).toHaveBeenLastCalledWith(MIRA_PANE_PREFERENCE_KEY, { sessions: 296, workspaceRatio: .45 }, true)
  })

  it('ignores late hydration after the user resizes and removes pending drag/frame listeners on unmount', async () => {
    const hydration = deferred<unknown>(), view = mount(hydration.promise)
    view.geometry().resizeSessionsWithKeyboard(key('ArrowRight')); await flush(); view.render()
    hydration.resolve({ sessions: 400, workspaceRatio: .6 }); await flush(); view.render()
    expect(view.geometry().sessionsWidth).toBe(280)
    view.geometry().resizeSessions(drag()); pointer('pointermove', 120)
    view.unmount(); const previous = view.shell.styles.get('--mira-sidebar-width')
    pointer('pointermove', 300); pointer('pointerup', 300); vi.advanceTimersByTime(1000); flushFrames(); await flush()
    expect(view.shell.styles.get('--mira-sidebar-width')).toBe(previous)
    expect(view.host.setPreference).toHaveBeenCalledTimes(1)
    expect(view.inspector.classes.has('mira-pane-toggling')).toBe(false)
    expect(frames.size).toBe(0)
  })

  it('only auto-closes on native window resize idle and preserves the preferred ratio during constraints', async () => {
    const view = mount(); await flush(); view.render(); flushFrames(); vi.advanceTimersByTime(240)
    view.options.workspaceOpen = true; view.render(); flushFrames(); vi.advanceTimersByTime(240)
    view.conversationWidth(300)
    vi.advanceTimersByTime(1000)
    expect(view.options.closeWorkspace).not.toHaveBeenCalled()
    events.dispatchEvent(new Event('resize'))
    view.geometry().workspaceLayoutChanged({ 'mira-inspector': 30 }); await flush()
    expect(view.host.setPreference).not.toHaveBeenCalled()
    vi.advanceTimersByTime(299); expect(view.options.closeWorkspace).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect(view.options.closeWorkspace).toHaveBeenCalledOnce()
    view.render(); flushFrames()
    vi.advanceTimersByTime(239); expect(view.options.closeSessions).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect(view.options.closeSessions).toHaveBeenCalledOnce()
    expect(miraNarrowPaneAction(500, true, true)).toBeUndefined()
  })

  it('cancels toggle animation on native resize and settles an opening queued before the next frame', async () => {
    const view = mount(); await flush(); view.render(); flushFrames(); vi.advanceTimersByTime(240)
    view.options.workspaceOpen = true; view.render()
    expect(view.inspector.classes.has('mira-pane-toggling')).toBe(true)
    expect(view.content.styles.get('width')).toBe('450px')
    events.dispatchEvent(new Event('resize'))
    expect(view.inspector.classes.has('mira-pane-toggling')).toBe(false)
    expect(view.content.styles.has('width')).toBe(false)
    expect(frames.size).toBe(0)
    expect(view.panel.resize).toHaveBeenLastCalledWith('45%')
    view.geometry().workspaceLayoutChanged({ 'mira-inspector': 32 }); await flush()
    expect(view.host.setPreference).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000); flushFrames()
    expect(view.panel.resize).toHaveBeenCalledOnce()
  })

  it('cancels a scheduled open when a rapid close wins before the next frame', async () => {
    const view = mount(); await flush(); view.render(); flushFrames(); vi.advanceTimersByTime(240)
    view.options.workspaceOpen = true; view.render()
    view.options.workspaceOpen = false; view.render(); flushFrames(); vi.advanceTimersByTime(240)
    expect(view.panel.resize).not.toHaveBeenCalled()
    expect(view.panel.collapse).toHaveBeenCalled()
    expect(view.content.styles.has('width')).toBe(false)
  })
})
