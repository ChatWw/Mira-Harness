/* Copyright 2026 Z.AI Co., Ltd. SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode automationCardSchedule / automationFormat.
 * License: third-party-licenses/zcode/. */
import type { AutomationTask } from '../../../../../src/config/harness'
import { triggerLabel, formatAutomationTime } from '../../../../../src/config/automationPresentation'

export function automationCardSchedule(task: AutomationTask): string {
  if (task.trigger.type !== 'cron') return triggerLabel(task)
  const rule = task.trigger.scheduleRule
  if (rule) {
    const time = `${String(rule.hour).padStart(2, '0')}:${String(rule.minute).padStart(2, '0')}`
    const interval = rule.interval
    const weekdays = (rule.weekdays || [1]).map(day => `周${['日', '一', '二', '三', '四', '五', '六'][day]}`).join('、')
    switch (rule.unit) {
      case 'minute': return `每 ${interval} 分钟`
      case 'hourly': return `${interval === 1 ? '每小时' : `每 ${interval} 小时`}的第 ${rule.minute} 分`
      case 'daily': return `${interval === 1 ? '每天' : `每 ${interval} 天`} ${time}`
      case 'weekly': return `${interval === 1 ? '每周' : `每 ${interval} 周`} ${weekdays} ${time}`
      case 'monthly': return `${interval === 1 ? '每月' : `每 ${interval} 个月`} ${rule.monthlyMode === 'weekday' ? `第一个${weekdays}` : `${(rule.monthDays || [1]).join('、')} 日`} ${time}`
      case 'yearly': return `每 ${interval} 年 ${(rule.months || [new Date(rule.anchorAt).getMonth() + 1]).join('、')} 月 ${(rule.monthDays || [1]).join('、')} 日 ${time}`
    }
  }
  const hourly = /^(\d+) (\*|\*\/(\d+)) \* \* \*$/.exec(task.trigger.expression.trim())
  if (hourly) return `${!hourly[3] || hourly[3] === '1' ? '每小时' : `每 ${hourly[3]} 小时`}的第 ${Number(hourly[1])} 分`
  return triggerLabel(task)
}

export function automationCardNextRun(timestamp?: number, now = Date.now()): string | undefined {
  if (!timestamp || timestamp <= now) return
  const diff = timestamp - now
  if (diff > 30 * 24 * 60 * 60 * 1000) return formatAutomationTime(timestamp)
  if (diff < 60_000) return '即将'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} 分钟后`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} 小时后`
  return `${Math.round(diff / 86_400_000)} 天后`
}
