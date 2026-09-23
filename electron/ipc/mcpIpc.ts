import { ipcMain } from 'electron'
import type { McpConfigStore } from '../storage/mcpConfigStore'
import type { McpManager } from '../adapters/mcpManager'

export interface McpIpcDependencies {
  mcpConfigStore: McpConfigStore
  mcpManager: McpManager
}

export function registerMcpIpcHandlers({ mcpConfigStore, mcpManager }: McpIpcDependencies) {
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
}
