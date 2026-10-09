import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createBundledHighlighter } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import { bundledLanguages, bundledLanguagesInfo } from 'shiki/langs'
import { createMiraHighlightCore } from '../apps/harness-react/src/lib/code-highlight-core'
import { miraCodeThemes, type MiraHighlightResult } from '../apps/harness-react/src/lib/code-highlight-protocol'

// Independent whole-document WASM reference; this suite does not validate the browser transport.
const createReference = createBundledHighlighter<string, string>({
  langs: bundledLanguages,
  themes: {
    'github-light': () => import('shiki/themes/github-light.mjs'),
    'github-dark': () => import('shiki/themes/github-dark.mjs'),
  },
  engine: () => createOnigurumaEngine(import('shiki/wasm')),
})
let reference: Awaited<ReturnType<typeof createReference>>
let tokenize: ReturnType<typeof createMiraHighlightCore>
const options = (code: string, language = 'typescript', themes: [string, string] = miraCodeThemes) => ({ code, language, themes })
const sourceText = (result: MiraHighlightResult) => result.tokens.map(line => line.map(token => token.content).join('')).join('\n')
async function wholeDocument(code: string, language: string, themes: [string, string] = miraCodeThemes): Promise<MiraHighlightResult> {
  if (language !== 'text' && !reference.getLoadedLanguages().includes(language)) await reference.loadLanguage(language)
  const { grammarState: _, ...result } = reference.codeToTokens(code, {
    lang: language, themes: { light: themes[0], dark: themes[1] }, tokenizeTimeLimit: 0, tokenizeMaxLineLength: 0,
  })
  return result
}

