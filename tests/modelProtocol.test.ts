import { describe, expect, it, vi } from 'vitest'
import { MODEL_PROTOCOLS, modelProtocol, modelRequestUrl } from '../src/config/modelProtocol'

const handlers = new Map<string, Function>()
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: Function) => handlers.set(name, handler) }, shell: {} }))
import { registerModelIpcHandlers } from '../electron/ipc/modelIpc'

describe('model request protocols', () => {
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
