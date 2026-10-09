import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PERMISSION_CONFIG, type AutomationRun, type AutomationTask, type HarnessProject, type HarnessSessionSummary, type ModelProviderSummary } from '../src/config/harness'
import { AutomationEditor } from '../apps/harness-react/src/components/automations/AutomationEditor'
import { AutomationRunHistory } from '../apps/harness-react/src/components/automations/AutomationRunHistory'
import { newAutomationForm, type AutomationForm } from '../apps/harness-react/src/components/automations/automation-form'
import type { AutomationsHost } from '../apps/harness-react/src/components/automations/automation-host'

const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, (value: unknown) => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true } }] },
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return; slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) },
}))
const project: HarnessProject = { id: 'project', name: 'Project', directory: '/project', directoryExists: true, createdAt: 1, updatedAt: 1 }
const otherProject = { ...project, id: 'other-project' }
const session: HarnessSessionSummary = { id: 'session', projectId: project.id, title: '真实会话', createdAt: 1, updatedAt: 1, status: 'active', pinned: false }
const provider: ModelProviderSummary = { id: 'provider', providerKey: 'custom', name: 'Provider', endpoint: 'http://localhost', enabled: true, authMode: 'api-key', hasApiKey: true, createdAt: 1, updatedAt: 1, models: [{ id: 'model', enabled: true, reasoning: true }] }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function find(tree: React.ReactNode, match: (props: Record<string, any>) => boolean) {
  let found: Record<string, any> | undefined
  const walk = (node: React.ReactNode) => { if (Array.isArray(node)) return node.forEach(walk); if (!React.isValidElement<Record<string, any>>(node)) return; if (!found && match(node.props)) found = node.props; walk(node.props.children) }
  walk(tree); if (!found) throw new Error('Automation field not found'); return found
}
function editorFixture() {
  const host = { getAutomationNextRuns: vi.fn(async () => [Date.now() + 10000]) }
  let form = { ...newAutomationForm([project], [provider]), prompt: '任务正文' }, active = true, readOnly = false, tree: React.ReactElement
  const onSave = vi.fn(), onManageModels = vi.fn(), onChange = vi.fn((next: AutomationForm) => { form = next; hooks.dirty = true })
  const render = () => { hooks.cursor = 0; hooks.dirty = false; tree = AutomationEditor({ host: host as unknown as AutomationsHost, form, projects: [project, otherProject], sessions: [session], providers: [provider], permission: { ...DEFAULT_PERMISSION_CONFIG, fullAccessEnabled: false }, saving: false, readOnly, active, error: '', onChange, onSave, onManageModels }); hooks.effects.splice(0).forEach(effect => effect()) }
  const drain = async () => { for (let index = 0; index < 20; index++) { await Promise.resolve(); if (hooks.dirty) render() } }
  const control = (label: string) => find(tree, props => props['aria-label'] === label)
  const change = async (label: string, value: string) => { control(label).onChange({ target: { value } }); await drain() }
  render(); return { host, drain, render, control, change, onChange, onSave, onManageModels, form: () => form, tree: () => tree, setForm: async (next: AutomationForm) => { form = next; render(); await drain() }, setActive: async (value: boolean) => { active = value; render(); await drain() }, setReadOnly: async () => { readOnly = true; render(); await drain() } }
}
beforeEach(() => { hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; vi.useFakeTimers(); vi.stubGlobal('React', React); vi.stubGlobal('window', { setTimeout, clearTimeout }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('automation editor actual controls', () => {
  it('updates names, prompt, project, model reasoning and permission through form callbacks', async () => {
    const view = editorFixture(); await view.drain()
    await view.change('任务名称', '新名称'); await view.change('任务指令', '新正文'); await view.change('自动化推理强度', 'high'); await view.change('自动化权限', 'auto-approve')
    expect(view.form()).toMatchObject({ name: '新名称', prompt: '新正文', thinkingLevel: 'high', permissionMode: 'auto-approve' })
    expect(find(view.tree(), props => props.value === 'full').disabled).toBe(true)
    await view.setForm({ ...view.form(), targetType: 'existing-session', sessionId: session.id })
    await view.change('自动化项目', otherProject.id); expect(view.form().sessionId).toBe('')
    await view.change('运行频率', 'event'); expect(view.form()).toMatchObject({ frequency: 'event', targetType: 'new-session', sessionId: '' })
    expect(view.control('运行目标').disabled).toBe(true)
  })

  it('maps schedule controls and blocks submission until the real Cron preview succeeds', async () => {
    const view = editorFixture(); await view.drain()
    expect(view.control('保存自动化').disabled).toBe(true)
    await view.change('运行频率', 'weekly'); view.control('周二').onClick(); await view.drain(); await view.change('运行时间', '11:30')
    await vi.advanceTimersByTimeAsync(160); await view.drain()
    expect(view.host.getAutomationNextRuns).toHaveBeenLastCalledWith('30 11 * * 1,2')
    expect(view.control('保存自动化').disabled).toBe(false)
    find(view.tree(), props => props.className === 'mira-automation-editor').onSubmit({ preventDefault: vi.fn() })
    expect(view.onSave).toHaveBeenCalledOnce()
  })

  it('rejects old schedule previews and allows retry after the current host validation fails', async () => {
    const view = editorFixture(), old = deferred<number[]>()
    view.host.getAutomationNextRuns.mockReturnValueOnce(old.promise); await view.drain(); await vi.advanceTimersByTimeAsync(160); await view.drain()
    view.host.getAutomationNextRuns.mockRejectedValueOnce(new Error('无效表达式'))
    await view.change('运行频率', 'cron'); await view.change('Cron 表达式', 'bad cron'); await vi.advanceTimersByTimeAsync(160); await view.drain()
    old.resolve([Date.now() + 10000]); await view.drain()
    expect(find(view.tree(), props => props.className === 'mira-automation-preview')['data-status']).toBe('error')
    expect(view.control('保存自动化').disabled).toBe(true)
    view.control('重试运行时间预览').onClick(); await view.drain(); await vi.advanceTimersByTimeAsync(160); await view.drain()
    expect(view.host.getAutomationNextRuns).toHaveBeenLastCalledWith('bad cron')
    expect(view.control('保存自动化').disabled).toBe(false)
  })

  it('does not start preview requests or save when inactive or read-only', async () => {
    const view = editorFixture(); await view.drain(); await view.setActive(false)
    await vi.advanceTimersByTimeAsync(1000); await view.drain()
    expect(view.host.getAutomationNextRuns).not.toHaveBeenCalled()
    find(view.tree(), props => props.className === 'mira-automation-editor').onSubmit({ preventDefault: vi.fn() })
    expect(view.onSave).not.toHaveBeenCalled()
    await view.setActive(true); await view.setReadOnly()
    expect(find(view.tree(), props => props.disabled === true && props.children?.length > 2).disabled).toBe(true)
  })
})

describe('automation history actual controls', () => {
  it('filters, retries, stops and opens session callbacks while disabling deleted sessions', () => {
    const task: AutomationTask = { id: 'task', name: 'Task', prompt: 'Prompt', projectId: project.id, trigger: { type: 'cron', expression: '0 9 * * *' }, target: { type: 'new-session' }, model: { providerId: provider.id, modelId: 'model' }, permissionMode: 'default', enabled: true, createdAt: 1, updatedAt: 1 }
    const failed: AutomationRun = { id: 'failed', taskId: task.id, source: 'manual', status: 'failed', snapshot: { prompt: 'Prompt', model: task.model, permissionMode: 'default' }, sessionId: session.id, sessionAvailable: true, error: '真实错误' }
    const running = { ...failed, id: 'running', status: 'running' as const }, removed = { ...failed, id: 'removed', sessionAvailable: false }
    const callbacks = { onTask: vi.fn(), onStatus: vi.fn(), onRetry: vi.fn(), onStop: vi.fn(), onOpenSession: vi.fn() }
    const tree = AutomationRunHistory({ tasks: [task], runs: { [task.id]: [failed, removed] }, taskId: '', status: 'all', busyIds: [], ...callbacks })
    find(tree, props => props['aria-label'] === '按任务筛选运行记录').onChange({ target: { value: task.id } }); expect(callbacks.onTask).toHaveBeenCalledWith(task.id)
    find(tree, props => props.children === '失败').onClick(); expect(callbacks.onStatus).toHaveBeenCalledWith('failed')
    find(tree, props => props['aria-label'] === '重试 Task').onClick(); expect(callbacks.onRetry).toHaveBeenCalledWith(failed)
    find(tree, props => props['aria-label'] === '打开 Task 的关联聊天').onClick(); expect(callbacks.onOpenSession).toHaveBeenCalledWith(session.id)
    expect(find(tree, props => props.children === '关联聊天已删除')).toBeDefined()
    const live = AutomationRunHistory({ tasks: [task], runs: { [task.id]: [running] }, taskId: '', status: 'all', busyIds: [], ...callbacks })
    find(live, props => props['aria-label'] === '停止 Task').onClick(); expect(callbacks.onStop).toHaveBeenCalledWith(task.id)
  })
})
