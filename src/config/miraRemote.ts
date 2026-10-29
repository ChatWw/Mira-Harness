export type MiraRemoteAction = 'status' | 'start' | 'stop'
export interface MiraRemoteStatus {
  enabled: boolean
  urls: string[]
  devices?: { name: string; connectedAt: number }[]
}
