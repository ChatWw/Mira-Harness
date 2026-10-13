// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraDraftWelcome } from '../apps/harness-react/src/components/workbench/MiraDraftWelcome'

let root: Root, container: HTMLDivElement, available: number
let resize: () => void, disconnected: ReturnType<typeof vi.fn>
const frames = new Map<number, FrameRequestCallback>()
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(2026, 9, 13, 8, 59, 59))
  available = 800; disconnected = vi.fn()
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {} disconnect = disconnected })
  let frame = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frame, callback); return frame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return { width: this.classList.contains('mira-task-start__measure') ? 600 : available } as DOMRect })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); frames.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
const render = async (active = true) => { await act(async () => root.render(<MiraDraftWelcome active={active} />)) }
const text = () => container.querySelector('[data-mira-welcome-text]')!.textContent!
const font = () => container.querySelector('h2')!.style.fontSize
const flush = async () => { await act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }) }

describe('Mira draft welcome desktop title', () => {
  it('fits its own measured width, batches resize and restores the existing scale', async () => {
    await render(); expect(font()).toBe('28px')
    available = 500; resize(); resize(); expect(frames.size).toBe(1)
    await flush(); expect(font()).toBe('23px')
    available = 100; resize(); await flush(); expect(font()).toBe('20px')
    available = 0; resize(); await flush(); expect(font()).toBe('20px')
    available = 800; resize(); await flush(); expect(font()).toBe('28px')
    expect(container.querySelector('.mira-task-start__measurement')?.getAttribute('aria-hidden')).toBe('true')
  })
  it('updates at the next local time boundary without a parent rerender', async () => {
    await render(); expect(text()).toContain('早上好')
    await act(async () => vi.advanceTimersByTime(1000)); expect(text()).toContain('上午好')
    await act(async () => vi.advanceTimersByTime(3 * 60 * 60 * 1000)); expect(text()).toContain('中午好')
    await act(async () => vi.advanceTimersByTime(2 * 60 * 60 * 1000)); expect(text()).toContain('下午好')
    await act(async () => vi.advanceTimersByTime(4 * 60 * 60 * 1000)); expect(text()).toContain('晚上好')
    await act(async () => vi.advanceTimersByTime(5 * 60 * 60 * 1000)); expect(text()).toContain('夜深了')
    await act(async () => vi.advanceTimersByTime(6 * 60 * 60 * 1000)); expect(text()).toContain('早上好')
  })
  it('refreshes after returning from sleep and stops measuring or ticking when hidden', async () => {
    await render()
    vi.setSystemTime(new Date(2026, 9, 13, 18, 5))
    await act(async () => window.dispatchEvent(new Event('focus'))); expect(text()).toContain('晚上好')
    resize(); expect(frames.size).toBe(1)
    await render(false); expect(frames.size).toBe(0); expect(disconnected).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
    vi.setSystemTime(new Date(2026, 9, 14, 12, 30))
    await act(async () => document.dispatchEvent(new Event('visibilitychange'))); expect(text()).toContain('晚上好')
    await render(); expect(text()).toContain('中午好')
    expect(vi.getTimerCount()).toBe(1)
  })
})
