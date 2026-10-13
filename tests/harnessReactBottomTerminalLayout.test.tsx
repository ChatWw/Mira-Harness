// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
