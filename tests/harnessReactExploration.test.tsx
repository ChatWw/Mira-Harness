// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessMessage, HarnessMessagePart, HarnessRunSummary, HarnessSubtask, ToolCallRecord } from '../src/config/harness'
import { AssistantMessageParts } from '../apps/harness-react/src/components/conversation/AssistantMessageParts'
import { MiraConversationDetailMemory, MiraConversationDetails } from '../apps/harness-react/src/components/conversation/MiraConversationDetails'
import { MiraSubtaskRecord, RunProgressCard } from '../apps/harness-react/src/components/conversation/run-progress'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); document.body.replaceChildren() })

const read: ToolCallRecord = { id: 'read', tool: 'read', runId: 'run', target: 'src/a.ts', status: 'ok', createdAt: 1, output: { text: 'recorded source', truncated: false } }
const list: ToolCallRecord = { id: 'list', tool: 'list_files', runId: 'run', target: 'src', status: 'ok', createdAt: 2 }
const search: ToolCallRecord = { id: 'search', tool: 'web_search', runId: 'run', target: 'Mira', status: 'ok', createdAt: 3 }
const part = (tool: ToolCallRecord): HarnessMessagePart => ({ id: `${tool.id}-part`, type: 'tool', toolCallId: tool.id })
const message = (parts: HarnessMessagePart[]): HarnessMessage => ({ id: 'reply', role: 'assistant', runId: 'run', content: '', createdAt: 1, parts })

function html(parts: HarnessMessagePart[], tools: ToolCallRecord[], streaming = false, permissionPartId?: string) {
  return renderToStaticMarkup(<AssistantMessageParts message={message(parts)} toolsById={new Map(tools.map(tool => [tool.id, tool]))} streaming={streaming} permissionPartId={permissionPartId} />)
}

