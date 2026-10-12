import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUp, Blocks, Bot, Brain, Check, ChevronDown, Circle, CircleAlert, FileText, FolderOpen, Hand, Lightbulb, LoaderCircle, MessageSquare, Minimize2, Package, Paperclip, Plus, RefreshCw, Search, Settings2, ShieldAlert, ShieldCheck, Square, Target, Wrench, X } from 'lucide-react'
import { isModelProviderAvailable, shouldSendWithShortcut, type HarnessContextUsage, type HarnessFileReference, type HarnessMessageSubmissionOptions, type HarnessQueuedMessage, type HarnessSubtaskRole, type ModelSelection, type PermissionMode, type SendShortcut } from '../../../../../src/config/harness'
import { MIRA_SUBTASK_AGENTS } from '../../../../../src/config/miraAgents'
import { parseMiraGoalCommand } from '../../../../../src/config/miraGoals'
import type { PilotController } from '../../state/pilot-state'
import { cn } from '../../lib/utils'
import { appendComposerReferences, createMiraComposerDraftWriter, mergeComposerDrafts, readComposerDrafts, withoutComposerDraftOwners, type ComposerDraftConfig, type ComposerDraftSnapshot, type ComposerDraftSubmission, type ComposerTaskDraft } from '../../lib/composer-drafts'
import { applyComposerReasoning, COMPOSER_REASONING_CHOICES } from '../../lib/model-reasoning'
import { filePreviewKind } from '../../lib/file-preview'
import { bestMiraSuggestionIndex, filterMiraSuggestions, findMiraPromptToken, formatMiraConversationReference, insertMiraPromptTrigger, miraPromptReplacementRange, nextMiraSuggestionIndex, type MiraPromptRange, type MiraPromptToken, type MiraPromptTrigger } from '../../lib/prompt-input-triggers'
import { ComposerControlHint } from './ComposerControlHint'
import { ComposerSuggestionPanel, type ComposerSuggestion, type ComposerSuggestionSection } from './ComposerSuggestionPanel'
import { useComposerCatalogs } from './useComposerCatalogs'
import { HarnessMessageQueue } from './HarnessMessageQueue'
import { MiraBranchPicker } from '../git/MiraBranchPicker'
import { MiraComposerAttachments } from './MiraComposerAttachments'
import { attachmentImageType, MIRA_PASTED_TEXT_THRESHOLD, MIRA_TEXT_FILE_BYTES, readAttachmentFile, validateAttachmentFiles } from '../../lib/attachment-input'
import { MiraPromptEditor, type MiraPromptEditorHandle } from './MiraPromptEditor'
import { createMiraPromptDocument, replaceMiraPromptDocumentRange, serializeMiraPromptDocument, validateMiraPromptDocument, type MiraPromptDocument, type MiraPromptPart } from '../../lib/prompt-editor-document'
import { miraSelectionPrompt, type MiraConversationSelection } from '../../lib/mira-conversation-selection'
import { miraBrowserPrompt, miraBrowserPromptBody, miraBrowserReferences, restoreMiraBrowserPromptDocument, withMiraBrowserReferences } from '../../lib/mira-browser-reference'
import type { MiraBrowserElementReference } from '../../../../../src/platform/miraBrowserPicker'
import { MiraBrowserContexts } from './MiraBrowserContexts'
import { MiraModelMenu } from './MiraModelMenu'
import { MiraContextUsage } from './MiraContextUsage'
import { useMiraComposerMenuFocus } from '../../hooks/useMiraComposerMenuFocus'
import { useMiraComposerToolbar } from '../../hooks/useMiraComposerToolbar'
import { useMiraPromptHistory } from '../../hooks/useMiraPromptHistory'
import { miraSkillReference } from '../../lib/mira-skill-reference'
import { miraPluginCommandReference, miraPluginReference, restoreMiraPluginReferences } from '../../lib/mira-plugin-reference'
import { miraAgentReference, miraPluginAgentReference, miraUserAgentReference, restoreMiraAgentReferences } from '../../lib/mira-agent-reference'

const PERMISSIONS: Array<{ value: PermissionMode; label: string; description: string }> = [
  { value: 'default', label: '逐次确认', description: '工具执行前由你确认' },
  { value: 'auto-approve', label: '自动审核', description: '自动审核常规操作，保留危险操作拦截' },
  { value: 'full', label: '完全访问', description: '跳过工具确认，保留危险命令拦截' },
]
const DRAFT_PREFERENCE_KEY = 'harness-react-composer-drafts'

export interface HarnessComposerHandle {
  addBrowserElement(reference: MiraBrowserElementReference): boolean
  addConversationSelection(reference: MiraConversationSelection): boolean
  prepareSession(isCurrent?: () => boolean): Promise<string | undefined>
  addFileReference(sessionId: string, path: string): void
  withdrawPendingGuide(itemId: string): Promise<void>
  startDraft(groupId?: string, projectId?: string, isCurrent?: () => boolean, pluginId?: string): Promise<boolean>
  openDraft(id?: string, isCurrent?: () => boolean): Promise<boolean>
  closeDraft(id: string): Promise<void>
}

type HarnessComposerProps = {
  state: ReturnType<PilotController['getSnapshot']>
  controller: PilotController
  planning: boolean
  setPlanning: (value: boolean) => void
  draftProjectId?: string
  onDraftProjectChange?: (projectId?: string) => void
  active?: boolean
  keyboardActive?: boolean
  draftPreferenceKey?: string
  selectionSourceSessionId?: string
  onReady?: () => void
  onOpenSideConversation?: () => Promise<void>
  onShowConfirmation?: (sessionId: string) => void
  onShowGoal?: () => void
  interactionSlot?: ReactNode
  leadingActions?: ReactNode
  navigationSaveFailed?: boolean
  onDraftChange?: (draft: ComposerTaskDraft | null | undefined) => void
  onDraftAccepted?: (sessionId: string, draft: ComposerTaskDraft) => Promise<void>
}

