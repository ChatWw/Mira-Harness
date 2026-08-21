import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export interface MiraMemory {
  id: string
  content: string
  keywords: string[]
  sourceSessionId?: string
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
}

const SENSITIVE = [
  /\b(?:api[_ -]?key|token|secret|password|passwd|private[_ -]?key)\b/i,
  /(?:sk|rk|pk)-[a-z0-9_-]{12,}/i,
  /\b\d{15,18}[0-9xX]\b/,
  /(?:银行卡|身份证|住址|医疗|病历|财务|income|credit card)/i,
]
const MAX_MEMORY_CONTENT = 1800

function normalizeKeywords(value: string[]) {
  return [...new Set(value.map(item => item.trim().toLocaleLowerCase()).filter(Boolean))].slice(0, 12)
}

function keywordsFor(content: string) {
  return normalizeKeywords((content.match(/[\p{L}\p{N}_-]{2,}/gu) || []).filter(word => word.length <= 32).slice(0, 12))
}

function rowToMemory(row: Record<string, unknown>): MiraMemory {
  let keywords: string[] = []
  try { keywords = JSON.parse(String(row.keywords || '[]')) } catch {}
  return {
    id: String(row.id), content: String(row.content),
    keywords: Array.isArray(keywords) ? keywords.filter((item): item is string => typeof item === 'string') : [],
    sourceSessionId: typeof row.source_session_id === 'string' ? row.source_session_id : undefined,
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    lastUsedAt: typeof row.last_used_at === 'number' ? row.last_used_at : undefined,
  }
}

export class MemoryStore {
  constructor(private readonly database: Database.Database) {}

  isSensitive(content: string) { return SENSITIVE.some(pattern => pattern.test(content)) }

  enabled() {
    const row = this.database.prepare('SELECT value FROM memory_settings WHERE key = ?').get('enabled') as { value?: string } | undefined
    return row?.value === 'true'
  }

  setEnabled(enabled: boolean) {
    this.database.prepare('INSERT OR REPLACE INTO memory_settings(key, value) VALUES (?, ?)').run('enabled', String(Boolean(enabled)))
    return this.enabled()
  }

  toolAssistedEnabled() {
    const row = this.database.prepare('SELECT value FROM memory_settings WHERE key = ?').get('tool_assisted_enabled') as { value?: string } | undefined
    return row?.value === 'true'
  }

  setToolAssistedEnabled(enabled: boolean) {
    this.database.prepare('INSERT OR REPLACE INTO memory_settings(key, value) VALUES (?, ?)').run('tool_assisted_enabled', String(Boolean(enabled)))
    return this.toolAssistedEnabled()
  }

  saveGenerated(content: string, sourceSessionId?: string) {
    const value = content.trim().slice(0, MAX_MEMORY_CONTENT)
    if (!value || this.isSensitive(value)) return undefined
    const time = Date.now()
    const record: MiraMemory = {
      id: randomUUID(), content: value, keywords: keywordsFor(value), sourceSessionId,
      createdAt: time, updatedAt: time,
    }
    this.database.prepare(`INSERT INTO memories(id, scope, project_id, kind, content, keywords, source_session_id, enabled, created_at, updated_at, last_used_at)
      VALUES (?, 'global', NULL, 'task-summary', ?, ?, ?, 1, ?, ?, NULL)`).run(
      record.id, record.content, JSON.stringify(record.keywords), record.sourceSessionId || null, record.createdAt, record.updatedAt,
    )
    const overflow = this.database.prepare('SELECT id FROM memories WHERE scope = ? ORDER BY updated_at DESC LIMIT -1 OFFSET 100').all('global') as Array<{ id: string }>
    const remove = this.database.prepare('DELETE FROM memories WHERE id = ?')
    overflow.forEach(item => remove.run(item.id))
    return record
  }

  context(query: string) {
    const terms = keywordsFor(query)
    const rows = this.database.prepare("SELECT * FROM memories WHERE scope = 'global' AND enabled = 1 ORDER BY updated_at DESC").all() as Record<string, unknown>[]
    const candidates = rows.map(rowToMemory)
    const score = (memory: MiraMemory) => memory.keywords.filter(keyword => terms.some(term => keyword.includes(term) || term.includes(keyword))).length
    const ordered = candidates.sort((a, b) => score(b) - score(a) || (b.lastUsedAt || b.updatedAt) - (a.lastUsedAt || a.updatedAt)).slice(0, 8)
    const usedAt = Date.now()
    const mark = this.database.prepare('UPDATE memories SET last_used_at = ? WHERE id = ?')
    ordered.forEach(memory => mark.run(usedAt, memory.id))
    return ordered.map(memory => `- ${memory.content}`).join('\n')
  }

  reset() {
    return this.database.prepare("DELETE FROM memories WHERE scope = 'global'").run().changes
  }
}
