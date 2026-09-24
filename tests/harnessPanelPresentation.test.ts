import { describe, expect, it } from 'vitest'
import { panelSummary, panelTaskIcon, panelTaskLabel } from '../src/pages/frontend/harness/panelPresentation'

describe('Harness work panel state presentation', () => {
  it.each([
    ['idle', '尚无任务记录', 'Clock'],
    ['running', '正在执行任务', 'Loading'],
    ['rendering', '正在整理回复', 'Loading'],
    ['failed', '任务失败', 'CircleClose'],
    ['stopped', '任务已停止', 'VideoPause'],
    ['completed', '最近任务已完成', 'CircleCheck'],
  ] as const)('maps %s to an explicit task state', (status, label, icon) => {
    expect(panelTaskLabel(status)).toBe(label)
    expect(panelTaskIcon(status)).toBe(icon)
  })

  it('keeps file results and failure recovery discoverable in the summary', () => {
    expect(panelTaskLabel('completed', 2)).toBe('任务已完成，修改了 2 个文件')
    expect(panelSummary('completed', 2)).toBe('已修改 2 个文件')
    expect(panelSummary('failed', 0, true)).toBe('任务失败，查看错误详情')
    expect(panelSummary('stopped')).toBe('已停止，已生成内容保留')
  })
})
