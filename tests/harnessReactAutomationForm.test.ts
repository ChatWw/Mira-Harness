import { describe, expect, it } from 'vitest'
import { DEFAULT_PERMISSION_CONFIG, type AutomationTask, type HarnessProject, type HarnessSessionSummary, type ModelProviderSummary } from '../src/config/harness'
import { applyAutomationTrigger, automationFormForTask, automationInputForForm, automationModels, automationTriggerForForm, newAutomationForm, readAutomationDraft } from '../apps/harness-react/src/components/automations/automation-form'

const now = new Date('2026-10-09T12:00:00').getTime()
const projects: HarnessProject[] = [{ id: 'project', name: 'Project', directory: '/project', directoryExists: true, createdAt: 1, updatedAt: 1 }]
const providers: ModelProviderSummary[] = [{ id: 'provider:one', providerKey: 'custom', name: 'Provider', endpoint: 'http://localhost', enabled: true, authMode: 'api-key', hasApiKey: true, createdAt: 1, updatedAt: 1, models: [{ id: 'model:version', enabled: true, reasoning: true }] }]
const sessions: HarnessSessionSummary[] = [{ id: 'session', title: 'Session', projectId: 'project', createdAt: 1, updatedAt: 1, status: 'active', pinned: false }]
const catalogs = { projects, providers, sessions, permission: DEFAULT_PERMISSION_CONFIG }
const form = () => ({ ...newAutomationForm(projects, providers, now), prompt: '整理项目进展' })

