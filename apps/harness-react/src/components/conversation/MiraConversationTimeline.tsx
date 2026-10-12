// Adapted from ZCode ConversationTimeline and conversationTimelineLiveTail (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira renders its authoritative messages in visible turns.
import { defaultRangeExtractor, measureElement as measureVirtualElement, useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type RefObject } from 'react'
import type { HarnessGoal } from '../../../../../src/config/miraGoals'
import { MiraGoalVerification } from './MiraGoalVerification'
import { goalVerificationsByMessage } from './conversation-model'
import type { ConversationScrollActions } from '../../hooks/useConversationScroll'
import { conversationScrollMemory } from '../../lib/conversation-scroll'
import { buildConversationRenderTurns, createConversationHeightCache, indexConversationTurnMessages, type ConversationRenderTurn, type ConversationTimelineActions } from '../../lib/conversation-timeline'
import type { TimelineRenderMessage } from './conversation-model'
import { MIRA_REVEAL_PROCESS } from '../../lib/mira-assistant-process'

type MessageComponents = { UserMessage: ComponentType<TimelineRenderMessage>; AssistantMessage: ComponentType<TimelineRenderMessage & { streaming: boolean }> }

function TimelineMessage({ message, liveMessageId, components }: { message: TimelineRenderMessage; liveMessageId?: string; components: MessageComponents }) {
  return message.original.role === 'user' ? <components.UserMessage {...message} /> : message.original.role === 'assistant' ? <components.AssistantMessage {...message} streaming={message.original.id === liveMessageId} /> : null
}

