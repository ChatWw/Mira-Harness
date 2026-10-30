import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels'
import { Plus, X } from 'lucide-react'
import type { PilotController } from '../../state/pilot-state'
import { TerminalPanel } from './TerminalPanel'

type MiraTerminalTab = { id: string; sessionId: string; directory?: string; index: number; label: string; shellLabel?: string }
type MiraTerminalState = { tabs: MiraTerminalTab[]; selected: Record<string, string> }

export function MiraBottomTerminal({ controller, sessionId, directory, retainedSessionIds, open, active, onClose, onFocus, onOpenAddress, children }: {
  controller: PilotController; sessionId: string; directory?: string; retainedSessionIds: string[]
  open: boolean; active: boolean; onClose: () => void; onFocus: () => void
  onOpenAddress: (sessionId: string, url: string) => void; children: ReactNode
}) {
  const [terminals, setTerminals] = useState<MiraTerminalState>({ tabs: [], selected: {} })
  const panelRef = useRef<PanelImperativeHandle>(null)
  const panelElementRef = useRef<HTMLDivElement | null>(null)
  const height = useRef(240)
  const expanded = useRef(false)
  const transitioning = useRef(false)
  const exitedOwner = useRef<string | undefined>(undefined)
  const currentTabs = terminals.tabs.filter(tab => tab.sessionId === sessionId)
  const selected = currentTabs.find(tab => tab.id === terminals.selected[sessionId]) ?? currentTabs[0]
  const latest = useRef({ open, active, sessionId, selectedId: selected?.id, onClose, onOpenAddress })
  latest.current = { open, active, sessionId, selectedId: selected?.id, onClose, onOpenAddress }

  function appendTerminal(current: MiraTerminalState): MiraTerminalState {
    const index = Math.max(0, ...current.tabs.filter(tab => tab.sessionId === sessionId).map(tab => tab.index)) + 1
    const name = directory?.split(/[\\/]/).filter(Boolean).pop() || '终端'
    const tab = { id: crypto.randomUUID(), sessionId, directory, index, label: `${name} ${index}` }
    return { tabs: [...current.tabs, tab], selected: { ...current.selected, [sessionId]: tab.id } }
  }
  useEffect(() => {
    if (open && sessionId) setTerminals(current => current.tabs.some(tab => tab.sessionId === sessionId) ? current : appendTerminal(current))
  }, [open, sessionId])
  useEffect(() => {
    const name = directory?.split(/[\\/]/).filter(Boolean).pop() || '终端'
    setTerminals(current => current.tabs.some(tab => tab.sessionId === sessionId && tab.directory !== directory)
      ? { ...current, tabs: current.tabs.map(tab => tab.sessionId === sessionId ? { ...tab, directory, label: `${name} ${tab.index}` } : tab) }
      : current)
  }, [sessionId, directory])
  useEffect(() => {
    const retained = new Set(retainedSessionIds)
    if (sessionId) retained.add(sessionId)
    setTerminals(current => {
      if (current.tabs.every(tab => retained.has(tab.sessionId))) return current
      return { tabs: current.tabs.filter(tab => retained.has(tab.sessionId)), selected: Object.fromEntries(Object.entries(current.selected).filter(([id]) => retained.has(id))) }
    })
  }, [retainedSessionIds, sessionId])
  useEffect(() => {
    const panel = panelRef.current, element = panelElementRef.current
    if (!panel || !element) return
    const resize = () => {
      if (open) { expanded.current = true; panel.resize(`${height.current}px`) }
      else { expanded.current = false; panel.collapse() }
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { resize(); return }
    // Enable flex-grow motion only around explicit open/close commands.
    // Leave normal panel dragging and window resizing free of transitions.
    element.classList.add('mira-terminal-panel-motion')
    transitioning.current = true
    let timer: number | undefined
    const finish = () => {
      transitioning.current = false
      element.classList.remove('mira-terminal-panel-motion')
      element.removeEventListener('transitionend', onEnd)
      if (timer !== undefined) window.clearTimeout(timer)
    }
    const onEnd = (event: TransitionEvent) => { if (event.target === element && event.propertyName === 'flex-grow') finish() }
    element.addEventListener('transitionend', onEnd)
    const frame = window.requestAnimationFrame(() => { resize(); timer = window.setTimeout(finish, 240) })
    return () => { window.cancelAnimationFrame(frame); finish() }
  }, [open])
  useEffect(() => {
    if (exitedOwner.current === sessionId) { exitedOwner.current = undefined; onClose() }
  }, [terminals, sessionId, onClose])

  function removeTerminal(tab: MiraTerminalTab, exited = false) {
    const owner = latest.current
    const siblings = terminals.tabs.filter(item => item.sessionId === tab.sessionId && item.id !== tab.id)
    if (!exited && !siblings.length && owner.sessionId === tab.sessionId) {
      owner.onClose()
      return // Closing the last tab hides the panel and preserves its PTY.
    }
    setTerminals(current => {
      const tabs = current.tabs.filter(item => item.id !== tab.id)
      if (exited && latest.current.sessionId === tab.sessionId && !tabs.some(item => item.sessionId === tab.sessionId)) exitedOwner.current = tab.sessionId
      return { tabs, selected: current.selected[tab.sessionId] === tab.id ? { ...current.selected, [tab.sessionId]: tabs.find(item => item.sessionId === tab.sessionId)?.id ?? '' } : current.selected }
    })
  }
  function selectTerminal(id: string) {
    setTerminals(current => ({ ...current, selected: { ...current.selected, [sessionId]: id } }))
  }
  return <Group orientation="vertical" className="mira-terminal-layout" disabled={!open}>
    <Panel id="mira-primary-thread" minSize="50%" className="mira-primary-thread">{children}</Panel>
    {open && <Separator className="mira-terminal-resize" aria-label="调整底部终端高度" />}
    <Panel id="mira-bottom-terminal-panel" panelRef={panelRef} elementRef={panelElementRef} data-open={open} defaultSize="0px" minSize="140px" maxSize="50%" collapsedSize="0px" collapsible onResize={size => {
      if (transitioning.current) return
      if (open && size.inPixels >= 140) height.current = size.inPixels
      if (open && size.inPixels > 0) expanded.current = true
      if (open && size.asPercentage === 0 && expanded.current) { expanded.current = false; onClose() }
    }} className="mira-bottom-terminal-panel">
      {terminals.tabs.length > 0 && <section id="mira-bottom-terminal" className="mira-bottom-terminal" aria-label="底部终端" aria-hidden={!open} inert={!open} onFocusCapture={onFocus} onPointerDownCapture={onFocus}>
        <div className="mira-bottom-terminal__toolbar">
          <span className="mira-bottom-terminal__title">终端</span>
          {selected?.shellLabel && <span className="mira-bottom-terminal__shell">{selected.shellLabel}</span>}
          <div className="mira-bottom-terminal__tabs" role="tablist" aria-label="底部终端标签">
            {currentTabs.map(tab => <div key={tab.id} className="mira-bottom-terminal__tab" data-active={selected?.id === tab.id}>
              <button type="button" id={`mira-terminal-tab-${tab.id}`} role="tab" aria-selected={selected?.id === tab.id} aria-controls={`mira-terminal-view-${tab.id}`} tabIndex={selected?.id === tab.id ? 0 : -1} title={tab.label} onClick={() => selectTerminal(tab.id)} onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const index = currentTabs.indexOf(tab)
                const next = event.key === 'Home' ? currentTabs[0] : event.key === 'End' ? currentTabs[currentTabs.length - 1] : currentTabs[(index + (event.key === 'ArrowRight' ? 1 : currentTabs.length - 1)) % currentTabs.length]
                if (next) { selectTerminal(next.id); document.getElementById(`mira-terminal-tab-${next.id}`)?.focus() }
              }}>{tab.label}</button>
              <button type="button" className="mira-bottom-terminal__close-tab" aria-label={`关闭终端 ${tab.label}`} title={`关闭终端 ${tab.label}`} onClick={() => { removeTerminal(tab); if (currentTabs.length > 1) requestAnimationFrame(() => document.getElementById(`mira-terminal-tab-${selected?.id === tab.id ? currentTabs.find(item => item.id !== tab.id)?.id : selected?.id}`)?.focus()) }}><X size={12} /></button>
            </div>)}
          </div>
          <button type="button" className="mira-header-tool" aria-label="新建底部终端" title="新建终端" disabled={!active || !sessionId} onClick={() => setTerminals(appendTerminal)}><Plus size={16} /></button>
          <button type="button" className="mira-header-tool" aria-label="收起底部终端" title="收起终端" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="mira-bottom-terminal__body">{terminals.tabs.map(tab => {
          const visible = open && tab.sessionId === sessionId && tab.id === selected?.id
          return <div key={tab.id} id={`mira-terminal-view-${tab.id}`} role="tabpanel" aria-labelledby={`mira-terminal-tab-${tab.id}`} data-bottom-terminal-id={tab.id} hidden={!visible} inert={!visible} className="mira-bottom-terminal__view">
            <TerminalPanel onShellLabelChange={shellLabel => setTerminals(current => ({ ...current, tabs: current.tabs.map(item => item.id === tab.id ? { ...item, shellLabel } : item) }))} controller={controller} sessionId={tab.sessionId} directory={tab.directory} active={visible && active} focusOnActivate={visible} onExit={() => removeTerminal(tab, true)} onOpenAddress={url => {
              const owner = latest.current
              if (owner.open && owner.active && owner.sessionId === tab.sessionId && owner.selectedId === tab.id) owner.onOpenAddress(tab.sessionId, url)
            }} />
          </div>
        })}</div>
      </section>}
    </Panel>
  </Group>
}
