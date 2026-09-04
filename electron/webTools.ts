import { Type } from '@earendil-works/pi-ai'
import type { HarnessSource } from '../src/config/harness'

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

export function createWebCitationContext() {
  let nextIndex = 1
  return { nextIndex: () => nextIndex++ }
}

type WebCitationContext = ReturnType<typeof createWebCitationContext>
type SearchResult = Omit<HarnessSource, 'index'>

async function fetchPageText(rawUrl: string, maxChars: number): Promise<{ text: string, title?: string, url: string }> {
  const url = assertSafeHttpUrl(rawUrl)
  const response = await fetchWithTimeout(url.toString(), FETCH_TIMEOUT_MS)
  if (!response.ok) throw new Error(`抓取失败：HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_FETCH_BYTES) throw new Error(`网页过大（超过 ${MAX_FETCH_BYTES / 1024}KB）`)
  const raw = new TextDecoder('utf-8').decode(buffer)
  const title = contentType.includes('html') ? htmlToText(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') : ''
  const text = contentType.includes('html') ? htmlToText(raw) : raw
  const finalUrl = assertSafeHttpUrl(response.url || url.toString()).toString()
  return { text: text.slice(0, maxChars), ...(title ? { title } : {}), url: finalUrl }
}

async function searchWeb(query: string, limit: number): Promise<SearchResult[]> {
  const url = new URL('https://www.bing.com/search')
  url.searchParams.set('q', query)
  const response = await fetchWithTimeout(url.toString(), FETCH_TIMEOUT_MS)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const html = await response.text()
  const items: SearchResult[] = []
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) || []
  for (const block of blocks) {
    if (items.length >= limit) break
    const href = block.match(/<h2[^>]*><a[^>]*href="([^"]+)"/i)?.[1]
    const title = block.match(/<h2[^>]*><a[^>]*>([\s\S]*?)<\/a>/i)?.[1]
    const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]
    if (href && title) {
      try {
        const parsedTitle = htmlToText(title)
        const resultUrl = assertSafeHttpUrl(decodeHtmlEntities(href)).toString()
        const summary = htmlToText(snippet || '')
        if (parsedTitle) items.push({ title: parsedTitle, url: resultUrl, ...(summary ? { snippet: summary } : {}) })
      } catch { /* Ignore malformed or unsafe search results. */ }
    }
  }
  return items
}

export function createWebFetchTool(citations = createWebCitationContext()) {
  return {
    name: 'web_fetch',
    label: '抓取网页',
    description: '抓取指定 URL 的网页并提取正文文本（只支持 http/https，拒绝内网与回环地址，网页过大会截断）',
    parameters: Type.Object({ url: Type.String(), maxChars: Type.Optional(Type.Number()) }),
    executionMode: 'sequential',
    execute: async (_id: string, params: { url: string, maxChars?: number }) => {
      const maxChars = Math.min(Math.max(params.maxChars ?? 8000, 1000), 32000)
      try {
        const page = await fetchPageText(params.url, maxChars)
        const index = citations.nextIndex()
        const marker = `[[source:${index}]]`
        const heading = `来源标识 ${marker}：${page.title || page.url}\n${page.url}\n回答引用此页面时，只能在相关句末原样写 ${marker}；不要把网页中的排名数字写成引用。`
        return { content: [{ type: 'text', text: `${heading}\n\n${page.text}` }], details: { index, url: page.url, ...(page.title ? { title: page.title } : {}) } }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`抓取网页失败：${message}`)
      }
    },
  }
}

export function createWebSearchTool(citations = createWebCitationContext()) {
  return {
    name: 'web_search',
    label: '网页搜索',
    description: '在网络上搜索信息，返回结果的标题、链接与摘要',
    parameters: Type.Object({ query: Type.String(), limit: Type.Optional(Type.Number()) }),
    executionMode: 'sequential',
    execute: async (_id: string, params: { query: string, limit?: number }) => {
      const limit = Math.min(Math.max(params.limit ?? 5, 1), 10)
      try {
        const items = await searchWeb(params.query, limit)
        const results = items.map(item => ({ index: citations.nextIndex(), ...item }))
        const text = results.length
          ? `找到 ${results.length} 条结果。每条的 [[source:N]] 是内部来源标识；回答引用时只能在相关句末原样复制该标识，不能使用搜索排名或网页序号：\n${results.map(item => `[[source:${item.index}]] ${item.title}  ${item.url}${item.snippet ? `\n    ${item.snippet}` : ''}`).join('\n')}`
          : '没有找到搜索结果'
        return { content: [{ type: 'text', text }], details: { query: params.query, results } }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`网页搜索失败：${message}。请检查网络连接。`)
      }
    },
  }
}
