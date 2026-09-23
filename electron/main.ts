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
import { MiraPaths } from './storage/miraPaths'
import { createMainWindow, destroyTray, setupApplicationMenu, setupDevelopmentDockIcon, setupWindowsTray, showMainWindow } from './bootstrap/windowManager'
import { type HarnessEvent } from '../src/config/harness'

let isQuitting = false
let services: PlatformServices | undefined
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
  registerPlatformIpcHandlers({ database: services.database, localMicroAppServer: services.localMicroAppServer, legacyNovelApiToken: services.legacyNovelApiToken })
  registerNovelIpcHandlers({ database: services.database })
  registerAutomationIpcHandlers({ database: services.database, automationScheduler: services.automationScheduler, cleanupExpiredTrash: services.cleanupExpiredTrash })
  registerMcpIpcHandlers({ mcpConfigStore: services.mcpConfigStore, mcpManager: services.mcpManager })
  registerModelIpcHandlers({ database: services.database })
  registerHarnessProjectIpcHandlers({ database: services.database, harnessRuntime: services.harnessRuntime, automationScheduler: services.automationScheduler, miraPaths })
  registerHarnessSessionIpcHandlers({ database: services.database, harnessRuntime: services.harnessRuntime, mcpConfigStore: services.mcpConfigStore, pythonEnvironment: services.pythonEnvironment })
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
app.on('before-quit', () => {
  isQuitting = true
  destroyTray()
  services?.automationScheduler.stop()
  void services?.localMicroAppServer.stop()
})
