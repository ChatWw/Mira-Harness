// Adapted from ZCode ConversationTimeline and conversationTimelineLiveTail (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira reuses assistant-ui's public message renderers.
import { ThreadPrimitive, useAuiState } from '@assistant-ui/react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type RefObject } from 'react'
import type { ConversationScrollActions } from '../../hooks/useConversationScroll'
import { conversationScrollMemory } from '../../lib/conversation-scroll'
import { buildConversationRenderTurns, createConversationHeightCache, indexConversationTurnMessages, type ConversationRenderTurn, type ConversationTimelineActions } from '../../lib/conversation-timeline'
import type { TimelineRenderMessage } from './conversation-model'

type MessageComponents = { UserMessage: ComponentType; AssistantMessage: ComponentType }

function TimelineMessage({ index, rendererId, components }: { index: number; rendererId: string; components: MessageComponents }) {
  // External-store updates commit after the parent's render; never mount a stale index provider.
  const available = useAuiState(state => state.thread.messages[index]?.id === rendererId)
  return available ? <ThreadPrimitive.MessageByIndex index={index} components={components} /> : null
}

export function MiraConversationTimeline({ messages, memoryKey, liveMessageId, viewportRef, scrollActionsRef, actionsRef, components, onActiveTurnChange }: {
  messages: TimelineRenderMessage[]
  memoryKey: string | null
  liveMessageId?: string
  viewportRef: RefObject<HTMLDivElement | null>
  scrollActionsRef: RefObject<ConversationScrollActions | null>
  actionsRef: RefObject<ConversationTimelineActions | null>
  components: MessageComponents
  onActiveTurnChange: (id: string) => void
}) {
  const turns = useMemo(() => buildConversationRenderTurns(messages, liveMessageId), [messages, liveMessageId])
  const liveTurn = turns[turns.length - 1]?.running ? turns[turns.length - 1] : undefined
  const history = liveTurn ? turns.slice(0, -1) : turns
  const messageIndex = useMemo(() => indexConversationTurnMessages(turns, messages), [turns, messages])
  const heights = useMemo(() => createConversationHeightCache(), [])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [retainedTurnIds, setRetainedTurnIds] = useState<string[]>([])
  const liveRef = useRef<HTMLDivElement | null>(null)
  const navigationFrame = useRef<number | undefined>(undefined)
  const requestActiveTurnUpdate = useRef<(() => void) | null>(null)
  const widthChangedAt = useRef(0)
  const unitsRef = useRef(history)
  unitsRef.current = history
  // Child layout effects run before the parent Viewport's callback ref attaches.
  const getScrollElement = useCallback(() => viewportRef.current ?? containerRef.current?.closest<HTMLDivElement>('.mira-message-viewport') ?? null, [viewportRef])
  const getItemKey = useCallback((index: number) => unitsRef.current[index].id, [])
  const estimateSize = useCallback((index: number) => heights.estimate(unitsRef.current[index].id), [heights])
  const initialOffset = () => {
    const saved = conversationScrollMemory.read(memoryKey)
    const index = saved && !saved.following && saved.anchor ? history.findIndex(turn => turn.id === saved.anchor!.turnId) : -1
    const initialTurns = index >= 0 ? history.slice(0, index) : history
    return 64 + initialTurns.reduce((height, turn) => height + heights.estimate(turn.id), 0)
  }
  const measureElement = useCallback((element: Element, entry: ResizeObserverEntry | undefined) => {
    const height = Math.round(entry?.borderBoxSize?.[0]?.blockSize ?? element.getBoundingClientRect().height)
    const id = (element as HTMLElement).dataset.miraTurnId
    if (id) heights.save(id, height)
    return height
  }, [heights])
  const retainedIndexes = useMemo(() => { const retained = new Set(retainedTurnIds); return history.flatMap((turn, index) => retained.has(turn.id) ? [index] : []) }, [history, retainedTurnIds])
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => [...new Set([...defaultRangeExtractor(range), ...retainedIndexes])].sort((left, right) => left - right), [retainedIndexes])
  const virtualizer = useVirtualizer({ count: history.length, getScrollElement, getItemKey, estimateSize, measureElement, initialOffset, overscan: 8, scrollMargin: 64, rangeExtractor })
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = item => {
    const scroll = scrollActionsRef.current
    return Boolean(scroll && !scroll.isFollowing() && !scroll.isRestoring() && performance.now() - widthChangedAt.current > 120 && item.end <= (viewportRef.current?.scrollTop ?? 0))
  }
  const rows = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const mountedKey = rows.map(row => row.key).join('|')
  const firstTurnId = turns[0]?.id ?? ''

  const retainInteractions = useCallback(() => {
    const list = containerRef.current
    if (!list) return
    const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement.closest<HTMLElement>('[data-mira-turn-id]')?.dataset.miraTurnId : undefined
    const ids = [...new Set([...list.querySelectorAll<HTMLElement>('[data-mira-editing]')].map(element => element.closest<HTMLElement>('[data-mira-turn-id]')?.dataset.miraTurnId).filter((id): id is string => Boolean(id)).concat(focused ? [focused] : []))]
    setRetainedTurnIds(previous => previous.length === ids.length && previous.every((id, index) => id === ids[index]) ? previous : ids)
  }, [])
  useLayoutEffect(() => {
    const list = containerRef.current
    if (!list) return
    // Observe only editor state: streaming text and tool payload changes must not
    // force a full list scan. Active editors survive wheel scrolling even after blur.
    const observer = new MutationObserver(retainInteractions)
    observer.observe(list, { subtree: true, attributes: true, attributeFilter: ['data-mira-editing'] })
    retainInteractions()
    return () => observer.disconnect()
  }, [retainInteractions])

  useLayoutEffect(() => {
    const column = containerRef.current?.closest('.mira-message-column')
    if (!column) return
    let width = column.getBoundingClientRect().width
    const observer = new ResizeObserver(entries => {
      const next = entries[0].contentRect.width
      if (Math.abs(next - width) > 1) { widthChangedAt.current = performance.now(); width = next }
    })
    observer.observe(column)
    return () => observer.disconnect()
  }, [viewportRef])

  const turnElement = (id: string) => [...(viewportRef.current?.querySelectorAll<HTMLElement>('[data-mira-turn-id]') ?? [])].find(element => element.dataset.miraTurnId === id)
  const messageElement = (messageId: string) => {
    const index = messageIndex.get(messageId)
    const turn = index === undefined ? undefined : turns[index]
    const member = turn?.messageIndexes.find(index => messages[index].original.id === messageId || messages[index].rendererId === messageId || messages[index].original.id === `stream-${messageId}`)
    if (member === undefined) return undefined
    const { original, rendererId } = messages[member]
    return [...(viewportRef.current?.querySelectorAll<HTMLElement>('[data-user-message-id], [data-assistant-message-id]') ?? [])].find(element => element.dataset.rendererMessageId === rendererId || element.dataset.userMessageId === rendererId || element.dataset.assistantMessageId === original.id)
  }

  useLayoutEffect(() => {
    const live = liveRef.current
    if (!live || !liveTurn) return
    // Preserve the real live height before completion moves the turn into absolute history.
    const observer = new ResizeObserver(entries => {
      measureElement(live, entries[0])
      requestActiveTurnUpdate.current?.()
    })
    measureElement(live, undefined)
    observer.observe(live)
    return () => { measureElement(live, undefined); observer.disconnect() }
  }, [liveTurn?.id, measureElement])

  useLayoutEffect(() => {
    const actions: ConversationTimelineActions = {
      restore(position, viewport) {
        if (!position.anchor || position.following) return undefined
        const index = turns.findIndex(turn => turn.id === position.anchor!.turnId)
        if (index < 0) return undefined
        const target = turnElement(position.anchor.turnId)
        if (!target) { if (index < history.length) virtualizer.scrollToIndex(index, { align: 'start' }); return false }
        if (target.querySelectorAll('[data-renderer-message-id]').length !== turns[index].messageIndexes.length) return false
        // Runtime messages can appear after the wrapper's ref measured an empty turn.
        // Wait for both measured sizes and their new transforms to reach the DOM.
        for (const row of viewport.querySelectorAll<HTMLElement>('[data-mira-turn-id]:not([data-mira-live-turn])')) virtualizer.measureElement(row)
        const measured = virtualizer.getVirtualItems().find(row => row.index === index)
        const container = containerRef.current
        const spacerHeight = Number.parseFloat((container?.firstElementChild as HTMLElement | undefined)?.style.height ?? '')
        if (index < history.length && (!measured || !container || Math.abs(target.getBoundingClientRect().top - container.getBoundingClientRect().top - (measured.start - 64)) > 1 || Math.abs(spacerHeight - virtualizer.getTotalSize()) > 1)) return false
        viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - position.anchor.offset
        return true
      },
      jumpToMessage(id, align = 'start', onMounted) {
        const index = messageIndex.get(id)
        if (index === undefined) return
        scrollActionsRef.current?.pause()
        if (navigationFrame.current !== undefined) cancelAnimationFrame(navigationFrame.current)
        if (!messageElement(id) && index < history.length) virtualizer.scrollToIndex(index, { align: 'start', behavior: 'auto' })
        let frames = 0, cancelled = false
        const land = () => {
          if (cancelled) return
          const target = messageElement(id)
          const turn = turns[index]
          const wrapper = turnElement(turn.id)
          if (onMounted && target && index < history.length) {
            for (const row of viewportRef.current?.querySelectorAll<HTMLElement>('[data-mira-turn-id]:not([data-mira-live-turn])') ?? []) virtualizer.measureElement(row)
            const measured = virtualizer.getVirtualItems().find(row => row.index === index)
            const container = containerRef.current
            const spacerHeight = Number.parseFloat((container?.firstElementChild as HTMLElement | undefined)?.style.height ?? '')
            if (!wrapper || !measured || !container || Math.abs(wrapper.getBoundingClientRect().top - container.getBoundingClientRect().top - (measured.start - 64)) > 1 || Math.abs(spacerHeight - virtualizer.getTotalSize()) > 1) {
              if (++frames < 30) navigationFrame.current = requestAnimationFrame(land)
              return
            }
          }
          if (target) {
            target.scrollIntoView({ block: align, behavior: onMounted || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
            onMounted?.()
          }
          else if (++frames < 12) { navigationFrame.current = requestAnimationFrame(land); return }
          navigationFrame.current = undefined
        }
        navigationFrame.current = requestAnimationFrame(land)
        return () => { cancelled = true }
      },
      jumpToInteraction() {
        const target = viewportRef.current?.querySelector<HTMLElement>('[aria-label="计划确认"], .pilot-action')
        if (!target) return false
        scrollActionsRef.current?.pause()
        target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        return true
      },
    }
    actionsRef.current = actions
    return () => { if (actionsRef.current === actions) actionsRef.current = null }
  })
  useLayoutEffect(() => () => { if (navigationFrame.current !== undefined) cancelAnimationFrame(navigationFrame.current) }, [])

  useEffect(() => {
    const viewport = getScrollElement()
    if (!viewport) return
    let frame: number | undefined
    const update = () => {
      frame = undefined
      if (getScrollElement() !== viewport || viewport.clientHeight <= 0) return
      const top = viewport.getBoundingClientRect().top + 48
      const visible = [...viewport.querySelectorAll<HTMLElement>('[data-mira-turn-id]')].find(element => element.getBoundingClientRect().bottom > top)
      let active = visible?.dataset.miraTurnId ?? firstTurnId
      for (const message of viewport.querySelectorAll<HTMLElement>('[data-user-message-id]')) {
        if (message.getBoundingClientRect().top > top) break
        active = message.dataset.userMessageId ?? active
      }
      onActiveTurnChange(active)
    }
    const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(update) }
    requestActiveTurnUpdate.current = schedule
    schedule()
    viewport.addEventListener('scroll', schedule, { passive: true })
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      viewport.removeEventListener('scroll', schedule)
      if (requestActiveTurnUpdate.current === schedule) requestActiveTurnUpdate.current = null
    }
  }, [firstTurnId, getScrollElement, onActiveTurnChange])
  useEffect(() => { requestActiveTurnUpdate.current?.() }, [mountedKey, totalSize, turns])

  const renderTurn = (turn: ConversationRenderTurn) => <div className="flex min-w-0 flex-col gap-5" style={{ paddingBottom: turn === turns[turns.length - 1] ? 0 : 20 }}>{turn.messageIndexes.map(index => <TimelineMessage key={messages[index].rendererId} index={index} rendererId={messages[index].rendererId} components={components} />)}</div>
  return <div ref={containerRef} className="relative w-full" onFocusCapture={retainInteractions} onBlurCapture={() => queueMicrotask(retainInteractions)}>
    <div data-mira-virtual-history="true" style={{ height: totalSize }} aria-hidden="true" />
    {/* Keep a turn under the same keyed parent when the running tail becomes history. */}
    {[...rows.map(row => ({ turn: history[row.index], row })), ...(liveTurn ? [{ turn: liveTurn, row: undefined }] : [])].map(({ turn, row }) => <div key={turn.id} ref={row ? virtualizer.measureElement : liveRef} data-index={row?.index ?? history.length} data-mira-turn-id={turn.id} data-mira-live-turn={!row || undefined} className={row ? 'absolute left-0 top-0 w-full' : 'relative w-full shrink-0'} style={row ? { transform: `translateY(${row.start - 64}px)` } : undefined}>{renderTurn(turn)}</div>)}
  </div>
}
