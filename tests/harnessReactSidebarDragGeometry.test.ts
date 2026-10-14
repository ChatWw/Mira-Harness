import { describe, expect, it } from 'vitest'
import { collectionSortingStrategy, restrictSidebarCollectionDrag } from '../apps/harness-react/src/components/session/sidebar-drag'

describe('ZCode collection drag geometry', () => {
  it.each([60, 300, 1000])('moves neighbors by a header height when the active collection is %spx tall', height => {
    const rects = [
      { top: 0, bottom: height, left: 0, right: 240, width: 240, height },
      { top: height + 12, bottom: height + 100, left: 0, right: 240, width: 240, height: 88 },
    ]
    expect(collectionSortingStrategy({ activeIndex: 0, activeNodeRect: null, index: 1, overIndex: 1, rects })).toEqual({ x: 0, y: -44, scaleX: 1, scaleY: 1 })
    expect(collectionSortingStrategy({ activeIndex: 1, activeNodeRect: null, index: 0, overIndex: 0, rects })).toEqual({ x: 0, y: 44, scaleX: 1, scaleY: 1 })
  })
  it('constrains projects vertically while allowing tasks to move between groups', () => {
    const args = { transform: { x: 50, y: 800, scaleX: 1, scaleY: 1 }, draggingNodeRect: { top: 100, bottom: 132 }, containerNodeRect: { top: 80, bottom: 500 } }
    expect(restrictSidebarCollectionDrag({ ...args, active: { id: 'sidebar-project:p' } } as never)).toMatchObject({ x: 0, y: 368 })
    expect(restrictSidebarCollectionDrag({ ...args, active: { id: 'task' } } as never)).toBe(args.transform)
  })
})
