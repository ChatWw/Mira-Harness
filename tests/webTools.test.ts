import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCitationContext, createWebFetchTool, createWebSearchTool } from '../electron/webTools'

function response(body: string, contentType = 'text/html', url = '') {
  const value = new Response(body, { status: 200, headers: { 'content-type': contentType } })
  if (url) Object.defineProperty(value, 'url', { value: url })
  return value
}

const searchHtml = (suffix: string) => `
  <li class="b_algo"><h2><a href="https://example.com/${suffix}-a">标题 A</a></h2><p>摘要 A</p></li>
  <li class="b_algo"><h2><a href="https://example.com/${suffix}-b">标题 B</a></h2><p>摘要 B</p></li>`

afterEach(() => vi.unstubAllGlobals())

describe('web citation tools', () => {
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
})
