import { ipcRenderer } from 'electron'

export const notificationApi = {
  getNotificationStatus: () => ipcRenderer.invoke('notifications:status'),
  openNotificationSettings: () => ipcRenderer.invoke('notifications:settings'),
  onNotificationSession: (listener: (sessionId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string) => listener(sessionId)
    ipcRenderer.on('notifications:open-session', handler)
    return () => ipcRenderer.removeListener('notifications:open-session', handler)
  },
}
