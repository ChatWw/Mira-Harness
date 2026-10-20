/* Full view state/anchors adapted from ZCode side-pane-full-view/model (Apache-2.0).
 * Copyright 2026 Z.AI Co., Ltd. */
export type MiraFullView = { surface: 'conversation' | 'resource'; floating: 'collapsed' | 'expanded' | 'minimized' }
export type MiraFloatingAnchor = 'top-left' | 'top-right' | 'left-center' | 'right-center' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export const miraFloatingAnchors: MiraFloatingAnchor[] = ['top-left', 'top-right', 'left-center', 'right-center', 'bottom-left', 'bottom-center', 'bottom-right']
export const miraFullViewEnter: MiraFullView = { surface: 'resource', floating: 'collapsed' }
export function miraFloatingPosition(slot: { width: number; height: number }, size: { width: number; height: number }, anchor: MiraFloatingAnchor) {
  const maxX = Math.max(16, slot.width - size.width - 16), maxY = Math.max(16, slot.height - size.height - 16)
  return { x: anchor.endsWith('left') || anchor.startsWith('left') ? 16 : anchor.endsWith('center') && anchor.startsWith('bottom') ? (16 + maxX) / 2 : maxX,
    y: anchor.startsWith('top') ? 16 : anchor.endsWith('center') && !anchor.startsWith('bottom') ? (16 + maxY) / 2 : maxY }
}
export function miraNearestFloatingAnchor(slot: { width: number; height: number }, size: { width: number; height: number }, point: { x: number; y: number }): MiraFloatingAnchor {
  return miraFloatingAnchors.reduce((best, candidate) => {
    const a = miraFloatingPosition(slot, size, best), b = miraFloatingPosition(slot, size, candidate)
    return Math.hypot(point.x - b.x, point.y - b.y) < Math.hypot(point.x - a.x, point.y - a.y) ? candidate : best
  }, 'bottom-right')
}
