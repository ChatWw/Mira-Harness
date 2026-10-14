import { app, ipcMain } from 'electron'
import { handleWindowCommand } from '../bootstrap/windowManager'
import { authorizeResources, cancelResourceStorage, clearResourceNetwork, getResourceNetwork, getResourceStorage, revealResourceStorage, getResourceSnapshot, openResourceManager, stopResourceManager } from '../bootstrap/resourceManager'

export function registerWindowIpcHandlers() {
  app.on('before-quit', stopResourceManager)
  ipcMain.handle('window:resource-open', () => openResourceManager())
  for (const [channel, handler] of Object.entries({
    'window:resource-storage': getResourceStorage, 'window:resource-storage-cancel': cancelResourceStorage,
    'window:resource-storage-reveal': revealResourceStorage, 'window:resource-network': getResourceNetwork, 'window:resource-network-clear': clearResourceNetwork,
  })) ipcMain.handle(channel, (event, value: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('资源采样不可用')
    authorizeResources(event.sender.id)
    return handler(event.sender.id, value)
  })
  ipcMain.handle('window:resource-snapshot', event => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('资源采样不可用')
    return getResourceSnapshot(event.sender.id)
  })
  ipcMain.handle('window:set-titlebar-chrome', () => {})
  ipcMain.handle('window:command', (event, action: string) => handleWindowCommand(event, action))
}
