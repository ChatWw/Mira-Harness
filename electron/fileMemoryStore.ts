import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { MiraPaths } from './miraPaths'

export type MemoryScope = 'global' | 'project'

export interface FileMemoryEntry {
  id: string
  content: string
  scope: MemoryScope
  projectId?: string
}

interface MemorySettings {
  enabled: boolean
}

const SENSITIVE = [
  /\b(?:api[_ -]?key|token|secret|password|passwd|private[_ -]?key)\b/i,
  /(?:sk|rk|pk)-[a-z0-9_-]{12,}/i,
  /\b\d{15,18}[0-9xX]\b/,
  /(?:银行卡|身份证|住址|医疗|病历|财务|income|credit card)/i,
]
const MAX_MEMORY_CONTENT = 1800

function normalize(content: string) {
  return content.trim().replace(/\s+/g, ' ')
}

function keywordsFor(content: string) {
  return [...new Set((content.match(/[\p{L}\p{N}_-]{2,}/gu) || []).map(word => word.toLocaleLowerCase()))].slice(0, 12)
}

function entryId(content: string) {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

function scopeTitle(scope: MemoryScope) {
  return scope === 'global' ? 'Mira 全局记忆' : 'Mira 项目记忆'
}

export class FileMemoryStore {
  constructor(private readonly paths: MiraPaths) {}

  enabled() {
    try {
      const settings = JSON.parse(readFileSync(this.paths.memorySettings(), 'utf8')) as Partial<MemorySettings>
      return settings.enabled === true
    } catch {
      return false
    }
  }

  setEnabled(enabled: boolean) {
    this.write(this.paths.memorySettings(), `${JSON.stringify({ enabled: Boolean(enabled) }, null, 2)}\n`)
    return this.enabled()
  }

  path(scope: MemoryScope, projectId?: string) {
    if (scope === 'project' && !projectId) throw new Error('请先关联项目后再写入项目记忆')
    if (scope === 'project' && !/^[a-zA-Z0-9_-]+$/.test(projectId!)) throw new Error('项目记忆标识无效')
    return scope === 'global' ? this.paths.globalMemory() : this.paths.projectMemory(projectId!)
  }

  search(scope: MemoryScope, query: string, projectId?: string, limit = 8) {
    const terms = keywordsFor(query)
    const entries = this.read(scope, projectId)
    const score = (entry: FileMemoryEntry) => keywordsFor(entry.content).filter(keyword => terms.some(term => keyword.includes(term) || term.includes(keyword))).length
    return entries
      .map(entry => ({ entry, score: score(entry) }))
      .filter(item => !terms.length || item.score > 0)
      .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
      .slice(0, limit)
      .map(item => item.entry)
  }

  context(scope: MemoryScope, query: string, projectId?: string) {
    return this.search(scope, query, projectId).map(entry => `- [${entry.id}] ${entry.content}`).join('\n')
  }

  remember(scope: MemoryScope, content: string, projectId?: string) {
    const value = normalize(content).slice(0, MAX_MEMORY_CONTENT)
    if (!value) throw new Error('记忆内容不能为空')
    if (SENSITIVE.some(pattern => pattern.test(value))) throw new Error('记忆内容包含敏感信息，未写入')
    const entries = this.read(scope, projectId)
    const existing = entries.find(entry => normalize(entry.content) === value)
    if (existing) return { entry: existing, created: false }
    const entry: FileMemoryEntry = { id: randomUUID().replace(/-/g, '').slice(0, 12), content: value, scope, projectId }
    this.writeEntries(scope, [...entries, entry], projectId)
    return { entry, created: true }
  }

  forget(scope: MemoryScope, id: string, projectId?: string) {
    const entries = this.read(scope, projectId)
    if (!entries.some(entry => entry.id === id)) throw new Error('未找到指定记忆')
    this.writeEntries(scope, entries.filter(entry => entry.id !== id), projectId)
  }

  resetGlobal() {
    const count = this.read('global').length
    this.writeEntries('global', [])
    return count
  }

  private read(scope: MemoryScope, projectId?: string): FileMemoryEntry[] {
    const file = this.path(scope, projectId)
    if (!existsSync(file)) return []
    return readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line, index) => {
      const match = /^-\s+(?:\[([a-zA-Z0-9_-]+)\]\s+)?(.+?)\s*$/.exec(line)
      if (!match) return []
      const content = normalize(match[2])
      if (!content) return []
      return [{ id: match[1] || `manual-${entryId(`${index}:${content}`)}`, content, scope, projectId }]
    })
  }

  private writeEntries(scope: MemoryScope, entries: FileMemoryEntry[], projectId?: string) {
    const content = [`# ${scopeTitle(scope)}`, '', ...entries.map(entry => `- [${entry.id}] ${entry.content}`), ''].join('\n')
    this.write(this.path(scope, projectId), content)
  }

  private write(path: string, content: string) {
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    writeFileSync(temporary, content, 'utf8')
    renameSync(temporary, path)
  }
}
