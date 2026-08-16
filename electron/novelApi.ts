import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ModelSelection } from '../src/config/harness'
import type { PlatformDatabase } from './database'
import { corsHeadersFor } from './localMicroAppServer'

const NOVEL_MODEL_ROLES = new Set(['authoring', 'automation'])

function normalizeEndpoint(endpoint: string) {
  const trimmed = endpoint.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`
}

function writeError(request: IncomingMessage, response: ServerResponse, status: number, text: string) {
  if (response.destroyed) return
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeadersFor(request) })
  response.end(text)
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>
}

async function consumeSse(stream: ReadableStream<Uint8Array>, onContent: (content: string) => void) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return
        try {
          const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown } }> }
          const content = parsed.choices?.[0]?.delta?.content
          if (typeof content === 'string' && content) onContent(content)
        } catch {
          // 忽略上游不符合 OpenAI SSE 约定的单行数据，继续消费后续内容。
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function getProfile(database: PlatformDatabase, selection: ModelSelection) {
  if (!selection?.providerId || !selection.modelId) throw new Error('请先在模型页面配置并选择模型')
  const provider = database.models.get(selection.providerId)
  if (!provider?.enabled) throw new Error('当前模型不可用，请检查模型配置')
  if (!provider.models.includes(selection.modelId)) throw new Error('所选模型不属于当前供应商')
  const apiKey = database.models.getSecret(selection.providerId)
  if (!apiKey) throw new Error('当前模型未配置 API Key')
  const endpoint = normalizeEndpoint(provider.endpoint)
  if (!endpoint) throw new Error('当前模型未配置 Endpoint')
  return { endpoint, apiKey, modelId: selection.modelId }
}

async function requestModel(profile: { endpoint: string, apiKey: string, modelId: string }, prompt: string, signal?: AbortSignal) {
  return fetch(profile.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: profile.modelId.trim(),
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
    signal,
  })
}

async function handleNovelRequest(subpath: string, request: IncomingMessage, response: ServerResponse, database: PlatformDatabase) {
  if (!NOVEL_MODEL_ROLES.has(subpath)) {
    writeError(request, response, 404, '未找到小说模型职责')
    return
  }
  let prompt = ''
  let selection: ModelSelection | undefined
  try {
    const body = await readJsonBody(request)
    prompt = typeof body.prompt === 'string' ? body.prompt : ''
    const raw = body.selection
    if (raw && typeof raw === 'object' && typeof (raw as ModelSelection).providerId === 'string' && typeof (raw as ModelSelection).modelId === 'string') selection = raw as ModelSelection
  } catch {
    writeError(request, response, 400, '请求体不是有效 JSON')
    return
  }
  if (!prompt.trim()) {
    writeError(request, response, 400, '创作提示不能为空')
    return
  }

  let profile: { endpoint: string, apiKey: string, modelId: string }
  try {
    profile = getProfile(database, selection as ModelSelection)
  } catch (error) {
    writeError(request, response, 400, error instanceof Error ? error.message : String(error))
    return
  }

  const controller = new AbortController()
  const abortWhenClientLeaves = () => {
    if (!response.writableEnded) controller.abort()
  }
  response.once('close', abortWhenClientLeaves)
  try {
    const upstream = await requestModel(profile, prompt, controller.signal)
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      writeError(request, response, 502, `模型请求失败: ${upstream.status} ${detail.slice(0, 500)}`)
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeadersFor(request) })
    await consumeSse(upstream.body, content => {
      if (!response.destroyed) response.write(content)
    })
    if (!response.destroyed) response.end()
  } catch (error) {
    if (controller.signal.aborted) return
    writeError(request, response, 502, `模型请求异常: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    response.off('close', abortWhenClientLeaves)
  }
}

export function createNovelApiHandler(database: PlatformDatabase) {
  return (subpath: string, request: IncomingMessage, response: ServerResponse) => {
    void handleNovelRequest(subpath, request, response, database)
  }
}
