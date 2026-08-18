import { Type } from '@earendil-works/pi-ai'

const MAX_FETCH_BYTES = 512 * 1024
const FETCH_TIMEOUT_MS = 15000

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<head[\s\S]*?<\/head>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

function assertSafeHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('无效的 URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支持 http/https 链接')
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0' || hostname.endsWith('.local')) {
    throw new Error('不允许访问本机地址')
  }
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname)) {
    throw new Error('不允许访问内网地址')
  }
  if (/^172\./.test(hostname)) {
    const second = Number(hostname.split('.')[1])
    if (second >= 16 && second <= 31) throw new Error('不允许访问内网地址')
  }
  return url
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mira/1.0' }, redirect: 'follow' })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchPageText(rawUrl: string, maxChars: number): Promise<string> {
  const url = assertSafeHttpUrl(rawUrl)
  const response = await fetchWithTimeout(url.toString(), FETCH_TIMEOUT_MS)
  if (!response.ok) throw new Error(`抓取失败：HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_FETCH_BYTES) throw new Error(`网页过大（超过 ${MAX_FETCH_BYTES / 1024}KB）`)
  const raw = new TextDecoder('utf-8').decode(buffer)
  const text = contentType.includes('html') ? htmlToText(raw) : raw
  return text.slice(0, maxChars)
}

async function searchWeb(query: string, limit: number): Promise<string> {
  const url = new URL('https://www.bing.com/search')
  url.searchParams.set('q', query)
  const response = await fetchWithTimeout(url.toString(), FETCH_TIMEOUT_MS)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const html = await response.text()
  const items: string[] = []
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) || []
  for (const block of blocks) {
    if (items.length >= limit) break
    const href = block.match(/<h2[^>]*><a[^>]*href="([^"]+)"/i)?.[1]
    const title = block.match(/<h2[^>]*><a[^>]*>([\s\S]*?)<\/a>/i)?.[1]
    const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]
    if (href && title) {
      items.push(`${htmlToText(title)}\n${decodeHtmlEntities(href)}\n${htmlToText(snippet || '')}`)
    }
  }
  return items.length ? items.join('\n\n') : '没有找到搜索结果'
}

export function createWebFetchTool() {
  return {
    name: 'web_fetch',
    label: '抓取网页',
    description: '抓取指定 URL 的网页并提取正文文本（只支持 http/https，拒绝内网与回环地址，网页过大会截断）',
    parameters: Type.Object({ url: Type.String(), maxChars: Type.Optional(Type.Number()) }),
    executionMode: 'sequential',
    execute: async (_id: string, params: { url: string, maxChars?: number }) => {
      const maxChars = Math.min(Math.max(params.maxChars ?? 8000, 1000), 32000)
      try {
        const text = await fetchPageText(params.url, maxChars)
        return { content: [{ type: 'text', text }], details: { url: params.url } }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: 'text', text: `抓取网页失败：${message}` }], details: { url: params.url } }
      }
    },
  }
}

export function createWebSearchTool() {
  return {
    name: 'web_search',
    label: '网页搜索',
    description: '在网络上搜索信息，返回结果的标题、链接与摘要',
    parameters: Type.Object({ query: Type.String(), limit: Type.Optional(Type.Number()) }),
    executionMode: 'sequential',
    execute: async (_id: string, params: { query: string, limit?: number }) => {
      const limit = Math.min(Math.max(params.limit ?? 5, 1), 10)
      try {
        const text = await searchWeb(params.query, limit)
        return { content: [{ type: 'text', text }], details: { query: params.query } }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: 'text', text: `网页搜索失败：${message}。请检查网络连接。` }], details: { query: params.query } }
      }
    },
  }
}
