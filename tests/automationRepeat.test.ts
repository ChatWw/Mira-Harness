import { describe, expect, it, vi } from 'vitest'
import { computeScheduleRuleNextRunAt, repeatNextRuns, validateAutomationScheduleRule, type AutomationScheduleRule } from '../src/config/automationRepeat'
import { AutomationKeepAwake } from '../electron/services/automationKeepAwake'
const date = (value: string) => new Date(value).getTime()
const rule = (patch: Partial<AutomationScheduleRule> = {}): AutomationScheduleRule => ({ unit: 'weekly', interval: 2, hour: 9, minute: 0, anchorAt: date('2026-10-05T10:00:00'), weekdays: [1, 3], ...patch })
describe('ZCode calendar repeat rules port', () => {
  it('runs every other week without turning it into every week', () => {
    const dates = repeatNextRuns(rule(), 3, date('2026-10-05T10:00:00'))
    expect(dates.map(value => new Date(value).getDate())).toEqual([7, 19, 21])
  })
  it('anchors 90-minute intervals instead of snapping to wall clock fields', () => {
    const anchorAt = date('2026-10-05T10:07:15')
    expect(repeatNextRuns(rule({ unit: 'minute', interval: 90, anchorAt }), 2, anchorAt)).toEqual([anchorAt + 90 * 60000, anchorAt + 180 * 60000])
  })
  it('skips short months and non-leap years, and supports first weekday of month', () => {
    expect(new Date(computeScheduleRuleNextRunAt(rule({ unit: 'monthly', interval: 1, monthDays: [31], anchorAt: date('2026-04-01T00:00:00') }), date('2026-04-01T00:00:00'))!).getMonth()).toBe(4)
    expect(new Date(computeScheduleRuleNextRunAt(rule({ unit: 'yearly', interval: 1, months: [2], monthDays: [29], anchorAt: date('2026-01-01T00:00:00') }), date('2026-01-01T00:00:00'))!).getFullYear()).toBe(2028)
    expect(new Date(computeScheduleRuleNextRunAt(rule({ unit: 'monthly', interval: 1, monthlyMode: 'weekday', weekdays: [1], anchorAt: date('2026-10-01T00:00:00') }), date('2026-10-01T00:00:00'))!).getDate()).toBe(5)
  })
  it('rejects unsafe intervals and malformed date lists at the boundary', () => {
    const minuteRule = validateAutomationScheduleRule(rule({ unit: 'minute', interval: 1 }))
    expect(repeatNextRuns(minuteRule, 2, minuteRule.anchorAt)).toEqual([minuteRule.anchorAt + 60000, minuteRule.anchorAt + 120000])
    expect(() => validateAutomationScheduleRule(rule({ interval: 0 }))).toThrow('无效')
    expect(() => validateAutomationScheduleRule(rule({ weekdays: [9] }))).toThrow('日期')
    expect(() => validateAutomationScheduleRule(rule({ interval: NaN }))).toThrow('无效')
  })
})
describe('session keep awake lifecycle', () => {
  it('holds a single blocker during activity and releases on idle, preference off, and shutdown', () => {
    const blocker = { start: vi.fn(() => 7), stop: vi.fn() }, power = new AutomationKeepAwake(blocker)
    power.update(false, true); power.update(true, false); expect(blocker.start).not.toHaveBeenCalled()
    power.update(true, true); power.update(true, true); expect(blocker.start).toHaveBeenCalledOnce()
    power.update(true, false); expect(blocker.stop).toHaveBeenCalledWith(7)
    power.update(true, true); power.update(false, true); power.dispose(); expect(blocker.stop).toHaveBeenCalledTimes(2)
    power.update(true, true); power.dispose(); expect(blocker.stop).toHaveBeenCalledTimes(3)
  })
})
