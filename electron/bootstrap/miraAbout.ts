import { app, BrowserWindow, nativeImage } from 'electron'
import { join } from 'node:path'
import { createMiraAboutDialogHtml } from './miraAboutWindow'

let aboutWindow: BrowserWindow | undefined

export async function showMiraAboutDialog(parent?: BrowserWindow | null): Promise<void> {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus()
    return
  }
  const owner = parent && !parent.isDestroyed() ? parent : undefined
  const iconPath = join(__dirname, '../../src/asset/mira-app-icon.png')
  const html = createMiraAboutDialogHtml({
    applicationName: 'Mira Desktop App', appVersion: app.getVersion(),
    credit: 'Powered by Tuyn53', versionLabel: '版本', okButtonLabel: '确定',
    optimizationLine: process.platform === 'darwin' && process.arch === 'arm64' ? '已针对 Apple Silicon 优化。' : '',
    iconDataUrl: nativeImage.createFromPath(iconPath).toDataURL(),
  })
  const window = new BrowserWindow({
    width: 256, height: 312, parent: owner, modal: Boolean(owner),
    frame: false, transparent: true, resizable: false, minimizable: false,
    maximizable: false, fullscreenable: false, show: false, title: '关于 Mira', icon: iconPath,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  aboutWindow = window
  window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.once('closed', () => { if (aboutWindow === window) aboutWindow = undefined })
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show() })
  try { await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`) }
  catch (error) {
    if (aboutWindow === window) aboutWindow = undefined
    if (!window.isDestroyed()) window.destroy()
    throw error
  }
}
