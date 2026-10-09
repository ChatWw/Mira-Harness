import { memo, useState } from 'react'
import { Brain, ChevronDown, LoaderCircle, ShieldCheck } from 'lucide-react'
import type { HarnessMessage, HarnessMessagePart, HarnessPermissionRequest, ToolCallRecord } from '../../../../../src/config/harness'
import { MessageMarkdown } from './markdown'
import { ToolRecord } from './run-progress'

export interface PermissionResponseCardProps {
  request: HarnessPermissionRequest
  responding: boolean
  error?: string
  placement: 'inline' | 'fallback'
  onRespond: (requestId: string, allowed: boolean) => Promise<void>
}

export function PermissionResponseCard({ request, responding, error, placement, onRespond }: PermissionResponseCardProps) {
  return <section className="pilot-action mira-tool-permission" aria-label="权限确认" aria-busy={responding} data-permission-request-id={request.requestId} data-permission-placement={placement}>
    <ShieldCheck size={19} aria-hidden="true" />
    <div>
      <strong>{request.title}</strong>
      <p>{request.detail}</p>
      {error && <p className="mira-tool-error" role="alert">{error}</p>}
      {responding && <p role="status">正在提交确认…</p>}
      <div className="pilot-action__buttons">
        <button type="button" disabled={responding} onClick={() => { if (!responding) void onRespond(request.requestId, false) }}>拒绝</button>
        <button type="button" disabled={responding} onClick={() => { if (!responding) void onRespond(request.requestId, true) }}>允许</button>
      </div>
    </div>
  </section>
}

/** Only explicit request/tool/run identities can move a permission card into a message. */
export function findInlinePermissionTarget(messages: HarnessMessage[], tools: ToolCallRecord[], request?: HarnessPermissionRequest): { messageId: string; partId: string } | undefined {
  if (!request?.toolCallId) return
  const tool = tools.find(candidate => candidate.id === request.toolCallId)
  if (!tool || tool.status !== 'waiting-confirm' || (tool.approvalRequestId && tool.approvalRequestId !== request.requestId) || (request.runId && tool.runId && request.runId !== tool.runId)) return
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'assistant' || (request.runId && message.runId && request.runId !== message.runId) || (tool.runId && message.runId && tool.runId !== message.runId)) continue
    const part = message.parts?.find(candidate => candidate.type === 'tool' && candidate.toolCallId === tool.id)
    if (part) return { messageId: message.id, partId: part.id }
  }
}

const AssistantReasoning = memo(function AssistantReasoning({ part }: { part: Extract<HarnessMessagePart, { text: string }> }) {
  const [expanded, setExpanded] = useState(false)
  const duration = part.completedAt !== undefined ? Math.max(0, Math.ceil((part.completedAt - part.startedAt) / 1000)) : undefined
  const label = part.state === 'streaming' ? '正在思考' : part.state === 'interrupted' ? '思考已中断' : '思考过程'
  return <details className="mira-reasoning" data-reasoning-state={part.state} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary aria-label={expanded ? '收起思考过程' : '展开思考过程'}>
      {part.state === 'streaming' ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Brain size={14} aria-hidden="true" />}
      <span>{label}{duration !== undefined ? ` · ${duration}s` : ''}</span>
      {part.truncated && <small>内容已截断</small>}
      <ChevronDown size={13} aria-hidden="true" />
    </summary>
    {expanded && <div className="mira-reasoning__content">{part.text}{part.truncated && <p className="mira-payload-truncated" role="note">思考内容超过记录上限，仅保留已记录部分。</p>}</div>}
  </details>
})

export function AssistantMessageParts({ message, toolsById, streaming = false, permission, permissionPartId }: {
  message: HarnessMessage
  toolsById: ReadonlyMap<string, ToolCallRecord>
  streaming?: boolean
  permission?: PermissionResponseCardProps
  permissionPartId?: string
}) {
  return <div className="mira-assistant-parts">{message.parts?.map(part => {
    const candidate = part.type === 'tool' ? toolsById.get(part.toolCallId) : undefined
    const tool = candidate && (!message.runId || !candidate.runId || candidate.runId === message.runId) ? candidate : undefined
    return <div key={part.id} className="mira-assistant-part" data-message-part-id={part.id} data-message-part-type={part.type}>
      {part.type === 'text' ? <MessageMarkdown content={part.text} sources={message.sources} streaming={streaming && part.state === 'streaming'} /> : part.type === 'reasoning' ? <AssistantReasoning part={part} /> : <>
        {tool ? <ToolRecord tool={tool} /> : <p className="mira-tool-missing" role="status">工具记录暂不可用。</p>}
        {permission && permissionPartId === part.id && <PermissionResponseCard {...permission} />}
      </>}
    </div>
  })}</div>
}
