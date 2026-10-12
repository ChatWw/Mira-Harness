/* Launch interaction adapted from ZCode SavedWorkflowLaunchDialog/useSavedWorkflowLauncher.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Play, X } from 'lucide-react'
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
  return <Dialog.Root open onOpenChange={open => { if (!open && !pending) onClose() }}><Dialog.Portal container={globalThis.document.getElementById('root')}><Dialog.Overlay className="mira-automation-dialog-overlay" /><Dialog.Content className="mira-automation-dialog mira-workflow-launch" onEscapeKeyDown={event => { if (pending) event.preventDefault() }} onInteractOutside={event => { if (pending) event.preventDefault() }}>
    <Dialog.Title>运行 {document.name}</Dialog.Title><Dialog.Description>{document.meta.description}。在所选项目启动独立会话，沿用工作流保存的代码。</Dialog.Description>
    <form onSubmit={event => { event.preventDefault(); void launch() }}><label>运行于<select aria-label="工作流运行项目" value={target} disabled={pending || Boolean(accepted) || document.scope === 'project'} onChange={event => setTarget(event.target.value)}><option value="">选择项目</option>{available.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label>模型<select aria-label="工作流运行模型" value={model} disabled={pending || Boolean(accepted)} onChange={event => setModel(event.target.value)}><option value="">选择模型</option>{models.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      {!models.length && <button type="button" className="mira-automation-secondary" onClick={onManageModels}>配置模型</button>}
      {Object.entries(document.meta.args ?? {}).map(([name, spec]) => <label key={name}>{name}{spec.required && ' *'}<small>{spec.description || spec.type}</small>{spec.type === 'boolean' ? <select aria-label={`工作流参数 ${name}`} value={values[name] ?? ''} disabled={pending || Boolean(accepted)} onChange={event => changeArgument(name, event.target.value)}><option value="">使用默认值</option><option value="true">是</option><option value="false">否</option></select> : <input aria-label={`工作流参数 ${name}`} value={values[name] ?? ''} disabled={pending || Boolean(accepted)} onChange={event => changeArgument(name, event.target.value)} placeholder={spec.type === 'json' ? 'JSON 值' : undefined} />}</label>)}
      {localErrors.length > 0 && <p className="mira-automation-error" role="alert">{localErrors.join('\n')}</p>}{accepted && <p className="mira-workflow-feedback" role="status">工作流已经启动，请打开已创建的会话。</p>}{error && <p className="mira-automation-error" role="alert">{error}</p>}<div className="mira-automation-dialog-actions"><button type="button" className="mira-automation-secondary" disabled={pending} onClick={onClose}>{accepted ? '关闭' : '取消'}</button><button type="submit" className="mira-automation-primary" disabled={pending || !target || !model}><Play size={14} />{pending ? accepted ? '正在打开…' : '正在启动…' : accepted ? '打开已启动会话' : '启动工作流'}</button></div>
    </form><Dialog.Close asChild><button className="mira-automation-icon mira-automation-dialog-close" type="button" disabled={pending} aria-label="关闭运行工作流"><X size={16} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
