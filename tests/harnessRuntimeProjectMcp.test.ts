import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpManager } from '../electron/adapters/mcpManager'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import * as modelProvider from '../electron/services/harnessModelProvider'
import { PlatformDatabase } from '../electron/storage/database'
import { McpConfigStore } from '../electron/storage/mcpConfigStore'
import type { HarnessEvent } from '../src/config/harness'

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
type Step = { tools?: (context: any) => Array<{ id: string; name: string; arguments: Record<string, unknown> }>; wait?: ReturnType<typeof deferred> }
const fixtures: ReturnType<typeof setup>[] = [], sdkModule = (name: string) => pathToFileURL(createRequire(import.meta.url).resolve(name)).href
const actualCall = (text: string): Step => ({ tools: context => [{ id: 'project-provider-call', name: context.tools.find((tool: any) => tool.name.startsWith('mira_mcp_')).name, arguments: { text } }] })
function alive(pid: number) { try { process.kill(pid, 0); return true } catch { return false } }
afterEach(async () => {
  for (const view of fixtures) { view.sessionIds.forEach(id => view.runtime.abort(id)); [...view.steps, ...(view.childSteps || [])].forEach(step => step.wait?.resolve()) }
  await Promise.allSettled(fixtures.flatMap(view => view.runs)); await Promise.all(fixtures.map(view => view.manager.closeAll()))
  vi.restoreAllMocks()
  for (const view of fixtures.splice(0)) { view.database.close(); rmSync(view.root, { recursive: true, force: true }) }
})

/** Actual Agent, project config, SQLite and MCP SDK stdio; only model replies are controlled. */
function setup(steps: Step[] = [{}], options: { permission?: 'default' | 'full'; childSteps?: Step[]; selected?: boolean; emptyTools?: boolean } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-runtime-project-mcp-'))), directory = join(root, 'project'), log = join(root, 'server.jsonl'), script = join(root, 'server.mjs')
  mkdirSync(directory)
  const database = new PlatformDatabase(root), store = new McpConfigStore(root), manager = new McpManager(), permission = options.permission || 'full'
  const runtime = new HarnessRuntime(database, manager, undefined, store)
  vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, session) => session); vi.spyOn(database.memories, 'enabled').mockReturnValue(false)
  database.harness.savePermissionConfig({ ...database.harness.getPermissionConfig(), globalDefaultMode: permission })
  database.models.save({ id: 'fixture', name: 'Fixture', endpoint: 'http://127.0.0.1:1/v1', authMode: 'none', enabled: true, models: [{ id: 'model', enabled: true, reasoning: false }] })
  writeFileSync(script, `
import { appendFileSync } from 'node:fs';
import { Server } from ${JSON.stringify(sdkModule('@modelcontextprotocol/sdk/server/index.js'))};
import { StdioServerTransport } from ${JSON.stringify(sdkModule('@modelcontextprotocol/sdk/server/stdio.js'))};
import { ListToolsRequestSchema, CallToolRequestSchema } from ${JSON.stringify(sdkModule('@modelcontextprotocol/sdk/types.js'))};
const log=(row)=>appendFileSync(${JSON.stringify(log)},JSON.stringify({pid:process.pid,cwd:process.cwd(),...row})+'\\n'); log({event:'start'});
const server=new Server({name:'mira-project-stdio-fixture',version:'1'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:${options.emptyTools ? '[]' : "[{name:'echo',description:'Actual project echo',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}]"}}));
server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{log({event:'call',args:request.params.arguments});if(request.params.arguments.text==='hold') await new Promise(resolve=>extra.signal.addEventListener('abort',()=>{log({event:'cancel'});resolve();},{once:true}));return {content:[{type:'text',text:'project-real:'+request.params.arguments.text}]};});
await server.connect(new StdioServerTransport());
`)
  const projectStore = store.forProject(directory), config = projectStore.save({ name: 'Project echo', command: process.execPath, args: [script], env: { PRIVATE_PROJECT_CREDENTIAL: 'project-private-config-token' }, enabled: true })
  const project = database.harness.createProject(directory), created = database.harness.createSession(project.id)
  database.harness.updateSession({ ...created, titleSource: 'manual', permissionMode: permission, delegationEnabled: Boolean(options.childSteps), activeMcpServerIds: options.selected === false ? [] : [config.id] })
  const contexts: Array<{ child: boolean; tools: any[]; messages: any[] }> = [], events: HarnessEvent[] = []
  let parentOrdinal = 0, childOrdinal = 0
  const original = modelProvider.createHarnessModelProvider
  vi.spyOn(modelProvider, 'createHarnessModelProvider').mockImplementation((...args) => {
    const configured = original(...args)
    vi.spyOn(configured.models, 'streamSimple').mockImplementation((_model, context) => {
      const child = context.systemPrompt?.startsWith('你是 Mira 的 ') === true, step = (child ? options.childSteps?.[childOrdinal++] : steps[parentOrdinal++]) || {}, tools = step.tools?.(context) || [], text = child ? 'Project child report' : 'Project parent report'
      contexts.push({ child, tools: JSON.parse(JSON.stringify(context.tools || [])), messages: structuredClone(context.messages) })
      const stream = createAssistantMessageEventStream(), message: any = { role: 'assistant', api: 'openai-completions', provider: 'mira-openai', model: 'model', content: [{ type: 'text', text }, ...tools.map(tool => ({ type: 'toolCall', ...tool }))], stopReason: tools.length ? 'toolUse' : 'stop', timestamp: Date.now(), usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
      void (async () => { await Promise.resolve(); stream.push({ type: 'start', partial: message }); stream.push({ type: 'text_start', contentIndex: 0, partial: message }); stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: message }); stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: message }); if (step.wait) await step.wait.promise; tools.forEach((tool, index) => stream.push({ type: 'toolcall_end', contentIndex: index + 1, toolCall: tool as any, partial: message })); stream.push({ type: 'done', reason: message.stopReason, message }) })()
      return stream
    })
    return configured
  })
  const sender: any = { isDestroyed: () => false, send: (_channel: string, event: HarnessEvent) => events.push(structuredClone(event)) }, runs: Promise<unknown>[] = [], sessionIds = [created.id]
  const run = (sessionId = created.id, planning = false) => { const result = runtime.runMessage(sender, sessionId, 'Inspect selected project MCP', [], { providerId: 'fixture', modelId: 'model' }, planning); result.catch(() => {}); runs.push(result); return result }
  const rows = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { pid: number; cwd: string; event: string; args?: Record<string, unknown> }) : []
  const session = (id = created.id) => database.harness.getSession(id)
  const view = { root, directory, database, store, projectStore, config, project, manager, runtime, steps, childSteps: options.childSteps, sessionId: created.id, sessionIds, runs, run, rows, contexts, events, session, script }
  fixtures.push(view); return view
}

