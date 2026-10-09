import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessMessage, HarnessPermissionRequest, HarnessRunSummary, ToolCallRecord } from '../src/config/harness'
import { AssistantMessageParts, findInlinePermissionTarget, PermissionResponseCard } from '../apps/harness-react/src/components/conversation/AssistantMessageParts'
import { RunProgressCard, ToolRecord } from '../apps/harness-react/src/components/conversation/run-progress'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial
    return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value }]
  },
}))

beforeEach(() => { hooks.cursor = 0; hooks.slots = []; vi.stubGlobal('React', React) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const tool: ToolCallRecord = { id: 'read-call', runId: 'run-one', tool: 'read', target: 'README.md', status: 'ok', input: { text: '{"path":"README.md"}', truncated: false }, output: { text: 'read output', truncated: false }, createdAt: 2 }
const message: HarnessMessage = {
  id: 'assistant', role: 'assistant', runId: 'run-one', content: 'before\nafter', createdAt: 1,
  parts: [
    { id: 'before', type: 'text', text: 'before', state: 'complete', startedAt: 1 },
    { id: 'thought', type: 'reasoning', text: 'public thought', state: 'complete', startedAt: 1, completedAt: 2300 },
    { id: 'read-part', type: 'tool', toolCallId: 'read-call' },
    { id: 'after', type: 'text', text: 'after', state: 'complete', startedAt: 3 },
  ],
}
const request: HarnessPermissionRequest = { requestId: 'approval', sessionId: 'session', toolCallId: 'read-call', runId: 'run-one', title: '允许读取', detail: 'README.md' }

function renderExpandedTool(record: ToolCallRecord) {
  hooks.cursor = 0
  const collapsed = ToolRecord({ tool: record })
  const onToggle = collapsed.props.onToggle as (event: { currentTarget: { open: boolean } }) => void
  onToggle({ currentTarget: { open: true } })
  hooks.cursor = 0
  return renderToStaticMarkup(ToolRecord({ tool: record }))
}

function responseButtons(node: React.ReactNode): Array<React.ReactElement<{ children?: React.ReactNode; onClick: () => void }>> {
  if (Array.isArray(node)) return node.flatMap(responseButtons)
  if (!React.isValidElement<{ children?: React.ReactNode; onClick: () => void }>(node)) return []
  return node.type === 'button' ? [node] : responseButtons(node.props.children)
}

describe('Mira ordered assistant message parts', () => {
  it('keeps authoritative text, reasoning, tool, text order instead of moving every tool above the response', () => {
    const html = renderToStaticMarkup(<AssistantMessageParts message={message} toolsById={new Map([[tool.id, tool]])} />)
    const ids = [...html.matchAll(/data-message-part-id="([^"]+)"/g)].map(match => match[1])
    expect(ids).toEqual(['before', 'thought', 'read-part', 'after'])
    expect(html.match(/data-tool-call-id="read-call"/g)).toHaveLength(1)
    expect(html).toContain('before')
    expect(html).toContain('after')
    expect(html).not.toContain('before\nafter')
  })

  it.each(['streaming', 'complete', 'interrupted'] as const)('keeps public $state reasoning collapsed with an accessible native trigger', state => {
    const html = renderToStaticMarkup(<AssistantMessageParts message={{ ...message, parts: [{ id: 'thought', type: 'reasoning', text: 'public thought <safe>', state, startedAt: 1, truncated: true }] }} toolsById={new Map()} streaming={state === 'streaming'} />)
    expect(html).toContain(`data-reasoning-state="${state}"`)
    expect(html).toContain('aria-label="展开思考过程"')
    expect(html).not.toMatch(/<details[^>]*\bopen=/)
    expect(html).not.toContain('public thought')
    expect(html).toContain('内容已截断')
    if (state === 'interrupted') expect(html).toContain('思考已中断')
  })

  it('does not substitute another run’s tool or invent a missing tool result', () => {
    const html = renderToStaticMarkup(<AssistantMessageParts message={message} toolsById={new Map([[tool.id, { ...tool, runId: 'other-run' }]])} />)
    expect(html).not.toContain('data-tool-call-id="read-call"')
    expect(html).toContain('工具记录暂不可用')
    expect(html).not.toContain('read output')
  })

  it('uses summary-only run information without repeating ordered tools or their activities', () => {
    const run: HarnessRunSummary = { status: 'failed', startedAt: 1, completedAt: 4, durationMs: 3, error: 'failed run', activities: [{ id: 'tool-activity', kind: 'tool', label: 'duplicate activity', status: 'failed', startedAt: 2 }], subtasks: [{ id: 'child', parentToolCallId: 'read-call', role: 'reviewer', task: 'review task', status: 'stopped', createdAt: 1, activities: [] }] }
    const html = renderToStaticMarkup(<RunProgressCard run={run} running={false} tools={[tool]} summaryOnly />)
    expect(html).toContain('运行失败')
    expect(html).toContain('failed run')
    expect(html).toContain('review task')
    expect(html).not.toContain('data-tool-call-id')
    expect(html).not.toContain('duplicate activity')
  })

  it('keeps usage-only summaries available even when ordered tools replace activity details', () => {
    const html = renderToStaticMarkup(<RunProgressCard run={{ status: 'completed', startedAt: 1, completedAt: 4, durationMs: 3, activities: [], usage: { total: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 5 } } }} running={false} summaryOnly />)
    expect(html).toContain('token 5')
  })
})

describe('Mira tool payload presentation', () => {
  it('mounts real escaped input/output and truncation notes only after expansion', () => {
    const record = { ...tool, input: { text: '<script>input</script>', truncated: true }, output: { text: '<img src=x onerror=alert(1)>', truncated: true }, diff: '+<safe>' }
    expect(renderToStaticMarkup(<ToolRecord tool={record} />)).not.toContain('data-tool-payload')
    hooks.slots = []
    const html = renderExpandedTool(record)
    expect(html).toContain('data-tool-payload="input"')
    expect(html).toContain('&lt;script&gt;input&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('+&lt;safe&gt;')
    expect(html).toContain('输入超过记录上限')
    expect(html).toContain('输出超过记录上限')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
  })

  it.each([
    { status: 'ok' as const, text: '当前记录未提供输出详情' },
    { status: 'failed' as const, text: '当前记录未提供错误详情' },
    { status: 'cancelled' as const, text: '工具调用已取消，未记录执行结果' },
  ])('accurately presents $status without invented output', ({ status, text }) => {
    const html = renderExpandedTool({ ...tool, status, input: undefined, output: undefined })
    expect(html).toContain(`data-tool-status="${status}"`)
    expect(html).toContain(text)
    expect(html).not.toContain('data-tool-payload="output"')
  })

  it('retains the real tool error alongside any real partial output', () => {
    const html = renderExpandedTool({ ...tool, status: 'failed', error: 'permission <denied>', output: { text: 'partial output', truncated: false } })
    expect(html).toContain('permission &lt;denied&gt;')
    expect(html).toContain('partial output')
    expect(html).toContain('role="alert"')
  })
})

describe('Mira tool-local permission placement', () => {
  const waiting = { ...tool, status: 'waiting-confirm' as const, approvalRequestId: 'approval' }

  it('anchors by explicit request/tool/run identity rather than title or timestamp', () => {
    expect(findInlinePermissionTarget([message], [waiting], request)).toEqual({ messageId: 'assistant', partId: 'read-part' })
    expect(findInlinePermissionTarget([message], [{ ...waiting, approvalRequestId: 'other-request' }], request)).toBeUndefined()
    expect(findInlinePermissionTarget([message], [{ ...waiting, runId: 'other-run' }], request)).toBeUndefined()
    expect(findInlinePermissionTarget([{ ...message, runId: 'other-run' }], [waiting], request)).toBeUndefined()
    expect(findInlinePermissionTarget([message], [waiting], { ...request, toolCallId: undefined })).toBeUndefined()
    expect(findInlinePermissionTarget([message], [tool], request)).toBeUndefined()
  })

  it('leaves legacy or absent tool parts to the single bottom fallback', () => {
    expect(findInlinePermissionTarget([{ ...message, parts: undefined }], [waiting], request)).toBeUndefined()
    expect(findInlinePermissionTarget([message], [], request)).toBeUndefined()
    const html = renderToStaticMarkup(<PermissionResponseCard request={request} responding={false} placement="fallback" onRespond={vi.fn()} />)
    expect(html).toContain('data-permission-placement="fallback"')
    expect(html.match(/aria-label="权限确认"/g)).toHaveLength(1)
  })

  it('keeps approval visible outside collapsed tool details at its authoritative part location', () => {
    const html = renderToStaticMarkup(<AssistantMessageParts message={message} toolsById={new Map([[waiting.id, waiting]])} permissionPartId="read-part" permission={{ request, responding: false, placement: 'inline', onRespond: vi.fn() }} />)
    expect(html).toContain('data-permission-placement="inline"')
    expect(html.match(/data-permission-request-id="approval"/g)).toHaveLength(1)
    expect(html.indexOf('</details><section')).toBeGreaterThan(-1)
    expect(html.indexOf('data-permission-request-id')).toBeLessThan(html.indexOf('data-message-part-id="after"'))
  })

  it('disables the same permission request while responding and retains an error with retry controls', () => {
    const onRespond = vi.fn(async () => undefined)
    const pending = PermissionResponseCard({ request, responding: true, placement: 'inline', onRespond })
    const pendingHtml = renderToStaticMarkup(pending)
    expect(pendingHtml).toContain('aria-busy="true"')
    expect(pendingHtml.match(/disabled=""/g)).toHaveLength(2)
    responseButtons(pending).forEach(button => button.props.onClick())
    expect(onRespond).not.toHaveBeenCalled()
    const failed = renderToStaticMarkup(<PermissionResponseCard request={request} responding={false} placement="inline" error="bridge unavailable" onRespond={onRespond} />)
    expect(failed).toContain('bridge unavailable')
    expect(failed).not.toContain('disabled=""')
    expect(failed).toContain('data-permission-request-id="approval"')
    const retry = PermissionResponseCard({ request, responding: false, placement: 'inline', error: 'bridge unavailable', onRespond })
    const buttons = responseButtons(retry)
    buttons[0].props.onClick()
    buttons[1].props.onClick()
    expect(onRespond.mock.calls).toEqual([['approval', false], ['approval', true]])
  })
})
