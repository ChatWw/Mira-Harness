import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamdownContext } from 'streamdown'
import { MessageMarkdown, prepareMarkdownHighlights, renderCompletedMarkdown } from '../apps/harness-react/src/components/conversation/markdown'
import { MiraMarkdownCode, MiraStreamingCode } from '../apps/harness-react/src/components/conversation/MiraStreamingCode'
import { miraCodeHighlighter } from '../apps/harness-react/src/lib/code-highlighter'

beforeEach(() => vi.stubGlobal('React', React))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Mira streaming Markdown code semantics', () => {
  it('keeps inline code inline without invoking the tokenizer', () => {
    const highlight = vi.spyOn(miraCodeHighlighter, 'highlight')
    const html = renderToStaticMarkup(React.createElement(MessageMarkdown, { streaming: true, content: '正文 `const answer = 42` 结尾' }))
    expect(html).toContain('data-streamdown="inline-code"')
    expect(html).not.toContain('data-streamdown="code-block"')
    expect(html).toContain('const answer = 42')
    expect(highlight).not.toHaveBeenCalled()
  })

  it('renders a no-language fence as a complete, escaped block before highlighting', () => {
    const html = renderToStaticMarkup(React.createElement(MessageMarkdown, { streaming: true, content: '```\n<safe> & value\nlast line\n```' }))
    expect(html).toContain('data-streamdown="code-block"')
    expect(html).toContain('data-language="text"')
    expect(html).toContain('&lt;safe&gt; &amp; value')
    expect(html).toContain('last line')
    expect(html).not.toContain('data-streamdown="inline-code"')
    expect(html).toContain('data-streamdown="code-block-copy-button"')
  })

  it('retains startLine/noLineNumbers metadata from the public Streamdown code props', () => {
    const props = { 'data-block': 'true', children: 'const answer = 42;\n', className: 'language-typescript', node: { type: 'element', tagName: 'code', properties: { metastring: 'startLine=7' }, children: [] } } as const
    const html = renderToStaticMarkup(React.createElement(MiraMarkdownCode, props))
    expect(html).toContain('counter-reset:line 6')
    expect(html).toContain('before:content-[counter(line)]')
    const hidden = renderToStaticMarkup(React.createElement(MiraMarkdownCode, { ...props, node: { ...props.node, properties: { metastring: 'startLine=7 noLineNumbers' } } }))
    expect(hidden).not.toContain('before:content-[counter(line)]')
  })

  it('respects disabled controls and zero maximum-height without losing code', () => {
    const context = { controls: false, codeBlockMaxHeight: 0, isAnimating: false, lineNumbers: false, mode: 'streaming' as const, shikiTheme: ['github-light', 'github-dark'] as [string, string], tableMaxHeight: 300 }
    const html = renderToStaticMarkup(React.createElement(StreamdownContext.Provider, { value: context }, React.createElement(MiraStreamingCode, { code: 'first\nlast\n', language: 'text' })))
    expect(html).not.toContain('code-block-copy-button')
    expect(html).not.toContain('code-block-download-button')
    expect(html).not.toContain('max-height:')
    expect(html).toContain('first')
    expect(html).toContain('last')
  })

  it('uses identical numbered line structure before and after tokens arrive without calling raw highlighted', () => {
    const code = 'first\nsecond\n\n'
    const cached = vi.spyOn(miraCodeHighlighter, 'getCached').mockReturnValue(undefined)
    const raw = renderToStaticMarkup(React.createElement(MiraStreamingCode, { code, language: 'text' }))
    expect(raw).toContain('data-highlight-state="loading"')
    expect(raw.match(/class="line"/g)).toHaveLength(4)
    expect(raw).toContain('[&amp;_.line]:before:w-6')
    expect(raw).not.toContain('color:#D73A49')
    cached.mockReturnValue({ tokens: code.split('\n').map(content => [{ content, offset: 0, htmlStyle: { color: '#D73A49', '--shiki-dark': '#F97583' } }]) })
    const ready = renderToStaticMarkup(React.createElement(MiraStreamingCode, { code, language: 'text' }))
    expect(ready).toContain('data-highlight-state="ready"')
    expect(ready.match(/class="line"/g)).toHaveLength(4)
    expect(ready).toContain('[&amp;_.line]:before:w-6')
    expect(ready).toContain('color:#D73A49')
  })

  it('preserves completed citations and the exact multiline copy payload', () => {
    const code = '  const answer = "<safe>";\n\n'
    const content = `结论[1]，未知[9]。\n\n\`\`\`javascript\n${code}\`\`\``
    const html = renderCompletedMarkdown(content, [{ index: 1, title: '来源', url: 'https://example.com' }])
    expect(html).toContain(`data-code="${encodeURIComponent(code)}"`)
    expect(html.match(/data-citation-index="1"/g)).toHaveLength(1)
    expect(html).toContain('未知[9]')
    expect(html).toContain('&lt;safe&gt;')
    const component = renderToStaticMarkup(React.createElement(MessageMarkdown, { content, sources: [{ index: 1, title: '来源', url: 'https://example.com' }] }))
    expect(component).toContain('[&amp;_.citation-marker_button]:leading-normal!')
  })

  it('passes the same cancellation signal to every completed fence request', async () => {
    const highlight = vi.spyOn(miraCodeHighlighter, 'highlight').mockImplementation(async options => ({ tokens: options.code.split('\n').map(content => [{ content, offset: 0 }]) }))
    const cancellation = new AbortController()
    const content = '```javascript\nconst one = 1;\n```\n\n```python\nprint(2)\n```'
    const blocks = await prepareMarkdownHighlights(content, cancellation.signal)
    expect(blocks.size).toBe(2)
    expect(highlight).toHaveBeenCalledTimes(2)
    expect(highlight.mock.calls.every(([, signal]) => signal === cancellation.signal)).toBe(true)
  })

  it('rejects pre-aborted preparation without starting work and propagates genuine failures', async () => {
    const highlight = vi.spyOn(miraCodeHighlighter, 'highlight').mockRejectedValue(new Error('fixture worker failure'))
    const cancellation = new AbortController()
    cancellation.abort()
    await expect(prepareMarkdownHighlights('```\nfirst\n```', cancellation.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(highlight).not.toHaveBeenCalled()
    await expect(prepareMarkdownHighlights('```\nfirst\n```')).rejects.toThrow('fixture worker failure')
  })

  it('prepares all 300 fences in source order with at most four active requests', async () => {
    let active = 0
    let peak = 0
    vi.spyOn(miraCodeHighlighter, 'highlight').mockImplementation(async options => {
      active += 1
      peak = Math.max(peak, active)
      await Promise.resolve()
      active -= 1
      return { tokens: [[{ content: options.code, offset: 0 }]] }
    })
    const content = Array.from({ length: 300 }, (_, index) => `\`\`\`text\nentry ${index}\n\`\`\``).join('\n\n')
    const blocks = await prepareMarkdownHighlights(content)
    expect(blocks.size).toBe(300)
    expect(peak).toBe(4)
    expect([...blocks.values()].map(result => result.tokens[0][0].content)).toEqual(Array.from({ length: 300 }, (_, index) => `entry ${index}\n`))
  })

  it('cancels every active completed-fence request without submitting the queued remainder', async () => {
    const signals: AbortSignal[] = []
    const highlight = vi.spyOn(miraCodeHighlighter, 'highlight').mockImplementation((_options, signal) => new Promise((_resolve, reject) => {
      signals.push(signal!)
      signal!.addEventListener('abort', () => reject(new DOMException('fixture abort', 'AbortError')), { once: true })
    }))
    const cancellation = new AbortController()
    const content = Array.from({ length: 300 }, (_, index) => `\`\`\`text\nentry ${index}\n\`\`\``).join('\n\n')
    const preparation = prepareMarkdownHighlights(content, cancellation.signal)
    expect(highlight).toHaveBeenCalledTimes(4)
    cancellation.abort()
    await expect(preparation).rejects.toMatchObject({ name: 'AbortError' })
    expect(signals.every(signal => signal === cancellation.signal && signal.aborted)).toBe(true)
    expect(highlight).toHaveBeenCalledTimes(4)
  })
})