describe('project MCP in the real Harness runtime', () => {
  it.each([false, true])('passes the selected connected project snapshot to a named Agent, including zero tools (%s)', async emptyTools => {
    const view = setup([{ tools: () => [{ id: 'delegate-profile', name: 'delegate_task', arguments: { role: 'implementer', agent: 'project-runner', task: 'Use parent project scope' } }] }, { tools: () => [{ id: 'wait-profile', name: 'wait_for_tasks', arguments: {} }] }, {}], { emptyTools, childSteps: emptyTools ? [{}] : [actualCall('profile-child'), {}] })
    mkdirSync(join(view.directory, '.mira', 'agents'), { recursive: true })
    writeFileSync(join(view.directory, '.mira', 'agents', 'project-runner.md'), '---\nname: project-runner\ndescription: Project MCP runner\nmcpServers: [Project echo]\ntools: [mcp, Read]\n---\nUse only the selected parent service.')
    await view.run()
    const task = view.session().messages.find(message => message.run?.subtasks?.length)?.run?.subtasks?.[0]
    expect(task).toMatchObject({ status: 'completed', report: 'Project child report' })
    expect(view.rows().filter(row => row.event === 'start')).toHaveLength(1)
    expect(view.rows().filter(row => row.event === 'call')).toHaveLength(emptyTools ? 0 : 1)
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })
  it('starts only a selected project MCP, exposes schema, gates approval and persists actual result', async () => {
    const view = setup([actualCall('approved'), {}], { permission: 'default' }), pending = view.run()
    expect(view.config.id).toMatch(new RegExp(`^project:${createHash('sha256').update(view.directory).digest('hex').slice(0, 10)}:`))
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const request = view.runtime.listPendingPermissions(view.sessionId)[0], mcp = view.contexts[0].tools.find(tool => tool.name.startsWith('mira_mcp_'))
    expect(mcp).toMatchObject({ parameters: { required: ['text'], properties: { text: { type: 'string' } } } }); expect(request.detail).toContain('Project echo')
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    expect(view.session().toolCalls.find(tool => tool.id === request.toolCallId)).toMatchObject({ label: 'echo', status: 'waiting-confirm' })
    view.runtime.resolvePermission(request.requestId, true); await pending
    expect(view.rows().filter(row => row.event === 'call')).toMatchObject([{ cwd: view.directory, args: { text: 'approved' } }])
    expect(view.session().toolCalls.find(tool => tool.id === request.toolCallId)).toMatchObject({ status: 'ok', output: { text: 'project-real:approved' } })
    expect(JSON.stringify(view.contexts[1].messages)).toContain('project-real:approved'); expect(JSON.stringify([view.contexts, view.events, view.session()])).not.toContain('project-private-config-token')
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it.each(['unselected', 'plan'] as const)('does not connect project MCP for %s execution', async kind => {
    const steps: Step[] = kind === 'plan' ? [{ tools: () => [{ id: 'plan', name: 'present_plan', arguments: { understanding: 'Inspect project only', steps: [{ label: 'Inspect project MCP after approval' }] } }] }] : [{}]
    const view = setup(steps, { selected: kind !== 'unselected' }); await view.run(view.sessionId, kind === 'plan')
    expect(view.rows()).toEqual([]); expect(view.contexts[0].tools.some(tool => tool.name.startsWith('mira_mcp_'))).toBe(false)
  })

  it.each(['personal', 'other-project'] as const)('refuses a foreign project service in a %s session', async scope => {
    const view = setup([{}])
    let projectId: string | undefined
    if (scope === 'other-project') { const directory = join(view.root, 'other'); mkdirSync(directory); projectId = view.database.harness.createProject(directory).id }
    const created = view.database.harness.createSession(projectId); view.sessionIds.push(created.id)
    view.database.harness.updateSession({ ...created, titleSource: 'manual', delegationEnabled: false, activeMcpServerIds: [view.config.id] })
    await expect(view.run(created.id)).rejects.toThrow(/项目|目录/)
    expect(view.rows()).toEqual([]); expect(view.contexts).toEqual([])
  })

  it.each(['change', 'disable', 'delete', 'deselect'] as const)('blocks %s while approval waits without a server side effect', async change => {
    const view = setup([actualCall('forbidden'), {}], { permission: 'default' }), pending = view.run()
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const request = view.runtime.listPendingPermissions(view.sessionId)[0]
    if (change === 'change') view.projectStore.save({ ...view.config, args: [view.script, 'changed'] })
    if (change === 'disable') view.projectStore.save({ ...view.config, enabled: false })
    if (change === 'delete') view.projectStore.delete(view.config.id)
    if (change === 'deselect') view.database.harness.updateSession({ ...view.session(), activeMcpServerIds: [] })
    view.runtime.resolvePermission(request.requestId, true); await pending
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    expect(['failed', 'cancelled']).toContain(view.session().toolCalls.find(tool => tool.id === request.toolCallId)?.status)
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('isolates concurrent project sessions by canonical root and independent stdio lifecycle', async () => {
    const gate = deferred(), view = setup([{ ...actualCall('one'), wait: gate }, { ...actualCall('two'), wait: gate }, {}, {}])
    const secondDirectory = join(view.root, 'second'); mkdirSync(secondDirectory)
    const secondConfig = view.store.forProject(secondDirectory).save({ name: 'Second project echo', command: process.execPath, args: [view.script], enabled: true })
    const secondProject = view.database.harness.createProject(secondDirectory), second = view.database.harness.createSession(secondProject.id); view.sessionIds.push(second.id)
    view.database.harness.updateSession({ ...second, titleSource: 'manual', delegationEnabled: false, permissionMode: 'full', activeMcpServerIds: [secondConfig.id] })
    const first = view.run(), other = view.run(second.id)
    await vi.waitFor(() => expect(view.contexts).toHaveLength(2)); gate.resolve(); await Promise.all([first, other])
    expect(view.config.id).not.toBe(secondConfig.id)
    const starts = view.rows().filter(row => row.event === 'start'); expect(starts).toHaveLength(2); expect(new Set(starts.map(row => row.pid)).size).toBe(2)
    expect(starts.map(row => row.cwd)).toEqual(expect.arrayContaining([view.directory, secondDirectory]))
    expect(view.rows().filter(row => row.event === 'call')).toHaveLength(2); expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('lets a real child borrow the parent project MCP connection and records its separate identity', async () => {
    const view = setup([{ tools: () => [{ id: 'delegate', name: 'delegate_task', arguments: { role: 'implementer', task: 'Use selected project MCP once' } }] }, { tools: () => [{ id: 'wait', name: 'wait_for_tasks', arguments: {} }] }, {}], { childSteps: [actualCall('child'), {}] }); await view.run()
    const task = view.session().messages.find(message => message.run?.subtasks?.length)?.run?.subtasks?.[0]
    expect(task).toMatchObject({ status: 'completed', report: 'Project child report', usage: { totalTokens: 24 } })
    expect(view.session().toolCalls.find(tool => tool.subtaskId === task!.id)).toMatchObject({ label: 'echo', status: 'ok', output: { text: 'project-real:child' } })
    expect(view.rows().filter(row => row.event === 'start')).toHaveLength(1); expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('stops an actual long project MCP call and releases its process before terminal publication', async () => {
    const view = setup([actualCall('hold'), {}]), pending = view.run()
    await vi.waitFor(() => expect(view.rows().filter(row => row.event === 'call')).toHaveLength(1)); const pid = view.rows()[0].pid
    expect(alive(pid)).toBe(true); expect(view.runtime.abort(view.sessionId)).toBe(true); await pending
    expect(alive(pid)).toBe(false); expect(view.session().activeRun).toBeUndefined(); expect(view.session().messages.at(-1)?.run?.status).toBe('stopped')
    expect(view.session().toolCalls.find(tool => tool.tool.startsWith('mira_mcp_'))?.status).toBe('cancelled')
  })
})
