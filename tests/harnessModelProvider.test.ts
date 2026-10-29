import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createHarnessModelProvider, supportsHarnessImages } from '../electron/services/harnessModelProvider'
import type { ModelProviderSummary, ProviderModelConfig } from '../src/config/harness'

const configuredModel: ProviderModelConfig = { id: 'local-model', enabled: true, reasoning: false, contextWindow: 8192 }
const provider = { id: 'local', providerKey: 'ollama', name: 'Local', endpoint: 'http://127.0.0.1:12345/v1', models: [configuredModel], enabled: true, hasApiKey: false, createdAt: 0, updatedAt: 0 } as ModelProviderSummary

describe('createHarnessModelProvider', () => {
  it('uses the configured context window and ignores a retired input limit without changing the request ID', () => {
    const configured = { ...configuredModel, name: '我的模型', contextWindow: 128000, maxInputTokens: 96000, maxTokens: 32000 }
    const { model } = createHarnessModelProvider(provider, configured, '')
    expect(model).toMatchObject({ id: configuredModel.id, name: '我的模型', contextWindow: 128000, maxTokens: 32000 })
  })
  it.each(['cn', 'ai'])('uses the versioned Moonshot %s base URL in the agent SDK', region => {
    const { model } = createHarnessModelProvider({ ...provider, providerKey: 'kimi', endpoint: `https://api.moonshot.${region}` }, configuredModel, 'test-key')
    expect(model.baseUrl).toBe(`https://api.moonshot.${region}/v1`)
  })
  it.each(['openai-completions', 'openai-responses', 'anthropic-messages'] as const)('selects the configured %s adapter', protocol => {
    const { model } = createHarnessModelProvider({ ...provider, protocol }, configuredModel, '')
    expect(model.api).toBe(protocol)
  })
  it.each(['openai-responses', 'anthropic-messages'] as const)('sends a real SDK request with %s', async protocol => {
    let received: { path?: string; body: any; headers: any } | undefined
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      received = { path: request.url, body: JSON.parse(Buffer.concat(chunks).toString()), headers: request.headers }
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'test response' } }))
    })
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    try {
      const port = (server.address() as { port: number }).port
      const { model, models } = createHarnessModelProvider({ ...provider, protocol, endpoint: `http://127.0.0.1:${port}/v1` }, configuredModel, 'test-key')
      await models.streamSimple(model, { messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }] } as any).result()
      expect(received?.path).toBe(protocol === 'anthropic-messages' ? '/v1/messages' : '/v1/responses')
      expect(received?.body.model).toBe(configuredModel.id)
      expect(received?.body[protocol === 'anthropic-messages' ? 'messages' : 'input']).toBeTruthy()
      expect(received?.headers[protocol === 'anthropic-messages' ? 'x-api-key' : 'authorization']).toBe(protocol === 'anthropic-messages' ? 'test-key' : 'Bearer test-key')
    } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) }
  })
  it.each(['openai-responses', 'anthropic-messages'] as const)('rejects unsupported file payloads before sending through %s', async protocol => {
    const { model, models } = createHarnessModelProvider({ ...provider, protocol }, { ...configuredModel, pdfInput: true }, 'test-key')
    const response = await models.streamSimple(model, { messages: [{ role: 'user', content: 'read', timestamp: Date.now(), miraMedia: [{ name: 'a.pdf', mediaType: 'application/pdf', content: 'YQ==' }] }] } as any).result()
    expect(response.stopReason).toBe('error')
    expect(response.errorMessage).toContain('当前请求协议不支持 PDF 或视频附件')
  })
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
      // MCP screenshots are tool results; verify the installed SDK also sends their pixels.
      await models.completeSimple(model, { messages: [
        { role: 'user', content: 'Inspect the window', timestamp: 0 },
        { ...result, content: [{ type: 'toolCall', id: 'capture', name: 'get_window_state', arguments: {} }], stopReason: 'toolUse' },
        { role: 'toolResult', toolCallId: 'capture', toolName: 'get_window_state', content: [{ type: 'text', text: 'Test window' }, { type: 'image', mimeType: 'image/png', data: 'AQID' }], isError: false, timestamp: 1 },
      ] })
      expect(requestBody.messages).toContainEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'capture' }))
      expect(requestBody.messages.flatMap((message: any) => Array.isArray(message.content) ? message.content : [])).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } })

    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  it('preserves PDF and video bytes and message ownership through real SDK requests and follow-ups', async () => {
    const bodies: any[] = []
    const trace: any[] = []
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify({ id: 'media', choices: [{ index: 0, delta: { role: 'assistant', content: 'Received' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const { port } = server.address() as { port: number }
      const { model, models } = (createHarnessModelProvider as any)({ ...provider, endpoint: `http://127.0.0.1:${port}/v1`, authMode: 'none' }, { ...configuredModel, pdfInput: true, videoInput: true }, '', { sessionId: 'task-media', runId: 'run-media', source: 'main', store: { write: (record: any) => trace.push(structuredClone(record)) } })
      const media = [
        { path: 'owned-pdf', name: '报告.pdf', mediaType: 'application/pdf', content: Buffer.from('%PDF-1.7\n%%EOF').toString('base64') },
        { path: 'owned-video', name: 'sample.mp4', mediaType: 'video/mp4', content: Buffer.from('native-video-bytes').toString('base64') },
      ]
      const first: any = { role: 'user', content: 'Read both', timestamp: 1, miraMedia: media }
      const reply = await models.completeSimple(model, { messages: [first] })
      expect(reply.stopReason).toBe('stop')
      await models.completeSimple(model, { messages: [first, reply, { role: 'user', content: 'Follow up', timestamp: 2 }] })
      await Promise.resolve()
      expect(trace.filter(record => record.request).map(record => record.request)).toEqual(bodies)
      expect(trace.filter(record => record.response)).toHaveLength(2)
      expect(trace.every(record => record.sessionId === 'task-media' && record.runId === 'run-media')).toBe(true)
      for (const body of bodies) {
        const users = body.messages.filter((message: any) => message.role === 'user')
        expect(users[0].content).toEqual([
          { type: 'text', text: 'Read both' },
          { type: 'file', file: { filename: '报告.pdf', file_data: `data:application/pdf;base64,${media[0].content}` } },
          { type: 'video_url', video_url: { url: `data:video/mp4;base64,${media[1].content}` } },
        ])
        expect(body.messages).not.toContainEqual(expect.objectContaining({ miraMedia: expect.anything() }))
      }
      expect(bodies[1].messages.filter((message: any) => message.role === 'user')[1].content).toBe('Follow up')
      expect(first.content).toBe('Read both'); expect(first.miraMedia).toBe(media)
      const disabled = createHarnessModelProvider({ ...provider, endpoint: `http://127.0.0.1:${port}/v1`, authMode: 'none' }, configuredModel, '')
      const refused = await disabled.models.completeSimple(disabled.model, { messages: [first] })
      expect(refused.stopReason).toBe('error'); expect(refused.errorMessage).toContain('PDF')
      expect(bodies).toHaveLength(2)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
