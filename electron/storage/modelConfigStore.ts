import { modelProtocol, type ModelProtocol } from '../../src/config/modelProtocol'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { DEFAULT_CONTEXT_WINDOW, inferModelReasoning, MODEL_PROVIDER_PRESETS, type ModelPricing, type ModelProviderAuthMode, type ModelProviderInput, type ModelProviderKey, type ModelProviderSummary, type ModelRoleBinding, type ProviderModelConfig } from '../../src/config/harness'
import { MiraPaths } from './miraPaths'
import { normalizePricing } from '../services/usageCost'
import type { ModelServiceSummary } from '../../src/config/harness'

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
  builtin?: boolean
  legacyIds?: string[]
  providerKey: ModelProviderKey
  slug?: string
  name: string
  endpoint: string
  apiKey: string
  authMode: ModelProviderAuthMode
  protocol?: ModelProtocol
  models: ProviderModelConfig[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}

type ModelConfigDocument = { version: 2, providers: JsonProviderRecord[], bindings: ModelRoleBinding, services?: ModelServiceSummary[] }

const serviceId = (record: JsonProviderRecord) => record.slug || (record.providerKey === 'custom' ? record.id.replace(/[^A-Za-z0-9]/g, '') : record.providerKey)

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

/** 服务商标识：仅保留英文字母与数字，用于区分同名服务商。 */
function normalizeSlug(value?: string) {
  const text = (value || '').replace(/[^A-Za-z0-9]/g, '')
  return text || undefined
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
    ...(typeof model.multimodal === 'boolean' ? { multimodal: model.multimodal } : {}),
    ...(typeof model.pdfInput === 'boolean' ? { pdfInput: model.pdfInput } : {}),
    ...(typeof model.videoInput === 'boolean' ? { videoInput: model.videoInput } : {}),
    contextWindow: contextWindow(model.contextWindow),
    ...(typeof model.maxTokens === 'number' && Number.isFinite(model.maxTokens) && model.maxTokens > 0
      ? { maxTokens: Math.floor(model.maxTokens) } : {}),
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
    ...(typeof item.builtin === 'boolean' ? { builtin: item.builtin } : {}),
    ...(Array.isArray(item.legacyIds) ? { legacyIds: item.legacyIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())) } : {}),
    providerKey: key,
    ...(normalizeSlug(item.slug) ? { slug: normalizeSlug(item.slug) } : {}),
    name: item.name.trim(),
    endpoint: normalizeEndpoint(item.endpoint),
    apiKey: typeof item.apiKey === 'string' ? item.apiKey : '',
    authMode: item.authMode === 'none' ? 'none' : defaultAuthMode(key),
    protocol: modelProtocol(item.protocol),
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
      // 旧配置没有实例身份：每个内置服务商最早创建的一条为默认实例。
      for (const preset of MODEL_PROVIDER_PRESETS.filter(item => item.key !== 'custom')) {
        const instances = providers.filter(item => item.providerKey === preset.key)
        const builtin = instances.find(item => item.builtin === true)
          || instances.filter(item => item.builtin === undefined).sort((a, b) => a.createdAt - b.createdAt)[0]
        for (const item of instances) item.builtin ??= item === builtin
      }
      const services = Array.isArray(parsed.services) ? parsed.services.map(service => ({ ...service })) : []
      // 兼容旧配置：连接 ID 与会话引用不变，仅补齐父服务商信息。
      for (const record of [...providers].sort((a, b) => a.createdAt - b.createdAt)) {
        const id = serviceId(record)
        let service = services.find(item => item.id === id)
        if (!service) {
          service = { id, providerKey: record.providerKey, name: record.name, endpoint: record.endpoint,
            authMode: record.authMode, protocol: modelProtocol(record.protocol), hasInstances: false }
          services.push(service)
        }
        if (providers.filter(item => serviceId(item) === id).length > 1) service.hasInstances = true
      }
      return { version: 2, providers, services, bindings: parsed.bindings && typeof parsed.bindings === 'object' ? parsed.bindings : {} }
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

  private recordById(id: string) {
    return this.readRecords().find(record => record.id === id || record.legacyIds?.includes(id))
  }

  private asSummary(record: JsonProviderRecord): ModelProviderSummary {
    return {
      id: record.id,
      builtin: record.builtin === true,
      providerKey: record.providerKey,
      slug: serviceId(record),
      name: record.name,
      endpoint: record.endpoint,
      authMode: record.authMode,
      protocol: modelProtocol(record.protocol),
      models: record.models,
      enabled: record.enabled,
      hasApiKey: Boolean(record.apiKey),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }

  list(): ModelProviderSummary[] { return this.readRecords().sort((a, b) => b.updatedAt - a.updatedAt).map(record => this.asSummary(record)) }

  services(): ModelServiceSummary[] { return this.readDocument().services || [] }

  getSecret(id: string) { return this.recordById(id)?.apiKey || '' }

  get(id: string) {
    const record = this.recordById(id)
    return record ? this.asSummary(record) : undefined
  }

  save(input: ModelProviderInput) {
    if (!input.name.trim() || !input.endpoint.trim()) throw new Error('请填写供应商名称和 Endpoint')
    const document = this.readDocument()
    const records = document.providers
    const existing = input.id ? records.find(record => record.id === input.id || record.legacyIds?.includes(input.id!)) : undefined
    const now = Date.now()
    const key = existing?.providerKey || providerKey(input.providerKey, input.name, input.endpoint)
    const slug = existing ? serviceId(existing) : normalizeSlug(input.slug) || (key === 'custom' ? normalizeSlug(input.id || randomUUID())! : key)
    const services = document.services || []
    let service = services.find(item => item.id === slug)
    if (!existing && !input.asInstance && input.serviceName && (
      services.some(item => item.id.toLocaleLowerCase() === slug.toLocaleLowerCase())
      || key === 'custom' && MODEL_PROVIDER_PRESETS.some(item => item.key.toLocaleLowerCase() === slug.toLocaleLowerCase())
    )) throw new Error('Provider ID 已存在')
    if (!service) {
      const preset = MODEL_PROVIDER_PRESETS.find(item => item.key === key && key !== 'custom')
      service = { id: slug, providerKey: key, name: input.serviceName?.trim() || input.name.trim(),
        ...(input.serviceLogo ? { logo: input.serviceLogo } : {}),
        endpoint: input.asInstance && preset ? preset.endpoint : normalizeEndpoint(input.endpoint),
        authMode: input.asInstance && preset ? preset.authMode : input.authMode || defaultAuthMode(key),
        protocol: modelProtocol(input.protocol), hasInstances: false }
      services.push(service)
    }
    if (input.asInstance) {
      // 首次添加实例时，把服务商当前连接保留为默认实例。
      if (!records.some(item => serviceId(item) === slug)) records.push({
        id: randomUUID(), builtin: true, providerKey: key, slug, name: service.name,
        endpoint: service.endpoint, authMode: service.authMode, protocol: service.protocol,
        apiKey: '', models: [], enabled: false, createdAt: now, updatedAt: now,
      })
      service.hasInstances = true
    }
    const models = input.models.map(normalizeModel).filter((model): model is ProviderModelConfig => Boolean(model))
      .filter((model, index, source) => source.findIndex(candidate => candidate.id === model.id) === index)
    const record: JsonProviderRecord = {
      id: existing?.id || input.id || randomUUID(),
      builtin: existing?.builtin ?? input.builtin === true,
      ...(existing?.legacyIds?.length ? { legacyIds: existing.legacyIds } : {}),
      providerKey: key,
      slug,
      name: input.name.trim(),
      endpoint: normalizeEndpoint(input.endpoint),
      apiKey: input.apiKey?.trim() || existing?.apiKey || '',
      authMode: input.authMode || existing?.authMode || defaultAuthMode(key),
      protocol: modelProtocol(input.protocol || existing?.protocol),
      models,
      enabled: Boolean(input.enabled),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
    const next = existing ? records.map(item => item.id === existing.id ? record : item) : [record, ...records]
    this.writeDocument({ ...document, providers: next, services })
    return this.asSummary(record)
  }

  delete(id: string) {
    const record = this.recordById(id)
    if (!record) return
    if (record.builtin) throw new Error('默认实例不能删除')
    const document = this.readDocument()
    document.providers = document.providers.filter(candidate => candidate.id !== record.id)
    if (!document.providers.some(item => serviceId(item) === serviceId(record))) {
      const service = document.services?.find(item => item.id === serviceId(record))
      if (service) service.hasInstances = false
    }
    this.writeDocument(document)
    ;[record.id, ...(record.legacyIds || [])].forEach(providerId => this.database.prepare('DELETE FROM model_role_bindings WHERE provider_id = ?').run(providerId))
  }

  deleteService(id: string) {
    if (MODEL_PROVIDER_PRESETS.some(preset => preset.key !== 'custom' && preset.key === id)) throw new Error('内置服务商不能删除')
    const document = this.readDocument()
    const removed = document.providers.filter(record => serviceId(record) === id)
    const removedIds = new Set(removed.flatMap(record => [record.id, ...(record.legacyIds || [])]))
    document.providers = document.providers.filter(record => serviceId(record) !== id)
    document.services = document.services?.filter(service => service.id !== id)
    document.bindings = Object.fromEntries(Object.entries(document.bindings).filter(([, selection]) => !removedIds.has(selection.providerId)))
    this.writeDocument(document)
    this.database.transaction(() => {
      for (const providerId of removedIds) this.database.prepare('DELETE FROM model_role_bindings WHERE provider_id = ?').run(providerId)
    })()
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
