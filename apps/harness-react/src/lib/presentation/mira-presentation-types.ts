/* Adapted from ZCode presentation/types.ts, Copyright 2026 Z.AI Co., Ltd.
 * Apache-2.0; see third-party-licenses/zcode. Mira module and interface names. */
export interface MiraPresentationPageSize { width: number; height: number }
export interface MiraPresentationBounds { x: number; y: number; width: number; height: number }
export type MiraPresentationElementKind = 'shape' | 'picture' | 'chart' | 'table' | 'table-cell'
export interface MiraPresentationElement {
  slideIndex: number
  slidePart: string
  nodeId: string
  nodePath?: string
  nodeName: string
  nodeType: MiraPresentationElementKind
  text?: string
  bounds: MiraPresentationBounds
  zIndex: number
  rowIndex?: number
  cellIndex?: number
}
export interface MiraPresentationRenderOptions {
  onNavigate?(target: { pageIndex?: number; url?: string }): void
  onNodeError?(nodeId: string, error: unknown): void
}
export interface MiraPresentationRenderHandle { readonly ready: Promise<void>; dispose(): void }
export interface MiraPresentationDocument {
  readonly pageCount: number
  readonly pageSize: MiraPresentationPageSize
  getPageElements(pageIndex: number): readonly MiraPresentationElement[]
  renderPage(pageIndex: number, container: HTMLElement, options?: MiraPresentationRenderOptions): MiraPresentationRenderHandle
  dispose(): void
}
export interface MiraPresentationEngine { open(data: ArrayBuffer): Promise<MiraPresentationDocument> }
