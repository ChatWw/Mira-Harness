// @vitest-environment happy-dom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationTurnRail } from '../apps/harness-react/src/components/conversation/ConversationTurnRail'
import type { HarnessMessage } from '../src/config/harness'

let root: Root | undefined
let container: HTMLDivElement
const messages: HarnessMessage[] = Array.from({ length: 500 }, (_, index) => [
  { id: `query-${index}`, role: 'user' as const, content: `第 ${index + 1} 个问题`, createdAt: index * 2 },
  { id: `reply-${index}`, role: 'assistant' as const, content: `第 ${index + 1} 个回复`, createdAt: index * 2 + 1 },
]).flat()

beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-turn-rail__items') ? 200 : 0 })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () { return this.classList.contains('mira-turn-rail__items') ? 36 : 0 })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-turn-rail__items') ? 200 : 0 })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-turn-rail__items') ? Number.parseFloat((this.firstElementChild as HTMLElement)?.style.height ?? '0') : 0 })
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function (options) {
    this.scrollTop = typeof options === 'object' ? options.top ?? 0 : 0
    queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
  })
  container = document.createElement('div')
  container.id = 'root'; document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

const render = async (activeId = 'query-499', navigate = vi.fn()) => {
  await React.act(async () => root!.render(<ConversationTurnRail messages={messages} activeId={activeId} onNavigate={navigate} />))
  return navigate
}

describe('Mira turn rail actual DOM and virtualized navigation', () => {
  it('keeps a long conversation bounded while revealing the active query and its real ordinal', async () => {
    await render()
    const buttons = container.querySelectorAll('.mira-turn-rail__items button')
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.length).toBeLessThan(60)
    const active = container.querySelector('[aria-current="location"]')
    expect(active?.getAttribute('data-turn-id')).toBe('query-499')
    expect(active?.getAttribute('aria-posinset')).toBe('500')
    expect(active?.getAttribute('aria-setsize')).toBe('500')
  })

  it('reveals a newly active query after parent navigation without mounting the whole directory', async () => {
    await render()
    await render('query-250')
    expect(container.querySelector('[aria-current="location"]')?.getAttribute('data-turn-id')).toBe('query-250')
    expect(container.querySelectorAll('.mira-turn-rail__items button').length).toBeLessThan(60)
    expect(container.querySelector('[data-turn-id="query-499"]')).toBeNull()
  })

  it('moves keyboard focus to offscreen Home, page and End targets without submitting navigation', async () => {
    const navigate = await render()
    await React.act(async () => (container.querySelector('[data-turn-id="query-499"]') as HTMLButtonElement).focus())
    const key = async (value: string) => {
      await React.act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })))
      // Native scroll notifications can arrive after the focus commit.
      await React.act(async () => container.querySelector('.mira-turn-rail__items')!.dispatchEvent(new Event('scroll')))
      expect((document.activeElement as HTMLButtonElement).tabIndex).toBe(0)
      expect(container.querySelectorAll('.mira-turn-rail__items button[tabindex="0"]').length).toBe(1)
      expect(container.querySelector('.mira-turn-rail__preview')?.getAttribute('aria-label')).toBe(`第 ${document.activeElement!.getAttribute('aria-posinset')} 轮预览`)
    }
    await key('Home')
    expect((document.activeElement as HTMLElement).dataset.turnId).toBe('query-0')
    await key('PageDown')
    expect((document.activeElement as HTMLElement).dataset.turnId).toBe('query-20')
    await key('End')
    expect((document.activeElement as HTMLElement).dataset.turnId).toBe('query-499')
    await key('ArrowUp')
    expect((document.activeElement as HTMLElement).dataset.turnId).toBe('query-498')
    expect(navigate).not.toHaveBeenCalled()
    await React.act(async () => (document.activeElement as HTMLButtonElement).click())
    expect(navigate).toHaveBeenCalledExactlyOnceWith('query-498')
  })

  it('does not reclaim focus when a keyboard target mounts after the user leaves the rail', async () => {
    await render()
    const button = container.querySelector('[data-turn-id="query-499"]') as HTMLButtonElement
    await React.act(async () => button.focus())
    vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function (options) { this.scrollTop = typeof options === 'object' ? options.top ?? 0 : 0 })
    await React.act(async () => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })))
    const outside = document.createElement('button'); container.append(outside)
    await React.act(async () => outside.focus())
    await React.act(async () => container.querySelector('.mira-turn-rail__items')!.dispatchEvent(new Event('scroll')))
    expect(document.activeElement).toBe(outside)
  })

  it('does not leave a focus request after an End key at the last query', async () => {
    await render()
    const button = container.querySelector('[data-turn-id="query-499"]') as HTMLButtonElement
    await React.act(async () => button.focus())
    // Browsers do not emit scroll when a clamped boundary key leaves the offset unchanged.
    vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => undefined)
    await React.act(async () => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
    const outside = document.createElement('button'); container.append(outside)
    await React.act(async () => outside.focus())
    expect(document.activeElement).toBe(outside)
    expect(container.querySelectorAll('.mira-turn-rail__items button[tabindex="0"]').length).toBe(1)
  })

  it('provides a keyboard preview for the focused query and closes it after focus leaves the rail', async () => {
    await render()
    await React.act(async () => (container.querySelector('[data-turn-id="query-498"]') as HTMLButtonElement).focus())
    expect(container.querySelector('.mira-turn-rail__preview')?.textContent).toContain('第 499 个问题')
    expect(container.querySelector('.mira-turn-rail__preview')?.textContent).toContain('第 499 个回复')
    const outside = document.createElement('button'); container.append(outside)
    await React.act(async () => outside.focus())
    expect(container.querySelector('.mira-turn-rail__preview')).toBeNull()
  })

  it('opens the hovered row after the upstream delay and anchors its own content to that row', async () => {
    await render()
    const button = container.querySelector('[data-turn-id="query-498"]') as HTMLButtonElement
    await React.act(async () => button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })))
    expect(container.querySelector('.mira-turn-rail__preview')).toBeNull()
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 160)) })
    expect(container.querySelector('.mira-turn-rail__preview')?.getAttribute('aria-label')).toBe('第 499 轮预览')
    expect(container.querySelector('.mira-turn-rail__preview')?.textContent).toContain('第 499 个问题')
    const rail = container.querySelector('.mira-turn-rail__items')!
    await React.act(async () => rail.dispatchEvent(new Event('scroll')))
    expect(container.querySelector('.mira-turn-rail__preview')).toBeNull()
  })

  it('ignores a pending hover opening after a scroll has cancelled that pointer position', async () => {
    await render()
    const button = container.querySelector('[data-turn-id="query-498"]') as HTMLButtonElement
    await React.act(async () => button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })))
    await React.act(async () => container.querySelector('.mira-turn-rail__items')!.dispatchEvent(new Event('scroll')))
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 160)) })
    expect(container.querySelector('.mira-turn-rail__preview')).toBeNull()
  })
})
