import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { HarnessFileChange, HarnessMessage, HarnessSession, ToolCallRecord } from '../../../../../src/config/harness'
import { PilotController } from '../../state/pilot-state'
import { MessageMarkdown } from './markdown'
import { RunProgressCard } from './run-progress'
import type { PermissionResponseCardProps } from './AssistantMessageParts'
import { MiraAssistantProcess } from './MiraAssistantProcess'
import { AssistantToolbar, EditIcon, FileChangesCard, MessageCopyButton, UserMessageAttachments, UserMessageEditor } from './message-parts'
import { taskFindTargetKey } from '../../lib/conversation-find'
import { toolsForRun, type TimelineRenderMessage } from './conversation-model'
import { findMiraDelegateSubtask, selectMiraRunActivity } from '../../lib/subtask-activity'
import { MiraBrowserContexts } from '../composer/MiraBrowserContexts'
import { MiraPresentationContexts } from '../composer/MiraPresentationContexts'
import { miraPromptContexts } from '../../lib/mira-presentation-reference'
import type { MiraPresentationReference } from '../../../../../src/config/miraPresentation'
import { GitFork } from 'lucide-react'
import { MiraUserMessageBody } from './MiraUserMessageBody'
import { MiraFileRewindPreviewButton } from './MiraFileRewindPreview'
import { miraUserPrompt } from '../../lib/mira-user-prompt'
import type { MiraHistoryEditBlocked } from '../../../../../src/config/miraFileRewind'

export const MiraConversationContext = createContext<{ controller: PilotController; sessionId?: string; session?: HarnessSession; active: boolean; openChangesTab: () => void; openFile: (path: string) => void; openPresentation?: (reference: MiraPresentationReference) => void; openRunProgress: (runId: string) => void; openCommand?: (runId: string, toolId: string) => void; openSubtask: (runId: string, subtaskId: string) => void; stopSubtask: (runId: string, subtaskId: string) => Promise<void>; forkConversation?: (messageId: string, requestId: string) => Promise<boolean>; openForkSource?: (sessionId: string, messageId: string) => Promise<boolean>; running: boolean; waiting: boolean; latestAssistantId?: string; canRerun: boolean; tools: ToolCallRecord[]; toolsById: ReadonlyMap<string, ToolCallRecord>; permissionResponse?: PermissionResponseCardProps; inlinePermission?: { messageId: string; partId: string } }>({ controller: undefined as unknown as PilotController, active: false, openChangesTab: () => undefined, openFile: () => undefined, openRunProgress: () => undefined, openSubtask: () => undefined, stopSubtask: async () => undefined, running: false, waiting: false, canRerun: false, tools: [], toolsById: new Map() })

export function UserMessage({ original, rendererId: id }: TimelineRenderMessage) {
  const { controller, sessionId, active, canRerun, running, waiting, openFile, openPresentation } = useContext(MiraConversationContext)
  const [editing, setEditing] = useState(false)
  const prompt = useMemo(() => miraUserPrompt(original.content), [original.content])
  const contexts = miraPromptContexts(prompt.document)
  useEffect(() => { setEditing(false) }, [sessionId, id])
  if (editing) return <div className="message-row flex w-full flex-col items-end gap-1" data-message-id={id} data-mira-editing="true" data-user-message-id={id} data-renderer-message-id={id}>
    <div className="w-full max-w-full @min-[624px]/conversation:max-w-xl"><UserMessageEditor original={original} content={original.content} controller={controller} sessionId={sessionId} onOpenFile={openFile} onOpenPresentation={openPresentation} disabled={!active || !canRerun} onCancel={() => setEditing(false)} onConfirm={async (next, references, workspace) => { if (controller.getSnapshot().session?.id !== sessionId) return false; let blocked: MiraHistoryEditBlocked | undefined; const accepted = await controller.editAndRerun(id, next, references, workspace, result => { blocked = result }); if (accepted && controller.getSnapshot().session?.id === sessionId) setEditing(false); return blocked ?? accepted }} /></div>
  </div>
  return <div className="message-row group/user-row mt-7 flex w-full flex-col items-end first:mt-0" data-message-id={id} data-user-message-id={id} data-renderer-message-id={id}>
    <UserMessageAttachments message={original} onOpen={openFile} sessionId={sessionId} controller={controller} active={active} />
    {contexts.length > 0 && <div className="mira-message-contexts"><MiraBrowserContexts key={`${sessionId}:${id}`} references={contexts.filter(reference => reference.kind === 'web')} disabled={!active} align="end" /><MiraPresentationContexts key={`presentation:${sessionId}:${id}`} references={contexts.filter(reference => reference.kind === 'presentation')} disabled={!active} align="end" onOpen={openPresentation} /></div>}
    {prompt.visibleBody.trim() && <div data-mira-selectable="user" data-mira-selection-region="body" data-mira-find-target={taskFindTargetKey(id)} className="flex max-w-full flex-col rounded-xl rounded-tr-xs border border-border bg-surface px-4 py-3 text-ui-base text-foreground @min-[624px]/conversation:max-w-xl"><MiraUserMessageBody key={JSON.stringify([sessionId, id])} content={prompt.canonicalBody}><p>{prompt.body.parts.map((part, index) => part.type === 'text' ? part.text : <span key={index} className={`mira-prompt-reference mira-prompt-reference-${part.reference.kind}`} title={part.reference.kind === 'agent' ? `${part.reference.label}智能体（${part.reference.text}）` : part.reference.kind === 'command' ? part.reference.text : `${part.reference.kind === 'plugin' ? '插件' : '技能'}：${part.reference.label}`}>{part.reference.label}</span>)}</p></MiraUserMessageBody></div>}
    <div className="mira-message-actions mt-1 opacity-0 transition-opacity group-hover/user-row:opacity-100 group-focus-within/user-row:opacity-100">{original?.content && <MessageCopyButton content={original.content} label="复制消息" onError={error => controller.reportError(error)} />}{controller.supportsFileRewindPreview && active && sessionId && <MiraFileRewindPreviewButton controller={controller} sessionId={sessionId} messageId={original.id} disabled={running || waiting} />}{canRerun && active && <button type="button" className="mira-message-action" aria-label="编辑并重跑" title="编辑并重跑" onClick={() => setEditing(true)}><EditIcon /></button>}</div>
  </div>
}

