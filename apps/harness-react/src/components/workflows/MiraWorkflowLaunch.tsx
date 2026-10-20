/* Launch interaction adapted from ZCode SavedWorkflowLaunchDialog/useSavedWorkflowLauncher.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Info, LoaderCircle, Play, Workflow, X } from 'lucide-react'
import { AutomationSelect } from '../automations/AutomationControls'
import type { HarnessProject, ModelProviderSummary } from '../../../../../src/config/harness'
import type { MiraWorkflowDocument } from '../../../../../src/config/miraWorkflows'
import { validateMiraWorkflowArgs } from '../../../../../src/config/miraWorkflows'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import { workflowError, workflowModels, type MiraWorkflowHost } from './workflow-model'

export function MiraWorkflowLaunch({ host, document, projects, providers, projectId, onClose, onAccepted, onManageModels }: {
  host: MiraWorkflowHost; document: MiraWorkflowDocument; projects: HarnessProject[]; providers: ModelProviderSummary[]; projectId?: string
  onClose: () => void; onAccepted: (identity: MiraFlowRunIdentity) => Promise<void>; onManageModels: () => void
}) {
  const available = projects.filter(project => project.directoryExists), models = workflowModels(providers)
  const [target, setTarget] = useState(projectId || available[0]?.id || '')
  const [model, setModel] = useState(models[0]?.value || '')
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(document.meta.args ?? {}).map(([name, spec]) => [name, spec.default === undefined ? '' : spec.type === 'string' ? String(spec.default) : JSON.stringify(spec.default)])))
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const [localErrors, setLocalErrors] = useState<string[]>([])
  const [accepted, setAccepted] = useState<MiraFlowRunIdentity>()
  const inFlight = useRef(false)
  function parseArguments(input: Record<string, string>) {
    const args: Record<string, unknown> = {}
    for (const [name, spec] of Object.entries(document.meta.args ?? {})) {
      const value = input[name] ?? ''
      if (!value.length) continue
      try { args[name] = spec.type === 'string' ? value : spec.type === 'number' ? Number(value) : JSON.parse(value) }
      catch { return { ok: false as const, errors: [`参数 ${name} 需要有效的 ${spec.type === 'json' ? 'JSON' : '布尔值'}`] } }
    }
    return validateMiraWorkflowArgs(document.meta.args, args)
  }
  function changeArgument(name: string, value: string) {
    const next = { ...values, [name]: value }
    setValues(next)
    if (localErrors.length) {
      const validation = parseArguments(next)
      setLocalErrors(validation.ok ? [] : validation.errors)
    }
  }
  async function launch() {
    if (inFlight.current) return
    setError('')
    const selection = models.find(item => item.value === model)?.selection
    if (!selection || !available.some(project => project.id === target)) { setError('请选择可用的项目和模型'); return }
    try {
      const validation = parseArguments(values)
      if (!validation.ok) { setLocalErrors(validation.errors); return }
      setLocalErrors([])
      inFlight.current = true; setPending(true)
      const identity = accepted ?? await host.requestWorkflow<MiraFlowRunIdentity>({ action: 'runs.start', projectId: target, name: document.name, scope: document.scope, revision: document.revision, args: validation.args, selection })
      setAccepted(identity)
      // Navigate only after the host accepted a real run. Rejection leaves every input intact.
      await onAccepted(identity)
      onClose()
    } catch (cause) { setError(workflowError(cause)) }
    finally { inFlight.current = false; setPending(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !pending) onClose() }}><Dialog.Portal container={globalThis.document.getElementById('root')}><Dialog.Overlay className="mira-automation-dialog-overlay mira-workflow-dialog-overlay" /><Dialog.Content className="mira-automation-dialog mira-workflow-launch" onEscapeKeyDown={event => { if (pending) event.preventDefault() }} onInteractOutside={event => { if (pending) event.preventDefault() }}>
    <Dialog.Title className="mira-workflow-launch__title"><Workflow size={16} aria-hidden="true" /><span>{document.name}</span><small>{document.scope === 'global' ? '全局' : '项目'}</small></Dialog.Title><Dialog.Description>{document.meta.description}</Dialog.Description>
    <form onSubmit={event => { event.preventDefault(); void launch() }}>
      {document.scope === 'global' && <div className="mira-workflow-launch__field"><span>运行于</span><AutomationSelect label="工作流运行项目" value={target} disabled={pending || Boolean(accepted)} options={available.map(project => ({ value: project.id, label: project.name }))} onChange={setTarget} /></div>}
      <div className="mira-workflow-launch__field"><span>模型</span><AutomationSelect label="工作流运行模型" value={model} disabled={pending || Boolean(accepted)} options={models.map(item => ({ value: item.value, label: item.label }))} onChange={setModel} /></div>
      {!models.length && <button type="button" className="mira-automation-secondary" onClick={onManageModels}>配置模型</button>}
      {Object.entries(document.meta.args ?? {}).map(([name, spec]) => <label key={name}>{name}{spec.required && ' *'}<small>{spec.description || spec.type}</small>{spec.type === 'boolean' ? <span className="mira-automation-switch"><input type="checkbox" aria-label={`工作流参数 ${name}`} checked={values[name] === 'true'} disabled={pending || Boolean(accepted)} onChange={event => changeArgument(name, String(event.target.checked))} /><span /></span> : spec.type === 'json' ? <textarea aria-label={`工作流参数 ${name}`} value={values[name] ?? ''} disabled={pending || Boolean(accepted)} onChange={event => changeArgument(name, event.target.value)} rows={4} /> : <input aria-label={`工作流参数 ${name}`} value={values[name] ?? ''} disabled={pending || Boolean(accepted)} onChange={event => changeArgument(name, event.target.value)} />}</label>)}
      <div className="mira-workflow-launch__note"><Info size={16} aria-hidden="true" /><span>将立即在 {available.find(project => project.id === target)?.name || '所选项目'} 的新会话中运行。</span></div>
      {localErrors.length > 0 && <p className="mira-automation-error" role="alert">{localErrors.join('\n')}</p>}{accepted && <p className="mira-workflow-feedback" role="status">工作流已经启动，请打开已创建的会话。</p>}{error && <p className="mira-automation-error" role="alert">{error}</p>}<div className="mira-automation-dialog-actions"><button type="button" className="mira-automation-secondary" disabled={pending} onClick={onClose}>{accepted ? '关闭' : '取消'}</button><button type="submit" className="mira-automation-primary" disabled={pending || !target || !model}><span aria-hidden="true">{pending ? <LoaderCircle size={14} className="pilot-spin" /> : <Play size={14} />}</span>{pending ? accepted ? '正在打开…' : '正在启动…' : accepted ? '打开已启动会话' : '启动工作流'}</button></div>
    </form><Dialog.Close asChild><button className="mira-automation-icon mira-automation-dialog-close" type="button" disabled={pending} aria-label="关闭运行工作流"><X size={16} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
