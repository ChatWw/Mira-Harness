import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { PlatformDatabase } from './database'

let database: PlatformDatabase

function createWindow() {
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680,
    webPreferences: { preload: join(__dirname, '../preload/preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  database = new PlatformDatabase(app.getPath('userData'))
  ipcMain.handle('platform:get-snapshot', () => database.getSnapshot())
  ipcMain.handle('platform:save-preference', (_event, key: string, value: unknown) => database.savePreference(key, value))
  ipcMain.handle('platform:update-menus', (_event, menus) => database.saveMenus(menus))
  ipcMain.handle('platform:update-microapps', (_event, apps) => database.saveMicroApps(apps))
  ipcMain.handle('platform:export-snapshot', () => database.exportSnapshot())
  ipcMain.handle('platform:import-snapshot', (_event, snapshot: string) => database.importSnapshot(snapshot))
  ipcMain.handle('platform:restore-defaults', () => database.restoreDefaults())
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
