/** Task-owned net file changes, adapted from ZCode taskChangeSummary/lineChangeStat.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
export interface MiraTaskChangedFile {
  key: string
  path: string
  tool: 'write' | 'edit' | 'delete'
  writes: number
  added?: number
  removed?: number
  estimated?: boolean
  unavailable?: boolean
  unchanged?: boolean
  diff?: string
  diffTruncated?: boolean
}

export interface MiraTaskChangeSummary {
  files: MiraTaskChangedFile[]
  added: number
  removed: number
  incomplete: boolean
  estimated: boolean
}

function lines(value: string | null) {
  if (!value) return []
  const result = value.split('\n')
  if (result[result.length - 1] === '') result.pop()
  return result
}

/** Bound work to avoid blocking task lists on a large replacement. */
export function miraTaskLineChanges(before: string | null, after: string | null) {
  const old = lines(before), next = lines(after)
  let start = 0, oldEnd = old.length, nextEnd = next.length
  while (start < oldEnd && start < nextEnd && old[start] === next[start]) start++
  while (oldEnd > start && nextEnd > start && old[oldEnd - 1] === next[nextEnd - 1]) { oldEnd--; nextEnd-- }
  const oldLength = oldEnd - start, nextLength = nextEnd - start
  if (!oldLength || !nextLength) return { added: nextLength, removed: oldLength }
  if (oldLength * nextLength > 400_000) return { added: nextLength, removed: oldLength, estimated: true }
  const row = new Uint32Array(nextLength + 1)
  for (let i = 0; i < oldLength; i++) {
    let diagonal = 0
    for (let j = 1; j <= nextLength; j++) {
      const previous = row[j]!
      row[j] = old[start + i] === next[start + j - 1] ? diagonal + 1 : Math.max(row[j]!, row[j - 1]!)
      diagonal = previous
    }
  }
  return { added: nextLength - row[nextLength]!, removed: oldLength - row[nextLength]! }
}
