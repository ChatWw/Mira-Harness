import { PlatformDatabase } from '../storage/database'
import { LocalMicroAppServer } from '../adapters/localMicroAppServer'
import { createNovelApiHandler } from '../adapters/novelApi'
import { HarnessRuntime } from './harnessRuntime'
import { resolveMiraRipgrepPath } from './miraRuntimeTools'
import { MiraFlowController } from './flows/miraFlowController'
import { McpConfigStore } from '../storage/mcpConfigStore'
import { McpManager } from '../adapters/mcpManager'
import { PythonEnvironment } from '../adapters/pythonEnv'
import { AutomationScheduler } from './automationScheduler'
import { SkillMarketplaceService } from './skillMarketplace'
import type { MiraPaths } from '../storage/miraPaths'
import { completeMiraDataMigration, prepareMiraDataMigration, removeLegacyUserDataFiles } from '../storage/miraDataMigration'
import type { HarnessEvent } from '../../src/config/harness'
import { app, net, safeStorage } from 'electron'
import { MiraMcpCredentialStore } from '../storage/miraMcpCredentialStore'
import { MiraMcpAuthorization } from './miraMcpAuthorization'
import { join, resolve } from 'node:path'
import { MiraWorkspaceMedia } from './miraWorkspaceMedia'

const TRASH_CLEANUP_INTERVAL_MS = 60 * 60 * 1000

export interface PlatformServices {
  workspaceMedia: MiraWorkspaceMedia
  database: PlatformDatabase
  localMicroAppServer: LocalMicroAppServer
  legacyNovelApiToken: string
  harnessRuntime: HarnessRuntime
  miraFlowController: MiraFlowController
  pythonEnvironment: PythonEnvironment
  mcpConfigStore: McpConfigStore
  mcpManager: McpManager
  mcpAuthorization: MiraMcpAuthorization
  automationScheduler: AutomationScheduler
  skillMarketplace: SkillMarketplaceService
  cleanupExpiredTrash: () => void
}

export async function createPlatformServices({ miraPaths, legacyUserDataPath, publishHarnessEvent }: {
  miraPaths: MiraPaths
  legacyUserDataPath: string
  publishHarnessEvent: (event: HarnessEvent) => void
}): Promise<PlatformServices> {
  prepareMiraDataMigration(miraPaths, legacyUserDataPath)
  const database = new PlatformDatabase(miraPaths)
  database.harness.migrateLegacyStorage()
  completeMiraDataMigration(miraPaths, legacyUserDataPath)
  if (legacyUserDataPath !== miraPaths.root) removeLegacyUserDataFiles(legacyUserDataPath)

  const cleanupExpiredTrash = () => {
    try {
      database.harness.cleanupExpiredTrash()
    } catch (error) {
      console.warn('[Mira] 回收站过期清理失败', error)
    }
  }
  cleanupExpiredTrash()
  setInterval(cleanupExpiredTrash, TRASH_CLEANUP_INTERVAL_MS)

  const mcpConfigStore = new McpConfigStore(miraPaths)
  database.harness.recoverInterruptedSubtasks()
  database.harness.recoverInterruptedCommands()
  const mcpAuthorization = new MiraMcpAuthorization(new MiraMcpCredentialStore(miraPaths, {
    encryptString: value => safeStorage.encryptString(value), decryptString: value => safeStorage.decryptString(value),
    isAvailable: () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  }))
  const mcpManager = new McpManager(mcpAuthorization.fork(), mcpAuthorization)
  const harnessRuntime = new HarnessRuntime(database, mcpManager, publishHarnessEvent, mcpConfigStore,
    resolveMiraRipgrepPath({ appPath: app.getAppPath(), isPackaged: app.isPackaged, resourcesPath: process.resourcesPath }))
  const miraFlowController = new MiraFlowController({ database, runtime: harnessRuntime, paths: miraPaths,
    resourceRoot: app.isPackaged ? join(process.resourcesPath, 'mira-flow-host') : resolve(app.getAppPath(), 'dist/mira-flow-host') })
  const automationScheduler = new AutomationScheduler(database, harnessRuntime)
  const skillMarketplace = new SkillMarketplaceService(miraPaths, database.skills, (input, init) => net.fetch(input, init))
  try { void mcpManager.refresh(mcpConfigStore.list()) }
  catch { console.error('[mcp] MCP 配置读取失败；请在设置中检查配置文件后重试') }
  automationScheduler.start()
  const pythonEnvironment = new PythonEnvironment()
  const workspaceMedia = new MiraWorkspaceMedia()
  const localMicroAppServer = new LocalMicroAppServer({
    mediaHandler: (id, request, response) => { void workspaceMedia.handle(id, request, response) },
    builtinRoots: { 'harness-react-app': app.isPackaged ? join(process.resourcesPath, 'harness-react-app') : resolve(app.getAppPath(), 'dist/harness-react-app') },
    apiHandlers: new Map([['novel', { capability: 'models:text.generate', handle: createNovelApiHandler(database) }]]),
  })
  const preferences = database.getSnapshot().preferences
  const preferredPort = typeof preferences.localMicroAppPort === 'number' ? preferences.localMicroAppPort : undefined
  await localMicroAppServer.start(database.getSnapshot().microApps, preferredPort)
  const legacyNovelApiToken = localMicroAppServer.issueApiToken('novel', ['models:text.generate'])
  if (localMicroAppServer.port && preferences.localMicroAppPort !== localMicroAppServer.port) {
    database.savePreference('localMicroAppPort', localMicroAppServer.port)
  }

  return { workspaceMedia, database, localMicroAppServer, legacyNovelApiToken, harnessRuntime, miraFlowController, pythonEnvironment, mcpConfigStore, mcpManager, mcpAuthorization, automationScheduler, skillMarketplace, cleanupExpiredTrash }
}
