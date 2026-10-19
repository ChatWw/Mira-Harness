import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCitationContext, createWebFetchTool, createWebSearchTool } from '../electron/adapters/webTools'

function response(body: string, contentType = 'text/html', url = '') {
  const value = new Response(body, { status: 200, headers: { 'content-type': contentType } })
  if (url) Object.defineProperty(value, 'url', { value: url })
  return value
}

const searchHtml = (suffix: string) => `
  <li class="b_algo"><h2><a href="https://example.com/${suffix}-a">标题 A</a></h2><p>摘要 A</p></li>
  <li class="b_algo"><h2><a href="https://example.com/${suffix}-b">标题 B</a></h2><p>摘要 B</p></li>`

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('web citation tools', () => {
  it('extracts document pages larger than 512KB and marks only the returned text as truncated', async () => {
    const request = vi.fn().mockResolvedValue(response(`<html><head><title>文档</title><script>${'x'.repeat(900000)}</script></head><body><h1>模型说明</h1><p>${'正文'.repeat(1000)}</p></body></html>`))
    const result = await createWebFetchTool(undefined, request).execute('large', { url: 'https://docs.example.com/', maxChars: 1000 })
    expect(result.content[0].text).toContain('# 模型说明')
    expect(result.content[0].text).toContain('正文已截断')
    expect(result.content[0].text).not.toContain('xxxxx')
    expect(result.details.truncated).toBe(true)
    expect(request).toHaveBeenCalledWith('https://docs.example.com/', expect.objectContaining({ redirect: 'manual', credentials: 'omit' }))
  })

  it('cancels an oversized streaming response before downloading its remaining body', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(6 * 1024 * 1024)) }, cancel })
    const request = vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/plain' } }))
    await expect(createWebFetchTool(undefined, request).execute('large', { url: 'https://example.com/' })).rejects.toThrow('超过 10MB')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('keeps the timeout active after response headers while the body stalls', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const request = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel })))
    const pending = createWebFetchTool(undefined, request).execute('slow', { url: 'https://example.com/' })
    const outcome = expect(pending).rejects.toThrow('请求超时（60 秒，含正文读取）')
    await vi.advanceTimersByTimeAsync(60000)
    await outcome
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('stops reading when the user cancels a tool call', async () => {
    const cancel = vi.fn(), controller = new AbortController()
    const request = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel })))
    const pending = createWebFetchTool(undefined, request).execute('cancel', { url: 'https://example.com/' }, controller.signal)
    const outcome = expect(pending).rejects.toThrow('请求已取消')
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
    controller.abort()
    await outcome
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('checks redirect destinations before requesting them and keeps valid relative redirects working', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/article' } }))
      .mockResolvedValueOnce(response('<p>文章正文</p>'))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }))
    const tool = createWebFetchTool(undefined, request)
    const result = await tool.execute('redirect', { url: 'https://example.com/' })
    expect(result.details.url).toBe('https://example.com/article')
    await expect(tool.execute('private', { url: 'https://example.com/' })).rejects.toThrow('不允许访问内网地址')
    expect(request).toHaveBeenCalledTimes(3)
    expect(request.mock.calls[1][0]).toBe('https://example.com/article')
  })

  it('shows website blocking separately from connection errors without retrying or adding citations', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response('', { status: 412 }))
      .mockRejectedValueOnce(new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) }))
      .mockResolvedValueOnce(response('<p>可读取正文</p>'))
    const tool = createWebFetchTool(undefined, request)
    await expect(tool.execute('blocked', { url: 'https://example.com/' })).rejects.toThrow('HTTP 412：网站要求登录、验证或拒绝自动抓取')
    await expect(tool.execute('dns', { url: 'https://example.com/' })).rejects.toThrow('ENOTFOUND')
    expect((await tool.execute('ok', { url: 'https://example.com/' })).details.index).toBe(1)
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('reports JavaScript shells and rejects binary files instead of presenting them as page text', async () => {
    const request = vi.fn().mockResolvedValueOnce(response('<html><head><title>App</title></head><body><div id="app"></div><script>boot()</script></body></html>'))
      .mockResolvedValueOnce(response('binary', 'application/pdf'))
    const tool = createWebFetchTool(undefined, request)
    const result = await tool.execute('shell', { url: 'https://example.com/' })
    expect(result.details.warning).toContain('页面可能依赖 JavaScript')
    expect(result.content[0].text).toContain('不能将空页面作为事实依据')
    await expect(tool.execute('pdf', { url: 'https://example.com/file.pdf' })).rejects.toThrow('不支持提取此内容类型：application/pdf')
  })

  it('decodes Chinese page charsets and numeric entities', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]), { headers: { 'content-type': 'text/plain; charset=gbk' } }))
      .mockResolvedValueOnce(response('<p>&#20013;&#x6587;</p>'))
    const tool = createWebFetchTool(undefined, request)
    expect((await tool.execute('gbk', { url: 'https://example.com/' })).content[0].text).toContain('中文')
    expect((await tool.execute('entities', { url: 'https://example.com/' })).content[0].text).toContain('中文')
  })

  it('shares continuous indexes within one run and resets for a new run', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(searchHtml('first')))
      .mockResolvedValueOnce(response(searchHtml('second')))
      .mockResolvedValueOnce(response('<html><head><title>页面标题</title></head><body><p>正文</p></body></html>', 'text/html', 'https://example.com/final'))
      .mockResolvedValueOnce(response(searchHtml('new'))))
    const citations = createWebCitationContext()
    const search = createWebSearchTool(citations)
    const fetchPage = createWebFetchTool(citations)

    const first = await search.execute('search-1', { query: '第一次' })
    const second = await search.execute('search-2', { query: '第二次' })
    const page = await fetchPage.execute('fetch-1', { url: 'https://example.com/page' })
    const nextRun = await createWebSearchTool(createWebCitationContext()).execute('search-3', { query: '下一轮' })

    expect(first.details.results.map(item => item.index)).toEqual([1, 2])
    expect(first.content[0].text).toContain('[[source:1]] 标题 A')
    expect(second.details.results.map(item => item.index)).toEqual([3, 4])
    expect(page.details).toEqual({ index: 5, url: 'https://example.com/final', title: '页面标题' })
    expect(page.content[0].text).toContain('来源标识 [[source:5]]：页面标题')
    expect(nextRun.details.results.map(item => item.index)).toEqual([1, 2])
  })

  it('throws failed requests without consuming a citation index', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response(searchHtml('success'))))
    const citations = createWebCitationContext()
    const fetchPage = createWebFetchTool(citations)
    const search = createWebSearchTool(citations)

    await expect(fetchPage.execute('fetch-1', { url: 'https://example.com/page' })).rejects.toThrow('抓取网页失败：offline')
    const result = await search.execute('search-1', { query: '恢复后' })
    expect(result.details.results[0].index).toBe(1)
  })

  it('keeps article links from fetched HTML so the agent can fetch direct sources', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(`
      <html><head><title>热榜</title></head><body>
        <a href="/category">站内分类</a>
        <a href="https://news.example.com/posts/42">新闻详情</a>
        <a href="javascript:alert(1)">危险链接</a>
      </body></html>
    `, 'text/html', 'https://example.com/hot')))

    const result = await createWebFetchTool().execute('fetch-1', { url: 'https://example.com/hot' })

    expect(result.content[0].text).toContain('页面中的可引用链接')
    expect(result.content[0].text).toContain('[[source:2]] 新闻详情  https://news.example.com/posts/42')
    expect(result.content[0].text).toContain('[[source:3]] 站内分类  https://example.com/category')
    expect(result.content[0].text).not.toContain('javascript:')
    expect(result.details.links).toEqual([
      { index: 2, title: '新闻详情', url: 'https://news.example.com/posts/42' },
      { index: 3, title: '站内分类', url: 'https://example.com/category' },
    ])
  })
})
