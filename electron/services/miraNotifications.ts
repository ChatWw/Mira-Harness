import { Notification, shell, type BrowserWindow } from 'electron'
import type { HarnessEvent, HarnessPendingInteraction, HarnessRunSummary } from '../../src/config/harness'
import { DESKTOP_NOTIFICATIONS_KEY, readDesktopNotifications, type DesktopNotificationStatus } from '../../src/config/desktopNotifications'
import type { PlatformDatabase } from '../storage/database'

/** Observe host events so delivery does not depend on the active renderer or page. */
export class MiraNotifications {
  private readonly active = new Set<Notification>()
  private readonly delivered = new Set<string>()
  private error?: string
  private disposed = false
  constructor(private readonly database: Pick<PlatformDatabase, 'getSnapshot' | 'harness'>, private readonly getWindow: () => BrowserWindow | undefined, private readonly openSession: (sessionId: string) => void, private readonly platform = process.platform) {}

  status(): DesktopNotificationStatus {
    return { supported: Notification.isSupported(), settingsAvailable: this.platform === 'darwin' || this.platform === 'win32', ...(this.error ? { error: this.error } : {}) }
  }

  async openSettings() {
    if (this.platform === 'darwin') await shell.openExternal('x-apple.systempreferences:com.apple.Notifications-Settings.extension')
    else if (this.platform === 'win32') await shell.openExternal('ms-settings:notifications')
    else throw new Error('当前系统不支持直接打开通知设置')
  }

  handle(event: HarnessEvent) {
    if (this.disposed || !['message-complete', 'permission-request', 'interaction-created'].includes(event.type)) return
    try {
      if (!Notification.isSupported()) return
      const settings = readDesktopNotifications(this.database.getSnapshot().preferences[DESKTOP_NOTIFICATIONS_KEY])
      const session = this.database.harness.getSession(event.sessionId)
      let title: string, detail = '', identity: string
      if (event.type === 'permission-request') {
        if (!settings.permissions) return
        title = '需要你的授权'; detail = String(event.payload.title || '')
        identity = `permission:${event.payload.requestId}`
      } else if (event.type === 'interaction-created') {
        const interaction = event.payload.interaction as HarnessPendingInteraction | undefined
        if (!interaction || interaction.status !== 'waiting') return
        if (interaction.kind === 'question') {
          if (!settings.questions) return
          title = '需要你回答问题'; detail = interaction.questions[0]?.question || ''
        } else {
          if (!settings.permissions) return
          title = '需要确认方案'
        }
        identity = `interaction:${interaction.id}`
      } else {
        if ((event.payload.run as HarnessRunSummary | undefined)?.status !== 'completed' || session.pendingInteraction?.status === 'waiting' || settings.completion === 'never') return
        const window = this.getWindow()
        if (settings.completion === 'unfocused' && window && !window.isDestroyed() && window.isVisible() && window.isFocused()) return
        title = '轮次已完成'
        identity = `complete:${event.payload.messageId}`
      }
      const key = `${event.sessionId}:${identity}`
      if (this.delivered.has(key)) return
      this.delivered.add(key)
      if (this.delivered.size > 256) this.delivered.delete(this.delivered.values().next().value!)
      const notification = new Notification({ title: `Mira · ${title}`, body: [session.title, detail].filter(Boolean).join('\n').slice(0, 300), silent: settings.sound === 'silent' })
      this.active.add(notification)
      notification.once('click', () => { this.openSession(event.sessionId); this.active.delete(notification) })
      notification.once('close', () => this.active.delete(notification))
      notification.once('failed', () => { this.error = '通知未能送达，请在系统设置中检查 Mira 的通知权限。'; this.active.delete(notification) })
      notification.once('show', () => { this.error = undefined })
      notification.show()
    } catch {
      // Notification delivery must never interrupt model execution or event publication.
      this.error = '通知未能送达，请在系统设置中检查 Mira 的通知权限。'
    }
  }

  dispose() { this.disposed = true; for (const notification of this.active) notification.close(); this.active.clear() }
}
