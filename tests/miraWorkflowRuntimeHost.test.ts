import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraFlowController } from '../electron/services/flows/miraFlowController'
import { executeMiraFlowCommand } from '../electron/services/flows/miraFlowCommands'
import { resolveMiraRipgrepPath } from '../electron/services/miraRuntimeTools'
import type { MiraFlowRunIdentity, MiraFlowRunSnapshot } from '../src/config/miraFlowWorkbench'
import type { MiraWorkflowDocument } from '../src/config/miraWorkflows'
import type { HarnessRunActivity } from '../src/config/harness'

let root: string, resources: string
beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-flow-production-')))
  resources = join(root, 'resources')
  execFileSync(process.execPath, ['--input-type=module', '-e', 'import {buildMiraFlow} from "./scripts/build-mira-flow.mjs"; import {buildMiraTools} from "./scripts/build-mira-tools.mjs"; import {join} from "node:path"; await buildMiraFlow(process.argv[1]); await buildMiraTools({output: join(process.argv[1], "tools")});', resources], { cwd: resolve('.'), stdio: 'pipe' })
}, 20_000)
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** Only the remote HTTP model is controlled; all production model/tool/runtime plumbing stays real. */
async function setup(steps: Array<{ name: string; args: unknown }>, choose?: (request: any, requests: any[]) => { name: string; args: unknown }) {
  const requests: any[] = []
  const server = createServer(async (request, response) => {
    const body: Buffer[] = []
    for await (const chunk of request) body.push(Buffer.from(chunk))
    requests.push(JSON.parse(Buffer.concat(body).toString('utf8')))
    const step = choose?.(requests.at(-1), requests) ?? steps[requests.length - 1]
    if (!step) { response.writeHead(400); response.end('Unexpected provider turn'); return }
    if (step.name === 'provider-error') { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: step.args } })); return }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const chunk = (delta: unknown, finish: string | null = null) => response.write(`data: ${JSON.stringify({ id: `reply-${requests.length}`, object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
    if (step.name === 'answer') { chunk({ role: 'assistant', content: step.args }); chunk({}, 'stop') }
    else { chunk({ role: 'assistant', tool_calls: [{ index: 0, id: `call-${requests.length}`, type: 'function', function: { name: step.name, arguments: JSON.stringify(step.args) } }] }); chunk({}, 'tool_calls') }
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address() as { port: number }
  const home = realpathSync(mkdtempSync(join(root, 'home-'))), paths = new MiraPaths(home)
  const database = new PlatformDatabase(paths), directory = join(home, 'project')
  mkdirSync(directory); writeFileSync(join(directory, 'notes.md'), 'REAL-PROJECT-CONTENT')
  const project = database.harness.createProject(directory)
  const selection = { providerId: 'test', modelId: 'fixture' }
  database.models.save({ id: 'test', name: 'Local controlled HTTP', endpoint: `http://127.0.0.1:${address.port}/v1`, authMode: 'none', enabled: true, models: [{ id: 'fixture', enabled: true, reasoning: false, contextWindow: 32000 }] })
  const sender = { isDestroyed: () => false, send: vi.fn() } as any
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any, undefined, undefined,
    resolveMiraRipgrepPath({ appPath: home, isPackaged: true, resourcesPath: resources }))
  const controller = new MiraFlowController({ database, runtime, paths, resourceRoot: resources })
  const save = async (script: string) => controller.request(sender, { action: 'definitions.save', projectId: project.id, input: { scope: 'project', name: 'review', meta: { description: 'Actual workflow host test' }, script } }) as Promise<MiraWorkflowDocument>
  const start = async (definition: MiraWorkflowDocument, permissionMode: 'default' | 'full' = 'default') => controller.request(sender, { action: 'runs.start', projectId: project.id, name: 'review', scope: 'project', revision: definition.revision, selection, permissionMode }) as Promise<MiraFlowRunIdentity>
  const snapshot = async (identity: MiraFlowRunIdentity) => controller.request(sender, { action: 'runs.snapshot', ...identity }) as Promise<MiraFlowRunSnapshot>
  const close = async () => { await controller.dispose(); database.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) }
  return { database, runtime, controller, sender, requests, directory, selection, save, start, snapshot, close, server }
}

