// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessMessagePart, HarnessSession, HarnessSubtask } from '../src/config/harness'
import { MiraSubtaskPanel } from '../apps/harness-react/src/components/workspace/MiraSubtaskPanel'

vi.mock('../apps/harness-react/src/components/conversation/run-progress', () => ({ ToolRecord: ({ tool }: { tool: { id: string; target: string } }) => <div data-tool-call-id={tool.id}>{tool.target}</div> }))
vi.mock('../apps/harness-react/src/components/conversation/markdown', () => ({ MessageMarkdown: ({ content }: { content: string }) => <div className="message-markdown">{content}</div> }))

let root: Root | undefined, sequence = 0, frameId = 0
const frames = new Map<number, FrameRequestCallback>(), resized = new Set<() => void>()
const metrics = { height: 2800 }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('React', React)
  frames.clear(); resized.clear(); metrics.height = 2800
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++frameId; frames.set(id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) {}
    observe() { resized.add(this.callback) }
    disconnect() { resized.delete(this.callback) }
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-subtask-viewport') ? 600 : 0 })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-subtask-viewport') ? metrics.height : 0 })
})
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const textPart = (id: string, text: string): HarnessMessagePart => ({ id, type: 'text', text, state: 'complete', startedAt: 1, completedAt: 2 })
function source(runId = 'run-a', parts: HarnessMessagePart[] = [textPart('intro', '先核对文件。'), { id: 'reason', type: 'reasoning', text: '公开思考内容', state: 'complete', startedAt: 1, completedAt: 2 }, { id: 'call', type: 'tool', toolCallId: 'owned' }, textPart('final', '实际最终回复')]): HarnessSession {
  const child: HarnessSubtask = { id: 'child', parentToolCallId: 'delegate', role: 'reviewer', task: '核对真实实现', status: 'completed', createdAt: 1, startedAt: 2, completedAt: 3, activities: [{ id: 'read', label: '核对文件', kind: 'tool', status: 'completed', startedAt: 2, completedAt: 3 }], parts, report: '实际最终回复' }
  return { version: 1, id: 'session', title: '任务', permissionMode: 'default', messages: [], toolCalls: [{ id: 'owned', runId, subtaskId: 'child', tool: 'custom', target: '实际工具结果', status: 'ok', createdAt: 2 }, { id: 'other', runId, subtaskId: 'other-child', tool: 'custom', target: '其他子工具', status: 'ok', createdAt: 2 }, { id: 'parent', runId, tool: 'custom', target: '父工具', status: 'ok', createdAt: 2 }], createdAt: 1, updatedAt: 3, status: 'active', pinned: false, activeRun: { id: runId, startedAt: 1, activities: [], subtasks: [child] } }
}
async function render(session: HarnessSession, active = true, stop = vi.fn(async () => undefined)) {
  if (!root) { const container = document.createElement('div'); document.body.append(container); root = createRoot(container) }
  await act(async () => root!.render(<MiraSubtaskPanel session={session} sessionId={session.id} runId={session.activeRun!.id} subtaskId="child" active={active} directory="/project" onStopSubtask={stop} onOpenFile={vi.fn()} />))
  for (let iteration = 0; frames.size && iteration < 8; iteration++) await act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) })
  expect(frames.size).toBe(0)
}
async function toggle(element: HTMLDetailsElement, open: boolean) { await act(async () => { element.open = open; element.dispatchEvent(new Event('toggle')) }) }
const viewport = () => document.querySelector<HTMLDivElement>('.mira-subtask-viewport')!

