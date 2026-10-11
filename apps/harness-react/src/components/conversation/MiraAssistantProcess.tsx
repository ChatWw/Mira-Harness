// Adapted from ZCode ConversationTurnGroup (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Uses Mira's ordered public message parts.
import * as Collapsible from '@radix-ui/react-collapsible'
import { ArrowUpRight, ChevronRight, CircleAlert, LoaderCircle } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import { MIRA_REVEAL_PROCESS, miraAssistantProcess } from '../../lib/mira-assistant-process'
import { taskFindTargetKey } from '../../lib/conversation-find'
import { AssistantMessageParts } from './AssistantMessageParts'
import { useMiraConversationDetail } from './MiraConversationDetails'

export function MiraAssistantProcess(props: ComponentProps<typeof AssistantMessageParts> & { onOpenProgress?: () => void }) {
  const { message, streaming = false, permission, toolsById, rendererId = message.id } = props
  const { work, reply, waiting, needsAttention } = miraAssistantProcess(message, toolsById)
  const [savedOpen, saveOpen] = useMiraConversationDetail(JSON.stringify(['process', rendererId]))
  const [live, setLive] = useState({ streaming, open: true })
  const mustShow = Boolean(permission || needsAttention || message.run?.status === 'failed')
  const open = mustShow || (streaming ? live.streaming ? live.open : true : savedOpen)
  const container = useRef<HTMLDivElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const focused = useRef(false)
  const setOpen = (next: boolean) => {
    if (streaming) setLive({ streaming, open: next })
    else saveOpen(next)
  }
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
    if (!open && focused.current) trigger.current?.focus()
  }, [open])
  const seconds = message.run ? Math.max(0, Math.round(message.run.durationMs / 1000)) : undefined
  const label = permission || waiting ? '等待确认'
    : needsAttention || message.run?.status === 'failed' ? '执行遇到错误'
      : streaming ? '正在处理' : message.interrupted || message.run?.status === 'stopped' ? '工作已停止' : '工作过程'
  return <div ref={container} className="mira-assistant-process-layout">
    {work.length > 0 && <Collapsible.Root className="mira-assistant-process" open={open} onOpenChange={setOpen} data-mira-process-open={open} onFocusCapture={() => { focused.current = true }} onBlurCapture={event => { const element = event.currentTarget; queueMicrotask(() => { focused.current = element.contains(document.activeElement) }) }}>
      <div className="mira-assistant-process-heading"><Collapsible.Trigger asChild><button ref={trigger} type="button" className="mira-assistant-process-trigger" disabled={mustShow} aria-label={`${open ? '收起' : '展开'}工作过程`}>
        {mustShow ? <CircleAlert size={14} aria-hidden="true" /> : streaming ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : null}
        <span>{label}</span>{!streaming && seconds !== undefined && <small>· {seconds}s</small>}
        <ChevronRight size={14} aria-hidden="true" />
      </button></Collapsible.Trigger>{props.onOpenProgress && <button type="button" className="mira-message-action" aria-label="查看本轮执行详情" title="查看本轮执行详情" onClick={props.onOpenProgress}><ArrowUpRight size={14} aria-hidden="true" /></button>}</div>
      {open && <Collapsible.Content className="mira-assistant-process-content"><AssistantMessageParts {...props} message={{ ...message, parts: work }} /></Collapsible.Content>}
    </Collapsible.Root>}
    {reply.length > 0 && <AssistantMessageParts {...props} message={{ ...message, parts: reply }} />}
    {message.run?.error && <p className="mira-tool-error" role="alert">{message.run.error}</p>}
  </div>
}
