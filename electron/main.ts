import { app, BrowserWindow } from 'electron'
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

let isQuitting = false
let services: PlatformServices | undefined
let shutdown: Promise<void> | undefined
let shutdownComplete = false
const terminalSessions = new HarnessTerminalSessions()
const workspaceWatch = new HarnessWorkspaceWatch()
const testHome = !app.isPackaged && process.env.MIRA_TEST_HOME ? resolve(process.env.MIRA_TEST_HOME) : undefined
const legacyUserDataPath = testHome ? join(testHome, 'legacy-user-data') : app.getPath('userData')
const miraPaths = new MiraPaths(testHome ?? app.getPath('home')).ensure()

// Keep Mira's data portable and inspectable under the user's home directory on every desktop OS.
app.setPath('userData', miraPaths.root)

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
  registerPlatformIpcHandlers({ database: services.database, harnessRuntime: services.harnessRuntime, flows: services.miraFlowController, localMicroAppServer: services.localMicroAppServer, workspaceMedia: services.workspaceMedia, legacyNovelApiToken: services.legacyNovelApiToken, terminalSessions, workspaceWatch, mcpConfigStore: services.mcpConfigStore, mcpManager: services.mcpManager, skillMarketplace: services.skillMarketplace, automationScheduler: services.automationScheduler })
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
  createMainWindow({ getCloseWindowBehavior, isQuitting: () => isQuitting, legacyNovelApi: { baseUrl: services.localMicroAppServer.getApiBaseUrl('novel'), token: services.legacyNovelApiToken } })
  setupWindowsTray()
  app.on('activate', showMainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || getCloseWindowBehavior() === 'quit') app.quit()
})
app.on('before-quit', event => {
  if (shutdownComplete) return
  event.preventDefault()
  if (shutdown) return
  isQuitting = true
  destroyTray()
  services?.automationScheduler.stop()
  terminalSessions.closeAll()
  workspaceWatch.closeAll()
  services?.workspaceMedia.closeAll()
  shutdown = (async () => {
    try {
      // Workflow actors finish abort/persistence before the desktop process exits.
      await services?.miraFlowController.dispose()
      await Promise.allSettled([services?.mcpManager.closeAll(), services?.mcpAuthorization.closeAll(), services?.localMicroAppServer.stop()])
    } finally {
      shutdownComplete = true
      app.quit()
    }
  })()
  void shutdown.catch(() => { console.error('[Mira] 桌面服务关闭失败') })
})
