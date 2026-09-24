export type HarnessPanelRunStatus = 'idle' | 'running' | 'rendering' | 'completed' | 'failed' | 'stopped'

export function panelTaskLabel(status: HarnessPanelRunStatus, fileCount = 0) {
  if (status === 'running') return '正在执行任务'
  if (status === 'rendering') return '正在整理回复'
  if (status === 'failed') return '任务失败'
  if (status === 'stopped') return '任务已停止'
  if (status === 'completed') return fileCount ? `任务已完成，修改了 ${fileCount} 个文件` : '最近任务已完成'
  return '尚无任务记录'
}

export function panelTaskIcon(status: HarnessPanelRunStatus) {
  if (status === 'running' || status === 'rendering') return 'Loading'
  if (status === 'failed') return 'CircleClose'
  if (status === 'stopped') return 'VideoPause'
  if (status === 'completed') return 'CircleCheck'
  return 'Clock'
}

export function panelSummary(status: HarnessPanelRunStatus, fileCount = 0, hasError = false) {
  if (status === 'running') return '正在执行'
  if (status === 'rendering') return '正在整理回复'
  if (status === 'failed') return hasError ? '任务失败，查看错误详情' : '任务失败，详情见对话'
  if (status === 'stopped') return '已停止，已生成内容保留'
  if (status === 'completed' && fileCount) return `已修改 ${fileCount} 个文件`
  return '会话状态与执行记录'
}
