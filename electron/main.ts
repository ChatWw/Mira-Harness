import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { PlatformDatabase } from './database'
import { LocalMicroAppServer } from './localMicroAppServer'
import { createNovelApiHandler } from './novelApi'
import { HarnessRuntime } from './harnessRuntime'
import { McpConfigStore } from './mcpConfigStore'
import { McpManager } from './mcpManager'
import { PythonEnvironment } from './pythonEnv'
import type { NovelProjectDocument, NovelWorkspaceSettings } from '../src/config/novel'
import type { MicroApp } from '../src/types'
import type { HarnessFileReference, HarnessProjectCreateInput, ModelProviderInput } from '../src/config/harness'

let database: PlatformDatabase
let localMicroAppServer: LocalMicroAppServer
let isQuitting = false
let tray: Tray | null = null
let harnessRuntime: HarnessRuntime
let pythonEnvironment: PythonEnvironment
let mcpConfigStore: McpConfigStore
let mcpManager: McpManager

function getCloseWindowBehavior(): 'background' | 'quit' {
  const value = database?.getSnapshot().preferences.closeWindowBehavior
  return value === 'quit' ? 'quit' : 'background'
}

function navigateToAbout(window?: BrowserWindow | null) {
  const target = window ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send('window:navigate', '/settings/about')
}

function showMainWindow() {
  const window = BrowserWindow.getAllWindows()[0]
  if (window) {
    if (!window.isVisible()) window.show()
    window.focus()
  } else {
    createWindow()
  }
}

