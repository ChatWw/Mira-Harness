import type { HarnessBrowserBounds, HarnessBrowserPresentation, parseFirstPartyHarnessCall } from './firstPartyHarness'
import { miraBrowserFavicon } from './miraBrowserMetadata'
import { buildMiraBrowserPicker, cancelMiraBrowserPicker, readMiraBrowserElement, type MiraBrowserPickResult } from './miraBrowserPicker'
type MiraBrowserCall = Extract<ReturnType<typeof parseFirstPartyHarnessCall>, { method: 'browser.navigate' | 'browser.bounds' | 'browser.control' | 'browser.viewport' | 'browser.pick' | 'browser.protection' }>

export type MiraHostedBrowserElement = HTMLElement & {
  getURL(): string
  getTitle(): string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  openDevTools(): void
  getWebContentsId(): number
  loadURL(url: string): Promise<void>
  executeJavaScript(script: string): Promise<unknown>
}
export interface MiraHostedBrowserState {
  sessionId: string; browserId: string; url: string; title: string
  canGoBack: boolean; canGoForward: boolean; loading: boolean; ready: boolean; error?: string; errorCode?: number; faviconUrl?: string | null
}
interface MiraHostedPage {
  sessionId: string; browserId: string; element: MiraHostedBrowserElement; loading: boolean; ready: boolean; requestedUrl: string; error?: string; errorCode?: number; faviconUrl?: string | null
  detach: () => void; cancelAttach?: () => void
  committedUrl: string
  favicons: Map<string, string | null>
  attached?: Promise<void>
  container: HTMLDivElement
  presentation?: HarnessBrowserPresentation
  desktopZoom?: number
  presentationRevision?: number
  pickerRun?: number
  pickerRevision?: number
  mediaActive?: boolean
  operations?: number
}

