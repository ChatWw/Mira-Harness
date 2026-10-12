import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Type, createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiraPaths } from '../electron/storage/miraPaths'
import { PlatformDatabase } from '../electron/storage/database'
import { HarnessSubtaskCoordinator } from '../electron/services/harnessSubtaskCoordinator'

const fixtures: ReturnType<typeof fixture>[] = []
afterEach(async () => { for (const view of fixtures.splice(0)) { await view.children.close(); view.database.close(); rmSync(view.home, { recursive: true, force: true }) } })
const model: any = { id: 'fixture', api: 'openai-completions', provider: 'fixture', name: 'Fixture', baseUrl: 'http://127.0.0.1:1', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024 }
const header = (name: string, fields: string) => `---\nname: ${name}\ndescription: Inspect actual scope\n${fields}\n---\nPrivate task instructions.`
function fixture(kind: 'user' | 'plugin', fields: string, snapshot?: { id: string; name: string }[], toolCalls: string[] = [], preflight?: () => void, extraTools: any[] = []) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'mira-agent-mcp-scope-'))), paths = new MiraPaths(home), database = new PlatformDatabase(paths), directory = join(home, 'project')
  mkdirSync(directory)
  const project = database.harness.createProject(directory), session = database.harness.createSession(project.id)
  const name = kind === 'user' ? 'scope-check' : 'auditor', profileFile = kind === 'user' ? join(directory, '.mira/agents/scope-check.md') : join(home, 'plugin/agents/auditor.md')
  if (kind === 'user') database.userAgents.save({ scope: 'project', name, source: header(name, fields) }, directory)
  else {
    mkdirSync(join(home, 'plugin/.mira-plugin'), { recursive: true }); mkdirSync(join(home, 'plugin/agents'))
    writeFileSync(join(home, 'plugin/.mira-plugin/plugin.json'), JSON.stringify({ name: 'scope-kit' })); writeFileSync(profileFile, header(name, fields))
    database.plugins.register(join(home, 'plugin'))
    database.harness.updateSession({ ...session, pluginCatalog: database.plugins.snapshots() })
  }
  const calls: string[] = [], contexts: any[] = []
  const tool = (name: string, serverId?: string, serverName?: string) => ({ name, label: name, description: 'Actual fixture operation', parameters: Type.Object({}), ...(serverId ? { miraMcpServerId: serverId, miraMcpServerName: serverName, miraMcpToolName: name } : {}), execute: vi.fn(async () => { calls.push(name); return { content: [{ type: 'text', text: `${name}:result` }] } }) })
  const tools = [tool('selected_read', 'selected', 'Selected'), tool('selected_write', 'selected', 'Selected'), tool('other_read', 'other', 'Other'), tool('read'), ...extraTools]
  let ordinal = 0
  const stream = vi.fn((_model, context) => {
    contexts.push(JSON.parse(JSON.stringify(context)))
    const content: any[] = ordinal++ === 0 && toolCalls.length ? toolCalls.map((name, index) => ({ type: 'toolCall', name, id: `call-${index}`, arguments: {} })) : [{ type: 'text', text: 'Actual child report' }]
    const message: any = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: toolCalls.length && ordinal === 1 ? 'toolUse' : 'stop', timestamp: Date.now() }
    const result = createAssistantMessageEventStream(); result.push({ type: 'done', reason: message.stopReason, message }); return result
  })
  const coordinator = new HarnessSubtaskCoordinator(database)
  const created = coordinator.create({ sender: undefined, sessionId: session.id, session: database.harness.getSession(session.id), model, streamFn: stream, thinkingLevel: 'off', pricing: undefined, parentMcpSnapshot: snapshot,
    publishActivities: () => undefined, toolsForTask: () => tools, preflightToolCall: async () => { preflight?.(); return undefined }, getParentAgent: () => undefined })
  const agent = kind === 'user' ? name : `scope-kit:${name}`
  const delegate = () => created.tools.find(tool => tool.name === 'delegate_task')!.execute('delegate', { role: 'implementer', agent, task: 'Inspect selected parent scope' })
  const view = { home, database, directory, project, profileFile, coordinator, children: created.runtime, tools, calls, contexts, stream, delegate, kind, name }
  fixtures.push(view); return view
}

