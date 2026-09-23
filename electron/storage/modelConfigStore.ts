import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { DEFAULT_CONTEXT_WINDOW, inferModelReasoning, MODEL_PROVIDER_PRESETS, type ModelPricing, type ModelProviderAuthMode, type ModelProviderInput, type ModelProviderKey, type ModelProviderSummary, type ModelRoleBinding, type ProviderModelConfig } from '../../src/config/harness'
import { MiraPaths } from './miraPaths'
import { normalizePricing } from '../services/usageCost'

type LegacyJsonModelRecord = {
  id: string
  providerKey?: ModelProviderKey
  name: string
  endpoint: string
  apiKey?: string
  model: string
  reasoning?: boolean
  contextWindow?: number
  pricing?: ModelPricing
  enabled?: boolean
  createdAt?: number
  updatedAt?: number
}

type JsonProviderRecord = {
  id: string
  legacyIds?: string[]
  providerKey: ModelProviderKey
  name: string
  endpoint: string
  apiKey: string
  authMode: ModelProviderAuthMode
  models: ProviderModelConfig[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}

type ModelConfigDocument = { version: 2, providers: JsonProviderRecord[], bindings: ModelRoleBinding }

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

function defaultAuthMode(key: ModelProviderKey): ModelProviderAuthMode {
  return key === 'ollama' ? 'none' : 'api-key'
}

function normalizeEndpoint(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function contextWindow(value: unknown) {
  const tokens = Number(value)
  return Number.isInteger(tokens) && tokens >= 16384 ? tokens : DEFAULT_CONTEXT_WINDOW
}

function normalizeModel(value: unknown): ProviderModelConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const model = value as Partial<ProviderModelConfig>
  const id = typeof model.id === 'string' ? model.id.trim() : ''
  if (!id) return undefined
  const pricing = normalizePricing(model.pricing)
  return {
    id,
    enabled: model.enabled !== false,
    reasoning: typeof model.reasoning === 'boolean' ? model.reasoning : inferModelReasoning(id),
    contextWindow: contextWindow(model.contextWindow),
    ...(pricing ? { pricing } : {}),
  }
}

function normalizeProvider(value: unknown): JsonProviderRecord | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Partial<JsonProviderRecord>
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.endpoint !== 'string') return undefined
  const key = providerKey(item.providerKey, item.name, item.endpoint)
  const models = Array.isArray(item.models) ? item.models.map(normalizeModel).filter((model): model is ProviderModelConfig => Boolean(model)) : []
  return {
    id: item.id,
    ...(Array.isArray(item.legacyIds) ? { legacyIds: item.legacyIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())) } : {}),
    providerKey: key,
    name: item.name.trim(),
    endpoint: normalizeEndpoint(item.endpoint),
    apiKey: typeof item.apiKey === 'string' ? item.apiKey : '',
    authMode: item.authMode === 'none' ? 'none' : defaultAuthMode(key),
    models,
    enabled: item.enabled !== false,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
  }
}

function isLegacyRecord(value: unknown): value is LegacyJsonModelRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<LegacyJsonModelRecord>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.endpoint === 'string' && typeof item.model === 'string'
}

export class ModelConfigStore {
  private readonly configPath: string

  constructor(private readonly database: Database.Database, input: MiraPaths | string) {
    const paths = typeof input === 'string' ? new MiraPaths(input) : input
    this.configPath = paths.modelsConfig()
    mkdirSync(paths.config, { recursive: true })
    if (!existsSync(this.configPath)) this.writeDocument({ version: 2, providers: [], bindings: {} })
    else this.migrateV1Document()
  }

  path() { return this.configPath }

