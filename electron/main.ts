import { app, BrowserWindow, powerSaveBlocker, ipcMain, webContents } from 'electron'
import { join, resolve } from 'node:path'
import { createPlatformServices, type PlatformServices } from './services/platformServices'
import { registerPlatformIpcHandlers } from './ipc/platformIpc'
import { registerWindowIpcHandlers } from './ipc/windowIpc'
import { registerNovelIpcHandlers } from './ipc/novelIpc'
import { registerAutomationIpcHandlers } from './ipc/automationIpc'
import { registerMcpIpcHandlers } from './ipc/mcpIpc'
import { registerModelIpcHandlers } from './ipc/modelIpc'
import { registerHarnessProjectIpcHandlers } from './ipc/harnessProjectIpc'
import { registerHarnessSessionIpcHandlers } from './ipc/harnessSessionIpc'
import { registerHarnessWorkspaceIgnoreIpcHandlers } from './ipc/harnessWorkspaceIgnoreIpc'
import { registerMiraFlowIpc } from './ipc/miraFlowIpc'
import { MiraPaths } from './storage/miraPaths'
import { createMainWindow, destroyTray, setupApplicationMenu, setupDevelopmentDockIcon, setupWindowsTray, showMainWindow } from './bootstrap/windowManager'
import { type HarnessEvent } from '../src/config/harness'
import { HarnessTerminalSessions } from './services/harnessTerminalSessions'
import { HarnessWorkspaceWatch } from './services/harnessWorkspaceWatch'
import { MiraLanRemote } from './services/miraLanRemote'
import { createRemoteHarness } from './services/miraRemoteHarness'

import { miraBrowserAutomation } from './services/miraBrowserAutomation'
import { applyHardwareAcceleration } from './bootstrap/hardwareAcceleration'
import { AutomationKeepAwake } from './services/automationKeepAwake'
import { MiraNotifications } from './services/miraNotifications'
import { registerNotificationIpc } from './ipc/notificationIpc'
import { isResourceManagerWindow } from './bootstrap/resourceManager'

const keepAwake = new AutomationKeepAwake(powerSaveBlocker)
let keepAwakeTimer: ReturnType<typeof setInterval> | undefined
let isQuitting = false
let services: PlatformServices | undefined
let lanRemote: MiraLanRemote | undefined
let shutdown: Promise<void> | undefined
let shutdownComplete = false
let notifications: MiraNotifications | undefined
const terminalSessions = new HarnessTerminalSessions()
const workspaceWatch = new HarnessWorkspaceWatch()
const testHome = !app.isPackaged && process.env.MIRA_TEST_HOME ? resolve(process.env.MIRA_TEST_HOME) : undefined
const legacyUserDataPath = testHome ? join(testHome, 'legacy-user-data') : app.getPath('userData')
const miraPaths = new MiraPaths(testHome ?? app.getPath('home')).ensure()

// Keep Mira's data portable and inspectable under the user's home directory on every desktop OS.
app.setPath('userData', miraPaths.root)
applyHardwareAcceleration(app, miraPaths.stateDatabase())

function getCloseWindowBehavior(): 'background' | 'quit' {
  const value = services?.database.getSnapshot().preferences.closeWindowBehavior
  return value === 'quit' ? 'quit' : 'background'
}

function publishHarnessEvent(event: HarnessEvent) {
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) window.webContents.send('harness:event', event)
  })
}

