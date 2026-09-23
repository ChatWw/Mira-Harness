import { PlatformDatabase } from '../storage/database'
import { LocalMicroAppServer } from '../adapters/localMicroAppServer'
import { createNovelApiHandler } from '../adapters/novelApi'
import { HarnessRuntime } from './harnessRuntime'
import { McpConfigStore } from '../storage/mcpConfigStore'
import { McpManager } from '../adapters/mcpManager'
import { PythonEnvironment } from '../adapters/pythonEnv'
import { AutomationScheduler } from './automationScheduler'
import type { MiraPaths } from '../storage/miraPaths'
import { completeMiraDataMigration, prepareMiraDataMigration, removeLegacyUserDataFiles } from '../storage/miraDataMigration'
import type { HarnessEvent } from '../../src/config/harness'

const TRASH_CLEANUP_INTERVAL_MS = 60 * 60 * 1000

export interface PlatformServices {
  database: PlatformDatabase
  localMicroAppServer: LocalMicroAppServer
  legacyNovelApiToken: string
  harnessRuntime: HarnessRuntime
  pythonEnvironment: PythonEnvironment
  mcpConfigStore: McpConfigStore
  mcpManager: McpManager
  automationScheduler: AutomationScheduler
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
  const mcpManager = new McpManager()
  const harnessRuntime = new HarnessRuntime(database, mcpManager, publishHarnessEvent)
  const automationScheduler = new AutomationScheduler(database, harnessRuntime)
  await mcpManager.refresh(mcpConfigStore.list())
  automationScheduler.start()
  const pythonEnvironment = new PythonEnvironment()
  const localMicroAppServer = new LocalMicroAppServer({
    apiHandlers: new Map([['novel', { capability: 'models:text.generate', handle: createNovelApiHandler(database) }]]),
  })
  const preferences = database.getSnapshot().preferences
  const preferredPort = typeof preferences.localMicroAppPort === 'number' ? preferences.localMicroAppPort : undefined
  await localMicroAppServer.start(database.getSnapshot().microApps, preferredPort)
  const legacyNovelApiToken = localMicroAppServer.issueApiToken('novel', ['models:text.generate'])
  if (localMicroAppServer.port && preferences.localMicroAppPort !== localMicroAppServer.port) {
    database.savePreference('localMicroAppPort', localMicroAppServer.port)
  }

  return { database, localMicroAppServer, legacyNovelApiToken, harnessRuntime, pythonEnvironment, mcpConfigStore, mcpManager, automationScheduler, cleanupExpiredTrash }
}
