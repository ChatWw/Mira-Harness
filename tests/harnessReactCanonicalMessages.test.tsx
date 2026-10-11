// @vitest-environment happy-dom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantMessage, MiraConversationContext, UserMessage } from '../apps/harness-react/src/components/conversation/MiraConversationMessages'
import { projectTimelineRenderMessages } from '../apps/harness-react/src/components/conversation/conversation-model'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessMessage } from '../src/config/harness'
import { miraBrowserPrompt } from '../apps/harness-react/src/lib/mira-browser-reference'
import { createMiraPromptDocument } from '../apps/harness-react/src/lib/prompt-editor-document'
import { MiraConversationDetailMemory, MiraConversationDetails } from '../apps/harness-react/src/components/conversation/MiraConversationDetails'

vi.mock('../apps/harness-react/src/components/conversation/markdown', () => ({ MessageMarkdown: ({ content }: { content: string }) => <p>{content}</p> }))

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await React.act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function context() {
  const controller = new PilotController({} as PilotHost)
  const value: React.ContextType<typeof MiraConversationContext> = { controller, sessionId: 'canonical', active: true, canRerun: true, running: false, waiting: false, tools: [], toolsById: new Map(), openChangesTab: vi.fn(), openFile: vi.fn(), openRunProgress: vi.fn(), openSubtask: vi.fn(), stopSubtask: vi.fn(async () => undefined) }
  return value
}
const user = (id: string, content: string): HarnessMessage => ({ id, role: 'user', content, createdAt: 1 })
const render = async (node: React.ReactNode, value: React.ContextType<typeof MiraConversationContext>) => React.act(async () => root.render(<MiraConversationContext.Provider value={value}>{node}</MiraConversationContext.Provider>))

describe('canonical Mira message lifecycle', () => {
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

  it('keeps approval and failed tool work visible, and does not borrow attention from a different run', async () => {
    const value = processContext(), tool = value.toolsById.get('read')!
    const request = { requestId: 'approve', sessionId: 'canonical', runId: 'run', toolCallId: 'read', title: '允许读取', detail: 'README.md' }
    await render(processRow(processMessage()), { ...value, toolsById: new Map([['read', { ...tool, status: 'waiting-confirm' }]]), inlinePermission: { messageId: 'assistant-work', partId: 'read-part' }, permissionResponse: { request, responding: false, placement: 'inline', onRespond: vi.fn(async () => undefined) } })
    expect(container.querySelector('[aria-label="权限确认"]')).not.toBeNull()
    expect((container.querySelector('[aria-label="收起工作过程"]') as HTMLButtonElement).disabled).toBe(true)
    await render(processRow(processMessage()), { ...value, toolsById: new Map([['read', { ...tool, status: 'failed', error: '文件不可读' }]]) })
    expect(container.querySelector('[data-tool-status="failed"]')).not.toBeNull()
    expect(container.textContent).toContain('执行遇到错误')
    await render(processRow(processMessage()), { ...value, toolsById: new Map([['read', { ...tool, runId: 'unrelated', status: 'failed' }]]) })
    expect(container.querySelector('[data-mira-process-open="false"]')).not.toBeNull()
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
    await React.act(async () => root.render(<MiraConversationContext.Provider value={value}><UserMessage original={user('skill', content)} rendererId="skill" /></MiraConversationContext.Provider>))
    expect(container.querySelector('.mira-prompt-reference-skill')?.textContent).toBe('Research')
    expect(container.querySelector('a[href^="mira-skill:"]')).toBeNull()
    expect(container.textContent).not.toContain('mira-skill:research')
    await React.act(async () => (container.querySelector('[aria-label="编辑并重跑"]') as HTMLButtonElement).click())
    expect((container.querySelector('[aria-label="编辑消息"]') as HTMLTextAreaElement).value).toBe(content)
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
    expect(body.textContent).toBe(message.content); expect(body.style.whiteSpace).toBe('pre-line'); expect(container.querySelector('script')).toBeNull()
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
    expect((editor as HTMLTextAreaElement).value).toBe('原消息')
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