app.whenReady().then(async () => {
  setupDevelopmentDockIcon()
  services = await createPlatformServices({ miraPaths, legacyUserDataPath, publishHarnessEvent })
  notifications = new MiraNotifications(services.database, () => BrowserWindow.getAllWindows().find(window => !isResourceManagerWindow(window)), sessionId => {
    showMainWindow()
    const window = BrowserWindow.getAllWindows().find(window => !isResourceManagerWindow(window))
    if (!window) return
    if (window.isMinimized()) window.restore()
    const navigate = () => window.webContents.send('notifications:open-session', sessionId)
    if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', navigate)
    else navigate()
  })
  services.harnessRuntime.onPublicEvent(event => notifications?.handle(event))
  registerNotificationIpc(notifications)
  if (process.platform === 'win32') app.setAppUserModelId('com.wujinbo.mira')
  let remoteOwner: import('electron').WebContents | undefined
  const remoteHarness = createRemoteHarness(services.database, services.harnessRuntime, () => {
    if (!remoteOwner || remoteOwner.isDestroyed()) throw new Error('电脑窗口已关闭，请重新开启远程控制')
    return remoteOwner
  })
  lanRemote = new MiraLanRemote({ root: app.isPackaged ? join(process.resourcesPath, 'harness-react-app') : resolve(app.getAppPath(), 'dist/harness-react-app'), ...remoteHarness })
  const remoteControl: NonNullable<import('./ipc/platformIpc').PlatformIpcDependencies['remoteControl']> = async (sender, action, id) => {
    if (action === 'start') { if (!lanRemote!.status().enabled) remoteHarness.reset(); remoteOwner = sender; return lanRemote!.start() }
    if (action === 'stop') { remoteHarness.reset(); return lanRemote!.stop() }
    return lanRemote!.status()
  }
  keepAwakeTimer = setInterval(() => {
    if (!services || isQuitting) return
    const enabled = services.database.getSnapshot().preferences.keepComputerAwake === true
    keepAwake.update(enabled, enabled)
  }, 1000)
  registerPlatformIpcHandlers({ computerSettings: services.computerSettings, remoteControl, database: services.database, harnessRuntime: services.harnessRuntime, flows: services.miraFlowController, localMicroAppServer: services.localMicroAppServer, workspaceMedia: services.workspaceMedia, workspaceHtml: services.workspaceHtml, legacyNovelApiToken: services.legacyNovelApiToken, terminalSessions, workspaceWatch, mcpConfigStore: services.mcpConfigStore, mcpManager: services.mcpManager, skillMarketplace: services.skillMarketplace, automationScheduler: services.automationScheduler })
  ipcMain.handle('mira:browser-bind', (event, sessionId, browserId, guestId) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('浏览器绑定仅允许主窗口调用')
    if (typeof sessionId !== 'string' || typeof browserId !== 'string' || !Number.isSafeInteger(guestId)) throw new Error('浏览器绑定参数无效')
    services!.database.harness.getSession(sessionId)
    const guest = webContents.fromId(guestId)
    if (!guest) throw new Error('浏览器资源已关闭')
    miraBrowserAutomation.bind(event.sender, sessionId, browserId, guest)
  })
  registerMiraFlowIpc({ flows: services.miraFlowController })
  registerNovelIpcHandlers({ database: services.database })
  registerAutomationIpcHandlers({ database: services.database, automationScheduler: services.automationScheduler, cleanupExpiredTrash: services.cleanupExpiredTrash })
  registerMcpIpcHandlers({ mcpConfigStore: services.mcpConfigStore, mcpManager: services.mcpManager, database: services.database, mcpAuthorization: services.mcpAuthorization })
  registerModelIpcHandlers({ database: services.database })
  registerHarnessProjectIpcHandlers({ database: services.database, harnessRuntime: services.harnessRuntime, automationScheduler: services.automationScheduler, miraPaths, workspaceWatch })
  registerHarnessSessionIpcHandlers({ database: services.database, harnessRuntime: services.harnessRuntime, mcpConfigStore: services.mcpConfigStore, pythonEnvironment: services.pythonEnvironment, workspaceWatch })
  registerHarnessWorkspaceIgnoreIpcHandlers(services.database)
  // Windows uses application-drawn controls, so theme transitions no longer touch native title-bar chrome.
  registerWindowIpcHandlers()
  setupApplicationMenu()
  createMainWindow({ getStartupWindowBehavior: () => services?.database.getSnapshot().preferences.startupWindowBehavior, getMainWindowState: () => services?.database.getSnapshot().preferences.mainWindowState as import('./bootstrap/windowManager').MainWindowState | undefined, saveMainWindowState: state => services?.database.savePreference('mainWindowState', state), getCloseWindowBehavior, isQuitting: () => isQuitting, getDesktopZoomLevel: () => services?.database.getSnapshot().preferences.desktopZoomLevel, saveDesktopZoomLevel: level => services?.database.savePreference('desktopZoomLevel', level), legacyNovelApi: { baseUrl: services.localMicroAppServer.getApiBaseUrl('novel'), token: services.legacyNovelApiToken } })
  setupWindowsTray()
  app.on('activate', () => { if (!isQuitting) showMainWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || getCloseWindowBehavior() === 'quit') app.quit()
})
app.on('before-quit', event => {
  if (shutdownComplete) return
  event.preventDefault()
  if (shutdown) return
  isQuitting = true
  clearInterval(keepAwakeTimer)
  keepAwake.dispose()
  notifications?.dispose()
  BrowserWindow.getAllWindows().forEach(window => { if (!window.isDestroyed()) window.hide() })
  destroyTray()
  services?.automationScheduler.stop()
  terminalSessions.closeAll()
  workspaceWatch.closeAll()
  services?.workspaceMedia.closeAll()
  services?.workspaceHtml.closeAll()
  shutdown = (async () => {
    try {
      // Workflow actors finish abort/persistence before the desktop process exits.
      await lanRemote?.stop()
      await Promise.all([services?.harnessRuntime.disposeCommandJobs(), services?.miraFlowController.dispose()])
      await services?.database.modelTrace.flush()
      await Promise.allSettled([services?.mcpManager.closeAll(), services?.mcpAuthorization.closeAll(), services?.localMicroAppServer.stop()])
    } finally {
      shutdownComplete = true
      // macOS native quit may close every window without terminating after async preparation.
      // Finish on the actual closed event, after page unload and service persistence complete.
      const windows = BrowserWindow.getAllWindows()
      const exitAfterLastWindowClosed = () => { if (BrowserWindow.getAllWindows().length === 0) app.exit(0) }
      for (const window of windows) window.once('closed', exitAfterLastWindowClosed)
      if (windows.length === 0) app.exit(0)
      else app.quit()
    }
  })()
  void shutdown.catch(() => { console.error('[Mira] 桌面服务关闭失败') })
})
