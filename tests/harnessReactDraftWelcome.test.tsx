// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraDraftWelcome } from '../apps/harness-react/src/components/workbench/MiraDraftWelcome'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(2026, 9, 13, 8, 59, 59))
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
const render = async (active = true) => { await act(async () => root.render(<MiraDraftWelcome active={active} />)) }
const text = () => container.querySelector('[data-mira-welcome-text]')!.textContent!
describe('Mira draft welcome', () => {
  it('shows the brand, short heading and a single time-aware introduction', async () => {
    await render()
    expect(container.querySelector('h2')?.textContent).toBe('今天，从什么开始？')
    expect(container.querySelector('.mira-task-start__brand')?.textContent).toBe('Mira')
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
    expect(text()).toBe('早上好。把想做的事交给 Mira，我们一起推进。')
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
  it('refreshes after returning from sleep and stops ticking when hidden', async () => {
    await render()
    vi.setSystemTime(new Date(2026, 9, 13, 18, 5))
    await act(async () => window.dispatchEvent(new Event('focus'))); expect(text()).toContain('晚上好')
    await render(false); expect(vi.getTimerCount()).toBe(0)
    vi.setSystemTime(new Date(2026, 9, 14, 12, 30))
    await act(async () => document.dispatchEvent(new Event('visibilitychange'))); expect(text()).toContain('晚上好')
    await render(); expect(text()).toContain('中午好')
    expect(vi.getTimerCount()).toBe(1)
  })
})
