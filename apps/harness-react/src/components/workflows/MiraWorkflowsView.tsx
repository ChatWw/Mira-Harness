/* Workflow hub/card/title switch adapted from ZCode SavedWorkflowsSection/SavedWorkflowCard.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import { useEffect, useRef, useState } from 'react'
import { GitBranch, Play, Plus, RefreshCw, Search } from 'lucide-react'
import type { HarnessProject, ModelProviderSummary } from '../../../../../src/config/harness'
import type { MiraWorkflowDocument, MiraWorkflowEntry, MiraWorkflowScope } from '../../../../../src/config/miraWorkflows'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import type { RunRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import { MiraWorkflowEditor } from './MiraWorkflowEditor'
import { MiraWorkflowLaunch } from './MiraWorkflowLaunch'
import { workflowError, workflowStatus, type MiraWorkflowHost } from './workflow-model'

export function MiraAutomationTitleSwitch({ value, onChange }: { value: 'automations' | 'workflows'; onChange: (value: 'automations' | 'workflows') => void }) {
  return <div role="tablist" aria-label="自动化与工作流" className="mira-workflow-title-switch" onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = value === 'automations' ? 'workflows' : 'automations'; onChange(next); event.currentTarget.querySelector<HTMLButtonElement>(`[data-page-tab="${next}"]`)?.focus() } }}>{(['automations', 'workflows'] as const).map(tab => <button key={tab} type="button" role="tab" data-page-tab={tab} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => onChange(tab)}>{tab === 'automations' ? '自动化' : '工作流'}</button>)}</div>
}

type Definition = { entry: MiraWorkflowEntry; projectId?: string }
type Group = { title: string; projectId?: string; definitions: Definition[]; error?: string }
export function MiraWorkflowsView({ host, projects, providers, active = true, onOpenRun, onManageModels }: { host: MiraWorkflowHost; projects: HarnessProject[]; providers: ModelProviderSummary[]; active?: boolean; onOpenRun: (identity: MiraFlowRunIdentity) => Promise<void>; onManageModels: () => void }) {
  const [groups, setGroups] = useState<Group[]>([]), [runs, setRuns] = useState<RunRecord[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [query, setQuery] = useState(''), [section, setSection] = useState<'definitions' | 'runs'>('definitions')
  const [editor, setEditor] = useState<{ document?: MiraWorkflowDocument; projectId?: string; initialScope?: MiraWorkflowScope; key: string }>(), [launch, setLaunch] = useState<{ document: MiraWorkflowDocument; projectId?: string }>()
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
  useEffect(() => { if (active) void load(); else { cycle.current++; setLaunch(undefined) } }, [host, projectKey, active])
  async function read(definition: Definition, run: boolean) {
    if (readBusy.current) return
    readBusy.current = true; setReading(true); setError('')
    try {
      const document = await host.requestWorkflow<MiraWorkflowDocument>({ action: 'definitions.read', name: definition.entry.name, scope: definition.entry.scope, ...(definition.projectId ? { projectId: definition.projectId } : {}) })
      if (!document) throw new Error('工作流定义已删除，请刷新后重试')
      if (!current.current || !activeRef.current) return
      if (run) setLaunch({ document, projectId: definition.projectId })
      else setEditor({ document, projectId: definition.projectId, key: `${document.scope}:${definition.projectId}:${document.name}` })
    } catch (cause) { if (current.current) setError(workflowError(cause)) }
    finally { readBusy.current = false; if (current.current) setReading(false) }
  }
  if (editor) return <MiraWorkflowEditor key={editor.key} host={host} document={editor.document} projectId={editor.projectId} initialScope={editor.initialScope} projects={projects} onBack={() => setEditor(undefined)} onSaved={() => void load()} />
  const normalized = query.toLocaleLowerCase().trim()
  const filteredRuns = runs.filter(run => `${run.name || ''} ${run.runId} ${run.cwd || ''}`.toLocaleLowerCase().includes(normalized))
  return <section className="mira-workflows" aria-label="工作流工作台"><div className="mira-automation-intro"><div><h2>把多步骤任务保存为工作流</h2><p>复用智能体协作、阶段、参数与报告，在真实项目中执行并查看运行记录。</p></div><button className="mira-automation-primary" type="button" disabled={reading} onClick={() => setEditor({ key: 'new' })}><Plus size={14} />新建工作流</button></div>
    <div className="mira-workflow-toolbar"><div className="mira-automation-tabs" role="tablist" aria-label="工作流内容"><button type="button" role="tab" aria-selected={section === 'definitions'} onClick={() => setSection('definitions')}>已保存工作流</button><button type="button" role="tab" aria-selected={section === 'runs'} onClick={() => { setSection('runs'); void load() }}>运行记录</button></div><label className="mira-workflow-search"><Search size={14} /><input aria-label="搜索工作流" placeholder="搜索工作流" value={query} onChange={event => setQuery(event.target.value)} /></label><button className="mira-automation-icon" type="button" aria-label="刷新工作流列表" disabled={loading} onClick={() => void load()}><RefreshCw size={15} /></button></div>
    {error && <div className="mira-automation-error" role="alert">{error}<button type="button" onClick={() => void load()}>重试</button></div>}{loading && !groups.length && <p role="status">正在读取工作流…</p>}
    {section === 'definitions' ? groups.map(group => <section className="mira-workflow-group" key={group.projectId || 'global'}><div className="mira-automation-section-title"><h3>{group.title}</h3><span>{group.definitions.length}</span><button type="button" className="mira-automation-icon" aria-label={`在${group.title}新建工作流`} onClick={() => setEditor({ key: `new:${group.projectId || 'global'}`, projectId: group.projectId, initialScope: group.projectId ? 'project' : 'global' })}><Plus size={14} /></button></div>{group.error && <div className="mira-automation-error" role="alert">{group.error}<button type="button" onClick={() => void load()}>重试</button></div>}<div className="mira-workflow-grid">{group.definitions.filter(({ entry }) => `${entry.name} ${entry.meta?.description || ''}`.toLocaleLowerCase().includes(normalized)).map(definition => {
      const { entry } = definition, parameters = Object.keys(entry.meta?.args ?? {})
      return <article className="mira-workflow-card" key={entry.name} data-workflow-name={entry.name}><div className="mira-workflow-card__header"><button type="button" className="mira-workflow-card__title" disabled={reading || Boolean(entry.diagnostic)} onClick={() => void read(definition, false)}><GitBranch size={16} /><strong>{entry.name}</strong></button><button type="button" className="mira-automation-secondary" aria-label={`运行工作流 ${entry.name}`} disabled={reading || Boolean(entry.diagnostic)} onClick={() => void read(definition, true)}><Play size={13} />运行</button></div><p>{entry.diagnostic?.detail || entry.meta?.description}</p><div className="mira-workflow-card__footer"><small title={entry.path}>{entry.scope === 'global' ? '全局' : '项目'}{entry.shadowed && ' · 被同名项目工作流覆盖'}</small><div>{parameters.slice(0, 3).map(name => <span key={name}>{name}</span>)}{parameters.length > 3 && <span>+{parameters.length - 3}</span>}</div></div></article>
    })}</div>{!group.definitions.length && !group.error && <p className="mira-workflow-empty">尚未保存工作流，点击 ＋ 创建。</p>}</section>) : <div className="mira-workflow-history">{filteredRuns.map(run => <button type="button" key={`${run.parentSessionId}:${run.runId}`} disabled={!run.parentSessionId} onClick={() => { if (run.parentSessionId) void onOpenRun({ sessionId: run.parentSessionId, runId: run.runId }).catch(cause => setError(workflowError(cause))) }}><GitBranch size={16} /><div><strong>{run.name || run.runId}</strong><small>{run.cwd || run.parentSessionId}</small></div><span data-status={run.status}>{workflowStatus[run.status]}</span><small>{run.spentTokens.toLocaleString()} tokens</small></button>)}{!filteredRuns.length && <p className="mira-workflow-empty">{query ? '没有匹配的运行记录' : '尚无工作流运行记录'}</p>}</div>}
    {launch && <MiraWorkflowLaunch host={host} document={launch.document} projectId={launch.projectId} projects={projects} providers={providers} onClose={() => setLaunch(undefined)} onAccepted={onOpenRun} onManageModels={onManageModels} />}
  </section>
}
