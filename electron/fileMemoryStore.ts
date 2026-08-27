import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { HarnessMemoryEntry, MemoryCandidate, MemorySensitivity, MemorySource } from '../src/config/harness'
import { MiraPaths } from './miraPaths'

export type MemoryScope = 'global' | 'project'

interface MemorySettings { enabled: boolean }
type MemoryMeta = Partial<Pick<HarnessMemoryEntry, 'source' | 'sourceSessionId' | 'sensitivity' | 'createdAt' | 'updatedAt'>>

const SECRET_PATTERNS = [
  /\b(?:api[_ -]?key|token|secret|password|passwd|private[_ -]?key)\s*[:=]\s*[^\s,'"`]+/i,
  /authorization\s*:\s*bearer\s+[^\s,'"`]+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:sk|rk|pk)-[a-z0-9_-]{12,}\b/i,
  /\b\d{15,18}[0-9xX]\b/,
]
const PERSONAL_PATTERNS = [
  /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i,
  /(?<!\d)(?:\+?\d[\d -]{8,}\d)(?!\d)/,
  /(?:银行卡|身份证|住址|地址|医疗|病历|健康|财务|收入|法律|家庭)/i,
]
const MAX_MEMORY_CONTENT = 1800

export function classifyMemoryContent(content: string): { sensitivity: MemorySensitivity, redactedContent?: string } {
  if (SECRET_PATTERNS.some(pattern => pattern.test(content))) return { sensitivity: 'secret' }
  if (!PERSONAL_PATTERNS.some(pattern => pattern.test(content))) return { sensitivity: 'none' }
  const redacted = content
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[邮箱]')
    .replace(/(?<!\d)(?:\+?\d[\d -]{8,}\d)(?!\d)/g, '[电话]')
  return { sensitivity: 'personal', redactedContent: redacted === content ? undefined : normalize(redacted) }
}

function normalize(content: string) { return content.trim().replace(/\s+/g, ' ') }
function keywordsFor(content: string) { return [...new Set((content.match(/[\p{L}\p{N}_-]{2,}/gu) || []).map(word => word.toLocaleLowerCase()))].slice(0, 12) }
function entryId(content: string) { return createHash('sha256').update(content).digest('hex').slice(0, 12) }
function scopeTitle(scope: MemoryScope) { return scope === 'global' ? 'Mira 全局记忆' : 'Mira 项目记忆' }

export class FileMemoryStore {
  constructor(private readonly paths: MiraPaths) {}

  enabled() {
    try { return (JSON.parse(readFileSync(this.paths.memorySettings(), 'utf8')) as Partial<MemorySettings>).enabled === true } catch { return false }
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

  private metaPath(scope: MemoryScope, projectId?: string) { return scope === 'global' ? this.paths.globalMemoryMeta() : this.paths.projectMemoryMeta(projectId!) }

  search(scope: MemoryScope, query: string, projectId?: string, limit = 8) {
    const terms = keywordsFor(query)
    const entries = this.read(scope, projectId)
    const score = (entry: HarnessMemoryEntry) => keywordsFor(entry.content).filter(keyword => terms.some(term => keyword.includes(term) || term.includes(keyword))).length
    return entries.map(entry => ({ entry, score: score(entry) })).filter(item => !terms.length || item.score > 0).sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id)).slice(0, limit).map(item => item.entry)
  }

  list(scope: MemoryScope, projectId?: string) { return this.read(scope, projectId).sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)) }

  context(scope: MemoryScope, query: string, projectId?: string) { return this.search(scope, query, projectId).map(entry => `- [${entry.id}] ${entry.content}`).join('\n') }

  remember(scope: MemoryScope, content: string, projectId?: string, options: { source?: Exclude<MemorySource, 'legacy'>, sourceSessionId?: string, sensitivity?: MemorySensitivity, allowPersonal?: boolean } = {}) {
    const value = normalize(content).slice(0, MAX_MEMORY_CONTENT)
    if (!value) throw new Error('记忆内容不能为空')
    const classified = classifyMemoryContent(value)
    const sensitivity = options.sensitivity || classified.sensitivity
    if (sensitivity === 'secret') throw new Error('记忆内容包含高风险敏感信息，未写入')
    if (sensitivity === 'personal' && !options.allowPersonal) throw new Error('记忆内容包含个人敏感信息，需要确认后保存')
    const entries = this.read(scope, projectId)
    const existing = entries.find(entry => normalize(entry.content) === value)
    if (existing) return { entry: existing, created: false }
    const now = Date.now()
    const entry: HarnessMemoryEntry = { id: randomUUID().replace(/-/g, '').slice(0, 12), content: value, scope, projectId, source: options.source || 'manual', sourceSessionId: options.sourceSessionId, sensitivity, createdAt: now, updatedAt: now }
    this.writeEntries(scope, [...entries, entry], projectId)
    return { entry, created: true }
  }

  update(scope: MemoryScope, id: string, content: string, projectId?: string) {
    const value = normalize(content).slice(0, MAX_MEMORY_CONTENT)
    if (!value) throw new Error('记忆内容不能为空')
    const classified = classifyMemoryContent(value)
    if (classified.sensitivity === 'secret') throw new Error('记忆内容包含高风险敏感信息，未写入')
    if (classified.sensitivity === 'personal') throw new Error('记忆内容包含个人敏感信息，请先脱敏后保存')
    const entries = this.read(scope, projectId)
    const index = entries.findIndex(entry => entry.id === id)
    if (index < 0) throw new Error('未找到指定记忆')
    const updated = { ...entries[index], content: value, sensitivity: classified.sensitivity, updatedAt: Date.now() }
    entries[index] = updated
    this.writeEntries(scope, entries, projectId)
    return updated
  }

  delete(scope: MemoryScope, id: string, projectId?: string) {
    const entries = this.read(scope, projectId)
    if (!entries.some(entry => entry.id === id)) throw new Error('未找到指定记忆')
    this.writeEntries(scope, entries.filter(entry => entry.id !== id), projectId)
  }

  forget(scope: MemoryScope, id: string, projectId?: string) { return this.delete(scope, id, projectId) }

  resetGlobal() {
    const count = this.read('global').length
    this.writeEntries('global', [])
    return count
  }

  listPending() {
    try {
      const value = JSON.parse(readFileSync(this.paths.pendingMemory(), 'utf8'))
      return Array.isArray(value) ? value as MemoryCandidate[] : []
    } catch { return [] }
  }

  savePending(candidate: MemoryCandidate) {
    const entries = this.listPending().filter(item => item.id !== candidate.id)
    this.write(this.paths.pendingMemory(), `${JSON.stringify([...entries, candidate], null, 2)}\n`)
    return candidate
  }

  removePending(id: string) { this.write(this.paths.pendingMemory(), `${JSON.stringify(this.listPending().filter(item => item.id !== id), null, 2)}\n`) }

  private read(scope: MemoryScope, projectId?: string): HarnessMemoryEntry[] {
    const file = this.path(scope, projectId)
    if (!existsSync(file)) return []
    const metadata = this.readMetadata(scope, projectId)
    const fallbackTime = statSync(file).mtimeMs || Date.now()
    return readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line, index) => {
      const match = /^-\s+(?:\[([a-zA-Z0-9_-]+)\]\s+)?(.+?)\s*$/.exec(line)
      if (!match) return []
      const content = normalize(match[2])
      if (!content) return []
      const id = match[1] || `manual-${entryId(`${index}:${content}`)}`
      const meta = metadata[id] || {}
      return [{ id, content, scope, projectId, source: meta.source || 'legacy', sourceSessionId: meta.sourceSessionId, sensitivity: meta.sensitivity || classifyMemoryContent(content).sensitivity, createdAt: meta.createdAt || fallbackTime, updatedAt: meta.updatedAt || fallbackTime }]
    })
  }

  private readMetadata(scope: MemoryScope, projectId?: string): Record<string, MemoryMeta> {
    try {
      const value = JSON.parse(readFileSync(this.metaPath(scope, projectId), 'utf8'))
      return value && typeof value === 'object' ? value as Record<string, MemoryMeta> : {}
    } catch { return {} }
  }

  private writeEntries(scope: MemoryScope, entries: HarnessMemoryEntry[], projectId?: string) {
    const content = [`# ${scopeTitle(scope)}`, '', ...entries.map(entry => `- [${entry.id}] ${entry.content}`), ''].join('\n')
    const metadata = Object.fromEntries(entries.map(entry => [entry.id, { source: entry.source, sourceSessionId: entry.sourceSessionId, sensitivity: entry.sensitivity, createdAt: entry.createdAt, updatedAt: entry.updatedAt }]))
    this.write(this.path(scope, projectId), content)
    this.write(this.metaPath(scope, projectId), `${JSON.stringify(metadata, null, 2)}\n`)
  }

  private write(path: string, content: string) {
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    writeFileSync(temporary, content, 'utf8')
    renameSync(temporary, path)
  }
}
