import { describe, expect, it } from 'vitest'
import { resolveAiBrandIcon } from '../src/components/AiBrandIcon/brands'

describe('Lobe AI brand icons', () => {
  it.each([
    ['deepseek', 'deepseek'], ['glm', 'zhipu'], ['kimi', 'kimi'], ['minimax', 'minimax'],
    ['qwen', 'qwen'], ['ollama', 'ollama'], ['openai', 'openai'], ['siliconflow', 'siliconcloud'],
    ['智谱开放平台', 'zhipu'], ['月之暗面', 'moonshot'], ['z.ai', 'zai'], ['阿里千问', 'qwen'],
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
