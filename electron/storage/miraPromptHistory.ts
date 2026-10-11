/** Input recall behavior follows ZCode promptHistory (Apache-2.0); see third-party-licenses/zcode. */
import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'

export class MiraPromptHistoryStore {
  constructor(private readonly database: Database.Database) {}

  private key(directory?: string) {
    return createHash('sha256').update(JSON.stringify(directory ?? null)).digest('hex')
  }

  list(directory?: string): string[] {
    const row = this.database.prepare('SELECT payload FROM harness_input_history WHERE workspace_key = ?').get(this.key(directory)) as { payload: string } | undefined
    if (!row) return []
    const value: unknown = JSON.parse(row.payload)
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 100_000).map(entry => entry.trim()).filter(Boolean).slice(-30) : []
  }

  append(directory: string | undefined, text: string) {
    const value = text.trim()
    if (!value || value.length > 100_000 || JSON.stringify([value]).length > 262_144) return
    const entries = this.list(directory)
    if (entries[entries.length - 1] === value) return
    entries.push(value)
    while (entries.length > 30 || JSON.stringify(entries).length > 262_144) entries.shift()
    this.database.prepare('INSERT OR REPLACE INTO harness_input_history(workspace_key, payload) VALUES (?, ?)').run(this.key(directory), JSON.stringify(entries))
  }
}
