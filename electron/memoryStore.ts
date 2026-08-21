import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export type MemoryScope = 'global' | 'project'
export type MemoryKind = 'task-summary' | 'project-fact' | 'user-preference' | 'reusable-knowledge'

export interface MiraMemory {
  id: string
  scope: MemoryScope
  projectId?: string
  kind: MemoryKind
  content: string
  keywords: string[]
  sourceSessionId?: string
  enabled: boolean
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

function rowToMemory(row: Record<string, unknown>): MiraMemory {
  let keywords: string[] = []
  try { keywords = JSON.parse(String(row.keywords || '[]')) } catch {}
  return {
    id: String(row.id), scope: row.scope === 'global' ? 'global' : 'project', projectId: typeof row.project_id === 'string' ? row.project_id : undefined,
    kind: ['task-summary', 'project-fact', 'user-preference', 'reusable-knowledge'].includes(String(row.kind)) ? row.kind as MemoryKind : 'task-summary',
    content: String(row.content), keywords: Array.isArray(keywords) ? keywords.filter((item): item is string => typeof item === 'string') : [],
    sourceSessionId: typeof row.source_session_id === 'string' ? row.source_session_id : undefined, enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), lastUsedAt: typeof row.last_used_at === 'number' ? row.last_used_at : undefined,
  }
}

function normalizeKeywords(value: string[]) { return [...new Set(value.map(item => item.trim().toLocaleLowerCase()).filter(Boolean))].slice(0, 12) }
function keywordsFor(content: string) { return normalizeKeywords((content.match(/[\p{L}\p{N}_-]{2,}/gu) || []).filter(word => word.length <= 32).slice(0, 12)) }

export class MemoryStore {
  constructor(private readonly database: Database.Database) {}

  isSensitive(content: string) { return SENSITIVE.some(pattern => pattern.test(content)) }

  autoEnabled() {
    const row = this.database.prepare('SELECT value FROM memory_settings WHERE key = ?').get('auto_enabled') as { value?: string } | undefined
    return row?.value !== 'false'
  }

  setAutoEnabled(enabled: boolean) {
    this.database.prepare('INSERT OR REPLACE INTO memory_settings(key, value) VALUES (?, ?)').run('auto_enabled', String(Boolean(enabled)))
    return this.autoEnabled()
  }

  list(projectId?: string) {
    const rows = projectId
      ? this.database.prepare('SELECT * FROM memories WHERE scope = ? OR project_id = ? ORDER BY updated_at DESC').all('global', projectId)
      : this.database.prepare('SELECT * FROM memories ORDER BY updated_at DESC').all()
    return (rows as Record<string, unknown>[]).map(rowToMemory)
  }

  save(input: Partial<MiraMemory> & Pick<MiraMemory, 'scope' | 'kind' | 'content'>) {
    const content = input.content.trim().slice(0, MAX_MEMORY_CONTENT)
    if (!content) throw new Error('记忆内容不能为空')
    if (this.isSensitive(content)) throw new Error('记忆中不能保存敏感信息')
    if (input.scope === 'project' && !input.projectId) throw new Error('项目记忆必须关联项目')
    const existing = input.id ? this.get(input.id) : undefined
    const time = Date.now()
    const record: MiraMemory = {
      id: existing?.id || randomUUID(), scope: input.scope, projectId: input.scope === 'project' ? input.projectId : undefined,
      kind: input.kind, content, keywords: normalizeKeywords(input.keywords || existing?.keywords || keywordsFor(content)), sourceSessionId: input.sourceSessionId || existing?.sourceSessionId,
      enabled: input.enabled ?? existing?.enabled ?? true, createdAt: existing?.createdAt || time, updatedAt: time, lastUsedAt: existing?.lastUsedAt,
    }
    this.database.prepare(`INSERT INTO memories(id, scope, project_id, kind, content, keywords, source_session_id, enabled, created_at, updated_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET scope=excluded.scope, project_id=excluded.project_id, kind=excluded.kind, content=excluded.content,
      keywords=excluded.keywords, source_session_id=excluded.source_session_id, enabled=excluded.enabled, updated_at=excluded.updated_at`)
      .run(record.id, record.scope, record.projectId || null, record.kind, record.content, JSON.stringify(record.keywords), record.sourceSessionId || null, Number(record.enabled), record.createdAt, record.updatedAt, record.lastUsedAt || null)
    const overflow = record.scope === 'project'
      ? this.database.prepare('SELECT id FROM memories WHERE scope = ? AND project_id = ? ORDER BY updated_at DESC LIMIT -1 OFFSET 100').all('project', record.projectId) as Array<{ id: string }>
      : this.database.prepare('SELECT id FROM memories WHERE scope = ? ORDER BY updated_at DESC LIMIT -1 OFFSET 100').all('global') as Array<{ id: string }>
    const remove = this.database.prepare('DELETE FROM memories WHERE id = ?')
    overflow.forEach(item => remove.run(item.id))
    return record
  }

  get(id: string) {
    const row = this.database.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? rowToMemory(row) : undefined
  }

  delete(id: string) { this.database.prepare('DELETE FROM memories WHERE id = ?').run(id) }
  clearProject(projectId: string) { return this.database.prepare('DELETE FROM memories WHERE scope = ? AND project_id = ?').run('project', projectId).changes }

  context(projectId: string | undefined, query: string) {
    const terms = keywordsFor(query)
    const candidates = this.list(projectId).filter(memory => memory.enabled && (memory.scope === 'global' || memory.projectId === projectId))
    const ordered = candidates.sort((a, b) => {
      const score = (memory: MiraMemory) => memory.keywords.filter(keyword => terms.some(term => keyword.includes(term) || term.includes(keyword))).length
      return score(b) - score(a) || (b.lastUsedAt || b.updatedAt) - (a.lastUsedAt || a.updatedAt)
    }).slice(0, 8)
    const usedAt = Date.now()
    const mark = this.database.prepare('UPDATE memories SET last_used_at = ? WHERE id = ?')
    ordered.forEach(memory => mark.run(usedAt, memory.id))
    return {
      global: ordered.filter(memory => memory.scope === 'global').map(memory => `- ${memory.content}`).join('\n'),
      project: ordered.filter(memory => memory.scope === 'project').map(memory => `- ${memory.content}`).join('\n'),
    }
  }
}
