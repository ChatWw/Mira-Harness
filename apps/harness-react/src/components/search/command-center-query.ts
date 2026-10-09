export type HarnessSearchScope = 'all' | 'commands' | 'conversations' | 'files'

const PREFIXES = { commands: '>', conversations: '#', files: '@' } as const

export function parseHarnessSearch(raw: string): { query: string; scope: HarnessSearchScope } {
  const trimmed = raw.trimStart()
  const scope = (Object.entries(PREFIXES).find(([, prefix]) => prefix === trimmed[0])?.[0] ?? 'all') as HarnessSearchScope
  return { query: (scope === 'all' ? trimmed : trimmed.slice(1)).trim(), scope }
}

export function setHarnessSearchScope(raw: string, scope: HarnessSearchScope): string {
  const { query } = parseHarnessSearch(raw)
  return scope === 'all' ? query : `${PREFIXES[scope]} ${query}`
}

export function matchesHarnessCommand(command: { label: string; description?: string; keywords?: string }, query: string): boolean {
  const text = `${command.label} ${command.description ?? ''} ${command.keywords ?? ''}`.toLocaleLowerCase()
  return query.toLocaleLowerCase().split(/\s+/).filter(Boolean).every(term => text.includes(term))
}

export function harnessSearchHighlight(text: string, query: string): Array<{ text: string; match: boolean }> {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const lower = text.toLocaleLowerCase()
  const matches: Array<{ start: number; end: number }> = []
  for (const term of terms) {
    let start = lower.indexOf(term)
    while (start !== -1) {
      matches.push({ start, end: start + term.length })
      start = lower.indexOf(term, start + term.length)
    }
  }
  matches.sort((left, right) => left.start - right.start)
  const segments: Array<{ text: string; match: boolean }> = []
  let cursor = 0
  for (const match of matches) {
    if (match.end <= cursor) continue
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start), match: false })
    segments.push({ text: text.slice(Math.max(cursor, match.start), match.end), match: true })
    cursor = match.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false })
  return segments
}
