import { describe, expect, it } from 'vitest'
import { buildMiraPresentationElements, hitTestMiraPresentationElement } from '../apps/harness-react/src/lib/presentation/mira-presentation-elements'
import { clampMiraPresentationPage, clampMiraPresentationZoom } from '../apps/harness-react/src/lib/presentation/mira-presentation-controls'

const node = (id: string, nodeType: 'shape' | 'group' | 'unknown' = 'shape') => ({ id, name: id, nodeType, position: { x: 10, y: 20 }, size: { w: 300, h: 120 }, text: '中文元素' })
const cell = (text: string, extra = {}) => ({ gridSpan: 1, rowSpan: 1, hMerge: false, vMerge: false, text, ...extra })
const build = (nodes: Parameters<typeof buildMiraPresentationElements>[0]['nodes'], groupTextEntries: Parameters<typeof buildMiraPresentationElements>[0]['groupTextEntries'] = []) => buildMiraPresentationElements({ slideIndex: 2, slidePart: 'ppt/slides/slide3.xml', nodes, groupTextEntries })

describe('presentation element coordinates and picking', () => {
  it('keeps real OOXML identity and group z-order without duplicating direct text nodes', () => {
    const elements = build([node('bottom'), node('g', 'group'), node('top'), node('u', 'unknown')], [
      { nodeId: 'nested', nodePath: 'slides/0/nodes/g/children/nested', text: '组内中文', bounds: { x: 15, y: 25, w: 100, h: 20 } },
      { nodeId: 'top', nodePath: 'slides/0/nodes/top', text: '已直接索引', bounds: { x: 0, y: 0, w: 100, h: 20 } },
    ])
    expect(elements.map(item => item.nodeId)).toEqual(['bottom', 'top', 'nested'])
    expect(elements[2]).toMatchObject({ slideIndex: 2, slidePart: 'ppt/slides/slide3.xml', nodePath: 'slides/0/nodes/g/children/nested', zIndex: 1 })
    expect(hitTestMiraPresentationElement(elements, { x: 20, y: 30 })?.nodeId).toBe('top')
    expect(hitTestMiraPresentationElement(elements, { x: -1, y: 30 })).toBeNull()
  })
  it('maps horizontal and vertical merged cells while keeping subsequent overlays aligned', () => {
    const elements = build([{ ...node('table'), nodeType: 'table', columns: [100, 100, 100], rows: [
      { height: 40, cells: [cell('横跨', { gridSpan: 2 }), cell('合并延续', { hMerge: true }), cell('右侧')] },
      { height: 40, cells: [cell('纵跨', { rowSpan: 2 }), cell('中间'), cell('右侧2')] },
      { height: 40, cells: [cell('纵向延续', { vMerge: true }), cell('下方中间'), cell('下方右侧')] },
    ] }])
    const cells = elements.filter(item => item.nodeType === 'table-cell')
    expect(cells).toHaveLength(7)
    expect(cells[0].bounds).toEqual({ x: 10, y: 20, width: 200, height: 40 })
    expect(cells[1].bounds.x).toBe(210)
    expect(cells[2].bounds).toEqual({ x: 10, y: 60, width: 100, height: 80 })
    expect(cells[5]).toMatchObject({ rowIndex: 2, cellIndex: 1, bounds: { x: 110, y: 100, width: 100, height: 40 } })
    expect(hitTestMiraPresentationElement(elements, { x: 150, y: 115 })).toBe(cells[5])
  })
  it('does not produce invalid cell overlays for empty or zero-sized table grids', () => {
    const tables = [{ ...node('empty'), nodeType: 'table' as const, columns: [], rows: [] }, { ...node('zero'), nodeType: 'table' as const, columns: [0], rows: [{ height: 0, cells: [cell('零')] }] }]
    expect(build(tables).map(item => item.nodeType)).toEqual(['table', 'table'])
  })
  it('clamps typed pages and zoom at the viewer boundaries', () => {
    expect([-10, 0, 1.6, 100, NaN, Infinity].map(value => clampMiraPresentationPage(value, 3))).toEqual([1, 1, 2, 3, 1, 1])
    expect(clampMiraPresentationPage(20, 0)).toBe(1); expect(clampMiraPresentationPage(20, NaN)).toBe(1)
    expect([0, 25, 25.6, 100, 400, NaN].map(clampMiraPresentationZoom)).toEqual([25, 25, 26, 100, 300, 100])
  })
})
