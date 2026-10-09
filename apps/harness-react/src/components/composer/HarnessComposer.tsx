import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUp, Blocks, Brain, Check, ChevronDown, CircleAlert, FileText, FolderOpen, Hand, Lightbulb, LoaderCircle, MessageSquare, Paperclip, Plus, Search, Settings2, ShieldAlert, ShieldCheck, Square, Wrench, X } from 'lucide-react'
import { isModelProviderAvailable, shouldSendWithShortcut, type HarnessContextUsage, type HarnessFileReference, type HarnessMessageSubmissionOptions, type HarnessQueuedMessage, type ModelSelection, type PermissionMode, type SendShortcut } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { cn } from '../../lib/utils'
import { appendComposerReferences, mergeComposerDrafts, readComposerDrafts, serializeComposerDrafts, type ComposerDraftConfig, type ComposerDraftSnapshot, type ComposerDraftSubmission } from '../../lib/composer-drafts'
import { applyComposerReasoning, COMPOSER_REASONING_CHOICES } from '../../lib/model-reasoning'
import { filePreviewKind } from '../../lib/file-preview'
import { filterMiraSuggestions, findMiraPromptToken, formatMiraConversationReference, insertMiraPromptTrigger, miraPromptReplacementRange, nextMiraSuggestionIndex, replaceMiraPromptRange, type MiraPromptRange, type MiraPromptTrigger } from '../../lib/prompt-input-triggers'
import { ComposerControlHint } from './ComposerControlHint'
import { ComposerSuggestionPanel, type ComposerSuggestion, type ComposerSuggestionSection } from './ComposerSuggestionPanel'
import { useComposerCatalogs } from './useComposerCatalogs'
import { HarnessMessageQueue } from './HarnessMessageQueue'
import { MiraBranchPicker } from '../git/MiraBranchPicker'

const PERMISSIONS: Array<{ value: PermissionMode; label: string; description: string }> = [
  { value: 'default', label: '逐次确认', description: '工具执行前由你确认' },
  { value: 'auto-approve', label: '自动审核', description: '自动审核常规操作，保留危险操作拦截' },
  { value: 'full', label: '完全访问', description: '跳过工具确认，保留危险命令拦截' },
]
const DRAFT_PREFERENCE_KEY = 'harness-react-composer-drafts'

export interface HarnessComposerHandle {
  prepareSession(isCurrent?: () => boolean): Promise<string | undefined>
  addFileReference(sessionId: string, path: string): void
}

type HarnessComposerProps = {
  state: ReturnType<PilotController['getSnapshot']>
  controller: PilotController
  planning: boolean
  setPlanning: (value: boolean) => void
  draftProjectId?: string
  onDraftProjectChange?: (projectId?: string) => void
  active?: boolean
}

