import { describe, expect, it, vi } from 'vitest'
import { bundledLanguages, bundledLanguagesInfo } from 'shiki/langs'
import type { TokensResult } from 'shiki/core'
import type { MiraHighlightResult } from '../apps/harness-react/src/lib/code-highlight-protocol'
import { createMiraCodeHighlighter, miraCodeHighlighter, miraCodeThemes, renderMiraHighlightedCode } from '../apps/harness-react/src/lib/code-highlighter'
import { prepareMarkdownHighlights, renderCompletedMarkdown } from '../apps/harness-react/src/components/conversation/markdown'

// Node tests exercise real grammars; browser/opaque Worker acceptance has separate evidence.
vi.mock('../apps/harness-react/src/lib/code-highlight-worker-client', async () => {
  const { createMiraHighlightCore } = await import('../apps/harness-react/src/lib/code-highlight-core')
  return { miraCodeHighlightWorker: { highlight: createMiraHighlightCore() } }
})

const options = (code: string, language = 'javascript') => ({ code, language, themes: miraCodeThemes })
const text = (result: TokensResult) => result.tokens.map(line => line.map(token => token.content).join('')).join('\n')

describe('Mira highlighted code color inheritance', () => {
  const neutral = { color: '#24292E', '--shiki-dark': '#E1E4E8' }
  const keyword = { color: '#D73A49', '--shiki-dark': '#F97583' }
  const token = (content: string, htmlStyle: Record<string, string> = neutral) => ({ content, offset: 0, htmlStyle })

  it('inherits the most frequent complete color pair regardless of property order', () => {
    const html = renderMiraHighlightedCode({ tokens: [[
      token('const', keyword), token(' '), token('answer', { '--shiki-dark': '#E1E4E8', color: '#24292E' }), token(' = '), token('42', keyword),
    ]] }, 'typescript')
    expect(html).toBe('<pre class="shiki"><code class="language-typescript"><span class="line" style="color:#24292E;--shiki-dark:#E1E4E8"><span style="color:#D73A49;--shiki-dark:#F97583">const</span> answer = <span style="color:#D73A49;--shiki-dark:#F97583">42</span></span></code></pre>')
  })

  it('retains font, background and decoration styles on their tokens', () => {
    const extraStyles = [
      { 'font-weight': 'bold' }, { 'font-style': 'italic' }, { 'background-color': '#fff' }, { 'text-decoration': 'underline' },
    ]
    const html = renderMiraHighlightedCode({ tokens: [[token('plain'), ...extraStyles.map((extra, index) => token(`extra${index}`, { ...neutral, ...extra }))]] }, 'text')
    expect(html).toContain('<span class="line" style="color:#24292E;--shiki-dark:#E1E4E8">plain')
    for (const [index, extra] of extraStyles.entries()) {
      const [property, value] = Object.entries(extra)[0]
      expect(html).toContain(`<span style="color:#24292E;--shiki-dark:#E1E4E8;${property}:${value}">extra${index}</span>`)
    }
    expect(html.match(/<span style=/g)).toHaveLength(4)
  })

  it.each([
    { color: '#24292E' }, { '--shiki-dark': '#E1E4E8' }, { color: '', '--shiki-dark': '#E1E4E8' }, { color: '#24292E', '--shiki-dark': '' }, {},
  ])('keeps the original HTML path if any token lacks a theme color: %j', style => {
    const html = renderMiraHighlightedCode({ tokens: [[token('safe'), token('fallback', style)]] }, 'text')
    expect(html).toContain('<span class="line"><span style="color:#24292E;--shiki-dark:#E1E4E8">safe</span>')
    expect(html.match(/<span/g)).toHaveLength(3)
  })

  it('requires own theme colors and keeps unstyled or exclusively decorated lines unchanged', () => {
    const inherited = Object.create(neutral) as Record<string, string>
    const html = renderMiraHighlightedCode({ tokens: [[token('safe'), token('inherited', inherited)], [{ content: 'raw', offset: 0 }], [token('bold', { ...neutral, 'font-weight': 'bold' })]] }, 'text')
    expect(html).toBe('<pre class="shiki"><code class="language-text"><span class="line"><span style="color:#24292E;--shiki-dark:#E1E4E8">safe</span><span>inherited</span></span>\n<span class="line"><span>raw</span></span>\n<span class="line"><span style="color:#24292E;--shiki-dark:#E1E4E8;font-weight:bold">bold</span></span></code></pre>')
  })

  it('escapes complete source and attributes while retaining empty and trailing lines', () => {
    const html = renderMiraHighlightedCode({ rootStyle: 'color:red;--test:"safe"', tokens: [[token('<img src="x">&\r')], [], [token('')]] }, 'ts" onclick="bad')
    expect(html).toBe('<pre class="shiki" style="color:red;--test:&quot;safe&quot;"><code class="language-ts&quot; onclick=&quot;bad"><span class="line" style="color:#24292E;--shiki-dark:#E1E4E8">&lt;img src=&quot;x&quot;&gt;&amp;\r</span>\n<span class="line"></span>\n<span class="line" style="color:#24292E;--shiki-dark:#E1E4E8"></span></code></pre>')
    expect(html).not.toContain('<img')
  })

  it('selects colors independently per line without mutating frozen token content, offsets or styles', () => {
    const result: MiraHighlightResult = { tokens: [[token('first')], [{ ...token('second', keyword), offset: 7 }]] }
    const snapshot = structuredClone(result)
    for (const line of result.tokens) {
      for (const item of line) { Object.freeze(item.htmlStyle); Object.freeze(item) }
      Object.freeze(line)
    }
    Object.freeze(result.tokens); Object.freeze(result)
    const html = renderMiraHighlightedCode(result, 'text')
    expect(html).toContain('<span class="line" style="color:#24292E;--shiki-dark:#E1E4E8">first</span>\n<span class="line" style="color:#D73A49;--shiki-dark:#F97583">second</span>')
    expect(result).toEqual(snapshot)
  })

  it.each([{ themes: miraCodeThemes }, { themes: ['github-dark', 'github-light'] as [string, string] }])('preserves real CRLF offsets and both color themes for %j', async ({ themes }) => {
    const source = 'const answer = "<Mira>";\r\n\r\nanswer;\r\n'
    const renderer = createMiraCodeHighlighter()
    const result = await renderer.highlight({ ...options(source, 'typescript'), themes })
    const snapshot = structuredClone(result)
    const html = renderMiraHighlightedCode(result, 'typescript')
    expect(text(result)).toBe(source.replace(/\r\n/g, '\n'))
    for (const item of result.tokens.flat()) expect(source.slice(item.offset, item.offset + item.content.length)).toBe(item.content)
    expect(html.match(/class="line"/g)).toHaveLength(4)
    expect(html).toContain('&lt;Mira&gt;')
    expect(html.match(/<span/g)!.length).toBeLessThan(result.tokens.flat().length + result.tokens.length)
    const codeKeyword = result.tokens[0].find(item => item.content === 'const')!
    expect(html).toContain(`color:${codeKeyword.htmlStyle!.color};--shiki-dark:${codeKeyword.htmlStyle!['--shiki-dark']}`)
    expect(result).toEqual(snapshot)
  })
})

