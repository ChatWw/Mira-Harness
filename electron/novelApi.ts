import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PlatformDatabase } from './database'
import { NOVEL_API_PREFERENCE_KEY, type NovelApiConfig, type NovelApiSlotConfig } from '../src/config/novelApi'
import { corsHeadersFor } from './localMicroAppServer'

const NOVEL_API_SUBPATHS = new Set(['gen', 'gen2'])

function normalizeSlot(value: unknown): NovelApiSlotConfig {
  const slot = value && typeof value === 'object' ? value as Partial<NovelApiSlotConfig> : {}
  return {
    endpoint: typeof slot.endpoint === 'string' ? slot.endpoint : '',
    apiKey: typeof slot.apiKey === 'string' ? slot.apiKey : '',
    model: typeof slot.model === 'string' ? slot.model : '',
  }
}

export function readNovelApiConfig(database: PlatformDatabase): NovelApiConfig {
  const stored = database.getSnapshot().preferences[NOVEL_API_PREFERENCE_KEY]
  const raw = stored && typeof stored === 'object' ? stored as Partial<NovelApiConfig> : {}
  return {
    gen: normalizeSlot(raw.gen),
    gen2: normalizeSlot(raw.gen2),
  }
}

function normalizeEndpoint(endpoint: string) {
  const trimmed = endpoint.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`
}

function writeText(request: IncomingMessage, response: ServerResponse, text: string) {
  if (response.destroyed) return
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeadersFor(request) })
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
          // 忽略无法解析的 SSE 行，保持与上游流式行为一致。
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function pipeSseContent(stream: ReadableStream<Uint8Array>, response: ServerResponse) {
  await consumeSse(stream, content => {
    if (response.destroyed) return
    try { response.write(content) } catch { /* 客户端可能已断开 */ }
  })
  if (!response.destroyed) {
    try { response.end() } catch { /* 客户端可能已断开 */ }
  }
}

async function handleNovelRequest(
  subpath: string,
  request: IncomingMessage,
  response: ServerResponse,
  database: PlatformDatabase,
) {
  if (!NOVEL_API_SUBPATHS.has(subpath)) {
    response.writeHead(404, corsHeadersFor(request)).end()
    return
  }

  const config = readNovelApiConfig(database)
  const slot = subpath === 'gen' ? config.gen : config.gen2
  const endpoint = normalizeEndpoint(slot.endpoint)
  if (!endpoint || !slot.apiKey.trim() || !slot.model.trim()) {
    writeText(request, response, 'API 未配置，请先在「设置 → AI 小说」中填写 API 地址、Key 和模型名')
    return
  }

  let body: Record<string, unknown>
  try {
    body = await readJsonBody(request)
  } catch {
    writeText(request, response, '请求体解析失败')
    return
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  if (!prompt.trim()) {
    writeText(request, response, '提示词为空')
    return
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slot.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: slot.model.trim(),
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    })
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      writeText(request, response, `API 请求失败: ${upstream.status} ${detail.slice(0, 500)}`)
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeadersFor(request) })
    await pipeSseContent(upstream.body, response)
  } catch (error) {
    writeText(request, response, `API 请求异常: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function createNovelApiHandler(database: PlatformDatabase) {
  return (subpath: string, request: IncomingMessage, response: ServerResponse) => {
    void handleNovelRequest(subpath, request, response, database)
  }
}

export async function testNovelConnection(
  database: PlatformDatabase,
  slot: 'gen' | 'gen2',
  prompt = '请用一句话介绍你自己。',
): Promise<{ ok: boolean; text: string }> {
  const config = readNovelApiConfig(database)
  const slotConfig = slot === 'gen' ? config.gen : config.gen2
  const endpoint = normalizeEndpoint(slotConfig.endpoint)
  if (!endpoint || !slotConfig.apiKey.trim() || !slotConfig.model.trim()) {
    return { ok: false, text: 'API 未配置，请先填写 API 地址、Key 和模型名' }
  }
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slotConfig.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: slotConfig.model.trim(),
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    })
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      return { ok: false, text: `API 请求失败: ${upstream.status} ${detail.slice(0, 500)}` }
    }
    const parts: string[] = []
    await consumeSse(upstream.body, content => parts.push(content))
    const text = parts.join('').trim()
    return { ok: Boolean(text), text: text || '接口已连通，但没有返回内容' }
  } catch (error) {
    return { ok: false, text: `API 请求异常: ${error instanceof Error ? error.message : String(error)}` }
  }
}