// Guests belong to a task and resource together; late events never read a global current guest.
export class MiraHostedBrowsers {
  private pages = new Map<string, MiraHostedPage>()
  private pending = new Map<string, { valid: boolean; visible: boolean }>()
  private pickerSequence = 0
  constructor(private stage: () => HTMLElement | undefined, private send: (state: MiraHostedBrowserState) => void, private bind?: (sessionId: string, browserId: string, guestId: number) => Promise<void>) {}
  private key(sessionId: string, browserId: string) { return JSON.stringify([sessionId, browserId]) }
  private current(page: MiraHostedPage) { return this.pages.get(this.key(page.sessionId, page.browserId)) === page }
  async request(call: MiraBrowserCall, authorize: (guestId?: number) => Promise<unknown>) {
    const key = this.key(call.sessionId, call.browserId ?? 'browser'), previous = this.pending.get(key)
    const navigation = call.method === 'browser.navigate' ? { valid: true, visible: call.visible ?? true } : undefined
    if (navigation) { if (previous) previous.valid = false; this.pending.set(key, navigation) }
    else if (call.method === 'browser.control' && previous) {
      if (call.action === 'close') previous.valid = false
      if (call.action === 'hide' || call.action === 'show') previous.visible = call.action === 'show'
    }
    try {
      if (call.method === 'browser.protection') {
        const page = this.pages.get(key)
        const value = await authorize(page?.ready ? page.element.getWebContentsId() : undefined) as { protected: boolean }
        const current = this.pages.get(key)
        return { protected: value.protected || Boolean(this.pending.has(key) || current && (!current.ready || current.loading || current.mediaActive || current.operations || current.pickerRun !== undefined)) }
      }
      if (call.method === 'browser.pick') {
        const page = this.pages.get(key)
        if (!page) { if (call.action === 'cancel') return { status: 'cancelled' } as const; throw new Error('浏览器资源已关闭') }
        const revision = page.pickerRevision = (page.pickerRevision ?? 0) + 1
        await page.attached
        if (!this.current(page)) return { status: 'cancelled' } as const
        await authorize(page.element.getWebContentsId())
        if (!this.current(page) || revision !== page.pickerRevision) return { status: 'cancelled' } as const
        if (call.action === 'cancel') { this.cancelPicker(page); return { status: 'cancelled' } as const }
        if (!page.ready || page.loading || page.error || page.element.style.display === 'none') throw new Error('请先打开并加载网页')
        this.cancelPicker(page)
        const run = page.pickerRun = ++this.pickerSequence
        try {
          const result = await page.element.executeJavaScript(buildMiraBrowserPicker(run)) as MiraBrowserPickResult
          if (!this.current(page) || page.pickerRun !== run) return { status: 'cancelled' } as const
          if (result?.status === 'cancelled') return { status: 'cancelled' } as const
          const element = result?.status === 'selected' ? readMiraBrowserElement(result.element) : undefined
          if (!element) throw new Error('网页元素信息无效，请重新选择')
          return { status: 'selected', element } as const
        } catch (error) { if (!this.current(page) || page.pickerRun !== run) return { status: 'cancelled' } as const; throw error }
        finally { if (page.pickerRun === run) this.cancelPicker(page) }
      }
      if (call.method === 'browser.viewport') {
        const page = this.pages.get(key)
        if (!page) throw new Error('浏览器资源已关闭')
        await page.attached
        if (!this.current(page)) throw new Error('浏览器资源已关闭')
        const revision = page.presentationRevision = (page.presentationRevision ?? 0) + 1
        page.operations = (page.operations ?? 0) + 1
        try {
          const value = await authorize(page.element.getWebContentsId()) as { desktopZoomFactor: number }
          if (!this.current(page)) throw new Error('浏览器资源已关闭')
          if (page.presentationRevision === revision) { page.presentation = call; page.desktopZoom = value.desktopZoomFactor; this.setBounds(call.sessionId, call.bounds, call.browserId) }
          return value
        } finally { page.operations--; this.state(page) }
      }
      await authorize()
      if (call.method === 'browser.navigate') {
        if (!navigation?.valid) throw new Error('浏览器请求已过期')
        await this.navigate(call.sessionId, call.url, call.bounds, call.browserId, navigation.visible)
        if (!navigation.valid) throw new Error('浏览器请求已过期')
        return call.url
      }
      if (call.method === 'browser.bounds') this.setBounds(call.sessionId, call.bounds, call.browserId)
      else this.control(call.sessionId, call.action, call.browserId)
      return null
    } finally { if (navigation && this.pending.get(key) === navigation) this.pending.delete(key) }
  }
  private state(page: MiraHostedPage) {
    if (!this.current(page)) return
    let url = page.element.getAttribute('src') || '', title = '', canGoBack = false, canGoForward = false
    try { url = page.element.getURL() || url; title = page.element.getTitle(); canGoBack = page.element.canGoBack(); canGoForward = page.element.canGoForward() } catch { /* guest not attached yet */ }
    this.send({ sessionId: page.sessionId, browserId: page.browserId, url: page.error ? page.requestedUrl : url, title, canGoBack, canGoForward, loading: page.loading, ready: page.ready, ...(page.faviconUrl === undefined ? {} : { faviconUrl: page.faviconUrl }), ...(page.error ? { error: page.error, errorCode: page.errorCode } : {}) })
  }
  private cancelPicker(page: MiraHostedPage) {
    page.pickerRevision = (page.pickerRevision ?? 0) + 1
    const run = page.pickerRun; page.pickerRun = undefined
    if (run !== undefined) void page.element.executeJavaScript(cancelMiraBrowserPicker(run)).catch(() => undefined)
  }
  setBounds(sessionId: string, bounds: HarnessBrowserBounds, browserId = 'browser') {
    const page = this.pages.get(this.key(sessionId, browserId)), stage = this.stage()
    if (!page || !stage) return
    if (page.presentation?.viewport) {
      const { viewport, clip, scale } = page.presentation, zoom = page.desktopZoom || 1
      const x = Math.max(0, clip.x, bounds.x), y = Math.max(0, clip.y, bounds.y)
      const width = Math.max(0, Math.min(stage.clientWidth, clip.x + clip.width, bounds.x + bounds.width) - x)
      const height = Math.max(0, Math.min(stage.clientHeight, clip.y + clip.height, bounds.y + bounds.height) - y)
      Object.assign(page.container.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, overflow: 'hidden', zIndex: '2', display: page.element.style.display })
      const layout = zoom < 1 ? 1 / zoom : 1, transform = scale / zoom * (zoom < 1 ? zoom : 1)
      Object.assign(page.element.style, { position: 'absolute', left: `${bounds.x - x}px`, top: `${bounds.y - y}px`, width: `${viewport.width * layout}px`, height: `${viewport.height * layout}px`, transform: `scale(${transform})`, transformOrigin: 'top left', border: '0', background: '#fff' })
      return
    }
    const x = Math.min(bounds.x, stage.clientWidth), y = Math.min(bounds.y, stage.clientHeight)
    const width = Math.max(0, Math.min(bounds.width, stage.clientWidth - x)), height = Math.max(0, Math.min(bounds.height, stage.clientHeight - y))
    Object.assign(page.container.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, overflow: 'hidden', zIndex: '2', display: page.element.style.display })
    Object.assign(page.element.style, { position: 'absolute', left: '0', top: '0', width: `${width}px`, height: `${height}px`, transform: '', transformOrigin: '', border: '0', background: '#fff' })
  }
  control(sessionId: string, action: 'back' | 'forward' | 'reload' | 'devtools' | 'hide' | 'show' | 'close', browserId = 'browser') {
    const key = this.key(sessionId, browserId), page = this.pages.get(key)
    if (!page) return
    if (action === 'close') {
      this.cancelPicker(page)
      this.pages.delete(key); page.detach(); page.cancelAttach?.(); page.container.remove(); return
    }
    if (action === 'hide' || action === 'show') {
      if (action === 'hide') this.cancelPicker(page)
      if (action === 'show') for (const other of this.pages.values()) if (other !== page) { this.cancelPicker(other); other.element.style.display = 'none'; other.container.style.display = 'none' }
      // Electron's internal iframe flexes to fill the guest. display:block leaves its
      // native raster at the default 150px height, even with correct CDP metrics.
      page.element.style.display = action === 'show' ? 'flex' : 'none'; page.container.style.display = page.element.style.display; return
    }
    this.cancelPicker(page)
    if (action === 'back' && page.element.canGoBack()) page.element.goBack()
    if (action === 'forward' && page.element.canGoForward()) page.element.goForward()
    if (action === 'reload') page.element.reload()
    if (action === 'devtools' && page.ready) page.element.openDevTools()
  }
  async navigate(sessionId: string, url: string, bounds: HarnessBrowserBounds, browserId = 'browser', visible = true) {
    const stage = this.stage()
    if (!stage) throw new Error('工作区浏览器不可用')
    const key = this.key(sessionId, browserId), existing = this.pages.get(key)
    if (existing) {
      this.cancelPicker(existing)
      existing.requestedUrl = url; existing.error = undefined; existing.errorCode = undefined
      this.setBounds(sessionId, bounds, browserId)
      this.control(sessionId, visible ? 'show' : 'hide', browserId)
      await existing.attached
      if (!this.current(existing)) throw new Error('浏览器资源已关闭')
      await existing.element.loadURL(url)
      if (this.current(existing)) this.state(existing)
      return
    }
    const element = document.createElement('webview') as MiraHostedBrowserElement
    element.setAttribute('partition', 'persist:mira-harness-browser'); element.setAttribute('src', url)
    element.dataset.browserResourceId = browserId; element.dataset.browserSessionId = sessionId
    // Never reparent a live webview: Chromium would replace its guest and lose page/history.
    const container = document.createElement('div'); container.appendChild(element)
    const page: MiraHostedPage = { sessionId, browserId, element, container, loading: false, ready: false, requestedUrl: url, committedUrl: url, favicons: new Map(), detach: () => undefined }
    const listeners: Array<[string, EventListener]> = [
      ['dom-ready', () => {
        if (this.current(page) && this.bind) void this.bind(sessionId, browserId, element.getWebContentsId()).catch(error => { if (this.current(page)) { page.error = error instanceof Error ? error.message : '浏览器控制绑定失败'; this.state(page) } })
      }],
      ['did-start-loading', () => { if (this.current(page)) { this.cancelPicker(page); page.loading = true; page.error = undefined; page.errorCode = undefined; this.state(page) } }],
      ['did-stop-loading', () => { if (this.current(page)) { page.loading = false; this.state(page) } }],
      ['did-navigate', () => { if (!this.current(page)) return; this.cancelPicker(page); const url = element.getURL(); if (url !== page.committedUrl) page.faviconUrl = page.favicons.get(url) ?? null; page.committedUrl = url; this.state(page) }], ['did-navigate-in-page', () => { if (this.current(page)) { this.cancelPicker(page); this.state(page) } }],
      ['page-favicon-updated', event => { if (this.current(page)) {
        page.faviconUrl = miraBrowserFavicon((event as Event & { favicons?: unknown[] }).favicons?.[0]) ?? null
        const url = element.getURL(); page.favicons.delete(url); page.favicons.set(url, page.faviconUrl)
        if (page.favicons.size > 32) page.favicons.delete(page.favicons.keys().next().value!)
        this.state(page)
      } }],
      ['page-title-updated', () => this.state(page)],
      ['media-started-playing', () => { if (this.current(page)) { page.mediaActive = true; this.state(page) } }],
      ['media-paused', () => { if (this.current(page)) { page.mediaActive = false; this.state(page) } }],
      ['did-fail-load', event => { const failure = event as Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean }; if (this.current(page) && failure.isMainFrame !== false && failure.errorCode !== -3) { page.loading = false; page.error = failure.errorDescription || '网页加载失败'; page.errorCode = failure.errorCode; this.state(page) } }],
    ]
    for (const [type, listener] of listeners) element.addEventListener(type, listener)
    page.detach = () => { for (const [type, listener] of listeners) element.removeEventListener(type, listener) }
    this.pages.set(key, page); this.setBounds(sessionId, bounds, browserId)
    this.control(sessionId, visible ? 'show' : 'hide', browserId)
    const attached = page.attached = new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => { clearTimeout(timer); element.removeEventListener('did-attach', ready); page.cancelAttach = undefined; error ? reject(error) : resolve() }
      const ready = () => { page.ready = true; finish() }
      const timer = setTimeout(() => finish(new Error('工作区浏览器未能启动')), 3000)
      page.cancelAttach = () => finish(new Error('浏览器资源已关闭'))
      element.addEventListener('did-attach', ready, { once: true })
    })
    stage.appendChild(container)
    try { await attached } catch (error) { if (this.current(page)) this.control(sessionId, 'close', browserId); throw error }
    this.state(page)
  }
  clear() { for (const pending of this.pending.values()) pending.valid = false; this.pending.clear(); for (const page of [...this.pages.values()]) this.control(page.sessionId, 'close', page.browserId) }
}
