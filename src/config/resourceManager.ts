export interface MiraResourceSnapshot {
  sampledAt: number
  system: { cpuPercent: number | null; memoryUsedBytes: number; memoryTotalBytes: number }
  processes: { pid: number; name: string; category?: 'base' | 'builtin-plugin' | 'community-plugin'; cpuPercent: number; memoryBytes: number }[]
}

export interface MiraStorageSnapshot {
  root: string
  finishedAt: number
  totalBytes: number
  volume: { totalBytes: number; freeBytes: number } | null
  errors: number
  categories: { id: string; title: string; bytes: number; files: number; entries: { name: string; path: string; bytes: number; files: number }[] }[]
}
export interface MiraNetworkSnapshot {
  records: { id: number; timestamp: number; processType: string; pid: number; method: string; url: string }[]
  dropped: number
}
export interface MiraResourceBridge {
  getSnapshot(): Promise<MiraResourceSnapshot>
  storage: { scan(): Promise<MiraStorageSnapshot>; cancel(): Promise<void>; reveal(path: string): Promise<void> }
  network: { getSnapshot(): Promise<MiraNetworkSnapshot>; clear(): Promise<void> }
}
