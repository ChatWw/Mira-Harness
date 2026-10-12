import { memo } from 'react'
import { Brain, ChevronDown, LoaderCircle, ShieldCheck } from 'lucide-react'
import type { HarnessMessage, HarnessMessagePart, HarnessPermissionRequest, HarnessSubtask, ToolCallRecord } from '../../../../../src/config/harness'
import { MessageMarkdown } from './markdown'
import { MiraSubtaskRecord, ToolRecord } from './run-progress'
import { useMiraConversationDetail } from './MiraConversationDetails'
import { taskFindTargetKey } from '../../lib/conversation-find'
import { miraAssistantWorkItems } from '../../lib/tool-exploration'
import { MiraToolExploration } from './MiraToolExploration'
import { MiraToolCommandGroup } from './MiraToolCommandGroup'
import { MiraWorkflowSourceReview } from '../workflows/MiraWorkflowSourceReview'

export interface PermissionResponseCardProps {
  request: HarnessPermissionRequest
  responding: boolean
  error?: string
  placement: 'inline' | 'fallback' | 'dock'
  onRespond: (requestId: string, allowed: boolean) => Promise<void>
}

export function PermissionResponseCard({ request, responding, error, placement, onRespond }: PermissionResponseCardProps) {
  return <section className="pilot-action mira-tool-permission" aria-label="权限确认" tabIndex={-1} aria-busy={responding} data-permission-request-id={request.requestId} data-permission-placement={placement} onKeyDown={event => {
    if (responding || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.pilot-action__buttons > button:not(:disabled)')]
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    if (index < 0) return
    const next = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? Math.min(index + 1, buttons.length - 1) : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? Math.max(index - 1, 0) : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1
    if (next < 0 || !buttons[next]) return
    event.preventDefault(); event.stopPropagation(); buttons[next].focus()
  }}>
    <ShieldCheck size={19} aria-hidden="true" />
    <div>
      <strong>{request.title}</strong>
      {request.workflowReview ? <div className="mira-tool-permission__review-body"><p className="mira-tool-permission__detail">{request.detail}</p><MiraWorkflowSourceReview review={request.workflowReview} /></div> : <p className="mira-tool-permission__detail">{request.detail}</p>}
      {error && <p className="mira-tool-error" role="alert">{error}</p>}
      {responding && <p role="status">正在提交确认…</p>}
      <div className="pilot-action__buttons">
        <button type="button" disabled={responding} onClick={() => { if (!responding) void onRespond(request.requestId, false) }}>拒绝</button>
        <button type="button" disabled={responding} onClick={() => { if (!responding) void onRespond(request.requestId, true) }}>{request.workflowReview ? request.workflowReview.action === 'run' ? '确认并运行' : '确认保存' : '允许'}</button>
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

const AssistantReasoning = memo(function AssistantReasoning({ part, memoryKey }: { part: Extract<HarnessMessagePart, { text: string }>; memoryKey: string }) {
  const [expanded, setExpanded] = useMiraConversationDetail(memoryKey)
  const duration = part.completedAt !== undefined ? Math.max(0, Math.ceil((part.completedAt - part.startedAt) / 1000)) : undefined
  const label = part.state === 'streaming' ? '正在思考' : part.state === 'interrupted' ? '思考已中断' : '思考过程'
  return <details className="mira-reasoning" open={expanded} data-reasoning-state={part.state} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary aria-label={expanded ? '收起思考过程' : '展开思考过程'}>
      {part.state === 'streaming' ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Brain size={14} aria-hidden="true" />}
      <span>{label}{duration !== undefined ? ` · ${duration}s` : ''}</span>
      {part.truncated && <small>内容已截断</small>}
      <ChevronDown size={13} aria-hidden="true" />
    </summary>
    {expanded && <div className="mira-reasoning__content"><div data-mira-selectable="reasoning" data-mira-selection-region={part.id}>{part.text}</div>{part.truncated && <p className="mira-payload-truncated" role="note">思考内容超过记录上限，仅保留已记录部分。</p>}</div>}
  </details>
})

export function AssistantMessageParts({ message, toolsById, streaming = false, permission, permissionPartId, rendererId = message.id, onOpenFile, hasPlan = false, subtaskForTool, onOpenSubtask, onStopSubtask }: {
  message: HarnessMessage
  toolsById: ReadonlyMap<string, ToolCallRecord>
  streaming?: boolean
  permission?: PermissionResponseCardProps
  permissionPartId?: string
  rendererId?: string
  onOpenFile?: (path: string) => void
  hasPlan?: boolean
  subtaskForTool?: (toolId: string) => HarnessSubtask | undefined
  onOpenSubtask?: (subtaskId: string) => void
  onStopSubtask?: (subtaskId: string) => Promise<void>
}) {
  return <div className="mira-assistant-parts">{miraAssistantWorkItems(message, toolsById, streaming, permissionPartId).map(item => {
    if (item.kind === 'exploration') return <MiraToolExploration key={`exploration:${item.firstId}`} item={item} onOpenFile={onOpenFile} />
    if (item.kind === 'commands') return <MiraToolCommandGroup key={`commands:${item.firstId}`} item={item} />
    const { part, tool } = item
    if (hasPlan && tool?.tool === 'set_plan' && tool.status === 'ok') return null
    const child = tool?.tool === 'delegate_task' ? subtaskForTool?.(tool.id) : undefined
    return <div key={part.id} className="mira-assistant-part" data-message-part-id={part.id} data-message-part-type={part.type} data-mira-find-target={part.type === 'text' ? taskFindTargetKey(rendererId, part.id) : undefined}>
      {part.type === 'text' ? <div data-mira-selectable="assistant" data-mira-selection-region={part.id}><MessageMarkdown content={part.text} sources={message.sources} streaming={streaming && part.state === 'streaming'} /></div> : part.type === 'reasoning' ? <AssistantReasoning part={part} memoryKey={JSON.stringify(['reasoning', message.runId ?? message.id, part.id])} /> : <>
        {child && onOpenSubtask ? <MiraSubtaskRecord key={child.id} subtask={child} onOpen={() => onOpenSubtask(child.id)} onStop={onStopSubtask ? () => onStopSubtask(child.id) : undefined} /> : tool ? <ToolRecord tool={tool} onOpenFile={onOpenFile} /> : <p className="mira-tool-missing" role="status">工具记录暂不可用。</p>}
        {permission && permissionPartId === part.id && <PermissionResponseCard {...permission} />}
      </>}
    </div>
  })}</div>
}
