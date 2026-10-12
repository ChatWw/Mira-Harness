// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraWorkflowsView, MiraAutomationTitleSwitch } from '../apps/harness-react/src/components/workflows/MiraWorkflowsView'
import { MiraWorkflowEditor } from '../apps/harness-react/src/components/workflows/MiraWorkflowEditor'
import { MiraWorkflowLaunch } from '../apps/harness-react/src/components/workflows/MiraWorkflowLaunch'
import { MiraWorkflowRunPane } from '../apps/harness-react/src/components/workflows/MiraWorkflowRunPane'
import { MiraWorkflowDigest } from '../apps/harness-react/src/components/workflows/MiraWorkflowDigest'
import { workflowActorModelLabel, workflowNodeLabel, type MiraWorkflowHost } from '../apps/harness-react/src/components/workflows/workflow-model'
import type { HarnessEvent, HarnessProject, ModelProviderSummary } from '../src/config/harness'
import type { MiraFlowRunSnapshot, MiraFlowWorkbenchRequest } from '../src/config/miraFlowWorkbench'
import type { MiraWorkflowDocument } from '../src/config/miraWorkflows'
import { createWorkspaceSession, createWorkspaceWorkflowTab, openWorkspaceTab, readWorkspaceSessions, withoutWorkspaceTaskOwners } from '../apps/harness-react/src/state/workspace-state'

