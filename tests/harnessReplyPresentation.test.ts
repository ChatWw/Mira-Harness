import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { HarnessMessage, HarnessRunActivity } from '../src/config/harness'
import { currentActivityLabel, replyDuration, replyStatus } from '../src/pages/frontend/harness/runPresentation'
import HarnessMessageItem from '../src/pages/frontend/harness/components/HarnessMessageItem.vue'

const tool: HarnessRunActivity = { id: 'tool-read', label: '读取文件 D:\\project\\src\\README.md', status: 'running', startedAt: 0 }
const message: HarnessMessage = { id: 'reply', role: 'assistant', content: '保留的部分回复', createdAt: 0 }

describe('reply presentation', () => {
  it('prioritizes the current tool over overlapping generation and plan activities', () => {
    expect(currentActivityLabel([{ ...tool, id: 'plan-1', kind: 'plan', label: '分析' }, { ...tool, id: 'answering', label: '正在生成回复' }, tool])).toBe('读取文件 README.md')
    expect(currentActivityLabel([{ ...tool, label: '执行命令 cd /private/project && git status' }])).toBe('正在执行命令')
    expect(currentActivityLabel([{ ...tool, status: 'completed' }])).toBe('正在思考')
  })

  it('does not mistake a recovered tool error for a failed reply', () => {
    const run = { startedAt: 0, completedAt: 83000, durationMs: 83000, activities: [{ ...tool, status: 'failed' as const }] }
    expect(replyStatus({ ...message, run }, false)).toBe('completed')
    expect(replyStatus({ ...message, run: { ...run, status: 'failed' } }, false)).toBe('failed')
    expect(replyStatus({ ...message, interrupted: true }, false)).toBe('stopped')
    expect(replyStatus(message, true)).toBe('running')
  })

  it('formats elapsed time without rounding into the next minute', () => {
    expect(replyDuration(59999)).toBe('59秒')
    expect(replyDuration(60000)).toBe('1分0秒')
    expect(replyDuration(83000)).toBe('1分23秒')
    expect(replyDuration(-1)).toBe('0秒')
  })

  it.each(['running', 'completed', 'failed', 'stopped'] as const)('renders a text-only %s header, collapsed history and preserved reply', async status => {
    const run = { status: status === 'running' ? undefined : status, startedAt: 0, completedAt: 83000, durationMs: 83000, activities: [tool], error: status === 'failed' ? '连接超时' : undefined }
    const app = createSSRApp(HarnessMessageItem, { message: { ...message, run: status === 'running' ? undefined : run }, activeRun: { sessionId: 's', startedAt: 0, activities: [tool], subtasks: [] }, activeRunElapsed: 83000, activeRunLabel: '正在思考', streaming: status === 'running', entering: false, busy: status === 'running', lastMessage: true })
    app.component('AppIcon', { template: '<i class="test-icon" />' })
    app.component('ElInput', { template: '<textarea />' })
    const html = await renderToString(app)
    const header = html.match(/<header[^>]*>(.*?)<\/header>/s)?.[1] || ''
    expect(header).toContain({ running: '正在回复', completed: '回复完成', failed: '回复失败', stopped: '已停止' }[status])
    expect(header).toContain('1分23秒')
    expect(header).not.toContain('test-icon')
    expect(html).not.toMatch(/<details[^>]*\sopen(?:\s|>|=)/)
    expect(html).toContain('保留的部分回复')
    expect(html).not.toContain('任务完成')
    if (status === 'failed') expect(html).toContain('连接超时')
    if (status === 'stopped') expect(html).toContain('继续回复')
  })
})
