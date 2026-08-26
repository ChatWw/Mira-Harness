import { describe, expect, it } from 'vitest'
import { buildCronExpression, describeCronExpression, describeSemanticSchedule } from '../src/config/automationSchedule'

describe('automationSchedule', () => {
  it('builds five-part cron expressions for semantic schedules', () => {
    expect(buildCronExpression({ type: 'daily', kind: 'workday', time: '09:00' })).toBe('0 9 * * 1-5')
    expect(buildCronExpression({ type: 'weekly', weekdays: [1, 3, 5], time: '18:30' })).toBe('30 18 * * 1,3,5')
    expect(buildCronExpression({ type: 'monthly', day: 'last', time: '10:00' })).toBe('0 10 L * *')
  })

  it('keeps human-facing summaries independent from cron syntax', () => {
    expect(describeSemanticSchedule({ type: 'daily', kind: 'workday', time: '09:00' })).toBe('每个工作日 09:00')
    expect(describeCronExpression('0 10 L * *')).toBe('每月最后一天 10:00')
  })
})
