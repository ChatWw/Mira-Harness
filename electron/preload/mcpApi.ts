import { ipcRenderer } from 'electron'

export const mcpApi = {
  listMcpServers: () => ipcRenderer.invoke('mcp:list-servers'),
  saveMcpServer: (config: unknown) => ipcRenderer.invoke('mcp:save-server', config),
  deleteMcpServer: (id: string) => ipcRenderer.invoke('mcp:delete-server', id),
}