describe('Agent parent MCP scope with real profiles, coordinator and Pi child', () => {
  it.each(['user', 'plugin'] as const)('narrows %s MCP by exact server identity then tools and exclusions without changing local tools', async kind => {
    const view = fixture(kind, 'mcpServers: [Selected]\ntools: [mcp, Read]\ndisallowedTools: [mcp__Selected__selected_write]', [{ id: 'selected', name: 'Selected' }, { id: 'other', name: 'Other' }], ['selected_read', 'other_read', 'selected_write', 'read'])
    await view.delegate(); await view.children.wait()
    expect(view.children.list()[0]?.error).toBeUndefined()
    expect(view.contexts[0].tools.map((tool: any) => tool.name)).toEqual(['selected_read', 'read'])
    expect(view.calls).toEqual(['selected_read', 'read'])
    expect(view.children.list()[0]?.status).toBe('completed')
  })
  it.each(['user', 'plugin'] as const)('requires %s named service at admission, case-sensitive, even when profile tools exclude MCP', async kind => {
    const view = fixture(kind, 'mcpServers: [Selected]\ntools: [Read]', [{ id: 'selected', name: 'selected' }])
    await expect(view.delegate()).rejects.toThrow('未在父任务启动时选择并连接')
    expect(view.children.list()).toEqual([]); expect(view.stream).not.toHaveBeenCalled()
  })
  it('does not expand a captured parent snapshot when later services are added, and treats star as an exact name', async () => {
    const snapshot = [{ id: 'selected', name: 'Selected' }], view = fixture('user', 'mcpServers: [Later]', snapshot)
    snapshot.push({ id: 'later', name: 'Later' })
    await expect(view.delegate()).rejects.toThrow('Later')
    const star = fixture('plugin', 'mcpServers: ["*"]', snapshot)
    await expect(star.delegate()).rejects.toThrow('：*')
    expect(view.stream).not.toHaveBeenCalled(); expect(star.stream).not.toHaveBeenCalled()
  })
  it('accepts a connected zero-tool service and leaves local tools available', async () => {
    const view = fixture('user', 'mcpServers: [Empty]\ntools: [Read]', [{ id: 'empty', name: 'Empty' }])
    await view.delegate(); await view.children.wait()
    expect(view.contexts[0].tools.map((tool: any) => tool.name)).toEqual(['read'])
  })
  it.each(['', 'mcpServers: []'])('does not apply a service restriction for omitted or empty declarations (%s)', async fields => {
    const view = fixture('plugin', fields)
    await view.delegate(); await view.children.wait()
    expect(view.contexts[0].tools.map((tool: any) => tool.name)).toEqual(['selected_read', 'selected_write', 'other_read', 'read'])
  })
  it('rejects multiple parent ids sharing a required exact name rather than choosing one', async () => {
    const view = fixture('user', 'mcpServers: [Selected]', [{ id: 'global', name: 'Selected' }, { id: 'project', name: 'Selected' }])
    await expect(view.delegate()).rejects.toThrow('名称不唯一')
    expect(view.children.list()).toEqual([]); expect(view.stream).not.toHaveBeenCalled()
  })
  it.each(['user', 'plugin'] as const)('rechecks %s profile MCP identity after waiting for the project lock', async kind => {
    const view = fixture(kind, 'mcpServers: [Selected]', [{ id: 'selected', name: 'Selected' }])
    const release = await view.coordinator.acquireProjectLock(view.project.id, 'write')
    try {
      await view.delegate()
      writeFileSync(view.profileFile, header(view.name, 'mcpServers: [Other]'))
      release(); await view.children.wait()
      expect(view.children.list()[0]).toMatchObject({ status: 'failed', error: { message: expect.stringContaining('变化') } })
      expect(view.stream).not.toHaveBeenCalled(); expect(view.calls).toEqual([])
    } finally { release() }
  })
  it.each(['user', 'plugin'] as const)('rechecks %s MCP profile after an awaited tool approval before execution', async kind => {
    let change = () => undefined
    const view = fixture(kind, 'mcpServers: [Selected]', [{ id: 'selected', name: 'Selected' }], ['selected_read'], () => change())
    change = () => { writeFileSync(view.profileFile, header(view.name, 'mcpServers: [Other]')); return undefined }
    await view.delegate(); await view.children.wait()
    expect(view.calls).toEqual([])
    expect(JSON.stringify(view.contexts.at(-1)?.messages)).toContain('变化')
  })
})
