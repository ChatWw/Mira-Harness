import { buildCronExpression, describeSemanticSchedule, type SemanticSchedule } from '../../../../../src/config/automationSchedule'
import { isModelProviderAvailable, type AutomationTask, type AutomationTaskInput, type AutomationTrigger, type HarnessProject, type HarnessSessionSummary, type ModelProviderSummary, type PermissionConfig, type PermissionMode, type ThinkingLevel } from '../../../../../src/config/harness'

export const AUTOMATION_DRAFT_KEY = 'harness-react-automation-draft'
export const AUTOMATION_FREQUENCIES = [
  ['daily', '每天'], ['workday', '工作日'], ['weekend', '周末'], ['hourly', '每小时'], ['weekly', '每周'], ['monthly', '每月'], ['once', '一次性'], ['event', '会话完成'], ['cron', '自定义 Cron'],
] as const
export type AutomationFrequency = typeof AUTOMATION_FREQUENCIES[number][0]
export interface AutomationForm {
  name: string
  prompt: string
  projectId: string
  modelKey: string
  thinkingLevel: ThinkingLevel
  permissionMode: PermissionMode
  targetType: 'new-session' | 'existing-session'
  sessionId: string
  frequency: AutomationFrequency
  time: string
  interval: number
  weekdays: number[]
  monthlyDay: number | 'last'
  onceAt: string
  expression: string
  validityEnabled: boolean
  validFrom: string
  validUntil: string
  enabled: boolean
  templateId?: string
}
export interface AutomationDraft { taskId?: string; form: AutomationForm; baseline: string }
export interface AutomationCatalogs { projects: HarnessProject[]; sessions: HarnessSessionSummary[]; providers: ModelProviderSummary[]; permission: PermissionConfig }

