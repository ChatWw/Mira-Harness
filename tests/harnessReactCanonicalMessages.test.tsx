// @vitest-environment happy-dom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantMessage, MiraConversationContext, UserMessage } from '../apps/harness-react/src/components/conversation/MiraConversationMessages'
import { miraModelChanges, projectTimelineMessages, projectTimelineRenderMessages } from '../apps/harness-react/src/components/conversation/conversation-model'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessMessage } from '../src/config/harness'
import { miraBrowserPrompt } from '../apps/harness-react/src/lib/mira-browser-reference'
import { createMiraPromptDocument } from '../apps/harness-react/src/lib/prompt-editor-document'
import { MiraConversationDetailMemory, MiraConversationDetails } from '../apps/harness-react/src/components/conversation/MiraConversationDetails'
import { serializeMiraPresentationReference, type MiraPresentationReference } from '../src/config/miraPresentation'

vi.mock('../apps/harness-react/src/components/conversation/markdown', () => ({ MessageMarkdown: ({ content }: { content: string }) => <p>{content}</p> }))

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await React.act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function context() {
  const controller = new PilotController({} as PilotHost)
  const value: React.ContextType<typeof MiraConversationContext> = { controller, sessionId: 'canonical', active: true, canRerun: true, running: false, waiting: false, tools: [], toolsById: new Map(), openChangesTab: vi.fn(), openFile: vi.fn(), openRunProgress: vi.fn(), openSubtask: vi.fn(), stopSubtask: vi.fn(async () => undefined) }
  return value
}
const user = (id: string, content: string): HarnessMessage => ({ id, role: 'user', content, createdAt: 1 })
const render = async (node: React.ReactNode, value: React.ContextType<typeof MiraConversationContext>) => React.act(async () => root.render(<MiraConversationContext.Provider value={value}>{node}</MiraConversationContext.Provider>))

describe('actual model boundaries in the transcript', () => {
  const alpha = { providerId: 'alpha', providerName: '供应商 A', modelId: 'same-name' }
  const beta = { providerId: 'beta', providerName: '供应商 B', modelId: 'same-name' }
  const reply = (id: string, model?: HarnessMessage['model']): HarnessMessage => ({ id, role: 'assistant', content: 'Reply', createdAt: 2, model })
  const changes = (messages: HarnessMessage[]) => miraModelChanges(projectTimelineRenderMessages(messages))

  it('stays silent on the first turn and on an unsent choice, then anchors a same-name provider switch before its prompt', () => {
    const first = [user('first', '开始'), reply('first-reply', alpha)]
    expect(changes(first).size).toBe(0)
    expect(changes([...first, user('next', '未发送的新选择')]).size).toBe(0)
    expect([...changes([...first, user('next', '发送'), reply('next-reply', beta)])]).toEqual([['next', { from: alpha, to: beta }]])
  })

  it('does not treat provider rename or repeated segments as switches, but records returning to an earlier model', () => {
    const messages = [user('first', '开始'), reply('first-reply', alpha), reply('renamed', { ...alpha, providerName: '改名' }), user('next', '下一轮'), reply('second', beta), reply('segment', beta), user('return', '切回'), reply('third', alpha)]
    expect([...changes(messages).keys()]).toEqual(['next', 'return'])
    expect(changes(messages).get('next')?.from.providerName).toBe('改名')
  })

  it('never infers a model for old history and excludes hidden context from boundary anchors', () => {
    expect(changes([user('first', '历史'), reply('old'), user('next', '新轮'), reply('new', beta)]).size).toBe(0)
    const messages = [user('first', '开始'), reply('known', alpha), { ...user('internal', '隐藏上下文'), internal: true }, reply('continuation', beta)]
    expect([...changes(messages).keys()]).toEqual(['continuation'])
  })

  it('hydrates current provider names without rewriting persisted identities or losing a removed provider label', () => {
    const messages = [user('first', '开始'), reply('known', alpha), user('second', '继续'), reply('new', beta)]
    const result = miraModelChanges(projectTimelineRenderMessages(messages), [{ id: 'alpha', name: '新的供应商名称' }])
    expect(result.get('second')).toEqual({ from: { ...alpha, providerName: '新的供应商名称' }, to: beta })
    expect(messages[1].model).toEqual(alpha)
  })

  it('keeps a guided run boundary at its original prompt and puts model-only continuation at the assistant', () => {
    const messages = [user('first', '开始'), reply('known', alpha), user('second', '继续'), reply('segment', beta), { ...user('guide', '指导'), delivery: 'guide' as const }, reply('guided', beta), reply('goal-next', alpha)]
    expect([...changes(messages).keys()]).toEqual(['second', 'goal-next'])
  })

  it('uses the live admitted model before the first token and keeps the marker when that reply settles', () => {
    const messages = [user('first', '开始'), reply('known', alpha), user('second', '新模型')]
    const active = { id: 'run', messageId: 'next', model: beta, startedAt: 3, activities: [], subtasks: [] }
    const live = projectTimelineMessages(messages, active, 4)
    expect(live.at(-1)?.model).toEqual(beta)
    expect([...changes(live).keys()]).toEqual(['second'])
    const final = [...messages, { ...reply('next', beta), runId: 'run' }]
    expect([...changes(final)]).toEqual([...changes(live)])
    expect(projectTimelineMessages(final, active, 5).at(-1)?.model).toEqual(beta)
    expect(messages).toHaveLength(3)
  })
})