beforeAll(async () => {
  reference = await createReference({ langs: [], themes: miraCodeThemes })
  tokenize = createMiraHighlightCore()
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => reference.dispose())

describe('Mira tokenizer against independent unlimited whole-document Shiki WASM', () => {
  it.each([
    ['typescript', '/* first\ncontinue\nclose */\nconst msg = `first\n${42}\n`;\n'],
    ['tsx', 'const View = () => (\n<section title="Mira">\n{`first\nsecond`}\n</section>\n);\n'],
    ['vue', '<template>\n<p>{{ msg }}</p>\n</template>\n<script setup lang="ts">\n/* first\ncontinue */\nconst msg = "Mira"\n</script>\n<style>\n/* first\ncontinue */\np { color: red; }\n</style>\n'],
    ['html', '<style>\n/* open\nclose */\np { color: red; }\n</style>\n<script>\nconst msg = `first\nsecond`;\n</script>\n'],
    ['python', 's = """first\nsecond\nlast"""\nprint(s)\n'],
    ['shellscript', 'cat <<EOF\nfirst\nsecond\nEOF\nprintf "%s\\n" "Mira"\n'],
    ['markdown', '# Mira\n\n```typescript\n/* first\ncontinue */\nconst msg = 42;\n```\n'],
    ['json', '{\n  "nested": {\n    "enabled": true,\n    "title": "Mira"\n  }\n}\n'],
    ['elixir', 'defmodule Mira do\n  @doc """\n  first\n  second\n  """\n  def answer, do: 42\nend\n'],
  ])('preserves complete %s tokens, styles and embedded/multiline grammar', async (language, code) => {
    const expected = await wholeDocument(code, language)
    const result = await tokenize(options(code, language))
    expect(result).toEqual(expected)
    expect(result).not.toHaveProperty('grammarState')
    expect(structuredClone(result)).toEqual(result)
    expect(sourceText(result)).toBe(code)
    expect(result.tokens.flat().some(token => token.htmlStyle?.color && token.htmlStyle['--shiki-dark'])).toBe(true)
    expect(result.tokens.at(-1)).toEqual([])
  })

  it('loads every public alias as its canonical language, including padded mixed-case names', async () => {
    const code = 'value = "Mira";\n# second\n'
    const aliases = bundledLanguagesInfo.flatMap(language => (language.aliases || []).map(alias => [alias, language.id] as const))
    expect(aliases).toHaveLength(97)
    for (const [alias, language] of aliases) {
      const expected = await wholeDocument(code, language)
      expect(await tokenize(options(code, ` ${alias.toUpperCase()} `)), alias).toEqual(expected)
    }
  }, 30_000)

  it('preserves CRLF, Unicode offsets, blank lines and the final empty line under reversed themes', async () => {
    const code = '/* \u8bbe\u5b9a\r\n\u89d2\u8272 */\r\n\r\nconst title = "Mira \u4f60\u597d \ud83c\udf19";\r\n'
    const reversed: [string, string] = ['github-dark', 'github-light']
    const result = await tokenize(options(code, ' TS ', reversed))
    expect(result).toEqual(await wholeDocument(code, 'typescript', reversed))
    expect(sourceText(result)).toBe(code.replace(/\r\n/g, '\n'))
    expect(result.tokens).toHaveLength(5)
    expect(result.tokens.at(-1)).toEqual([])
    for (const token of result.tokens.flat()) expect(code.slice(token.offset, token.offset + token.content.length)).toBe(token.content)
    const keyword = result.tokens.flat().find(token => token.content === 'const')!
    expect(keyword.htmlStyle?.color).toBe('#F97583')
    expect(keyword.htmlStyle?.['--shiki-dark']).toBe('#D73A49')
  })

  it('fully styles all 2100 statements in a 94380-character single line without truncation or time-budget fallback', async () => {
    const code = Array.from({ length: 2100 }, (_, index) => `export const single${index}: string = "Mira ${index}";`).join('')
    expect(code).toHaveLength(94_380)
    const expected = await wholeDocument(code, 'typescript')
    const result = await tokenize(options(code))
    expect(result).toEqual(expected)
    expect(result.tokens).toHaveLength(1)
    const tokens = result.tokens[0]
    expect(tokens).toHaveLength(27_300)
    expect(tokens.filter(token => token.content === 'const')).toHaveLength(2100)
    expect(tokens.filter(token => token.content === 'export')).toHaveLength(2100)
    const identifiers = new Map(tokens.filter(token => /^single\d+$/.test(token.content)).map(token => [token.content, token]))
    for (let index = 0; index < 2100; index++) {
      const identifier = identifiers.get(`single${index}`)!
      expect(identifier, `single${index}`).toBeDefined()
      expect(identifier.htmlStyle?.color).toBeTruthy()
      expect(identifier.htmlStyle?.['--shiki-dark']).toBeTruthy()
    }
    for (const token of tokens) expect(code.slice(token.offset, token.offset + token.content.length)).toBe(token.content)
    expect(sourceText(result)).toBe(code)
  }, 15_000)

  it('retains unknown-language source as text and rejects unknown themes instead of returning a fake success', async () => {
    const code = '<img src=x onerror="alert(1)">\r\n<script>literal()</script>\r\n'
    const result = await tokenize(options(code, 'mira-unregistered'))
    expect(result).toEqual(await wholeDocument(code, 'text'))
    expect(sourceText(result)).toBe(code.replace(/\r\n/g, '\n'))
    await expect(tokenize(options(code, 'typescript', ['mira-unregistered-theme', 'github-dark']))).rejects.toThrow()
    expect(await tokenize(options('const recovery = 42;'))).toEqual(await wholeDocument('const recovery = 42;', 'typescript'))
  })

  it('rejects a pre-aborted request before it initializes or schedules scanning', async () => {
    const fresh = createMiraHighlightCore()
    const controller = new AbortController()
    controller.abort()
    const timers = vi.spyOn(globalThis, 'setTimeout')
    await expect(fresh(options('const stale = 1;'), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(timers).not.toHaveBeenCalled()
  })

  it('stops at the next real scan yield and does not leak an aborted grammar stack into later work', async () => {
    const fresh = createMiraHighlightCore()
    await fresh(options('const warm = 1;'))
    const scheduled: Array<() => void> = []
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => { scheduled.push(callback); return 0 }) as unknown as typeof setTimeout)
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => { now += 9; return now })
    const controller = new AbortController()
    const pending = fresh(options('/* open\ncontinue\nclose */\nconst stale = 1;\n'), controller.signal)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    for (let step = 0; step < 10; step++) await Promise.resolve()
    expect(scheduled).toHaveLength(1)
    controller.abort()
    scheduled.shift()!()
    await rejected
    expect(scheduled).toHaveLength(0)
    vi.restoreAllMocks()
    expect(await fresh(options('const recovered = 42;'))).toEqual(await wholeDocument('const recovered = 42;', 'typescript'))
  })
})