export function automationModels(providers: ModelProviderSummary[]) {
  return providers.filter(isModelProviderAvailable).flatMap(provider => provider.models.filter(model => model.enabled).map(model => ({ key: JSON.stringify([provider.id, model.id]), providerId: provider.id, modelId: model.id, label: `${provider.name} · ${model.id}`, reasoning: model.reasoning })))
}
export function automationLocalTime(timestamp: number) {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export function newAutomationForm(projects: HarnessProject[], providers: ModelProviderSummary[], now = Date.now()): AutomationForm {
  return { name: '', prompt: '', projectId: projects.find(project => project.directoryExists)?.id || '', modelKey: automationModels(providers)[0]?.key || '', thinkingLevel: 'medium', permissionMode: 'default', targetType: 'new-session', sessionId: '', frequency: 'workday', time: '09:00', interval: 2, weekdays: [1], monthlyDay: 1, onceAt: automationLocalTime(now + 24 * 60 * 60 * 1000), expression: '0 9 * * 1-5', validityEnabled: false, validFrom: '', validUntil: '', enabled: true }
}
export function applyAutomationTrigger(form: AutomationForm, trigger: AutomationTrigger): AutomationForm {
  if (trigger.type === 'once') return { ...form, frequency: 'once', onceAt: automationLocalTime(trigger.scheduledAt) }
  if (trigger.type === 'session-completed') return { ...form, frequency: 'event', targetType: 'new-session', sessionId: '' }
  const [minute, hour, day, month, weekday, extra] = trigger.expression.trim().split(/\s+/)
  let next: AutomationForm = { ...form, frequency: 'cron', expression: trigger.expression }
  if (extra || month !== '*') return next
  if (minute === '0' && /^\*\/\d+$/.test(hour) && day === '*' && weekday === '*') return { ...next, frequency: 'hourly', interval: Number(hour.slice(2)) }
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return next
  next = { ...next, time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` }
  if (day === '*' && weekday === '*') return { ...next, frequency: 'daily' }
  if (day === '*' && weekday === '1-5') return { ...next, frequency: 'workday' }
  if (day === '*' && ['0,6', '6,0'].includes(weekday)) return { ...next, frequency: 'weekend' }
  if (day === '*' && /^\d(?:,\d)*$/.test(weekday)) return { ...next, frequency: 'weekly', weekdays: weekday.split(',').map(value => Number(value) === 7 ? 0 : Number(value)) }
  if (weekday === '*' && (day === 'L' || /^\d+$/.test(day))) return { ...next, frequency: 'monthly', monthlyDay: day === 'L' ? 'last' : Number(day) }
  return next
}
export function automationFormForTask(task: AutomationTask, projects: HarnessProject[], providers: ModelProviderSummary[]): AutomationForm {
  return applyAutomationTrigger({ ...newAutomationForm(projects, providers), name: task.name, prompt: task.prompt, projectId: task.projectId, modelKey: JSON.stringify([task.model.providerId, task.model.modelId]), thinkingLevel: task.model.thinkingLevel ?? 'medium', permissionMode: task.permissionMode, targetType: task.target.type, sessionId: task.target.type === 'existing-session' ? task.target.sessionId : '', validityEnabled: Boolean(task.validFrom || task.validUntil), validFrom: task.validFrom ? automationLocalTime(task.validFrom) : '', validUntil: task.validUntil ? automationLocalTime(task.validUntil) : '', enabled: task.enabled, templateId: task.templateId }, task.trigger)
}
export function automationTriggerForForm(form: AutomationForm, now = Date.now()): AutomationTrigger {
  if (form.frequency === 'event') return { type: 'session-completed' }
  if (form.frequency === 'once') {
    const scheduledAt = new Date(form.onceAt).getTime()
    if (!Number.isFinite(scheduledAt) || scheduledAt <= now) throw new Error('执行时间必须晚于当前时间')
    return { type: 'once', scheduledAt }
  }
  if (form.frequency === 'cron') {
    if (!form.expression.trim()) throw new Error('请填写 Cron 表达式')
    return { type: 'cron', expression: form.expression.trim() }
  }
  const schedule: SemanticSchedule = form.frequency === 'hourly' ? { type: 'hourly', interval: form.interval }
    : form.frequency === 'weekly' ? { type: 'weekly', weekdays: form.weekdays, time: form.time }
    : form.frequency === 'monthly' ? { type: 'monthly', day: form.monthlyDay, time: form.time }
    : { type: 'daily', kind: form.frequency === 'workday' ? 'workday' : form.frequency === 'weekend' ? 'weekend' : 'every', time: form.time }
  return { type: 'cron', expression: buildCronExpression(schedule), humanLabel: describeSemanticSchedule(schedule) }
}
export function automationInputForForm(draft: AutomationDraft, catalogs: AutomationCatalogs, now = Date.now()): AutomationTaskInput {
  const { form } = draft
  if (!form.prompt.trim()) throw new Error('请填写任务指令')
  if (form.prompt.length > 6000) throw new Error('任务指令不能超过 6000 字符')
  if (form.name.length > 80) throw new Error('任务名称不能超过 80 字符')
  const project = catalogs.projects.find(project => project.id === form.projectId)
  if (!project?.directoryExists) throw new Error('请选择可用项目')
  const model = automationModels(catalogs.providers).find(model => model.key === form.modelKey)
  if (!model) throw new Error('请选择可用模型')
  if (form.permissionMode === 'full' && !catalogs.permission.fullAccessEnabled || form.permissionMode === 'auto-approve' && !catalogs.permission.autoApproveEnabled) throw new Error('所选权限未启用')
  const trigger = automationTriggerForForm(form, now)
  const target = trigger.type === 'session-completed' || form.targetType === 'new-session' ? { type: 'new-session' as const } : { type: 'existing-session' as const, sessionId: form.sessionId }
  if (target.type === 'existing-session' && !catalogs.sessions.some(session => session.id === target.sessionId && session.projectId === project.id)) throw new Error('请选择当前项目的未归档聊天')
  const validFrom = form.validityEnabled && form.validFrom ? new Date(form.validFrom).getTime() : undefined
  const validUntil = form.validityEnabled && form.validUntil ? new Date(form.validUntil).getTime() : undefined
  if (form.validityEnabled && (!validUntil || !Number.isFinite(validUntil) || validUntil <= now)) throw new Error('失效时间必须晚于当前时间')
  if (validFrom !== undefined && !Number.isFinite(validFrom)) throw new Error('生效时间无效')
  if (validFrom !== undefined && validUntil !== undefined && validUntil <= validFrom) throw new Error('失效时间必须晚于生效时间')
  return { ...(draft.taskId ? { id: draft.taskId } : {}), name: form.name.trim() || form.prompt.trim().replace(/\s+/g, ' ').slice(0, 20), projectId: project.id, trigger, target, prompt: form.prompt.trim(), model: { providerId: model.providerId, modelId: model.modelId, ...(model.reasoning ? { thinkingLevel: form.thinkingLevel } : {}) }, permissionMode: form.permissionMode, enabled: form.enabled, ...(form.templateId ? { templateId: form.templateId } : {}), ...(validFrom !== undefined ? { validFrom } : {}), ...(validUntil !== undefined ? { validUntil } : {}) }
}
export function readAutomationDraft(value: unknown): AutomationDraft | undefined {
  if (!value || typeof value !== 'object') return
  const draft = value as Partial<AutomationDraft>, form = draft.form
  if (!form || typeof form !== 'object' || typeof draft.baseline !== 'string') return
  for (const field of ['name', 'prompt', 'projectId', 'modelKey', 'sessionId', 'time', 'onceAt', 'expression', 'validFrom', 'validUntil'] as const) if (typeof form[field] !== 'string') return
  if (form.name.length > 80 || form.prompt.length > 6000 || !AUTOMATION_FREQUENCIES.some(([value]) => value === form.frequency) || !['default', 'auto-approve', 'full'].includes(form.permissionMode) || !['off', 'low', 'medium', 'high'].includes(form.thinkingLevel) || !['new-session', 'existing-session'].includes(form.targetType) || !Array.isArray(form.weekdays) || form.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) || typeof form.interval !== 'number' || !Number.isFinite(form.interval) || typeof form.validityEnabled !== 'boolean' || typeof form.enabled !== 'boolean' || form.monthlyDay !== 'last' && (typeof form.monthlyDay !== 'number' || !Number.isInteger(form.monthlyDay)) || draft.taskId !== undefined && typeof draft.taskId !== 'string') return
  return { ...(draft.taskId ? { taskId: draft.taskId } : {}), form: { ...form }, baseline: draft.baseline }
}
