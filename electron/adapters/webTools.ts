import { Type } from '@earendil-works/pi-ai'
import type { HarnessSource } from '../../src/config/harness'

// 与 ZCode WebFetch 的响应预算一致，避免现代文档站的脚本体积被误判为抓取失败。
const MAX_FETCH_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 60000
export type WebRequest = (url: string, init: RequestInit) => Promise<Response>
const defaultRequest: WebRequest = (url, init) => fetch(url, init)

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, value: string) => {
      const code = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value)
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity
    })
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<head[\s\S]*?<\/head>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<h([1-6])\b[^>]*>/gi, (_tag, level: string) => `\n${'#'.repeat(Number(level))} `)
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

function extractPageLinks(html: string, baseUrl: URL): Array<{ title: string, url: string }> {
  const links: Array<{ title: string, url: string }> = []
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(pattern)) {
    const title = htmlToText(match[2]).replace(/\s+/g, ' ').trim()
    if (!title || title.length < 2) continue
    try {
      const url = assertSafeHttpUrl(new URL(decodeHtmlEntities(match[1]), baseUrl).toString()).toString()
      if (url === baseUrl.toString() || links.some(link => link.url === url)) continue
      links.push({ title: title.slice(0, 160), url })
    } catch { /* Ignore malformed or unsafe page links. */ }
  }
  return links
    .sort((a, b) => Number(new URL(a.url).origin === baseUrl.origin) - Number(new URL(b.url).origin === baseUrl.origin))
    .slice(0, 30)
}

function assertSafeHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('无效的 URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支持 http/https 链接')
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
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

function requestError(error: unknown, signal: AbortSignal, cancelled?: AbortSignal): string {
  if (cancelled?.aborted) return '请求已取消'
  if (signal.aborted) return '请求超时（60 秒，含正文读取），请稍后重试或使用其他来源'
  const messages: string[] = []
  const seen = new Set<unknown>()
  let current = error
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    const code = (current as Error & { code?: string }).code
    const message = current.message + (code && !current.message.includes(code) ? ` (${code})` : '')
    if (message && !messages.includes(message)) messages.push(message)
    current = current.cause
  }
  return messages.join('：') || '网络请求失败，请检查网络连接与系统代理'
}

