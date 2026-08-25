import type { HarnessTokenUsage, HarnessUsageCost, ModelPricing } from '../src/config/harness'

const PER_MILLION = 1_000_000

function amount(value: unknown) { return Math.max(0, Number(value) || 0) }

export function normalizePricing(value: unknown): ModelPricing | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Partial<ModelPricing>
  const currency = typeof source.currency === 'string' ? source.currency.trim().toUpperCase().slice(0, 8) : ''
  if (!currency) return undefined
  return { currency, input: amount(source.input), output: amount(source.output), cacheRead: amount(source.cacheRead), cacheWrite: amount(source.cacheWrite) }
}

export function calculateUsageCost(usage: Omit<HarnessTokenUsage, 'cost'>, pricing?: ModelPricing): HarnessUsageCost {
  if (!pricing) return { currency: '', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, priced: false }
  const input = amount(usage.input) * pricing.input / PER_MILLION
  const output = amount(usage.output) * pricing.output / PER_MILLION
  const cacheRead = amount(usage.cacheRead) * pricing.cacheRead / PER_MILLION
  const cacheWrite = amount(usage.cacheWrite) * pricing.cacheWrite / PER_MILLION
  return { currency: pricing.currency, input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite, priced: true }
}

export function withUsageCost(usage: Omit<HarnessTokenUsage, 'cost'>, pricing?: ModelPricing): HarnessTokenUsage {
  return { ...usage, cost: calculateUsageCost(usage, pricing) }
}
