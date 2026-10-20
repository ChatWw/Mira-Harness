// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraWorkflowActorConversation } from '../apps/harness-react/src/components/workflows/MiraWorkflowActorConversation'
import type { MiraWorkflowHost } from '../apps/harness-react/src/components/workflows/workflow-model'
import type { MiraFlowActorConversationPage, MiraFlowWorkbenchRequest } from '../src/config/miraFlowWorkbench'
import type { HarnessEvent } from '../src/config/harness'
const identity = { sessionId: 'parent', runId: 'run', siteId: 'agent#1', ordinal: 1 }
let root: Root | undefined
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.useRealTimers() })
async function mount(element: React.ReactNode) {
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
  await act(async () => root!.render(element))
  return async (next: React.ReactNode) => { await act(async () => root!.render(next)) }
}
async function click(label: string) { const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === label || item.textContent?.trim() === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()) }
function page(text = '真实回复', offset = 0, total = 1): MiraFlowActorConversationPage {
  return { state: 'available', actorName: '核验助手', runStatus: 'completed', messages: [{ index: offset, role: 'assistant', parts: [{ kind: 'text', text }] }], offset, nextOffset: offset + 1, total, hasMore: offset + 1 < total, limits: { pageBytes: 256 * 1024, messageBytes: 32 * 1024, messages: 100 } }
}
function fixture(handler: (request: MiraFlowWorkbenchRequest) => unknown) {
  const listeners = new Set<(event: HarnessEvent) => void>()
  const request = vi.fn(async (value: MiraFlowWorkbenchRequest) => handler(value))
  const host: MiraWorkflowHost = { requestWorkflow: request as MiraWorkflowHost['requestWorkflow'], onWorkflowEvent: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  const emit = (sessionId = 'parent', runId = 'run') => listeners.forEach(listener => listener({ type: 'workflow-event', sessionId, payload: { runId } } as HarnessEvent))
  return { host, request, emit, listeners }
}
describe('scoped workflow actor read-only conversation', () => {
  it('renders real roles, Markdown, thinking and tools with no Composer or external resource navigation', async () => {
    const result = page('# Actual answer\n[unsafe](https://example.com)\n![pixel](https://example.com/x.png)\n<script>bad()</script>')
    result.messages.unshift({ index: -1, role: 'user', parts: [{ kind: 'text', text: '真实任务请求' }] })
    result.messages[1]!.parts.push({ kind: 'thinking', text: '真实思考' }, { kind: 'tool-call', text: '{"path":"README.md"}', toolName: 'read', toolCallId: 'read-1' })
    result.messages.push({ index: 2, role: 'toolResult', parts: [{ kind: 'tool-result', toolName: 'read', toolCallId: 'read-1', text: '实际文件结果', isError: true }, { kind: 'tool-result', toolName: 'read', toolCallId: 'read-1', text: '结果第二段' }] })
    const view = fixture(() => result), back = vi.fn()
    await mount(<MiraWorkflowActorConversation host={view.host} identity={identity} onBack={back} />)
    expect(document.querySelector('h1')?.textContent).toBe('Actual answer')
    expect(document.querySelector('.mira-reasoning')).not.toBeNull()
    expect(document.querySelectorAll('.mira-tool-record')).toHaveLength(1)
    expect(document.querySelectorAll('[data-message-role=toolResult]')).toHaveLength(0)
    await click('查看读取调用记录')
    expect(document.body.textContent).toContain('真实任务请求')
    expect(document.querySelector('[data-tool-payload=output] pre')?.textContent).toBe('实际文件结果\n结果第二段')
    expect(document.querySelector('.mira-actor-conversation a, .mira-actor-conversation img[src^="http"], .mira-actor-conversation script, textarea')).toBeNull()
    expect(view.request).toHaveBeenCalledWith({ action: 'actors.conversation', ...identity, offset: 0, limit: 50 })
    await click('返回运行概览'); expect(back).toHaveBeenCalledOnce()
  })
  it('turns not-started into actual records on own run events and ignores foreign run/session events', async () => {
    vi.useFakeTimers()
    let started = false
    const view = fixture(() => started ? page() : { ...page(), state: 'not-started', messages: [], total: 0, nextOffset: 0 })
    await mount(<MiraWorkflowActorConversation host={view.host} identity={identity} />)
    expect(document.body.textContent).toContain('智能体尚未开始')
    started = true
    await act(async () => { view.emit('foreign'); view.emit('parent', 'foreign'); await vi.advanceTimersByTimeAsync(150) })
    expect(view.request).toHaveBeenCalledOnce()
    await act(async () => { view.emit(); view.emit(); view.emit(); await vi.advanceTimersByTimeAsync(150) })
    expect(view.request).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('真实回复')
  })
  it('does not let an old pending actor, inactive view or old error replace the current selection', async () => {
    let resolve!: (value: MiraFlowActorConversationPage) => void, reject!: (cause: Error) => void
    const old = new Promise<MiraFlowActorConversationPage>(done => { resolve = done }), failed = new Promise<MiraFlowActorConversationPage>((_, fail) => { reject = fail })
    const view = fixture(request => request.action === 'actors.conversation' && request.siteId === 'agent#1' ? old : request.action === 'actors.conversation' && request.siteId === 'agent#3' ? failed : page('CURRENT-ACTOR'))
    const render = await mount(<MiraWorkflowActorConversation host={view.host} identity={identity} />)
    await render(<MiraWorkflowActorConversation host={view.host} identity={{ ...identity, siteId: 'agent#2' }} />)
    await act(async () => resolve(page('OLD-ACTOR')))
    expect(document.body.textContent).toContain('CURRENT-ACTOR'); expect(document.body.textContent).not.toContain('OLD-ACTOR')
    await render(<MiraWorkflowActorConversation host={view.host} identity={{ ...identity, siteId: 'agent#3' }} />)
    await render(<MiraWorkflowActorConversation host={view.host} identity={{ ...identity, siteId: 'agent#2' }} active={false} />)
    await act(async () => reject(new Error('OLD-ERROR')))
    expect(document.body.textContent).not.toContain('OLD-ERROR'); expect(document.body.textContent).not.toContain('CURRENT-ACTOR')
    expect(view.listeners.size).toBe(0)
  })
  it('follows byte-limited server cursors forward and back, with actionable retry that preserves the current page', async () => {
    let fail = true
    const view = fixture(request => {
      if (request.action !== 'actors.conversation') throw new Error('wrong action')
      if (fail) { fail = false; throw new Error('读取失败，请重试') }
      return page(`MESSAGE-${request.offset}`, request.offset, 3)
    })
    await mount(<MiraWorkflowActorConversation host={view.host} identity={identity} />)
    expect(document.querySelector('[role=alert]')?.textContent).toContain('读取失败')
    await click('重试读取'); expect(document.body.textContent).toContain('MESSAGE-0')
    await click('下一页'); expect(document.body.textContent).toContain('MESSAGE-1'); expect(document.body.textContent).not.toContain('MESSAGE-0')
    await click('下一页'); expect(document.body.textContent).toContain('MESSAGE-2')
    expect([...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '下一页')?.disabled).toBe(true)
    await click('上一页'); expect(document.body.textContent).toContain('MESSAGE-1')
    expect(view.request.mock.calls.map(([request]) => request.action === 'actors.conversation' ? request.offset : undefined)).toEqual([0, 0, 1, 2, 1])
  })
})
