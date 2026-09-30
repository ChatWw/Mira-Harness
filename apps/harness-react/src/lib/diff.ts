export type DiffLine = { kind: 'header' | 'context' | 'added' | 'removed'; oldLine?: number; newLine?: number; text: string }

export function parseDiff(diff: string): { added: number; removed: number; lines: DiffLine[] } {
  let oldLine = 0
  let newLine = 0
  let added = 0
  let removed = 0
  const lines = diff.split('\n').map(text => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text)
    if (hunk) {
      oldLine = Number(hunk[1]); newLine = Number(hunk[2])
      return { kind: 'header' as const, text }
    }
    if (text.startsWith('+++') || text.startsWith('---') || text.startsWith('diff ') || text.startsWith('index ') || text.startsWith('\\')) return { kind: 'header' as const, text }
    if (text.startsWith('+')) { added++; return { kind: 'added' as const, newLine: newLine++, text } }
    if (text.startsWith('-')) { removed++; return { kind: 'removed' as const, oldLine: oldLine++, text } }
    return { kind: 'context' as const, oldLine: oldLine++, newLine: newLine++, text }
  })
  return { added, removed, lines }
}
