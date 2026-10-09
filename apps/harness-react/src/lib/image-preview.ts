/* Image sizing adapted from ZCode previewPaneImageContent.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: shared sizing helpers and encoded SVG image sources.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
export function miraImagePixelRatio(path: string) {
  const name = path.replace(/\\/g, '/').split('/').pop() || ''
  const match = /@(\d+(?:\.\d+)?)x(?=(?:\.[^./\\]+)?$)/i.exec(name)
  const ratio = match ? Number(match[1]) : 1
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1
}

export function miraImageDisplaySize(path: string, width: number, height: number, fit: boolean) {
  const ratio = miraImagePixelRatio(path)
  return !fit && ratio > 1 && width > 0 && height > 0 ? { width: width / ratio, height: height / ratio } : undefined
}

export function miraSvgImageSource(content: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
}
