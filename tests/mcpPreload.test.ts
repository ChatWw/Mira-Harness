import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mcpApi } from '../electron/preload/mcpApi'
const ipc = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('electron', () => ({ ipcRenderer: ipc }))
beforeEach(() => ipc.invoke.mockClear())
describe('MCP settings preload scope', () => {
  it('passes only the stored service identity and optional project scope for browser authorization', () => {
    mcpApi.authorizeMcpServer('global'); mcpApi.authorizeMcpServer('project:owned:service', { projectId: 'registered' })
    expect(ipc.invoke.mock.calls).toEqual([['mcp:authorize-server', 'global'], ['mcp:authorize-server', 'project:owned:service', { projectId: 'registered' }]])
  })
  it('keeps the original unscoped argument shape', () => {
    mcpApi.listMcpServers(); mcpApi.saveMcpServer({ name: 'Global' }); mcpApi.deleteMcpServer('id'); mcpApi.reconnectMcpServer('id')
    expect(ipc.invoke.mock.calls).toEqual([['mcp:list-servers'], ['mcp:save-server', { name: 'Global' }], ['mcp:delete-server', 'id'], ['mcp:reconnect-server', 'id']])
  })
  it('passes only the optional project scope as the final IPC argument', () => {
    const scope = { projectId: 'registered' }
    mcpApi.listMcpServers(scope); mcpApi.saveMcpServer({ name: 'Project' }, scope); mcpApi.deleteMcpServer('id', scope); mcpApi.reconnectMcpServer('id', scope)
    expect(ipc.invoke.mock.calls).toEqual([['mcp:list-servers', scope], ['mcp:save-server', { name: 'Project' }, scope], ['mcp:delete-server', 'id', scope], ['mcp:reconnect-server', 'id', scope]])
  })
})