export const HarnessComposer = forwardRef<HarnessComposerHandle, HarnessComposerProps>(function HarnessComposer({ state, controller, planning, setPlanning, draftProjectId, onDraftProjectChange, active = true }, ref) {
  const sessionId = state.session?.id
  const draftKey = sessionId || 'draft'
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [fileDrafts, setFileDrafts] = useState<Record<string, HarnessFileReference[]>>({})
  const [draftPermission, setDraftPermission] = useState<PermissionMode>('default')
  const [draftSkillIds, setDraftSkillIds] = useState<string[]>([])
  const [draftMcpIds, setDraftMcpIds] = useState<string[]>([])
  const [draftDelegation, setDraftDelegation] = useState(true)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const editedConfig = useRef(new Set<keyof ComposerDraftConfig>())
  const preferencesLoad = useRef<Promise<void> | undefined>(undefined)
  const preferencesReady = useRef(false)
  const preferencesCycle = useRef(0)
  const [busy, setBusy] = useState(false)
  const [composerError, setComposerError] = useState('')
  const [dismissedHostError, setDismissedHostError] = useState<string>()
  const busyRef = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active
  const submittingRef = useRef(new Set<string>())
  const [submitting, setSubmitting] = useState<string[]>([])
  const [submissions, setSubmissions] = useState<Record<string, ComposerDraftSubmission | undefined>>({})
  const [queueConfirmation, setQueueConfirmation] = useState<{ ownerId: string; revision: number; itemIds: string[]; delivery?: 'immediate' }>()
  const queueConfirmationRef = useRef(queueConfirmation)
  queueConfirmationRef.current = queueConfirmation
  const [primaryModifierPressed, setPrimaryModifierPressed] = useState(false)
  const [sendHintOpen, setSendHintOpen] = useState(false)
  const pointerImmediateRef = useRef(false)
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
  const [projectQuery, setProjectQuery] = useState('')
  const [modelQuery, setModelQuery] = useState('')
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<string>()
  const [dismissedToken, setDismissedToken] = useState('')
  const [caret, setCaret] = useState<MiraPromptRange>({ start: 0, end: 0 })
  const menuSelection = useRef<MiraPromptRange>({ start: 0, end: 0 })
  const textRevision = useRef(0)
  const ownerTextRevisions = useRef(new Map<string, number>())
  const referenceRead = useRef(false)
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [sendShortcut, setSendShortcut] = useState<SendShortcut>('enter')
  const [showContextUsage, setShowContextUsage] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contextTriggerRef = useRef<HTMLButtonElement>(null)
  const draftSnapshot = useMemo<ComposerDraftSnapshot>(() => ({
    drafts, fileDrafts, recoveries, submissions,
    config: { permission: draftPermission, skillIds: draftSkillIds, mcpIds: draftMcpIds, delegation: draftDelegation, planning, projectId: draftProjectId },
  }), [drafts, fileDrafts, recoveries, submissions, draftPermission, draftSkillIds, draftMcpIds, draftDelegation, planning, draftProjectId])
  const latestDraftSnapshot = useRef(draftSnapshot)
  latestDraftSnapshot.current = draftSnapshot
  const draft = drafts[draftKey] ?? ''
  const references = fileDrafts[draftKey] ?? []
  const pendingSubmission = submissions[draftKey]
  const retriesSubmission = Boolean(pendingSubmission && pendingSubmission.text === draft.trim() && JSON.stringify(pendingSubmission.references) === JSON.stringify(references))
  // 会话配置是宿主快照的事实来源；切换任务时不能用本地空数组覆盖已持久化选择。
  const activeSkillIds = state.session?.activeSkillIds ?? (sessionId ? [] : draftSkillIds)
  const activeMcpIds = state.session?.activeMcpServerIds ?? (sessionId ? [] : draftMcpIds)
  const permission = state.session?.permissionMode ?? draftPermission
  const selectedProject = state.projects.find(project => project.id === (state.session?.projectId ?? draftProjectId))
  const availableModels = choices(state)
  const selectedModel = availableModels.find(model => model.providerId === state.selection?.providerId && model.modelId === state.selection?.modelId)
  const reasoningLevel = state.selection?.thinkingLevel ?? 'medium'
  const reasoningLabel = COMPOSER_REASONING_CHOICES.find(item => item.value === reasoningLevel)?.label ?? reasoningLevel
  const queueSupported = controller.supportsMessageQueue
  const submissionOptionsSupported = controller.supportsQueueSubmissionOptions
  const appleKeyboard = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  const confirmationPending = Boolean(state.permission || state.session?.pendingInteraction?.status === 'waiting')
  const sendingBlocked = !active || !preferencesLoaded || busy || submitting.includes(draftKey) || recoveryWrites.includes(draftKey) || Boolean(recoverySaveErrors[draftKey]) || state.sessionLoading || !state.selection || !queueSupported && (state.running || confirmationPending)
  const configurationUnavailable = !preferencesLoaded || busy || submitting.includes(draftKey) || state.sessionLoading || state.running || confirmationPending
  const configBlocked = !active || configurationUnavailable
  const nextConfigBlocked = !active || !preferencesLoaded || busy || state.sessionLoading || !queueSupported && (state.running || confirmationPending)
  const contextBlocked = nextConfigBlocked
  const inputBlocked = !active || state.sessionLoading || busy
  const visibleError = composerError || (state.error !== dismissedHostError ? state.error : '')
  const activeToken = findMiraPromptToken(draft, caret.start, caret.end)
  const tokenSignature = activeToken ? `${draftKey}:${activeToken.start}:${activeToken.end}:${activeToken.trigger}:${activeToken.query}` : ''
  const suggestionsOpen = !contextBlocked && (contextOpen || Boolean(activeToken && dismissedToken !== tokenSignature))
  const suggestionQuery = contextOpen ? '' : activeToken?.query || ''
  const kind = contextOpen ? panelFilter : activeToken?.trigger
  const includeFiles = kind === '@' || contextOpen && !panelFilter
  const catalogs = useComposerCatalogs(controller, sessionId, state.session?.workingDirectory, suggestionQuery, suggestionsOpen, includeFiles)
  const slashCommands = [
    { id: 'files', label: '/files', description: '添加文件附件', icon: <Paperclip size={16} /> },
    { id: 'skills', label: '/skills', description: '选择当前任务技能', icon: <Wrench size={16} /> },
    { id: 'mcp', label: '/mcp', description: '选择 MCP 服务', icon: <Blocks size={16} /> },
    { id: 'model', label: '/model', description: '切换模型', icon: <Brain size={16} /> },
    ...(selectedModel?.reasoning ? [{ id: 'thinking', label: '/thinking', description: '调整推理强度', icon: <Brain size={16} /> }] : []),
    { id: 'plan', label: '/plan', description: planning ? '关闭计划模式' : '开启计划模式', icon: <Lightbulb size={16} /> },
    { id: 'delegation', label: '/delegation', description: (state.session?.delegationEnabled ?? draftDelegation) ? '关闭子任务委派' : '开启子任务委派', icon: <Blocks size={16} /> },
    ...(sessionId ? [{ id: 'memory', label: '/memory', description: '保存项目记忆', icon: <FileText size={16} /> }] : []),
    { id: 'perm', label: '/perm', description: '切换权限模式', icon: <Hand size={16} /> },
  ].map(command => ({ ...command, disabled: configBlocked && ['skills', 'mcp', 'delegation', 'memory', 'perm'].includes(command.id), id: `command-${command.id}`, action: { type: 'command' as const, value: command.id } }))
  const suggestionSections: ComposerSuggestionSection[] = []
  if (contextOpen && !panelFilter) suggestionSections.push({ id: 'add', title: '添加', items: [
    { id: 'attach-files', label: '添加文件附件', description: selectedProject ? '文本文件' : '先选择项目', icon: <Paperclip size={16} />, action: { type: 'command', value: 'files' } },
    { id: 'open-commands', label: '命令与能力', description: '/', icon: <Wrench size={16} />, action: { type: 'command', value: 'open-commands' } },
  ] })
  if (kind === '/') suggestionSections.push({ id: 'commands', title: 'Mira 命令', items: filterMiraSuggestions(slashCommands, suggestionQuery), empty: '没有匹配的 Mira 命令' })
  if (kind !== '/' && kind !== '$' && kind !== 'skills' && kind !== 'mcp') {
    suggestionSections.push({ id: 'files', title: catalogs.files.truncated ? '文件（前 40 项）' : '文件', items: catalogs.files.items.map(file => ({ id: `file-${file.path}`, label: file.name, description: filePreviewKind(file.path) === 'bitmap' ? '暂不支持图片附件' : file.path, disabled: filePreviewKind(file.path) === 'bitmap', icon: <FileText size={16} />, action: { type: 'file', value: file.path } })), loading: catalogs.files.status === 'loading', error: catalogs.files.error, onRetry: catalogs.reload, empty: !sessionId ? '当前草稿尚未关联工作目录' : !state.session?.workingDirectory ? '当前任务没有可用工作目录' : '没有匹配的文件' })
    const sessions = state.sessions.filter(session => session.id !== sessionId && session.projectId === (state.session?.projectId ?? draftProjectId))
    suggestionSections.push({ id: 'sessions', title: '对话', items: filterMiraSuggestions(sessions.map(session => ({ id: `session-${session.id}`, label: session.title, description: '引用对话正文', icon: <MessageSquare size={16} />, action: { type: 'session' as const, value: session.id } })), suggestionQuery), empty: '当前工作区暂无可引用对话' })
  }
  if (kind !== 'mcp') suggestionSections.push({ id: 'skills', title: '技能', items: filterMiraSuggestions(catalogs.skills.items.map(skill => ({ id: `skill-${skill.id}`, label: skill.name, description: skill.description, disabled: configBlocked, icon: <Wrench size={16} />, selected: activeSkillIds.includes(skill.id), action: { type: 'skill' as const, value: skill.id } })), suggestionQuery), loading: catalogs.skills.status === 'loading', error: catalogs.skills.error, onRetry: catalogs.reload, empty: '没有匹配的已启用技能' })
  if (kind !== '$' && kind !== 'skills') suggestionSections.push({ id: 'mcp', title: 'MCP 服务', items: filterMiraSuggestions(catalogs.mcp.items.map(server => ({ id: `mcp-${server.id}`, label: server.name, selected: activeMcpIds.includes(server.id), disabled: configBlocked, icon: <Blocks size={16} />, action: { type: 'mcp' as const, value: server.id } })), suggestionQuery), loading: catalogs.mcp.status === 'loading', error: catalogs.mcp.error, onRetry: catalogs.reload, empty: '没有匹配的已启用 MCP 服务' })
  const suggestionItems = suggestionSections.flatMap(section => section.items)
  const highlightedIndex = suggestionItems.findIndex(item => item.id === highlightedSuggestionId && !item.disabled)
  const suggestionIndex = highlightedIndex >= 0 ? highlightedIndex : suggestionItems.findIndex(item => !item.disabled)
  const selectedSuggestion = suggestionItems[suggestionIndex]

  useImperativeHandle(ref, () => ({
    addFileReference(ownerId, path) {
      if (ownerId !== sessionId || !preferencesReady.current || inputBlocked) return
      try {
        const references = appendComposerReferences(latestDraftSnapshot.current.fileDrafts[ownerId] ?? [], [{ path, name: path.split('/').pop() || path }])
        setReferences(references, ownerId)
        setComposerError('')
      } catch (error) { setComposerError(error instanceof Error ? error.message : String(error)); return }
      textareaRef.current?.focus()
    },
    async prepareSession(isCurrent) {
      if (configurationUnavailable || !active && !isCurrent || isCurrent && !isCurrent() || busyRef.current || controller.getSnapshot().sessionLoading) return undefined
      busyRef.current = true; setBusy(true); setComposerError(''); setDismissedHostError(undefined)
      try { return await ensureSession(draft, isCurrent) }
      catch (error) { if (!isCurrent || isCurrent()) setComposerError(`准备任务失败：${error instanceof Error ? error.message : String(error)}`); return undefined }
      finally { busyRef.current = false; setBusy(false) }
    },
  }))

  useEffect(() => {
    let mounted = true
    const cycle = ++preferencesCycle.current
    preferencesLoad.current = controller.getPreference(DRAFT_PREFERENCE_KEY).then(value => {
      if (cycle !== preferencesCycle.current) return
      const restored = mergeComposerDrafts(readComposerDrafts(value), latestDraftSnapshot.current, editedConfig.current)
      latestDraftSnapshot.current = restored
      preferencesReady.current = true
      if (!mounted) return
      setDrafts(previous => ({ ...restored.drafts, ...previous }))
      setFileDrafts(previous => ({ ...restored.fileDrafts, ...previous }))
      setRecoveries(previous => ({ ...restored.recoveries, ...previous }))
      setSubmissions(previous => ({ ...restored.submissions, ...previous }))
      if (!editedConfig.current.has('permission')) setDraftPermission(restored.config.permission)
      if (!editedConfig.current.has('skillIds')) setDraftSkillIds(restored.config.skillIds)
      if (!editedConfig.current.has('mcpIds')) setDraftMcpIds(restored.config.mcpIds)
      if (!editedConfig.current.has('delegation')) setDraftDelegation(restored.config.delegation)
      if (!editedConfig.current.has('planning')) setPlanning(restored.config.planning)
      if (!editedConfig.current.has('projectId')) onDraftProjectChange?.(restored.config.projectId)
      setPreferencesLoaded(true)
    })
    void preferencesLoad.current.catch(() => { if (mounted) { setComposerError('草稿读取失败，请重新打开 Harness 后再离开当前编辑'); setPreferencesLoaded(true) } })
    return () => {
      mounted = false
      void preferencesLoad.current?.then(() => {
        if (cycle === preferencesCycle.current) return controller.setPreference(DRAFT_PREFERENCE_KEY, serializeComposerDrafts(latestDraftSnapshot.current), true)
      }).catch(() => undefined)
    }
  }, [controller])
  useEffect(() => {
    if (!preferencesLoaded) return
    const timer = window.setTimeout(() => { void persistDrafts().catch(error => setComposerError(error instanceof Error ? error.message : '草稿保存失败')) }, 250)
    return () => window.clearTimeout(timer)
  }, [controller, draftSnapshot, preferencesLoaded])
  useEffect(() => controller.registerBeforeNavigation(persistDrafts), [controller])
  useEffect(() => {
    const flush = () => { void persistDrafts().catch(() => undefined) }
    window.addEventListener('pagehide', flush, true)
    window.addEventListener('beforeunload', flush, true)
    return () => {
      window.removeEventListener('pagehide', flush, true)
      window.removeEventListener('beforeunload', flush, true)
    }
  }, [controller])

  useEffect(() => { setContextOpen(false); setModeOpen(false); setModelOpen(false); setReasoningOpen(false); setQueueConfirmation(undefined); setSendHintOpen(false); setPrimaryModifierPressed(false); pointerImmediateRef.current = false; setPanelFilter(null); setComposerError(''); setCaret({ start: draft.length, end: draft.length }); textRevision.current++ }, [draftKey])
  useEffect(() => {
    if (state.sessionLoading || !active) { closeSuggestions(); setModeOpen(false); setModelOpen(false); setReasoningOpen(false); setProjectOpen(false); setQueueConfirmation(undefined); setSendHintOpen(false); setPrimaryModifierPressed(false); pointerImmediateRef.current = false; textRevision.current++ }
  }, [state.sessionLoading, active])
  useEffect(() => { if (!selectedModel?.reasoning || nextConfigBlocked) setReasoningOpen(false) }, [selectedModel?.reasoning, nextConfigBlocked])
  useEffect(() => { setHighlightedSuggestionId(undefined) }, [tokenSignature, contextOpen, panelFilter])
  useEffect(() => {
    let active = true
    void controller.getComposerPreferences().then(value => {
      if (active) { setSendShortcut(value.sendShortcut); setShowContextUsage(value.showContextUsage) }
    }, () => { if (active) setComposerError('输入偏好读取失败，暂使用 Enter 发送；重新打开 Harness 后重试') })
    return () => { active = false }
  }, [controller])
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(160, Math.max(40, element.scrollHeight))}px`
  }, [draft])
  useEffect(() => {
    if (!active) return
    const insertSuggestion = (event: Event) => {
      const text = (event as CustomEvent<string>).detail
      if (typeof text !== 'string' || busyRef.current || controller.getSnapshot().sessionLoading) return
      setDraft(text)
      textareaRef.current?.focus()
    }
    window.addEventListener('mira:compose-draft', insertSuggestion)
    return () => window.removeEventListener('mira:compose-draft', insertSuggestion)
  }, [draftKey, active])
  useEffect(() => {
    if (!active || !submissionOptionsSupported) return
    const updateModifier = (event: globalThis.KeyboardEvent) => setPrimaryModifierPressed(appleKeyboard ? event.metaKey : event.ctrlKey)
    const clearModifier = () => setPrimaryModifierPressed(false)
    window.addEventListener('keydown', updateModifier)
    window.addEventListener('keyup', updateModifier)
    window.addEventListener('blur', clearModifier)
    return () => { window.removeEventListener('keydown', updateModifier); window.removeEventListener('keyup', updateModifier); window.removeEventListener('blur', clearModifier) }
  }, [active, submissionOptionsSupported, appleKeyboard])
  useEffect(() => {
    if (!active) return
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || queueConfirmation || !textareaRef.current || textareaRef.current.closest('[inert]')) return
      const target = event.target as HTMLElement | null
      const fromComposer = target === textareaRef.current
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
            if (event.shiftKey) { if (!configBlocked) selectPermission(PERMISSIONS[(PERMISSIONS.findIndex(item => item.value === permission) + 1) % PERMISSIONS.length].value) }
            else { setModeOpen(false); setReasoningOpen(false); setModelOpen(open => !open) }
          }
        }
      }
      if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && state.running && !suggestionsOpen && !modeOpen && !modelOpen && !reasoningOpen && !document.querySelector('[role="dialog"], [role="menu"][data-state="open"]')) {
        event.preventDefault(); void controller.stop()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [active, configBlocked, nextConfigBlocked, controller, sessionId, permission, selectedModel, reasoningLevel, state.running, suggestionsOpen, modeOpen, modelOpen, reasoningOpen, queueConfirmation])

  function setDraft(value: string, key = draftKey, selection: MiraPromptRange = { start: value.length, end: value.length }) {
    latestDraftSnapshot.current = { ...latestDraftSnapshot.current, drafts: { ...latestDraftSnapshot.current.drafts, [key]: value } }
    setDrafts(previous => ({ ...previous, [key]: value }))
    ownerTextRevisions.current.set(key, (ownerTextRevisions.current.get(key) ?? 0) + 1)
    if (key === draftKey) { textRevision.current++; setCaret(selection); setDismissedToken('') }
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
  function persistDrafts(): Promise<void> {
    const write = () => {
      try { return controller.setPreference(DRAFT_PREFERENCE_KEY, serializeComposerDrafts(latestDraftSnapshot.current), true) }
      catch (error) { return Promise.reject(error) }
    }
    return preferencesReady.current ? write() : (preferencesLoad.current ?? Promise.resolve()).then(write)
  }
  function selectProject(projectId?: string) {
    editedConfig.current.add('projectId')
    onDraftProjectChange?.(projectId)
  }
  function selectPlanning(value: boolean) {
    if (nextConfigBlocked) return
    editedConfig.current.add('planning')
    setPlanning(value)
  }
  function restoreInputFocus(event: Event) { event.preventDefault(); textareaRef.current?.focus() }
  async function updateConfiguration(change: () => Promise<void>) {
    if (busyRef.current || controller.getSnapshot().sessionLoading) return
    busyRef.current = true; setBusy(true)
    try { await change() } finally { busyRef.current = false; setBusy(false) }
  }
  function selectPermission(next: PermissionMode) {
    if (configBlocked) return
    if (sessionId) void updateConfiguration(() => controller.setSessionPermission(sessionId, next))
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
  async function ensureSession(draftText = draft, isCurrent?: () => boolean) {
    const initial = controller.getSnapshot()
    if (initial.sessionLoading || initial.session?.id !== sessionId || isCurrent && !isCurrent()) return undefined
    if (sessionId) return sessionId
    const selection = state.selection
    if (!await controller.create(draftProjectId, isCurrent) || isCurrent && !isCurrent()) return undefined
    const created = controller.getSnapshot()
    const createdId = created.session?.id
    if (!createdId || created.sessionLoading) return undefined
    if (selection) controller.select(selection)
    setDraft(draftText, createdId)
    setReferences(references, createdId)
    setDraft('', 'draft')
    setReferences([], 'draft')
    const configurationWrites = [
      ...(draftPermission !== 'default' ? [() => controller.setSessionPermission(createdId, draftPermission)] : []),
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
  async function selectFiles(draftText = draft) {
    if (busyRef.current || controller.getSnapshot().sessionLoading) return
    if (!(controller.getSnapshot().session?.projectId ?? draftProjectId)) {
      setComposerError('请先选择项目，再使用文件选择器；个人工作区内的文件可以从文件树加入对话。')
      return
    }
    busyRef.current = true; setBusy(true); setComposerError('')
    try {
      const id = await ensureSession(draftText)
      if (!id || controller.getSnapshot().sessionLoading || controller.getSnapshot().session?.id !== id) return
      const selected = await controller.selectFiles()
      if (controller.getSnapshot().sessionLoading || controller.getSnapshot().session?.id !== id) return
      const references = appendComposerReferences(latestDraftSnapshot.current.fileDrafts[id] ?? [], selected)
      setReferences(references, id)
    } catch (error) { setComposerError(`添加文件失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { busyRef.current = false; setBusy(false) }
  }
  function closeSuggestions() {
    setContextOpen(false); setPanelFilter(null); setDismissedToken(tokenSignature)
  }
  function captureMenuSelection() {
    menuSelection.current = { start: textareaRef.current?.selectionStart ?? caret.start, end: textareaRef.current?.selectionEnd ?? caret.end }
  }
  function openContext() {
    if (contextBlocked) return
    if (contextOpen) { closeSuggestions(); return }
    captureMenuSelection()
    setModeOpen(false); setModelOpen(false); setReasoningOpen(false); setPanelFilter(null); setContextOpen(true)
  }
  function focusInput(position = caret.start) {
    const owner = draftKey, revision = textRevision.current
    window.requestAnimationFrame(() => {
      if ((controller.getSnapshot().session?.id || 'draft') !== owner || textRevision.current !== revision) return
      textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(position, position)
    })
  }
  function applyPromptText(next: { text: string; caret: number }) {
    setDraft(next.text, draftKey, { start: next.caret, end: next.caret })
    menuSelection.current = { start: next.caret, end: next.caret }
    focusInput(next.caret)
  }
  function openPromptTrigger(trigger: MiraPromptTrigger) {
    if (contextBlocked) return
    const range = contextOpen ? menuSelection.current : activeToken || caret
    setContextOpen(false); setPanelFilter(null)
    applyPromptText(insertMiraPromptTrigger(draft, range, trigger))
  }
  async function selectSuggestion(item: ComposerSuggestion) {
    if (contextBlocked || item.disabled || referenceRead.current) return
    if (item.action.type === 'command' && item.action.value === 'open-commands') { openPromptTrigger('/'); return }
    const range = contextOpen ? menuSelection.current : activeToken ? miraPromptReplacementRange(draft, activeToken, [item.label, item.action.value]) : caret
    if (item.action.type === 'session') {
      const owner = draftKey, revision = textRevision.current
      referenceRead.current = true; setReferenceLoading(true); setComposerError('')
      try {
        const referenced = await controller.getSession(item.action.value)
        if ((controller.getSnapshot().session?.id || 'draft') !== owner) return
        // 异步读取不能用旧光标范围覆盖刚输入的内容；用户可重新选择后重试。
        if (textRevision.current !== revision) throw new Error('读取对话期间草稿已修改，请重新选择引用')
        const next = replaceMiraPromptRange(draft, range, formatMiraConversationReference(referenced))
        if (next.text.length > 100_000) throw new Error('引用后消息超过 100000 字符，请缩短草稿或引用较短的对话')
        closeSuggestions(); applyPromptText(next)
      } catch (error) { if ((controller.getSnapshot().session?.id || 'draft') === owner) setComposerError(error instanceof Error ? error.message : '引用对话失败，请重试') }
      finally { referenceRead.current = false; setReferenceLoading(false) }
      return
    }
    if (item.action.type === 'file') {
      try {
        const next = appendComposerReferences(references, [{ path: item.action.value, name: item.label }])
        setReferences(next); setComposerError('')
      } catch (error) { setComposerError(error instanceof Error ? error.message : String(error)); return }
    }
    const next = replaceMiraPromptRange(draft, contextOpen ? { start: range.start, end: range.start } : range, '')
    closeSuggestions(); applyPromptText(next)
    if (item.action.type === 'skill') toggleTool('skills', item.action.value)
    if (item.action.type === 'mcp') toggleTool('mcp', item.action.value)
    if (item.action.type === 'command') await runSlash(item.action.value, next.text)
  }
  async function runSlash(commandId: string, draftText = draft) {
    if (contextBlocked || configBlocked && ['skills', 'mcp', 'delegation', 'memory', 'perm'].includes(commandId)) return
    if (commandId === 'files') await selectFiles(draftText)
    if (commandId === 'skills' || commandId === 'mcp') { setPanelFilter(commandId); setContextOpen(true) }
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
  async function saveMemory() {
    try { await controller.saveMemory() }
    catch (error) { setComposerError(`保存记忆失败：${error instanceof Error ? error.message : String(error)}`) }
  }
  function onSuggestionKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation()
      const next = nextMiraSuggestionIndex(suggestionIndex, event.key === 'ArrowDown' ? 1 : -1, suggestionItems)
      setHighlightedSuggestionId(suggestionItems[next]?.id)
    } else if ((event.key === 'Enter' || event.key === 'Tab' || contextOpen && event.key === ' ') && selectedSuggestion) {
      event.preventDefault(); event.stopPropagation(); void selectSuggestion(selectedSuggestion)
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closeSuggestions(); focusInput()
    }
  }
  async function submit(event?: FormEvent, requestedOptions?: HarnessMessageSubmissionOptions) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || !activeRef.current || sendingBlocked || busyRef.current || submittingRef.current.has(draftKey) || recoveryWriteRef.current.has(draftKey) || referenceRead.current) return
    if (requestedOptions && !submissionOptionsSupported) return
    if (queueConfirmation && !requestedOptions?.pausedQueueDecision) return
    const current = controller.getSnapshot()
    if (requestedOptions && current.running && !current.session?.activeRun?.id) { setComposerError('当前任务身份尚未同步，请稍后重试'); return }
    const options = requestedOptions ? { ...requestedOptions, expectedRunId: current.session?.activeRun?.id ?? null } : undefined
    busyRef.current = true; setBusy(true); setComposerError(''); setDismissedHostError(undefined)
    let preparing = true
    try {
      const id = await ensureSession()
      if (!id) return
      // 创建或配置期间用户可切换任务，首条消息只能发送到发起它的那份草稿。
      if (controller.getSnapshot().sessionLoading || controller.getSnapshot().session?.id !== id) return
      if (queueSupported) {
        const revision = ownerTextRevisions.current.get(id) ?? 0
        const submittedReferences = latestDraftSnapshot.current.fileDrafts[id] ?? references
        const previous = latestDraftSnapshot.current.submissions?.[id]
        const retry = previous && previous.text === text && JSON.stringify(previous.references) === JSON.stringify(submittedReferences)
        const selection = { ...(retry ? previous.selection : controller.getSnapshot().selection!) }
        const submittedPlanning = retry ? previous.planning : planning
        const submittedOptions = retry ? previous.options : options
        const payload = { text, references: submittedReferences, selection, planning: submittedPlanning, ...(submittedOptions ? { options: submittedOptions } : {}) }
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
            setReferences((latestDraftSnapshot.current.fileDrafts[id] ?? []).filter(reference => !submittedReferences.includes(reference)), id)
            setSubmission(id, undefined)
            setQueueConfirmation(previous => previous?.ownerId === id ? undefined : previous)
            try { await persistDrafts(); setRecoverySaveErrors(previous => ({ ...previous, [id]: '' })) }
            catch (error) { setRecoverySaveErrors(previous => ({ ...previous, [id]: `消息已提交，草稿保存失败，发送已暂停：${error instanceof Error ? error.message : String(error)}` })) }
          } else if (sent === 'confirmation-required') {
            setSubmission(id, undefined)
            if (!result.sessionLoading && result.session?.id === id && activeRef.current) {
              const queue = result.queue
              if (queue?.sessionId === id && queue.items.length) {
                closeSuggestions(); setModeOpen(false); setModelOpen(false); setReasoningOpen(false); setSendHintOpen(false)
                setQueueConfirmation({ ownerId: id, revision: queue.revision, itemIds: queue.items.map(item => item.id), ...(submittedOptions?.delivery ? { delivery: submittedOptions.delivery } : {}) })
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
      setDraft('', id)
      setReferences([], id)
      const sending = controller.send(text, planning, references)
      busyRef.current = false; setBusy(false)
      preparing = false
      const sent = await sending
      const result = controller.getSnapshot()
      if (!sent) {
        setDrafts(previous => ({ ...previous, [id]: previous[id] || text }))
        setFileDrafts(previous => {
          const existing = previous[id] ?? []
          return { ...previous, [id]: [...existing, ...references.filter(item => !existing.some(reference => reference.path === item.path))] }
        })
        if (!result.sessionLoading && result.session?.id === id) setComposerError(result.error || '发送失败，请重试')
      }
    } finally { if (preparing) { busyRef.current = false; setBusy(false) } }
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
    setDraft(item.text, item.sessionId)
    setReferences(item.references.map(reference => ({ ...reference })), item.sessionId)
    controller.select({ ...item.selection })
    editedConfig.current.add('planning'); setPlanning(item.planning)
    textareaRef.current?.focus()
    return true
  }
  async function withdrawQueuedMessage(itemId: string, edit: boolean) {
    const ownerId = sessionId, current = controller.getSnapshot()
    if (!ownerId || !activeRef.current || busyRef.current || current.sessionLoading || current.session?.id !== ownerId || edit && !draftIsEmpty(ownerId)) return
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
    const target = document.querySelector<HTMLElement>('.pilot-action, [aria-label="计划确认"]')
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
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
  const usagePercent = usage?.contextWindow ? Math.round(usage.usedTokens / usage.contextWindow * 100) : 0
  const PermissionIcon = permission === 'default' ? Hand : permission === 'auto-approve' ? ShieldCheck : ShieldAlert
  const sendKeyLabel = sendShortcut === 'mod-enter' ? '⌘/Ctrl+Enter' : 'Enter'
  const immediateSendHint = submissionOptionsSupported && state.running && primaryModifierPressed && !sendingBlocked && Boolean(draft.trim()) && !queueConfirmation
  const sendTitle = busy ? '正在准备任务' : immediateSendHint ? '立即发送' : state.running || confirmationPending ? '加入待发送' : '发送任务'
  const queueConfirmationPending = Boolean(queueConfirmation && submitting.includes(queueConfirmation.ownerId))
  const queueConfirmationError = queueConfirmation ? recoverySaveErrors[queueConfirmation.ownerId] || visibleError : ''
  const placeholder = confirmationPending ? queueSupported ? '等待确认，可继续添加待发送消息' : '先处理上方确认；草稿会保留' : state.running ? '任务运行中，可先写好下一条消息' : state.messages.length ? '继续对话，@ 引用上下文，/ 选择能力' : '向 Mira 提问，@ 引用上下文，/ 选择能力'

  return <Tooltip.Provider delayDuration={350}><Popover.Root open={suggestionsOpen} onOpenChange={open => { if (!open) closeSuggestions() }}><div className={cn('harness-composer-region', !sessionId && 'harness-composer-region--draft')}>
    {visibleError && <div className="harness-composer__error" role="alert"><CircleAlert size={15} /><span>{visibleError}</span><button type="button" aria-label="关闭错误提示" onClick={() => { setComposerError(''); setDismissedHostError(state.error) }}><X size={14} /></button></div>}
    {queueSupported && sessionId && <HarnessMessageQueue key={sessionId} queue={state.queue?.sessionId === sessionId ? state.queue : undefined} recoveries={recoveries[sessionId] ?? []} pendingItems={withdrawals.filter(key => key.startsWith(`${sessionId}:`)).map(key => key.slice(sessionId.length + 1))} resumePending={resuming.includes(sessionId)} disabled={!active || Boolean(state.sessionLoading) || busy} editDisabled={!draftIsEmpty(sessionId) || submitting.includes(sessionId)} recoveryBlocked={recoveryWrites.includes(sessionId) || Boolean(recoverySaveErrors[sessionId])} confirmationPending={confirmationPending} error={recoverySaveErrors[sessionId] || state.queueError} onRetrySave={recoverySaveErrors[sessionId] ? retryRecoverySave : undefined} onEdit={id => withdrawQueuedMessage(id, true)} onDelete={id => withdrawQueuedMessage(id, false)} onRestore={restoreRecovery} onResume={resumeQueue} onConfirmation={showConfirmation} onMove={controller.supportsQueueReorder ? reorderQueue : undefined} reorderPending={reordering.includes(sessionId)} onSendNow={controller.supportsQueueSendNow ? sendQueuedNow : undefined} sendNowPendingItems={sendingNow.filter(key => key.startsWith(`${sessionId}:`)).map(key => key.slice(sessionId.length + 1))} />}
    {queueSupported && retriesSubmission && !submitting.includes(draftKey) && <div className="mira-composer-pending-submission" role="status">上次提交待确认，重试使用原模型和模式</div>}
    <Popover.Anchor asChild><div className="mira-composer-panel-anchor" /></Popover.Anchor>
    <Popover.Portal container={portalContainer}><Popover.Content className="mira-composer-panel-popover" side="top" align="start" sideOffset={4} onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()} onInteractOutside={event => { const target = event.target as Node | null; if (target === textareaRef.current || target && contextTriggerRef.current?.contains(target)) event.preventDefault() }} onEscapeKeyDown={event => { event.preventDefault(); closeSuggestions(); focusInput() }} onKeyDown={onSuggestionKeyDown}>
      <ComposerSuggestionPanel sections={suggestionSections} selectedIndex={suggestionIndex} onHighlight={index => setHighlightedSuggestionId(suggestionItems[index]?.id)} onSelect={item => void selectSuggestion(item)} onTrigger={openPromptTrigger} />
    </Popover.Content></Popover.Portal>
    <div className="harness-composer__surface">
      {(!sessionId || selectedProject?.isGitRepository && controller.supportsGitActions) && <div className="harness-composer__project-strip">
        {!sessionId && <>
        <DropdownMenu.Root open={active && projectOpen} onOpenChange={open => { setProjectOpen(open && active); if (!open) setProjectQuery('') }}>
          <DropdownMenu.Trigger type="button" className="harness-composer__project-trigger" aria-label="选择项目" disabled={configBlocked} title={selectedProject?.directory || '不绑定项目，使用个人工作区'}><FolderOpen size={16} /><span>{selectedProject?.name || '选择项目'}</span><ChevronDown size={12} /></DropdownMenu.Trigger>
          <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="start" side="top" sideOffset={4} className="harness-composer__menu harness-composer__project-menu" onCloseAutoFocus={restoreInputFocus}>
            <div className="harness-composer__search"><Search size={16} /><input value={projectQuery} onChange={event => setProjectQuery(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="搜索项目" aria-label="搜索项目" /></div>
            <DropdownMenu.RadioGroup value={draftProjectId || ''} onValueChange={value => selectProject(value || undefined)}>
              {state.projects.filter(project => `${project.name} ${project.directory}`.toLowerCase().includes(projectQuery.toLowerCase())).map(project => <DropdownMenu.RadioItem key={project.id} value={project.id} disabled={!project.directoryExists} className="harness-composer__menu-item"><FolderOpen size={16} /><span><strong>{project.name}</strong><small>{project.directoryExists ? project.directory : '项目目录不可用'}</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
              <DropdownMenu.Separator className="harness-composer__menu-separator" />
              <DropdownMenu.RadioItem value="" className="harness-composer__menu-item"><span>在项目外工作</span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
            <DropdownMenu.Separator className="harness-composer__menu-separator" />
            <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => void controller.navigate('/workspace/projects')}><FolderOpen size={16} /><span>管理项目</span></DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
        {selectedProject && <button type="button" className="harness-composer__project-detach" aria-label="脱离当前项目" title="脱离当前项目" disabled={configBlocked} onClick={() => selectProject(undefined)}><X size={13} /></button>}
        </>}
        <MiraBranchPicker key={selectedProject?.id} controller={controller} project={selectedProject} active={active} blocked={busy || Boolean(state.sessionLoading) || Boolean(selectedProject && state.sessions.some(session => session.projectId === selectedProject.id && state.runningSessionIds.includes(session.id))) || Boolean(state.queue?.items.length)} placement="composer" />
      </div>}
      <form className="harness-composer" onSubmit={event => { const immediate = pointerImmediateRef.current; pointerImmediateRef.current = false; void submit(event, immediate ? { delivery: 'immediate' } : undefined) }}>
        {references.length > 0 && <div className="harness-composer__attachments">{references.map(reference => <span key={reference.path} className="harness-composer__attachment" title={reference.path}><Paperclip size={14} /><span>{reference.name}</span><button type="button" aria-label={`移除 ${reference.name}`} title={`移除 ${reference.name}`} disabled={inputBlocked} onClick={() => setReferences(references.filter(item => item.path !== reference.path))}><X size={12} /></button></span>)}</div>}
        <textarea ref={textareaRef} rows={1} value={draft} readOnly={inputBlocked} aria-busy={inputBlocked || undefined} onSelect={event => { const element = event.currentTarget; setCaret({ start: element.selectionStart, end: element.selectionEnd }) }} onChange={event => { if (active && !busyRef.current && !controller.getSnapshot().sessionLoading) { setContextOpen(false); setPanelFilter(null); setDraft(event.target.value, draftKey, { start: event.target.selectionStart, end: event.target.selectionEnd }) } }} onKeyDown={event => { if (event.nativeEvent.isComposing || event.keyCode === 229 || inputBlocked || queueConfirmation) return; if (suggestionsOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) { onSuggestionKeyDown(event); return } if (event.shiftKey) return; if (submissionOptionsSupported && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(undefined, { delivery: 'immediate' }); return } if (shouldSendWithShortcut(sendShortcut, event.nativeEvent)) { event.preventDefault(); void submit() } }} placeholder={placeholder} aria-label="任务内容" aria-expanded={suggestionsOpen} aria-controls={suggestionsOpen ? 'mira-composer-suggestions' : undefined} aria-activedescendant={suggestionsOpen && selectedSuggestion ? `mira-suggestion-${selectedSuggestion.id}` : undefined} />
        <div className="harness-composer__footer">
          <div className="harness-composer__controls">
            <ComposerControlHint title="添加上下文与能力"><button ref={contextTriggerRef} type="button" className="harness-composer__icon-button" aria-label="添加上下文" aria-expanded={contextOpen} aria-controls="mira-composer-suggestions" disabled={contextBlocked} onMouseDown={event => { event.preventDefault(); captureMenuSelection() }} onClick={openContext}><Plus size={16} /></button></ComposerControlHint>
            <DropdownMenu.Root open={active && modeOpen} onOpenChange={open => { setModeOpen(open && active); if (open) { closeSuggestions(); setModelOpen(false); setReasoningOpen(false) } }}>
              <ComposerControlHint title={`权限：${PERMISSIONS.find(item => item.value === permission)?.label}`} shortcut="Ctrl+Shift+M"><DropdownMenu.Trigger type="button" className={cn('harness-composer__menu-trigger mira-composer-permission-trigger', permission === 'full' && 'harness-composer__menu-trigger--full')} aria-label="权限与计划模式" disabled={configBlocked}><PermissionIcon size={16} /><span>{PERMISSIONS.find(item => item.value === permission)?.label}</span><ChevronDown size={12} /></DropdownMenu.Trigger></ComposerControlHint>
              <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="start" side="top" sideOffset={4} className="harness-composer__menu harness-composer__mode-menu" onCloseAutoFocus={restoreInputFocus}>
                <DropdownMenu.CheckboxItem className="harness-composer__menu-item harness-composer__mode-option" checked={planning} disabled={nextConfigBlocked} onCheckedChange={selectPlanning}><Lightbulb size={16} /><span><strong>计划模式</strong><small>先制定计划，确认后再执行</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.CheckboxItem>
                <DropdownMenu.Separator className="harness-composer__menu-separator" />
                <DropdownMenu.RadioGroup value={permission} onValueChange={value => selectPermission(value as PermissionMode)}>{PERMISSIONS.map(item => { const Icon = item.value === 'default' ? Hand : item.value === 'auto-approve' ? ShieldCheck : ShieldAlert; return <DropdownMenu.RadioItem key={item.value} value={item.value} className="harness-composer__menu-item harness-composer__mode-option"><Icon size={16} /><span><strong>{item.label}</strong><small>{item.description}</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem> })}</DropdownMenu.RadioGroup>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
            {planning && <><span className="mira-composer-plan-separator" /><ComposerControlHint title="关闭计划模式"><button type="button" className="harness-composer__menu-trigger mira-composer-plan-marker" aria-label="关闭计划模式" disabled={nextConfigBlocked} onClick={() => selectPlanning(false)}><Lightbulb size={16} className="mira-composer-plan-marker__bulb" /><X size={16} className="mira-composer-plan-marker__remove" /><span>计划</span></button></ComposerControlHint></>}
          </div>
          <div className="harness-composer__right-actions">
            {showContextUsage && usagePercent > 0 && <ComposerControlHint title={`上下文 ${usagePercent}%（${usage!.usedTokens} / ${usage!.contextWindow} tokens，${usage!.source === 'reported' ? '实测' : '估算'}）`}><span className="harness-composer__usage" tabIndex={0}>{usagePercent}%</span></ComposerControlHint>}
            <DropdownMenu.Root open={active && modelOpen} onOpenChange={open => { setModelOpen(open && active); if (!open) setModelQuery(''); else { closeSuggestions(); setModeOpen(false); setReasoningOpen(false) } }}>
              <ComposerControlHint title={selectedModel ? `${selectedModel.providerName} / ${selectedModel.modelId}` : '选择模型'} shortcut="Ctrl+M"><DropdownMenu.Trigger type="button" className="harness-composer__menu-trigger harness-composer__model-trigger" aria-label="模型" disabled={nextConfigBlocked}><span>{selectedModel?.modelId || '管理模型'}</span><ChevronDown size={12} /></DropdownMenu.Trigger></ComposerControlHint>
              <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="end" side="top" sideOffset={4} className="harness-composer__menu harness-composer__model-menu" onCloseAutoFocus={restoreInputFocus}>
                <div className="harness-composer__search"><Search size={16} /><input value={modelQuery} onChange={event => setModelQuery(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="搜索模型" aria-label="搜索模型" /></div>
                <DropdownMenu.RadioGroup value={selectedModel ? `${selectedModel.providerId}:${selectedModel.modelId}` : ''} onValueChange={value => { if (nextConfigBlocked || busyRef.current) return; const model = availableModels.find(item => `${item.providerId}:${item.modelId}` === value); if (model) controller.select({ ...controller.getSnapshot().selection, providerId: model.providerId, modelId: model.modelId } satisfies ModelSelection) }}>
                  {availableModels.filter(model => `${model.providerName} ${model.modelId}`.toLowerCase().includes(modelQuery.toLowerCase())).map(model => <DropdownMenu.RadioItem key={`${model.providerId}:${model.modelId}`} value={`${model.providerId}:${model.modelId}`} className="harness-composer__menu-item"><span><strong>{model.modelId}</strong><small>{model.providerName}</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
                </DropdownMenu.RadioGroup>
                {!availableModels.length && <span className="harness-composer__menu-empty">请先在设置中配置模型</span>}
                {availableModels.length > 0 && !availableModels.some(model => `${model.providerName} ${model.modelId}`.toLowerCase().includes(modelQuery.toLowerCase())) && <span className="harness-composer__menu-empty">没有匹配的模型</span>}
                <DropdownMenu.Separator className="harness-composer__menu-separator" />
                <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => void controller.navigate('/settings/model-config')}><Settings2 size={16} /><span>管理模型</span></DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
            {/* Model/reasoning toolbar interaction follows ZCode; attribution is recorded in third-party-licenses/zcode. */}
            {selectedModel?.reasoning && <DropdownMenu.Root open={active && reasoningOpen} onOpenChange={open => { setReasoningOpen(open && !nextConfigBlocked); if (open) { closeSuggestions(); setModeOpen(false); setModelOpen(false) } }}>
              <ComposerControlHint title={`推理强度：${reasoningLabel}`} shortcut="Ctrl+T"><DropdownMenu.Trigger type="button" className="harness-composer__menu-trigger harness-composer__reasoning-trigger" aria-label={`推理强度：${reasoningLabel}`} disabled={nextConfigBlocked}><Brain size={16} /><span>{reasoningLabel}</span><ChevronDown size={12} /></DropdownMenu.Trigger></ComposerControlHint>
              <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="end" side="top" sideOffset={4} className="harness-composer__menu harness-composer__reasoning-menu" onCloseAutoFocus={restoreInputFocus}>
                <DropdownMenu.Label className="harness-composer__menu-label">推理强度</DropdownMenu.Label>
                <DropdownMenu.RadioGroup value={reasoningLevel} onValueChange={value => { if (nextConfigBlocked || busyRef.current) return; const selection = applyComposerReasoning(controller.getSnapshot().selection, selectedModel, value); if (selection) controller.select(selection) }}>
                  {COMPOSER_REASONING_CHOICES.map(choice => <DropdownMenu.RadioItem key={choice.value} value={choice.value} className="harness-composer__menu-item"><span>{choice.label}</span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>}
            {referenceLoading && <LoaderCircle size={14} className="animate-spin" aria-label="正在读取引用对话" />}
            {state.running && (!queueSupported || !draft.trim()) ? <ComposerControlHint title="停止任务" shortcut="Esc"><button type="button" className="harness-composer__send" aria-label="停止任务" disabled={!active} onClick={() => void controller.stop()}><Square size={14} fill="currentColor" /></button></ComposerControlHint> : <Tooltip.Root open={immediateSendHint || sendHintOpen} onOpenChange={setSendHintOpen}><Tooltip.Trigger asChild><button type="submit" className="harness-composer__send" aria-label={sendTitle} disabled={sendingBlocked || referenceLoading || !draft.trim()} onClick={event => { pointerImmediateRef.current = submissionOptionsSupported && state.running && (appleKeyboard ? event.metaKey : event.ctrlKey) }}>{busy || submitting.includes(draftKey) ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowUp size={16} />}</button></Tooltip.Trigger><Tooltip.Portal container={portalContainer}><Tooltip.Content className="mira-composer-hint" side="top" sideOffset={6}>{sendTitle}<kbd>{immediateSendHint ? appleKeyboard ? '⌘+Enter' : 'Ctrl+Enter' : sendKeyLabel}</kbd></Tooltip.Content></Tooltip.Portal></Tooltip.Root>}
          </div>
        </div>
      </form>
    </div>
    <Dialog.Root open={active && !state.sessionLoading && Boolean(queueConfirmation && queueConfirmation.ownerId === sessionId)} onOpenChange={open => { if (!open && !submittingRef.current.has(queueConfirmation?.ownerId ?? '')) setQueueConfirmation(previous => previous === queueConfirmation ? undefined : previous) }}><Dialog.Portal container={portalContainer}>
      <Dialog.Overlay className="mira-composer-confirm-overlay" />
      <Dialog.Content className="mira-composer-confirm" data-testid="mira-paused-queue-confirmation" onCloseAutoFocus={event => { event.preventDefault(); if (activeRef.current && !controller.getSnapshot().sessionLoading && controller.getSnapshot().session?.id === sessionId) textareaRef.current?.focus() }} onEscapeKeyDown={event => { if (queueConfirmationPending) event.preventDefault() }} onInteractOutside={event => { if (queueConfirmationPending) event.preventDefault() }}>
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
  return state.providers.flatMap(provider => isModelProviderAvailable(provider) ? provider.models.filter(model => model.enabled).map(model => ({ providerId: provider.id, providerName: provider.name, modelId: model.id, reasoning: model.reasoning })) : [])
}
