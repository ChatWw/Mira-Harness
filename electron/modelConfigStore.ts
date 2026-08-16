import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type Database from 'better-sqlite3'
import { MODEL_PROVIDER_PRESETS, type ModelProviderInput, type ModelProviderKey, type ModelProviderSummary, type ModelRoleBinding } from '../src/config/harness'

type JsonModelRecord = {
  id: string
  providerKey: ModelProviderKey
  name: string
  endpoint: string
  apiKey: string
  model: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

function inferProviderKey(name: string, endpoint: string): ModelProviderKey {
  const text = `${name} ${endpoint}`.toLocaleLowerCase()
  if (text.includes('glm') || text.includes('zhipu') || text.includes('bigmodel')) return 'glm'
  if (text.includes('kimi') || text.includes('moonshot')) return 'kimi'
  if (text.includes('minimax')) return 'minimax'
  if (text.includes('deepseek')) return 'deepseek'
  if (text.includes('ollama') || text.includes('11434')) return 'ollama'
  return 'custom'
}

function providerKey(value: string | undefined, name: string, endpoint: string): ModelProviderKey {
  return MODEL_PROVIDER_PRESETS.some(item => item.key === value) ? value as ModelProviderKey : inferProviderKey(name, endpoint)
}

function isRecord(value: unknown): value is JsonModelRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<JsonModelRecord>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.endpoint === 'string' && typeof item.model === 'string'
}

export class ModelConfigStore {
  private readonly configPath: string

  constructor(private readonly database: Database.Database, userDataPath: string) {
    this.configPath = join(userDataPath, 'models.json')
    mkdirSync(dirname(this.configPath), { recursive: true })
    if (!existsSync(this.configPath)) this.writeRecords([])
  }

  path() { return this.configPath }

  private readRecords(): JsonModelRecord[] {
    try {
      const parsed = JSON.parse(readFileSync(this.configPath, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter(isRecord).map(item => ({
        id: item.id,
        providerKey: providerKey(item.providerKey, item.name, item.endpoint),
        name: item.name,
        endpoint: item.endpoint,
        apiKey: typeof item.apiKey === 'string' ? item.apiKey : '',
        model: item.model,
        enabled: item.enabled !== false,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      })) : []
    } catch {
      return []
    }
  }

  private writeRecords(records: JsonModelRecord[]) {
    const temporaryPath = `${this.configPath}.${randomUUID()}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
    try { renameSync(temporaryPath, this.configPath) } catch (error) { try { unlinkSync(temporaryPath) } catch {} ; throw error }
  }

  private asSummary(record: JsonModelRecord): ModelProviderSummary {
    return {
      id: record.id,
      providerKey: record.providerKey,
      name: record.name,
      endpoint: record.endpoint,
      models: [record.model],
      enabled: record.enabled,
      hasApiKey: Boolean(record.apiKey),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }

  list(): ModelProviderSummary[] { return this.readRecords().sort((a, b) => b.updatedAt - a.updatedAt).map(record => this.asSummary(record)) }

  getSecret(id: string) { return this.readRecords().find(record => record.id === id)?.apiKey || '' }

  get(id: string) {
    const record = this.readRecords().find(item => item.id === id)
    return record ? this.asSummary(record) : undefined
  }

  save(input: ModelProviderInput) {
    const model = input.models.map(item => item.trim()).find(Boolean)
    if (!input.name.trim() || !input.endpoint.trim() || !model) throw new Error('请填写供应商名称、地址和模型名称')
    const records = this.readRecords()
    const existing = input.id ? records.find(record => record.id === input.id) : undefined
    const now = Date.now()
    const record: JsonModelRecord = {
      id: input.id || randomUUID(),
      providerKey: providerKey(input.providerKey, input.name, input.endpoint),
      name: input.name.trim(),
      endpoint: input.endpoint.trim().replace(/\/+$/, ''),
      apiKey: input.apiKey?.trim() || existing?.apiKey || '',
      model,
      enabled: Boolean(input.enabled),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
    const next = existing ? records.map(item => item.id === record.id ? record : item) : [record, ...records]
    this.writeRecords(next)
    return this.asSummary(record)
  }

  delete(id: string) {
    this.writeRecords(this.readRecords().filter(record => record.id !== id))
    this.database.prepare('DELETE FROM model_role_bindings WHERE provider_id = ?').run(id)
  }

  bindings(): ModelRoleBinding {
    const validIds = new Set(this.readRecords().map(record => record.id))
    const rows = this.database.prepare('SELECT role, provider_id, model_id FROM model_role_bindings').all() as Array<{ role: keyof ModelRoleBinding, provider_id: string, model_id: string }>
    return Object.fromEntries(rows.filter(row => validIds.has(row.provider_id)).map(row => [row.role, { providerId: row.provider_id, modelId: row.model_id }])) as ModelRoleBinding
  }

  saveBindings(bindings: ModelRoleBinding) {
    const validIds = new Set(this.readRecords().map(record => record.id))
    const write = this.database.transaction(() => {
      this.database.prepare('DELETE FROM model_role_bindings').run()
      const insert = this.database.prepare('INSERT INTO model_role_bindings(role, provider_id, model_id) VALUES (?, ?, ?)')
      Object.entries(bindings).forEach(([role, value]) => { if (value?.providerId && value.modelId && validIds.has(value.providerId)) insert.run(role, value.providerId, value.modelId) })
    })
    write()
    return this.bindings()
  }
}
