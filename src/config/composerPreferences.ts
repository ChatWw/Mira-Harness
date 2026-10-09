export type ComposerFollowupMode = 'queue' | 'guide'

export function resolveComposerFollowupMode(value: unknown): ComposerFollowupMode {
  return value === 'guide' ? 'guide' : 'queue'
}

export function assertComposerFollowupMode(value: unknown): asserts value is ComposerFollowupMode {
  if (value !== 'queue' && value !== 'guide') throw new Error('运行中消息处理只允许队列或引导')
}
