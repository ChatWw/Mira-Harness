import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import { HarnessSubtaskCoordinator } from '../electron/services/harnessSubtaskCoordinator'
import type { HarnessEvent, HarnessSubtask } from '../src/config/harness'

const resources: Array<{ home: string, database: PlatformDatabase }> = []
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); for (const item of resources.splice(0)) { item.database.close(); rmSync(item.home, { recursive: true, force: true }) } })
const secret = 'platform-private-key'
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
const model: any = { id: 'controlled', api: 'openai-completions', provider: 'fixture', name: 'Controlled', baseUrl: 'http://127.0.0.1:1', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024 }
const read = (path: string) => ({ type: 'toolCall', id: 'reused-provider', name: 'read', arguments: { path } })
const text = (text: string) => ({ type: 'text', text })
function response(content: any[], deltas: boolean | 'tool-only' = true) {
  const stream = createAssistantMessageEventStream()
  const message: any = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [], usage, stopReason: content.some(block => block.type === 'toolCall') ? 'toolUse' : 'stop', timestamp: Date.now() }
  stream.push({ type: 'start', partial: message })
  content.forEach((block, contentIndex) => {
    if (deltas === true && (block.type === 'text' || block.type === 'thinking')) {
      const thinking = block.type === 'thinking', key = thinking ? 'thinking' : 'text'
      const partial = { type: block.type, [key]: '', ...(thinking ? { thinkingSignature: 'private-provider-signature' } : {}) }
      message.content.push(partial)
      stream.push({ type: thinking ? 'thinking_start' : 'text_start', contentIndex, partial: message } as any)
      for (const delta of block.chunks || [block[key]]) { partial[key] += delta; stream.push({ type: thinking ? 'thinking_delta' : 'text_delta', contentIndex, delta, partial: message } as any) }
      stream.push({ type: thinking ? 'thinking_end' : 'text_end', contentIndex, content: partial[key], partial: message } as any)
    } else {
      message.content.push(block)
      if (deltas && block.type === 'toolCall') stream.push({ type: 'toolcall_end', contentIndex, toolCall: block, partial: message } as any)
    }
  })
  stream.push({ type: 'done', reason: message.stopReason, message }); stream.end()
  return stream
}
function setup(streamFn: any, preflight?: (name: string, args: any) => Promise<any>, pluginBody?: string, custom?: { global?: string; project?: string; resolveModel?: any }) {
  const home = mkdtempSync(join(tmpdir(), 'mira-child-conversation-')), database = new PlatformDatabase(home)
  resources.push({ home, database })
  const directory = join(home, 'project'); mkdirSync(directory)
  writeFileSync(join(directory, 'a.txt'), 'Actual A local read\n')
  writeFileSync(join(directory, 'b.txt'), 'Actual B local read\n')
  writeFileSync(join(directory, 'secret.txt'), `Actual file ${secret}\n`)
  const project = database.harness.createProject(directory, 'Controlled actual tools')
  const session = database.harness.createSession(project.id), runId = 'parent-run'
  if (custom?.global) database.userAgents.save({ scope: 'global', name: 'code-review', source: custom.global })
  if (custom?.project) database.userAgents.save({ scope: 'project', name: 'code-review', source: custom.project }, directory)
  const pluginRoot = join(home, 'plugin'), agentFile = join(pluginRoot, 'agents/auditor.md')
  if (pluginBody) {
    mkdirSync(join(pluginRoot, '.claude-plugin'), { recursive: true }); mkdirSync(join(pluginRoot, 'agents'))
    writeFileSync(join(pluginRoot, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'mira-check' }))
    writeFileSync(agentFile, `---\nname: auditor\ndescription: Review Mira records\ntools: Read\n---\n${pluginBody}`)
    database.plugins.register(pluginRoot)
    database.harness.updateSession({ ...database.harness.getSession(session.id), pluginCatalog: database.plugins.snapshots() })
  }
  database.harness.addMessage(session.id, 'user', 'Parent public request')
  database.harness.setActiveRun(session.id, { id: runId, startedAt: 1, activities: [], subtasks: [] })
  const events: HarnessEvent[] = [], runtime = new HarnessRuntime(database, { getTools: () => [] } as any, event => events.push(structuredClone(event)))
  const parent = { followUp: vi.fn() }
  const publish = vi.fn(() => {
    const state = database.harness.getSession(session.id)
    if (state.activeRun?.id !== runId) return
    const subtasks = created.runtime.list()
    database.harness.setActiveRun(session.id, { ...state.activeRun, subtasks })
    events.push(structuredClone({ sessionId: session.id, runId, type: 'run-activity', payload: { subtasks } }))
  })
  const coordinator = new HarnessSubtaskCoordinator(database)
  const created = coordinator.create({ sender: undefined, sessionId: session.id, session: database.harness.getSession(session.id), model, streamFn, thinkingLevel: 'high', pricing: undefined, secrets: [secret], publishActivities: publish,
    ...(custom?.resolveModel ? { resolveModel: custom.resolveModel } : {}),
    toolsForTask: (role, subtaskId, scope, secrets = [secret]) => (runtime as any).tools(undefined, session.id, { role, subtaskId, runId, toolScope: scope.responseIndex, toolCallIndex: scope.callIndex, onTool: scope.onTool, secrets }),
    preflightToolCall: preflight || ((name, args) => (runtime as any).preflightSubtaskToolCall(name, args)), getParentAgent: () => parent as any,
  })
  const child = async (task: string, files?: string[], role: 'reviewer' | 'tester' = 'reviewer') => {
    const result: any = await created.tools.find(tool => tool.name === 'delegate_task')!.execute('parent-delegate', { role, task, files })
    return created.runtime.list().find(task => task.id === result.details.id)!
  }
  return { home, directory, database, runtime, coordinator, projectId: project.id, pluginRoot, agentFile, sessionId: session.id, runId, events, publish, child, children: created.runtime, tools: created.tools, parent, session: () => database.harness.getSession(session.id) }
}

