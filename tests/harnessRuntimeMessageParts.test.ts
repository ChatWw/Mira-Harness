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
  const run = () => (runtime as any).runAgent(sender, created.id, database.harness.getSession(created.id), { providerId: 'p', modelId: 'test', thinkingLevel: 'high' }, provider, 'platform-private-key')
  const update = (type: string, delta?: string, contentIndex = 0) => notify({ type: 'message_update', assistantMessageEvent: { type, delta, contentIndex } })
  const response = () => notify({ type: 'message_start', message: { role: 'assistant' } })
  const tool = async (agent: any, id: string, name: string, args: any, onUpdate?: (partial: unknown) => void) => {
    notify({ type: 'message_update', assistantMessageEvent: { type: 'toolcall_end', toolCall: { id, name, arguments: args } } })
    notify({ type: 'tool_execution_start', toolCallId: id, toolName: name, args })
    const decision = await agent.beforeToolCall({ toolCall: { id, name }, args })
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
      expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toHaveLength(1)
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
      expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toHaveLength(1)
      fixture.runtime.abort(fixture.sessionId)
      await attempt
    })
    await fixture.run()
    const session = fixture.database.harness.getSession(fixture.sessionId)
    expect(session.toolCalls[0]).toMatchObject({ status: 'cancelled', error: '运行已停止' })
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
    const tool = (manager as any).toAgentTool({ name: 'mcp_image' }, { callTool }, 'Test MCP')
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
    const tool = (manager as any).toAgentTool({ name: 'mcp_failure' }, { callTool }, 'Test MCP')
    const fixture = setup({ getTools: () => [tool] })
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: any) {
      fixture.response(); fixture.update('text_delta', 'Try MCP')
      await fixture.tool(this, 'mcp-failed', 'mcp_failure', {})
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
