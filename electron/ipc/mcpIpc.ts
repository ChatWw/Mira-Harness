import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { MIRA_MCP_CONFIG_ERRORS, type McpConfigStore } from '../storage/mcpConfigStore'
import type { McpManager } from '../adapters/mcpManager'
import type { PlatformDatabase } from '../storage/database'
import type { MiraMcpAuthorization } from '../services/miraMcpAuthorization'
import type { MiraMcpConnection } from '../../src/config/miraMcp'

export interface McpIpcDependencies {
  mcpConfigStore: McpConfigStore
  mcpManager: McpManager
  database?: Pick<PlatformDatabase, 'harness'>
  mcpAuthorization?: MiraMcpAuthorization
}

export function registerMcpIpcHandlers({ mcpConfigStore, mcpManager, database, mcpAuthorization }: McpIpcDependencies) {
  const safeErrors = new Set<string>([...MIRA_MCP_CONFIG_ERRORS, '只能重连已配置且启用的 MCP 服务', 'MCP 服务 ID 无效', 'MCP 配置仅可在平台设置中管理', '项目 MCP 在任务启动时连接', '只能授权已配置且启用的 OAuth MCP 服务', 'MCP 浏览器授权服务不可用', 'MCP 授权入口已失效，请重新授权', 'MCP 授权浏览器无法打开，请重试'])
  const projectAuthorizations = new Map<string, { config: string; manager?: McpManager; connection?: MiraMcpConnection }>()
  safeErrors.add('系统安全存储不可用，MCP 授权凭据未写入')
  function projectRecord(server: ReturnType<McpConfigStore['save']>) {
    const probe = projectAuthorizations.get(server.id)
    if (probe && probe.config !== JSON.stringify(server)) { void probe.manager?.closeAll(); projectAuthorizations.delete(server.id) }
    const current = projectAuthorizations.get(server.id)
    let connection = current?.manager?.getStatus(server.id) || current?.connection
    if (connection && connection.state === 'connected' && current) {
      connection = { state: 'authorized', toolCount: 0 }
      current.connection = connection
      void current.manager?.closeAll(); current.manager = undefined
    }
    return { ...server, scope: 'project' as const, ...(connection ? { connection } : {}) }
  }
  function assertOwner(event: IpcMainInvokeEvent) {
    if (!event.senderFrame || event.senderFrame.parent !== null || event.senderFrame !== event.sender.mainFrame
      || event.sender.isDestroyed() || !BrowserWindow.fromWebContents(event.sender)) throw new Error('MCP 配置仅可在平台设置中管理')
  }
  function serverId(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('MCP 服务 ID 无效')
    return value
  }
  function fail(error: unknown): never {
    const message = error instanceof Error ? error.message : ''
    throw new Error(safeErrors.has(message) ? message : 'MCP 配置操作失败，请检查配置文件权限后重试')
  }
  function storeForScope(scope: unknown): McpConfigStore {
    if (scope === undefined) return mcpConfigStore
    if (!scope || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).some(key => key !== 'projectId')) throw new Error('MCP 项目范围无效')
    const projectId = (scope as { projectId?: unknown }).projectId
    if (projectId === undefined) return mcpConfigStore
    if (typeof projectId !== 'string' || !projectId.trim() || projectId.length > 256 || /[\x00-\x1f\x7f]/.test(projectId) || !database) throw new Error('MCP 项目范围无效')
    let directory: string
    try { directory = database.harness.getProject(projectId).directory } catch { throw new Error('MCP 项目范围无效') }
    return mcpConfigStore.forProject(directory)
  }
  function record(server: ReturnType<McpConfigStore['save']>) {
    return { ...server, connection: mcpManager.getStatus(server.id) }
  }
  ipcMain.handle('mcp:list-servers', (event, scope: unknown) => {
    assertOwner(event)
    try { const store = storeForScope(scope); return store === mcpConfigStore ? store.list().map(record) : store.list().map(projectRecord) } catch (error) { fail(error) }
  })
  ipcMain.handle('mcp:save-server', (event, config: unknown, scope: unknown) => {
    assertOwner(event)
    try {
      const store = storeForScope(scope), saved = store.save(config as Parameters<McpConfigStore['save']>[0])
      if (store !== mcpConfigStore) return projectRecord(saved)
      void mcpManager.refresh(mcpConfigStore.list())
      return record(saved)
    } catch (error) { fail(error) }
  })
  ipcMain.handle('mcp:delete-server', (event, id: unknown, scope: unknown) => {
    assertOwner(event)
    try {
      const store = storeForScope(scope)
      store.delete(serverId(id))
      const probe = projectAuthorizations.get(id as string)
      void probe?.manager?.closeAll(); projectAuthorizations.delete(id as string)
      if (store !== mcpConfigStore) return
      void mcpManager.refresh(mcpConfigStore.list())
    } catch (error) { fail(error) }
  })
  ipcMain.handle('mcp:reconnect-server', async (event, id: unknown, scope: unknown) => {
    assertOwner(event)
    try {
      const configuredId = serverId(id)
      if (storeForScope(scope) !== mcpConfigStore) throw new Error('项目 MCP 在任务启动时连接')
      const server = mcpConfigStore.list().find(server => server.id === configuredId)
      if (!server?.enabled) throw new Error('只能重连已配置且启用的 MCP 服务')
      await mcpManager.reconnect(server)
      assertOwner(event)
      return mcpManager.getStatus(server.id)
    } catch (error) { fail(error) }
  })
  ipcMain.handle('mcp:authorize-server', async (event, id: unknown, scope: unknown) => {
    assertOwner(event)
    try {
      const configuredId = serverId(id), store = storeForScope(scope)
      const server = store.list().find(server => server.id === configuredId)
      if (!server?.enabled || server.authentication !== 'oauth' || !server.url || server.type === 'stdio') throw new Error('只能授权已配置且启用的 OAuth MCP 服务')
      if (!mcpAuthorization) throw new Error('MCP 浏览器授权服务不可用')
      if (!mcpAuthorization.getPending(server.id, server.url)) {
        mcpAuthorization.prepareRetry(server.id, server.url)
        if (store === mcpConfigStore) await mcpManager.reconnect(server)
        else {
          const previous = projectAuthorizations.get(server.id)
          await previous?.manager?.closeAll()
          const manager = mcpManager.createSibling()
          projectAuthorizations.set(server.id, { config: JSON.stringify(server), manager })
          await manager.refresh([server])
        }
      }
      assertOwner(event)
      const current = store.list().find(item => item.id === server.id)
      if (JSON.stringify(current) !== JSON.stringify(server)) throw new Error('MCP 授权入口已失效，请重新授权')
      if (!mcpAuthorization.getPending(server.id, server.url)) {
        const connection = store === mcpConfigStore ? mcpManager.getStatus(server.id) : projectRecord(server).connection
        if (connection?.state === 'connected' || connection?.state === 'authorized') return connection
        throw new Error('MCP 授权入口已失效，请重新授权')
      }
      await mcpAuthorization.openAuthorization(server.id, server.url, url => {
        assertOwner(event)
        return shell.openExternal(url).catch(() => { throw new Error('MCP 授权浏览器无法打开，请重试') })
      })
      assertOwner(event)
      return store === mcpConfigStore ? mcpManager.getStatus(server.id) : projectRecord(server).connection
    } catch (error) { fail(error) }
  })
}
