import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createHarnessModelProvider, supportsHarnessImages } from '../electron/services/harnessModelProvider'
import type { ModelProviderSummary, ProviderModelConfig } from '../src/config/harness'

const configuredModel: ProviderModelConfig = { id: 'local-model', enabled: true, reasoning: false, contextWindow: 8192 }
const provider = { id: 'local', providerKey: 'ollama', name: 'Local', endpoint: 'http://127.0.0.1:12345/v1', models: [configuredModel], enabled: true, hasApiKey: false, createdAt: 0, updatedAt: 0 } as ModelProviderSummary

describe('createHarnessModelProvider', () => {
  it('uses a non-secret SDK placeholder for a keyless endpoint', async () => {
    const { model, models } = createHarnessModelProvider({ ...provider, authMode: 'none' }, configuredModel, '')
    const auth = await models.getProvider('mira-openai')!.auth.apiKey!.resolve({} as any)

    expect(model.id).toBe('local-model')
    expect(auth).toEqual({ auth: { apiKey: 'unused' } })
  })

  it('preserves the configured key for authenticated endpoints', async () => {
    const { models } = createHarnessModelProvider({ ...provider, authMode: 'api-key' }, configuredModel, 'configured-key')
    const auth = await models.getProvider('mira-openai')!.auth.apiKey!.resolve({} as any)

    expect(auth).toEqual({ auth: { apiKey: 'configured-key' } })
  })

  it.each([
    { id: 'local-model', multimodal: undefined, supports: false },
    { id: 'local-model', multimodal: true, supports: true },
    { id: 'glm-4.6v', multimodal: undefined, supports: true },
    { id: 'glm-4.6v', multimodal: false, supports: false },
    { id: 'glm-5', multimodal: undefined, supports: false },
  ])('declares image support for $id with override $multimodal as $supports', ({ id, multimodal, supports }) => {
    const configured = { ...configuredModel, id, multimodal }
    expect(supportsHarnessImages(configured)).toBe(supports)
    expect(createHarnessModelProvider(provider, configured, '').model.input).toEqual(supports ? ['text', 'image'] : ['text'])
  })

  it('sends image-only content through the installed OpenAI-compatible SDK as image_url', async () => {
    let requestBody: any
    let requestPath: string | undefined
    let requestMethod: string | undefined
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      requestPath = request.url
      requestMethod = request.method
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const chunk = { id: 'local-vision-test', object: 'chat.completion.chunk', created: 0, model: 'local-model', choices: [{ index: 0, delta: { role: 'assistant', content: 'Image received' }, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }
      response.end(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as { port: number }
      const { model, models } = createHarnessModelProvider({ ...provider, endpoint: `http://127.0.0.1:${address.port}/v1`, authMode: 'none' }, { ...configuredModel, multimodal: true }, '')
      const result = await models.completeSimple(model, { messages: [{ role: 'user', content: [{ type: 'image', mimeType: 'image/png', data: 'AQID' }], timestamp: 0 }] })

      expect(result.stopReason).toBe('stop')
      expect(result.content).toEqual([{ type: 'text', text: 'Image received' }])
      expect(requestMethod).toBe('POST')
      expect(requestPath).toBe('/v1/chat/completions')
      expect(requestBody.model).toBe('local-model')
      expect(requestBody.messages).toEqual([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } }] }])
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
