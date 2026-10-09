import type { ModelSelection, ThinkingLevel } from '../../../../src/config/harness'

export const COMPOSER_REASONING_CHOICES: ReadonlyArray<{ value: ThinkingLevel; label: string }> = [
  { value: 'off', label: '关闭' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]

export function applyComposerReasoning(
  selection: ModelSelection | undefined,
  model: (Pick<ModelSelection, 'providerId' | 'modelId'> & { reasoning: boolean }) | undefined,
  value: string,
): ModelSelection | undefined {
  if (!selection || !model?.reasoning || model.providerId !== selection.providerId || model.modelId !== selection.modelId) return undefined
  const choice = COMPOSER_REASONING_CHOICES.find(item => item.value === value)
  return choice ? { ...selection, thinkingLevel: choice.value } : undefined
}
