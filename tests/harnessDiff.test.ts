import { describe, expect, it } from 'vitest'
import { parseDiff } from '../apps/harness-react/src/lib/diff'

describe('Harness diff projection', () => {
  it('counts changed lines and keeps old/new line numbers', () => {
    const parsed = parseDiff('--- a/file.ts\n+++ b/file.ts\n@@ -3,3 +3,3 @@\n context\n-old\n+new\n tail')
    expect(parsed.added).toBe(1)
    expect(parsed.removed).toBe(1)
    expect(parsed.lines[3]).toMatchObject({ kind: 'context', oldLine: 3, newLine: 3 })
    expect(parsed.lines[4]).toMatchObject({ kind: 'removed', oldLine: 4 })
    expect(parsed.lines[5]).toMatchObject({ kind: 'added', newLine: 4 })
  })
})
