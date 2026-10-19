import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
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
afterEach(async () => {
  for (const view of fixtures) { for (const id of view.sessionIds) view.runtime.abort(id); view.steps.forEach(step => step.wait?.resolve()) }
  await Promise.allSettled(fixtures.flatMap(view => view.runs))
  await Promise.all(fixtures.map(view => view.manager.closeAll()))
  vi.restoreAllMocks()
  for (const view of fixtures.splice(0)) { view.database.close(); rmSync(view.root, { recursive: true, force: true }) }
})
function alive(pid: number) { try { process.kill(pid, 0); return true } catch { return false } }
function mcpName(key = 'echo', plugin = 'probe', tool = 'echo') {
  return `mira_mcp_${createHash('sha256').update(`plugin:${plugin}@local:${key}`).digest('hex').slice(0, 10)}_${tool.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 28)}_${createHash('sha256').update(tool).digest('hex').slice(0, 8)}`
}
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq2kAAAAASUVORK5CYII='
const call = (text: string, key = 'echo', id = 'actual-plugin-call'): ToolCall => ({ id, name: mcpName(key), arguments: { text } })

/** Real Agent, SQLite and SDK stdio child; only the external model response is controlled. */
function setup(steps: Step[] = [{}], permission: 'default' | 'full' = 'full') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-runtime-plugin-mcp-')))
  const database = new PlatformDatabase(new MiraPaths(root)), directory = join(root, 'project')
  mkdirSync(directory)
  const project = database.harness.createProject(directory), created = database.harness.createSession(project.id)
  database.harness.updateSession({ ...created, delegationEnabled: false, titleSource: 'manual', permissionMode: permission })
  database.harness.savePermissionConfig({ ...database.harness.getPermissionConfig(), globalDefaultMode: permission })
  database.models.save({ id: 'fixture', name: 'Fixture', endpoint: 'http://127.0.0.1:1/v1', authMode: 'none', enabled: true, models: [{ id: 'model', enabled: true, reasoning: false }] })
  const manager = new McpManager(), runtime = new HarnessRuntime(database, manager)
  vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, session) => session)
  vi.spyOn(database.memories, 'enabled').mockReturnValue(false)
  const contexts: Array<{ messages: any[]; tools: any[]; systemPrompt: string }> = [], events: HarnessEvent[] = []
  const original = modelProvider.createHarnessModelProvider
  vi.spyOn(modelProvider, 'createHarnessModelProvider').mockImplementation((...args) => {
    const configured = original(...args)
    vi.spyOn(configured.models, 'streamSimple').mockImplementation((_model, context) => {
      const step = steps[contexts.length] || {}, text = 'Actual fixture response'
      contexts.push({ systemPrompt: context.systemPrompt || '', messages: structuredClone(context.messages), tools: JSON.parse(JSON.stringify(context.tools || [])) })
      const stream = createAssistantMessageEventStream()
      const message: any = { role: 'assistant', content: [{ type: 'text', text }, ...(step.tools || []).map(tool => ({ type: 'toolCall', ...tool }))], api: 'openai-completions', provider: 'mira-openai', model: 'model', timestamp: Date.now(), stopReason: step.tools?.length ? 'toolUse' : 'stop', usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
      void (async () => {
        await Promise.resolve()
        stream.push({ type: 'start', partial: message }); stream.push({ type: 'text_start', contentIndex: 0, partial: message }); stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: message }); stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: message })
        if (step.wait) await step.wait.promise
        for (const [index, tool] of (step.tools || []).entries()) stream.push({ type: 'toolcall_end', contentIndex: index + 1, toolCall: tool as any, partial: message })
        stream.push({ type: 'done', reason: message.stopReason, message })
      })()
      return stream
    })
    return configured
  })
  const sender: any = { isDestroyed: () => false, send: (_channel: string, event: HarnessEvent) => events.push(structuredClone(event)) }
  const runs: Promise<unknown>[] = [], sessionIds = [created.id]
  const run = (sessionId = created.id, prompt = 'Call selected plugin', planning = false) => { const result = runtime.runMessage(sender, sessionId, prompt, [], { providerId: 'fixture', modelId: 'model' }, planning); result.catch(() => {}); runs.push(result); return result }
  const packageRoot = join(root, 'package'), manifest = join(packageRoot, '.mira-plugin/plugin.json'), log = join(root, 'server.jsonl')
  mkdirSync(join(packageRoot, '.mira-plugin'), { recursive: true })
  const script = join(packageRoot, 'server.mjs')
  const source = `
import { appendFileSync } from 'node:fs';
import { Server } from ${JSON.stringify(sdkModule('@modelcontextprotocol/sdk/server/index.js'))};
import { StdioServerTransport } from ${JSON.stringify(sdkModule('@modelcontextprotocol/sdk/server/stdio.js'))};
import { ListToolsRequestSchema, CallToolRequestSchema } from ${JSON.stringify(sdkModule('@modelcontextprotocol/sdk/types.js'))};
const key=process.argv[2],toolNames=JSON.parse(process.argv[3]);
const log=(row)=>appendFileSync(${JSON.stringify(log)},JSON.stringify({pid:process.pid,key,cwd:process.cwd(),project:process.env.MIRA_PROJECT_DIR,plugin:process.env.MIRA_PLUGIN_ID,...row})+'\\n');
log({event:'start'});
const server=new Server({name:'mira-real-plugin-fixture',version:'1'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:toolNames.map(name=>({name,description:'Real plugin echo',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}))}));
server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
  log({event:'call',name:request.params.name,args:request.params.arguments});
  if(request.params.arguments.text==='hold') await new Promise(resolve=>{extra.signal.addEventListener('abort',()=>{log({event:'cancel'});resolve();},{once:true});});
  return {isError:request.params.arguments.text==='fail',content:[{type:'text',text:key+':real:'+request.params.arguments.text},...(request.params.arguments.text==='screenshot'?[{type:'image',data:${JSON.stringify(png)},mimeType:'image/png'}]:[])]};
});
await server.connect(new StdioServerTransport());
`
  writeFileSync(script, source)
  const register = (keys = ['echo'], select = true, toolNames = ['echo']) => {
    writeFileSync(manifest, JSON.stringify({ name: 'probe', mcpServers: Object.fromEntries(keys.map(key => [key, { command: process.execPath, args: [script, key, JSON.stringify(toolNames)], cwd: '${MIRA_PROJECT_DIR}' }])) }))
    database.plugins.register(packageRoot)
    const current = database.harness.getSession(created.id)
    database.harness.updateSession({ ...current, pluginCatalog: database.plugins.snapshots(), activeMcpServerIds: select ? keys.map(key => `plugin:probe@local:${key}`) : [] })
  }
  const rows = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { pid: number; key: string; cwd: string; project: string; plugin: string; event: string; args?: Record<string, unknown> }) : []
  const session = (id = created.id) => database.harness.getSession(id)
  const changeDefinition = () => { const declaration = JSON.parse(readFileSync(manifest, 'utf8')); declaration.mcpServers.echo.args[1] = 'updated-server-key'; writeFileSync(manifest, JSON.stringify(declaration)) }
  const view = { root, database, directory, project, manager, runtime, sessionId: created.id, sessionIds, steps, contexts, events, sender, runs, run, register, manifest, rows, session, changeDefinition }
  fixtures.push(view)
  return view
}

