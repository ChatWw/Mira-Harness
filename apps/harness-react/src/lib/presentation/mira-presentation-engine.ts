/* Adapted from ZCode pptxRendererPreviewEngine.ts, Copyright 2026 Z.AI Co., Ltd.
 * Apache-2.0; see third-party-licenses/zcode. Mira names, strict upstream types and explicit document release. */
import { RECOMMENDED_ZIP_LIMITS, buildTextIndex, buildPresentation, materializeSlideNodes, parseZipLazyMedia, renderSlide } from '@aiden0z/pptx-renderer/browser'
import type { PresentationData, TextBody } from '@aiden0z/pptx-renderer'
import type { MiraPresentationDocument, MiraPresentationEngine, MiraPresentationElement, MiraPresentationRenderHandle, MiraPresentationRenderOptions } from './mira-presentation-types'
import { buildMiraPresentationElements } from './mira-presentation-elements'

const plainText = (body?: TextBody) => body?.paragraphs.map(paragraph => paragraph.runs.map(run => run.text).join('')).join('\n').trim()
class MiraPresentationReader implements MiraPresentationDocument {
  readonly pageCount: number
  readonly pageSize: { width: number; height: number }
  private active = new Set<MiraPresentationRenderHandle>()
  private elements = new Map<number, readonly MiraPresentationElement[]>()
  private presentation?: PresentationData
  constructor(presentation: PresentationData) {
    this.presentation = presentation
    this.pageCount = presentation.slides.length
    this.pageSize = { width: presentation.width, height: presentation.height }
  }
  private page(pageIndex: number) {
    if (!this.presentation) throw new Error('演示文稿预览已关闭')
    const slide = Number.isInteger(pageIndex) ? this.presentation.slides[pageIndex] : undefined
    if (!slide) throw new RangeError(`幻灯片页码超出范围：${pageIndex}`)
    return { presentation: this.presentation, slide }
  }
  getPageElements(pageIndex: number): readonly MiraPresentationElement[] {
    const { presentation, slide } = this.page(pageIndex)
    const cached = this.elements.get(pageIndex)
    if (cached) return cached
    materializeSlideNodes(presentation, slide)
    // Index a one-slide view only: selecting a page must not parse every slide.
    const text = buildTextIndex({ ...presentation, slides: [slide] }, { includeGroups: true, includeShapes: true, includeTables: false })
    const directIds = new Set(slide.nodes.map(node => node.id))
    const result = buildMiraPresentationElements({ slideIndex: pageIndex, slidePart: slide.slidePath,
      nodes: slide.nodes.map(node => ({ id: node.id, name: node.name, nodeType: node.nodeType, position: node.position, size: node.size,
        ...(node.nodeType === 'shape' ? { text: plainText(node.textBody) } : {}),
        ...(node.nodeType === 'table' ? { columns: node.columns, rows: node.rows.map(row => ({ height: row.height, cells: row.cells.map(cell => ({
          gridSpan: cell.gridSpan, rowSpan: cell.rowSpan, hMerge: cell.hMerge, vMerge: cell.vMerge, text: plainText(cell.textBody),
        })) })) } : {}) })),
      groupTextEntries: text.filter(entry => entry.slideIndex === 0 && entry.textKind === 'shape' && entry.nodePath.startsWith('slides/0/nodes/') && !directIds.has(entry.nodeId))
        .map(entry => ({ nodeId: entry.nodeId, nodePath: entry.nodePath, text: entry.text, bounds: entry.bounds })),
    })
    this.elements.set(pageIndex, result)
    return result
  }
  renderPage(pageIndex: number, container: HTMLElement, options?: MiraPresentationRenderOptions): MiraPresentationRenderHandle {
    const { presentation, slide } = this.page(pageIndex)
    const rendered = renderSlide(presentation, slide, { onNavigate: options?.onNavigate ? target => options.onNavigate?.({ pageIndex: target.slideIndex, url: target.url }) : undefined, onNodeError: options?.onNodeError })
    try { container.append(rendered.element) } catch (error) { rendered.dispose(); throw error }
    let disposed = false
    const handle: MiraPresentationRenderHandle = { ready: rendered.ready, dispose: () => {
      if (disposed) return
      disposed = true; rendered.dispose(); rendered.element.remove(); this.active.delete(handle)
    } }
    this.active.add(handle)
    return handle
  }
  dispose(): void {
    if (!this.presentation) return
    for (const handle of this.active) handle.dispose()
    this.active.clear(); this.elements.clear(); this.presentation = undefined
  }
}
export const miraPresentationEngine: MiraPresentationEngine = {
  async open(data) {
    const files = await parseZipLazyMedia(data, RECOMMENDED_ZIP_LIMITS)
    return new MiraPresentationReader(buildPresentation(files, { lazySlides: true }))
  },
}
