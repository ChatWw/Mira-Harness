import { BrowserWindow, ipcMain } from 'electron'
import type { MiraNotifications } from '../services/miraNotifications'

export function registerNotificationIpc(notifications: MiraNotifications) {
  for (const [channel, action] of [
    ['notifications:status', () => notifications.status()],
    ['notifications:settings', () => notifications.openSettings()],
  ] as const) ipcMain.handle(channel, event => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error('通知设置仅可在桌面主窗口中管理')
    return action()
  })
}