const project: HarnessProject = { id: 'project', name: 'Mira project', icon: '', directory: '/project', directoryExists: true, sessionCount: 0, createdAt: 1, updatedAt: 1 }
const provider: ModelProviderSummary = { id: 'provider', name: '模型服务', providerKey: 'custom', endpoint: 'https://example.com', authMode: 'none', hasApiKey: false, enabled: true, models: [{ id: 'first', enabled: true, reasoning: false, contextWindow: 1000 }, { id: 'original', enabled: true, reasoning: true, contextWindow: 1000 }], createdAt: 1, updatedAt: 1 }
const definition: MiraWorkflowDocument = { name: 'review', scope: 'project', path: '/project/.mira/workflows/review.ts', revision: 'a'.repeat(64), sourceHash: 'b'.repeat(64), meta: { description: '核对代码', args: { task: { type: 'string', required: true }, count: { type: 'number', default: 2 }, enabled: { type: 'boolean', default: false }, data: { type: 'json', default: {} } } }, source: 'source', script: 'return args.task;', bodyLineOffset: 0, marker: 'mira' }
const snapshot: MiraFlowRunSnapshot = { run: { runId: 'run', parentSessionId: 'session', name: '核对', cwd: '/project', scriptText: 'return args.task;', scriptHash: 'a'.repeat(64), status: 'running', caps: { maxConcurrency: 2 }, spentTokens: 37, args: { task: '检查' } }, selection: { providerId: provider.id, modelId: 'original', thinkingLevel: 'high' }, actors: [], nodes: [], events: [] }
let root: Root | undefined
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
async function mount(element: React.ReactNode) {
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container)
  root = createRoot(container); await act(async () => root!.render(element))
  return async (next: React.ReactNode) => { await act(async () => root!.render(next)) }
}
const button = (text: string) => { const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === text || item.textContent?.trim() === text); if (!found) throw new Error(`Missing ${text}`); return found }
async function click(text: string) { await act(async () => button(text).click()) }
async function change(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[aria-label="${label}"]`)!
  if (!input) throw new Error(`Missing ${label}`)
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { resolve, promise } }
function hostFixture(handler: (request: MiraFlowWorkbenchRequest) => unknown = () => undefined) {
  const listeners = new Set<(event: HarnessEvent) => void>()
  const request = vi.fn(async (input: MiraFlowWorkbenchRequest) => handler(input))
  const host: MiraWorkflowHost = { requestWorkflow: request as MiraWorkflowHost['requestWorkflow'], onWorkflowEvent: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  return { host, request, emit: async (sessionId: string, runId: string) => { await act(async () => listeners.forEach(listener => listener({ type: 'workflow-event', sessionId, payload: { runId } } as HarnessEvent))) }, listeners }
}

describe('workflow hub, editor and real launch interactions', () => {
  it('switches the automation title by keyboard with selected tab focus', async () => {
    const onChange = vi.fn(); await mount(<MiraAutomationTitleSwitch value="automations" onChange={onChange} />)
    await act(async () => document.querySelector('[aria-label="自动化与工作流"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(onChange).toHaveBeenCalledWith('workflows'); expect(document.activeElement?.textContent).toBe('工作流')
  })
  it('lists global/project sources independently, renders diagnostics and real run history', async () => {
    const view = hostFixture(request => request.action === 'definitions.list' ? request.projectId ? [definition, { ...definition, name: 'broken', diagnostic: { reason: 'invalid_yaml', detail: '真实元数据错误' } }] : [{ ...definition, name: 'global', scope: 'global' }] : request.action === 'runs.list' ? [snapshot.run] : undefined)
    const onOpenRun = vi.fn(async () => undefined)
    await mount(<MiraWorkflowsView host={view.host} projects={[project]} providers={[provider]} onOpenRun={onOpenRun} onManageModels={vi.fn()} />)
    expect(document.querySelector('[data-workflow-name="global"]')).not.toBeNull(); expect(document.querySelector('[data-workflow-name="review"]')).not.toBeNull()
    expect(button('运行工作流 broken').disabled).toBe(true); expect(document.body.textContent).toContain('真实元数据错误')
    await click('运行记录'); await click('核对/project运行中37 tokens')
    expect(onOpenRun).toHaveBeenCalledWith({ sessionId: 'session', runId: 'run' })
  })
  it('does not save after authoritative compile rejection and preserves the script', async () => {
    const view = hostFixture(request => { if (request.action === 'definitions.preview') throw new Error('3:5 找不到名称 broken') })
    await mount(<MiraWorkflowEditor host={view.host} document={definition} projectId={project.id} projects={[project]} onBack={vi.fn()} onSaved={vi.fn()} />)
    await change('工作流源码', 'return broken;'); await click('保存工作流')
    expect(view.request.mock.calls.map(([request]) => request.action)).toEqual(['definitions.preview'])
    expect(document.querySelector<HTMLTextAreaElement>('[aria-label="工作流源码"]')!.value).toBe('return broken;')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('3:5')
  })
  it('previews then saves the same source revision, including repeated saves', async () => {
    const view = hostFixture(request => request.action === 'definitions.preview' ? { next: definition } : request.action === 'definitions.save' ? { ...definition, revision: 'c'.repeat(64) } : undefined)
    const saved = vi.fn()
    await mount(<MiraWorkflowEditor host={view.host} document={definition} projectId={project.id} projects={[project]} onBack={vi.fn()} onSaved={saved} />)
    await click('保存工作流'); await click('保存工作流')
    expect(view.request.mock.calls.map(([request]) => request.action)).toEqual(['definitions.preview', 'definitions.save', 'definitions.preview', 'definitions.save'])
    expect(view.request.mock.calls[3][0]).toMatchObject({ input: { expectedRevision: 'c'.repeat(64), script: definition.script } }); expect(saved).toHaveBeenCalledTimes(2)
  })
  it('requires discard confirmation for modified code and keeps editing on cancel', async () => {
    const onBack = vi.fn(), view = hostFixture()
    await mount(<MiraWorkflowEditor host={view.host} document={definition} projects={[project]} onBack={onBack} onSaved={vi.fn()} />)
    await change('工作流源码', 'return "changed";'); await click('返回工作流')
    expect(onBack).not.toHaveBeenCalled(); expect(document.querySelector('[role="dialog"]')?.textContent).toContain('放弃工作流修改')
    await click('继续编辑'); expect(document.querySelector<HTMLTextAreaElement>('[aria-label="工作流源码"]')!.value).toBe('return "changed";')
  })
  it('validates typed parameters locally and leaves rejected launch inputs intact', async () => {
    const view = hostFixture(() => { throw new Error('项目已变化，请刷新') }), accepted = vi.fn(async () => undefined)
    await mount(<MiraWorkflowLaunch host={view.host} document={definition} projectId={project.id} projects={[project]} providers={[provider]} onClose={vi.fn()} onAccepted={accepted} onManageModels={vi.fn()} />)
    await change('工作流参数 count', 'invalid'); await click('启动工作流'); expect(view.request).not.toHaveBeenCalled()
    await change('工作流参数 count', '3'); await change('工作流参数 task', '检查代码'); await click('启动工作流')
    expect(view.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'runs.start', args: { task: '检查代码', count: 3, enabled: false, data: {} }, revision: definition.revision, projectId: project.id }))
    expect(accepted).not.toHaveBeenCalled(); expect(document.querySelector<HTMLInputElement>('[aria-label="工作流参数 task"]')!.value).toBe('检查代码'); expect(document.querySelector('[role="alert"]')?.textContent).toContain('项目已变化')
  })
  it('keeps an unfilled required string in the launch form without starting a model run', async () => {
    const view = hostFixture(() => ({ sessionId: 'session', runId: 'run' })), accepted = vi.fn(async () => undefined)
    await mount(<MiraWorkflowLaunch host={view.host} document={definition} projectId={project.id} projects={[project]} providers={[provider]} onClose={vi.fn()} onAccepted={accepted} onManageModels={vi.fn()} />)
    await click('启动工作流')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('缺少必填参数：task')
    expect(view.request).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled()
    expect(document.querySelector<HTMLInputElement>('[aria-label="工作流参数 task"]')!.value).toBe('')
    await change('工作流参数 task', '补齐主题')
    expect(document.querySelector('[role="alert"]')).toBeNull(); expect(view.request).not.toHaveBeenCalled()
    await click('启动工作流'); expect(view.request).toHaveBeenCalledTimes(1)
    expect(accepted).toHaveBeenCalledWith({ sessionId: 'session', runId: 'run' })
  })
  it('rechecks local argument errors while preserving independent host rejections during edits', async () => {
    const view = hostFixture(() => { throw new Error('宿主拒绝：项目权限已变化') })
    await mount(<MiraWorkflowLaunch host={view.host} document={definition} projectId={project.id} projects={[project]} providers={[provider]} onClose={vi.fn()} onAccepted={vi.fn()} onManageModels={vi.fn()} />)
    await change('工作流参数 count', 'invalid'); await click('启动工作流')
    await change('工作流参数 task', '主题')
    expect(document.querySelector('[role="alert"]')?.textContent).not.toContain('缺少必填参数：task')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('参数 count 需要 number')
    await change('工作流参数 count', '2'); expect(document.querySelector('[role="alert"]')).toBeNull()
    await click('启动工作流'); expect(view.request).toHaveBeenCalledTimes(1)
    await change('工作流参数 task', '新的主题')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('宿主拒绝：项目权限已变化')
    expect(view.request).toHaveBeenCalledTimes(1)
  })
  it('navigates only after start accepted and never starts twice after navigation fails', async () => {
    const started = deferred<{ sessionId: string; runId: string }>(), view = hostFixture(() => started.promise)
    const accepted = vi.fn(async () => { throw new Error('切换会话失败') })
    await mount(<MiraWorkflowLaunch host={view.host} document={definition} projectId={project.id} projects={[project]} providers={[provider]} onClose={vi.fn()} onAccepted={accepted} onManageModels={vi.fn()} />)
    await change('工作流参数 task', '检查代码'); await click('启动工作流'); expect(accepted).not.toHaveBeenCalled()
    await act(async () => started.resolve({ sessionId: 'session', runId: 'run' })); expect(accepted).toHaveBeenCalledWith({ sessionId: 'session', runId: 'run' })
    await click('打开已启动会话'); expect(view.request).toHaveBeenCalledTimes(1); expect(accepted).toHaveBeenCalledTimes(2)
  })
})

describe('real workflow journal pane and conversation digest', () => {
  it('shows readable pinned models and actions while retaining full identities in execution details', async () => {
    const pin = JSON.stringify(['provider', 'original', 'high']), actorSessionId = `mira-flow-actor-${'a'.repeat(64)}`
    const completed: MiraFlowRunSnapshot = {
      ...snapshot, run: { ...snapshot.run, status: 'completed' },
      actors: [{ runId: 'run', siteId: 'actor-site', ordinal: 0, name: '资料助手', sessionId: actorSessionId, resolvedModel: pin }],
      nodes: (['ask', 'world-read', 'world-run', 'report', 'artifact'] as const).map((kind, ordinal) => ({ runId: 'run', siteId: `${kind}-${'b'.repeat(64)}`, ordinal, kind, inputHash: 'hash', status: 'completed' as const })),
    }
    const view = hostFixture(() => completed)
    await mount(<MiraWorkflowRunPane host={view.host} identity={{ sessionId: 'session', runId: 'run' }} providers={[provider]} />)
    expect(document.querySelector('.mira-workflow-actor > strong')?.textContent).toBe('资料助手')
    expect(document.querySelector('.mira-workflow-actor__model')?.textContent).toBe('模型服务 / original')
    const actorDetails = document.querySelector('.mira-workflow-actor details')!
    expect(actorDetails.textContent).toContain(pin); expect(actorDetails.textContent).toContain(actorSessionId)
    expect((actorDetails as HTMLDetailsElement).open).toBe(false)
    expect([...document.querySelectorAll('.mira-workflow-nodes li > span')].map(node => node.textContent)).toEqual(['智能体任务', '读取工作区', '执行命令', '生成报告', '发布产物'])
    expect(document.querySelector('.mira-workflow-nodes li > span')?.getAttribute('title')).toContain(`ask-${'b'.repeat(64)}@0`)
    expect(document.querySelector('.mira-workflow-nodes li details')?.textContent).toContain(`ask-${'b'.repeat(64)}@0`)
    expect(document.querySelector('.mira-workflow-run__controls')).toBeNull()
    expect(workflowNodeLabel('future-action')).toBe('future-action')
    expect(workflowActorModelLabel('legacy/model', [provider])).toBe('legacy/model')
    expect(workflowActorModelLabel(undefined, [provider])).toBe('尚未分配模型')
  })
  it('stops and resumes the same identity with the persisted original model, rendering reports and artifacts', async () => {
    let current = structuredClone(snapshot)
    current.nodes = [{ runId: 'run', siteId: 'report', ordinal: 0, kind: 'report', inputHash: 'hash', status: 'completed', result: { findings: '真实报告' } }, { runId: 'run', siteId: 'artifact', ordinal: 0, kind: 'artifact', artifactId: 'review.md', inputHash: 'hash', status: 'completed', result: { uri: 'mira-artifact://real', bytes: 12 } }]
    const view = hostFixture(request => {
      if (request.action === 'runs.snapshot') return structuredClone(current)
      if (request.action === 'runs.stop') { current.run.status = 'stopped'; current.run.stopReason = 'user' }
      if (request.action === 'runs.resume') current.run.status = 'running'
    })
    await mount(<MiraWorkflowRunPane host={view.host} identity={{ sessionId: 'session', runId: 'run' }} providers={[provider]} />)
    expect(document.body.textContent).toContain('真实报告'); expect(document.body.textContent).toContain('mira-artifact://real')
    expect(document.querySelector('[aria-label*="下载"]')).toBeNull(); await click('停止工作流'); expect(document.body.textContent).toContain('已停止')
    await click('原样续跑'); expect(view.request).toHaveBeenCalledWith({ action: 'runs.resume', sessionId: 'session', runId: 'run', selection: snapshot.selection }); expect(document.body.textContent).toContain('运行中')
  })
  it('refreshes only its selected run and discards a late previous-session snapshot', async () => {
    const late = deferred<MiraFlowRunSnapshot>()
    const view = hostFixture(request => request.action === 'runs.snapshot' ? request.sessionId === 'other' ? late.promise : structuredClone(snapshot) : undefined)
    const render = await mount(<MiraWorkflowRunPane host={view.host} identity={{ sessionId: 'session', runId: 'run' }} providers={[provider]} />)
    await view.emit('session', 'different-run'); await view.emit('different-session', 'run'); expect(view.request).toHaveBeenCalledTimes(1)
    await view.emit('session', 'run'); expect(view.request).toHaveBeenCalledTimes(2)
    await render(<MiraWorkflowRunPane host={view.host} identity={{ sessionId: 'other', runId: 'old' }} providers={[provider]} />)
    await render(<MiraWorkflowRunPane host={view.host} identity={{ sessionId: 'session', runId: 'run' }} providers={[provider]} />)
    await act(async () => late.resolve({ ...snapshot, run: { ...snapshot.run, name: '过期会话' } }))
    expect(document.body.textContent).not.toContain('过期会话'); expect(document.querySelector('[data-workflow-run-id]')?.getAttribute('data-workflow-run-id')).toBe('run')
  })
  it('preserves identity and real timestamp through workspace persistence', () => {
    const tab = createWorkspaceWorkflowTab('session', 'run'), state = openWorkspaceTab(createWorkspaceSession(), tab)
    const restored = readWorkspaceSessions({ session: state })
    expect(restored.session.tabs[0]).toMatchObject({ workflowSessionId: 'session', runId: 'run', id: tab.id, openedAt: expect.any(Number) })
    expect(readWorkspaceSessions({ session: { ...state, tabs: [{ ...tab, runId: 'different' }] } }).session.tabs).toEqual([])
    expect(withoutWorkspaceTaskOwners({ owner: state }, new Set(['session'])).owner.tabs).toEqual([])
  })
  it('loads only the active conversation digest and reports presence for an empty launch conversation', async () => {
    const view = hostFixture(request => request.action === 'runs.list' ? [snapshot.run] : request.action === 'runs.snapshot' ? snapshot : undefined), presence = vi.fn(), onOpen = vi.fn(async () => undefined)
    await mount(<MiraWorkflowDigest host={view.host} sessionId="session" active onPresence={presence} onOpen={onOpen} />)
    expect(view.request).toHaveBeenCalledWith({ action: 'runs.list', sessionId: 'session' }); expect(presence).toHaveBeenLastCalledWith('session', 1)
    const count = view.request.mock.calls.length
    await view.emit('other', 'run'); expect(view.request).toHaveBeenCalledTimes(count)
    await click('查看工作流 核对'); expect(onOpen).toHaveBeenCalledWith({ sessionId: 'session', runId: 'run' })
  })
})