describe('canonical Mira message lifecycle', () => {
  it('renders builtin and plugin agent references using the same labels as Composer, without inventing unknown agents', async () => {
    await render(<UserMessage original={user('agents', '请 @reviewer 和 @sample:review 核对，邮箱 foo@example.com 与 @unknown 保留原文')} rendererId="agents" />, context())
    expect([...container.querySelectorAll('.mira-prompt-reference-agent')].map(node => node.textContent)).toEqual(['审查', 'sample:review'])
    expect(container.textContent).toContain('foo@example.com 与 @unknown')
    expect(container.querySelector('.mira-prompt-reference-agent')?.getAttribute('title')).toContain('@reviewer')
  })

  it('keeps webpage contexts out of the history editor body and lets users remove them before rerun', async () => {
    const element = { pageUrl: 'https://mira.test/page', pageTitle: 'Mira page', tagName: 'button', role: 'button', accessibleName: '继续', selector: '#go', xpath: '/html/body/button', text: '继续', nearbyText: '页面正文', htmlExcerpt: '<button>继续</button>', attributes: '', style: '', rect: { x: 0, y: 0, width: 80, height: 28 } }
    const result = miraBrowserPrompt({ sessionId: 'canonical', browserId: 'browser:one', element }, createMiraPromptDocument(''))
    if ('error' in result) throw new Error(result.error)
    const value = context(), message = user('web-edit', '修改这个按钮' + result.reference.text)
    vi.spyOn(value.controller, 'getSnapshot').mockReturnValue({ ...value.controller.getSnapshot(), session: { id: 'canonical' } } as any)
    const rerun = vi.spyOn(value.controller, 'editAndRerun').mockResolvedValue(false)
    await render(<UserMessage original={message} rendererId="web-edit" />, value)
    await React.act(async () => container.querySelector<HTMLButtonElement>('[aria-label="编辑并重跑"]')!.click())
    expect(container.querySelector('[aria-label="编辑消息"]')?.textContent).toBe('修改这个按钮')
    expect(container.querySelector('[aria-label="1 个网页元素"]')).not.toBeNull()
    await React.act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '保存并重跑')!.click())
    expect(rerun).toHaveBeenLastCalledWith('web-edit', message.content.trim(), undefined, undefined, expect.any(Function))
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    await React.act(async () => container.querySelector<HTMLButtonElement>('[aria-label="移除全部网页元素上下文"]')!.click())
    await React.act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '保存并重跑')!.click())
    expect(rerun).toHaveBeenLastCalledWith('web-edit', '修改这个按钮', undefined, undefined, expect.any(Function))
    expect(message.content).toContain('网页元素快照')
  })

  it('shows presentation context as a navigable chip and preserves it during body-only edit', async () => {
    const reference: MiraPresentationReference = { version: 1, id: 'ref', sessionId: 'canonical', workspaceIdentity: 'sha256:' + 'a'.repeat(64), sourceFingerprint: 'sha256:' + 'b'.repeat(64), sourcePath: 'deck.pptx', capturedAt: 1, comment: '改标题', element: { slideIndex: 0, slidePart: 'ppt/slides/slide1.xml', nodeId: '2', nodeName: '标题', nodeType: 'shape', text: '原标题', zIndex: 0, bounds: { x: 0, y: 0, width: 100, height: 20 } } }
    const value = { ...context(), openPresentation: vi.fn() }, message = user('presentation', '改这张幻灯片' + serializeMiraPresentationReference(reference))
    vi.spyOn(value.controller, 'getSnapshot').mockReturnValue({ ...value.controller.getSnapshot(), session: { id: 'canonical' } } as any)
    const rerun = vi.spyOn(value.controller, 'editAndRerun').mockResolvedValue(false)
    await render(<UserMessage original={message} rendererId="presentation" />, value)
    expect(container.querySelector('[data-mira-selectable="user"]')?.textContent).toBe('改这张幻灯片')
    expect(container.textContent).not.toContain('sourceFingerprint')
    const body = container.querySelector('[data-mira-selectable="user"]')!
    expect(container.querySelector('.mira-message-contexts')!.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await React.act(async () => container.querySelector<HTMLButtonElement>('[aria-label="1 个演示文稿元素"]')!.click())
    await React.act(async () => document.querySelector<HTMLButtonElement>('[aria-label="定位 deck.pptx · 第 1 页"]')!.click())
    expect(value.openPresentation).toHaveBeenCalledWith(reference)
    await React.act(async () => container.querySelector<HTMLButtonElement>('[aria-label="编辑并重跑"]')!.click())
    expect(container.querySelector('[aria-label="编辑消息"]')!.textContent).toBe('改这张幻灯片')
    expect(container.textContent).toContain('1 个演示文稿元素')
    await React.act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '保存并重跑')!.click())
    expect(rerun).toHaveBeenLastCalledWith('presentation', message.content.trim(), undefined, undefined, expect.any(Function))
    await React.act(async () => container.querySelector<HTMLButtonElement>('[aria-label="移除全部演示文稿元素"]')!.click())
    await React.act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '保存并重跑')!.click())
    expect(rerun).toHaveBeenLastCalledWith('presentation', '改这张幻灯片', undefined, undefined, expect.any(Function))
  })
  it('forks only settled replies, coalesces clicks, retains the request on failure and opens the exact source', async () => {
    const reply: HarnessMessage = { id: 'reply', role: 'assistant', content: '完整结果', createdAt: 1 }
    const value = { ...context(), session: { id: 'canonical', forkSource: { sessionId: 'source', messageId: 'reply', title: '原任务' } } as any, forkConversation: vi.fn(), openForkSource: vi.fn(async () => true) }
    let reject!: (error: Error) => void
    value.forkConversation.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure }))
    const row = (message = reply, streaming = false) => <AssistantMessage original={message} rendererId={message.id} streaming={streaming} />
    await render(row(), value)
    const trigger = () => container.querySelector<HTMLButtonElement>('[aria-label="从这里分支"]')!
    await React.act(async () => { const button = trigger(); button.click(); button.click() })
    expect(value.forkConversation).toHaveBeenCalledOnce()
    const requestId = value.forkConversation.mock.calls[0][1]
    expect(container.querySelector<HTMLButtonElement>('[aria-label="正在创建分支"]')?.disabled).toBe(true)
    await React.act(async () => reject(new Error('连接失败，请重试')))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('连接失败')
    value.forkConversation.mockResolvedValueOnce(true)
    await React.act(async () => trigger().click())
    expect(value.forkConversation).toHaveBeenLastCalledWith(reply.id, requestId)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    await React.act(async () => container.querySelector<HTMLButtonElement>('.mira-fork-notice button')!.click())
    expect(value.openForkSource).toHaveBeenCalledExactlyOnceWith('source', 'reply')
    for (const blocked of [{ running: true }, { waiting: true }, { active: false }, { forkConversation: undefined }]) {
      await render(row(), { ...value, ...blocked })
      expect(trigger()).toBeNull()
    }
    await render(row({ ...reply, interrupted: true }), value); expect(trigger()).toBeNull()
    await render(row(reply, true), value); expect(trigger()).toBeNull()
  })

  const processMessage = (): HarnessMessage => ({
    id: 'assistant-work', role: 'assistant', runId: 'run', createdAt: 2, content: '先检查\n最终结果',
    parts: [
      { id: 'progress', type: 'text', text: '先检查', state: 'complete', startedAt: 1 },
      { id: 'read-part', type: 'tool', toolCallId: 'read' },
      { id: 'final', type: 'text', text: '最终结果', state: 'complete', startedAt: 2 },
    ],
    run: { startedAt: 1, completedAt: 4001, durationMs: 4000, status: 'completed', activities: [] },
  })
  const processContext = () => ({ ...context(), toolsById: new Map([['read', { id: 'read', runId: 'run', tool: 'read', target: 'README.md', status: 'ok' as const, createdAt: 1 }]]) })
  const processRow = (original: HarnessMessage, streaming = false) => <AssistantMessage original={original} rendererId="stable-work" streaming={streaming} />

  const liveMessage = (parts?: HarnessMessage['parts']): HarnessMessage => ({
    id: 'live-status', role: 'assistant', runId: 'run', content: '', createdAt: 10_000, parts,
    run: { startedAt: 10_000, completedAt: 15_000, durationMs: 5_000, activities: [] },
  })
  const advance = async (milliseconds: number) => React.act(async () => vi.advanceTimersByTimeAsync(milliseconds))

  it.each([undefined, []] as const)('shows a light live status before the first token with parts %j, based on the actual run start', async parts => {
    vi.useFakeTimers(); vi.setSystemTime(15_000)
    await render(processRow(liveMessage(parts ? [...parts] : undefined), true), { ...context(), running: true })
    const status = container.querySelector('[role="status"]')!
    expect(status).not.toBeNull()
    expect(status.textContent).toContain('工作中')
    expect(status.textContent).toContain('5 秒')
    expect(status.querySelector('.animate-spin, .pilot-spin')).toBeNull()
    expect(container.querySelector('.mira-assistant-process')).toBeNull()
    expect(container.querySelector('.mira-run-open')).toBeNull()
    expect(container.querySelectorAll('[data-assistant-message-id]')).toHaveLength(1)
    await advance(2_000)
    expect(status.textContent).toContain('7 秒')
  })

  it('keeps elapsed work visible across reasoning, tool and final-text gaps, and places the work heading before a text-only reply', async () => {
    vi.useFakeTimers(); vi.setSystemTime(15_000)
    const value = { ...processContext(), running: true }
    const reasoning: HarnessMessage['parts'] = [{ id: 'thinking', type: 'reasoning', text: '分析中', state: 'complete', startedAt: 10_000, completedAt: 11_000 }]
    await render(processRow(liveMessage(reasoning), true), value)
    expect(container.querySelector('.mira-assistant-process-heading')?.textContent).toContain('工作中')
    expect(container.querySelector('.mira-assistant-process-heading')?.textContent).toContain('5 秒')
    await advance(1_000)
    await render(processRow(liveMessage([...reasoning, { id: 'read-part', type: 'tool', toolCallId: 'read' }]), true), value)
    expect(container.querySelector('.mira-assistant-process-heading')?.textContent).toContain('6 秒')
    expect(container.querySelector('[data-tool-call-id="read"]')).not.toBeNull()
    const reply: HarnessMessage['parts'] = [{ id: 'reply', type: 'text', text: '正文已到达', state: 'streaming', startedAt: 16_000 }]
    await render(processRow({ ...liveMessage(reply), content: '正文已到达' }, true), value)
    const status = container.querySelector('[role="status"]')!
    const replyNode = container.querySelector('[data-message-part-id="reply"]')!
    expect(status.textContent).toContain('工作中')
    expect(status.textContent).toContain('6 秒')
    expect(status.compareDocumentPosition(replyNode) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(container.querySelector('.mira-assistant-process')).toBeNull()
  })

  it('keeps the completed work heading before a pure reply and formats long work like ZCode', async () => {
    const message = liveMessage([{ id: 'reply', type: 'text', text: '完成回复', state: 'complete', startedAt: 10_000 }])
    await render(processRow({ ...message, run: { ...message.run!, durationMs: 63000, status: 'completed' } }), context())
    const heading = container.querySelector('.mira-turn-status')!
    expect(heading.textContent).toBe('已工作 1 分钟 3 秒')
    expect(heading.compareDocumentPosition(container.querySelector('[data-message-part-id="reply"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('shows a single non-spinning approval status before output and resumes the current run when approval resolves', async () => {
    vi.useFakeTimers(); vi.setSystemTime(15_000)
    const message = liveMessage([]), value = { ...context(), running: true, waiting: true }
    await render(processRow(message, true), value)
    const statuses = [...container.querySelectorAll('[role="status"]')].filter(node => node.textContent?.includes('等待确认'))
    expect(statuses).toHaveLength(1)
    expect(container.textContent).not.toContain('工作中')
    expect(container.querySelector('.animate-spin, .pilot-spin')).toBeNull()
    await advance(2_000)
    await render(processRow(message, true), { ...value, waiting: false })
    expect(container.querySelector('[role="status"]')?.textContent).toContain('工作中')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('7 秒')
  })

  it('does not spin the ordered work heading while its actual tool awaits approval', async () => {
    vi.useFakeTimers(); vi.setSystemTime(15_000)
    const value = processContext(), tool = value.toolsById.get('read')!
    await render(processRow(liveMessage([{ id: 'read-part', type: 'tool', toolCallId: 'read' }]), true), { ...value, running: true, waiting: true, toolsById: new Map([['read', { ...tool, status: 'waiting-confirm' }]]) })
    expect(container.querySelector('.mira-assistant-process-heading')?.textContent).toContain('等待确认')
    expect(container.querySelector('.mira-assistant-process-heading .animate-spin')).toBeNull()
    expect(container.querySelector('[data-tool-status="waiting-confirm"]')).not.toBeNull()
    expect(container.querySelectorAll('.mira-assistant-process-heading')).toHaveLength(1)
    expect(container.querySelector('.mira-turn-status')).toBeNull()
    expect(container.querySelector('.animate-spin, .pilot-spin')).toBeNull()
  })

  it.each(['completed', 'stopped', 'failed'] as const)('stops the live timer on %s and uses the persisted duration after a later clock jump', async state => {
    vi.useFakeTimers(); vi.setSystemTime(15_000)
    const value = processContext(), message = liveMessage([{ id: 'read-part', type: 'tool', toolCallId: 'read' }])
    await render(processRow(message, true), { ...value, running: true })
    expect(container.querySelector('.mira-assistant-process-heading')?.textContent).toContain('5 秒')
    await advance(2_000)
    const settled = { ...message, run: { ...message.run!, completedAt: 16_000, durationMs: 6_000, status: state, ...(state === 'failed' ? { error: '模型失败' } : {}) }, interrupted: state === 'stopped' }
    await render(processRow(settled), value)
    expect(container.querySelector('.mira-assistant-process-heading')?.textContent).toContain('6 秒')
    expect(container.querySelector('.animate-spin, .pilot-spin')).toBeNull()
    const text = container.textContent
    const timers = vi.getTimerCount()
    await advance(20_000)
    expect(container.textContent).toBe(text)
    expect(vi.getTimerCount()).toBe(timers)
    expect(timers).toBe(0)
  })

  it.each(['stopped', 'failed'] as const)('shows an empty %s turn without an expandable process or a running spinner', async state => {
    vi.useFakeTimers(); vi.setSystemTime(15_000)
    const message = liveMessage([])
    await render(processRow({ ...message, run: { ...message.run!, status: state, ...(state === 'failed' ? { error: '请求连接失败' } : {}) }, interrupted: state === 'stopped' }), context())
    expect(container.textContent).toContain(state === 'failed' ? '执行遇到错误' : '工作已停止')
    expect(container.querySelector('.mira-assistant-process')).toBeNull()
    expect(container.querySelector('.animate-spin, .pilot-spin')).toBeNull()
    if (state === 'failed') expect(container.querySelector('[role="alert"]')?.textContent).toBe('请求连接失败')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resets elapsed time for another run at the same renderer without borrowing the old start', async () => {
    vi.useFakeTimers(); vi.setSystemTime(15_000)
    const value = { ...context(), running: true }
    await render(processRow(liveMessage([]), true), value)
    await advance(2_000)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('7 秒')
    const next = { ...liveMessage([]), id: 'next-message', runId: 'next-run', createdAt: 17_000, run: { startedAt: 17_000, completedAt: 17_000, durationMs: 0, activities: [] } }
    await render(processRow(next, true), value)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('1 秒')
    await advance(1_000)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('1 秒')
    expect(container.querySelector('[role="status"]')?.textContent).not.toContain('8 秒')
  })

  it('does not create a fictitious run or turn from an empty timeline and does not invent duration for a message without run metadata', async () => {
    vi.useFakeTimers(); vi.setSystemTime(15_000)
    expect(projectTimelineMessages([], undefined)).toEqual([])
    await render(null, context())
    expect(container.querySelector('[data-assistant-message-id]')).toBeNull()
    expect(container.querySelector('[role="status"]')).toBeNull()
    const original: HarnessMessage = { id: 'legacy-no-run', role: 'assistant', content: '', createdAt: 10_000 }
    await render(processRow(original, true), { ...context(), running: true })
    expect(original.run).toBeUndefined()
    expect(container.textContent).not.toContain('5 秒')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up the only live timer when its owner leaves and resumes from the real start after returning', async () => {
    vi.useFakeTimers(); vi.setSystemTime(15_000)
    const value = { ...context(), running: true }, message = liveMessage([])
    await render(processRow(message, true), value)
    expect(vi.getTimerCount()).toBe(1)
    await render(null, value)
    expect(vi.getTimerCount()).toBe(0)
    await advance(3_000)
    expect(container.textContent).toBe('')
    await render(processRow(message, true), value)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('8 秒')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('collapses completed work before the final reply, and keeps reply actions outside the process', async () => {
    await render(processRow(processMessage()), processContext())
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="展开工作过程"]')!
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).toContain('最终结果'); expect(container.textContent).not.toContain('先检查')
    expect(container.textContent).not.toContain('已完成 0/0'); expect(container.querySelector('.mira-run-open')).toBeNull()
    await React.act(async () => trigger.click())
    const process = container.querySelector('.mira-assistant-process-content')!
    expect(process.textContent).toContain('先检查'); expect(process.textContent).not.toContain('最终结果')
    expect(process.querySelector('[aria-label="复制回复"]')).toBeNull()
    expect(container.textContent!.indexOf('先检查')).toBeLessThan(container.textContent!.indexOf('最终结果'))
  })

  it('keeps current work visible until the run ends, then permits folding when a final reply exists', async () => {
    const value = processContext(), message = processMessage()
    await render(processRow(message, true), { ...value, running: true })
    const trigger = container.querySelector<HTMLButtonElement>('.mira-assistant-process-trigger')!
    await React.act(async () => trigger.click())
    expect(container.querySelector('[data-mira-process-open="true"]')).not.toBeNull()
    expect(container.textContent).toContain('先检查')
    expect(trigger.querySelector('svg.lucide-chevron-right')).toBeNull()
    await render(processRow(message), value)
    expect(container.querySelector('[data-mira-process-open="false"]')).not.toBeNull()
    expect(container.querySelector('.mira-assistant-process-trigger svg.lucide-chevron-right')).not.toBeNull()
  })

  it.each(['completed', 'stopped'] as const)('keeps tool-only %s work visible when there is no final reply', async status => {
    const message = processMessage()
    message.parts = message.parts!.slice(0, -1)
    message.content = '先检查'
    message.run = { ...message.run!, status }
    message.interrupted = status === 'stopped'
    await render(processRow(message), processContext())
    expect(container.querySelector('[data-mira-process-open="true"]')).not.toBeNull()
    expect(container.textContent).toContain('先检查')
    expect(container.querySelector('[data-tool-call-id="read"]')).not.toBeNull()
    expect(container.querySelector('.mira-assistant-process-trigger svg.lucide-chevron-right')).toBeNull()
    expect(container.querySelector('.animate-spin, .pilot-spin')).toBeNull()
  })

  it('keeps interrupted work visible alongside the preserved partial reply', async () => {
    const message = processMessage()
    message.run = { ...message.run!, status: 'stopped' }
    message.interrupted = true
    await render(processRow(message), processContext())
    expect(container.querySelector('[data-mira-process-open="true"]')).not.toBeNull()
    expect(container.textContent).toContain('先检查')
    expect(container.textContent).toContain('最终结果')
    expect(container.textContent).toContain('工作已停止')
    expect(container.querySelector('.mira-assistant-process-trigger svg.lucide-chevron-right')).toBeNull()
    expect(container.querySelector('.animate-spin, .pilot-spin')).toBeNull()
  })

  it('starts live work open, collapses on completion and preserves a manually reopened history across remounts', async () => {
    const memory = new MiraConversationDetailMemory(), value = processContext()
    const row = (streaming: boolean) => <MiraConversationDetails memory={memory} scope="one-session">{processRow(processMessage(), streaming)}</MiraConversationDetails>
    await render(row(true), value)
    expect(container.querySelector('[data-mira-process-open="true"]')).not.toBeNull()
    await render(row(false), value)
    expect(container.querySelector('[data-mira-process-open="false"]')).not.toBeNull()
    await React.act(async () => (container.querySelector('[aria-label="展开工作过程"]') as HTMLButtonElement).click())
    await render(null, value); await render(row(false), value)
    expect(container.querySelector('[data-mira-process-open="true"]')).not.toBeNull()
    await render(<MiraConversationDetails memory={memory} scope="another-session">{processRow(processMessage())}</MiraConversationDetails>, value)
    expect(container.querySelector('[data-mira-process-open="false"]')).not.toBeNull()
  })

  it('reveals a searched intermediate text part without expanding for final-reply matches', async () => {
    await render(processRow(processMessage()), processContext())
    const process = container.querySelector('.mira-assistant-process-layout')!
    await React.act(async () => process.dispatchEvent(new CustomEvent('mira:reveal-assistant-process', { detail: JSON.stringify(['stable-work', 'final']) })))
    expect(container.querySelector('[data-mira-process-open="false"]')).not.toBeNull()
    await React.act(async () => process.dispatchEvent(new CustomEvent('mira:reveal-assistant-process', { detail: JSON.stringify(['stable-work', 'progress']) })))
    expect(container.querySelector('[data-mira-find-target=\'["stable-work","progress"]\']')?.textContent).toBe('先检查')
  })

  it('keeps approval visible but folds a completed reply despite an intermediate tool failure', async () => {
    const value = processContext(), tool = value.toolsById.get('read')!
    const request = { requestId: 'approve', sessionId: 'canonical', runId: 'run', toolCallId: 'read', title: '允许读取', detail: 'README.md' }
    await render(processRow(processMessage()), { ...value, toolsById: new Map([['read', { ...tool, status: 'waiting-confirm' }]]), inlinePermission: { messageId: 'assistant-work', partId: 'read-part' }, permissionResponse: { request, responding: false, placement: 'inline', onRespond: vi.fn(async () => undefined) } })
    expect(container.querySelector('[aria-label="权限确认"]')).not.toBeNull()
    expect((container.querySelector('[aria-label="收起工作过程"]') as HTMLButtonElement).disabled).toBe(true)
    await render(processRow(processMessage()), { ...value, toolsById: new Map([['read', { ...tool, status: 'failed', error: '文件不可读' }]]) })
    expect(container.querySelector('[data-mira-process-open="false"]')).not.toBeNull()
    expect(container.textContent).toContain('已工作')
    expect(container.textContent).not.toContain('执行遇到错误')
    await React.act(async () => (container.querySelector('[aria-label="展开工作过程"]') as HTMLButtonElement).click())
    expect(container.querySelector('[data-tool-status="failed"]')).not.toBeNull()
    await render(null, value)
    await render(processRow(processMessage()), { ...value, toolsById: new Map([['read', { ...tool, runId: 'unrelated', status: 'failed' }]]) })
    expect(container.textContent).not.toContain('执行遇到错误')
  })

  it('renders text-only replies without a process control and keeps a run error outside any fold', async () => {
    const message = processMessage(); message.parts = message.parts!.slice(-1)
    message.run = { ...message.run!, status: 'failed', error: '模型连接失败' }
    await render(processRow(message), processContext())
    expect(container.querySelector('.mira-assistant-process')).toBeNull()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('模型连接失败')
    expect(container.textContent).toContain('最终结果')
  })

  it('returns focus from a disappearing tool control on completion, while keeping final reply focus intact', async () => {
    const value = processContext(), message = processMessage()
    await render(processRow(message, true), value)
    await React.act(async () => (container.querySelector('[aria-label="查看读取调用记录"]') as HTMLButtonElement).focus())
    await render(processRow(message), value)
    expect(document.activeElement).toBe(container.querySelector('[aria-label="展开工作过程"]'))
    await render(processRow(message, true), value)
    const reply = container.querySelector('[data-message-part-id="final"]') as HTMLDivElement
    reply.tabIndex = 0
    await React.act(async () => reply.focus())
    await render(processRow(message), value)
    expect(document.activeElement).toBe(reply)
  })
  it('shows an inert skill chip in the sent user bubble while preserving canonical copy and edit content', async () => {
    const content = 'Use [$Research](mira-skill:research) to compare'
    const value = context()
    vi.spyOn(value.controller, 'getSnapshot').mockReturnValue({ ...value.controller.getSnapshot(), session: { id: 'canonical' } } as any)
    const rerun = vi.spyOn(value.controller, 'editAndRerun').mockResolvedValue(false)
    await React.act(async () => root.render(<MiraConversationContext.Provider value={value}><UserMessage original={user('skill', content)} rendererId="skill" /></MiraConversationContext.Provider>))
    expect(container.querySelector('.mira-prompt-reference-skill')?.textContent).toBe('Research')
    expect(container.querySelector('a[href^="mira-skill:"]')).toBeNull()
    expect(container.textContent).not.toContain('mira-skill:research')
    await React.act(async () => (container.querySelector('[aria-label="编辑并重跑"]') as HTMLButtonElement).click())
    expect(container.querySelector('[aria-label="编辑消息"]')!.textContent).toBe('Use Research to compare')
    expect(container.querySelector('[data-mira-prompt-reference="skill"]')?.textContent).toBe('Research')
    await React.act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '保存并重跑')!.click())
    expect(rerun).toHaveBeenCalledExactlyOnceWith('skill', content, undefined, undefined, expect.any(Function))
  })

  it('shows sent webpage-only context as a right-aligned capsule, with details available by keyboard', async () => {
    const element = { pageUrl: 'https://mira.test/page', pageTitle: 'Mira page', tagName: 'button', role: 'button', accessibleName: '继续', selector: '#go', xpath: '/html/body/button', text: '继续', nearbyText: '页面正文', htmlExcerpt: '<button>继续</button>', attributes: '', style: '', rect: { x: 0, y: 0, width: 80, height: 28 } }
    const result = miraBrowserPrompt({ sessionId: 'canonical', browserId: 'browser:one', element }, createMiraPromptDocument(''))
    if ('error' in result) throw Error(result.error)
    const message = user('web-only', result.reference.text.trim())
    await render(<UserMessage rendererId={message.id} original={message} />, context())
    expect(container.querySelector('[data-mira-selectable="user"]')).toBeNull()
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="1 个网页元素"]')!
    await React.act(async () => { trigger.focus(); trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })) })
    const details = document.querySelector('[data-mira-browser-context-details]')
    expect(details?.textContent).toContain('继续'); expect(details?.textContent).toContain('button · role=button'); expect(details?.textContent).toContain('Mira page')
    expect(details?.getAttribute('data-align')).toBe('end')
    expect(document.querySelector('[aria-label="移除全部网页元素上下文"]')).toBeNull()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    await React.act(async () => trigger.dispatchEvent(escape))
    expect(escape.defaultPrevented).toBe(true); expect(trigger.getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(trigger)
  })

  it('renders escaped user text with line breaks and attachment-only messages without an empty bubble', async () => {
    const value = context(), message = user('text', '第一行\n<script>不可执行</script>')
    await render(<UserMessage rendererId={message.id} original={message} />, value)
    const body = container.querySelector('[data-mira-selectable="user"] p') as HTMLParagraphElement
    expect(body.textContent).toBe(message.content); expect(body.closest('.mira-user-body__text')).not.toBeNull(); expect(container.querySelector('script')).toBeNull()
    const attachment = { ...user('file', ''), attachments: [{ path: 'README.md', name: 'README.md' }] }
    await render(<UserMessage rendererId={attachment.id} original={attachment} />, value)
    expect(container.querySelector('[data-mira-selectable="user"]')).toBeNull()
    const button = container.querySelector('[aria-label="预览附件 README.md"]') as HTMLButtonElement
    expect(button.disabled).toBe(false); await React.act(async () => button.click()); expect(value.openFile).toHaveBeenCalledWith('README.md')
  })

  it('retains an active user editor through canonical history reorder and resets it for another session owner', async () => {
    const value = context(), first = user('first', '原消息'), second = user('second', '第二条')
    const messages = (items: HarnessMessage[]) => items.map(original => <UserMessage key={original.id} rendererId={original.id} original={original} />)
    await render(messages([first, second]), value)
    await React.act(async () => (container.querySelector('[data-user-message-id="first"] [aria-label="编辑并重跑"]') as HTMLButtonElement).click())
    const editor = container.querySelector('[aria-label="编辑消息"]')
    expect(editor).not.toBeNull()
    await render(messages([second, { ...first, content: '服务端更新' }]), value)
    expect(container.querySelector('[aria-label="编辑消息"]')).toBe(editor)
    expect(editor!.textContent).toBe('原消息')
    await render(messages([second, first]), { ...value, sessionId: 'another-owner' })
    expect(container.querySelector('[aria-label="编辑消息"]')).toBeNull()
  })

  it('preserves the reply DOM across stream-to-persisted identity and exposes actions only after completion', async () => {
    const value = context(), streamed: HarnessMessage = { id: 'stream-run', runId: 'run', role: 'assistant', content: '部分回复', createdAt: 2 }
    const row = (original: HarnessMessage, streaming: boolean) => { const projected = projectTimelineRenderMessages([original], value.sessionId)[0]; return <AssistantMessage key={projected.rendererId} {...projected} streaming={streaming} /> }
    await render(row(streamed, true), { ...value, running: true })
    const originalNode = container.querySelector('[data-assistant-message-id="stream-run"]')
    expect(originalNode).not.toBeNull(); expect(container.querySelector('[aria-label="复制回复"]')).toBeNull()
    const completed = { ...streamed, id: 'persisted', content: '完整回复', interrupted: true }
    await render(row(completed, false), { ...value, latestAssistantId: completed.id })
    expect(container.querySelector('[data-assistant-message-id="persisted"]')).toBe(originalNode)
    expect(originalNode?.textContent).toContain('完整回复'); expect(originalNode?.textContent).toContain('回复已停止')
    expect(container.querySelector('[aria-label="复制回复"]')).not.toBeNull(); expect(container.querySelector('[aria-label="重新生成最新回复"]')).not.toBeNull()
  })
})