describe('React automation form maps to the existing scheduler contract', () => {
  it('keeps default permission and exact model identifiers when creating a task', () => {
    const value = form(), input = automationInputForForm({ form: value, baseline: JSON.stringify(value) }, catalogs, now)
    expect(input).toMatchObject({ name: '整理项目进展', prompt: '整理项目进展', projectId: 'project', permissionMode: 'default', target: { type: 'new-session' }, model: { providerId: 'provider:one', modelId: 'model:version', thinkingLevel: 'medium' }, enabled: true })
    expect(automationModels(providers)[0].key).toBe(JSON.stringify(['provider:one', 'model:version']))
  })

  it('builds all existing semantic triggers instead of implementing a scheduler', () => {
    const value = form()
    expect(automationTriggerForForm({ ...value, frequency: 'daily', time: '18:45' }, now)).toMatchObject({ type: 'cron', expression: '45 18 * * *' })
    expect(automationTriggerForForm({ ...value, frequency: 'hourly', interval: 3 }, now)).toMatchObject({ expression: '0 */3 * * *' })
    expect(automationTriggerForForm({ ...value, frequency: 'weekly', weekdays: [0, 2], time: '08:00' }, now)).toMatchObject({ expression: '0 8 * * 7,2' })
    expect(automationTriggerForForm({ ...value, frequency: 'monthly', monthlyDay: 'last', time: '10:00' }, now)).toMatchObject({ expression: '0 10 L * *' })
    expect(automationTriggerForForm({ ...value, frequency: 'event' }, now)).toEqual({ type: 'session-completed' })
    expect(() => automationTriggerForForm({ ...value, frequency: 'weekly', weekdays: [] }, now)).toThrow('星期')
    expect(() => automationTriggerForForm({ ...value, frequency: 'once', onceAt: '2020-01-01T00:00' }, now)).toThrow('晚于')
  })

  it('preserves unsupported visual Cron schedules exactly when editing', () => {
    expect(applyAutomationTrigger(form(), { type: 'cron', expression: '*/10 9-17 * 1-6 1-5' })).toMatchObject({ frequency: 'cron', expression: '*/10 9-17 * 1-6 1-5' })
    expect(applyAutomationTrigger(form(), { type: 'cron', expression: '0 12 * * 7,2' })).toMatchObject({ frequency: 'weekly', weekdays: [0, 2], time: '12:00' })
    expect(applyAutomationTrigger(form(), { type: 'cron', expression: '0 */2 * * *' })).toMatchObject({ frequency: 'hourly', interval: 2 })
  })

  it.each(['40 */1 * * *', '44 * * * *', '25 */3 * * *'])('restores hourly minute and interval for %s and saves an equivalent schedule', expression => {
    const restored = applyAutomationTrigger(form(), { type: 'cron', expression })
    const minute = expression.split(' ')[0], interval = expression.includes('*/3') ? 3 : 1
    expect(restored).toMatchObject({ frequency: 'hourly', interval, time: `09:${minute}` })
    const saved = automationTriggerForForm(restored, now)
    expect(saved).toMatchObject({ type: 'cron', expression: `${minute} ${interval === 1 ? '*' : '*/3'} * * *`, humanLabel: `${interval === 1 ? '每小时' : '每 3 小时'}的第 ${minute} 分` })
    expect(applyAutomationTrigger(form(), saved)).toMatchObject({ frequency: 'hourly', interval, time: restored.time })
  })

  it.each([
    { frequency: 'daily', time: '18:45' },
    { frequency: 'workday', time: '08:25' },
    { frequency: 'weekend', time: '10:35' },
    { frequency: 'weekly', weekdays: [0, 2, 4], time: '08:15' },
    { frequency: 'monthly', monthlyDay: 20, time: '10:40' },
    { frequency: 'monthly', monthlyDay: 'last', time: '10:05' },
  ] as const)('preserves the visual schedule after creating and reopening $frequency', patch => {
    const value = { ...form(), ...patch, weekdays: 'weekdays' in patch ? [...patch.weekdays] : form().weekdays }
    const input = automationInputForForm({ form: value, baseline: '' }, catalogs, now)
    const reopened = automationFormForTask({ ...input, id: 'saved', createdAt: now, updatedAt: now, enabled: true }, projects, providers)
    expect(reopened).toMatchObject(patch)
    expect(automationTriggerForForm(reopened, now)).toEqual(input.trigger)
  })

  it('preserves custom repeat rules instead of degrading them to the compatibility Cron', () => {
    const rule = { unit: 'weekly' as const, interval: 2, weekdays: [1, 3], hour: 14, minute: 35, anchorAt: now }
    const trigger = automationTriggerForForm({ ...form(), frequency: 'cron', expression: '35 14 * * *', scheduleRule: rule }, now)
    const restored = applyAutomationTrigger(form(), trigger)
    expect(restored).toMatchObject({ frequency: 'cron', time: '14:35', scheduleRule: rule })
    expect(automationTriggerForForm(restored, now)).toEqual(trigger)
  })

  it('does not escalate existing default permission and retains paused state and reasoning', () => {
    const task = { id: 'task', name: 'Task', prompt: 'Prompt', projectId: 'project', trigger: { type: 'cron', expression: '0 8 * * *' }, target: { type: 'new-session' }, model: { providerId: 'provider:one', modelId: 'model:version', thinkingLevel: 'low' }, permissionMode: 'default', enabled: false, createdAt: 1, updatedAt: 1 } as AutomationTask
    const value = automationFormForTask(task, projects, providers)
    expect(value).toMatchObject({ permissionMode: 'default', enabled: false, thinkingLevel: 'low', frequency: 'daily', time: '08:00' })
    expect(automationInputForForm({ taskId: task.id, form: value, baseline: '' }, catalogs, now)).toMatchObject({ id: 'task', permissionMode: 'default', enabled: false, model: { thinkingLevel: 'low' } })
  })

  it('uses the triggering conversation for session-completed tasks', () => {
    const value = { ...form(), frequency: 'event' as const, targetType: 'existing-session' as const, sessionId: 'wrong-project' }
    expect(automationInputForForm({ form: value, baseline: '' }, catalogs, now).target).toEqual({ type: 'new-session' })
  })

  it('validates real project, model, existing conversation and permission capabilities', () => {
    const draft = { form: form(), baseline: '' }
    expect(() => automationInputForForm(draft, { ...catalogs, projects: [{ ...projects[0], directoryExists: false }] }, now)).toThrow('可用项目')
    expect(() => automationInputForForm(draft, { ...catalogs, providers: [] }, now)).toThrow('可用模型')
    expect(() => automationInputForForm({ ...draft, form: { ...draft.form, targetType: 'existing-session', sessionId: 'wrong' } }, catalogs, now)).toThrow('未归档聊天')
    expect(() => automationInputForForm({ ...draft, form: { ...draft.form, permissionMode: 'full' } }, { ...catalogs, permission: { ...DEFAULT_PERMISSION_CONFIG, fullAccessEnabled: false } }, now)).toThrow('权限未启用')
  })

  it('validates validity bounds and omits disabled validity fields', () => {
    const value = form()
    expect(() => automationInputForForm({ form: { ...value, validityEnabled: true, validFrom: '2026-10-11T09:00', validUntil: '2026-10-10T09:00' }, baseline: '' }, catalogs, now)).toThrow('晚于生效')
    expect(() => automationInputForForm({ form: { ...value, validityEnabled: true }, baseline: '' }, catalogs, now)).toThrow('失效时间')
    const input = automationInputForForm({ form: { ...value, validFrom: 'bad', validUntil: 'bad' }, baseline: '' }, catalogs, now)
    expect(input.validFrom).toBeUndefined(); expect(input.validUntil).toBeUndefined()
  })

  it('restores only structurally valid draft documents', () => {
    const draft = { taskId: 'task', form: form(), baseline: '{}' }
    expect(readAutomationDraft(draft)).toEqual(draft)
    expect(readAutomationDraft({ ...draft, form: { ...draft.form, permissionMode: 'root' } })).toBeUndefined()
    expect(readAutomationDraft({ ...draft, form: { ...draft.form, weekdays: [99] } })).toBeUndefined()
    expect(readAutomationDraft({ ...draft, form: { ...draft.form, frequency: 'phantom' } })).toBeUndefined()
    expect(readAutomationDraft({ ...draft, baseline: undefined })).toBeUndefined()
  })
})
