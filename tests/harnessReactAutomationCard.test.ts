import { describe, expect, it } from 'vitest'
import { automationCardNextRun, automationCardSchedule } from '../apps/harness-react/src/components/automations/automation-card'
import type { AutomationTask } from '../src/config/harness'

describe('automation card schedule presentation', () => {
  it('uses the authoritative repeat rule rather than its compatibility cron or stale label', () => {
    const task = { trigger: { type: 'cron', expression: '44 9 * * *', humanLabel: '每天 09:44', scheduleRule: { unit: 'monthly', interval: 30, hour: 9, minute: 44, monthDays: [12, 20], anchorAt: 1 } } } as AutomationTask
    expect(automationCardSchedule(task)).toBe('每 30 个月 12、20 日 09:44')
    task.trigger = { type: 'cron', expression: '44 */2 * * *', humanLabel: '每 2 小时' }
    expect(automationCardSchedule(task)).toBe('每 2 小时的第 44 分')
  })

  it('keeps one-shot tasks distinct from recurring schedules', () => {
    const task = { trigger: { type: 'once', scheduledAt: Date.now() + 60_000 } } as AutomationTask
    expect(automationCardSchedule(task)).toMatch(/^一次性 · /)
  })

  it('shows future relative times, omits overdue times and uses a date for distant runs', () => {
    const now = new Date('2026-10-19T09:00:00+08:00').getTime()
    expect(automationCardNextRun(undefined, now)).toBeUndefined()
    expect(automationCardNextRun(now, now)).toBeUndefined()
    expect(automationCardNextRun(now - 1, now)).toBeUndefined()
    expect(automationCardNextRun(now + 15_000, now)).toBe('即将')
    expect(automationCardNextRun(now + 53 * 60_000, now)).toBe('53 分钟后')
    expect(automationCardNextRun(now + 2 * 3_600_000, now)).toBe('2 小时后')
    expect(automationCardNextRun(now + 3 * 86_400_000, now)).toBe('3 天后')
    expect(automationCardNextRun(now + 40 * 86_400_000, now)).not.toContain('后')
  })
})