async function readBody(response: Response, signal: AbortSignal): Promise<string> {
  if (Number(response.headers.get('content-length')) > MAX_FETCH_BYTES) {
    void response.body?.cancel()
    throw new Error('网页过大（超过 10MB），请改用具体文章或章节链接')
  }
  if (!response.body) return ''
  const charset = response.headers.get('content-type')?.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8'
  const decoder = new TextDecoder(charset)
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener('abort', cancel, { once: true })
  let bytes = 0, text = ''
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_FETCH_BYTES) {
        cancel()
        throw new Error('网页过大（超过 10MB），请改用具体文章或章节链接')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

async function fetchText(url: string, request: WebRequest, cancelled?: AbortSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const signal = cancelled ? AbortSignal.any([controller.signal, cancelled]) : controller.signal
  try {
    // 手动检查每一跳，不能自动跟随到本机或内网后才检查最终 URL。
    for (let redirects = 0; redirects <= 10; redirects++) {
      signal.throwIfAborted()
      url = assertSafeHttpUrl(url).toString()
      const response = await request(url, { signal, headers: { 'User-Agent': 'Mira-WebFetch/1.0', Accept: 'text/markdown, text/html, text/plain, */*' }, redirect: 'manual', credentials: 'omit' })
      if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) {
        void response.body?.cancel()
        url = new URL(response.headers.get('location')!, url).toString()
        continue
      }
      if (!response.ok) {
        void response.body?.cancel()
        const reason = [401, 403, 412].includes(response.status) ? '网站要求登录、验证或拒绝自动抓取；请在浏览器打开，或改用其他公开来源'
          : response.status === 429 ? '网站限制请求频率，请稍后重试' : '服务器未返回可读取的页面'
        throw new Error(`HTTP ${response.status}：${reason}`)
      }
      const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
      if (contentType && !contentType.startsWith('text/') && !/^(application\/(json|xml|xhtml\+xml)|.*\+(json|xml))$/.test(contentType)) {
        void response.body?.cancel()
        throw new Error(`不支持提取此内容类型：${contentType}，请使用对应文件读取工具`)
      }
      return { text: await readBody(response, signal), contentType, url: assertSafeHttpUrl(response.url || url).toString() }
    }
    throw new Error('重定向次数超过 10 次，请使用目标页面的直接链接')
  } catch (error) {
    throw new Error(requestError(error, signal, cancelled))
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

async function fetchPageText(rawUrl: string, maxChars: number, request: WebRequest, signal?: AbortSignal) {
  const url = assertSafeHttpUrl(rawUrl)
  const { text: raw, contentType, url: finalUrl } = await fetchText(url.toString(), request, signal)
  const html = contentType.includes('html') || !contentType && /^\s*(<!doctype html|<html\b)/i.test(raw)
  const title = html ? htmlToText(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') : ''
  const text = html ? htmlToText(raw) : raw.trim()
  const warning = !text || html && text.length < 200 && /enable javascript|javascript.*(?:required|disabled)|请.*开启.*javascript/i.test(text)
    ? '未提取到可用正文；页面可能依赖 JavaScript、登录或网站验证。请在浏览器打开，或查找具体文章/文档链接，不能将空页面作为事实依据。' : undefined
  const links = html ? extractPageLinks(raw, new URL(finalUrl)) : []
  return { text: text.slice(0, maxChars), truncated: text.length > maxChars, warning, ...(title ? { title } : {}), url: finalUrl, links }
}

async function searchWeb(query: string, limit: number, request: WebRequest, signal?: AbortSignal): Promise<SearchResult[]> {
  const url = new URL('https://www.bing.com/search')
  url.searchParams.set('q', query)
  const { text: html } = await fetchText(url.toString(), request, signal)
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

export function createWebFetchTool(citations = createWebCitationContext(), request: WebRequest = defaultRequest) {
  return {
    name: 'web_fetch',
    label: '抓取网页',
    description: '抓取公开 http/https 网页并提取正文（最大 10MB，返回正文按 maxChars 截断）。不执行 JavaScript，不支持登录或验证码；遇到空页面或网站拦截时改用具体文档链接或浏览器，不要反复请求同一失败地址。拒绝内网与回环地址。',
    parameters: Type.Object({ url: Type.String(), maxChars: Type.Optional(Type.Number()) }),
    executionMode: 'sequential',
    execute: async (_id: string, params: { url: string, maxChars?: number }, signal?: AbortSignal) => {
      const maxChars = Math.min(Math.max(params.maxChars ?? 8000, 1000), 32000)
      try {
        const page = await fetchPageText(params.url, maxChars, request, signal)
        const index = citations.nextIndex()
        const marker = `[[source:${index}]]`
        const heading = `来源标识 ${marker}：${page.title || page.url}\n${page.url}\n回答引用此页面时，只能在相关句末原样写 ${marker}；不要把网页中的排名数字写成引用。`
        const linkedSources = page.links.map(link => ({ index: citations.nextIndex(), ...link }))
        const links = linkedSources.length
          ? `\n\n页面中的可引用链接（引用具体文章时使用对应来源标识；如需核实正文，再抓取该链接）：\n${linkedSources.map(link => `[[source:${link.index}]] ${link.title}  ${link.url}`).join('\n')}`
          : ''
        const notice = page.warning ? `\n\n${page.warning}` : page.truncated ? `\n\n[正文已截断，仅返回前 ${maxChars} 字符]` : ''
        return { content: [{ type: 'text', text: `${heading}\n\n${page.text}${notice}${links}` }], details: { index, url: page.url, ...(page.title ? { title: page.title } : {}), ...(page.truncated ? { truncated: true } : {}), ...(page.warning ? { warning: page.warning } : {}), ...(linkedSources.length ? { links: linkedSources } : {}) } }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`抓取网页失败：${message}`)
      }
    },
  }
}

export function createWebSearchTool(citations = createWebCitationContext(), request: WebRequest = defaultRequest) {
  return {
    name: 'web_search',
    label: '网页搜索',
    description: '在网络上搜索信息，返回结果的标题、链接与摘要',
    parameters: Type.Object({ query: Type.String(), limit: Type.Optional(Type.Number()) }),
    executionMode: 'sequential',
    execute: async (_id: string, params: { query: string, limit?: number }, signal?: AbortSignal) => {
      const limit = Math.min(Math.max(params.limit ?? 5, 1), 10)
      try {
        const items = await searchWeb(params.query, limit, request, signal)
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