export const HarnessComposer = forwardRef<HarnessComposerHandle, HarnessComposerProps>(function HarnessComposer({ state, controller, planning, setPlanning, draftProjectId, onDraftProjectChange, active = true, keyboardActive = active, draftPreferenceKey = DRAFT_PREFERENCE_KEY, selectionSourceSessionId, onReady, onOpenSideConversation, onShowConfirmation, onShowGoal, interactionSlot, leadingActions, navigationSaveFailed = false, onDraftChange, onDraftAccepted }, ref) {
  const interactionBlocked = Boolean(interactionSlot)
  const wasInteractionBlocked = useRef(false)
  const sessionId = state.session?.id
  const draftKey = sessionId || 'draft'
  const userAgentOwner = JSON.stringify([draftKey, state.session?.projectId ?? draftProjectId, state.session?.workingDirectory])
  const [knownUserAgents, setKnownUserAgents] = useState<{ owner: string; names: string[] }>({ owner: '', names: [] })
  const draftWriter = useMemo(() => createMiraComposerDraftWriter(controller, draftPreferenceKey), [controller, draftPreferenceKey])
  const hydratedDraftOwner = useRef(sessionId)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const compactionOperation = useRef(false)
  const [compactionPending, setCompactionPending] = useState<string>()
  const [compactionNotice, setCompactionNotice] = useState<{ owner: string, revision: number, text: string, queued?: boolean }>()
  const [permissions, setPermissions] = useState<Record<string, PermissionMode>>({})
  const [fileDrafts, setFileDrafts] = useState<Record<string, HarnessFileReference[]>>({})
  const [documents, setDocuments] = useState<Record<string, MiraPromptDocument | undefined>>({})
  const [draftPermission, setDraftPermission] = useState<PermissionMode>('default')
  const [draftSkillIds, setDraftSkillIds] = useState<string[]>([])
  const [draftMcpIds, setDraftMcpIds] = useState<string[]>([])
  const [draftDelegation, setDraftDelegation] = useState(true)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [preferencesError, setPreferencesError] = useState(false)
  const [preferencesRetry, setPreferencesRetry] = useState(0)
  const editedConfig = useRef(new Set<keyof ComposerDraftConfig>())
  const preferencesLoad = useRef<Promise<void> | undefined>(undefined)
  const preferencesReady = useRef(false)
  const preferencesCycle = useRef(0)
  const [busy, setBusy] = useState(false)
  const [composerError, setComposerError] = useState('')
  const [draftSaveError, setDraftSaveError] = useState(false)
  const [dismissedHostError, setDismissedHostError] = useState<string>()
  const busyRef = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active
  const submittingRef = useRef(new Set<string>())
  const [submitting, setSubmitting] = useState<string[]>([])
  const [submissions, setSubmissions] = useState<Record<string, ComposerDraftSubmission | undefined>>({})
  const [taskDraft, setTaskDraftState] = useState<ComposerTaskDraft | null>()
  const [draftFocusRequest, setDraftFocusRequest] = useState<{ draftId: string; ownerId?: string; isCurrent?: () => boolean }>()
  const [queueConfirmation, setQueueConfirmation] = useState<{ ownerId: string; revision: number; itemIds: string[]; delivery?: 'immediate' }>()
  const queueConfirmationRef = useRef(queueConfirmation)
  queueConfirmationRef.current = queueConfirmation
  const [primaryModifierPressed, setPrimaryModifierPressed] = useState(false)
  const [sendHintOpen, setSendHintOpen] = useState(false)
  const pointerReverseRef = useRef(false)
  const withdrawalRef = useRef(new Set<string>())
  const [withdrawals, setWithdrawals] = useState<string[]>([])
  const resumeRef = useRef(new Set<string>())
  const [resuming, setResuming] = useState<string[]>([])
  const reorderRef = useRef(new Set<string>())
  const [reordering, setReordering] = useState<string[]>([])
  const sendNowRef = useRef(new Set<string>())
  const [sendingNow, setSendingNow] = useState<string[]>([])
  const [recoveries, setRecoveries] = useState<Record<string, HarnessQueuedMessage[]>>({})
  const [recoverySaveErrors, setRecoverySaveErrors] = useState<Record<string, string>>({})
  const recoveryWriteRef = useRef(new Set<string>())
  const [recoveryWrites, setRecoveryWrites] = useState<string[]>([])
  const [contextOpen, setContextOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [panelFilter, setPanelFilter] = useState<'skills' | 'mcp' | null>(null)
  const [mcpReconnecting, setMcpReconnecting] = useState<string[]>([])
  const mcpReconnects = useRef(new Set<string>())
  const [projectQuery, setProjectQuery] = useState('')
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<string>()
  const [dismissedToken, setDismissedToken] = useState('')
  const [focusedEditorKey, setFocusedEditorKey] = useState<string>()
  const [caret, setCaret] = useState<MiraPromptRange>({ start: 0, end: 0 })
  const [tokenSelectionSnapshot, setTokenSelectionSnapshot] = useState<{ owner: string; text: string; token: MiraPromptToken } | null>(null)
  const menuSelection = useRef<MiraPromptRange>({ start: 0, end: 0 })
  const textRevision = useRef(0)
  const ownerTextRevisions = useRef(new Map<string, number>())
  const referenceRead = useRef(false)
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [attachmentReadiness, setAttachmentReadiness] = useState<{ ownerId?: string; paths: string; blocked: boolean }>({ paths: '', blocked: true })
  const [dragOver, setDragOver] = useState(false)
  const [failedUpload, setFailedUpload] = useState<{ files?: File[]; path?: string; onSelected?: (files: HarnessFileReference[], owner: string) => void }>()
  const failedUploadRef = useRef(failedUpload)
  failedUploadRef.current = failedUpload
  const dragDepth = useRef(0)
  const attachmentOperation = useRef<Promise<boolean> | undefined>(undefined)
  const attachmentMounted = useRef(true)
  const [sendShortcut, setSendShortcut] = useState<SendShortcut>('enter')
  const [showContextUsage, setShowContextUsage] = useState(true)
  const [followupMode, setFollowupMode] = useState<'queue' | 'guide'>('queue')
  const editorRef = useRef<MiraPromptEditorHandle>(null)
  const toolbarRef = useMiraComposerToolbar()
  const programmaticPromptChange = useRef(false)
  const migratingDraft = useRef<string | undefined>(undefined)
  const editorIdentity = useRef({ owner: draftKey, key: draftKey })
  const inlineAttachmentCache = useRef(new Map<string, HarnessFileReference>())
  const contextTriggerRef = useRef<HTMLButtonElement>(null)
  const suggestionContentRef = useRef<HTMLDivElement>(null)
  const [suggestionListId] = useState(() => `mira-composer-suggestions-${crypto.randomUUID()}`)
  const contextOwnerRef = useRef(draftKey)
  const draftSnapshot = useMemo<ComposerDraftSnapshot>(() => ({
    drafts, fileDrafts, documents, recoveries, submissions, permissions,
    ...(taskDraft !== undefined ? { draft: taskDraft } : {}),
    config: { permission: draftPermission, skillIds: draftSkillIds, mcpIds: draftMcpIds, delegation: draftDelegation, planning, projectId: draftProjectId },
  }), [drafts, fileDrafts, documents, recoveries, submissions, permissions, taskDraft, draftPermission, draftSkillIds, draftMcpIds, draftDelegation, planning, draftProjectId])
  const latestDraftSnapshot = useRef(draftSnapshot)
  latestDraftSnapshot.current = draftSnapshot
  const removedDraftOwners = useRef(new Set<string>())
  const draft = drafts[draftKey] ?? ''
  const promptDocument = useMemo(() => restoreMiraAgentReferences(documents[draftKey] ?? restoreMiraBrowserPromptDocument(draft), knownUserAgents.owner === userAgentOwner ? knownUserAgents.names : []), [documents, draftKey, draft, knownUserAgents, userAgentOwner])
  const editorDocument = useMemo(() => miraBrowserPromptBody(promptDocument), [promptDocument])
  const editorText = serializeMiraPromptDocument(editorDocument)
  const browserReferences = useMemo(() => miraBrowserReferences(promptDocument), [promptDocument])
  if (editorIdentity.current.owner !== draftKey) {
    const migration = editorIdentity.current.owner === 'draft' && state.session?.draftState === 'prepared' && Boolean(taskDraft && (taskDraft.sessionId === sessionId || taskDraft.id === migratingDraft.current))
    editorIdentity.current = { owner: draftKey, key: migration ? editorIdentity.current.key : draftKey }
  }
  const editorKey = editorIdentity.current.key
  const references = fileDrafts[draftKey] ?? []
  const nativeGoalCommand = useMemo(() => {
    if (references.length || promptDocument.parts.some(part => part.type === 'reference')) return undefined
    try { return parseMiraGoalCommand(draft) } catch { return undefined }
  }, [draft, references, promptDocument])
  const localGoalControl = nativeGoalCommand && nativeGoalCommand.action !== 'set'
  const attachmentPaths = JSON.stringify(references.map(file => file.path))
  const attachmentBlocked = controller.supportsAttachments && references.length > 0 && (attachmentReadiness.ownerId !== sessionId || attachmentReadiness.paths !== attachmentPaths || attachmentReadiness.blocked)
  const onAttachmentsBlocked = useMemo(() => (blocked: boolean) => setAttachmentReadiness({ ownerId: sessionId, paths: attachmentPaths, blocked }), [sessionId, attachmentPaths])
  const hasInput = Boolean(draft.trim() || references.length)
  const pendingSubmission = submissions[draftKey]
  const retriesSubmission = Boolean(pendingSubmission && pendingSubmission.text === draft.trim() && JSON.stringify(pendingSubmission.references) === JSON.stringify(references))
  // 会话配置是宿主快照的事实来源；切换任务时不能用本地空数组覆盖已持久化选择。
  const activeSkillIds = state.session?.activeSkillIds ?? (sessionId ? [] : draftSkillIds)
  const activeMcpIds = state.session?.activeMcpServerIds ?? (sessionId ? [] : draftMcpIds)
  const permission = permissions[draftKey] ?? state.session?.permissionMode ?? draftPermission
  const selectedProject = state.projects.find(project => project.id === (state.session?.projectId ?? draftProjectId))
  const availableModels = choices(state)
  const selectedModel = availableModels.find(model => model.providerId === state.selection?.providerId && model.modelId === state.selection?.modelId)
  const reasoningLevel = state.selection?.thinkingLevel ?? 'medium'
  const reasoningLabel = COMPOSER_REASONING_CHOICES.find(item => item.value === reasoningLevel)?.label ?? reasoningLevel
  const queueSupported = controller.supportsMessageQueue
  const submissionOptionsSupported = controller.supportsQueueSubmissionOptions
  const appleKeyboard = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  const confirmationPending = Boolean(state.permission || state.session?.pendingInteraction?.status === 'waiting')
  const sendingBlocked = interactionBlocked || !active || !preferencesLoaded || busy || submitting.includes(draftKey) || recoveryWrites.includes(draftKey) || Boolean(recoverySaveErrors[draftKey]) || state.sessionLoading || !state.selection && (!localGoalControl || nativeGoalCommand.action === 'resume') || !localGoalControl && !queueSupported && (state.running || confirmationPending)
  const configurationUnavailable = !preferencesLoaded || busy || submitting.includes(draftKey) || state.sessionLoading || state.running || confirmationPending
  const configBlocked = !active || configurationUnavailable
  const compactQueued = Boolean(state.queue?.items.some(item => item.operation === 'context-compaction'))
  const compactRunning = state.session?.activeRun?.kind === 'context-compaction'
  const compactBlocked = Boolean(!active || !preferencesLoaded || busy || submitting.includes(draftKey) || state.sessionLoading || compactionOperation.current || compactQueued || compactRunning)
  const nextConfigBlocked = interactionBlocked || !active || !preferencesLoaded || busy || state.sessionLoading || !queueSupported && (state.running || confirmationPending)
  const permissionBlocked = submissionOptionsSupported ? nextConfigBlocked : configBlocked
  const contextBlocked = nextConfigBlocked
  const inputBlocked = interactionBlocked || !active || state.sessionLoading || busy
  const menuFocus = { ownerKey: draftKey, active: active && !interactionBlocked && !state.sessionLoading, ready: !inputBlocked, onReturnFocus: () => editorRef.current?.focus() }
  const projectMenuFocus = useMiraComposerMenuFocus({ ...menuFocus, open: active && projectOpen })
  const permissionMenuFocus = useMiraComposerMenuFocus({ ...menuFocus, open: active && modeOpen })
  const reasoningMenuFocus = useMiraComposerMenuFocus({ ...menuFocus, open: active && reasoningOpen })
  const fileDirectory = sessionId ? state.session?.workingDirectory : selectedProject?.directory
  const promptHistory = useMiraPromptHistory(controller, { sessionId, projectId: sessionId ? undefined : selectedProject?.id, directory: fileDirectory }, editorText, active && preferencesLoaded && !inputBlocked, state.promptHistoryRevision ?? state.queue?.revision)
  const visibleError = composerError || (state.error !== dismissedHostError ? state.error : '') || (!navigationSaveFailed && draftSaveError ? '草稿自动保存失败，当前输入已保留；继续编辑可再次保存。' : '') || promptHistory.error
  const activeToken = useMemo(() => {
    const previous = tokenSelectionSnapshot?.owner === draftKey && tokenSelectionSnapshot.text === draft ? tokenSelectionSnapshot.token : null
    // Selection-only movement keeps the discovered query and replacement span, as in ZCode.
    const token = previous ? caret.start === caret.end && caret.start > previous.start && caret.start <= previous.end ? previous : null : findMiraPromptToken(editorText, caret.start, caret.end)
    if (!token) return null
    let offset = 0
    for (const part of editorDocument.parts) {
      const length = part.type === 'text' ? part.text.length : part.reference.text.length
      if (part.type === 'reference' && token.start < offset + length && token.end > offset) return null
      offset += length
    }
    return token
  }, [draft, editorText, draftKey, caret, editorDocument, tokenSelectionSnapshot])
  const tokenSignature = activeToken ? `${draftKey}:${activeToken.start}:${activeToken.end}:${activeToken.trigger}:${activeToken.query}` : ''
  const suggestionsOpen = !contextBlocked && (contextOpen || Boolean(!promptHistory.isBrowsing() && focusedEditorKey === editorKey && activeToken && dismissedToken !== tokenSignature))
  const suggestionQuery = contextOpen ? '' : activeToken?.query || ''
  const kind = contextOpen ? panelFilter : activeToken?.trigger
  const includeFiles = kind === '@' || contextOpen && !panelFilter
  const agentUnavailable = !fileDirectory ? '先选择项目' : planning ? '计划模式下不可委派' : (state.session?.delegationEnabled ?? draftDelegation) === false ? '子任务委派已关闭' : undefined
  const catalogs = useComposerCatalogs(controller, { sessionId, projectId: sessionId ? undefined : selectedProject?.id, directory: fileDirectory, draftId: sessionId ? undefined : taskDraft?.id }, suggestionQuery, suggestionsOpen && kind !== '#', includeFiles, kind === '/' ? 'commands' : kind === '$' || kind === 'skills' ? 'skills' : kind === 'mcp' ? 'mcp' : kind === '@' || contextOpen && !panelFilter ? 'plugins' : 'all')
  useEffect(() => {
    if (catalogs.userAgents.status !== 'ready') return
    const names = catalogs.userAgents.items.filter(agent => agent.enabled && !agent.shadowed && !agent.unavailableReason).map(agent => agent.name)
    setKnownUserAgents(previous => previous.owner === userAgentOwner && JSON.stringify(previous.names) === JSON.stringify(names) ? previous : { owner: userAgentOwner, names })
  }, [catalogs.userAgents.items, catalogs.userAgents.status, userAgentOwner])
  const slashCommands = [
    ...(controller.supportsGoals && !state.session?.parentSessionId ? [{ id: 'goal', label: '/goal', description: '设置持续目标，逐轮核验完成情况', keywords: 'goal target 目标', icon: <Target size={16} /> }] : []),
    ...(!state.session?.parentSessionId && fileDirectory && !planning ? [{ id: 'workflow', label: '/workflow', description: '用工作流编排任务，审阅流程图后运行', keywords: 'workflow 工作流 编排', icon: <Blocks size={16} /> }] : []),
    { id: 'files', label: '/files', description: '添加文件附件', icon: <Paperclip size={16} /> },
    { id: 'skills', label: '/skills', description: '引用技能到本次消息', icon: <Wrench size={16} /> },
    { id: 'mcp', label: '/mcp', description: '查看 MCP 状态与此会话的服务选择', icon: <Blocks size={16} /> },
    { id: 'model', label: '/model', description: '切换模型', icon: <Brain size={16} /> },
    ...(controller.supportsContextCompaction && sessionId && state.session?.draftState !== 'prepared' && !state.session?.archivedAt ? [{ id: 'compact', label: '/compact', description: compactQueued || compactRunning ? '上下文压缩已在运行或排队' : state.running || confirmationPending || state.queue?.items.length ? '加入待发送，按顺序压缩上下文' : '压缩较早上下文，保留最近对话和完整历史', keywords: 'compact compress 压缩 上下文', icon: <Minimize2 size={16} /> }] : []),
    ...(selectedModel?.reasoning ? [{ id: 'thinking', label: '/thinking', description: '调整推理强度', icon: <Brain size={16} /> }] : []),
    { id: 'plan', label: '/plan', description: planning ? '关闭计划模式' : '开启计划模式', icon: <Lightbulb size={16} /> },
    ...(onOpenSideConversation && sessionId && !state.session?.parentSessionId && state.session?.draftState !== 'prepared' ? [{ id: 'side', label: '/side', description: '在右侧新建独立旁路对话', keywords: '旁路 辅助对话 side chat', icon: <MessageSquare size={16} /> }] : []),
    { id: 'delegation', label: '/delegation', description: (state.session?.delegationEnabled ?? draftDelegation) ? '关闭子任务委派' : '开启子任务委派', icon: <Blocks size={16} /> },
    ...(sessionId ? [{ id: 'memory', label: '/memory', description: '保存项目记忆', icon: <FileText size={16} /> }] : []),
    { id: 'perm', label: '/perm', description: '切换权限模式', icon: <Hand size={16} /> },
  ].map(command => ({ ...command, disabled: command.id === 'compact' ? compactBlocked : command.id === 'perm' ? permissionBlocked : configBlocked && ['delegation', 'memory'].includes(command.id), id: `command-${command.id}`, action: { type: 'command' as const, value: command.id } }))
  const suggestionSections: ComposerSuggestionSection[] = []
  if (contextOpen && !panelFilter) suggestionSections.push({ id: 'add', title: '添加', items: [
    { id: 'attach-files', label: '添加文件附件', description: controller.supportsAttachments ? '图片或文本文件' : selectedProject ? '文本文件' : '先选择项目', icon: <Paperclip size={16} />, action: { type: 'command', value: 'files' } },
    ...(controller.supportsGoals && !sessionId && editorText === '' && !references.length ? [{ id: 'add-goal', label: '目标', description: '设置持续目标，逐轮核验完成情况', icon: <Target size={16} />, action: { type: 'command' as const, value: 'goal' } }] : []),
    { id: 'open-commands', label: '命令与能力', description: '/', icon: <Wrench size={16} />, action: { type: 'command', value: 'open-commands' } },
  ] })
  if (kind === '/') suggestionSections.push({ id: 'commands', title: 'Mira 命令', items: filterMiraSuggestions(slashCommands, suggestionQuery), empty: '没有匹配的 Mira 命令' })
  if (kind === '/' && controller.supportsPromptCommands) {
    const atStart = Boolean(activeToken && !editorText.slice(0, activeToken.start).trim())
    suggestionSections.push({ id: 'custom-commands', title: '自定义命令', items: atStart ? filterMiraSuggestions(catalogs.commands.items.map(command => ({ id: `custom-command-${command.id}`, label: `/${command.name}`, keywords: `${command.name} ${command.description}`, description: command.unavailableReason || (command.shadowed ? '被同名项目命令覆盖' : `${command.scope === 'project' ? '当前项目' : '全局'} · ${[command.argumentHint, command.description].filter(Boolean).join(' · ')}`), disabled: Boolean(command.unavailableReason || command.shadowed), icon: <Wrench size={16} />, action: { type: 'prompt-command' as const, value: command.name } })), suggestionQuery) : [], loading: catalogs.commands.status === 'loading', error: catalogs.commands.error, onRetry: catalogs.reload, empty: atStart ? '还没有自定义命令，可在设置中创建' : '自定义命令需放在消息开头' })
    suggestionSections.push({ id: 'custom-command-actions', title: '管理', items: filterMiraSuggestions([{ id: 'manage-commands', label: '管理自定义命令', description: '创建、编辑或删除全局与项目命令', icon: <Settings2 size={16} />, action: { type: 'command' as const, value: 'manage-commands' } }], suggestionQuery) })
  }
  if (kind === '/' && controller.supportsPlugins) {
    const atStart = Boolean(activeToken && !editorText.slice(0, activeToken.start).trim())
    const commands = atStart ? filterMiraSuggestions(catalogs.plugins.items.flatMap(plugin => (plugin.commands || []).map(command => ({
      id: `plugin-command-${plugin.id}-${command.name}`, label: `/${plugin.name}:${command.name}`, keywords: `${plugin.name} ${command.name} ${command.description}`,
      description: plugin.error || (plugin.conflicts.length ? '同名插件冲突，请先停用其中一个' : command.unavailableReason || (catalogs.commands.items.some(item => item.name === `${plugin.name}:${command.name}` && !item.shadowed) ? '被同名自定义命令覆盖' : [command.argumentHint, command.description].filter(Boolean).join(' · '))),
      disabled: Boolean(plugin.error || plugin.conflicts.length || command.unavailableReason || catalogs.commands.items.some(item => item.name === `${plugin.name}:${command.name}` && !item.shadowed)), icon: <Wrench size={16} />, action: { type: 'plugin-command' as const, value: `${plugin.name}:${command.name}` },
    }))), suggestionQuery) : []
    suggestionSections.push({ id: 'plugin-commands', title: commands.length > 40 ? '插件命令 · 前 40 项，请输入名称筛选' : '插件命令', items: commands.slice(0, 40), loading: catalogs.plugins.status === 'loading', error: catalogs.plugins.error, onRetry: catalogs.reload, empty: !atStart ? '插件命令需放在消息开头' : '没有匹配的插件命令；可在插件市场添加' })
  }
  if (controller.supportsPlugins && (kind === '@' || contextOpen && !panelFilter)) suggestionSections.push({ id: 'plugins', title: '插件 Skill', items: filterMiraSuggestions(catalogs.plugins.items.filter(plugin => plugin.skills.length || !plugin.agents?.length && !plugin.commands?.length).map(plugin => ({ id: `plugin-${plugin.id}`, label: plugin.name, keywords: plugin.id, description: plugin.error || (plugin.conflicts.length ? '同名插件冲突，请在市场中停用其中一个' : !plugin.skills.length ? '此插件在当前会话中没有可用能力' : plugin.description), disabled: Boolean(plugin.error || plugin.conflicts.length || !plugin.skills.length), icon: <Blocks size={16} />, action: { type: 'plugin' as const, value: plugin.id } })), suggestionQuery), loading: catalogs.plugins.status === 'loading', error: catalogs.plugins.error, onRetry: catalogs.reload, empty: '没有匹配的插件 Skill；插件智能体在下方，命令通过 / 选择' })
  if (kind !== '/' && kind !== '$' && kind !== 'skills' && kind !== 'mcp') {
    if (kind !== '#') suggestionSections.push({ id: 'files', title: catalogs.files.truncated ? '文件（前 40 项）' : '文件', items: catalogs.files.items.map(file => ({ id: `file-${file.path}`, label: file.name, description: filePreviewKind(file.path) === 'bitmap' && !attachmentImageType(file.path) ? '请先转换为 PNG、JPEG、GIF 或 WebP' : file.path, disabled: filePreviewKind(file.path) === 'bitmap' && (!controller.supportsAttachments || !attachmentImageType(file.path)), icon: <FileText size={16} />, action: { type: 'file', value: file.path } })), loading: catalogs.files.status === 'loading', error: catalogs.files.error, onRetry: catalogs.reload, empty: !sessionId && !selectedProject ? '请先选择项目，再引用工作区文件' : !fileDirectory ? '当前任务没有可用工作目录' : '没有匹配的文件' })
    const currentProjectId = state.session?.projectId ?? draftProjectId
    // All indexed Mira projects use this controller's local authority; @ stays in its workspace.
    const sessions = state.sessions.filter(session => session.id !== sessionId && (kind === '#' || session.projectId === currentProjectId))
    if (kind === '#') sessions.sort((left, right) => Number(right.projectId === currentProjectId) - Number(left.projectId === currentProjectId) || right.updatedAt - left.updatedAt || right.createdAt - left.createdAt || left.title.localeCompare(right.title))
    const projectCounts = new Map<string | undefined, number>()
    const items = filterMiraSuggestions(sessions.map(session => ({ id: `session-${session.id}`, label: session.title, description: kind === '#' ? state.projects.find(project => project.id === session.projectId)?.name || (session.projectId ? '项目对话' : '个人工作区') : '引用对话正文', keywords: session.id, projectId: session.projectId, icon: <MessageSquare size={16} />, action: { type: 'session' as const, value: session.id } })), suggestionQuery).filter(item => {
      if (kind !== '#') return true
      const count = projectCounts.get(item.projectId) || 0
      projectCounts.set(item.projectId, count + 1)
      return count < 20
    })
    suggestionSections.push({ id: 'sessions', title: kind === '#' ? '对话 · 各项目最多 20 项' : '对话', items, empty: kind === '#' ? '没有匹配的本地对话' : '当前工作区暂无可引用对话' })
  }
  if (kind === '$' || kind === 'skills' || kind === '/') suggestionSections.push({ id: 'skills', title: '技能', items: filterMiraSuggestions(catalogs.skills.items.map(skill => ({ id: `skill-${skill.id}`, label: skill.name, description: skill.description, disabled: contextBlocked, icon: <Wrench size={16} />, action: { type: 'skill' as const, value: skill.id } })), suggestionQuery), loading: catalogs.skills.status === 'loading', error: catalogs.skills.error, onRetry: catalogs.reload, empty: '没有匹配的已启用技能' })
  if (kind === '/' || kind === '@' || contextOpen && !panelFilter) {
    if (controller.supportsUserAgents) {
      suggestionSections.push({ id: 'user-agents', title: `自定义智能体${agentUnavailable ? ` · ${agentUnavailable}` : ' · 引用后由主 Agent 按需委派'}`, items: filterMiraSuggestions(catalogs.userAgents.items.map(agent => ({ id: `user-agent-${agent.id}`, label: agent.name, keywords: `${agent.description} ${agent.scope} agent subagent`, description: agent.unavailableReason || (agent.shadowed ? '被同名项目智能体覆盖' : !agent.enabled ? '已停用，可在设置中启用' : `${agent.scope === 'project' ? '当前项目' : '全局'} · ${agent.description}`), disabled: Boolean(agentUnavailable || agent.unavailableReason || agent.shadowed || !agent.enabled), icon: <Bot size={16} />, action: { type: 'agent' as const, value: agent.name } })), suggestionQuery), loading: catalogs.userAgents.status === 'loading', error: catalogs.userAgents.error, onRetry: catalogs.reload, empty: '没有匹配的自定义智能体，可在设置中创建' })
      suggestionSections.push({ id: 'user-agent-actions', title: '管理', items: filterMiraSuggestions([{ id: 'manage-agents', label: '管理智能体', description: '创建、编辑或启停全局与项目智能体', icon: <Settings2 size={16} />, action: { type: 'command' as const, value: 'manage-agents' } }], suggestionQuery) })
    }
    suggestionSections.push({ id: 'agents', title: `子智能体${agentUnavailable ? ` · ${agentUnavailable}` : ' · 引用后由主 Agent 按需委派'}`, items: filterMiraSuggestions([
    ...Object.entries(MIRA_SUBTASK_AGENTS).map(([role, agent]) => ({ id: `agent-${role}`, label: role, keywords: `${agent.label} agent subagent`, description: `内置 · ${agent.label} · ${agent.description}`, disabled: Boolean(agentUnavailable), icon: <Bot size={16} />, action: { type: 'agent' as const, value: role } })),
    ...catalogs.plugins.items.flatMap(plugin => (plugin.agents || []).map(agent => ({ id: `plugin-agent-${plugin.id}-${agent.name}`, label: agent.name, keywords: `${plugin.name} ${plugin.id} ${agent.description} agent subagent`, description: plugin.error || (plugin.conflicts.length ? '同名插件冲突，请先停用其中一个' : agent.unavailableReason || `插件 ${plugin.name} · ${agent.description}`), disabled: Boolean(agentUnavailable || plugin.error || plugin.conflicts.length || agent.unavailableReason), icon: <Bot size={16} />, action: { type: 'agent' as const, value: agent.name } }))),
  ], suggestionQuery), loading: catalogs.plugins.status === 'loading', error: catalogs.plugins.error, onRetry: catalogs.reload, empty: '没有匹配的子智能体；可在插件市场添加' })
  }
  if (kind === 'mcp') {
    suggestionSections.push({ id: 'mcp', title: state.running ? 'MCP 服务 · 当前运行中，服务选择暂不可修改' : 'MCP 服务 · 选择仅影响此会话', items: filterMiraSuggestions(catalogs.mcp.items.map(server => {
      const source = server.source
      const scoped = Boolean(source)
      const sourceName = source?.kind === 'plugin' ? source.pluginName : source?.kind === 'project' ? source.projectName : ''
      const sourceLabel = source?.kind === 'plugin' ? `插件 ${sourceName}` : source?.kind === 'project' ? `项目 ${sourceName}` : ''
      const connection = mcpReconnecting.includes(server.id) ? { state: 'connecting' as const, toolCount: 0 } : server.connection
      const status = server.unavailableReason || (!server.enabled ? '已停用' : scoped && (!connection || connection.state === 'disconnected') ? '任务启动时连接' : connection ? ({ connected: '已连接', connecting: '连接中', failed: '连接失败', disconnected: '未连接', 'authorization-required': '等待授权，请在设置中打开授权', authorized: '已授权 · 任务启动时连接' } as const)[connection.state] : '状态未知')
      return { id: `mcp-${server.id}`, label: server.name, keywords: sourceName, description: `${sourceLabel ? `${sourceLabel} · ` : ''}${status}${connection ? ` · ${connection.toolCount} 个工具` : ''} · ${activeMcpIds.includes(server.id) ? '此会话已选' : '此会话未选'}${connection && 'error' in connection && connection.error ? ` · ${connection.error}` : ''}`, selected: activeMcpIds.includes(server.id), disabled: configBlocked || !server.enabled || Boolean(server.unavailableReason), icon: <span className="mira-mcp-connection" data-state={connection?.state ?? 'unknown'} aria-hidden="true">{connection?.state === 'connecting' ? <LoaderCircle size={14} className="animate-spin" /> : <Circle size={9} fill="currentColor" />}</span>, action: { type: 'mcp' as const, value: server.id } }
    }), suggestionQuery), loading: catalogs.mcp.status === 'loading', error: catalogs.mcp.error, onRetry: catalogs.reload, empty: '还没有已启用的 MCP 服务，可在管理页面添加' })
    const reconnectable = controller.supportsMcpReconnect ? catalogs.mcp.items.filter(server => !server.source && server.enabled && !server.unavailableReason && (mcpReconnecting.includes(server.id) || server.connection?.state === 'failed' || server.connection?.state === 'disconnected')) : []
    if (reconnectable.length) suggestionSections.push({ id: 'mcp-recovery', title: '连接恢复', items: filterMiraSuggestions(reconnectable.map(server => ({ id: `reconnect-mcp-${server.id}`, label: `${mcpReconnecting.includes(server.id) ? '正在重连' : '重连'} ${server.name}`, description: state.running ? '当前任务运行中，结束后可重连' : '仅重连此服务，保留其他连接', disabled: configBlocked || mcpReconnecting.includes(server.id), icon: mcpReconnecting.includes(server.id) ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />, action: { type: 'command' as const, value: `reconnect-mcp:${server.id}` } })), suggestionQuery) })
    suggestionSections.push({ id: 'mcp-actions', title: '管理', items: [
      { id: 'refresh-mcp', label: '刷新连接状态', icon: <RefreshCw size={16} />, action: { type: 'command', value: 'refresh-mcp' } },
      { id: 'manage-mcp', label: '管理 MCP 服务', description: '添加、编辑或启停服务', icon: <Settings2 size={16} />, action: { type: 'command', value: 'manage-mcp' } },
    ] })
  }
  const suggestionItems = suggestionSections.flatMap(section => section.items)
  const highlightedIndex = suggestionItems.findIndex(item => item.id === highlightedSuggestionId && !item.disabled)
  const suggestionIndex = highlightedIndex >= 0 ? highlightedIndex : bestMiraSuggestionIndex(suggestionItems, suggestionQuery)
  const selectedSuggestion = suggestionItems[suggestionIndex]

  useImperativeHandle(ref, () => ({
    async startDraft(groupId, projectId, isCurrent, pluginId) {
      await preferencesLoad.current
      if (!preferencesReady.current || isCurrent && !isCurrent()) return false
      const plugin = pluginId ? (await controller.listPlugins()).find(item => item.id === pluginId) : undefined
      if (isCurrent && !isCurrent()) return false
      if (pluginId && (!plugin || !plugin.enabled || plugin.error || plugin.conflicts.length || !plugin.skills.length)) throw new Error('插件已不可用，请回到插件市场检查启用状态与能力')
      const previous = latestDraftSnapshot.current.draft
      const ownerId = previous?.sessionId || 'draft'
      const submission = latestDraftSnapshot.current.submissions?.[ownerId]
      const unconfirmed = previous && (submittingRef.current.has(ownerId) || submission)
      if (plugin && unconfirmed) throw new Error('请先处理当前任务尚未确认的提交，再试用插件；原稿已保留')
      const text = latestDraftSnapshot.current.drafts[ownerId] ?? ''
      const document = plugin ? restoreMiraPluginReferences(validateMiraPromptDocument(latestDraftSnapshot.current.documents?.[ownerId], text) ?? restoreMiraBrowserPromptDocument(text)) : undefined
      const pluginIds = new Set(document?.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'plugin' ? [part.reference.value] : []))
      if (plugin && !pluginIds.has(plugin.id) && pluginIds.size >= 8) throw new Error('每条消息最多引用 8 个插件，请先移除已有引用')
      if (previous?.sessionId && controller.getSnapshot().session?.id !== previous.sessionId && !await controller.open(previous.sessionId, isCurrent)) return false
      if (isCurrent && !isCurrent()) return false
      if (previous && latestDraftSnapshot.current.draft?.id !== previous.id) return false
      if (unconfirmed) { setTaskDraft({ ...(submission?.draft ?? previous), visible: true }); requestDraftFocus(isCurrent); return true }
      if (previous?.sessionId && projectId && controller.getSnapshot().session?.projectId !== projectId) {
        await controller.moveSession(previous.sessionId, projectId)
        if (isCurrent && !isCurrent()) return false
        const current = controller.getSnapshot()
        if (current.error || current.session?.id !== previous.sessionId || current.session.projectId !== projectId) return false
      }
      const next: ComposerTaskDraft = { ...(previous ?? { id: crypto.randomUUID() }), groupId, visible: true }
      if (!next.sessionId) controller.newConversation()
      setTaskDraft(next)
      selectProject(next.sessionId ? controller.getSnapshot().session?.projectId : projectId ?? latestDraftSnapshot.current.config.projectId)
      if (plugin && document && !pluginIds.has(plugin.id)) {
        const nextDocument: MiraPromptDocument = { version: 1, parts: [...document.parts, ...(text && !/\s$/.test(text) ? [{ type: 'text' as const, text: ' ' }] : []), { type: 'reference', reference: miraPluginReference(plugin.id, plugin.name) }, { type: 'text', text: ' ' }] }
        const end = serializeMiraPromptDocument(nextDocument).length
        setPromptDocument(nextDocument, { start: end, end }, ownerId)
      }
      requestDraftFocus(isCurrent)
      return true
    },
    async openDraft(id, isCurrent) {
      await preferencesLoad.current
      if (!preferencesReady.current || isCurrent && !isCurrent()) return false
      const owner = latestDraftSnapshot.current.draft
      if (!owner) { if (id) return false; controller.newConversation(); return true }
      if (id && owner.id !== id) return false
      if (owner.sessionId && controller.getSnapshot().session?.id !== owner.sessionId && !await controller.open(owner.sessionId, isCurrent)) return false
      if (!owner.sessionId && (!isCurrent || isCurrent())) controller.newConversation()
      if ((!isCurrent || isCurrent()) && latestDraftSnapshot.current.draft?.id === owner.id) {
        if (owner.sessionId) selectProject(controller.getSnapshot().session?.projectId)
        if (id) requestDraftFocus(isCurrent)
        return true
      }
      return false
    },
    async closeDraft(id) {
      const owner = latestDraftSnapshot.current.draft
      if (!owner || owner.id !== id) return
      setTaskDraft({ ...owner, groupId: undefined, visible: false })
      await persistDrafts()
    },
    async withdrawPendingGuide(itemId) {
      const current = controller.getSnapshot()
      if (!sessionId || current.queue?.sessionId !== sessionId || !current.queue.items.some(item => item.id === itemId && item.sessionId === sessionId && item.delivery === 'guide')) return
      await withdrawQueuedMessage(itemId, true, true)
    },
    addBrowserElement(reference) {
      if (reference.sessionId !== sessionId || controller.getSnapshot().session?.id !== sessionId || !activeRef.current || !preferencesReady.current || busyRef.current || inputBlocked || queueConfirmation) return false
      const text = latestDraftSnapshot.current.drafts[draftKey] ?? ''
      const document = validateMiraPromptDocument(latestDraftSnapshot.current.documents?.[draftKey], text) ?? restoreMiraBrowserPromptDocument(text)
      const result = miraBrowserPrompt(reference, document)
      if ('error' in result) { setComposerError(result.error); return false }
      closeSuggestions()
      if (result.duplicate) { editorRef.current?.focus(); return true }
      const body = miraBrowserPromptBody(document), next = withMiraBrowserReferences(body, [...miraBrowserReferences(document), result.reference])
      if (serializeMiraPromptDocument(next).length > Math.max(100_000, text.length)) { setComposerError('引用后消息超过 100000 字符，请精简草稿'); return false }
      const position = Math.min(serializeMiraPromptDocument(body).length, editorRef.current?.getSelectionRange()?.end ?? caret.end)
      setPromptDocument(next, { start: position, end: position })
      setComposerError(''); focusInput(position)
      return true
    },
    addConversationSelection(reference) {
      if ((reference.sessionId !== sessionId && reference.sessionId !== selectionSourceSessionId) || controller.getSnapshot().session?.id !== sessionId || !activeRef.current || !preferencesReady.current || busyRef.current || inputBlocked || queueConfirmation) return false
      const text = latestDraftSnapshot.current.drafts[draftKey] ?? ''
      const document = validateMiraPromptDocument(latestDraftSnapshot.current.documents?.[draftKey], text) ?? restoreMiraBrowserPromptDocument(text)
      const result = miraSelectionPrompt(reference, document)
      if ('error' in result) { setComposerError(result.error); return false }
      closeSuggestions()
      if (result.duplicate) { editorRef.current?.focus(); return true }
      const position = Math.max(0, Math.min(text.length, editorRef.current?.getSelectionRange()?.end ?? caret.end))
      // Quoting appends at the saved caret; it never replaces an existing draft selection.
      const added = applyPromptParts({ start: position, end: position }, [{ type: 'reference', reference: result.reference }, { type: 'text', text: ' ' }])
      if (added) setComposerError('')
      return added
    },
    addFileReference(ownerId, path) {
      if (ownerId !== sessionId || !preferencesReady.current || inputBlocked) return
      if (controller.supportsAttachments) { void selectFiles(draft, undefined, path); return }
      try {
        const references = appendComposerReferences(latestDraftSnapshot.current.fileDrafts[ownerId] ?? [], [{ path, name: path.split('/').pop() || path }])
        setReferences(references, ownerId)
        setComposerError('')
      } catch (error) { setComposerError(error instanceof Error ? error.message : String(error)); return }
      editorRef.current?.focus()
    },
    async prepareSession(isCurrent) {
      if (configurationUnavailable || !active && !isCurrent || isCurrent && !isCurrent() || busyRef.current || controller.getSnapshot().sessionLoading) return undefined
      busyRef.current = true; setBusy(true); setComposerError(''); setDismissedHostError(undefined)
      try { return await ensureSession(draft, isCurrent) }
      catch (error) { if (!isCurrent || isCurrent()) setComposerError(`准备任务失败：${error instanceof Error ? error.message : String(error)}`); return undefined }
      finally { busyRef.current = false; setBusy(false) }
    },
  }))

  useEffect(() => { if (preferencesLoaded) onReady?.() }, [preferencesLoaded, onReady])

  useEffect(() => { onDraftChange?.(taskDraft) }, [taskDraft, onDraftChange])

  useEffect(() => {
    let mounted = true
    const cycle = ++preferencesCycle.current
    preferencesReady.current = false
    setPreferencesLoaded(false); setPreferencesError(false)
    if (!failedUploadRef.current) setComposerError('')
    preferencesLoad.current = draftWriter.load().then(value => {
      if (cycle !== preferencesCycle.current) return
      const restored = withoutComposerDraftOwners(mergeComposerDrafts(readComposerDrafts(value), latestDraftSnapshot.current, editedConfig.current), removedDraftOwners.current)
      const ownerId = restored.draft?.sessionId
      // Input entered before hydration joins the recovered owner instead of becoming an inaccessible anonymous draft.
      if (ownerId && (ownerTextRevisions.current.get('draft') ?? 0) > 0 && latestDraftSnapshot.current.drafts.draft) {
        restored.drafts[ownerId] = [restored.drafts[ownerId], latestDraftSnapshot.current.drafts.draft].filter(Boolean).join('\n\n')
        // This merge joins independently edited texts; keep the text authoritative instead of guessing token ownership.
        restored.documents = { ...restored.documents, [ownerId]: undefined, draft: undefined }
        restored.drafts.draft = ''
        setDrafts(restored.drafts)
      }
      latestDraftSnapshot.current = restored
      preferencesReady.current = true
      if (!mounted) return
      setDrafts(previous => ({ ...restored.drafts, ...previous }))
      setFileDrafts(previous => ({ ...restored.fileDrafts, ...previous }))
      setDocuments(previous => ({ ...restored.documents, ...previous }))
      setRecoveries(previous => ({ ...restored.recoveries, ...previous }))
      setSubmissions(previous => ({ ...restored.submissions, ...previous }))
      setPermissions(previous => ({ ...restored.permissions, ...previous }))
      setTaskDraftState(restored.draft)
      if (!editedConfig.current.has('permission')) setDraftPermission(restored.config.permission)
      if (!editedConfig.current.has('skillIds')) setDraftSkillIds(restored.config.skillIds)
      if (!editedConfig.current.has('mcpIds')) setDraftMcpIds(restored.config.mcpIds)
      if (!editedConfig.current.has('delegation')) setDraftDelegation(restored.config.delegation)
      if (!editedConfig.current.has('planning')) setPlanning(restored.config.planning)
      if (!editedConfig.current.has('projectId')) onDraftProjectChange?.(restored.config.projectId)
      setPreferencesLoaded(true)
    })
    void preferencesLoad.current.catch(() => { if (mounted) { setComposerError('草稿读取失败，请重试；当前输入会保留。'); setPreferencesError(true) } })
    return () => {
      mounted = false
      void preferencesLoad.current?.then(() => {
        if (cycle === preferencesCycle.current) return draftWriter.save(latestDraftSnapshot.current)
      }).catch(() => undefined)
    }
  }, [controller, draftWriter, preferencesRetry])
  useEffect(() => { attachmentMounted.current = true; return () => { attachmentMounted.current = false } }, [])
  useEffect(() => {
    if (!draftFocusRequest || !active || inputBlocked || !preferencesLoaded) return
    let cancelled = false
    window.requestAnimationFrame(() => {
      if (cancelled || !attachmentMounted.current || !activeRef.current || busyRef.current) return
      const current = controller.getSnapshot()
      if (current.sessionLoading || current.session?.id !== draftFocusRequest.ownerId || latestDraftSnapshot.current.draft?.id !== draftFocusRequest.draftId || draftFocusRequest.isCurrent && !draftFocusRequest.isCurrent()) return
      if (editorRef.current?.getElement()?.closest('[inert], [hidden]')) return
      editorRef.current?.focus({ preventScroll: true })
      setDraftFocusRequest(previous => previous === draftFocusRequest ? undefined : previous)
    })
    return () => { cancelled = true }
  }, [draftFocusRequest, active, inputBlocked, preferencesLoaded, draftKey, taskDraft?.id, controller])
  useEffect(() => {
    if (!preferencesLoaded) return
    const timer = window.setTimeout(() => { void persistDrafts().then(() => setDraftSaveError(false), () => setDraftSaveError(true)) }, 250)
    return () => window.clearTimeout(timer)
  }, [controller, draftSnapshot, preferencesLoaded])
  useEffect(() => controller.registerBeforeNavigation(persistDrafts), [controller])
  useEffect(() => {
    const previousOwner = hydratedDraftOwner.current
    hydratedDraftOwner.current = sessionId
    if (!preferencesLoaded || !sessionId || previousOwner === sessionId || (!previousOwner && state.session?.draftState === 'prepared')) return
    let current = true
    const owner = sessionId, revision = ownerTextRevisions.current.get(owner) ?? 0
    const fields = ['drafts', 'fileDrafts', 'documents', 'recoveries', 'submissions', 'permissions'] as const
    const ownerValues = (snapshot: ComposerDraftSnapshot) => JSON.stringify(fields.map(field => snapshot[field]?.[owner]))
    const before = ownerValues(latestDraftSnapshot.current)
    // Another visible Composer may have saved this owner while the primary stayed mounted.
    void draftWriter.readMerged(latestDraftSnapshot.current).then(saved => {
      if (!current || removedDraftOwners.current.has(owner) || (ownerTextRevisions.current.get(owner) ?? 0) !== revision || ownerValues(latestDraftSnapshot.current) !== before) return
      const next = { ...latestDraftSnapshot.current }
      const local = readComposerDrafts(next)
      for (const field of fields) {
        if (JSON.stringify(local[field]?.[owner]) === JSON.stringify(saved[field]?.[owner])) continue
        const values: Record<string, unknown> = { ...next[field] }
        if (Object.prototype.hasOwnProperty.call(saved[field] ?? {}, owner)) values[owner] = saved[field]![owner]
        else delete values[owner]
        Object.assign(next, { [field]: values })
      }
      latestDraftSnapshot.current = next
      setDrafts(next.drafts); setFileDrafts(next.fileDrafts); setDocuments(next.documents ?? {}); setRecoveries(next.recoveries ?? {}); setSubmissions(next.submissions ?? {}); setPermissions(next.permissions ?? {})
    }).catch(() => { if (current) setComposerError('任务草稿读取失败，请重新打开任务；当前输入会保留。') })
    return () => { current = false }
  }, [draftWriter, preferencesLoaded, sessionId])
  useEffect(() => controller.onSessionDeleted?.(id => {
    removedDraftOwners.current.add(id)
    const clean = withoutComposerDraftOwners(latestDraftSnapshot.current, removedDraftOwners.current)
    latestDraftSnapshot.current = clean
    setDrafts(clean.drafts); setFileDrafts(clean.fileDrafts); setDocuments(clean.documents ?? {}); setRecoveries(clean.recoveries ?? {}); setSubmissions(clean.submissions ?? {}); setPermissions(clean.permissions ?? {})
    setTaskDraftState(clean.draft)
  }), [controller])
  useEffect(() => {
    const flush = () => { void persistDrafts().catch(() => undefined) }
    window.addEventListener('pagehide', flush, true)
    window.addEventListener('beforeunload', flush, true)
    return () => {
      window.removeEventListener('pagehide', flush, true)
      window.removeEventListener('beforeunload', flush, true)
    }
  }, [controller])

  useEffect(() => { setContextOpen(false); setModeOpen(false); setModelOpen(false); setReasoningOpen(false); setQueueConfirmation(undefined); setSendHintOpen(false); setPrimaryModifierPressed(false); pointerReverseRef.current = false; setPanelFilter(null); setTokenSelectionSnapshot(null); if (!failedUploadRef.current && !preferencesError) setComposerError(''); setCaret({ start: editorText.length, end: editorText.length }); textRevision.current++ }, [draftKey])
  useEffect(() => {
    if (state.sessionLoading || !active || interactionBlocked) { closeSuggestions(); setModeOpen(false); setModelOpen(false); setReasoningOpen(false); setProjectOpen(false); setQueueConfirmation(undefined); setSendHintOpen(false); setPrimaryModifierPressed(false); pointerReverseRef.current = false; textRevision.current++ }
    if (wasInteractionBlocked.current && !interactionBlocked && active && keyboardActive && !state.sessionLoading && (!document.activeElement || document.activeElement === document.body)) editorRef.current?.focus({ preventScroll: true })
    wasInteractionBlocked.current = interactionBlocked
  }, [state.sessionLoading, active, keyboardActive, interactionBlocked])
  useEffect(() => { if (!selectedModel?.reasoning || nextConfigBlocked) setReasoningOpen(false) }, [selectedModel?.reasoning, nextConfigBlocked])
  useEffect(() => { setHighlightedSuggestionId(undefined) }, [tokenSignature, contextOpen, panelFilter])
  useEffect(() => {
    if (contextOpen && suggestionsOpen) focusSuggestionMenu()
  }, [contextOpen, suggestionsOpen, draftKey])
  useEffect(() => {
    if (!active) return
    let mounted = true
    void controller.getComposerPreferences().then(value => {
      if (mounted) { setSendShortcut(value.sendShortcut); setShowContextUsage(value.showContextUsage); setFollowupMode('followupMode' in value && value.followupMode === 'guide' ? 'guide' : 'queue') }
    }, () => { if (mounted) setComposerError('输入偏好读取失败，暂使用 Enter 发送；重新打开 Harness 后重试') })
    return () => { mounted = false }
  }, [controller, active])
  useEffect(() => { inlineAttachmentCache.current.clear() }, [editorKey])
  useEffect(() => {
    if (!active || !keyboardActive) return
    const insertSuggestion = (event: Event) => {
      const text = (event as CustomEvent<string>).detail
      if (interactionBlocked || typeof text !== 'string' || busyRef.current || controller.getSnapshot().sessionLoading) return
      setDraft(text)
      editorRef.current?.focus()
    }
    window.addEventListener('mira:compose-draft', insertSuggestion)
    return () => window.removeEventListener('mira:compose-draft', insertSuggestion)
  }, [draftKey, active, keyboardActive, interactionBlocked])
  useEffect(() => {
    if (!active || !keyboardActive || !submissionOptionsSupported) return
    const updateModifier = (event: globalThis.KeyboardEvent) => setPrimaryModifierPressed(appleKeyboard ? event.metaKey : event.ctrlKey)
    const clearModifier = () => { setPrimaryModifierPressed(false); pointerReverseRef.current = false }
    window.addEventListener('keydown', updateModifier)
    window.addEventListener('keyup', updateModifier)
    window.addEventListener('blur', clearModifier)
    return () => { window.removeEventListener('keydown', updateModifier); window.removeEventListener('keyup', updateModifier); window.removeEventListener('blur', clearModifier) }
  }, [active, keyboardActive, submissionOptionsSupported, appleKeyboard])
  useEffect(() => {
    if (!active || !keyboardActive) return
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      const input = editorRef.current?.getElement()
      if (interactionBlocked || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || queueConfirmation || !input || input.closest('[inert]')) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      const target = event.target as HTMLElement | null
      const fromComposer = target === input || Boolean(target && input.contains(target))
      if (!fromComposer && target?.closest?.('[role="dialog"]:not(.mira-conversation-find), [role="menu"]')) return
      if (!fromComposer && target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .xterm')) return
      const key = event.key.toLowerCase()
      if (event.ctrlKey && !event.metaKey && !event.altKey && (key === 'm' || key === 't' && fromComposer && !event.shiftKey)) {
        event.preventDefault()
        if (!nextConfigBlocked) {
          if (event.key.toLowerCase() === 't' && !event.shiftKey && selectedModel?.reasoning) {
            const next = COMPOSER_REASONING_CHOICES[(COMPOSER_REASONING_CHOICES.findIndex(item => item.value === reasoningLevel) + 1) % COMPOSER_REASONING_CHOICES.length]
            const selection = applyComposerReasoning(controller.getSnapshot().selection, selectedModel, next.value)
            if (selection) controller.select(selection)
          } else if (event.key.toLowerCase() === 'm') {
            closeSuggestions()
            if (event.shiftKey) { if (!permissionBlocked) selectPermission(PERMISSIONS[(PERMISSIONS.findIndex(item => item.value === permission) + 1) % PERMISSIONS.length].value) }
            else { setModeOpen(false); setReasoningOpen(false); setModelOpen(open => !open) }
          }
        }
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [active, keyboardActive, interactionBlocked, permissionBlocked, nextConfigBlocked, controller, sessionId, permission, selectedModel, reasoningLevel, state.running, suggestionsOpen, modeOpen, modelOpen, reasoningOpen, queueConfirmation])
  useEffect(() => {
    if (!active || !keyboardActive || !state.running || state.sessionLoading) return
    const stopFocusedTask = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || queueConfirmation || suggestionsOpen || modeOpen || modelOpen || reasoningOpen) return
      const path = event.composedPath?.() ?? [event.target]
      if (path.some(node => (node as HTMLElement | null)?.closest?.('[role="dialog"], [role="menu"], .xterm'))) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      if (document.querySelector('[role="dialog"]:not(.mira-conversation-find), [role="menu"][data-state="open"]')) return
      const target = event.target as HTMLElement | null, input = editorRef.current?.getElement()
      const fromComposer = target === input || Boolean(target && input?.contains(target))
      if (!fromComposer && !target?.closest?.('.mira-interaction-dock') && target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .xterm')) return
      if (editorRef.current?.getElement()?.closest('.mira-conversation-layout, .mira-side-conversation')?.querySelector('.mira-conversation-find')) return
      event.preventDefault(); void controller.stop()
    }
    window.addEventListener('keydown', stopFocusedTask)
    return () => window.removeEventListener('keydown', stopFocusedTask)
  }, [active, keyboardActive, state.running, state.sessionLoading, controller, queueConfirmation, suggestionsOpen, modeOpen, modelOpen, reasoningOpen])

  function setDraft(value: string, key = draftKey, selection: MiraPromptRange = { start: value.length, end: value.length }, document?: MiraPromptDocument) {
    document ??= restoreMiraBrowserPromptDocument(value)
    latestDraftSnapshot.current = { ...latestDraftSnapshot.current, drafts: { ...latestDraftSnapshot.current.drafts, [key]: value }, documents: { ...latestDraftSnapshot.current.documents, [key]: document } }
    setDrafts(previous => ({ ...previous, [key]: value }))
    setDocuments(previous => ({ ...previous, [key]: document }))
    ownerTextRevisions.current.set(key, (ownerTextRevisions.current.get(key) ?? 0) + 1)
    if (key === (controller.getSnapshot().session?.id || 'draft')) { textRevision.current++; setTokenSelectionSnapshot(null); setCaret(selection); setDismissedToken('') }
  }
  function setPromptDocument(document: MiraPromptDocument, selection: MiraPromptRange, key = draftKey) {
    const previous = latestDraftSnapshot.current.documents?.[key]
    const files = latestDraftSnapshot.current.fileDrafts[key] ?? []
    for (const file of files) inlineAttachmentCache.current.set(file.path, file)
    const previousPaths = new Set(previous?.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'file' ? [part.reference.value] : []) ?? [])
    const nextPaths = new Set(document.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'file' ? [part.reference.value] : []))
    const retained = files.filter(file => !previousPaths.has(file.path) || nextPaths.has(file.path))
    const restored = [...nextPaths].flatMap(path => inlineAttachmentCache.current.has(path) ? [inlineAttachmentCache.current.get(path)!] : [])
    try {
      const nextFiles = appendComposerReferences(retained, restored)
      setReferences(nextFiles, key)
      setDraft(serializeMiraPromptDocument(document), key, selection, document)
    } catch (error) {
      setDocuments(value => ({ ...value, [key]: { ...(previous ?? createMiraPromptDocument(latestDraftSnapshot.current.drafts[key] ?? '')) } }))
      setComposerError(error instanceof Error ? error.message : String(error))
    }
  }
  function removeReference(path: string) {
    const document = latestDraftSnapshot.current.documents?.[draftKey] ?? restoreMiraBrowserPromptDocument(latestDraftSnapshot.current.drafts[draftKey] ?? '')
    if (document) {
      const next: MiraPromptDocument = { ...document, parts: document.parts.filter(part => part.type !== 'reference' || part.reference.kind !== 'file' || part.reference.value !== path) }
      applyPromptParts({ start: 0, end: draft.length }, next.parts)
    }
    setReferences(references.filter(file => file.path !== path))
  }
  function removeBrowserReference(id?: string) {
    if (!activeRef.current || inputBlocked || queueConfirmation || (controller.getSnapshot().session?.id || 'draft') !== draftKey) return
    const document = latestDraftSnapshot.current.documents?.[draftKey] ?? restoreMiraBrowserPromptDocument(latestDraftSnapshot.current.drafts[draftKey] ?? '')
    const body = miraBrowserPromptBody(document)
    const next = withMiraBrowserReferences(body, id ? miraBrowserReferences(document).filter(reference => reference.id !== id) : [])
    const position = Math.min(serializeMiraPromptDocument(body).length, editorRef.current?.getSelectionRange()?.end ?? caret.end)
    setPromptDocument(next, { start: position, end: position })
  }
  function setReferences(value: HarnessFileReference[], key = draftKey) {
    latestDraftSnapshot.current = { ...latestDraftSnapshot.current, fileDrafts: { ...latestDraftSnapshot.current.fileDrafts, [key]: value } }
    setFileDrafts(previous => ({ ...previous, [key]: value }))
  }
  function setSessionRecoveries(ownerId: string, items: HarnessQueuedMessage[]) {
    latestDraftSnapshot.current = { ...latestDraftSnapshot.current, recoveries: { ...latestDraftSnapshot.current.recoveries, [ownerId]: items } }
    setRecoveries(previous => ({ ...previous, [ownerId]: items }))
  }
  function setSubmission(ownerId: string, submission: ComposerDraftSubmission | undefined) {
    latestDraftSnapshot.current = { ...latestDraftSnapshot.current, submissions: { ...latestDraftSnapshot.current.submissions, [ownerId]: submission } }
    setSubmissions(previous => ({ ...previous, [ownerId]: submission }))
  }
  function setTaskDraft(value: ComposerTaskDraft | null) {
    latestDraftSnapshot.current = { ...latestDraftSnapshot.current, draft: value }
    setTaskDraftState(value)
  }
  function requestDraftFocus(isCurrent?: () => boolean) {
    const owner = latestDraftSnapshot.current.draft
    if (owner) setDraftFocusRequest({ draftId: owner.id, ownerId: controller.getSnapshot().session?.id, isCurrent })
  }
  function persistDrafts(): Promise<void> {
    const write = () => {
      if (failedUploadRef.current) return Promise.reject(new Error('附件尚未添加成功，请重试或取消添加后再离开。'))
      const snapshot = latestDraftSnapshot.current
      try { return draftWriter.save(snapshot).then(() => { if (latestDraftSnapshot.current === snapshot) setDraftSaveError(false) }) }
      catch (error) { return Promise.reject(error) }
    }
    const ready = () => preferencesReady.current ? write() : (preferencesLoad.current ?? Promise.resolve()).then(write)
    return attachmentOperation.current ? attachmentOperation.current.then(ready) : ready()
  }
  function selectProject(projectId?: string) {
    editedConfig.current.add('projectId')
    if (projectId !== latestDraftSnapshot.current.config.projectId) {
      const mcpIds = latestDraftSnapshot.current.config.mcpIds.filter(id => !id.startsWith('project:'))
      editedConfig.current.add('mcpIds')
      setDraftMcpIds(mcpIds)
      latestDraftSnapshot.current = { ...latestDraftSnapshot.current, config: { ...latestDraftSnapshot.current.config, mcpIds } }
    }
    latestDraftSnapshot.current = { ...latestDraftSnapshot.current, config: { ...latestDraftSnapshot.current.config, projectId } }
    onDraftProjectChange?.(projectId)
  }
  function selectPlanning(value: boolean) {
    if (nextConfigBlocked) return
    if (value && state.session?.goal?.status === 'active') { setComposerError('请先暂停当前目标，再开启计划模式'); return }
    editedConfig.current.add('planning')
    if (!value) setComposerError(error => ['目标模式不能在计划模式中启动，请先关闭计划模式', '请先关闭计划模式，再恢复目标'].includes(error) ? '' : error)
    setPlanning(value)
  }
  async function updateConfiguration(change: () => Promise<void>) {
    if (busyRef.current || controller.getSnapshot().sessionLoading) return
    busyRef.current = true; setBusy(true)
    try { await change() } finally { busyRef.current = false; setBusy(false) }
  }
  function selectPermission(next: PermissionMode) {
    if (permissionBlocked) return
    if (submissionOptionsSupported) {
      const values = { ...latestDraftSnapshot.current.permissions, [draftKey]: next }
      latestDraftSnapshot.current = { ...latestDraftSnapshot.current, permissions: values }
      setPermissions(values)
    } else if (sessionId) void updateConfiguration(() => controller.setSessionPermission(sessionId, next))
    else { editedConfig.current.add('permission'); setDraftPermission(next) }
  }
  function toggleTool(type: 'skills' | 'mcp', id: string) {
    if (configBlocked) return
    const ids = type === 'skills' ? activeSkillIds : activeMcpIds
    const next = ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]
    if (sessionId) void updateConfiguration(() => type === 'skills' ? controller.setSessionSkills(sessionId, next) : controller.setSessionMcpServers(sessionId, next))
    else if (type === 'skills') { editedConfig.current.add('skillIds'); setDraftSkillIds(next) }
    else { editedConfig.current.add('mcpIds'); setDraftMcpIds(next) }
  }
  async function ensureSession(draftText = draft, isCurrent?: () => boolean, onCreated?: (id: string) => void) {
    const initial = controller.getSnapshot()
    if (initial.sessionLoading || initial.session?.id !== sessionId || isCurrent && !isCurrent()) return undefined
    if (sessionId) return sessionId
    const owner = latestDraftSnapshot.current.draft ?? { id: crypto.randomUUID() }
    migratingDraft.current = owner.id
    setTaskDraft(owner)
    const selection = state.selection
    const currentOwner = () => latestDraftSnapshot.current.draft?.id === owner.id && (!isCurrent || isCurrent())
    if (!await controller.prepare(draftProjectId, currentOwner) || !currentOwner()) return undefined
    const created = controller.getSnapshot()
    const createdId = created.session?.id
    if (!createdId || created.sessionLoading) return undefined
    setTaskDraft({ ...latestDraftSnapshot.current.draft!, sessionId: createdId })
    onCreated?.(createdId)
    if (selection) controller.select(selection)
    setDraft(draftText, createdId, caret, validateMiraPromptDocument(latestDraftSnapshot.current.documents?.draft, draftText))
    setReferences(references, createdId)
    if (submissionOptionsSupported) {
      const values = { ...latestDraftSnapshot.current.permissions, [createdId]: permission }
      delete values.draft
      latestDraftSnapshot.current = { ...latestDraftSnapshot.current, permissions: values }
      setPermissions(values)
    }
    setDraft('', 'draft')
    setReferences([], 'draft')
    const configurationWrites = [
      ...(!submissionOptionsSupported && draftPermission !== 'default' ? [() => controller.setSessionPermission(createdId, draftPermission)] : []),
      ...(draftSkillIds.length ? [() => controller.setSessionSkills(createdId, draftSkillIds)] : []),
      ...(draftMcpIds.length ? [() => controller.setSessionMcpServers(createdId, draftMcpIds)] : []),
      ...(!draftDelegation ? [() => controller.setSessionDelegation(createdId, false)] : []),
    ]
    for (const write of configurationWrites) {
      if (isCurrent && !isCurrent()) return undefined
      await write()
      const current = controller.getSnapshot()
      if (current.error || current.sessionLoading || current.session?.id !== createdId || isCurrent && !isCurrent()) return undefined
    }
    const current = controller.getSnapshot()
    return !current.sessionLoading && current.session?.id === createdId ? createdId : undefined
  }
  async function selectFiles(draftText = draft, files?: File[], path?: string, onSelected?: (files: HarnessFileReference[], owner: string) => void): Promise<boolean> {
    if (!activeRef.current || !preferencesReady.current || busyRef.current || controller.getSnapshot().sessionLoading) return false
    if (!controller.supportsAttachments && !(controller.getSnapshot().session?.projectId ?? draftProjectId)) {
      setComposerError('请先选择项目，再使用文件选择器；个人工作区内的文件可以从文件树加入对话。')
      return false
    }
    busyRef.current = true; setBusy(true); setComposerError(''); setFailedUpload(undefined); failedUploadRef.current = undefined
    let ownerId = sessionId
    const ownsWorkspace = () => Boolean(sessionId) || latestDraftSnapshot.current.config.projectId === draftProjectId && (!selectedProject || controller.getSnapshot().projects.find(project => project.id === selectedProject.id)?.directory === selectedProject.directory)
    const ownsOperation = () => attachmentMounted.current && activeRef.current && ownsWorkspace() && controller.getSnapshot().session?.id === ownerId
    const operation = Promise.resolve().then(async () => {
      if (files) validateAttachmentFiles(files, references.length, references)
      const id = await ensureSession(draftText, () => attachmentMounted.current && activeRef.current && ownsWorkspace(), id => { ownerId = id })
      if (!ownsOperation()) return false
      if (!id || controller.getSnapshot().sessionLoading || controller.getSnapshot().session?.id !== id) throw new Error(controller.getSnapshot().error || '任务准备未完成，请重试。')
      let selected: HarnessFileReference[]
      if (path) selected = [await controller.stageAttachment(id, path)]
      else if (files) {
        const uploads = []
        for (const file of files) uploads.push(await readAttachmentFile(file))
        selected = await controller.importAttachments(id, uploads)
      } else selected = controller.supportsAttachments ? await controller.selectAttachments(id) : await controller.selectFiles()
      if (!ownsOperation() || controller.getSnapshot().sessionLoading || controller.getSnapshot().session?.id !== id) return false
      setReferences(appendComposerReferences(latestDraftSnapshot.current.fileDrafts[id] ?? [], selected), id)
      onSelected?.(selected, id)
      return true
    }).catch(error => {
      if (ownsOperation()) { setComposerError(`添加文件失败：${error instanceof Error ? error.message : String(error)}`); setFailedUpload({ files, path, onSelected }); failedUploadRef.current = { files, path, onSelected } }
      return false
    }).finally(() => {
      if (attachmentOperation.current === operation) attachmentOperation.current = undefined
      busyRef.current = false
      if (attachmentMounted.current) { setBusy(false); setDragOver(false) }
      dragDepth.current = 0
    })
    // Navigation must wait for session creation/configuration as well as the file read.
    attachmentOperation.current = operation
    return operation
  }
  function pasteAttachments(event: globalThis.ClipboardEvent) {
    if (!controller.supportsAttachments || inputBlocked || contextBlocked) return
    if (!event.clipboardData) return
    const text = event.clipboardData.getData('text/plain')
    const html = event.clipboardData.getData('text/html')
    const files = Array.from(event.clipboardData.files)
    // Spreadsheet clipboard payloads often contain a generated PNG alongside the table.
    if (files.length && !(text && /<table[\s>]/i.test(html))) {
      event.preventDefault(); void selectFiles(draft, files)
    } else if (text.length >= MIRA_PASTED_TEXT_THRESHOLD && new Blob([text]).size <= MIRA_TEXT_FILE_BYTES) {
      event.preventDefault(); void selectFiles(draft, [new File([text], '粘贴的文本.txt', { type: 'text/plain' })])
    }
  }
  function closeSuggestions() {
    setContextOpen(false); setPanelFilter(null); setDismissedToken(tokenSignature)
  }
  function captureMenuSelection() {
    menuSelection.current = editorRef.current?.getSelectionRange() ?? caret
  }
  function openContext() {
    if (contextBlocked) return
    if (contextOpen) { restoreSuggestionFocus(); closeSuggestions(); return }
    captureMenuSelection()
    contextOwnerRef.current = draftKey
    setModeOpen(false); setModelOpen(false); setReasoningOpen(false); setPanelFilter(null); setContextOpen(true)
  }
  function focusSuggestionMenu() {
    if (contextOpen && activeRef.current && !controller.getSnapshot().sessionLoading && contextOwnerRef.current === (controller.getSnapshot().session?.id || 'draft')) suggestionContentRef.current?.focus({ preventScroll: true })
  }
  function restoreSuggestionFocus() {
    // Typed candidates never took focus; a delayed caret restore would overwrite the user's next selection.
    if (!contextOpen && editorRef.current?.getElement()?.contains(document.activeElement)) return
    const range = contextOpen ? menuSelection.current : caret
    focusInput(range.start, draftKey, range.end)
  }
  function focusInput(position = caret.start, owner = draftKey, end = position) {
    const revision = textRevision.current
    window.requestAnimationFrame(() => {
      if (!attachmentMounted.current || !activeRef.current || controller.getSnapshot().sessionLoading || (controller.getSnapshot().session?.id || 'draft') !== owner || textRevision.current !== revision) return
      editorRef.current?.focus(); editorRef.current?.setSelectionRange(position, end)
    })
  }
  function applyPromptParts(range: MiraPromptRange, parts: MiraPromptPart[], owner = draftKey) {
    const text = latestDraftSnapshot.current.drafts[owner] ?? ''
    const document = validateMiraPromptDocument(latestDraftSnapshot.current.documents?.[owner], text) ?? restoreMiraBrowserPromptDocument(text)
    const body = miraBrowserPromptBody(document), length = serializeMiraPromptDocument(body).length
    const insertion = miraBrowserPromptBody({ version: 1, parts })
    const next = replaceMiraPromptDocumentRange(body, { start: Math.min(range.start, length), end: Math.min(range.end, length) }, insertion.parts)
    if (!next) { setComposerError('引用内容超过编辑器上限，请精简草稿'); return false }
    const contexts = parts.some(part => part.type === 'reference' && part.reference.kind === 'web') ? miraBrowserReferences({ version: 1, parts }) : miraBrowserReferences(document)
    if (serializeMiraPromptDocument(withMiraBrowserReferences(next.document, contexts)).length > Math.max(100_000, text.length)) { setComposerError('引用后消息超过 100000 字符，请缩短草稿或引用较短的对话'); return false }
    // Use the mounted editor's transaction when it still represents this owner, preserving undo.
    let edited: MiraPromptDocument | undefined
    programmaticPromptChange.current = true
    try { if (editorIdentity.current.owner === owner) edited = editorRef.current?.replaceRange(range, insertion.parts) }
    finally { programmaticPromptChange.current = false }
    setPromptDocument(withMiraBrowserReferences(edited ?? next.document, contexts), next.range, owner)
    menuSelection.current = next.range
    focusInput(next.range.start, owner)
    return true
  }
  function openPromptTrigger(trigger: MiraPromptTrigger) {
    if (contextBlocked) return
    const range = contextOpen ? menuSelection.current : activeToken || caret
    setContextOpen(false); setPanelFilter(null)
    const next = insertMiraPromptTrigger(editorText, range, trigger)
    applyPromptParts(range, [{ type: 'text', text: next.text.slice(range.start, next.caret) }])
  }
  async function selectSuggestion(item: ComposerSuggestion) {
    if (contextBlocked || item.disabled || referenceRead.current) return
    if (item.action.type === 'command' && item.action.value === 'refresh-mcp') { catalogs.reload(); return }
    if (item.action.type === 'command' && item.action.value.startsWith('reconnect-mcp:')) {
      const id = item.action.value.slice('reconnect-mcp:'.length)
      if (configBlocked || !controller.supportsMcpReconnect || mcpReconnects.current.has(id)) return
      const server = catalogs.mcp.items.find(server => server.id === id)
      if (!server || server.source || !server.enabled || server.unavailableReason || server.connection?.state !== 'failed' && server.connection?.state !== 'disconnected') return
      if (composerError.startsWith('MCP 重连')) setComposerError('')
      mcpReconnects.current.add(id); setMcpReconnecting([...mcpReconnects.current])
      const owner = draftKey, revision = textRevision.current
      const current = () => attachmentMounted.current && activeRef.current && contextOwnerRef.current === owner && (controller.getSnapshot().session?.id || 'draft') === owner && !controller.getSnapshot().sessionLoading && textRevision.current === revision
      try {
        const connection = await controller.reconnectMcp(id)
        if (current() && connection.state !== 'connected') setComposerError(connection.error || 'MCP 重连未成功，请检查服务配置后重试。')
      } catch {
        if (current()) setComposerError('MCP 重连失败，请检查服务配置后重试。')
      } finally {
        mcpReconnects.current.delete(id)
        if (attachmentMounted.current) setMcpReconnecting([...mcpReconnects.current])
        if (current()) catalogs.reload()
      }
      return
    }
    if (item.action.type === 'command' && item.action.value === 'open-commands') { openPromptTrigger('/'); return }
    if (item.action.type === 'command' && item.action.value === 'manage-commands') {
      closeSuggestions()
      const projectId = state.session?.projectId ?? draftProjectId
      try { await persistDrafts(); await controller.navigate(`/settings/commands${projectId ? `?project=${encodeURIComponent(projectId)}` : ''}`) }
      catch (error) { setComposerError(`打开命令设置失败：${error instanceof Error ? error.message : String(error)}`) }
      return
    }
    if (item.action.type === 'command' && item.action.value === 'manage-agents') {
      closeSuggestions()
      const projectId = state.session?.projectId ?? draftProjectId
      try { await persistDrafts(); await controller.navigate(`/settings/agents${projectId ? `?project=${encodeURIComponent(projectId)}` : ''}`) }
      catch (error) { setComposerError(`打开智能体设置失败：${error instanceof Error ? error.message : String(error)}`) }
      return
    }
    const range = contextOpen ? menuSelection.current : activeToken ? miraPromptReplacementRange(editorText, activeToken, [item.label, item.action.value]) : caret
    if (item.action.type === 'prompt-command') {
      if (editorText.slice(0, range.start).trim()) return
      const command = catalogs.commands.items.find(command => command.name === item.action.value && !command.shadowed)
      if (!command || command.unavailableReason) return
      if (applyPromptParts(range, [{ type: 'reference', reference: { id: crypto.randomUUID(), kind: 'command', label: item.label, value: command.name, text: `/${command.name}` } }, { type: 'text', text: ' ' }])) closeSuggestions()
      return
    }
    if (item.action.type === 'plugin-command') {
      if (editorText.slice(0, range.start).trim()) return
      if (applyPromptParts(range, [{ type: 'reference', reference: miraPluginCommandReference(item.action.value) }, { type: 'text', text: ' ' }])) closeSuggestions()
      return
    }
    if (item.action.type === 'agent') {
      if (agentUnavailable) return
      const builtin = Object.prototype.hasOwnProperty.call(MIRA_SUBTASK_AGENTS, item.action.value)
      const userAgent = catalogs.userAgents.items.find(agent => agent.name === item.action.value && !agent.shadowed)
      const plugin = catalogs.plugins.items.find(plugin => plugin.agents?.some(agent => agent.name === item.action.value))
      const agent = plugin?.agents?.find(agent => agent.name === item.action.value)
      if (!builtin && userAgent && (!userAgent.enabled || userAgent.unavailableReason)) return
      if (!builtin && !userAgent && (!plugin || plugin.error || plugin.conflicts.length || !agent || agent.unavailableReason)) return
      const reference = builtin ? miraAgentReference(item.action.value as HarnessSubtaskRole) : userAgent ? miraUserAgentReference(userAgent.name) : miraPluginAgentReference(item.action.value)
      if (applyPromptParts(contextOpen ? { start: range.start, end: range.start } : range, [{ type: 'reference', reference }, { type: 'text', text: ' ' }])) closeSuggestions()
      return
    }
    if (item.action.type === 'plugin') {
      const ids = new Set(promptDocument.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'plugin' ? [part.reference.value] : []))
      if (!ids.has(item.action.value) && ids.size >= 8) { setComposerError('每条消息最多引用 8 个插件，请先移除已有引用'); return }
      if (applyPromptParts(contextOpen ? { start: range.start, end: range.start } : range, [{ type: 'reference', reference: miraPluginReference(item.action.value, item.label) }, { type: 'text', text: ' ' }])) closeSuggestions()
      return
    }
    if (item.action.type === 'skill') {
      if (applyPromptParts(contextOpen ? { start: range.start, end: range.start } : range, [{ type: 'reference', reference: miraSkillReference(item.action.value, item.label) }, { type: 'text', text: ' ' }])) closeSuggestions()
      return
    }
    if (item.action.type === 'session') {
      const owner = draftKey, revision = textRevision.current
      const scope = { projectId: state.session?.projectId ?? draftProjectId, directory: fileDirectory }
      const currentScope = () => {
        const current = controller.getSnapshot(), projectId = current.session?.projectId ?? latestDraftSnapshot.current.config.projectId
        return (current.session?.id || 'draft') === owner && projectId === scope.projectId && (current.session?.workingDirectory ?? current.projects.find(project => project.id === projectId)?.directory) === scope.directory
      }
      referenceRead.current = true; setReferenceLoading(true); setComposerError('')
      try {
        const referenced = await controller.getSession(item.action.value)
        if (!currentScope()) return
        // 异步读取不能用旧光标范围覆盖刚输入的内容；用户可重新选择后重试。
        if (textRevision.current !== revision) throw new Error('读取对话期间草稿已修改，请重新选择引用')
        const text = formatMiraConversationReference(referenced)
        if (!applyPromptParts(range, [{ type: 'reference', reference: { id: crypto.randomUUID(), kind: 'session', label: item.label, value: item.action.value, text } }, { type: 'text', text: ' ' }])) return
        closeSuggestions()
      } catch (error) { if (currentScope()) setComposerError(error instanceof Error ? error.message : '引用对话失败，请重试') }
      finally { referenceRead.current = false; setReferenceLoading(false) }
      return
    }
    if (item.action.type === 'file') {
      const insertFile = (file: HarnessFileReference, owner: string) => {
        if ((latestDraftSnapshot.current.drafts[owner] ?? '') !== draft) { closeSuggestions(); setComposerError('文件已添加；草稿已修改，保留当前输入。'); return }
        if (applyPromptParts(contextOpen ? { start: range.start, end: range.start } : range, [{ type: 'reference', reference: { id: crypto.randomUUID(), kind: 'file', label: item.label, value: file.path, text: `@${item.action.value}` } }, { type: 'text', text: ' ' }], owner)) closeSuggestions()
      }
      if (controller.supportsAttachments) {
        await selectFiles(draft, undefined, item.action.value, (selected, owner) => { if (selected[0]) insertFile(selected[0], owner) })
      }
      else try {
        const next = appendComposerReferences(references, [{ path: item.action.value, name: item.label }])
        setReferences(next); setComposerError('')
        insertFile(next.find(file => file.path === item.action.value)!, draftKey)
      } catch (error) { setComposerError(error instanceof Error ? error.message : String(error)); return }
      return
    }
    if (item.action.type === 'command' && item.action.value === 'compact') {
      closeSuggestions()
      await compactConversation(contextOpen ? { start: range.start, end: range.start } : range)
      return
    }
    if (item.action.type === 'command' && (item.action.value === 'goal' || item.action.value === 'workflow')) {
      if (editorText.slice(0, range.start).trim()) return
      if (applyPromptParts(contextOpen ? { start: range.start, end: range.start } : range, [{ type: 'text', text: `/${item.action.value} ` }])) closeSuggestions()
      return
    }
    if (!applyPromptParts(contextOpen ? { start: range.start, end: range.start } : range, [])) return
    closeSuggestions()
    if (item.action.type === 'mcp') toggleTool('mcp', item.action.value)
    if (item.action.type === 'command') await runSlash(item.action.value, latestDraftSnapshot.current.drafts[draftKey])
  }
  async function runSlash(commandId: string, draftText = draft) {
    if (contextBlocked || commandId === 'perm' && permissionBlocked || configBlocked && ['delegation', 'memory'].includes(commandId)) return
    if (commandId === 'side') {
      if (!onOpenSideConversation || !sessionId || state.session?.parentSessionId || state.session?.draftState === 'prepared') return
      try { await onOpenSideConversation() }
      catch (error) { if (activeRef.current && controller.getSnapshot().session?.id === sessionId) setComposerError(`打开旁路对话失败：${error instanceof Error ? error.message : String(error)}`) }
    }
    if (commandId === 'files') await selectFiles(draftText)
    if (commandId === 'skills' || commandId === 'mcp') { contextOwnerRef.current = draftKey; setPanelFilter(commandId); setContextOpen(true) }
    if (commandId === 'manage-mcp') {
      try { await persistDrafts(); await controller.navigate('/settings/mcp') }
      catch (error) { setComposerError(`打开 MCP 设置失败：${error instanceof Error ? error.message : String(error)}`) }
    }
    if (commandId === 'model') setModelOpen(true)
    if (commandId === 'thinking') setReasoningOpen(true)
    if (commandId === 'plan') selectPlanning(!planning)
    if (commandId === 'delegation') {
      const enabled = !(state.session?.delegationEnabled ?? draftDelegation)
      if (sessionId) await controller.setSessionDelegation(sessionId, enabled); else { editedConfig.current.add('delegation'); setDraftDelegation(enabled) }
    }
    if (commandId === 'memory') await saveMemory()
    if (commandId === 'perm') setModeOpen(true)
  }
  async function compactConversation(range?: MiraPromptRange) {
    if (compactionOperation.current || !controller.supportsContextCompaction) return
    if (!sessionId || state.session?.draftState === 'prepared' || state.session?.archivedAt) { setComposerError('请先打开已有对话，再压缩上下文'); return }
    if (compactBlocked || !state.selection) { setComposerError(compactQueued || compactRunning ? '上下文压缩已在运行或排队' : '请等待任务准备完成，再压缩上下文'); return }
    const owner = sessionId, revision = ownerTextRevisions.current.get(owner) ?? 0
    const isCurrent = () => attachmentMounted.current && activeRef.current && !controller.getSnapshot().sessionLoading && controller.getSnapshot().session?.id === owner && (ownerTextRevisions.current.get(owner) ?? 0) === revision
    compactionOperation.current = true; setCompactionPending(owner); setCompactionNotice(undefined); setComposerError('')
    try {
      await persistDrafts()
      if (!isCurrent()) return
      const result = await controller.compactConversation(owner)
      if (!isCurrent()) return
      if (range) { applyPromptParts(range, [], owner); await persistDrafts() }
      if (attachmentMounted.current && controller.getSnapshot().session?.id === owner) setCompactionNotice({ owner, revision: ownerTextRevisions.current.get(owner) ?? 0, queued: result.status === 'queued', text: result.status === 'queued' ? '上下文压缩已加入待发送，将按顺序执行' : result.status === 'compacted' ? '上下文已压缩，最近对话和完整历史保留' : '没有需要压缩的较早对话' })
    } catch (error) {
      if (isCurrent()) setComposerError(error instanceof Error ? error.message : '上下文压缩失败，请重试')
    } finally {
      compactionOperation.current = false
      if (attachmentMounted.current) setCompactionPending(undefined)
    }
  }
  async function saveMemory() {
    try { await controller.saveMemory() }
    catch (error) { setComposerError(`保存记忆失败：${error instanceof Error ? error.message : String(error)}`) }
  }
  function recallPromptInput(direction: 'up' | 'down') {
    if (!active || inputBlocked || queueConfirmation || suggestionsOpen || modeOpen || modelOpen || reasoningOpen || projectOpen || referenceRead.current) return false
    const value = promptHistory.navigate(direction)
    if (value === undefined) return false
    const document = miraBrowserPromptBody(restoreMiraBrowserPromptDocument(value))
    // Recall is an editor transaction: the next native selection must not race a queued focus restore.
    programmaticPromptChange.current = true
    try {
      editorRef.current?.replaceRange({ start: 0, end: editorText.length }, document.parts)
      editorRef.current?.setSelectionRange(value.length, value.length)
    } finally { programmaticPromptChange.current = false }
    setPromptDocument(withMiraBrowserReferences(document, browserReferences), { start: value.length, end: value.length })
    const token = findMiraPromptToken(value, value.length)
    if (token) setDismissedToken(`${draftKey}:${token.start}:${token.end}:${token.trigger}:${token.query}`)
    return true
  }
  function onSuggestionKeyDown(event: KeyboardEvent<HTMLElement> | globalThis.KeyboardEvent) {
    if (('nativeEvent' in event ? event.nativeEvent.isComposing : event.isComposing) || event.keyCode === 229) return
    const button = (event.target as HTMLElement | null)?.closest?.('button')
    if (event.key !== 'Escape' && button && button.getAttribute('role') !== 'option') return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation()
      const next = nextMiraSuggestionIndex(suggestionIndex, event.key === 'ArrowDown' ? 1 : -1, suggestionItems)
      setHighlightedSuggestionId(suggestionItems[next]?.id)
    } else if ((event.key === 'Enter' || event.key === 'Tab' || contextOpen && event.key === ' ') && selectedSuggestion) {
      event.preventDefault(); event.stopPropagation(); void selectSuggestion(selectedSuggestion)
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); restoreSuggestionFocus(); closeSuggestions()
    }
  }
  async function submit(event?: FormEvent, requestedOptions?: HarnessMessageSubmissionOptions) {
    event?.preventDefault()
    const text = draft.trim()
    if (!hasInput || attachmentBlocked || failedUploadRef.current || !activeRef.current || sendingBlocked || busyRef.current || submittingRef.current.has(draftKey) || recoveryWriteRef.current.has(draftKey) || referenceRead.current) return
    let goalCommand: ReturnType<typeof parseMiraGoalCommand>
    try { goalCommand = !references.length && !promptDocument.parts.some(part => part.type === 'reference') ? parseMiraGoalCommand(text) : undefined }
    catch (error) { setComposerError(error instanceof Error ? error.message : '目标命令无效'); return }
    if (goalCommand) {
      if (!controller.supportsGoals || state.session?.parentSessionId) { setComposerError('当前对话不支持目标模式'); return }
      if (goalCommand.action === 'set' && planning) { setComposerError('目标模式不能在计划模式中启动，请先关闭计划模式'); return }
      if (goalCommand.action === 'resume' && planning) { setComposerError('请先关闭计划模式，再恢复目标'); return }
      if (goalCommand.action !== 'set') {
        const owner = draftKey, revision = ownerTextRevisions.current.get(owner) ?? 0
        if (goalCommand.action === 'get') { onShowGoal?.(); return }
        const goal = state.session?.goal
        if (!sessionId || !goal) { setComposerError('当前对话尚未设置目标'); return }
        busyRef.current = true; setBusy(true); setComposerError('')
        try {
          if (goalCommand.action === 'pause') await controller.pauseGoal(sessionId, goal.revision, goal.id)
          else if (goalCommand.action === 'resume') { if (!state.selection) throw new Error('请先选择模型'); await controller.resumeGoal(sessionId, goal.revision, goal.id, state.selection, permission) }
          else if (goalCommand.action === 'clear') await controller.clearGoal(sessionId, goal.revision, goal.id)
          else if (goalCommand.action === 'budget') await controller.updateGoalBudget(sessionId, goalCommand.tokenBudget, goal.revision, goal.id)
          if ((ownerTextRevisions.current.get(owner) ?? 0) === revision) setDraft('', owner)
          await persistDrafts()
        } catch (error) { if (controller.getSnapshot().session?.id === sessionId && activeRef.current) setComposerError(error instanceof Error ? error.message : '目标操作失败，请重试') }
        finally { busyRef.current = false; setBusy(false) }
        return
      }
    }
    if (planning && state.session?.goal?.status === 'active') { setComposerError('请先暂停当前目标，再开启计划模式'); return }
    if (controller.supportsContextCompaction && /^\/(compact|compress)$/i.test(text) && !references.length && !promptDocument.parts.some(part => part.type === 'reference')) {
      await compactConversation({ start: 0, end: editorText.length })
      return
    }
    if (requestedOptions && !submissionOptionsSupported) return
    if (queueConfirmation && !requestedOptions?.pausedQueueDecision) return
    const current = controller.getSnapshot()
    const intent = goalCommand && current.running ? { ...requestedOptions, delivery: 'queue' as const } : requestedOptions ?? (queueSupported && submissionOptionsSupported && current.running && followupMode === 'guide' ? { delivery: 'guide' as const } : undefined)
    const savedIntent = latestDraftSnapshot.current.submissions?.[draftKey]
    const retryingIntent = savedIntent && savedIntent.text === text && JSON.stringify(savedIntent.references) === JSON.stringify(references)
    if (!retryingIntent && intent && current.running && !current.session?.activeRun?.id) { setComposerError('当前任务身份尚未同步，请稍后重试'); return }
    const skillIds = [...new Set(promptDocument.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'skill' ? [part.reference.value] : []))]
    const pluginIds = [...new Set(promptDocument.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'plugin' ? [part.reference.value] : []))]
    const options: HarnessMessageSubmissionOptions | undefined = submissionOptionsSupported ? { permissionMode: permission, ...(promptDocument.parts.some(part => part.type === 'reference') ? { hasStructuredContext: true } : {}), ...(skillIds.length || text.includes('(mira-skill:') ? { skillIds } : {}), ...(pluginIds.length || text.includes('(plugin://') ? { pluginIds } : {}), ...(intent ? { ...intent, expectedRunId: current.session?.activeRun?.id ?? null } : {}) } : undefined
    busyRef.current = true; setBusy(true); setComposerError(''); setDismissedHostError(undefined)
    let preparing = true
    try {
      const id = await ensureSession()
      if (!id) return
      // 创建或配置期间用户可切换任务，首条消息只能发送到发起它的那份草稿。
      if (controller.getSnapshot().sessionLoading || controller.getSnapshot().session?.id !== id) return
      const submittedDraft = controller.getSnapshot().session?.draftState === 'prepared' ? latestDraftSnapshot.current.draft : undefined
      if (queueSupported) {
        const revision = ownerTextRevisions.current.get(id) ?? 0
        const submittedReferences = latestDraftSnapshot.current.fileDrafts[id] ?? references
        const previous = latestDraftSnapshot.current.submissions?.[id]
        const retry = previous && previous.text === text && JSON.stringify(previous.references) === JSON.stringify(submittedReferences)
        const selection = { ...(retry ? previous.selection : controller.getSnapshot().selection!) }
        const submittedPlanning = retry ? previous.planning : planning
        const submittedOptions = goalCommand && controller.getSnapshot().running && retry ? { ...previous.options, delivery: 'queue' as const } : retry ? previous.options : options
        const capturedDraft = retry ? previous.draft : submittedDraft
        const payload = { text, references: submittedReferences, selection, planning: submittedPlanning, ...(submittedOptions ? { options: submittedOptions } : {}), ...(capturedDraft ? { draft: capturedDraft } : {}) }
        const submissionId = retry ? previous.id : crypto.randomUUID()
        setSubmission(id, { id: submissionId, ...payload })
        submittingRef.current.add(id); setSubmitting([...submittingRef.current])
        busyRef.current = false; setBusy(false); preparing = false
        try {
          try { await persistDrafts() }
          catch (error) { setRecoverySaveErrors(previous => ({ ...previous, [id]: `提交信息保存失败，发送已暂停：${error instanceof Error ? error.message : String(error)}` })); return }
          if (controller.getSnapshot().sessionLoading || controller.getSnapshot().session?.id !== id || !activeRef.current) return
          const sent = submittedOptions ? await controller.send(text, submittedPlanning, submittedReferences, submissionId, selection, submittedOptions) : await controller.send(text, submittedPlanning, submittedReferences, submissionId, selection)
          const result = controller.getSnapshot()
          if (sent === true) {
            // Admission belongs to its draft owner even after navigation; newer owner edits remain intact.
            if ((ownerTextRevisions.current.get(id) ?? 0) === revision) setDraft('', id)
            // 附件对象是本次草稿身份；移除后重新添加同一路径不属于已提交附件。
            const retainedInline = new Set(latestDraftSnapshot.current.documents?.[id]?.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'file' ? [part.reference.value] : []) ?? [])
            setReferences((latestDraftSnapshot.current.fileDrafts[id] ?? []).filter(reference => !submittedReferences.includes(reference) || retainedInline.has(reference.path)), id)
            setSubmission(id, undefined)
            setQueueConfirmation(previous => previous?.ownerId === id ? undefined : previous)
            if (payload.draft) await acceptDraft(id, payload.draft)
            try { await persistDrafts(); setRecoverySaveErrors(previous => ({ ...previous, [id]: '' })) }
            catch (error) { setRecoverySaveErrors(previous => ({ ...previous, [id]: `消息已提交，草稿保存失败，发送已暂停：${error instanceof Error ? error.message : String(error)}` })) }
          } else if (sent === 'confirmation-required') {
            setSubmission(id, undefined)
            if (!result.sessionLoading && result.session?.id === id && activeRef.current) {
              const queue = result.queue
              if (queue?.sessionId === id && queue.items.length) {
                closeSuggestions(); setModeOpen(false); setModelOpen(false); setReasoningOpen(false); setSendHintOpen(false)
                setQueueConfirmation({ ownerId: id, revision: queue.revision, itemIds: queue.items.map(item => item.id), ...(submittedOptions?.delivery === 'immediate' ? { delivery: 'immediate' as const } : {}) })
              } else { setQueueConfirmation(undefined); setComposerError('队列状态已变化，请重新发送') }
            }
            try { await persistDrafts() }
            catch (error) { setRecoverySaveErrors(previous => ({ ...previous, [id]: `草稿保存失败，发送已暂停：${error instanceof Error ? error.message : String(error)}` })) }
          } else if (sent === 'retry-required') {
            // 宿主明确拒绝未接纳意图后，下次手势才可重新采样任务身份。
            setSubmission(id, undefined)
            setQueueConfirmation(previous => previous?.ownerId === id ? undefined : previous)
            if (!result.sessionLoading && result.session?.id === id && activeRef.current) setComposerError(result.error || '当前任务已变化，请重新发送')
            try { await persistDrafts() }
            catch (error) { setRecoverySaveErrors(previous => ({ ...previous, [id]: `草稿保存失败，发送已暂停：${error instanceof Error ? error.message : String(error)}` })) }
          } else if (!result.sessionLoading && result.session?.id === id && activeRef.current) setComposerError(result.error || '发送失败，请重试')
        } finally { submittingRef.current.delete(id); setSubmitting([...submittingRef.current]) }
        return
      }
      const submittedText = latestDraftSnapshot.current.drafts[id] ?? text
      const submittedDocument = latestDraftSnapshot.current.documents?.[id]
      setDraft('', id)
      setReferences([], id)
      const sending = controller.send(text, planning, references)
      busyRef.current = false; setBusy(false)
      preparing = false
      const sent = await sending
      const result = controller.getSnapshot()
      if (!sent) {
        if (!latestDraftSnapshot.current.drafts[id]) setDraft(submittedText, id, undefined, submittedDocument)
        const existing = latestDraftSnapshot.current.fileDrafts[id] ?? []
        setReferences([...existing, ...references.filter(item => !existing.some(reference => reference.path === item.path))], id)
        if (!result.sessionLoading && result.session?.id === id) setComposerError(result.error || '发送失败，请重试')
      } else if (submittedDraft) await acceptDraft(id, submittedDraft)
    } finally { if (preparing) { busyRef.current = false; setBusy(false) } }
  }
  async function acceptDraft(sessionId: string, owner: ComposerTaskDraft) {
    if (latestDraftSnapshot.current.draft?.id === owner.id) setTaskDraft(null)
    try { await onDraftAccepted?.(sessionId, owner) }
    catch (error) { controller.reportError(error) }
  }
  function confirmQueueSend(decision: 'retain' | 'discard') {
    const current = controller.getSnapshot()
    if (!queueConfirmation || queueConfirmationRef.current !== queueConfirmation || !activeRef.current || current.sessionLoading || current.session?.id !== queueConfirmation.ownerId || submittingRef.current.has(queueConfirmation.ownerId)) return
    void submit(undefined, { ...(queueConfirmation.delivery ? { delivery: queueConfirmation.delivery } : {}), pausedQueueDecision: decision, expectedQueueRevision: queueConfirmation.revision, expectedQueueItemIds: queueConfirmation.itemIds })
  }
  function draftIsEmpty(ownerId: string) {
    return !(latestDraftSnapshot.current.drafts[ownerId] ?? '').length && !(latestDraftSnapshot.current.fileDrafts[ownerId] ?? []).length
  }
  function restoreQueuedDraft(item: HarnessQueuedMessage) {
    const current = controller.getSnapshot()
    if (!activeRef.current || busyRef.current || submittingRef.current.has(item.sessionId) || current.sessionLoading || current.session?.id !== item.sessionId || !draftIsEmpty(item.sessionId)) return false
    setDraft(item.text, item.sessionId, undefined, restoreMiraBrowserPromptDocument(item.text, item.skillIds, item.pluginIds))
    setReferences(item.references.map(reference => ({ ...reference })), item.sessionId)
    controller.select({ ...item.selection })
    if (submissionOptionsSupported) {
      const values = { ...latestDraftSnapshot.current.permissions, [item.sessionId]: item.permissionMode }
      latestDraftSnapshot.current = { ...latestDraftSnapshot.current, permissions: values }
      setPermissions(values)
    }
    editedConfig.current.add('planning'); setPlanning(item.planning)
    editorRef.current?.focus()
    return true
  }
  async function withdrawQueuedMessage(itemId: string, edit: boolean, preserveDraft = false) {
    const ownerId = sessionId, current = controller.getSnapshot()
    if (!ownerId || !activeRef.current || busyRef.current || current.sessionLoading || current.session?.id !== ownerId || edit && !preserveDraft && !draftIsEmpty(ownerId)) return
    const key = `${ownerId}:${itemId}`
    if (withdrawalRef.current.has(key) || sendNowRef.current.has(key) || current.queue?.promotingItemId === itemId) return
    const revision = textRevision.current
    withdrawalRef.current.add(key); setWithdrawals([...withdrawalRef.current])
    try {
      const result = await controller.withdrawMessage(ownerId, itemId)
      if (!result || !edit) return
      setSessionRecoveries(ownerId, [...(latestDraftSnapshot.current.recoveries?.[ownerId] ?? []).filter(item => item.id !== result.item.id), result.item])
      try {
        await persistDrafts()
        setRecoverySaveErrors(previous => ({ ...previous, [ownerId]: '' }))
      } catch (error) {
        setRecoverySaveErrors(previous => ({ ...previous, [ownerId]: `撤回已确认，草稿保存失败：${error instanceof Error ? error.message : String(error)}` }))
        return
      }
      if (textRevision.current === revision) await consumeRecovery(result.item)
    } catch (error) {
      if (controller.getSnapshot().session?.id === ownerId && activeRef.current) setComposerError(error instanceof Error ? error.message : '撤回失败，请重试')
    } finally { withdrawalRef.current.delete(key); setWithdrawals([...withdrawalRef.current]) }
  }
  async function restoreRecovery(itemId: string) {
    const item = (recoveries[draftKey] ?? []).find(item => item.id === itemId)
    if (!item || recoverySaveErrors[draftKey]) return
    await consumeRecovery(item)
  }
  async function consumeRecovery(item: HarnessQueuedMessage) {
    const ownerId = item.sessionId
    if (recoveryWriteRef.current.has(ownerId) || !restoreQueuedDraft(item)) return
    recoveryWriteRef.current.add(ownerId); setRecoveryWrites([...recoveryWriteRef.current])
    setSessionRecoveries(ownerId, (latestDraftSnapshot.current.recoveries?.[ownerId] ?? []).filter(recovery => recovery.id !== item.id))
    try { await persistDrafts(); setRecoverySaveErrors(previous => ({ ...previous, [ownerId]: '' })) }
    catch (error) { setRecoverySaveErrors(previous => ({ ...previous, [ownerId]: `恢复草稿保存失败，发送已暂停：${error instanceof Error ? error.message : String(error)}` })) }
    finally { recoveryWriteRef.current.delete(ownerId); setRecoveryWrites([...recoveryWriteRef.current]) }
  }
  async function retryRecoverySave() {
    const ownerId = draftKey
    if (recoveryWriteRef.current.has(ownerId)) return
    recoveryWriteRef.current.add(ownerId); setRecoveryWrites([...recoveryWriteRef.current])
    try { await persistDrafts(); setRecoverySaveErrors(previous => ({ ...previous, [ownerId]: '' })) }
    catch (error) { setRecoverySaveErrors(previous => ({ ...previous, [ownerId]: `草稿保存失败：${error instanceof Error ? error.message : String(error)}` })) }
    finally { recoveryWriteRef.current.delete(ownerId); setRecoveryWrites([...recoveryWriteRef.current]) }
  }
  function showConfirmation() {
    const current = controller.getSnapshot()
    if (!sessionId || !activeRef.current || current.sessionLoading || current.session?.id !== sessionId) return
    if (current.permission || current.session.pendingInteraction?.status === 'waiting') onShowConfirmation?.(sessionId)
  }
  async function resumeQueue() {
    const ownerId = sessionId, current = controller.getSnapshot()
    if (!ownerId || !activeRef.current || current.sessionLoading || current.session?.id !== ownerId || resumeRef.current.has(ownerId) || current.queue?.promotingItemId || [...sendNowRef.current].some(key => key.startsWith(`${ownerId}:`))) return
    if (current.permission || current.session.pendingInteraction?.status === 'waiting') { showConfirmation(); return }
    resumeRef.current.add(ownerId); setResuming([...resumeRef.current])
    try { await controller.resumeMessageQueue(ownerId) }
    catch (error) { if (controller.getSnapshot().session?.id === ownerId && activeRef.current) setComposerError(error instanceof Error ? error.message : '恢复失败，请重试') }
    finally { resumeRef.current.delete(ownerId); setResuming([...resumeRef.current]) }
  }
  async function reorderQueue(itemId: string, beforeItemId: string | null) {
    const ownerId = sessionId, current = controller.getSnapshot()
    if (!ownerId || !activeRef.current || busyRef.current || current.sessionLoading || current.session?.id !== ownerId || reorderRef.current.has(ownerId) || current.queue?.promotingItemId || [...sendNowRef.current].some(key => key.startsWith(`${ownerId}:`)) || withdrawalRef.current.has(`${ownerId}:${itemId}`) || beforeItemId && withdrawalRef.current.has(`${ownerId}:${beforeItemId}`)) return
    reorderRef.current.add(ownerId); setReordering([...reorderRef.current])
    try { await controller.reorderMessageQueue(ownerId, itemId, beforeItemId) }
    catch (error) { if (controller.getSnapshot().session?.id === ownerId && activeRef.current) setComposerError(error instanceof Error ? error.message : '排序失败，请重试') }
    finally { reorderRef.current.delete(ownerId); setReordering([...reorderRef.current]) }
  }
  async function sendQueuedNow(itemId: string) {
    const ownerId = sessionId, current = controller.getSnapshot()
    if (!ownerId || !activeRef.current || busyRef.current || current.sessionLoading || current.session?.id !== ownerId || reorderRef.current.has(ownerId) || current.queue?.promotingItemId || [...sendNowRef.current].some(key => key.startsWith(`${ownerId}:`)) || withdrawalRef.current.has(`${ownerId}:${itemId}`)) return
    if (current.permission || current.session.pendingInteraction?.status === 'waiting') { showConfirmation(); return }
    const expectedRunId = current.session.activeRun?.id
    if (current.running && !expectedRunId) { setComposerError('当前任务身份尚未同步，请稍后重试'); return }
    const key = `${ownerId}:${itemId}`
    sendNowRef.current.add(key); setSendingNow([...sendNowRef.current])
    try { await controller.sendQueuedMessageNow(ownerId, itemId, expectedRunId) }
    catch (error) { if (controller.getSnapshot().session?.id === ownerId && activeRef.current) setComposerError(error instanceof Error ? error.message : '立即发送失败，请重试') }
    finally { sendNowRef.current.delete(key); setSendingNow([...sendNowRef.current]) }
  }
  const portalContainer = document.getElementById('root')
  const usage: HarnessContextUsage | undefined = state.session?.context?.usage
  const PermissionIcon = permission === 'default' ? Hand : permission === 'auto-approve' ? ShieldCheck : ShieldAlert
  const sendKeyLabel = sendShortcut === 'mod-enter' ? '⌘/Ctrl+Enter' : 'Enter'
  const reverseSendHint = !nativeGoalCommand && submissionOptionsSupported && state.running && primaryModifierPressed && !sendingBlocked && hasInput && !queueConfirmation
  const guideMode = queueSupported && submissionOptionsSupported && followupMode === 'guide'
  const reverseOptions: HarnessMessageSubmissionOptions = guideMode && state.running ? {} : { delivery: 'immediate' }
  const goalControlLabels = { get: '查看目标', pause: '暂停目标', resume: '恢复目标', clear: '清除目标', budget: '保存目标预算' }
  const sendTitle = busy ? '正在准备任务' : nativeGoalCommand ? nativeGoalCommand.action === 'set' ? state.running ? '加入待发送' : '设置目标' : goalControlLabels[nativeGoalCommand.action] : reverseSendHint ? guideMode ? '加入待发送' : '立即发送' : state.running && guideMode ? '引导当前任务' : state.running || confirmationPending ? '加入待发送' : '发送任务'
  const queueConfirmationPending = Boolean(queueConfirmation && submitting.includes(queueConfirmation.ownerId))
  const queueConfirmationError = queueConfirmation ? recoverySaveErrors[queueConfirmation.ownerId] || visibleError : ''
  const placeholder = confirmationPending ? queueSupported ? '等待确认，可继续添加待发送消息' : '先处理上方确认；草稿会保留' : state.running ? '任务运行中，可先写好下一条消息' : state.messages.length ? '继续对话，@ 引用上下文，/ 选择能力' : '向 Mira 提问，@ 引用上下文，/ 选择能力'

  return <Tooltip.Provider delayDuration={350}><Popover.Root open={suggestionsOpen} onOpenChange={open => { if (!open) closeSuggestions() }}><div className={cn('harness-composer-region', !sessionId && 'harness-composer-region--draft')}>
    {visibleError && <div className="harness-composer__error" role="alert"><CircleAlert size={15} /><span>{visibleError}</span>{preferencesError && <button type="button" className="mira-attachment-upload-retry" onClick={() => setPreferencesRetry(value => value + 1)}>重试读取草稿</button>}{promptHistory.error && <button type="button" className="mira-attachment-upload-retry" onClick={promptHistory.reload}>重试读取输入历史</button>}{failedUpload && <button type="button" className="mira-attachment-upload-retry" disabled={busy} onClick={() => void selectFiles(draft, failedUpload.files, failedUpload.path, failedUpload.onSelected)}>重试添加</button>}{!preferencesError && <button type="button" aria-label={failedUpload ? '取消附件添加' : '关闭错误提示'} onClick={() => { setFailedUpload(undefined); failedUploadRef.current = undefined; setComposerError(''); setDismissedHostError(state.error); promptHistory.dismissError() }}><X size={14} /></button>}</div>}
    {queueSupported && sessionId && <HarnessMessageQueue key={sessionId} queue={state.queue?.sessionId === sessionId ? state.queue : undefined} recoveries={recoveries[sessionId] ?? []} pendingItems={withdrawals.filter(key => key.startsWith(`${sessionId}:`)).map(key => key.slice(sessionId.length + 1))} resumePending={resuming.includes(sessionId)} disabled={!active || Boolean(state.sessionLoading) || busy} editDisabled={!draftIsEmpty(sessionId) || submitting.includes(sessionId)} recoveryBlocked={recoveryWrites.includes(sessionId) || Boolean(recoverySaveErrors[sessionId])} confirmationPending={confirmationPending} error={recoverySaveErrors[sessionId] || state.queueError} onRetrySave={recoverySaveErrors[sessionId] ? retryRecoverySave : undefined} onEdit={id => withdrawQueuedMessage(id, true)} onDelete={id => withdrawQueuedMessage(id, false)} onRestore={restoreRecovery} onResume={resumeQueue} onConfirmation={showConfirmation} onMove={controller.supportsQueueReorder ? reorderQueue : undefined} reorderPending={reordering.includes(sessionId)} onSendNow={controller.supportsQueueSendNow ? sendQueuedNow : undefined} sendNowPendingItems={sendingNow.filter(key => key.startsWith(`${sessionId}:`)).map(key => key.slice(sessionId.length + 1))} />}
    {queueSupported && retriesSubmission && !submitting.includes(draftKey) && <div className="mira-composer-pending-submission" role="status">上次提交待确认，重试使用原模型和模式</div>}
    {compactRunning || compactionPending === draftKey ? <div className="harness-composer__compaction" role="status"><LoaderCircle size={14} className="animate-spin" /><span>正在压缩上下文</span><button type="button" disabled={!state.running} onClick={() => void controller.stop()}>停止压缩</button></div> : compactionNotice?.owner === draftKey && (!compactionNotice.queued || compactQueued) && compactionNotice.revision === (ownerTextRevisions.current.get(draftKey) ?? 0) && <div className="harness-composer__compaction" role="status"><Check size={14} /><span>{compactionNotice.text}</span><button type="button" aria-label="关闭压缩提示" onClick={() => setCompactionNotice(undefined)}><X size={14} /></button></div>}
    <Popover.Anchor asChild><div className="mira-composer-panel-anchor" /></Popover.Anchor>
    <Popover.Portal container={portalContainer}><Popover.Content ref={suggestionContentRef} tabIndex={-1} className="mira-composer-panel-popover" side="top" align="start" sideOffset={4} onOpenAutoFocus={event => { event.preventDefault(); focusSuggestionMenu() }} onCloseAutoFocus={event => event.preventDefault()} onInteractOutside={event => { const target = event.target as Node | null; if (target && (editorRef.current?.getElement()?.contains(target) || contextTriggerRef.current?.contains(target))) event.preventDefault() }} onEscapeKeyDown={event => { event.preventDefault(); if (!event.isComposing && event.keyCode !== 229) { restoreSuggestionFocus(); closeSuggestions() } }} onKeyDown={onSuggestionKeyDown}>
      <ComposerSuggestionPanel listId={suggestionListId} hasQuery={Boolean(suggestionQuery.trim())} sections={suggestionSections} selectedIndex={suggestionIndex} onHighlight={index => setHighlightedSuggestionId(suggestionItems[index]?.id)} onSelect={item => void selectSuggestion(item)} onTrigger={openPromptTrigger} />
    </Popover.Content></Popover.Portal>
    {interactionSlot && <div className="mira-interaction-dock">{interactionSlot}</div>}
    <div className="harness-composer__surface" hidden={interactionBlocked} inert={interactionBlocked} aria-hidden={interactionBlocked || undefined}>
      {(!sessionId || selectedProject?.isGitRepository && controller.supportsGitActions) && <div className="harness-composer__project-strip">
        {!sessionId && <>
        <DropdownMenu.Root modal={false} open={active && projectOpen} onOpenChange={open => { setProjectOpen(open && active); if (!open) setProjectQuery('') }}>
          <DropdownMenu.Trigger type="button" className="harness-composer__project-trigger" aria-label="选择项目" disabled={configBlocked} title={selectedProject?.directory || '不绑定项目，使用个人工作区'}><FolderOpen size={16} /><span>{selectedProject?.name || '选择项目'}</span><ChevronDown size={12} /></DropdownMenu.Trigger>
          <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="start" side="top" sideOffset={4} className="harness-composer__menu harness-composer__project-menu" {...projectMenuFocus.contentProps}>
            <div className="harness-composer__search"><Search size={16} /><input value={projectQuery} onChange={event => setProjectQuery(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="搜索项目" aria-label="搜索项目" /></div>
            <DropdownMenu.RadioGroup value={draftProjectId || ''} onValueChange={value => selectProject(value || undefined)}>
              {state.projects.filter(project => `${project.name} ${project.directory}`.toLowerCase().includes(projectQuery.toLowerCase())).map(project => <DropdownMenu.RadioItem key={project.id} value={project.id} disabled={!project.directoryExists} className="harness-composer__menu-item"><FolderOpen size={16} /><span><strong>{project.name}</strong><small>{project.directoryExists ? project.directory : '项目目录不可用'}</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
              <DropdownMenu.Separator className="harness-composer__menu-separator" />
              <DropdownMenu.RadioItem value="" className="harness-composer__menu-item"><span>在项目外工作</span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
            <DropdownMenu.Separator className="harness-composer__menu-separator" />
            <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => { projectMenuFocus.cancelReturnFocus(); void controller.navigate('/workspace/projects') }}><FolderOpen size={16} /><span>管理项目</span></DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
        {selectedProject && <button type="button" className="harness-composer__project-detach" aria-label="脱离当前项目" title="脱离当前项目" disabled={configBlocked} onClick={() => selectProject(undefined)}><X size={13} /></button>}
        </>}
        <MiraBranchPicker key={selectedProject?.id} controller={controller} project={selectedProject} active={active} blocked={busy || Boolean(state.sessionLoading) || Boolean(selectedProject && state.sessions.some(session => session.projectId === selectedProject.id && state.runningSessionIds.includes(session.id))) || Boolean(state.queue?.items.length)} placement="composer" onReturnFocus={() => editorRef.current?.focus()} />
      </div>}
      <form className={`harness-composer${dragOver ? ' mira-composer--drag-over' : ''}`} onDragEnter={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); if (!contextBlocked && controller.supportsAttachments) { dragDepth.current++; setDragOver(true) } }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = contextBlocked || !controller.supportsAttachments ? 'none' : 'copy' } }} onDragLeave={event => { if (event.dataTransfer.types.includes('Files')) { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragOver(false) } }} onDrop={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current = 0; setDragOver(false); if (!contextBlocked && controller.supportsAttachments) void selectFiles(draft, Array.from(event.dataTransfer.files)) }} onSubmit={event => { const reverse = pointerReverseRef.current; pointerReverseRef.current = false; void submit(event, reverse ? reverseOptions : undefined) }}>
        <MiraComposerAttachments references={references} ownerId={sessionId} controller={controller} disabled={inputBlocked} active={active} onRemove={removeReference} onBlocked={onAttachmentsBlocked} />
        {dragOver && <div className="mira-composer-drop-hint" role="status"><Paperclip size={20} /><span>释放以添加图片或文本附件</span></div>}
        <MiraBrowserContexts key={`web:${draftKey}`} references={browserReferences} disabled={inputBlocked || Boolean(queueConfirmation)} onRemove={removeBrowserReference} onRemoveAll={() => removeBrowserReference()} onReturnFocus={() => focusInput()} />
        <MiraPromptEditor key={editorKey} ref={editorRef} text={editorText} document={editorDocument} disabled={inputBlocked} onPaste={pasteAttachments}
          onHistoryNavigate={recallPromptInput}
          onFocusChange={focused => { setFocusedEditorKey(current => focused ? editorKey : current === editorKey ? undefined : current); if (!focused) { setDismissedToken(''); setTokenSelectionSnapshot(null) } }}
          onSelectionChange={range => { setTokenSelectionSnapshot(activeToken ? { owner: draftKey, text: draft, token: activeToken } : null); setCaret(range) }} onChange={(document, range) => { if (!interactionBlocked && !programmaticPromptChange.current && active && !busyRef.current && !controller.getSnapshot().sessionLoading) { setContextOpen(false); setPanelFilter(null); setPromptDocument(withMiraBrowserReferences(document, miraBrowserReferences(latestDraftSnapshot.current.documents?.[draftKey] ?? restoreMiraBrowserPromptDocument(latestDraftSnapshot.current.drafts[draftKey] ?? ''))), range) } }} onError={error => setComposerError(`输入编辑器出错：${error.message}；草稿会保留`)} onKeyDown={event => { if (event.isComposing || event.keyCode === 229 || inputBlocked || queueConfirmation) return; if (suggestionsOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) { onSuggestionKeyDown(event); return } if (event.shiftKey) return; if (submissionOptionsSupported && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(undefined, reverseOptions); return } if (shouldSendWithShortcut(sendShortcut, event)) { event.preventDefault(); void submit() } }} placeholder={placeholder} aria-label="任务内容" aria-expanded={suggestionsOpen} aria-controls={suggestionsOpen ? suggestionListId : undefined} aria-activedescendant={suggestionsOpen && selectedSuggestion ? `${suggestionListId}-${selectedSuggestion.id}` : undefined} />
        <div ref={toolbarRef} className="harness-composer__footer">
          <div className="harness-composer__controls" data-mira-toolbar-leading><div className="mira-composer-leading-content" data-mira-toolbar-content>
            <ComposerControlHint title="添加上下文与能力"><button ref={contextTriggerRef} type="button" className="harness-composer__icon-button" aria-label="添加上下文" aria-expanded={contextOpen} aria-controls={contextOpen ? suggestionListId : undefined} disabled={contextBlocked} onMouseDown={event => { event.preventDefault(); captureMenuSelection() }} onClick={openContext}><Plus size={16} /></button></ComposerControlHint>
            <DropdownMenu.Root modal={false} open={active && modeOpen} onOpenChange={open => { setModeOpen(open && active); if (open) { closeSuggestions(); setModelOpen(false); setReasoningOpen(false) } }}>
              <ComposerControlHint title={`权限：${PERMISSIONS.find(item => item.value === permission)?.label}`} shortcut="Ctrl+Shift+M"><DropdownMenu.Trigger type="button" data-mira-toolbar-priority="1" className={cn('harness-composer__menu-trigger mira-composer-permission-trigger', permission === 'full' && 'harness-composer__menu-trigger--full')} aria-label="权限与计划模式" disabled={permissionBlocked}><PermissionIcon size={16} /><span>{PERMISSIONS.find(item => item.value === permission)?.label}</span><ChevronDown size={12} /></DropdownMenu.Trigger></ComposerControlHint>
              <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="start" side="top" sideOffset={4} className="harness-composer__menu harness-composer__mode-menu" {...permissionMenuFocus.contentProps}>
                <DropdownMenu.CheckboxItem className="harness-composer__menu-item harness-composer__mode-option" checked={planning} disabled={nextConfigBlocked} onCheckedChange={selectPlanning}><Lightbulb size={16} /><span><strong>计划模式</strong><small>先制定计划，确认后再执行</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.CheckboxItem>
                <DropdownMenu.Separator className="harness-composer__menu-separator" />
                <DropdownMenu.RadioGroup value={permission} onValueChange={value => selectPermission(value as PermissionMode)}>{PERMISSIONS.map(item => { const Icon = item.value === 'default' ? Hand : item.value === 'auto-approve' ? ShieldCheck : ShieldAlert; return <DropdownMenu.RadioItem key={item.value} value={item.value} className="harness-composer__menu-item harness-composer__mode-option"><Icon size={16} /><span><strong>{item.label}</strong><small>{item.description}</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem> })}</DropdownMenu.RadioGroup>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
            {planning && <><span className="mira-composer-plan-separator" /><ComposerControlHint title="关闭计划模式"><button type="button" data-mira-toolbar-priority="2" className="harness-composer__menu-trigger mira-composer-plan-marker" aria-label="关闭计划模式" disabled={nextConfigBlocked} onClick={() => selectPlanning(false)}><Lightbulb size={16} className="mira-composer-plan-marker__bulb" /><X size={16} className="mira-composer-plan-marker__remove" /><span>计划</span></button></ComposerControlHint></>}
            {leadingActions}
          </div></div>
          <div className="harness-composer__right-actions" data-mira-toolbar-trailing>
            {showContextUsage && <MiraContextUsage key={draftKey} usage={usage} contextWindow={selectedModel?.contextWindow} disabled={Boolean(!active || state.sessionLoading)} compactDisabled={Boolean(compactBlocked || !controller.supportsContextCompaction || !sessionId || state.session?.draftState === 'prepared' || state.session?.archivedAt || !state.selection)} compactReason={!sessionId || state.session?.draftState === 'prepared' ? '已有对话可压缩较早上下文' : undefined} compactQueued={compactQueued} compactPending={Boolean(compactRunning || sessionId && compactionPending === sessionId)} onCompact={() => { editorRef.current?.focus(); return compactConversation() }} />}
            <DropdownMenu.Root modal={false} open={active && modelOpen} onOpenChange={open => { setModelOpen(open && active); if (open) { closeSuggestions(); setModeOpen(false); setReasoningOpen(false) } }}>
              <ComposerControlHint title={selectedModel ? `${selectedModel.providerName} / ${selectedModel.modelId}` : '选择模型'} shortcut="Ctrl+M"><DropdownMenu.Trigger type="button" className="harness-composer__menu-trigger harness-composer__model-trigger" aria-label="模型" disabled={nextConfigBlocked}><Package size={16} className="mira-composer-model-icon" /><span>{selectedModel?.modelId || '管理模型'}</span><ChevronDown size={12} /></DropdownMenu.Trigger></ComposerControlHint>
              <MiraModelMenu open={active && modelOpen} ownerKey={draftKey} models={availableModels} selected={selectedModel} container={portalContainer} disabled={nextConfigBlocked} onSelect={model => { if (!nextConfigBlocked && !busyRef.current) controller.select({ ...controller.getSnapshot().selection, providerId: model.providerId, modelId: model.modelId } satisfies ModelSelection) }} onManage={() => void controller.navigate('/settings/model-config')} onReturnFocus={() => { if (activeRef.current) editorRef.current?.focus() }} />
            </DropdownMenu.Root>
            {/* Model/reasoning toolbar interaction follows ZCode; attribution is recorded in third-party-licenses/zcode. */}
            {selectedModel?.reasoning && <DropdownMenu.Root modal={false} open={active && reasoningOpen} onOpenChange={open => { setReasoningOpen(open && !nextConfigBlocked); if (open) { closeSuggestions(); setModeOpen(false); setModelOpen(false) } }}>
              <ComposerControlHint title={`推理强度：${reasoningLabel}`} shortcut="Ctrl+T"><DropdownMenu.Trigger type="button" data-mira-toolbar-priority="3" className="harness-composer__menu-trigger harness-composer__reasoning-trigger" aria-label={`推理强度：${reasoningLabel}`} disabled={nextConfigBlocked}><Brain size={16} /><i className="mira-composer-reasoning-meter" aria-hidden="true"><i style={{ height: `${Math.max(0, COMPOSER_REASONING_CHOICES.findIndex(item => item.value === reasoningLevel)) / (COMPOSER_REASONING_CHOICES.length - 1) * 100}%` }} /></i><span>{reasoningLabel}</span><ChevronDown size={12} /></DropdownMenu.Trigger></ComposerControlHint>
              <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="end" side="top" sideOffset={4} className="harness-composer__menu harness-composer__reasoning-menu" {...reasoningMenuFocus.contentProps}>
                <DropdownMenu.Label className="harness-composer__menu-label">推理强度</DropdownMenu.Label>
                <DropdownMenu.RadioGroup value={reasoningLevel} onValueChange={value => { if (nextConfigBlocked || busyRef.current) return; const selection = applyComposerReasoning(controller.getSnapshot().selection, selectedModel, value); if (selection) controller.select(selection) }}>
                  {COMPOSER_REASONING_CHOICES.map(choice => <DropdownMenu.RadioItem key={choice.value} value={choice.value} className="harness-composer__menu-item"><span>{choice.label}</span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>}
            {referenceLoading && <LoaderCircle size={14} className="animate-spin" aria-label="正在读取引用对话" />}
            {state.running && (!queueSupported || !hasInput) ? <ComposerControlHint title="停止任务" shortcut="Esc"><button type="button" className="harness-composer__send" aria-label="停止任务" disabled={!active} onClick={() => void controller.stop()}><Square size={14} fill="currentColor" /></button></ComposerControlHint> : <Tooltip.Root open={reverseSendHint || sendHintOpen} onOpenChange={setSendHintOpen}><Tooltip.Trigger asChild><button type="submit" className="harness-composer__send" aria-label={sendTitle} disabled={sendingBlocked || referenceLoading || attachmentBlocked || Boolean(failedUpload) || !hasInput} onClick={event => { pointerReverseRef.current = submissionOptionsSupported && state.running && (appleKeyboard ? event.metaKey : event.ctrlKey) }}>{busy || submitting.includes(draftKey) ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowUp size={16} />}</button></Tooltip.Trigger><Tooltip.Portal container={portalContainer}><Tooltip.Content className="mira-composer-hint" side="top" sideOffset={6}>{sendTitle}<kbd>{reverseSendHint ? appleKeyboard ? '⌘+Enter' : 'Ctrl+Enter' : sendKeyLabel}</kbd></Tooltip.Content></Tooltip.Portal></Tooltip.Root>}
          </div>
        </div>
      </form>
    </div>
    <Dialog.Root open={active && !state.sessionLoading && Boolean(queueConfirmation && queueConfirmation.ownerId === sessionId)} onOpenChange={open => { if (!open && !submittingRef.current.has(queueConfirmation?.ownerId ?? '')) setQueueConfirmation(previous => previous === queueConfirmation ? undefined : previous) }}><Dialog.Portal container={portalContainer}>
      <Dialog.Overlay className="mira-composer-confirm-overlay" />
      <Dialog.Content className="mira-composer-confirm" data-testid="mira-paused-queue-confirmation" onCloseAutoFocus={event => { event.preventDefault(); if (activeRef.current && !controller.getSnapshot().sessionLoading && controller.getSnapshot().session?.id === sessionId) editorRef.current?.focus() }} onEscapeKeyDown={event => { if (queueConfirmationPending) event.preventDefault() }} onInteractOutside={event => { if (queueConfirmationPending) event.preventDefault() }}>
        <Dialog.Close asChild><button type="button" className="mira-composer-confirm__close" aria-label="关闭发送确认" disabled={queueConfirmationPending}><X size={18} /></button></Dialog.Close>
        <Dialog.Title className="mira-composer-confirm__title">发送消息？</Dialog.Title>
        <Dialog.Description className="mira-composer-confirm__description">你即将发送一条消息。要清除之前已排队的 {queueConfirmation?.itemIds.length ?? 0} 条消息吗？</Dialog.Description>
        {queueConfirmationError && <p className="mira-composer-confirm__error" role="alert">{queueConfirmationError}</p>}
        <div className="mira-composer-confirm__actions">
          <button type="button" className="mira-composer-confirm__discard" disabled={queueConfirmationPending || sendingBlocked} onClick={() => confirmQueueSend('discard')}>清空队列</button>
          <button type="button" className="mira-composer-confirm__send" disabled={queueConfirmationPending || sendingBlocked} onClick={() => confirmQueueSend('retain')}>{queueConfirmationPending && <LoaderCircle size={16} className="animate-spin" />}发送消息</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </div></Popover.Root></Tooltip.Provider>
})

function choices(state: ReturnType<PilotController['getSnapshot']>) {
    return state.providers.flatMap(provider => isModelProviderAvailable(provider) ? provider.models.filter(model => model.enabled && Boolean(model.id.trim())).map(model => ({ providerId: provider.id, providerName: provider.name, modelId: model.id, reasoning: model.reasoning, multimodal: model.multimodal, contextWindow: model.contextWindow })) : [])
}
