import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PERMISSION_CONFIG, type AutomationRun, type AutomationTask, type HarnessProject, type HarnessSessionSummary, type ModelProviderSummary } from '../src/config/harness'
import { AutomationsView, type AutomationsHost } from '../apps/harness-react/src/components/automations/AutomationsView'
import { AutomationEditor } from '../apps/harness-react/src/components/automations/AutomationEditor'
import { AutomationRunHistory } from '../apps/harness-react/src/components/automations/AutomationRunHistory'
import { AUTOMATION_DRAFT_KEY, type AutomationForm } from '../apps/harness-react/src/components/automations/automation-form'

const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true } }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))
const project: HarnessProject = { id: 'project', name: '项目', directory: '/project', directoryExists: true, createdAt: 1, updatedAt: 1 }
const session: HarnessSessionSummary = { id: 'session', title: '聊天', projectId: 'project', createdAt: 1, updatedAt: 1, status: 'active', pinned: false }
const provider: ModelProviderSummary = { id: 'provider', providerKey: 'custom', name: 'Provider', endpoint: 'http://localhost', enabled: true, authMode: 'api-key', hasApiKey: true, createdAt: 1, updatedAt: 1, models: [{ id: 'model', enabled: true, reasoning: true }] }
const task: AutomationTask = { id: 'task', name: '每日总结', prompt: '整理项目进展', projectId: project.id, trigger: { type: 'cron', expression: '0 9 * * *', humanLabel: '每天 09:00' }, target: { type: 'new-session' }, model: { providerId: provider.id, modelId: 'model' }, permissionMode: 'default', enabled: true, createdAt: 1, updatedAt: 1 }
const run = (status: AutomationRun['status'] = 'failed'): AutomationRun => ({ id: 'run', taskId: task.id, source: 'manual', status, startedAt: 1, sessionId: session.id, sessionAvailable: true, snapshot: { prompt: task.prompt, model: task.model, permissionMode: task.permissionMode }, ...(status === 'failed' ? { error: '网络错误' } : {}) })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function fixture() {
  let tasks = [{ ...task }], runs: Record<string, AutomationRun[]> = { [task.id]: [] }, stored: unknown = null
  let navigation: (() => Promise<void> | void) | undefined
  const host = {
    listAutomationTasks: vi.fn(async () => tasks), getAutomationOverview: vi.fn(async () => ({ enabledCount: tasks.filter(task => task.enabled).length, runningCount: Object.values(runs).flat().filter(run => run.status === 'running').length, failedLastDayCount: 0 })), getAutomationNextRuns: vi.fn(async () => [Date.now() + 10000]), getHarnessPermissionConfig: vi.fn(async () => DEFAULT_PERMISSION_CONFIG),
    saveAutomationTask: vi.fn(async input => { const saved = { ...input, id: input.id || 'created', enabled: input.enabled ?? true, createdAt: 1, updatedAt: 2 } as AutomationTask; tasks = [saved, ...tasks.filter(task => task.id !== saved.id)]; return saved }),
    setAutomationTaskEnabled: vi.fn(async (id, enabled) => { const saved = { ...tasks.find(task => task.id === id)!, enabled }; tasks = tasks.map(task => task.id === id ? saved : task); return saved }),
    deleteAutomationTask: vi.fn(async id => { tasks = tasks.filter(task => task.id !== id); delete runs[id] }),
    listAutomationRuns: vi.fn(async id => runs[id] || []),
    runAutomationNow: vi.fn(async id => { const result = { ...run('running'), taskId: id, id: 'launched' }; runs[id] = [result, ...(runs[id] || [])]; return result }),
    retryAutomationRun: vi.fn(async () => { const result = { ...run('running'), id: 'retry', retriedFrom: 'run' }; runs[task.id] = [result, ...(runs[task.id] || [])]; return result }),
    abortAutomationRun: vi.fn(async id => { runs[id] = runs[id].map(run => run.status === 'running' ? { ...run, status: 'interrupted' } : run) }),
    getPreference: vi.fn(async () => stored), setPreference: vi.fn(async (_key, value) => { stored = value }), registerBeforeNavigation: vi.fn(callback => { navigation = callback; return () => { navigation = undefined } }),
  } satisfies AutomationsHost
  return { host, setRuns: (value: AutomationRun[]) => { runs[task.id] = value }, navigation: () => navigation?.(), setStored: (value: unknown) => { stored = value }, stored: () => stored }
}
function visit(node: React.ReactNode, callback: (element: React.ReactElement<Record<string, any>>) => void) {
  if (Array.isArray(node)) return node.forEach(child => visit(child, callback))
  if (!React.isValidElement<Record<string, any>>(node)) return
  callback(node); visit(node.props.children, callback)
}
function mount(host: AutomationsHost) {
  let tree: React.ReactElement, live = true, active = true
  const onOpenSession = vi.fn(async () => undefined), onManageModels = vi.fn()
  const render = () => { hooks.cursor = 0; hooks.dirty = false; tree = AutomationsView({ host, projects: [project], sessions: [session], providers: [provider], onOpenSession, onManageModels, active }); hooks.effects.splice(0).forEach(effect => effect()) }
  const drain = async () => { for (let i = 0; i < 50; i++) { await Promise.resolve(); if (hooks.dirty && live) render() } }
  const matches = (predicate: (props: Record<string, any>, element: React.ReactElement) => boolean) => { const result: Record<string, any>[] = []; visit(tree, element => { if (predicate(element.props, element)) result.push(element.props) }); return result }
  const find = (predicate: (props: Record<string, any>, element: React.ReactElement) => boolean) => { const result = matches(predicate)[0]; if (!result) throw new Error('Automation control not found'); return result }
  const control = (label: string) => find(props => props['aria-label'] === label)
  const editor = () => find((_, element) => element.type === AutomationEditor)
  const history = () => find((_, element) => element.type === AutomationRunHistory)
  const change = async (patch: Partial<AutomationForm>) => { const props = editor(); props.onChange({ ...props.form, ...patch }); await drain() }
  const click = async (label: string) => { control(label).onClick(); await drain() }
  const text = () => { const chunks: string[] = []; const walk = (node: React.ReactNode) => { if (typeof node === 'string' || typeof node === 'number') chunks.push(String(node)); else if (Array.isArray(node)) node.forEach(walk); else if (React.isValidElement<Record<string, any>>(node)) walk(node.props.children) }; walk(tree); return chunks.join(' ') }
  const unmount = () => { live = false; hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) }
  const setActive = async (value: boolean) => { active = value; render(); await drain() }
  render(); return { drain, find, matches, control, click, change, editor, history, text, unmount, setActive, onOpenSession, onManageModels }
}
beforeEach(() => { hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; vi.useFakeTimers(); vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }); vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('shipped React automations host callbacks', () => {
  it('loads real inventory, filters tasks and opens templates as genuine drafts', async () => {
    const api = fixture(), view = mount(api.host); await view.drain()
    expect(api.host.listAutomationTasks).toHaveBeenCalledOnce()
    expect(api.host.getHarnessPermissionConfig).toHaveBeenCalledOnce()
    expect(api.host.listAutomationRuns).toHaveBeenCalledWith(task.id)
    expect(view.matches(props => props.className === 'mira-automation-card')).toHaveLength(1)
    view.control('搜索自动化').onChange({ target: { value: '没有这个任务' } }); await view.drain()
    expect(view.matches(props => props.className === 'mira-automation-card')).toHaveLength(0)
    await view.click('使用模板 每周工作周报')
    expect(view.editor().form).toMatchObject({ templateId: 'weekly-work-report', name: '每周工作周报', permissionMode: 'default', frequency: 'weekly' })
    expect(api.host.saveAutomationTask).not.toHaveBeenCalled()
    view.unmount()
  })

  it('creates once, validates scheduling through the host and clears the persisted draft after saving', async () => {
    const api = fixture(), view = mount(api.host); await view.drain(); await view.click('新建自动化'); await view.change({ name: '新任务', prompt: '真实任务指令' })
    const save = view.editor().onSave; save(); save(); await view.drain()
    expect(api.host.saveAutomationTask).toHaveBeenCalledOnce()
    expect(api.host.getAutomationNextRuns).toHaveBeenCalledWith('0 9 * * 1-5')
    expect(api.host.saveAutomationTask).toHaveBeenCalledWith(expect.objectContaining({ name: '新任务', prompt: '真实任务指令', permissionMode: 'default', projectId: project.id, enabled: true }))
    expect(api.host.setPreference).toHaveBeenCalledWith(AUTOMATION_DRAFT_KEY, null, true)
    expect(view.text()).toContain('任务已保存'); expect(view.text()).toContain('新任务')
    view.unmount()
  })

  it('updates the existing task without changing permissions and retains a failed save in its form', async () => {
    const api = fixture(), view = mount(api.host); await view.drain(); await view.click(`查看自动化 ${task.name}`); await view.change({ prompt: '修订任务' })
    expect(view.control('立即运行已保存任务').disabled).toBe(true)
    api.host.saveAutomationTask.mockRejectedValueOnce(new Error('模型暂不可用'))
    view.editor().onSave(); await view.drain()
    expect(view.editor().form.prompt).toBe('修订任务'); expect(view.editor().error).toBe('模型暂不可用')
    view.editor().onSave(); await view.drain()
    expect(api.host.saveAutomationTask).toHaveBeenLastCalledWith(expect.objectContaining({ id: task.id, permissionMode: 'default', prompt: '修订任务' }))
    view.unmount()
  })

  it('persists drafts before navigation and propagates failure instead of silently leaving', async () => {
    const api = fixture(), view = mount(api.host); await view.drain(); await view.click('新建自动化'); await view.change({ prompt: '导航时不能丢' })
    await api.navigation()
    expect(api.stored()).toMatchObject({ form: { prompt: '导航时不能丢' } })
    api.host.setPreference.mockRejectedValueOnce(new Error('磁盘写入失败'))
    await expect(api.navigation()).rejects.toThrow('磁盘写入失败')
    expect(view.editor().form.prompt).toBe('导航时不能丢')
    view.unmount()
  })

  it('requires explicit confirmation to discard edits or delete a task', async () => {
    const api = fixture(), view = mount(api.host); await view.drain(); await view.click('新建自动化'); await view.change({ prompt: '未保存指令' }); await view.click('返回自动化列表')
    expect(view.editor().form.prompt).toBe('未保存指令')
    await view.click('确认放弃修改')
    expect(api.host.setPreference).toHaveBeenCalledWith(AUTOMATION_DRAFT_KEY, null, true)
    view.find(props => props.className === 'mira-automation-menu-danger').onSelect(); await view.drain()
    expect(api.host.deleteAutomationTask).not.toHaveBeenCalled()
    await view.click('确认删除自动化')
    expect(api.host.deleteAutomationTask).toHaveBeenCalledOnce(); expect(api.host.deleteAutomationTask).toHaveBeenCalledWith(task.id)
    expect(view.matches(props => props.className === 'mira-automation-card')).toHaveLength(0)
    view.unmount()
  })

  it('uses the existing toggle and run callbacks, stops duplicate dispatches and preserves errors', async () => {
    const api = fixture(), view = mount(api.host); await view.drain()
    view.control(`启用 ${task.name}`).onChange({ target: { checked: false } }); await view.drain()
    expect(api.host.setAutomationTaskEnabled).toHaveBeenCalledWith(task.id, false)
    expect(view.control(`启用 ${task.name}`).checked).toBe(false)
    const selectRun = view.find(props => typeof props.onSelect === 'function' && Array.isArray(props.children) && props.children.includes('立即运行')).onSelect
    selectRun(); selectRun(); await view.drain()
    expect(api.host.runAutomationNow).toHaveBeenCalledOnce()
    await view.click(`查看 ${task.name} 运行记录`)
    expect(view.history().runs[task.id][0].status).toBe('running')
    view.history().onStop(task.id); await view.drain(); expect(api.host.abortAutomationRun).toHaveBeenCalledWith(task.id)
    expect(view.history().runs[task.id][0].status).toBe('interrupted')
    view.unmount()
  })

  it('keeps operation failure visible even after background inventory refresh succeeds', async () => {
    const api = fixture(), view = mount(api.host); await view.drain()
    api.host.setAutomationTaskEnabled.mockRejectedValueOnce(new Error('状态更新失败'))
    view.control(`启用 ${task.name}`).onChange({ target: { checked: false } }); await view.drain()
    expect(view.control(`启用 ${task.name}`).checked).toBe(true)
    expect(view.text()).toContain('状态更新失败')
    await vi.advanceTimersByTimeAsync(2500); await view.drain()
    expect(view.text()).toContain('状态更新失败')
    await view.click('关闭自动化错误提示'); expect(view.text()).not.toContain('状态更新失败')
    view.unmount()
  })

  it('never silently creates an empty form after draft hydration fails and supports a real retry', async () => {
    const api = fixture(); api.host.getPreference.mockRejectedValueOnce(new Error('草稿数据库锁定'))
    const view = mount(api.host); await view.drain()
    expect(view.control('新建自动化').disabled).toBe(true)
    expect(view.text()).toContain('草稿数据库锁定')
    view.find(props => props.children === '重试读取草稿').onClick(); await view.drain()
    expect(api.host.getPreference).toHaveBeenCalledTimes(2)
    expect(view.control('新建自动化').disabled).toBe(false)
    view.unmount()
  })

  it('retries failed history and opens only the actual associated conversation', async () => {
    const api = fixture(); api.setRuns([run()]); const view = mount(api.host); await view.drain(); await view.click(`查看 ${task.name} 运行记录`)
    const props = view.history()
    props.onRetry(run()); await view.drain(); expect(api.host.retryAutomationRun).toHaveBeenCalledWith('run')
    props.onOpenSession(session.id); await view.drain(); expect(view.onOpenSession).toHaveBeenCalledWith(session.id)
    expect(view.history().runs[task.id][0]).toMatchObject({ id: 'retry', retriedFrom: 'run', status: 'running' })
    view.unmount()
  })

  it('does not overwrite a newly launched run with a late inventory refresh', async () => {
    const api = fixture(), view = mount(api.host); await view.drain()
    const stale = deferred<AutomationTask[]>()
    api.host.listAutomationTasks.mockReturnValueOnce(stale.promise)
    await view.click('刷新自动化')
    view.find(props => typeof props.onSelect === 'function' && Array.isArray(props.children) && props.children.includes('立即运行')).onSelect(); await view.drain()
    stale.resolve([task]); await view.drain()
    await view.click(`查看 ${task.name} 运行记录`)
    expect(view.history().runs[task.id][0].id).toBe('launched')
    view.unmount()
  })

  it('keeps a successful save identity when clearing its draft fails so retry cannot create duplicates', async () => {
    const api = fixture(), view = mount(api.host); await view.drain(); await view.click('新建自动化'); await view.change({ prompt: '只创建一次' })
    api.host.setPreference.mockRejectedValueOnce(new Error('偏好写入失败'))
    view.editor().onSave(); await view.drain()
    expect(view.editor().error).toContain('任务已保存'); expect(view.editor().error).toContain('再次保存只会更新')
    view.editor().onSave(); await view.drain()
    expect(api.host.saveAutomationTask.mock.calls[0][0].id).toBeUndefined()
    expect(api.host.saveAutomationTask.mock.calls[1][0].id).toBe('created')
    view.unmount()
  })

  it('restores unsaved drafts and pauses background polling when inactive', async () => {
    const api = fixture(), view = mount(api.host); await view.drain(); await view.click('新建自动化'); await view.change({ prompt: '保存到下次继续' }); await api.navigation()
    expect(api.stored()).toMatchObject({ form: { prompt: '保存到下次继续' } })
    await view.setActive(false)
    const reads = api.host.listAutomationTasks.mock.calls.length
    await vi.advanceTimersByTimeAsync(8000); await view.drain()
    expect(api.host.listAutomationTasks).toHaveBeenCalledTimes(reads)
    expect(view.editor().active).toBe(false)
    view.unmount()
  })

  it('rehydrates an earlier unsaved form without coercing its values', async () => {
    const api = fixture()
    const form: AutomationForm = { name: '未完成任务', prompt: '上次写的指令', projectId: project.id, modelKey: JSON.stringify([provider.id, 'model']), thinkingLevel: 'low', permissionMode: 'default', targetType: 'new-session', sessionId: '', frequency: 'cron', time: '09:00', interval: 2, weekdays: [1], monthlyDay: 1, onceAt: '2026-12-01T09:00', expression: '*/7 * * * *', validityEnabled: false, validFrom: '', validUntil: '', enabled: false }
    api.setStored({ form, baseline: '{}' })
    const view = mount(api.host); await view.drain()
    expect(view.editor().form).toEqual(form)
    expect(view.text()).toContain('已恢复未保存')
    expect(api.host.saveAutomationTask).not.toHaveBeenCalled()
    view.unmount()
  })
})
