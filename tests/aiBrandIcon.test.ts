import { describe, expect, it } from 'vitest'
import { AI_BRAND_OPTIONS, aiBrandIcon, providerLetterAvatar, resolveAiBrandIcon } from '../src/components/AiBrandIcon/brands'

describe('Lobe AI brand icons', () => {
  it('exposes the full symbol catalog once per brand, without text logos', () => {
    expect(AI_BRAND_OPTIONS.length).toBeGreaterThan(100)
    expect(new Set(AI_BRAND_OPTIONS).size).toBe(AI_BRAND_OPTIONS.length)
    expect(AI_BRAND_OPTIONS).toContain('deepseek')
    expect(AI_BRAND_OPTIONS.some(brand => /-color$|-text|-brand/.test(brand))).toBe(false)
    for (const brand of AI_BRAND_OPTIONS) expect(aiBrandIcon(brand)).toMatchObject({ brand, url: expect.stringContaining('.svg') })
    expect(aiBrandIcon('google')?.brand).toBe('google')
  })

  it('generates a stable color from the first character and handles empty names', () => {
    expect(providerLetterAvatar('  apple')).toEqual(providerLetterAvatar('Another'))
    expect(providerLetterAvatar('B').background).not.toBe(providerLetterAvatar('A').background)
    expect(providerLetterAvatar('硅基流动').letter).toBe('硅')
    expect(providerLetterAvatar('').letter).toBe('服')
  })
  it.each([
    ['deepseek', 'deepseek'], ['glm', 'zhipu'], ['kimi', 'kimi'], ['minimax', 'minimax'],
    ['qwen', 'qwen'], ['ollama', 'ollama'], ['openai', 'openai'], ['siliconflow', 'siliconcloud'],
    ['智谱开放平台', 'zhipu'], ['月之暗面', 'moonshot'], ['z.ai', 'zai'], ['阿里千问', 'qwen'],
    ['siliconcloud', 'siliconcloud'], ['百川', 'baichuan'], ['bailian', 'alibabacloud'],
    ['火山引擎(豆包)', 'volcengine'], ['modelscope魔搭', 'modelscope'],
    ['腾讯云TokenHub', 'tencentcloud'], ['百度云千帆', 'baiducloud'], ['Xiaomi Mimo', 'xiaomimimo'],
  ])('resolves provider %s from the local catalog', (provider, brand) => {
    expect(resolveAiBrandIcon({ provider })).toMatchObject({ brand, url: expect.stringContaining('.svg') })
  })

  it.each([
    ['deepseek-ai/DeepSeek-V4.1-Flash', 'deepseek'], ['anthropic/claude-sonnet-4', 'claude'],
    ['openai/gpt-5', 'openai'], ['o3-mini', 'openai'], ['google/gemini-2.5-pro', 'gemini'],
    ['Qwen/Qwen3-235B', 'qwen'], ['z-ai/glm-4.7', 'zhipu'], ['meta-llama/llama-3.3', 'meta'],
    ['moonshotai/kimi-k2', 'kimi'], ['MiniMax-M2', 'minimax'], ['qwen3:8b', 'qwen'],
  ])('uses model identity for %s instead of the aggregation provider', (model, brand) => {
    expect(resolveAiBrandIcon({ model, provider: 'ollama', name: '聚合服务商' })?.brand).toBe(brand)
  })

  it('distinguishes the international instance and provides theme-aware monochrome icons', () => {
    expect(resolveAiBrandIcon({ provider: 'glm', name: 'z.ai' })?.brand).toBe('zai')
    expect(resolveAiBrandIcon({ provider: 'deepseek' })?.monochrome).toBe(false)
    expect(resolveAiBrandIcon({ provider: 'ollama' })?.monochrome).toBe(true)
    expect(resolveAiBrandIcon({ provider: 'kimi' })?.monochrome).toBe(true)
  })

  it('falls back to the provider for unknown models, without guessing unknown brands', () => {
    expect(resolveAiBrandIcon({ model: 'private-model', provider: 'deepseek' })?.brand).toBe('deepseek')
    expect(resolveAiBrandIcon({ provider: 'my-private-service', name: '我的服务商' })).toBeUndefined()
  })
})
