import type { HarnessMessage, HarnessRunActivity } from '@/config/harness'

export function replyStatus(message: HarnessMessage, streaming: boolean) {
  if (message.run?.status) return message.run.status
  if (message.interrupted) return 'stopped'
  return streaming && !message.run ? 'running' : 'completed'
}

export function replyDuration(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000)
  return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60}秒`
}

export function compactActivityLabel(activity: HarnessRunActivity) {
  if (activity.label.startsWith('执行命令')) return '正在执行命令'
  return activity.label.replace(/^(读取文件|编辑文件|写入文件|查看文件|删除文件)\s+(.+)$/, (_, verb: string, path: string) => `${verb} ${path.split(/[\\/]/).filter(Boolean).pop() || path}`)
}

export function currentActivityLabel(activities: HarnessRunActivity[], fallback = '正在思考') {
  // 工具优先于同时存在的生成状态；计划步骤放在过程详情中。
  const running = activities.filter(activity => activity.status === 'running' && activity.kind !== 'plan')
  const current = running.find(activity => activity.kind === 'tool' || activity.id.startsWith('tool-')) || running[running.length - 1]
  return current ? compactActivityLabel(current) : fallback
}
