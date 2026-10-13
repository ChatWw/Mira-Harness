/* Floating selection action adapted from ZCode ConversationSelectionTooltip,
 * SelectionActionMenu and useTextSelection. Copyright 2026 Z.AI Co., Ltd.
 * Apache-2.0; see third-party-licenses/zcode. Mira scopes actions to its owner. */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquare, Quote } from 'lucide-react'
import { inspectMiraConversationSelection, MIRA_SELECTION_MAX_LENGTH, type MiraConversationSelection } from '../../lib/mira-conversation-selection'

type SelectionSnapshot = NonNullable<ReturnType<typeof inspectMiraConversationSelection>>

export function MiraSelectionActions({ rootRef, sessionId, enabled, onAdd, onSideConversation }: {
  rootRef: RefObject<HTMLDivElement | null>
  sessionId?: string
  enabled: boolean
  onAdd: (reference: MiraConversationSelection) => boolean
  onSideConversation?: (reference: MiraConversationSelection) => Promise<void>
}) {
  const [snapshot, setSnapshot] = useState<SelectionSnapshot>()
  const menuRef = useRef<HTMLDivElement>(null)
  const live = useRef({ sessionId, enabled, onAdd, onSideConversation })
  live.current = { sessionId, enabled, onAdd, onSideConversation }
  useEffect(() => {
    setSnapshot(undefined)
    const root = rootRef.current
    if (!root || !enabled || !sessionId) return
    const doc = root.ownerDocument
    let frame = 0
    const close = () => { cancelAnimationFrame(frame); setSnapshot(undefined) }
    const inspect = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setSnapshot(inspectMiraConversationSelection(root, sessionId)))
    }
    const keyUp = (event: KeyboardEvent) => { if (event.key !== 'Escape' && !event.isComposing && event.keyCode !== 229) inspect() }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || !menuRef.current) return
      event.preventDefault(); close()
    }
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) close() }
    root.addEventListener('mouseup', inspect)
    doc.addEventListener('selectionchange', inspect)
    doc.addEventListener('keyup', keyUp)
    doc.addEventListener('keydown', keyDown)
    doc.addEventListener('pointerdown', outside)
    root.addEventListener('scroll', close, { capture: true, passive: true })
    window.addEventListener('resize', close)
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener('mouseup', inspect)
      doc.removeEventListener('selectionchange', inspect)
      doc.removeEventListener('keyup', keyUp)
      doc.removeEventListener('keydown', keyDown)
      doc.removeEventListener('pointerdown', outside)
      root.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [rootRef, sessionId, enabled])
  const current = enabled && snapshot?.reference.sessionId === sessionId ? snapshot : undefined
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu || !current) return
    const position = () => {
      const box = menu.getBoundingClientRect()
      const { center, top, bottom } = current.rect
      menu.style.left = `${Math.max(12, Math.min(window.innerWidth - box.width - 12, center - box.width / 2))}px`
      menu.style.top = `${Math.max(12, Math.min(window.innerHeight - box.height - 12, top - box.height - 8 >= 12 ? top - box.height - 8 : bottom + 8))}px`
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(menu)
    return () => observer.disconnect()
  }, [current])
  if (!current) return null
  const add = (side = false) => {
    const root = rootRef.current
    const latest = root && live.current.enabled && live.current.sessionId === current.reference.sessionId ? inspectMiraConversationSelection(root, current.reference.sessionId) : undefined
    // Virtual rows, task navigation or a streaming update must not quote stale DOM.
    if (latest && JSON.stringify(latest.reference) === JSON.stringify(current.reference) && (side ? Boolean(live.current.onSideConversation) : live.current.onAdd(current.reference))) {
      if (side) void live.current.onSideConversation?.(current.reference)
      root!.ownerDocument.getSelection()?.removeAllRanges()
    }
    setSnapshot(undefined)
  }
  return createPortal(<div ref={menuRef} className="mira-selection-actions" data-mira-selection-menu role="toolbar" aria-label="选中文本操作" style={{ left: 12, top: 12 }} onMouseDown={event => event.preventDefault()} onPointerDown={event => event.preventDefault()}>
    {current.reference.text.length > MIRA_SELECTION_MAX_LENGTH ? <span role="status">单个引用最多 8000 字，请缩小选区</span> : <><button type="button" onClick={() => add()}><Quote size={14} aria-hidden="true" />添加到当前任务</button>{onSideConversation && <button type="button" onClick={() => add(true)}><MessageSquare size={14} aria-hidden="true" />在侧边栏对话中提问</button>}</>}
  </div>, rootRef.current!.ownerDocument.body)
}
