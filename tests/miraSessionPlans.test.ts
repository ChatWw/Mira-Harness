import { describe, expect, it } from 'vitest'
import type { HarnessSession, ToolCallRecord } from '../src/config/harness'
import { miraSessionPlans } from '../src/config/miraSessionPlans'

const submission = {
  understanding: '# 更新项目目录\n\n保留 **Electron** 能力与现有桥接。\n\n```ts\nconst enabled = true\n```',
  steps: [{ label: '**确认范围**', detail: '先阅读现有实现。\n\n- 核对运行路径\n- 核对数据契约' }, { label: '适配目录' }],
  risks: ['不覆盖用户改动', '**旧版本** 数据需兼容'],
}

function tool(id: string, overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return { id, tool: 'present_plan', status: 'ok', createdAt: 100, input: { text: JSON.stringify(submission), truncated: false }, ...overrides }
}

function session(toolCalls: ToolCallRecord[], overrides: Partial<HarnessSession> = {}): HarnessSession {
  return { version: 1, id: 'session', title: 'Task', permissionMode: 'default', messages: [], toolCalls, createdAt: 1, updatedAt: 1, status: 'active', pinned: false, ...overrides }
}

describe('session submitted-plan directory', () => {
  it('renders public understanding, steps, details, and risks without flattening rich Markdown', () => {
    const result = miraSessionPlans(session([tool('first')]))
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 'first', title: '更新项目目录', createdAt: 100, toolStatus: 'ok', markdown: `${submission.understanding}\n\n## 实施步骤\n\n1. **确认范围**\n\n   先阅读现有实现。\n   \n   - 核对运行路径\n   - 核对数据契约\n\n2. 适配目录\n\n## 风险与注意事项\n\n- 不覆盖用户改动\n- **旧版本** 数据需兼容` })
  })

  it('retains repeated submissions after activePlan is replaced, ordered by authoritative tool position', () => {
    const previous = tool('previous', { createdAt: 500 })
    const revised = tool('revised', { createdAt: 200, input: { text: JSON.stringify({ ...submission, understanding: '# 修订方案' }), truncated: false } })
    const result = miraSessionPlans(session([previous, revised], { activePlan: { id: 'current-placeholder', understanding: '当前规划占位' } as HarnessSession['activePlan'] }))
    expect(result.map(plan => plan.id)).toEqual(['revised', 'previous'])
    expect(result.map(plan => plan.title)).toEqual(['修订方案', '更新项目目录'])
    expect(result.map(plan => plan.createdAt)).toEqual([200, 500])
  })

  it('does not mutate tool order or the input session', () => {
    const source = session([tool('first'), tool('second')])
    const original = structuredClone(source)
    miraSessionPlans(source)
    expect(source).toEqual(original)
  })

  it('keeps settled failed and cancelled submissions inspectable while excluding live and unrelated tools', () => {
    const source = session([
      tool('failed', { status: 'failed' }), tool('cancelled', { status: 'cancelled' }),
      tool('running', { status: 'running' }), tool('waiting', { status: 'waiting-confirm' }),
      tool('write', { tool: 'write' }), tool('question', { tool: 'ask_user' }),
    ])
    expect(miraSessionPlans(source).map(plan => [plan.id, plan.toolStatus])).toEqual([['cancelled', 'cancelled'], ['failed', 'failed']])
  })

  it('does not treat a planning placeholder as a submitted historical plan', () => {
    expect(miraSessionPlans()).toEqual([])
    expect(miraSessionPlans(session([], { activePlan: { id: 'placeholder', understanding: '尚未提交' } as HarnessSession['activePlan'] }))).toEqual([])
  })

  it('marks truncated inputs unavailable even if the retained prefix is valid JSON', () => {
    const result = miraSessionPlans(session([tool('truncated', { input: { text: JSON.stringify(submission), truncated: true } })]))
    expect(result[0]).toMatchObject({ id: 'truncated', title: '方案内容不完整', incomplete: true, markdown: '该方案内容已被截断，无法展示完整版本。' })
    expect(result[0]?.markdown).not.toContain('Electron')
  })

  it.each([
    undefined,
    { text: '', truncated: false },
    { text: '{"understanding":"unfinished', truncated: false },
    { text: 'null', truncated: false },
    { text: JSON.stringify({ understanding: ' ', steps: [] }), truncated: false },
    { text: JSON.stringify({ understanding: 'Plan', steps: [{ label: ' ' }] }), truncated: false },
    { text: JSON.stringify({ ...submission, steps: [{ label: 'Step', detail: 2 }] }), truncated: false },
    { text: JSON.stringify({ ...submission, risks: [null] }), truncated: false },
  ])('retains an explicit unavailable entry for incomplete legacy or invalid payload %j', input => {
    const result = miraSessionPlans(session([tool('legacy', { input })]))
    expect(result[0]).toMatchObject({ id: 'legacy', title: '历史方案', incomplete: true, markdown: '该方案未保留完整内容。' })
  })

  it.each([
    ['Introduction\n\n# **正式标题** #\n\nBody', '正式标题'],
    ['\n\n> **说明** [链接](https://example.com)', '说明 链接'],
    ['## 次级标题', '次级标题'],
    ['1. `执行步骤`', '执行步骤'],
    ['长'.repeat(160), '长'.repeat(120)],
  ])('uses a readable bounded title for %s', (understanding, expected) => {
    const result = miraSessionPlans(session([tool('title', { input: { text: JSON.stringify({ understanding, steps: [{ label: '执行' }] }), truncated: false } })]))
    expect(result[0]?.title).toBe(expected)
    expect(result[0]?.markdown).toContain(understanding.trim())
    expect(result[0]?.markdown).not.toContain('## 风险与注意事项')
  })

  it('isolates task directories and preserves inherited submissions as read-only history', () => {
    const parent = session([tool('parent-plan')])
    const fork = session([tool('inherited-plan', { inherited: true }), tool('fork-plan')], { id: 'fork', forkSource: { sessionId: parent.id, messageId: 'reply', title: parent.title } })
    const unrelated = session([tool('unrelated-plan')], { id: 'other' })
    expect(miraSessionPlans(parent).map(plan => plan.id)).toEqual(['parent-plan'])
    expect(miraSessionPlans(fork).map(plan => plan.id)).toEqual(['fork-plan', 'inherited-plan'])
    expect(miraSessionPlans(unrelated).map(plan => plan.id)).toEqual(['unrelated-plan'])
  })
})
