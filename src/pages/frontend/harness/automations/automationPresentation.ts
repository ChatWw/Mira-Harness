import type { AutomationRun, AutomationRunSource, AutomationRunStatus, AutomationTask, PermissionMode } from '@/config/harness'
import { describeCronExpression } from '@/config/automationSchedule'

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' })

export function formatAutomationTime(value?: number) { return value ? dateTimeFormatter.format(value) : '-' }

export function triggerLabel(task: AutomationTask) {
  if (task.trigger.type === 'once') return task.endedAt ? `一次性 · ${formatAutomationTime(task.trigger.scheduledAt)}（已结束）` : `一次性 · ${formatAutomationTime(task.trigger.scheduledAt)}`
  if (task.trigger.type === 'session-completed') return '人工会话完成后触发'
  return task.trigger.humanLabel || describeCronExpression(task.trigger.expression)
}

export function targetLabel(task: AutomationTask) {
  return task.trigger.type === 'session-completed' ? '写入触发聊天' : task.target.type === 'existing-session' ? '现有聊天' : '新聊天'
}

export function permissionLabel(mode: PermissionMode) { return mode === 'default' ? '默认' : mode === 'auto-approve' ? '自动审核' : '完全访问' }

export function runStatusLabel(status: AutomationRunStatus) {
  return ({ running: '运行中', completed: '完成', failed: '失败', skipped: '跳过', interrupted: '已中断' })[status]
}

export function sourceLabel(source: AutomationRunSource) {
  return ({ scheduled: '定时', event: '会话事件', manual: '手动', 'manual-retry': '手动重试' })[source]
}

export function lastRunLabel(run?: AutomationRun) { return run ? runStatusLabel(run.status) : '尚未运行' }

export function taskState(task: AutomationTask, lastRun?: AutomationRun) {
  if (task.endedAt) return { key: 'ended', label: '已结束' }
  if (task.validFrom && task.validFrom > Date.now()) return { key: 'scheduled', label: '未生效' }
  if (!task.enabled) return { key: 'paused', label: '已暂停' }
  if (lastRun?.status === 'running') return { key: 'running', label: '运行中' }
  if (lastRun?.status === 'failed') return { key: 'failed', label: '失败 · 可重试' }
  return { key: 'stable', label: '稳定' }
}
