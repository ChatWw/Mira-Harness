/* Adapted from ZCode presentationPreviewControls.ts, Copyright 2026 Z.AI Co., Ltd.
 * Apache-2.0; see third-party-licenses/zcode. Mira names and non-finite page-count guard. */
export const MIRA_PRESENTATION_MIN_ZOOM = 25
export const MIRA_PRESENTATION_MAX_ZOOM = 300
export const MIRA_PRESENTATION_ZOOM_STEP = 25
export function clampMiraPresentationPage(target: number, pageCount: number): number {
  const count = Number.isFinite(pageCount) ? Math.max(1, Math.floor(pageCount)) : 1
  return Number.isFinite(target) ? Math.min(count, Math.max(1, Math.round(target))) : 1
}
export function clampMiraPresentationZoom(target: number): number {
  return Number.isFinite(target) ? Math.min(MIRA_PRESENTATION_MAX_ZOOM, Math.max(MIRA_PRESENTATION_MIN_ZOOM, Math.round(target))) : 100
}
