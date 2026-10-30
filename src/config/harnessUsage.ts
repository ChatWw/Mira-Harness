export interface AppUsageDay {
  date: string
  totalTokens: number
  turnCount: number
  models: Array<{ modelId: string; totalTokens: number }>
}
export interface HarnessAppUsage {
  generatedAt: number
  summary: { totalTokens: number; peakDayTokens: number; longestSessionMs: number; currentStreakDays: number; longestStreakDays: number }
  days: AppUsageDay[]
}
export function usageDateKey(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function buildHarnessAppUsage(records: Array<{ timestamp: number; modelId: string; totalTokens: number }>, longestSessionMs: number, now = Date.now()): HarnessAppUsage {
  const days = new Map<string, AppUsageDay>()
  for (const record of records) {
    if (!Number.isFinite(record.timestamp) || record.timestamp > now || !Number.isFinite(record.totalTokens) || record.totalTokens < 0) continue
    const date = usageDateKey(record.timestamp)
    const day = days.get(date) ?? { date, totalTokens: 0, turnCount: 0, models: [] }
    day.totalTokens += record.totalTokens; day.turnCount++
    const model = day.models.find(model => model.modelId === record.modelId)
    if (model) model.totalTokens += record.totalTokens
    else day.models.push({ modelId: record.modelId, totalTokens: record.totalTokens })
    days.set(date, day)
  }
  const sorted = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
  let longestStreakDays = 0, streak = 0, previous = -Infinity
  for (const day of sorted) {
    if (!day.totalTokens) continue
    const index = Date.parse(`${day.date}T00:00:00Z`) / 86400000
    streak = index === previous + 1 ? streak + 1 : 1
    longestStreakDays = Math.max(longestStreakDays, streak); previous = index
  }
  let currentStreakDays = 0
  const cursor = new Date(now)
  while ((days.get(usageDateKey(cursor.getTime()))?.totalTokens ?? 0) > 0) { currentStreakDays++; cursor.setDate(cursor.getDate() - 1) }
  return { generatedAt: now, summary: { totalTokens: sorted.reduce((sum, day) => sum + day.totalTokens, 0), peakDayTokens: Math.max(0, ...sorted.map(day => day.totalTokens)), longestSessionMs, currentStreakDays, longestStreakDays }, days: sorted }
}