describe('public child conversation in its own pane', () => {
  it('keeps actual text/reasoning/tool order, excludes other owners and does not duplicate the final report', async () => {
    const session = source(); session.id += ++sequence
    Object.assign(session.activeRun!.subtasks[0], { transcript: '私有提示不可显示', thinking: '内部签名不可显示' })
    await render(session)
    expect([...document.querySelectorAll('[data-message-part-id]')].map(node => node.getAttribute('data-message-part-id'))).toEqual(['intro', 'reason', 'call', 'final'])
    expect(document.querySelector('[data-tool-call-id="owned"]')?.textContent).toBe('实际工具结果')
    expect(document.body.textContent).not.toContain('其他子工具'); expect(document.body.textContent).not.toContain('父工具'); expect(document.body.textContent).not.toContain('不可显示')
    expect([...document.querySelectorAll('.message-markdown')].filter(node => node.textContent === '实际最终回复')).toHaveLength(1)
    expect(document.querySelector('textarea, [contenteditable="true"]')).toBeNull()
    expect(document.querySelector('[data-subtask-run-id]')?.getAttribute('data-subtask-run-id')).toBe('run-a')
    await toggle(document.querySelector('details.mira-reasoning')!, true)
    expect(document.body.textContent).toContain('公开思考内容')
  })

  it('retains disclosure only for the exact session/run/child and puts metadata in the summary', async () => {
    const a = source(); a.id += ++sequence
    await render(a)
    expect(document.querySelector('.mira-subtask-metadata')).toBeNull()
    await toggle(document.querySelector('.mira-subtask-summary')!, true)
    await toggle(document.querySelector('.mira-reasoning')!, true)
    expect(document.querySelector('.mira-subtask-metadata')?.textContent).toContain('创建时间')
    const b = source('run-b'); b.id = a.id
    await render(b)
    expect(document.querySelector<HTMLDetailsElement>('.mira-subtask-summary')!.open).toBe(false)
    expect(document.querySelector<HTMLDetailsElement>('.mira-reasoning')!.open).toBe(false)
    await render(a)
    expect(document.querySelector<HTMLDetailsElement>('.mira-subtask-summary')!.open).toBe(true)
    expect(document.querySelector<HTMLDetailsElement>('.mira-reasoning')!.open).toBe(true)
  })

  it('preserves independent reading on growth and reopen, resumes on demand, and never scrolls the parent', async () => {
    const a = source(); a.id += ++sequence
    const parent = document.createElement('div'); parent.scrollTop = 147; document.body.append(parent)
    await render(a)
    expect(viewport().scrollTop).toBe(2200)
    await act(async () => { viewport().dispatchEvent(new WheelEvent('wheel', { deltaY: -200 })); viewport().scrollTop = 900; viewport().dispatchEvent(new Event('scroll')) })
    metrics.height = 3200
    await act(async () => resized.forEach(callback => callback()))
    expect(viewport().scrollTop).toBe(900)
    const b = source('run-b'); b.id = a.id
    await render(b)
    expect(viewport().scrollTop).toBe(2600)
    await render(a)
    expect(viewport().scrollTop).toBe(900)
    expect(document.querySelector('.mira-subtask-scroll-latest')).not.toBeNull()
    await act(async () => document.querySelector<HTMLButtonElement>('.mira-subtask-scroll-latest')!.click())
    expect(viewport().scrollTop).toBe(2600)
    expect(document.querySelector('.mira-subtask-scroll-latest')).toBeNull()
    expect(parent.scrollTop).toBe(147)
  })

  it('distinguishes new waiting/empty/stopped conversations and an honest legacy report fallback', async () => {
    const session = source('run-empty', []); session.id += ++sequence
    const child = session.activeRun!.subtasks[0]; child.status = 'running'; child.report = undefined
    await render(session)
    expect(document.body.textContent).toContain('正在等待智能体回复')
    child.status = 'stopped'
    await render(session)
    expect(document.body.textContent).toContain('本次子任务未记录对话正文')
    expect(document.querySelector('.mira-reply-interrupted')?.textContent).toBe('已停止')
    expect(document.querySelector('.mira-subtask-stop')).toBeNull()
    child.report = '实际旧格式报告'
    await render(session)
    expect(document.body.textContent).toContain('实际旧格式报告')
  })

  it('submits one stop request for rapid clicks and keeps a new child free of a late failure', async () => {
    const session = source(); session.id += ++sequence; session.activeRun!.subtasks[0].status = 'running'
    let reject!: (error: Error) => void
    const stop = vi.fn(() => new Promise<void>((_, fail) => { reject = fail }))
    await render(session, true, stop)
    await act(async () => { const button = document.querySelector<HTMLButtonElement>('.mira-subtask-stop')!; button.click(); button.click() })
    expect(stop).toHaveBeenCalledTimes(1)
    const other = source('run-other'); other.id = session.id
    await render(other)
    await act(async () => reject(new Error('旧子任务失败')))
    expect(document.body.textContent).not.toContain('旧子任务失败')
  })

  it('does not restore a stale stop error when navigating away and back to the same child', async () => {
    const a = source(); a.id += ++sequence; a.activeRun!.subtasks[0].status = 'running'
    let reject!: (error: Error) => void
    const previous = vi.fn(() => new Promise<void>((_, fail) => { reject = fail }))
    await render(a, true, previous)
    await act(async () => document.querySelector<HTMLButtonElement>('.mira-subtask-stop')!.click())
    const b = source('run-b'); b.id = a.id
    await render(b)
    const current = vi.fn(async () => undefined)
    await render(a, true, current)
    await act(async () => reject(new Error('离开前的失败')))
    expect(document.body.textContent).not.toContain('离开前的失败')
    await act(async () => document.querySelector<HTMLButtonElement>('.mira-subtask-stop')!.click())
    expect(current).toHaveBeenCalledTimes(1)
  })
})