export function AssistantMessage({ original, rendererId, streaming }: TimelineRenderMessage & { streaming: boolean }) {
  const { controller, session, active, openChangesTab, openFile, openRunProgress, openCommand, openSubtask, stopSubtask, forkConversation, openForkSource, running, waiting, latestAssistantId, canRerun, tools, toolsById, permissionResponse, inlinePermission } = useContext(MiraConversationContext)
  const id = original.id
  const message = original
  const content = message?.content ?? ''
  const orderedParts = message?.parts !== undefined || streaming
  const runId = message?.runId ?? original?.runId
  const ownedRun = runId ? selectMiraRunActivity(session, runId) : undefined
  const onOpenProgress = runId && ownedRun ? () => openRunProgress(runId) : undefined
  const onOpenCommand = active && runId && ownedRun && openCommand ? (commandRunId: string, toolId: string) => { if (commandRunId === runId) openCommand(commandRunId, toolId) } : undefined
  const onOpenSubtask = runId && ownedRun ? (subtaskId: string) => openSubtask(runId, subtaskId) : undefined
  const onStopSubtask = runId && ownedRun ? (subtaskId: string) => stopSubtask(runId, subtaskId) : undefined
  const changes: HarnessFileChange[] = original?.fileChanges || []
  return <div className="message-row group/assistant-row w-full min-w-0" data-message-id={rendererId} data-assistant-message-id={id} data-renderer-message-id={rendererId}>
    {!orderedParts && original?.run && <RunProgressCard run={original.run} tools={ownedRun?.tools ?? toolsForRun(tools, original.run)} running={streaming} waiting={streaming && waiting} onStopSubtask={onStopSubtask} onOpenFile={openFile} onOpenCommand={onOpenCommand} onOpenProgress={onOpenProgress} onOpenSubtask={onOpenSubtask} />}
    {orderedParts && message ? <MiraAssistantProcess message={message.parts === undefined && content ? { ...message, parts: [{ id: `${id}:text`, type: 'text', text: content, state: streaming ? 'streaming' : 'complete', startedAt: message.createdAt }] } : message} rendererId={rendererId} toolsById={toolsById} streaming={streaming} waitingForApproval={streaming && waiting} permission={inlinePermission?.messageId === id ? permissionResponse : undefined} permissionPartId={inlinePermission?.messageId === id ? inlinePermission.partId : undefined} onOpenFile={openFile} onOpenCommand={onOpenCommand} onOpenProgress={onOpenProgress} subtaskForTool={runId ? toolId => findMiraDelegateSubtask(session, runId, toolId) : undefined} onOpenSubtask={onOpenSubtask} onStopSubtask={onStopSubtask} hasPlan={Boolean((message.run?.activities ?? ownedRun?.activities)?.some(activity => activity.kind === 'plan'))} /> : content && <div data-mira-selectable="assistant" data-mira-selection-region="body" data-mira-find-target={taskFindTargetKey(rendererId)}><MessageMarkdown content={content} sources={original?.sources} streaming={streaming} /></div>}
    {changes.length > 0 && <FileChangesCard changes={changes} onOpen={openChangesTab} />}
    {original?.interrupted && <p className="mira-reply-interrupted" role="status">回复已停止，已生成的内容保留。可以继续发送消息。</p>}
    {!streaming && content && <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover/assistant-row:opacity-100 group-focus-within:opacity-100">
      <AssistantToolbar message={original} latestAssistantId={latestAssistantId} canRerun={canRerun && !running} onRerun={session?.parentSessionId ? undefined : () => controller.rerun()} onFork={active && forkConversation && !running && !waiting && !message.interrupted && message.run?.status !== 'failed' && message.run?.status !== 'stopped' && !message.parts?.some(part => part.type !== 'tool' && part.state !== 'complete') ? requestId => forkConversation(id, requestId) : undefined} onError={error => controller.reportError(error)} />
    </div>}
    {session?.forkSource?.messageId === id && <div className="mira-fork-notice" data-mira-find-ignore><span /><button type="button" disabled={!active || !openForkSource} title={`返回「${session.forkSource.title}」的分支点；项目文件保持当前状态`} onClick={() => { if (openForkSource) void openForkSource(session.forkSource!.sessionId, id).catch(error => controller.reportError(error)) }}><GitFork size={13} aria-hidden="true" />从「{session.forkSource.title}」分支</button><span /></div>}
  </div>
}
