import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAssistantMessageEventStream, Type } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import * as modelProvider from '../electron/services/harnessModelProvider'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraPaths } from '../electron/storage/miraPaths'
import type { HarnessEvent } from '../src/config/harness'
import type { MiraHookEvent, MiraHookWrite } from '../src/config/miraHooks'

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
type Step = { text?: string; wait?: ReturnType<typeof deferred>; tools?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }
const resources: Array<{ root: string; database: PlatformDatabase; runtime: HarnessRuntime; sessionId: string; runs: Promise<unknown>[]; release(): void }> = []
afterEach(async () => {
  for (const fixture of resources) { fixture.runtime.abort(fixture.sessionId); fixture.release() }
  await Promise.allSettled(resources.flatMap(fixture => fixture.runs))
  vi.restoreAllMocks()
  for (const fixture of resources.splice(0)) { fixture.database.close(); rmSync(fixture.root, { recursive: true, force: true }) }
})

function setup(steps: Step[] = [{}], permission: 'default' | 'full' = 'full') {
  const root = mkdtempSync(join(tmpdir(), 'mira-runtime-hooks-')), paths = new MiraPaths(root)
  const database = new PlatformDatabase(paths), directory = join(root, 'project')
  mkdirSync(directory); writeFileSync(join(directory, 'first.txt'), 'original'); writeFileSync(join(directory, 'second.txt'), 'rewritten-read-output')
  const project = database.harness.createProject(directory), created = database.harness.createSession(project.id)
  database.harness.updateSession({ ...created, delegationEnabled: false, titleSource: 'manual', permissionMode: permission })
  database.harness.savePermissionConfig({ ...database.harness.getPermissionConfig(), globalDefaultMode: permission })
  database.models.save({ id: 'fixture', name: 'Fixture', endpoint: 'http://127.0.0.1:1/v1', authMode: 'none', enabled: true, models: [{ id: 'model', enabled: true, reasoning: false }] })
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any)
  vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, session) => session)
  vi.spyOn(database.memories, 'enabled').mockReturnValue(false)
  const contexts: Array<{ systemPrompt: string; messages: any[] }> = [], events: HarnessEvent[] = []
  const original = modelProvider.createHarnessModelProvider
  vi.spyOn(modelProvider, 'createHarnessModelProvider').mockImplementation((...args) => {
    const configured = original(...args)
    vi.spyOn(configured.models, 'streamSimple').mockImplementation((_model, context) => {
      const step = steps[contexts.length] || {}, text = step.text ?? 'Finished'
      contexts.push({ systemPrompt: context.systemPrompt || '', messages: structuredClone(context.messages) })
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
  const runs: Promise<unknown>[] = [], fixture = { root, database, runtime, sessionId: created.id, runs, release: () => steps.forEach(step => step.wait?.resolve()) }
  resources.push(fixture)
  const run = (text = 'Run task') => { const result = runtime.runMessage(sender, created.id, text, [], { providerId: 'fixture', modelId: 'model' }); result.catch(() => {}); runs.push(result); return result }
  const log = join(directory, 'hook-inputs.jsonl')
  const addHook = (event: MiraHookEvent, body = 'console.log(JSON.stringify({}))', fields: Partial<MiraHookWrite> = {}) => {
    const script = join(directory, `hook-${event}-${database.hooks.list(directory).length}.cjs`)
    writeFileSync(script, `const fs=require('node:fs');let text='';process.stdin.on('data',part=>text+=part);process.stdin.on('end',()=>{const input=JSON.parse(text);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({input,pid:process.pid})+'\\n');${body}});`)
    const command = fields.type === 'command' ? `${JSON.stringify(process.execPath)} ${JSON.stringify(script)}` : process.execPath
    return database.hooks.save({ scope: 'project', name: event, event, type: 'process', command, args: [script], ...fields }, directory)
  }
  const inputs = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { input: any; pid: number }) : []
  const session = () => database.harness.getSession(created.id)
  return { ...fixture, paths, directory, project, sender, contexts, events, run, addHook, inputs, session }
}
const tool = (name: string, args: Record<string, unknown>, id = 'actual-tool') => ({ id, name, arguments: args })
function alive(pid: number) { try { process.kill(pid, 0); return true } catch { return false } }

describe('real installed Agent and child-process Hook runtime lifecycle', () => {
  it('runs only reviewed plugin hooks in the real Agent pipeline and stores their provenance', async () => {
    const view = setup(), root = join(view.root, 'plugin with spaces'), marker = join(view.directory, 'plugin-ran')
    mkdirSync(join(root, '.mira-plugin'), { recursive: true }); mkdirSync(join(root, 'hooks'))
    writeFileSync(join(root, '.mira-plugin/plugin.json'), JSON.stringify({ name: 'agent-hook' }))
    writeFileSync(join(root, 'hooks/hooks.json'), JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'process', command: process.execPath, args: ['${CLAUDE_PLUGIN_ROOT}/hook.cjs'] }] }] } }))
    writeFileSync(join(root, 'hook.cjs'), `require('fs').appendFileSync(${JSON.stringify(marker)},'actual\\n');console.log(JSON.stringify({additionalContext:'REAL_REVIEWED_PLUGIN_CONTEXT'}))`)
    view.database.plugins.register(root)
    await view.run('Unreviewed request')
    expect(existsSync(marker)).toBe(false)
    expect(view.contexts[0].systemPrompt).not.toContain('REAL_REVIEWED_PLUGIN_CONTEXT')
    expect(view.session().toolCalls.find(row => row.tool === 'hook')).toMatchObject({ status: 'cancelled', skipReason: expect.stringContaining('信任') })
    expect(view.session().messages.at(-1)?.run?.activities.some(activity => activity.status === 'failed' || activity.status === 'stopped')).toBe(false)
    const frozen = view.database.plugins.snapshots(), accepted = view.database.plugins.assertHook(frozen, frozen[0].hooks![0].id)
    view.database.hooks.trustPlugin(accepted, accepted.revision, true)
    await view.run('Reviewed request')
    expect(readFileSync(marker, 'utf8')).toBe('actual\n')
    expect(view.contexts[1].systemPrompt).toContain('REAL_REVIEWED_PLUGIN_CONTEXT')
    const row = view.session().toolCalls.filter(row => row.tool === 'hook').at(-1)!
    expect(row.status).toBe('ok'); expect(row.input?.text).toContain('agent-hook@local'); expect(row.input?.text).toContain('hooks/hooks.json')
    view.database.hooks.trustPlugin(accepted, accepted.revision, false)
    await view.run('Revoked request')
    expect(readFileSync(marker, 'utf8')).toBe('actual\n')
    expect(view.contexts[2].systemPrompt).not.toContain('REAL_REVIEWED_PLUGIN_CONTEXT')
  })

  it('runs SessionStart once across two sends, applies prompt contexts and preserves user text', async () => {
    const view = setup(); view.addHook('SessionStart', 'console.log(JSON.stringify({additionalContext:"SESSION_HOOK_CONTEXT"}))')
    view.addHook('UserPromptSubmit', 'console.log(JSON.stringify({additionalContext:"PROMPT_HOOK_CONTEXT:"+input.prompt}))')
    await view.run('First request'); await view.run('Second request')
    expect(view.inputs().filter(row => row.input.hook_event_name === 'SessionStart')).toHaveLength(1)
    expect(view.inputs().filter(row => row.input.hook_event_name === 'UserPromptSubmit').map(row => row.input.prompt)).toEqual(['First request', 'Second request'])
    expect(view.contexts[0].systemPrompt).toContain('SESSION_HOOK_CONTEXT'); expect(view.contexts[0].systemPrompt).toContain('PROMPT_HOOK_CONTEXT:First request')
    expect(view.contexts[1].systemPrompt).toContain('PROMPT_HOOK_CONTEXT:Second request')
    expect(view.session().messages.filter(message => message.role === 'user').map(message => message.content)).toEqual(['First request', 'Second request'])
    for (const row of view.inputs()) expect(row.input).toMatchObject({ session_id: view.sessionId, cwd: view.directory, permission_mode: 'full' })
  })

  it('blocks a submitted prompt before any model stream and keeps the actual input and diagnostic', async () => {
    const view = setup(); view.addHook('UserPromptSubmit', 'console.log(JSON.stringify({continue:false,stopReason:"POLICY_BLOCKED_PROMPT"}))')
    await expect(view.run('Blocked request')).rejects.toThrow('POLICY_BLOCKED_PROMPT')
    expect(view.contexts).toHaveLength(0); expect(view.inputs()).toHaveLength(1)
    expect(view.session().messages.some(message => message.role === 'user' && message.content === 'Blocked request')).toBe(true)
    expect(view.session().messages.at(-1)?.run).toMatchObject({ status: 'failed', error: 'POLICY_BLOCKED_PROMPT' })
    expect(view.session().activeRun).toBeUndefined()
  })

  it('uses validated PreToolUse updatedInput for actual file reads and the next model context', async () => {
    const view = setup([{ tools: [tool('read', { path: 'first.txt' })] }, {}])
    view.addHook('PreToolUse', 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",updatedInput:{path:"second.txt"}}}))', { matcher: 'read' })
    view.addHook('PostToolUse')
    await view.run()
    expect(view.session().toolCalls.find(record => record.tool === 'read')).toMatchObject({ status: 'ok', target: 'second.txt', output: { text: 'rewritten-read-output' } })
    expect(JSON.stringify(view.contexts[1].messages)).toContain('rewritten-read-output')
    const after = view.inputs().find(row => row.input.hook_event_name === 'PostToolUse')!.input
    expect(after.tool_input.path).toBe('second.txt'); expect(JSON.stringify(after.tool_response)).toContain('rewritten-read-output')
  })

  it('rechecks permanent dangerous-command gates after PreToolUse rewrites an approved Shell input', async () => {
    const view = setup([{ tools: [tool('bash', { command: 'printf safe' })] }, {}]), victim = join(view.directory, 'must-survive')
    mkdirSync(victim); writeFileSync(join(victim, 'marker'), 'keep')
    const output = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { command: `rm -rf ${JSON.stringify(victim)}` } } }
    view.addHook('PreToolUse', `console.log(${JSON.stringify(JSON.stringify(output))})`, { matcher: 'bash' })
    await view.run()
    expect(readFileSync(join(victim, 'marker'), 'utf8')).toBe('keep')
    expect(view.session().toolCalls.find(record => record.tool === 'bash')).toMatchObject({ status: 'cancelled', error: '危险命令已被永久拦截' })
    expect(view.events.some(event => event.type === 'permission-request')).toBe(false)
  })

  it('writes only the validated path/content returned by PreToolUse, not the model original', async () => {
    const view = setup([{ tools: [tool('write', { path: 'original-write.txt', content: 'Original text' })] }, {}])
    view.addHook('PreToolUse', 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",updatedInput:{path:"rewritten-write.txt",content:"Hook selected text"}}}))', { matcher: 'write' })
    await view.run()
    expect(existsSync(join(view.directory, 'original-write.txt'))).toBe(false)
    expect(readFileSync(join(view.directory, 'rewritten-write.txt'), 'utf8')).toBe('Hook selected text')
    expect(view.session().toolCalls.find(record => record.tool === 'write')).toMatchObject({ status: 'ok', target: 'rewritten-write.txt' })
  })

  it.each(['allow', 'deny'] as const)('applies real PermissionRequest %s before file writes without a synthetic approval', async behavior => {
    const view = setup([{ tools: [tool('write', { path: 'written.txt', content: 'Actual contents' })] }, {}], 'default')
    view.addHook('PermissionRequest', `console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"PermissionRequest",decision:{behavior:${JSON.stringify(behavior)},message:"HOOK_DENY_WRITE"}}}))`, { matcher: 'write' })
    await view.run()
    expect(view.inputs().filter(row => row.input.hook_event_name === 'PermissionRequest')).toHaveLength(1)
    expect(view.events.some(event => event.type === 'permission-request')).toBe(false)
    if (behavior === 'allow') expect(readFileSync(join(view.directory, 'written.txt'), 'utf8')).toBe('Actual contents')
    else { expect(existsSync(join(view.directory, 'written.txt'))).toBe(false); expect(view.session().toolCalls.find(record => record.tool === 'write')).toMatchObject({ status: 'cancelled', error: 'HOOK_DENY_WRITE' }) }
  })

  it('rechecks dangerous commands after PermissionRequest allow replaces the original arguments', async () => {
    const view = setup([{ tools: [tool('bash', { command: 'printf original' })] }, {}], 'default'), victim = join(view.directory, 'permission-gate-must-survive')
    mkdirSync(victim); writeFileSync(join(victim, 'marker'), 'keep')
    const output = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedInput: { command: `rm -rf ${JSON.stringify(victim)}` } } } }
    view.addHook('PermissionRequest', `console.log(${JSON.stringify(JSON.stringify(output))})`, { matcher: 'bash' })
    await view.run()
    expect(readFileSync(join(victim, 'marker'), 'utf8')).toBe('keep')
    expect(view.session().toolCalls.find(record => record.tool === 'bash')).toMatchObject({ status: 'cancelled', error: '危险命令已被永久拦截' })
  })

  it('updates MCP execution arguments and the public target before executing a permission-hook replacement', async () => {
    const name = 'mira_hook_mcp_echo'
    const view = setup([{ tools: [tool(name, { path: 'original-target.txt' }, 'mcp-replacement')] }, {}], 'default')
    const execute = vi.fn(async (_id: string, args: { path: string }) => {
      expect(view.events.some(event => event.type === 'tool-call' && event.payload.tool !== 'hook' && event.payload.target === 'replacement-target.txt')).toBe(true)
      return { content: [{ type: 'text' as const, text: `actual:${args.path}` }] }
    })
    vi.spyOn((view.runtime as any).mcpManager, 'getTools').mockReturnValue([{
      name, label: 'MCP replacement fixture', description: 'Echo the actual arguments', miraMcpServerName: 'Fixture MCP',
      parameters: Type.Object({ path: Type.String() }), executionMode: 'sequential', execute,
    }])
    view.addHook('PermissionRequest', 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"PermissionRequest",decision:{behavior:"allow",updatedInput:{path:"replacement-target.txt"}}}}))', { matcher: name })
    await view.run()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[1]).toEqual({ path: 'replacement-target.txt' })
    expect(view.session().toolCalls.find(record => record.tool === name)).toMatchObject({ status: 'ok', target: expect.stringContaining('replacement-target.txt'), input: { text: expect.stringContaining('replacement-target.txt') }, output: { text: 'actual:replacement-target.txt' } })
    expect(JSON.stringify(view.contexts[1].messages)).toContain('actual:replacement-target.txt')
    expect(view.events.some(event => event.type === 'permission-request')).toBe(false)
  })

  it('emits PostToolUseFailure for actual read failure and supplies the real tool identity and error', async () => {
    const view = setup([{ tools: [tool('read', { path: 'missing.txt' }, 'failed-read')] }, {}]); view.addHook('PostToolUseFailure'); view.addHook('PostToolUse')
    await view.run()
    const failed = view.inputs().filter(row => row.input.hook_event_name === 'PostToolUseFailure')
    expect(failed).toHaveLength(1); expect(failed[0].input).toMatchObject({ tool_name: 'read', tool_input: { path: 'missing.txt' }, is_interrupt: false })
    expect(failed[0].input.tool_use_id).toEqual(expect.stringContaining('failed-read')); expect(JSON.stringify(failed[0].input.error)).toContain('missing.txt')
    expect(view.inputs().some(row => row.input.hook_event_name === 'PostToolUse')).toBe(false)
    expect(view.session().toolCalls.find(record => record.tool === 'read')?.status).toBe('failed')
  })

  it('limits Stop requests to three continuation turns with actual stop_hook_active state', async () => {
    const view = setup(); view.addHook('Stop', 'console.log(JSON.stringify({decision:"block",reason:"CONTINUE_ONCE_MORE"}))')
    await view.run()
    expect(view.contexts).toHaveLength(4)
    expect(view.inputs().filter(row => row.input.hook_event_name === 'Stop').map(row => row.input.stop_hook_active)).toEqual([false, true, true, true])
    for (const context of view.contexts.slice(1)) expect(JSON.stringify(context.messages)).toContain('CONTINUE_ONCE_MORE')
    expect(view.session().messages.at(-1)?.run?.status).toBe('completed'); expect(view.session().activeRun).toBeUndefined()
  })

  it('ignores async blocking output but drains the real process before publishing idle', async () => {
    const view = setup(); view.addHook('UserPromptSubmit', 'setTimeout(()=>console.log(JSON.stringify({continue:false,stopReason:"ASYNC_CANNOT_BLOCK",additionalContext:"ASYNC_CANNOT_INJECT"})),300)', { type: 'command', async: true })
    const pending = view.run()
    await vi.waitFor(() => { expect(view.inputs()).toHaveLength(1); expect(view.contexts).toHaveLength(1) })
    const pid = view.inputs()[0].pid; expect(alive(pid)).toBe(true)
    expect(view.session().activeRun).toBeDefined(); expect(view.events.some(event => event.type === 'message-complete')).toBe(false)
    await pending
    expect(alive(pid)).toBe(false); expect(view.session().messages.at(-1)?.run?.status).toBe('completed')
    expect(view.contexts[0].systemPrompt).not.toMatch(/ASYNC_CANNOT_BLOCK|ASYNC_CANNOT_INJECT/)
  })

  it('cancels and reaps an asynchronous Hook before the run becomes stopped and accepts a fresh send', async () => {
    const view = setup(); const item = view.addHook('UserPromptSubmit', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)', { type: 'command', async: true })
    const pending = view.run(); await vi.waitFor(() => { expect(view.inputs()).toHaveLength(1); expect(view.contexts).toHaveLength(1) })
    const pid = view.inputs()[0].pid; expect(alive(pid)).toBe(true); expect(view.runtime.abort(view.sessionId)).toBe(true)
    await pending; expect(alive(pid)).toBe(false); expect(view.session().activeRun).toBeUndefined(); expect(view.session().messages.at(-1)?.run?.status).toBe('stopped')
    expect(view.session().toolCalls.find(record => record.tool === 'hook')?.status).toBe('cancelled')
    view.database.hooks.setEnabled({ scope: 'project', id: item.id, expectedRevision: item.revision, enabled: false }, view.directory)
    await view.run('Retry'); expect(view.contexts).toHaveLength(2); expect(view.session().messages.at(-1)?.run?.status).toBe('completed')
  })

  it('does not execute an externally modified untrusted declaration and reports why it was skipped', async () => {
    const view = setup(), item = view.addHook('UserPromptSubmit')
    const declaration = JSON.parse(readFileSync(item.sourcePath, 'utf8')); declaration.hooks[0].name = 'External change'; writeFileSync(item.sourcePath, JSON.stringify(declaration))
    expect(view.database.hooks.list(view.directory)[0].trusted).toBe(false)
    await view.run(); expect(view.inputs()).toHaveLength(0); expect(view.contexts).toHaveLength(1)
    expect(view.events.some(event => event.type === 'tool-call' && event.payload.tool === 'hook' && event.payload.status === 'cancelled' && String(event.payload.skipReason).includes('信任'))).toBe(true)
  })

  it('rechecks trusted declarations captured for a run before spawning a later tool Hook', async () => {
    const view = setup([{ tools: [tool('write', { path: 'must-not-write.txt', content: 'Forbidden' })] }, {}])
    const selected = view.addHook('PreToolUse', 'console.log(JSON.stringify({}))', { matcher: 'write' })
    view.addHook('UserPromptSubmit', `const file=${JSON.stringify(selected.sourcePath)};const config=JSON.parse(fs.readFileSync(file,'utf8'));config.hooks.find(row=>row.id===${JSON.stringify(selected.id)}).name='Changed during run';fs.writeFileSync(file,JSON.stringify(config));console.log(JSON.stringify({}));`)
    await view.run()
    expect(existsSync(join(view.directory, 'must-not-write.txt'))).toBe(false)
    expect(view.inputs().some(row => row.input.hook_event_name === 'PreToolUse')).toBe(false)
    expect(view.session().toolCalls.find(record => record.tool === 'write')).toMatchObject({ status: 'cancelled', error: 'Hook 声明或信任状态已变化，请刷新后重试' })
  })

  it.each(['allow', 'block'] as const)('applies UserPromptSubmit to in-run guidance (%s) before the next model stream', async behavior => {
    const gate = deferred(), view = setup([{ wait: gate }, {}]), guidance = 'Change the result'
    view.addHook('UserPromptSubmit', `console.log(JSON.stringify(input.prompt===${JSON.stringify(guidance)}&&${JSON.stringify(behavior)}==='block'?{continue:false,stopReason:'GUIDANCE_BLOCKED_BY_HOOK'}:{additionalContext:'GUIDANCE_CONTEXT:'+input.prompt}))`)
    const pending = view.run('Original request'); await vi.waitFor(() => expect(view.contexts).toHaveLength(1))
    const receipt = await view.runtime.submitMessage(view.sender, view.sessionId, 'guide-hook-message', guidance, [], { providerId: 'fixture', modelId: 'model' }, false, { delivery: 'guide', expectedRunId: view.session().activeRun!.id })
    expect(receipt).toMatchObject({ delivery: 'guide' })
    expect(receipt.queue.items.some(item => item.text === guidance)).toBe(true)
    gate.resolve()
    if (behavior === 'allow') {
      await pending; expect(view.contexts).toHaveLength(2)
      expect(JSON.stringify(view.contexts[1].messages)).toContain(`GUIDANCE_CONTEXT:${guidance}`)
      expect(view.session().messages.filter(message => message.role === 'user').map(message => message.content)).toEqual(['Original request', guidance])
      expect(view.runtime.getMessageQueue(view.sessionId).items).toHaveLength(0)
    } else {
      await expect(pending).rejects.toThrow('GUIDANCE_BLOCKED_BY_HOOK'); expect(view.contexts).toHaveLength(1)
      expect(view.session().messages.filter(message => message.role === 'user').map(message => message.content)).toEqual(['Original request'])
      expect(view.runtime.getMessageQueue(view.sessionId).items.map(item => item.text)).toEqual([guidance])
    }
    expect(view.inputs().filter(row => row.input.hook_event_name === 'UserPromptSubmit').map(row => row.input.prompt)).toEqual(['Original request', guidance])
  })
})
