/* Scoped read-only actor drill-down follows ZCode WorkflowActorSessionSidePane.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/.
 * Mira reads bounded persisted Pi messages through the parent-owned host contract. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Hourglass, RefreshCw } from 'lucide-react'
import type { MiraFlowActorConversationIdentity, MiraFlowActorConversationPage, MiraFlowConversationPart } from '../../../../../src/config/miraFlowWorkbench'
import type { ToolCallRecord } from '../../../../../src/config/harness'
import { AssistantMessageParts } from '../conversation/AssistantMessageParts'
import { ToolRecord } from '../conversation/run-progress'
import { MiraUserMessageBody } from '../conversation/MiraUserMessageBody'
import { renderCompletedMarkdown } from '../conversation/markdown'
import { workflowError, type MiraWorkflowHost } from './workflow-model'
import './actor-conversation.css'

function ActorPart({ part, id, result }: { part: MiraFlowConversationPart; id: string; result?: MiraFlowConversationPart }) {
  const html = useMemo(() => {
    if (part.kind !== 'text') return ''
    const document = new DOMParser().parseFromString(renderCompletedMarkdown(part.text), 'text/html')
    document.querySelectorAll('a').forEach(link => link.replaceWith(...link.childNodes))
    document.querySelectorAll('img').forEach(image => image.replaceWith(document.createTextNode(image.alt)))
    document.querySelectorAll('button').forEach(button => button.remove())
    return document.body.innerHTML
  }, [part.kind, part.text])
  const clipped = part.truncated && <small className="mira-actor-conversation__notice">此内容超过单条显示上限，已截断</small>
  if (part.kind === 'text') return <><div className="mira-actor-conversation__markdown pilot-markdown" dangerouslySetInnerHTML={{ __html: html }} />{clipped}</>
  if (part.kind === 'thinking') return <AssistantMessageParts message={{ id, role: 'assistant', content: '', createdAt: 0, parts: [{ id, type: 'reasoning', text: part.text, state: 'complete', startedAt: 0, truncated: part.truncated }] }} toolsById={new Map()} />
  if (part.kind === 'tool-call' || part.kind === 'tool-result') {
    const output = part.kind === 'tool-result' ? part : result
    if (!output) return <details className="mira-tool-record"><summary className="mira-tool-summary">调用 · {part.toolName || '工具'}<small>结果尚未读取</small></summary><div className="mira-tool-content"><pre>{part.text}</pre>{clipped}</div></details>
    let target: string | undefined
    if (part.kind === 'tool-call') { try { const input = JSON.parse(part.text); target = input.path ?? input.command ?? input.query } catch { /* A byte-limited input remains visible as recorded. */ } }
    const tool: ToolCallRecord = { id, tool: part.toolName || output.toolName || '工具', createdAt: 0, status: output.isError ? 'failed' : 'ok', target: typeof target === 'string' ? target : undefined, ...(part.kind === 'tool-call' ? { input: { text: part.text, truncated: Boolean(part.truncated) } } : {}), output: { text: output.text, truncated: Boolean(output.truncated) }, ...(output.isError ? { error: output.text } : {}) }
    return <ToolRecord tool={tool} />
  }
  return <p className="mira-actor-conversation__notice">{part.text}</p>
}

