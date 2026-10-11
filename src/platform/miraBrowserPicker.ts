/** Adapted from ZCode webElementPickerScript.ts / webElementContext.ts.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira uses a fixed guest script and its own task-scoped prompt references. */
export interface MiraBrowserElement {
  pageUrl: string; pageTitle: string; tagName: string; role: string; accessibleName: string
  selector: string; xpath: string; text: string; nearbyText: string; htmlExcerpt: string
  attributes: string; style: string
  rect: { x: number; y: number; width: number; height: number }
}
export type MiraBrowserPickResult = { status: 'cancelled' } | { status: 'selected'; element: MiraBrowserElement }
export interface MiraBrowserElementReference { sessionId: string; browserId: string; element: MiraBrowserElement }

/** Guest data is untrusted; copy only bounded fields into the application. */
export function readMiraBrowserElement(value: unknown): MiraBrowserElement | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const source = value as Record<string, unknown>, result: Record<string, unknown> = {}
  const limits = { pageUrl: 4096, pageTitle: 512, tagName: 128, role: 128, accessibleName: 4000, selector: 4096, xpath: 4096, text: 4000, nearbyText: 4000, htmlExcerpt: 6000, attributes: 4000, style: 2000 }
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof source[field] !== 'string' || (source[field] as string).length > limit) return
    result[field] = source[field]
  }
  if (!source.tagName) return
  try { const url = new URL(source.pageUrl as string); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return } catch { return }
  const rect = source.rect as Record<string, unknown> | undefined
  if (!rect || ['x', 'y', 'width', 'height'].some(key => typeof rect[key] !== 'number' || !Number.isFinite(rect[key]) || Math.abs(rect[key] as number) > 10_000_000) || Number(rect.width) < 0 || Number(rect.height) < 0) return
  return { ...result, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } } as MiraBrowserElement
}

