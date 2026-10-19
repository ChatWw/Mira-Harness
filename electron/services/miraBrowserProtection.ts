import { miraBrowserAutomation } from './miraBrowserAutomation'
/** Runtime protection adapted from ZCode browserGuestManager (Apache-2.0).
 * Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode.
 * Only a scoped boolean crosses the existing first-party grant. */
import { session, webContents, type WebContents } from 'electron'

export class MiraBrowserProtection {
  private downloads = new WeakMap<WebContents, number>()
  private started = false
  start() {
    if (this.started) return
    this.started = true
    session.fromPartition('persist:mira-harness-browser').on('will-download', (_event, item, guest) => {
      if (!guest || guest.isDestroyed()) return
      this.downloads.set(guest, (this.downloads.get(guest) ?? 0) + 1)
      item.once('done', () => { this.downloads.set(guest, Math.max(0, (this.downloads.get(guest) ?? 1) - 1)) })
    })
  }
  read(owner: WebContents, guestId?: number) {
    if (guestId === undefined) return { protected: false }
    const guest = webContents.fromId(guestId)
    if (!guest || guest.isDestroyed() || guest.getType() !== 'webview' || guest.hostWebContents !== owner) throw new Error('浏览器目标不属于当前窗口')
    return { protected: miraBrowserAutomation.isBusy(guest) || guest.isLoading() || guest.isCurrentlyAudible() || guest.isBeingCaptured() || (this.downloads.get(guest) ?? 0) > 0 }
  }
}
