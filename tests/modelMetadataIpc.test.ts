import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerModelIpcHandlers } from '../electron/ipc/modelIpc'
import { modelApi } from '../electron/preload/modelApi'

const electron = vi.hoisted(() => ({ handlers: new Map<string, Function>(), request: vi.fn(), invoke: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Function) => electron.handlers.set(channel, handler) },
  ipcRenderer: { invoke: electron.invoke }, net: { fetch: electron.request }, shell: { openPath: vi.fn() },
}))

beforeEach(() => { electron.handlers.clear(); electron.request.mockReset(); electron.invoke.mockReset() })
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers() })
describe('model metadata IPC', () => {
  it('matches by model ID without reading a saved provider and fetches only the public catalog through Electron', async () => {
    electron.request.mockResolvedValue(new Response(JSON.stringify({ zhipuai: { api: 'https://open.bigmodel.cn', models: { 'glm-5.3-flash': { reasoning: true, limit: { context: 128000 } } } } })))
    const get = vi.fn()
    registerModelIpcHandlers({ database: { models: { get } } as any })
    const lookup = electron.handlers.get('harness:lookup-model-metadata')!
    expect(await lookup({}, 'glm-5.3-flash')).toEqual({ model: { reasoning: true, contextWindow: 128000 } })
    expect(electron.request).toHaveBeenCalledWith('https://models.dev/api.json', { headers: { Accept: 'application/json' }, signal: expect.any(AbortSignal) })
    expect(get).not.toHaveBeenCalled()
    expect(electron.request).toHaveBeenCalledOnce()
  })
  it('ignores invalid or empty model IDs without downloading the catalog', async () => {
    registerModelIpcHandlers({ database: {} as any })
    const lookup = electron.handlers.get('harness:lookup-model-metadata')!
    for (const id of [undefined, null, 123, '', ' ', 'a'.repeat(513)]) expect(await lookup({}, id)).toEqual({})
    expect(electron.request).not.toHaveBeenCalled()
  })
  it('exposes the matching preload channel without sending provider credentials', async () => {
    await modelApi.lookupModelMetadata('model-id')
    expect(electron.invoke).toHaveBeenCalledWith('harness:lookup-model-metadata', 'model-id')
  })
  it('enriches synchronized IDs through the public catalog without sharing the relay key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'glm-5.3-flash' }, { id: 'unknown' }] }))))
    electron.request.mockResolvedValue(new Response(JSON.stringify({ zhipuai: { models: { 'glm-5.3-flash': { reasoning: true, modalities: { input: ['text', 'image'] }, limit: { context: 200000, output: 64000 } } } } })))
    registerModelIpcHandlers({ database: { models: { getSecret: () => 'relay-key' } } as any })
    expect(await electron.handlers.get('harness:list-model-provider-models')!({}, { id: 'relay', endpoint: 'https://relay.example/v1' })).toEqual({
      models: ['glm-5.3-flash', 'unknown'],
      metadata: { 'glm-5.3-flash': { reasoning: true, multimodal: true, audioInput: false, videoInput: false, contextWindow: 200000, maxTokens: 64000 } },
    })
    expect(fetch).toHaveBeenCalledWith('https://relay.example/v1/models', expect.objectContaining({ headers: { Accept: 'application/json', Authorization: 'Bearer relay-key' } }))
    expect(electron.request).toHaveBeenCalledWith('https://models.dev/api.json', { headers: { Accept: 'application/json' }, signal: expect.any(AbortSignal) })
  })
  it('returns synchronized IDs even when Models.dev cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'model-a' }] }))))
    electron.request.mockRejectedValue(new Error('offline'))
    registerModelIpcHandlers({ database: { models: { getSecret: () => '' } } as any })
    expect(await electron.handlers.get('harness:list-model-provider-models')!({}, { endpoint: 'http://localhost:1234/v1', authMode: 'none' })).toEqual({ models: ['model-a'], metadata: {} })
  })
  it('allows a slow relay to return after eight seconds and clears its timeout after success', async () => {
    vi.useFakeTimers()
    let signal!: AbortSignal, finish!: () => void
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((resolve, reject) => {
      signal = options.signal!
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      finish = () => resolve(new Response(JSON.stringify({ data: [{ id: 'slow-model' }] })))
    })))
    electron.request.mockRejectedValue(new Error('offline'))
    registerModelIpcHandlers({ database: { models: { getSecret: () => '' } } as any })
    const pending = electron.handlers.get('harness:list-model-provider-models')!({}, { endpoint: 'https://slow.example/v1', authMode: 'none' })
    await vi.advanceTimersByTimeAsync(15000)
    expect(signal.aborted).toBe(false)
    finish()
    expect(await pending).toEqual({ models: ['slow-model'], metadata: {} })
    await vi.advanceTimersByTimeAsync(60000)
    expect(signal.aborted).toBe(false)
  })
  it('aborts a stalled relay at sixty seconds and returns the updated timeout message', async () => {
    vi.useFakeTimers()
    let signal!: AbortSignal
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      signal = options.signal!
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    registerModelIpcHandlers({ database: { models: { getSecret: () => '' } } as any })
    const pending = electron.handlers.get('harness:list-model-provider-models')!({}, { endpoint: 'https://slow.example/v1', authMode: 'none' })
    await vi.advanceTimersByTimeAsync(59999)
    expect(signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toEqual({ models: [], error: '查询超时（60 秒）' })
  })
})
