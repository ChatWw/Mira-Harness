// @vitest-environment happy-dom
import React, { act } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessMessage, HarnessSession, ToolCallRecord } from '../src/config/harness'
import { MiraCommandPane } from '../apps/harness-react/src/components/workspace/MiraCommandPane'
import { MiraCommandOutputFile } from '../apps/harness-react/src/components/workspace/MiraCommandOutputFile'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import { MiraBackgroundTasksTrigger } from '../apps/harness-react/src/components/composer/MiraBackgroundTasksTrigger'
import { MiraAssistantProcess } from '../apps/harness-react/src/components/conversation/MiraAssistantProcess'
import { ToolRecord } from '../apps/harness-react/src/components/conversation/run-progress'
import { AssistantMessageParts } from '../apps/harness-react/src/components/conversation/AssistantMessageParts'
import { MiraConversationDetailMemory, MiraConversationDetails } from '../apps/harness-react/src/components/conversation/MiraConversationDetails'
import { miraSessionCommand } from '../apps/harness-react/src/lib/mira-command-presentation'
import { createWorkspaceCommandTab, createWorkspaceCommandOutputTab, createWorkspaceSession, openWorkspaceTab, closeWorkspaceTab, restoreWorkspaceTab, readWorkspaceSessions } from '../apps/harness-react/src/state/workspace-state'
import { miraSearchWorkspaceTabs, miraWorkspaceTabPresentation } from '../apps/harness-react/src/lib/mira-workspace-tab-presentation'

let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('React', React); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const command = (overrides: Partial<ToolCallRecord> = {}): ToolCallRecord => ({ id: 'canonical-one', runId: 'run-one', tool: 'bash', status: 'running', input: { text: JSON.stringify({ command: 'npm run build' }), truncated: false }, output: { text: 'first output', truncated: false }, createdAt: 1, ...overrides })
const session = (tools: ToolCallRecord[], id = 'task-A') => ({ id, toolCalls: tools, messages: [] }) as unknown as HarnessSession
const render = async (node: React.ReactNode) => { await act(async () => root.render(<Tooltip.Provider>{node}</Tooltip.Provider>)) }
const button = (label: string) => { const node = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); if (!node) throw new Error(`Missing ${label}`); return node }

