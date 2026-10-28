import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reactive, ref, toRaw } from 'vue'

const source = readFileSync(new URL('../src/pages/backend/modelConfig/index.vue', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const body = source.match(/function plainInput\(\): ModelProviderInput \{([\s\S]*?)\n\}\n/)![1]
const plainInput = new Function('form', 'activeInstance', 'apiKeyDraft', 'toRaw', body)

describe('model settings IPC input', () => {
  it.each([true, false])('can clone models with pricing=%s after selecting a reactive record', pricing => {
    const model = {
      id: 'deepseek-v4-flash-vision-exp', enabled: true, reasoning: true,
      contextWindow: 1000000, multimodal: true,
      ...(pricing ? { pricing: { currency: 'CNY', input: 3, output: 9, cacheRead: 0.1, cacheWrite: 3 } } : {}),
    }
    const record = reactive({ id: 'deepseek', slug: 'deepseek', models: [model] })
    const form = reactive({
      id: record.id, providerKey: 'deepseek', name: '深度求索',
      endpoint: ' https://api.deepseek.com/v1 ', authMode: 'api-key', protocol: 'openai-responses', enabled: true,
      models: record.models.map(item => ({ ...item })),
    })
    const input = plainInput(form, ref(record), ref(''), toRaw)

    expect(structuredClone(input)).toEqual(input)
    expect(input.models).toEqual([model])
    expect(input.endpoint).toBe('https://api.deepseek.com/v1')
    expect(input.protocol).toBe('openai-responses')
    expect(input).not.toHaveProperty('apiKey')
  })
})
