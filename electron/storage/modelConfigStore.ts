import { modelProtocol, type ModelProtocol } from '../../src/config/modelProtocol'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { DEFAULT_CONTEXT_WINDOW, inferModelReasoning, MODEL_PROVIDER_PRESETS, MODEL_PROVIDER_BUILTIN_INSTANCES, type ModelProviderAuthMode, type ModelProviderInput, type ModelProviderKey, type ModelProviderSummary, type ModelRoleBinding, type ProviderModelConfig } from '../../src/config/harness'
import { MiraPaths } from './miraPaths'
import { normalizePricing } from '../services/usageCost'
import type { ModelApiKey, ModelServiceSummary } from '../../src/config/harness'

type JsonProviderRecord = {
  id: string
  builtin?: boolean
  providerKey: ModelProviderKey
  slug?: string
  name: string
  endpoint: string
  apiKey: string
  apiKeys?: ModelApiKey[]
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
  return Number.isSafeInteger(tokens) && tokens > 0 ? tokens : DEFAULT_CONTEXT_WINDOW
}

function normalizeModel(value: unknown): ProviderModelConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const model = value as Partial<ProviderModelConfig>
  const id = typeof model.id === 'string' ? model.id.trim() : ''
  if (!id) return undefined
  const pricing = normalizePricing(model.pricing)
  return {
    id,
    ...(typeof model.name === 'string' && model.name.trim() ? { name: model.name.trim() } : {}),
    enabled: model.enabled !== false,
    ...(['chat', 'image', 'embedding', 'reranking'].includes(model.modelType || '') ? { modelType: model.modelType } : {}),
    reasoning: typeof model.reasoning === 'boolean' ? model.reasoning : inferModelReasoning(id),
    ...(typeof model.toolCall === 'boolean' ? { toolCall: model.toolCall } : {}),
    ...(typeof model.multimodal === 'boolean' ? { multimodal: model.multimodal } : {}),
    ...(typeof model.audioInput === 'boolean' ? { audioInput: model.audioInput } : {}),
    ...(typeof model.pdfInput === 'boolean' ? { pdfInput: model.pdfInput } : {}),
    ...(typeof model.videoInput === 'boolean' ? { videoInput: model.videoInput } : {}),
    contextWindow: contextWindow(model.contextWindow),
    ...(typeof model.maxTokens === 'number' && Number.isFinite(model.maxTokens) && model.maxTokens > 0
      ? { maxTokens: Math.floor(model.maxTokens) } : {}),
    ...(pricing ? { pricing } : {}),
  }
}

function normalizeApiKeys(values: ModelApiKey[]) {
  const keys = values.filter(item => typeof item?.value === 'string' && item.value.trim()).map(item => ({
    id: item.id || randomUUID(), label: typeof item.label === 'string' ? item.label.trim() : '', value: item.value.trim(),
  }))
  if (new Set(keys.map(item => item.id)).size !== keys.length || new Set(keys.map(item => item.value)).size !== keys.length) throw new Error('不能添加重复的 API 密钥')
  return keys
}

function recordApiKeys(record: JsonProviderRecord): ModelApiKey[] {
  return record.apiKeys ?? []
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
    providerKey: key,
    ...(normalizeSlug(item.slug) ? { slug: normalizeSlug(item.slug) } : {}),
    name: item.name.trim(),
    endpoint: normalizeEndpoint(item.endpoint),
    apiKey: typeof item.apiKey === 'string' ? item.apiKey : '',
    ...(Array.isArray(item.apiKeys) ? { apiKeys: normalizeApiKeys(item.apiKeys) } : {}),
    authMode: item.authMode === 'none' ? 'none' : defaultAuthMode(key),
    protocol: modelProtocol(item.protocol),
    models,
    enabled: item.enabled !== false,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
  }
}

export class ModelConfigStore {
  private readonly configPath: string

  constructor(input: MiraPaths | string) {
    const paths = typeof input === 'string' ? new MiraPaths(input) : input
    this.configPath = paths.modelsConfig()
    mkdirSync(paths.config, { recursive: true })
    if (!existsSync(this.configPath)) this.writeDocument({ version: 2, providers: [], bindings: {} })
  }

  path() { return this.configPath }