/** A persisted conversation, not an interactive child chat or a fabricated token stream. */
export function MiraWorkflowActorConversation({ host, identity, active = true, onBack }: { host: MiraWorkflowHost; identity: MiraFlowActorConversationIdentity; active?: boolean; onBack?: () => void }) {
  const key = JSON.stringify([identity.sessionId, identity.runId, identity.siteId, identity.ordinal, active])
  const [view, setView] = useState<{ key: string; page?: MiraFlowActorConversationPage; loading: boolean; error: string; previous: boolean }>({ key, loading: true, error: '', previous: false })
  const controls = useRef<{ refresh: () => void; next: () => void; previous: () => void } | undefined>(undefined)
  const current = view.key === key ? view : { key, loading: active, error: '', previous: false, page: undefined }
  useEffect(() => {
    setView({ key, loading: active, error: '', previous: false })
    if (!active) return
    let alive = true, fetching = false, dirty = false, offset = 0, page: MiraFlowActorConversationPage | undefined
    const history: number[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      if (!alive) return
      if (fetching) { dirty = true; return }
      fetching = true
      setView(previous => ({ ...previous, key, loading: true }))
      try {
        const next = await host.requestWorkflow<MiraFlowActorConversationPage>({ action: 'actors.conversation', ...identity, offset, limit: 50 })
        if (!alive) return
        page = next
        setView({ key, page: next, loading: false, error: '', previous: history.length > 0 })
      } catch (cause) {
        if (alive) setView(previous => ({ ...previous, key, loading: false, error: workflowError(cause) }))
      } finally {
        fetching = false
        if (alive && dirty) { dirty = false; void refresh() }
      }
    }
    const navigate = (next: boolean) => {
      if (fetching || !alive) return
      if (next) { if (!page?.hasMore || page.nextOffset <= offset) return; history.push(offset); offset = page.nextOffset }
      else { if (!history.length) return; offset = history.pop()! }
      page = undefined
      setView({ key, loading: true, error: '', previous: history.length > 0 })
      void refresh()
    }
    const handlers = { refresh: () => { void refresh() }, next: () => navigate(true), previous: () => navigate(false) }
    controls.current = handlers
    void refresh()
    const unsubscribe = host.onWorkflowEvent(event => {
      if (event.type !== 'workflow-event' || event.sessionId !== identity.sessionId || event.payload?.runId !== identity.runId) return
      // Only actual run events request a persisted reread; bursts share one bounded read.
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = undefined; void refresh() }, 100)
    })
    return () => { alive = false; if (timer) clearTimeout(timer); unsubscribe(); if (controls.current === handlers) controls.current = undefined }
  }, [host, key, active])
  const page = current.page
  const toolCalls = new Set(page?.messages.flatMap(message => message.parts.filter(part => part.kind === 'tool-call' && part.toolCallId).map(part => part.toolCallId!)))
  const results = new Map<string, MiraFlowConversationPart>()
  for (const message of page?.messages ?? []) for (const part of message.parts) if (part.kind === 'tool-result' && part.toolCallId) {
    const previous = results.get(part.toolCallId)
    results.set(part.toolCallId, previous ? { ...part, text: `${previous.text}\n${part.text}`, isError: previous.isError || part.isError, truncated: previous.truncated || part.truncated } : part)
  }
  const visibleMessages = page?.messages.filter(message => message.parts.length === 0 || message.parts.some(part => part.kind !== 'tool-result' || !part.toolCallId || !toolCalls.has(part.toolCallId))) ?? []
  return <section className="mira-actor-conversation" aria-label="工作流智能体对话" aria-busy={current.loading} data-actor-site={identity.siteId} data-actor-ordinal={identity.ordinal}>
    <header className="mira-actor-conversation__header">
      {onBack && <button type="button" onClick={onBack} aria-label="返回运行概览" title="返回运行概览"><ArrowLeft size={16} /></button>}
      <div><h2>{page?.actorName || '智能体对话'}</h2><small>只读运行记录</small></div>
      <button type="button" disabled={!active || current.loading} onClick={() => controls.current?.refresh()} aria-label="刷新智能体对话" title="刷新智能体对话"><RefreshCw size={15} /></button>
    </header>
    {current.error && <div className="mira-actor-conversation__error" role="alert"><p>{current.error}</p><button type="button" disabled={current.loading || !active} onClick={() => controls.current?.refresh()}>重试读取</button></div>}
    {current.loading && !page && <p role="status" className="mira-actor-conversation__notice">正在读取智能体对话…</p>}
    {page?.state === 'not-started' && <div className="mira-actor-conversation__empty"><Hourglass size={24} aria-hidden="true" /><h3>智能体尚未开始</h3><p>{page.runStatus === 'running' || page.runStatus === 'pending' ? '开始运行后，对话记录会自动出现在这里。' : '此运行没有启动这个智能体。'}</p></div>}
    {page?.state === 'available' && <>
      {!page.messages.length && <p role="status" className="mira-actor-conversation__empty">尚无已保存的消息</p>}
      <ol className="mira-actor-conversation__messages">{visibleMessages.map(message => <li key={message.index} data-message-index={message.index} data-message-role={message.role}>
        {message.role === 'user' ? <div className="mira-actor-conversation__user rounded-xl rounded-tr-xs border border-border bg-surface px-4 py-3 text-ui-base text-foreground"><MiraUserMessageBody content={message.parts.map(part => part.text).join('\n')}>{message.parts.map((part, index) => <ActorPart part={part} id={`${key}:${message.index}:${index}`} key={index} />)}</MiraUserMessageBody></div> : message.parts.filter(part => part.kind !== 'tool-result' || !part.toolCallId || !toolCalls.has(part.toolCallId)).map((part, index) => <ActorPart part={part} id={`${key}:${message.index}:${index}`} result={part.toolCallId ? results.get(part.toolCallId) : undefined} key={index} />)}
        {!message.parts.length && <p className="mira-actor-conversation__notice">此消息没有可显示的文本</p>}
        {message.truncated && <small className="mira-actor-conversation__notice">本条消息内容较长，仅显示前 {Math.floor(page.limits.messageBytes / 1024)} KiB 以内的内容。</small>}
      </li>)}</ol>
      {(page.hasMore || current.previous) && <footer className="mira-actor-conversation__pagination"><button type="button" disabled={current.loading || !current.previous} onClick={() => controls.current?.previous()}><ChevronLeft size={14} />上一页</button><span>{page.messages.length ? `${page.offset + 1}–${page.nextOffset}` : '0'} / {page.total} 条</span><button type="button" disabled={current.loading || !page.hasMore} onClick={() => controls.current?.next()}>下一页<ChevronRight size={14} /></button></footer>}
    </>}
  </section>
}
