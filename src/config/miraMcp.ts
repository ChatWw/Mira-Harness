export type MiraMcpConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed' | 'authorization-required' | 'authorized'
export type MiraMcpTransport = 'stdio' | 'streamableHttp' | 'sse'
export interface MiraMcpScope { projectId?: string }
export interface MiraMcpServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  enabled: boolean
  createdAt: number
  updatedAt: number
  type?: MiraMcpTransport
  url?: string
  headers?: Record<string, string>
  authentication?: 'headers' | 'oauth'
  env?: Record<string, string>
  /** Host-resolved plugin process working directory; never supplied by the React bridge. */
  cwd?: string
}
export interface MiraMcpConnection { state: MiraMcpConnectionState; toolCount: number; error?: string; authorization?: { startedAt: number; expiresAt: number } }
export interface MiraMcpServerRecord extends MiraMcpServerConfig { connection?: MiraMcpConnection; scope?: 'global' | 'project' }
export interface MiraMcpItem {
  id: string
  name: string
  enabled: boolean
  type?: MiraMcpTransport
  connection?: MiraMcpConnection
  source?: { kind: 'plugin'; pluginId: string; pluginName: string } | { kind: 'project'; projectId: string; projectName: string }
  unavailableReason?: string
}
