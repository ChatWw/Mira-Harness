import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { HarnessFileChange, HarnessMessage, HarnessSession, ToolCallRecord } from '../../../../../src/config/harness'
import { PilotController } from '../../state/pilot-state'
import { MessageMarkdown } from './markdown'
import { RunProgressCard } from './run-progress'
import type { PermissionResponseCardProps } from './AssistantMessageParts'
import { MiraAssistantProcess } from './MiraAssistantProcess'
import { AssistantToolbar, MessageActionHint, EditIcon, FileChangesCard, MessageCopyButton, UserMessageAttachments, UserMessageEditor } from './message-parts'
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
import { MiraDeliverableFiles } from './MiraDeliverableFiles'
import { miraUserPrompt } from '../../lib/mira-user-prompt'
import { MiraMessageReference } from './MiraMessageReference'
import type { MiraHistoryEditBlocked } from '../../../../../src/config/miraFileRewind'

export const MiraConversationContext = createContext<{ desktopOnly?: () => void; controller: PilotController; sessionId?: string; session?: HarnessSession; active: boolean; workflowRuns?: import('../../../../../src/config/miraFlowWorkbench').MiraFlowRunSummary[]; openWorkflow?: (identity: import('../../../../../src/config/miraFlowWorkbench').MiraFlowRunIdentity, artifact?: import('../../../../../packages/mira-flow-kit/src/engine/mira-types').ArtifactVersionRecord) => void; openChangesTab: () => void; openFile: (path: string) => void; openLink?: (url: string) => void; openPresentation?: (reference: MiraPresentationReference) => void; openRunProgress: (runId: string) => void; openCommand?: (runId: string, toolId: string) => void; openSubtask: (runId: string, subtaskId: string) => void; stopSubtask: (runId: string, subtaskId: string) => Promise<void>; forkConversation?: (messageId: string, requestId: string) => Promise<boolean>; openForkSource?: (sessionId: string, messageId: string) => Promise<boolean>; running: boolean; waiting: boolean; latestAssistantId?: string; canRerun: boolean; tools: ToolCallRecord[]; toolsById: ReadonlyMap<string, ToolCallRecord>; permissionResponse?: PermissionResponseCardProps; inlinePermission?: { messageId: string; partId: string } }>({ controller: undefined as unknown as PilotController, active: false, openChangesTab: () => undefined, openFile: () => undefined, openRunProgress: () => undefined, openSubtask: () => undefined, stopSubtask: async () => undefined, running: false, waiting: false, canRerun: false, tools: [], toolsById: new Map() })

export function UserMessage({ original, rendererId: id }: TimelineRenderMessage) {
  const { controller, sessionId, active, canRerun, running, waiting, openFile, openPresentation, desktopOnly } = useContext(MiraConversationContext)
  const [editing, setEditing] = useState(false)
  const prompt = useMemo(() => miraUserPrompt(original.content), [original.content])
  const contexts = miraPromptContexts(prompt.document)
  useEffect(() => { setEditing(false) }, [sessionId, id])
  if (editing) return <div className="message-row flex w-full flex-col items-end gap-1" data-message-id={id} data-mira-editing="true" data-user-message-id={id} data-renderer-message-id={id}>
    <div className="w-full max-w-full @min-[624px]/conversation:max-w-xl"><UserMessageEditor original={original} content={original.content} controller={controller} sessionId={sessionId} onOpenFile={openFile} onOpenPresentation={openPresentation} disabled={!active || !canRerun} onCancel={() => setEditing(false)} onConfirm={async (next, references, workspace) => { if (controller.getSnapshot().session?.id !== sessionId) return false; let blocked: MiraHistoryEditBlocked | undefined; const accepted = await controller.editAndRerun(id, next, references, workspace, result => { blocked = result }); if (accepted && controller.getSnapshot().session?.id === sessionId) setEditing(false); return blocked ?? accepted }} /></div>
  </div>
  return <div className="message-row group/user-row mt-7 flex w-full flex-col items-end first:mt-0" data-message-id={id} data-user-message-id={id} data-renderer-message-id={id}>
    <UserMessageAttachments onPreviewBlocked={desktopOnly} message={original} onOpen={openFile} sessionId={sessionId} controller={controller} active={active} />
    {contexts.length > 0 && <div className="mira-message-contexts"><MiraBrowserContexts key={`${sessionId}:${id}`} references={contexts.filter(reference => reference.kind === 'web')} disabled={!active} align="end" /><MiraPresentationContexts key={`presentation:${sessionId}:${id}`} references={contexts.filter(reference => reference.kind === 'presentation')} disabled={!active} align="end" onOpen={openPresentation} /></div>}
    {prompt.visibleBody.trim() && <div data-mira-selectable="user" data-mira-selection-region="body" data-mira-find-target={taskFindTargetKey(id)} className="flex max-w-full flex-col rounded-xl rounded-tr-xs border border-border bg-surface px-4 py-3 text-ui-base text-foreground @min-[624px]/conversation:max-w-xl"><MiraUserMessageBody key={JSON.stringify([sessionId, id])} content={prompt.canonicalBody}><p>{prompt.body.parts.map((part, index) => part.type === 'text' ? part.text : <MiraMessageReference key={index} reference={part.reference} />)}</p></MiraUserMessageBody></div>}
    <div className="mira-message-actions mira-user-message-actions mt-1 opacity-0 transition-opacity group-hover/user-row:opacity-100 group-focus-within/user-row:opacity-100">{original?.content && <MessageCopyButton content={original.content} label="复制消息" onError={error => controller.reportError(error)} />}{canRerun && active && <MessageActionHint label="编辑"><button type="button" className="mira-message-action" aria-label="编辑并重跑" onClick={() => setEditing(true)}><EditIcon /></button></MessageActionHint>}</div>
  </div>
}

