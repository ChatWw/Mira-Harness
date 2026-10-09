import type { HarnessWorkspaceFileEntry, HarnessWorkspaceFileSearchResult } from '../../../../src/config/harness'
import type { FileTreeRow } from './file-tree'

type FileSearchSnapshot = HarnessWorkspaceFileSearchResult & { query: string; loading: boolean; error?: string }
const emptySearch = (): FileSearchSnapshot => ({ query: '', entries: [], truncated: false, loading: false })

export function fileSearchRows(entries: HarnessWorkspaceFileEntry[]): FileTreeRow[] {
  return entries.map((entry, index) => ({ ...entry, parent: '', depth: 0, expanded: false, loading: false, empty: false, position: index + 1, siblings: entries.length }))
}

// Own request ordering independently of the tree: filtering never depends on loaded nodes.
export class FileSearchDataSource {
  private snapshot = emptySearch()
  private listeners = new Set<() => void>()
  private version = 0
  private active = false
  private refreshNeeded = true
  private timer?: ReturnType<typeof setTimeout>

  constructor(private search: (query: string, refresh: boolean) => Promise<HarnessWorkspaceFileSearchResult>) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(snapshot: FileSearchSnapshot) { this.snapshot = snapshot; this.listeners.forEach(listener => listener()) }
  activate() { this.active = true; this.refreshNeeded = true; this.version++; this.publish(emptySearch()) }
  deactivate() { this.active = false; this.version++; clearTimeout(this.timer) }

  setQuery(query: string) {
    if (!this.active) return
    const version = ++this.version
    clearTimeout(this.timer)
    this.publish({ ...emptySearch(), query, loading: Boolean(query.trim()) })
    if (query.trim()) this.timer = setTimeout(() => void this.run(version), 120)
  }

  refresh() {
    this.refreshNeeded = true
    if (!this.active || !this.snapshot.query.trim()) return
    clearTimeout(this.timer)
    const version = ++this.version
    this.publish({ ...emptySearch(), query: this.snapshot.query, loading: true })
    void this.run(version)
  }

  private async run(version: number) {
    const query = this.snapshot.query
    const refresh = this.refreshNeeded
    this.refreshNeeded = false
    const isCurrent = () => this.active && version === this.version
    try {
      const result = await this.search(query, refresh)
      if (isCurrent()) this.publish({ ...result, query, loading: false })
    } catch (cause) {
      if (isCurrent()) { this.refreshNeeded = true; this.publish({ ...emptySearch(), query, error: cause instanceof Error ? cause.message : '文件搜索失败，请重试' }) }
    }
  }
}
