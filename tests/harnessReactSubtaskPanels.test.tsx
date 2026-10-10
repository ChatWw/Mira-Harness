// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessSession, HarnessSubtask } from '../src/config/harness'
import { MiraSubtaskPanel } from '../apps/harness-react/src/components/workspace/MiraSubtaskPanel'
import { OverviewPanel } from '../apps/harness-react/src/components/workspace/OverviewPanel'

vi.mock('../apps/harness-react/src/components/conversation/run-progress', () => ({ ToolRecord: ({ tool }: { tool: { id: string; target: string } }) => <div data-tool-call-id={tool.id}>{tool.target}</div> }))
vi.mock('../apps/harness-react/src/components/conversation/markdown', () => ({ MessageMarkdown: ({ content }: { content: string }) => <div data-report>{content}</div> }))

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('React', React) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })

const child = (id = 'child-a', status: HarnessSubtask['status'] = 'running'): HarnessSubtask => ({ id, parentToolCallId: 'parent', role: 'reviewer', task: `真实任务 ${id}`, status, createdAt: 1, startedAt: 2, activities: [{ id: 'activity', label: `真实活动 ${id}`, status: 'completed', startedAt: 3, completedAt: 4 }] })
function session(subtask = child()): HarnessSession {
  return { version: 1, id: 'session-a', title: '测试', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false, activeRun: { id: 'run-a', startedAt: 1, activities: [], subtasks: [subtask] } }
}
function deferred() { let resolve!: () => void; let reject!: (error: Error) => void; const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
async function render(element: React.ReactNode) {
  if (!root) { const container = document.createElement('div'); document.body.append(container); root = createRoot(container) }
  await act(async () => root!.render(element))
}
const text = () => document.body.textContent || ''
type Props = React.ComponentProps<typeof MiraSubtaskPanel>
const props = (overrides: Partial<Props> = {}): Props => ({ session: session(), sessionId: 'session-a', runId: 'run-a', subtaskId: 'child-a', active: true, onStopSubtask: vi.fn(async () => undefined), onOpenFile: vi.fn(), ...overrides })

describe('real subtask DTO side panels', () => {
  it('renders saved task, activities, report, error, usage and only its real child tools', async () => {
    const task = { ...child(), report: '实际报告', files: [{ path: 'src/config.ts' }], error: { code: 'check_failed', message: '实际检查失败' }, usage: { input: 7, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 10 } }
    const source = session(task)
    source.toolCalls = [{ id: 'owned', tool: 'read', target: '实际子工具', status: 'ok', createdAt: 3, subtaskId: 'child-a' }, { id: 'other', tool: 'read', target: '其他子工具', status: 'ok', createdAt: 3, subtaskId: 'child-b' }]
    Object.assign(task, { transcript: '不能渲染的内部聊天', thinking: '不能渲染的内部推理' })
    const view = props({ session: source })
    await render(<MiraSubtaskPanel {...view} />)
    for (const value of ['真实任务 child-a', '真实活动 child-a', '实际报告', '实际检查失败', 'check_failed', '10', '7 / 3']) expect(text()).toContain(value)
    expect(document.querySelector('[data-tool-call-id="owned"]')).not.toBeNull()
    expect(text()).not.toContain('其他子工具'); expect(text()).not.toContain('不能渲染的')
    await act(async () => document.querySelector<HTMLButtonElement>('.mira-subtask-files button')!.click())
    expect(view.onOpenFile).toHaveBeenCalledExactlyOnceWith('src/config.ts')
  })

  it('shows completed children without a report honestly and offers no stop action', async () => {
    await render(<MiraSubtaskPanel {...props({ session: session(child('child-a', 'completed')) })} />)
    expect(text()).toContain('本次子任务未记录最终报告。')
    expect(document.querySelector('.mira-subtask-stop')).toBeNull()
  })

  it('refuses a different session owner or a missing child instead of showing the latest data', async () => {
    await render(<MiraSubtaskPanel {...props({ sessionId: 'session-b' })} />)
    expect(text()).toContain('智能体记录不可用'); expect(text()).not.toContain('真实任务')
    await render(<MiraSubtaskPanel {...props({ subtaskId: 'missing' })} />)
    expect(text()).toContain('智能体记录不可用')
  })

  it('disables stop while pending and reports failures only to the same visible owner', async () => {
    const request = deferred(), stop = vi.fn(() => request.promise)
    const view = props({ onStopSubtask: stop })
    await render(<MiraSubtaskPanel {...view} />)
    await act(async () => document.querySelector<HTMLButtonElement>('.mira-subtask-stop')!.click())
    expect(document.querySelector<HTMLButtonElement>('.mira-subtask-stop')!.disabled).toBe(true)
    expect(stop).toHaveBeenCalledExactlyOnceWith('child-a')
    await act(async () => request.reject(new Error('真实停止失败')))
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('真实停止失败')
    expect(document.querySelector<HTMLButtonElement>('.mira-subtask-stop')!.disabled).toBe(false)
  })

  it('discards a late stop rejection after switching child owner and allows the new child to stop', async () => {
    const request = deferred(), oldStop = vi.fn(() => request.promise)
    await render(<MiraSubtaskPanel {...props({ onStopSubtask: oldStop })} />)
    await act(async () => document.querySelector<HTMLButtonElement>('.mira-subtask-stop')!.click())
    const next = props({ session: session(child('child-b')), subtaskId: 'child-b' })
    await render(<MiraSubtaskPanel {...next} />)
    await act(async () => request.reject(new Error('上一子任务停止失败')))
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(document.querySelector<HTMLButtonElement>('.mira-subtask-stop')!.disabled).toBe(false)
    await act(async () => document.querySelector<HTMLButtonElement>('.mira-subtask-stop')!.click())
    expect(next.onStopSubtask).toHaveBeenCalledExactlyOnceWith('child-b')
  })

  it('does not publish a late stop error while the pane is inactive', async () => {
    const request = deferred(), view = props({ onStopSubtask: () => request.promise })
    await render(<MiraSubtaskPanel {...view} />)
    await act(async () => document.querySelector<HTMLButtonElement>('.mira-subtask-stop')!.click())
    await render(<MiraSubtaskPanel {...view} active={false} />)
    await act(async () => request.reject(new Error('后台停止失败')))
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(document.querySelector('.mira-subtask-stop')).toBeNull()
  })

  it('keeps overview on its captured historical run and opens the selected real child', async () => {
    const old = child('old-child', 'completed'), source = session(child('new-child'))
    source.messages = [{ id: 'old-message', role: 'assistant', content: '', runId: 'old-run', createdAt: 1, run: { status: 'completed', startedAt: 1, completedAt: 5, durationMs: 4, activities: [{ id: 'old-activity', label: '旧运行活动', status: 'completed', startedAt: 1 }], subtasks: [old] } }]
    source.toolCalls = [{ id: 'old-tool', runId: 'old-run', tool: 'read', target: '旧运行工具', status: 'ok', createdAt: 2 }, { id: 'new-tool', runId: 'run-a', tool: 'read', target: '新运行工具', status: 'ok', createdAt: 3 }]
    const open = vi.fn()
    await render(<OverviewPanel session={source} sessionId="session-a" runId="old-run" active onOpenSubtask={open} onOpenFile={vi.fn()} />)
    expect(text()).toContain('旧运行活动'); expect(text()).toContain('旧运行工具'); expect(text()).not.toContain('新运行工具'); expect(text()).not.toContain('new-child')
    await act(async () => document.querySelector<HTMLButtonElement>('[data-subtask-id="old-child"]')!.click())
    expect(open).toHaveBeenCalledExactlyOnceWith('old-run', 'old-child')
  })

  it('leaves a legacy overview unbound instead of adopting the current active run', async () => {
    await render(<OverviewPanel session={session()} sessionId="session-a" active onOpenSubtask={vi.fn()} onOpenFile={vi.fn()} />)
    expect(document.querySelector('[data-run-activity-id]')).toBeNull()
    expect(text()).toContain('打开对应运行')
  })
})