describe('actual production workflow model, tools and permission integration', () => {
  it('drains a real actor-owned background command when its typed workflow answer closes the actor', async () => {
    const view = await setup([
      { name: 'bash', args: { command: 'sleep 10', run_in_background: true } },
      { name: 'submit_result', args: { result: { text: 'ACTOR-DONE' } } },
      { name: 'answer', args: '已核对工作流结果。' },
    ])
    try {
      const released: boolean[] = []
      vi.mocked(view.sender.send).mockImplementation((_channel: string, event: import('../src/config/harness').HarnessEvent) => {
        if (event.type === 'session-activity-changed') released.push(view.runtime.listSessions().find(item => item.id === event.sessionId)!.isRunning)
      })
      const identity = await view.start(await view.save('return await agent("writer").ask<{text: string}>("Run the test command, then submit the typed answer");'))
      await vi.waitFor(() => expect(view.runtime.listPendingPermissions(identity.sessionId)).toHaveLength(1), { timeout: 10_000 })
      view.runtime.resolvePermission(view.runtime.listPendingPermissions(identity.sessionId)[0].requestId, true)
      await vi.waitFor(async () => expect((await view.snapshot(identity)).run.status).toBe('completed'), { timeout: 10_000 })
      await vi.waitFor(() => expect(view.controller.hasActiveSession(identity.sessionId)).toBe(false))
      expect(released).toEqual([false])
      const session = view.runtime.getSession(identity.sessionId)
      expect(session.toolCalls.find(tool => tool.tool === 'bash')).toMatchObject({ status: 'ok', commandJob: { mode: 'background', status: 'cancelled' } })
      expect(view.runtime.isProjectRunning(session.projectId!)).toBe(false)
      expect(view.runtime.getMessageQueue(session.id).items).toEqual([])
      await vi.waitFor(() => expect(view.runtime.getSession(identity.sessionId).messages.some(message => message.role === 'assistant' && message.content === '已核对工作流结果。')).toBe(true))
      expect(view.requests).toHaveLength(3)
    } finally { await view.close() }
  }, 20_000)
  it('executes files.grep through the production workflow host with packaged search and no system PATH', async () => {
    const view = await setup([{ name: 'answer', args: '检索完成。' }])
    try {
      writeFileSync(join(view.directory, '问\n答.md'), 'Mira 你好\n')
      const definition = await view.save('return await files.grep("你好", "*.md");')
      vi.stubEnv('PATH', join(root, 'no-system-tools'))
      const identity = await view.start(definition)
      await vi.waitFor(async () => expect((await view.snapshot(identity)).run.status).toBe('completed'), { timeout: 10_000 })
      expect((await view.snapshot(identity)).run.result).toEqual([{ path: '问\n答.md', line: 1, text: 'Mira 你好' }])
      await vi.waitFor(() => expect(view.runtime.getSession(identity.sessionId).messages.some(message => message.role === 'assistant' && message.content === '检索完成。')).toBe(true))
      expect(view.requests).toHaveLength(1)
    } finally { vi.unstubAllEnvs(); await view.close() }
  }, 20_000)

  it('creates from a real /workflow prompt, reviews even in full mode, keeps the parent and reports completion to its real model', async () => {
    const script = 'phase("核验资料"); return await agent("reviewer").ask<{text: string}>("Review the material and submit COMPLETE");'
    let mainCalls = 0
    const view = await setup([], request => {
      const main = request.tools?.some((tool: any) => tool.function.name === 'create_workflow')
      if (!main) return { name: 'submit_result', args: { result: { text: 'ACTUAL-BACKGROUND-COMPLETE' } } }
      mainCalls++
      if (mainCalls === 1) return { name: 'create_workflow', args: { name: '核验资料', script } }
      return { name: 'answer', args: JSON.stringify(request).includes('<mira-workflow-result') ? '已根据真实工作流结果汇报完成。' : '工作流正在后台执行。' }
    })
    try {
      view.database.harness.savePermissionConfig({ ...view.database.harness.getPermissionConfig(), fullAccessEnabled: true })
      const parent = view.database.harness.createSession(view.database.harness.listProjects()[0]!.id, 'full')
      view.database.harness.updateSession({ ...parent, title: '原始任务', titleSource: 'manual' })
      const pending = view.runtime.runMessage(view.sender, parent.id, '/workflow 核验资料', [], view.selection, false)
      await vi.waitFor(() => expect(view.runtime.listPendingPermissions(parent.id)).toHaveLength(1), { timeout: 10_000 })
      const permission = view.runtime.listPendingPermissions(parent.id)[0]!
      expect(permission.workflowReview).toMatchObject({ action: 'run', source: script, model: 'Local controlled HTTP / fixture · off' })
      expect(permission.workflowReview!.graph.phases[0]?.name).toBe('核验资料')
      expect(view.database.flowJournal.listRuns()).toHaveLength(0)
      expect(view.requests).toHaveLength(1)
      expect(JSON.stringify(view.requests[0].messages)).toContain('create_workflow')
      expect(view.runtime.getSession(parent.id).messages[0]!.content).toBe('/workflow 核验资料')
      view.runtime.resolvePermission(permission.requestId, true)
      await pending
      await vi.waitFor(() => expect(view.database.flowJournal.listRuns(parent.id)[0]?.status).toBe('completed'), { timeout: 10_000 })
      await vi.waitFor(() => expect(view.runtime.getSession(parent.id).messages.filter(message => message.role === 'assistant').some(message => message.content.includes('真实工作流结果'))).toBe(true), { timeout: 10_000 })
      expect(view.database.harness.listSessions()).toHaveLength(1)
      const session = view.runtime.getSession(parent.id)
      expect(session.title).toBe('原始任务')
      expect(session.messages.filter(message => message.internal)).toHaveLength(1)
      expect(view.database.flowJournal.listRuns(parent.id)).toHaveLength(1)
      expect(session.toolCalls.find(tool => tool.tool === 'create_workflow')?.status).toBe('ok')
      expect(view.requests.filter(request => !request.tools?.some((tool: any) => tool.function.name === 'create_workflow'))).toHaveLength(1)
    } finally { await view.close() }
  }, 30_000)

  it('compiles save_workflow before a separate forced save review and saves without starting', async () => {
    let calls = 0
    const view = await setup([], () => ++calls === 1 ? { name: 'read_workflow_contract', args: {} } : calls === 2 ? { name: 'save_workflow', args: { name: 'mira-saved', scope: 'project', description: 'Reusable approved workflow', script: 'return 1;' } } : { name: 'answer', args: '已保存定义，未启动。' })
    try {
      const parent = view.database.harness.createSession(view.database.harness.listProjects()[0]!.id)
      view.database.harness.updateSession({ ...parent, titleSource: 'manual' })
      const pending = view.runtime.runMessage(view.sender, parent.id, '保存这个工作流供以后使用', [], view.selection)
      await vi.waitFor(() => expect(view.runtime.listPendingPermissions(parent.id)).toHaveLength(1), { timeout: 10_000 })
      const request = view.runtime.listPendingPermissions(parent.id)[0]!
      expect(request.workflowReview).toMatchObject({ action: 'save', name: 'mira-saved', overwrite: false })
      expect(existsSync(join(view.directory, '.mira', 'workflows', 'mira-saved.dwf.ts'))).toBe(false)
      view.runtime.resolvePermission(request.requestId, true)
      await pending
      expect(readFileSync(join(view.directory, '.mira', 'workflows', 'mira-saved.dwf.ts'), 'utf8')).toContain('return 1;')
      expect(view.database.flowJournal.listRuns()).toHaveLength(0)
      expect(view.runtime.getSession(parent.id).toolCalls.filter(tool => tool.tool === 'save_workflow')).toHaveLength(1)
    } finally { await view.close() }
  }, 30_000)

  it.each(['provider configuration', 'input persistence'] as const)('keeps completion notifications internal when %s fails before queue admission and is retried', async failure => {
    const view = await setup([], () => ({ name: 'answer', args: '真实后台结果已回报。' }))
    let restorePersistence: (() => void) | undefined
    try {
      const automatic = vi.spyOn(view.runtime, 'notifyMiraFlowCompletion').mockImplementationOnce(() => undefined)
      const identity = await view.start(await view.save('return "RETRY-COMPLETION";'))
      await vi.waitFor(() => expect(view.database.flowJournal.getRun(identity.runId)?.status).toBe('completed'), { timeout: 10_000 })
      await vi.waitFor(() => expect(view.controller.hasActiveSession(identity.sessionId)).toBe(false))
      automatic.mockRestore()
      const provider = view.database.models.get('test')!
      if (failure === 'provider configuration') view.database.models.save({ ...provider, enabled: false })
      else {
        const persistSpy = vi.spyOn(view.database.harness, 'addMessage').mockImplementationOnce(() => { throw new Error('Controlled input persistence failure') })
        restorePersistence = () => persistSpy.mockRestore()
      }
      view.runtime.notifyMiraFlowCompletion(view.sender, identity.sessionId, identity.runId, view.selection, 'default')
      await vi.waitFor(() => expect(view.runtime.getMessageQueue(identity.sessionId).paused).toBe('failed'))
      expect(view.runtime.getMessageQueue(identity.sessionId).items).toHaveLength(1)
      expect(view.runtime.getSession(identity.sessionId).messages.filter(message => message.content.includes('<mira-workflow-result'))).toHaveLength(0)
      expect(view.requests).toHaveLength(0)
      if (failure === 'provider configuration') view.database.models.save(provider)
      else { restorePersistence!(); restorePersistence = undefined }
      view.runtime.resumeMessageQueue(identity.sessionId)
      await vi.waitFor(() => expect(view.runtime.getSession(identity.sessionId).messages.some(message => message.role === 'assistant' && message.content.includes('真实后台结果'))).toBe(true), { timeout: 10_000 })
      const notices = view.runtime.getSession(identity.sessionId).messages.filter(message => message.content.includes('<mira-workflow-result'))
      expect(notices).toHaveLength(1)
      expect(notices[0]!.internal).toBe(true)
      expect(view.requests).toHaveLength(1)
      view.runtime.notifyMiraFlowCompletion(view.sender, identity.sessionId, identity.runId, view.selection, 'default')
      expect(view.runtime.getMessageQueue(identity.sessionId).items).toHaveLength(0)
      expect(view.requests).toHaveLength(1)
    } finally { restorePersistence?.(); await view.close() }
  }, 30_000)

  it.each(['create_workflow', 'save_workflow'] as const)('keeps a rejected %s review cancelled and uses readable tool and activity labels', async tool => {
    let calls = 0
    const view = await setup([], () => {
      calls++
      if (tool === 'save_workflow' && calls === 1) return { name: 'read_workflow_contract', args: {} }
      if (calls === (tool === 'save_workflow' ? 2 : 1)) return { name: tool, args: { name: 'review-denied', script: 'return 1;', ...(tool === 'save_workflow' ? { scope: 'project', description: 'Declined reusable workflow' } : {}) } }
      return { name: 'answer', args: '已取消，不再继续执行。' }
    })
    try {
      const parent = view.database.harness.createSession(view.database.harness.listProjects()[0]!.id)
      view.database.harness.updateSession({ ...parent, titleSource: 'manual' })
      const pending = view.runtime.runMessage(view.sender, parent.id, tool === 'create_workflow' ? '/workflow 创建流程' : '保存可复用流程', [], view.selection)
      await vi.waitFor(() => expect(view.runtime.listPendingPermissions(parent.id)).toHaveLength(1), { timeout: 10_000 })
      const permission = view.runtime.listPendingPermissions(parent.id)[0]!
      view.runtime.resolvePermission(permission.requestId, false)
      await pending
      const session = view.runtime.getSession(parent.id)
      expect(session.toolCalls.find(call => call.tool === tool)).toMatchObject({ status: 'cancelled', approvalRequestId: permission.requestId, label: tool === 'create_workflow' ? '运行工作流' : '保存工作流' })
      if (tool === 'save_workflow') expect(session.toolCalls.find(call => call.tool === 'read_workflow_contract')?.label).toBe('读取工作流契约')
      const activities: HarnessRunActivity[] = view.sender.send.mock.calls.flatMap(([, event]: any[]) => event.type === 'run-activity' ? event.payload.activities : [])
      expect(activities.some(activity => activity.label.includes(tool))).toBe(false)
      expect(activities.filter(activity => activity.label === (tool === 'create_workflow' ? '运行工作流' : '保存工作流')).at(-1)).toMatchObject({ status: 'stopped', detail: expect.stringContaining('用户已取消') })
      expect(view.database.flowJournal.listRuns()).toHaveLength(0)
      expect(existsSync(join(view.directory, '.mira', 'workflows', 'review-denied.dwf.ts'))).toBe(false)
    } finally { await view.close() }
  }, 30_000)

  it('keeps an invalid workflow failure distinct from a user cancellation', async () => {
    let calls = 0
    const view = await setup([], () => ++calls === 1 ? { name: 'create_workflow', args: { name: 'invalid', script: 'return await files.nonexistent("notes.md");' } } : { name: 'answer', args: '编译失败，没有执行。' })
    try {
      const parent = view.database.harness.createSession(view.database.harness.listProjects()[0]!.id)
      view.database.harness.updateSession({ ...parent, titleSource: 'manual' })
      await view.runtime.runMessage(view.sender, parent.id, '/workflow 测试无效脚本', [], view.selection)
      const session = view.runtime.getSession(parent.id)
      expect(session.toolCalls.find(call => call.tool === 'create_workflow')).toMatchObject({ status: 'failed', label: '运行工作流' })
      expect(session.toolCalls.find(call => call.tool === 'create_workflow')?.approvalRequestId).toBeUndefined()
      expect(view.runtime.listPendingPermissions(parent.id)).toHaveLength(0)
      expect(view.database.flowJournal.listRuns()).toHaveLength(0)
    } finally { await view.close() }
  }, 30_000)

  it('does not offer workflow tools in plan mode and refuses /workflow before beginning its model turn', async () => {
    const view = await setup([])
    try {
      const parent = view.database.harness.createSession(view.database.harness.listProjects()[0]!.id)
      await expect(view.runtime.runMessage(view.sender, parent.id, '/workflow 执行任务', [], view.selection, true)).rejects.toThrow('执行模式')
      expect(view.requests).toHaveLength(0)
      expect(view.database.flowJournal.listRuns()).toHaveLength(0)
    } finally { await view.close() }
  })

  it('uses configured HTTP provider, reads and writes via real Harness tools, awaits approval and persists typed actor result', async () => {
    const view = await setup([
      { name: 'read', args: { path: 'notes.md' } },
      { name: 'write', args: { path: 'result.md', content: 'MIRA-APPROVED-RESULT' } },
      { name: 'submit_result', args: { result: { text: 'COMPLETE' } } },
    ])
    try {
      const definition = await view.save('const writer = agent("writer"); return await writer.ask<{text: string}>("Read notes, write result, submit typed result");')
      const identity = await view.start(definition)
      await vi.waitFor(() => expect(view.runtime.listPendingPermissions(identity.sessionId)).toHaveLength(1), { timeout: 10_000 })
      expect(view.requests).toHaveLength(2)
      expect(JSON.stringify(view.requests[1])).toContain('REAL-PROJECT-CONTENT')
      expect(() => readFileSync(join(view.directory, 'result.md'))).toThrow()
      expect(() => view.runtime.assertSessionMutable(identity.sessionId)).toThrow('工作流')
      const pending = view.runtime.listPendingPermissions(identity.sessionId)[0]!
      view.runtime.resolvePermission(pending.requestId, true)
      await vi.waitFor(async () => expect((await view.snapshot(identity)).run.status).toBe('completed'), { timeout: 10_000 })
      await vi.waitFor(() => expect(view.controller.hasActiveSession(identity.sessionId)).toBe(false))
      const saved = await view.snapshot(identity)
      expect(saved.run.result).toEqual({ text: 'COMPLETE' })
      expect(readFileSync(join(view.directory, 'result.md'), 'utf8')).toBe('MIRA-APPROVED-RESULT')
      expect(saved.actors[0]?.resolvedModel).toBe(JSON.stringify(['test', 'fixture', 'off']))
      const session = view.runtime.getSession(identity.sessionId)
      expect(session.title).toBe('review')
      expect(session.toolCalls.map(tool => tool.status)).toEqual(['ok', 'ok'])
      expect(view.requests[0].tools.map((tool: any) => tool.function.name)).not.toContain('set_plan')
      expect(view.sender.send.mock.calls.some(([, event]: any[]) => event.type === 'workflow-event')).toBe(true)
      expect(view.runtime.isProjectRunning(session.projectId!)).toBe(false)
    } finally { await view.close() }
  }, 20_000)

  it('cancels a pending write through the ordinary Stop entry and forbids mutation while pending', async () => {
    const view = await setup([{ name: 'write', args: { path: 'never.md', content: 'must-not-write' } }])
    try {
      const identity = await view.start(await view.save('return await agent("writer").ask("Write a file");'))
      await vi.waitFor(() => expect(view.runtime.listPendingPermissions(identity.sessionId)).toHaveLength(1), { timeout: 10_000 })
      expect(view.runtime.abort(identity.sessionId, 'foreign')).toBe(false)
      expect(view.runtime.abort(identity.sessionId, identity.runId)).toBe(true)
      await vi.waitFor(async () => expect((await view.snapshot(identity)).run.status).toBe('stopped'), { timeout: 10_000 })
      await vi.waitFor(() => expect(view.controller.hasActiveSession(identity.sessionId)).toBe(false))
      expect(view.runtime.listPendingPermissions(identity.sessionId)).toEqual([])
      expect(() => readFileSync(join(view.directory, 'never.md'))).toThrow()
      expect(() => view.runtime.assertSessionMutable(identity.sessionId)).not.toThrow()
    } finally { await view.close() }
  }, 20_000)

  it('redacts provider credential echoes before actor transcript, journal and successful snapshot delivery', async () => {
    const secret = 'controlled-provider-private-key'
    const view = await setup([{ name: 'provider-error', args: `Invalid key: ${secret}` }])
    try {
      const provider = view.database.models.get('test')!
      view.database.models.save({ ...provider, authMode: 'api-key', apiKey: secret })
      const identity = await view.start(await view.save('return await agent("writer").ask("reply");'))
      await vi.waitFor(async () => expect((await view.snapshot(identity)).run.status).toBe('errored'), { timeout: 10_000 })
      await vi.waitFor(() => expect(view.controller.hasActiveSession(identity.sessionId)).toBe(false))
      const snapshot = await view.snapshot(identity)
      expect(JSON.stringify(snapshot)).not.toContain(secret)
      expect(JSON.stringify(snapshot.run.failure)).toContain('已隐藏')
      const transcript = await view.database.flowActors.loadOrCreate(snapshot.actors[0]!.sessionId!)
      expect(JSON.stringify(transcript)).not.toContain(secret)
      expect(JSON.stringify(view.sender.send.mock.calls)).not.toContain(secret)
    } finally { await view.close() }
  }, 20_000)

  it('executes declared world.run argv after approval without taking a read lock around the command write lock', async () => {
    const view = await setup([])
    try {
      const executable = JSON.stringify(process.execPath)
      const identity = await view.start(await view.save(`return await world.run(${executable}, ["-e", "process.stdout.write('argv-result')"]);`))
      await vi.waitFor(() => expect(view.runtime.listPendingPermissions(identity.sessionId)).toHaveLength(1), { timeout: 10_000 })
      view.runtime.resolvePermission(view.runtime.listPendingPermissions(identity.sessionId)[0]!.requestId, true)
      await vi.waitFor(async () => expect((await view.snapshot(identity)).run.status).toBe('completed'), { timeout: 10_000 })
      expect((await view.snapshot(identity)).run.result).toMatchObject({ stdout: 'argv-result', exitCode: 0 })
      expect(view.requests.filter(request => !JSON.stringify(request).includes('<mira-workflow-result'))).toHaveLength(0)
    } finally { await view.close() }
  }, 20_000)
})

