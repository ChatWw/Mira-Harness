/* Independent side pane adapted from ZCode SelectionSideChatPane / SessionPane / ConversationHeader.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira uses its real session runtime, shared transcript, owner drafts and IPC. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowDown, ArrowLeft, LoaderCircle, MessageSquare, X } from 'lucide-react'
import type { PilotController } from '../../state/pilot-state'
import { getPilotTaskState, getPilotTaskTone } from '../../state/pilot-state'
import { conversationScrollKey } from '../../lib/conversation-scroll'
import type { ConversationScrollActions } from '../../hooks/useConversationScroll'
import { useMiraCommandShortcut } from '../../hooks/useMiraCommandShortcut'
import type { ConversationTimelineActions } from '../../lib/conversation-timeline'
import type { MiraConversationSelection } from '../../lib/mira-conversation-selection'
import { projectTimelineMessages, projectTimelineRenderMessages } from '../conversation/conversation-model'
import { AssistantMessage, UserMessage, MiraConversationContext } from '../conversation/MiraConversationMessages'
import { MiraConversationDetailMemory, MiraConversationDetails } from '../conversation/MiraConversationDetails'
import { MiraConversationViewport } from '../conversation/MiraConversationViewport'
import { MiraConversationTimeline } from '../conversation/MiraConversationTimeline'
import { MiraSelectionActions } from '../conversation/MiraSelectionActions'
import { MiraTaskFind } from '../conversation/MiraTaskFind'
import { MiraPendingGuides } from '../conversation/MiraPendingGuides'
import { ConversationTurnRail } from '../conversation/ConversationTurnRail'
import { TaskSummary } from '../conversation/TaskSummary'
import { MiraBranchPicker } from '../git/MiraBranchPicker'
import { PermissionResponseCard, type PermissionResponseCardProps } from '../conversation/AssistantMessageParts'
import { HarnessComposer, type HarnessComposerHandle } from '../composer/HarnessComposer'
import { MiraBackgroundTasksTrigger } from '../composer/MiraBackgroundTasksTrigger'
import { TaskInteraction } from '../interactions/TaskInteraction'
import { MiraCommandPane } from './MiraCommandPane'
import { MiraCommandOutputFile } from './MiraCommandOutputFile'
import { miraSessionCommand } from '../../lib/mira-command-presentation'
import { OverviewPanel } from './OverviewPanel'
import { MiraSubtaskPanel } from './MiraSubtaskPanel'
import { FilePreviewPanel } from './FilePreviewPanel'
import { MiraTaskChangesPanel } from './MiraTaskChangesPanel'
import { MiraPlanDetail } from './MiraPlanDetail'
import { miraSessionPlans } from '../../../../../src/config/miraSessionPlans'

export type MiraSideQuoteRequest = { id: string; reference: MiraConversationSelection }

export function MiraSideConversation({ parentController, parentId, childSessionId, existingTask = false, primaryDirectory, onClose, focusRequest = 0, navigationTarget, onFocusRequestHandled, active, keyboardActive, requests, onConsume, onFocus, onOpenFile }: {
  parentController: PilotController; parentId: string; childSessionId: string; active: boolean; keyboardActive: boolean
  existingTask?: boolean; focusRequest?: number
  primaryDirectory?: string; onClose?: () => Promise<boolean>
  navigationTarget?: { messageId?: string; filePath?: string; execution?: boolean }
  onFocusRequestHandled?: (revision: number) => void
  requests: MiraSideQuoteRequest[]; onConsume: (id: string) => void; onFocus: () => void; onOpenFile: (path: string) => void
}) {
  const controllerParentId = existingTask ? undefined : parentId
  const controller = useMemo(() => existingTask ? parentController.createTaskPaneController(childSessionId) : parentController.createSideController(childSessionId, controllerParentId!), [parentController, childSessionId, controllerParentId, existingTask])
  useMiraCommandShortcut(controller, active && keyboardActive)
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const parentState = useSyncExternalStore(parentController.subscribe, parentController.getSnapshot)
  const listedTask = parentState.sessions.find(session => session.id === childSessionId)
  const taskUnavailable = existingTask && parentState.initialized && !listedTask
  const taskTitle = existingTask ? listedTask?.title || state.session?.title : state.session?.title
  const taskDirectory = state.session?.id === childSessionId ? state.session.workingDirectory : listedTask?.workingDirectory
  const crossWorkspace = existingTask && taskDirectory && taskDirectory.replace(/\\/g, '/').replace(/\/+$/, '') !== primaryDirectory?.replace(/\\/g, '/').replace(/\/+$/, '')
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState(false)
  const closePending = useRef(false)
  const [planning, setPlanning] = useState(false)
  const [summaryMode, setSummaryMode] = useState<'auto' | 'mini' | 'panel'>('auto')
  const [goalDetailsRequest, setGoalDetailsRequest] = useState(0)
  const showGoal = () => { setGoalDetailsRequest(previous => previous + 1); setSummaryMode('panel') }
  const [ready, setReady] = useState(false)
  const composerReady = useCallback(() => setReady(true), [])
  const composerRef = useRef<HarnessComposerHandle>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const detailBackRef = useRef<HTMLButtonElement>(null)
  const backgroundFocus = useRef<{ destination: 'detail' | 'thread'; source: HTMLElement; target?: HTMLElement } | undefined>(undefined)
  const backgroundReturnFocus = useRef(false)
  const planReturnTarget = useRef<HTMLElement | undefined>(undefined)
  const lastFocusRequest = useRef(0)
  const scrollRef = useRef<ConversationScrollActions | null>(null)
  const timelineRef = useRef<ConversationTimelineActions | null>(null)
  const [activeTurn, setActiveTurn] = useState('')
  const [atBottom, setAtBottom] = useState(true)
  const [responding, setResponding] = useState<string>()
  const respondingRequest = useRef<string | undefined>(undefined)
  const [permissionError, setPermissionError] = useState<{ requestId: string; message: string }>()
  const [quoteRetry, setQuoteRetry] = useState<MiraSideQuoteRequest>()
  const attempted = useRef(new Set<string>())
  const [detail, setDetail] = useState<{ runId: string; subtaskId?: string; commandToolId?: string; fullCommandOutput?: true }>()
  const [previewPath, setPreviewPath] = useState<string>()
  const [pendingFile, setPendingFile] = useState<string>()
  const [changesOpen, setChangesOpen] = useState(false)
  const [selectedChangeId, setSelectedChangeId] = useState<string>()
  const [planDetailId, setPlanDetailId] = useState<string>()
  const inspecting = Boolean(detail || previewPath || changesOpen || planDetailId)
  useLayoutEffect(() => {
    const request = backgroundFocus.current
    if (!request || (request.destination === 'detail') !== inspecting) return
    backgroundFocus.current = undefined
    if (!active || state.sessionLoading || state.session?.id !== childSessionId || document.activeElement !== request.source && document.activeElement !== document.body) return
    const target = inspecting ? detailBackRef.current : request.target?.isConnected ? request.target : paneRef.current?.querySelector<HTMLElement>('.mira-background-tasks-trigger:not(:disabled)') || paneRef.current?.querySelector<HTMLElement>('.mira-prompt-editor:not([contenteditable="false"]):not(:disabled)') || paneRef.current
    target?.focus({ preventScroll: true })
  }, [inspecting, active, state.sessionLoading, state.session?.id, childSessionId])
  const returnToConversation = () => {
    if (backgroundReturnFocus.current && detailBackRef.current === document.activeElement) backgroundFocus.current = { destination: 'thread', source: detailBackRef.current!, target: planReturnTarget.current }
    backgroundReturnFocus.current = false
    planReturnTarget.current = undefined
    setDetail(undefined); setPreviewPath(undefined); setChangesOpen(false); setPlanDetailId(undefined)
  }
  async function closePane() {
    if (!active || !onClose || closePending.current) return
    closePending.current = true
    setClosing(true)
    setCloseError(false)
    const pane = paneRef.current, workspace = pane?.closest('.mira-task-grid, .pilot-inspector'), focused = document.activeElement
    try {
      if (!await onClose()) return
      window.requestAnimationFrame(() => {
        // Restore a removed pane's focus, without taking it back from a newer user action.
        if (pane?.isConnected || !workspace?.isConnected || document.activeElement !== document.body || !focused || focused.isConnected) return
        ;(workspace.querySelector<HTMLElement>('[data-task-leaf="$primary"] main') || workspace.querySelector<HTMLButtonElement>('.pilot-side-tab.is-active .pilot-side-tab__select') || workspace.querySelector<HTMLButtonElement>('.mira-workspace-overview'))?.focus({ preventScroll: true })
      })
    } catch { if (pane?.isConnected) setCloseError(true) }
    finally { closePending.current = false; if (pane?.isConnected) setClosing(false) }
  }
  const openFile = (path: string) => { if (existingTask) { setDetail(undefined); setChangesOpen(false); setPlanDetailId(undefined); setPreviewPath(path) } else onOpenFile(path) }
  const details = useMemo(() => new MiraConversationDetailMemory(), [controller])
  useEffect(() => {
    void controller.start()
    const unregister = parentController.registerBeforeNavigation(reportFailure => controller.flushBeforeNavigation(reportFailure))
    return () => {
      unregister()
      // Finish the mounted Composer's pending owner writes before retiring its controller.
      void controller.flushBeforeNavigation().catch(error => parentController.reportError(error)).finally(() => controller.dispose())
    }
  }, [controller, parentController])
  useEffect(() => {
    if (!focusRequest || focusRequest === lastFocusRequest.current || !active || !state.initialized || state.sessionLoading || state.session?.id !== childSessionId || taskUnavailable) return
    if (navigationTarget?.messageId && inspecting) { setDetail(undefined); setPreviewPath(undefined); setChangesOpen(false); setPlanDetailId(undefined); return }
    if (navigationTarget?.filePath) { setDetail(undefined); setChangesOpen(false); setPlanDetailId(undefined); setPreviewPath(navigationTarget.filePath) }
    else if (navigationTarget?.execution) {
      setPreviewPath(undefined); setChangesOpen(false); setPlanDetailId(undefined)
      const runId = state.session.activeRun?.id ?? [...state.messages].reverse().find(message => message.role === 'assistant' && message.run)?.runId
      setDetail(runId ? { runId } : undefined)
    }
    const frame = window.requestAnimationFrame(() => {
      paneRef.current?.focus({ preventScroll: true })
      if (navigationTarget?.messageId) timelineRef.current?.jumpToMessage(navigationTarget.messageId, 'center')
      lastFocusRequest.current = focusRequest
      onFocusRequestHandled?.(focusRequest)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusRequest, navigationTarget, onFocusRequestHandled, active, state.initialized, state.sessionLoading, state.session, state.messages, childSessionId, taskUnavailable, inspecting])
  useEffect(() => {
    if (!pendingFile || !active || inspecting || !ready || state.sessionLoading || state.session?.id !== childSessionId) return
    composerRef.current?.addFileReference(childSessionId, pendingFile)
    setPendingFile(undefined)
  }, [pendingFile, active, inspecting, ready, state.sessionLoading, state.session?.id, childSessionId])
  const timeline = useMemo(() => projectTimelineMessages(state.messages, state.session?.activeRun), [state.messages, state.session?.activeRun])
  const cache = useMemo(() => new WeakMap(), [controller])
  const messages = useMemo(() => projectTimelineRenderMessages(timeline, childSessionId, cache), [timeline, childSessionId, cache])
  const toolsById = useMemo(() => new Map((state.session?.toolCalls ?? []).map(tool => [tool.id, tool])), [state.session?.toolCalls])
  const lastMessage = timeline[timeline.length - 1]
  const stream = lastMessage?.id.startsWith('stream-') ? lastMessage : undefined
  const latestRunMessage = [...state.messages].reverse().find(message => message.role === 'assistant' && message.run)
  const latestRunId = state.session?.activeRun?.id ?? latestRunMessage?.runId
  const runningSubtaskRun = state.session?.activeRun
  const activities = state.session?.activeRun?.activities ?? latestRunMessage?.run?.activities ?? []
  const subtasks = state.session?.activeRun?.subtasks ?? latestRunMessage?.run?.subtasks ?? []
  const changes = state.messages.flatMap(message => (message.fileChanges || []).map(change => ({ ...change, key: `${message.id}:${change.toolCallId}` })))
  const taskState = getPilotTaskState(state), taskTone = getPilotTaskTone(taskState)
  const project = state.projects.find(project => project.id === state.session?.projectId)
  const showConfirmation = (ownerId: string) => {
    const current = controller.getSnapshot()
    if (!active || inspecting || current.sessionLoading || current.session?.id !== ownerId || state.session?.id !== ownerId) return
    if (current.permission?.sessionId === ownerId && current.permission.requestId === state.permission?.requestId) {
      timelineRef.current?.jumpToInteraction({ kind: 'permission', id: current.permission.requestId })
    } else if (!current.permission && current.session.pendingInteraction?.status === 'waiting' && current.session.pendingInteraction.id === state.session.pendingInteraction?.id) {
      timelineRef.current?.jumpToInteraction({ kind: 'interaction', id: current.session.pendingInteraction.id })
    }
  }
  const permission: PermissionResponseCardProps | undefined = state.permission ? {
    request: state.permission, responding: responding === state.permission.requestId, error: permissionError?.requestId === state.permission.requestId ? permissionError.message : undefined,
    placement: 'dock',
    onRespond: async (id, allowed) => {
      const current = controller.getSnapshot()
      if (respondingRequest.current === id || current.permission?.requestId !== id || current.permission.sessionId !== current.session?.id) return
      respondingRequest.current = id
      setResponding(id); setPermissionError(undefined)
      try {
        await controller.permission(allowed, id)
        if (controller.getSnapshot().permission?.requestId === id) setPermissionError({ requestId: id, message: controller.getSnapshot().error || '确认失败，请重试' })
      } catch (error) {
        if (controller.getSnapshot().permission?.requestId === id) setPermissionError({ requestId: id, message: error instanceof Error ? error.message : '权限确认未能提交，请重试。' })
      } finally {
        if (respondingRequest.current === id) respondingRequest.current = undefined
        setResponding(current => current === id ? undefined : current)
      }
    },
  } : undefined
  const memoryKey = conversationScrollKey(childSessionId, state.session?.workingDirectory)
  const sessionPlans = useMemo(() => miraSessionPlans(state.session), [state.session?.toolCalls])
  const hasContent = messages.length > 0
  const interaction = state.session?.pendingInteraction
  useEffect(() => {
    if (existingTask || !active || !ready || state.sessionLoading || state.session?.id !== childSessionId) return
    for (const request of requests) {
      if (attempted.current.has(request.id) || request.reference.sessionId !== parentId) continue
      attempted.current.add(request.id)
      if (!composerRef.current?.addConversationSelection(request.reference)) setQuoteRetry(request)
      onConsume(request.id)
    }
  }, [existingTask, active, ready, state.sessionLoading, state.session?.id, childSessionId, parentId, requests, onConsume])
  const context = {
    controller, sessionId: childSessionId, session: state.session, active: active && !state.sessionLoading,
    openChangesTab: () => { setPreviewPath(undefined); setDetail(undefined); setPlanDetailId(undefined); setChangesOpen(true) },
    openFile, openRunProgress: (runId: string) => { setPreviewPath(undefined); setChangesOpen(false); setPlanDetailId(undefined); setDetail({ runId }) },
    openCommand: (runId: string, toolId: string) => {
      const current = controller.getSnapshot()
      if (!active || current.sessionLoading || !miraSessionCommand(current.session, childSessionId, runId, toolId)) return
      const source = document.activeElement
      planReturnTarget.current = source instanceof HTMLElement && paneRef.current?.contains(source) ? source : undefined
      backgroundReturnFocus.current = Boolean(planReturnTarget.current)
      if (planReturnTarget.current) backgroundFocus.current = { destination: 'detail', source: planReturnTarget.current }
      setPreviewPath(undefined); setChangesOpen(false); setPlanDetailId(undefined); setDetail({ runId, commandToolId: toolId })
    },
    openSubtask: (runId: string, subtaskId: string) => { setPreviewPath(undefined); setChangesOpen(false); setPlanDetailId(undefined); setDetail({ runId, subtaskId }) },
    stopSubtask: async (runId: string, subtaskId: string) => {
      if (controller.getSnapshot().session?.activeRun?.id !== runId) throw new Error('本轮执行已结束')
      await controller.stopSubtasks(subtaskId)
    },
    running: state.running, waiting: Boolean(state.permission) || interaction?.status === 'waiting',
    latestAssistantId: [...timeline].reverse().find(message => message.role === 'assistant')?.id,
    canRerun: false, tools: state.session?.toolCalls ?? [], toolsById,
  }
  const reviewSummaryPlan = () => {
    const current = controller.getSnapshot()
    if (!active || inspecting || current.sessionLoading || current.session?.id !== childSessionId) return
    if (state.permission || interaction?.status === 'waiting') showConfirmation(childSessionId)
    else context.openRunProgress(latestRunId || '')
  }
  const openRunningSubtasks = (runId: string, subtaskId?: string) => {
    const current = controller.getSnapshot(), run = current.session?.activeRun
    if (!active || inspecting || current.sessionLoading || current.session?.id !== childSessionId || run?.id !== runId) return
    const activeTasks = (run.subtasks ?? []).filter(task => task.status === 'queued' || task.status === 'running' || task.status === 'stopping')
    if (!activeTasks.length || subtaskId && !activeTasks.some(task => task.id === subtaskId)) return
    const source = paneRef.current?.querySelector<HTMLButtonElement>('.mira-background-tasks-trigger')
    planReturnTarget.current = undefined
    backgroundReturnFocus.current = source === document.activeElement
    if (backgroundReturnFocus.current) backgroundFocus.current = { destination: 'detail', source: source! }
    if (subtaskId) context.openSubtask(runId, subtaskId)
    else context.openRunProgress(runId)
  }
  const openPlanDetail = (id: string) => {
    const current = controller.getSnapshot()
    if (!active || inspecting || current.sessionLoading || current.session?.id !== childSessionId || !miraSessionPlans(current.session).some(plan => plan.id === id)) return
    const source = document.activeElement
    planReturnTarget.current = source && source instanceof HTMLElement && paneRef.current?.contains(source) ? source : undefined
    backgroundReturnFocus.current = Boolean(planReturnTarget.current)
    if (planReturnTarget.current) backgroundFocus.current = { destination: 'detail', source: planReturnTarget.current }
    setDetail(undefined); setPreviewPath(undefined); setChangesOpen(false); setPlanDetailId(id)
  }
  return <div ref={paneRef} tabIndex={-1} className="mira-side-conversation @container/conversation" data-side-session-id={childSessionId} data-task-pane={existingTask || undefined} role="region" aria-label={existingTask ? '侧面任务' : '旁路对话'} onPointerDownCapture={onFocus} onFocusCapture={onFocus}>
    {existingTask && !inspecting ? <>
      <span className="sr-only" data-task-title={taskTitle}>{taskTitle || '正在加载任务…'}</span>
      <div className="mira-side-conversation__actions">
        {crossWorkspace && <span className="mira-side-conversation__workspace" title={taskDirectory} aria-label={`任务工作区：${taskDirectory}`}><span>{taskDirectory.split(/[\\/]/).filter(Boolean).pop() || taskDirectory}</span></span>}
        {onClose && <button type="button" className="mira-side-conversation__close" aria-label="关闭侧面任务窗格" title="关闭窗格，任务继续运行" disabled={!active || closing} aria-busy={closing || undefined} onClick={() => void closePane()}><X size={16} aria-hidden="true" /></button>}
      </div>
    </> : <header className="mira-side-conversation__header">{inspecting ? <button ref={detailBackRef} type="button" className="mira-message-action" aria-label={existingTask ? '返回侧面任务' : '返回旁路对话'} onClick={returnToConversation}><ArrowLeft size={15} /></button> : <MessageSquare size={15} aria-hidden="true" />}<span title={previewPath || taskTitle}>{previewPath ? previewPath.split(/[\\/]/).pop() : changesOpen ? '文件变更' : detail?.commandToolId ? '命令输出' : detail ? '执行详情' : planDetailId ? '方案详情' : '旁路对话'}</span>{!existingTask && <small role="status">{taskState}</small>}</header>}
    {taskUnavailable ? <div className="mira-side-conversation__empty"><p role="status">任务已归档或不可用。恢复任务后可继续，草稿会保留。</p></div> : !state.initialized || state.sessionLoading ? <div className="mira-session-loading" role="status"><LoaderCircle size={16} className="animate-spin" />正在加载对话…</div> : !state.session ? <div className="mira-side-conversation__empty"><p role="alert">{state.error || '对话已不可用，请关闭标签后新建。'}</p><button type="button" onClick={() => void controller.open(childSessionId)}>重试加载</button></div> : <MiraConversationContext.Provider value={context}><MiraConversationDetails memory={details} scope={memoryKey ?? childSessionId} directory={state.session.workingDirectory}>
      <div className="mira-side-conversation__thread" hidden={inspecting} inert={inspecting}>
        <MiraTaskFind active={active && !inspecting} keyboardActive={keyboardActive && !inspecting} sessionId={childSessionId} loading={Boolean(state.sessionLoading)} requestId={0} messages={messages} liveMessageId={stream?.id} viewportRef={viewportRef} timelineRef={timelineRef} />
        <div className="mira-conversation-root">
          {!hasContent && <div className="mira-side-conversation__empty"><h2>{existingTask ? '从这里继续任务' : '继续探讨，不打断主任务'}</h2><p>{existingTask ? '消息会发送到当前侧面任务。' : '已继承主任务的历史上下文。引用的片段会加入下方草稿，发送后只在这里继续对话。'}</p></div>}
          <div className="mira-conversation-reading-region">
          {existingTask && (state.session.goal || goalDetailsRequest || hasContent || activities.length > 0 || state.permission || interaction?.status === 'waiting') && <div className="mira-summary-positioner">
            <TaskSummary commands={(state.session?.toolCalls ?? []).filter(tool => tool.tool === 'bash' && !tool.inherited && (tool.runId === latestRunId && !tool.subtaskId || tool.commandJob?.mode === 'background' && tool.commandJob.status === 'running'))} onOpenCommand={context.openCommand} plans={sessionPlans} onOpenPlan={openPlanDetail} key={JSON.stringify([childSessionId, latestRunId])} mode={summaryMode} onModeChange={setSummaryMode} goal={state.session.parentSessionId ? undefined : state.session.goal} goalController={controller} goalSessionId={childSessionId} goalDetailsRequest={goalDetailsRequest} goalPlanning={planning} taskState={taskState} taskTone={taskTone} running={taskTone === 'running'} activities={activities} plan={state.session.activePlan} subtasks={subtasks} changes={state.session.changeSummary?.files.filter(file => !file.unchanged).length ?? new Set(changes.map(change => change.path)).size} environment={project?.isGitRepository && project.directoryExists && controller.supportsGitActions ? <MiraBranchPicker controller={controller} project={project} active={active && !inspecting} blocked={parentState.sessions.some(session => session.projectId === project.id && parentState.runningSessionIds.includes(session.id)) || Boolean(state.queue?.items.length)} placement="summary" /> : undefined} onOpenChanges={context.openChangesTab} onOpenProgress={latestRunId ? () => context.openRunProgress(latestRunId) : undefined} onOpenSubtask={latestRunId ? id => context.openSubtask(latestRunId, id) : undefined} onReviewPlan={reviewSummaryPlan} onStopSubtask={id => latestRunId ? context.stopSubtask(latestRunId, id) : Promise.resolve()} onError={error => controller.reportError(error)} />
          </div>}
          {existingTask && <ConversationTurnRail messages={timeline} activeId={activeTurn} onNavigate={id => timelineRef.current?.jumpToMessage(id)} />}
          <MiraConversationViewport memoryKey={memoryKey} viewportRef={viewportRef} actionsRef={scrollRef} timelineRef={timelineRef} active={active && !inspecting} ready={hasContent && !state.sessionLoading} hasContent={hasContent} onBottomChange={setAtBottom}>
            <div className={`mira-message-column mx-auto flex w-full flex-col gap-5 px-5 ${existingTask ? 'pt-16 pb-5' : 'py-5'}`}><MiraConversationTimeline goal={existingTask ? state.session.goal : undefined} providers={state.providers} messages={messages} memoryKey={memoryKey} liveMessageId={stream?.id} viewportRef={viewportRef} scrollActionsRef={scrollRef} actionsRef={timelineRef} components={{ UserMessage, AssistantMessage }} onActiveTurnChange={setActiveTurn} />
              <MiraPendingGuides items={state.queue?.items ?? []} promotingItemId={state.queue?.promotingItemId} disabled={!active || Boolean(state.sessionLoading)} onWithdraw={async id => { await composerRef.current?.withdrawPendingGuide(id) }} />
              {state.memoryConfirmation && <section className="pilot-action"><p>{state.memoryConfirmation.content}</p><button type="button" onClick={() => void controller.respondMemory(state.memoryConfirmation!.requestId, false)}>不保存</button><button type="button" onClick={() => void controller.respondMemory(state.memoryConfirmation!.requestId, true)}>保存</button></section>}
            </div>
          </MiraConversationViewport>
          <MiraSelectionActions rootRef={viewportRef} sessionId={childSessionId} enabled={active && !inspecting} onAdd={reference => composerRef.current?.addConversationSelection(reference) ?? false} />
          </div>
          <div className="mira-composer-region" data-confirmation={Boolean(permission) || interaction?.status === 'waiting' || undefined}>
            {hasContent && <button type="button" className="mira-scroll-latest" aria-label="回到底部" disabled={atBottom} onClick={() => scrollRef.current?.resume()}><ArrowDown size={16} /></button>}
            {quoteRetry && <div className="harness-composer__error" role="alert"><span>引用未添加，原片段已保留。</span><button type="button" onClick={() => { if (composerRef.current?.addConversationSelection(quoteRetry.reference)) setQuoteRetry(undefined) }}>重试添加引用</button><button type="button" onClick={() => setQuoteRetry(undefined)}>取消</button></div>}
            <HarnessComposer ref={composerRef} controller={controller} state={state} active={active && !inspecting} keyboardActive={keyboardActive && !inspecting} planning={planning} setPlanning={setPlanning} navigationSaveFailed={closeError} draftPreferenceKey={existingTask ? 'harness-react-composer-drafts' : `harness-react-composer-drafts.side.${childSessionId}`} selectionSourceSessionId={existingTask ? childSessionId : parentId} onReady={composerReady} onShowConfirmation={showConfirmation} onShowGoal={existingTask ? showGoal : undefined} leadingActions={<MiraBackgroundTasksTrigger subtasks={runningSubtaskRun?.subtasks ?? []} commands={state.session.toolCalls} disabled={Boolean(state.sessionLoading)} onOpen={id => { if (runningSubtaskRun) openRunningSubtasks(runningSubtaskRun.id, id) }} onOpenCommand={context.openCommand} onOpenSummary={() => setSummaryMode('panel')} />} interactionSlot={permission ? <PermissionResponseCard key={permission.request.requestId} {...permission} /> : interaction?.status === 'waiting' ? <TaskInteraction key={interaction.id} interaction={interaction} plan={state.session.activePlan} selectionReady={Boolean(state.selection)} onConfirm={() => controller.confirmPlan(interaction.id)} onRevise={value => controller.continuePlan(interaction.kind === 'plan-review' ? interaction.planId : '', value)} onAnswer={value => controller.answerQuestion(value, interaction.id)} onCancel={interaction.kind === 'plan-review' ? () => controller.cancelPlan(interaction.planId) : undefined} /> : undefined} />
          </div>
        </div>
      </div>
      {detail && <div className="mira-side-conversation__detail">{detail.commandToolId ? detail.fullCommandOutput ? <MiraCommandOutputFile controller={controller} sessionId={childSessionId} runId={detail.runId} toolId={detail.commandToolId} active={active} /> : <MiraCommandPane onAction={(...args) => controller.commandAction(...args)} onOpenFullOutput={(runId, toolId) => setDetail({ runId, commandToolId: toolId, fullCommandOutput: true })} session={state.session} sessionId={childSessionId} runId={detail.runId} toolId={detail.commandToolId} active={active} /> : detail.subtaskId ? <MiraSubtaskPanel session={state.session} sessionId={childSessionId} runId={detail.runId} subtaskId={detail.subtaskId} directory={state.session.workingDirectory} active={active} onStopSubtask={id => context.stopSubtask(detail.runId, id)} onOpenFile={openFile} onOpenCommand={context.openCommand} /> : <OverviewPanel session={state.session} sessionId={childSessionId} runId={detail.runId} active={active} onOpenSubtask={(runId, subtaskId) => setDetail({ runId, subtaskId })} onOpenFile={openFile} onOpenCommand={context.openCommand} />}</div>}
      {planDetailId && <div className="mira-side-conversation__detail"><MiraPlanDetail plan={sessionPlans.find(item => item.id === planDetailId)} /></div>}
      {previewPath && <div className="mira-side-conversation__detail"><FilePreviewPanel controller={controller} sessionId={childSessionId} path={previewPath} directory={state.session.workingDirectory} active={active && ready} onAddFile={path => { setPendingFile(path); setPreviewPath(undefined) }} /></div>}
      {changesOpen && <div className="mira-side-conversation__detail"><MiraTaskChangesPanel changes={changes} summary={state.session.changeSummary} selectedChangeId={selectedChangeId} onSelect={setSelectedChangeId} /></div>}
</MiraConversationDetails></MiraConversationContext.Provider>}
    {closeError && <div className="mira-side-conversation__close-error" role="alert"><span>无法保存工作台，窗格和草稿已保留。</span><button type="button" disabled={!active || closing} onClick={() => void closePane()}>重试关闭</button></div>}
  </div>
}
