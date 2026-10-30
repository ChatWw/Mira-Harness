import { webContents, type WebContents } from 'electron'
import type { MiraBrowserSize } from '../../src/config/miraBrowserViewport'

interface MiraViewportState { size: MiraBrowserSize | null; queue: Promise<unknown>; applied?: string }
export class MiraBrowserViewports {
  private states = new WeakMap<WebContents, MiraViewportState>()
  async update(owner: WebContents, guestId: number | undefined, size: MiraBrowserSize | null) {
    const guest = guestId === undefined ? undefined : webContents.fromId(guestId)
    if (!guest || guest.isDestroyed() || guest.getType() !== 'webview' || guest.hostWebContents !== owner) throw new Error('浏览器目标不属于当前窗口')
    const zoom = owner.getZoomFactor()
    let state = this.states.get(guest)
    if (!state) {
      state = { size: null, queue: Promise.resolve() }; this.states.set(guest, state)
      const current = state
      const replay = () => { if (current.size && !guest.isDestroyed()) { current.applied = undefined; void this.enqueue(guest, current, current.size, owner.getZoomFactor()).catch(() => undefined) } }
      guest.on('did-finish-load', replay)
      guest.on('devtools-closed', replay)
      guest.once('destroyed', () => { guest.removeListener('did-finish-load', replay); guest.removeListener('devtools-closed', replay); this.states.delete(guest) })
    }
    await this.enqueue(guest, state, size, zoom)
    return { desktopZoomFactor: zoom }
  }
  private enqueue(guest: WebContents, state: MiraViewportState, size: MiraBrowserSize | null, zoom: number) {
    const previous = state.queue
    // Set desired state before joining the queue, so navigation/devtools replay sees the latest mode.
    state.size = size
    const request = previous.catch(() => undefined).then(async () => {
      if (guest.isDestroyed()) throw new Error('浏览器资源已关闭')
      const signature = size ? `${size.width}:${size.height}:${zoom}` : undefined
      if (!size && state.applied === undefined || size && state.applied === signature && guest.debugger.isAttached()) return
      if (!guest.debugger.isAttached()) guest.debugger.attach('1.3')
      await guest.debugger.sendCommand(size ? 'Emulation.setDeviceMetricsOverride' : 'Emulation.clearDeviceMetricsOverride', size ? { ...size, deviceScaleFactor: 1, mobile: false, dontSetVisibleSize: true, ...(zoom > 1 ? { scale: zoom } : {}) } : undefined)
      if (!guest.isDestroyed()) guest.setZoomFactor(1)
      state.applied = signature
    })
    state.queue = request
    return request
  }
}
