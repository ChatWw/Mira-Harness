/* Adapted from ZCode presentationElementModel.ts, Copyright 2026 Z.AI Co., Ltd.
 * Apache-2.0; see third-party-licenses/zcode. Mira names and cumulative table offsets. */
import type { MiraPresentationBounds, MiraPresentationElement } from './mira-presentation-types'

interface MiraPresentationCellInput { gridSpan: number; rowSpan: number; hMerge: boolean; vMerge: boolean; text?: string }
interface MiraPresentationRowInput { height: number; cells: readonly MiraPresentationCellInput[] }
interface MiraPresentationNodeInput {
  id: string; name: string; nodeType: 'shape' | 'picture' | 'chart' | 'table' | 'group' | 'unknown'
  position: { x: number; y: number }; size: { w: number; h: number }; text?: string
  columns?: readonly number[]; rows?: readonly MiraPresentationRowInput[]
}
interface MiraPresentationGroupInput { nodeId: string; nodePath: string; text: string; bounds: { x: number; y: number; w: number; h: number } }
function offsets(values: readonly number[]): number[] {
  const result = [0]
  for (const value of values) result.push(result[result.length - 1] + Math.max(0, value))
  return result
}
function tableCells(node: MiraPresentationNodeInput, base: MiraPresentationElement): MiraPresentationElement[] {
  const { columns, rows } = node
  if (!columns?.length || !rows?.length) return []
  const xOffsets = offsets(columns), yOffsets = offsets(rows.map(row => row.height))
  const width = xOffsets[xOffsets.length - 1], height = yOffsets[yOffsets.length - 1]
  if (width <= 0 || height <= 0) return []
  return rows.flatMap((row, rowIndex) => {
    let column = 0
    return row.cells.flatMap((cell, cellIndex) => {
      const span = Math.max(1, cell.gridSpan || 1)
      // Horizontal continuation consumes no column; vertical continuation does.
      // This matches renderer layout and avoids shifting the next selectable cell.
      if (cell.hMerge || cell.vMerge) { if (cell.vMerge && !cell.hMerge) column += span; return [] }
      const start = column; column += span
      const bottom = Math.min(rows.length, rowIndex + Math.max(1, cell.rowSpan || 1))
      const left = xOffsets[Math.min(columns.length, start)]
      const right = xOffsets[Math.min(columns.length, column)]
      return [{ ...base, nodeType: 'table-cell' as const, rowIndex, cellIndex, text: cell.text, bounds: {
        x: node.position.x + left / width * node.size.w,
        y: node.position.y + yOffsets[rowIndex] / height * node.size.h,
        width: (right - left) / width * node.size.w,
        height: (yOffsets[bottom] - yOffsets[rowIndex]) / height * node.size.h,
      } }]
    })
  })
}
export function buildMiraPresentationElements({ slideIndex, slidePart, nodes, groupTextEntries }: {
  slideIndex: number; slidePart: string; nodes: readonly MiraPresentationNodeInput[]; groupTextEntries: readonly MiraPresentationGroupInput[]
}): MiraPresentationElement[] {
  const direct = nodes.flatMap((node, zIndex) => {
    if (node.nodeType === 'group' || node.nodeType === 'unknown') return []
    const base: MiraPresentationElement = { slideIndex, slidePart, nodeId: node.id, nodeName: node.name, nodeType: node.nodeType,
      bounds: { x: node.position.x, y: node.position.y, width: node.size.w, height: node.size.h }, zIndex, ...(node.text ? { text: node.text } : {}) }
    return node.nodeType === 'table' ? [base, ...tableCells(node, base)] : [base]
  })
  const directIds = new Set(nodes.filter(node => node.nodeType !== 'group').map(node => node.id))
  const nested = groupTextEntries.flatMap(entry => {
    if (directIds.has(entry.nodeId)) return []
    const path = entry.nodePath.split('/'), index = path.indexOf('nodes')
    const groupId = (index >= 0 ? path[index + 1] : undefined) ?? path[0]
    return [{ slideIndex, slidePart, nodeId: entry.nodeId, nodePath: entry.nodePath, nodeName: '', nodeType: 'shape' as const, text: entry.text,
      bounds: { x: entry.bounds.x, y: entry.bounds.y, width: entry.bounds.w, height: entry.bounds.h },
      zIndex: Math.max(0, nodes.findIndex(node => node.nodeType === 'group' && node.id === groupId)) }]
  })
  return [...direct, ...nested]
}
function includesPoint(bounds: MiraPresentationBounds, point: { x: number; y: number }): boolean {
  return point.x >= bounds.x && point.y >= bounds.y && point.x <= bounds.x + bounds.width && point.y <= bounds.y + bounds.height
}
export function hitTestMiraPresentationElement(elements: readonly MiraPresentationElement[], point: { x: number; y: number }): MiraPresentationElement | null {
  return elements.filter(element => includesPoint(element.bounds, point)).sort((left, right) =>
    Number(right.nodeType === 'table-cell') - Number(left.nodeType === 'table-cell') || right.zIndex - left.zIndex)[0] ?? null
}
