// Terminal focus and selection shortcuts adapted from ZCode, Copyright 2026 Z.AI Co., Ltd, Apache-2.0.
// Keyboard paste uses xterm's native event; menu paste stays in Mira's authorized Electron PTY service.
import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ClipboardPaste, Copy } from 'lucide-react'
import { Terminal, type ITheme } from '@xterm/xterm'
import type { HarnessEvent } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { createTerminalResizeScheduler } from '../../lib/terminal-resize'
import { miraTerminalWebLinks } from '../../lib/mira-terminal-links'

export function TerminalPanel({ controller, sessionId, directory, active, onOpenAddress, onExit, focusOnActivate = false, onShellLabelChange }: { controller: PilotController; sessionId: string; directory?: string; active: boolean; onOpenAddress?: (url: string) => void; onExit?: () => void; focusOnActivate?: boolean; onShellLabelChange?: (label: string) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const scheduleResizeRef = useRef<(() => void) | undefined>(undefined)
  const terminalIdRef = useRef('')
  const pendingEventsRef = useRef<HarnessEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [canCopy, setCanCopy] = useState(false)
  const pastePending = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active
  const openAddressRef = useRef(onOpenAddress)
  openAddressRef.current = onOpenAddress
  const shellLabelRef = useRef(onShellLabelChange)
  shellLabelRef.current = onShellLabelChange
  const exitRef = useRef(onExit)
  exitRef.current = onExit
  function focusTerminal() { focusTerminalWithIntent(false) }
  function focusTerminalWithIntent(fromToggle: boolean) {
    const container = hostRef.current, target = document.activeElement as HTMLElement | null
    if (!activeRef.current || !container?.getClientRects().length || container.closest('[inert], [aria-hidden="true"]') || document.querySelector('[role="dialog"]:not(.mira-conversation-find), [role="menu"][data-state="open"]')) return
    if (!fromToggle && target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') && !target.closest('.pilot-terminal')) return
    terminalRef.current?.focus()
  }
  function copySelection() {
    const term = terminalRef.current
    if (!term?.hasSelection()) return
    void navigator.clipboard.writeText(term.getSelection()).catch(cause => { if (terminalRef.current === term) controller.reportError(cause) })
  }
  async function pasteClipboard() {
    const term = terminalRef.current, id = terminalIdRef.current
    if (!activeRef.current || !term || !id || pastePending.current) return
    pastePending.current = true
    try { await controller.pasteTerminalFor(sessionId, id, term.modes.bracketedPasteMode) }
    catch (cause) { if (terminalRef.current === term) controller.reportError(cause) }
    finally { pastePending.current = false }
  }
  useEffect(() => {
    const container = hostRef.current
    if (!container) return
    let mounted = true
    let exited = false
    setConnected(false); setError('')
    const activateLink = (event: MouseEvent, address: string) => {
      event.preventDefault()
      if (mounted && activeRef.current && terminalRef.current === term && /^https?:\/\//i.test(address)) openAddressRef.current?.(address)
    }
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 12, lineHeight: 1.4,
      cursorBlink: true, allowProposedApi: true, scrollback: 5000,
      theme: readTerminalTheme(container),
      linkHandler: { allowNonHttpProtocols: false, activate: activateLink },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    terminalRef.current = term
    const links = term.registerLinkProvider({
      provideLinks(row, callback) {
        callback(miraTerminalWebLinks(term.buffer.active, row, term.cols)?.map(link => ({
          ...link,
          activate: activateLink,
        })))
      },
    })
    term.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown' || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || !(event.metaKey || event.ctrlKey)) return true
      const key = event.key.toLowerCase()
      if (key === 'c' && term.hasSelection()) {
        event.preventDefault(); event.stopPropagation()
        if (!event.repeat) {
          const text = term.getSelection()
          void (async () => { try { await navigator.clipboard.writeText(text) } catch (cause) { if (mounted) controller.reportError(cause) } })()
        }
        return false
      }
      // Skip xterm's Ctrl+V control byte, preserving the browser's one native paste event.
      if (key === 'v') return false
      return true
    })
    term.onData(data => { if (terminalIdRef.current) void controller.writeTerminalFor(sessionId, terminalIdRef.current, data).catch(() => undefined) })
    const writeEvent = (event: HarnessEvent) => {
      if (exited) return
      if (event.type === 'terminal-output') term.write(typeof event.payload.data === 'string' ? event.payload.data : '')
      else { exited = true; terminalIdRef.current = ''; term.write(`\r\n\x1b[31m终端已退出（代码 ${String(event.payload.exitCode ?? '?')}）\x1b[0m\r\n`); setError(`终端已退出（代码 ${String(event.payload.exitCode ?? '?')}）`); exitRef.current?.() }
    }
    const unsubscribe = controller.onTerminalEvent(event => {
      if (exited || event.sessionId !== sessionId) return
      if (!terminalIdRef.current) { pendingEventsRef.current.push(event); return }
      if (event.payload.terminalId === terminalIdRef.current) writeEvent(event)
    })
    const resize = createTerminalResizeScheduler(() => {
      if (!mounted || !container.getClientRects().length) return undefined
      try { fit.fit() } catch { return undefined }
      return terminalIdRef.current ? { columns: term.cols, rows: term.rows } : undefined
    }, ({ columns, rows }) => { void controller.resizeTerminalFor(sessionId, terminalIdRef.current, columns, rows).catch(() => undefined) })
    scheduleResizeRef.current = resize.schedule
    const observer = new ResizeObserver(resize.schedule)
    observer.observe(container)
    const themeObserver = new MutationObserver(() => { term.options.theme = readTerminalTheme(container) })
    const themeAttributes = { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] }
    themeObserver.observe(document.documentElement, themeAttributes)
    const root = container.closest('#root')
    if (root) themeObserver.observe(root, themeAttributes)
    void controller.openTerminalFor(sessionId).then(result => {
      if (!mounted) return void controller.closeTerminalFor(sessionId, result.terminalId)
      const shell = result.shell?.split(/[\\/]/).pop()?.replace(/\.exe$/i, '').toLowerCase()
      if (shell) shellLabelRef.current?.(['powershell', 'pwsh'].includes(shell) ? 'PowerShell' : shell)
      terminalIdRef.current = result.terminalId
      term.clear()
      for (const event of pendingEventsRef.current.splice(0)) if (event.payload.terminalId === result.terminalId) writeEvent(event)
      if (exited) return
      resize.schedule()
      setConnected(true)
    }).catch(cause => { if (mounted) setError(cause instanceof Error ? cause.message : '终端启动失败') })
    return () => {
      mounted = false
      unsubscribe(); observer.disconnect(); themeObserver.disconnect(); resize.dispose()
      if (terminalIdRef.current) void controller.closeTerminalFor(sessionId, terminalIdRef.current)
      terminalIdRef.current = ''; pendingEventsRef.current = []
      links.dispose(); term.dispose(); terminalRef.current = null; scheduleResizeRef.current = undefined
    }
  }, [controller, sessionId, directory])
  useEffect(() => {
    if (active) scheduleResizeRef.current?.()
    else setMenuOpen(false)
  }, [active])
  useEffect(() => {
    if (!active || !connected || focusOnActivate) return
    const frame = requestAnimationFrame(() => focusTerminal())
    return () => cancelAnimationFrame(frame)
  }, [active, connected, focusOnActivate])
  useEffect(() => {
    if (!focusOnActivate || !connected) return
    const frame = requestAnimationFrame(() => focusTerminalWithIntent(true))
    return () => cancelAnimationFrame(frame)
  }, [focusOnActivate, connected])
  return <section className="pilot-terminal" aria-label="终端" data-terminal-state={error ? 'exited' : connected ? 'connected' : 'connecting'}>{!connected && !error && <p className="pilot-terminal__loading" role="status">正在连接终端…</p>}<ContextMenu.Root open={menuOpen} onOpenChange={open => { setCanCopy(Boolean(terminalRef.current?.hasSelection())); setMenuOpen(open) }}><ContextMenu.Trigger asChild disabled={!active}><div ref={hostRef} className="pilot-terminal__host" /></ContextMenu.Trigger><ContextMenu.Portal container={document.getElementById('root')}><ContextMenu.Content className="mira-session-menu" aria-label="终端操作" onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(focusTerminal) }}><ContextMenu.Item className="mira-session-menu__item" disabled={!canCopy} onSelect={copySelection}><Copy size={14} />复制</ContextMenu.Item><ContextMenu.Item className="mira-session-menu__item" disabled={!connected || Boolean(error) || !controller.canPasteTerminal} onSelect={() => { void pasteClipboard() }}><ClipboardPaste size={14} />粘贴</ContextMenu.Item></ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>{error && <p className="pilot-file-error" role="alert">{error}，可在标签菜单中重启。</p>}</section>
}

function readTerminalTheme(container: HTMLElement): ITheme {
  const style = getComputedStyle(container)
  const tokens: Record<string, string> = {
    background: 'bg', foreground: 'fg', cursor: 'cursor', cursorAccent: 'cursor-accent',
    selectionBackground: 'selection', selectionInactiveBackground: 'selection-inactive',
    black: 'black', red: 'red', green: 'green', yellow: 'yellow', blue: 'blue',
    magenta: 'magenta', cyan: 'cyan', white: 'white', brightBlack: 'bright-black',
    brightRed: 'bright-red', brightGreen: 'bright-green', brightYellow: 'bright-yellow',
    brightBlue: 'bright-blue', brightMagenta: 'bright-magenta', brightCyan: 'bright-cyan', brightWhite: 'bright-white',
  }
  return Object.fromEntries(Object.entries(tokens).flatMap(([key, token]) => {
    const color = style.getPropertyValue(`--color-terminal-${token}`).trim()
    return color ? [[key, color]] : []
  }))
}