describe('Mira lightweight read and exploration interactions', () => {
  it('shows one read immediately with an explicit record action, no success badge or whole-row toggle', () => {
    const markup = html([part(read)], [read])
    expect(markup).toContain('src/a.ts')
    expect(markup).toContain('aria-label="查看读取调用记录"')
    expect(markup).not.toContain('aria-label="展开读取详情"')
    expect(markup).not.toContain('已完成')
    expect(markup).not.toContain('recorded source')
    expect(markup).not.toContain('data-tool-group-id')
  })

  it('groups consecutive read/list/search tools without eagerly mounting their large payloads', () => {
    const markup = html([part(read), part(list), part(search)], [read, list, search])
    expect(markup).toContain('data-tool-group-id="read-part"')
    expect(markup).toContain('1 次搜索、1 次目录查询、1 次读取')
    expect(markup).not.toContain('recorded source')
    expect(markup).not.toContain('data-tool-call-id')
  })

  it.each(['text', 'reasoning', 'missing', 'write', 'other-run', 'approval', 'waiting'] as const)('does not group across an authoritative %s boundary', boundary => {
    const between: HarnessMessagePart = boundary === 'text' || boundary === 'reasoning'
      ? { id: 'boundary', type: boundary, text: 'visible boundary', state: 'complete', startedAt: 2 }
      : { id: 'boundary', type: 'tool', toolCallId: 'boundary-tool' }
    const boundaryTool = boundary === 'missing' ? undefined : { ...list, id: 'boundary-tool', tool: boundary === 'write' ? 'write' : 'list_files', runId: boundary === 'other-run' ? 'other' : 'run', status: boundary === 'waiting' ? 'waiting-confirm' as const : 'ok' as const }
    const tools = [read, search, ...(boundaryTool ? [boundaryTool] : [])]
    const markup = html([part(read), between, part(search)], tools, false, boundary === 'approval' ? 'boundary' : undefined)
    expect(markup).not.toContain('data-tool-group-id')
    expect(markup).toContain('data-tool-call-id="read"')
    expect(markup).toContain('data-tool-call-id="search"')
    if (boundary === 'other-run' || boundary === 'missing') expect(markup).toContain('工具记录暂不可用')
  })

  it('keeps a streaming tail live after all currently recorded children complete, but ends that stage at following text', () => {
    const live = html([part(read), part(list)], [read, list], true)
    expect(live).toContain('data-tool-group-live="true"')
    expect(live).toContain('进行中')
    const ended = html([part(read), part(list), { id: 'answer', type: 'text', text: 'answer', state: 'streaming', startedAt: 4 }], [read, list], true)
    expect(ended).toContain('data-tool-group-live="false"')
    expect(ended).not.toContain('进行中')
    expect(ended).toContain('answer')
  })

  it('opens the current read from a collapsed live group without toggling it, skipping a missing read target', async () => {
    const current = { ...read, id: 'current', target: 'tests/a.ts' }, missing = { ...read, id: 'missing', target: undefined }
    const tools = [read, current, missing], onOpenFile = vi.fn()
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => root!.render(<MiraConversationDetails memory={new MiraConversationDetailMemory()} scope="A" directory="/workspace"><AssistantMessageParts message={message(tools.map(part))} toolsById={new Map(tools.map(tool => [tool.id, tool]))} streaming onOpenFile={onOpenFile} /></MiraConversationDetails>))
    const group = container.querySelector<HTMLElement>('[data-tool-group-id]')!
    const file = group.querySelector<HTMLButtonElement>('[aria-label="打开文件 tests/a.ts"]')!
    expect(group.textContent).toContain('tests/')
    expect(group.querySelector('[data-tool-call-id]')).toBeNull()
    await act(async () => file.click())
    expect(onOpenFile).toHaveBeenCalledExactlyOnceWith('tests/a.ts')
    expect(group.dataset.state).toBe('closed')
    await act(async () => file.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(group.dataset.state).toBe('closed')
    await act(async () => group.querySelector<HTMLElement>('[aria-label="展开查阅过程"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(group.dataset.state).toBe('open')
  })

  it('keeps failure and cancellation discoverable in a collapsed group without marking it all successful', () => {
    const markup = html([part(read), part(list)], [{ ...read, status: 'failed', error: 'actual denied' }, { ...list, status: 'cancelled' }])
    expect(markup).toContain('1 项失败')
    expect(markup).toContain('1 项已取消')
    expect(markup).not.toContain('已完成')
  })

  it('retains group identity while tools append, restores expansion after virtual unmount and isolates sessions', async () => {
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    const memory = new MiraConversationDetailMemory(), onOpenFile = vi.fn()
    const render = async (tools: ToolCallRecord[], scope = 'A', visible = true) => act(async () => root!.render(<MiraConversationDetails memory={memory} scope={scope} directory="/workspace">{visible && <AssistantMessageParts message={message(tools.map(part))} toolsById={new Map(tools.map(tool => [tool.id, tool]))} streaming onOpenFile={onOpenFile} />}</MiraConversationDetails>))
    await render([read, list])
    const group = container.querySelector<HTMLElement>('[data-tool-group-id]')!
    await act(async () => group.querySelector<HTMLButtonElement>('[aria-label="展开查阅过程"]')!.click())
    await render([read, list, search])
    expect(container.querySelector('[data-tool-group-id]')).toBe(group)
    expect(group.dataset.state).toBe('open')
    expect(group.querySelectorAll('[data-tool-call-id]')).toHaveLength(3)
    await act(async () => group.querySelector<HTMLButtonElement>('[aria-label="打开文件 src/a.ts"]')!.click())
    expect(onOpenFile).toHaveBeenCalledExactlyOnceWith('src/a.ts')
    expect(container.querySelector('[data-tool-payload]')).toBeNull()
    await act(async () => group.querySelector<HTMLButtonElement>('[aria-label="查看读取调用记录"]')!.click())
    expect(group.textContent).toContain('recorded source')
    await render([read, list, search], 'A', false); await render([read, list, search])
    expect(container.querySelector<HTMLElement>('[data-tool-group-id]')?.dataset.state).toBe('open')
    expect(container.textContent).toContain('recorded source')
    await render([read, list, search], 'B')
    expect(container.querySelector<HTMLElement>('[data-tool-group-id]')?.dataset.state).toBe('closed')
    expect(container.textContent).not.toContain('recorded source')
    await render([read, list, search])
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="收起查阅过程"]')!.click())
    await render([read, list, search], 'A', false); await render([read, list, search])
    expect(container.querySelector<HTMLElement>('[data-tool-group-id]')?.dataset.state).toBe('closed')
  })
})

describe('Mira plan and delegated tool summaries', () => {
  it('prevents duplicate stops, exposes current failures and ignores an old child rejection', async () => {
    const child: HarnessSubtask = { id: 'child-A', parentToolCallId: 'delegate-A', role: 'explorer', task: 'read the project', status: 'running', createdAt: 1, activities: [] }
    let reject!: (failure: Error) => void
    const stop = vi.fn(() => new Promise<void>((_, fail) => { reject = fail }))
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    const render = async (id = child.id) => act(async () => root!.render(<MiraSubtaskRecord subtask={{ ...child, id }} onOpen={vi.fn()} onStop={stop} />))
    await render()
    const button = container.querySelector<HTMLButtonElement>('[aria-label="停止子任务"]')!
    await act(async () => { button.click(); button.click() })
    expect(stop).toHaveBeenCalledOnce()
    expect(button.disabled).toBe(true)
    await act(async () => reject(new Error('current stop denied')))
    expect(button.disabled).toBe(false)
    await act(async () => container.querySelector<HTMLElement>('[aria-label="查看工具错误"]')!.focus())
    expect(document.querySelector('.mira-tool-failure-popover')?.textContent).toContain('current stop denied')
    await act(async () => button.click())
    const rejectOld = reject
    await render('child-B')
    await act(async () => rejectOld(new Error('old child stop denied')))
    expect(container.querySelector('[aria-label="查看工具错误"]')).toBeNull()
    expect(container.querySelector<HTMLButtonElement>('[aria-label="停止子任务"]')?.disabled).toBe(false)
  })

  it.each(['ok', 'failed', 'waiting-confirm'] as const)('only hides a successful recorded plan when real plan activities are available (%s)', status => {
    const plan: ToolCallRecord = { ...read, id: 'plan', tool: 'set_plan', status, error: status === 'failed' ? 'plan rejected' : undefined }
    const props = { message: message([part(read), part(plan), part(list)]), toolsById: new Map([read, plan, list].map(tool => [tool.id, tool])) }
    expect(renderToStaticMarkup(<AssistantMessageParts {...props} hasPlan />).includes('data-tool-call-id="plan"')).toBe(status !== 'ok')
    expect(renderToStaticMarkup(<AssistantMessageParts {...props} />)).toContain('data-tool-call-id="plan"')
    const approval = { ...plan, tool: 'present_plan', status: 'waiting-confirm' as const }
    expect(renderToStaticMarkup(<AssistantMessageParts {...props} toolsById={new Map([[approval.id, approval]])} hasPlan />)).toContain('data-tool-call-id="plan"')
    // Hiding the visual plan record does not merge tools across its authoritative boundary.
    expect(renderToStaticMarkup(<AssistantMessageParts {...props} hasPlan />)).not.toContain('data-tool-group-id')
  })

  it('opens a known child from a single parent summary, preserves actual errors and leaves an unresolved parent as its real tool', async () => {
    const delegate: ToolCallRecord = { ...read, id: 'public-delegate', tool: 'delegate_task', target: 'do work' }
    const child: HarnessSubtask = { id: 'child', parentToolCallId: delegate.id, role: 'explorer', task: 'read the project', status: 'failed', createdAt: 1, activities: [], report: 'complete child report', error: { code: 'denied', message: 'actual child failure' } }
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    const onOpenSubtask = vi.fn(), onStopSubtask = vi.fn(async () => undefined)
    const render = async (known: boolean) => act(async () => root!.render(<AssistantMessageParts message={message([part(delegate)])} toolsById={new Map([[delegate.id, delegate]])} subtaskForTool={id => known && id === delegate.id ? child : undefined} onOpenSubtask={onOpenSubtask} onStopSubtask={onStopSubtask} />))
    await render(true)
    expect(container.querySelectorAll('.mira-subtask-record')).toHaveLength(1)
    expect(container.querySelector('[data-tool-call-id]')).toBeNull()
    expect(container.textContent).not.toContain('complete child report')
    expect(container.querySelector('[aria-label="停止子任务"]')).toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="打开探索子任务活动"]')!.click())
    expect(onOpenSubtask).toHaveBeenCalledExactlyOnceWith('child')
    await act(async () => container.querySelector<HTMLElement>('[aria-label="查看工具错误"]')!.focus())
    expect(document.querySelector('.mira-tool-failure-popover')?.textContent).toContain('actual child failure')
    await render(false)
    expect(container.querySelector('[data-tool-call-id="public-delegate"]')).not.toBeNull()
    expect(container.querySelector('.mira-subtask-record')).toBeNull()
  })

  it('provides a separate run activity action while keeping the ordered message tools unduplicated', async () => {
    const run: HarnessRunSummary = { status: 'completed', startedAt: 1, completedAt: 10, durationMs: 9, activities: [] }
    const onOpenProgress = vi.fn()
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => root!.render(<RunProgressCard run={run} tools={[read]} summaryOnly running={false} onOpenProgress={onOpenProgress} />))
    const open = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('查看本轮执行过程'))!
    await act(async () => open.click())
    expect(onOpenProgress).toHaveBeenCalledOnce()
    expect(container.querySelector('details')?.open).toBe(false)
    expect(container.querySelector('[data-tool-call-id]')).toBeNull()
  })
})
