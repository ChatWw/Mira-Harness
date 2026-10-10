/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation: task cards and full-page settings backed by Mira's existing automation scheduler.
 * Structural reference: ZCode AutomationsSection / AutomationEditView; license: third-party-licenses/zcode/.
 */
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowLeft, ArrowUpRight, CalendarClock, Clock3, FileText, LoaderCircle, MoreHorizontal, Play, Plus, RefreshCw, Search, Square, Trash2, X } from 'lucide-react'
import { DEFAULT_PERMISSION_CONFIG, type AutomationOverview, type AutomationRun, type AutomationRunStatus, type AutomationTask, type HarnessProject, type HarnessSessionSummary, type ModelProviderSummary, type PermissionConfig } from '../../../../../src/config/harness'
import { formatAutomationTime, taskState, triggerLabel } from '../../../../../src/pages/frontend/harness/automations/automationPresentation'
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from '../../../../../src/pages/frontend/harness/automations/automationTemplates'
import { AUTOMATION_DRAFT_KEY, applyAutomationTrigger, automationFormForTask, automationInputForForm, newAutomationForm, readAutomationDraft, type AutomationDraft, type AutomationForm } from './automation-form'
import type { AutomationsHost } from './automation-host'
import { AutomationEditor } from './AutomationEditor'
import { AutomationRunHistory } from './AutomationRunHistory'
import type { MiraAppNavigationTarget } from '../../../../../src/platform/appNavigation'
import './automations.css'

