/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation: task cards and full-page settings backed by Mira's existing automation scheduler.
 * Structural reference: ZCode AutomationsSection / AutomationEditView; license: third-party-licenses/zcode/.
 */
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Activity, ChevronRight, Clock3, FileText, Info, List, LoaderCircle, MoreHorizontal, Pause, Pencil, Play, RefreshCw, Square, Target, Trash2, X } from 'lucide-react'
import { DEFAULT_PERMISSION_CONFIG, type AutomationRun, type AutomationRunStatus, type AutomationTask, type HarnessProject, type HarnessSessionSummary, type ModelProviderSummary, type PermissionConfig } from '../../../../../src/config/harness'
import { formatAutomationTime, taskState } from '../../../../../src/config/automationPresentation'
import type { AutomationTemplate } from './automation-templates'
import { automationCardSchedule, automationCardNextRun } from './automation-card'
import { AUTOMATION_TEMPLATES } from './automation-templates'
import { AutomationCreateButton, AutomationHint } from './AutomationControls'
import { AUTOMATION_DRAFT_KEY, applyAutomationTrigger, automationFormForTask, automationInputForForm, newAutomationForm, readAutomationDraft, type AutomationDraft, type AutomationForm } from './automation-form'
import type { AutomationsHost } from './automation-host'
import { AutomationEditor } from './AutomationEditor'
import { AutomationRunHistory } from './AutomationRunHistory'
import { MiraAutomationTitleSwitch, MiraWorkflowsView } from '../workflows/MiraWorkflowsView'
import type { MiraWorkflowHost } from '../workflows/workflow-model'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import type { MiraAppNavigationTarget } from '../../../../../src/platform/appNavigation'
import './automations.css'

