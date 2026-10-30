// Round to seconds, at most two nonzero units.
export function formatConversationWorkDuration(durationMs: number) {
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  return [[Math.floor(seconds / 86400), '天'], [Math.floor(seconds % 86400 / 3600), '小时'], [Math.floor(seconds % 3600 / 60), '分钟'], [seconds % 60, '秒']]
    .filter(([value]) => Number(value) > 0).slice(0, 2).map(([value, unit]) => `${value} ${unit}`).join(' ')
}
