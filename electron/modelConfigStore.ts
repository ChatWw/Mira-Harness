import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { DEFAULT_CONTEXT_WINDOW, inferModelReasoning, MODEL_PROVIDER_PRESETS, type ModelPricing, type ModelProviderInput, type ModelProviderKey, type ModelProviderSummary, type ModelRoleBinding } from '../src/config/harness'
import { MiraPaths } from './miraPaths'
import { normalizePricing } from './usageCost'

type JsonModelRecord = {
  id: string
  providerKey: ModelProviderKey
  name: string
  endpoint: string
  apiKey: string
  model: string
  reasoning: boolean
  contextWindow: number
  pricing?: ModelPricing
  enabled: boolean
  createdAt: number
  updatedAt: number
}

type ModelConfigDocument = { version: 1, providers: JsonModelRecord[], bindings: ModelRoleBinding }

function inferProviderKey(name: string, endpoint: string): ModelProviderKey {
  const text = `${name} ${endpoint}`.toLocaleLowerCase()
  if (text.includes('glm') || text.includes('zhipu') || text.includes('bigmodel')) return 'glm'
  if (text.includes('kimi') || text.includes('moonshot')) return 'kimi'
  if (text.includes('minimax')) return 'minimax'
  if (text.includes('deepseek')) return 'deepseek'
  if (text.includes('qwen') || text.includes('千问') || text.includes('dashscope') || text.includes('aliyun') || text.includes('tongyi')) return 'qwen'
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

function contextWindow(value: unknown) {
  const tokens = Number(value)
  return Number.isInteger(tokens) && tokens >= 16384 ? tokens : DEFAULT_CONTEXT_WINDOW
}

export class ModelConfigStore {
  private readonly configPath: string

  constructor(private readonly database: Database.Database, input: MiraPaths | string) {
    const paths = typeof input === 'string' ? new MiraPaths(input) : input
    this.configPath = paths.modelsConfig()
    mkdirSync(paths.config, { recursive: true })
    if (!existsSync(this.configPath)) this.writeDocument({ version: 1, providers: [], bindings: {} })
  }

  path() { return this.configPath }

  private readDocument(): ModelConfigDocument {
    try {
      const parsed = JSON.parse(readFileSync(this.configPath, 'utf8'))
      const source = Array.isArray(parsed) ? { providers: parsed, bindings: {} } : parsed as Partial<ModelConfigDocument>
      const providers = Array.isArray(source.providers) ? source.providers.filter(isRecord).map(item => ({
        id: item.id,
        providerKey: providerKey(item.providerKey, item.name, item.endpoint),
        name: item.name,
        endpoint: item.endpoint,
        apiKey: typeof item.apiKey === 'string' ? item.apiKey : '',
        model: item.model,
        reasoning: typeof item.reasoning === 'boolean' ? item.reasoning : inferModelReasoning(item.model),
        contextWindow: contextWindow(item.contextWindow),
        pricing: normalizePricing(item.pricing),
        enabled: item.enabled !== false,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      })) : []
      return { version: 1, providers, bindings: source.bindings && typeof source.bindings === 'object' ? source.bindings : {} }
    } catch {
      return { version: 1, providers: [], bindings: {} }
    }
  }

  private readRecords() { return this.readDocument().providers }

  private writeDocument(document: ModelConfigDocument) {
    const temporaryPath = `${this.configPath}.${randomUUID()}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    try { renameSync(temporaryPath, this.configPath) } catch (error) { try { unlinkSync(temporaryPath) } catch {} ; throw error }
  }

  private writeRecords(records: JsonModelRecord[]) { this.writeDocument({ ...this.readDocument(), providers: records }) }

  private asSummary(record: JsonModelRecord): ModelProviderSummary {
    return {
      id: record.id,
      providerKey: record.providerKey,
      name: record.name,
      endpoint: record.endpoint,
      models: [record.model],
      reasoning: record.reasoning,
      contextWindow: record.contextWindow,
      ...(record.pricing ? { pricing: record.pricing } : {}),
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
      reasoning: typeof input.reasoning === 'boolean' ? input.reasoning : existing?.reasoning || inferModelReasoning(model),
      contextWindow: contextWindow(input.contextWindow ?? existing?.contextWindow),
      pricing: input.pricing === null ? undefined : (normalizePricing(input.pricing) || existing?.pricing),
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
    return Object.fromEntries(Object.entries(this.readDocument().bindings).filter(([, value]) => Boolean(value?.providerId && validIds.has(value.providerId)))) as ModelRoleBinding
  }

  saveBindings(bindings: ModelRoleBinding) {
    const validIds = new Set(this.readRecords().map(record => record.id))
    const document = this.readDocument()
    document.bindings = Object.fromEntries(Object.entries(bindings).filter(([, value]) => Boolean(value?.providerId && value.modelId && validIds.has(value.providerId)))) as ModelRoleBinding
    this.writeDocument(document)
    return this.bindings()
  }

  migrateLegacyBindings() {
    const document = this.readDocument()
    if (Object.keys(document.bindings).length) return
    const validIds = new Set(document.providers.map(record => record.id))
    const rows = this.database.prepare('SELECT role, provider_id, model_id FROM model_role_bindings').all() as Array<{ role: keyof ModelRoleBinding, provider_id: string, model_id: string }>
    const bindings = Object.fromEntries(rows.filter(row => validIds.has(row.provider_id)).map(row => [row.role, { providerId: row.provider_id, modelId: row.model_id }])) as ModelRoleBinding
    if (Object.keys(bindings).length) this.writeDocument({ ...document, bindings })
  }
}
