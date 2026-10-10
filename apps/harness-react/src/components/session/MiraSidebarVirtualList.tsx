// Adapted from ZCode's grouped-task virtual lists and shared-scroll handling (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd.
import { defaultRangeExtractor, useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type MiraSidebarVirtualListProps<T> = {
  items: readonly T[]
  getItemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  scrollElement: HTMLElement | null
  estimateSize?: (item: T, index: number) => number
  enabled?: boolean
  retainedKeys?: readonly string[]
  listId?: string
}

const EMPTY_RETAINED_KEYS: readonly string[] = []

function nearestScrollElement(element: HTMLElement | null): HTMLElement | null {
  let ancestor = element?.parentElement
  while (ancestor) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(ancestor).overflowY)) return ancestor
    ancestor = ancestor.parentElement
  }
  return null
}

function ownedRowKey(list: HTMLElement, target: EventTarget | null): string | null {
  let row = target instanceof Element ? target.closest<HTMLElement>('[data-sidebar-virtual-key]') : null
  while (row && row.parentElement !== list) row = row.parentElement?.closest<HTMLElement>('[data-sidebar-virtual-key]') ?? null
  return row?.dataset.sidebarVirtualKey ?? null
}

function scrollSidebarList(offset: number, { adjustments = 0, behavior }: { adjustments?: number; behavior?: ScrollBehavior }, instance: Virtualizer<HTMLElement, HTMLDivElement>) {
  const element = instance.scrollElement
  if (!element) return
  // A nested list can mount after its shared viewport has already scrolled.
  // Ignore a zero cached before refs attached instead of resetting that viewport.
  if (offset === 0 && adjustments === 0 && behavior === undefined && element.scrollTop > 0 && instance.scrollOffset === 0) return
  element.scrollTo({ top: offset + adjustments, behavior })
}

export function MiraSidebarVirtualList<T>({ items, getItemKey, renderItem, scrollElement, estimateSize, enabled = true, retainedKeys = EMPTY_RETAINED_KEYS, listId = '' }: MiraSidebarVirtualListProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [interactionKeys, setInteractionKeys] = useState<string[]>([])
  const virtualized = enabled && items.length > 80
  const getScrollElement = useCallback(() => scrollElement ?? nearestScrollElement(listRef.current), [scrollElement])
  const itemKeys = useMemo(() => items.map(getItemKey), [items, getItemKey])
  const retainedIndexes = useMemo(() => {
    const keys = new Set([...retainedKeys, ...interactionKeys, ...(focusedKey ? [focusedKey] : [])])
    return itemKeys.flatMap((key, index) => keys.has(key) ? [index] : [])
  }, [itemKeys, retainedKeys, interactionKeys, focusedKey])
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => [...new Set([...defaultRangeExtractor(range), ...retainedIndexes])].sort((left, right) => left - right), [retainedIndexes])
  const virtualItemKey = useCallback((index: number) => itemKeys[index], [itemKeys])
  const virtualItemSize = useCallback((index: number) => estimateSize?.(items[index], index) ?? 32, [items, estimateSize])
  const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: virtualized ? items.length : 0,
    enabled: virtualized,
    getScrollElement,
    getItemKey: virtualItemKey,
    estimateSize: virtualItemSize,
    overscan: 12,
    scrollMargin,
    initialOffset: () => getScrollElement()?.scrollTop ?? 0,
    scrollToFn: scrollSidebarList,
    rangeExtractor,
    useAnimationFrameWithResizeObserver: true,
  })

  const updateMargin = useCallback(() => {
    const list = listRef.current, viewport = getScrollElement()
    if (!list || !viewport) return
    const margin = list.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop
    setScrollMargin(previous => previous === margin ? previous : margin)
  }, [getScrollElement])

  // Parent virtual rows can move without resizing this list. Read its position
  // after each commit as well as when preceding content changes size.
  useLayoutEffect(() => { if (virtualized) updateMargin() })
  useLayoutEffect(() => {
    const list = listRef.current, viewport = getScrollElement()
    if (!virtualized || !list || !viewport) return
    let frame: number | undefined
    const scheduleMargin = () => {
      if (frame !== undefined) return
      frame = window.requestAnimationFrame(() => { frame = undefined; updateMargin() })
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMargin)
    observer?.observe(list)
    let ancestor: HTMLElement | null = list
    while (ancestor && ancestor !== viewport) {
      let sibling = ancestor.previousElementSibling
      while (sibling) { observer?.observe(sibling); sibling = sibling.previousElementSibling }
      ancestor = ancestor.parentElement
      if (ancestor) observer?.observe(ancestor)
    }
    viewport.addEventListener('scroll', scheduleMargin, { passive: true })
    window.addEventListener('resize', scheduleMargin)
    scheduleMargin()
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      observer?.disconnect()
      viewport.removeEventListener('scroll', scheduleMargin)
      window.removeEventListener('resize', scheduleMargin)
    }
  }, [virtualized, getScrollElement, updateMargin])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!virtualized || !list) return
    const updateInteractionKeys = () => {
      const next = [...new Set([...list.querySelectorAll('[data-state="open"], [aria-busy="true"], [role="alert"]')].flatMap(element => {
        const key = ownedRowKey(list, element)
        return key ? [key] : []
      }))]
      setInteractionKeys(previous => previous.length === next.length && previous.every((key, index) => key === next[index]) ? previous : next)
    }
    const observer = new MutationObserver(updateInteractionKeys)
    observer.observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'aria-busy', 'role'] })
    updateInteractionKeys()
    return () => observer.disconnect()
  }, [virtualized])

  if (!virtualized) return <>{items.map((item, index) => <Fragment key={itemKeys[index]}>{renderItem(item, index)}</Fragment>)}</>

  return <div ref={listRef} className="mira-sidebar-virtual-list" data-sidebar-virtual-list={listId}
    onFocusCapture={event => setFocusedKey(ownedRowKey(event.currentTarget, event.target))}
    onBlurCapture={event => setFocusedKey(ownedRowKey(event.currentTarget, event.relatedTarget))}
    style={{ position: 'relative', width: '100%', height: virtualizer.getTotalSize(), overflowAnchor: 'none' }}>
    {virtualizer.getVirtualItems().map(row => <div key={row.key} ref={virtualizer.measureElement} className="mira-sidebar-virtual-row" data-sidebar-virtual-key={itemKeys[row.index]} data-index={row.index}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start - scrollMargin}px)` }}>
      {renderItem(items[row.index], row.index)}
    </div>)}
  </div>
}
