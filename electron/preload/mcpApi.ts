import { ipcRenderer } from 'electron'
import type { MiraMcpScope } from '../../src/config/miraMcp'

export const mcpApi = {
  listMcpServers: (scope?: MiraMcpScope) => ipcRenderer.invoke('mcp:list-servers', ...(scope === undefined ? [] : [scope])),
  saveMcpServer: (config: unknown, scope?: MiraMcpScope) => ipcRenderer.invoke('mcp:save-server', config, ...(scope === undefined ? [] : [scope])),
  deleteMcpServer: (id: string, scope?: MiraMcpScope) => ipcRenderer.invoke('mcp:delete-server', id, ...(scope === undefined ? [] : [scope])),
  reconnectMcpServer: (id: string, scope?: MiraMcpScope) => ipcRenderer.invoke('mcp:reconnect-server', id, ...(scope === undefined ? [] : [scope])),
  authorizeMcpServer: (id: string, scope?: MiraMcpScope) => ipcRenderer.invoke('mcp:authorize-server', id, ...(scope === undefined ? [] : [scope])),
}