export type { AutomationsHost } from './automation-host'
const TASK_FILTERS = [['all', '全部'], ['active', '进行中'], ['ended', '已完成'], ['failed', '失败']] as const
type Confirmation = { type: 'delete'; task: AutomationTask }
export type AutomationNavigationTarget = Extract<MiraAppNavigationTarget, { kind: 'automations' }>
export interface AutomationsNavigationHandle { navigate: (target: AutomationNavigationTarget, isCurrent?: () => boolean, restoreNewDraft?: boolean) => Promise<boolean> }
export function AutomationsView({ host, projects, sessions, providers, onOpenSession, onOpenWorkflowRun, onManageModels, active = true, navigationBusy = false, ref, onNavigationChange, onDraftNavigation, onDeleteTask, onCreateViaChat, onCreateWorkflowViaChat, currentProjectId }: {
  host: AutomationsHost & MiraWorkflowHost; projects: HarnessProject[]; sessions: HarnessSessionSummary[]; providers: ModelProviderSummary[]
  onOpenSession: (sessionId: string) => Promise<void> | void; onManageModels: () => void; active?: boolean; navigationBusy?: boolean
  onOpenWorkflowRun: (identity: MiraFlowRunIdentity, actor?: undefined, selection?: undefined, artifact?: import('../../../../../packages/mira-flow-kit/src/engine/mira-types').ArtifactVersionRecord) => Promise<void>
  currentProjectId?: string; onCreateWorkflowViaChat?: (prompt: string, projectId?: string) => Promise<void> | void; onCreateViaChat?: () => Promise<void> | void; ref?: Ref<AutomationsNavigationHandle>; onNavigationChange?: (target: AutomationNavigationTarget) => void; onDraftNavigation?: () => void; onDeleteTask?: (id: string) => void
}) {
  const [tasks, setTasks] = useState<AutomationTask[]>([])
  const [runs, setRuns] = useState<Record<string, AutomationRun[]>>({})
  const [permission, setPermission] = useState<PermissionConfig>(DEFAULT_PERMISSION_CONFIG)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [runNotice, setRunNotice] = useState<{ text: string; sessionId?: string }>()
  useEffect(() => { if (!runNotice) return; const timer = window.setTimeout(() => setRunNotice(undefined), 4000); return () => window.clearTimeout(timer) }, [runNotice])
  const [query, setQuery] = useState('')
  const [editorReady, setEditorReady] = useState(false)
  const [keepAwake, setKeepAwake] = useState(false), [keepAwakeBusy, setKeepAwakeBusy] = useState(false)
  useEffect(() => { if (!active) return; let current = true; void host.getPreference('keepComputerAwake').then(value => { if (current) setKeepAwake(value === true) }).catch(cause => { if (current) setError(message(cause)) }); return () => { current = false } }, [host, active])
  async function changeKeepAwake(value: boolean) { setKeepAwakeBusy(true); try { await host.setPreference('keepComputerAwake', value, true); setKeepAwake(value) } catch (cause) { setError(message(cause)) } finally { setKeepAwakeBusy(false) } }
  const [filter, setFilter] = useState<NonNullable<AutomationNavigationTarget['filter']>>('all')
  const [section, setSection] = useState<'tasks' | 'runs'>('tasks')
  const [pageTab, setPageTab] = useState<'automations' | 'workflows'>('automations')
  const [workflowsMounted, setWorkflowsMounted] = useState(false)
  const switchPage = (next: 'automations' | 'workflows') => { setPageTab(next); if (next === 'workflows') setWorkflowsMounted(true) }
  const [runTaskId, setRunTaskId] = useState('')
  const [runStatus, setRunStatus] = useState<AutomationRunStatus | 'all'>('all')
  const [editor, setEditor] = useState<AutomationDraft>()
  const [editorTab, setEditorTab] = useState<'settings' | 'history'>('settings')
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyIds, setBusyIds] = useState<string[]>([])
  const [runToDelete, setRunToDelete] = useState<AutomationRun>()
  const [confirmation, setConfirmation] = useState<Confirmation>()
  const [menuTaskId, setMenuTaskId] = useState<string>()
  const mounted = useRef(false), cycle = useRef(0), operations = useRef(new Set<string>())
  const loadRequest = useRef<Promise<AutomationTask[] | undefined> | undefined>(undefined)
  const saveBusy = useRef(false), saveRequest = useRef<Promise<string | undefined> | undefined>(undefined)
  const latestDraft = useRef(editor), draftReady = useRef(false), draftRequest = useRef<Promise<void> | undefined>(undefined), draftRevision = useRef(0)
  const drafts = useRef(new Map<string, AutomationDraft>()), draftWrites = useRef(Promise.resolve()), navigationRevision = useRef(0)
  const navigationBusyRef = useRef(navigationBusy)
  navigationBusyRef.current = navigationBusy
  latestDraft.current = editor

  function navigationTarget(patch: Partial<AutomationNavigationTarget> = {}, draft = latestDraft.current): AutomationNavigationTarget {
    return { kind: 'automations', ...(draft?.taskId ? { taskId: draft.taskId, tab: editorTab } : {}), section, filter, ...(runTaskId ? { runTaskId } : {}), runStatus, ...patch }
  }
  function notifyNavigation(patch: Partial<AutomationNavigationTarget> = {}, draft = latestDraft.current) {
    if (!draft || draft.taskId) onNavigationChange?.(navigationTarget(patch, draft))
  }
  function invalidateLoad() { cycle.current++; loadRequest.current = undefined }
  function load(): Promise<AutomationTask[] | undefined> {
    if (loadRequest.current) return loadRequest.current
    const revision = ++cycle.current
    setRefreshing(true)
    const request = (async () => { try {
      const [nextTasks, nextPermission] = await Promise.all([host.listAutomationTasks(), host.getHarnessPermissionConfig()])
      const nextRuns = Object.fromEntries(await Promise.all(nextTasks.map(async task => [task.id, await host.listAutomationRuns(task.id)] as const)))
      if (!mounted.current || revision !== cycle.current) return undefined
      setTasks(nextTasks); setRuns(nextRuns); setPermission(nextPermission); setLoadError(''); setLoading(false)
      return nextTasks
    } catch (cause) { if (mounted.current && revision === cycle.current) { setLoadError(message(cause)); setLoading(false) } }
    finally { if (mounted.current && revision === cycle.current) setRefreshing(false) } })()
    loadRequest.current = request
    void request.then(() => { if (loadRequest.current === request) loadRequest.current = undefined })
    return request
  }
  function restoreDraft() {
    const revision = ++draftRevision.current
    draftReady.current = false; setDraftLoaded(false)
    draftRequest.current = host.getPreference(AUTOMATION_DRAFT_KEY).then(value => {
      if (!mounted.current || revision !== draftRevision.current) return
      const restored = readAutomationDraft(value)
      drafts.current.clear()
      const saved = value && typeof value === 'object' ? (value as { drafts?: unknown }).drafts : undefined
      for (const entry of Array.isArray(saved) ? saved : []) {
        const draft = readAutomationDraft(entry)
        if (draft) drafts.current.set(draft.taskId ?? '', draft)
      }
      if (restored) drafts.current.set(restored.taskId ?? '', restored)
      draftReady.current = true; setDraftLoaded(true)
      if (restored) { latestDraft.current = restored; setEditor(restored) }
    }).catch(cause => { if (mounted.current && revision === draftRevision.current) setError(`自动化草稿读取失败：${message(cause)}`) })
  }
  async function persistDraft() {
    await draftRequest.current
    if (!draftReady.current) throw new Error('自动化草稿尚未读取，无法确认保存')
    if (latestDraft.current) drafts.current.set(latestDraft.current.taskId ?? '', latestDraft.current)
    await writeDrafts(latestDraft.current, drafts.current)
  }
  function writeDrafts(draft: AutomationDraft | undefined, entries: Map<string, AutomationDraft>) {
    const value = entries.size ? { ...draft, drafts: [...entries.values()] } : null
    const request = draftWrites.current.catch(() => undefined).then(() => host.setPreference(AUTOMATION_DRAFT_KEY, value, true))
    draftWrites.current = request
    return request
  }
  async function flushDraft() { const failure = await saveRequest.current; if (failure) throw new Error(failure); await persistDraft() }
  async function navigate(target: AutomationNavigationTarget, isCurrent = () => true, restoreNewDraft = false) {
    const revision = ++navigationRevision.current
    const current = () => mounted.current && revision === navigationRevision.current && isCurrent()
    try {
      await flushDraft()
      if (!current()) return false
      const inventory = await load()
      if (!current()) return false
      if (!inventory) throw new Error('自动化列表读取失败，请重试')
      const task = target.taskId ? inventory.find(task => task.id === target.taskId) : undefined
      if (target.taskId && !task) throw new Error('自动化任务不存在或已删除')
      if (target.runTaskId && !inventory.some(task => task.id === target.runTaskId)) throw new Error('运行记录对应的自动化任务不存在或已删除')
      const saved = task ? drafts.current.get(task.id) : restoreNewDraft ? drafts.current.get('') : undefined
      const form = task && !saved ? automationFormForTask(task, projects, providers) : undefined
      const next = saved ?? (form && task ? { taskId: task.id, form, baseline: JSON.stringify(form) } : undefined)
      if (!current()) return false
      setPageTab('automations'); latestDraft.current = next; setEditor(next); setEditorTab(target.tab ?? 'settings'); setSection(target.section ?? 'tasks'); setFilter(target.filter ?? 'all'); setRunTaskId(target.runTaskId ?? task?.id ?? ''); setRunStatus(target.runStatus ?? 'all'); setQuery(''); setConfirmation(undefined); setMenuTaskId(undefined); setFormError(''); setError('')
      return true
    } catch (cause) {
      if (current()) { if (latestDraft.current && editorTab === 'settings') setFormError(`无法切换自动化：${message(cause)}`); else setError(`无法切换自动化：${message(cause)}`) }
      return false
    }
  }
  useLayoutEffect(() => {
    mounted.current = true
    restoreDraft()
    return () => { mounted.current = false; draftRevision.current++; invalidateLoad(); void persistDraft().catch(() => undefined) }
  }, [host])
  useImperativeHandle(ref, () => ({ navigate }))
  useEffect(() => {
    if (!active || pageTab !== 'automations') { setConfirmation(undefined); setRunToDelete(undefined); setMenuTaskId(undefined); return }
    void load()
    const timer = window.setInterval(() => { if (!saveBusy.current && !operations.current.size) void load() }, 2500)
    return () => { window.clearInterval(timer); invalidateLoad() }
  }, [host, active, pageTab])
  useEffect(() => {
    if (!draftLoaded || saving) return
    const timer = window.setTimeout(() => { if (!saveBusy.current) void persistDraft().catch(cause => { if (mounted.current) setError(`草稿保存失败：${message(cause)}`) }) }, 250)
    return () => window.clearTimeout(timer)
  }, [host, editor, draftLoaded, saving])
  useEffect(() => host.registerBeforeNavigation(flushDraft), [host])
  useEffect(() => {
    const flush = () => { void flushDraft().catch(() => undefined) }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [host])
  useEffect(() => { if (navigationBusy) { setConfirmation(undefined); setRunToDelete(undefined); setMenuTaskId(undefined) } }, [navigationBusy])

  async function beginEditor(task?: AutomationTask, template?: AutomationTemplate) {
    if (!active || navigationBusyRef.current || loading || !draftReady.current || saveBusy.current) return
    if (task) { if (await navigate({ ...navigationTarget(), taskId: task.id, tab: 'settings' })) notifyNavigation({ taskId: task.id, tab: 'settings' }); return }
    const revision = ++navigationRevision.current
    try { await flushDraft() }
    catch (cause) { setError(`无法切换自动化：${message(cause)}`); return }
    if (!mounted.current || navigationBusyRef.current || revision !== navigationRevision.current) return
    const restored = !template && drafts.current.get('')
    if (restored) { latestDraft.current = restored; setEditor(restored); setEditorTab('settings'); setFormError(''); onDraftNavigation?.(); return }
    let form = newAutomationForm(projects, providers)
    if (template) form = applyAutomationTrigger({ ...form, name: template.name, prompt: template.prompt, templateId: template.id }, template.trigger.type === 'once' ? { ...template.trigger, scheduledAt: Math.max(template.trigger.scheduledAt, Date.now() + 24 * 60 * 60 * 1000) } : template.trigger)
    const next = { form, baseline: JSON.stringify(form) }
    latestDraft.current = next; setEditor(next); setEditorTab('settings'); setFormError(''); onDraftNavigation?.()
  }
  function changeForm(form: AutomationForm) {
    if (!active || navigationBusyRef.current || saveBusy.current || !latestDraft.current) return
    navigationRevision.current++
    const next = { ...latestDraft.current, form }
    latestDraft.current = next; setEditor(next); setFormError('')
  }
  async function clearDraft() {
    if (saveBusy.current || navigationBusyRef.current) return
    try {
      const next = new Map(drafts.current)
      next.delete(latestDraft.current?.taskId ?? '')
      await writeDrafts(undefined, next)
      drafts.current = next; latestDraft.current = undefined; setEditor(undefined); setConfirmation(undefined); setFormError(''); notifyNavigation({}, undefined)
    } catch (cause) { setFormError(`草稿清理失败：${message(cause)}`); setConfirmation(undefined) }
  }
  function back() {
    if (saveBusy.current || navigationBusyRef.current || !latestDraft.current) return
    void clearDraft()
  }
  async function save(andRun = false): Promise<string | undefined> {
    if (!active || saveBusy.current || !latestDraft.current) return
    const draft = latestDraft.current
    if (draft.taskId && tasks.find(task => task.id === draft.taskId)?.endedAt) { setFormError('任务已结束，不能修改'); return '任务已结束，不能修改' }
    saveBusy.current = true; setSaving(true); setFormError(''); invalidateLoad(); setRefreshing(false)
    try {
      const input = automationInputForForm(draft, { projects, sessions, providers, permission })
      if (input.trigger.type === 'cron') await host.getAutomationNextRuns(input.trigger.expression, input.trigger.scheduleRule)
      const saved = await host.saveAutomationTask(input)
      const savedDraft = { ...draft, taskId: saved.id, baseline: JSON.stringify(draft.form) }
      latestDraft.current = savedDraft
      if (mounted.current) { setTasks(previous => [saved, ...previous.filter(task => task.id !== saved.id)]); setEditor(savedDraft) }
      const nextDrafts = new Map(drafts.current)
      nextDrafts.delete(draft.taskId ?? ''); nextDrafts.delete(saved.id)
      try { await writeDrafts(undefined, nextDrafts) }
      catch (cause) { throw new Error(`任务已保存，但草稿清理失败：${message(cause)}。再次保存只会更新该任务。`) }
      drafts.current = nextDrafts
      if (!draft.taskId && !andRun) {
        latestDraft.current = undefined
        if (mounted.current) { setEditor(undefined); setSection('tasks'); setFilter('all'); setQuery(''); setRunTaskId(''); setRunStatus('all'); notifyNavigation({ taskId: undefined, tab: undefined, section: 'tasks', filter: 'all', runTaskId: undefined, runStatus: 'all' }) }
      } else if (mounted.current) { setEditor(savedDraft); notifyNavigation({ taskId: saved.id, tab: 'settings' }, savedDraft) }
      if (andRun) { const run = await host.runAutomationNow(saved.id); if (mounted.current) { commitRun(run); showRunNotice(saved, run) } }
      if (mounted.current) void load()
    } catch (cause) { const failure = message(cause); if (mounted.current) setFormError(failure); return failure }
    finally { saveBusy.current = false; if (mounted.current) setSaving(false) }
  }
  function requestSave(andRun = false) {
    if (saveBusy.current) return
    const request = save(andRun); saveRequest.current = request
    void request.then(() => { if (saveRequest.current === request) saveRequest.current = undefined })
  }
  async function perform<T>(taskId: string, request: () => Promise<T>, commit: (value: T) => void) {
    if (!active || operations.current.has(taskId) || saveBusy.current) return
    operations.current.add(taskId); setBusyIds([...operations.current]); setError(''); invalidateLoad(); setRefreshing(false)
    try {
      const result = await request()
      invalidateLoad()
      if (!mounted.current) return
      commit(result)
    } catch (cause) { if (mounted.current) setError(message(cause)) }
    finally { operations.current.delete(taskId); if (mounted.current) { setBusyIds([...operations.current]); void load() } }
  }
  function commitRun(run: AutomationRun) { setRuns(previous => ({ ...previous, [run.taskId]: [run, ...(previous[run.taskId] || []).filter(existing => existing.id !== run.id)] })) }
  function showRunNotice(task: AutomationTask, run: AutomationRun) {
    if (run.status === 'failed' || run.status === 'skipped' || run.status === 'interrupted') { setRunNotice(undefined); setError(run.error || '本次任务未启动'); return }
    setRunNotice({ text: run.status === 'completed' ? `“${task.name}”已运行完成` : `正在运行“${task.name}”…`, sessionId: run.sessionAvailable === false ? undefined : run.sessionId })
  }
  function runNow(task: AutomationTask) {
    if (task.endedAt || (runs[task.id] || []).some(run => run.status === 'running')) return
    void perform(task.id, () => host.runAutomationNow(task.id), run => { commitRun(run); showRunNotice(task, run) })
  }
  function toggle(task: AutomationTask, enabled: boolean) { if (!task.endedAt) void perform(task.id, () => host.setAutomationTaskEnabled(task.id, enabled), saved => { setTasks(previous => previous.map(item => item.id === saved.id ? saved : item)); const draft = latestDraft.current; if (draft?.taskId === saved.id) { const baseline = JSON.parse(draft.baseline); const next = { ...draft, form: { ...draft.form, enabled: saved.enabled }, baseline: JSON.stringify({ ...baseline, enabled: saved.enabled }) }; latestDraft.current = next; setEditor(next) } }) }
  function retry(run: AutomationRun) { void perform(run.taskId, () => host.retryAutomationRun(run.id), result => { commitRun(result); if (result.status !== 'running' && result.status !== 'completed') setError(result.error || '本次任务未启动') }) }
  function stop(taskId: string) { void perform(taskId, () => host.abortAutomationRun(taskId), () => undefined) }
  function remove(task: AutomationTask) {
    if (navigationBusyRef.current) return
    void perform(task.id, () => host.deleteAutomationTask(task.id), () => { drafts.current.delete(task.id); if (latestDraft.current?.taskId === task.id) { latestDraft.current = undefined; setEditor(undefined); notifyNavigation({}, undefined) } setTasks(previous => previous.filter(item => item.id !== task.id)); setRuns(previous => { const next = { ...previous }; delete next[task.id]; return next }); setConfirmation(undefined); onDeleteTask?.(task.id); void persistDraft().catch(cause => setError(`草稿保存失败：${message(cause)}`)) })
  }
  async function openSession(sessionId: string) {
    if (navigationBusyRef.current) return
    try { await flushDraft(); await onOpenSession(sessionId) }
    catch (cause) { setError(`无法打开聊天：${message(cause)}`) }
  }
  const projectNames = new Map(projects.map(project => [project.id, project.name]))
  const keyword = query.trim().toLocaleLowerCase()
  const filtered = tasks.filter(task => {
    const status = taskState(task, runs[task.id]?.[0]).key
    return (filter === 'all' || (filter === 'active' ? ['stable', 'running', 'scheduled', 'paused'].includes(status) : filter === status)) && (!keyword || `${task.name} ${task.prompt} ${projectNames.get(task.projectId) || ''}`.toLocaleLowerCase().includes(keyword))
  })
  const editingTask = editor?.taskId ? tasks.find(task => task.id === editor.taskId) : undefined
  const portal = document.getElementById('root')
  function chooseTab(tab: 'settings' | 'history') { if (!navigationBusyRef.current && tab !== editorTab) { navigationRevision.current++; setEditorTab(tab); notifyNavigation({ tab }) } }
  function chooseFilter(next: typeof filter) { if (!navigationBusyRef.current && next !== filter) { navigationRevision.current++; setFilter(next); notifyNavigation({ filter: next }) } }
  function chooseRunTask(id: string) { if (!navigationBusyRef.current && id !== runTaskId) { navigationRevision.current++; setRunTaskId(id); notifyNavigation({ runTaskId: id || undefined }) } }
  function chooseRunStatus(status: typeof runStatus) { if (!navigationBusyRef.current && status !== runStatus) { navigationRevision.current++; setRunStatus(status); notifyNavigation({ runStatus: status }) } }
  function showRuns(id: string) { if (!navigationBusyRef.current) void navigate({ kind: 'automations', taskId: id, tab: 'history', runTaskId: id }).then(ok => { if (ok) notifyNavigation({ taskId: id, tab: 'history', runTaskId: id }) }) }
  const history = () => <AutomationRunHistory tasks={tasks} runs={runs} taskId={runTaskId} status={runStatus} busyIds={busyIds} navigationBusy={navigationBusy} onTask={chooseRunTask} onStatus={chooseRunStatus} onRetry={retry} onStop={stop} onOpenSession={id => { void openSession(id) }} />
  function taskMenu(task: AutomationTask, inEditor = false) {
    const running = (runs[task.id] || []).some(run => run.status === 'running'), busy = busyIds.includes(task.id)
    return <DropdownMenu.Root open={active && !navigationBusy && menuTaskId === task.id} onOpenChange={open => setMenuTaskId(open && active && !navigationBusyRef.current ? task.id : undefined)}><AutomationHint label="更多操作" hoverOnly><DropdownMenu.Trigger className="mira-automation-icon" type="button" aria-label={`${task.name} 操作`} disabled={busy || navigationBusy || saving}><MoreHorizontal size={16} /></DropdownMenu.Trigger></AutomationHint><DropdownMenu.Portal container={portal}><DropdownMenu.Content className="mira-automation-menu" align="end" sideOffset={4}>
      {!inEditor && <DropdownMenu.Item disabled={Boolean(task.endedAt) || running} onSelect={() => runNow(task)}><Play size={14} />立即运行</DropdownMenu.Item>}
      {running && <DropdownMenu.Item onSelect={() => stop(task.id)}><Square size={14} />停止运行</DropdownMenu.Item>}
      {!task.endedAt && <DropdownMenu.Item onSelect={() => toggle(task, !task.enabled)}>{task.enabled ? <Pause size={14} /> : <Play size={14} />}{task.enabled ? '暂停' : '继续'}</DropdownMenu.Item>}
      {!inEditor && <><DropdownMenu.Item onSelect={() => beginEditor(task)}><Pencil size={14} />编辑</DropdownMenu.Item><DropdownMenu.Item onSelect={() => showRuns(task.id)}><FileText size={14} />运行历史</DropdownMenu.Item></>}
      <DropdownMenu.Separator /><DropdownMenu.Item disabled={running} className="mira-automation-menu-danger" onSelect={() => setConfirmation({ type: 'delete', task })}><Trash2 size={14} />删除</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
  }
  const create = () => <AutomationCreateButton disabled={loading || !draftLoaded || navigationBusy} onManually={() => { void beginEditor() }} onViaChat={() => { void (async () => { try { await flushDraft(); await onCreateViaChat?.() } catch (cause) { setError(message(cause)) } })() }} />
  return <section className="mira-automations" aria-label="自动化工作台">
    {active && pageTab === 'automations' && runNotice && <div className="mira-automation-run-notice" role="status"><Info size={16} /><span>{runNotice.text}</span>{runNotice.sessionId && <button type="button" className="mira-automation-run-notice-view" aria-label="查看本次自动化运行" disabled={navigationBusy} onClick={() => { void openSession(runNotice.sessionId!) }}>查看</button>}<button type="button" className="mira-automation-icon" aria-label="关闭自动化运行提示" onClick={() => setRunNotice(undefined)}><X size={14} /></button></div>}
    {editor && pageTab === 'automations' && <header className="mira-automation-header"><button type="button" className="mira-automation-back" aria-label="返回自动化列表" disabled={saving || navigationBusy} onClick={back}>自动化</button><ChevronRight size={14} className="mira-automation-header-divider" /><span className="mira-automation-breadcrumb">{editor.form.name || '新建定时任务'}</span></header>}
    {workflowsMounted && <div className="mira-automation-scroll mira-automation-scroll--workflows" hidden={pageTab !== 'workflows'} style={pageTab !== 'workflows' ? { display: 'none' } : undefined}><MiraWorkflowsView currentProjectId={currentProjectId} header={<div className="mira-automation-page-title"><MiraAutomationTitleSwitch value={pageTab} onChange={switchPage} /></div>} onCreateViaChat={onCreateWorkflowViaChat} host={host} projects={projects} providers={providers} active={active && pageTab === 'workflows'} onOpenRun={onOpenWorkflowRun} onManageModels={onManageModels} /></div>}
    <div className={editor ? 'mira-automation-scroll mira-automation-scroll--editor' : 'mira-automation-scroll'} hidden={pageTab !== 'automations'} style={pageTab !== 'automations' ? { display: 'none' } : undefined}><div className={editor ? 'mira-automation-content mira-automation-content--editor' : 'mira-automation-content'}>
      {loadError && <div className="mira-automation-error" role="alert"><span>{loadError}</span><button type="button" onClick={() => { void load() }}>重试</button></div>}
      {error && <div className="mira-automation-error" role="alert"><span>{error}</span>{!draftReady.current ? <button type="button" onClick={() => { setError(''); restoreDraft() }}>重试读取草稿</button> : <button type="button" aria-label="关闭自动化错误提示" onClick={() => setError('')}><X size={14} /></button>}</div>}
      {editor ? <><div className="mira-automation-editor-heading"><h2>{editor.taskId ? '编辑定时任务' : '新建定时任务'}</h2><p>{editor.taskId ? '调整此任务的执行时间、指令和运行方式。' : '配置任务的执行时间、指令和运行方式。'}</p></div>
        <div className="mira-automation-editor-top"><div className="mira-automation-tabs" role="tablist" aria-label="自动化详情"><button role="tab" type="button" aria-selected={editorTab === 'settings'} disabled={navigationBusy} onClick={() => chooseTab('settings')}>设置</button><button role="tab" type="button" aria-selected={editorTab === 'history'} disabled={navigationBusy} onClick={() => chooseTab('history')}>历史</button></div><div className="mira-automation-editor-actions">
          {editorTab === 'settings' && <button type="submit" form="automation-edit-form" className={editor.taskId ? 'mira-automation-primary mira-automation-save' : 'mira-automation-primary'} aria-label="保存自动化" disabled={!editorReady || saving}>{saving ? '正在保存…' : editor.taskId ? '保存' : '创建定时任务'}</button>}
          {editingTask && <>{editorTab === 'settings' && <button type="button" className="mira-automation-secondary" aria-label="立即运行已保存任务" disabled={!editorReady || saving || busyIds.includes(editingTask.id) || Boolean(editingTask.endedAt) || (runs[editingTask.id] || []).some(run => run.status === 'running')} onClick={() => requestSave(true)}><Play size={14} />立即运行</button>}{taskMenu(editingTask, true)}</>}
        </div></div>
        {editorTab === 'history' ? editor.taskId ? <AutomationRunHistory tasks={tasks} runs={runs} taskId={editor.taskId} status={runStatus} busyIds={busyIds} navigationBusy={navigationBusy} onTask={chooseRunTask} onStatus={chooseRunStatus} onRetry={retry} onStop={stop} onOpenSession={id => { void openSession(id) }} onDeleteRun={host.deleteAutomationRun ? run => setRunToDelete(run) : undefined} /> : <div className="mira-automation-empty mira-automation-history-empty">暂无运行历史</div> : <AutomationEditor host={host} form={editor.form} taskId={editor.taskId} projects={projects} sessions={sessions} providers={providers} permission={permission} active={active} navigationBusy={navigationBusy} saving={saving || loading || !draftLoaded} readOnly={Boolean(editingTask?.endedAt)} error={formError} onChange={changeForm} onSave={requestSave} onReady={setEditorReady} onManageModels={onManageModels} />}
      </> : <><div className="mira-automation-page-title"><MiraAutomationTitleSwitch value={pageTab} onChange={switchPage} /><p>创建定时任务，让 Mira 按计划在后台执行。</p></div>
        {loading ? <p className="mira-automation-loading" role="status"><LoaderCircle size={17} className="mira-automation-spin" />正在加载自动化…</p> : section === 'runs' ? history() : <>
          {tasks.length > 0 && <><div className="mira-automation-list-toolbar"><span className="mira-automation-type-pill">定时任务</span><div><AutomationHint label="刷新"><button type="button" className="mira-automation-icon mira-automation-refresh" aria-label="刷新自动化" disabled={refreshing || Boolean(busyIds.length)} onClick={() => { void load() }}><RefreshCw size={14} className={refreshing ? 'mira-automation-spin' : undefined} /></button></AutomationHint>{create()}</div></div><div className="mira-automation-filters" role="group" aria-label="任务状态">{TASK_FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} disabled={navigationBusy} onClick={() => chooseFilter(value)}>{label}</button>)}</div></>}
          <div className="mira-automation-keep-awake"><Info size={16} /><p>保持电脑运行，防止系统因空闲进入休眠。</p><label className="mira-automation-switch"><input type="checkbox" role="switch" aria-label="保持电脑运行" checked={keepAwake} disabled={keepAwakeBusy} onChange={event => { void changeKeepAwake(event.target.checked) }} /><span /></label></div>
          {tasks.length > 0 && <div className="mira-automation-section-title mira-automation-created-title"><h3>已创建任务</h3></div>}
          {!tasks.length ? <div className="mira-automation-empty mira-automation-list-empty"><p>还没有定时任务</p>{create()}</div> : !filtered.length ? <div className="mira-automation-empty mira-automation-history-empty">没有符合条件的任务</div> : <div className="mira-automation-grid">{filtered.map(task => {
            const status = taskState(task, runs[task.id]?.[0])
            const schedule = automationCardSchedule(task)
            const nextRun = task.enabled && !task.endedAt && status.key !== 'failed' ? automationCardNextRun(task.nextRunAt) : undefined
            const scheduleText = nextRun ? `${schedule} · 下次运行 ${nextRun}` : schedule
            return <article className="mira-automation-card" key={task.id} data-status={status.key}>
              <button type="button" className="mira-automation-card-main" aria-label={`查看自动化 ${task.name}`} disabled={navigationBusy} onClick={() => beginEditor(task)}><strong>{task.name}</strong><p>{task.prompt}</p></button>
              <div className="mira-automation-card-controls">{taskMenu(task)}</div>
              <footer><div className="mira-automation-card-schedule">
                {['paused', 'ended', 'failed'].includes(status.key) && <span className="mira-automation-card-state" data-status={status.key}>{status.key === 'paused' ? <Pause size={12} /> : <Info size={12} />}{status.label}</span>}
                <AutomationHint label={nextRun ? `${schedule} · 下次运行：${formatAutomationTime(task.nextRunAt)}` : schedule}><span className="mira-automation-status" data-status={status.key} tabIndex={0}><Clock3 size={14} /><span>{scheduleText}</span></span></AutomationHint>
              </div><button type="button" className="mira-automation-run-count" aria-label={`查看 ${task.name} 运行记录`} disabled={navigationBusy} onClick={() => showRuns(task.id)}>已运行 {(runs[task.id] || []).length} 次</button></footer>
            </article>
          })}</div>}
          <section className="mira-automation-templates" aria-label="自动化模板"><div className="mira-automation-section-title"><h3>定时任务模板</h3></div><div className="mira-automation-template-grid">{AUTOMATION_TEMPLATES.map((template, index) => { const Icon = [Target, Activity, FileText, List][index]; return <button key={template.id} className="mira-automation-template" type="button" aria-label={`使用模板 ${template.name}`} disabled={!draftLoaded || navigationBusy} onClick={() => beginEditor(undefined, template)}><strong><Icon size={16} />{template.name}</strong><p>{template.prompt}</p><small>{template.trigger.type === 'cron' ? template.trigger.humanLabel : ''}</small></button> })}</div></section>
        </>}
      </>}
    </div></div>
    <Dialog.Root open={active && !navigationBusy && Boolean(confirmation)} onOpenChange={open => { if (!open && !busyIds.length) setConfirmation(undefined) }}><Dialog.Portal container={portal}><Dialog.Content className="mira-automation-dialog mira-automation-delete-dialog"><Dialog.Title>删除定时任务</Dialog.Title><Dialog.Description>{confirmation ? `确定删除“${confirmation.task.name}”？此操作无法撤销。` : ''}</Dialog.Description>{confirmation && error && <p className="mira-automation-error" role="alert">{error}</p>}<div className="mira-automation-dialog-actions"><button type="button" className="mira-automation-secondary" disabled={Boolean(busyIds.length) || navigationBusy} onClick={() => setConfirmation(undefined)}>取消</button><button type="button" className="mira-automation-danger" aria-label="确认删除自动化" disabled={Boolean(busyIds.length) || navigationBusy} onClick={() => { if (confirmation) remove(confirmation.task) }}>删除</button></div><Dialog.Close asChild><button type="button" className="mira-automation-icon mira-automation-dialog-close" aria-label="关闭确认" disabled={Boolean(busyIds.length) || navigationBusy}><X size={16} /></button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={active && !navigationBusy && Boolean(runToDelete)} onOpenChange={open => { if (!open) setRunToDelete(undefined) }}><Dialog.Portal container={portal}><Dialog.Content className="mira-automation-dialog mira-automation-delete-dialog"><Dialog.Title>删除运行记录</Dialog.Title><Dialog.Description>确定删除这条运行记录？关联会话不会删除。</Dialog.Description><div className="mira-automation-dialog-actions"><button type="button" className="mira-automation-secondary" onClick={() => setRunToDelete(undefined)}>取消</button><button type="button" className="mira-automation-danger" disabled={Boolean(busyIds.length)} onClick={() => { if (runToDelete && host.deleteAutomationRun) { const run = runToDelete; void perform(run.taskId, () => host.deleteAutomationRun!(run.id), () => { setRuns(previous => ({ ...previous, [run.taskId]: (previous[run.taskId] || []).filter(entry => entry.id !== run.id) })); setRunToDelete(undefined) }) } }}>删除记录</button></div>{error && <p role="alert" className="mira-automation-error">{error}</p>}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>
}
function message(cause: unknown) { return cause instanceof Error ? cause.message : '自动化操作失败，请重试' }