  ensureBuiltinInstances() {
    const document = this.readDocument(), now = Date.now()
    for (const preset of MODEL_PROVIDER_BUILTIN_INSTANCES) {
      if (!document.providers.some(item => item.id === preset.id)) document.providers.push({ id: preset.id, builtin: true, providerKey: preset.providerKey, slug: preset.providerKey, name: preset.name, endpoint: preset.endpoint, apiKey: '', apiKeys: [], authMode: 'api-key', protocol: 'openai-completions', models: [], enabled: false, createdAt: now, updatedAt: now })
    }
    for (const key of ['glm', 'kimi'] as const) {
      const preset = MODEL_PROVIDER_BUILTIN_INSTANCES.find(item => item.providerKey === key)!
      const services = document.services ??= []
      const service = services.find(item => item.id === key)
      if (service) { service.name = key === 'glm' ? '智谱' : '月之暗面'; service.hasInstances = true }
      else services.push({ id: key, providerKey: key, name: key === 'glm' ? '智谱' : '月之暗面', endpoint: preset.endpoint, authMode: 'api-key', protocol: 'openai-completions', hasInstances: true })
    }
    this.writeDocument(document)
  }

  private readDocument(): ModelConfigDocument {
    try {
      const parsed = JSON.parse(readFileSync(this.configPath, 'utf8')) as Partial<ModelConfigDocument>
      const providers = Array.isArray(parsed.providers) ? parsed.providers.map(normalizeProvider).filter((provider): provider is JsonProviderRecord => Boolean(provider)) : []
      const services = Array.isArray(parsed.services) ? parsed.services.map(service => ({ ...service })) : []
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
    return this.readRecords().find(record => record.id === id)
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

  getApiKeys(id: string) { const record = this.recordById(id); return record ? recordApiKeys(record) : [] }

  getSecret(id: string) { return this.recordById(id)?.apiKey || '' }

  get(id: string) {
    const record = this.recordById(id)
    return record ? this.asSummary(record) : undefined
  }

  save(input: ModelProviderInput) {
    if (!input.name.trim() || !input.endpoint.trim()) throw new Error('请填写供应商名称和 Endpoint')
    const document = this.readDocument()
    const records = document.providers
    const existing = input.id ? records.find(record => record.id === input.id) : undefined
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
    const id = existing?.id || input.id || randomUUID()
    let apiKeys = existing ? recordApiKeys(existing) : input.apiKey?.trim() ? [{ id: `${id}-default`, label: '', value: input.apiKey.trim() }] : []
    if (input.apiKeys !== undefined) apiKeys = normalizeApiKeys(input.apiKeys)
    const record: JsonProviderRecord = {
      id,
      builtin: existing?.builtin ?? input.builtin === true,
      providerKey: key,
      slug,
      name: input.name.trim(),
      endpoint: normalizeEndpoint(input.endpoint),
      apiKey: input.clearApiKey ? '' : input.apiKey?.trim() || existing?.apiKey || '',
      apiKeys,
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
    document.bindings = Object.fromEntries(Object.entries(document.bindings).filter(([, selection]) => selection.providerId !== record.id))
    this.writeDocument(document)
  }

  deleteService(id: string) {
    if (MODEL_PROVIDER_PRESETS.some(preset => preset.key !== 'custom' && preset.key === id)) throw new Error('内置服务商不能删除')
    const document = this.readDocument()
    const removed = document.providers.filter(record => serviceId(record) === id)
    const removedIds = new Set(removed.map(record => record.id))
    document.providers = document.providers.filter(record => serviceId(record) !== id)
    document.services = document.services?.filter(service => service.id !== id)
    document.bindings = Object.fromEntries(Object.entries(document.bindings).filter(([, selection]) => !removedIds.has(selection.providerId)))
    this.writeDocument(document)
  }

  bindings(): ModelRoleBinding {
    const records = this.readRecords()
    const canonicalId = (id: string) => records.find(record => record.id === id)?.id
    return Object.fromEntries(Object.entries(this.readDocument().bindings).flatMap(([role, selection]) => {
      if (!selection?.providerId || !selection.modelId) return []
      const providerId = canonicalId(selection.providerId)
      return providerId ? [[role, { ...selection, providerId }]] : []
    })) as ModelRoleBinding
  }

  saveBindings(bindings: ModelRoleBinding) {
    const records = this.readRecords()
    const canonicalId = (id: string) => records.find(record => record.id === id)?.id
    const document = this.readDocument()
    document.bindings = Object.fromEntries(Object.entries(bindings).flatMap(([role, selection]) => {
      if (!selection?.providerId || !selection.modelId) return []
      const providerId = canonicalId(selection.providerId)
      return providerId ? [[role, { ...selection, providerId }]] : []
    })) as ModelRoleBinding
    this.writeDocument(document)
    return this.bindings()
  }

}