export function AssistantMessage({ original, rendererId, streaming }: TimelineRenderMessage & { streaming: boolean }) {
  const { desktopOnly, controller, session, active, openChangesTab, openFile, openRunProgress, openCommand, openSubtask, stopSubtask, forkConversation, openForkSource, running, waiting, latestAssistantId, canRerun, tools, toolsById, permissionResponse, inlinePermission, workflowRuns, openWorkflow } = useContext(MiraConversationContext)
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
  const rewindMessage = id === latestAssistantId ? [...(session?.messages ?? [])].slice(0, session?.messages.findIndex(message => message.id === id)).reverse().find(message => message.role === 'user') : undefined

  return <div className="message-row group/assistant-row w-full min-w-0" data-message-id={rendererId} data-assistant-message-id={id} data-renderer-message-id={rendererId}>
    {!orderedParts && original?.run && <RunProgressCard run={original.run} tools={ownedRun?.tools ?? toolsForRun(tools, original.run)} running={streaming} waiting={streaming && waiting} onStopSubtask={onStopSubtask} onOpenFile={openFile} onOpenCommand={onOpenCommand} onOpenProgress={onOpenProgress} onOpenSubtask={onOpenSubtask} />}
    {orderedParts && message ? <MiraAssistantProcess workflowRuns={workflowRuns} onOpenWorkflow={openWorkflow} message={message.parts === undefined && content ? { ...message, parts: [{ id: `${id}:text`, type: 'text', text: content, state: streaming ? 'streaming' : 'complete', startedAt: message.createdAt }] } : message} rendererId={rendererId} toolsById={toolsById} streaming={streaming} waitingForApproval={streaming && waiting} permission={inlinePermission?.messageId === id ? permissionResponse : undefined} permissionPartId={inlinePermission?.messageId === id ? inlinePermission.partId : undefined} onOpenFile={openFile} onOpenCommand={onOpenCommand} onOpenProgress={onOpenProgress} subtaskForTool={runId ? toolId => findMiraDelegateSubtask(session, runId, toolId) : undefined} onOpenSubtask={onOpenSubtask} onStopSubtask={onStopSubtask} hasPlan={Boolean((message.run?.activities ?? ownedRun?.activities)?.some(activity => activity.kind === 'plan'))} /> : content && <div data-mira-selectable="assistant" data-mira-selection-region="body" data-mira-find-target={taskFindTargetKey(rendererId)}><MessageMarkdown content={content} sources={original?.sources} streaming={streaming} /></div>}
    {!streaming && <MiraDeliverableFiles onDesktopOnly={desktopOnly} content={content} changes={changes} directory={session?.workingDirectory || ''} sessionId={session?.id} controller={controller} active={active} onOpen={openFile} />}
    {changes.length > 0 && <FileChangesCard onDesktopOnly={desktopOnly} changes={changes} onOpen={openChangesTab} onOpenFile={openFile} directory={session?.workingDirectory} controller={controller} sessionId={session?.id} active={active} undo={rewindMessage && session && controller.supportsFileRewindPreview ? <MiraFileRewindPreviewButton controller={controller} sessionId={session.id} messageId={rewindMessage.id} disabled={!active || running || waiting} label="撤销" /> : undefined} />}
    {original?.interrupted && <p className="mira-reply-interrupted" role="status">回复已停止，已生成的内容保留。可以继续发送消息。</p>}
    {!streaming && content && <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover/assistant-row:opacity-100 group-focus-within:opacity-100">
      <AssistantToolbar message={original} onFork={active && forkConversation && !running && !waiting && !message.interrupted && message.run?.status !== 'failed' && message.run?.status !== 'stopped' && !message.parts?.some(part => part.type !== 'tool' && part.state !== 'complete') ? requestId => forkConversation(id, requestId) : undefined} onError={error => controller.reportError(error)} />
    </div>}
    {session?.forkSource?.messageId === id && <div className="mira-fork-notice" data-mira-find-ignore><span /><button type="button" disabled={!active || !openForkSource} title={`返回「${session.forkSource.title}」的分支点；项目文件保持当前状态`} onClick={() => { if (openForkSource) void openForkSource(session.forkSource!.sessionId, id).catch(error => controller.reportError(error)) }}><GitFork size={13} aria-hidden="true" />从「{session.forkSource.title}」分支</button><span /></div>}
  </div>
}
