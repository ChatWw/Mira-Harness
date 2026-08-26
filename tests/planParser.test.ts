import { describe, expect, it } from 'vitest'
import { MAX_PLAN_STEPS, normalizePlanSteps } from '../src/config/harness'

describe('normalizePlanSteps', () => {
  it('returns an empty list for non-array or missing input', () => {
    expect(normalizePlanSteps(undefined)).toEqual([])
    expect(normalizePlanSteps(null)).toEqual([])
    expect(normalizePlanSteps('steps')).toEqual([])
    expect(normalizePlanSteps({})).toEqual([])
  })

  it('maps valid steps and trims labels/details', () => {
    const result = normalizePlanSteps([
      { label: '  读取配置  ', detail: '  找到配置文件  ' },
      { label: ' 修改正文 ' },
    ])
    expect(result).toEqual([
      { label: '读取配置', detail: '找到配置文件' },
      { label: '修改正文', detail: undefined },
    ])
  })

  it('drops steps without a non-empty label', () => {
    const result = normalizePlanSteps([
      { detail: '无标签' },
      { label: '   ' },
      { label: '' },
      { label: '有效步骤' },
    ])
    expect(result).toEqual([{ label: '有效步骤', detail: undefined }])
  })

  it('caps the number of steps at MAX_PLAN_STEPS', () => {
    const steps = Array.from({ length: 12 }, (_, index) => ({ label: `步骤 ${index}` }))
    const result = normalizePlanSteps(steps)
    expect(result).toHaveLength(MAX_PLAN_STEPS)
    expect(result[0]).toEqual({ label: '步骤 0', detail: undefined })
  })

  it('only keeps string details and trims empty ones', () => {
    const result = normalizePlanSteps([
      { label: 'a', detail: 123 },
      { label: 'b', detail: '   ' },
      { label: 'c', detail: 'ok' },
    ])
    expect(result).toEqual([
      { label: 'a', detail: undefined },
      { label: 'b', detail: undefined },
      { label: 'c', detail: 'ok' },
    ])
  })
})