  private migrateV1Document() {
    let parsed: unknown
    try { parsed = JSON.parse(readFileSync(this.configPath, 'utf8')) } catch { return }
    if (!Array.isArray(parsed) && parsed && typeof parsed === 'object' && (parsed as { version?: unknown }).version === 2) return
    const source = Array.isArray(parsed) ? { providers: parsed, bindings: {} } : parsed && typeof parsed === 'object' ? parsed as { providers?: unknown, bindings?: unknown } : {}
    const legacy = Array.isArray(source.providers) ? source.providers.filter(isLegacyRecord) : []
    const grouped = new Map<string, JsonProviderRecord>()
    const canonicalIds = new Map<string, string>()

    legacy.forEach(item => {
      const key = providerKey(item.providerKey, item.name, item.endpoint)
      const endpoint = normalizeEndpoint(item.endpoint)
      const apiKey = typeof item.apiKey === 'string' ? item.apiKey : ''
      const groupKey = `${key}\u0000${endpoint.toLocaleLowerCase()}\u0000${apiKey}`
      const existing = grouped.get(groupKey)
      const model = normalizeModel({ id: item.model, enabled: item.enabled, reasoning: item.reasoning, contextWindow: item.contextWindow, pricing: item.pricing })
      if (!existing) {
        const record: JsonProviderRecord = {
          id: item.id,
          providerKey: key,
          name: item.name.trim(),
          endpoint,
          apiKey,
          authMode: defaultAuthMode(key),
          models: model ? [model] : [],
          enabled: item.enabled !== false,
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
        }
        grouped.set(groupKey, record)
        canonicalIds.set(item.id, record.id)
        return
      }
      canonicalIds.set(item.id, existing.id)
      existing.legacyIds = [...new Set([...(existing.legacyIds || []), item.id])]
      if (model && !existing.models.some(candidate => candidate.id === model.id)) existing.models.push(model)
      existing.enabled = existing.enabled || item.enabled !== false
      existing.createdAt = Math.min(existing.createdAt, typeof item.createdAt === 'number' ? item.createdAt : existing.createdAt)
      existing.updatedAt = Math.max(existing.updatedAt, typeof item.updatedAt === 'number' ? item.updatedAt : existing.updatedAt)
    })

    const rawBindings = source.bindings && typeof source.bindings === 'object' ? source.bindings as ModelRoleBinding : {}
    const bindings = Object.fromEntries(Object.entries(rawBindings).flatMap(([role, selection]) => {
      if (!selection?.providerId || !selection.modelId) return []
      return [[role, { ...selection, providerId: canonicalIds.get(selection.providerId) || selection.providerId }]]
    })) as ModelRoleBinding
    const backupPath = `${this.configPath}.v1.bak`
    if (!existsSync(backupPath)) copyFileSync(this.configPath, backupPath)
    this.writeDocument({ version: 2, providers: [...grouped.values()], bindings })
  }

  private readDocument(): ModelConfigDocument {
    try {
      const parsed = JSON.parse(readFileSync(this.configPath, 'utf8')) as Partial<ModelConfigDocument>
      const providers = Array.isArray(parsed.providers) ? parsed.providers.map(normalizeProvider).filter((provider): provider is JsonProviderRecord => Boolean(provider)) : []
      return { version: 2, providers, bindings: parsed.bindings && typeof parsed.bindings === 'object' ? parsed.bindings : {} }
    } catch {
      return { version: 2, providers: [], bindings: {} }
    }
  }

  private readRecords() { return this.readDocument().providers }

