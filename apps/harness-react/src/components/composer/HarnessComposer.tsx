import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowUp, Blocks, Brain, Check, ChevronDown, ChevronRight, CircleAlert, FolderOpen, Hand, Lightbulb, Paperclip, Plus, Search, Settings2, ShieldAlert, ShieldCheck, Square, Wrench, X } from 'lucide-react'
import { isModelProviderAvailable, type HarnessContextUsage, type HarnessFileReference, type ModelSelection, type PermissionMode } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { cn } from '../../lib/utils'
import { appendComposerReferences, mergeComposerDrafts, readComposerDrafts, serializeComposerDrafts, type ComposerDraftConfig, type ComposerDraftSnapshot } from '../../lib/composer-drafts'
import { applyComposerReasoning, COMPOSER_REASONING_CHOICES } from '../../lib/model-reasoning'

const PERMISSIONS: Array<{ value: PermissionMode; label: string; description: string }> = [
  { value: 'default', label: '逐次确认', description: '工具执行前由你确认' },
  { value: 'auto-approve', label: '自动审核', description: '自动审核常规操作，保留危险操作拦截' },
  { value: 'full', label: '完全访问', description: '跳过工具确认，保留危险命令拦截' },
]
type ToolPanel = 'skills' | 'mcp' | null
type Catalog<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; items: T[] }
const DRAFT_PREFERENCE_KEY = 'harness-react-composer-drafts'

export interface HarnessComposerHandle {
  prepareSession(): Promise<string | undefined>
  addFileReference(sessionId: string, path: string): void
}

type HarnessComposerProps = {
  state: ReturnType<PilotController['getSnapshot']>
  controller: PilotController
  planning: boolean
  setPlanning: (value: boolean) => void
  draftProjectId?: string
  onDraftProjectChange?: (projectId?: string) => void
}

