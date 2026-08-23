import { describe, expect, it } from 'vitest'
import { groupHistoryRows, smartRelative } from '../src/pages/frontend/harness/history/historyUtils'

const current = new Date(2026, 7, 26, 15, 0).getTime()

describe('history utilities', () => {
  it('formats readable relative times', () => {
    expect(smartRelative(current - 30_000, current)).toBe('刚刚')
    expect(smartRelative(current - 12 * 60_000, current)).toBe('12 分钟前')
    expect(smartRelative(current - 2 * 60 * 60_000, current)).toContain('今天')
    expect(smartRelative(current - 26 * 60 * 60_000, current)).toContain('昨天')
  })

  it('groups rows by the requested date buckets', () => {
    const rows = [0, 1, 2, 12, 45].map((days, index) => ({ id: String(index), title: String(index), permissionMode: 'default' as const, status: 'completed' as const, pinned: false, createdAt: current, updatedAt: current - days * 24 * 60 * 60_000 }))
    expect(groupHistoryRows(rows, current).map(group => group.key)).toEqual(['today', 'yesterday', 'week', 'month', 'earlier'])
  })
})
