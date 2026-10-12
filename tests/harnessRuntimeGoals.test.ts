import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpManager } from '../electron/adapters/mcpManager'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import * as modelProvider from '../electron/services/harnessModelProvider'
import { PlatformDatabase } from '../electron/storage/database'
import type { HarnessEvent, HarnessFileReference } from '../src/config/harness'

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
type Step = { text: string; tokens?: number; wait?: ReturnType<typeof deferred>; fail?: boolean; ignoreAbort?: boolean; tools?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }
const pass = (reason = 'Actual work is present'): Step => ({ text: JSON.stringify({ passed: true, reason }), tokens: 5 })
const retry = (nextAction = 'Create the missing second file'): Step => ({ text: JSON.stringify({ passed: false, reason: 'Second file is missing', nextAction }), tokens: 7 })
const selection = { providerId: 'fixture', modelId: 'model' }
const fixtures: ReturnType<typeof setup>[] = []
afterEach(async () => {
  for (const view of fixtures) { for (const id of view.sessionIds) view.runtime.abort(id); view.steps.forEach(step => step.wait?.resolve()) }
  await Promise.allSettled(fixtures.flatMap(view => view.runs))
  for (const view of fixtures) for (const id of view.sessionIds) await view.idle(id)
  await Promise.all(fixtures.map(view => view.manager.closeAll()))
  vi.restoreAllMocks()
  for (const view of fixtures.splice(0)) { view.database.close(); rmSync(view.root, { recursive: true, force: true }) }
})

