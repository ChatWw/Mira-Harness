import { computed, nextTick, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue'
import type { HarnessMessage } from '@/config/harness'

export interface QuickNavigationSegment {
  id: string
  top: number
  scrollTop: number
  width: number
  left: number
  scaleX: number
  scaleY: number
  active: boolean
  title: string
  reply: string
}

export function useHarnessNavigation(options: {
  messages: ComputedRef<HarnessMessage[]>
  running: Ref<boolean>
  rendering: Ref<boolean>
}) {
  const streamRef = ref<HTMLElement>()
  const quickNavigationRef = ref<HTMLElement>()
  const showScrollToBottom = ref(false)
  const stickToBottom = ref(true)
  const quickNavigationSegments = ref<QuickNavigationSegment[]>([])
  const quickNavigationScrollTop = ref(0)
  const quickNavigationMaxScrollTop = ref(0)
  const hoveredQuickNavigationId = ref<string>()
  let bottomScrollRequest = 0
  let autoScrollTimer: number | undefined
  let quickNavigationFrame: number | undefined
  let quickNavigationResizeObserver: ResizeObserver | undefined
  let quickNavigationPointerId: number | undefined
  let positioningLatestMessage = false
  let latestMessageIdToPosition: string | undefined
  let scrollFollowLocked = false

  const showQuickNavigation = computed(() => quickNavigationMaxScrollTop.value > 2 && quickNavigationSegments.value.length > 0)
  const quickNavigationProgress = computed(() => quickNavigationMaxScrollTop.value > 0 ? quickNavigationScrollTop.value / quickNavigationMaxScrollTop.value : 0)
  const quickNavigationPercent = computed(() => Math.round(quickNavigationProgress.value * 100))
  const hoveredQuickNavigationSegment = computed(() => quickNavigationSegments.value.find(segment => segment.id === hoveredQuickNavigationId.value))
  const quickNavigationPreviewStyle = computed(() => ({ top: `${Math.min(90, Math.max(7, hoveredQuickNavigationSegment.value?.top || 0))}%` }))

  function formatQuickNavigationPreview(content: string, limit: number, fallback: string) {
    const preview = content.replace(/\s+/g, ' ').trim()
    return preview.length > limit ? `${preview.slice(0, limit)}…` : preview || fallback
  }

  function scheduleQuickNavigationUpdate() {
    if (quickNavigationFrame !== undefined) return
    quickNavigationFrame = window.requestAnimationFrame(() => {
      quickNavigationFrame = undefined
      updateQuickNavigation()
    })
  }

  function updateQuickNavigation() {
    const stream = streamRef.value
    if (!stream) return
    const scrollHeight = Math.max(1, stream.scrollHeight)
    const maxScrollTop = Math.max(0, scrollHeight - stream.clientHeight)
    quickNavigationScrollTop.value = stream.scrollTop
    quickNavigationMaxScrollTop.value = maxScrollTop
    const viewportBottom = stream.scrollTop + stream.clientHeight
    const messages = new Map(options.messages.value.map(message => [message.id, message]))
    const elements = Array.from(stream.querySelectorAll<HTMLElement>('.message'))
    const turns = elements.flatMap((element, index) => {
      const message = messages.get(element.dataset.messageId || '')
      if (message?.role !== 'user') return []
      const replyElement = elements.slice(index + 1).find(candidate => messages.get(candidate.dataset.messageId || '')?.role === 'assistant')
      const reply = replyElement ? messages.get(replyElement.dataset.messageId || '') : undefined
      return [{ element, replyElement, message, reply }]
    })
    const railHeight = Math.max(1, stream.clientHeight - 48)
    const markerPitch = Math.min(10, railHeight / Math.max(1, turns.length))
    const markerStackOffset = Math.max(0, (railHeight - turns.length * markerPitch) / 2)
    const hoveredIndex = turns.findIndex(turn => turn.message.id === hoveredQuickNavigationId.value)
    quickNavigationSegments.value = maxScrollTop > 2 ? turns.map((turn, index) => {
      const top = turn.element.offsetTop
      const end = turn.replyElement ? turn.replyElement.offsetTop + turn.replyElement.offsetHeight : turn.element.offsetTop + turn.element.offsetHeight
      const topPercent = (markerStackOffset + (index + .5) * markerPitch) / railHeight * 100
      const proximity = hoveredIndex < 0 ? 0 : Math.max(0, 4 - Math.abs(index - hoveredIndex))
      return { id: turn.message.id, top: topPercent, scrollTop: top, width: 8, left: 0, scaleX: 1 + proximity * .375, scaleY: 1 + proximity * .1, active: top < viewportBottom && end > stream.scrollTop, title: formatQuickNavigationPreview(turn.message.content, 88, '这条提问'), reply: formatQuickNavigationPreview(turn.reply?.content || '', 280, '正在生成回复…') }
    }) : []
    quickNavigationResizeObserver?.observe(stream)
    stream.querySelectorAll<HTMLElement>('.message, .run-progress').forEach(element => quickNavigationResizeObserver?.observe(element))
  }

  function handleStreamScroll() {
    scheduleQuickNavigationUpdate()
    if (positioningLatestMessage) return
    const element = streamRef.value
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    if (scrollFollowLocked) { showScrollToBottom.value = distance > 2; return }
    if (distance <= 2) stickToBottom.value = true
    else if (distance > 72) stickToBottom.value = false
    showScrollToBottom.value = !stickToBottom.value && distance > 2
  }

  async function scrollLatestMessageToTop(messageId: string) {
    cancelAutoScroll(); bottomScrollRequest += 1; positioningLatestMessage = true; scrollFollowLocked = true; stickToBottom.value = false; latestMessageIdToPosition = messageId
    await nextTick()
    if (positionLatestMessageToTop(messageId)) latestMessageIdToPosition = undefined
    positioningLatestMessage = false
  }

  function positionLatestMessageToTop(messageId: string) {
    const stream = streamRef.value
    const message = Array.from(stream?.querySelectorAll<HTMLElement>('.message') || []).find(element => element.dataset.messageId === messageId)
    if (!stream || !message) return false
    const targetTop = Math.max(0, message.offsetTop - 20)
    const maxScrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
    stream.scrollTop = Math.min(targetTop, maxScrollTop)
    showScrollToBottom.value = maxScrollTop - stream.scrollTop > 2
    scheduleQuickNavigationUpdate()
    return targetTop <= maxScrollTop
  }

  function quickNavigationSegmentFromPointer(event: PointerEvent) {
    const element = event.currentTarget as HTMLElement
    const bounds = element.getBoundingClientRect()
    if (!bounds.height || !quickNavigationSegments.value.length) return
    const progress = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    const nearest = quickNavigationSegments.value.reduce((candidate, segment) => Math.abs(segment.top / 100 - progress) < Math.abs(candidate.top / 100 - progress) ? segment : candidate)
    return Math.abs(nearest.top / 100 - progress) <= 6 / bounds.height ? nearest : undefined
  }

  function useQuickNavigationPosition(progress: number) {
    const stream = streamRef.value
    if (!stream) return
    cancelAutoScroll(); bottomScrollRequest += 1; latestMessageIdToPosition = undefined; scrollFollowLocked = true; stickToBottom.value = false
    const maxScrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
    const target = Math.round(Math.min(1, Math.max(0, progress)) * maxScrollTop)
    stream.scrollTop = target; showScrollToBottom.value = target < maxScrollTop - 2; scheduleQuickNavigationUpdate()
  }

  function updateQuickNavigationHover(event: PointerEvent) {
    const target = quickNavigationSegmentFromPointer(event)
    if (!target) { if (hoveredQuickNavigationId.value) { hoveredQuickNavigationId.value = undefined; scheduleQuickNavigationUpdate() }; return }
    if (hoveredQuickNavigationId.value !== target.id) { hoveredQuickNavigationId.value = target.id; scheduleQuickNavigationUpdate() }
    return target
  }
  function clearQuickNavigationHover() { if (quickNavigationPointerId !== undefined) return; hoveredQuickNavigationId.value = undefined; scheduleQuickNavigationUpdate() }
  function beginQuickNavigation(event: PointerEvent) { if (event.button !== 0) return; const element = event.currentTarget as HTMLElement; event.preventDefault(); const target = updateQuickNavigationHover(event); quickNavigationPointerId = event.pointerId; element.setPointerCapture(event.pointerId); if (target) useQuickNavigationPosition(target.scrollTop / Math.max(1, quickNavigationMaxScrollTop.value)); else quickNavigationProgressFromPointer(event, element) }
  function moveQuickNavigation(event: PointerEvent) { updateQuickNavigationHover(event); if (quickNavigationPointerId === event.pointerId) quickNavigationProgressFromPointer(event, event.currentTarget as HTMLElement) }
  function endQuickNavigation(event: PointerEvent) { if (quickNavigationPointerId !== event.pointerId) return; const element = event.currentTarget as HTMLElement; if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId); quickNavigationPointerId = undefined }
  function quickNavigationProgressFromPointer(event: PointerEvent, element: HTMLElement) { const bounds = element.getBoundingClientRect(); if (bounds.height) useQuickNavigationPosition((event.clientY - bounds.top) / bounds.height) }
  function handleQuickNavigationKeydown(event: KeyboardEvent) { const stream = streamRef.value; if (!stream) return; const maxScrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight); const step = Math.max(48, stream.clientHeight * .15); if (event.key === 'Home') useQuickNavigationPosition(0); else if (event.key === 'End') useQuickNavigationPosition(1); else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') useQuickNavigationPosition((stream.scrollTop - step) / Math.max(1, maxScrollTop)); else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') useQuickNavigationPosition((stream.scrollTop + step) / Math.max(1, maxScrollTop)); else if (event.key === 'PageUp') useQuickNavigationPosition((stream.scrollTop - stream.clientHeight) / Math.max(1, maxScrollTop)); else if (event.key === 'PageDown') useQuickNavigationPosition((stream.scrollTop + stream.clientHeight) / Math.max(1, maxScrollTop)); else return; event.preventDefault() }
  function cancelAutoScroll() { if (autoScrollTimer !== undefined) window.clearTimeout(autoScrollTimer); autoScrollTimer = undefined }
  function handleUserWheel(event: WheelEvent) { if (event.deltaY < 0) { cancelAutoScroll(); scrollFollowLocked = true; stickToBottom.value = false; showScrollToBottom.value = true } }
  function scheduleAutoScroll() { if (options.running.value || options.rendering.value || scrollFollowLocked || !stickToBottom.value || autoScrollTimer !== undefined) return; autoScrollTimer = window.setTimeout(() => { autoScrollTimer = undefined; const element = streamRef.value; if (!element || options.running.value || options.rendering.value || scrollFollowLocked || !stickToBottom.value) return; const distance = element.scrollHeight - element.scrollTop - element.clientHeight; if (distance > 0) element.scrollBy({ top: distance, behavior: 'smooth' }) }, 72) }
  async function scrollToBottom() { cancelAutoScroll(); scrollFollowLocked = false; stickToBottom.value = true; await nextTick(); streamRef.value?.scrollTo({ top: streamRef.value.scrollHeight, behavior: 'smooth' }); showScrollToBottom.value = false; scheduleQuickNavigationUpdate() }
  async function snapSessionToBottom() { const request = ++bottomScrollRequest; await nextTick(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); if (request !== bottomScrollRequest || options.running.value || options.rendering.value || scrollFollowLocked || !stickToBottom.value) return; const element = streamRef.value; if (!element) return; element.scrollTop = element.scrollHeight; requestAnimationFrame(() => { if (request === bottomScrollRequest && streamRef.value) { streamRef.value.scrollTop = streamRef.value.scrollHeight; handleStreamScroll() } }) }
  function reset() { cancelAutoScroll(); quickNavigationResizeObserver?.disconnect(); hoveredQuickNavigationId.value = undefined; latestMessageIdToPosition = undefined; scrollFollowLocked = false; stickToBottom.value = true; showScrollToBottom.value = false }
  function positionPendingMessage() { if (latestMessageIdToPosition && positionLatestMessageToTop(latestMessageIdToPosition)) latestMessageIdToPosition = undefined }
  function mount() { quickNavigationResizeObserver = new ResizeObserver(scheduleQuickNavigationUpdate); void nextTick().then(scheduleQuickNavigationUpdate) }
  function dispose() { cancelAutoScroll(); if (quickNavigationFrame !== undefined) window.cancelAnimationFrame(quickNavigationFrame); quickNavigationResizeObserver?.disconnect(); bottomScrollRequest += 1 }
  onBeforeUnmount(dispose)
  return { streamRef, quickNavigationRef, showScrollToBottom, stickToBottom, quickNavigationSegments, quickNavigationScrollTop, quickNavigationMaxScrollTop, hoveredQuickNavigationId, showQuickNavigation, quickNavigationPercent, hoveredQuickNavigationSegment, quickNavigationPreviewStyle, handleStreamScroll, handleUserWheel, scrollLatestMessageToTop, scheduleQuickNavigationUpdate, updateQuickNavigation, updateQuickNavigationHover, clearQuickNavigationHover, beginQuickNavigation, moveQuickNavigation, endQuickNavigation, handleQuickNavigationKeydown, scrollToBottom, snapSessionToBottom, scheduleAutoScroll, reset, positionPendingMessage, mount }
}
