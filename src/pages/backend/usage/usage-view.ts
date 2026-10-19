/* ZCode AppUsagePanel / UsageHeatmap view semantics, adapted to Vue.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import type { HarnessAppUsage } from '@/config/harnessUsage'
import { usageDateKey } from '@/config/harnessUsage'
export const USAGE_COLORS = ['#0b7fff', '#1e8a3e', '#9e77ed', '#e03131', '#e07b00', '#0aa7a7']
export const compactTokens = (value: number) => new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
export function usageDuration(ms: number) {
  const minutes = Math.floor(ms / 60000), days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60)
  return [days && `${days} 天`, hours && `${hours} 小时`, (minutes % 60 || !minutes) && `${minutes % 60} 分钟`].filter(Boolean).join(' ') || '0 分钟'
}
export function usageRange(snapshot: HarnessAppUsage, range: number) {
  const end = new Date(snapshot.generatedAt), start = new Date(end)
  start.setDate(start.getDate() - range)
  const days = []
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const key = usageDateKey(date.getTime())
    days.push(snapshot.days.find(day => day.date === key) ?? { date: key, totalTokens: 0, turnCount: 0, models: [] })
  }
  const totals = new Map<string, number>()
  for (const day of days) for (const model of day.models) totals.set(model.modelId, (totals.get(model.modelId) || 0) + model.totalTokens)
  const models = [...totals].sort((a, b) => b[1] - a[1]).map(([label, totalTokens], i) => ({ label, totalTokens, color: USAGE_COLORS[i % USAGE_COLORS.length] }))
  return { days, models, total: models.reduce((sum, model) => sum + model.totalTokens, 0) }
}
export function usageHeatmap(snapshot: HarnessAppUsage, mode: string) {
  const end = new Date(snapshot.generatedAt), start = new Date(end)
  start.setDate(start.getDate() - start.getDay() - 51 * 7)
  const lookup = new Map(snapshot.days.map(day => [day.date, day]))
  let cumulative = 0, cumulativeCount = 0
  const weeks = Array.from({ length: 52 }, (_, week) => {
    const days = Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(start); date.setDate(start.getDate() + week * 7 + weekday)
      const key = usageDateKey(date.getTime()), day = lookup.get(key)
      return { date: key, total: day?.totalTokens || 0, count: day?.turnCount || 0, future: key > usageDateKey(end.getTime()) }
    })
    const total = days.reduce((sum, day) => sum + day.total, 0), count = days.reduce((sum, day) => sum + day.count, 0)
    cumulative += total; cumulativeCount += count
    return { days, total: mode === 'cumulative' ? cumulative : total, count: mode === 'cumulative' ? cumulativeCount : count }
  })
  const max = Math.max(0, ...weeks.flatMap(week => mode === 'daily' ? week.days.map(day => day.total) : [week.total]))
  const level = (value: number) => value && max ? Math.min(4, Math.max(1, Math.ceil(value / max * 4))) : 0
  return weeks.map(week => ({ ...week, cells: week.days.map((day, i) => ({ ...day, value: mode === 'daily' ? day.total : week.total, count: mode === 'daily' ? day.count : week.count, level: mode === 'daily' ? level(day.total) : i >= 7 - Math.ceil(week.total / (max || 1) * 7) ? level(week.total) : 0 })) }))
}
// Monotone cubic interpolation keeps a smooth curve without negative overshoot.
export function usageLine(values: number[], maximum: number) {
  const points = values.map((value, i) => ({ x: 24 + i * 752 / Math.max(1, values.length - 1), y: 224 - value / (maximum || 1) * 208 }))
  const slopes = points.slice(1).map((point, i) => (point.y - points[i].y) / (point.x - points[i].x))
  const tangents = points.map((_, i) => i === 0 ? slopes[0] || 0 : i === points.length - 1 ? slopes[i - 1] || 0 : slopes[i - 1] * slopes[i] <= 0 ? 0 : 2 / (1 / slopes[i - 1] + 1 / slopes[i]))
  return points.reduce((path, point, i) => {
    if (!i) return `M${point.x},${point.y}`
    const previous = points[i - 1], third = (point.x - previous.x) / 3
    return `${path} C${previous.x + third},${previous.y + tangents[i - 1] * third} ${point.x - third},${point.y - tangents[i] * third} ${point.x},${point.y}`
  }, '')
}
