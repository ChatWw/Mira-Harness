export const MIRA_PRIMARY_TASK_PANE = '$primary'
export type MiraTaskSplitSide = 'left' | 'right' | 'up' | 'down'
export type MiraTaskLayout = { kind: 'task'; id: string } | { kind: 'split'; id: string; axis: 'horizontal' | 'vertical'; ratio: number; first: MiraTaskLayout; second: MiraTaskLayout }
export type MiraTaskRect = { left: number; top: number; width: number; height: number }
export const miraInitialTaskLayout = (): MiraTaskLayout => ({ kind: 'task', id: MIRA_PRIMARY_TASK_PANE })
export const miraTaskSplitRatio = (value: number) => Number.isFinite(value) ? Math.min(.75, Math.max(.25, value)) : .5
export function miraTaskPaneIds(layout: MiraTaskLayout): string[] {
  return layout.kind === 'task' ? [layout.id] : [...miraTaskPaneIds(layout.first), ...miraTaskPaneIds(layout.second)]
}
export function splitMiraTaskLayout(layout: MiraTaskLayout, anchor: string, taskId: string, side: MiraTaskSplitSide): MiraTaskLayout {
  const ids = miraTaskPaneIds(layout)
  if (ids.length >= 4 || ids.includes(taskId) || !ids.includes(anchor)) return layout
  const added: MiraTaskLayout = { kind: 'task', id: taskId }
  const replace = (node: MiraTaskLayout): MiraTaskLayout => {
    if (node.kind === 'split') return { ...node, first: replace(node.first), second: replace(node.second) }
    if (node.id !== anchor) return node
    const before = side === 'left' || side === 'up'
    return { kind: 'split', id: crypto.randomUUID(), axis: side === 'left' || side === 'right' ? 'horizontal' : 'vertical', ratio: .5, first: before ? added : node, second: before ? node : added }
  }
  return replace(layout)
}
export function removeMiraTaskPane(layout: MiraTaskLayout, taskId: string): MiraTaskLayout {
  if (taskId === MIRA_PRIMARY_TASK_PANE) return layout
  const remove = (node: MiraTaskLayout): MiraTaskLayout | undefined => {
    if (node.kind === 'task') return node.id === taskId ? undefined : node
    const first = remove(node.first), second = remove(node.second)
    return !first ? second : !second ? first : first === node.first && second === node.second ? node : { ...node, first, second }
  }
  return remove(layout) ?? miraInitialTaskLayout()
}
export function resizeMiraTaskSplit(layout: MiraTaskLayout, id: string, ratio: number): MiraTaskLayout {
  if (layout.kind === 'task') return layout
  if (layout.id === id) return { ...layout, ratio: miraTaskSplitRatio(ratio) }
  return { ...layout, first: resizeMiraTaskSplit(layout.first, id, ratio), second: resizeMiraTaskSplit(layout.second, id, ratio) }
}
export function readMiraTaskLayout(value: unknown, taskIds: string[]): MiraTaskLayout {
  const allowed = new Set([MIRA_PRIMARY_TASK_PANE, ...taskIds]), seen = new Set<string>(), splits = new Set<string>()
  function read(value: unknown, depth: number): MiraTaskLayout | undefined {
    if (!value || typeof value !== 'object' || depth > 3) return
    const node = value as Record<string, unknown>
    if (node.kind === 'task' && typeof node.id === 'string' && allowed.has(node.id) && !seen.has(node.id) && seen.size < 4) { seen.add(node.id); return { kind: 'task', id: node.id } }
    if (node.kind !== 'split' || typeof node.id !== 'string' || !node.id || splits.has(node.id) || !['horizontal', 'vertical'].includes(String(node.axis))) return
    splits.add(node.id)
    const first = read(node.first, depth + 1), second = read(node.second, depth + 1)
    if (!first) return second
    if (!second) return first
    return { kind: 'split', id: node.id, axis: node.axis as 'horizontal' | 'vertical', ratio: miraTaskSplitRatio(typeof node.ratio === 'number' ? node.ratio : .5), first, second }
  }
  const restored = read(value, 0)
  let result = restored && seen.has(MIRA_PRIMARY_TASK_PANE) ? restored : miraInitialTaskLayout()
  for (const id of taskIds) if (!miraTaskPaneIds(result).includes(id)) result = splitMiraTaskLayout(result, MIRA_PRIMARY_TASK_PANE, id, 'right')
  return result
}
export function miraTaskLayoutGeometry(layout: MiraTaskLayout) {
  const panes: Array<{ id: string; rect: MiraTaskRect }> = [], dividers: Array<{ id: string; axis: 'horizontal' | 'vertical'; ratio: number; rect: MiraTaskRect }> = []
  function visit(node: MiraTaskLayout, rect: MiraTaskRect) {
    if (node.kind === 'task') { panes.push({ id: node.id, rect }); return }
    const horizontal = node.axis === 'horizontal', size = horizontal ? rect.width : rect.height, firstSize = size * node.ratio
    dividers.push({ id: node.id, axis: node.axis, ratio: node.ratio, rect })
    visit(node.first, { ...rect, ...(horizontal ? { width: firstSize } : { height: firstSize }) })
    visit(node.second, { ...rect, ...(horizontal ? { left: rect.left + firstSize, width: size - firstSize } : { top: rect.top + firstSize, height: size - firstSize }) })
  }
  visit(layout, { left: 0, top: 0, width: 1, height: 1 })
  return { panes, dividers }
}
export function miraTaskDropSide(rect: { left: number; top: number; width: number; height: number }, x: number, y: number): MiraTaskSplitSide | undefined {
  if (rect.width <= 0 || rect.height <= 0) return
  const left = (x - rect.left) / rect.width, top = (y - rect.top) / rect.height
  if (left < 0 || left > 1 || top < 0 || top > 1) return
  const distances: Array<[MiraTaskSplitSide, number]> = [['left', left], ['right', 1 - left], ['up', top], ['down', 1 - top]]
  const [side, distance] = distances.reduce((best, entry) => entry[1] < best[1] ? entry : best)
  return distance <= .32 ? side : undefined
}