describe('actual argv workflow command process limits', () => {
  const request = (script: string, signal = new AbortController().signal) => ({ command: process.execPath, args: ['-e', script], cwd: root, signal, timeoutMs: 1000, stdoutMaxBytes: 32, stderrMaxBytes: 32 })
  it('preserves shell syntax as a literal argument', async () => {
    expect(await executeMiraFlowCommand({ ...request('process.stdout.write(process.argv[1])'), args: ['-e', 'process.stdout.write(process.argv[1])', '$(uname);literal'] })).toMatchObject({ stdout: '$(uname);literal', exitCode: 0 })
  })
  it('rejects output overflow and terminates the command', async () => {
    await expect(executeMiraFlowCommand(request('process.stdout.write("x".repeat(500));setInterval(()=>{},1000)'))).rejects.toMatchObject({ code: 'WorldReadCapExceeded' })
  })
  it('supports execution timeouts longer than the Node timer maximum without truncating to 1ms', async () => {
    expect(await executeMiraFlowCommand({ ...request('setTimeout(()=>process.stdout.write("long-limit"),30)'), timeoutMs: 2_147_483_648 })).toMatchObject({ stdout: 'long-limit', exitCode: 0 })
  })
  it('honors timeout and cancellation', async () => {
    await expect(executeMiraFlowCommand({ ...request('setInterval(()=>{},1000)'), timeoutMs: 50 })).rejects.toThrow('超时')
    const abort = new AbortController()
    const pending = executeMiraFlowCommand(request('setInterval(()=>{},1000)', abort.signal))
    abort.abort(); await expect(pending).rejects.toThrow('停止')
  })
  it.skipIf(process.platform === 'win32')('cancels descendant processes before they can continue writing to the project', async () => {
    const directory = mkdtempSync(join(root, 'process-tree-')), ready = join(directory, 'ready'), late = join(directory, 'late')
    const descendant = `require('fs').writeFileSync(${JSON.stringify(ready)}, 'ready');setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(late)}, 'leaked'),250)`
    const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit'});setInterval(()=>{},1000)`
    const abort = new AbortController(), pending = executeMiraFlowCommand(request(parent, abort.signal))
    await vi.waitFor(() => expect(existsSync(ready)).toBe(true))
    abort.abort(); await expect(pending).rejects.toThrow('停止')
    await new Promise(done => setTimeout(done, 350))
    expect(existsSync(late)).toBe(false)
  })
})
