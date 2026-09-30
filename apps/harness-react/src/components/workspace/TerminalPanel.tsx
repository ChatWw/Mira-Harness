import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { Plus, RotateCw, X } from 'lucide-react'
import type { HarnessEvent } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'

type TerminalTab = { id: number; name: string; epoch: number }

export function TerminalPanel({ controller, sessionId, active }: { controller: PilotController; sessionId: string; active: boolean }) {
  const [tabs, setTabs] = useState<TerminalTab[]>([{ id: 1, name: '终端 1', epoch: 0 }])
  const [activeId, setActiveId] = useState(1)
  const [renamingId, setRenamingId] = useState<number>()
  const [name, setName] = useState('')
  const nextId = useRef(2)
  const create = () => {
    const id = nextId.current++
    setTabs(previous => [...previous, { id, name: `终端 ${id}`, epoch: 0 }])
    setActiveId(id)
  }
  const close = (id: number) => {
    const next = tabs.filter(tab => tab.id !== id)
    setTabs(next)
    if (activeId === id) setActiveId(next[next.length - 1]?.id || 0)
  }
  return <div className="pilot-terminal">
    <div className="pilot-terminal__tabs" role="tablist" aria-label="终端会话">
      {tabs.map(tab => <div key={tab.id} className={`pilot-terminal__tab${activeId === tab.id ? ' is-active' : ''}`}>
        {renamingId === tab.id ? <input autoFocus value={name} aria-label="终端名称" onChange={event => setName(event.target.value)} onBlur={() => { setTabs(previous => previous.map(item => item.id === tab.id ? { ...item, name: name.trim() || item.name } : item)); setRenamingId(undefined) }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setName(tab.name); setRenamingId(undefined) } }} /> : <button type="button" role="tab" aria-selected={activeId === tab.id} title="双击重命名" onClick={() => setActiveId(tab.id)} onDoubleClick={() => { setName(tab.name); setRenamingId(tab.id) }}>{tab.name}</button>}
        <button type="button" aria-label={`关闭${tab.name}`} title={`关闭${tab.name}`} onClick={() => close(tab.id)}><X size={12} /></button>
      </div>)}
      <button type="button" className="pilot-terminal__add" aria-label="新建终端" title="新建终端" onClick={create}><Plus size={14} /></button>
      {tabs.some(tab => tab.id === activeId) && <button type="button" className="pilot-terminal__restart" aria-label="重启当前终端" title="重启当前终端" onClick={() => setTabs(previous => previous.map(tab => tab.id === activeId ? { ...tab, epoch: tab.epoch + 1 } : tab))}><RotateCw size={13} /></button>}
    </div>
    {tabs.length ? tabs.map(tab => <div key={`${tab.id}:${tab.epoch}`} className={`pilot-terminal__session${activeId === tab.id ? ' is-active' : ''}`}><TerminalSession controller={controller} sessionId={sessionId} active={active && activeId === tab.id} /></div>) : <div className="pilot-terminal__empty"><p>没有打开的终端</p><button type="button" onClick={create}>新建终端</button></div>}
  </div>
}

function TerminalSession({ controller, sessionId, active }: { controller: PilotController; sessionId: string; active: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const fitRef = useRef<FitAddon | undefined>(undefined)
  const terminalIdRef = useRef('')
  const pendingEventsRef = useRef<HarnessEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const container = hostRef.current
    if (!container) return
    let mounted = true
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 12, lineHeight: 1.4,
      cursorBlink: true, allowProposedApi: true, scrollback: 5000,
      theme: { background: '#14191b', foreground: '#e8eeee', cursor: '#73d1c0', selectionBackground: '#31474a' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    fitRef.current = fit
    term.open(container)
    term.onData(data => { if (terminalIdRef.current) void controller.writeTerminalFor(sessionId, terminalIdRef.current, data).catch(() => undefined) })
    const writeEvent = (event: HarnessEvent) => {
      if (event.type === 'terminal-output') term.write(typeof event.payload.data === 'string' ? event.payload.data : '')
      else { term.write(`\r\n\x1b[31m终端已退出（代码 ${String(event.payload.exitCode ?? '?')}）\x1b[0m\r\n`); setError(`终端已退出（代码 ${String(event.payload.exitCode ?? '?')}）`) }
    }
    const unsubscribe = controller.onTerminalEvent(event => {
      if (event.sessionId !== sessionId) return
      if (!terminalIdRef.current) { pendingEventsRef.current.push(event); return }
      if (event.payload.terminalId === terminalIdRef.current) writeEvent(event)
    })
    const observer = new ResizeObserver(() => {
      if (!mounted || !fitRef.current || !container.getClientRects().length) return
      try { fit.fit(); if (terminalIdRef.current) void controller.resizeTerminalFor(sessionId, terminalIdRef.current, term.cols, term.rows).catch(() => undefined) } catch { /* 隐藏面板时没有尺寸 */ }
    })
    observer.observe(container)
    void controller.openTerminalFor(sessionId).then(result => {
      if (!mounted) return void controller.closeTerminalFor(sessionId, result.terminalId)
      terminalIdRef.current = result.terminalId
      term.clear()
      for (const event of pendingEventsRef.current.splice(0)) if (event.payload.terminalId === result.terminalId) writeEvent(event)
      try { if (container.getClientRects().length) fit.fit() } catch { /* 首次布局尚未完成 */ }
      void controller.resizeTerminalFor(sessionId, result.terminalId, term.cols, term.rows).catch(() => undefined)
      setConnected(true)
    }).catch(cause => { if (mounted) setError(cause instanceof Error ? cause.message : '终端启动失败') })
    return () => {
      mounted = false
      unsubscribe(); observer.disconnect()
      if (terminalIdRef.current) void controller.closeTerminalFor(sessionId, terminalIdRef.current)
      terminalIdRef.current = ''; pendingEventsRef.current = []
      term.dispose(); fitRef.current = undefined
    }
  }, [controller, sessionId])
  useEffect(() => {
    if (!active || !fitRef.current) return
    try { fitRef.current.fit() } catch { /* 面板尚未布局 */ }
  }, [active])
  return <><div className="pilot-terminal__head"><span>{error ? '已退出' : connected ? '已连接' : '正在连接…'}</span><small>会话工作目录 · PTY</small></div><div ref={hostRef} className="pilot-terminal__host" />{error && <p className="pilot-file-error" role="alert">{error}</p>}</>
}
