import { showMiraAboutDialog } from './miraAbout'
import { setupMiraTextContextMenu } from './miraTextContextMenu'
import { app, BrowserWindow, Menu, nativeImage, screen, shell, Tray, type IpcMainEvent, type MenuItemConstructorOptions } from 'electron'
import { isResourceManagerWindow, openResourceManager } from './resourceManager'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { shouldBlockReloadShortcut } from '../windowShortcuts'
import { isTrustedShellNavigation } from '../security/shellNavigation'
import { shouldAuthorizeLegacyNovelApiRequest } from '../security/legacyNovelApiAuth'
import { HOSTED_BROWSER_PARTITION, isAllowedHostedBrowserUrl } from '../security/hostedBrowser'
import { alignMiraTrafficLights, applyMiraZoom, miraTrafficLightPosition, miraZoomLevel } from './miraDesktopZoom'

export interface MainWindowState { bounds: { x: number; y: number; width: number; height: number }; maximized: boolean; fullScreen: boolean }

export interface WindowManagerOptions {
  getStartupWindowBehavior?: () => unknown
  getMainWindowState?: () => MainWindowState | undefined
  saveMainWindowState?: (state: MainWindowState) => void
  getCloseWindowBehavior: () => 'background' | 'quit'
  isQuitting: () => boolean
  legacyNovelApi: { baseUrl: string; token: string }
  getDesktopZoomLevel?: () => unknown
  saveDesktopZoomLevel?: (level: number) => void
}

let tray: Tray | null = null
let windowManagerOptions: WindowManagerOptions | undefined

export function navigateToAbout(window?: BrowserWindow | null) {
  const target = window ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send('window:navigate', '/settings/about')
}

