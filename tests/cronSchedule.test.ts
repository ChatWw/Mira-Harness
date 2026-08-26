import { describe, expect, it } from 'vitest'
import { nextCronOccurrences, validateCronExpression } from '../electron/cronSchedule'

describe('cronSchedule', () => {
  it('calculates future local-time occurrences for five-part cron expressions', () => {
    const start = new Date(2026, 0, 5, 8, 58).getTime()
    const runs = nextCronOccurrences('0 9 * * 1-5', 2, start)
    expect(new Date(runs[0]).getHours()).toBe(9)
    expect(new Date(runs[0]).getMinutes()).toBe(0)
    expect(new Date(runs[0]).getDay()).toBeGreaterThanOrEqual(1)
    expect(runs[1]).toBeGreaterThan(runs[0])
  })

  it('rejects malformed and too-frequent expressions', () => {
    expect(() => validateCronExpression('* * * * *')).toThrow('最小间隔')
    expect(() => validateCronExpression('0 9 * *')).toThrow('五段')
    expect(() => validateCronExpression('70 9 * * *')).toThrow('0-59')
  })

  it('supports the final calendar day for monthly tasks', () => {
    const start = new Date(2026, 0, 30, 12, 0).getTime()
    const [next] = nextCronOccurrences('0 9 L * *', 1, start)
    expect(new Date(next).getDate()).toBe(31)
    expect(new Date(next).getHours()).toBe(9)
  })
})
