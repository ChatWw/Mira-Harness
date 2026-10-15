// Markdown link routing follows ZCode markdownFileLink / ai-elements/message.
// Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
import { miraDocumentHref } from './mira-document-links'

export function miraMessageLink(href: string, directory?: string): { kind: 'web' | 'file' | 'anchor'; target: string } | undefined {
  if (/[\u0000-\u001f\u007f-\u009f]/.test(href)) return
  href = href.trim()
  const web = miraDocumentHref(href.startsWith('//') ? `https:${href}` : href)
  if (web) return { kind: web.startsWith('#') ? 'anchor' : 'web', target: web }
  let path = href
  try {
    if (/^file:/i.test(path)) {
      const url = new URL(path)
      if (url.protocol !== 'file:' || url.hostname && url.hostname !== 'localhost') return
      path = decodeURIComponent(url.pathname)
      if (/^\/[a-z]:\//i.test(path)) path = path.slice(1)
    } else {
      if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return
      path = decodeURIComponent(path.split(/[?#]/)[0])
    }
  } catch { return }
  path = path.replace(/\\/g, '/').replace(/:\d+(?::\d+)?$/, '')
  if (!path || /[\u0000-\u001f\u007f-\u009f]/.test(path)) return
  if (/^\/[a-z]:\//i.test(path)) path = path.slice(1)
  const absolute = path.startsWith('/') || /^[a-z]:\//i.test(path)
  if (!absolute) {
    if (!directory) return
    path = `${directory.replace(/\\/g, '/').replace(/\/$/, '')}/${path}`
  }
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '.') continue
    if (segment === '..') { if (segments.length > 1) segments.pop(); continue }
    segments.push(segment)
  }
  return { kind: 'file', target: segments.join('/') }
}
