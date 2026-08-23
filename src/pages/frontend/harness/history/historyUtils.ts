import type { HarnessHistoryRow } from '@/config/harness'

export type HistoryGroupKey = 'today' | 'yesterday' | 'week' | 'month' | 'earlier'

const GROUP_LABELS: Record<HistoryGroupKey, string> = {
  today: '今天', yesterday: '昨天', week: '本周', month: '本月', earlier: '更早',
}

function dayStart(value: number) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function smartRelative(value: number, current = Date.now()) {
  const difference = Math.max(0, current - value)
  if (difference < 60_000) return '刚刚'
  if (difference < 60 * 60_000) return `${Math.round(difference / 60_000)} 分钟前`
  const today = dayStart(current)
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(value)
  if (value >= today) return `今天 ${time}`
  if (value >= today - 24 * 60 * 60_000) return `昨天 ${time}`
  if (value >= today - 7 * 24 * 60 * 60_000) return `${Math.floor(difference / (24 * 60 * 60_000))} 天前`
  const date = new Date(value)
  return date.getFullYear() === new Date(current).getFullYear()
    ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(value)
    : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
}

export function groupHistoryRows(rows: HarnessHistoryRow[], current = Date.now()) {
  const today = dayStart(current)
  const week = today - ((new Date(current).getDay() + 6) % 7) * 24 * 60 * 60_000
  const month = new Date(current); month.setDate(1); month.setHours(0, 0, 0, 0)
  const groups = new Map<HistoryGroupKey, HarnessHistoryRow[]>()
  rows.forEach(row => {
    const key: HistoryGroupKey = row.updatedAt >= today ? 'today'
      : row.updatedAt >= today - 24 * 60 * 60_000 ? 'yesterday'
        : row.updatedAt >= week ? 'week'
          : row.updatedAt >= month.getTime() ? 'month' : 'earlier'
    const entries = groups.get(key) || []
    entries.push(row)
    groups.set(key, entries)
  })
  return (Object.keys(GROUP_LABELS) as HistoryGroupKey[]).flatMap(key => {
    const rows = groups.get(key)
    return rows?.length ? [{ key, label: GROUP_LABELS[key], rows }] : []
  })
}
