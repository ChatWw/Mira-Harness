import type { PlatformDatabase } from '../storage/database'
import type { MiraMcpItem } from '../../src/config/miraMcp'
import type { McpConfigStore } from '../storage/mcpConfigStore'

export function harnessProjectMcpCatalog(database: PlatformDatabase, store: McpConfigStore, sessionId?: string, projectId?: string): MiraMcpItem[] {
  const ownerProjectId = sessionId ? database.harness.getSession(sessionId).projectId : projectId
  if (!ownerProjectId) return []
  const project = database.harness.getProject(ownerProjectId)
  return store.forProject(project.directory).list().map(server => ({
    id: server.id, name: server.name, enabled: server.enabled, ...(server.type ? { type: server.type } : {}),
    source: { kind: 'project', projectId: project.id, projectName: project.name },
  }))
}

/** Read-only public metadata; plugin commands, tokens and request headers stay in the host. */
export function harnessPluginMcpCatalog(database: PlatformDatabase, sessionId?: string): MiraMcpItem[] {
  const frozen = sessionId ? database.harness.getSession(sessionId).pluginCatalog : undefined
  const plugins = database.plugins?.catalog?.(frozen) || []
  return plugins.flatMap(plugin => (plugin.mcpServers || []).map(server => {
    const reason = server.unavailableReason || (plugin.conflicts.length ? '插件名称冲突，请停用重名插件' : undefined)
    return { id: server.id, name: server.name, enabled: plugin.enabled && server.enabled && !reason,
      ...(server.type ? { type: server.type } : {}), ...(reason ? { unavailableReason: reason } : {}),
      source: { kind: 'plugin' as const, pluginId: plugin.id, pluginName: plugin.name } }
  }))
}
