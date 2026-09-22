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
  const contentRef = ref<HTMLElement>()
  const spacerRef = ref<HTMLElement>()
  const showScrollToBottom = ref(false)
  const followLatest = ref(true)
  const quickNavigationSegments = ref<QuickNavigationSegment[]>([])
  const quickNavigationScrollTop = ref(0)
  const quickNavigationMaxScrollTop = ref(0)
  const hoveredQuickNavigationId = ref<string>()
  let bottomScrollRequest = 0
  let layoutFrame: number | undefined
  let quickNavigationFrame: number | undefined
  let quickNavigationResizeObserver: ResizeObserver | undefined
  let quickNavigationPointerId: number | undefined
  let reserveLatestTurn = false
  let lastScrollTop = 0
  let userScrolling = false
  let disposed = false

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

  }

  function bottomDistance() {
    const stream = streamRef.value
    return stream ? Math.max(0, stream.scrollHeight - stream.clientHeight - stream.scrollTop) : 0
  }

  function updateBottomButton() {
    showScrollToBottom.value = !followLatest.value && bottomDistance() > 32
  }

  function writeScrollTop(top: number) {
    const stream = streamRef.value
    if (!stream) return
    stream.scrollTop = top
    lastScrollTop = stream.scrollTop
  }

  function updateReplySpace() {
    const stream = streamRef.value
    const content = contentRef.value
    const spacer = spacerRef.value
    if (!stream || !content || !spacer) return
    const questions = content.querySelectorAll<HTMLElement>('.message.user')
    const question = questions[questions.length - 1]
    const naturalBottom = content.offsetTop + content.offsetHeight + 24
    const height = reserveLatestTurn && question
      ? Math.max(0, question.offsetTop - 20 + stream.clientHeight - naturalBottom)
      : 0
    const value = `${Math.ceil(height)}px`
    if (spacer.style.height !== value) spacer.style.height = value
  }

  function handleStreamScroll() {
    const stream = streamRef.value
    if (!stream) return
    const scrollTop = stream.scrollTop
    const movedUp = scrollTop < lastScrollTop - 1
    const movedDown = scrollTop > lastScrollTop + 1
    // 只有实际发生了用户向上滚动才暂停跟随，避免滚轮刚触发就显示浮动控件。
    if (userScrolling && movedUp) {
      pauseFollowing()
    // 只有用户主动向下回到底部才能恢复跟随，内容增长和程序定位不改变模式。
    } else if (userScrolling && movedDown && bottomDistance() <= 32) {
      followLatest.value = true
      userScrolling = false
    }
    lastScrollTop = scrollTop
    updateBottomButton()
    scheduleQuickNavigationUpdate()
  }

  function cancelAutoScroll() {
    if (layoutFrame !== undefined) window.cancelAnimationFrame(layoutFrame)
    layoutFrame = undefined
  }

  function pauseFollowing() {
    cancelAutoScroll()
    bottomScrollRequest++
    followLatest.value = false
    userScrolling = true
    lastScrollTop = streamRef.value?.scrollTop || 0
    updateBottomButton()
  }

  function markUserScrollIntent() {
    cancelAutoScroll()
    bottomScrollRequest++
    userScrolling = true
  }

  async function scrollLatestMessageToTop(messageId: string) {
    cancelAutoScroll()
    const request = ++bottomScrollRequest
    followLatest.value = true
    userScrolling = false
    reserveLatestTurn = true
    await nextTick()
    if (disposed || request !== bottomScrollRequest) return
    updateReplySpace()
    const message = Array.from(contentRef.value?.querySelectorAll<HTMLElement>('.message') || []).find(element => element.dataset.messageId === messageId)
    if (message) writeScrollTop(Math.max(0, message.offsetTop - 20))
    updateBottomButton()
    scheduleQuickNavigationUpdate()
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
    pauseFollowing()
    const maxScrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
    const target = Math.round(Math.min(1, Math.max(0, progress)) * maxScrollTop)
    writeScrollTop(target)
    followLatest.value = maxScrollTop - target <= 32
    userScrolling = !followLatest.value
    updateBottomButton()
    scheduleQuickNavigationUpdate()
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
  function handleUserWheel(event: WheelEvent) {
    if (!event.deltaY) return
    markUserScrollIntent()
  }

  function handleStreamPointerDown(event: PointerEvent) {
    const stream = streamRef.value
    if (!stream) return
    const bounds = stream.getBoundingClientRect()
    if (event.pointerType === 'touch' || event.clientX >= bounds.left + stream.clientWidth) markUserScrollIntent()
  }

  function handleStreamKeydown(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest('input, textarea, button, summary, a, [contenteditable="true"]')) return
    if (['ArrowUp', 'PageUp', 'Home', 'ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) markUserScrollIntent()
  }

  function scheduleAutoScroll() {
    if (disposed || layoutFrame !== undefined) return
    const request = bottomScrollRequest
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = undefined
      if (disposed || request !== bottomScrollRequest) return
      updateReplySpace()
      const last = options.messages.value[options.messages.value.length - 1]
      // 新提问仅定位一次；等正文出现后才开始跟随，长提问不会立即被跳过。
      if (followLatest.value && (!reserveLatestTurn || (last?.role === 'assistant' && last.content))) {
        const stream = streamRef.value
        if (stream) writeScrollTop(Math.max(0, stream.scrollHeight - stream.clientHeight))
      }
      updateBottomButton()
      scheduleQuickNavigationUpdate()
    })
  }

  async function scrollToBottom() {
    cancelAutoScroll()
    const request = ++bottomScrollRequest
    followLatest.value = true
    userScrolling = false
    await nextTick()
    if (disposed || request !== bottomScrollRequest) return
    updateReplySpace()
    if (streamRef.value) writeScrollTop(streamRef.value.scrollHeight)
    updateBottomButton()
    scheduleQuickNavigationUpdate()
  }

  async function snapSessionToBottom() {
    const request = ++bottomScrollRequest
    await nextTick()
    if (disposed || request !== bottomScrollRequest) return
    followLatest.value = true
    userScrolling = false
    scheduleAutoScroll()
  }

  function reset() {
    cancelAutoScroll()
    bottomScrollRequest++
    reserveLatestTurn = false
    userScrolling = false
    followLatest.value = true
    lastScrollTop = 0
    if (spacerRef.value) spacerRef.value.style.height = '0px'
    hoveredQuickNavigationId.value = undefined
    showScrollToBottom.value = false
  }

  function mount() {
    quickNavigationResizeObserver = new ResizeObserver(scheduleAutoScroll)
    if (streamRef.value) quickNavigationResizeObserver.observe(streamRef.value)
    if (contentRef.value) quickNavigationResizeObserver.observe(contentRef.value)
    scheduleAutoScroll()
  }
  function dispose() {
    disposed = true
    cancelAutoScroll()
    if (quickNavigationFrame !== undefined) window.cancelAnimationFrame(quickNavigationFrame)
    quickNavigationResizeObserver?.disconnect()
    bottomScrollRequest++
  }
  onBeforeUnmount(dispose)
  return { streamRef, contentRef, spacerRef, quickNavigationRef, showScrollToBottom, followLatest, quickNavigationSegments, quickNavigationScrollTop, quickNavigationMaxScrollTop, hoveredQuickNavigationId, showQuickNavigation, quickNavigationPercent, hoveredQuickNavigationSegment, quickNavigationPreviewStyle, handleStreamScroll, handleUserWheel, handleStreamPointerDown, handleStreamKeydown, scrollLatestMessageToTop, scheduleQuickNavigationUpdate, updateQuickNavigation, updateQuickNavigationHover, clearQuickNavigationHover, beginQuickNavigation, moveQuickNavigation, endQuickNavigation, handleQuickNavigationKeydown, scrollToBottom, snapSessionToBottom, scheduleAutoScroll, reset, mount }
}
