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
import { MiraPaths } from '../electron/storage/miraPaths'
import type { HarnessEvent } from '../src/config/harness'

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
type ToolCall = { id: string; name: string; arguments: Record<string, unknown> }
type Step = { tools?: ToolCall[]; wait?: ReturnType<typeof deferred> }
const fixtures: ReturnType<typeof setup>[] = []
const sdkModule = (name: string) => pathToFileURL(createRequire(import.meta.url).resolve(name)).href
const mcpName = (tool = 'echo') => `mira_mcp_${createHash('sha256').update('plugin:child-probe@local:echo').digest('hex').slice(0, 10)}_${tool}_${createHash('sha256').update(tool).digest('hex').slice(0, 8)}`
const call = (text: string, id = 'same-provider-call'): ToolCall => ({ id, name: mcpName(), arguments: { text } })
const delegate = (role = 'implementer', agent?: string): ToolCall => ({ id: 'parent-delegate', name: 'delegate_task', arguments: { role, task: 'Inspect selected MCP service', ...(agent ? { agent } : {}) } })
const waitTasks: Step = { tools: [{ id: 'parent-wait', name: 'wait_for_tasks', arguments: {} }] }
function alive(pid: number) { try { process.kill(pid, 0); return true } catch { return false } }
afterEach(async () => {
  for (const view of fixtures) { view.runtime.abort(view.sessionId); [...view.parentSteps, ...view.childSteps].forEach(step => step.wait?.resolve()) }
  await Promise.allSettled(fixtures.flatMap(view => view.runs))
  await Promise.all(fixtures.map(view => view.manager.closeAll()))
  vi.restoreAllMocks()
  for (const view of fixtures.splice(0)) { view.database.close(); rmSync(view.root, { recursive: true, force: true }) }
})

