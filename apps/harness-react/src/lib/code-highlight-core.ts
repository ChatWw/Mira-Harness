import { createBundledHighlighter, splitLines, type GrammarState } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import { bundledLanguages, bundledLanguagesInfo } from 'shiki/langs'
import type { HighlightOptions } from 'streamdown'
import { highlightCancelled, miraCodeThemes, type MiraHighlightResult } from './code-highlight-protocol'

const aliases = new Map(bundledLanguagesInfo.flatMap(language => (language.aliases || []).map(alias => [alias, language.id] as const)))
const supported = new Set(Object.keys(bundledLanguages))
const normalizeLanguage = (language: string) => aliases.get(language.trim().toLowerCase()) || language.trim().toLowerCase()
const themeName = (theme: HighlightOptions['themes'][number]) => typeof theme === 'string' ? theme : theme.name || ''
const createHighlighter = createBundledHighlighter<string, string>({
  langs: bundledLanguages,
  themes: {
    'github-light': () => import('shiki/themes/github-light.mjs'),
    'github-dark': () => import('shiki/themes/github-dark.mjs'),
  },
  engine: () => createOnigurumaEngine(import('shiki/wasm')),
})

export function createMiraHighlightCore() {
  let highlighter: ReturnType<typeof createHighlighter> | undefined
  return async (options: HighlightOptions, signal?: AbortSignal): Promise<MiraHighlightResult> => {
    const checkCancelled = () => { if (signal?.aborted) throw highlightCancelled() }
    checkCancelled()
    highlighter ??= createHighlighter({ themes: miraCodeThemes, langs: [] }).catch(error => { highlighter = undefined; throw error })
    const instance = await highlighter
    checkCancelled()
    const normalized = normalizeLanguage(options.language)
    const lang = supported.has(normalized) ? normalized : 'text'
    if (lang !== 'text' && !instance.getLoadedLanguages().includes(lang)) await instance.loadLanguage(lang)
    checkCancelled()
    const tokens: MiraHighlightResult['tokens'] = []
    let grammarState: GrammarState | undefined
    let metadata: Omit<MiraHighlightResult, 'tokens'> | undefined
    let started = performance.now()
    for (const [line, offset] of splitLines(options.code)) {
      checkCancelled()
      // Unlimited WASM scanning preserves long lines; yield between lines for cancel/queued messages.
      const result = instance.codeToTokens(line, {
        lang, themes: { light: themeName(options.themes[0]), dark: themeName(options.themes[1]) },
        grammarState, tokenizeTimeLimit: 0, tokenizeMaxLineLength: 0,
      })
      grammarState = instance.getLastGrammarState(result.tokens)
      for (const token of result.tokens[0]) token.offset += offset
      tokens.push(result.tokens[0])
      if (!metadata) { const { tokens: _, grammarState: __, ...styles } = result; metadata = styles }
      if (performance.now() - started >= 8) {
        await new Promise<void>(resolve => setTimeout(resolve, 0))
        checkCancelled()
        started = performance.now()
      }
    }
    return { ...metadata, tokens }
  }
}