describe('real child Agent public conversation', () => {
  it.each(['builtin', 'plugin'] as const)('executes %s model overrides with the real role tools and restores parent inheritance', async kind => {
    const parentStream = vi.fn(() => response([text('Parent inherited report')])), childSecret = 'separate-override-key'
    const overrideStream = vi.fn((_model: any, context: any) => { expect(context.tools.map((tool: any) => tool.name)).toEqual(kind === 'plugin' ? ['read'] : ['read', 'list_files']); return response([text(`Actual override ${childSecret}`)]) })
    const assertAvailable = vi.fn(), resolveModel = vi.fn(() => ({ model: { ...model, id: 'chosen-child' }, streamFn: overrideStream, thinkingLevel: 'low', secrets: [childSecret], assertAvailable }))
    const fixture = setup(parentStream, undefined, kind === 'plugin' ? 'PLUGIN_UNMODIFIED_PROFILE' : undefined, { resolveModel })
    const provider = fixture.database.models.save({ providerKey: 'custom', name: 'Override provider', endpoint: 'http://127.0.0.1:9000/v1', authMode: 'none', enabled: true, models: [{ id: 'chosen-child', enabled: true, reasoning: true, contextWindow: 16384 }] })
    const target = kind === 'plugin' ? { kind: 'plugin' as const, pluginId: 'mira-check@local', name: 'mira-check:auditor' } : { kind: 'builtin' as const, name: 'reviewer' as const }
    const selected = { providerId: provider.id, modelId: 'chosen-child', thinkingLevel: 'low' as const }
    const original = kind === 'plugin' ? readFileSync(fixture.agentFile, 'utf8') : undefined
    fixture.database.agentModels.set(target, selected)
    const params = { role: 'reviewer', ...(kind === 'plugin' ? { agent: 'mira-check:auditor' } : {}), task: 'Use dedicated child model' }
    const result: any = await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('override', params)
    await fixture.children.wait()
    expect(resolveModel).toHaveBeenCalledWith(selected)
    expect(parentStream).not.toHaveBeenCalled()
    expect(assertAvailable).toHaveBeenCalled()
    expect(fixture.children.list().find(task => task.id === result.details.id)).toMatchObject({ status: 'completed', agentModelSelection: selected, report: 'Actual override [已隐藏]' })
    expect(JSON.stringify([fixture.session(), fixture.events])).not.toContain(childSecret)
    if (kind === 'plugin') expect(readFileSync(fixture.agentFile, 'utf8')).toBe(original)
    fixture.database.agentModels.set(target)
    await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('inherit', params)
    await fixture.children.wait()
    expect(parentStream).toHaveBeenCalledOnce()
    expect(overrideStream).toHaveBeenCalledOnce()
    expect(fixture.children.list().at(-1)?.agentModelSelection).toBeUndefined()
  })

  it.each(['builtin', 'plugin'] as const)('refuses %s override changes while waiting for the project lock', async kind => {
    const stream = vi.fn(() => response([text('Must not start')])), resolveModel = vi.fn(() => ({ model, streamFn: stream, thinkingLevel: 'off' }))
    const fixture = setup(stream, undefined, kind === 'plugin' ? 'Original profile' : undefined, { resolveModel })
    const provider = fixture.database.models.save({ providerKey: 'custom', name: 'Override provider', endpoint: 'http://127.0.0.1:9000/v1', authMode: 'none', enabled: true, models: [{ id: 'controlled', enabled: true, reasoning: true, contextWindow: 16384 }] })
    const target = kind === 'plugin' ? { kind: 'plugin' as const, pluginId: 'mira-check@local', name: 'mira-check:auditor' } : { kind: 'builtin' as const, name: 'reviewer' as const }
    fixture.database.agentModels.set(target, { providerId: provider.id, modelId: 'controlled' })
    const release = await fixture.coordinator.acquireProjectLock(fixture.projectId, 'write')
    try {
      await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('waiting-model', { role: 'reviewer', ...(kind === 'plugin' ? { agent: 'mira-check:auditor' } : {}), task: 'Wait for project lock' })
      fixture.database.agentModels.set(target)
      release(); await fixture.children.wait()
      expect(fixture.children.list()[0]).toMatchObject({ status: 'failed', error: { message: expect.stringContaining('模型配置已变化') } })
      expect(fixture.children.list()[0].startedAt).toBeUndefined()
      expect(stream).not.toHaveBeenCalled()
    } finally { release(); await fixture.children.close() }
  })

  it('rejects an unavailable built-in override instead of starting with the parent model', async () => {
    const stream = vi.fn(() => response([text('Must not start')])), resolveModel = vi.fn(() => { throw new Error('专属模型已停用') })
    const fixture = setup(stream, undefined, undefined, { resolveModel })
    const provider = fixture.database.models.save({ providerKey: 'custom', name: 'Override provider', endpoint: 'http://127.0.0.1:9000/v1', authMode: 'none', enabled: true, models: [{ id: 'controlled', enabled: true, reasoning: true, contextWindow: 16384 }] })
    fixture.database.agentModels.set({ kind: 'builtin', name: 'reviewer' }, { providerId: provider.id, modelId: 'controlled' })
    await expect(fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('missing-model', { role: 'reviewer', task: 'Fail explicitly' })).rejects.toThrow('专属模型已停用')
    expect(fixture.children.list()).toEqual([]); expect(stream).not.toHaveBeenCalled()
  })

  it('rechecks a built-in model selection after approval before executing the real file tool', async () => {
    let ordinal = 0, clear = () => {}
    const overrideStream = vi.fn(() => ordinal++ === 0 ? response([read('a.txt')]) : response([text('Tool blocked')]))
    const resolveModel = vi.fn(() => ({ model, streamFn: overrideStream, thinkingLevel: 'off' }))
    const fixture = setup(() => response([text('Parent must not run')]), async () => { clear(); return undefined }, undefined, { resolveModel })
    const provider = fixture.database.models.save({ providerKey: 'custom', name: 'Override provider', endpoint: 'http://127.0.0.1:9000/v1', authMode: 'none', enabled: true, models: [{ id: 'controlled', enabled: true, reasoning: true, contextWindow: 16384 }] })
    const target = { kind: 'builtin' as const, name: 'reviewer' as const }
    fixture.database.agentModels.set(target, { providerId: provider.id, modelId: 'controlled' })
    clear = () => fixture.database.agentModels.set(target)
    await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('model-approval', { role: 'reviewer', task: 'Read a.txt after approval' })
    await fixture.children.wait()
    expect(fixture.session().toolCalls).toHaveLength(1)
    expect(fixture.session().toolCalls[0]).toMatchObject({ tool: 'read', status: 'failed', output: { text: expect.stringContaining('模型配置已变化') } })
    expect(fixture.session().toolCalls[0].output?.text).not.toContain('Actual A local read')
  })

  const customProfile = (fields = '', body = 'MIRA_CUSTOM_PROFILE_BODY: inspect only the requested task.') => `---\nname: code-review\ndescription: Review code behavior\n${fields}---\n${body}`
  it('uses the project custom profile in a real child, limits tools and keeps private instructions out of public records', async () => {
    const contexts: any[] = []
    const fixture = setup((_model: any, context: any) => { contexts.push(context); return response([text(`Custom review ${secret}`)]) }, undefined, undefined, {
      global: customProfile('', 'GLOBAL_PROFILE_MUST_NOT_RUN'),
      project: customProfile('tools: [Read, Write, Bash]\ndisallowedTools: [Bash]\n', `MIRA_CUSTOM_PROFILE_BODY ${secret}`),
    })
    const result: any = await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('custom-profile', { role: 'reviewer', agent: 'code-review', task: 'Review local changes' })
    await fixture.children.wait()
    const child = fixture.children.list().find(task => task.id === result.details.id)!
    expect(child).toMatchObject({ status: 'completed', agentName: 'code-review', agentScope: 'project', role: 'reviewer', report: 'Custom review [已隐藏]' })
    expect(contexts[0].systemPrompt).toContain('MIRA_CUSTOM_PROFILE_BODY')
    expect(contexts[0].systemPrompt).not.toContain('GLOBAL_PROFILE_MUST_NOT_RUN')
    expect(contexts[0].tools.map((tool: any) => tool.name)).toEqual(['read'])
    expect(JSON.stringify([fixture.session(), fixture.events])).not.toContain('MIRA_CUSTOM_PROFILE_BODY')
    expect(JSON.stringify([fixture.session(), fixture.events])).not.toContain(secret)
    expect(fixture.tools.find(tool => tool.name === 'delegate_task')!.description).toContain('code-review')
  })

  it.each(['tools: []', 'tools: [Write]\ndisallowedTools: [Read]'])('cannot grant tools outside the role or restore explicit empty custom limits (%s)', async fields => {
    const contexts: any[] = []
    const fixture = setup((_model: any, context: any) => { contexts.push(context); return response([text('No tools')]) }, undefined, undefined, { global: customProfile(`${fields}\n`) })
    await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('custom-empty', { role: 'reviewer', agent: 'code-review', task: 'Inspect safely' })
    await fixture.children.wait()
    expect(contexts[0].tools).toEqual([])
  })

  it.each(['disabled', 'missing'] as const)('rejects %s custom profiles before creating a child instead of falling back', async state => {
    const stream = vi.fn(() => response([text('must not start')]))
    const fixture = setup(stream, undefined, undefined, state === 'disabled' ? { global: customProfile(), project: customProfile('enabled: false\n') } : undefined)
    await expect(fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('custom-missing', { role: 'reviewer', agent: 'code-review', task: 'Do not fall back' })).rejects.toThrow(state === 'disabled' ? /停用/ : /不存在|不可用|未找到/)
    expect(fixture.children.list()).toEqual([])
    expect(stream).not.toHaveBeenCalled()
  })

  it.each(['source', 'disabled', 'deleted', 'directory'] as const)('blocks a changed custom profile after waiting for the project lock (%s)', async change => {
    const stream = vi.fn(() => response([text('must not start')]))
    const fixture = setup(stream, undefined, undefined, { project: customProfile() })
    const release = await fixture.coordinator.acquireProjectLock(fixture.projectId, 'write')
    try {
      const result: any = await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('waiting-custom', { role: 'reviewer', agent: 'code-review', task: 'Wait for project' })
      const child = fixture.children.list().find(task => task.id === result.details.id)!
      expect(child.status).toBe('queued')
      const current = fixture.database.userAgents.read('project', 'code-review', fixture.directory).agent
      if (change === 'source') fixture.database.userAgents.save({ scope: 'project', name: 'code-review', source: customProfile('', 'Changed source'), expectedRevision: current.revision }, fixture.directory)
      if (change === 'disabled') fixture.database.userAgents.setEnabled({ scope: 'project', name: 'code-review', enabled: false, expectedRevision: current.revision }, fixture.directory)
      if (change === 'deleted') fixture.database.userAgents.delete({ scope: 'project', name: 'code-review', expectedRevision: current.revision }, fixture.directory)
      if (change === 'directory') fixture.database.harness.updateSession({ ...fixture.session(), workingDirectory: fixture.home })
      release(); await fixture.children.wait()
      expect(child.status).toBe('failed')
      expect(child.startedAt).toBeUndefined()
      expect(stream).not.toHaveBeenCalled()
      expect(child.error?.message).toMatch(/Agent|目录|智能体/)
    } finally { release(); await fixture.children.close() }
  })

  it('rechecks a custom profile after asynchronous tool preflight without reading the requested file', async () => {
    let ordinal = 0, disable!: () => void
    const fixture = setup(() => ordinal++ === 0 ? response([read('a.txt')]) : response([text('Unavailable')]), async () => { disable(); return undefined }, undefined, { global: customProfile('tools: [Read]\n') })
    disable = () => {
      const current = fixture.database.userAgents.read('global', 'code-review').agent
      fixture.database.userAgents.setEnabled({ scope: 'global', name: 'code-review', enabled: false, expectedRevision: current.revision })
    }
    await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('custom-preflight', { role: 'reviewer', agent: 'code-review', task: 'Read actual file' })
    await fixture.children.wait()
    expect(fixture.session().toolCalls).toHaveLength(1)
    expect(fixture.session().toolCalls[0]).toMatchObject({ tool: 'read', status: 'failed' })
    expect(fixture.session().toolCalls[0].output?.text).not.toContain('Actual A local read')
    expect(fixture.session().toolCalls[0].output?.text).toContain('停用')
  })

  it.each([true, false])('applies the custom AGENTS inheritance flag in the real system prompt (%s)', async injectAgentsMd => {
    const contexts: any[] = []
    const fixture = setup((_model: any, context: any) => { contexts.push(context); return response([text('Review complete')]) }, undefined, undefined, { global: customProfile(`injectAgentsMd: ${injectAgentsMd}\n`) })
    writeFileSync(join(fixture.directory, 'AGENTS.md'), 'PROJECT_INSTRUCTIONS_FOR_CUSTOM_CHILD')
    await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('custom-instructions', { role: 'reviewer', agent: 'code-review', task: 'Review actual code' })
    await fixture.children.wait()
    expect(contexts[0].systemPrompt.includes('PROJECT_INSTRUCTIONS_FOR_CUSTOM_CHILD')).toBe(injectAgentsMd)
    expect(contexts[0].systemPrompt).toContain('不能委派')
    expect(contexts[0].systemPrompt).toContain('MIRA_CUSTOM_PROFILE_BODY')
  })

  it('uses the requested custom model callback and keeps its separate credential out of child projections', async () => {
    const parentStream = vi.fn(() => response([text('parent must not run')])), childSecret = 'child-model-private-key'
    const overrideModel = { ...model, id: 'override-model' }, selected = { providerId: 'child-provider', modelId: 'override-model', thinkingLevel: 'low' as const }
    let ordinal = 0
    const overrideStream = vi.fn((actualModel: any, context: any) => { expect(actualModel.id).toBe('override-model'); expect(context.systemPrompt).toContain('MIRA_CUSTOM_PROFILE_BODY'); return ordinal++ === 0 ? response([read('child-secret.txt')]) : response([text(`Child report ${childSecret}`)]) })
    const assertAvailable = vi.fn()
    const resolveModel = vi.fn(() => ({ model: overrideModel, streamFn: overrideStream, thinkingLevel: 'low', pricing: undefined, secrets: [childSecret], assertAvailable }))
    const fixture = setup(parentStream, undefined, undefined, { global: customProfile('modelSelection:\n  providerId: child-provider\n  modelId: override-model\n  thinkingLevel: low\n'), resolveModel })
    writeFileSync(join(fixture.directory, 'child-secret.txt'), `Actual child file ${childSecret}`)
    const result: any = await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('custom-model', { role: 'reviewer', agent: 'code-review', task: 'Review with configured model' })
    await fixture.children.wait()
    expect(resolveModel).toHaveBeenCalledWith(selected)
    expect(overrideStream).toHaveBeenCalledTimes(2)
    expect(parentStream).not.toHaveBeenCalled()
    expect(assertAvailable).toHaveBeenCalled()
    expect(fixture.children.list().find(task => task.id === result.details.id)).toMatchObject({ status: 'completed', agentModelSelection: selected, report: 'Child report [已隐藏]' })
    expect(fixture.session().toolCalls[0]).toMatchObject({ tool: 'read', status: 'ok', output: { text: expect.stringContaining('[已隐藏]') } })
    selected.modelId = 'mutated-after-delegation'
    expect(fixture.children.list().find(task => task.id === result.details.id)?.agentModelSelection?.modelId).toBe('override-model')
    expect(JSON.stringify([fixture.session(), fixture.events])).not.toContain(childSecret)
  })

  it('rejects a custom model override when no host model resolver is available', async () => {
    const stream = vi.fn(() => response([text('must not start')]))
    const fixture = setup(stream, undefined, undefined, { global: customProfile('modelSelection: {providerId: child-provider, modelId: override-model}\n') })
    await expect(fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('custom-no-resolver', { role: 'reviewer', agent: 'code-review', task: 'Do not silently inherit parent model' })).rejects.toThrow(/模型|model/)
    expect(stream).not.toHaveBeenCalled()
    expect(fixture.children.list()).toEqual([])
  })

  it('rechecks override provider availability after a project lock wait', async () => {
    let available = true
    const stream = vi.fn(() => response([text('must not start')])), override = vi.fn(() => response([text('must not start')]))
    const resolveModel = vi.fn(() => ({ model, streamFn: override, thinkingLevel: 'off', assertAvailable: () => { if (!available) throw new Error('专属模型已停用') } }))
    const fixture = setup(stream, undefined, undefined, { global: customProfile('modelSelection: {providerId: fixture, modelId: controlled}\n'), resolveModel })
    const release = await fixture.coordinator.acquireProjectLock(fixture.projectId, 'write')
    try {
      const result: any = await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('custom-disabled-provider', { role: 'reviewer', agent: 'code-review', task: 'Wait for model' })
      const child = fixture.children.list().find(task => task.id === result.details.id)!
      available = false
      release(); await fixture.children.wait()
      expect(child).toMatchObject({ status: 'failed', error: { message: expect.stringContaining('专属模型已停用') } })
      expect(child.startedAt).toBeUndefined()
      expect(stream).not.toHaveBeenCalled()
      expect(override).not.toHaveBeenCalled()
    } finally { release(); await fixture.children.close() }
  })

  it('uses a plugin profile in the real child Agent, intersects tools and persists only its public identity', async () => {
    const contexts: any[] = []
    const fixture = setup((_model: any, context: any) => { contexts.push(context); return response([text('Profile review complete')]) }, undefined, 'MIRA_PLUGIN_PROFILE_BODY: review only the requested record.')
    const result: any = await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('parent-profile', { role: 'implementer', agent: 'mira-check:auditor', task: 'Check record' })
    await fixture.children.wait()
    const child = fixture.children.list().find(task => task.id === result.details.id)!
    expect(child).toMatchObject({ status: 'completed', role: 'implementer', agentName: 'mira-check:auditor', agentPluginId: 'mira-check@local', report: 'Profile review complete' })
    expect(contexts[0].systemPrompt).toContain('MIRA_PLUGIN_PROFILE_BODY')
    expect(contexts[0].tools.map((tool: any) => tool.name)).toEqual(['read'])
    expect(JSON.stringify([fixture.session(), fixture.events])).not.toContain('MIRA_PLUGIN_PROFILE_BODY')
    expect(fixture.tools.find(tool => tool.name === 'delegate_task')!.description).toContain('mira-check:auditor')
  })

  it.each(['disable', 'body', 'directory', 'catalog'] as const)('refuses a changed plugin profile after project-lock waiting (%s)', async change => {
    const stream = vi.fn(() => response([text('must not start')]))
    const fixture = setup(stream, undefined, 'Original plugin profile')
    const release = await fixture.coordinator.acquireProjectLock(fixture.projectId, 'write')
    try {
      const result: any = await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('parent-profile', { role: 'reviewer', agent: 'mira-check:auditor', task: 'Waiting record' })
      const child = fixture.children.list().find(task => task.id === result.details.id)!
      expect(child.status).toBe('queued')
      if (change === 'disable') fixture.database.plugins.setEnabled('mira-check@local', false)
      if (change === 'body') writeFileSync(fixture.agentFile, '---\nname: auditor\ndescription: Review Mira records\ntools: Read\n---\nChanged profile')
      if (change === 'directory') fixture.database.harness.updateSession({ ...fixture.session(), workingDirectory: fixture.home })
      if (change === 'catalog') fixture.database.harness.updateSession({ ...fixture.session(), pluginCatalog: [] })
      release(); await fixture.children.wait()
      expect(child.status).toBe('failed')
      expect(child.startedAt).toBeUndefined()
      expect(stream).not.toHaveBeenCalled()
      expect(child.error?.message).toMatch(/插件|目录/)
    } finally { release(); await fixture.children.close() }
  })

  it.each(['tools: []', 'tools: [Read, Write]\ndisallowedTools: [Read]'])('keeps a plugin profile inside both role and profile restrictions (%s)', async metadata => {
    const contexts: any[] = []
    const fixture = setup((_model: any, context: any) => { contexts.push(context); return response([text('No tools granted')]) }, undefined, 'Profile body')
    writeFileSync(fixture.agentFile, `---\nname: auditor\ndescription: Review Mira records\n${metadata}\n---\nProfile body`)
    await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('limited-profile', { role: 'reviewer', agent: 'mira-check:auditor', task: 'Check without writes' })
    await fixture.children.wait()
    expect(contexts[0].tools).toEqual([])
  })

  it('rechecks plugin state after an asynchronous tool preflight before any actual read', async () => {
    let ordinal = 0, disable!: () => void
    const fixture = setup(() => ordinal++ === 0 ? response([read('a.txt')]) : response([text('Cannot continue disabled profile')]), async () => { disable(); return undefined }, 'Profile body')
    disable = () => fixture.database.plugins.setEnabled('mira-check@local', false)
    await fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('disabled-at-preflight', { role: 'reviewer', agent: 'mira-check:auditor', task: 'Read actual file' })
    await fixture.children.wait()
    const records = fixture.session().toolCalls
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ tool: 'read', status: 'failed' })
    expect(records[0].output?.text).toContain('插件 Agent 已停用')
    expect(records[0].output?.text).not.toContain('Actual A local read')
  })

  it('rejects a missing plugin profile before creating a child or starting a model', async () => {
    const stream = vi.fn(() => response([text('must not start')]))
    const fixture = setup(stream)
    try {
      await expect(fixture.tools.find(tool => tool.name === 'delegate_task')!.execute('missing-profile', { role: 'reviewer', agent: 'mira-check:missing', task: 'Do not fall back' })).rejects.toThrow(/插件/)
      expect(fixture.children.list()).toEqual([])
      expect(stream).not.toHaveBeenCalled()
    } finally { await fixture.children.close() }
  })
  it.each([false, true])('does not queue redundant parent turns for children whose reports are being awaited (selected=%s)', async selected => {
    const completions: Array<() => void> = []
    const fixture = setup(() => {
      const stream = createAssistantMessageEventStream()
      completions.push(() => {
        stream.push({ type: 'done', reason: 'stop', message: { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [text('Public report')], usage, stopReason: 'stop', timestamp: Date.now() } } as any)
        stream.end()
      })
      return stream
    })
    const first = await fixture.child('First task'), second = await fixture.child('Second task')
    await vi.waitFor(() => expect(completions).toHaveLength(2))
    const waiting = fixture.tools.find(tool => tool.name === 'wait_for_tasks')!.execute('wait', selected ? { ids: [first.id] } : {})
    try {
      completions[1]()
      await fixture.children.wait([second.id])
      expect(fixture.parent.followUp).toHaveBeenCalledTimes(selected ? 1 : 0)
      completions[0]()
      const reports: any = await waiting
      expect(reports.details.ids).toEqual(selected ? [first.id] : [first.id, second.id])
      expect(reports.content[0].text).toContain('Public report')
      expect(fixture.parent.followUp).toHaveBeenCalledTimes(selected ? 1 : 0)
      const third = await fixture.child('Later task')
      await vi.waitFor(() => expect(completions).toHaveLength(3))
      completions[2](); await fixture.children.wait([third.id])
      expect(fixture.parent.followUp).toHaveBeenCalledTimes(selected ? 2 : 1)
    } finally { completions.forEach(complete => complete()); await fixture.children.close() }
  })

  it('projects real thinking/text/tools in order with canonical identities for repeated calls, children and responses', async () => {
    const turns = new Map<string, number>(), actualResults: any[] = []
    const fixture = setup((_model: any, context: any) => {
      const key = context.messages[0].content[0].text.startsWith('A') ? 'A' : 'B', ordinal = turns.get(key) || 0
      turns.set(key, ordinal + 1)
      actualResults.push({ key, ordinal, outputs: context.messages.filter((message: any) => message.role === 'toolResult').map((message: any) => message.content.map((block: any) => block.text).join('')) })
      if (ordinal === 0) return response([{ type: 'thinking', thinking: `Reason ${secret}`, chunks: ['Reason platform-', 'private-', 'key'] }, text('Before '), read(key === 'A' ? 'a.txt' : 'b.txt'), text('Between '), read('secret.txt')])
      if (ordinal === 1) return response([text('Next '), read(key === 'A' ? 'a.txt' : 'b.txt')], false)
      return response([text(`Final ${key}`)], false)
    })
    const a = await fixture.child('A public task', ['secret.txt']), b = await fixture.child('B public task')
    await fixture.children.wait()
    expect([a.status, b.status]).toEqual(['completed', 'completed'])
    for (const child of [a, b]) {
      expect(child.parts?.map(part => part.type)).toEqual(['reasoning', 'text', 'tool', 'text', 'tool', 'text', 'tool', 'text'])
      const parts = child.parts!.filter(part => part.type !== 'tool')
      expect(parts.map(part => part.text)).toEqual(['Reason [已隐藏]', 'Before ', 'Between ', 'Next ', child === a ? 'Final A' : 'Final B'])
      expect(parts.every(part => part.state === 'complete')).toBe(true)
      const records = fixture.session().toolCalls.filter(tool => tool.subtaskId === child.id)
      expect(records).toHaveLength(3)
      expect(records.every(tool => tool.runId === fixture.runId && tool.providerCallId === 'reused-provider' && tool.status === 'ok' && tool.input && tool.output)).toBe(true)
      expect(records.map(tool => tool.id)).toEqual([`${fixture.runId}:child-${child.id}:response-1:call-0:reused-provider`, `${fixture.runId}:child-${child.id}:response-1:call-1:reused-provider`, `${fixture.runId}:child-${child.id}:response-2:call-0:reused-provider`])
      expect(child.parts!.filter(part => part.type === 'tool').map(part => part.toolCallId)).toEqual(records.map(tool => tool.id))
      expect(records[0].output?.text).toBe(readFileSync(join(fixture.directory, child === a ? 'a.txt' : 'b.txt'), 'utf8'))
      expect(records[1].output?.text).toBe('Actual file [已隐藏]\n')
      expect(child.report).toBe(child === a ? 'Final A' : 'Final B')
      expect(child.usage).toMatchObject({ input: 3, output: 3, totalTokens: 6 })
    }
    expect(new Set(fixture.session().toolCalls.map(tool => tool.id)).size).toBe(6)
    for (const key of ['A', 'B']) expect(actualResults.find(call => call.key === key && call.ordinal === 1).outputs).toEqual([readFileSync(join(fixture.directory, key === 'A' ? 'a.txt' : 'b.txt'), 'utf8'), readFileSync(join(fixture.directory, 'secret.txt'), 'utf8')])
    const publicData = JSON.stringify([fixture.session(), fixture.events])
    expect(publicData).not.toContain(secret); expect(publicData).not.toContain('private-provider-signature'); expect(publicData).not.toContain('已附带文件')
    const reopened = new PlatformDatabase(fixture.home)
    try { expect(reopened.harness.getSession(fixture.sessionId)).toEqual(fixture.session()) } finally { reopened.close() }
  })

  it('settles rejected preflight calls without execution and keeps delta-free final text', async () => {
    let ordinal = 0
    const fixture = setup(() => ordinal++ === 0 ? response([text('Before rejection'), read('a.txt')], false) : response([text('Final without deltas')], false), async () => ({ block: true, reason: `Denied ${secret}` }))
    const child = await fixture.child('Denied task'); await fixture.children.wait()
    expect(child.parts?.map(part => part.type)).toEqual(['text', 'tool', 'text'])
    expect(fixture.session().toolCalls).toEqual([expect.objectContaining({ status: 'failed', subtaskId: child.id, runId: fixture.runId, input: { text: expect.stringContaining('a.txt'), truncated: false }, output: { text: 'Denied [已隐藏]', truncated: false } })])
    expect(child.report).toBe('Final without deltas')
  })

  it('keeps content order when tool events arrive before delta-free surrounding text', async () => {
    let ordinal = 0, actualResults: string[] = []
    const fixture = setup((_model: any, context: any) => {
      if (ordinal++ === 0) return response([{ type: 'thinking', thinking: `Reason ${secret}` }, text('Before '), read('a.txt'), text('Between '), read('b.txt'), text('After ')], 'tool-only')
      actualResults = context.messages.filter((message: any) => message.role === 'toolResult').map((message: any) => message.content.map((block: any) => block.text).join(''))
      return response([text('Final')], false)
    })
    const child = await fixture.child('Mixed streaming task'); await fixture.children.wait()
    expect(child.status).toBe('completed')
    const ordered = ['Reason [已隐藏]', 'Before ', 'tool', 'Between ', 'tool', 'After ']
    const content = (task: HarnessSubtask) => task.parts?.map(part => part.type === 'tool' ? 'tool' : part.text)
    expect(content(child)).toEqual([...ordered, 'Final'])
    expect(actualResults).toEqual([readFileSync(join(fixture.directory, 'a.txt'), 'utf8'), readFileSync(join(fixture.directory, 'b.txt'), 'utf8')])
    const records = fixture.session().toolCalls.filter(tool => tool.subtaskId === child.id)
    expect(records.map(tool => tool.id)).toEqual([`${fixture.runId}:child-${child.id}:response-1:call-0:reused-provider`, `${fixture.runId}:child-${child.id}:response-1:call-1:reused-provider`])
    const reconciled = fixture.events.filter(event => event.type === 'run-activity').flatMap(event => event.payload.subtasks || []).filter(task => task.id === child.id && task.parts?.some(part => part.type === 'text' && part.text === 'After '))
    expect(reconciled.length).toBeGreaterThan(0)
    for (const task of reconciled) expect(content(task)?.slice(0, ordered.length)).toEqual(ordered)
    const reopened = new PlatformDatabase(fixture.home)
    try { expect(content(reopened.harness.getSession(fixture.sessionId).activeRun!.subtasks[0])).toEqual([...ordered, 'Final']) } finally { reopened.close() }
  })

  it('coalesces live deltas, withholds split secrets and preserves interrupted parts after stop and reload', async () => {
    let release!: () => void, signal!: AbortSignal
    const gate = new Promise<void>(done => { release = done })
    const stream = createAssistantMessageEventStream()
    const message: any = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [{ type: 'text', text: '' }], usage, stopReason: 'stop', timestamp: Date.now() }
    const fixture = setup((_model: any, _context: any, options: any) => {
      signal = options.signal
      stream.push({ type: 'start', partial: message })
      for (const delta of [...Array(120).fill('word '), 'platform-', 'private-']) { message.content[0].text += delta; stream.push({ type: 'text_delta', contentIndex: 0, delta, partial: message }) }
      void gate.then(() => { stream.push({ type: 'text_delta', contentIndex: 0, delta: 'key LATE', partial: message }); stream.push({ type: 'error', reason: 'aborted', error: { ...message, stopReason: 'aborted' } }); stream.end() })
      return stream
    })
    const writes = vi.spyOn(fixture.database.harness, 'setActiveRun')
    const child = await fixture.child('Live task')
    await vi.waitFor(() => expect(child.parts?.[0]).toMatchObject({ text: 'word '.repeat(120) }))
    const before = writes.mock.calls.length
    await new Promise(done => setTimeout(done, 300))
    expect(writes.mock.calls.length - before).toBeLessThanOrEqual(1)
    expect(writes.mock.calls.length).toBeLessThan(8)
    expect(JSON.stringify(fixture.events)).not.toContain('platform-private-')
    expect(fixture.session().activeRun?.subtasks[0].parts?.[0]).toMatchObject({ state: 'streaming', text: 'word '.repeat(120) })
    fixture.children.stop([child.id]); expect(signal.aborted).toBe(true)
    release(); await fixture.children.wait()
    expect(child.status).toBe('stopped')
    expect(child.parts?.[0]).toMatchObject({ state: 'interrupted', text: `${'word '.repeat(120)}[已隐藏]` })
    expect(child.report).toBeUndefined()
    expect(JSON.stringify([fixture.events, fixture.session()])).not.toContain('LATE')
    expect(fixture.session().activeRun?.subtasks[0]).toEqual(child)
  })

  it('freezes a cancelled tool at its last safe progress and ignores late success and callbacks', async () => {
    let ordinal = 0
    const fixture = setup(() => ordinal++ === 0 ? response([{ type: 'toolCall', id: 'slow-local', name: 'bash', arguments: { command: "printf 'recorded platform-'; sleep 2; printf 'private-key LATE'" } }], false) : response([text('After local command')], false))
    const child = await fixture.child('Cancel local command', undefined, 'tester')
    try { await vi.waitFor(() => expect(fixture.session().toolCalls.find(tool => tool.subtaskId === child.id)).toMatchObject({ status: 'running', output: { text: 'recorded ' } }), { timeout: 1500 }) }
    finally { fixture.children.stop([child.id]); await fixture.children.wait() }
    expect(fixture.session().toolCalls.find(tool => tool.subtaskId === child.id)?.status).toBe('cancelled')
    await fixture.children.wait()
    expect(child.status).toBe('stopped')
    expect(child.activities).toEqual([expect.objectContaining({ status: 'stopped', label: 'bash', completedAt: child.completedAt })])
    expect(fixture.session().toolCalls.find(tool => tool.subtaskId === child.id)).toMatchObject({ status: 'cancelled', output: { text: 'recorded ' } })
    expect(fixture.session().activeRun?.subtasks[0]).toEqual(child)
    const published = fixture.events.filter(event => event.type === 'run-activity').at(-1)!.payload.subtasks
    expect(published).toEqual([child])
    const reopened = new PlatformDatabase(fixture.home)
    try {
      expect(reopened.harness.getSession(fixture.sessionId).activeRun?.subtasks[0]).toEqual(child)
      expect(reopened.harness.getSession(fixture.sessionId).toolCalls.find(tool => tool.subtaskId === child.id)).toMatchObject({ status: 'cancelled', output: { text: 'recorded ' } })
    } finally { reopened.close() }
    expect(JSON.stringify(fixture.events.filter(event => event.payload.output))).not.toContain('LATE')
    expect(JSON.stringify(fixture.events.filter(event => event.payload.output))).not.toContain('platform-')
  })
})
