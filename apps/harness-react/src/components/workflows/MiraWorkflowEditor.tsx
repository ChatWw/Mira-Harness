/* Definition editor structure adapted from ZCode SavedWorkflowMetaForm/ArgsTable.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, Check, Save } from 'lucide-react'
import type { MiraWorkflowDocument, MiraWorkflowPreview, MiraWorkflowScope, MiraWorkflowWrite } from '../../../../../src/config/miraWorkflows'
import { validateMiraWorkflowMeta } from '../../../../../src/config/miraWorkflows'
import type { HarnessProject } from '../../../../../src/config/harness'
import { workflowError, type MiraWorkflowHost } from './workflow-model'

const starterScript = 'const worker = agent("worker");\nphase("处理任务");\nconst result = await worker.ask(String(args.task));\nreport(result);\nreturn result;'
export function MiraWorkflowEditor({ host, document, projectId, initialScope, projects, onBack, onSaved }: {
  host: MiraWorkflowHost; document?: MiraWorkflowDocument; projectId?: string; initialScope?: MiraWorkflowScope; projects: HarnessProject[]; onBack: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(document?.name ?? ''), [scope, setScope] = useState<MiraWorkflowScope>(document?.scope ?? initialScope ?? 'project')
  const [target, setTarget] = useState(projectId ?? projects[0]?.id ?? '')
  const [description, setDescription] = useState(document?.meta.description ?? ''), [whenToUse, setWhenToUse] = useState(document?.meta.whenToUse ?? '')
  const [args, setArgs] = useState(JSON.stringify(document?.meta.args ?? { task: { type: 'string', description: '本次任务', required: true } }, null, 2))
  const [script, setScript] = useState(document?.script ?? starterScript)
  const [revision, setRevision] = useState(document?.revision), [busy, setBusy] = useState(false), [error, setError] = useState(''), [feedback, setFeedback] = useState('')
  const locked = useRef(false), editVersion = useRef(0)
  const [discard, setDiscard] = useState(false)
  const value = JSON.stringify([name, scope, target, description, whenToUse, args, script])
  const baseline = useRef(value)
  const edited = () => { editVersion.current++; setFeedback(''); setError('') }
  async function submit(save: boolean) {
    if (locked.current) return
    locked.current = true; setBusy(true); setError(''); setFeedback('')
    const version = editVersion.current
    try {
      const meta = { description, ...(whenToUse.trim() ? { whenToUse } : {}), args: JSON.parse(args) }
      validateMiraWorkflowMeta(meta)
      if (scope === 'project' && !target) throw new Error('请选择保存项目')
      const input: MiraWorkflowWrite = { scope, name, meta, script, ...(revision ? { expectedRevision: revision } : {}) }
      const result = await host.requestWorkflow<MiraWorkflowPreview>({ action: 'definitions.preview', ...(scope === 'project' && target ? { projectId: target } : {}), input })
      if (version !== editVersion.current) return
      if (save) {
        const saved = await host.requestWorkflow<MiraWorkflowDocument>({ action: 'definitions.save', ...(scope === 'project' && target ? { projectId: target } : {}), input })
        setRevision(saved.revision); baseline.current = value; setFeedback('工作流已保存'); onSaved()
      }
      else setFeedback(`工作流检查通过${result.shadowing ? '；此名称存在项目与全局覆盖关系' : ''}`)
    } catch (cause) { if (version === editVersion.current) setError(workflowError(cause)) }
    finally { locked.current = false; setBusy(false) }
  }
  return <section className="mira-workflow-editor" aria-label="工作流编辑器"><header className="mira-workflow-editor__head"><button type="button" className="mira-automation-secondary" disabled={busy} onClick={() => { if (value !== baseline.current) setDiscard(true); else onBack() }}><ArrowLeft size={15} />返回工作流</button><h2>{document ? `编辑 ${document.name}` : '新建工作流'}</h2><span /><button type="button" className="mira-automation-secondary" disabled={busy} onClick={() => void submit(false)}><Check size={14} />检查工作流</button><button type="button" className="mira-automation-primary" disabled={busy} onClick={() => void submit(true)}><Save size={14} />{busy ? '处理中…' : '保存工作流'}</button></header>
    <div className="mira-workflow-editor__columns"><div className="mira-workflow-form"><label>名称<input aria-label="工作流名称" value={name} disabled={busy || Boolean(document) || Boolean(revision)} placeholder="research-notes" onChange={event => { edited(); setName(event.target.value) }} /></label><div className="mira-workflow-fields"><label>作用域<select aria-label="工作流作用域" disabled={busy || Boolean(revision)} value={scope} onChange={event => { edited(); setScope(event.target.value as MiraWorkflowScope) }}><option value="project">项目</option><option value="global">全局</option></select></label>{scope === 'project' && <label>所属项目<select aria-label="工作流保存项目" disabled={busy || Boolean(revision)} value={target} onChange={event => { edited(); setTarget(event.target.value) }}><option value="">选择项目</option>{projects.filter(project => project.directoryExists).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}</div><label>说明<textarea aria-label="工作流说明" disabled={busy} value={description} onChange={event => { edited(); setDescription(event.target.value) }} rows={3} /></label><label>适用场景<textarea aria-label="工作流适用场景" disabled={busy} value={whenToUse} onChange={event => { edited(); setWhenToUse(event.target.value) }} rows={2} /></label><label>参数声明（JSON）<small>type 支持 string、number、boolean、json；可设置 required、default、description。</small><textarea className="mira-workflow-code" aria-label="工作流参数声明" disabled={busy} value={args} onChange={event => { edited(); setArgs(event.target.value) }} rows={12} spellCheck={false} /></label></div>
    <label className="mira-workflow-script">TypeScript 源码<small>使用 agent、phase、report、world 等工作流能力；args 提供运行参数。</small><textarea className="mira-workflow-code" aria-label="工作流源码" disabled={busy} value={script} onChange={event => { edited(); setScript(event.target.value) }} spellCheck={false} /></label></div>
    {error && <p className="mira-automation-error" role="alert">{error}</p>}{feedback && <p className="mira-workflow-feedback" role="status">{feedback}</p>}
    <Dialog.Root open={discard} onOpenChange={setDiscard}><Dialog.Portal container={globalThis.document.getElementById('root')}><Dialog.Overlay className="mira-automation-dialog-overlay" /><Dialog.Content className="mira-automation-dialog"><Dialog.Title>放弃工作流修改？</Dialog.Title><Dialog.Description>当前代码和配置尚未保存。继续编辑可以保留这些修改。</Dialog.Description><div className="mira-automation-dialog-actions"><button type="button" className="mira-automation-secondary" onClick={() => setDiscard(false)}>继续编辑</button><button type="button" className="mira-automation-danger" onClick={onBack}>放弃修改并返回</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>
}
