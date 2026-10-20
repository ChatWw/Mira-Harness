/* Workflow hub/card/title switch adapted from ZCode SavedWorkflowsSection/SavedWorkflowCard.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Play, Plus, RefreshCw, MoreHorizontal, Trash2, LoaderCircle, CheckCircle2, CircleAlert, CircleStop } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'
import { MiraWorkflowDefinitionDetail } from './MiraWorkflowDefinitionDetail'
import { AutomationHint, AutomationSelect } from '../automations/AutomationControls'
import type { HarnessProject, ModelProviderSummary } from '../../../../../src/config/harness'
import type { MiraWorkflowDocument, MiraWorkflowEntry } from '../../../../../src/config/miraWorkflows'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import type { RunRecord, ArtifactVersionRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import { MiraWorkflowLaunch } from './MiraWorkflowLaunch'
import { workflowError, workflowStatus, type MiraWorkflowHost } from './workflow-model'

export function MiraAutomationTitleSwitch({ value, onChange }: { value: 'automations' | 'workflows'; onChange: (value: 'automations' | 'workflows') => void }) {
  return <div role="tablist" aria-label="自动化与工作流" className="mira-workflow-title-switch" onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = value === 'automations' ? 'workflows' : 'automations'; onChange(next); event.currentTarget.querySelector<HTMLButtonElement>(`[data-page-tab="${next}"]`)?.focus() } }}>{(['automations', 'workflows'] as const).map(tab => <button key={tab} type="button" role="tab" data-page-tab={tab} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => onChange(tab)}>{tab === 'automations' ? '自动化' : '工作流'}</button>)}</div>
}

type Definition = { entry: MiraWorkflowEntry; projectId?: string }
type Group = { title: string; projectId?: string; definitions: Definition[]; error?: string }
export function MiraWorkflowsView({ host, projects, providers, active = true, onOpenRun, onManageModels, onCreateViaChat, header, currentProjectId }: { host: MiraWorkflowHost; projects: HarnessProject[]; providers: ModelProviderSummary[]; active?: boolean; onOpenRun: (identity: MiraFlowRunIdentity, actor?: undefined, selection?: undefined, artifact?: ArtifactVersionRecord) => Promise<void>; onManageModels: () => void; header?: ReactNode; currentProjectId?: string; onCreateViaChat?: (prompt: string, projectId?: string) => Promise<void> | void }) {
  const [groups, setGroups] = useState<Group[]>([]), [runs, setRuns] = useState<import('../../../../../src/config/miraFlowWorkbench').MiraFlowRunSummary[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [launch, setLaunch] = useState<{ document: MiraWorkflowDocument; projectId?: string }>()
  const [detail, setDetail] = useState<{ document: MiraWorkflowDocument; projectId?: string }>()
  const [deleting, setDeleting] = useState<{ definition: Definition; document: MiraWorkflowDocument }>(), [deletingBusy, setDeletingBusy] = useState(false), [feedback, setFeedback] = useState('')
  const [moving, setMoving] = useState<MiraWorkflowDocument>(), [moveTarget, setMoveTarget] = useState(''), [moveBusy, setMoveBusy] = useState(false)
  const [reading, setReading] = useState(false), cycle = useRef(0), current = useRef(true), readBusy = useRef(false), activeRef = useRef(active)
  activeRef.current = active
  const projectKey = projects.map(project => `${project.id}:${project.directoryExists}`).join('|')
  async function load() {
    const version = ++cycle.current
    setLoading(true)
    try {
      const scopes = [{ title: '全局工作流', projectId: undefined }, ...projects.filter(project => project.directoryExists).map(project => ({ title: project.name, projectId: project.id }))]
      const results = await Promise.all(scopes.map(async group => {
        try {
          const entries = await host.requestWorkflow<MiraWorkflowEntry[]>({ action: 'definitions.list', ...(group.projectId ? { projectId: group.projectId } : {}) })
          return { ...group, definitions: entries.filter(entry => entry.scope === (group.projectId ? 'project' : 'global')).map(entry => ({ entry, projectId: group.projectId })) }
        } catch (cause) { return { ...group, definitions: [], error: workflowError(cause) } }
      }))
      if (!current.current || version !== cycle.current) return
      setGroups(results)
      const history = await host.requestWorkflow<RunRecord[]>({ action: 'runs.list' })
      if (!current.current || version !== cycle.current) return
      setRuns(history); setError('')
    } catch (cause) { if (current.current && version === cycle.current) setError(workflowError(cause)) }
    finally { if (current.current && version === cycle.current) setLoading(false) }
  }
  useEffect(() => { current.current = true; return () => { current.current = false; cycle.current++ } }, [])
  useEffect(() => { if (active) void load(); else { cycle.current++; setLaunch(undefined); setDeleting(undefined); setMoving(undefined) } }, [host, projectKey, active])
  async function read(definition: Definition, run: boolean) {
    if (readBusy.current) return
    readBusy.current = true; setReading(true); setError('')
    try {
      const document = await host.requestWorkflow<MiraWorkflowDocument>({ action: 'definitions.read', name: definition.entry.name, scope: definition.entry.scope, ...(definition.projectId ? { projectId: definition.projectId } : {}) })
      if (!document) throw new Error('工作流定义已删除，请刷新后重试')
      if (!current.current || !activeRef.current) return
      if (run) setLaunch({ document, projectId: definition.projectId })
      else setDetail({ document, projectId: definition.projectId })
    } catch (cause) { if (current.current) setError(workflowError(cause)) }
    finally { readBusy.current = false; if (current.current) setReading(false) }
  }
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = host.onWorkflowEvent(event => {
      if (event.type !== 'workflow-event' || timer) return
      timer = setTimeout(() => { timer = undefined; void load() }, 150)
    })
    return () => { unsubscribe(); clearTimeout(timer) }
  }, [host, projectKey, active])
  async function createViaChat(projectId?: string, prompt = '请帮我设计一个可复用的工作流，先确认我的需求，分阶段执行并验证结果，跑通后保存为工作流。') {
    try { await onCreateViaChat?.(prompt, projectId) } catch (cause) { setError(workflowError(cause)) }
  }
  const create = (projectId?: string) => <button type="button" className="mira-automation-primary" disabled={reading || !onCreateViaChat} onClick={() => void createViaChat(projectId, projectId ? undefined : '请帮我设计一个不依赖特定项目的全局工作流，先确认需求，验证后保存到全局工作流目录。')}><Plus size={14} />通过对话创建</button>
  const matchingRuns = (name: string, projectId?: string) => runs.filter(run => run.name === name && (!projectId || run.cwd === projects.find(project => project.id === projectId)?.directory))
  async function requestDelete(definition: Definition) {
    setError('')
    try {
      const document = await host.requestWorkflow<MiraWorkflowDocument>({ action: 'definitions.read', name: definition.entry.name, scope: definition.entry.scope, ...(definition.projectId ? { projectId: definition.projectId } : {}) })
      if (!document) throw new Error('工作流定义已删除，请刷新后重试')
      if (current.current && activeRef.current) setDeleting({ definition, document })
    } catch (cause) { setError(workflowError(cause)) }
  }
  async function remove() {
    if (!deleting || deletingBusy) return
    setDeletingBusy(true); setError('')
    try {
      const { document, definition } = deleting
      await host.requestWorkflow({ action: 'definitions.delete', name: document.name, scope: document.scope, expectedRevision: document.revision, ...(definition.projectId ? { projectId: definition.projectId } : {}) })
      setDeleting(undefined); setDetail(undefined); await load()
    } catch (cause) { setError(workflowError(cause)) }
    finally { setDeletingBusy(false) }
  }
  const menu = (definition: Definition) => <DropdownMenu.Root><DropdownMenu.Trigger type="button" className="mira-automation-icon" aria-label={`${definition.entry.name} 更多操作`} disabled={reading}><MoreHorizontal size={16} /></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-automation-menu" align="end" sideOffset={4}>
    <DropdownMenu.Item disabled={Boolean(definition.entry.diagnostic)} onSelect={() => void read(definition, false)}>查看详情</DropdownMenu.Item>
    {onCreateViaChat && <><DropdownMenu.Item onSelect={() => void createViaChat(definition.projectId, `请先读取工作流 ${JSON.stringify(definition.entry.path)}，与我确认修改需求，再修订并验证。`)}>在对话里修订</DropdownMenu.Item>{definition.projectId && <DropdownMenu.Item onSelect={() => void createViaChat(definition.projectId, `请读取项目工作流 ${JSON.stringify(definition.entry.path)}，提炼其中与项目无关的流程并保存为全局工作流，保留原项目工作流。`)}>提升为全局</DropdownMenu.Item>}</>}
    {!definition.projectId && <DropdownMenu.Item disabled={Boolean(definition.entry.diagnostic) || !projects.some(project => project.directoryExists)} onSelect={() => { setError(''); void host.requestWorkflow<MiraWorkflowDocument>({ action: 'definitions.read', name: definition.entry.name, scope: 'global' }).then(document => { if (document && current.current && activeRef.current) { setMoving(document); setMoveTarget(projects.find(project => project.directoryExists)?.id || '') } }, cause => setError(workflowError(cause))) }}>移到项目…</DropdownMenu.Item>}
    <DropdownMenu.Item onSelect={() => { void navigator.clipboard.writeText(definition.entry.path).then(() => setFeedback('已复制路径'), () => setError('复制路径失败，请重试')) }}>复制路径</DropdownMenu.Item>
    <DropdownMenu.Separator /><DropdownMenu.Item className="mira-automation-menu-danger" disabled={Boolean(definition.entry.diagnostic)} onSelect={() => void requestDelete(definition)}><Trash2 size={14} />删除工作流</DropdownMenu.Item>
  </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
  async function moveToProject() {
    if (!moving || !moveTarget || moveBusy) return
    setMoveBusy(true); setError('')
    try {
      await host.requestWorkflow({ action: 'definitions.move', projectId: moveTarget, name: moving.name, expectedRevision: moving.revision })
      setMoving(undefined); setDetail(undefined); setFeedback('已移到项目'); await load()
    } catch (cause) { setError(workflowError(cause)) }
    finally { setMoveBusy(false) }
  }
  const moveDialog = <Dialog.Root open={Boolean(moving) && active} onOpenChange={open => { if (!open && !moveBusy) setMoving(undefined) }}><Dialog.Portal container={document.getElementById('root')}><Dialog.Overlay className="mira-automation-dialog-overlay mira-workflow-dialog-overlay" /><Dialog.Content className="mira-automation-dialog" onEscapeKeyDown={event => { if (moveBusy) event.preventDefault() }} onPointerDownOutside={event => { if (moveBusy) event.preventDefault() }}><Dialog.Title>移到项目</Dialog.Title><Dialog.Description>将「{moving?.name}」从全局移入所选项目。目标已有同名工作流时不会覆盖。</Dialog.Description><AutomationSelect label="目标项目" value={moveTarget} options={projects.filter(project => project.directoryExists).map(project => ({ value: project.id, label: project.name }))} disabled={moveBusy} onChange={setMoveTarget} />{error && <p role="alert" className="mira-automation-error">{error}</p>}<div className="mira-automation-dialog-actions"><button type="button" className="mira-automation-secondary" disabled={moveBusy} onClick={() => setMoving(undefined)}>取消</button><button type="button" className="mira-automation-primary" disabled={moveBusy || !moveTarget} onClick={() => void moveToProject()}>{moveBusy ? '正在移动…' : '移动'}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  const launchDialog = launch && <MiraWorkflowLaunch host={host} document={launch.document} projectId={launch.projectId} projects={projects} providers={providers} onClose={() => setLaunch(undefined)} onAccepted={onOpenRun} onManageModels={onManageModels} />
  const deleteDialog = <Dialog.Root open={Boolean(deleting) && active} onOpenChange={open => { if (!open && !deletingBusy) setDeleting(undefined) }}><Dialog.Portal container={document.getElementById('root')}><Dialog.Overlay className="mira-automation-dialog-overlay mira-workflow-dialog-overlay" /><Dialog.Content className="mira-automation-dialog" onEscapeKeyDown={event => { if (deletingBusy) event.preventDefault() }} onPointerDownOutside={event => { if (deletingBusy) event.preventDefault() }}><Dialog.Title>删除工作流「{deleting?.document.name}」？</Dialog.Title><Dialog.Description>将删除 {deleting?.document.path}。已有的运行记录会保留。</Dialog.Description>{error && <p className="mira-automation-error" role="alert">{error}</p>}<div className="mira-automation-dialog-actions"><button type="button" className="mira-automation-secondary" disabled={deletingBusy} onClick={() => setDeleting(undefined)}>取消</button><button type="button" className="mira-automation-danger" disabled={deletingBusy} onClick={() => void remove()}>{deletingBusy ? '正在删除…' : '删除'}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  if (detail) return <><MiraWorkflowDefinitionDetail document={detail.document} projectLabel={projects.find(project => project.id === detail.projectId)?.name} onSaveMeta={async meta => {
    const saved = await host.requestWorkflow<MiraWorkflowDocument>({ action: 'definitions.save', ...(detail.projectId ? { projectId: detail.projectId } : {}), input: { name: detail.document.name, scope: detail.document.scope, meta, script: detail.document.script, expectedRevision: detail.document.revision } })
    if (current.current) { setDetail({ ...detail, document: saved }); setFeedback('已保存'); void load() }
  }} runs={matchingRuns(detail.document.name, detail.projectId)} onOpenArtifact={(run, artifact) => { if (run.parentSessionId) void onOpenRun({ sessionId: run.parentSessionId, runId: run.runId }, undefined, undefined, artifact).catch(cause => setError(workflowError(cause))) }} onBack={() => setDetail(undefined)} onRun={() => setLaunch(detail)} onOpenRun={run => { if (run.parentSessionId) void onOpenRun({ sessionId: run.parentSessionId, runId: run.runId }).catch(cause => setError(workflowError(cause))) }} menu={menu({ entry: detail.document, projectId: detail.projectId })} />{error && !deleting && <p className="mira-automation-error" role="alert">{error}</p>}{launchDialog}{deleteDialog}{moveDialog}</>
  const visibleGroups = groups.filter(group => !group.projectId || group.definitions.length || group.error)
  const emptyProjects = groups.length > 0 && !groups.some(group => group.projectId && group.definitions.length)
  return <div className="mira-workflow-hub-page"><section className="mira-automation-content mira-workflows" aria-label="工作流工作台">{header}<p className="mira-workflow-description">保存在已打开项目里的工作流，填好参数就能再跑一次。</p>
    <div className="mira-workflow-toolbar"><h2>已保存的工作流<span>{groups.reduce((count, group) => count + group.definitions.length, 0) || ''}</span></h2><AutomationHint label="刷新"><button className="mira-automation-icon" type="button" aria-label="刷新工作流列表" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'pilot-spin' : undefined} /></button></AutomationHint></div>
    {feedback && <p role="status" className="mira-workflow-muted">{feedback}</p>}
    {error && <div className="mira-automation-error" role="alert">{error}<button type="button" onClick={() => void load()}>重试</button></div>}{loading && !groups.length && <p role="status">正在读取工作流…</p>}
    <>{visibleGroups.map(group => <section className="mira-workflow-group" key={group.projectId || 'global'}><div className="mira-automation-section-title"><h3>{group.projectId ? group.title : '全局'}</h3>{!group.projectId && <span className="mira-workflow-scope">对所有项目可见</span>}{group.projectId && group.projectId === currentProjectId && <span className="mira-workflow-scope">当前</span>}{group.definitions.length > 0 && <span>{group.definitions.length}</span>}{create(group.projectId)}</div>{group.error && <div className="mira-automation-error" role="alert">{group.error}<button type="button" onClick={() => void load()}>重试</button></div>}<div className="mira-workflow-grid">{group.definitions.map(definition => {
      const { entry } = definition, parameters = Object.keys(entry.meta?.args ?? {})
      const lastRun = matchingRuns(entry.name, definition.projectId)[0]
      const LastIcon = lastRun?.status === 'running' ? LoaderCircle : lastRun?.status === 'completed' ? CheckCircle2 : lastRun?.status === 'errored' ? CircleAlert : CircleStop
      return <article className="mira-workflow-saved-card" key={entry.name} data-workflow-name={entry.name} role="button" tabIndex={0} aria-label={`查看工作流 ${entry.name} 的详情`} onClick={() => { if (!entry.diagnostic) void read(definition, false) }} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) { event.preventDefault(); if (!entry.diagnostic) void read(definition, false) } }}><div className="mira-workflow-saved-card__header"><strong className="mira-workflow-saved-card__title">{entry.name}</strong></div><div className="mira-workflow-saved-card__actions" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><button type="button" className="mira-automation-secondary" aria-label={`运行工作流 ${entry.name}`} disabled={reading || Boolean(entry.diagnostic)} onClick={() => void read(definition, true)}><Play size={13} />运行</button>{menu(definition)}</div><p>{entry.diagnostic?.detail || entry.meta?.description}</p><div className="mira-workflow-saved-card__footer"><span className="mira-workflow-last-run" data-status={lastRun?.status || 'never'}>{lastRun && <LastIcon size={14} className={lastRun.status === 'running' ? 'pilot-spin' : undefined} />}{lastRun ? workflowStatus[lastRun.status] : '尚未运行'}</span><div>{parameters.slice(0, 3).map(name => <span key={name}>{name}</span>)}{parameters.length > 3 && <span>+{parameters.length - 3}</span>}</div></div></article>
    })}</div>{!group.definitions.length && !group.error && <p className="mira-workflow-empty">还没有全局工作流。适合放不依赖某个项目的流程，例如深度调研。</p>}</section>)}{emptyProjects && !loading && <div className="mira-workflow-hub-empty"><p>已打开的项目里还没有保存的工作流</p><p>在对话里让 Mira 设计工作流，跑通之后再让它保存到项目里。未打开的项目不会出现在这里。</p>{create(projects.find(project => project.directoryExists)?.id)}</div>}</>
    {launchDialog}{deleteDialog}{moveDialog}
  </section></div>
}
