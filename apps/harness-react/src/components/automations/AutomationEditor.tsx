/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation: full-page task settings, existing Mira scheduler and project/model permissions.
 * Structural reference: ZCode AutomationEditView; license: third-party-licenses/zcode/.
 */
import { useEffect, useState } from 'react'
import { CalendarClock, LoaderCircle, RefreshCw, Save } from 'lucide-react'
import type { HarnessProject, HarnessSessionSummary, ModelProviderSummary, PermissionConfig, PermissionMode, ThinkingLevel } from '../../../../../src/config/harness'
import { formatAutomationTime } from '../../../../../src/pages/frontend/harness/automations/automationPresentation'
import { AUTOMATION_FREQUENCIES, automationModels, automationTriggerForForm, type AutomationForm, type AutomationFrequency } from './automation-form'
import type { AutomationsHost } from './automation-host'

export function AutomationEditor({ host, form, projects, sessions, providers, permission, saving, readOnly, active = true, navigationBusy = false, error, onChange, onSave, onManageModels }: {
  host: AutomationsHost; form: AutomationForm; projects: HarnessProject[]; sessions: HarnessSessionSummary[]; providers: ModelProviderSummary[]; permission: PermissionConfig
  saving: boolean; readOnly: boolean; active?: boolean; navigationBusy?: boolean; error: string; onChange: (form: AutomationForm) => void; onSave: () => void; onManageModels: () => void
}) {
  const [preview, setPreview] = useState<{ state: 'loading' | 'ready' | 'error'; times: number[]; error: string }>({ state: 'loading', times: [], error: '' })
  const [retry, setRetry] = useState(0)
  let trigger: ReturnType<typeof automationTriggerForForm> | undefined, triggerError = ''
  try { trigger = automationTriggerForForm(form) } catch (cause) { triggerError = cause instanceof Error ? cause.message : '触发设置无效' }
  const triggerSignature = JSON.stringify(trigger) || triggerError
  useEffect(() => {
    if (!active) return
    let current = true
    if (!trigger) { setPreview({ state: 'error', times: [], error: triggerError }); return }
    if (trigger.type !== 'cron') { setPreview({ state: 'ready', times: trigger.type === 'once' ? [trigger.scheduledAt] : [], error: '' }); return }
    const expression = trigger.expression
    setPreview({ state: 'loading', times: [], error: '' })
    const timer = window.setTimeout(() => {
      void host.getAutomationNextRuns(expression).then(times => { if (current) setPreview({ state: 'ready', times, error: '' }) }, cause => { if (current) setPreview({ state: 'error', times: [], error: cause instanceof Error ? cause.message : '无法计算下次运行时间' }) })
    }, 160)
    return () => { current = false; window.clearTimeout(timer) }
  }, [host, triggerSignature, active, retry])
  const models = automationModels(providers), model = models.find(model => model.key === form.modelKey)
  const disabled = saving || readOnly || !active || navigationBusy
  const change = <K extends keyof AutomationForm>(key: K, value: AutomationForm[K]) => onChange({ ...form, [key]: value })
  const projectSessions = sessions.filter(session => session.projectId === form.projectId)
  return <form className="mira-automation-editor" onSubmit={event => { event.preventDefault(); if (!disabled && preview.state === 'ready') onSave() }}>
    {readOnly && <p className="mira-automation-notice" role="status">任务已结束，设置仅供查看。</p>}
    {error && <p className="mira-automation-error" role="alert">{error}</p>}
    <fieldset disabled={disabled}>
      <label className="mira-automation-field"><span>任务名称</span><input aria-label="任务名称" value={form.name} maxLength={80} placeholder="例如：每日项目进展总结" onChange={event => change('name', event.target.value)} /></label>
      <label className="mira-automation-field mira-automation-instructions"><span>任务指令 <small>{form.prompt.length}/6000</small></span><textarea aria-label="任务指令" value={form.prompt} maxLength={6000} rows={6} placeholder="描述每次运行需要完成的任务" onChange={event => change('prompt', event.target.value)} /></label>
      <section className="mira-automation-editor-section" aria-label="运行计划"><h2>运行计划</h2><div className="mira-automation-form-columns">
        <label className="mira-automation-field"><span>频率</span><select aria-label="运行频率" value={form.frequency} onChange={event => onChange({ ...form, frequency: event.target.value as AutomationFrequency, ...(event.target.value === 'event' ? { targetType: 'new-session', sessionId: '' } : {}) })}>{AUTOMATION_FREQUENCIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {['daily', 'workday', 'weekend', 'weekly', 'monthly'].includes(form.frequency) && <label className="mira-automation-field"><span>时间（本机时区）</span><input type="time" aria-label="运行时间" value={form.time} onChange={event => change('time', event.target.value)} /></label>}
        {form.frequency === 'hourly' && <label className="mira-automation-field"><span>间隔小时数</span><input type="number" min={1} max={24} aria-label="间隔小时数" value={form.interval} onChange={event => change('interval', Number(event.target.value))} /></label>}
        {form.frequency === 'once' && <label className="mira-automation-field"><span>执行时间（本机时区）</span><input type="datetime-local" aria-label="一次性执行时间" value={form.onceAt} onChange={event => change('onceAt', event.target.value)} /></label>}
        {form.frequency === 'monthly' && <label className="mira-automation-field"><span>每月日期</span><select aria-label="每月日期" value={form.monthlyDay} onChange={event => change('monthlyDay', event.target.value === 'last' ? 'last' : Number(event.target.value))}>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} 日</option>)}<option value="last">最后一天</option></select></label>}
      </div>
      {form.frequency === 'weekly' && <div className="mira-automation-weekdays" role="group" aria-label="运行星期">{[[1, '一'], [2, '二'], [3, '三'], [4, '四'], [5, '五'], [6, '六'], [0, '日']].map(([value, label]) => <button key={value} type="button" aria-label={`周${label}`} aria-pressed={form.weekdays.includes(Number(value))} onClick={() => change('weekdays', form.weekdays.includes(Number(value)) ? form.weekdays.filter(day => day !== value) : [...form.weekdays, Number(value)].sort())}>{label}</button>)}</div>}
      {form.frequency === 'cron' && <label className="mira-automation-field"><span>Cron 表达式</span><input aria-label="Cron 表达式" className="mira-automation-cron" spellCheck={false} value={form.expression} placeholder="0 9 * * 1-5" onChange={event => change('expression', event.target.value)} /></label>}
      <div className="mira-automation-preview" role="status" data-status={preview.state}><CalendarClock size={16} /><div>{form.frequency === 'event' ? <span>人工聊天完成后触发，结果写回触发聊天</span> : preview.state === 'loading' ? <span>正在计算下次运行时间…</span> : preview.error ? <span>{preview.error}</span> : <span>{preview.times[0] ? `下次运行：${formatAutomationTime(preview.times[0])}` : '调度已验证，当前没有未来执行时间'}</span>}{preview.times.length > 1 && <small>{preview.times.slice(1, 3).map(time => formatAutomationTime(time)).join(' · ')}</small>}</div>{preview.state === 'error' && form.frequency === 'cron' && <button type="button" className="mira-automation-icon" aria-label="重试运行时间预览" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} /></button>}</div>
      <label className="mira-automation-checkbox"><input type="checkbox" aria-label="限制有效期" checked={form.validityEnabled} onChange={event => change('validityEnabled', event.target.checked)} />限制有效期</label>
      {form.validityEnabled && <div className="mira-automation-form-columns"><label className="mira-automation-field"><span>生效时间</span><input type="datetime-local" aria-label="生效时间" value={form.validFrom} onChange={event => change('validFrom', event.target.value)} /></label><label className="mira-automation-field"><span>失效时间</span><input type="datetime-local" aria-label="失效时间" value={form.validUntil} onChange={event => change('validUntil', event.target.value)} /></label></div>}
      </section>
      <section className="mira-automation-editor-section" aria-label="运行设置"><h2>运行设置</h2><div className="mira-automation-form-columns">
        <label className="mira-automation-field"><span>项目</span><select aria-label="自动化项目" value={form.projectId} onChange={event => onChange({ ...form, projectId: event.target.value, sessionId: '' })}><option value="" disabled>选择项目</option>{projects.map(project => <option key={project.id} value={project.id} disabled={!project.directoryExists}>{project.name}{!project.directoryExists ? '（目录不可用）' : ''}</option>)}</select></label>
        <label className="mira-automation-field"><span>运行于</span><select aria-label="运行目标" value={form.frequency === 'event' ? 'event' : form.targetType} disabled={disabled || form.frequency === 'event'} onChange={event => onChange({ ...form, targetType: event.target.value as AutomationForm['targetType'], sessionId: '' })}>{form.frequency === 'event' ? <option value="event">触发聊天</option> : <><option value="new-session">新聊天</option><option value="existing-session">现有聊天</option></>}</select></label>
        {form.targetType === 'existing-session' && form.frequency !== 'event' && <label className="mira-automation-field mira-automation-field--wide"><span>现有聊天</span><select aria-label="自动化现有聊天" value={form.sessionId} onChange={event => change('sessionId', event.target.value)}><option value="" disabled>选择当前项目的聊天</option>{projectSessions.map(session => <option key={session.id} value={session.id}>{session.title}</option>)}</select></label>}
        <label className="mira-automation-field"><span>模型</span><select aria-label="自动化模型" value={form.modelKey} onChange={event => change('modelKey', event.target.value)}><option value="" disabled>选择模型</option>{models.map(model => <option key={model.key} value={model.key}>{model.label}</option>)}</select>{!models.length && <button type="button" className="mira-automation-inline" onClick={onManageModels}>配置模型</button>}</label>
        {model?.reasoning && <label className="mira-automation-field"><span>推理强度</span><select aria-label="自动化推理强度" value={form.thinkingLevel} onChange={event => change('thinkingLevel', event.target.value as ThinkingLevel)}><option value="off">关闭</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>}
        <label className="mira-automation-field"><span>权限</span><select aria-label="自动化权限" value={form.permissionMode} onChange={event => change('permissionMode', event.target.value as PermissionMode)}><option value="default">默认（只读工具）</option><option value="auto-approve" disabled={!permission.autoApproveEnabled}>自动审核</option><option value="full" disabled={!permission.fullAccessEnabled}>完全访问</option></select></label>
      </div><p className="mira-automation-permission-note">{form.permissionMode === 'default' ? '无人值守运行仅允许只读工具。' : form.permissionMode === 'full' ? '完全访问允许修改文件和执行命令；危险操作仍由底层策略拦截。' : '自动审核沿用平台策略；需要人工审批的操作不会自动获得许可。'}</p></section>
      <label className="mira-automation-checkbox"><input type="checkbox" aria-label="保存后启用自动化" checked={form.enabled} onChange={event => change('enabled', event.target.checked)} />启用自动化</label>
    </fieldset>
    {!readOnly && <footer className="mira-automation-editor-footer"><button type="submit" className="mira-automation-primary" aria-label="保存自动化" disabled={disabled || preview.state !== 'ready' || !form.prompt.trim() || !form.projectId || !model}>{saving ? <LoaderCircle size={15} className="mira-automation-spin" /> : <Save size={15} />}{saving ? '正在保存…' : '保存任务'}</button></footer>}
  </form>
}