function setupWindowsTray() {
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
    show: false,
    backgroundColor: '#f7f7f8',
    titleBarStyle: isMac ? 'hiddenInset' : (isWindows ? 'hidden' : 'default'),
    ...(isWindows ? {
      titleBarOverlay: { color: '#fafafa', symbolColor: '#18181b', height: 48 },
    } : {}),
    webPreferences: { preload: join(__dirname, '../preload/preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  window.on('close', event => {
    if (isQuitting || getCloseWindowBehavior() === 'quit') return
    event.preventDefault()
    window.hide()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.once('ready-to-show', () => window.show())
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  database = new PlatformDatabase(app.getPath('userData'))
  mcpConfigStore = new McpConfigStore(app.getPath('userData'))
  mcpManager = new McpManager()
  harnessRuntime = new HarnessRuntime(database, mcpManager)
  await mcpManager.refresh(mcpConfigStore.list())
  pythonEnvironment = new PythonEnvironment()
  localMicroAppServer = new LocalMicroAppServer({
    apiHandlers: new Map([['novel', createNovelApiHandler(database)]]),
  })
  const preferences = database.getSnapshot().preferences
  const preferredPort = typeof preferences.localMicroAppPort === 'number' ? preferences.localMicroAppPort : undefined
  await localMicroAppServer.start(database.getSnapshot().microApps, preferredPort)
  if (localMicroAppServer.port && preferences.localMicroAppPort !== localMicroAppServer.port) {
    database.savePreference('localMicroAppPort', localMicroAppServer.port)
  }
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
  ipcMain.handle('platform:get-novel-api-base-url', () => localMicroAppServer.getApiBaseUrl('novel'))
  ipcMain.handle('harness:list-model-providers', () => database.models.list())
  ipcMain.handle('harness:get-model-config-path', () => database.models.path())
  ipcMain.handle('harness:get-model-provider-api-key', (_event, id: string) => database.models.getSecret(id))
  ipcMain.handle('harness:open-model-config-file', () => shell.openPath(database.models.path()))
  ipcMain.handle('harness:list-model-provider-models', async (_event, provider: ModelProviderInput) => {
    const endpoint = provider.endpoint.trim().replace(/\/+$/, '')
    if (!endpoint) return []
    const url = /\/models$/i.test(endpoint) ? endpoint : `${endpoint}/models`
    const apiKey = provider.apiKey?.trim() || database.models.getSecret(provider.id || '')
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(url, { headers, signal: controller.signal })
      if (!response.ok) return []
      const payload = await response.json() as { data?: Array<{ id?: unknown }> }
      return [...new Set((payload.data || []).map(item => typeof item.id === 'string' ? item.id.trim() : '').filter(Boolean))]
    } catch {
      return []
    } finally {
      clearTimeout(timeout)
    }
  })
  ipcMain.handle('harness:save-model-provider', (_event, provider: ModelProviderInput) => database.models.save(provider))
  ipcMain.handle('harness:delete-model-provider', (_event, id: string) => database.models.delete(id))
  ipcMain.handle('harness:get-model-role-bindings', () => database.models.bindings())
  ipcMain.handle('harness:save-model-role-bindings', (_event, bindings) => database.models.saveBindings(bindings))
  ipcMain.handle('harness:test-model-provider', async (_event, provider: ModelProviderInput, modelId: string) => {
    try {
      const endpoint = provider.endpoint.trim().replace(/\/+$/, '')
      const url = /\/chat\/completions$/i.test(endpoint) ? endpoint : `${endpoint}/chat/completions`
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey || database.models.getSecret(provider.id || '')}` }, body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: '请用一个词回复“已连接”。' }], stream: false }) })
      if (!response.ok) return { ok: false, text: `请求失败：${response.status} ${(await response.text()).slice(0, 240)}` }
      return { ok: true, text: '连接成功' }
    } catch (error) { return { ok: false, text: error instanceof Error ? error.message : String(error) } }
  })
  ipcMain.handle('harness:list-projects', () => database.harness.listProjects())
  ipcMain.handle('harness:open-project-directory', (_event, id: string) => shell.openPath(database.harness.getProject(id).directory))
  ipcMain.handle('harness:select-project-directory', async event => {
    const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const result = owner ? await dialog.showOpenDialog(owner, { properties: ['openDirectory'], title: '选择项目源文件夹' }) : await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择项目源文件夹' })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('harness:create-project', async (event, input: HarnessProjectCreateInput = {}) => {
    let target = input.directory
    if (!target) {
      const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
      const result = owner ? await dialog.showOpenDialog(owner, { properties: ['openDirectory'], title: '选择 Agent 项目目录' }) : await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择 Agent 项目目录' })
      if (result.canceled) return null
      target = result.filePaths[0]
    }
    return database.harness.createProject(target, input.name, input.icon)
  })
  ipcMain.handle('harness:rename-project', (_event, id: string, name: string, icon?: string) => database.harness.renameProject(id, name, icon))
  ipcMain.handle('harness:delete-project', (_event, id: string, removeMira?: boolean) => database.harness.deleteProject(id, removeMira))
  ipcMain.handle('harness:list-git-branches', (_event, projectId: string) => database.harness.listGitBranches(projectId))
  ipcMain.handle('harness:checkout-git-branch', (_event, projectId: string, branchName: string) => database.harness.checkoutGitBranch(projectId, branchName))
  ipcMain.handle('harness:create-and-checkout-git-branch', (_event, projectId: string, branchName: string) => database.harness.createAndCheckoutGitBranch(projectId, branchName))
  ipcMain.handle('harness:list-sessions', (_event, query?: string) => database.harness.listSessions(query))
  ipcMain.handle('harness:create-session', (_event, projectId?: string) => database.harness.createSession(projectId))
  ipcMain.handle('harness:get-session', (_event, id: string) => database.harness.getSession(id))
  ipcMain.handle('harness:set-permission', (_event, id: string, permissionMode) => database.harness.setPermission(id, permissionMode))
  ipcMain.handle('harness:delete-session', (_event, id: string) => database.harness.deleteSession(id))
  ipcMain.handle('harness:delete-sessions', (_event, ids: string[]) => database.harness.deleteSessions(ids))
  ipcMain.handle('harness:list-project-files', (_event, projectId: string, query?: string) => database.harness.listProjectFiles(projectId, query))
  ipcMain.handle('harness:attach-directory', async (event, sessionId: string) => {
    const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const result = owner ? await dialog.showOpenDialog(owner, { properties: ['openDirectory'], title: '选择工作目录' }) : await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择工作目录' })
    return result.canceled ? null : database.harness.attachDirectory(sessionId, result.filePaths[0])
  })
  ipcMain.handle('harness:run-message', (event, sessionId: string, message: string, references: HarnessFileReference[] = [], selection) => harnessRuntime.runMessage(event.sender, sessionId, message, references, selection))
  ipcMain.handle('harness:rerun', (event, sessionId: string, selection) => harnessRuntime.rerun(event.sender, sessionId, selection))
  ipcMain.handle('harness:abort-run', (_event, sessionId: string) => harnessRuntime.abort(sessionId))
  ipcMain.handle('harness:respond-permission', (_event, requestId: string, allowed: boolean) => harnessRuntime.resolvePermission(requestId, Boolean(allowed)))
  ipcMain.handle('mcp:list-servers', () => mcpConfigStore.list())
  ipcMain.handle('mcp:save-server', (_event, config) => {
    const saved = mcpConfigStore.save(config)
    void mcpManager.refresh(mcpConfigStore.list())
    return saved
  })
  ipcMain.handle('mcp:delete-server', (_event, id: string) => {
    mcpConfigStore.delete(id)
    void mcpManager.refresh(mcpConfigStore.list())
  })
  ipcMain.handle('harness:get-permission-config', () => database.harness.getPermissionConfig())
  ipcMain.handle('harness:save-permission-config', (_event, config) => database.harness.savePermissionConfig(config))
  ipcMain.handle('harness:get-git-config', () => database.harness.getGitConfig())
  ipcMain.handle('harness:save-git-config', (_event, config) => database.harness.saveGitConfig(config))
  ipcMain.handle('harness:list-trash', (_event, projectId: string) => database.harness.listTrash(projectId))
  ipcMain.handle('harness:restore-trash', (_event, projectId: string, token: string) => database.harness.restoreTrash(projectId, token))
  ipcMain.handle('harness:python-status', () => pythonEnvironment.status())
  ipcMain.handle('harness:python-exec', (_event, script: string, args: string[]) => pythonEnvironment.run(script, args))
  ipcMain.handle('harness:python-install-package', (_event, packageName: string) => pythonEnvironment.install(packageName))
  ipcMain.handle('platform:list-novel-projects', () => database.novels.listProjects())
  ipcMain.handle('platform:get-novel-project', (_event, id: string) => database.novels.getProject(id))
  ipcMain.handle('platform:create-novel-project', (_event, title?: string) => database.novels.createProject(title))
  ipcMain.handle('platform:save-novel-project', (_event, project: NovelProjectDocument) => database.novels.saveProject(project))
  ipcMain.handle('platform:delete-novel-project', (_event, id: string) => database.novels.deleteProject(id))
  ipcMain.handle('platform:export-novel-project', (_event, id: string) => database.novels.exportProject(id))
  ipcMain.handle('platform:import-novel-project', (_event, raw: string) => database.novels.importProject(raw))
  ipcMain.handle('platform:get-novel-workspace-settings', () => database.novels.getSettings())
  ipcMain.handle('platform:save-novel-workspace-settings', (_event, settings: NovelWorkspaceSettings) => database.novels.saveSettings(settings))
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
      case 'quit': app.quit(); break
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
  setupWindowsTray()
  app.on('activate', showMainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || getCloseWindowBehavior() === 'quit') app.quit()
})
app.on('before-quit', () => {
  isQuitting = true
  tray?.destroy()
  tray = null
  void localMicroAppServer?.stop()
})
