import { describe, expect, it, vi } from 'vitest'
import { MODEL_PROTOCOLS, modelApiBaseUrl, modelEndpointForProtocol, modelProtocol, modelRequestUrl, supportsModelProtocol } from '../src/config/modelProtocol'

const handlers = new Map<string, Function>()
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: Function) => handlers.set(name, handler) }, shell: {} }))
import { registerModelIpcHandlers } from '../electron/ipc/modelIpc'
import { MODEL_PROVIDER_PRESETS } from '../src/config/harness'

describe('model request protocols', () => {
  it.each([
    ['deepseek', '/v1', '/v1/chat/completions', '/responses', '/anthropic/v1/messages'],
    ['glm', '/api/paas/v4', '/api/paas/v4/chat/completions', '/api/v1/responses', '/api/anthropic/v1/messages'],
    ['kimi', '', '/v1/chat/completions', '/v1/responses', '/anthropic/v1/messages'],
    ['minimax', '/v1', '/v1/chat/completions', '/v1/responses', '/anthropic/v1/messages'],
    ['qwen', '/compatible-mode/v1', '/compatible-mode/v1/chat/completions', '/compatible-mode/v1/responses', '/apps/anthropic/v1/messages'],
    ['bailian', '/compatible-mode/v1', '/compatible-mode/v1/chat/completions', '/compatible-mode/v1/responses', '/apps/anthropic/v1/messages'],
    ['siliconcloud', '/v1', '/v1/chat/completions', null, '/v1/messages'],
    ['baichuan', '/v1', '/v1/chat/completions', '/v1/responses', null],
    ['volcengine', '/api/v3', '/api/v3/chat/completions', '/api/v3/responses', '/api/compatible/v1/messages'],
    ['modelscope', '/v1', '/v1/chat/completions', '/v1/responses', '/v1/messages'],
    ['tokenhub', '/v1', '/v1/chat/completions', '/v1/responses', '/v1/messages'],
    ['qianfan', '/v2', '/v2/chat/completions', '/v2/responses', '/anthropic/v1/messages'],
    ['xiaomimimo', '/v1', '/v1/chat/completions', '/v1/responses', '/anthropic/v1/messages'],
    ['ollama', '/v1', '/v1/chat/completions', '/v1/responses', '/v1/messages'],
  ])('resolves documented %s routes and switches supported protocols both ways', (key, base, ...paths) => {
    const identity = { providerKey: key! }
    const origin = 'https://regional.example:8443'
    const protocols = Object.keys(MODEL_PROTOCOLS) as Array<keyof typeof MODEL_PROTOCOLS>
    for (const [index, protocol] of protocols.entries()) {
      expect(supportsModelProtocol(identity, protocol)).toBe(paths[index] !== null)
      if (paths[index] === null) {
        expect(() => modelRequestUrl(`${origin}${base}`, protocol, identity)).toThrow('不支持')
        continue
      }
      const endpoint = modelEndpointForProtocol(`${origin}${base}`, protocol, identity)
      expect(modelRequestUrl(endpoint, protocol, identity)).toBe(`${origin}${paths[index]}`)
      expect(modelEndpointForProtocol(endpoint, protocol, identity)).toBe(endpoint)
      for (const [other, targetProtocol] of protocols.entries()) {
        if (paths[other] === null) continue
        const expected = key === 'deepseek' && targetProtocol === 'openai-completions' && protocol !== targetProtocol ? '/chat/completions' : paths[other]
        expect(modelRequestUrl(modelEndpointForProtocol(endpoint, targetProtocol, identity), targetProtocol, identity)).toBe(`${origin}${expected}`)
      }
    }
  })

  it('preserves custom services, unknown paths and proxy prefixes, and accepts complete resource URLs', () => {
    expect(modelEndpointForProtocol('https://proxy.example/team/api/paas/v4', 'anthropic-messages', { slug: 'glm' })).toBe('https://proxy.example/team/api/anthropic')
    expect(modelEndpointForProtocol('https://proxy.example/team/private', 'anthropic-messages', { providerKey: 'glm' })).toBe('https://proxy.example/team/private')
    expect(modelEndpointForProtocol('https://proxy.example/api/paas/v4', 'anthropic-messages', { slug: 'mine', providerKey: 'glm' })).toBe('https://proxy.example/api/paas/v4')
    expect(modelRequestUrl('https://api.deepseek.com/anthropic/v1/messages', 'anthropic-messages', { providerKey: 'deepseek' })).toBe('https://api.deepseek.com/anthropic/v1/messages')
    expect(modelRequestUrl('https://api.deepseek.com/v1/chat/completions', 'openai-responses', { providerKey: 'deepseek' })).toBe('https://api.deepseek.com/responses')
    expect(supportsModelProtocol({ slug: 'baichuan', providerKey: 'custom' }, 'anthropic-messages')).toBe(false)
    expect(supportsModelProtocol({ slug: 'siliconflow', providerKey: 'custom' }, 'openai-responses')).toBe(true)
  })

  it('discovers built-in models from the OpenAI base and uses SiliconFlow Bearer auth for Messages', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 'test-model' }] }) }))
    vi.stubGlobal('fetch', fetch)
    try {
      registerModelIpcHandlers({ database: { models: { getSecret: () => 'saved-key' } } } as any)
      await handlers.get('harness:list-model-provider-models')!({}, { slug: 'bailian', providerKey: 'qwen', endpoint: 'https://dashscope.aliyuncs.com/apps/anthropic', protocol: 'anthropic-messages' })
      expect(fetch.mock.calls[0][0]).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/models')
      expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer saved-key' })
      await handlers.get('harness:test-model-provider')!({}, { slug: 'siliconcloud', endpoint: 'https://api.siliconflow.cn/v1', protocol: 'anthropic-messages' }, 'test-model')
      expect(fetch.mock.calls[1][0]).toBe('https://api.siliconflow.cn/v1/messages')
      expect((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer saved-key', 'anthropic-version': '2023-06-01' })
      expect(await handlers.get('harness:test-model-provider')!({}, { slug: 'baichuan', endpoint: 'https://api.baichuan-ai.com/v1', protocol: 'anthropic-messages' }, 'test-model')).toMatchObject({ ok: false, text: expect.stringContaining('不支持') })
      expect(fetch).toHaveBeenCalledTimes(2)
    } finally { vi.unstubAllGlobals() }
  })

  it.each(['siliconcloud', 'baichuan', 'bailian', 'volcengine', 'modelscope', 'tokenhub', 'qianfan', 'xiaomimimo'])('keeps the %s API version during discovery and connection tests', async key => {
    const preset = MODEL_PROVIDER_PRESETS.find(item => item.key === key)!
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 'test-model' }] }) }))
    vi.stubGlobal('fetch', fetch)
    try {
      registerModelIpcHandlers({ database: { models: { getSecret: () => 'saved-key' } } } as any)
      const provider = { ...preset, endpoint: `${preset.endpoint}/`, protocol: 'openai-completions' }
      await handlers.get('harness:list-model-provider-models')!({}, provider)
      await handlers.get('harness:test-model-provider')!({}, provider, 'test-model')
      expect(fetch.mock.calls[0][0]).toBe(`${preset.endpoint}/models`)
      expect(fetch.mock.calls[1][0]).toBe(`${preset.endpoint}/chat/completions`)
      expect((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer saved-key' })
    } finally { vi.unstubAllGlobals() }
  })

  it.each(['cn', 'ai'])('uses the versioned Moonshot %s API for discovery and connection tests', async region => {
    const endpoint = `https://api.moonshot.${region}`
    expect(modelApiBaseUrl(endpoint)).toBe(`${endpoint}/v1`)
    expect(modelApiBaseUrl(`${endpoint}/v1/`)).toBe(`${endpoint}/v1`)
    expect(modelApiBaseUrl('https://proxy.example')).toBe('https://proxy.example')
    expect(modelRequestUrl(endpoint)).toBe(`${endpoint}/v1/chat/completions`)
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 'kimi-test' }] }) }))
    vi.stubGlobal('fetch', fetch)
    try {
      registerModelIpcHandlers({ database: { models: { getSecret: () => 'saved-key' } } } as any)
      const discovery = await handlers.get('harness:list-model-provider-models')!({}, { endpoint })
      expect(discovery.models).toEqual(['kimi-test'])
      expect(fetch.mock.calls[0][0]).toBe(`${endpoint}/v1/models`)
      await handlers.get('harness:test-model-provider')!({}, { endpoint }, 'kimi-test')
      expect(fetch.mock.calls[1][0]).toBe(`${endpoint}/v1/chat/completions`)
    } finally { vi.unstubAllGlobals() }
  })

  it('keeps legacy records on completions and avoids duplicate Anthropic versions', () => {
    expect(modelProtocol()).toBe('openai-completions')
    expect(modelProtocol('invalid')).toBe('openai-completions')
    expect(modelRequestUrl('https://example.com/v1', 'anthropic-messages')).toBe('https://example.com/v1/messages')
    expect(modelRequestUrl('https://example.com/v1/messages', 'anthropic-messages')).toBe('https://example.com/v1/messages')
  })

  it.each(Object.keys(MODEL_PROTOCOLS) as Array<keyof typeof MODEL_PROTOCOLS>)('tests connections using %s format and authentication', async protocol => {
    const fetch = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    try {
      registerModelIpcHandlers({ database: { models: { getSecret: () => 'saved-key' } } } as any)
      const result = await handlers.get('harness:test-model-provider')!({}, { endpoint: 'https://example.com', protocol }, 'model')
      expect(result.ok).toBe(true)
      const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe(`https://example.com${MODEL_PROTOCOLS[protocol].path}`)
      const body = JSON.parse(options.body as string)
      expect(body.model).toBe('model')
      if (protocol === 'anthropic-messages') {
        expect(options.headers).toMatchObject({ 'x-api-key': 'saved-key', 'anthropic-version': '2023-06-01' })
        expect(body.max_tokens).toBe(64)
      } else expect(options.headers).toMatchObject({ Authorization: 'Bearer saved-key' })
      if (protocol === 'openai-responses') {
        expect(body.input).toBeTruthy()
        expect(body).not.toHaveProperty('messages')
      } else expect(body.messages[0].role).toBe('user')
    } finally { vi.unstubAllGlobals() }
  })
})
