export type MiraRemoteAction = 'status' | 'start' | 'stop'
export interface MiraRemoteStatus {
  enabled: boolean
  urls: string[]
  device?: { name: string; connectedAt: number }
}