  private writeDocument(document: ModelConfigDocument) {
    const temporaryPath = `${this.configPath}.${randomUUID()}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    try { renameSync(temporaryPath, this.configPath) } catch (error) { try { unlinkSync(temporaryPath) } catch {} ; throw error }
  }

  private writeRecords(records: JsonProviderRecord[]) { this.writeDocument({ ...this.readDocument(), providers: records }) }

  private recordById(id: string) {
    return this.readRecords().find(record => record.id === id || record.legacyIds?.includes(id))
  }

  private asSummary(record: JsonProviderRecord): ModelProviderSummary {
    return {
      id: record.id,
      providerKey: record.providerKey,
      name: record.name,
      endpoint: record.endpoint,
      authMode: record.authMode,
      models: record.models,
      enabled: record.enabled,
      hasApiKey: Boolean(record.apiKey),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }

  list(): ModelProviderSummary[] { return this.readRecords().sort((a, b) => b.updatedAt - a.updatedAt).map(record => this.asSummary(record)) }

  getSecret(id: string) { return this.recordById(id)?.apiKey || '' }

  get(id: string) {
    const record = this.recordById(id)
    return record ? this.asSummary(record) : undefined
  }

  save(input: ModelProviderInput) {
    if (!input.name.trim() || !input.endpoint.trim()) throw new Error('请填写供应商名称和 Endpoint')
    const records = this.readRecords()
    const existing = input.id ? records.find(record => record.id === input.id || record.legacyIds?.includes(input.id!)) : undefined
    const now = Date.now()
    const key = providerKey(input.providerKey, input.name, input.endpoint)
    const models = input.models.map(normalizeModel).filter((model): model is ProviderModelConfig => Boolean(model))
      .filter((model, index, source) => source.findIndex(candidate => candidate.id === model.id) === index)
    const record: JsonProviderRecord = {
      id: existing?.id || input.id || randomUUID(),
      ...(existing?.legacyIds?.length ? { legacyIds: existing.legacyIds } : {}),
      providerKey: key,
      name: input.name.trim(),
      endpoint: normalizeEndpoint(input.endpoint),
      apiKey: input.apiKey?.trim() || existing?.apiKey || '',
      authMode: input.authMode || existing?.authMode || defaultAuthMode(key),
      models,
      enabled: Boolean(input.enabled),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
    const next = existing ? records.map(item => item.id === existing.id ? record : item) : [record, ...records]
    this.writeRecords(next)
    return this.asSummary(record)
  }

  delete(id: string) {
    const record = this.recordById(id)
    if (!record) return
    this.writeRecords(this.readRecords().filter(candidate => candidate.id !== record.id))
    ;[record.id, ...(record.legacyIds || [])].forEach(providerId => this.database.prepare('DELETE FROM model_role_bindings WHERE provider_id = ?').run(providerId))
  }

  bindings(): ModelRoleBinding {
    const records = this.readRecords()
    const canonicalId = (id: string) => records.find(record => record.id === id || record.legacyIds?.includes(id))?.id
    return Object.fromEntries(Object.entries(this.readDocument().bindings).flatMap(([role, selection]) => {
      if (!selection?.providerId || !selection.modelId) return []
      const providerId = canonicalId(selection.providerId)
      return providerId ? [[role, { ...selection, providerId }]] : []
    })) as ModelRoleBinding
  }

  saveBindings(bindings: ModelRoleBinding) {
    const records = this.readRecords()
    const canonicalId = (id: string) => records.find(record => record.id === id || record.legacyIds?.includes(id))?.id
    const document = this.readDocument()
    document.bindings = Object.fromEntries(Object.entries(bindings).flatMap(([role, selection]) => {
      if (!selection?.providerId || !selection.modelId) return []
      const providerId = canonicalId(selection.providerId)
      return providerId ? [[role, { ...selection, providerId }]] : []
    })) as ModelRoleBinding
    this.writeDocument(document)
    return this.bindings()
  }

  migrateLegacyProviderReferences() {
    const replacements = this.readRecords().flatMap(record => (record.legacyIds || []).map(legacyId => ({ legacyId, providerId: record.id })))
    if (!replacements.length) return
    const existingTables = new Set((this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(row => row.name))
    const targets = [
      ['model_role_bindings', 'provider_id'],
      ['harness_sessions', 'model_provider_id'],
      ['harness_projects', 'default_model_provider_id'],
      ['automation_tasks', 'provider_id'],
    ] as const
    this.database.transaction(() => {
      replacements.forEach(({ legacyId, providerId }) => targets.forEach(([table, column]) => {
        if (existingTables.has(table)) this.database.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(providerId, legacyId)
      }))
    })()
  }

  migrateLegacyBindings() {
    const document = this.readDocument()
    if (Object.keys(document.bindings).length) return
    const records = document.providers
    const canonicalId = (id: string) => records.find(record => record.id === id || record.legacyIds?.includes(id))?.id
    const rows = this.database.prepare('SELECT role, provider_id, model_id FROM model_role_bindings').all() as Array<{ role: keyof ModelRoleBinding, provider_id: string, model_id: string }>
    const bindings = Object.fromEntries(rows.flatMap(row => {
      const providerId = canonicalId(row.provider_id)
      return providerId ? [[row.role, { providerId, modelId: row.model_id }]] : []
    })) as ModelRoleBinding
    if (Object.keys(bindings).length) this.writeDocument({ ...document, bindings })
  }
}