// Self-contained: this function runs inside the guest, without Node or platform access.
function miraPickPageElement(runId: number): Promise<MiraBrowserPickResult> {
  type PickerWindow = Window & { __miraElementPicker?: { runId: number; cancel: () => void } }
  const host = window as PickerWindow
  host.__miraElementPicker?.cancel()
  const clip = (text: string | null | undefined, limit: number) => (text || '').replace(/\s+/g, ' ').trim().slice(0, limit)
  const colorOf = (value: string) => {
    const match = /^rgba?\(\s*([\d.]+)(?:,|\s)+([\d.]+)(?:,|\s)+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(value.trim())
    if (!match) return value
    const alpha = match[4] ? Number.parseFloat(match[4]) / (match[4].endsWith('%') ? 100 : 1) : 1
    if (alpha <= 0) return 'transparent'
    return `#${match.slice(1, 4).map(channel => Math.max(0, Math.min(255, Math.round(Number(channel)))).toString(16).padStart(2, '0')).join('').toUpperCase()}`
  }
  const escape = (text: string) => CSS.escape(text)
  const textOf = (element: Element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return clip(element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.name || element.tagName.toLowerCase(), 4000)
    // Remove form contents even when picking a parent rather than the input itself.
    const clone = element.cloneNode(true) as Element
    clone.querySelectorAll('input, textarea, script, style, noscript, template, [data-mira-element-picker]').forEach(node => node.remove())
    return clip(clone.textContent, 4000)
  }
  const selectorOf = (element: Element) => {
    const parts: string[] = []
    for (let current: Element | null = element; current && parts.length < 8; current = current.parentElement) {
      if (current.id) { parts.unshift(`#${escape(current.id)}`); break }
      const siblings = Array.from(current.parentElement?.children || []).filter(node => node.tagName === current!.tagName)
      parts.unshift(`${current.tagName.toLowerCase()}${Array.from(current.classList).slice(0, 2).map(name => `.${escape(name)}`).join('')}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ''}`)
    }
    return clip(parts.join(' > '), 4096)
  }
  const xpathOf = (element: Element) => {
    const parts: string[] = []
    for (let current: Element | null = element; current && parts.length < 12; current = current.parentElement) {
      const siblings = Array.from(current.parentElement?.children || []).filter(node => node.tagName === current!.tagName)
      parts.unshift(`${current.tagName.toLowerCase()}[${Math.max(1, siblings.indexOf(current) + 1)}]`)
    }
    return `/${parts.join('/')}`
  }
  const summaryOf = (element: Element) => {
    const style = getComputedStyle(element)
    return { color: colorOf(style.color), background: colorOf(style.backgroundColor), font: clip(`${style.fontSize} ${style.fontFamily}`, 96), weight: style.fontWeight, display: style.display }
  }
  const collect = (element: Element): MiraBrowserElement => {
    const tagName = element.tagName.toLowerCase(), box = element.getBoundingClientRect(), style = summaryOf(element)
    const clone = element.cloneNode(true) as Element
    clone.querySelectorAll('script, style, noscript, template, [data-mira-element-picker]').forEach(node => node.remove())
    for (const node of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
      for (const attr of Array.from(node.attributes)) if (attr.name === 'value' || attr.name.startsWith('on')) node.removeAttribute(attr.name)
      if (node.tagName === 'TEXTAREA') node.textContent = ''
    }
    const implicitRoles: Record<string, string> = { button: 'button', a: 'link', img: 'img', input: 'textbox', textarea: 'textbox', select: 'combobox', nav: 'navigation', main: 'main', form: 'form' }
    const text = textOf(element)
    const labelled = (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ')
    return {
      pageUrl: clip(location.href, 4096), pageTitle: clip(document.title, 512), tagName,
      role: clip(element.getAttribute('role') || implicitRoles[tagName], 128),
      accessibleName: clip(labelled.trim() || element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('title') || text, 4000),
      selector: selectorOf(element), xpath: xpathOf(element), text,
      nearbyText: textOf(element.closest('article, section, main, form, li, tr, dialog') || element.parentElement || element),
      htmlExcerpt: clip(clone.outerHTML, 6000),
      attributes: clip(Array.from(element.attributes).filter(attr => /^(id|class|href|src|alt|title|name|type|placeholder|aria-[\w-]+)$/.test(attr.name)).map(attr => `${attr.name}=${JSON.stringify(clip(attr.value, 500))}`).join(' '), 4000),
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      style: clip(`Color: ${style.color}; Background: ${style.background}; Font: ${style.font}; Weight: ${style.weight}; Display: ${style.display}`, 2000),
    }
  }
  const overlay = document.createElement('div'), label = document.createElement('div')
  overlay.dataset.miraElementPicker = 'overlay'; label.dataset.miraElementPicker = 'label'
  Object.assign(overlay.style, { position: 'fixed', display: 'none', pointerEvents: 'none', zIndex: '2147483647', background: 'rgba(37,99,235,.12)', border: '2px solid #2563eb', borderRadius: '4px', boxSizing: 'border-box', boxShadow: '0 0 0 9999px rgba(15,23,42,.10)' })
  Object.assign(label.style, { position: 'fixed', display: 'none', pointerEvents: 'none', zIndex: '2147483647', background: 'rgba(17,24,39,.92)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.14)', color: '#f9fafb', borderRadius: '18px', padding: '12px 18px 14px', boxShadow: '0 18px 38px rgba(15,23,42,.28)', font: '12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', width: 'min(320px, calc(100vw - 16px))', minWidth: 'min(214px, calc(100vw - 16px))', maxWidth: 'calc(100vw - 16px)', boxSizing: 'border-box' })
  const addRow = (name: string, value: string, header = false) => {
    const row = document.createElement('div'), key = document.createElement('span'), detail = document.createElement('span')
    Object.assign(row.style, { display: 'grid', gridTemplateColumns: header ? 'minmax(0, 1fr) auto' : 'auto minmax(0, 1fr)', alignItems: 'baseline', columnGap: '16px', minWidth: '0' })
    Object.assign(key.style, { color: header ? '#fff' : 'rgba(255,255,255,.62)', fontSize: header ? '16px' : '15px', fontWeight: header ? '800' : '600', minWidth: '0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
    Object.assign(detail.style, { color: '#fff', fontFamily: 'ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,monospace', fontSize: '15px', fontWeight: header ? '800' : '700', minWidth: '0', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
    key.textContent = name; detail.textContent = value; row.append(key, detail); label.append(row)
  }
  document.documentElement.append(overlay, label)
  const cursor = document.documentElement.style.getPropertyValue('cursor'), priority = document.documentElement.style.getPropertyPriority('cursor')
  let hovered: Element | null = null, frame = 0, settled = false
  return new Promise(resolve => {
    const finish = (result: MiraBrowserPickResult) => {
      if (settled) return
      settled = true; cancelAnimationFrame(frame)
      document.removeEventListener('mousemove', move, true); document.removeEventListener('click', click, true); document.removeEventListener('keydown', key, true)
      window.removeEventListener('scroll', refresh, true); window.removeEventListener('resize', refresh); window.removeEventListener('pagehide', cancel)
      overlay.remove(); label.remove()
      if (host.__miraElementPicker?.runId === runId) { delete host.__miraElementPicker; document.documentElement.style.setProperty('cursor', cursor, priority) }
      resolve(result)
    }
    const cancel = () => finish({ status: 'cancelled' })
    const draw = () => {
      frame = 0
      if (!hovered?.isConnected) { overlay.style.display = label.style.display = 'none'; return }
      const box = hovered.getBoundingClientRect(), style = summaryOf(hovered)
      if (box.width <= 0 || box.height <= 0) { overlay.style.display = label.style.display = 'none'; return }
      Object.assign(overlay.style, { display: 'block', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
      label.replaceChildren()
      addRow(hovered.tagName.toLowerCase(), `${Math.round(box.width)}×${Math.round(box.height)}`, true)
      addRow('颜色', style.color)
      if (style.background !== 'transparent') addRow('背景', style.background)
      addRow('字体', style.font)
      label.style.display = 'block'
      const width = label.offsetWidth, height = label.offsetHeight
      label.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, box.left + (box.width - width) / 2))}px`
      label.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, box.bottom + height + 20 <= innerHeight ? box.bottom + 12 : box.top - height - 12))}px`
    }
    function refresh() { if (!frame) frame = requestAnimationFrame(draw) }
    function move(event: MouseEvent) { const target = event.composedPath().find(node => node instanceof Element) as Element | undefined; if (target && !target.closest('[data-mira-element-picker]')) { hovered = target; refresh() } }
    function click(event: MouseEvent) {
      event.preventDefault(); event.stopImmediatePropagation()
      const target = event.composedPath().find(node => node instanceof Element) as Element | undefined
      // Read the clicked target, not a stale hover after scrolling or keyboard interaction.
      if (!target?.isConnected || target.closest('[data-mira-element-picker]')) { cancel(); return }
      try { finish({ status: 'selected', element: collect(target) }) } catch { cancel() }
    }
    function key(event: KeyboardEvent) { if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopImmediatePropagation(); cancel() } }
    host.__miraElementPicker = { runId, cancel }
    document.documentElement.style.setProperty('cursor', 'crosshair', 'important')
    document.addEventListener('mousemove', move, true); document.addEventListener('click', click, true); document.addEventListener('keydown', key, true)
    window.addEventListener('scroll', refresh, true); window.addEventListener('resize', refresh); window.addEventListener('pagehide', cancel)
  })
}

export const buildMiraBrowserPicker = (runId: number) => `(${miraPickPageElement.toString()})(${runId})`
export const cancelMiraBrowserPicker = (runId: number) => `(() => { const picker = window.__miraElementPicker; if (picker?.runId === ${runId}) picker.cancel(); })()`
