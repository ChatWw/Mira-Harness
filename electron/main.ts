import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { PlatformDatabase } from './database'
import { LocalMicroAppServer } from './localMicroAppServer'
import type { MicroApp } from '../src/types'

let database: PlatformDatabase
let localMicroAppServer: LocalMicroAppServer

function navigateToAbout(window?: BrowserWindow | null) {
  const target = window ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send('window:navigate', '/settings/about')
}

function setupApplicationMenu() {
  const viewMenu: MenuItemConstructorOptions[] = [
    { label: '切换全屏', role: 'togglefullscreen' },
  ]
  if (!app.isPackaged) {
    viewMenu.unshift(
      { label: '重新加载', role: 'reload' },
      { label: '开发者工具', role: 'toggleDevTools' },
      { type: 'separator' },
    )
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Mira',
      submenu: [
        { label: '关于 Mira', click: (_item, window) => navigateToAbout(window) },
        { type: 'separator' },
        { label: '隐藏 Mira', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出 Mira', role: 'quit' },
      ],
    },
    { label: '编辑', submenu: [
      { label: '撤销', role: 'undo' },
      { label: '重做', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', role: 'cut' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' },
    ] },
    { label: '视图', submenu: viewMenu },
    { label: '窗口', submenu: [
      { label: '最小化', role: 'minimize' },
      { label: '缩放', role: 'zoom' },
      { label: '关闭窗口', role: 'close' },
    ] },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680,
    titleBarStyle: isMac ? 'hiddenInset' : (isWindows ? 'hidden' : 'default'),
    ...(isWindows ? {
      titleBarOverlay: { color: '#fafafa', symbolColor: '#18181b', height: 48 },
    } : {}),
    webPreferences: { preload: join(__dirname, '../preload/preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  database = new PlatformDatabase(app.getPath('userData'))
  localMicroAppServer = new LocalMicroAppServer()
  await localMicroAppServer.start(database.getSnapshot().microApps)
  ipcMain.handle('platform:get-snapshot', () => database.getSnapshot())
  ipcMain.handle('platform:save-preference', (_event, key: string, value: unknown) => database.savePreference(key, value))
  ipcMain.handle('platform:update-menus', (_event, menus) => database.saveMenus(menus))
  ipcMain.handle('platform:update-microapps', (_event, apps: MicroApp[]) => {
    localMicroAppServer.validateApps(apps)
    const snapshot = database.saveMicroApps(apps)
    localMicroAppServer.setApps(snapshot.microApps)
    return snapshot
  })
  ipcMain.handle('platform:select-microapp-directory', async windowEvent => {
    const options = {
      properties: ['openDirectory'],
      title: '选择微应用构建目录',
    } as const
    const owner = BrowserWindow.fromWebContents(windowEvent.sender) || BrowserWindow.getFocusedWindow()
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return null
    return localMicroAppServer.validateDirectory(result.filePaths[0])
  })
  ipcMain.handle('platform:resolve-local-microapp-url', (_event, appId: string) => localMicroAppServer.getEntryUrl(appId))
  ipcMain.handle('platform:export-snapshot', () => database.exportSnapshot())
  ipcMain.handle('platform:import-snapshot', (_event, snapshot: string) => {
    const next = database.importSnapshot(snapshot)
    localMicroAppServer.setApps(next.microApps)
    return next
  })
  ipcMain.handle('platform:restore-defaults', () => {
    const next = database.restoreDefaults()
    localMicroAppServer.setApps(next.microApps)
    return next
  })
  ipcMain.handle('window:set-titlebar-chrome', (event, chrome: { color: string; symbolColor: string; height?: number }) => {
    if (process.platform !== 'win32') return
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0]
    win?.setTitleBarOverlay({ color: chrome.color, symbolColor: chrome.symbolColor, height: chrome.height })
  })
  ipcMain.handle('window:command', (event, action: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0]
    if (!win) return
    switch (action) {
      case 'about': navigateToAbout(win); break
      case 'quit': win.close(); break
      case 'undo': win.webContents.undo(); break
      case 'redo': win.webContents.redo(); break
      case 'cut': win.webContents.cut(); break
      case 'copy': win.webContents.copy(); break
      case 'paste': win.webContents.paste(); break
      case 'selectAll': win.webContents.selectAll(); break
      case 'reload': win.webContents.reload(); break
      case 'toggleDevTools': win.webContents.toggleDevTools(); break
      case 'toggleFullscreen': win.setFullScreen(!win.isFullScreen()); break
      case 'minimize': win.minimize(); break
      case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break
      case 'close': win.close(); break
    }
  })
  setupApplicationMenu()
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { void localMicroAppServer?.stop() })
