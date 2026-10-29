import type { ModelMetadata, ModelMetadataResult } from '../../src/config/harness'

type CatalogModel = {
  name?: string
  type?: string
  reasoning?: boolean
  tool_call?: boolean
  modalities?: { input?: string[], output?: string[] }
  limit?: { context?: number, output?: number }
}
type Catalog = Record<string, { models?: Record<string, CatalogModel> }>
const CATALOG_URL = 'https://models.dev/api.json'
const CACHE_TTL = 24 * 60 * 60 * 1000
const normalize = (value: string) => value.trim().toLowerCase()

function metadata(model: CatalogModel): ModelMetadata {
  const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
  const modelType = ['chat', 'image', 'embedding', 'reranking'].includes(model.type || '')
    ? model.type as ModelMetadata['modelType']
    : model.modalities?.output?.includes('image') ? 'image' : undefined
  const input = model.modalities?.input
  const accepts = (type: string) => input?.some(value => value === type || value.startsWith(`${type}/`))
  return {
    ...(typeof model.name === 'string' && model.name.trim() ? { name: model.name.trim() } : {}),
    ...(modelType ? { modelType } : {}),
    ...(typeof model.reasoning === 'boolean' ? { reasoning: model.reasoning } : {}),
    ...(typeof model.tool_call === 'boolean' ? { toolCall: model.tool_call } : {}),
    ...(Array.isArray(input) ? { multimodal: accepts('image'), audioInput: accepts('audio'), videoInput: accepts('video') } : {}),
    ...(positive(model.limit?.context) ? { contextWindow: model.limit.context } : {}),
    ...(positive(model.limit?.output) ? { maxTokens: model.limit.output } : {}),
  }
}

export function matchModelsDev(catalog: Catalog, modelId: string): ModelMetadata | undefined {
  const id = normalize(modelId)
  let alias: CatalogModel | undefined
  // 全局按 ID 匹配；同名记录采用目录首条，完整 ID 优先于服务商前缀别名。
  for (const [key, entry] of Object.entries(catalog)) {
    for (const [modelKey, model] of Object.entries(entry.models || {})) {
      if (normalize(modelKey) === id) return metadata(model)
      if (!alias && normalize(`${key}/${modelKey}`) === id) alias = model
    }
  }
  return alias ? metadata(alias) : undefined
}

export class ModelsDevCatalog {
  private cache?: { value: Catalog, loadedAt: number }
  private pending?: Promise<Catalog>
  constructor(private readonly request: typeof fetch = fetch) {}

  private async catalog() {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL) return this.cache.value
    if (!this.pending) this.pending = (async () => {
      const response = await this.request(CATALOG_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const value = await response.json() as Catalog
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.values(value).some(provider => provider && typeof provider.models === 'object')) throw new Error('无效模型目录')
      this.cache = { value, loadedAt: Date.now() }
      return value
    })().finally(() => { this.pending = undefined })
    try { return await this.pending } catch (error) { if (this.cache) return this.cache.value; throw error }
  }

  async lookup(modelId: string): Promise<ModelMetadataResult> {
    if (!modelId.trim()) return {}
    try { return { model: matchModelsDev(await this.catalog(), modelId) } }
    catch { return { error: '暂时无法查询 Models.dev，可手动填写' } }
  }

  async lookupMany(modelIds: string[]): Promise<Record<string, ModelMetadata>> {
    if (!modelIds.length) return {}
    try {
      const catalog = await this.catalog()
      return Object.fromEntries(modelIds.flatMap(id => {
        const model = matchModelsDev(catalog, id)
        return model ? [[id, model]] : []
      }))
    } catch { return {} }
  }
}