/** Real parent and child Agents, SQLite, MCP SDK and stdio process; only model responses are controlled. */
function setup(childSteps: Step[] = [{}], options: { permission?: 'default' | 'full'; parentSteps?: Step[]; profile?: string; selected?: boolean } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-child-plugin-mcp-')))
  const database = new PlatformDatabase(new MiraPaths(root)), directory = join(root, 'project'), permission = options.permission || 'full'
  mkdirSync(directory)
  const project = database.harness.createProject(directory), created = database.harness.createSession(project.id)
  database.harness.savePermissionConfig({ ...database.harness.getPermissionConfig(), globalDefaultMode: permission })
  database.models.save({ id: 'fixture', name: 'Fixture', endpoint: 'http://127.0.0.1:1/v1', authMode: 'none', enabled: true, models: [{ id: 'model', enabled: true, reasoning: false }] })
  const manager = new McpManager(), runtime = new HarnessRuntime(database, manager)
  vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, session) => session)
  vi.spyOn(database.memories, 'enabled').mockReturnValue(false)
  const packageRoot = join(root, 'package'), manifest = join(packageRoot, '.mira-plugin/plugin.json'), log = join(root, 'server.jsonl'), script = join(packageRoot, 'server.mjs')
  mkdirSync(join(packageRoot, '.mira-plugin'), { recursive: true })
  writeFileSync(script, `
import { appendFileSync } from 'node:fs';
import { Server } from ${JSON.stringify(sdkModule('@modelcontextprotocol/sdk/server/index.js'))};
import { StdioServerTransport } from ${JSON.stringify(sdkModule('@modelcontextprotocol/sdk/server/stdio.js'))};
import { ListToolsRequestSchema, CallToolRequestSchema } from ${JSON.stringify(sdkModule('@modelcontextprotocol/sdk/types.js'))};
const log=(row)=>appendFileSync(${JSON.stringify(log)},JSON.stringify({pid:process.pid,cwd:process.cwd(),...row})+'\\n');
log({event:'start'});
const server=new Server({name:'mira-subtask-mcp-fixture',version:'1'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'echo',description:'Real child MCP fixture',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}]}));
server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
  log({event:'call',args:request.params.arguments});
  if(request.params.arguments.text==='crash') process.exit(23);
  if(request.params.arguments.text==='hold') await new Promise(resolve=>extra.signal.addEventListener('abort',()=>{log({event:'cancel'});resolve();},{once:true}));
  return {content:[{type:'text',text:'actual-stdio:'+request.params.arguments.text}]};
});
await server.connect(new StdioServerTransport());
`)
  writeFileSync(manifest, JSON.stringify({ name: 'child-probe', mcpServers: { echo: { command: process.execPath, args: [script], cwd: '${MIRA_PROJECT_DIR}', env: { FIXTURE_PRIVATE_TOKEN: 'mcp-private-config-token' } } } }))
  if (options.profile) { mkdirSync(join(packageRoot, 'agents')); writeFileSync(join(packageRoot, 'agents/auditor.md'), `---\nname: auditor\ndescription: Inspect selected service\n${options.profile}\n---\nPRIVATE_CHILD_PROFILE_BODY`) }
  database.plugins.register(packageRoot)
  database.harness.updateSession({ ...created, delegationEnabled: true, titleSource: 'manual', permissionMode: permission, pluginCatalog: database.plugins.snapshots(), activeMcpServerIds: options.selected === false ? [] : ['plugin:child-probe@local:echo'] })
  const parentSteps = options.parentSteps || [{ tools: [delegate('implementer', options.profile ? 'child-probe:auditor' : undefined)] }, waitTasks, {}]
  const contexts: Array<{ child: boolean; messages: any[]; tools: any[]; systemPrompt: string }> = [], events: HarnessEvent[] = []
  let parentOrdinal = 0, childOrdinal = 0
  const original = modelProvider.createHarnessModelProvider
  vi.spyOn(modelProvider, 'createHarnessModelProvider').mockImplementation((...args) => {
    const configured = original(...args)
    vi.spyOn(configured.models, 'streamSimple').mockImplementation((_model, context, streamOptions) => {
      const child = context.systemPrompt?.startsWith('你是 Mira 的 ') === true
      const step = (child ? childSteps[childOrdinal++] : parentSteps[parentOrdinal++]) || {}
      const text = child ? 'Real child report' : 'Real parent response'
      contexts.push({ child, messages: structuredClone(context.messages), tools: JSON.parse(JSON.stringify(context.tools || [])), systemPrompt: context.systemPrompt || '' })
      const stream = createAssistantMessageEventStream()
      const message: any = { role: 'assistant', content: [{ type: 'text', text }, ...(step.tools || []).map(tool => ({ type: 'toolCall', ...tool }))], api: 'openai-completions', provider: 'mira-openai', model: 'model', timestamp: Date.now(), stopReason: step.tools?.length ? 'toolUse' : 'stop', usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
      void (async () => {
        await Promise.resolve()
        stream.push({ type: 'start', partial: message }); stream.push({ type: 'text_start', contentIndex: 0, partial: message }); stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: message }); stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: message })
        if (step.wait) await Promise.race([step.wait.promise, new Promise<void>(resolve => { if (streamOptions?.signal?.aborted) resolve(); else streamOptions?.signal?.addEventListener('abort', () => resolve(), { once: true }) })])
        for (const [index, tool] of (step.tools || []).entries()) stream.push({ type: 'toolcall_end', contentIndex: index + 1, toolCall: tool as any, partial: message })
        stream.push({ type: 'done', reason: message.stopReason, message })
      })()
      return stream
    })
    return configured
  })
  const sender: any = { isDestroyed: () => false, send: (_channel: string, event: HarnessEvent) => events.push(structuredClone(event)) }
  const runs: Promise<unknown>[] = []
  const run = () => { const result = runtime.runMessage(sender, created.id, 'Delegate inspection of the selected plugin', [], { providerId: 'fixture', modelId: 'model' }); result.catch(() => {}); runs.push(result); return result }
  const rows = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { pid: number; cwd: string; event: string; args?: Record<string, unknown> }) : []
  const session = () => database.harness.getSession(created.id)
  const children = () => session().activeRun?.subtasks || session().messages.filter(message => message.run?.subtasks?.length).at(-1)?.run?.subtasks || []
  const changeDefinition = () => { const current = JSON.parse(readFileSync(manifest, 'utf8')); current.mcpServers.echo.env.FIXTURE_PRIVATE_TOKEN = 'updated-private-token'; writeFileSync(manifest, JSON.stringify(current)) }
  const view = { root, database, directory, manager, runtime, sessionId: created.id, parentSteps, childSteps, contexts, events, sender, runs, run, manifest, rows, session, children, changeDefinition }
  fixtures.push(view)
  return view
}

