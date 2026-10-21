// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { MiraBottomTerminal } from '../apps/harness-react/src/components/workspace/MiraBottomTerminal'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'

// Keep the real resizable panels: a div substitute cannot detect a blocked collapse.
vi.mock('../apps/harness-react/src/components/workspace/TerminalPanel', () => ({ TerminalPanel: () => <textarea aria-label="terminal" /> }))
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-panel') ? 400 : 800 })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1200)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([false, true])('keeps one conversation frame with the terminal open: %s', async open => {
  const style = document.createElement('style')
  // happy-dom cannot expand custom properties inside border shorthands.
  style.textContent = ['layout', 'workspace'].map(name => readFileSync(`apps/harness-react/src/styles/${name}.css`, 'utf8')).join('\n').replaceAll('var(--color-border)', '#ddd')
  document.head.append(style)
  try {
    await act(async () => root.render(<div className="mira-thread-panel">
      <header className="harness-thread-header">任务</header>
      <MiraBottomTerminal controller={{} as PilotController} sessionId="a" retainedSessionIds={['a']} open={open} active onClose={() => {}} onFocus={() => {}} onOpenAddress={() => {}}>
        <main className="mira-thread-panel mira-thread-terminal-frame">对话</main>
      </MiraBottomTerminal>
    </div>))
    const css = (selector: string) => getComputedStyle(container.querySelector(selector)!)
    expect(css('.mira-thread-panel').borderTopWidth).toBe('1px')
    expect(css('.harness-thread-header').borderBottomWidth).toBe('1px')
    for (const selector of ['.mira-primary-thread', 'main']) {
      const panel = css(selector)
      expect(parseFloat(panel.borderTopWidth) || 0).toBe(0)
      expect(parseFloat(panel.borderRadius) || 0).toBe(0)
    }
    if (open) expect(css('.mira-bottom-terminal').borderTopWidth).toBe('1px')
  } finally { style.remove() }
})

it('releases the real panel layout when hidden and keeps the same terminal on reopening', async () => {
  function Fixture() {
    const [open, setOpen] = useState(false)
    return <><button onClick={() => setOpen(true)}>open</button><MiraBottomTerminal controller={{} as PilotController} sessionId="a" directory="/mira" retainedSessionIds={['a']} open={open} active onClose={() => setOpen(false)} onFocus={() => {}} onOpenAddress={() => {}}><textarea aria-label="draft" defaultValue="keep draft" /></MiraBottomTerminal></>
  }
  await act(async () => root.render(<Fixture />))
  const panel = () => container.querySelector<HTMLElement>('#mira-bottom-terminal-panel')!
  const click = async (selector: string) => {
    await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click())
    await act(async () => new Promise<void>(resolve => window.requestAnimationFrame(() => resolve())))
  }
  await click('button')
  expect(Number(panel().style.flexGrow)).toBeGreaterThan(0)
  const terminal = container.querySelector('[aria-label="terminal"]')
  await click('[aria-label="收起底部终端"]')
  expect(Number(panel().style.flexGrow)).toBe(0)
  expect(container.querySelector('#mira-bottom-terminal')?.getAttribute('aria-hidden')).toBe('true')
  expect(container.querySelector('[role="separator"]')).toBeNull()
  await click('button')
  expect(Number(panel().style.flexGrow)).toBeGreaterThan(0)
  expect(container.querySelector('[aria-label="terminal"]')).toBe(terminal)
  expect(container.querySelector<HTMLTextAreaElement>('[aria-label="draft"]')?.value).toBe('keep draft')
  await click('[aria-label="收起底部终端"]')
  expect(Number(panel().style.flexGrow)).toBe(0)
  expect(container.querySelector('#mira-bottom-terminal')?.getAttribute('aria-hidden')).toBe('true')
  expect(container.querySelector('[role="separator"]')).toBeNull()
})

it('cancels pending expansion when rapidly toggled and preserves the draft', async () => {
  const frames = new Map<number, FrameRequestCallback>(); let nextFrame = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++nextFrame, callback); return nextFrame })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  function Fixture() {
    const [open, setOpen] = useState(false)
    return <><button onClick={() => setOpen(value => !value)}>toggle</button><MiraBottomTerminal controller={{} as PilotController} sessionId="a" retainedSessionIds={['a']} open={open} active onClose={() => setOpen(false)} onFocus={() => {}} onOpenAddress={() => {}}><textarea aria-label="draft" defaultValue="keep draft" /></MiraBottomTerminal></>
  }
  const flush = async () => { await act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(performance.now())) }) }
  await act(async () => root.render(<Fixture />)); await flush()
  const toggle = () => act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
  await toggle(); await toggle(); await flush()
  expect(Number(container.querySelector<HTMLElement>('#mira-bottom-terminal-panel')!.style.flexGrow)).toBe(0)
  await toggle(); await flush()
  expect(Number(container.querySelector<HTMLElement>('#mira-bottom-terminal-panel')!.style.flexGrow)).toBeGreaterThan(0)
  expect(container.querySelector<HTMLTextAreaElement>('[aria-label="draft"]')?.value).toBe('keep draft')
})

