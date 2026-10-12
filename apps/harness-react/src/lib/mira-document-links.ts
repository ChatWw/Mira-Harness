/* Link policy adapted from ZCode lib/officeFilePreview.ts.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira routes web links to the owning workspace and keeps anchors inside the document. */
export function miraDocumentHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  // Reject controls before trimming: URL parsers otherwise repair disguised schemes.
  for (const character of value) {
    const code = character.codePointAt(0)!
    if (code <= 31 || code >= 127 && code <= 159) return
  }
  const href = value.trim()
  if (href.startsWith('#')) return href.length > 1 && !/[\s<>"']/u.test(href) ? href : undefined
  if (!/^https?:/i.test(href)) return
  try {
    const parsed = new URL(href)
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password) return href
  } catch { /* An invalid document relationship remains plain text. */ }
}

export function installMiraDocumentLinks(root: HTMLElement, onOpenLink?: (url: string) => void, options?: { delegateInternalAnchors?: boolean }): () => void {
  const selector = 'a[href], a[xlink\\:href]'
  const sanitize = (parent: Element) => {
    const links = [...(parent.matches(selector) ? [parent] : []), ...parent.querySelectorAll(selector)]
    for (const link of links) {
      for (const attribute of ['href', 'xlink:href']) {
        const original = link.getAttribute(attribute)
        if (original === null) continue
        const href = miraDocumentHref(original)
        if (!href) { link.removeAttribute(attribute); link.setAttribute('aria-disabled', 'true') }
        else { if (href !== original) link.setAttribute(attribute, href); link.removeAttribute('aria-disabled') }
      }
      link.removeAttribute('target'); link.removeAttribute('download')
    }
  }
  const click = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null
    if (!link || !root.contains(link)) return
    event.preventDefault()
    const href = miraDocumentHref(link.getAttribute('href') ?? link.getAttribute('xlink:href'))
    const mouse = event as MouseEvent
    // The full Word renderer can reveal bookmark pages absent from its virtual DOM.
    // Let only safe ordinary anchor clicks reach that handler, never native navigation.
    if (options?.delegateInternalAnchors && href?.startsWith('#') && event.type === 'click' && mouse.button === 0 && !mouse.ctrlKey && !mouse.metaKey && !mouse.altKey && !mouse.shiftKey) return
    event.stopPropagation()
    if (!href || event.type === 'auxclick' && (event as MouseEvent).button !== 1) return
    if (href.startsWith('#')) {
      let name = href.slice(1)
      try { name = decodeURIComponent(name) } catch { return }
      const target = [...root.querySelectorAll('[id], [name]')].find(item => item.id === name || item.getAttribute('name') === name)
      target?.scrollIntoView?.({ block: 'nearest' })
    } else onOpenLink?.(href)
  }
  // The canvas sheet renderer uses this scoped event instead of window.open.
  const canvasLink = (event: Event) => {
    event.stopPropagation()
    const href = miraDocumentHref((event as CustomEvent<{ url?: unknown }>).detail?.url)
    if (href && !href.startsWith('#')) onOpenLink?.(href)
  }
  sanitize(root)
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') sanitize(record.target as Element)
      else for (const node of record.addedNodes) if (node instanceof Element) sanitize(node)
    }
  })
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'xlink:href', 'target', 'download'] })
  root.addEventListener('click', click, true); root.addEventListener('auxclick', click, true)
  root.addEventListener('mira-document-open-link', canvasLink)
  return () => {
    observer.disconnect()
    root.removeEventListener('click', click, true); root.removeEventListener('auxclick', click, true)
    root.removeEventListener('mira-document-open-link', canvasLink)
  }
}
