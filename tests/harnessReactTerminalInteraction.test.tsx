// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalPanel } from '../apps/harness-react/src/components/workspace/TerminalPanel'
import { MiraBottomTerminal } from '../apps/harness-react/src/components/workspace/MiraBottomTerminal'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'

const terminals = vi.hoisted(() => [] as Array<any>)
vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: any) => <div>{children}</div>,
  Panel: ({ children }: any) => <div>{children}</div>,
  Separator: (props: any) => <div role="separator" aria-label={props['aria-label']} />,
}))
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  options = {}; cols = 80; rows = 24; selection = ''; textarea!: HTMLTextAreaElement
  modes = { bracketedPasteMode: false }
  buffer = { active: { length: 1, getLine: () => ({ isWrapped: false, getCell: (index: number) => ({ getWidth: () => 1, getChars: () => 'https://mira.test'[index] || '' }) }) } }
  provider?: any; linkDispose = vi.fn()
  keyHandler?: (event: KeyboardEvent) => boolean; data?: (text: string) => void
  focus = vi.fn(() => this.textarea.focus()); dispose = vi.fn(); write = vi.fn(); clear = vi.fn()
  constructor(options: any) { this.options = options; terminals.push(this) }
  loadAddon() {}
  registerLinkProvider(provider: any) { this.provider = provider; return { dispose: this.linkDispose } }
  open(container: HTMLElement) {
    this.textarea = document.createElement('textarea'); this.textarea.className = 'xterm-helper-textarea'; container.append(this.textarea)
    this.textarea.addEventListener('keydown', event => {
      if (this.keyHandler?.(event) === false) return
      if (event.ctrlKey && event.key.toLowerCase() === 'c') this.data?.('\x03')
      if (event.ctrlKey && event.key.toLowerCase() === 'v') this.data?.('\x16')
    })
  }
  onData(listener: (text: string) => void) { this.data = listener }
  attachCustomKeyEventHandler(listener: (event: KeyboardEvent) => boolean) { this.keyHandler = listener }
  hasSelection() { return Boolean(this.selection) }
  getSelection() { return this.selection }
} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))

let root: Root | undefined, container: HTMLDivElement
let nextFrame = 0
const frames = new Map<number, FrameRequestCallback>()
const writeText = vi.fn(async (_text: string) => undefined), readText = vi.fn(async () => 'must not read')
beforeEach(() => {
  terminals.length = 0; frames.clear(); nextFrame = 0; vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 400, height: 200 }] as unknown as DOMRectList)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } })
  container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined
  document.body.replaceChildren(); frames.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})
