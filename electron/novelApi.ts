import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NovelModelProfile, NovelModelProfiles, NovelModelRole } from '../src/config/novel'
import { EMPTY_NOVEL_MODEL_PROFILES, NOVEL_MODEL_PROFILES_PREFERENCE_KEY } from '../src/config/novel'
import type { PlatformDatabase } from './database'
import { corsHeadersFor } from './localMicroAppServer'

const NOVEL_MODEL_ROLES = new Set<NovelModelRole>(['authoring', 'automation'])

function normalizeProfile(value: unknown): NovelModelProfile {
  const profile = value && typeof value === 'object' ? value as Partial<NovelModelProfile> : {}
  return {
    endpoint: typeof profile.endpoint === 'string' ? profile.endpoint : '',
    apiKey: typeof profile.apiKey === 'string' ? profile.apiKey : '',
    modelId: typeof profile.modelId === 'string' ? profile.modelId : '',
  }
}

export function readNovelModelProfiles(database: PlatformDatabase): NovelModelProfiles {
  const stored = database.getSnapshot().preferences[NOVEL_MODEL_PROFILES_PREFERENCE_KEY]
  const raw = stored && typeof stored === 'object' ? stored as Partial<NovelModelProfiles> : {}
  return {
    authoring: normalizeProfile(raw.authoring || EMPTY_NOVEL_MODEL_PROFILES.authoring),
    automation: normalizeProfile(raw.automation || EMPTY_NOVEL_MODEL_PROFILES.automation),
  }
}

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

function getProfile(database: PlatformDatabase, role: NovelModelRole) {
  const binding = database.models.bindings()[role === 'authoring' ? 'novelAuthoring' : 'novelAutomation']
  if (binding) {
    const provider = database.models.get(binding.providerId)
    const apiKey = database.models.getSecret(binding.providerId)
    if (provider?.enabled && apiKey) return { endpoint: normalizeEndpoint(provider.endpoint), apiKey, modelId: binding.modelId }
  }
  const profile = readNovelModelProfiles(database)[role]
  const endpoint = normalizeEndpoint(profile.endpoint)
  if (!endpoint || !profile.apiKey.trim() || !profile.modelId.trim()) {
    throw new Error(`“${role === 'authoring' ? '创作模型' : '自动处理模型'}”尚未配置，请先前往「设置 → AI 小说」完成配置`)
  }
  return { ...profile, endpoint }
}

async function requestModel(profile: NovelModelProfile & { endpoint: string }, prompt: string, signal?: AbortSignal) {
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
  if (!NOVEL_MODEL_ROLES.has(subpath as NovelModelRole)) {
    writeError(request, response, 404, '未找到小说模型职责')
    return
  }
  let prompt = ''
  try {
    const body = await readJsonBody(request)
    prompt = typeof body.prompt === 'string' ? body.prompt : ''
  } catch {
    writeError(request, response, 400, '请求体不是有效 JSON')
    return
  }
  if (!prompt.trim()) {
    writeError(request, response, 400, '创作提示不能为空')
    return
  }

  let profile: NovelModelProfile & { endpoint: string }
  try {
    profile = getProfile(database, subpath as NovelModelRole)
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

export async function testNovelModelConnection(database: PlatformDatabase, role: NovelModelRole, prompt = '请用一句话介绍你自己。') {
  try {
    const upstream = await requestModel(getProfile(database, role), prompt)
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      return { ok: false, text: `模型请求失败: ${upstream.status} ${detail.slice(0, 500)}` }
    }
    const parts: string[] = []
    await consumeSse(upstream.body, content => parts.push(content))
    const text = parts.join('').trim()
    return { ok: Boolean(text), text: text || '模型已连通，但没有返回内容' }
  } catch (error) {
    return { ok: false, text: error instanceof Error ? error.message : String(error) }
  }
}