export type { AutomationsHost } from './automation-host'
const TASK_FILTERS = [['all', '全部'], ['active', '启用'], ['paused', '暂停'], ['failed', '最近失败'], ['ended', '已结束']] as const
type Confirmation = { type: 'delete'; task: AutomationTask } | { type: 'discard' }
export type AutomationNavigationTarget = Extract<MiraAppNavigationTarget, { kind: 'automations' }>
export interface AutomationsNavigationHandle { navigate: (target: AutomationNavigationTarget, isCurrent?: () => boolean, restoreNewDraft?: boolean) => Promise<boolean> }
export function AutomationsView({ host, projects, sessions, providers, onOpenSession, onManageModels, active = true, navigationBusy = false, ref, onNavigationChange, onDraftNavigation, onDeleteTask }: {
  host: AutomationsHost; projects: HarnessProject[]; sessions: HarnessSessionSummary[]; providers: ModelProviderSummary[]
  onOpenSession: (sessionId: string) => Promise<void> | void; onManageModels: () => void; active?: boolean; navigationBusy?: boolean
  ref?: Ref<AutomationsNavigationHandle>; onNavigationChange?: (target: AutomationNavigationTarget) => void; onDraftNavigation?: () => void; onDeleteTask?: (id: string) => void
}) {
  const [tasks, setTasks] = useState<AutomationTask[]>([])
  const [runs, setRuns] = useState<Record<string, AutomationRun[]>>({})
  const [overview, setOverview] = useState<AutomationOverview>({ enabledCount: 0, runningCount: 0, failedLastDayCount: 0 })
  const [permission, setPermission] = useState<PermissionConfig>(DEFAULT_PERMISSION_CONFIG)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<typeof TASK_FILTERS[number][0]>('all')
  const [section, setSection] = useState<'tasks' | 'runs'>('tasks')
  const [runTaskId, setRunTaskId] = useState('')
  const [runStatus, setRunStatus] = useState<AutomationRunStatus | 'all'>('all')
  const [editor, setEditor] = useState<AutomationDraft>()
  const [editorTab, setEditorTab] = useState<'settings' | 'history'>('settings')
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyIds, setBusyIds] = useState<string[]>([])
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
      const [nextTasks, nextOverview, nextPermission] = await Promise.all([host.listAutomationTasks(), host.getAutomationOverview(), host.getHarnessPermissionConfig()])
      const nextRuns = Object.fromEntries(await Promise.all(nextTasks.map(async task => [task.id, await host.listAutomationRuns(task.id)] as const)))
      if (!mounted.current || revision !== cycle.current) return undefined
      setTasks(nextTasks); setRuns(nextRuns); setOverview(nextOverview); setPermission(nextPermission); setLoadError(''); setLoading(false)
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
      if (restored) { latestDraft.current = restored; setEditor(restored); setFeedback('已恢复未保存的自动化草稿') }
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
      latestDraft.current = next; setEditor(next); setEditorTab(target.tab ?? 'settings'); setSection(target.section ?? 'tasks'); setFilter(target.filter ?? 'all'); setRunTaskId(target.runTaskId ?? task?.id ?? ''); setRunStatus(target.runStatus ?? 'all'); setQuery(''); setConfirmation(undefined); setMenuTaskId(undefined); setFormError(''); setError(''); setFeedback('')
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
    if (!active) { setConfirmation(undefined); setMenuTaskId(undefined); return }
    void load()
    const timer = window.setInterval(() => { if (!saveBusy.current && !operations.current.size) void load() }, 2500)
    return () => { window.clearInterval(timer); invalidateLoad() }
  }, [host, active])
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
  useEffect(() => { if (navigationBusy) { setConfirmation(undefined); setMenuTaskId(undefined) } }, [navigationBusy])

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
    latestDraft.current = next; setEditor(next); setEditorTab('settings'); setFormError(''); setFeedback(''); onDraftNavigation?.()
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
    if (JSON.stringify(latestDraft.current.form) !== latestDraft.current.baseline) setConfirmation({ type: 'discard' })
    else void clearDraft()
  }
  async function save(): Promise<string | undefined> {
    if (!active || saveBusy.current || !latestDraft.current) return
    const draft = latestDraft.current
    if (draft.taskId && tasks.find(task => task.id === draft.taskId)?.endedAt) { setFormError('任务已结束，不能修改'); return '任务已结束，不能修改' }
    saveBusy.current = true; setSaving(true); setFormError(''); setFeedback(''); invalidateLoad(); setRefreshing(false)
    try {
      const input = automationInputForForm(draft, { projects, sessions, providers, permission })
      if (input.trigger.type === 'cron') await host.getAutomationNextRuns(input.trigger.expression)
      const saved = await host.saveAutomationTask(input)
      const savedDraft = { ...draft, taskId: saved.id, baseline: JSON.stringify(draft.form) }
      latestDraft.current = savedDraft
      if (mounted.current) { setTasks(previous => [saved, ...previous.filter(task => task.id !== saved.id)]); setEditor(savedDraft); setFeedback('任务已保存') }
      const nextDrafts = new Map(drafts.current)
      nextDrafts.delete(draft.taskId ?? ''); nextDrafts.delete(saved.id)
      try { await writeDrafts(undefined, nextDrafts) }
      catch (cause) { throw new Error(`任务已保存，但草稿清理失败：${message(cause)}。再次保存只会更新该任务。`) }
      drafts.current = nextDrafts; latestDraft.current = undefined
      if (mounted.current) { setEditor(undefined); notifyNavigation({}, undefined); void load() }
    } catch (cause) { const failure = message(cause); if (mounted.current) setFormError(failure); return failure }
    finally { saveBusy.current = false; if (mounted.current) setSaving(false) }
  }
  function requestSave() {
    if (saveBusy.current) return
    const request = save(); saveRequest.current = request
    void request.then(() => { if (saveRequest.current === request) saveRequest.current = undefined })
  }
  async function perform<T>(taskId: string, request: () => Promise<T>, commit: (value: T) => void, success: string | ((value: T) => string)) {
    if (!active || operations.current.has(taskId) || saveBusy.current) return
    operations.current.add(taskId); setBusyIds([...operations.current]); setError(''); setFeedback(''); invalidateLoad(); setRefreshing(false)
    try {
      const result = await request()
      invalidateLoad()
      if (!mounted.current) return
      commit(result); setFeedback(typeof success === 'function' ? success(result) : success)
    } catch (cause) { if (mounted.current) setError(message(cause)) }
    finally { operations.current.delete(taskId); if (mounted.current) { setBusyIds([...operations.current]); void load() } }
  }
  function commitRun(run: AutomationRun) { setRuns(previous => ({ ...previous, [run.taskId]: [run, ...(previous[run.taskId] || []).filter(existing => existing.id !== run.id)] })) }
  function runNow(task: AutomationTask) {
    if (task.endedAt || (runs[task.id] || []).some(run => run.status === 'running')) return
    void perform(task.id, () => host.runAutomationNow(task.id), commitRun, run => run.status === 'running' ? '任务已开始运行' : run.status === 'completed' ? '任务已完成' : run.error || '本次任务未启动')
  }
  function toggle(task: AutomationTask, enabled: boolean) { if (!task.endedAt) void perform(task.id, () => host.setAutomationTaskEnabled(task.id, enabled), saved => setTasks(previous => previous.map(item => item.id === saved.id ? saved : item)), enabled ? '任务已启用' : '任务已暂停') }
  function retry(run: AutomationRun) { void perform(run.taskId, () => host.retryAutomationRun(run.id), commitRun, result => result.status === 'running' ? '已开始重试' : result.error || '已提交重试') }
  function stop(taskId: string) { void perform(taskId, () => host.abortAutomationRun(taskId), () => undefined, '已请求停止任务') }
  function remove(task: AutomationTask) {
    if (navigationBusyRef.current) return
    void perform(task.id, () => host.deleteAutomationTask(task.id), () => { drafts.current.delete(task.id); setTasks(previous => previous.filter(item => item.id !== task.id)); setRuns(previous => { const next = { ...previous }; delete next[task.id]; return next }); setConfirmation(undefined); onDeleteTask?.(task.id); void persistDraft().catch(cause => setError(`草稿保存失败：${message(cause)}`)) }, '任务及其运行记录已删除')
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
    return (filter === 'all' || (filter === 'active' ? ['stable', 'running', 'scheduled'].includes(status) : filter === status)) && (!keyword || `${task.name} ${task.prompt} ${projectNames.get(task.projectId) || ''}`.toLocaleLowerCase().includes(keyword))
  })
  const editingTask = editor?.taskId ? tasks.find(task => task.id === editor.taskId) : undefined
  const editorDirty = Boolean(editor && JSON.stringify(editor.form) !== editor.baseline)
  const portal = document.getElementById('root')
  function chooseTab(tab: 'settings' | 'history') { if (!navigationBusyRef.current && tab !== editorTab) { navigationRevision.current++; setEditorTab(tab); notifyNavigation({ tab }) } }
  function chooseSection(next: 'tasks' | 'runs') { if (!navigationBusyRef.current && next !== section) { navigationRevision.current++; setSection(next); notifyNavigation({ section: next }) } }
  function chooseFilter(next: typeof filter) { if (!navigationBusyRef.current && next !== filter) { navigationRevision.current++; setFilter(next); notifyNavigation({ filter: next }) } }
  function chooseRunTask(id: string) { if (!navigationBusyRef.current && id !== runTaskId) { navigationRevision.current++; setRunTaskId(id); notifyNavigation({ runTaskId: id || undefined }) } }
  function chooseRunStatus(status: typeof runStatus) { if (!navigationBusyRef.current && status !== runStatus) { navigationRevision.current++; setRunStatus(status); notifyNavigation({ runStatus: status }) } }
  function showRuns(id: string) { if (!navigationBusyRef.current && (runTaskId !== id || section !== 'runs')) { navigationRevision.current++; setRunTaskId(id); setSection('runs'); notifyNavigation({ runTaskId: id, section: 'runs' }) } }
  const history = () => <AutomationRunHistory tasks={tasks} runs={runs} taskId={runTaskId} status={runStatus} busyIds={busyIds} navigationBusy={navigationBusy} onTask={chooseRunTask} onStatus={chooseRunStatus} onRetry={retry} onStop={stop} onOpenSession={id => { void openSession(id) }} />
  return <section className="mira-automations" aria-label="自动化工作台">
    <header className="mira-automation-header">{editor ? <button type="button" className="mira-automation-icon" aria-label="返回自动化列表" title="返回自动化列表" disabled={saving || navigationBusy} onClick={back}><ArrowLeft size={17} /></button> : <CalendarClock size={18} />}<h1>自动化</h1>{editor && <><span className="mira-automation-header-divider">/</span><span className="mira-automation-breadcrumb">{editor.form.name || (editor.taskId ? '编辑任务' : '新建任务')}</span></>}<div className="mira-automation-header-actions"><button type="button" className="mira-automation-icon" aria-label="刷新自动化" title="刷新自动化" disabled={refreshing || saving || Boolean(busyIds.length)} onClick={() => { void load(); if (!draftReady.current) restoreDraft() }}><RefreshCw size={16} className={refreshing ? 'mira-automation-spin' : undefined} /></button></div></header>
    <div className="mira-automation-scroll"><div className={editor ? 'mira-automation-content mira-automation-content--editor' : 'mira-automation-content'}>
      {loadError && <div className="mira-automation-error" role="alert"><span>{loadError}</span><button type="button" onClick={() => { void load() }}>重试</button></div>}
      {error && <div className="mira-automation-error" role="alert"><span>{error}</span>{!draftReady.current ? <button type="button" onClick={() => { setError(''); restoreDraft() }}>重试读取草稿</button> : <button type="button" aria-label="关闭自动化错误提示" onClick={() => setError('')}><X size={14} /></button>}</div>}
      {feedback && <p className="mira-automation-feedback" role="status">{feedback}</p>}
      {editor ? <><div className="mira-automation-editor-heading"><h2>{editor.form.name || (editor.taskId ? '编辑自动化' : '新建自动化')}</h2>{editingTask && <button type="button" className="mira-automation-secondary" aria-label="立即运行已保存任务" title={editorDirty ? '先保存修改再运行' : '立即运行'} disabled={saving || editorDirty || Boolean(editingTask.endedAt) || busyIds.includes(editingTask.id) || (runs[editingTask.id] || []).some(run => run.status === 'running')} onClick={() => runNow(editingTask)}><Play size={14} />立即运行</button>}</div><div className="mira-automation-tabs" role="tablist" aria-label="自动化详情"><button role="tab" type="button" aria-selected={editorTab === 'settings'} disabled={navigationBusy} onClick={() => chooseTab('settings')}>设置</button>{editor.taskId && <button role="tab" type="button" aria-selected={editorTab === 'history'} disabled={navigationBusy} onClick={() => chooseTab('history')}>运行记录</button>}</div>{editorTab === 'history' && editor.taskId ? history() : <AutomationEditor host={host} form={editor.form} projects={projects} sessions={sessions} providers={providers} permission={permission} active={active} navigationBusy={navigationBusy} saving={saving || loading || !draftLoaded} readOnly={Boolean(editingTask?.endedAt)} error={formError} onChange={changeForm} onSave={requestSave} onManageModels={onManageModels} />}</> : <>
        <div className="mira-automation-page-heading"><h2>自动化</h2><button type="button" className="mira-automation-primary" aria-label="新建自动化" disabled={loading || !draftLoaded || navigationBusy} onClick={() => beginEditor()}><Plus size={15} />新建任务</button></div>
        <div className="mira-automation-tabs" role="tablist" aria-label="自动化视图"><button role="tab" type="button" aria-selected={section === 'tasks'} disabled={navigationBusy} onClick={() => chooseSection('tasks')}>定时任务</button><button role="tab" type="button" aria-selected={section === 'runs'} disabled={navigationBusy} onClick={() => chooseSection('runs')}>运行记录</button></div>
        {loading ? <p className="mira-automation-loading" role="status"><LoaderCircle size={17} className="mira-automation-spin" />正在加载自动化…</p> : section === 'runs' ? history() : <>
          <div className="mira-automation-overview"><span>已启用 <b>{overview.enabledCount}</b></span><span>运行中 <b>{overview.runningCount}</b></span><span data-failed={overview.failedLastDayCount > 0}>近 24 小时失败 <b>{overview.failedLastDayCount}</b></span></div>
          <div className="mira-automation-toolbar"><label className="mira-automation-search"><Search size={15} /><input type="search" aria-label="搜索自动化" placeholder="搜索任务或项目" value={query} disabled={navigationBusy} onChange={event => { if (!navigationBusyRef.current) setQuery(event.target.value) }} /></label><div className="mira-automation-filters" role="group" aria-label="任务状态">{TASK_FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} disabled={navigationBusy} onClick={() => chooseFilter(value)}>{label}</button>)}</div></div>
          <section aria-label="自动化任务"><div className="mira-automation-section-title"><h3>已创建任务</h3><span>{filtered.length}</span></div>{!filtered.length ? <div className="mira-automation-empty"><CalendarClock size={25} /><p>{tasks.length ? '没有符合条件的任务' : '暂无自动化任务'}</p></div> : <div className="mira-automation-grid">{filtered.map(task => {
            const running = (runs[task.id] || []).some(run => run.status === 'running'), busy = busyIds.includes(task.id), status = taskState(task, runs[task.id]?.[0])
            return <article className="mira-automation-card" key={task.id} data-status={status.key}><button type="button" className="mira-automation-card-main" aria-label={`查看自动化 ${task.name}`} disabled={navigationBusy} onClick={() => beginEditor(task)}><strong>{task.name}</strong><p>{task.prompt}</p><span className="mira-automation-card-project">{projectNames.get(task.projectId) || '项目不可用'}</span></button><div className="mira-automation-card-controls"><label className="mira-automation-switch" title={task.enabled ? '暂停任务' : '启用任务'}><input type="checkbox" role="switch" aria-label={`启用 ${task.name}`} checked={task.enabled} disabled={Boolean(task.endedAt) || busy} onChange={event => toggle(task, event.target.checked)} /><span /></label><DropdownMenu.Root open={active && !navigationBusy && menuTaskId === task.id} onOpenChange={open => setMenuTaskId(open && active && !navigationBusyRef.current ? task.id : undefined)}><DropdownMenu.Trigger className="mira-automation-icon" type="button" aria-label={`${task.name} 操作`} title="任务操作" disabled={busy || navigationBusy}><MoreHorizontal size={17} /></DropdownMenu.Trigger><DropdownMenu.Portal container={portal}><DropdownMenu.Content className="mira-automation-menu" align="end" sideOffset={4}><DropdownMenu.Item disabled={Boolean(task.endedAt) || running} onSelect={() => runNow(task)}><Play size={14} />立即运行</DropdownMenu.Item>{running && <DropdownMenu.Item onSelect={() => stop(task.id)}><Square size={13} />停止运行</DropdownMenu.Item>}<DropdownMenu.Item disabled={navigationBusy} onSelect={() => showRuns(task.id)}><FileText size={14} />运行记录</DropdownMenu.Item><DropdownMenu.Separator /><DropdownMenu.Item disabled={running} className="mira-automation-menu-danger" onSelect={() => { if (!navigationBusyRef.current) setConfirmation({ type: 'delete', task }) }}><Trash2 size={14} />删除任务</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div><footer><span className="mira-automation-status" data-status={status.key}><Clock3 size={13} />{status.key === 'stable' ? triggerLabel(task) : status.label}</span><button type="button" className="mira-automation-icon" aria-label={`查看 ${task.name} 运行记录`} title="运行记录" disabled={navigationBusy} onClick={() => showRuns(task.id)}><ArrowUpRight size={14} /></button></footer>{task.enabled && !task.endedAt && task.nextRunAt && <small className="mira-automation-card-next">下次：{formatAutomationTime(task.nextRunAt)}</small>}</article>
          })}</div>}</section>
          <section className="mira-automation-templates" aria-label="自动化模板"><div className="mira-automation-section-title"><h3>更多灵感</h3></div><div className="mira-automation-template-grid">{AUTOMATION_TEMPLATES.map(template => <button key={template.id} className="mira-automation-template" type="button" aria-label={`使用模板 ${template.name}`} disabled={!draftLoaded || navigationBusy} onClick={() => beginEditor(undefined, template)}><CalendarClock size={19} /><span><strong>{template.name}</strong><small>{template.description}</small></span><Plus size={15} /></button>)}</div></section>
        </>}
      </>}
    </div></div>
    <Dialog.Root open={active && !navigationBusy && Boolean(confirmation)} onOpenChange={open => { if (!open && !busyIds.length) setConfirmation(undefined) }}><Dialog.Portal container={portal}><Dialog.Overlay className="mira-automation-dialog-overlay" /><Dialog.Content className="mira-automation-dialog"><Dialog.Title>{confirmation?.type === 'delete' ? '删除自动化' : '放弃未保存修改？'}</Dialog.Title><Dialog.Description>{confirmation?.type === 'delete' ? `删除「${confirmation.task.name}」及其运行记录？关联聊天不会删除。` : '修改尚未保存为自动化任务。'}</Dialog.Description>{confirmation && error && <p className="mira-automation-error" role="alert">{error}</p>}<div className="mira-automation-dialog-actions"><button type="button" className="mira-automation-secondary" disabled={Boolean(busyIds.length) || navigationBusy} onClick={() => setConfirmation(undefined)}>取消</button><button type="button" className="mira-automation-danger" aria-label={confirmation?.type === 'delete' ? '确认删除自动化' : '确认放弃修改'} disabled={Boolean(busyIds.length) || navigationBusy} onClick={() => { if (confirmation?.type === 'delete') remove(confirmation.task); else void clearDraft() }}>{confirmation?.type === 'delete' ? '删除' : '放弃修改'}</button></div><Dialog.Close asChild><button type="button" className="mira-automation-icon mira-automation-dialog-close" aria-label="关闭确认" disabled={Boolean(busyIds.length) || navigationBusy}><X size={16} /></button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>
}
function message(cause: unknown) { return cause instanceof Error ? cause.message : '自动化操作失败，请重试' }
