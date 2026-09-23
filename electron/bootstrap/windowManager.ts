import { app, BrowserWindow, Menu, nativeImage, shell, Tray, type IpcMainEvent, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { shouldBlockReloadShortcut } from '../windowShortcuts'
import { isTrustedShellNavigation } from '../security/shellNavigation'
import { shouldAuthorizeLegacyNovelApiRequest } from '../security/legacyNovelApiAuth'

export interface WindowManagerOptions {
  getCloseWindowBehavior: () => 'background' | 'quit'
  isQuitting: () => boolean
  legacyNovelApi: { baseUrl: string; token: string }
}

let tray: Tray | null = null
let windowManagerOptions: WindowManagerOptions | undefined

export function navigateToAbout(window?: BrowserWindow | null) {
  const target = window ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send('window:navigate', '/settings/about')
}

export function showMainWindow() {
  const window = BrowserWindow.getAllWindows()[0]
  if (window) {
    if (!window.isVisible()) window.show()
    window.focus()
  } else {
    if (windowManagerOptions) createMainWindow(windowManagerOptions)
  }
}

export function setupWindowsTray() {
  if (process.platform !== 'win32') return
  const trayIcon = nativeImage.createFromPath(join(__dirname, '../../src/asset/mira.ico'))
  if (trayIcon.isEmpty()) return
  tray = new Tray(trayIcon)
  tray.setToolTip('Mira')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 Mira', click: () => showMainWindow() },
    { type: 'separator' },
    { label: '退出 Mira', click: () => app.quit() },
  ]))
  tray.on('click', () => showMainWindow())
}

export function setupDevelopmentDockIcon() {
  if (process.platform !== 'darwin' || app.isPackaged) return
  app.dock.setIcon(join(__dirname, '../../src/asset/mira-app-icon.png'))
}

export function setupApplicationMenu() {
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
        { label: '关于 Mira', click: (_item, window) => navigateToAbout(window as BrowserWindow | undefined) },
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

export function createMainWindow(options: WindowManagerOptions) {
  windowManagerOptions = options
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680,
    show: false,
    backgroundColor: '#f7f7f8',
    frame: !isWindows,
    titleBarStyle: isMac ? 'hiddenInset' : (isWindows ? 'hidden' : 'default'),
    ...(isMac ? { trafficLightPosition: { x: 24, y: 12 } } : {}),
    webPreferences: { preload: join(__dirname, '../preload/preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  window.on('close', event => {
    if (options.isQuitting() || options.getCloseWindowBehavior() === 'quit') return
    event.preventDefault()
    window.hide()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const rendererPath = join(__dirname, '../renderer/index.html')
  const shellUrl = process.env.ELECTRON_RENDERER_URL || pathToFileURL(rendererPath).href
  const legacyNovelApi = options.legacyNovelApi
  window.webContents.session.webRequest.onBeforeSendHeaders({ urls: [`${legacyNovelApi.baseUrl}*`] }, (details, callback) => {
    if (shouldAuthorizeLegacyNovelApiRequest(details, window.webContents.id, window.webContents.mainFrame, shellUrl)) {
      details.requestHeaders.Authorization = `Bearer ${legacyNovelApi.token}`
    }
    callback({ requestHeaders: details.requestHeaders })
  })
  window.webContents.on('will-navigate', event => {
    if (!isTrustedShellNavigation(event.url, shellUrl)) event.preventDefault()
  })
  window.webContents.on('before-input-event', (event, input) => {
    if (shouldBlockReloadShortcut(input, app.isPackaged)) event.preventDefault()
  })
  window.once('ready-to-show', () => window.show())
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(rendererPath)
  return window
}

export function handleWindowCommand(event: IpcMainEvent, action: string) {
  const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0]
  if (!window) return
  switch (action) {
    case 'about': navigateToAbout(window); break
    case 'quit': app.quit(); break
    case 'undo': window.webContents.undo(); break
    case 'redo': window.webContents.redo(); break
    case 'cut': window.webContents.cut(); break
    case 'copy': window.webContents.copy(); break
    case 'paste': window.webContents.paste(); break
    case 'selectAll': window.webContents.selectAll(); break
    case 'reload': if (!app.isPackaged) window.webContents.reload(); break
    case 'toggleDevTools': window.webContents.toggleDevTools(); break
    case 'toggleFullscreen': window.setFullScreen(!window.isFullScreen()); break
    case 'minimize': window.minimize(); break
    case 'maximize': window.isMaximized() ? window.unmaximize() : window.maximize(); break
    case 'close': window.close(); break
  }
}

export function destroyTray() {
  tray?.destroy()
  tray = null
}
