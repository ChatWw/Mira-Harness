import { bundledLanguagesInfo } from 'shiki/langs'
import type { CodeHighlighterPlugin, HighlightOptions } from 'streamdown'
import { highlightCancelled, miraCodeThemes, type MiraHighlightResult } from './code-highlight-protocol'
import { miraCodeHighlightWorker } from './code-highlight-worker-client'

export { miraCodeThemes } from './code-highlight-protocol'
const CACHE_LIMIT = 128
const CACHE_CHAR_LIMIT = 1_000_000
const aliases = new Map(bundledLanguagesInfo.flatMap(language => (language.aliases || []).map(alias => [alias, language.id] as const)))
const supported = new Set(bundledLanguagesInfo.flatMap(language => [language.id, ...(language.aliases || [])]))
const normalizeLanguage = (language: string) => aliases.get(language.trim().toLowerCase()) || language.trim().toLowerCase()

export function createMiraCodeHighlighter(execute = miraCodeHighlightWorker.highlight) {
  const cache = new Map<string, MiraHighlightResult>()
  const pending = new Map<string, { controller: AbortController; promise: Promise<MiraHighlightResult>; consumers: number }>()
  let cacheChars = 0
  const keyFor = (options: HighlightOptions) => JSON.stringify([normalizeLanguage(options.language), options.themes, options.code])
  const getCached = (options: HighlightOptions) => {
    const key = keyFor(options)
    const result = cache.get(key)
    if (result) { cache.delete(key); cache.set(key, result) }
    return result
  }
  const highlight = (options: HighlightOptions, signal?: AbortSignal): Promise<MiraHighlightResult> => {
    if (signal?.aborted) return Promise.reject(highlightCancelled())
    const cached = getCached(options)
    if (cached) return Promise.resolve(cached)
    const key = keyFor(options)
    let current = pending.get(key)
    if (!current) {
      const controller = new AbortController()
      const request = { controller, promise: undefined! as Promise<MiraHighlightResult>, consumers: 0 }
      request.promise = execute(options, controller.signal).then(result => {
        if (controller.signal.aborted) throw highlightCancelled()
        if (key.length <= CACHE_CHAR_LIMIT) {
          cache.set(key, result)
          cacheChars += key.length
          while (cache.size > CACHE_LIMIT || cacheChars > CACHE_CHAR_LIMIT) {
            const oldest = cache.keys().next().value!
            cache.delete(oldest)
            cacheChars -= oldest.length
          }
        }
        return result
      }).finally(() => { if (pending.get(key) === request) pending.delete(key) })
      pending.set(key, request)
      current = request
    }
    const request = current
    request.consumers += 1
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', abort)
        request.consumers -= 1
        callback()
      }
      const abort = () => {
        finish(() => reject(highlightCancelled()))
        if (!request.consumers) {
          if (pending.get(key) === request) pending.delete(key)
          request.controller.abort()
        }
      }
      signal?.addEventListener('abort', abort, { once: true })
      request.promise.then(result => finish(() => resolve(result)), error => finish(() => reject(error)))
    })
  }
  const plugin: CodeHighlighterPlugin = {
    name: 'shiki', type: 'code-highlighter',
    getSupportedLanguages: () => [...supported],
    getThemes: () => [...miraCodeThemes],
    supportsLanguage: language => supported.has(normalizeLanguage(language)),
    highlight(options, callback) {
      const result = getCached(options)
      if (result) return result
      void highlight(options).then(value => callback?.(value)).catch(() => {})
      return null
    },
  }
  return { plugin, highlight, getCached }
}

export const miraCodeHighlighter = createMiraCodeHighlighter()

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]!)

export function renderMiraHighlightedCode(result: MiraHighlightResult, language: string) {
  const style = result.rootStyle || (result.fg && result.bg ? `background-color:${result.bg};color:${result.fg}` : '')
  const lines = result.tokens.map(line => `<span class="line">${line.map(token => {
    const tokenStyle = Object.entries(token.htmlStyle || {}).map(([name, value]) => `${name}:${value}`).join(';')
    return `<span${tokenStyle ? ` style="${escapeHtml(tokenStyle)}"` : ''}>${escapeHtml(token.content)}</span>`
  }).join('')}</span>`).join('\n')
  return `<pre class="shiki"${style ? ` style="${escapeHtml(style)}"` : ''}><code class="${escapeHtml(`language-${language}`)}">${lines}</code></pre>`
}