describe('canonical command output resource', () => {
  it('offers full output only for an actual captured command and keeps inherited/historical snapshots read-only', async () => {
    const tool = command({ commandJob: { mode: 'foreground', status: 'completed', revision: 2, startedAt: 1, fullOutputAvailable: true } }), onOpen = vi.fn()
    await render(<MiraCommandPane session={session([tool])} sessionId="task-A" runId="run-one" toolId={tool.id} active onOpenFullOutput={onOpen} />)
    await act(async () => Array.from(container.querySelectorAll('button')).find(item => item.textContent === '查看完整输出')!.click())
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('run-one', tool.id)
    await render(<MiraCommandPane session={session([{ ...tool, inherited: true }])} sessionId="task-A" runId="run-one" toolId={tool.id} active onOpenFullOutput={onOpen} />)
    expect(container.textContent).not.toContain('查看完整输出')
    await render(<MiraCommandPane session={session([command()])} sessionId="task-A" runId="run-one" toolId={tool.id} active onOpenFullOutput={onOpen} />)
    expect(container.textContent).not.toContain('查看完整输出')
  })
  it('opens full output using the exact owner, virtualizes rows, refreshes, and offers no project path or editor action', async () => {
    const content = `FIRST\n${'real line\n'.repeat(10000)}LAST`
    const readCommandOutputFor = vi.fn().mockResolvedValue(content), readFileFor = vi.fn()
    const controller = { readCommandOutputFor, readFileFor } as unknown as PilotController
    await render(<MiraCommandOutputFile controller={controller} sessionId="task-A" runId="run-one" toolId="exact-tool" active />)
    expect(readCommandOutputFor).toHaveBeenCalledExactlyOnceWith('task-A', 'run-one', 'exact-tool')
    expect(readFileFor).not.toHaveBeenCalled()
    expect(container.querySelector('[aria-label="完整命令输出"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="文件源码，共 10002 行"]')).not.toBeNull()
    expect(container.querySelectorAll('.mira-file-source__row').length).toBeLessThan(100)
    expect(container.querySelector('[aria-label="将当前文件加入对话"]')).toBeNull()
    expect(container.querySelector('[aria-label="在编辑器中打开"]')).toBeNull()
    await act(async () => button('刷新文件').click())
    expect(readCommandOutputFor).toHaveBeenCalledTimes(2)
  })
  it('discards full-output responses after switching task identities and reports a missing artifact with retry', async () => {
    let oldResolve!: (text: string) => void
    const readCommandOutputFor = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { oldResolve = resolve })).mockResolvedValueOnce('fresh output').mockRejectedValueOnce(new Error('完整输出读取失败'))
    const controller = { readCommandOutputFor } as unknown as PilotController
    await render(<MiraCommandOutputFile controller={controller} sessionId="task-A" runId="run-one" toolId="exact-tool" active />)
    await render(<MiraCommandOutputFile controller={controller} sessionId="task-B" runId="run-two" toolId="other-tool" active />)
    await act(async () => oldResolve('stale output'))
    expect(container.textContent).not.toContain('stale output')
    expect(readCommandOutputFor).toHaveBeenLastCalledWith('task-B', 'run-two', 'other-tool')
    await act(async () => button('刷新文件').click())
    expect(container.textContent).toContain('完整输出读取失败')
    expect(container.textContent).toContain('重试')
  })
  it('copies complete content rather than the mounted virtual rows and hides meaningless path menu items', async () => {
    const content = `FIRST\n${'complete output\n'.repeat(10000)}LAST`, writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const controller = { readCommandOutputFor: vi.fn(async () => content) } as unknown as PilotController
    await render(<MiraCommandOutputFile controller={controller} sessionId="task-A" runId="run-one" toolId="exact-tool" active />)
    await act(async () => button('文件预览选项').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    const menu = document.querySelector('[role="menu"]')!
    expect(menu.textContent).not.toMatch(/复制相对路径|复制绝对路径/)
    const copy = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(item => item.textContent === '复制文件内容')!
    await act(async () => copy.click())
    expect(writeText).toHaveBeenCalledExactlyOnceWith(content)
    expect(content.length).toBeGreaterThan(64 * 1024)
  })
  it('persists separate full and summary tabs without carrying renderer-supplied paths or content', () => {
    const output = createWorkspaceCommandOutputTab('run-one', 'tool-one'), summary = createWorkspaceCommandTab('run-one', 'tool-one', 'cmd')
    const state = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), summary), output)
    const restored = readWorkspaceSessions({ a: { ...state, tabs: [summary, { ...output, path: '/private/injected', output: 'stale' }] } }).a
    expect(restored.tabs).toEqual([summary, output])
    expect(miraWorkspaceTabPresentation(output).type).toBe('完整命令输出')
    expect(miraSearchWorkspaceTabs(restored.tabs, '完整 run-one')).toEqual([output])
    expect(readWorkspaceSessions({ a: { ...state, tabs: [{ ...output, commandToolId: 'forged' }] } }).a.tabs).toEqual([])
  })
  it('reveals the failed background process although its launch tool and model reply succeeded', async () => {
    const tool = command({ status: 'ok', commandJob: { mode: 'background', status: 'failed', revision: 2, startedAt: 1, error: 'Command exited with code 7', output: { text: 'real failure stderr', truncated: false } } })
    const message: HarnessMessage = { id: 'reply', role: 'assistant', runId: 'run-one', content: 'Model continued', createdAt: 1, parts: [{ id: 'cmd', type: 'tool', toolCallId: tool.id }, { id: 'text', type: 'text', text: 'Model continued', state: 'complete', createdAt: 1 }] }
    const memory = new MiraConversationDetailMemory()
    await render(<MiraConversationDetails memory={memory} scope="A"><MiraAssistantProcess message={message} toolsById={new Map([[tool.id, tool]])} onOpenCommand={vi.fn()} /></MiraConversationDetails>)
    expect(container.textContent).toContain('执行遇到错误')
    expect(container.querySelector('[data-mira-process-open]')?.getAttribute('data-mira-process-open')).toBe('true')
    expect(container.querySelector('[data-tool-call-id]')?.getAttribute('data-tool-status')).toBe('failed')
    expect(container.querySelector('[aria-label="在右侧查看命令输出"]')).not.toBeNull()
  })
  it('shows real running job state after launch returns ok, and targets independent stop exactly', async () => {
    const tool = command({ status: 'ok', output: { text: 'launch already returned', truncated: false }, commandJob: { mode: 'background', status: 'running', revision: 3, startedAt: Date.now(), output: { text: 'actual live output', truncated: false } } })
    const onAction = vi.fn(async () => undefined)
    await render(<MiraCommandPane session={session([tool])} sessionId="task-A" runId="run-one" toolId={tool.id} active onAction={onAction} />)
    expect(container.textContent).toContain('后台 · 运行中')
    expect(container.textContent).toContain('actual live output')
    expect(container.textContent).not.toContain('launch already returned')
    await act(async () => button('停止这条命令').click())
    expect(onAction).toHaveBeenCalledExactlyOnceWith('task-A', 'run-one', tool.id, 'stop')
    await render(<MiraCommandPane session={session([{ ...tool, commandJob: { ...tool.commandJob!, status: 'cancelled', revision: 4 } }])} sessionId="task-A" runId="run-one" toolId={tool.id} active onAction={onAction} />)
    expect(container.textContent).toContain('后台 · 已停止')
    expect(container.textContent).toContain('actual live output')
    expect(container.querySelector('[aria-label="停止这条命令"]')).toBeNull()
  })
  it.each(['MacIntel', 'Win32'])('converts foreground with the displayed shortcut on %s and hides inherited controls', async platform => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
    const tool = command({ commandJob: { mode: 'foreground', status: 'running', revision: 1, startedAt: Date.now() } }), onAction = vi.fn(async () => undefined)
    await render(<MiraCommandPane session={session([tool])} sessionId="task-A" runId="run-one" toolId={tool.id} active onAction={onAction} />)
    expect(container.querySelector('[title^="转到后台"]')?.getAttribute('title')).toBe(platform === 'MacIntel' ? '转到后台（⌘B）' : '转到后台（Ctrl+B）')
    await act(async () => container.querySelector('.mira-command-pane')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: platform !== 'MacIntel', metaKey: platform === 'MacIntel', bubbles: true })))
    expect(onAction).toHaveBeenCalledExactlyOnceWith('task-A', 'run-one', tool.id, 'background')
    await render(<MiraCommandPane session={session([{ ...tool, inherited: true }])} sessionId="task-A" runId="run-one" toolId={tool.id} active onAction={onAction} />)
    expect(container.querySelector('.mira-command-actions')).toBeNull()
  })
  it('keeps unattended foreground commands stoppable without offering background escape', async () => {
    const tool = command({ commandJob: { mode: 'foreground', status: 'running', revision: 1, startedAt: Date.now(), backgroundAllowed: false } }), onAction = vi.fn(async () => undefined)
    await render(<MiraCommandPane session={session([tool])} sessionId="task-A" runId="run-one" toolId={tool.id} active onAction={onAction} />)
    expect(container.textContent).not.toContain('转到后台')
    await act(async () => container.querySelector('.mira-command-pane')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })))
    expect(onAction).not.toHaveBeenCalled()
    await act(async () => button('停止这条命令').click())
    expect(onAction).toHaveBeenCalledExactlyOnceWith('task-A', 'run-one', tool.id, 'stop')
  })
  it('does not convert the selected command for repeats, IME or modifier chords', async () => {
    const tool = command({ commandJob: { mode: 'foreground', status: 'running', revision: 1, startedAt: Date.now() } }), onAction = vi.fn(async () => undefined)
    await render(<MiraCommandPane session={session([tool])} sessionId="task-A" runId="run-one" toolId={tool.id} active onAction={onAction} />)
    for (const options of [{ repeat: true }, { isComposing: true }, { shiftKey: true }, { altKey: true }, { metaKey: true }]) {
      await act(async () => container.querySelector('.mira-command-pane')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, ...options })))
    }
    expect(onAction).not.toHaveBeenCalled()
  })
  it('keeps a late control rejection with its original pane owner', async () => {
    const tool = command({ commandJob: { mode: 'background', status: 'running', revision: 1, startedAt: Date.now() } })
    let reject!: (error: unknown) => void
    const onAction = vi.fn(() => new Promise<void>((_resolve, rejectRequest) => { reject = rejectRequest }))
    await render(<MiraCommandPane session={session([tool])} sessionId="task-A" runId="run-one" toolId={tool.id} active onAction={onAction} />)
    await act(async () => button('停止这条命令').click())
    expect(button('停止这条命令').disabled).toBe(true)
    const other = { ...tool, id: 'other-command' }
    await render(<MiraCommandPane session={session([other], 'task-B')} sessionId="task-B" runId="run-one" toolId={other.id} active onAction={onAction} />)
    await act(async () => reject(new Error('old owner failure')))
    expect(container.textContent).not.toContain('old owner failure')
    expect(button('停止这条命令').disabled).toBe(false)
  })
  it('counts background commands across model runs and opens their exact output', async () => {
    const tool = command({ status: 'ok', commandJob: { mode: 'background', status: 'running', revision: 1, startedAt: 1 } })
    const onOpen = vi.fn(), onOpenCommand = vi.fn()
    await render(<MiraBackgroundTasksTrigger subtasks={[]} commands={[tool, { ...tool, id: 'inherited', inherited: true }]} onOpen={onOpen} onOpenCommand={onOpenCommand} />)
    await act(async () => button('查看 1 个后台任务').click())
    expect(onOpenCommand).toHaveBeenCalledExactlyOnceWith('run-one', tool.id)
    expect(onOpen).not.toHaveBeenCalled()
    await render(<MiraBackgroundTasksTrigger subtasks={[]} commands={[{ ...tool, commandJob: { ...tool.commandJob!, status: 'completed' } }]} onOpen={onOpen} />)
    expect(container.querySelector('button')).toBeNull()
  })
  it('rejects a different session, run, tool kind and ambiguous execution instead of substituting output', () => {
    const tool = command()
    expect(miraSessionCommand(session([tool]), 'task-A', 'run-one', tool.id)).toBe(tool)
    expect(miraSessionCommand(session([tool]), 'task-B', 'run-one', tool.id)).toBeUndefined()
    expect(miraSessionCommand(session([tool]), 'task-A', 'run-other', tool.id)).toBeUndefined()
    expect(miraSessionCommand(session([command({ tool: 'read' })]), 'task-A', 'run-one', tool.id)).toBeUndefined()
    expect(miraSessionCommand(session([tool, { ...tool }]), 'task-A', 'run-one', tool.id)).toBeUndefined()
  })
  it('keeps two runs with identical command text distinct through close, reopen, serialization and search', () => {
    const first = createWorkspaceCommandTab('run-one', 'same-tool', 'npm run build')
    const next = createWorkspaceCommandTab('run-two', 'same-tool', 'npm run build')
    let state = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), first), next)
    expect(state.tabs).toHaveLength(2); expect(first.id).not.toBe(next.id)
    state = closeWorkspaceTab(state, first.id)
    state = readWorkspaceSessions(JSON.parse(JSON.stringify({ 'task-A': state })))['task-A']
    state = restoreWorkspaceTab(state, first.id)
    expect(state.tabs.find(tab => tab.id === first.id)).toMatchObject(first)
    expect(miraWorkspaceTabPresentation(first).type).toBe('命令输出')
    expect(miraSearchWorkspaceTabs(state.tabs, '命令输出 run-one').map(tab => tab.id)).toEqual([first.id])
    const poisoned = { ...first, commandToolId: 'other', output: 'copied stale payload' }
    expect(readWorkspaceSessions({ a: { ...state, tabs: [poisoned] } }).a.tabs).toEqual([])
    const restored = readWorkspaceSessions({ a: { ...state, tabs: [{ ...first, output: 'copied stale payload' }] } }).a.tabs[0]
    expect(restored).not.toHaveProperty('output')
  })
  it('offers output navigation without expanding the inline record, using the canonical execution ID', async () => {
    const tool = command(), onOpenCommand = vi.fn()
    await render(<ToolRecord tool={tool} onOpenCommand={onOpenCommand} />)
    await act(async () => button('在右侧查看命令输出').click())
    expect(onOpenCommand).toHaveBeenCalledExactlyOnceWith('run-one', 'canonical-one')
    expect(container.querySelector('[data-tool-record-toggle]')?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.mira-command-box')).toBeNull()
    await render(<ToolRecord tool={command({ runId: undefined })} onOpenCommand={onOpenCommand} />)
    expect(container.querySelector('[aria-label="在右侧查看命令输出"]')).toBeNull()
  })
  it.each(['commands', 'exploration'] as const)('passes output navigation through $0 command groups', async kind => {
    const one = command(kind === 'exploration' ? { input: { text: JSON.stringify({ command: 'cat README.md' }), truncated: false } } : {}), two = { ...one, id: 'canonical-two' }, onOpenCommand = vi.fn()
    const message: HarnessMessage = { id: 'reply', role: 'assistant', runId: 'run-one', content: '', createdAt: 1, parts: [{ id: 'one', type: 'tool', toolCallId: one.id }, { id: 'two', type: 'tool', toolCallId: two.id }] }
    const memory = new MiraConversationDetailMemory(); memory.setOpen('A', JSON.stringify([kind, 'run-one', undefined, 'one']), true)
    await render(<MiraConversationDetails memory={memory} scope="A"><AssistantMessageParts message={message} toolsById={new Map([[one.id, one], [two.id, two]])} onOpenCommand={onOpenCommand} /></MiraConversationDetails>)
    const buttons = container.querySelectorAll<HTMLButtonElement>('[aria-label="在右侧查看命令输出"]')
    expect(buttons).toHaveLength(2)
    await act(async () => buttons[1].click())
    expect(onOpenCommand).toHaveBeenCalledExactlyOnceWith('run-one', 'canonical-two')
  })
  it('keeps its captured run output while a newer run reuses the tool ID and displays a missing-record state', async () => {
    const renderPane = (value: HarnessSession) => render(<MiraCommandPane session={value} sessionId="task-A" runId="run-one" toolId="canonical-one" active />)
    await renderPane(session([command()]))
    expect(container.textContent).toContain('first output')
    await renderPane(session([command({ status: 'ok', output: { text: 'old final', truncated: true } }), command({ runId: 'run-two', output: { text: 'new execution', truncated: false } })]))
    expect(container.textContent).toContain('old final'); expect(container.textContent).not.toContain('new execution')
    expect(container.textContent).toContain('已完成'); expect(container.textContent).toContain('输出已被截断')
    await renderPane(session([command({ runId: 'run-two' })]))
    expect(container.textContent).toContain('记录已不可用'); expect(container.textContent).not.toContain('first output')
  })
  it('freezes upward-scrolled live output, resumes the latest buffer and keeps stopped output readable', async () => {
    let tool = command(), active = true
    const update = () => render(<MiraCommandPane session={session([tool])} sessionId="task-A" runId="run-one" toolId={tool.id} active={active} />)
    await update()
    const viewport = container.querySelector<HTMLElement>('[aria-label="命令输出"]')!
    let top = 400
    Object.defineProperties(viewport, { scrollHeight: { configurable: true, get: () => 500 }, clientHeight: { configurable: true, get: () => 100 }, scrollTop: { configurable: true, get: () => top, set: value => { top = Math.min(400, value) } } })
    tool = { ...tool, output: { text: 'first output\nsecond output', truncated: false } }; await update()
    await act(async () => { top = 100; viewport.dispatchEvent(new Event('scroll', { bubbles: true })) })
    expect(viewport.getAttribute('data-following')).toBe('false')
    tool = { ...tool, status: 'cancelled', output: { text: 'first output\nsecond output\nfinal partial', truncated: false } }; await update()
    expect(viewport.textContent).not.toContain('final partial')
    await act(async () => button('跟随最新命令输出').click())
    expect(viewport.textContent).toContain('final partial'); expect(viewport.getAttribute('data-following')).toBe('true')
    expect(container.textContent).toContain('已取消')
    active = false; top = 50; tool = { ...tool, output: { text: 'late snapshot', truncated: false } }; await update()
    expect(top).toBe(50)
  })
})
