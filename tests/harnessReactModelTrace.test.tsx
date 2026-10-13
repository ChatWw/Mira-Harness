// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MiraModelCall, MiraModelTrace } from '../src/config/miraModelTrace'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import { MiraModelTracePane } from '../apps/harness-react/src/components/workspace/MiraModelTracePane'
import { miraTraceCalls, miraTraceSections, miraTraceSummary, miraTraceTextMatches } from '../apps/harness-react/src/lib/mira-model-trace'
import { createWorkspaceTraceTab, createWorkspaceSession, openWorkspaceTab, readWorkspaceSessions, withoutWorkspaceTaskOwners } from '../apps/harness-react/src/state/workspace-state'
import { miraSearchWorkspaceTabs } from '../apps/harness-react/src/lib/mira-workspace-tab-presentation'

const call: MiraModelCall = { id: 'call', sessionId: 'task-a', source: 'main', providerId: 'local', providerName: '本地模型', modelId: 'model', startedAt: 1, completedAt: 11, status: 'completed', request: { messages: [{ role: 'system', content: 'SYSTEM' }, { role: 'user', content: '寻找这里的针' }, { role: 'tool', name: 'read_file', content: 'FILE_RESULT' }], tools: [{ name: 'read_file' }], temperature: 0.5 }, response: { content: [{ type: 'thinking', thinking: '真实思考' }, { type: 'text', text: '真实回复' }, { type: 'toolCall', name: 'read_file', arguments: { path: 'a.txt' } }], usage: { input: 100, output: 20 }, stopReason: 'toolUse' } }
const data = (records = [call]): MiraModelTrace => ({ sessionId: 'task-a', records, sourceFile: '/local/model-calls/task-a.jsonl', truncated: false })
let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {}); vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('mira-model-trace__body') ? 600 : 240 }); vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(500); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
async function find(query: string) {
  await act(async () => button('搜索模型轨迹').click())
  const input = container.querySelector<HTMLInputElement>('input[aria-label="查找模型请求与响应"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return input
}

describe('Mira model trajectory resource', () => {
  it.each([
    ['İ before NEEDLE and needle', 'needle', ['NEEDLE', 'needle']],
    ['İ i\u0307', 'İ', ['İ', 'i\u0307']],
    ['🙂 A\n\tB and a  b', ' a b ', ['A\n\tB', 'a  b']],
    ['[x] a.b [x]', '[x]', ['[x]', '[x]']],
    ['aaaaa', 'aa', ['aa', 'aa']],
  ])('keeps literal non-overlapping search offsets for %s', (text, query, expected) => {
    expect(miraTraceTextMatches(text, query).map(({ start, end }) => text.slice(start, end))).toEqual(expected)
    expect(miraTraceTextMatches(text, ' \t ')).toEqual([])
  })
  it('uses real request messages, tools, thinking and SDK response metadata', () => {
    const sections = miraTraceSections(call)
    expect(sections.map(section => section.role)).toEqual(['system', 'user', 'tool-result', 'options', 'options', 'reasoning', 'assistant', 'tool-call', 'usage'])
    expect(sections.find(section => section.title === '工具调用 · read_file')?.text).toContain('a.txt')
    expect(sections.find(section => section.role === 'usage')?.text).toContain('100')
    expect(miraTraceSections({ ...call, status: 'failed', error: '连接失败', response: undefined }).at(-1)?.text).toBe('连接失败')
  })
  it('shows each main-conversation input once across sequential calls instead of repeating full history', async () => {
    const first = { ...call, request: { messages: [{ role: 'system', content: 'SYSTEM' }, { role: 'user', content: 'first input' }] }, response: { content: [{ type: 'text', text: 'first output' }] } }
    const next = { ...first, id: 'next', startedAt: 12, request: { messages: [...first.request.messages, { role: 'assistant', content: 'first output' }, { role: 'tool', content: 'new tool result' }] }, response: { content: [{ type: 'text', text: 'next output' }] } }
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data([first, next])) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    expect(container.querySelectorAll('details[data-role="system"]')).toHaveLength(0)
    expect(container.querySelectorAll('details[data-role="user"]')).toHaveLength(1)
    expect(container.querySelector('[data-trace-call="next"] details[data-role="tool-result"]')).not.toBeNull()
    expect(container.querySelector('[data-trace-call="next"]')?.textContent).toContain('next output')
  })
  it('keeps sidecar prompts independent and never hides changed, compacted or unrecorded contexts', () => {
    const main = (id: string, messages: unknown[], extra: Partial<MiraModelCall> = {}): MiraModelCall => ({ ...call, id, request: { messages }, ...extra })
    const messages = [{ role: 'system', content: 'SYSTEM' }, { role: 'user', content: 'FIRST' }]
    const records = [
      main('first', messages),
      main('title', [{ role: 'user', content: 'TITLE_PROMPT' }], { source: 'title' }),
      main('next', [...messages, { role: 'assistant', content: 'ANSWER' }, { role: 'user', content: 'SECOND' }]),
      main('changed', [{ role: 'system', content: 'CHANGED' }, { role: 'user', content: 'THIRD' }, { role: 'user', content: 'FOURTH' }, { role: 'user', content: 'FIFTH' }]),
      main('compact', [{ role: 'system', content: 'SUMMARY' }, { role: 'user', content: 'NEW' }]),
    ]
    const projected = miraTraceCalls(records)
    expect(projected.map(item => item.sections.filter(section => section.id.includes(':input:')).length)).toEqual([2, 1, 1, 4, 2])
    expect(projected[2].sections.find(section => section.id === 'next:input:3')?.text).toContain('SECOND')
    expect(miraTraceCalls(records, true)[2].sections.filter(section => section.id.includes(':input:'))).toHaveLength(4)
    const outputId = projected[2].sections.find(section => section.id.includes(':output:'))?.id
    expect(miraTraceCalls(records, true)[2].sections.some(section => section.id === outputId)).toBe(true)
    const withoutRecordedResponse = miraTraceCalls([main('pending', messages, { response: undefined }), main('after', [...messages, { role: 'assistant', content: 'UNRECORDED_ANSWER' }, { role: 'user', content: 'NEW' }])])
    expect(withoutRecordedResponse[1].sections.some(section => section.text.includes('UNRECORDED_ANSWER'))).toBe(true)
  })
  it('isolates interleaved subagents and only uses deltas when their own context is known', () => {
    const agent = (id: string, agentSessionId: string | undefined, inputs: string[]): MiraModelCall => ({ ...call, id, source: 'subagent', agentSessionId, request: { messages: inputs.map(content => ({ role: 'user', content })) } })
    const projected = miraTraceCalls([agent('a1', 'agent-a', ['A']), agent('b1', 'agent-b', ['B']), agent('a2', 'agent-a', ['A', 'A2']), agent('b2', 'agent-b', ['B', 'B2']), agent('unknown', undefined, ['A', 'A2'])])
    expect(projected.map(item => item.omittedInputs)).toEqual([0, 0, 1, 1, 0])
    expect(projected[2].sections[0].text).toContain('A2')
  })
  it('mounts only visible calls for a 200-call trace instead of all recorded requests', async () => {
    const records = Array.from({ length: 200 }, (_, index) => ({ ...call, id: 'call-' + index, startedAt: index + 1 }))
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data(records)) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    expect(container.querySelector('.mira-model-trace__toolbar')?.textContent).toContain('200 次调用')
    expect(container.querySelectorAll('[data-trace-call]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-trace-call]').length).toBeLessThan(15)
  })
  it('persists a target independent of its owner and removes references when that target is deleted', () => {
    const tab = createWorkspaceTraceTab('task-b', '另一个任务')
    const state = openWorkspaceTab(createWorkspaceSession(), tab)
    expect(readWorkspaceSessions({ 'task-a': JSON.parse(JSON.stringify(state)) })['task-a'].tabs).toEqual(state.tabs)
    expect(miraSearchWorkspaceTabs(state.tabs, '模型轨迹 task-b')).toEqual(state.tabs)
    expect(withoutWorkspaceTaskOwners({ 'task-a': state }, new Set(['task-b']))['task-a'].tabs).toEqual([])
    expect(readWorkspaceSessions({ 'task-a': { ...state, tabs: [{ ...tab, traceSessionId: 'other' }] } })['task-a'].tabs).toEqual([])
  })
  it('shows an empty state for old tasks, supports refresh failures and recovery without losing previous data', async () => {
    const read = vi.fn().mockResolvedValueOnce(data([])).mockResolvedValueOnce(data()).mockRejectedValueOnce(new Error('读取失败')).mockResolvedValueOnce(data())
    const controller = { readModelTraceFor: read } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    expect(container.textContent).toContain('旧对话不会补造轨迹')
    await act(async () => button('刷新模型轨迹').click())
    expect(container.textContent).toContain('真实回复')
    await act(async () => button('刷新模型轨迹').click())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('读取失败')
    expect(container.textContent).toContain('真实回复')
    await act(async () => button('刷新模型轨迹').click())
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(read.mock.calls.every(args => args[0] === 'task-a')).toBe(true)
  })
  it('expands the visible message categories by default and toggles everything in one click', async () => {
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data()) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    for (const role of ['user', 'reasoning', 'assistant', 'tool-call', 'tool-result']) expect(container.querySelector(`details[data-role="${role}"]`)?.hasAttribute('open')).toBe(true)
    expect(button('按内容类型展开或折叠')).not.toBeNull()
    await act(async () => button('全部折叠').click())
    expect(container.querySelector('details[open]')).toBeNull()
    expect(document.querySelector('[role="menu"]')).toBeNull()
    await act(async () => button('全部展开').click())
    expect(container.querySelector('details:not([open])')).toBeNull()
  })
  it('never exposes system or developer prompts through search, expand-all or full request mode', async () => {
    const record = { ...call, request: { messages: [{ role: 'system', content: 'HIDDEN_SYSTEM' }, { role: 'developer', content: 'HIDDEN_DEVELOPER' }, { role: 'user', content: '用户问题' }] } }
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data([record])) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    expect(container.textContent).not.toContain('HIDDEN_SYSTEM')
    expect(container.querySelector('[data-role="system"]')).toBeNull()
    await find('HIDDEN')
    expect(container.querySelector('.mira-model-trace__search [role="status"]')?.textContent).toBe('0/0')
    await act(async () => button('关闭轨迹查找').click())
    await act(async () => button('按内容类型展开或折叠').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })))
    const menu = document.querySelector('[role="menu"]')!
    expect(menu.textContent).not.toContain('系统指令')
    await act(async () => [...menu.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find(item => item.textContent?.includes('显示完整请求上下文'))!.click())
    await act(async () => button('全部折叠').click())
    await act(async () => button('全部展开').click())
    expect(container.textContent).toContain('用户问题')
    expect(container.textContent).not.toContain('HIDDEN')
    expect(container.querySelector('[data-role="system"]')).toBeNull()
    expect(record.request.messages[0].content).toBe('HIDDEN_SYSTEM')
  })

  it('summarizes only actual finite provider totals and keeps the target title', async () => {
    const records = [call, { ...call, id: 'total', response: { usage: { totalTokens: 40 } } }, { ...call, id: 'nan', modelId: 'other', response: { usage: { totalTokens: NaN } } }, { ...call, id: 'infinite', response: { usage: { totalTokens: Infinity } } }]
    expect(miraTraceSummary(records)).toEqual({ tokens: 40, models: ['model', 'other'] })
    expect(miraTraceSummary([call]).tokens).toBe(0)
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data(records)) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" title="其他任务的轨迹" active />))
    expect(container.querySelector('.mira-model-trace__toolbar > strong')?.textContent).toBe('其他任务的轨迹')
    expect(container.querySelector('.mira-model-trace__summary')?.textContent).toContain('40 tok')
  })
  it('keeps category selection open, preserves other roles and closes its portal when hidden', async () => {
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data()) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    await act(async () => button('按内容类型展开或折叠').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })))
    const menu = document.querySelector('[role="menu"]')!
    const item = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')).find(item => item.textContent === '工具结果')!
    await act(async () => item.click())
    expect(item.getAttribute('aria-checked')).toBe('false')
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    expect(container.querySelector('details[data-role="tool-result"]')?.hasAttribute('open')).toBe(false)
    expect(container.querySelector('details[data-role="tool-call"]')?.hasAttribute('open')).toBe(true)
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active={false} />))
    expect(document.querySelector('[role="menu"]')).toBeNull()
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })
  it('copies the expanded original text including whitespace without highlight or toolbar text', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const text = '  原始\nneedle\t正文  '
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data([{ ...call, request: undefined, response: { content: [{ type: 'text', text }] } }])) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    await find('needle')
    await act(async () => button('复制模型回复 · 响应').click())
    expect(write).toHaveBeenCalledExactlyOnceWith(text)
    expect(container.querySelector('.mira-model-trace__feedback[role="status"]')?.textContent).toContain('已复制')
    expect(container.querySelector('mark[data-trace-match-active="true"]')?.textContent).toBe('needle')
  })
  it('reports clipboard failure and clears stale copy feedback after hiding', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce()
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data()) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    await act(async () => button('复制模型回复 · 响应').click())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('复制失败')
    await act(async () => button('复制模型回复 · 响应').click())
    expect(write).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active={false} />))
    expect(container.textContent).not.toContain('已复制')
  })
  it('ignores a clipboard completion after switching the owning task', async () => {
    let finish!: () => void
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data()) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    await act(async () => button('复制模型回复 · 响应').click())
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-b" active />))
    await act(async () => finish())
    expect(container.textContent).not.toContain('已复制')
  })
  it('does not show a late response after hiding a pane and refreshes on return', async () => {
    let finish!: (value: MiraModelTrace) => void
    const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(data())
    const controller = { readModelTraceFor: read } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active={false} />))
    await act(async () => finish(data()))
    expect(container.textContent).not.toContain('真实回复')
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    expect(container.textContent).toContain('真实回复')
    expect(read).toHaveBeenCalledTimes(2)
  })
  it('counts and navigates every occurrence within one section, wraps and clears highlights on close', async () => {
    const record = { ...call, request: undefined, response: { content: [{ type: 'text', text: 'needle first needle second NEEDLE' }] } }
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data([record])) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    const input = await find('needle')
    expect(container.querySelector('.mira-model-trace__search [role="status"]')?.textContent).toBe('1/3')
    expect(container.querySelectorAll('mark')).toHaveLength(3)
    expect(container.querySelector('mark[data-trace-match-active="true"]')?.textContent).toBe('needle')
    await act(async () => button('下一个轨迹匹配').click())
    expect(container.querySelector('.mira-model-trace__search [role="status"]')?.textContent).toBe('2/3')
    expect(container.querySelectorAll('mark')[1]?.dataset.traceMatchActive).toBe('true')
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(container.querySelectorAll('mark')[2]?.dataset.traceMatchActive).toBe('true')
    await act(async () => button('下一个轨迹匹配').click())
    expect(container.querySelectorAll('mark')[0]?.dataset.traceMatchActive).toBe('true')
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })))
    expect(container.querySelectorAll('mark')[2]?.dataset.traceMatchActive).toBe('true')
    await act(async () => button('搜索模型轨迹').click())
    expect(container.querySelector('.mira-model-trace__search')).not.toBeNull()
    expect(input.value).toBe('needle')
    expect(document.activeElement).toBe(input)
    await act(async () => button('关闭轨迹查找').click())
    expect(container.querySelector('mark')).toBeNull()
    expect(container.querySelector('.mira-model-trace__search')).toBeNull()
  })
  it('matches whitespace across rendered lines, preserves Unicode offsets and highlights section titles', async () => {
    const record = { ...call, request: { messages: [{ role: 'system', content: 'SYSTEM' }] }, response: { content: [{ type: 'text', text: 'İ before Needle\n\tValue and NEEDLE  VALUE' }] } }
    const controller = { readModelTraceFor: vi.fn().mockResolvedValue(data([record])) } as unknown as PilotController
    await act(async () => root.render(<MiraModelTracePane controller={controller} sessionId="task-a" active />))
    await act(async () => button('全部折叠').click())
    await find('needle value')
    expect(container.querySelector('.mira-model-trace__search [role="status"]')?.textContent).toBe('1/2')
    expect(Array.from(container.querySelectorAll('pre mark'), mark => mark.textContent)).toEqual(['Needle\n\tValue', 'NEEDLE  VALUE'])
    await act(async () => button('关闭轨迹查找').click())
    await find('模型回复')
    expect(container.querySelector('summary mark')?.textContent).toBe('模型回复')
    expect(container.querySelector('summary mark')?.dataset.traceMatchActive).toBe('true')
    expect(container.querySelector('details[data-role="assistant"]')?.hasAttribute('open')).toBe(true)
    await act(async () => button('关闭轨迹查找').click())
    expect(container.querySelector('details[data-role="assistant"]')?.hasAttribute('open')).toBe(false)

  })
})
