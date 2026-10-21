import { formatConversationWorkDuration } from '../../lib/conversation-work-duration'
import type { conversationFloatingStatus } from '../../lib/conversation-timeline'
/* Single-instance conversation host adapted from ZCode ConversationHost (Apache-2.0).
 * Copyright 2026 Z.AI Co., Ltd. Mira retains its controllers, editor DOM and terminals. */
import React, { Component, createRef, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { SidebarActionHint } from '../session/SidebarCollectionSection'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, ChevronUp, GripVertical, LoaderCircle, MessageSquare, Minus, X } from 'lucide-react'
import { miraFloatingAnchors, miraFloatingPosition, miraNearestFloatingAnchor, type MiraFloatingAnchor, type MiraFullView } from '../../lib/side-pane-full-view'
import type { PilotController } from '../../state/pilot-state'

const Presentation = createContext({ floating: false, placeholder: undefined as string | undefined })
export const useMiraConversationPresentation = () => useContext(Presentation)
const anchorKey = 'mira-side-pane-full-view-anchor'
// Snapshot before React changes the docked layout; animate only explicit entries into floating.
class FloatingComposerTransition extends Component<{ floating: boolean; ready: boolean; owner: string; children: ReactNode }> {
  private root = createRef<HTMLDivElement>()
  private frame = 0
  private pending?: DOMRect
  private animation?: Animation
  private motion?: MediaQueryList
  private stop = () => {
    cancelAnimationFrame(this.frame); this.pending = undefined
    this.animation?.cancel(); this.animation = undefined
    const host = this.root.current?.firstElementChild as HTMLElement | null
    if (host) { host.style.visibility = ''; delete host.dataset.entering }
  }
  componentDidMount() {
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.motion.addEventListener?.('change', this.stop)
    window.addEventListener('resize', this.stop)
    document.addEventListener('visibilitychange', this.stop)
  }
  getSnapshotBeforeUpdate(previous: Readonly<FloatingComposerTransition['props']>) {
    if (previous.floating || !this.props.floating || !previous.ready || !this.props.ready || previous.owner !== this.props.owner) return null
    const composer = this.root.current?.querySelector<HTMLElement>('.mira-task-grid__pane[data-focused="true"] .mira-composer-region, .mira-composer-region')
    const rect = composer?.getBoundingClientRect()
    return rect?.width && rect.height ? rect : null
  }
  componentDidUpdate(previous: Readonly<FloatingComposerTransition['props']>, _state: unknown, before: DOMRect | null) {
    if (!this.props.ready || !this.props.floating || previous.owner !== this.props.owner) this.stop()
    if (!before) return
    this.stop()
    const host = this.root.current?.firstElementChild as HTMLElement | null
    if (!host || document.hidden || this.motion?.matches) return
    host.dataset.entering = 'true'
    host.style.visibility = 'hidden'
    // Register after layout effects so slot measurement commits before the animation reads its target.
    this.pending = before
    queueMicrotask(() => {
      if (this.pending !== before) return
      this.frame = requestAnimationFrame(() => {
        host.style.visibility = ''
        const composer = host.querySelector<HTMLElement>('.mira-task-grid__pane[data-focused="true"] .mira-composer-region, .mira-composer-region')
        const after = composer?.getBoundingClientRect()
        if (!after?.width || !after.height || !host.animate) { this.stop(); return }
        const animation = host.animate([
          { transformOrigin: 'bottom left', transform: `translate(${before.left - after.left}px, ${before.bottom - after.bottom}px) scale(${before.width / after.width})` },
          { transformOrigin: 'bottom left', transform: 'none' },
        ], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
        this.animation = animation
        animation.addEventListener('finish', this.stop, { once: true })
      })
    })
  }
  componentWillUnmount() {
    this.stop(); this.motion?.removeEventListener?.('change', this.stop)
    window.removeEventListener('resize', this.stop)
    document.removeEventListener('visibilitychange', this.stop)
  }
  render() { return <div ref={this.root} className="mira-floating-transition" onPointerDownCapture={this.stop}>{this.props.children}</div> }
}
export function MiraFullViewHost({ children, view, onChange, slotRef, owner, state, controller, status, ready = true }: {
  ready?: boolean; status: ReturnType<typeof conversationFloatingStatus>
  children: ReactNode; view?: MiraFullView; onChange: (view: MiraFullView) => void
  controller: PilotController; slotRef: RefObject<HTMLDivElement | null>; owner: string; state: ReturnType<PilotController['getSnapshot']>
}) {
  const host = useRef<HTMLDivElement>(null)
  const [slot, setSlot] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const [composerHeight, setComposerHeight] = useState(64)
  const [anchor, setAnchor] = useState<MiraFloatingAnchor>('bottom-right')
  const anchorChanged = useRef(false)
  useEffect(() => { let current = true; void controller.getPreference(anchorKey).then(value => { if (current && !anchorChanged.current && miraFloatingAnchors.includes(value as MiraFloatingAnchor)) setAnchor(value as MiraFloatingAnchor) }).catch(error => controller.reportError(error)); return () => { current = false } }, [controller])
  const [drag, setDrag] = useState<{ x: number; y: number }>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const answerMemory = useRef(new Map<string, { baseline: string; bubble?: string }>())
  const [bubbleRevision, setBubbleRevision] = useState(0)
  const floating = view?.surface === 'resource'
  const minimized = floating && view.floating === 'minimized'
  const expanded = floating && view.floating === 'expanded'
  const previousMinimized = useRef(minimized)
  const minimizing = minimized || previousMinimized.current
  useLayoutEffect(() => { previousMinimized.current = minimized }, [minimized])
  const running = status.running
  const waiting = Boolean(state.memoryConfirmation || state.permission || state.session?.pendingInteraction?.status === 'waiting')
  const answerKey = status.answer ? status.turnKey : ''
  const latest = useRef({ view, owner, onChange, slot, anchor }); latest.current = { view, owner, onChange, slot, anchor }
  useLayoutEffect(() => {
    if (!view) return
    let observer: ResizeObserver | undefined
    const update = () => {
      const element = slotRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      setSlot(previous => previous.left === rect.left && previous.top === rect.top && previous.width === rect.width && previous.height === rect.height ? previous : { left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    }
    // The resource slot is a later sibling and may mount in this same commit.
    // Wait until its ref and full-view layout are both available before observing.
    const frame = requestAnimationFrame(() => {
      flushSync(update)
      if (slotRef.current) { observer = new ResizeObserver(update); observer.observe(slotRef.current) }
    })
    window.addEventListener('resize', update)
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', update) }
  }, [Boolean(view), slotRef, owner])
  useLayoutEffect(() => {
    if (!floating || !host.current) return
    const element = host.current
    const measure = () => {
      const pane = element.querySelector<HTMLElement>('.mira-task-grid__pane[data-focused="true"]')
      const composer = (pane || element).querySelector<HTMLElement>('.mira-composer-region')
      if (composer) setComposerHeight(Math.max(48, composer.offsetHeight))
    }
    const observer = new ResizeObserver(measure)
    element.querySelectorAll('.mira-composer-region').forEach(node => observer.observe(node))
    measure(); return () => observer.disconnect()
  }, [floating, owner, waiting, slot.width])
  useEffect(() => () => { const memory = answerMemory.current.get(owner); if (memory) memory.baseline = '' }, [floating, owner])
  useEffect(() => {
    if (!floating) { const previous = answerMemory.current.get(owner); if (previous) previous.baseline = ''; return }
    let memory = answerMemory.current.get(owner)
    if (!memory || !memory.baseline) {
      memory = { baseline: !running ? answerKey || 'empty' : 'running', bubble: memory?.bubble }
      answerMemory.current.set(owner, memory)
    }
    if (!running && answerKey && answerKey !== memory.baseline) {
      memory.baseline = answerKey
      memory.bubble = status.answer.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>|[*#`_>]/g, '').trim()
      setBubbleRevision(value => value + 1)
    }
  }, [floating, owner, running, answerKey, status.answer])
  useEffect(() => { if (minimized && waiting && view) onChange({ ...view, floating: 'collapsed' }) }, [minimized, waiting, view, onChange])
  useEffect(() => { if (!floating || !running) return; const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer) }, [floating, running])
  useEffect(() => { setDrag(undefined); setMenuOpen(false) }, [owner, floating])
  const headerVisible = floating && !minimized && (expanded || hovered || menuOpen || Boolean(drag))
  const width = Math.max(48, Math.min(560, slot.width - 32))
  const fullHeight = Math.max(composerHeight + 40, Math.min(640, slot.height - 32))
  const size = { width: minimized ? 48 : width, height: minimized ? 48 : expanded ? fullHeight : composerHeight + (headerVisible ? 40 : 0) }
  const position = drag || miraFloatingPosition(slot, size, anchor)
  const style: CSSProperties | undefined = !view ? undefined : floating ? { position: 'fixed', left: slot.left + position.x, top: slot.top + position.y, width: size.width, height: size.height, '--mira-floating-width': `${width}px`, '--mira-floating-height': `${fullHeight - 40}px`, '--mira-floating-composer-height': `${composerHeight}px` } as CSSProperties : { position: 'fixed', left: slot.left, top: slot.top, width: slot.width, height: slot.height }
  useLayoutEffect(() => {
    let frame = 0
    const until = performance.now() + 300
    const update = () => {
      window.dispatchEvent(new Event('mira:full-view-geometry'))
      if (performance.now() < until) frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [view?.surface, view?.floating, slot.left, slot.top, position.x, position.y, size.width, size.height, hovered, menuOpen, bubbleRevision])
  const cancelDrag = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => cancelDrag.current?.(), [owner, floating])
  function startDrag(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const initial = { x: event.clientX, y: event.clientY }, origin = position
    let moved = false, next = origin
    const move = (pointer: globalThis.PointerEvent) => {
      if (Math.hypot(pointer.clientX - initial.x, pointer.clientY - initial.y) > 4) moved = true
      if (!moved) return
      next = { x: Math.max(16, Math.min(slot.width - size.width - 16, origin.x + pointer.clientX - initial.x)), y: Math.max(16, Math.min(slot.height - size.height - 16, origin.y + pointer.clientY - initial.y)) }
      setDrag(next)
    }
    const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', cleanup); window.removeEventListener('blur', cleanup); setDrag(undefined); cancelDrag.current = undefined }
    const finish = () => {
      cleanup()
      if (moved) { const nextAnchor = miraNearestFloatingAnchor(slot, size, next); setAnchor(nextAnchor); anchorChanged.current = true; void controller.setPreference(anchorKey, nextAnchor, true).catch(error => controller.reportError(error)) }
      else if (minimized && latest.current.view) { onChange({ ...latest.current.view, floating: 'collapsed' }); requestAnimationFrame(() => host.current?.querySelector<HTMLElement>('.mira-task-grid__pane[data-focused="true"] .mira-prompt-editor')?.focus()) }
      else setMenuOpen(true)
    }
    cancelDrag.current?.(); cancelDrag.current = cleanup
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', cleanup); window.addEventListener('blur', cleanup)
  }
  const bubble = answerMemory.current.get(owner)?.bubble
  const startedAt = status.startedAt
  return <FloatingComposerTransition floating={Boolean(floating)} ready={ready} owner={owner}><Presentation.Provider value={{ floating, placeholder: floating && running && startedAt ? `工作中 ${formatConversationWorkDuration(clock - startedAt)}` : undefined }}>
    <div ref={host} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} className="mira-full-view-host" data-mode={!view ? 'docked' : floating ? 'floating' : 'conversation'} data-floating={floating ? view.floating : undefined} data-anchor={anchor} data-dragging={Boolean(drag)} data-menu-open={menuOpen} data-header-visible={headerVisible} data-minimizing={minimizing} style={style}>
      {floating && bubble && view.floating === 'collapsed' && <div className="mira-floating-answer" data-revision={bubbleRevision}><button type="button" aria-label="展开最新回答" onClick={() => { const memory = answerMemory.current.get(owner); if (memory) delete memory.bubble; onChange({ ...view, floating: 'expanded' }) }}>{bubble}</button><button type="button" aria-label="关闭回答提示" onMouseDown={event => event.preventDefault()} onClick={() => { const memory = answerMemory.current.get(owner); if (memory) delete memory.bubble; setBubbleRevision(value => value + 1) }}><X size={12} /></button></div>}
      {floating && <Tooltip.Provider delayDuration={350} disableHoverableContent><div className="mira-floating-toolbar" onMouseDown={event => event.preventDefault()}><SidebarActionHint title="最小化编辑器" suspended={menuOpen || Boolean(drag)}><button type="button" aria-label="最小化编辑器" onClick={() => onChange({ ...view, floating: 'minimized' })}><Minus size={16} /></button></SidebarActionHint><SidebarActionHint title={expanded ? '收起消息流' : '展开消息流'} suspended={menuOpen || Boolean(drag)}><button type="button" aria-expanded={expanded} aria-pressed={expanded} aria-label={expanded ? '收起消息流' : '展开消息流'} onClick={() => onChange({ ...view, floating: expanded ? 'collapsed' : 'expanded' })}>{expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button></SidebarActionHint>{running && <LoaderCircle size={15} className="animate-spin" aria-label="任务运行中" />}<DropdownMenu.Root modal={false} open={menuOpen} onOpenChange={setMenuOpen}><SidebarActionHint title="拖动以移动 · 点击查看选项" suspended={menuOpen || Boolean(drag)}><DropdownMenu.Trigger asChild><button type="button" className="mira-floating-handle" aria-label="拖动以移动 · 点击查看选项" onPointerDown={event => { startDrag(event); event.stopPropagation() }} onClick={event => event.preventDefault()}><GripVertical size={16} /></button></DropdownMenu.Trigger></SidebarActionHint><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" align="end" side="top" onCloseAutoFocus={event => event.preventDefault()}><DropdownMenu.Item className="mira-session-menu__item" onSelect={() => onChange({ ...view, surface: 'conversation' })}>在完整视图中打开</DropdownMenu.Item><DropdownMenu.Item className="mira-session-menu__item" onSelect={() => onChange({ ...view, floating: 'minimized' })}>最小化编辑器</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div></Tooltip.Provider>}
      <div className="mira-full-view-host__content" inert={minimized || undefined}><div className="mira-full-view-host__pane">{children}</div></div>
      {minimized && <button type="button" className="mira-floating-minimized" aria-label="恢复对话输入框" title="恢复对话输入框" onPointerDown={startDrag} onClick={event => { if (event.detail === 0) onChange({ ...view, floating: 'collapsed' }) }}>{running ? <LoaderCircle size={20} className="animate-spin" /> : <MessageSquare size={20} />}</button>}
    </div>
  </Presentation.Provider></FloatingComposerTransition>
}
