import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@earendil-works/pi-agent-core'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { HarnessRuntime, finalizeAssistantCitations } from '../electron/services/harnessRuntime'
import { HARNESS_PUBLIC_TEXT_BYTES, publicHarnessText, publicHarnessToolInput, publicHarnessToolOutput } from '../electron/services/agentTools'
import { McpManager } from '../electron/adapters/mcpManager'
import { HarnessSubtaskCoordinator } from '../electron/services/harnessSubtaskCoordinator'
import { SubtaskRuntime } from '../electron/services/subtaskRuntime'
import { HarnessHooks } from '../electron/services/harnessHooks'
import type { HarnessEvent, HarnessMessagePart } from '../src/config/harness'

const resources: Array<{ root: string; database: PlatformDatabase }> = []
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); for (const item of resources.splice(0)) { item.database.close(); rmSync(item.root, { recursive: true, force: true }) } })

function setup(mcpManager: { getTools: () => any[] } = { getTools: () => [] }) {
  const root = mkdtempSync(join(tmpdir(), 'mira-message-parts-'))
  const database = new PlatformDatabase(root)
  resources.push({ root, database })
  const directory = join(root, 'project')
  mkdirSync(directory)
  writeFileSync(join(directory, 'note.txt'), 'Read output', 'utf8')
  const project = database.harness.createProject(directory, 'Test')
  const created = database.harness.createSession(project.id)
  database.harness.updateSession({ ...created, delegationEnabled: false, titleSource: 'manual' })
  database.harness.addMessage(created.id, 'user', 'Run')
  const events: HarnessEvent[] = []
  const runtime = new HarnessRuntime(database, mcpManager as any)
  const sender: any = { isDestroyed: () => false, send: (_channel: string, event: HarnessEvent) => events.push(structuredClone(event)) }
  let notify!: (event: any) => void
  const subscribe = Agent.prototype.subscribe
  vi.spyOn(Agent.prototype, 'subscribe').mockImplementation(function (this: Agent, listener) { if (!notify) notify = event => { void listener(event, new AbortController().signal) }; return subscribe.call(this, listener) })
  vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, session) => session)
  const provider = { id: 'p', name: 'Test', endpoint: 'http://127.0.0.1:1', models: [{ id: 'test', reasoning: true }] }
  const run = (options = {}) => (runtime as any).runAgent(sender, created.id, database.harness.getSession(created.id), { providerId: 'p', modelId: 'test', thinkingLevel: 'high' }, provider, 'platform-private-key', options)
  const update = (type: string, delta?: string, contentIndex = 0) => notify({ type: 'message_update', assistantMessageEvent: { type, delta, contentIndex } })
  const response = () => notify({ type: 'message_start', message: { role: 'assistant' } })
  const tool = async (agent: any, id: string, name: string, args: any, onUpdate?: (partial: unknown) => void) => {
    notify({ type: 'message_update', assistantMessageEvent: { type: 'toolcall_end', toolCall: { id, name, arguments: args } } })
    notify({ type: 'tool_execution_start', toolCallId: id, toolName: name, args })
    const decision = await agent.beforeToolCall({ toolCall: { id, name }, args, context: { tools: agent.state.tools } })
    let result: any, isError = false
    if (decision?.block) { result = { content: [{ type: 'text', text: decision.reason }] }; isError = true }
    else {
      try { result = await agent.state.tools.find((entry: any) => entry.name === name).execute(id, args, (runtime as any).runCoordinator.running.get(created.id)?.controller?.signal, onUpdate) }
      catch (error) { result = { content: [{ type: 'text', text: String(error) }] }; isError = true }
    }
    notify({ type: 'tool_execution_end', toolCallId: id, toolName: name, result, isError })
    return result
  }
  return { root, database, runtime, sender, events, run, update, response, tool, sessionId: created.id }
}

