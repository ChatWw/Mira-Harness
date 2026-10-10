/* Lightweight projection adapted from ZCode lib/patchDiffPreview.ts.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: native numbered diffs, a single recorded-line gutter, no truncation.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
export type MiraToolDiffLine = {
  kind: 'added' | 'removed' | 'context' | 'meta'
  source: string
  text: string
  number?: number
}
export type MiraToolDiff = { format: 'numbered' | 'unified' | 'raw'; lines: MiraToolDiffLine[]; added: number; removed: number }

export function parseMiraToolDiff(diff: string): MiraToolDiff {
  const sources = diff.split('\n')
  const plain = () => ({ format: 'raw' as const, lines: sources.map(source => ({ kind: 'meta' as const, source, text: source })), added: 0, removed: 0 })
  const result = (format: 'numbered' | 'unified', lines: MiraToolDiffLine[]): MiraToolDiff => ({
    format, lines, added: lines.filter(line => line.kind === 'added').length, removed: lines.filter(line => line.kind === 'removed').length,
  })
  const validNumber = (value: number) => Number.isSafeInteger(value) && value >= 0
  const numbered: MiraToolDiffLine[] = []
  for (const source of sources) {
    const text = source.replace(/\r$/, '')
    const match = /^([ +\-])\s*(\d+) (.*)$/.exec(text)
    if (match && validNumber(Number(match[2])) && Number(match[2]) > 0) {
      numbered.push({ kind: match[1] === '+' ? 'added' : match[1] === '-' ? 'removed' : 'context', source, text: match[3], number: Number(match[2]) })
    } else if (text === '' || /^ +\.\.\.$/.test(text)) numbered.push({ kind: 'meta', source, text })
    else break
  }
  if (numbered.length === sources.length && numbered.some(line => line.kind === 'added' || line.kind === 'removed')) return result('numbered', numbered)

  const unified: MiraToolDiffLine[] = []
  let oldLine = 0, newLine = 0, oldRemaining = 0, newRemaining = 0, hasHunk = false
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index], text = source.replace(/\r$/, '')
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(text)
    if (hunk) {
      if (oldRemaining || newRemaining) return plain()
      oldLine = Number(hunk[1]); oldRemaining = Number(hunk[2] ?? 1)
      newLine = Number(hunk[3]); newRemaining = Number(hunk[4] ?? 1)
      if (![oldLine, newLine, oldRemaining, newRemaining, oldLine + oldRemaining, newLine + newRemaining].every(validNumber)) return plain()
      if ((oldRemaining && oldLine === 0) || (newRemaining && newLine === 0)) return plain()
      hasHunk = true
      unified.push({ kind: 'meta', source, text })
    } else if (text === '\\ No newline at end of file') unified.push({ kind: 'meta', source, text })
    else if (oldRemaining || newRemaining) {
      // A new file header during an unfinished hunk is ambiguous, never assign it a source line.
      if (text.startsWith('--- ') && sources[index + 1]?.startsWith('+++ ')) return plain()
      if (text.startsWith('-') && oldRemaining > 0) {
        unified.push({ kind: 'removed', source, text: text.slice(1), number: oldLine++ }); oldRemaining--
      } else if (text.startsWith('+') && newRemaining > 0) {
        unified.push({ kind: 'added', source, text: text.slice(1), number: newLine++ }); newRemaining--
      } else if (text.startsWith(' ') && oldRemaining > 0 && newRemaining > 0) {
        unified.push({ kind: 'context', source, text: text.slice(1), number: newLine++ }); oldLine++; oldRemaining--; newRemaining--
      } else return plain()
    } else {
      if (text && !/^(?:diff |index |--- |\+\+\+ |new file mode |deleted file mode |old mode |new mode |similarity index |rename (?:from|to) )/.test(text)) return plain()
      unified.push({ kind: 'meta', source, text })
    }
  }
  return hasHunk && !oldRemaining && !newRemaining ? result('unified', unified) : plain()
}

/** Unknown or incomplete records do not claim a total change count. */
export function miraToolDiffStats(diff: string) {
  const parsed = parseMiraToolDiff(diff)
  return parsed.format === 'raw' ? undefined : { added: parsed.added, removed: parsed.removed }
}
