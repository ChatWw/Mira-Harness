import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { McpManager } from '../electron/adapters/mcpManager'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import { MiraFlowController } from '../electron/services/flows/miraFlowController'
import { PlatformDatabase } from '../electron/storage/database'
import { McpConfigStore } from '../electron/storage/mcpConfigStore'
import { MiraPaths } from '../electron/storage/miraPaths'
import type { MiraHookEvent } from '../src/config/miraHooks'
import type { HarnessEvent } from '../src/config/harness'

const require = createRequire(import.meta.url)
let resourcesRoot: string, resources: string
beforeAll(() => {
  resourcesRoot = realpathSync(mkdtempSync(join(tmpdir(), 'mira-flow-capabilities-')))
  resources = join(resourcesRoot, 'resources')
  execFileSync(process.execPath, ['--input-type=module', '-e', 'import {buildMiraFlow} from "./scripts/build-mira-flow.mjs"; await buildMiraFlow(process.argv[1]);', resources], { cwd: resolve('.'), stdio: 'pipe' })
}, 20_000)
afterAll(() => rmSync(resourcesRoot, { recursive: true, force: true }))

type Request = { messages: any[]; tools?: Array<{ function: { name: string; description?: string } }> }
type Reply = { name?: string; args?: unknown; text?: string; id?: string }
type Row = { pid: number; kind: string; event: string; cwd: string; args?: { text: string }; input?: any }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
function alive(pid: number) { try { process.kill(pid, 0); return true } catch { return false } }
function jsonRows(path: string): Row[] { return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [] }
function mcpCall(request: Request, kind: 'project' | 'plugin', text: string, id = 'reused-actor-call'): Reply {
  const tool = request.tools?.find(tool => tool.function.description?.includes(`Real ${kind} workflow echo`))
  if (!tool) throw new Error(`Selected ${kind} MCP is missing from the actual actor HTTP tool schema`)
  return { name: tool.function.name, args: { text }, id }
}

