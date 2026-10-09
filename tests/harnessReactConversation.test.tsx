import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessRunSummary } from '../src/config/harness'
import { RunProgressCard, ToolRecord } from '../apps/harness-react/src/components/conversation/run-progress'
import { UserMessageAttachments } from '../apps/harness-react/src/components/conversation/message-parts'

beforeEach(() => vi.stubGlobal('React', React))
afterEach(() => vi.unstubAllGlobals())

describe('Mira conversation rendered progress', () => {
  it('does not count a stopped child as a completed operation or label partial progress successful', () => {
    const run: HarnessRunSummary = { status: 'completed', startedAt: 1, completedAt: 4, durationMs: 3, activities: [{ id: 'one', label: '读取', status: 'completed', startedAt: 1 }], subtasks: [{ id: 'child', parentToolCallId: 'parent', role: 'reviewer', task: '审查', status: 'stopped', createdAt: 1, activities: [] }] }
    const html = renderToStaticMarkup(<RunProgressCard run={run} running={false} />)
    expect(html).toContain('部分操作未完成')
    expect(html).toContain('1/2 项操作')
    expect(html).not.toContain('已完成 2')
  })

  it('places real live tool state and target in the running timeline without mounting collapsed payloads', () => {
    const run: HarnessRunSummary = { startedAt: 1, completedAt: 4, durationMs: 3, activities: [{ id: 'one', label: '编辑', status: 'running', startedAt: 1 }] }
    const html = renderToStaticMarkup(<RunProgressCard run={run} running tools={[{ id: 'call', tool: 'write', target: 'src/<safe>.ts', status: 'running', diff: '+<safe>', createdAt: 2 }]} />)
    expect(html).toContain('aria-label="正在执行的工具"')
    expect(html).toContain('data-tool-status="running"')
    expect(html).toContain('src/&lt;safe&gt;.ts')
    expect(html).not.toContain('+&lt;safe&gt;')
  })

  it('shows a genuine pending confirmation rather than claiming the task is generating text', () => {
    const run: HarnessRunSummary = { startedAt: 1, completedAt: 4, durationMs: 3, activities: [{ id: 'one', label: '正在思考', status: 'running', startedAt: 1 }] }
    const html = renderToStaticMarkup(<RunProgressCard run={run} running waiting />)
    expect(html).toContain('等待确认后继续')
    expect(html).not.toContain('<span>正在思考</span>')
  })

  it.each([
    { status: 'waiting-confirm' as const, label: '等待确认' },
    { status: 'ok' as const, label: '已完成' },
    { status: 'failed' as const, label: '失败' },
  ])('retains the actual $status record without inventing input or output', ({ status, label }) => {
    const html = renderToStaticMarkup(<ToolRecord tool={{ id: 'call', tool: 'read', target: 'README.md', status, createdAt: 1, ...(status === 'failed' ? { error: '没有读取权限' } : {}) }} />)
    expect(html).toContain(label)
    expect(html).toContain('README.md')
    expect(html).toContain(`data-tool-status="${status}"`)
    expect(html).not.toContain('<pre>')
    expect(html).not.toContain('Input')
  })

  it('shows attached file references, but never leaks full attachment content into the bubble', () => {
    const html = renderToStaticMarkup(<UserMessageAttachments message={{ id: 'user', role: 'user', content: '分析文档', createdAt: 1, attachments: [{ path: 'docs/report.md', name: 'report.md', content: 'attachment-body-do-not-show' }] }} onOpen={vi.fn()} />)
    expect(html).toContain('report.md')
    expect(html).not.toContain('attachment-body-do-not-show')
  })
})
