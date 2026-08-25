import { describe, expect, it } from 'vitest'
import { calculateUsageCost, normalizePricing } from '../electron/usageCost'

describe('usage cost', () => {
  it('calculates every token category from per-million pricing', () => {
    const pricing = normalizePricing({ currency: 'cny', input: 2, output: 8, cacheRead: 0.5, cacheWrite: 1 })!
    expect(calculateUsageCost({ input: 500000, output: 250000, cacheRead: 1000000, cacheWrite: 2000000, totalTokens: 3750000 }, pricing))
      .toEqual({ currency: 'CNY', input: 1, output: 2, cacheRead: 0.5, cacheWrite: 2, total: 5.5, priced: true })
  })

  it('marks missing or invalid prices as unpriced instead of inventing a value', () => {
    expect(normalizePricing({ currency: '', input: 2 })).toBeUndefined()
    expect(calculateUsageCost({ input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3 })).toMatchObject({ priced: false, total: 0 })
  })
})
