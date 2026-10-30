import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronRight, Circle, Copy, Play } from 'lucide-react'
import type { MiraWorkflowDocument, MiraWorkflowMeta } from '../../../../../src/config/miraWorkflows'
import type { ArtifactVersionRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowRunSummary } from '../../../../../src/config/miraFlowWorkbench'
import { workflowDuration, workflowTokens } from './workflow-presentation'
import { MiraWorkflowArtifactChip } from './MiraWorkflowArtifacts'
import { highlightFilePreview } from '../../lib/file-preview-highlighter'
import { renderMiraHighlightedCode } from '../../lib/code-highlighter'
import { workflowStatus } from './workflow-model'
import { MiraWorkflowMetaForm } from './MiraWorkflowMetaForm'
import { AutomationHint } from '../automations/AutomationControls'

export function MiraWorkflowDefinitionDetail({ document, runs, onBack, onRun, onOpenRun, onSaveMeta, projectLabel, menu, onOpenArtifact }: {
  document: MiraWorkflowDocument; runs: MiraFlowRunSummary[]; onBack(): void; onRun(): void; onOpenRun(run: MiraFlowRunSummary): void; menu: ReactNode; projectLabel?: string; onSaveMeta(meta: MiraWorkflowMeta): Promise<void>; onOpenArtifact?: (run: MiraFlowRunSummary, artifact: ArtifactVersionRecord) => void
}) {
  const [tab, setTab] = useState('definition'), [feedback, setFeedback] = useState('')
  const [highlight, setHighlight] = useState<{ script: string; html: string }>()
  useEffect(() => {
    const cancellation = new AbortController()
    void highlightFilePreview(document.script, 'typescript', cancellation.signal).then(result => {
      if (!cancellation.signal.aborted) setHighlight({ script: document.script, html: renderMiraHighlightedCode(result, 'typescript') })
    }).catch(() => { /* Plain source stays readable when the optional highlighter is unavailable. */ })
    return () => cancellation.abort()
  }, [document.script])
  const recent = runs.find(run => run.presentation?.artifacts.length)
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setFeedback('已复制') } catch { setFeedback('复制失败，请重试') } }
  return <div className="mira-workflow-detail-page"><nav className="mira-workflow-breadcrumb" aria-label="工作流导航"><button type="button" onClick={onBack}>自动化</button><ChevronRight size={14} aria-hidden="true" /><span>{projectLabel || (document.scope === 'global' ? '全局' : '项目')}</span><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{document.name}</span></nav><section className="mira-automation-content mira-workflow-detail" aria-label={`工作流详情 ${document.name}`}>

    <header className="mira-workflow-detail__header"><div><h2>{document.name}</h2><p>{document.meta.description}</p></div><div><button type="button" className="mira-automation-primary" onClick={onRun}><Play size={14} />运行</button>{menu}</div></header>
    {recent?.presentation?.artifacts.length ? <div className="mira-workflow-recent-artifacts"><small>最近产物</small>{recent.presentation!.artifacts.map(artifact => <MiraWorkflowArtifactChip key={artifact.id} artifact={artifact} onOpen={onOpenArtifact ? value => onOpenArtifact(recent, value) : undefined} />)}</div> : null}
    <div className="mira-workflow-toolbar"><div className="mira-automation-tabs" role="tablist" aria-label="工作流详情"><button type="button" role="tab" aria-selected={tab === 'definition'} onClick={() => setTab('definition')}>定义</button><button type="button" role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>运行历史{runs.length ? ` ${runs.length}` : ''}</button></div><span className="mira-workflow-detail__path" title={document.path}>{document.path}</span><AutomationHint label="复制路径"><button type="button" className="mira-automation-icon" aria-label="复制工作流路径" onClick={() => void copy(document.path)}><Copy size={14} /></button></AutomationHint></div>
    {feedback && <p role="status" className="mira-workflow-muted">{feedback}</p>}
    {tab === 'definition' ? <div className="mira-workflow-detail__definition">
      <MiraWorkflowMetaForm key={document.revision} meta={document.meta} onSave={onSaveMeta} />
      <section><div className="mira-workflow-source-header"><h3>脚本</h3><small>脚本只读。要改脚本，在对话里让 Mira 修订后另存一版。</small></div><div className="mira-workflow-code"><div className="mira-workflow-code-caption"><span>{document.name}.dwf.ts · TypeScript</span><AutomationHint label="复制源码"><button type="button" className="mira-automation-icon" aria-label="复制工作流源码" onClick={() => void copy(document.script)}><Copy size={14} /></button></AutomationHint></div><div className="mira-workflow-code-body" tabIndex={0} aria-label="工作流 TypeScript 源码">{highlight?.script === document.script ? <div dangerouslySetInnerHTML={{ __html: highlight.html }} /> : <pre><code>{document.script}</code></pre>}</div></div></section>
    </div> : <div className="mira-workflow-history">{runs.map(run => <div className="mira-workflow-history__row" key={`${run.parentSessionId}:${run.runId}`}><span data-status={run.status}>{run.status === 'completed' ? <CheckCircle2 size={16} /> : <Circle size={16} />}{workflowStatus[run.status]}</span><div><div className="mira-workflow-history__meta"><time>{run.presentation?.startedAt ? new Date(run.presentation.startedAt).toLocaleString() : '时间未记录'}</time><span>{workflowDuration(run.presentation)} · {workflowTokens(run.spentTokens)} tokens</span>{Object.entries(run.args ?? {}).map(([key, value]) => <code key={key}>{key}={typeof value === 'string' ? value : JSON.stringify(value)}</code>)}</div><div className="mira-workflow-history__artifacts">{run.presentation?.artifacts.map(artifact => <MiraWorkflowArtifactChip key={artifact.id} artifact={artifact} onOpen={onOpenArtifact ? value => onOpenArtifact(run, value) : undefined} />)}</div></div><button type="button" disabled={!run.parentSessionId} onClick={() => onOpenRun(run)}>查看实例<ChevronRight size={14} /></button></div>)}{!runs.length && <p className="mira-workflow-empty">尚无工作流运行记录</p>}{runs.length > 0 && <p className="mira-workflow-history__note">运行记录来自项目的工作流日志，重启后仍然保留；「查看实例」会回到发起它的对话并打开详情。</p>}</div>}
  </section></div>
}
