import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchModelsDev, ModelsDevCatalog } from '../electron/services/modelsDev'

const info = { name: 'DeepSeek V4 Pro', reasoning: true, modalities: { input: ['text'] }, limit: { context: 1048576, output: 393216 } }
const catalog = {
  deepseek: { api: 'https://api.deepseek.com', models: { 'deepseek-v4-pro': info } },
  relay: { api: 'https://relay.example/v1', models: { 'deepseek-v4-pro': { ...info, limit: { context: 128000, input: 96000, output: 32000 } } } },
}
afterEach(() => vi.restoreAllMocks())

describe('Models.dev metadata', () => {
  it('maps only explicit tools, input modalities and model types without inferring capabilities from a model name', () => {
    expect(matchModelsDev({ a: { models: { media: { type: 'chat', tool_call: true, modalities: { input: ['text', 'image/png', 'audio/wav', 'video/mp4'], output: ['text'] } } } } }, 'media')).toEqual({ modelType: 'chat', toolCall: true, multimodal: true, audioInput: true, videoInput: true })
    expect(matchModelsDev({ a: { models: { 'vision-audio-tools': { name: 'Vision Audio Tools' } } } }, 'vision-audio-tools')).toEqual({ name: 'Vision Audio Tools' })
    expect(matchModelsDev({ a: { models: { plain: { tool_call: false, modalities: { input: ['text'] } } } } }, 'plain')).toEqual({ toolCall: false, multimodal: false, audioInput: false, videoInput: false })
  })
  it.each(['image', 'embedding', 'reranking'] as const)('recognizes catalog model type %s', type => {
    expect(matchModelsDev({ a: { models: { model: { type } } } }, 'model')).toEqual({ modelType: type })
  })
  it('distinguishes image generation from image input and ignores unsupported model types', () => {
    expect(matchModelsDev({ a: { models: { generate: { modalities: { input: ['text'], output: ['image'] } } } } }, 'generate')).toEqual({ modelType: 'image', multimodal: false, audioInput: false, videoInput: false })
    expect(matchModelsDev({ a: { models: { unknown: { type: 'unknown' } } } }, 'unknown')).toEqual({})
  })
  it('uses exact IDs and only maps the context and output limits Mira supports', () => {
    expect(matchModelsDev(catalog, ' DeepSeek-V4-Pro ')).toEqual({ name: info.name, reasoning: true, multimodal: false, audioInput: false, videoInput: false, contextWindow: 1048576, maxTokens: 393216 })
    expect(matchModelsDev(catalog, 'relay/deepseek-v4-pro')).toEqual({ name: info.name, reasoning: true, multimodal: false, audioInput: false, videoInput: false, contextWindow: 128000, maxTokens: 32000 })
    expect(matchModelsDev(catalog, 'deepseek/deepseek-v4-pro')?.maxTokens).toBe(393216)
    expect(matchModelsDev(catalog, 'deepseek-v4-pro-preview')).toBeUndefined()
  })
  it('matches GLM IDs globally even when providers publish different metadata', () => {
    const glm = { name: 'GLM-5.3-Flash', reasoning: true, modalities: { input: ['text', 'image'] }, limit: { context: 200000, output: 64000 } }
    const entries = {
      zhipuai: { api: 'https://open.bigmodel.cn/api/paas/v4', models: { 'glm-5.3-flash': glm } },
      relay: { api: 'https://relay.example/v1', models: { 'glm-5.3-flash': { ...glm, name: 'GLM Flash', limit: { context: 128000, output: 32000 } } } },
    }
    expect(matchModelsDev(entries, 'glm-5.3-flash')).toEqual({ name: glm.name, reasoning: true, multimodal: true, audioInput: false, videoInput: false, contextWindow: 200000, maxTokens: 64000 })
    expect(matchModelsDev(catalog, 'deepseek-v4-pro')?.maxTokens).toBe(393216)
  })
  it('prefers an exact model ID over a provider-qualified alias', () => {
    expect(matchModelsDev({
      vendor: { models: { model: { name: 'Alias' } } },
      relay: { models: { 'vendor/model': { name: 'Exact' } } },
    }, 'vendor/model')).toEqual({ name: 'Exact' })
  })
  it('recognizes MIME image input and partial metadata', () => {
    expect(matchModelsDev({ a: { models: { vision: { modalities: { input: ['text', 'image/png'] } } } } }, 'vision')).toEqual({ multimodal: true, audioInput: false, videoInput: false })
    expect(matchModelsDev({ a: { models: { partial: { name: 'Partial' } } } }, 'partial')).toEqual({ name: 'Partial' })
  })
  it('shares an in-flight download and caches it without forwarding provider credentials', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(catalog)))
    const service = new ModelsDevCatalog(request)
    const [a, b] = await Promise.all([service.lookup('deepseek-v4-pro'), service.lookup('unknown')])
    expect(a.model?.reasoning).toBe(true); expect(b.model).toBeUndefined()
    await service.lookup('deepseek-v4-pro')
    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith('https://models.dev/api.json', { headers: { Accept: 'application/json' }, signal: expect.any(AbortSignal) })
  })
  it('returns a non-blocking error and retries after a network failure', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Response(JSON.stringify(catalog)))
    const service = new ModelsDevCatalog(request)
    expect((await service.lookup('deepseek-v4-pro')).error).toContain('可手动填写')
    expect((await service.lookup('deepseek-v4-pro')).model?.reasoning).toBe(true)
  })
  it('enriches a model list with one shared catalog download and omits unknown IDs', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(catalog)))
    const service = new ModelsDevCatalog(request)
    expect(await service.lookupMany([])).toEqual({})
    expect(request).not.toHaveBeenCalled()
    expect(await service.lookupMany(['deepseek-v4-pro', 'unknown', 'relay/deepseek-v4-pro'])).toEqual({
      'deepseek-v4-pro': { name: info.name, reasoning: true, multimodal: false, audioInput: false, videoInput: false, contextWindow: 1048576, maxTokens: 393216 },
      'relay/deepseek-v4-pro': { name: info.name, reasoning: true, multimodal: false, audioInput: false, videoInput: false, contextWindow: 128000, maxTokens: 32000 },
    })
    await service.lookup('deepseek-v4-pro')
    expect(request).toHaveBeenCalledOnce()
  })
  it('keeps metadata enrichment optional when the public catalog is unavailable', async () => {
    const service = new ModelsDevCatalog(vi.fn().mockRejectedValue(new Error('offline')))
    expect(await service.lookupMany(['model-a'])).toEqual({})
  })
})