describe('Mira code highlighting with real Shiki grammars', () => {
  it('does not reuse tokens when equal-length code changes only in its middle', async () => {
    const renderer = createMiraCodeHighlighter()
    const prefix = `/*${'p'.repeat(120)}*/\n`
    const suffix = `\n/*${'s'.repeat(120)}*/`
    const first = `${prefix}const answer = 1;${suffix}`
    const second = `${prefix}const answer = 2;${suffix}`
    expect(first.length).toBe(second.length)
    expect(first.slice(0, 100)).toBe(second.slice(0, 100))
    expect(first.slice(-100)).toBe(second.slice(-100))
    await renderer.highlight(options(first))
    expect(renderer.getCached(options(second))).toBeUndefined()
    const result = await renderer.highlight(options(second))
    expect(text(result)).toBe(second)
    expect(result.tokens.flat().some(token => token.htmlStyle?.color)).toBe(true)
    expect(renderer.plugin.highlight(options(second))).toBe(result)
  })

  it('preserves every bundled language and alias, including normalized aliases', async () => {
    const renderer = createMiraCodeHighlighter()
    expect(renderer.plugin.getSupportedLanguages().sort()).toEqual(Object.keys(bundledLanguages).sort())
    for (const language of bundledLanguagesInfo) {
      expect(renderer.plugin.supportsLanguage(language.id)).toBe(true)
      for (const alias of language.aliases || []) expect(renderer.plugin.supportsLanguage(alias)).toBe(true)
    }
    const alias = await renderer.highlight(options('const answer = 42;', ' JS '))
    expect(text(alias)).toBe('const answer = 42;')
    expect(renderer.getCached(options('const answer = 42;', 'javascript'))).toBe(alias)
  })

  it('returns asynchronously loaded tokens through the Streamdown callback contract', async () => {
    const renderer = createMiraCodeHighlighter()
    let immediate: ReturnType<typeof renderer.plugin.highlight>
    const result = await new Promise<TokensResult>(resolve => {
      immediate = renderer.plugin.highlight(options('def answer():\n    return 42', 'python'), resolve)
    })
    expect(immediate!).toBeNull()
    expect(text(result)).toBe('def answer():\n    return 42')
    expect(renderer.plugin.highlight(options('def answer():\n    return 42', 'python'))).toBe(result)
  })

  it.each([
    ['typescript', 'type Answer = { value: number };'],
    ['tsx', 'const Greeting = () => <p>Ready</p>;'],
    ['vue', '<template><p>{{ answer }}</p></template>\n<script setup lang="ts">const answer = 42</script>'],
    ['shell', 'printf "%s\\n" "ready"'],
    ['sql', 'SELECT id FROM tasks WHERE completed = true;'],
    ['markdown', '# Mira\n\n**Ready**'],
    ['html', '<p class="greeting">Ready</p>'],
    ['css', '.greeting { color: #fff; }'],
    ['diff', '-const answer = 1;\n+const answer = 2;'],
    ['elixir', 'defmodule Mira do\n  def answer, do: 42\nend'],
  ])('loads %s with its embedded grammars and both theme styles', async (language, source) => {
    const result = await miraCodeHighlighter.highlight(options(source, language))
    expect(text(result)).toBe(source)
    expect(result.tokens.flat().some(token => token.htmlStyle?.color && token.htmlStyle['--shiki-dark'])).toBe(true)
  })

  it('retains both github themes and isolates reversed theme cache entries', async () => {
    const renderer = createMiraCodeHighlighter()
    expect(renderer.plugin.getThemes()).toEqual(['github-light', 'github-dark'])
    const normal = await renderer.highlight(options('const answer = 42;'))
    const reverseOptions = { ...options('const answer = 42;'), themes: ['github-dark', 'github-light'] as [string, string] }
    expect(renderer.getCached(reverseOptions)).toBeUndefined()
    const reverse = await renderer.highlight(reverseOptions)
    const keyword = normal.tokens.flat().find(token => token.content === 'const')!
    const reversedKeyword = reverse.tokens.flat().find(token => token.content === 'const')!
    expect(keyword.htmlStyle?.color).toBe('#D73A49')
    expect(keyword.htmlStyle?.['--shiki-dark']).toBe('#F97583')
    expect(reversedKeyword.htmlStyle?.color).toBe(keyword.htmlStyle?.['--shiki-dark'])
    expect(reversedKeyword.htmlStyle?.['--shiki-dark']).toBe(keyword.htmlStyle?.color)
    expect(renderMiraHighlightedCode(normal, 'javascript')).toContain('--shiki-dark:#F97583')
  })

  it('escapes unknown-language code and reports unsupported themes without caching a fake success', async () => {
    const renderer = createMiraCodeHighlighter()
    const source = '<img src=x onerror="alert(1)"> & <script>bad()</script>'
    expect(renderer.plugin.supportsLanguage('mira-unregistered')).toBe(false)
    const result = await renderer.highlight(options(source, 'mira-unregistered'))
    expect(text(result)).toBe(source)
    const html = renderMiraHighlightedCode(result, 'mira-unregistered')
    expect(html).toContain('&lt;img')
    expect(html).toContain('&amp;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    await expect(renderer.highlight({ ...options(source), themes: ['unregistered-theme', 'github-dark'] })).rejects.toThrow()
    expect(renderer.getCached({ ...options(source), themes: ['unregistered-theme', 'github-dark'] })).toBeUndefined()
  })

  it('evicts old result entries and does not retain oversized code', async () => {
    const renderer = createMiraCodeHighlighter()
    for (let index = 0; index <= 128; index++) await renderer.highlight(options(`entry ${index}`, 'text'))
    expect(renderer.getCached(options('entry 0', 'text'))).toBeUndefined()
    expect(text(renderer.getCached(options('entry 128', 'text'))!)).toBe('entry 128')
    const oversized = options('x'.repeat(1_000_001), 'text')
    expect(text(await renderer.highlight(oversized))).toBe(oversized.code)
    expect(renderer.getCached(oversized)).toBeUndefined()
  })

  it('caps aggregate retained source text before the entry limit is reached', async () => {
    const renderer = createMiraCodeHighlighter()
    const first = options(`first ${'x'.repeat(20_000)}`, 'text')
    await renderer.highlight(first)
    for (let index = 0; index < 51; index++) await renderer.highlight(options(`${index} ${'x'.repeat(20_000)}`, 'text'))
    expect(renderer.getCached(first)).toBeUndefined()
    expect(renderer.getCached(options(`50 ${'x'.repeat(20_000)}`, 'text'))).toBeDefined()
  })

  it('highlights completed fences while preserving source citations and exact copy payloads', async () => {
    const code = 'const answer = "<safe>";\n'
    const content = `结论[1]，未知[9]。\n\n\`\`\`javascript title="answer.js"\n${code}\`\`\`\n`
    const sources = [{ index: 1, title: '来源', url: 'https://example.com' }]
    const blocks = await prepareMarkdownHighlights(content)
    const html = renderCompletedMarkdown(content, sources, blocks)
    expect(html).toContain('class="shiki"')
    expect(html).toContain('--shiki-dark')
    expect(html).toContain('&lt;safe&gt;')
    expect(html).toContain(`data-code="${encodeURIComponent(code)}"`)
    expect(html.match(/data-citation-index="1"/g)).toHaveLength(1)
    expect(html).toContain('未知[9]')
    expect(html).not.toContain('example.com')
    const streamed = await miraCodeHighlighter.highlight(options(code))
    expect(miraCodeHighlighter.getCached(options(code))).toBe(streamed)
    expect(renderCompletedMarkdown(content, sources)).toContain('class="shiki"')
  })

  it('keeps all completed fences highlighted when they exceed the shared cache capacity', async () => {
    const content = Array.from({ length: 130 }, (_, index) => `\`\`\`json\n{"entry":${index}}\n\`\`\``).join('\n\n')
    const blocks = await prepareMarkdownHighlights(content)
    const html = renderCompletedMarkdown(content, undefined, blocks)
    expect(html.match(/class="shiki"/g)).toHaveLength(130)
    expect(html.match(/class="markdown-code-copy"/g)).toHaveLength(130)
  })
})