it.each([false, true])('blocks bottom-edge dragging while closed (previously opened: %s)', async previouslyOpened => {
  function Fixture() {
    const [open, setOpen] = useState(false)
    return <><button onClick={() => setOpen(true)}>open</button><MiraBottomTerminal controller={{} as PilotController} sessionId="a" retainedSessionIds={['a']} open={open} active onClose={() => setOpen(false)} onFocus={() => {}} onOpenAddress={() => {}}><textarea aria-label="draft" defaultValue="keep draft" /></MiraBottomTerminal></>
  }
  const panel = () => container.querySelector<HTMLElement>('#mira-bottom-terminal-panel')!
  // The library creates an implicit hit region even without a Separator.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const bottom = panel(), primary = container.querySelector<HTMLElement>('#mira-primary-thread')
    const separatorHeight = container.querySelector('[role="separator"]') ? 4 : 0
    const available = 800 - separatorHeight
    const bottomHeight = bottom && primary ? available * Number(bottom.style.flexGrow) / (Number(bottom.style.flexGrow) + Number(primary.style.flexGrow)) : 0
    const primaryHeight = available - bottomHeight
    if (this === bottom) return new DOMRect(0, primaryHeight + separatorHeight, 1200, bottomHeight)
    if (this === primary) return new DOMRect(0, 0, 1200, primaryHeight)
    if (this.getAttribute('role') === 'separator') return new DOMRect(0, primaryHeight, 1200, separatorHeight)
    return new DOMRect(0, 0, 1200, 800)
  })
  const click = async (selector: string) => {
    await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click())
    await act(async () => new Promise<void>(resolve => window.requestAnimationFrame(() => resolve())))
  }
  const drag = async (target: HTMLElement, from: number, to: number) => {
    await act(async () => target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', clientX: 600, clientY: from, buttons: 1 })))
    await act(async () => document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: 600, clientY: to, buttons: 1 })))
    await act(async () => document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', clientX: 600, clientY: to })))
  }
  await act(async () => root.render(<Fixture />))
  if (previouslyOpened) { await click('button'); await click('[aria-label="收起底部终端"]') }
  await drag(container.querySelector<HTMLElement>('[aria-label="draft"]')!, 799, 500)
  expect(Number(panel().style.flexGrow)).toBe(0)
  expect(container.querySelector('[role="separator"]')).toBeNull()
  expect(container.querySelector<HTMLTextAreaElement>('[aria-label="draft"]')?.value).toBe('keep draft')

  await click('button')
  const sizeBeforeDrag = Number(panel().style.flexGrow)
  expect(sizeBeforeDrag).toBeGreaterThan(0)
  const separator = container.querySelector<HTMLElement>('[role="separator"]')!
  await drag(separator, separator.getBoundingClientRect().top + 2, separator.getBoundingClientRect().top - 100)
  expect(Number(panel().style.flexGrow)).toBeGreaterThan(sizeBeforeDrag)
})

it('separates the conversation frame from the open bottom terminal', async () => {
  const style = document.createElement('style')
  style.textContent = ['layout', 'workspace'].map(name => readFileSync(`apps/harness-react/src/styles/${name}.css`, 'utf8')).join('\n').replaceAll('var(--color-border)', '#ddd')
  document.head.append(style)
  try {
    await act(async () => root.render(<div className="mira-thread-panel mira-conversation-frame"><header className="harness-thread-header" /><div className="mira-full-view-host" data-mode="docked"><div className="mira-primary-thread" /><div className="mira-bottom-terminal-panel" data-open="true"><div className="mira-bottom-terminal" aria-hidden="false" /></div></div></div>))
    const frame = getComputedStyle(container.querySelector('.mira-conversation-frame')!)
    expect(parseFloat(frame.borderTopWidth) || 0).toBe(0)
    expect(getComputedStyle(container.querySelector('.harness-thread-header')!).borderTopWidth).toBe('1px')
    expect(getComputedStyle(container.querySelector('.mira-primary-thread')!).borderBottomWidth).toBe('1px')
    expect(getComputedStyle(container.querySelector('.mira-bottom-terminal')!).borderTopWidth).toBe('1px')
  } finally { style.remove() }
})
