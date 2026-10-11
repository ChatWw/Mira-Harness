/** Adapted from ZCode browserTabResidencyPolicy / Coordinator (Apache-2.0).
 * Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode.
 * Mira counts logical workspace tabs and commits storage before releasing guests. */
export const MIRA_BROWSER_TAB_LIMIT = 32
export interface MiraBrowserTabIdentity { sessionId: string; tabId: string }
interface Resident extends MiraBrowserTabIdentity { opened: number; activity: number; selected: number; loading: boolean }
const key = (tab: MiraBrowserTabIdentity) => JSON.stringify([tab.sessionId, tab.tabId])

export class MiraBrowserResidency {
  private tabs = new Map<string, Resident>()
  private selected?: string
  private sequence = 0
  private running?: Promise<void>
  private retry?: ReturnType<typeof setTimeout>
  private disposed = false
  constructor(private options: {
    protected: (tab: MiraBrowserTabIdentity) => Promise<boolean>
    close: (tab: MiraBrowserTabIdentity, current: () => boolean) => Promise<boolean>
    onError: (error: unknown) => void
  }) {}
  connect() { this.disposed = false }
  sync(tabs: MiraBrowserTabIdentity[], selected?: MiraBrowserTabIdentity) {
    const keep = new Set(tabs.map(key))
    for (const id of this.tabs.keys()) if (!keep.has(id)) this.tabs.delete(id)
    for (const tab of tabs) if (!this.tabs.has(key(tab))) {
      const opened = ++this.sequence
      this.tabs.set(key(tab), { ...tab, opened, activity: opened, selected: 0, loading: false })
    }
    const next = selected && key(selected)
    if (next !== this.selected && next) {
      const tab = this.tabs.get(next)
      if (tab) tab.activity = tab.selected = ++this.sequence
    }
    this.selected = next
    this.evaluate()
  }
  report(tab: MiraBrowserTabIdentity, loading: boolean) {
    const record = this.tabs.get(key(tab))
    if (!record) return
    record.activity = ++this.sequence; record.loading = loading
    this.evaluate()
  }
  private eligible(record: Resident) {
    return !this.disposed && this.tabs.get(key(record)) === record && key(record) !== this.selected && !record.loading
  }
  private evaluate() {
    clearTimeout(this.retry); this.retry = undefined
    if (this.disposed || this.running || this.tabs.size <= MIRA_BROWSER_TAB_LIMIT) return
    let failed = false
    const running = this.trim().catch(error => { failed = true; this.options.onError(error) }).finally(() => {
      if (this.running === running) this.running = undefined
      // Downloads/capture can end without a renderer event. No polling within the limit.
      if (!failed && !this.disposed && this.tabs.size > MIRA_BROWSER_TAB_LIMIT) this.retry = setTimeout(() => { this.retry = undefined; this.evaluate() }, 1000)
    })
    this.running = running
  }
  private async trim() {
    const skipped = new Set<Resident>()
    while (!this.disposed && this.tabs.size > MIRA_BROWSER_TAB_LIMIT) {
      const candidate = [...this.tabs.values()].filter(tab => this.eligible(tab) && !skipped.has(tab)).sort((a, b) => a.activity - b.activity || a.selected - b.selected || a.opened - b.opened || key(a).localeCompare(key(b)))[0]
      if (!candidate) return
      skipped.add(candidate)
      const activity = candidate.activity
      const current = () => this.eligible(candidate) && candidate.activity === activity && this.tabs.size > MIRA_BROWSER_TAB_LIMIT
      if (await this.options.protected(candidate) || !current()) continue
      if (await this.options.close(candidate, current) && this.tabs.get(key(candidate)) === candidate) this.tabs.delete(key(candidate))
    }
  }
  async whenIdle() { await this.running }
  dispose() { this.disposed = true; clearTimeout(this.retry); this.retry = undefined; this.tabs.clear() }
}