/** Only HTTP model replies are controlled. Agent, compiler, controller, journal, SDK and subprocesses are real. */
async function setup(actor: (request: Request, ordinal: number) => Reply | Promise<Reply>, options: { selected?: boolean; permission?: 'default' | 'full'; script?: string } = {}) {
  const root = realpathSync(mkdtempSync(join(resourcesRoot, 'fixture-'))), directory = join(root, 'project'), plugin = join(root, 'plugin')
  mkdirSync(directory); mkdirSync(join(plugin, '.mira-plugin'), { recursive: true })
  writeFileSync(join(directory, 'first.txt'), 'ORIGINAL'); writeFileSync(join(directory, 'second.txt'), 'REWRITTEN-REAL-CONTENT')
  const log = join(root, 'mcp.jsonl'), hookLog = join(root, 'hooks.jsonl'), releases: Array<() => void> = []
  const serverSource = `
import { appendFileSync } from 'node:fs';
import { Server } from ${JSON.stringify(require.resolve('@modelcontextprotocol/sdk/server/index.js'))};
import { StdioServerTransport } from ${JSON.stringify(require.resolve('@modelcontextprotocol/sdk/server/stdio.js'))};
import { ListToolsRequestSchema, CallToolRequestSchema } from ${JSON.stringify(require.resolve('@modelcontextprotocol/sdk/types.js'))};
const kind=process.argv[2]; const log=row=>appendFileSync(${JSON.stringify(log)},JSON.stringify({pid:process.pid,kind,cwd:process.cwd(),...row})+'\\n'); log({event:'start'});
const server=new Server({name:'mira-workflow-'+kind,version:'1'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'echo',description:'Real '+kind+' workflow echo',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}]}));
server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{log({event:'call',args:request.params.arguments}); if(request.params.arguments.text==='hold') await new Promise(done=>extra.signal.addEventListener('abort',()=>{log({event:'cancel'});done();},{once:true})); return {content:[{type:'text',text:kind+':real:'+request.params.arguments.text}]};});
await server.connect(new StdioServerTransport());`
  const mcpScript = join(root, 'mcp.mjs'); writeFileSync(mcpScript, serverSource)
  const database = new PlatformDatabase(new MiraPaths(root)), mcpStore = new McpConfigStore(root), projectStore = mcpStore.forProject(directory)
  const config = projectStore.save({ name: 'Project workflow', command: process.execPath, args: [mcpScript, 'project'], enabled: true })
  writeFileSync(join(plugin, '.mira-plugin', 'plugin.json'), JSON.stringify({ name: 'workflow-probe', mcpServers: { echo: { command: process.execPath, args: [mcpScript, 'plugin'], cwd: '${MIRA_PROJECT_DIR}' } } }))
  database.plugins.register(plugin)
  const permission = options.permission ?? 'full'
  database.harness.savePermissionConfig({ ...database.harness.getPermissionConfig(), globalDefaultMode: permission, fullAccessEnabled: true })
  const project = database.harness.createProject(directory), parent = database.harness.createSession(project.id, permission)
  database.harness.updateSession({ ...parent, title: 'Actor capability acceptance', titleSource: 'manual', pluginCatalog: database.plugins.snapshots(), activeMcpServerIds: options.selected === false ? [] : [config.id, 'plugin:workflow-probe@local:echo'] })
  const requests: Array<{ actor: boolean; body: Request }> = [], errors: string[] = []
  let mainOrdinal = 0, actorOrdinal = 0
  const script = options.script ?? 'return await agent("worker").ask("ACTOR inspect selected capabilities");'
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Request
      const isActor = !body.tools?.some(tool => tool.function.name === 'create_workflow')
      requests.push({ actor: isActor, body })
      const reply = isActor ? await actor(body, actorOrdinal++) : ++mainOrdinal === 1 ? { name: 'create_workflow', args: { name: 'Actor capabilities', script } } : { text: '工作流状态已回报。' }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const chunk = (delta: unknown, finish: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'capability-reply', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
      if (reply.name) { chunk({ role: 'assistant', tool_calls: [{ index: 0, id: reply.id ?? 'actor-tool', type: 'function', function: { name: reply.name, arguments: JSON.stringify(reply.args ?? {}) } }] }); chunk({}, 'tool_calls') }
      else { chunk({ role: 'assistant', content: reply.text ?? 'ACTOR completed' }); chunk({}, 'stop') }
      response.end('data: [DONE]\n\n')
    } catch (error) { errors.push(String(error)); response.writeHead(500); response.end('controlled model fixture failed') }
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  database.models.save({ id: 'fixture', name: 'Controlled HTTP', endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, authMode: 'none', enabled: true, models: [{ id: 'fixture', enabled: true, reasoning: false, contextWindow: 32000 }] })
  const manager = new McpManager(), runtime = new HarnessRuntime(database, manager, undefined, mcpStore), events: HarnessEvent[] = []
  const sender = { isDestroyed: () => false, send: (_channel: string, event: HarnessEvent) => events.push(structuredClone(event)) } as any
  const controller = new MiraFlowController({ database, runtime, paths: new MiraPaths(root), resourceRoot: resources })
  let pending: Promise<unknown> | undefined
  const launch = async () => {
    pending = runtime.runMessage(sender, parent.id, '/workflow 核验智能体能力', [], { providerId: 'fixture', modelId: 'fixture' })
    pending.catch(() => undefined)
    await vi.waitFor(() => expect(runtime.listPendingPermissions(parent.id).some(item => item.workflowReview)).toBe(true), { timeout: 10_000 })
    runtime.resolvePermission(runtime.listPendingPermissions(parent.id).find(item => item.workflowReview)!.requestId, true)
    await pending
    const run = database.flowJournal.listRuns(parent.id)[0]!
    expect(run).toBeDefined()
    return run.runId
  }
  const settle = async () => {
    await vi.waitFor(() => expect(controller.hasActiveSession(parent.id)).toBe(false), { timeout: 10_000 })
    const run = database.flowJournal.listRuns(parent.id)[0]!
    expect(run.status, JSON.stringify({ errors, failure: run.failure })).toBe('completed')
    return run
  }
  const addHook = (event: MiraHookEvent, body: string, trust = true, matcher?: string) => {
    const path = join(directory, `hook-${event}-${database.hooks.list(directory).length}.cjs`)
    writeFileSync(path, `const fs=require('node:fs');let text='';process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>{const input=JSON.parse(text);fs.appendFileSync(${JSON.stringify(hookLog)},JSON.stringify({pid:process.pid,kind:'hook',event:input.hookEventName,cwd:process.cwd(),input})+'\\n');${body}});`)
    const hook = database.hooks.save({ scope: 'project', name: event, event, type: 'process', command: process.execPath, args: [path], ...(matcher ? { matcher } : {}) }, directory)
    if (trust) database.hooks.trust({ scope: 'project', id: hook.id, expectedRevision: hook.revision }, directory)
    else {
      // A declaration edited outside the host loses its exact revision approval.
      const source = JSON.parse(readFileSync(hook.sourcePath, 'utf8'))
      source.hooks.find((row: { id: string }) => row.id === hook.id).name += ' externally edited'
      writeFileSync(hook.sourcePath, JSON.stringify(source))
      expect(database.hooks.list(directory).find(row => row.id === hook.id)?.trusted).toBe(false)
    }
    return hook
  }
  const close = async () => {
    releases.forEach(release => release()); runtime.abort(parent.id); await controller.dispose(); await pending?.catch(() => undefined)
    server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await manager.closeAll(); database.close()
  }
  return { root, directory, database, projectStore, config, runtime, controller, parent, requests, events, errors, launch, settle, addHook, releases, close, rows: () => jsonRows(log), hooks: () => jsonRows(hookLog) }
}

