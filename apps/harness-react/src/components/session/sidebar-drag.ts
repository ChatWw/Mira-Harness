/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode workspaceSidebarDrag / restrictVerticalDragWithinContainer.
 * Upstream license: third-party-licenses/zcode/.
 */
import type { Modifier } from '@dnd-kit/core'
import type { SortingStrategy } from '@dnd-kit/sortable'

/** Expanded collections still make room for only the 32px dragged header. */
export const collectionSortingStrategy: SortingStrategy = ({ activeIndex, activeNodeRect, index, overIndex, rects }) => {
  const activeRect = rects[activeIndex] ?? activeNodeRect
  if (!activeRect) return null
  if (index === activeIndex) {
    const overRect = rects[overIndex]
    return overRect ? { x: 0, y: activeIndex < overIndex ? overRect.bottom - activeRect.bottom : overRect.top - activeRect.top, scaleX: 1, scaleY: 1 } : null
  }
  const current = rects[index]
  const neighbor = rects[activeIndex < index ? index - 1 : index + 1]
  const gap = current && neighbor ? activeIndex < index ? current.top - neighbor.bottom : neighbor.top - current.bottom : 0
  const displacement = 32 + Math.max(0, gap)
  const y = index < activeIndex && index >= overIndex ? displacement : index > activeIndex && index <= overIndex ? -displacement : 0
  return { x: 0, y, scaleX: 1, scaleY: 1 }
}

export const restrictSidebarCollectionDrag: Modifier = ({ active, transform, draggingNodeRect, activeNodeRect, containerNodeRect, windowRect }) => {
  if (!String(active?.id).startsWith('sidebar-project:') && !String(active?.id).startsWith('sidebar-section:')) return transform
  const rect = draggingNodeRect ?? activeNodeRect, boundary = containerNodeRect ?? windowRect
  return { ...transform, x: 0, y: rect && boundary ? Math.min(Math.max(transform.y, boundary.top - rect.top), boundary.bottom - rect.bottom) : transform.y }
}