export function showMainWindow() {
  if (windowManagerOptions?.isQuitting()) return
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
  const zoom = (action: 'in' | 'out' | 'reset', window?: BrowserWindow | null) => applyMiraZoom(window ?? BrowserWindow.getFocusedWindow(), action, windowManagerOptions?.saveDesktopZoomLevel)
  const viewMenu: MenuItemConstructorOptions[] = [
    { label: '切换全屏', role: 'togglefullscreen' },
    { type: 'separator' },
    { id: 'mira-zoom-in', label: '放大界面', accelerator: 'CmdOrCtrl+Plus', click: (_item, window) => zoom('in', window as BrowserWindow | undefined) },
    { id: 'mira-zoom-in-equal', label: '放大界面', accelerator: 'CmdOrCtrl+=', visible: false, click: (_item, window) => zoom('in', window as BrowserWindow | undefined) },
    { id: 'mira-zoom-out', label: '缩小界面', accelerator: 'CmdOrCtrl+-', click: (_item, window) => zoom('out', window as BrowserWindow | undefined) },
    { id: 'mira-zoom-reset', label: '恢复默认大小', accelerator: 'CmdOrCtrl+0', click: (_item, window) => zoom('reset', window as BrowserWindow | undefined) },
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
        { label: '关于 Mira', click: (_item, window) => { void showMiraAboutDialog((window as BrowserWindow | undefined) ?? BrowserWindow.getFocusedWindow()).catch(console.error) } },
        { label: '关于设置页', visible: false, accelerator: 'CmdOrCtrl+I', click: (_item, window) => navigateToAbout(window as BrowserWindow | undefined) },
        { label: '设置', accelerator: 'CmdOrCtrl+,', click: (_item, window) => {
          const target = (window as BrowserWindow | undefined) ?? BrowserWindow.getFocusedWindow()
          target?.webContents.send('window:navigate', '/settings/general')
        } },
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
    { label: '帮助', submenu: [{ id: 'mira-resource-manager', label: '资源管理器', click: () => openResourceManager() }] },
    { label: '窗口', submenu: [
      { label: '最小化', role: 'minimize' },
      { label: '缩放', role: 'zoom' },
      { label: '关闭标签或窗口', accelerator: 'CmdOrCtrl+W', click: (_item, window) => {
        const target = (window as BrowserWindow | undefined) ?? BrowserWindow.getFocusedWindow()
        if (target && isResourceManagerWindow(target)) target.close()
        else target?.webContents.send('window:close-context')
      } },
    ] },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function createMainWindow(options: WindowManagerOptions) {
  windowManagerOptions = options
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  const saved = options.getStartupWindowBehavior?.() === 'restore' ? options.getMainWindowState?.() : undefined
  const bounds = saved?.bounds
  const validBounds = bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width >= 1024 && bounds.height >= 680
  const restoredBounds = validBounds ? (() => {
    const area = screen.getDisplayMatching(bounds).workArea
    const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height)
    return { width, height, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)) }
  })() : {}
  const window = new BrowserWindow({
    width: 1440, height: 900, ...restoredBounds, minWidth: 1024, minHeight: 680,
    show: false,
    backgroundColor: '#f7f7f8',
    frame: !isWindows,
    titleBarStyle: isMac ? 'hiddenInset' : (isWindows ? 'hidden' : 'default'),
    ...(isMac ? { trafficLightPosition: miraTrafficLightPosition(1.1 ** miraZoomLevel(options.getDesktopZoomLevel?.())) } : {}),
    webPreferences: { preload: join(__dirname, '../preload/preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, webviewTag: true, zoomFactor: 1.1 ** miraZoomLevel(options.getDesktopZoomLevel?.()) },
  })
  setupMiraTextContextMenu(window)
  window.on('close', event => {
    if (options.saveMainWindowState) options.saveMainWindowState({ bounds: window.getNormalBounds(), maximized: window.isMaximized(), fullScreen: window.isFullScreen() })
    if (options.isQuitting() || options.getCloseWindowBehavior() === 'quit') return
    event.preventDefault()
    window.hide()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-attach-webview', (event, preferences, params) => {
    if (params.partition !== HOSTED_BROWSER_PARTITION || !isAllowedHostedBrowserUrl(params.src)) {
      event.preventDefault()
      return
    }
    delete preferences.preload
    preferences.nodeIntegration = false
    preferences.contextIsolation = true
    preferences.sandbox = true
    preferences.webSecurity = true
  })
  window.webContents.on('did-attach-webview', (_event, guest) => {
    guest.setWindowOpenHandler(() => ({ action: 'deny' }))
    guest.on('will-navigate', event => { if (!isAllowedHostedBrowserUrl(event.url)) event.preventDefault() })
    guest.on('will-redirect', event => { if (!isAllowedHostedBrowserUrl(event.url)) event.preventDefault() })
    guest.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
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
  window.webContents.on('did-finish-load', () => {
    // Chromium can replay the creation/origin zoom on reload; use the latest preference.
    const factor = 1.1 ** miraZoomLevel(options.getDesktopZoomLevel?.())
    window.webContents.setZoomFactor(factor)
    alignMiraTrafficLights(window, factor)
    window.webContents.send('window:zoom-changed', factor)
  })
  window.once('ready-to-show', () => {
    if (options.getStartupWindowBehavior?.() !== 'restore' || !saved || saved.maximized) window.maximize()
    if (saved?.fullScreen) window.setFullScreen(true)
    window.show()
  })
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(rendererPath)
  return window
}

export function handleWindowCommand(event: IpcMainEvent, action: string) {
  const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0]
  if (!window) return
  switch (action) {
    case 'resources': openResourceManager(); break
    case 'about': return showMiraAboutDialog(window)
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
    case 'zoomIn': applyMiraZoom(window, 'in', windowManagerOptions?.saveDesktopZoomLevel); break
    case 'zoomOut': applyMiraZoom(window, 'out', windowManagerOptions?.saveDesktopZoomLevel); break
    case 'resetZoom': applyMiraZoom(window, 'reset', windowManagerOptions?.saveDesktopZoomLevel); break
    case 'minimize': window.minimize(); break
    case 'maximize': window.isMaximized() ? window.unmaximize() : window.maximize(); break
    case 'close': window.close(); break
  }
}

export function destroyTray() {
  tray?.destroy()
  tray = null
}
