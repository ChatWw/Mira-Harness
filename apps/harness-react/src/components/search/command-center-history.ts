import type { HarnessSearchScope } from './command-center-query'

export interface HarnessSearchHistoryEntry { query: string; scope: HarnessSearchScope; updatedAt: number }
type HistorySnapshot = { entries: HarnessSearchHistoryEntry[]; ready: boolean; error: string }
type HistoryHost = { getPreference(key: string): Promise<unknown>; setPreference(key: string, value: unknown, reportFailure?: boolean): Promise<void> }
const LIMIT = 20
const scopes = new Set<HarnessSearchScope>(['all', 'commands', 'conversations', 'files'])

export function normalizeHarnessSearchHistory(raw: unknown): HarnessSearchHistoryEntry[] {
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw : []).filter((entry): entry is HarnessSearchHistoryEntry => {
    if (!entry || typeof entry.query !== 'string' || !entry.query.trim() || ['>', '#', '@'].includes(entry.query.trim()) || !scopes.has(entry.scope) || !Number.isFinite(entry.updatedAt)) return false
    const key = entry.query.trim().toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key); return true
  }).slice(0, LIMIT).map(entry => ({ query: entry.query.trim(), scope: entry.scope, updatedAt: entry.updatedAt }))
}

export function appendHarnessSearchHistory(entries: HarnessSearchHistoryEntry[], entry: HarnessSearchHistoryEntry): HarnessSearchHistoryEntry[] {
  return normalizeHarnessSearchHistory([entry, ...entries])
}

/** The bridge accepts only short, ASCII preference keys; directory names stay in the hash input. */
export async function harnessSearchHistoryPreferenceKey(workspace: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(workspace))
  return `command-center-history.${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

/** Late reads merge successful searches; failed reads never replace stored history with defaults. */
export class HarnessSearchHistoryStore {
  private snapshot: HistorySnapshot = { entries: [], ready: false, error: '' }
  private listeners = new Set<() => void>()
  private pending: Array<HarnessSearchHistoryEntry | null> = []
  private revision = 0
  private savedRevision = 0
  private reading?: Promise<void>
  private saving?: Promise<void>
  private key?: Promise<string>
  constructor(private host: HistoryHost, private workspace: string) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private preferenceKey() { return this.key ??= harnessSearchHistoryPreferenceKey(this.workspace) }
  private publish(patch: Partial<HistorySnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()) }
  load(): Promise<void> {
    if (this.reading) return this.reading
    if (this.snapshot.ready) return Promise.resolve()
    const request = this.preferenceKey().then(key => this.host.getPreference(key)).then(raw => {
      let entries = normalizeHarnessSearchHistory(raw)
      for (const entry of this.pending) entries = entry ? appendHarnessSearchHistory(entries, entry) : []
      this.pending = []
      this.publish({ entries, ready: true, error: '' })
      if (this.revision > this.savedRevision) void this.save().catch(() => undefined)
    }).catch(() => { this.key = undefined; this.publish({ error: '搜索历史读取失败' }); throw new Error('搜索历史读取失败') })
    this.reading = request
    void request.then(() => { this.reading = undefined }, () => { this.reading = undefined })
    return request
  }
  remember(query: string, scope: HarnessSearchScope) {
    const entry = normalizeHarnessSearchHistory([{ query, scope, updatedAt: Date.now() }])[0]
    if (!entry) return
    this.change(entry)
  }
  clear() { this.change(null) }
  private change(entry: HarnessSearchHistoryEntry | null) {
    this.revision++
    if (!this.snapshot.ready) this.pending.push(entry)
    this.publish({ entries: entry ? appendHarnessSearchHistory(this.snapshot.entries, entry) : [] })
    void (this.snapshot.ready ? this.save() : this.load()).catch(() => undefined)
  }
  async retry() { await this.load(); await this.save() }
  save(): Promise<void> {
    if (this.saving) return this.saving
    if (!this.snapshot.ready) return this.load().then(() => this.save())
    const request = (async () => {
      const key = await this.preferenceKey()
      while (this.savedRevision < this.revision) {
        const revision = this.revision
        await this.host.setPreference(key, this.snapshot.entries, true)
        this.savedRevision = revision
      }
      this.publish({ error: '' })
    })().catch(() => { this.publish({ error: '搜索历史保存失败' }); throw new Error('搜索历史保存失败') })
    this.saving = request
    void request.then(() => { this.saving = undefined }, () => { this.saving = undefined })
    return request
  }
}
