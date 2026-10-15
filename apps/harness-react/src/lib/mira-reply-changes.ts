import type { HarnessFileChange } from '../../../../src/config/harness'
import type { MiraTaskChangedFile } from '../../../../src/config/miraTaskChanges'
import { parseDiff } from './diff'

/** Last host summary wins for each file. Legacy repeated edits have no known net totals. */
export function miraReplyChangedFiles(changes: HarnessFileChange[]): MiraTaskChangedFile[] {
  const grouped = new Map<string, HarnessFileChange[]>()
  for (const change of changes) {
    const path = change.path.replace(/\\/g, '/').replace(/^(\.\/)+/, '')
    grouped.set(path, [...(grouped.get(path) ?? []), change])
  }
  return [...grouped].map(([path, operations]) => {
    const last = operations[operations.length - 1]
    if (last.summary) return { ...last.summary, path }
    const known = operations.length === 1 && Boolean(last.diff)
    const stats = known ? parseDiff(last.diff!) : undefined
    return { key: path, path, tool: last.tool, writes: operations.length, ...(stats ? { added: stats.added, removed: stats.removed, diff: last.diff } : { unavailable: true }) }
  }).filter(file => !file.unchanged)
}