describe('selected plugin MCP in the real Harness Agent runtime', () => {
  it('registers a pure MCP plugin, exposes its schema and namespace, records approval, executes and feeds the next model', async () => {
    const view = setup([{ tools: [call('first')] }, {}], 'default'); view.register()
    const pending = view.run()
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const request = view.runtime.listPendingPermissions(view.sessionId)[0]
    expect(view.session().activeRun?.activities.some(activity => activity.label.includes(mcpName()))).toBe(false)
    expect(view.session().activeRun?.activities.some(activity => activity.label.includes('echo'))).toBe(true)
    expect(request).toMatchObject({ sessionId: view.sessionId, toolCallId: expect.any(String), runId: expect.any(String), title: expect.stringContaining('echo'), detail: expect.stringContaining('probe') })
    expect(view.rows().filter(row => row.event === 'call')).toHaveLength(0)
    expect(view.contexts[0].tools.find(tool => tool.name === mcpName())).toMatchObject({ parameters: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } })
    expect(view.session().toolCalls.find(record => record.tool === mcpName())).toMatchObject({ id: request.toolCallId, label: 'echo', status: 'waiting-confirm', approvalRequestId: request.requestId })
    expect(view.events.find(event => event.type === 'tool-call' && event.payload.id === request.toolCallId && event.payload.tool === mcpName())).toMatchObject({ type: 'tool-call', payload: { tool: mcpName(), label: 'echo' } })
    view.runtime.resolvePermission(request.requestId, true); await pending
    expect(view.rows().filter(row => row.event === 'call')).toMatchObject([{ key: 'echo', name: 'echo', args: { text: 'first' } }])
    expect(view.session().toolCalls.find(record => record.tool === mcpName())).toMatchObject({ tool: mcpName(), label: 'echo', status: 'ok', approvalRequestId: request.requestId, output: { text: 'echo:real:first' } })
    expect(JSON.stringify(view.contexts[1].messages)).toContain('echo:real:first')
    expect(view.session().activeRun).toBeUndefined()
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it.each(['full', 'auto-approve'] as const)('honors the session %s permission when the global default still requires MCP approval', async permissionMode => {
    const view = setup([{ tools: [call('without-confirmation')] }, {}]); view.register()
    view.database.harness.updateSession({ ...view.session(), permissionMode })
    view.database.harness.savePermissionConfig({ ...view.database.harness.getPermissionConfig(), globalDefaultMode: 'default' })
    const pending = view.run()
    await vi.waitFor(() => expect(view.rows().some(row => row.event === 'call') || view.runtime.listPendingPermissions(view.sessionId).length > 0).toBe(true))
    const requests = view.runtime.listPendingPermissions(view.sessionId)
    for (const request of requests) view.runtime.resolvePermission(request.requestId, true)
    await pending
    expect(requests).toEqual([])
    expect(view.events.some(event => event.type === 'permission-request')).toBe(false)
    expect(view.rows().filter(row => row.event === 'call')).toHaveLength(1)
    expect(view.session().toolCalls.find(record => record.tool === mcpName())).toMatchObject({ status: 'ok' })
  })

  it('keeps a default-permission session from inheriting full access from global preferences', async () => {
    const view = setup([{ tools: [call('needs-confirmation')] }, {}], 'default'); view.register()
    view.database.harness.savePermissionConfig({ ...view.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    const pending = view.run()
    await vi.waitFor(() => expect(view.rows().some(row => row.event === 'call') || view.runtime.listPendingPermissions(view.sessionId).length > 0).toBe(true))
    const requests = view.runtime.listPendingPermissions(view.sessionId)
    const beforeApproval = view.rows().filter(row => row.event === 'call')
    for (const request of requests) view.runtime.resolvePermission(request.requestId, true)
    await pending
    expect(requests).toHaveLength(1)
    expect(beforeApproval).toEqual([])
  })

  it('honors an explicitly submitted full-access message when the session and global defaults require approval', async () => {
    const view = setup([{ tools: [call('submitted-full')] }, {}], 'default'); view.register()
    view.database.harness.savePermissionConfig({ ...view.database.harness.getPermissionConfig(), fullAccessEnabled: true })
    const receipt = await view.runtime.submitMessage(view.sender, view.sessionId, 'full-access-message', 'Call selected plugin', [], { providerId: 'fixture', modelId: 'model' }, false, { permissionMode: 'full' })
    expect(receipt).toHaveProperty('submissionId', 'full-access-message')
    await vi.waitFor(() => expect(view.session().messages.at(-1)?.run?.status).toBe('completed'))
    expect(view.events.some(event => event.type === 'permission-request')).toBe(false)
    expect(view.rows().filter(row => row.event === 'call')).toHaveLength(1)
    expect(view.session().permissionMode).toBe('full')
  })

  it('does not start or expose unselected plugin services', async () => {
    const view = setup(); view.register(['echo'], false); await view.run()
    expect(view.rows()).toEqual([])
    expect(view.contexts[0].tools.some(tool => tool.name.startsWith('mira_mcp_'))).toBe(false)
    expect(view.session().messages.at(-1)?.run?.status).toBe('completed')
  })

  it('automatically connects an explicitly referenced plugin, keeps operation approval and reuses selection on the next turn', async () => {
    const view = setup([{ tools: [call('first')] }, {}, {}], 'default'); view.register(['echo'], false)
    const pending = view.run(view.sessionId, 'Use [probe](plugin://probe@local)')
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    expect(view.session().activeMcpServerIds).toEqual(['plugin:probe@local:echo'])
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    view.runtime.resolvePermission(view.runtime.listPendingPermissions(view.sessionId)[0].requestId, true)
    await pending
    await view.run()
    expect(view.contexts.at(-1)!.tools.some(tool => tool.name === mcpName())).toBe(true)
    expect(view.rows().filter(row => row.event === 'start')).toHaveLength(2)
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('connects services declared by an invoked plugin command', async () => {
    const view = setup(); view.register(['echo'], false)
    const commands = join(view.root, 'package/commands'); mkdirSync(commands)
    writeFileSync(join(commands, 'inspect.md'), '---\ndescription: Inspect with the plugin\n---\nUse the available plugin tools.')
    view.database.harness.updateSession({ ...view.session(), pluginCatalog: view.database.plugins.snapshots() })
    await view.run(view.sessionId, '/probe:inspect')
    expect(view.session().activeMcpServerIds).toEqual(['plugin:probe@local:echo'])
    expect(view.contexts[0].tools.some(tool => tool.name === mcpName())).toBe(true)
    expect(view.rows().filter(row => row.event === 'start')).toHaveLength(1)
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it.each(['> [probe](plugin://probe@local)', '`[probe](plugin://probe@local)`'])('does not activate quoted or code references: %s', async prompt => {
    const view = setup(); view.register(['echo'], false); await view.run(view.sessionId, prompt)
    expect(view.rows()).toEqual([])
    expect(view.session().activeMcpServerIds).toEqual([])
  })

  it('does not connect or select plugin services in planning mode', async () => {
    const view = setup(); view.register(['echo'], false)
    await expect(view.run(view.sessionId, '[probe](plugin://probe@local)', true)).rejects.toThrow('未提交可确认的计划')
    expect(view.rows()).toEqual([])
    expect(view.session().activeMcpServerIds).toEqual([])
    expect(view.contexts[0].tools.some(tool => tool.name === mcpName())).toBe(false)
  })

  it.each(['disable', 'change'] as const)('does not start a referenced plugin after %s', async kind => {
    const view = setup(); view.register(['echo'], false)
    if (kind === 'disable') view.database.plugins.setEnabled('probe@local', false)
    else view.changeDefinition()
    await expect(view.run(view.sessionId, '[probe](plugin://probe@local)')).rejects.toThrow(kind === 'disable' ? '停用' : '变化')
    expect(view.rows()).toEqual([])
    expect(view.contexts).toEqual([])
    expect(view.session().messages.at(-1)?.run?.status).toBe('failed')
  })

  it('passes screenshot pixels to the next real Agent model turn without storing base64 in public records', async () => {
    const view = setup([{ tools: [call('screenshot')] }, {}]); view.register(['echo'], false)
    view.database.models.save({ ...view.database.models.get('fixture')!, models: [{ id: 'model', enabled: true, reasoning: false, multimodal: true }] })
    await view.run(view.sessionId, '[probe](plugin://probe@local)')
    expect(view.contexts[1].messages.find(message => message.role === 'toolResult').content).toContainEqual({ type: 'image', data: png, mimeType: 'image/png' })
    expect(JSON.stringify(view.session())).not.toContain(png)
    expect(JSON.stringify(view.events)).not.toContain(png)
  })

  it('reports unsupported screenshot input to a text-only model without forwarding pixels', async () => {
    const view = setup([{ tools: [call('screenshot')] }, {}]); view.register()
    await view.run()
    const next = JSON.stringify(view.contexts[1].messages)
    expect(next).toContain('所选模型不支持图片输入')
    expect(next).not.toContain(png)
    expect(view.session().toolCalls.find(record => record.tool === mcpName())?.status).toBe('failed')
  })

  it('validates the actual discovered MCP schema before any remote call', async () => {
    const view = setup([{ tools: [{ ...call('invalid'), arguments: {} }] }, {}]); view.register(); await view.run()
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    expect(JSON.stringify(view.contexts[1].messages)).toContain('Validation failed')
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it.each(['change', 'disable'] as const)('blocks %s after approval waits, without a tool request reaching the process', async kind => {
    const view = setup([{ tools: [call('must-not-run')] }, {}], 'default'); view.register()
    const pending = view.run(); await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const request = view.runtime.listPendingPermissions(view.sessionId)[0]
    if (kind === 'change') view.changeDefinition()
    else view.database.plugins.setEnabled('probe@local', false)
    view.runtime.resolvePermission(request.requestId, true); await pending
    expect(view.rows().filter(row => row.event === 'call')).toEqual([])
    const record = view.session().toolCalls.find(record => record.tool === mcpName())!
    expect(['cancelled', 'failed']).toContain(record.status)
    expect(JSON.stringify(record)).toContain(kind === 'change' ? '变化' : '停用')
    expect(view.session().activeRun).toBeUndefined(); expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('revalidates a frozen plugin changed between model turns in the same run', async () => {
    const gate = deferred(), view = setup([{ tools: [call('allowed')] }, { tools: [call('forbidden', 'echo', 'later-call')], wait: gate }, {}]); view.register()
    const pending = view.run(); await vi.waitFor(() => expect(view.contexts).toHaveLength(2))
    expect(view.rows().filter(row => row.event === 'call').map(row => row.args?.text)).toEqual(['allowed'])
    view.changeDefinition(); gate.resolve(); await pending
    expect(view.rows().filter(row => row.event === 'call').map(row => row.args?.text)).toEqual(['allowed'])
    expect(JSON.stringify(view.contexts[2].messages)).toContain('变化')
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('isolates two same-name tools by server identity and preserves business failures', async () => {
    const view = setup([{ tools: [call('ok', 'echo', 'first'), call('fail', 'other', 'second')] }, {}]); view.register(['echo', 'other']); await view.run()
    expect(view.contexts[0].tools.filter(tool => tool.name.startsWith('mira_mcp_')).map(tool => tool.name)).toEqual(expect.arrayContaining([mcpName('echo'), mcpName('other')]))
    expect(view.rows().filter(row => row.event === 'call').map(row => ({ key: row.key, text: row.args?.text }))).toEqual([{ key: 'echo', text: 'ok' }, { key: 'other', text: 'fail' }])
    expect(view.session().toolCalls.find(record => record.tool === mcpName('echo'))).toMatchObject({ status: 'ok', output: { text: 'echo:real:ok' } })
    expect(view.session().toolCalls.find(record => record.tool === mcpName('other'))).toMatchObject({ status: 'failed', error: expect.stringContaining('other:real:fail') })
    expect(JSON.stringify(view.contexts[1].messages)).toContain('other:real:fail')
    expect(new Set(view.rows().map(row => row.pid)).size).toBe(2); expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('uses independent run processes and real cwd for two concurrent project sessions', async () => {
    const gate = deferred(), view = setup([{ tools: [call('one')], wait: gate }, { tools: [call('two')], wait: gate }, {}, {}]); view.register()
    const secondDirectory = join(view.root, 'second-project'); mkdirSync(secondDirectory)
    const secondProject = view.database.harness.createProject(secondDirectory), second = view.database.harness.createSession(secondProject.id)
    view.sessionIds.push(second.id)
    view.database.harness.updateSession({ ...second, delegationEnabled: false, titleSource: 'manual', permissionMode: 'full', activeMcpServerIds: ['plugin:probe@local:echo'], pluginCatalog: view.database.plugins.snapshots() })
    const one = view.run(), two = view.run(second.id)
    await vi.waitFor(() => expect(view.contexts).toHaveLength(2)); gate.resolve(); await Promise.all([one, two])
    const starts = view.rows().filter(row => row.event === 'start')
    expect(starts).toHaveLength(2); expect(new Set(starts.map(row => row.pid)).size).toBe(2)
    expect(starts.map(row => row.cwd)).toEqual(expect.arrayContaining([view.directory, secondDirectory]))
    for (const row of view.rows()) { expect(row.project).toBe(row.cwd); expect(row.plugin).toBe('probe@local'); expect(alive(row.pid)).toBe(false) }
    expect(view.session().toolCalls.find(record => record.tool === mcpName())?.status).toBe('ok')
    expect(view.session(second.id).toolCalls.find(record => record.tool === mcpName())?.status).toBe('ok')
  })

  it('keeps long original tool names distinct even when sanitizing and truncating produce the same prefix', async () => {
    const originals = [`same.${'a'.repeat(45)}`, `same/${'a'.repeat(45)}`]
    const names = originals.map(original => mcpName('echo', 'probe', original))
    const view = setup([{ tools: names.map((name, index) => ({ id: `collision-${index}`, name, arguments: { text: String(index) } })) }, {}])
    view.register(['echo'], true, originals); await view.run()
    expect(new Set(names).size).toBe(2); expect(names.every(name => name.length < 64)).toBe(true)
    expect(view.contexts[0].tools.filter(tool => tool.name.startsWith('mira_mcp_')).map(tool => tool.name)).toEqual(names)
    expect(view.rows().filter(row => row.event === 'call').map(row => (row as any).name)).toEqual(originals)
    for (const name of names) expect(view.session().toolCalls.find(record => record.tool === name)?.status).toBe('ok')
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })

  it('stops an actual long MCP call, publishes stopped only after its run child has exited, and can send again', async () => {
    const view = setup([{ tools: [call('hold')] }, {}]); view.register()
    const pending = view.run(); await vi.waitFor(() => expect(view.rows().filter(row => row.event === 'call')).toHaveLength(1))
    const pid = view.rows()[0].pid; expect(alive(pid)).toBe(true)
    expect(view.runtime.abort(view.sessionId)).toBe(true); await pending
    expect(alive(pid)).toBe(false); expect(view.session().activeRun).toBeUndefined()
    expect(view.session().messages.at(-1)?.run?.status).toBe('stopped')
    expect(view.session().toolCalls.find(record => record.tool === mcpName())?.status).toBe('cancelled')
    await view.run(); expect(view.session().messages.at(-1)?.run?.status).toBe('completed')
    expect(new Set(view.rows().filter(row => row.event === 'start').map(row => row.pid)).size).toBe(2)
    expect(view.rows().every(row => !alive(row.pid))).toBe(true)
  })
})
