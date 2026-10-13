import type { HarnessToolText } from './harness'

/** Execution state is independent of the tool result returned to the model. */
export interface MiraCommandJob {
  mode: 'foreground' | 'background'
  backgroundAllowed?: false
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
  revision: number
  startedAt: number
  completedAt?: number
  output?: HarnessToolText
  error?: string
  fullOutputAvailable?: true
}

export const miraCommandJobLabels: Record<MiraCommandJob['status'], string> = {
  running: '运行中', completed: '已完成', failed: '执行失败', cancelled: '已停止', interrupted: '已中断',
}
