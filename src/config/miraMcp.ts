export type MiraMcpConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed'
export interface MiraMcpConnection { state: MiraMcpConnectionState; toolCount: number }
export interface MiraMcpItem {
  id: string
  name: string
  enabled: boolean
  connection?: MiraMcpConnection
}
