import { describe, expect, it } from 'vitest'
import { applyComposerReasoning, COMPOSER_REASONING_CHOICES } from '../apps/harness-react/src/lib/model-reasoning'

const selection = { providerId: 'provider', modelId: 'model', thinkingLevel: 'high' as const }
const model = { providerId: 'provider', modelId: 'model', reasoning: true }

describe('React Harness composer reasoning selection', () => {
  it('only exposes the levels supported by the Mira runtime contract', () => {
    expect(COMPOSER_REASONING_CHOICES.map(choice => choice.value)).toEqual(['off', 'low', 'medium', 'high'])
    for (const value of ['minimal', 'xhigh', 'max', 'ultra', '', 'unknown']) expect(applyComposerReasoning(selection, model, value)).toBeUndefined()
  })

  it('changes the requested level without mutating the current model selection', () => {
    expect(applyComposerReasoning(selection, model, 'off')).toEqual({ providerId: 'provider', modelId: 'model', thinkingLevel: 'off' })
    expect(applyComposerReasoning({ providerId: 'provider', modelId: 'model' }, model, 'medium')).toEqual({ providerId: 'provider', modelId: 'model', thinkingLevel: 'medium' })
    expect(selection.thinkingLevel).toBe('high')
  })

  it('does not apply a stale menu selection to another or unavailable model', () => {
    expect(applyComposerReasoning(selection, { ...model, providerId: 'another' }, 'low')).toBeUndefined()
    expect(applyComposerReasoning(selection, { ...model, modelId: 'another' }, 'low')).toBeUndefined()
    expect(applyComposerReasoning(selection, { ...model, reasoning: false }, 'low')).toBeUndefined()
    expect(applyComposerReasoning(selection, undefined, 'low')).toBeUndefined()
    expect(applyComposerReasoning(undefined, model, 'low')).toBeUndefined()
  })
})