export const HarnessComposer = forwardRef<HarnessComposerHandle, HarnessComposerProps>(function HarnessComposer({ state, controller, planning, setPlanning, draftProjectId, onDraftProjectChange }, ref) {
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
  const [contextOpen, setContextOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [toolPanel, setToolPanel] = useState<ToolPanel>(null)
  const [projectQuery, setProjectQuery] = useState('')
  const [modelQuery, setModelQuery] = useState('')
  const [skills, setSkills] = useState<Catalog<{ id: string; name: string }>>({ status: 'idle', items: [] })
  const [mcpServers, setMcpServers] = useState<Catalog<{ id: string; name: string }>>({ status: 'idle', items: [] })
  const [slashIndex, setSlashIndex] = useState(0)
  const [dismissedSlash, setDismissedSlash] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const draftSnapshot = useMemo<ComposerDraftSnapshot>(() => ({
    drafts, fileDrafts,
    config: { permission: draftPermission, skillIds: draftSkillIds, mcpIds: draftMcpIds, delegation: draftDelegation, planning, projectId: draftProjectId },
  }), [drafts, fileDrafts, draftPermission, draftSkillIds, draftMcpIds, draftDelegation, planning, draftProjectId])
  const latestDraftSnapshot = useRef(draftSnapshot)
  latestDraftSnapshot.current = draftSnapshot
  const draft = drafts[draftKey] ?? ''
  const references = fileDrafts[draftKey] ?? []
  // 会话配置是宿主快照的事实来源；切换任务时不能用本地空数组覆盖已持久化选择。
  const activeSkillIds = state.session?.activeSkillIds ?? (sessionId ? [] : draftSkillIds)
  const activeMcpIds = state.session?.activeMcpServerIds ?? (sessionId ? [] : draftMcpIds)
  const permission = state.session?.permissionMode ?? draftPermission
  const selectedProject = state.projects.find(project => project.id === (state.session?.projectId ?? draftProjectId))
  const availableModels = choices(state)
  const selectedModel = availableModels.find(model => model.providerId === state.selection?.providerId && model.modelId === state.selection?.modelId)
  const reasoningLevel = state.selection?.thinkingLevel ?? 'medium'
  const reasoningLabel = COMPOSER_REASONING_CHOICES.find(item => item.value === reasoningLevel)?.label ?? reasoningLevel
  const sendingBlocked = !preferencesLoaded || busy || state.sessionLoading || !state.selection || state.running || Boolean(state.permission) || state.session?.pendingInteraction?.status === 'waiting'
  const configBlocked = !preferencesLoaded || busy || state.sessionLoading || state.running || Boolean(state.permission) || state.session?.pendingInteraction?.status === 'waiting'
  const inputBlocked = state.sessionLoading || busy && !state.running
  const visibleError = composerError || (state.error !== dismissedHostError ? state.error : '')
  const slashActive = draft.startsWith('/') && !/\s/.test(draft) && draft !== dismissedSlash
  const slashQuery = slashActive ? draft.slice(1).toLowerCase() : ''
  const slashCommands = [
    { id: 'files', label: '/files 引用文件', hint: '选择要加入任务上下文的文件' },
    { id: 'skills', label: '/skills Skill', hint: `选择任务使用的能力 · 已选 ${activeSkillIds.length} 项` },
    { id: 'mcp', label: '/mcp MCP 服务', hint: `连接任务可用服务 · 已选 ${activeMcpIds.length} 项` },
    { id: 'delegation', label: '/delegation 子任务委派', hint: (state.session?.delegationEnabled ?? draftDelegation) ? '关闭子任务委派' : '开启子任务委派' },
    ...(sessionId ? [{ id: 'memory', label: '/memory 保存项目记忆', hint: '把当前会话要点保存到项目记忆' }] : []),
    { id: 'perm', label: '/perm 权限模式', hint: `当前：${PERMISSIONS.find(item => item.value === permission)?.label}` },
  ].filter(command => !slashQuery || command.id.includes(slashQuery) || command.label.toLowerCase().includes(slashQuery))

  useImperativeHandle(ref, () => ({
    addFileReference(ownerId, path) {
      if (ownerId !== sessionId || !preferencesReady.current || inputBlocked) return
      try {
        const references = appendComposerReferences(latestDraftSnapshot.current.fileDrafts[ownerId] ?? [], [{ path, name: path.split('/').pop() || path }])
        setFileDrafts(previous => ({ ...previous, [ownerId]: references }))
        setComposerError('')
      } catch (error) { setComposerError(error instanceof Error ? error.message : String(error)); return }
      textareaRef.current?.focus()
    },
    async prepareSession() {
      if (configBlocked || busyRef.current || controller.getSnapshot().sessionLoading) return undefined
      busyRef.current = true; setBusy(true); setComposerError(''); setDismissedHostError(undefined)
      try { return await ensureSession() }
      catch (error) { setComposerError(`准备任务失败：${error instanceof Error ? error.message : String(error)}`); return undefined }
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

  useEffect(() => { setContextOpen(false); setModeOpen(false); setModelOpen(false); setReasoningOpen(false); setToolPanel(null); setComposerError('') }, [draftKey])
  useEffect(() => {
    if (state.sessionLoading) { setContextOpen(false); setModeOpen(false); setModelOpen(false); setReasoningOpen(false); setToolPanel(null) }
  }, [state.sessionLoading])
  useEffect(() => { if (!selectedModel?.reasoning || configBlocked) setReasoningOpen(false) }, [selectedModel?.reasoning, configBlocked])
  useEffect(() => { setSlashIndex(0) }, [slashQuery])
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(160, Math.max(40, element.scrollHeight))}px`
  }, [draft])
  useEffect(() => {
    const insertSuggestion = (event: Event) => {
      const text = (event as CustomEvent<string>).detail
      if (typeof text !== 'string' || busyRef.current || controller.getSnapshot().sessionLoading) return
      setDrafts(previous => ({ ...previous, [draftKey]: text }))
      textareaRef.current?.focus()
    }
    window.addEventListener('mira:compose-draft', insertSuggestion)
    return () => window.removeEventListener('mira:compose-draft', insertSuggestion)
  }, [draftKey])
  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && event.key.toLowerCase() === 'm' && textareaRef.current && !textareaRef.current.closest('[inert]')) {
        event.preventDefault()
        if (!configBlocked) {
          if (event.shiftKey) selectPermission(PERMISSIONS[(PERMISSIONS.findIndex(item => item.value === permission) + 1) % PERMISSIONS.length].value)
          else setModelOpen(open => !open)
        }
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [configBlocked, controller, sessionId, permission])

  function setDraft(value: string, key = draftKey) {
    setDrafts(previous => ({ ...previous, [key]: value }))
    setDismissedSlash('')
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
    editedConfig.current.add('planning')
    setPlanning(value)
  }
  function restoreInputFocus(event: Event) { event.preventDefault(); textareaRef.current?.focus() }
  async function loadSkills() {
    setSkills(previous => ({ ...previous, status: 'loading' }))
    try {
      const items = await controller.listSkills()
      setSkills({ status: 'ready', items: (items as Array<{ id: string; name: string; enabled?: boolean }>).filter(item => item.enabled !== false).map(({ id, name }) => ({ id, name })) })
    } catch { setSkills({ status: 'error', items: [] }) }
  }
  async function loadMcp() {
    setMcpServers(previous => ({ ...previous, status: 'loading' }))
    try { setMcpServers({ status: 'ready', items: (await controller.listMcp()).filter(server => server.enabled).map(({ id, name }) => ({ id, name })) }) }
    catch { setMcpServers({ status: 'error', items: [] }) }
  }
  function openToolPanel(next: Exclude<ToolPanel, null>, open: boolean) {
    setToolPanel(open ? next : null)
    if (open && next === 'skills' && skills.status === 'idle') void loadSkills()
    if (open && next === 'mcp' && mcpServers.status === 'idle') void loadMcp()
  }
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
  async function ensureSession(draftText = draft) {
    const initial = controller.getSnapshot()
    if (initial.sessionLoading || initial.session?.id !== sessionId) return undefined
    if (sessionId) return sessionId
    const selection = state.selection
    if (!await controller.create(draftProjectId)) return undefined
    const created = controller.getSnapshot()
    const createdId = created.session?.id
    if (!createdId || created.sessionLoading) return undefined
    if (selection) controller.select(selection)
    setDraft(draftText, createdId)
    setFileDrafts(previous => ({ ...previous, [createdId]: references }))
    setDraft('', 'draft')
    setFileDrafts(previous => ({ ...previous, draft: [] }))
    const configurationWrites = [
      ...(draftPermission !== 'default' ? [() => controller.setSessionPermission(createdId, draftPermission)] : []),
      ...(draftSkillIds.length ? [() => controller.setSessionSkills(createdId, draftSkillIds)] : []),
      ...(draftMcpIds.length ? [() => controller.setSessionMcpServers(createdId, draftMcpIds)] : []),
      ...(!draftDelegation ? [() => controller.setSessionDelegation(createdId, false)] : []),
    ]
    for (const write of configurationWrites) {
      await write()
      const current = controller.getSnapshot()
      if (current.error || current.sessionLoading || current.session?.id !== createdId) return undefined
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
      setFileDrafts(previous => ({ ...previous, [id]: references }))
    } catch (error) { setComposerError(`添加文件失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function runSlash(commandId: string) {
    if (configBlocked) return
    setDraft('')
    if (commandId === 'files') await selectFiles('')
    if (commandId === 'skills' || commandId === 'mcp') { setContextOpen(true); openToolPanel(commandId, true) }
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
  function onSlashKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setSlashIndex(index => Math.min(index + 1, slashCommands.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setSlashIndex(index => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter' && slashCommands[slashIndex]) { event.preventDefault(); void runSlash(slashCommands[slashIndex].id) }
    else if (event.key === 'Escape') { event.preventDefault(); setDismissedSlash(draft) }
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || sendingBlocked || busyRef.current) return
    busyRef.current = true; setBusy(true); setComposerError(''); setDismissedHostError(undefined)
    let preparing = true
    try {
      const id = await ensureSession()
      if (!id) return
      // 创建或配置期间用户可切换任务，首条消息只能发送到发起它的那份草稿。
      if (controller.getSnapshot().sessionLoading || controller.getSnapshot().session?.id !== id) return
      setDraft('', id)
      setFileDrafts(previous => ({ ...previous, [id]: [] }))
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
  const portalContainer = document.getElementById('root')
  const usage: HarnessContextUsage | undefined = state.session?.context?.usage
  const usagePercent = usage?.contextWindow ? Math.round(usage.usedTokens / usage.contextWindow * 100) : 0
  const PermissionIcon = permission === 'default' ? Hand : permission === 'auto-approve' ? ShieldCheck : ShieldAlert

  return <div className={cn('harness-composer-region', !sessionId && 'harness-composer-region--draft')}>
    {visibleError && <div className="harness-composer__error" role="alert"><CircleAlert size={15} /><span>{visibleError}</span><button type="button" aria-label="关闭错误提示" onClick={() => { setComposerError(''); setDismissedHostError(state.error) }}><X size={14} /></button></div>}
    {slashActive && slashCommands.length > 0 && <div className="harness-composer__slash-menu" role="listbox" id="harness-slash-menu" aria-label="斜杠命令">
      {slashCommands.map((command, index) => <button key={command.id} id={`harness-slash-${command.id}`} type="button" role="option" aria-selected={index === slashIndex} className={cn('harness-composer__slash-option', index === slashIndex && 'is-selected')} onMouseEnter={() => setSlashIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => void runSlash(command.id)}><strong>{command.label}</strong><small>{command.hint}</small></button>)}
    </div>}
    <div className="harness-composer__surface">
      {!sessionId && <div className="harness-composer__project-strip">
        <DropdownMenu.Root onOpenChange={open => { if (!open) setProjectQuery('') }}>
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
      </div>}
      <form className="harness-composer" onSubmit={event => void submit(event)}>
        {references.length > 0 && <div className="harness-composer__attachments">{references.map(reference => <span key={reference.path} className="harness-composer__attachment" title={reference.path}><Paperclip size={14} /><span>{reference.name}</span><button type="button" aria-label={`移除 ${reference.name}`} title={`移除 ${reference.name}`} onClick={() => setFileDrafts(previous => ({ ...previous, [draftKey]: references.filter(item => item.path !== reference.path) }))}><X size={12} /></button></span>)}</div>}
        <textarea ref={textareaRef} rows={1} value={draft} readOnly={inputBlocked} aria-busy={inputBlocked || undefined} onChange={event => { if (!busyRef.current && !controller.getSnapshot().sessionLoading) setDraft(event.target.value) }} onKeyDown={event => { if (event.nativeEvent.isComposing || event.keyCode === 229 || inputBlocked) return; if (slashActive && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) { onSlashKeyDown(event); return } if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); void submit() } }} placeholder="向 Mira 提问，使用 + 添加上下文，使用 / 选择命令或能力" aria-label="任务内容" aria-controls={slashActive ? 'harness-slash-menu' : undefined} />
        <div className="harness-composer__footer">
          <div className="harness-composer__controls">
            <DropdownMenu.Root open={contextOpen} onOpenChange={open => { setContextOpen(open); if (!open) setToolPanel(null) }}>
              <DropdownMenu.Trigger type="button" className="harness-composer__icon-button" aria-label="添加上下文" title="添加上下文" disabled={configBlocked}><Plus size={16} /></DropdownMenu.Trigger>
              <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="start" side="top" sideOffset={4} className="harness-composer__menu harness-composer__context-menu" onCloseAutoFocus={restoreInputFocus}>
                <DropdownMenu.Label className="harness-composer__menu-label">添加</DropdownMenu.Label>
                <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => void selectFiles()}><Paperclip size={16} /><span>引用项目文件</span></DropdownMenu.Item>
                <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => { setDraft('/'); textareaRef.current?.focus() }}><span className="harness-composer__plus-label">/</span><span>命令与能力</span></DropdownMenu.Item>
                <DropdownMenu.Separator className="harness-composer__menu-separator" />
                <DropdownMenu.Label className="harness-composer__menu-label">任务工具</DropdownMenu.Label>
                <DropdownMenu.Sub open={toolPanel === 'skills'} onOpenChange={open => openToolPanel('skills', open)}>
                  <DropdownMenu.SubTrigger className="harness-composer__menu-item"><Wrench size={16} /><span>Skill</span>{activeSkillIds.length > 0 && <small>{activeSkillIds.length}</small>}<ChevronRight className="harness-composer__check" size={14} /></DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal container={portalContainer}><DropdownMenu.SubContent sideOffset={4} className="harness-composer__menu harness-composer__tools-menu">{skills.status === 'loading' && <span className="harness-composer__menu-empty">正在加载 Skill…</span>}{skills.status === 'error' && <DropdownMenu.Item className="harness-composer__menu-item" onSelect={event => { event.preventDefault(); void loadSkills() }}>加载失败，重试</DropdownMenu.Item>}{skills.status === 'ready' && !skills.items.length && <span className="harness-composer__menu-empty">暂无可用 Skill</span>}{skills.items.map(skill => <DropdownMenu.CheckboxItem key={skill.id} className="harness-composer__menu-item" checked={activeSkillIds.includes(skill.id)} disabled={busy} onSelect={event => event.preventDefault()} onCheckedChange={() => toggleTool('skills', skill.id)}><span>{skill.name}</span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.CheckboxItem>)}</DropdownMenu.SubContent></DropdownMenu.Portal>
                </DropdownMenu.Sub>
                <DropdownMenu.Sub open={toolPanel === 'mcp'} onOpenChange={open => openToolPanel('mcp', open)}>
                  <DropdownMenu.SubTrigger className="harness-composer__menu-item"><Blocks size={16} /><span>MCP 服务</span>{activeMcpIds.length > 0 && <small>{activeMcpIds.length}</small>}<ChevronRight className="harness-composer__check" size={14} /></DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal container={portalContainer}><DropdownMenu.SubContent sideOffset={4} className="harness-composer__menu harness-composer__tools-menu">{mcpServers.status === 'loading' && <span className="harness-composer__menu-empty">正在加载 MCP 服务…</span>}{mcpServers.status === 'error' && <DropdownMenu.Item className="harness-composer__menu-item" onSelect={event => { event.preventDefault(); void loadMcp() }}>加载失败，重试</DropdownMenu.Item>}{mcpServers.status === 'ready' && !mcpServers.items.length && <span className="harness-composer__menu-empty">暂无已启用的 MCP 服务</span>}{mcpServers.items.map(server => <DropdownMenu.CheckboxItem key={server.id} className="harness-composer__menu-item" checked={activeMcpIds.includes(server.id)} disabled={busy} onSelect={event => event.preventDefault()} onCheckedChange={() => toggleTool('mcp', server.id)}><span>{server.name}</span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.CheckboxItem>)}</DropdownMenu.SubContent></DropdownMenu.Portal>
                </DropdownMenu.Sub>
                <DropdownMenu.CheckboxItem checked={state.session?.delegationEnabled ?? draftDelegation} className="harness-composer__menu-item" onCheckedChange={enabled => { if (sessionId) void updateConfiguration(() => controller.setSessionDelegation(sessionId, enabled)); else { editedConfig.current.add('delegation'); setDraftDelegation(enabled) } }}><span>子任务委派</span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.CheckboxItem>
                {sessionId && <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => void saveMemory()}><span>保存项目记忆</span></DropdownMenu.Item>}
                <DropdownMenu.Separator className="harness-composer__menu-separator" />
                <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => void controller.navigate('/settings/mcp')}><Settings2 size={16} /><span>管理工具与服务</span></DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
            <DropdownMenu.Root open={modeOpen} onOpenChange={setModeOpen}>
              <DropdownMenu.Trigger type="button" className={cn('harness-composer__menu-trigger', permission === 'full' && 'harness-composer__menu-trigger--full')} aria-label="权限与计划模式" title="权限与计划模式 · Ctrl+Shift+M" disabled={configBlocked}><PermissionIcon size={16} /><span>{PERMISSIONS.find(item => item.value === permission)?.label}</span>{planning && <Lightbulb size={14} />}<ChevronDown size={12} /></DropdownMenu.Trigger>
              <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="start" side="top" sideOffset={4} className="harness-composer__menu harness-composer__mode-menu" onCloseAutoFocus={restoreInputFocus}>
                <DropdownMenu.CheckboxItem className="harness-composer__menu-item harness-composer__mode-option" checked={planning} onCheckedChange={selectPlanning}><Lightbulb size={16} /><span><strong>计划模式</strong><small>先制定计划，确认后再执行</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.CheckboxItem>
                <DropdownMenu.Separator className="harness-composer__menu-separator" />
                <DropdownMenu.RadioGroup value={permission} onValueChange={value => selectPermission(value as PermissionMode)}>{PERMISSIONS.map(item => { const Icon = item.value === 'default' ? Hand : item.value === 'auto-approve' ? ShieldCheck : ShieldAlert; return <DropdownMenu.RadioItem key={item.value} value={item.value} className="harness-composer__menu-item harness-composer__mode-option"><Icon size={16} /><span><strong>{item.label}</strong><small>{item.description}</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem> })}</DropdownMenu.RadioGroup>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
            {usagePercent > 0 && <span className="harness-composer__usage" title={`上下文 ${usagePercent}%（${usage!.usedTokens} / ${usage!.contextWindow} tokens，${usage!.source === 'reported' ? '实测' : '估算'}）`}>{usagePercent}%</span>}
          </div>
          <div className="harness-composer__right-actions">
            <DropdownMenu.Root open={modelOpen} onOpenChange={open => { setModelOpen(open); if (!open) setModelQuery('') }}>
              <DropdownMenu.Trigger type="button" className="harness-composer__menu-trigger harness-composer__model-trigger" aria-label="模型" title={selectedModel ? `${selectedModel.providerName} / ${selectedModel.modelId} · Ctrl+M` : '选择模型'} disabled={configBlocked}><span>{selectedModel?.modelId || '管理模型'}</span><ChevronDown size={12} /></DropdownMenu.Trigger>
              <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="end" side="top" sideOffset={4} className="harness-composer__menu harness-composer__model-menu" onCloseAutoFocus={restoreInputFocus}>
                <div className="harness-composer__search"><Search size={16} /><input value={modelQuery} onChange={event => setModelQuery(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="搜索模型" aria-label="搜索模型" /></div>
                <DropdownMenu.RadioGroup value={selectedModel ? `${selectedModel.providerId}:${selectedModel.modelId}` : ''} onValueChange={value => { if (configBlocked || busyRef.current) return; const model = availableModels.find(item => `${item.providerId}:${item.modelId}` === value); if (model) controller.select({ ...controller.getSnapshot().selection, providerId: model.providerId, modelId: model.modelId } satisfies ModelSelection) }}>
                  {availableModels.filter(model => `${model.providerName} ${model.modelId}`.toLowerCase().includes(modelQuery.toLowerCase())).map(model => <DropdownMenu.RadioItem key={`${model.providerId}:${model.modelId}`} value={`${model.providerId}:${model.modelId}`} className="harness-composer__menu-item"><span><strong>{model.modelId}</strong><small>{model.providerName}</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
                </DropdownMenu.RadioGroup>
                {!availableModels.length && <span className="harness-composer__menu-empty">请先在设置中配置模型</span>}
                <DropdownMenu.Separator className="harness-composer__menu-separator" />
                <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => void controller.navigate('/settings/model-config')}><Settings2 size={16} /><span>管理模型</span></DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
            {/* Model/reasoning toolbar interaction follows ZCode; attribution is recorded in third-party-licenses/zcode. */}
            {selectedModel?.reasoning && <DropdownMenu.Root open={reasoningOpen} onOpenChange={open => setReasoningOpen(open && !configBlocked)}>
              <DropdownMenu.Trigger type="button" className="harness-composer__menu-trigger harness-composer__reasoning-trigger" aria-label={`推理强度：${reasoningLabel}`} title={`推理强度：${reasoningLabel}`} disabled={configBlocked}><Brain size={16} /><span>{reasoningLabel}</span><ChevronDown size={12} /></DropdownMenu.Trigger>
              <DropdownMenu.Portal container={portalContainer}><DropdownMenu.Content align="end" side="top" sideOffset={4} className="harness-composer__menu harness-composer__reasoning-menu" onCloseAutoFocus={restoreInputFocus}>
                <DropdownMenu.Label className="harness-composer__menu-label">推理强度</DropdownMenu.Label>
                <DropdownMenu.RadioGroup value={reasoningLevel} onValueChange={value => { if (configBlocked || busyRef.current) return; const selection = applyComposerReasoning(controller.getSnapshot().selection, selectedModel, value); if (selection) controller.select(selection) }}>
                  {COMPOSER_REASONING_CHOICES.map(choice => <DropdownMenu.RadioItem key={choice.value} value={choice.value} className="harness-composer__menu-item"><span>{choice.label}</span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>}
            {state.running ? <button type="button" className="harness-composer__send" title="停止任务" aria-label="停止任务" onClick={() => void controller.stop()}><Square size={14} fill="currentColor" /></button> : <button type="submit" className="harness-composer__send" title={busy ? '正在准备任务' : '发送任务 · Enter'} aria-label="发送任务" disabled={sendingBlocked || !draft.trim()}><ArrowUp size={16} /></button>}
          </div>
        </div>
      </form>
    </div>
  </div>
})

function choices(state: ReturnType<PilotController['getSnapshot']>) {
  return state.providers.flatMap(provider => isModelProviderAvailable(provider) ? provider.models.filter(model => model.enabled).map(model => ({ providerId: provider.id, providerName: provider.name, modelId: model.id, reasoning: model.reasoning })) : [])
}
