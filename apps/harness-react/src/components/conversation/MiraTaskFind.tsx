import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { HarnessFileChange } from '../../../../../src/config/harness'
import { changeFindTargets, createTaskFindProjector, taskFindMatches, type TaskFindScope } from '../../lib/conversation-find'
import { applyTaskFindHighlights, clearTaskFindHighlights, revealTaskFindRange } from '../../lib/conversation-find-dom'
import { buildConversationRenderTurns, type ConversationTimelineActions } from '../../lib/conversation-timeline'
import type { TimelineRenderMessage } from './conversation-model'
import { MiraConversationFindBar } from './MiraConversationFindBar'

export function MiraTaskFind({ active, sessionId, loading, requestId, messages, liveMessageId, changes, viewportRef, timelineRef, changesRef, onOpenChanges }: {
  active: boolean
  sessionId?: string
  loading: boolean
  requestId: number
  messages: TimelineRenderMessage[]
  liveMessageId?: string
  changes: Array<HarnessFileChange & { key: string }>
  viewportRef: RefObject<HTMLDivElement | null>
  timelineRef: RefObject<ConversationTimelineActions | null>
  changesRef: RefObject<HTMLDivElement | null>
  onOpenChanges: (changeId?: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<TaskFindScope>('conversation')
  const [selection, setSelection] = useState(0)
  const [navigationRequest, setNavigationRequest] = useState(0)
  const [focusRequest, setFocusRequest] = useState(0)
  const previousFocus = useRef<HTMLElement | null>(null)
  const handledRequest = useRef(0)
  const lastNavigation = useRef('')
  const interruptedNavigation = useRef('')
  const projector = useMemo(() => createTaskFindProjector(), [sessionId])
  const visible = open && active && Boolean(sessionId)
  const targets = useMemo(() => !visible || loading ? [] : scope === 'conversation' ? projector(messages) : changeFindTargets(changes), [visible, loading, scope, projector, messages, changes])
  const matches = useMemo(() => taskFindMatches(targets, query), [targets, query])
  const index = matches.length ? Math.min(selection, matches.length - 1) : -1
  const match = matches[index]
  const liveTarget = useMemo(() => Boolean(liveMessageId && scope === 'conversation' && buildConversationRenderTurns(messages, liveMessageId).some(turn => turn.running && turn.messageIndexes.some(index => messages[index].rendererId === match?.messageId))), [liveMessageId, scope, messages, match?.messageId])
  const current = useRef({ onOpenChanges, match })
  current.current = { onOpenChanges, match }

  function show() {
    if (!active || !sessionId || loading) return
    if (!open) previousFocus.current = document.activeElement as HTMLElement | null
    setOpen(true)
    setFocusRequest(value => value + 1)
  }
  function close() {
    const restore = Boolean(document.activeElement?.closest('.mira-conversation-find'))
    setOpen(false); setQuery(''); setScope('conversation'); setSelection(0)
    clearTaskFindHighlights()
    if (restore) requestAnimationFrame(() => {
      const previous = previousFocus.current
      if (previous?.isConnected && previous.getClientRects().length) previous.focus()
      else document.querySelector<HTMLElement>('[aria-label="任务内容"]')?.focus()
    })
  }
  useEffect(() => {
    if (requestId > handledRequest.current && active && sessionId && !loading) { handledRequest.current = requestId; show() }
  }, [requestId, active, sessionId, loading])
  useEffect(() => { setSelection(0); setNavigationRequest(value => value + 1) }, [sessionId])
  useEffect(() => {
    if (!active || !sessionId) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return
      if (document.querySelector('[role="dialog"]:not([aria-modal="false"]), [role="menu"][data-state="open"]')) return
      event.preventDefault(); show()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [active, sessionId, loading, open])

  useEffect(() => {
    if (!visible || loading || !query.trim()) { clearTaskFindHighlights(); return }
    let frame: number | undefined, disposed = false, navigationReady = false, stableFrames = 0, previousTop: number | undefined, cancelNavigation: void | (() => void)
    const intentKey = JSON.stringify([sessionId, scope, query, navigationRequest, match?.key, match?.occurrence])
    const navigationKey = JSON.stringify([intentKey, match?.streaming, liveTarget])
    const canNavigate = () => interruptedNavigation.current !== intentKey
    const apply = () => {
      frame = undefined
      if (disposed) return
      const root = scope === 'conversation' ? viewportRef.current : changesRef.current
      if (!root) return
      const range = applyTaskFindHighlights(root, query, current.current.match)
      if (canNavigate() && navigationReady && range && lastNavigation.current !== navigationKey) {
        const top = range.getBoundingClientRect().top
        stableFrames = previousTop !== undefined && Math.abs(top - previousTop) < 1 ? stableFrames + 1 : 0
        previousTop = top
        revealTaskFindRange(range, root)
        if (stableFrames >= 3) lastNavigation.current = navigationKey
        else schedule()
      }
    }
    const schedule = () => { if (!disposed && frame === undefined) frame = requestAnimationFrame(apply) }
    const observer = new MutationObserver(schedule)
    const root = document.getElementById('root')
    if (root) observer.observe(root, { childList: true, characterData: true, subtree: true })
    const stopNavigation = (event: Event) => {
      const reader = scope === 'conversation' ? viewportRef.current : changesRef.current
      if (!reader?.contains(event.target as Node)) return
      interruptedNavigation.current = intentKey
      lastNavigation.current = navigationKey
      cancelNavigation?.()
    }
    const stopKeyboardNavigation = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || !['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) return
      if ((event.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable="true"]')) return
      stopNavigation(event)
    }
    root?.addEventListener('wheel', stopNavigation, { passive: true })
    root?.addEventListener('pointerdown', stopNavigation)
    root?.addEventListener('keydown', stopKeyboardNavigation)
    const ready = () => { if (!disposed) { navigationReady = true; schedule() } }
    if (canNavigate() && scope === 'conversation' && match?.messageId && lastNavigation.current !== navigationKey) cancelNavigation = timelineRef.current?.jumpToMessage(match.messageId, 'center', ready)
    if (canNavigate() && scope === 'changes' && lastNavigation.current !== navigationKey) void current.current.onOpenChanges(match?.changeId).then(ready)
    schedule()
    return () => { disposed = true; cancelNavigation?.(); observer.disconnect(); root?.removeEventListener('wheel', stopNavigation); root?.removeEventListener('pointerdown', stopNavigation); root?.removeEventListener('keydown', stopKeyboardNavigation); if (frame !== undefined) cancelAnimationFrame(frame); clearTaskFindHighlights() }
  }, [visible, loading, sessionId, scope, query, navigationRequest, match?.key, match?.occurrence, match?.streaming, liveTarget, viewportRef, changesRef, timelineRef])

  return <MiraConversationFindBar open={visible} focusRequestId={focusRequest} query={query} scope={scope} count={matches.length} index={index}
    onQueryChange={value => { setQuery(value); setSelection(0); setNavigationRequest(request => request + 1) }}
    onScopeChange={value => { setScope(value); setSelection(0); setNavigationRequest(request => request + 1); if (value === 'changes') void onOpenChanges() }}
    onNavigate={direction => { if (matches.length) { setSelection((index + direction + matches.length) % matches.length); setNavigationRequest(request => request + 1) } }} onClose={close} />
}
