// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMiraPresentationSelectedText } from '../apps/harness-react/src/lib/presentation/mira-presentation-selection'

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })
function fixture() {
  const surface = document.createElement('div'), first = document.createTextNode('你好世界'), second = document.createTextNode('相邻元素')
  surface.append(first, second); document.body.append(surface)
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120 } as DOMRect)
  const nativeRange = document.createRange.bind(document)
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = nativeRange()
    Object.defineProperty(range, 'getClientRects', { value: () => range.startContainer === first ? [{ left: 20, right: 50, top: 30, bottom: 50 }] : [{ left: 140, right: 190, top: 30, bottom: 50 }] })
    return range
  })
  const range = nativeRange(); range.setStart(first, 1); range.setEnd(second, 3)
  const selection = { isCollapsed: false, rangeCount: 1, getRangeAt: () => range } as unknown as Selection
  return { renderSurface: surface, pageSize: { width: 100, height: 50 }, elementBounds: { x: 0, y: 0, width: 40, height: 30 }, elementText: first.data, selection, range, first }
}

describe('element-scoped PPTX native selection', () => {
  it('clips a selection spanning neighboring shapes to the current element at the current scale', () => {
    const view = fixture()
    expect(view.selection.getRangeAt(0).toString()).toContain('相邻元')
    expect(getMiraPresentationSelectedText(view)).toBe('好世界')
  })
  it('keeps the exact partial text instead of replacing the whole element or accepting unrelated text', () => {
    const view = fixture(); view.range.setEnd(view.first, 3)
    expect(getMiraPresentationSelectedText(view)).toBe('好世')
    expect(getMiraPresentationSelectedText({ ...view, elementText: '不同元素' })).toBeNull()
    expect(getMiraPresentationSelectedText({ ...view, elementBounds: { x: 50, y: 0, width: 30, height: 30 } })).toBeNull()
  })
  it('ignores collapsed, absent and zero-size surfaces', () => {
    const view = fixture()
    expect(getMiraPresentationSelectedText({ ...view, selection: null })).toBeNull()
    expect(getMiraPresentationSelectedText({ ...view, renderSurface: null })).toBeNull()
    expect(getMiraPresentationSelectedText({ ...view, pageSize: { width: 0, height: 50 } })).toBeNull()
    view.range.collapse(true)
    expect(getMiraPresentationSelectedText(view)).toBeNull()
  })
})