describe('subtask Agent borrowing selected parent plugin MCP', () => {
  it('executes a real MCP tool in the child with schema, public identity, report and usage intact', async () => {
    const view = setup([{ tools: [call('child')] }, {}]); await view.run()
    const childContexts = view.contexts.filter(context => context.child), task = view.children()[0]
    expect(childContexts[0].tools.find(tool => tool.name === mcpName())).toMatchObject({ parameters: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } })
    expect(childContexts[0].tools.map(tool => tool.name)).not.toContain('delegate_task')
    expect(view.rows().filter(row => row.event === 'call')).toMatchObject([{ args: { text: 'child' }, cwd: view.directory }])
    expect(JSON.stringify(childContexts[1].messages)).toContain('actual-stdio:child')
    expect(task).toMatchObject({ status: 'completed', report: 'Real child report', usage: { totalTokens: 24 } })
    expect(task.activities).toContainEqual(expect.objectContaining({ kind: 'tool', label: 'echo', status: 'completed' }))
    expect(task.activities.some(activity => activity.label.includes('mira_mcp_'))).toBe(false)
    const record = view.session().toolCalls.find(tool => tool.subtaskId === task.id && tool.tool === mcpName())!
    expect(record).toMatchObject({ label: 'echo', status: 'ok', providerCallId: 'same-provider-call', output: { text: 'actual-stdio:child' } })
    expect(task.parts).toContainEqual(expect.objectContaining({ type: 'tool', toolCallId: record.id }))
    expect(new Set(view.rows().map(row => row.pid)).size).toBe(1)
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
    expect(JSON.stringify([view.contexts, view.session(), view.events])).not.toContain('mcp-private-config-token')
    expect(JSON.stringify([view.session(), view.events])).not.toContain('server.mjs')
  })

  it('does not start or expose unselected plugin MCP to a child', async () => {
    const view = setup([{}], { selected: false }); await view.run()
    expect(view.rows()).toEqual([])
    expect(view.contexts.filter(context => context.child)[0].tools.some(tool => tool.name.startsWith('mira_mcp_'))).toBe(false)
    expect(view.children()[0].status).toBe('completed')
  })

  it.each(['explorer', 'reviewer'] as const)('preserves the %s read-only role even if a selected server is available', async role => {
    const view = setup([{}], { parentSteps: [{ tools: [delegate(role)] }, waitTasks, {}] }); await view.run()
    const tools = view.contexts.find(context => context.child)!.tools.map(tool => tool.name)
    expect(tools.some(name => name.startsWith('mira_mcp_'))).toBe(false)
    expect(tools).not.toContain('write'); expect(tools).not.toContain('bash')
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('does not let an explicit MCP profile exceed a reviewer role ceiling', async () => {
    const view = setup([{}], { profile: 'tools: [mcp, Write, Bash]', parentSteps: [{ tools: [delegate('reviewer', 'child-probe:auditor')] }, waitTasks, {}] }); await view.run()
    expect(view.contexts.find(context => context.child)!.tools).toEqual([])
    expect(view.children()[0].status).toBe('completed')
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
  })

  it('gives a tester the selected MCP while retaining its local role limits', async () => {
    const view = setup([{ tools: [call('tester')] }, {}], { parentSteps: [{ tools: [delegate('tester')] }, waitTasks, {}] }); await view.run()
    const tools = view.contexts.find(context => context.child)!.tools.map(tool => tool.name)
    expect(tools).toContain(mcpName()); expect(tools).toContain('bash')
    expect(tools).not.toContain('write'); expect(tools).not.toContain('edit')
    expect(view.rows().filter(row => row.event === 'call')).toMatchObject([{ args: { text: 'tester' } }])
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it.each(['mcp', 'mcp__plugin:child-probe:echo__*', 'mcp__plugin:child-probe:echo__echo', mcpName()])('honors the explicit profile MCP rule %s without granting local write or delegate tools', async rule => {
    const view = setup([{ tools: [call('profile')] }, {}], { profile: `tools: [${rule}]` }); await view.run()
    expect(view.contexts.find(context => context.child)!.tools.map(tool => tool.name)).toEqual([mcpName()])
    expect(view.rows().filter(row => row.event === 'call')).toMatchObject([{ args: { text: 'profile' } }])
    expect(view.children()[0]).toMatchObject({ status: 'completed', agentName: 'child-probe:auditor' })
    expect(JSON.stringify([view.session(), view.events])).not.toContain('PRIVATE_CHILD_PROFILE_BODY')
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it.each(['tools: []', 'tools: [Read]', 'tools: [mcp]\ndisallowedTools: [mcp]', 'tools: [mcp]\ndisallowedTools: [mcp__plugin:child-probe:echo__echo]'])('explicit profile limits can remove borrowed MCP (%s)', async profile => {
    const view = setup([{}], { profile }); await view.run()
    const tools = view.contexts.find(context => context.child)!.tools.map(tool => tool.name)
    expect(tools.some(name => name.startsWith('mira_mcp_'))).toBe(false)
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    expect(view.children()[0].status).toBe('completed')
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it.each([undefined, 'tools: [mcp]'])('identifies the requesting child in parent-session approval before any MCP side effect (%s)', async profile => {
    const view = setup([{ tools: [call('approved')] }, {}], { permission: 'default', profile }), pending = view.run()
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const request = view.runtime.listPendingPermissions(view.sessionId)[0], task = view.children()[0]
    expect(request.title).toBe(`允许 Mira 子智能体“${profile ? 'child-probe:auditor' : '实现'}”调用 MCP 工具“echo”？`)
    expect(request.detail).toContain('子任务：Inspect selected MCP service')
    expect(request.detail).toContain('echo')
    expect(JSON.stringify(request)).not.toMatch(/PRIVATE_CHILD_PROFILE_BODY|mcp-private-config-token/)
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    expect(view.session().toolCalls.find(record => record.id === request.toolCallId)).toMatchObject({ subtaskId: task.id, status: 'waiting-confirm', approvalRequestId: request.requestId, label: 'echo' })
    view.runtime.resolvePermission(request.requestId, true); await pending
    expect(view.rows().filter(row => row.event === 'call')).toMatchObject([{ args: { text: 'approved' } }])
    expect(view.session().toolCalls.find(record => record.id === request.toolCallId)).toMatchObject({ status: 'ok', subtaskId: task.id })
    expect(view.runtime.listPendingPermissions(view.sessionId)).toEqual([])
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('rejects malformed child MCP arguments before approval or any server request', async () => {
    const view = setup([{ tools: [{ ...call('invalid'), arguments: {} }] }, {}], { permission: 'default' }); await view.run()
    expect(view.runtime.listPendingPermissions(view.sessionId)).toEqual([])
    expect(view.events.some(event => event.type === 'permission-request')).toBe(false)
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    expect(JSON.stringify(view.contexts.filter(context => context.child)[1].messages)).toContain('Validation failed')
    expect(view.session().toolCalls.find(record => record.subtaskId && record.tool === mcpName())?.status).toBe('failed')
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it.each(['deny', 'stop'] as const)('clears child approval on %s without calling the MCP server', async decision => {
    const view = setup([{ tools: [call('must-not-run')] }, {}], { permission: 'default' }), pending = view.run()
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const request = view.runtime.listPendingPermissions(view.sessionId)[0]
    if (decision === 'deny') view.runtime.resolvePermission(request.requestId, false)
    else view.runtime.abort(view.sessionId)
    await pending
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    expect(view.runtime.listPendingPermissions(view.sessionId)).toEqual([])
    expect(view.session().toolCalls.find(record => record.id === request.toolCallId)?.status).toBe('cancelled')
    if (decision === 'deny') expect(JSON.stringify(view.session().toolCalls.find(record => record.id === request.toolCallId))).toContain('拒绝')
    expect(view.children()[0].status).toBe(decision === 'deny' ? 'completed' : 'stopped')
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('child stop aborts its pending approval while the parent keeps using the same MCP connection', async () => {
    const gate = deferred(), view = setup([{ tools: [call('must-not-run')] }, {}], { permission: 'default', parentSteps: [{ tools: [delegate()] }, { wait: gate, tools: [{ id: 'stop-child', name: 'stop_tasks', arguments: {} }] }, { tools: [call('parent-after-stop', 'parent-after-stop')] }, {}] })
    const pending = view.run()
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const childRequest = view.runtime.listPendingPermissions(view.sessionId)[0]
    gate.resolve()
    await vi.waitFor(() => {
      expect(view.children()[0].status).toBe('stopped')
      const requests = view.runtime.listPendingPermissions(view.sessionId)
      expect(requests).toHaveLength(1); expect(requests[0].requestId).not.toBe(childRequest.requestId)
    })
    const parentRequest = view.runtime.listPendingPermissions(view.sessionId)[0]
    view.runtime.resolvePermission(childRequest.requestId, true)
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    view.runtime.resolvePermission(parentRequest.requestId, true); await pending
    expect(view.rows().filter(row => row.event === 'call').map(row => row.args?.text)).toEqual(['parent-after-stop'])
    expect(new Set(view.rows().map(row => row.pid)).size).toBe(1)
    expect(view.session().toolCalls.find(record => record.id === childRequest.toolCallId)?.status).toBe('cancelled')
    expect(view.session().toolCalls.find(record => record.id === parentRequest.toolCallId)?.status).toBe('ok')
    expect(view.runtime.listPendingPermissions(view.sessionId)).toEqual([])
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('keeps repeated provider call IDs distinct across parent and child MCP records', async () => {
    const view = setup([{ tools: [call('child')] }, {}], { parentSteps: [{ tools: [delegate()] }, waitTasks, { tools: [call('parent')] }, {}] }); await view.run()
    const records = view.session().toolCalls.filter(record => record.tool === mcpName())
    expect(records).toHaveLength(2)
    expect(new Set(records.map(record => record.id)).size).toBe(2)
    expect(records.every(record => record.providerCallId === 'same-provider-call' && record.status === 'ok')).toBe(true)
    expect(records.filter(record => record.subtaskId)).toHaveLength(1)
    expect(view.rows().filter(row => row.event === 'call').map(row => row.args?.text)).toEqual(['child', 'parent'])
    expect(new Set(view.rows().map(row => row.pid)).size).toBe(1)
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('surfaces a crashed MCP service without recreating it or letting a later child call escape', async () => {
    const view = setup([{ tools: [call('crash')] }, { tools: [call('after-crash', 'after-crash')] }, {}]); await view.run()
    expect(view.rows().filter(row => row.event === 'call').map(row => row.args?.text)).toEqual(['crash'])
    expect(view.rows().filter(row => row.event === 'start')).toHaveLength(1)
    const records = view.session().toolCalls.filter(record => record.tool === mcpName() && record.subtaskId)
    expect(records).toHaveLength(2); expect(records.every(record => record.status === 'failed')).toBe(true)
    expect(JSON.stringify(records[1])).toContain('断开')
    expect(view.children()[0].status).toBe('completed')
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it.each(['disable', 'change'] as const)('blocks plugin %s while child waits for approval', async change => {
    const view = setup([{ tools: [call('must-not-run')] }, {}], { permission: 'default' }), pending = view.run()
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const request = view.runtime.listPendingPermissions(view.sessionId)[0]
    if (change === 'disable') view.database.plugins.setEnabled('child-probe@local', false)
    else view.changeDefinition()
    view.runtime.resolvePermission(request.requestId, true); await pending
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    const record = view.session().toolCalls.find(record => record.id === request.toolCallId)!
    expect(['failed', 'cancelled']).toContain(record.status)
    expect(JSON.stringify(record)).toContain(change === 'disable' ? '停用' : '变化')
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('blocks a previously connected MCP service deselected while child approval is pending', async () => {
    const view = setup([{ tools: [call('must-not-run')] }, {}], { permission: 'default' }), pending = view.run()
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const request = view.runtime.listPendingPermissions(view.sessionId)[0]
    expect(view.rows().filter(row => row.event === 'start')).toHaveLength(1)
    view.database.harness.updateSession({ ...view.session(), activeMcpServerIds: [] })
    view.runtime.resolvePermission(request.requestId, true); await pending
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    expect(['failed', 'cancelled']).toContain(view.session().toolCalls.find(record => record.id === request.toolCallId)?.status)
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
    expect(view.runtime.listPendingPermissions(view.sessionId)).toEqual([])
  })

  it('stopping a child cancels its call while preserving the borrowed parent connection', async () => {
    const gate = deferred(), view = setup([{ tools: [call('hold')] }, {}], { parentSteps: [{ tools: [delegate()] }, { wait: gate, tools: [{ id: 'stop-child', name: 'stop_tasks', arguments: {} }] }, { tools: [call('parent-after-stop', 'parent-echo')] }, {}] })
    const pending = view.run()
    await vi.waitFor(() => expect(view.rows().filter(row => row.event === 'call')).toHaveLength(1))
    const pid = view.rows()[0].pid; expect(alive(pid)).toBe(true)
    gate.resolve(); await pending
    expect(view.rows().filter(row => row.event === 'call').map(row => row.args?.text)).toEqual(['hold', 'parent-after-stop'])
    expect(new Set(view.rows().filter(row => row.event === 'start').map(row => row.pid)).size).toBe(1)
    expect(view.children()[0].status).toBe('stopped')
    expect(view.session().toolCalls.find(record => record.subtaskId && record.tool === mcpName())?.status).toBe('cancelled')
    expect(view.session().toolCalls.find(record => !record.subtaskId && record.tool === mcpName())?.status).toBe('ok')
    expect(alive(pid)).toBe(false)
  })

  it('stopping the parent cancels child MCP and exits its owned process before publishing terminal state', async () => {
    const view = setup([{ tools: [call('hold')] }, {}]), pending = view.run()
    await vi.waitFor(() => expect(view.rows().filter(row => row.event === 'call')).toHaveLength(1))
    const pid = view.rows()[0].pid; expect(alive(pid)).toBe(true)
    expect(view.runtime.abort(view.sessionId)).toBe(true); await pending
    expect(view.session().activeRun).toBeUndefined()
    expect(view.children()[0].status).toBe('stopped')
    expect(view.session().messages.at(-1)?.run?.status).toBe('stopped')
    expect(view.session().toolCalls.find(record => record.subtaskId && record.tool === mcpName())?.status).toBe('cancelled')
    expect(alive(pid)).toBe(false)
    expect(view.runtime.listPendingPermissions(view.sessionId)).toEqual([])
  })
})