const flushFrames = async () => { await act(async () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(0)) }) }
async function fixture() {
  const connections: Array<{ resolve: (value: { terminalId: string }) => void }> = []
  const controller = {
    openTerminalFor: vi.fn(() => new Promise<{ terminalId: string }>(resolve => connections.push({ resolve }))),
    closeTerminalFor: vi.fn(async () => undefined), resizeTerminalFor: vi.fn(async () => undefined),
    writeTerminalFor: vi.fn(async () => undefined), onTerminalEvent: vi.fn((_listener: (event: unknown) => void) => () => undefined), reportError: vi.fn(),
    canPasteTerminal: true, pasteTerminalFor: vi.fn(async () => undefined),
  }
  const render = async (active: boolean, count = 1, selected = 0, epoch = 0) => { await act(async () => root!.render(<>{Array.from({ length: count }, (_, index) => <div key={`${index}:${epoch}`} aria-hidden={!active || index !== selected}><TerminalPanel controller={controller as unknown as PilotController} sessionId="parent" active={active && index === selected} /></div>)}</>)) }
  const ready = async (index = 0) => { await act(async () => connections[index].resolve({ terminalId: `pty-${index}` })) }
  const key = async (value: string, options: KeyboardEventInit = {}, index = 0) => {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options })
    await act(async () => terminals[index].textarea.dispatchEvent(event)); return event
  }
  const menu = async () => {
    await act(async () => container.querySelector('.pilot-terminal__host')!.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    return [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  }
  await render(true)
  return { controller, render, ready, key, menu }
}

describe('terminal activation and clipboard ownership', () => {
  it('does not reconnect, write to, or close an exited PTY when exit arrives before the open response', async () => {
    const view = await fixture()
    const listener = view.controller.onTerminalEvent.mock.calls[0][0] as (event: any) => void
    await act(async () => {
      listener({ sessionId: 'parent', type: 'terminal-output', payload: { terminalId: 'pty-0', data: 'before exit' } })
      listener({ sessionId: 'parent', type: 'terminal-exit', payload: { terminalId: 'pty-0', exitCode: 0 } })
      listener({ sessionId: 'parent', type: 'terminal-output', payload: { terminalId: 'pty-0', data: 'after exit' } })
    })
    await view.ready(); await flushFrames()
    expect(container.querySelector('.pilot-terminal')?.getAttribute('data-terminal-state')).toBe('exited')
    expect(terminals[0].write).toHaveBeenCalledWith('before exit')
    expect(terminals[0].write).not.toHaveBeenCalledWith('after exit')
    terminals[0].data('ignored input')
    expect(view.controller.writeTerminalFor).not.toHaveBeenCalled()
    await act(async () => root!.unmount()); root = undefined
    expect(view.controller.closeTerminalFor).not.toHaveBeenCalled()
  })
  it('keeps bottom PTYs through collapse and task switches, closes exact tabs, and reclaims deleted tasks', async () => {
    const listeners = new Set<(event: any) => void>()
    let serial = 0
    const controller = {
      openTerminalFor: vi.fn(async () => ({ terminalId: `bottom-${++serial}`, shell: serial === 1 ? '/bin/zsh' : 'C:\\Windows\\pwsh.exe' })), closeTerminalFor: vi.fn(async () => undefined),
      resizeTerminalFor: vi.fn(async () => undefined), onTerminalEvent: (listener: (event: any) => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    } as unknown as PilotController
    const close = vi.fn(), focus = vi.fn(), address = vi.fn()
    const render = async (open: boolean, sessionId = 'a', retainedSessionIds = ['a', 'b']) => { await act(async () => root!.render(<MiraBottomTerminal controller={controller} sessionId={sessionId} directory="/fixture/mira" retainedSessionIds={retainedSessionIds} open={open} active onClose={close} onFocus={focus} onOpenAddress={address}><textarea aria-label="draft" /></MiraBottomTerminal>)) }
    const click = async (label: string) => { await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click()) }
    await render(false); expect(controller.openTerminalFor).not.toHaveBeenCalled()
    await render(true); expect(controller.openTerminalFor).toHaveBeenCalledExactlyOnceWith('a')
    expect(container.querySelector('.mira-bottom-terminal__shell')?.textContent).toBe('zsh')
    await render(false); expect(controller.closeTerminalFor).not.toHaveBeenCalled()
    await render(true); expect(controller.openTerminalFor).toHaveBeenCalledTimes(1)
    await click('新建底部终端'); expect(controller.openTerminalFor).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.mira-bottom-terminal__shell')?.textContent).toBe('PowerShell')
    await render(true, 'b'); expect(controller.openTerminalFor).toHaveBeenLastCalledWith('b')
    expect(controller.closeTerminalFor).not.toHaveBeenCalled()
    await render(true, 'a'); expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2)
    await click('关闭终端 mira 2'); expect(controller.closeTerminalFor).toHaveBeenCalledExactlyOnceWith('a', 'bottom-2')
    await click('关闭终端 mira 1'); expect(close).toHaveBeenCalledOnce(); expect(controller.closeTerminalFor).toHaveBeenCalledTimes(1)
    await render(true, 'b', ['b']); expect(controller.closeTerminalFor).toHaveBeenLastCalledWith('a', 'bottom-1')
    await act(async () => { for (const listener of listeners) listener({ sessionId: 'b', type: 'terminal-exit', payload: { terminalId: 'bottom-3', exitCode: 0 } }) })
    expect(container.querySelectorAll('[data-bottom-terminal-id]')).toHaveLength(0)
    expect(close).toHaveBeenCalledTimes(2)
    expect(controller.closeTerminalFor).not.toHaveBeenCalledWith('b', 'bottom-3')
    await render(false, 'b', ['b']); await render(true, 'b', ['b'])
    expect(controller.openTerminalFor).toHaveBeenCalledTimes(4)
  })
  it('reopens terminals in the new workspace after a prepared project changes while preserving the input', async () => {
    let index = 0
    const controller = { openTerminalFor: vi.fn(async () => ({ terminalId: `pty-${++index}` })), closeTerminalFor: vi.fn(async () => undefined), onTerminalEvent: () => () => undefined, resizeTerminalFor: vi.fn(async () => undefined) } as unknown as PilotController
    const render = async (directory: string) => { await act(async () => root!.render(<MiraBottomTerminal controller={controller} sessionId="prepared" directory={directory} retainedSessionIds={['prepared']} open active onClose={() => {}} onFocus={() => {}} onOpenAddress={() => {}}><textarea aria-label="draft" defaultValue="保留输入" /></MiraBottomTerminal>)) }
    await render('/fixture/project-a')
    expect(controller.openTerminalFor).toHaveBeenCalledOnce()
    await render('/fixture/project-b')
    expect(controller.closeTerminalFor).toHaveBeenCalledExactlyOnceWith('prepared', 'pty-1')
    expect(controller.openTerminalFor).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="tab"]')?.textContent).toBe('project-b 1')
    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="draft"]')?.value).toBe('保留输入')
    await render('/fixture/project-b')
    expect(controller.openTerminalFor).toHaveBeenCalledTimes(2)
  })
  it('opens detected links through the current callback and ignores hidden or disposed terminals', async () => {
    const controller = { openTerminalFor: vi.fn(async () => ({ terminalId: 'pty' })), closeTerminalFor: vi.fn(async () => undefined), onTerminalEvent: () => () => undefined, resizeTerminalFor: vi.fn(async () => undefined) } as unknown as PilotController
    const first = vi.fn(), latest = vi.fn()
    const render = async (active: boolean, onOpenAddress: (url: string) => void) => { await act(async () => root!.render(<TerminalPanel controller={controller} sessionId="parent" active={active} onOpenAddress={onOpenAddress} />)) }
    await render(true, first)
    let links: any[] = []; terminals[0].provider.provideLinks(1, (value: any[]) => { links = value })
    expect(links).toHaveLength(1); expect(links[0]).toMatchObject({ text: 'https://mira.test', decorations: { underline: true, pointerCursor: true } })
    const activate = async () => { const event = new MouseEvent('click', { cancelable: true }); await act(async () => links[0].activate(event, links[0].text)); expect(event.defaultPrevented).toBe(true) }
    await activate(); expect(first).toHaveBeenCalledExactlyOnceWith('https://mira.test')
    await render(true, latest); await activate(); expect(latest).toHaveBeenCalledOnce(); expect(terminals).toHaveLength(1)
    terminals[0].options.linkHandler.activate(new MouseEvent('click'), 'https://mira.test/osc8')
    expect(latest).toHaveBeenLastCalledWith('https://mira.test/osc8')
    terminals[0].options.linkHandler.activate(new MouseEvent('click'), 'file:///private/file')
    expect(latest).toHaveBeenCalledTimes(2)
    await render(false, latest); await activate(); expect(latest).toHaveBeenCalledTimes(2)
    await act(async () => root!.unmount()); root = undefined; await activate()
    expect(latest).toHaveBeenCalledTimes(2); expect(terminals[0].linkDispose).toHaveBeenCalledOnce()
  })
  it('uses actual context menu actions for selected copy and owner-bound bracketed paste', async () => {
    const view = await fixture()
    let items = await view.menu()
    expect(items.map(item => item.textContent)).toEqual(['复制', '粘贴'])
    expect(items.every(item => item.hasAttribute('data-disabled'))).toBe(true)
    await act(async () => items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await view.ready(); await flushFrames(); terminals[0].selection = 'terminal selection'
    items = await view.menu()
    await act(async () => items[0].click())
    expect(writeText).toHaveBeenCalledExactlyOnceWith('terminal selection')
    expect(view.controller.writeTerminalFor).not.toHaveBeenCalled()
    terminals[0].modes.bracketedPasteMode = true
    items = await view.menu()
    await act(async () => items[1].click())
    expect(view.controller.pasteTerminalFor).toHaveBeenCalledExactlyOnceWith('parent', 'pty-0', true)
    expect(readText).not.toHaveBeenCalled()
    await flushFrames(); expect(document.activeElement).toBe(terminals[0].textarea)
  })

  it('closes a hidden terminal menu and reports paste rejection only for its live instance', async () => {
    const view = await fixture(); await view.ready(); await flushFrames()
    await view.menu(); expect(container.querySelector('[role="menu"]')).not.toBeNull()
    await view.render(false); expect(container.querySelector('[role="menu"]')).toBeNull()
    await view.render(true); await flushFrames()
    view.controller.pasteTerminalFor.mockRejectedValueOnce(new Error('clipboard unavailable'))
    const items = await view.menu(); await act(async () => items[1].click())
    expect(view.controller.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'clipboard unavailable' }))
    expect(readText).not.toHaveBeenCalled()
  })

  it('focuses the connected active terminal on open, tab creation and returning from a hidden panel', async () => {
    const view = await fixture(); await view.ready(); await flushFrames()
    expect(document.activeElement).toBe(terminals[0].textarea)
    await view.render(true, 2, 1)
    await view.ready(1); await flushFrames()
    expect(document.activeElement).toBe(terminals[1].textarea)
    await view.render(true, 2, 0); await flushFrames()
    expect(document.activeElement).toBe(terminals[0].textarea)
    await view.render(false); await view.render(true); await flushFrames()
    expect(document.activeElement).toBe(terminals[0].textarea)
    expect(view.controller.resizeTerminalFor).toHaveBeenCalledWith('parent', 'pty-0', 80, 24)
  })

  it('does not steal another editable input entered before a delayed connection/focus frame', async () => {
    const view = await fixture()
    const draft = document.createElement('textarea'); draft.value = 'keep typing'; document.body.append(draft); draft.focus()
    await view.ready(); await flushFrames()
    expect(document.activeElement).toBe(draft); expect(draft.value).toBe('keep typing')
    await view.render(false); await view.render(true)
    await flushFrames(); expect(document.activeElement).toBe(draft)
  })

  it('keeps a nonmodal popup button focused when the terminal connects late', async () => {
    const view = await fixture()
    const popup = document.createElement('div'); popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-modal', 'false')
    const button = document.createElement('button'); button.textContent = '关闭标签'; popup.append(button); container.append(popup); button.focus()
    await view.ready(); await flushFrames()
    expect(document.activeElement).toBe(button)
    expect(terminals[0].focus).not.toHaveBeenCalled()
    popup.remove(); await view.render(false); await view.render(true); await flushFrames()
    expect(document.activeElement).toBe(terminals[0].textarea)
  })

  it('cancels pending focus when hidden and closes only its own late terminal after unmount', async () => {
    const view = await fixture(); await view.ready(); await view.render(false); await flushFrames()
    expect(terminals[0].focus).not.toHaveBeenCalled()
    await view.render(false, 2, 1)
    await act(async () => root!.unmount()); root = undefined
    await view.ready(1); await flushFrames()
    expect(view.controller.closeTerminalFor.mock.calls).toEqual([['parent', 'pty-0'], ['parent', 'pty-1']])
    expect(terminals[1].focus).not.toHaveBeenCalled()
  })

  it('copies a selection on Ctrl/Cmd+C while unselected Ctrl+C still reaches the PTY', async () => {
    const view = await fixture(); await view.ready(); terminals[0].selection = 'selected output'
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) expect((await view.key('c', modifier)).defaultPrevented).toBe(true)
    expect(writeText.mock.calls).toEqual([['selected output'], ['selected output']]); expect(view.controller.writeTerminalFor).not.toHaveBeenCalled()
    expect((await view.key('c', { ctrlKey: true, repeat: true })).defaultPrevented).toBe(true)
    expect(writeText).toHaveBeenCalledTimes(2)
    terminals[0].selection = ''; await view.key('c', { ctrlKey: true })
    expect(view.controller.writeTerminalFor).toHaveBeenCalledExactlyOnceWith('parent', 'pty-0', '\x03')
  })

  it('lets the browser paste once without sending Ctrl+V or reading the clipboard API', async () => {
    const view = await fixture(); await view.ready()
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { ctrlKey: true, shiftKey: true }]) {
      expect((await view.key('v', modifier)).defaultPrevented).toBe(false)
    }
    expect(readText).not.toHaveBeenCalled(); expect(view.controller.writeTerminalFor).not.toHaveBeenCalled()
  })

  it('reports a failed copy without turning it into a terminal interrupt or clearing the selection', async () => {
    const view = await fixture(); await view.ready(); terminals[0].selection = 'keep selection'
    const error = new Error('clipboard write denied'); writeText.mockRejectedValueOnce(error)
    await view.key('c', { ctrlKey: true })
    expect(view.controller.reportError).toHaveBeenCalledWith(error)
    expect(view.controller.writeTerminalFor).not.toHaveBeenCalled(); expect(terminals[0].selection).toBe('keep selection')
    await view.key('c', { ctrlKey: true, isComposing: true }); await view.key('c', { ctrlKey: true, altKey: true })
    expect(writeText).toHaveBeenCalledOnce()
  })
})
