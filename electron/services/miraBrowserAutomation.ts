import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'

interface Page { owner: WebContents; sessionId: string; browserId: string; guest: WebContents; queue: Promise<unknown> }

// Serialized into an isolated world. Only fixed operations are accepted; no caller-supplied JS.
function pageOperation(action: string, reference?: string, text?: string, snapshotToken?: string, deltaY?: number) {
  const root = globalThis as typeof globalThis & { __miraBrowser?: { token: string; nodes: Element[]; observer: MutationObserver } }
  if (action === 'scroll') { window.scrollBy({ top: deltaY, behavior: 'instant' }); return { x: window.scrollX, y: window.scrollY } }
  if (action === 'snapshot') {
    const nodes = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),textarea,select,[role],[contenteditable=true]')]
      .filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden' }).slice(0, 500)
    const token = snapshotToken!
    root.__miraBrowser?.observer.disconnect()
    const observer = new MutationObserver(() => { observer.disconnect(); root.__miraBrowser = undefined })
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true })
    root.__miraBrowser = { token, nodes, observer }
    return { url: location.href, title: document.title, text: document.body?.innerText.slice(0, 20000) || '', elements: nodes.map((node, index) => ({
      ref: `${token}:${index}`, tag: node.tagName.toLowerCase(), role: node.getAttribute('role'),
      name: node.getAttribute('aria-label') || (node as HTMLInputElement).labels?.[0]?.textContent?.trim() || node.textContent?.trim().slice(0, 200) || node.getAttribute('placeholder') || '',
      type: node.getAttribute('type'), disabled: node.matches(':disabled,[aria-disabled=true]'),
    })), iframeCount: document.querySelectorAll('iframe').length, note: 'References cover the main document only; obtain a fresh snapshot after navigation or page changes.' }
  }
  const state = root.__miraBrowser
  const [token, index] = (reference || '').split(':')
  const node = state?.token === token && /^\d+$/.test(index || '') ? state.nodes[Number(index)] : undefined
  if (!node?.isConnected) throw new Error('元素引用已失效，请重新获取页面快照')
  if (node.matches(':disabled,[aria-disabled=true]')) throw new Error('元素不可用')
  node.scrollIntoView({ block: 'center', inline: 'center' })
  const rect = node.getBoundingClientRect()
  if (!rect.width || !rect.height || getComputedStyle(node).visibility === 'hidden') throw new Error('元素不可见')
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
  const hit = document.elementFromPoint(x, y)
  if (!hit || hit !== node && !node.contains(hit)) throw new Error('元素被遮挡，请重新获取页面快照')
  if (action === 'fill') {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) || node.readOnly || node instanceof HTMLInputElement && !['text', 'search', 'email', 'url', 'tel', 'password', ''].includes(node.type)) throw new Error('该元素不是可填写的文本框')
    node.focus()
    const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, text)
    node.dispatchEvent(new Event('input', { bubbles: true }))
    node.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return { x, y }
}

