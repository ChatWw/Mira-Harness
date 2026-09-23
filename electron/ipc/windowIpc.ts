import { ipcMain } from 'electron'
import { handleWindowCommand } from '../bootstrap/windowManager'

export function registerWindowIpcHandlers() {
  ipcMain.handle('window:set-titlebar-chrome', () => {})
  ipcMain.handle('window:command', (event, action: string) => handleWindowCommand(event, action))
}