describe('authoritative ordered Harness message parts', () => {
  it('persists the admitted model identity through live activities and the settled reply without adding a model prompt', async () => {
    const f = setup(), model = { providerId: 'p', providerName: 'Test', modelId: 'test' }
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: Agent) {
      expect(f.database.harness.getSession(f.sessionId).activeRun).toMatchObject({ model })
      expect(JSON.stringify(this.state.messages)).not.toContain('模型已切换')
      f.response(); f.update('text_delta', 'Model identity fixture')
    })
    await f.run()
    const reply = f.database.harness.getSession(f.sessionId).messages.at(-1)!
    expect(reply.model).toEqual(model)
    expect(reply.run?.status).toBe('completed')
    expect(f.events.find(event => event.type === 'run-start')?.payload).toMatchObject({ model })
    expect(f.events.find(event => event.type === 'message-complete')?.payload.model).toEqual(model)
  })

  it.each([0, 7])('saves full real bash output before terminal publication, including exit %s, and authorizes the exact owner', async code => {
    const f = setup()
    f.database.harness.savePermissionConfig({ ...f.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      f.response(); await f.tool(this, 'full-command', 'bash', { command: `printf 'FIRST\\n'; awk 'BEGIN { for (i=0; i<10000; i++) print "complete-line-" i }'; printf 'platform-private-key LAST\\n' >&2; exit ${code}` })
      f.response(); f.update('text_delta', 'Done')
    })
    try {
      await f.run()
      const tool = f.database.harness.getSession(f.sessionId).toolCalls[0]
      expect(tool.commandJob).toMatchObject({ status: code ? 'failed' : 'completed', fullOutputAvailable: true })
      const text = await f.runtime.readCommandOutput(f.sessionId, tool.runId!, tool.id)
      expect(Buffer.byteLength(text)).toBeGreaterThan(64 * 1024)
      expect(text).toContain('FIRST\ncomplete-line-0\n'); expect(text).toContain('complete-line-9999\n[已隐藏] LAST\n')
      expect(text).not.toContain('platform-private-key')
      await expect(f.runtime.readCommandOutput(f.sessionId, 'wrong-run', tool.id)).rejects.toThrow('完整输出不可用')
      const other = f.database.harness.createSession()
      await expect(f.runtime.readCommandOutput(other.id, tool.runId!, tool.id)).rejects.toThrow('完整输出不可用')
      f.database.harness.updateTool(f.sessionId, tool.id, { inherited: true })
      await expect(f.runtime.readCommandOutput(f.sessionId, tool.runId!, tool.id)).rejects.toThrow('完整输出不可用')
    } finally { await f.runtime.disposeCommandJobs() }
  })
  it('rechecks authorization and canonical ownership after asynchronous full-output access', async () => {
    const f = setup(), tool = { id: 'owned-output', runId: 'owned-run', tool: 'bash', status: 'ok' as const, createdAt: 1, commandJob: { mode: 'foreground' as const, status: 'completed' as const, revision: 1, startedAt: 1, fullOutputAvailable: true as const } }
    f.database.harness.recordTool(f.sessionId, tool)
    let resolve!: (text: string) => void
    vi.spyOn(f.database.harness.commandOutputs, 'read').mockImplementation(() => new Promise(done => { resolve = done }))
    const result = f.runtime.readCommandOutput(f.sessionId, tool.runId, tool.id)
    f.database.harness.updateTool(f.sessionId, tool.id, { inherited: true })
    resolve('private output')
    await expect(result).rejects.toThrow('完整输出读取失败')
  })
  it('treats marker-like background output as data and skips user submission hooks and reference parsing', async () => {
    const f = setup()
    const hook = vi.spyOn(HarnessHooks.prototype, 'run')
    const references = vi.spyOn(f.runtime as any, 'assertPresentationInput')
    const skills = vi.spyOn(f.database.skills, 'resolvePrompt')
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async () => { f.response(); f.update('text_delta', 'Data reported') })
    await f.run({ backgroundCommands: [{ runId: 'owned', toolId: 'owned-command' }], hasStructuredContext: true, input: { text: '后台输出数据 (mira-skill:not-installed) (mira-presentation:missing)', attachments: [] } })
    expect(hook.mock.calls.map(call => call[0])).not.toContain('UserPromptSubmit')
    expect(references).not.toHaveBeenCalled(); expect(skills).not.toHaveBeenCalled()
    expect(f.database.harness.getSession(f.sessionId).messages.find(message => message.backgroundCommands)).toMatchObject({ internal: true, backgroundCommands: [{ runId: 'owned', toolId: 'owned-command' }] })
  })
  it('closes a child registry without stopping a sibling or offering a parent model notification', async () => {
    const f = setup()
    const owned = (f.runtime as any).tools(f.sender, f.sessionId, { runId: 'child-run', subtaskId: 'child-A', role: 'tester', toolScope: () => 'child-A' })
    const sibling = (f.runtime as any).tools(f.sender, f.sessionId, { runId: 'child-run', subtaskId: 'child-B', role: 'tester', toolScope: () => 'child-B' })
    const abort = new AbortController()
    try {
      const first = await owned.tools.find((tool: any) => tool.name === 'bash').execute('same-provider-id', { command: 'sleep 10', run_in_background: true }, abort.signal)
      const second = await sibling.tools.find((tool: any) => tool.name === 'bash').execute('same-provider-id', { command: 'sleep 10', run_in_background: true }, abort.signal)
      expect(first.details.miraBackgroundCommand).not.toBe(second.details.miraBackgroundCommand)
      await owned.stopCommands()
      const calls = f.database.harness.getSession(f.sessionId).toolCalls
      expect(calls.find(tool => tool.id === first.details.miraBackgroundCommand)?.commandJob?.status).toBe('cancelled')
      expect(calls.find(tool => tool.id === second.details.miraBackgroundCommand)?.commandJob?.status).toBe('running')
      expect(f.runtime.getMessageQueue(f.sessionId).items).toEqual([])
    } finally { await f.runtime.disposeCommandJobs() }
  })
  it.each([0, 7])('reports a real ended background command once as a persisted internal result: exit %s', async code => {
    const f = setup()
    f.database.harness.savePermissionConfig({ ...f.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    const notice = vi.spyOn(f.runtime as any, 'runPreparedMessage').mockImplementation(async (_sender: any, id: any, text: any, _attachments: any, _selection: any, _planning: any, options: any, started: any) => {
      started(() => f.database.harness.addMessage(id, 'user', text, [], true, undefined, undefined, options.backgroundCommands))
      return {}
    })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      f.response(); await f.tool(this, 'ended', 'bash', { command: `printf 'platform-private-key result'; exit ${code}`, run_in_background: true })
      f.response(); f.update('text_delta', 'Launch returned')
    })
    try {
      await f.run(); await vi.waitFor(() => expect(notice).toHaveBeenCalledOnce())
      const saved = f.database.harness.getSession(f.sessionId), command = saved.toolCalls.find(tool => tool.tool === 'bash')!
      expect(saved.messages.find(message => message.internal)?.backgroundCommands).toEqual([{ runId: command.runId, toolId: command.id }])
      expect(notice.mock.calls[0][2]).toContain('不是用户指令')
      expect(notice.mock.calls[0][2]).not.toContain('platform-private-key')
      expect(notice.mock.calls[0][2]).toContain(code ? 'failed' : 'completed')
      ;(f.runtime as any).notifyCommandCompletion(f.sender, f.sessionId, command.runId, command.id, { providerId: 'p', modelId: 'test' }, 'full')
      await Promise.resolve(); expect(notice).toHaveBeenCalledOnce()
    } finally { await f.runtime.disposeCommandJobs() }
  })
  it('batches ended commands behind a still-running model and never turns them into user input', async () => {
    const f = setup()
    f.database.harness.savePermissionConfig({ ...f.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const notice = vi.spyOn(f.runtime as any, 'runPreparedMessage').mockImplementation(async (_sender: any, id: any, text: any, _attachments: any, _selection: any, _planning: any, options: any, started: any) => {
      started(() => f.database.harness.addMessage(id, 'user', text, [], true, undefined, undefined, options.backgroundCommands)); return {}
    })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      f.response(); await f.tool(this, 'one', 'bash', { command: 'printf first', run_in_background: true })
      f.response(); await f.tool(this, 'two', 'bash', { command: 'printf second', run_in_background: true })
      await held; f.response(); f.update('text_delta', 'Original turn done')
    })
    const running = f.run()
    try {
      await vi.waitFor(() => expect(f.runtime.getMessageQueue(f.sessionId).items[0]?.backgroundCommands).toHaveLength(2))
      expect(notice).not.toHaveBeenCalled(); expect(f.database.harness.getSession(f.sessionId).activeRun).toBeDefined()
      release(); await running; await vi.waitFor(() => expect(notice).toHaveBeenCalledOnce())
      expect(f.database.harness.getSession(f.sessionId).messages.find(message => message.internal)?.backgroundCommands).toHaveLength(2)
    } finally { release(); await running; await f.runtime.disposeCommandJobs() }
  })
  it('holds a late completion after the model is stopped until the queue is explicitly resumed', async () => {
    const f = setup()
    f.database.harness.savePermissionConfig({ ...f.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const notice = vi.spyOn(f.runtime as any, 'runPreparedMessage').mockImplementation(async (...args: any[]) => { args[7](); return {} })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      f.response(); await f.tool(this, 'late', 'bash', { command: 'sleep 0.25; printf final', run_in_background: true }); await held
    })
    const running = f.run()
    try {
      await vi.waitFor(() => expect(f.database.harness.getSession(f.sessionId).toolCalls[0]?.commandJob?.mode).toBe('background'))
      expect(f.runtime.abort(f.sessionId)).toBe(true)
      release(); await running
      await vi.waitFor(() => expect(f.runtime.getMessageQueue(f.sessionId)).toMatchObject({ paused: 'stopped', items: [{ operation: 'command-notification' }] }))
      expect(notice).not.toHaveBeenCalled()
      f.runtime.resumeMessageQueue(f.sessionId); await vi.waitFor(() => expect(notice).toHaveBeenCalledOnce())
    } finally { release(); await running; await f.runtime.disposeCommandJobs() }
  })
  it('keeps automated bash bounded in the foreground and rejects detached execution', async () => {
    const f = setup()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      f.response(); await f.tool(this, 'detached', 'bash', { command: 'printf not-started', run_in_background: true })
      f.response(); await f.tool(this, 'bounded', 'bash', { command: 'printf started; sleep 1', timeout: 0.01 })
      f.response(); f.update('text_delta', 'Automation checked')
    })
    try {
      await f.run({ origin: 'automation', permissionMode: 'full' })
      const calls = f.database.harness.getSession(f.sessionId).toolCalls
      expect(calls[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('自动化') })
      expect(calls[0].commandJob).toBeUndefined()
      expect(calls[1]).toMatchObject({ commandJob: { mode: 'foreground', backgroundAllowed: false, status: 'failed' } })
      expect(f.runtime.getMessageQueue(f.sessionId).items).toEqual([])
    } finally { await f.runtime.disposeCommandJobs() }
  })
  it('bounds long unbroken command output without quadratic credential-key scanning', () => {
    const started = performance.now()
    expect(publicHarnessText('x'.repeat(128 * 1024)).text).toHaveLength(HARNESS_PUBLIC_TEXT_BYTES)
    expect(performance.now() - started).toBeLessThan(500)
    for (const text of ['api_key=hidden', 'my_api_token: hidden', 'prefix "password":"hidden"', '{"secret":"hidden","token":"hidden"}', 'authorization=hidden']) {
      expect(publicHarnessText(text).text).not.toContain('hidden')
    }
  })
  it('keeps a real background command alive after its model turn and releases the project tool lock', async () => {
    const fixture = setup()
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response()
      const result = await fixture.tool(this, 'background', 'bash', { command: "printf 'background-start\\n'; sleep 10; printf 'background-end\\n'", run_in_background: true })
      expect(result.details.miraBackgroundCommand).toBeTruthy()
      fixture.response()
      await fixture.tool(this, 'next', 'bash', { command: "printf 'foreground-next\\n'" })
      fixture.response(); fixture.update('text_delta', 'Model continued')
    })
    try {
      await fixture.run()
      const session = fixture.database.harness.getSession(fixture.sessionId), command = session.toolCalls.find(tool => tool.providerCallId === 'background')!
      expect(session.activeRun).toBeUndefined()
      expect(command).toMatchObject({ status: 'ok', commandJob: { mode: 'background', status: 'running' } })
      expect(session.toolCalls.find(tool => tool.providerCallId === 'next')?.output?.text).toContain('foreground-next')
      expect(fixture.runtime.isProjectRunning(session.projectId!)).toBe(true)
      expect(() => fixture.runtime.assertSessionMutable(session.id)).toThrow('命令')
      await expect(fixture.runtime.stopCommand('other-task', command.runId!, command.id)).rejects.toThrow()
      await fixture.runtime.stopCommand(session.id, command.runId!, command.id)
      expect(fixture.database.harness.getSession(session.id).toolCalls.find(tool => tool.id === command.id)).toMatchObject({ status: 'ok', commandJob: { status: 'cancelled' } })
      expect(fixture.runtime.isProjectRunning(session.projectId!)).toBe(false)
      expect(fixture.events.some(event => event.type === 'command-job' && event.payload.id === command.id && event.payload.commandJob.status === 'cancelled')).toBe(true)
    } finally { await fixture.runtime.disposeCommandJobs() }
  })

  it('never starts a background process when its original command approval is denied', async () => {
    const fixture = setup()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response()
      const pending = fixture.tool(this, 'denied-background', 'bash', { command: "printf 'denied'", run_in_background: true })
      await vi.waitFor(() => expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toHaveLength(1))
      fixture.runtime.resolvePermission(fixture.runtime.listPendingPermissions(fixture.sessionId)[0].requestId, false)
      await pending
      fixture.response(); fixture.update('text_delta', 'Denied')
    })
    await fixture.run()
    expect(fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]).toMatchObject({ status: 'cancelled' })
    expect(fixture.database.harness.getSession(fixture.sessionId).toolCalls[0].commandJob).toBeUndefined()
    expect(fixture.events.some(event => event.type === 'command-job')).toBe(false)
  })

  it('marks persisted running jobs interrupted on restart without replaying or changing launch success', () => {
    const fixture = setup(), time = Date.now()
    fixture.database.harness.recordTool(fixture.sessionId, { id: 'old-job', runId: 'old-run', tool: 'bash', status: 'ok', createdAt: time, commandJob: { mode: 'background', status: 'running', revision: 3, startedAt: time, output: { text: 'preserved', truncated: false } } })
    fixture.database.harness.recoverInterruptedCommands()
    const command = fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]
    expect(command).toMatchObject({ status: 'ok', commandJob: { mode: 'background', status: 'interrupted', revision: 4, output: { text: 'preserved' } } })
    fixture.database.harness.recoverInterruptedCommands()
    expect(fixture.database.harness.getSession(fixture.sessionId).toolCalls[0].commandJob?.revision).toBe(4)
  })

  it('lets the model stop its own background execution through the canonical status tool', async () => {
    const fixture = setup()
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response()
      const result = await fixture.tool(this, 'background', 'bash', { command: 'sleep 10', run_in_background: true })
      fixture.response()
      const stopped = await fixture.tool(this, 'stop-exact', 'command_status', { tool_id: result.details.miraBackgroundCommand, action: 'stop' })
      expect(JSON.parse(stopped.content[0].text).status).toBe('cancelled')
      fixture.response(); fixture.update('text_delta', 'Stopped only the command')
    })
    try { await fixture.run(); expect(fixture.database.harness.getSession(fixture.sessionId).toolCalls.find(tool => tool.tool === 'bash')).toMatchObject({ status: 'ok', commandJob: { status: 'cancelled' } }) }
    finally { await fixture.runtime.disposeCommandJobs() }
  })

  it('keeps sleep timeout as failure without transferring it to background', async () => {
    const fixture = setup()
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); await fixture.tool(this, 'sleep-deadline', 'bash', { command: 'sleep 1', timeout: 0.02 })
      fixture.response(); fixture.update('text_delta', 'Timeout observed')
    })
    try { await fixture.run(); expect(fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]).toMatchObject({ status: 'failed', commandJob: { mode: 'foreground', status: 'failed', error: expect.stringContaining('timed out') } }) }
    finally { await fixture.runtime.disposeCommandJobs() }
  })

  it('stops a real command exceeding the shared 16 MiB output budget', async () => {
    const fixture = setup()
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); await fixture.tool(this, 'output-budget', 'bash', { command: quote(process.execPath) + ' -e ' + quote('process.stdout.write("x".repeat(17*1024*1024))') })
      fixture.response(); fixture.update('text_delta', 'Output budget observed')
    })
    try {
      await fixture.run()
      const tool = fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]
      expect(tool).toMatchObject({ status: 'failed', commandJob: { status: 'failed', error: expect.stringContaining('16 MiB') } })
      expect(Buffer.byteLength(tool.commandJob!.output?.text || '')).toBeLessThanOrEqual(HARNESS_PUBLIC_TEXT_BYTES)
    } finally { await fixture.runtime.disposeCommandJobs() }
  })

  it('withholds a split credential prefix from live main-command snapshots', async () => {
    const fixture = setup()
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); await fixture.tool(this, 'split-secret', 'bash', { command: "printf 'platform-private'; sleep 0.2; printf '%s' '-key end'" })
      fixture.response(); fixture.update('text_delta', 'Done')
    })
    try {
      await fixture.run()
      for (const event of fixture.events.filter(event => event.type === 'tool-call' || event.type === 'command-job')) {
        const output = event.payload.output?.text ?? event.payload.commandJob?.output?.text
        if (output !== undefined) expect(output).not.toContain('platform-private')
      }
      expect(fixture.database.harness.getSession(fixture.sessionId).toolCalls[0].commandJob?.output?.text).toBe('[已隐藏] end')
    } finally { await fixture.runtime.disposeCommandJobs() }
  })
  it.each(['preparation', 'response'] as const)('persists stopped rather than failed activities when cancellation occurs during %s', async stage => {
    const fixture = setup()
    if (stage === 'preparation') vi.mocked((fixture.runtime as any).compactContext).mockImplementation(async () => {
      fixture.runtime.abort(fixture.sessionId); throw new Error('stopped')
    })
    else vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async () => {
      fixture.response(); fixture.update('text_delta', 'Partial reply')
      fixture.runtime.abort(fixture.sessionId); throw new Error('stopped')
    })
    await fixture.run()
    const message = fixture.database.harness.getSession(fixture.sessionId).messages.at(-1)!
    expect(message.run).toMatchObject({ status: 'stopped', activities: expect.arrayContaining([expect.objectContaining({ status: 'stopped', completedAt: expect.any(Number) })]) })
    expect(message.run!.activities.some(activity => activity.status === 'failed' || activity.status === 'running')).toBe(false)
    const finalActivities = fixture.events.filter(event => event.type === 'run-activity').at(-1)!.payload.activities
    expect(finalActivities).toEqual(message.run!.activities)
    if (stage === 'response') expect(message).toMatchObject({ content: 'Partial reply', interrupted: true })
    const reloaded = new PlatformDatabase(fixture.root)
    try { expect(reloaded.harness.getSession(fixture.sessionId).messages.at(-1)?.run).toEqual(message.run) } finally { reloaded.close() }
  })

  it('retains a real failed tool before a later reply is stopped', async () => {
    const manager = new McpManager()
    const client = { callTool: vi.fn().mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'Tool rejected' }] }) }
    ;(manager as any).clients.set('test-mcp', client)
    ;(manager as any).connections.set('test-mcp', { state: 'connected', toolCount: 1 })
    const tool = (manager as any).toAgentTool({ name: 'mcp_failure' }, client, 'Test MCP', 'test-mcp')
    ;(manager as any).toolsByServer.set('test-mcp', [tool])
    const fixture = setup(manager)
    fixture.database.harness.updateSession({ ...fixture.database.harness.getSession(fixture.sessionId), activeMcpServerIds: ['test-mcp'] })
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); await fixture.tool(this, 'actual-failure', tool.name, {})
      fixture.response(); fixture.update('text_delta', 'Partial recovery')
      fixture.runtime.abort(fixture.sessionId); throw new Error('stopped')
    })
    await fixture.run()
    const session = fixture.database.harness.getSession(fixture.sessionId), run = session.messages.at(-1)!.run!
    expect(run.status).toBe('stopped')
    expect(run.activities.find(activity => activity.id === 'tool-actual-failure')).toMatchObject({ status: 'failed' })
    expect(run.activities.find(activity => activity.id === 'answering')).toMatchObject({ status: 'stopped' })
    expect(session.toolCalls[0]).toMatchObject({ status: 'failed', error: 'Tool rejected' })
  })

  it('publishes real bash output before completion, sanitizes it, and preserves the upstream progress callback', async () => {
    const fixture = setup()
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    const upstream = vi.fn()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response()
      const attempt = fixture.tool(this, 'streaming-command', 'bash', { command: "printf 'platform-private-key first\\n'; sleep 0.15; printf 'last\\n'" }, upstream)
      await vi.waitFor(() => {
        const record = fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]
        expect(record).toMatchObject({ status: 'running', output: { text: '[已隐藏] first\n' } })
      })
      expect(fixture.events.some(event => event.type === 'tool-call' && event.payload.status === undefined && event.payload.output?.text === '[已隐藏] first\n')).toBe(true)
      await attempt
      fixture.response()
      fixture.update('text_delta', 'Done')
    })
    await fixture.run()
    const record = fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]!
    expect(record).toMatchObject({ status: 'ok', output: { text: '[已隐藏] first\nlast\n', truncated: false } })
    expect(upstream).toHaveBeenCalled()
    expect(JSON.stringify(fixture.events.filter(event => event.type === 'tool-call'))).not.toContain('platform-private-key')
  })

  it('ignores a captured progress callback after the tool finishes and after another response reuses its provider id', async () => {
    let publish!: (partial: unknown) => void
    const fixture = setup({ getTools: () => [{ name: 'mcp_progress', label: 'Progress', parameters: {}, execute: async (_id: string, _args: unknown, _signal: AbortSignal, onUpdate: typeof publish) => {
      publish = onUpdate
      onUpdate({ content: [{ type: 'text', text: 'partial' }] })
      return { content: [{ type: 'text', text: 'final' }] }
    } }] })
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response()
      await fixture.tool(this, 'same-provider-id', 'mcp_progress', {})
      const oldPublish = publish
      fixture.response()
      await fixture.tool(this, 'same-provider-id', 'mcp_progress', {})
      const count = fixture.events.length
      oldPublish({ content: [{ type: 'text', text: 'late-old-result' }] })
      publish({ content: [{ type: 'text', text: 'late-new-result' }] })
      expect(fixture.events).toHaveLength(count)
      fixture.response()
      fixture.update('text_delta', 'Done')
    })
    await fixture.run()
    const records = fixture.database.harness.getSession(fixture.sessionId).toolCalls
    expect(records).toHaveLength(2)
    expect(records.map(record => record.output?.text)).toEqual(['final', 'final'])
    expect(records[0].id).not.toBe(records[1].id)
  })

  it('keeps the last public output when cancellation precedes a late progress callback', async () => {
    const fixture = setup({ getTools: () => [{ name: 'mcp_progress', label: 'Progress', parameters: {}, execute: async (_id: string, _args: unknown, _signal: AbortSignal, onUpdate: (partial: unknown) => void) => {
      onUpdate({ content: [{ type: 'text', text: 'recorded partial' }] })
      fixture.runtime.abort(fixture.sessionId)
      onUpdate({ content: [{ type: 'text', text: 'late after stop' }] })
      throw new Error('stopped')
    } }] })
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response()
      await fixture.tool(this, 'cancelled-command', 'mcp_progress', {})
    })
    await fixture.run()
    expect(fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]).toMatchObject({ status: 'cancelled', output: { text: 'recorded partial' } })
    expect(JSON.stringify(fixture.events)).not.toContain('late after stop')
  })

  it('keeps parent thinking and text/tool/text/tool/text in both live events and persisted reload', async () => {
    const fixture = setup()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response()
      fixture.update('thinking_start')
      fixture.update('thinking_delta', 'Public thinking')
      fixture.update('thinking_end')
      fixture.update('text_delta', 'Before ', 1)
      await fixture.tool(this, 'read-1', 'read', { path: 'note.txt' })
      fixture.response()
      fixture.update('text_delta', 'Between ')
      await fixture.tool(this, 'list-2', 'list_files', { path: '.' })
      fixture.response()
      fixture.update('text_delta', 'After')
    })
    await fixture.run()
    const session = fixture.database.harness.getSession(fixture.sessionId)
    const message = session.messages.at(-1)!
    expect(message.content).toBe('Before Between After')
    expect(message.runId).toEqual(expect.any(String))
    expect(message.parts?.map(part => part.type)).toEqual(['reasoning', 'text', 'tool', 'text', 'tool', 'text'])
    expect(message.parts?.filter(part => part.type !== 'tool').map(part => part.text)).toEqual(['Public thinking', 'Before ', 'Between ', 'After'])
    expect(session.toolCalls).toHaveLength(2)
    for (const [index, event] of fixture.events.entries()) {
      const part = event.payload.part as HarnessMessagePart | undefined
      if (event.type !== 'message-part' || part?.type !== 'tool') continue
      expect(fixture.events.slice(0, index).some(previous => previous.type === 'tool-call' && previous.payload.id === part.toolCallId && previous.payload.tool && Number.isFinite(previous.payload.createdAt))).toBe(true)
    }
    expect(session.toolCalls[0]).toMatchObject({ id: `${message.runId}:response-1:read-1`, providerCallId: 'read-1', runId: message.runId, input: { text: expect.stringContaining('note.txt'), truncated: false }, output: { text: 'Read output', truncated: false }, status: 'ok' })
    expect(session.toolCalls[1].output?.text).toContain('note.txt')
    const live: HarnessMessagePart[] = []
    for (const event of fixture.events.filter(event => event.type === 'message-part')) {
      if (event.payload.part) {
        const part = event.payload.part as HarnessMessagePart
        const index = live.findIndex(entry => entry.id === part.id)
        if (index < 0) live.push(part); else live[index] = part
      } else {
        const part = live.find(entry => entry.id === event.payload.partId)
        if (part && part.type !== 'tool') { expect(event.payload.offset).toBe(part.text.length); part.text += event.payload.delta }
      }
    }
    expect(live).toEqual(message.parts)
    expect(message.run?.activities.filter(activity => activity.label === '正在生成回复' && activity.status === 'running')).toEqual([])
    const reloaded = new PlatformDatabase(fixture.root)
    try { expect(reloaded.harness.getSession(fixture.sessionId)).toEqual(session) } finally { reloaded.close() }
  })

  it('attaches an approval to the original tool and retains denied history without executing', async () => {
    const fixture = setup()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response()
      fixture.update('text_delta', 'Before')
      const attempt = fixture.tool(this, 'write-denied', 'write', { path: 'new.txt', content: 'No write' })
      await vi.waitFor(() => expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toHaveLength(1))
      const request = fixture.runtime.listPendingPermissions(fixture.sessionId)[0]!
      const pending = fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]!
      expect(request).toMatchObject({ toolCallId: pending.id, runId: pending.runId })
      expect(pending).toMatchObject({ status: 'waiting-confirm', approvalRequestId: request.requestId })
      fixture.runtime.resolvePermission(request.requestId, false)
      await attempt
      fixture.response(); fixture.update('text_delta', 'After')
    })
    await fixture.run()
    const session = fixture.database.harness.getSession(fixture.sessionId)
    expect(session.toolCalls).toHaveLength(1)
    expect(session.toolCalls[0]).toMatchObject({ status: 'cancelled', error: '用户拒绝了操作' })
    expect(session.messages.at(-1)?.parts?.map(part => part.type)).toEqual(['text', 'tool', 'text'])
    expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toEqual([])
  })

  it('records dangerous-command cancellation in full mode rather than hiding the attempt', async () => {
    const fixture = setup()
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); fixture.update('text_delta', 'Blocked')
      await fixture.tool(this, 'danger', 'bash', { command: 'rm -rf build' })
    })
    await fixture.run()
    expect(fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]).toMatchObject({ status: 'cancelled', error: '危险命令已被永久拦截' })
    expect(fixture.events.some(event => event.type === 'permission-request')).toBe(false)
  })

  it('records failed tool output and actual error without losing the following response', async () => {
    const fixture = setup()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); fixture.update('text_delta', 'Try ')
      await fixture.tool(this, 'missing', 'read', { path: 'missing.txt' })
      fixture.response(); fixture.update('text_delta', 'Recovered')
    })
    await fixture.run()
    const record = fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]!
    expect(record.status).toBe('failed')
    expect(record.error).toBeTruthy()
    expect(record.input?.text).toContain('missing.txt')
  })

  it('retains timed-out approval as the same cancelled tool', async () => {
    const fixture = setup()
    vi.useFakeTimers()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); fixture.update('text_delta', 'Approval timed out')
      const attempt = fixture.tool(this, 'timeout-write', 'write', { path: 'new.txt', content: 'No write' })
      await vi.waitFor(() => expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toHaveLength(1))
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      await attempt
    })
    await fixture.run()
    const record = fixture.database.harness.getSession(fixture.sessionId).toolCalls[0]!
    expect(record).toMatchObject({ status: 'cancelled', error: '权限确认超时，已取消该操作。' })
    expect(record.approvalRequestId).toBeTruthy()
    expect(fixture.events.find(event => event.type === 'tool-call' && event.payload.id === record.id && event.payload.status === 'cancelled')?.payload).toMatchObject({ runId: record.runId, approvalRequestId: record.approvalRequestId })
    expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toEqual([])
  })

  it('preserves a successful approved write and its diff on the same identity', async () => {
    const fixture = setup()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); fixture.update('text_delta', 'Write')
      const attempt = fixture.tool(this, 'write-approved', 'write', { path: 'new.txt', content: 'New content' })
      await vi.waitFor(() => expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toHaveLength(1))
      fixture.runtime.resolvePermission(fixture.runtime.listPendingPermissions(fixture.sessionId)[0]!.requestId, true)
      await attempt
    })
    await fixture.run()
    const session = fixture.database.harness.getSession(fixture.sessionId)
    expect(session.toolCalls).toHaveLength(1)
    expect(session.toolCalls[0]).toMatchObject({ status: 'ok', target: 'new.txt', diff: expect.stringContaining('New content'), output: { text: expect.stringContaining('new.txt'), truncated: false } })
    expect(session.messages.at(-1)?.fileChanges).toMatchObject([{ toolCallId: session.toolCalls[0]!.id, path: 'new.txt', tool: 'write' }])
  })

  it('marks pending approval and streaming thinking interrupted when the user stops', async () => {
    const fixture = setup()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); fixture.update('thinking_delta', 'Partial thinking')
      const attempt = fixture.tool(this, 'stopped-write', 'write', { path: 'new.txt', content: 'No write' })
      await vi.waitFor(() => expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toHaveLength(1))
      fixture.runtime.abort(fixture.sessionId)
      await attempt
    })
    await fixture.run()
    const session = fixture.database.harness.getSession(fixture.sessionId)
    expect(session.toolCalls[0]).toMatchObject({ status: 'cancelled', error: '运行已停止' })
    expect(session.messages.at(-1)?.run?.activities.find(activity => activity.id === 'tool-stopped-write')).toMatchObject({ status: 'stopped', detail: expect.stringContaining('执行已停止') })
    expect(session.messages.at(-1)).toMatchObject({ interrupted: true, run: { status: 'stopped' }, content: '' })
    expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toEqual([])
  })

  it('bounds UTF-8 reasoning and tool text, redacts credentials, and never stores raw image data', () => {
    const long = '汉'.repeat(HARNESS_PUBLIC_TEXT_BYTES)
    const bounded = publicHarnessText(long)
    expect(Buffer.byteLength(bounded.text)).toBeLessThanOrEqual(HARNESS_PUBLIC_TEXT_BYTES)
    expect(bounded.text).not.toContain('\uFFFD')
    expect(bounded.truncated).toBe(true)
    const input = publicHarnessToolInput({ query: 'platform-private-key', apiKey: 'secret', nested: { Authorization: 'Bearer private' }, bytes: new Uint8Array([1, 2]), data: 'rawblob' }, ['platform-private-key'])
    expect(input.text).not.toMatch(/platform-private-key|rawblob|Bearer private|"secret"/)
    expect(publicHarnessToolOutput({ content: [{ type: 'image', data: 'blob' }, { type: 'text', text: long }] })).toMatchObject({ truncated: true })
    expect(publicHarnessToolOutput({ content: [{ type: 'image', data: 'blob' }] })).toBeUndefined()
    const output = publicHarnessToolOutput({ content: [{ type: 'text', text: '{"apiKey":"private-value","password":"my swordfish"}\nAuthorization: Basic YWxhZGRpbjpvcGVuc2VzYW1l\ndata:image/png;base64,aGVsbG8=' }] })!
    expect(output.text).not.toMatch(/private-value|swordfish|YWxhZGRpbjpvcGVuc2VzYW1l|aGVsbG8=/)
    const escaped = JSON.stringify({ apiKey: 'before " secret AFTER-LEAK', password: 'not " swordfish AFTER-LEAK', refresh_token: 'refresh-private' })
    expect(publicHarnessText(escaped).text).not.toMatch(/AFTER-LEAK|refresh-private/)
    expect(publicHarnessToolOutput({ content: [{ type: 'text', text: escaped }] })?.text).not.toMatch(/AFTER-LEAK|refresh-private/)
  })

  it('sanitizes image JSON from the actual MCP adapter, including mixed text blocks', async () => {
    const manager = new McpManager()
    const callTool = vi.fn().mockResolvedValueOnce({ content: [{ type: 'image', data: 'RAW-MCP-IMAGE-BLOB', mimeType: 'image/png' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Image result' }, { type: 'image', data: 'RAW-MCP-IMAGE-BLOB', mimeType: 'image/png' }] })
    const client = { callTool }
    ;(manager as any).clients.set('test-mcp', client)
    ;(manager as any).connections.set('test-mcp', { state: 'connected', toolCount: 1 })
    const tool = (manager as any).toAgentTool({ name: 'mcp_image' }, client, 'Test MCP', 'test-mcp')
    expect(publicHarnessToolOutput(await tool.execute('image-1', {}))).toBeUndefined()
    const mixed = publicHarnessToolOutput(await tool.execute('image-2', {}))!
    expect(mixed.text).toContain('Image result')
    expect(mixed.text).not.toContain('RAW-MCP-IMAGE-BLOB')
  })

  it.each([true, false, 'true'])('preserves explicit upstream truncation %s without exposing raw details', truncated => {
    const details = { truncation: { truncated }, fullOutputPath: 'private-output-path' }
    for (const content of ['last output window', [{ type: 'text', text: 'last output window' }]]) {
      expect(publicHarnessToolOutput({ content, details })).toEqual({ text: 'last output window', truncated: truncated === true })
    }
    expect(publicHarnessToolOutput({ content: [{ type: 'image', data: 'blob' }], details })).toBeUndefined()
  })

  it('treats a real MCP server error as a failed parent tool and activity', async () => {
    const manager = new McpManager()
    const callTool = vi.fn().mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'MCP server rejected the request' }] })
    const client = { callTool }
    ;(manager as any).clients.set('test-mcp', client)
    ;(manager as any).connections.set('test-mcp', { state: 'connected', toolCount: 1 })
    const tool = (manager as any).toAgentTool({ name: 'mcp_failure' }, client, 'Test MCP', 'test-mcp')
    ;(manager as any).toolsByServer.set('test-mcp', [tool])
    const fixture = setup(manager)
    fixture.database.harness.updateSession({ ...fixture.database.harness.getSession(fixture.sessionId), activeMcpServerIds: ['test-mcp'] })
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); fixture.update('text_delta', 'Try MCP')
      await fixture.tool(this, 'mcp-failed', tool.name, {})
    })
    await fixture.run()
    const session = fixture.database.harness.getSession(fixture.sessionId)
    expect(callTool).toHaveBeenCalledOnce()
    expect(session.toolCalls[0]).toMatchObject({ status: 'failed', error: 'MCP server rejected the request' })
    expect(session.messages.at(-1)?.run?.activities.find(activity => activity.id === 'tool-mcp-failed')).toMatchObject({ status: 'failed' })
  })

  it('does not merge a reused provider call ID from a different model response', async () => {
    const fixture = setup()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); fixture.update('text_delta', 'First ')
      await fixture.tool(this, 'call', 'read', { path: 'note.txt' })
      fixture.response(); fixture.update('text_delta', 'Second')
      await fixture.tool(this, 'call', 'list_files', { path: '.' })
    })
    await fixture.run()
    const session = fixture.database.harness.getSession(fixture.sessionId)
    expect(session.toolCalls).toHaveLength(2)
    expect(session.toolCalls.map(tool => tool.providerCallId)).toEqual(['call', 'call'])
    expect(new Set(session.toolCalls.map(tool => tool.id)).size).toBe(2)
    expect(session.messages.at(-1)?.parts?.filter(part => part.type === 'tool').map(part => part.toolCallId)).toEqual(session.toolCalls.map(tool => tool.id))
  })

  it('links each delegated child to its real public parent when responses reuse a provider ID', async () => {
    const fixture = setup()
    fixture.database.harness.setDelegationEnabled(fixture.sessionId, true)
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      if (this.state.systemPrompt.startsWith('你是 Mira 的')) {
        this.state.messages.push({ role: 'assistant', content: [{ type: 'text', text: '子任务已检查' }], timestamp: Date.now() })
        return
      }
      fixture.response()
      await fixture.tool(this, 'same-delegate', 'delegate_task', { role: 'reviewer', task: '检查第一处' })
      fixture.response()
      await fixture.tool(this, 'same-delegate', 'delegate_task', { role: 'reviewer', task: '检查第二处' })
      await fixture.tool(this, 'wait', 'wait_for_tasks', {})
      fixture.response(); fixture.update('text_delta', '已整合报告')
    })
    await fixture.run()
    const session = fixture.database.harness.getSession(fixture.sessionId)
    const delegates = session.toolCalls.filter(tool => tool.tool === 'delegate_task')
    const children = session.messages.at(-1)!.run!.subtasks!
    expect(delegates.map(tool => tool.providerCallId)).toEqual(['same-delegate', 'same-delegate'])
    expect(delegates[0].id).not.toBe(delegates[1].id)
    expect(children.map(task => task.parentToolCallId)).toEqual(delegates.map(tool => tool.id))
    expect(children.map(task => task.status)).toEqual(['completed', 'completed'])
    const published = fixture.events.filter(event => event.type === 'run-activity').at(-1)!.payload.subtasks as typeof children
    expect(published.map(task => task.parentToolCallId)).toEqual(delegates.map(tool => tool.id))
    expect(new Set(children.map(task => task.id)).size).toBe(2)
  })

  it('keeps coordinator callers without an identity resolver compatible', async () => {
    const fixture = setup()
    const create = vi.spyOn(SubtaskRuntime.prototype, 'create').mockReturnValue({ id: 'child', parentToolCallId: 'raw-call', role: 'reviewer', task: '检查', status: 'queued', createdAt: 1, activities: [] })
    const coordinator = new HarnessSubtaskCoordinator(fixture.database)
    const created = coordinator.create({ sender: fixture.sender, sessionId: fixture.sessionId, session: fixture.database.harness.getSession(fixture.sessionId), model: {}, streamFn: vi.fn(), thinkingLevel: 'off', pricing: undefined, publishActivities: vi.fn(), toolsForTask: () => [], preflightToolCall: async () => undefined, getParentAgent: () => undefined })
    await created.tools.find(tool => tool.name === 'delegate_task')!.execute!('raw-call', { role: 'reviewer', task: '检查' })
    expect(create.mock.calls[0][0].parentToolCallId).toBe('raw-call')
  })

  it('closes a real streaming child before persisting a stopped parent and rejects late publication into a newer run', async () => {
    const fixture = setup()
    fixture.database.harness.setDelegationEnabled(fixture.sessionId, true)
    const create = HarnessSubtaskCoordinator.prototype.create
    let publishOld!: () => void, childTurn = 0
    vi.spyOn(HarnessSubtaskCoordinator.prototype, 'create').mockImplementation(function (this: HarnessSubtaskCoordinator, options) {
      publishOld = options.publishActivities
      return create.call(this, { ...options, streamFn: (_model: any, _context: any, request: any) => {
        const stream = createAssistantMessageEventStream()
        const message: any = { role: 'assistant', api: 'openai-completions', provider: 'fixture', model: 'child', content: [], usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: childTurn++ === 0 ? 'toolUse' : 'stop', timestamp: Date.now() }
        stream.push({ type: 'start', partial: message })
        if (message.stopReason === 'toolUse') {
          message.content = [{ type: 'text', text: 'Before actual read' }, { type: 'toolCall', id: 'child-read', name: 'read', arguments: { path: 'note.txt' } }]
          stream.push({ type: 'done', reason: 'toolUse', message }); stream.end()
        } else {
          message.content = [{ type: 'text', text: 'Child partial platform-' }]
          stream.push({ type: 'text_delta', contentIndex: 0, delta: 'Child partial platform-', partial: message })
          request.signal.addEventListener('abort', () => { message.stopReason = 'aborted'; stream.push({ type: 'error', reason: 'aborted', error: message }); stream.end() }, { once: true })
        }
        return stream
      } })
    })
    const prompt = Agent.prototype.prompt
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any, ...args: any[]) {
      if (this.state.systemPrompt.startsWith('你是 Mira 的')) return prompt.apply(this, args as any)
      fixture.response()
      await fixture.tool(this, 'delegate', 'delegate_task', { role: 'reviewer', task: 'Actual child cancellation' })
      await vi.waitFor(() => expect(fixture.database.harness.getSession(fixture.sessionId).activeRun?.subtasks[0].parts?.at(-1)).toMatchObject({ type: 'text', text: 'Child partial ' }))
      fixture.runtime.abort(fixture.sessionId)
    })
    await fixture.run()
    const state = fixture.database.harness.getSession(fixture.sessionId)
    expect(state.activeRun).toBeUndefined()
    expect(state.messages.at(-1)?.run).toMatchObject({ status: 'stopped', subtasks: [{ status: 'stopped', parts: [{ type: 'text', state: 'complete' }, { type: 'tool' }, { type: 'text', state: 'interrupted', text: 'Child partial [已隐藏]' }] }] })
    expect(state.toolCalls.find(tool => tool.subtaskId)).toMatchObject({ status: 'ok', output: { text: 'Read output' } })
    const coordinator = (fixture.runtime as any).runCoordinator
    coordinator.begin(fixture.sessionId, 'new-owner-run')
    fixture.database.harness.setActiveRun(fixture.sessionId, { id: 'new-owner-run', startedAt: Date.now(), activities: [], subtasks: [] })
    const count = fixture.events.length
    publishOld()
    expect(fixture.events).toHaveLength(count)
    expect(fixture.database.harness.getSession(fixture.sessionId).activeRun?.id).toBe('new-owner-run')
    await coordinator.finish(fixture.sender, fixture.sessionId, 'new-owner-run')
  })

  it('withholds a platform-key prefix across thinking chunks and keeps live/persisted text identical', async () => {
    const fixture = setup()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async () => {
      fixture.response()
      fixture.update('thinking_delta', 'Before platform-')
      fixture.update('thinking_delta', 'private-')
      fixture.update('thinking_delta', 'key after')
      fixture.update('thinking_end')
      fixture.update('text_delta', 'Final', 1)
    })
    await fixture.run()
    const parts = fixture.database.harness.getSession(fixture.sessionId).messages.at(-1)?.parts || []
    const thinking = parts.find(part => part.type === 'reasoning')!
    expect(thinking).toMatchObject({ text: 'Before [已隐藏] after', state: 'complete' })
    let liveText = ''
    for (const event of fixture.events.filter(event => event.type === 'message-part')) {
      const part = event.payload.part as HarnessMessagePart | undefined
      if (part?.type === 'reasoning') liveText = part.text
      if (event.payload.partId === thinking.id) { expect(event.payload.offset).toBe(liveText.length); liveText += event.payload.delta }
      expect(JSON.stringify(event.payload)).not.toContain('platform-private-key')
    }
    expect(liveText).toBe(thinking.type === 'reasoning' ? thinking.text : '')
  })

  it('limits public thinking by actual UTF-8 bytes while retaining full assistant text', async () => {
    const fixture = setup()
    const long = '汉'.repeat(HARNESS_PUBLIC_TEXT_BYTES)
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async () => {
      fixture.response(); fixture.update('thinking_delta', long); fixture.update('thinking_end')
      fixture.update('text_delta', long, 1)
    })
    await fixture.run()
    const message = fixture.database.harness.getSession(fixture.sessionId).messages.at(-1)!
    const thinking = message.parts?.find(part => part.type === 'reasoning')!
    expect(thinking).toMatchObject({ truncated: true })
    expect(thinking.type === 'reasoning' && Buffer.byteLength(thinking.text)).toBeLessThanOrEqual(HARNESS_PUBLIC_TEXT_BYTES)
    expect(message.content).toBe(long)
    expect(message.parts?.filter(part => part.type === 'text').map(part => part.text).join('')).toBe(long)
  })

  it('rewrites citations across text-part boundaries without relocating the tool', () => {
    const parts: HarnessMessagePart[] = [{ id: 'a', type: 'text', text: 'Before [[sou', state: 'complete', startedAt: 1 }, { id: 'b', type: 'tool', toolCallId: 'call' }, { id: 'c', type: 'text', text: 'rce:5]] After', state: 'complete', startedAt: 2 }]
    const result = finalizeAssistantCitations('Before [[source:5]] After', [{ index: 5, title: 'Source', url: 'https://example.com' }], parts)
    expect(result.parts?.map(part => part.type)).toEqual(['text', 'tool', 'text'])
    expect(result.parts?.filter(part => part.type === 'text').map(part => part.text).join('')).toBe(result.content)
    expect(result.content).toBe('Before [1] After')
  })
})
