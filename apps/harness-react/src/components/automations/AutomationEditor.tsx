/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation: full-page task settings, existing Mira scheduler and project/model permissions.
 * Structural reference: ZCode AutomationEditView; license: third-party-licenses/zcode/.
 */
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AutomationSelect } from './AutomationControls'
import { AutomationComposerToolbar } from './AutomationComposerToolbar'
import { AutomationSchedule } from './AutomationSchedule'
import type { HarnessProject, HarnessSessionSummary, ModelProviderSummary, PermissionConfig } from '../../../../../src/config/harness'
import { formatAutomationTime } from '../../../../../src/pages/frontend/harness/automations/automationPresentation'
import { automationModels, automationTriggerForForm, type AutomationForm } from './automation-form'
import type { AutomationsHost } from './automation-host'

export function AutomationEditor({ host, form, projects, sessions, providers, permission, saving, readOnly, active = true, navigationBusy = false, error, onChange, onSave, onManageModels, taskId, onReady }: {
  host: AutomationsHost; form: AutomationForm; projects: HarnessProject[]; sessions: HarnessSessionSummary[]; providers: ModelProviderSummary[]; permission: PermissionConfig
  taskId?: string; onReady?: (ready: boolean) => void; saving: boolean; readOnly: boolean; active?: boolean; navigationBusy?: boolean; error: string; onChange: (form: AutomationForm) => void; onSave: () => void; onManageModels: () => void
}) {
  const [preview, setPreview] = useState<{ state: 'loading' | 'ready' | 'error'; times: number[]; error: string }>({ state: 'loading', times: [], error: '' })
  const [retry, setRetry] = useState(0)
  let trigger: ReturnType<typeof automationTriggerForForm> | undefined, triggerError = ''
  try { trigger = automationTriggerForForm(form) } catch (cause) { triggerError = cause instanceof Error ? cause.message : '触发设置无效' }
  const scheduleRemoved = form.frequency === 'cron' && !form.expression.trim() && !form.scheduleRule
  const triggerSignature = JSON.stringify(trigger) || triggerError
  useEffect(() => {
    if (!active) return
    let current = true
    if (!trigger) { setPreview({ state: 'error', times: [], error: scheduleRemoved ? '' : triggerError }); return }
    if (trigger.type !== 'cron') { setPreview({ state: 'ready', times: trigger.type === 'once' ? [trigger.scheduledAt] : [], error: '' }); return }
    const expression = trigger.expression
    setPreview({ state: 'loading', times: [], error: '' })
    const timer = window.setTimeout(() => {
      void host.getAutomationNextRuns(expression, trigger?.type === 'cron' ? trigger.scheduleRule : undefined).then(times => { if (current) setPreview({ state: 'ready', times, error: '' }) }, cause => { if (current) setPreview({ state: 'error', times: [], error: cause instanceof Error ? cause.message : '无法计算下次运行时间' }) })
    }, 160)
    return () => { current = false; window.clearTimeout(timer) }
  }, [host, triggerSignature, active, retry])
  const models = automationModels(providers), model = models.find(model => model.key === form.modelKey)
  const disabled = saving || readOnly || !active || navigationBusy
  const change = <K extends keyof AutomationForm>(key: K, value: AutomationForm[K]) => onChange({ ...form, [key]: value })
  const projectSessions = sessions.filter(session => session.projectId === form.projectId)
  const ready = !disabled && preview.state === 'ready' && Boolean(form.name.trim() && form.prompt.trim() && form.projectId && model)
  useEffect(() => { onReady?.(ready); return () => onReady?.(false) }, [ready, onReady])
  return <form id="automation-edit-form" className="mira-automation-editor" onSubmit={event => { event.preventDefault(); if (ready) onSave() }}>
    {readOnly && <p className="mira-automation-notice" role="status">任务已结束，设置仅供查看。</p>}
    {error && <p className="mira-automation-error" role="alert">{error}</p>}
    <fieldset disabled={disabled}>
      {taskId && <div className="mira-automation-field"><span>状态</span><span className="mira-automation-edit-status"><span aria-hidden="true"><i data-enabled={form.enabled && !readOnly} /></span>{readOnly ? '已结束' : form.enabled ? '运行中' : '已暂停'}</span></div>}
      <label className="mira-automation-field"><span>任务标题</span><input aria-label="任务名称" value={form.name} maxLength={80} placeholder="为任务起个名字" onChange={event => change('name', event.target.value)} /></label>
      <AutomationSchedule disabled={disabled} form={form} onChange={onChange} />
      {preview.state === 'error' && preview.error && <div className="mira-automation-error" role="alert">{preview.error}<button type="button" aria-label="重试运行时间预览" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} /></button></div>}
      <div className="mira-automation-field"><span>指令</span><div className="mira-automation-instructions-composer"><textarea aria-label="任务指令" value={form.prompt} maxLength={6000} placeholder="描述你希望 Mira 自动执行的任务…" onChange={event => change('prompt', event.target.value)} /><AutomationComposerToolbar form={form} projects={projects} providers={providers} permission={permission} disabled={disabled} taskId={taskId} onChange={onChange} onManageModels={onManageModels} /></div></div>
      {form.targetType === 'existing-session' && <label className="mira-automation-field"><span>运行于现有聊天</span><AutomationSelect label="自动化现有聊天" value={form.sessionId} options={projectSessions.map(session => ({ value: session.id, label: session.title }))} onChange={value => change('sessionId', value)} /></label>}
      {form.validityEnabled && <p className="mira-automation-permission-note">有效期：{form.validFrom || '立即生效'} 至 {form.validUntil}</p>}
    </fieldset>
    <span className="mira-automation-sr-only" role="status">{preview.state === 'loading' ? '正在计算下次运行时间…' : preview.times[0] ? `下次运行：${formatAutomationTime(preview.times[0])}` : ''}</span>
  </form>
}