/** Exercise the installed Agent loop and persistent host API; control only model responses. */
function setup(steps: Step[]) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-runtime-goals-'))), directory = join(root, 'project')
  mkdirSync(directory)
  let database = new PlatformDatabase(root)
  const project = database.harness.createProject(directory), created = database.harness.createSession(project.id)
  database.harness.updateSession({ ...created, delegationEnabled: false, titleSource: 'manual', permissionMode: 'full' })
  database.harness.savePermissionConfig({ ...database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
  const configureProvider = (enabled = true) => database.models.save({ id: 'fixture', name: 'Fixture', endpoint: 'http://127.0.0.1:1/v1', authMode: 'none', enabled, models: [{ id: 'model', enabled: true, reasoning: false }] })
  configureProvider()
  const manager = new McpManager()
  const createRuntime = () => {
    const runtime = new HarnessRuntime(database, manager)
    vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, session) => session)
    vi.spyOn(database.memories, 'enabled').mockReturnValue(false)
    return runtime
  }
  let runtime = createRuntime()
  const contexts: Array<{ systemPrompt: string; messages: any[]; tools: any[]; aborted: boolean }> = [], events: HarnessEvent[] = []
  const original = modelProvider.createHarnessModelProvider
  vi.spyOn(modelProvider, 'createHarnessModelProvider').mockImplementation((...args) => {
    const configured = original(...args)
    vi.spyOn(configured.models, 'streamSimple').mockImplementation((_model, context, options) => {
      const step = steps[contexts.length]
      if (!step) throw new Error(`Unexpected model request ${contexts.length + 1}`)
      const observed = { systemPrompt: context.systemPrompt || '', messages: structuredClone(context.messages), tools: JSON.parse(JSON.stringify(context.tools || [])), aborted: false }
      contexts.push(observed)
      const stream = createAssistantMessageEventStream(), tokens = step.tokens ?? 11
      const message: any = { role: 'assistant', content: [{ type: 'text', text: step.text }, ...(step.tools || []).map(tool => ({ type: 'toolCall', ...tool }))], api: 'openai-completions', provider: 'mira-openai', model: 'model', timestamp: Date.now(), stopReason: step.tools?.length ? 'toolUse' : 'stop', usage: { input: tokens - 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: tokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
      void (async () => {
        await Promise.resolve()
        stream.push({ type: 'start', partial: message }); stream.push({ type: 'text_start', contentIndex: 0, partial: message }); stream.push({ type: 'text_delta', contentIndex: 0, delta: step.text, partial: message })
        if (step.wait) await step.wait.promise
        stream.push({ type: 'text_end', contentIndex: 0, content: step.text, partial: message })
        for (const [index, tool] of (step.tools || []).entries()) stream.push({ type: 'toolcall_end', contentIndex: index + 1, toolCall: tool as any, partial: message })
        observed.aborted = Boolean(options?.signal?.aborted)
        if (step.fail || observed.aborted && !step.ignoreAbort) { message.stopReason = observed.aborted ? 'aborted' : 'error'; message.errorMessage = observed.aborted ? 'Stopped' : 'Fixture model failure'; stream.push({ type: 'error', reason: message.stopReason, error: message }) }
        else stream.push({ type: 'done', reason: message.stopReason, message })
      })()
      return stream
    })
    return configured
  })
  const sender: any = { isDestroyed: () => false, send: (_channel: string, event: HarnessEvent) => events.push(structuredClone(event)) }
  const sessionIds = [created.id], runs: Promise<unknown>[] = []
  let submission = 0
  const submit = (text: string, sessionId = created.id, planning = false, references: HarnessFileReference[] = []) => runtime.submitMessage(sender, sessionId, `goal-input-${++submission}`, text, references, selection, planning)
  const idle = async (sessionId = created.id) => {
    await vi.waitFor(() => {
      expect(runtime.listSessions().find(session => session.id === sessionId)?.isRunning).toBe(false)
      expect(runtime.getMessageQueue(sessionId).promotingItemId).toBeUndefined()
    }, { timeout: 3000 })
  }
  const session = (id = created.id) => runtime.getSession(id)
  const goal = (id = created.id) => database.goals.get(id)
  const resume = (id = created.id) => { const current = goal(id)!; const task = Promise.resolve(runtime.resumeGoal(sender, id, current.revision, selection, undefined, current.id)); task.catch(() => {}); runs.push(task); return task }
  const run = (text: string, id = created.id) => { const task = runtime.runMessage(sender, id, text, [], selection); task.catch(() => {}); runs.push(task); return task }
  const reopen = () => { database.close(); database = new PlatformDatabase(root); runtime = createRuntime() }
  const view = { root, directory, project, get database() { return database }, get runtime() { return runtime }, manager, sessionId: created.id, sessionIds, runs, steps, contexts, events, sender, submit, idle, session, goal, resume, run, reopen, configureProvider }
  fixtures.push(view)
  return view
}

describe('durable Goal mode through the real Harness Agent loop', () => {
  it('persists only parent plan activities across two real goal iterations and keeps unchecked steps pending', async () => {
    const plan = (label: string) => ({ id: 'same-plan-id', name: 'set_plan', arguments: { steps: [{ label }, { label: 'Still unchecked' }] } })
    const view = setup([
      { text: 'First plan', tools: [plan('First iteration')] },
      { text: 'Actual file', tools: [{ id: 'read-one', name: 'read', arguments: { path: 'file.txt' } }] }, { text: 'First delivered' }, retry(),
      { text: 'Second plan', tools: [plan('Second iteration')] }, { text: 'Second delivered' }, pass(),
    ])
    writeFileSync(join(view.directory, 'file.txt'), 'Actual file')
    view.submit('/goal Deliver verified requirements')
    await vi.waitFor(() => expect(view.goal()?.status).toBe('complete')); await view.idle()
    expect(view.goal()!.iterationPlans).toEqual([
      { iteration: 1, items: [{ id: 'plan-0', label: 'First iteration', status: 'completed' }, { id: 'plan-1', label: 'Still unchecked', status: 'pending' }] },
      { iteration: 2, items: [{ id: 'plan-0', label: 'Second iteration', status: 'pending' }, { id: 'plan-1', label: 'Still unchecked', status: 'pending' }] },
    ])
    expect(view.events.filter(event => event.type === 'goal-updated').some(event => (event.payload as any).goal?.iterationPlans?.[0]?.items?.[0]?.status === 'running')).toBe(true)
    view.reopen(); expect(view.goal()!.iterationPlans).toHaveLength(2)
  })
  it('never creates goal plan history from a tool without an actual plan', async () => {
    const view = setup([{ text: 'Actual file', tools: [{ id: 'write', name: 'write', arguments: { path: 'file.txt', content: 'Result' } }] }, { text: 'Delivered' }, pass()])
    view.submit('/goal Write real file'); await vi.waitFor(() => expect(view.goal()?.status).toBe('complete')); await view.idle()
    expect(view.goal()!.iterationPlans).toBeUndefined()
  })
  it('accepts actual plans beyond twelve items and bounds only the public goal snapshot without changing activities', async () => {
    const longDetail = 'Detailed actual instruction '.repeat(220)
    const steps = Array.from({ length: 13 }, (_, index) => ({ label: `Actual step ${index + 1}`, detail: longDetail }))
    const view = setup([{ text: 'Real long plan', tools: [{ id: 'large-plan', name: 'set_plan', arguments: { steps } }] }, { text: 'Plan delivered' }, pass()])
    view.submit('/goal Deliver complete long plan'); await vi.waitFor(() => expect(view.goal()?.status).toBe('complete')); await view.idle()
    expect(view.goal()!.iterationPlans![0].items).toHaveLength(13)
    expect(view.goal()!.iterationPlans![0].items.every(item => item.status === 'pending' && item.detail!.length <= 4000)).toBe(true)
    expect(view.session().messages.at(-1)!.run!.activities.find(activity => activity.kind === 'plan')!.detail).toBe(longDetail.trim())
    expect(view.contexts).toHaveLength(3)
  })
  it('persists real stopped plan activity on pause, retaining later pending steps', async () => {
    const view = setup([{ text: 'Plan', tools: [{ id: 'plan', name: 'set_plan', arguments: { steps: [{ label: 'Slow task' }, { label: 'Future task' }] } }] },
      { text: 'Running', tools: [{ id: 'slow', name: 'bash', arguments: { command: `${JSON.stringify(process.execPath)} -e "setTimeout(() => {}, 30000)"` } }] }])
    view.submit('/goal Complete stoppable work')
    await vi.waitFor(() => expect(view.goal()?.iterationPlans?.[0]?.items[0].status).toBe('running'))
    const goal = view.goal()!
    await view.runtime.pauseGoal(view.sender, view.sessionId, goal.revision, goal.id); await view.idle()
    expect(view.goal()!.iterationPlans![0].items.map(item => item.status)).toEqual(['stopped', 'pending'])
    expect(view.goal()!.status).toBe('paused')
    expect(view.contexts).toHaveLength(2)
  })
  it('retains actual failed plan activity even when an independent verifier passes', async () => {
    const view = setup([{ text: 'Plan', tools: [{ id: 'plan', name: 'set_plan', arguments: { steps: [{ label: 'Check absent file' }] } }] },
      { text: 'Check', tools: [{ id: 'missing', name: 'read', arguments: { path: 'absent.txt' } }] }, { text: 'Reported absence' }, pass()])
    view.submit('/goal Report actual absent file'); await vi.waitFor(() => expect(view.goal()?.status).toBe('complete')); await view.idle()
    expect(view.goal()!.iterationPlans![0].items).toEqual([{ id: 'plan-0', label: 'Check absent file', status: 'failed' }])
    expect(view.goal()!.verification!.status).toBe('passed')
  })
  it('does not project child activities as parent goal plan items or write on every text event', async () => {
    const gate = deferred(), view = setup([{ text: 'Delegate', tools: [{ id: 'delegate', name: 'delegate_task', arguments: { role: 'explorer', task: 'Inspect project' } }, { id: 'wait', name: 'wait_for_tasks', arguments: {} }] },
      { text: 'Child actual progress', wait: gate, tools: [{ id: 'child-files', name: 'list_files', arguments: {} }] }, { text: 'Child report' }, { text: 'Parent answer' }, pass()])
    view.database.harness.updateSession({ ...view.session(), delegationEnabled: true })
    const record = vi.spyOn(view.database.goals, 'recordIterationPlan')
    view.submit('/goal Inspect project and summarize'); await vi.waitFor(() => expect(view.contexts).toHaveLength(2)); gate.resolve()
    await vi.waitFor(() => expect(view.goal()?.status).toBe('complete')); await view.idle()
    expect(view.session().messages.at(-1)?.run?.subtasks?.[0].activities?.length).toBeGreaterThan(0)
    expect(view.goal()!.iterationPlans).toBeUndefined()
    expect(record).not.toHaveBeenCalled()
  })
  it('does actual work, independently verifies a missing requirement, continues and completes only after a passed verifier', async () => {
    const write = (path: string, content: string, id: string) => ({ id, name: 'write', arguments: { path, content } })
    const view = setup([
      { text: 'Writing first file', tools: [write('one.txt', 'first actual result', 'first-write')], tokens: 13 },
      { text: 'First file delivered', tokens: 17 }, retry(),
      { text: 'Writing second file', tools: [write('two.txt', 'second actual result', 'first-write')], tokens: 19 },
      { text: 'Both files delivered', tokens: 23 }, pass(),
    ])
    view.submit('/goal Create one.txt and two.txt with the requested contents')
    await vi.waitFor(() => expect(['complete', 'paused']).toContain(view.goal()?.status), { timeout: 3000 }); await view.idle()
    expect(view.goal()?.status, JSON.stringify(view.goal())).toBe('complete')
    expect(readFileSync(join(view.directory, 'one.txt'), 'utf8')).toBe('first actual result')
    expect(readFileSync(join(view.directory, 'two.txt'), 'utf8')).toBe('second actual result')
    expect(view.contexts).toHaveLength(6)
    for (const index of [2, 5]) {
      expect(view.contexts[index].tools).toEqual([])
      expect(view.contexts[index].systemPrompt + JSON.stringify(view.contexts[index].messages)).toContain('Verify whether every requirement')
      expect(JSON.stringify(view.contexts[index].messages)).toContain('first actual result')
    }
    expect(view.contexts[3].systemPrompt + JSON.stringify(view.contexts[3].messages)).toContain('Create the missing second file')
    expect(view.goal()).toMatchObject({ tokensUsed: 84, iteration: 2, verification: { status: 'passed' } })
    expect(view.goal()?.activeRun).toBeUndefined(); expect(view.session().goal).toEqual(view.goal())
    const writes = view.session().toolCalls.filter(record => record.tool === 'write')
    expect(writes).toHaveLength(2); expect(new Set(writes.map(record => record.id)).size).toBe(2)
    expect(writes.map(record => record.target)).toEqual(['one.txt', 'two.txt'])
    expect(writes.every(record => record.status === 'ok')).toBe(true)
  })

  it('uses ordinary FIFO admission and does not create a goal until the preceding normal message finishes', async () => {
    const gate = deferred(), view = setup([{ text: 'Normal message', wait: gate }, { text: 'Goal work' }, pass()])
    const normal = view.run('Previous normal task'); await vi.waitFor(() => expect(view.contexts).toHaveLength(1))
    const receipt = view.submit('/target Deliver the next task')
    expect(receipt).toHaveProperty('submissionId'); expect(view.goal()).toBeUndefined()
    expect(view.runtime.getMessageQueue(view.sessionId).items.some(item => item.text.startsWith('/target'))).toBe(true)
    gate.resolve(); await normal
    await vi.waitFor(() => expect(view.goal()?.status).toBe('complete')); await view.idle()
    expect(view.goal()?.objective).toBe('Deliver the next task'); expect(view.contexts).toHaveLength(3)
    expect(view.session().messages.filter(message => message.role === 'user').map(message => message.content)).toEqual(expect.arrayContaining(['Previous normal task', '/target Deliver the next task']))
  })

  it('accounts actual child usage together with parent turns and the independent verifier exactly once', async () => {
    const gate = deferred(), view = setup([
      { text: 'Delegate an independent check', tokens: 11, tools: [
        { id: 'delegate-check', name: 'delegate_task', arguments: { role: 'explorer', task: 'Report the actual project state' } },
        { id: 'wait-check', name: 'wait_for_tasks', arguments: {} },
      ] },
      { text: 'Child actual report', tokens: 31, wait: gate },
      { text: 'Parent incorporated child report', tokens: 13 }, pass(),
    ])
    view.database.harness.updateSession({ ...view.session(), delegationEnabled: true })
    view.submit('/goal Check actual project state and deliver a report')
    await vi.waitFor(() => expect(view.contexts).toHaveLength(2)); gate.resolve()
    await vi.waitFor(() => expect(view.goal()?.status).toBe('complete'), { timeout: 3000 }); await view.idle()
    expect(view.contexts).toHaveLength(4); expect(JSON.stringify(view.contexts[2].messages)).toContain('Child actual report')
    expect(view.contexts[3].tools).toEqual([])
    expect(view.goal()).toMatchObject({ tokensUsed: 60, iteration: 1, status: 'complete' })
    expect(view.session().messages.some(message => message.run?.subtasks?.some(task => task.status === 'completed' && task.usage?.totalTokens === 31))).toBe(true)
  })

  it('pauses before cancelling a verifier and rejects its late passed answer, then explicitly resumes with cumulative usage', async () => {
    const gate = deferred(), view = setup([{ text: 'Candidate result', tokens: 20 }, { ...pass(), wait: gate, ignoreAbort: true }, { text: 'Resumed result', tokens: 9 }, pass()])
    view.submit('/goal Deliver actual result'); await vi.waitFor(() => expect(view.contexts).toHaveLength(2))
    const id = view.goal()!.id
    const pausing = Promise.resolve(view.runtime.pauseGoal(view.sender, view.sessionId, view.goal()!.revision, id))
    await vi.waitFor(() => expect(view.goal()?.status).toBe('paused')); gate.resolve(); await pausing; await view.idle()
    expect(view.goal()).toMatchObject({ id, status: 'paused' }); expect(view.goal()?.verification?.status).not.toBe('passed')
    const used = view.goal()!.tokensUsed
    await view.resume(); await view.idle()
    expect(view.goal()?.status, JSON.stringify(view.goal())).toBe('complete')
    expect(view.goal()).toMatchObject({ id, status: 'complete', tokensUsed: used + 14 }); expect(view.contexts).toHaveLength(4)
  })

  it('stops before the next model request when actual usage reaches the budget, and budget changes require explicit resume', async () => {
    const view = setup([{ text: 'Budgeted actual result', tokens: 10 }, { text: 'Continued result', tokens: 3 }, pass()])
    const seeded = view.database.goals.set(view.sessionId, { objective: 'Deliver result', tokenBudget: 10 })
    view.submit('Start working on the objective'); await vi.waitFor(() => expect(view.goal()?.status).toBe('budget_limited')); await view.idle()
    expect(view.contexts).toHaveLength(1); expect(view.goal()).toMatchObject({ id: seeded.id, tokensUsed: 10, tokenBudget: 10 })
    const limited = view.goal()!
    await expect(Promise.resolve().then(() => view.runtime.resumeGoal(view.sender, view.sessionId, limited.revision, selection, undefined, limited.id))).rejects.toThrow('预算')
    await view.runtime.updateGoalBudget(view.sender, view.sessionId, 30, limited.revision, limited.id)
    expect(view.goal()?.status).toBe('budget_limited'); expect(view.contexts).toHaveLength(1)
    await view.resume(); await view.idle()
    expect(view.goal()).toMatchObject({ id: seeded.id, tokensUsed: 18, status: 'complete', tokenBudget: 30 })
  })

  it('pauses an active goal immediately when stopping its real main model request and preserves the objective for resume', async () => {
    const gate = deferred(), view = setup([{ text: 'Partial actual work', tokens: 9, wait: gate }, { text: 'Resumed actual work', tokens: 4 }, pass()])
    view.submit('/goal Deliver this stoppable task'); await vi.waitFor(() => expect(view.contexts).toHaveLength(1))
    const id = view.goal()!.id
    expect(view.runtime.abort(view.sessionId)).toBe(true)
    expect(view.goal()).toMatchObject({ id, status: 'paused' })
    gate.resolve(); await view.idle()
    expect(view.contexts).toHaveLength(1); expect(view.session().messages.at(-1)?.run?.status).toBe('stopped')
    const used = view.goal()!.tokensUsed
    await view.resume(); await view.idle()
    expect(view.goal()).toMatchObject({ id, status: 'complete', tokensUsed: used + 9 })
  })

  it('blocks side effects proposed by a model reply that consumes the remaining goal budget before tool execution', async () => {
    const view = setup([{ text: 'About to write', tokens: 10, tools: [{ id: 'over-budget-write', name: 'write', arguments: { path: 'must-not-exist.txt', content: 'Budget exceeded' } }] }])
    view.database.goals.set(view.sessionId, { objective: 'Write only while tokens remain', tokenBudget: 10 })
    view.submit('Start objective work'); await vi.waitFor(() => expect(view.goal()?.status).toBe('budget_limited')); await view.idle()
    expect(view.contexts).toHaveLength(1); expect(view.goal()?.tokensUsed).toBe(10)
    expect(() => readFileSync(join(view.directory, 'must-not-exist.txt'), 'utf8')).toThrow()
    expect(view.session().toolCalls.some(record => record.tool === 'write' && record.status === 'ok')).toBe(false)
  })

  it.each([
    ['malformed', { text: 'This is not completion JSON', tokens: 6 }],
    ['missing next action', { text: JSON.stringify({ passed: false, reason: 'Insufficient evidence' }), tokens: 6 }],
    ['provider failure', { text: '', tokens: 6, fail: true }],
  ] as const)('pauses on verifier %s rather than inventing completion or another iteration', async (_name, verifier) => {
    const view = setup([{ text: 'Candidate result', tokens: 8 }, verifier])
    view.submit('/goal Deliver a useful result'); await vi.waitFor(() => expect(view.goal()?.status).toBe('paused')); await view.idle()
    expect(view.contexts).toHaveLength(2); expect(view.goal()?.verification?.status).not.toBe('passed')
    expect(view.goal()?.reason || view.goal()?.verification?.reason).toBeTruthy()
    expect(view.goal()?.activeRun).toBeUndefined()
  })

  it('does not continue with a provider disabled during verification and preserves the paused goal for recovery', async () => {
    const gate = deferred(), view = setup([{ text: 'Candidate result' }, { ...retry(), wait: gate }])
    view.submit('/goal Finish the actual work'); await vi.waitFor(() => expect(view.contexts).toHaveLength(2))
    view.configureProvider(false); gate.resolve()
    await vi.waitFor(() => expect(view.goal()?.status).toBe('paused')); await view.idle()
    const current = view.goal()!
    await expect(Promise.resolve().then(() => view.runtime.resumeGoal(view.sender, view.sessionId, current.revision, selection, undefined, current.id))).rejects.toThrow()
    expect(view.goal()).toMatchObject({ id: current.id, status: 'paused', tokensUsed: current.tokensUsed }); expect(view.contexts).toHaveLength(2)
  })

  it('rejects Goal commands in Plan mode without admitting a goal or making a model request', async () => {
    const view = setup([])
    expect(() => view.submit('/goal Deliver this task', view.sessionId, true)).toThrow()
    expect(view.goal()).toBeUndefined(); expect(view.contexts).toEqual([]); expect(view.runtime.getMessageQueue(view.sessionId).items).toEqual([])
  })

  it('keeps an existing active goal untouched while an ordinary Plan message presents a plan for confirmation', async () => {
    const view = setup([{ text: 'Review this plan', tokens: 13, tools: [{ id: 'plan-proposal', name: 'present_plan', arguments: { understanding: 'Read-only planning request', steps: [{ label: 'Review current files' }], risks: [] } }] }])
    const current = view.database.goals.set(view.sessionId, { objective: 'Existing implementation objective' })
    view.submit('Prepare a plan before implementation', view.sessionId, true)
    await vi.waitFor(() => expect(view.session().pendingInteraction?.status).toBe('waiting')); await view.idle()
    expect(view.goal()).toEqual(current); expect(view.contexts).toHaveLength(1)
    expect(view.contexts[0].tools.some(tool => tool.name === 'present_plan')).toBe(true)
    expect(view.contexts[0].systemPrompt).not.toContain('<mira_goal>')
    expect(view.session().pendingInteraction?.kind).toBe('plan-review')
  })

  it('treats attached Goal text as an ordinary message instead of control input', async () => {
    const view = setup([{ text: 'Ordinary attachment response' }])
    writeFileSync(join(view.directory, 'note.txt'), 'Attachment context')
    const reference = view.database.harness.stageMessageAttachment(view.sessionId, 'note.txt')
    view.submit('/goal This is attached discussion', view.sessionId, false, [{ path: reference.path, name: reference.name }])
    await vi.waitFor(() => expect(view.contexts).toHaveLength(1)); await view.idle()
    expect(view.goal()).toBeUndefined(); expect(view.contexts[0].tools.length).toBeGreaterThan(0)
    expect(JSON.stringify(view.contexts[0].messages)).toContain('Attachment context')
    expect(view.session().messages.find(message => message.role === 'user')?.content).toBe('/goal This is attached discussion')
  })

  it('treats a native composer structured-context message as ordinary text rather than activating its leading Goal command', async () => {
    const view = setup([{ text: 'Ordinary structured-context reply' }])
    view.runtime.submitMessage(view.sender, view.sessionId, 'structured-goal-input', '/goal Discuss this selected context', [], selection, false, { hasStructuredContext: true })
    await vi.waitFor(() => expect(view.contexts).toHaveLength(1)); await view.idle()
    expect(view.goal()).toBeUndefined(); expect(view.contexts[0].tools.length).toBeGreaterThan(0)
    expect(view.session().messages.find(message => message.role === 'user')?.content).toBe('/goal Discuss this selected context')
  })

  it('requires explicit replacement, isolates another session, and clears only the intended session goal', async () => {
    const view = setup([{ text: 'Replacement work' }, pass()])
    const first = view.database.goals.set(view.sessionId, { objective: 'Original task' }); view.database.goals.pause(view.sessionId, first.revision)
    const second = view.database.harness.createSession(view.project.id); view.sessionIds.push(second.id)
    const other = view.database.goals.set(second.id, { objective: 'Other session task' })
    expect(() => view.submit('/goal Implicit replacement')).toThrow('替换')
    expect(view.goal()?.id).toBe(first.id)
    view.submit('/goal replace Explicit replacement'); await vi.waitFor(() => expect(view.goal()?.status).toBe('complete')); await view.idle()
    expect(view.goal()?.id).not.toBe(first.id); expect(view.goal()?.objective).toBe('Explicit replacement')
    expect(view.goal(second.id)).toEqual(other)
    const current = view.goal()!
    await expect(Promise.resolve().then(() => view.runtime.clearGoal(view.sender, view.sessionId, current.revision, first.id))).rejects.toThrow()
    expect(view.goal()).toEqual(current)
    await view.runtime.clearGoal(view.sender, view.sessionId, current.revision, current.id)
    expect(view.goal()).toBeUndefined(); expect(view.session().goal).toBeUndefined(); expect(view.goal(second.id)).toEqual(other)
  })

  it('persists a paused goal across database and runtime recreation without silently resuming or changing its accounting', async () => {
    const view = setup([{ text: 'Candidate result', tokens: 8 }, { text: JSON.stringify({ passed: false, reason: 'Needs user input' }), tokens: 5 }, { text: 'Recovered work', tokens: 4 }, pass()])
    view.submit('/goal Finish durable work'); await vi.waitFor(() => expect(view.goal()?.status).toBe('paused')); await view.idle()
    const stored = view.goal()!, count = view.contexts.length
    view.reopen()
    expect(view.goal()).toEqual(stored); expect(view.session().goal).toEqual(stored); expect(view.contexts).toHaveLength(count)
    await view.resume(); await view.idle()
    expect(view.goal()).toMatchObject({ id: stored.id, status: 'complete', tokensUsed: stored.tokensUsed + 9 })
  })
})
