// Caret-based discovery and replacement follows ZCode's prompt input interaction.
// Source and license: third-party-licenses/zcode. Names and payloads belong to Mira.
export type MiraPromptTrigger = '@' | '/' | '$'
export interface MiraPromptRange { start: number; end: number }
export interface MiraPromptToken extends MiraPromptRange { trigger: MiraPromptTrigger; query: string }

export function findMiraPromptToken(text: string, start: number, end = start): MiraPromptToken | null {
  if (start !== end) return null
  const prefix = text.slice(0, start)
  const match = /(^|[\s\p{Script=Han}\u3000-\u303f\uff00-\uffef])(@)([^\s/@$#¥￥]*)$/u.exec(prefix)
    ?? /(^|\s)([/@$¥￥])([^\s/@$#¥￥]*)$/.exec(prefix)
  if (!match || /\p{Script=Han}/u.test(match[1]) && /\S\.\S/.test(match[3])) return null
  const rawTrigger = match[2]
  const trigger = rawTrigger === '¥' || rawTrigger === '￥' ? '$' : rawTrigger as MiraPromptTrigger
  return { trigger, query: match[3], start: start - match[3].length - 1, end: start }
}

export function replaceMiraPromptRange(text: string, range: MiraPromptRange, replacement: string) {
  const next = text.slice(0, range.start) + replacement + text.slice(range.end)
  return { text: next, caret: range.start + replacement.length }
}

export function miraPromptReplacementRange(text: string, token: MiraPromptToken, candidates: string[]): MiraPromptRange {
  if (!token.query) return token
  const tail = /^[^\s/@$#¥￥]*/.exec(text.slice(token.end))?.[0] || ''
  const query = token.query.toLocaleLowerCase()
  let consumed = 0
  for (const candidate of candidates) {
    const value = candidate.replace(/^[/@$]+/, '')
    if (!value.toLocaleLowerCase().startsWith(query)) continue
    const suffix = value.slice(token.query.length)
    const length = Math.min(tail.length, suffix.length)
    if (length && suffix.toLocaleLowerCase().startsWith(tail.slice(0, length).toLocaleLowerCase())) consumed = Math.max(consumed, length)
  }
  return { start: token.start, end: token.end + consumed }
}

export function insertMiraPromptTrigger(text: string, range: MiraPromptRange, trigger: MiraPromptTrigger) {
  const preceding = text.charAt(range.start - 1)
  const separator = preceding && !/\s/.test(preceding) ? ' ' : ''
  return replaceMiraPromptRange(text, range, separator + trigger)
}

export function nextMiraSuggestionIndex(current: number, direction: 1 | -1, items: ReadonlyArray<{ disabled?: boolean }>) {
  for (let step = 1; step <= items.length; step++) {
    const next = (current + direction * step + items.length) % items.length
    if (!items[next].disabled) return next
  }
  return -1
}

export function filterMiraSuggestions<T extends { label: string; description?: string; keywords?: string }>(items: T[], query: string): T[] {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return items
  const score = (text: string) => {
    const value = text.toLocaleLowerCase()
    if (value.startsWith(term)) return 0
    if (value.includes(term)) return 100 + value.indexOf(term)
    let from = 0, distance = 200
    for (const character of term) {
      const at = value.indexOf(character, from)
      if (at < 0) return Infinity
      distance += at - from; from = at + 1
    }
    return distance
  }
  return items.map((item, index) => ({ item, index, score: Math.min(score(item.label), score(item.description || ''), score(item.keywords || '')) }))
    .filter(item => Number.isFinite(item.score)).sort((a, b) => a.score - b.score || a.index - b.index).map(({ item }) => item)
}

export function formatMiraConversationReference(session: { title: string; messages: Array<{ role: 'user' | 'assistant'; content: string; internal?: boolean }> }) {
  const messages = session.messages.filter(message => !message.internal && message.content.trim())
  if (!messages.length) throw new Error('此对话暂无可引用的内容')
  return `【引用对话：${session.title.replace(/\s+/g, ' ')}】\n${messages.map(message => `${message.role === 'user' ? '用户' : 'Mira'}：\n${message.content}`).join('\n\n')}\n【引用结束】\n`
}