describe('real workflow actor inherited capabilities', () => {
  it('uses selected project and plugin MCP after the main reply, retains separate reused-call records and closes owned processes', async () => {
    const gate = deferred()
    const view = await setup(async (request, ordinal) => { if (!ordinal) { await gate.promise; return mcpCall(request, 'project', 'first') } if (ordinal === 1) return mcpCall(request, 'plugin', 'second'); return { text: 'ACTOR verified both MCP results' } })
    view.releases.push(gate.resolve)
    try {
      const runId = await view.launch()
      expect(view.database.harness.getSession(view.parent.id).activeRun).toBeUndefined()
      await vi.waitFor(() => expect(view.requests.filter(row => row.actor)).toHaveLength(1))
      gate.resolve(); await view.settle()
      expect(view.errors).toEqual([])
      expect(view.rows().filter(row => row.event === 'call')).toMatchObject([{ kind: 'project', args: { text: 'first' } }, { kind: 'plugin', args: { text: 'second' } }])
      const actorRequests = view.requests.filter(row => row.actor)
      expect(JSON.stringify(actorRequests[1]!.body.messages)).toContain('project:real:first')
      expect(JSON.stringify(actorRequests[2]!.body.messages)).toContain('plugin:real:second')
      const records = view.database.harness.getSession(view.parent.id).toolCalls.filter(row => row.runId === runId && row.providerCallId === 'reused-actor-call')
      expect(records).toHaveLength(2); expect(new Set(records.map(row => row.id)).size).toBe(2)
      expect(records.map(row => row.status)).toEqual(['ok', 'ok'])
      await vi.waitFor(() => expect(view.rows().every(row => !alive(row.pid))).toBe(true))
    } finally { await view.close() }
  }, 30_000)

  it('does not start or advertise unselected project or plugin servers', async () => {
    const view = await setup(() => ({ text: 'ACTOR no MCP requested' }), { selected: false })
    try {
      await view.launch(); await view.settle()
      expect(view.rows()).toEqual([])
      expect(view.requests.filter(row => row.actor)[0]!.body.tools?.some(tool => tool.function.name.startsWith('mira_mcp_'))).toBe(false)
    } finally { await view.close() }
  }, 20_000)

  it('routes actor MCP approval to the parent and records denial without executing the server tool', async () => {
    const view = await setup((request, ordinal) => ordinal ? { text: 'ACTOR denied, no work performed' } : mcpCall(request, 'project', 'denied'), { permission: 'default' })
    try {
      const runId = await view.launch()
      await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.parent.id)).toHaveLength(1), { timeout: 10_000 })
      const permission = view.runtime.listPendingPermissions(view.parent.id)[0]!
      expect(permission).toMatchObject({ sessionId: view.parent.id, runId, toolCallId: expect.any(String) })
      expect(view.rows().filter(row => row.event === 'call')).toHaveLength(0)
      view.runtime.resolvePermission(permission.requestId, false); await view.settle()
      expect(view.rows().filter(row => row.event === 'call')).toHaveLength(0)
      expect(view.database.harness.getSession(view.parent.id).toolCalls.find(row => row.id === permission.toolCallId)).toMatchObject({ status: 'cancelled', approvalRequestId: permission.requestId })
    } finally { await view.close() }
  }, 30_000)

  it.each(['configuration', 'selection'] as const)('refuses an actor MCP call after its %s changes', async change => {
    const gate = deferred()
    const view = await setup(async (request, ordinal) => { if (!ordinal) { await gate.promise; return mcpCall(request, 'project', 'changed') } return { text: 'ACTOR observed configuration rejection' } })
    view.releases.push(gate.resolve)
    try {
      const runId = await view.launch()
      await vi.waitFor(() => expect(view.requests.some(row => row.actor)).toBe(true))
      if (change === 'configuration') view.projectStore.save({ ...view.config, args: [...view.config.args!, 'updated'] })
      else { const current = view.database.harness.getSession(view.parent.id); view.database.harness.updateSession({ ...current, activeMcpServerIds: [] }) }
      gate.resolve(); await view.settle()
      expect(view.rows().filter(row => row.event === 'call')).toHaveLength(0)
      expect(view.database.harness.getSession(view.parent.id).toolCalls.find(row => row.runId === runId && row.providerCallId === 'reused-actor-call')).toMatchObject({ status: 'failed', error: expect.stringContaining(change === 'configuration' ? '配置已变更' : '取消选择') })
    } finally { await view.close() }
  }, 30_000)

  it('runs actor SessionStart once and two ask hooks, rewrites read arguments and returns real PostToolUse context', async () => {
    const view = await setup((_request, ordinal) => ordinal === 0 || ordinal === 2 ? { name: 'read', args: { path: 'first.txt' }, id: 'same-read-call' } : { text: 'ACTOR read verified' }, { selected: false, script: 'const worker=agent("worker");await worker.ask("ACTOR first read");return await worker.ask("ACTOR second read");' })
    try {
      view.addHook('SessionStart', 'console.log(JSON.stringify({additionalContext:"REAL-ACTOR-SESSION-CONTEXT"}))')
      view.addHook('UserPromptSubmit', 'console.log(JSON.stringify({additionalContext:"REAL-ASK-CONTEXT:"+input.prompt}))')
      view.addHook('PreToolUse', 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",updatedInput:{path:"second.txt"}}}))', true, 'read')
      view.addHook('PostToolUse', 'console.log(JSON.stringify({additionalContext:"REAL-ACTOR-POST-CONTEXT"}))', true, 'read')
      const runId = await view.launch(); await view.settle()
      const childHooks = view.hooks().filter(row => row.input.sessionId !== view.parent.id)
      expect(childHooks.filter(row => row.event === 'SessionStart')).toHaveLength(1)
      expect(childHooks.filter(row => row.event === 'UserPromptSubmit')).toHaveLength(2)
      expect(childHooks.filter(row => row.event === 'PreToolUse')).toHaveLength(2)
      expect(childHooks.filter(row => row.event === 'PostToolUse')).toHaveLength(2)
      expect(new Set(childHooks.map(row => row.input.sessionId)).size).toBe(1)
      const actorRequests = view.requests.filter(row => row.actor)
      expect(actorRequests).toHaveLength(4)
      expect(JSON.stringify(actorRequests[0]!.body.messages)).toContain('REAL-ASK-CONTEXT')
      expect(JSON.stringify(actorRequests[1]!.body.messages)).toContain('REWRITTEN-REAL-CONTENT')
      expect(JSON.stringify(actorRequests[1]!.body.messages)).toContain('REAL-ACTOR-POST-CONTEXT')
      const records = view.database.harness.getSession(view.parent.id).toolCalls.filter(row => row.runId === runId && row.providerCallId === 'same-read-call')
      expect(records).toHaveLength(2); expect(new Set(records.map(row => row.id)).size).toBe(2)
      expect(records.every(row => row.input?.text.includes('second.txt') && row.status === 'ok')).toBe(true)
    } finally { await view.close() }
  }, 30_000)

  it('honors a trusted actor PreToolUse denial without writing a file', async () => {
    const view = await setup((_request, ordinal) => ordinal ? { text: 'ACTOR denied without mutation' } : { name: 'write', args: { path: 'denied.txt', content: 'NEVER' } }, { selected: false })
    try {
      view.addHook('PreToolUse', 'console.log(JSON.stringify({decision:"block",reason:"REAL-ACTOR-WRITE-DENIED"}))', true, 'write')
      const runId = await view.launch(); await view.settle()
      expect(existsSync(join(view.directory, 'denied.txt'))).toBe(false)
      expect(view.database.harness.getSession(view.parent.id).toolCalls.find(row => row.runId === runId && row.tool === 'write')).toMatchObject({ status: 'cancelled', error: expect.stringContaining('REAL-ACTOR-WRITE-DENIED') })
      expect(view.hooks().filter(row => row.input.sessionId !== view.parent.id && row.event === 'PreToolUse')).toHaveLength(1)
      expect(JSON.stringify(view.requests.filter(row => row.actor)[1]!.body.messages)).toContain('REAL-ACTOR-WRITE-DENIED')
    } finally { await view.close() }
  }, 30_000)

  it('skips an untrusted actor Hook without executing its process', async () => {
    const view = await setup((_request, ordinal) => ordinal ? { text: 'ACTOR read with untrusted Hook skipped' } : { name: 'read', args: { path: 'first.txt' } }, { selected: false })
    try {
      view.addHook('PreToolUse', 'console.log(JSON.stringify({additionalContext:"UNTRUSTED-SHOULD-NOT-RUN"}))', false, 'read')
      const runId = await view.launch(); await view.settle()
      expect(view.hooks()).toEqual([])
      expect(JSON.stringify(view.requests)).not.toContain('UNTRUSTED-SHOULD-NOT-RUN')
      expect(view.database.harness.getSession(view.parent.id).toolCalls.some(row => row.runId === runId && row.tool === 'hook' && row.status === 'cancelled' && row.skipReason?.includes('信任'))).toBe(true)
    } finally { await view.close() }
  }, 30_000)

  it('cancels and reaps an actual actor prompt Hook process without contacting its model', async () => {
    const view = await setup(() => ({ text: 'SHOULD-NOT-REQUEST-ACTOR' }), { selected: false })
    try {
      view.addHook('UserPromptSubmit', `if(input.sessionId!==${JSON.stringify(view.parent.id)})setInterval(()=>{},1000);else console.log(JSON.stringify({}));`)
      const runId = await view.launch()
      await vi.waitFor(() => expect(view.hooks().some(row => row.input.sessionId !== view.parent.id)).toBe(true), { timeout: 10_000 })
      const child = view.hooks().find(row => row.input.sessionId !== view.parent.id)!
      expect(alive(child.pid)).toBe(true)
      expect(view.requests.filter(row => row.actor)).toHaveLength(0)
      expect(view.runtime.abort(view.parent.id, runId)).toBe(true)
      await vi.waitFor(() => expect(view.controller.hasActiveSession(view.parent.id)).toBe(false), { timeout: 10_000 })
      await vi.waitFor(() => expect(alive(child.pid)).toBe(false))
      expect(view.database.flowJournal.getRun(runId)?.status).toBe('stopped')
      expect(view.requests.filter(row => row.actor)).toHaveLength(0)
    } finally { await view.close() }
  }, 30_000)
})