export function MiraConversationTimeline({ messages, memoryKey, liveMessageId, viewportRef, scrollActionsRef, actionsRef, components, onActiveTurnChange, goal }: {
  goal?: HarnessGoal
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
  const goalVerifications = useMemo(() => goalVerificationsByMessage(goal), [goal])
  const liveTurn = turns[turns.length - 1]?.running ? turns[turns.length - 1] : undefined
  const history = liveTurn ? turns.slice(0, -1) : turns
  const messageIndex = useMemo(() => indexConversationTurnMessages(turns, messages), [turns, messages])
  const heights = useMemo(() => createConversationHeightCache(), [])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [retainedTurnIds, setRetainedTurnIds] = useState<string[]>([])
  const liveRef = useRef<HTMLDivElement | null>(null)
  const previousLiveTurn = useRef<string | undefined>(undefined)
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
  const measureElement = useCallback((element: Element, entry: ResizeObserverEntry | undefined, instance?: Virtualizer<HTMLDivElement, Element>) => {
    const id = (element as HTMLElement).dataset.miraTurnId
    // Commit refs must not force layout for every newly mounted history row.
    // ResizeObserver supplies real heights; restore/jump batch their reads below.
    // A collapsed pane can report zero width with enormous wrapped text heights.
    // A previously historical turn can grow as the live tail. On completion
    // its keyed element may not resize again; prefer its latest live measurement.
    if (instance && !entry || entry?.borderBoxSize?.[0]?.inlineSize === 0) return heights.read(id ?? '') ?? (instance && instance.itemSizeCache.get(instance.options.getItemKey(instance.indexFromElement(element)))) ?? heights.estimate(id ?? '')
    // The live tail is measured directly so its final height survives completion.
    const height = Math.round(instance ? measureVirtualElement(element, entry, instance) : entry?.borderBoxSize?.[0]?.blockSize ?? element.getBoundingClientRect().height)
    if (id) heights.save(id, height)
    return height
  }, [heights])
  const retainedIndexes = useMemo(() => { const retained = new Set(retainedTurnIds); return history.flatMap((turn, index) => retained.has(turn.id) ? [index] : []) }, [history, retainedTurnIds])
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => [...new Set([...defaultRangeExtractor(range), ...retainedIndexes])].sort((left, right) => left - right), [retainedIndexes])
  const virtualizer = useVirtualizer({ count: history.length, getScrollElement, getItemKey, estimateSize, measureElement, initialOffset, overscan: 4, scrollMargin: 64, rangeExtractor })
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
  const measureMountedHistory = (viewport: HTMLElement) => {
    // Read before resizeItem can notify React or correct the scroll offset.
    const measurements = [...viewport.querySelectorAll<HTMLElement>('[data-mira-turn-id]:not([data-mira-live-turn])')].map(element => ({
      id: element.dataset.miraTurnId!, index: Number(element.dataset.index), height: Math.round(element.getBoundingClientRect().height),
    }))
    for (const { id, index, height } of measurements) { heights.save(id, height); virtualizer.resizeItem(index, height) }
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
    const completedId = previousLiveTurn.current
    previousLiveTurn.current = liveTurn?.id
    if (!completedId || completedId === liveTurn?.id) return
    const index = history.findIndex(turn => turn.id === completedId)
    const element = [...(containerRef.current?.querySelectorAll<HTMLElement>('[data-mira-turn-id]') ?? [])].find(row => row.dataset.miraTurnId === completedId)
    if (index < 0 || !element || (getScrollElement()?.clientHeight ?? 0) <= 0) return
    // The final reply can commit with completion. The preserved keyed row
    // need not emit another resize event when it becomes absolute history.
    virtualizer.resizeItem(index, measureElement(element, undefined))
  }, [liveTurn?.id, history, getScrollElement, measureElement, virtualizer])

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
        measureMountedHistory(viewport)
        const measured = virtualizer.getVirtualItems().find(row => row.index === index)
        const container = containerRef.current
        const spacerHeight = Number.parseFloat((container?.firstElementChild as HTMLElement | undefined)?.style.height ?? '')
        if (index < history.length && (!measured || !container || Math.abs(target.getBoundingClientRect().top - container.getBoundingClientRect().top - (measured.start - 64)) > 1 || Math.abs(spacerHeight - virtualizer.getTotalSize()) > 1)) return false
        viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - position.anchor.offset
        return true
      },
      jumpToMessage(id, align = 'start', onMounted, findTargetKey) {
        const index = messageIndex.get(id)
        if (index === undefined) return
        scrollActionsRef.current?.pause()
        if (navigationFrame.current !== undefined) cancelAnimationFrame(navigationFrame.current)
        if (!messageElement(id) && index < history.length) virtualizer.scrollToIndex(index, { align: 'start', behavior: 'auto' })
        let frames = 0, cancelled = false
        const land = () => {
          if (cancelled) return
          const target = messageElement(id)
          if (target && findTargetKey && ![...target.querySelectorAll<HTMLElement>('[data-mira-find-target]')].some(element => element.dataset.miraFindTarget === findTargetKey)) {
            target.querySelector('.mira-assistant-process-layout')?.dispatchEvent(new CustomEvent(MIRA_REVEAL_PROCESS, { detail: findTargetKey }))
            if (++frames < 30) navigationFrame.current = requestAnimationFrame(land)
            return
          }
          const turn = turns[index]
          const wrapper = turnElement(turn.id)
          if (onMounted && target && index < history.length) {
            if (viewportRef.current) measureMountedHistory(viewportRef.current)
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
      jumpToInteraction(confirmation) {
        const interactionRoot = () => viewportRef.current?.closest('.mira-conversation-root') ?? viewportRef.current
        const findCard = () => confirmation
          ? [...(interactionRoot()?.querySelectorAll<HTMLElement>(confirmation.kind === 'permission' ? '[data-permission-request-id]' : '[data-interaction-id]') ?? [])].find(element => (confirmation.kind === 'permission' ? element.dataset.permissionRequestId : element.dataset.interactionId) === confirmation.id)
          : interactionRoot()?.querySelector<HTMLElement>('[aria-label="计划确认"]')
        const reveal = () => {
          const card = findCard()
          if (!card) return false
          if (card.closest('.mira-interaction-dock')) {
            // The fixed dock already belongs to this pane. Keep the transcript's
            // reading position and follow mode; reveal only the dock's own top.
            const scroller = card.closest<HTMLElement>('.harness-composer-region')
            if (scroller) scroller.scrollTop = 0
            const body = card.querySelector<HTMLElement>('.mira-interaction-body, .mira-tool-permission__detail')
            if (body) body.scrollTop = 0
          } else {
            scrollActionsRef.current?.pause()
            card.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
          }
          card.focus({ preventScroll: true })
          return true
        }
        if (findCard()) {
          if (navigationFrame.current !== undefined) { cancelAnimationFrame(navigationFrame.current); navigationFrame.current = undefined }
          return reveal()
        }
        if (!confirmation?.messageId || !messageIndex.has(confirmation.messageId)) return false
        // Inline approvals can be outside the mounted virtual range. Mount their
        // owning message before looking for the exact card in this pane only.
        actions.jumpToMessage(confirmation.messageId, 'center', reveal)
        return true
      },
    }
    actionsRef.current = actions
    return () => { if (actionsRef.current === actions) actionsRef.current = null }
  })
  useLayoutEffect(() => () => { if (navigationFrame.current !== undefined) { cancelAnimationFrame(navigationFrame.current); navigationFrame.current = undefined } }, [memoryKey])

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

  const renderTurn = (turn: ConversationRenderTurn) => <div className="flex min-w-0 flex-col gap-5" style={{ paddingBottom: turn === turns[turns.length - 1] ? 0 : 20 }}>{turn.messageIndexes.map(index => <Fragment key={messages[index].rendererId}><TimelineMessage message={messages[index]} liveMessageId={liveMessageId} components={components} />{(goalVerifications.get(messages[index].original.id) ?? goalVerifications.get(messages[index].original.id.replace(/^stream-/, '')))?.map(verification => <MiraGoalVerification key={verification.id} verification={verification} />)}</Fragment>)}</div>
  return <div ref={containerRef} className="relative w-full" onFocusCapture={retainInteractions} onBlurCapture={() => queueMicrotask(retainInteractions)}>
    <div data-mira-virtual-history="true" style={{ height: totalSize }} aria-hidden="true" />
    {/* Keep a turn under the same keyed parent when the running tail becomes history. */}
    {[...rows.map(row => ({ turn: history[row.index], row })), ...(liveTurn ? [{ turn: liveTurn, row: undefined }] : [])].map(({ turn, row }) => <div key={turn.id} ref={row ? virtualizer.measureElement : liveRef} data-index={row?.index ?? history.length} data-mira-turn-id={turn.id} data-mira-live-turn={!row || undefined} className={row ? 'absolute left-0 top-0 w-full' : 'relative w-full shrink-0'} style={row ? { transform: `translateY(${row.start - 64}px)` } : undefined}>{renderTurn(turn)}</div>)}
  </div>
}
