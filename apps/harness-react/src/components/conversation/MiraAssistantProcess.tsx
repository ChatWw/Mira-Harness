// Adapted from ZCode ConversationTurnGroup (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Uses Mira's ordered public message parts.
import * as Collapsible from '@radix-ui/react-collapsible'
import { ArrowUpRight, ChevronRight, CircleAlert, LoaderCircle } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import { MIRA_REVEAL_PROCESS, miraAssistantProcess } from '../../lib/mira-assistant-process'
import { taskFindTargetKey } from '../../lib/conversation-find'
import { AssistantMessageParts } from './AssistantMessageParts'
import { useMiraConversationDetail } from './MiraConversationDetails'

export function MiraAssistantProcess(props: ComponentProps<typeof AssistantMessageParts> & { onOpenProgress?: () => void; waitingForApproval?: boolean }) {
  const { message, streaming = false, permission, toolsById, rendererId = message.id } = props
  const { work, reply, waiting, needsAttention } = miraAssistantProcess(message, toolsById)
  const [savedOpen, saveOpen] = useMiraConversationDetail(JSON.stringify(['process', rendererId]))
  const mustShow = Boolean(streaming || !reply.length || permission || needsAttention || message.interrupted || message.run?.status === 'failed' || message.run?.status === 'stopped')
  const open = mustShow || savedOpen
  const container = useRef<HTMLDivElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const focused = useRef(false)
  const setOpen = (next: boolean) => { if (!mustShow) saveOpen(next) }
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const reveal = (event: Event) => {
      const key = (event as CustomEvent<string>).detail
      if (work.some(part => part.type === 'text' && taskFindTargetKey(rendererId, part.id) === key)) setOpen(true)
    }
    element.addEventListener(MIRA_REVEAL_PROCESS, reveal)
    return () => element.removeEventListener(MIRA_REVEAL_PROCESS, reveal)
  })
  // Completion can remove a focused tool control; keep keyboard focus in the turn.
  useLayoutEffect(() => {
    if (!open && focused.current && (document.activeElement === document.body || trigger.current?.closest('.mira-assistant-process')?.contains(document.activeElement))) trigger.current?.focus()
  }, [open])
  const [, tick] = useState(0)
  const startedAt = message.run?.startedAt
  useEffect(() => {
    if (!streaming || startedAt === undefined) return
    const timer = window.setInterval(() => tick(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [streaming, startedAt, rendererId])
  const seconds = message.run ? Math.max(0, Math.round((streaming ? Date.now() - message.run.startedAt : message.run.durationMs) / 1000)) : undefined
  const approval = Boolean(permission || waiting || (streaming && props.waitingForApproval))
  const label = approval ? '等待确认'
    : streaming ? '正在处理'
      : needsAttention || message.run?.status === 'failed' ? '执行遇到错误'
        : message.interrupted || message.run?.status === 'stopped' ? '工作已停止' : '工作过程'
  const elapsed = seconds !== undefined && <small className="mira-run-elapsed" aria-hidden={streaming || undefined}>· {seconds}s</small>
  return <div ref={container} className="mira-assistant-process-layout">
    {work.length > 0 && <Collapsible.Root className="mira-assistant-process" open={open} onOpenChange={setOpen} data-mira-process-open={open} onFocusCapture={() => { focused.current = true }} onBlurCapture={event => { const element = event.currentTarget; queueMicrotask(() => { focused.current = element.contains(document.activeElement) }) }}>
      <div className="mira-assistant-process-heading"><Collapsible.Trigger asChild><button ref={trigger} type="button" className="mira-assistant-process-trigger" disabled={mustShow} aria-label={`${open ? '收起' : '展开'}工作过程`}>
        {approval || (!streaming && (needsAttention || message.run?.status === 'failed')) ? <CircleAlert size={14} aria-hidden="true" /> : streaming ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : null}
        <span role={streaming ? 'status' : undefined}>{label}</span>{elapsed}
        {!mustShow && <ChevronRight size={14} className="mira-process-chevron" aria-hidden="true" />}
      </button></Collapsible.Trigger>{props.onOpenProgress && <button type="button" className="mira-message-action" aria-label="查看本轮执行详情" title="查看本轮执行详情" onClick={props.onOpenProgress}><ArrowUpRight size={14} aria-hidden="true" /></button>}</div>
      {open && <Collapsible.Content className="mira-assistant-process-content"><AssistantMessageParts {...props} message={{ ...message, parts: work }} /></Collapsible.Content>}
    </Collapsible.Root>}
    {reply.length > 0 && <AssistantMessageParts {...props} message={{ ...message, parts: reply }} />}
    {!work.length && (streaming || (!reply.length && (message.interrupted || message.run?.status === 'failed' || message.run?.status === 'stopped'))) && <div className="mira-turn-status" role="status">
      {streaming && (approval ? <CircleAlert size={14} aria-hidden="true" /> : <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />)}
      <span>{label}</span>{elapsed}
      {props.onOpenProgress && <button type="button" className="mira-message-action" aria-label="查看本轮执行详情" onClick={props.onOpenProgress}><ArrowUpRight size={14} aria-hidden="true" /></button>}
    </div>}
    {message.run?.error && <p className="mira-tool-error" role="alert">{message.run.error}</p>}
  </div>
}
