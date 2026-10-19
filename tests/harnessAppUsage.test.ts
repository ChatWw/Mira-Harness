import { describe, expect, it } from 'vitest'
import { buildHarnessAppUsage, usageDateKey } from '../src/config/harnessUsage'
import { usageHeatmap, usageRange, usageLine } from '../src/pages/backend/usage/usage-view'
const time = (day: string) => new Date(`${day}T12:00:00`).getTime()
describe('settings application usage data', () => {
  it('groups actual models by local date, fills gaps and calculates lifetime peaks and streaks', () => {
    const snapshot = buildHarnessAppUsage([
      { timestamp: time('2026-10-17'), modelId: 'a', totalTokens: 30 },
      { timestamp: time('2026-10-18'), modelId: 'b', totalTokens: 20 },
      { timestamp: time('2026-10-19'), modelId: 'a', totalTokens: 10 },
      { timestamp: time('2026-10-19'), modelId: 'b', totalTokens: 25 },
      { timestamp: time('2026-10-20'), modelId: 'a', totalTokens: 100 },
    ], 123000, time('2026-10-19'))
    expect(snapshot.summary).toEqual({ totalTokens: 85, peakDayTokens: 35, longestSessionMs: 123000, currentStreakDays: 3, longestStreakDays: 3 })
    const range = usageRange(snapshot, 7)
    expect(range.days).toHaveLength(8)
    expect(range.days[0].totalTokens).toBe(0)
    expect(range.models.map(model => [model.label, model.totalTokens])).toEqual([['b', 45], ['a', 40]])
    expect(usageRange(snapshot, 30).days).toHaveLength(31)
    const heatmap = usageHeatmap(snapshot, 'daily')
    expect(heatmap).toHaveLength(52)
    expect(heatmap.flatMap(week => week.cells).find(cell => cell.date === '2026-10-19')).toMatchObject({ value: 35, count: 2, level: 4 })
    expect(usageHeatmap(snapshot, 'cumulative').at(-1)?.total).toBe(85)
    expect(usageHeatmap(snapshot, 'weekly').at(-1)?.total).toBe(55)
    expect(usageDateKey(time('2026-10-19'))).toBe('2026-10-19')
  })
  it('breaks current streak on an idle day and handles empty charts without invalid SVG coordinates', () => {
    const snapshot = buildHarnessAppUsage([{ timestamp: time('2026-10-17'), modelId: 'a', totalTokens: 10 }], 0, time('2026-10-19'))
    expect(snapshot.summary.currentStreakDays).toBe(0)
    expect(snapshot.summary.longestStreakDays).toBe(1)
    expect(usageHeatmap(buildHarnessAppUsage([], 0), 'weekly').every(week => week.cells.every(cell => !cell.level))).toBe(true)
    expect(usageLine([0, 10, 0, 0], 10)).not.toMatch(/NaN|Infinity/)
  })
})
