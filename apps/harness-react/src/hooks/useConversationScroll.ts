import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'
import { conversationRestoreTop, conversationScrollMemory, type ConversationScrollPosition } from '../lib/conversation-scroll'
import type { ConversationTimelineActions } from '../lib/conversation-timeline'

export interface ConversationScrollActions { pause: () => void; resume: () => void; isFollowing: () => boolean; isRestoring: () => boolean }

/** Key the owning viewport by memoryKey so its DOM and follow intent are scoped together. */
export function useConversationScroll({ memoryKey, active, ready, viewportRef, actionsRef, timelineRef, onBottomChange }: {
  memoryKey: string | null
  active: boolean
  ready: boolean
  viewportRef: RefObject<HTMLDivElement | null>
  actionsRef: RefObject<ConversationScrollActions | null>
  timelineRef?: RefObject<ConversationTimelineActions | null>
  onBottomChange: (atBottom: boolean) => void
}) {
  const element = useRef<HTMLDivElement | null>(null)
  const following = useRef(true)
  const restored = useRef(false)
  const correction = useRef<number | undefined>(undefined)
  const lastPosition = useRef<ConversationScrollPosition | undefined>(undefined)
  const holdWidthChange = useRef<(() => boolean) | undefined>(undefined)

  const cancelCorrection = useCallback(() => {
    if (correction.current !== undefined) cancelAnimationFrame(correction.current)
    correction.current = undefined
  }, [])
  const capture = useCallback((node = element.current) => {
    // A placeholder/hidden viewport must never replace a pending historical position.
    if (!restored.current) return
    // Scroll events can arrive before ResizeObserver after the column reflows.
    if (holdWidthChange.current?.()) return
    if (node && node.clientHeight > 0) {
      let anchor: ConversationScrollPosition['anchor']
      if (!following.current) {
        const top = node.getBoundingClientRect().top
        const turn = [...node.querySelectorAll<HTMLElement>('[data-mira-turn-id]')].find(turn => turn.getBoundingClientRect().bottom > top + 48)
        if (turn?.dataset.miraTurnId) anchor = { turnId: turn.dataset.miraTurnId, offset: turn.getBoundingClientRect().top - top }
      }
      lastPosition.current = {
        scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, following: following.current,
        ...(anchor ? { anchor } : {}),
      }
    }
    if (node && node.clientHeight > 0) onBottomChange(node.scrollHeight - node.clientHeight - node.scrollTop <= 1)
    if (lastPosition.current) conversationScrollMemory.save(memoryKey, lastPosition.current)
  }, [memoryKey, onBottomChange])
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (node === element.current) return
    // The owning effect captures real departure, rather than a callback ref rebind.
    element.current = node
    viewportRef.current = node
  }, [viewportRef])

  useLayoutEffect(() => {
    const node = element.current
    if (!node || !active || !ready) { onBottomChange(true); return }
    restored.current = false
    const saved = conversationScrollMemory.read(memoryKey)
    following.current = saved?.following ?? true
    const column = node.querySelector<HTMLElement>('.mira-message-column')
    let columnWidth = column?.clientWidth
    let resizePosition: ConversationScrollPosition | undefined
    let resizeTimer: number | undefined
    let resizeFrame: number | undefined
    const cancelResize = () => {
      window.clearTimeout(resizeTimer)
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
      resizeTimer = resizeFrame = undefined
      resizePosition = undefined
      columnWidth = column?.clientWidth
    }
    const finishResize = () => {
      resizeFrame = undefined
      if (!resizePosition || following.current) { cancelResize(); return }
      const result = timelineRef?.current?.restore(resizePosition, node)
      if (result === false) { resizeFrame = requestAnimationFrame(finishResize); return }
      if (result === undefined) node.scrollTop = conversationRestoreTop(resizePosition, node)
      cancelResize()
      capture()
    }
    const checkWidth = () => {
      const width = column?.clientWidth
      if (width !== columnWidth) {
        columnWidth = width
        if (restored.current && !following.current && lastPosition.current?.anchor) {
          resizePosition ??= lastPosition.current
          window.clearTimeout(resizeTimer)
          if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
          resizeFrame = undefined
          // Virtual rows measure in batches during the panel's reveal/drag.
          resizeTimer = window.setTimeout(() => { resizeFrame = requestAnimationFrame(finishResize) }, 120)
        }
      }
      return Boolean(resizePosition)
    }
    holdWidthChange.current = checkWidth
    const restore = () => {
      if (node.clientHeight <= 0) return false
      if (saved?.anchor && !saved.following) {
        const restored = timelineRef?.current?.restore(saved, node)
        if (restored !== undefined) return restored
      }
      node.scrollTop = saved ? conversationRestoreTop(saved, node) : Math.max(0, node.scrollHeight - node.clientHeight)
      // ready already requires this task's full message window; collapsed details can make it shorter.
      return true
    }
    // Restore after this session's measured content is ready.
    restore()
    const finish = () => {
      cancelCorrection()
      if (!restore()) { if (node.clientHeight > 0) correction.current = requestAnimationFrame(finish); return }
      restored.current = true
      capture()
    }
    correction.current = requestAnimationFrame(() => {
      restore()
      correction.current = requestAnimationFrame(finish)
    })
    const observer = new ResizeObserver(() => {
      if (!restored.current && correction.current === undefined) finish()
      else if (restored.current) {
        // Follow new content only while the reader's intent remains at the bottom.
        if (following.current) node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight)
        capture()
      }
    })
    observer.observe(node)
    if (node.firstElementChild) observer.observe(node.firstElementChild)
    if (column) observer.observe(column)

    let userScrolling = false
    const setFollowing = (value: boolean) => {
      cancelCorrection()
      cancelResize()
      restored.current = true
      userScrolling = false
      following.current = value
      capture()
    }
    const actions = { pause: () => setFollowing(false), resume: () => { node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight); setFollowing(true) }, isFollowing: () => following.current, isRestoring: () => !restored.current || Boolean(resizePosition) }
    actionsRef.current = actions
    const onScroll = () => {
      if (!restored.current) return
      if (checkWidth()) return
      const bottom = node.scrollHeight - node.clientHeight - node.scrollTop <= 1
      const previous = lastPosition.current
      if (previous && node.scrollTop === previous.scrollTop && node.scrollHeight === previous.scrollHeight && node.clientHeight === previous.clientHeight) return
      // A user can move up during a resize; layout clamping alone must preserve follow intent.
      if (bottom && (following.current || userScrolling)) {
        following.current = true
        userScrolling = false
      } else if (previous && node.scrollTop < previous.scrollTop && userScrolling) {
        following.current = false
      }
      capture()
    }
    const onWheel = (event: WheelEvent) => {
      cancelResize()
      if (!restored.current || event.deltaY < 0) actions.pause()
      userScrolling = true
    }
    const onPointerDown = (event: PointerEvent) => {
      // Taking the scrollbar or expanding a tool owns the viewport before correction frames.
      if (!restored.current) actions.pause()
      if (event.target === node) { actions.pause(); userScrolling = true }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('textarea, input, select, [contenteditable="true"]')) return
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || event.key === ' ' && event.shiftKey) actions.pause()
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) { cancelResize(); userScrolling = true }
    }
    node.addEventListener('scroll', onScroll, { passive: true })
    node.addEventListener('wheel', onWheel, { passive: true })
    node.addEventListener('pointerdown', onPointerDown)
    node.addEventListener('keydown', onKeyDown)
    return () => {
      capture(node)
      cancelCorrection()
      cancelResize()
      if (holdWidthChange.current === checkWidth) holdWidthChange.current = undefined
      observer.disconnect()
      node.removeEventListener('scroll', onScroll)
      node.removeEventListener('wheel', onWheel)
      node.removeEventListener('pointerdown', onPointerDown)
      node.removeEventListener('keydown', onKeyDown)
      if (actionsRef.current === actions) actionsRef.current = null
    }
  }, [memoryKey, active, ready, actionsRef, timelineRef, capture, cancelCorrection, onBottomChange])

  return { ref }
}
