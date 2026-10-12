/* Adapted from ZCode presentationTextSelection.ts, Copyright 2026 Z.AI Co., Ltd.
 * Apache-2.0; see third-party-licenses/zcode. Mira names and element-scoped text extraction. */
import type { MiraPresentationBounds, MiraPresentationPageSize } from './mira-presentation-types'
export function getMiraPresentationSelectedText({ selection, renderSurface, pageSize, elementBounds, elementText }: {
  selection: Selection | null; renderSurface: HTMLElement | null; pageSize: MiraPresentationPageSize
  elementBounds: MiraPresentationBounds; elementText?: string
}): string | null {
  if (!selection || selection.isCollapsed || !selection.rangeCount || !renderSurface) return null
  const rect = renderSurface.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0 || pageSize.width <= 0 || pageSize.height <= 0) return null
  const scaleX = rect.width / pageSize.width, scaleY = rect.height / pageSize.height
  const left = rect.left + elementBounds.x * scaleX, top = rect.top + elementBounds.y * scaleY
  const right = left + elementBounds.width * scaleX, bottom = top + elementBounds.height * scaleY
  const owner = renderSurface.ownerDocument, parts: string[] = []
  for (let index = 0; index < selection.rangeCount; index++) {
    const range = selection.getRangeAt(index)
    if (range.collapsed) continue
    const walker = owner.createTreeWalker(renderSurface, owner.defaultView?.NodeFilter.SHOW_TEXT ?? 4)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text
      try { if (!range.intersectsNode(text)) continue } catch { continue }
      const start = range.startContainer === text ? Math.min(range.startOffset, text.length) : 0
      const end = range.endContainer === text ? Math.min(range.endOffset, text.length) : text.length
      if (end <= start) continue
      const fragment = owner.createRange(); fragment.setStart(text, start); fragment.setEnd(text, end)
      const inside = [...fragment.getClientRects()].some(bounds => {
        const x = (bounds.left + bounds.right) / 2, y = (bounds.top + bounds.bottom) / 2
        return x >= left && x <= right && y >= top && y <= bottom
      })
      const value = text.data.slice(start, end)
      if (inside && (!value.trim() || !elementText || elementText.includes(value.trim()))) parts.push(value)
    }
  }
  return parts.join('').trim() || null
}
