import { ipcMain } from 'electron'
import type { PlatformDatabase } from '../storage/database'
import type { HarnessRuntime } from '../services/harnessRuntime'
import type { HarnessWorkspaceWatch } from '../services/harnessWorkspaceWatch'

export interface HarnessSessionIpcDependencies {
  database: PlatformDatabase
  harnessRuntime: HarnessRuntime
  workspaceWatch?: HarnessWorkspaceWatch
}

export function registerHarnessSessionIpcHandlers({ database, harnessRuntime, workspaceWatch }: HarnessSessionIpcDependencies) {
  ipcMain.handle('harness:list-sessions', (_event, query?: string) => harnessRuntime.listSessions(query))
  ipcMain.handle('harness:query-history', (_event, query) => database.queryHarnessHistory(query))
  ipcMain.handle('harness:query-usage', () => database.queryHarnessUsage())
  ipcMain.handle('harness:get-session', (_event, id: string) => harnessRuntime.getSession(id))
  ipcMain.handle('harness:restore-sessions', (_event, ids: string[]) => database.harness.restoreSessions(ids))
  ipcMain.handle('harness:delete-session', (_event, id: string) => {
    harnessRuntime.assertSessionMutable(id)
    const result = database.harness.deleteSession(id)
    workspaceWatch?.closeForSession(id)
    return result
  })
  ipcMain.handle('harness:list-trash', (_event, projectId?: string) => database.harness.listTrash(projectId))
  ipcMain.handle('harness:restore-trash', (_event, projectId: string, token: string) => database.harness.restoreTrash(projectId, token))
}