export class MiraBrowserAutomation {
  private pages = new Map<string, Page>()
  private guests = new WeakMap<WebContents, Page>()
  private operations = new WeakMap<WebContents, number>()
  isBusy(guest: WebContents) { return (this.operations.get(guest) || 0) > 0 }
  private waiting = new Map<string, { owner: WebContents; resolve: (page: Page) => void }>()
  private key(sessionId: string, browserId: string) { return JSON.stringify([sessionId, browserId]) }
  bind(owner: WebContents, sessionId: string, browserId: string, guest: WebContents) {
    if (guest.isDestroyed() || guest.getType() !== 'webview' || guest.hostWebContents !== owner) throw new Error('浏览器目标不属于当前窗口')
    const key = this.key(sessionId, browserId), previous = this.pages.get(key), binding = this.guests.get(guest)
    if (binding && this.pages.get(this.key(binding.sessionId, binding.browserId)) === binding && (binding.sessionId !== sessionId || binding.browserId !== browserId)) throw new Error('浏览器已绑定其他任务或标签页')
    if (previous && previous.owner !== owner) throw new Error('浏览器目标不属于当前窗口')
    if (previous?.guest === guest) return
    const page: Page = { owner, sessionId, browserId, guest, queue: Promise.resolve() }
    this.pages.set(key, page)
    this.guests.set(guest, page)
    guest.once('destroyed', () => { if (this.pages.get(key) === page) this.pages.delete(key) })
    const pending = this.waiting.get(key)
    if (pending?.owner === owner) pending.resolve(page)
  }
  private assert(page: Page, signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (page.owner.isDestroyed() || page.guest.isDestroyed() || this.pages.get(this.key(page.sessionId, page.browserId)) !== page) throw new Error('浏览器资源已关闭或已替换')
  }
  async execute(owner: WebContents, sessionId: string, method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
    signal?.throwIfAborted()
    if (owner.isDestroyed()) throw new Error('浏览器窗口已关闭')
    if (method === 'browser_list') return [...this.pages.values()].filter(page => page.owner === owner && page.sessionId === sessionId && !page.guest.isDestroyed()).map(page => ({ browserId: page.browserId, url: page.guest.getURL(), title: page.guest.getTitle() }))
    if (method === 'browser_open') {
      const url = this.url(params.url), browserId = `browser:${randomUUID()}`, key = this.key(sessionId, browserId)
      let timer: ReturnType<typeof setTimeout> | undefined
      let abort: (() => void) | undefined
      let page: Page
      try {
        page = await new Promise<Page>((resolve, reject) => {
          abort = () => reject(signal?.reason || new Error('浏览器请求已取消'))
          timer = setTimeout(() => reject(new Error('内置浏览器未就绪，请切回当前任务后重试')), 15000)
          this.waiting.set(key, { owner, resolve })
          signal?.addEventListener('abort', abort, { once: true })
          owner.send('harness:event', { sessionId, type: 'browser-open', payload: { browserId, url } })
        })
      } finally {
        clearTimeout(timer)
        if (abort) signal?.removeEventListener('abort', abort)
        this.waiting.delete(key)
      }
      this.assert(page, signal)
      return { browserId, url }
    }
    if (typeof params.browserId !== 'string') throw new Error('缺少 browserId；请先打开网页或列出当前任务标签页')
    const page = this.pages.get(this.key(sessionId, params.browserId))
    if (!page || page.owner !== owner) throw new Error('浏览器标签页不属于当前任务或已关闭')
    const run = page.queue.catch(() => undefined).then(async () => {
      this.assert(page, signal)
      if (page.guest.isLoadingMainFrame()) {
        await new Promise<void>((resolve, reject) => {
          const done = () => { cleanup(); resolve() }
          const closed = () => { cleanup(); reject(new Error('浏览器资源已关闭')) }
          const abort = () => { cleanup(); reject(signal?.reason) }
          const timer = setTimeout(() => { cleanup(); reject(new Error('网页加载超时，请重新读取页面')) }, 15000)
          const cleanup = () => { clearTimeout(timer); page.guest.removeListener('did-stop-loading', done); page.guest.removeListener('destroyed', closed); signal?.removeEventListener('abort', abort) }
          page.guest.once('did-stop-loading', done)
          page.guest.once('destroyed', closed)
          signal?.addEventListener('abort', abort, { once: true })
        })
        this.assert(page, signal)
      }
      if (method === 'browser_navigate') { await page.guest.loadURL(this.url(params.url)); this.assert(page, signal); return { url: page.guest.getURL() } }
      if (method === 'browser_screenshot') { const image = await page.guest.capturePage(); this.assert(page, signal); return { image: image.toPNG().toString('base64') } }
      if (!page.guest.debugger.isAttached()) page.guest.debugger.attach('1.3')
      const cdp = async (method: string, args?: Record<string, unknown>) => { this.assert(page, signal); const value = await page.guest.debugger.sendCommand(method, args); this.assert(page, signal); return value }
      const action = method === 'browser_snapshot' ? 'snapshot' : method === 'browser_click' ? 'click' : method === 'browser_fill' ? 'fill' : method === 'browser_scroll' ? 'scroll' : undefined
      if (!action) throw new Error('不支持的浏览器操作')
      if (action !== 'snapshot' && action !== 'scroll' && typeof params.ref !== 'string') throw new Error('缺少元素引用')
      if (action === 'scroll' && (typeof params.deltaY !== 'number' || !Number.isFinite(params.deltaY) || Math.abs(params.deltaY) > 10000)) throw new Error('滚动距离无效')
      if (action === 'fill' && typeof params.text !== 'string') throw new Error('填写内容必须是字符串')
      const tree = await cdp('Page.getFrameTree')
      const world = await cdp('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: 'mira-browser-automation' })
      const result = await cdp('Runtime.evaluate', { expression: `(${pageOperation.toString()})(${JSON.stringify(action)},${JSON.stringify(params.ref) ?? 'undefined'},${JSON.stringify(params.text) ?? 'undefined'},${JSON.stringify(randomUUID())},${JSON.stringify(params.deltaY) ?? 'undefined'})`, contextId: world.executionContextId, returnByValue: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
      if (action === 'snapshot' || action === 'scroll') return result.result.value
      if (action === 'click') {
        const { x, y } = result.result.value
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
        await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
      }
      return { ok: true, advice: 'Read a fresh snapshot to verify the result.' }
    })
    this.operations.set(page.guest, (this.operations.get(page.guest) || 0) + 1)
    const tracked = run.finally(() => this.operations.set(page.guest, Math.max(0, (this.operations.get(page.guest) || 0) - 1)))
    page.queue = tracked
    return tracked
  }
  private url(value: unknown) { const url = new URL(String(value)); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('仅支持不含账号密码的 HTTP(S) 网页'); return url.href }
}

export const miraBrowserAutomation = new MiraBrowserAutomation()
