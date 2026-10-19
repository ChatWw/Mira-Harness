import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import * as modelProvider from '../electron/services/harnessModelProvider'
import { PlatformDatabase } from '../electron/storage/database'
import type { HarnessEvent, HarnessMessageSubmissionReceipt, ModelSelection } from '../src/config/harness'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
import { MIRA_MODEL_ERROR_MESSAGE } from '../src/config/miraModelErrors'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

type Step = { text: string; wait?: ReturnType<typeof deferred>; tools?: Array<{ id: string; name: string; arguments: unknown }>; fail?: boolean }
const resources: Array<{ root: string; database: PlatformDatabase; runtime: HarnessRuntime; sessionId: string; runs: Promise<unknown>[]; release: () => void }> = []
afterEach(async () => {
  for (const fixture of resources) { fixture.runtime.abort(fixture.sessionId); fixture.release() }
  await Promise.allSettled(resources.flatMap(fixture => fixture.runs))
  vi.restoreAllMocks()
  for (const fixture of resources.splice(0)) { fixture.database.close(); rmSync(fixture.root, { recursive: true, force: true }) }
})

function setup(steps: Step[]) {
  const root = mkdtempSync(join(tmpdir(), 'mira-runtime-guidance-'))
  const database = new PlatformDatabase(root)
  const directory = join(root, 'project')
  mkdirSync(directory)
  writeFileSync(join(directory, 'note.txt'), 'Local test contents', 'utf8')
  const project = database.harness.createProject(directory)
  const created = database.harness.createSession(project.id)
  database.harness.updateSession({ ...created, delegationEnabled: false, titleSource: 'manual' })
  database.models.save({ id: 'fixture', name: 'Fixture', endpoint: 'http://127.0.0.1:1/v1', authMode: 'none', enabled: true, models: [{ id: 'model', enabled: true, reasoning: true }, { id: 'other', enabled: true, reasoning: true }] })
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any)
  vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, session) => session)
  vi.spyOn(database.memories, 'enabled').mockReturnValue(false)
  const entered = deferred()
  const contexts: any[][] = []
  const prompts: string[] = []
  const original = modelProvider.createHarnessModelProvider
  vi.spyOn(modelProvider, 'createHarnessModelProvider').mockImplementation((...args) => {
    const configured = original(...args)
    vi.spyOn(configured.models, 'streamSimple').mockImplementation((_model, context, options) => {
      const step = steps[contexts.length] || { text: 'Finished' }
      contexts.push(structuredClone(context.messages))
      prompts.push(context.systemPrompt || '')
      const stream = createAssistantMessageEventStream()
      const message: any = { role: 'assistant', content: [{ type: 'text', text: step.text }, ...(step.tools || []).map(tool => ({ type: 'toolCall', ...tool }))], api: 'openai-completions', provider: 'mira-openai', model: 'model', timestamp: Date.now(), stopReason: step.tools?.length ? 'toolUse' : 'stop', usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
      void (async () => {
        stream.push({ type: 'start', partial: message })
        stream.push({ type: 'text_start', contentIndex: 0, partial: message })
        stream.push({ type: 'text_delta', contentIndex: 0, delta: step.text, partial: message })
        entered.resolve()
        if (step.wait) await step.wait.promise
        stream.push({ type: 'text_end', contentIndex: 0, content: step.text, partial: message })
        for (const [index, tool] of (step.tools || []).entries()) stream.push({ type: 'toolcall_end', contentIndex: index + 1, toolCall: tool as any, partial: message })
        if (step.fail || options?.signal?.aborted) {
          message.stopReason = options?.signal?.aborted ? 'aborted' : 'error'
          message.errorMessage = step.fail ? 'Fixture model failure' : 'Stopped'
          stream.push({ type: 'error', reason: message.stopReason, error: message })
        } else stream.push({ type: 'done', reason: message.stopReason, message })
      })()
      return stream
    })
    return configured
  })
  const events: HarnessEvent[] = []
  let onEvent: ((event: HarnessEvent) => void) | undefined
  const sender: any = { isDestroyed: () => false, send: (_channel: string, event: HarnessEvent) => { events.push(structuredClone(event)); onEvent?.(event) } }
  const selection: ModelSelection = { providerId: 'fixture', modelId: 'model', thinkingLevel: 'medium' }
  const runs: Promise<unknown>[] = []
  const releases: Array<() => void> = []
  const fixture = { root, database, runtime, sessionId: created.id, runs, release: () => { steps.forEach(step => step.wait?.resolve()); releases.forEach(release => release()) } }
  resources.push(fixture)
  const run = (text = 'Original task') => {
    const task = runtime.runMessage(sender, created.id, text, [], selection)
    task.catch(() => {})
    runs.push(task)
    return task
  }
  const guide = (text = 'Change the result', submissionId = 'guide-one', override: Partial<ModelSelection> = {}, references: Array<{ path: string; name: string }> = [], planning = false) => runtime.submitMessage(sender, created.id, submissionId, text, references, { ...selection, ...override }, planning, { delivery: 'guide', expectedRunId: database.harness.getSession(created.id).activeRun!.id }) as HarnessMessageSubmissionReceipt
  return { ...fixture, directory, project, selection, sender, events, contexts, prompts, entered, run, guide, addRelease: (release: () => void) => releases.push(release), setEventHook: (hook: typeof onEvent) => { onEvent = hook } }
}

describe('real installed Agent turn-boundary guidance', () => {
  it('loads user/project command skill dependencies for that run only, including queued commands and regeneration', async () => {
    const gate = deferred(), fixture = setup([{ text: 'Original answer', wait: gate }, { text: 'Command answer' }, { text: 'Regenerated answer' }, { text: 'Ordinary answer' }])
    const directory = join(fixture.database.paths.skills, 'research'); mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'SKILL.md'), '# Research\n\nMIRA_COMMAND_DEPENDENCY_INSTRUCTIONS')
    const skill = fixture.database.skills.list()[0]; fixture.database.skills.setEnabled(skill.id, true)
    fixture.database.promptCommands.save({ scope: 'project', name: 'review', source: '---\nskills: [Research]\n---\nReview $ARGUMENTS' }, fixture.directory)
    const first = fixture.run(); await fixture.entered.promise
    const receipt = await fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'command-skill-intent', '/review notes', [], fixture.selection, false, { delivery: 'guide', expectedRunId: fixture.runtime.getSession(fixture.sessionId).activeRun!.id, skillIds: [] })
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ fallbackReason: 'plugins', command: { requiredSkillIds: [skill.id] } }] } })
    expect(fixture.prompts[0]).not.toContain('MIRA_COMMAND_DEPENDENCY_INSTRUCTIONS')
    gate.resolve(); await first
    await vi.waitFor(() => expect(fixture.runtime.getSession(fixture.sessionId).activeRun).toBeUndefined())
    expect(fixture.prompts[1]).toContain('MIRA_COMMAND_DEPENDENCY_INSTRUCTIONS')
    expect(fixture.contexts[1].at(-1)?.content).toContainEqual({ type: 'text', text: expect.stringContaining('Review notes') })
    await fixture.runtime.rerun(fixture.sender, fixture.sessionId, fixture.selection)
    expect(fixture.prompts[2]).toContain('MIRA_COMMAND_DEPENDENCY_INSTRUCTIONS')
    await fixture.run('Next ordinary task')
    expect(fixture.prompts[3]).not.toContain('MIRA_COMMAND_DEPENDENCY_INSTRUCTIONS')
    expect(fixture.runtime.getSession(fixture.sessionId).activeSkillIds || []).toEqual([])
  })

  it('preserves a queued command when its dependency is disabled before dispatch and resumes after re-enabling', async () => {
    const gate = deferred(), fixture = setup([{ text: 'Original answer', wait: gate }, { text: 'Command answer' }])
    const directory = join(fixture.database.paths.skills, 'research'); mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'SKILL.md'), '# Research\n\nMIRA_COMMAND_DEPENDENCY_INSTRUCTIONS')
    const skill = fixture.database.skills.list()[0]; fixture.database.skills.setEnabled(skill.id, true)
    fixture.database.promptCommands.save({ scope: 'project', name: 'review', source: '---\nskills: [Research]\n---\nReview $ARGUMENTS' }, fixture.directory)
    const first = fixture.run(); await fixture.entered.promise
    const receipt = await fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'disabled-command-skill', '/review notes', [], fixture.selection, false, { delivery: 'queue', expectedRunId: fixture.runtime.getSession(fixture.sessionId).activeRun!.id }) as HarnessMessageSubmissionReceipt
    fixture.database.skills.setEnabled(skill.id, false)
    gate.resolve(); await first
    await vi.waitFor(() => expect(fixture.runtime.getMessageQueue(fixture.sessionId)).toMatchObject({ paused: 'failed', items: [{ id: receipt.id, text: '/review notes' }] }))
    expect(fixture.contexts).toHaveLength(1)
    expect(fixture.runtime.getSession(fixture.sessionId).messages.some(message => message.content === '/review notes')).toBe(false)
    fixture.database.skills.setEnabled(skill.id, true)
    fixture.runtime.resumeMessageQueue(fixture.sessionId)
    await vi.waitFor(() => expect(fixture.runtime.getSession(fixture.sessionId).messages.at(-1)?.content).toBe('Command answer'))
    expect(fixture.contexts).toHaveLength(2)
    expect(fixture.prompts[1]).toContain('MIRA_COMMAND_DEPENDENCY_INSTRUCTIONS')
  })

  it('rechecks command dependencies after awaiting pending memory before requesting the model', async () => {
    const gate = deferred(), entered = deferred(), fixture = setup([{ text: 'Must not request' }])
    const directory = join(fixture.database.paths.skills, 'research'); mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'SKILL.md'), '# Research\n\nMIRA_COMMAND_DEPENDENCY_INSTRUCTIONS')
    const skill = fixture.database.skills.list()[0]; fixture.database.skills.setEnabled(skill.id, true)
    fixture.database.promptCommands.save({ scope: 'project', name: 'review', source: '---\nskills: [Research]\n---\nReview $ARGUMENTS' }, fixture.directory)
    fixture.addRelease(() => gate.resolve())
    vi.spyOn((fixture.runtime as any).memoryCoordinator, 'waitForPending').mockImplementation(async () => { entered.resolve(); await gate.promise })
    const task = fixture.run('/review notes'); await entered.promise
    fixture.database.skills.setEnabled(skill.id, false)
    gate.resolve(); await expect(task).rejects.toThrow('Skill')
    expect(fixture.contexts).toHaveLength(0)
    expect(fixture.runtime.getSession(fixture.sessionId).activeRun).toBeUndefined()
  })

  it('preserves bounded skill identities through both first-party parsers', () => {
    const input = { sessionId: 's', submissionId: 'intent', text: 'Task', references: [], selection: { providerId: 'p', modelId: 'm' }, planning: false, options: { skillIds: ['research'], permissionMode: 'default' } }
    const parsed = parseFirstPartyHarnessCall('message.submit', input)
    expect(parsed).toMatchObject({ options: input.options })
    expect(parseFirstPartyHarnessCall('message.submit', parsed)).toEqual(parsed)
    for (const skillIds of [null, 'research', [123], [''], Array.from({ length: 65 }, () => 'research')]) expect(() => parseFirstPartyHarnessCall('message.submit', { ...input, options: { skillIds } })).toThrow()
  })

  it('queues explicit skills into the next Agent context without mutating the current or following run', async () => {
    const gate = deferred(), fixture = setup([{ text: 'Original answer', wait: gate }, { text: 'Skill answer' }, { text: 'Ordinary answer' }])
    const skillDirectory = join(fixture.root, 'skills', 'research'); mkdirSync(skillDirectory, { recursive: true })
    writeFileSync(join(skillDirectory, 'SKILL.md'), '# Research\n\nMIRA_EXPLICIT_RESEARCH_INSTRUCTIONS')
    fixture.database.skills.saveSettings({ directories: [join(fixture.root, 'skills')] })
    const skill = fixture.database.skills.list()[0]; fixture.database.skills.setEnabled(skill.id, true)
    const first = fixture.run(); await fixture.entered.promise
    const text = `[$Research](mira-skill:${skill.id}) Research next`
    const options = { delivery: 'guide' as const, expectedRunId: fixture.runtime.getSession(fixture.sessionId).activeRun!.id, skillIds: [skill.id] }
    const receipt = await fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'skill-intent', text, [], fixture.selection, false, options)
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ skillIds: [skill.id], fallbackReason: 'skills', text }] } })
    expect(fixture.runtime.getSession(fixture.sessionId).activeSkillIds || []).toEqual([])
    expect(fixture.prompts[0]).not.toContain('MIRA_EXPLICIT_RESEARCH_INSTRUCTIONS')
    expect(() => fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'skill-intent', text, [], fixture.selection, false, { ...options, skillIds: [] })).toThrow('内容不同')
    gate.resolve(); await first
    await vi.waitFor(() => expect(fixture.runtime.listSessions().find(item => item.id === fixture.sessionId)?.isRunning).toBe(false))
    expect(fixture.prompts[1]).toContain('MIRA_EXPLICIT_RESEARCH_INSTRUCTIONS')
    await fixture.run('Next ordinary task')
    expect(fixture.prompts[2]).not.toContain('MIRA_EXPLICIT_RESEARCH_INSTRUCTIONS')
    expect(fixture.runtime.getSession(fixture.sessionId).activeSkillIds || []).toEqual([])
  })

  it('rejects disabled skill intent before admission and does not activate skills inside referenced text', async () => {
    const fixture = setup([{ text: 'Ordinary answer' }])
    const directory = join(fixture.root, 'skills', 'research'); mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'SKILL.md'), '# Research\n\nMIRA_EXPLICIT_RESEARCH_INSTRUCTIONS')
    fixture.database.skills.saveSettings({ directories: [join(fixture.root, 'skills')] })
    const skill = fixture.database.skills.list()[0], text = `Quoted conversation: [$Research](mira-skill:${skill.id})`
    expect(fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'skill-invalid', text, [], fixture.selection, false, { skillIds: [skill.id] })).toMatchObject({ retryRequired: true, reason: 'skill-unavailable' })
    expect(fixture.runtime.getMessageQueue(fixture.sessionId).items).toEqual([])
    fixture.database.skills.setEnabled(skill.id, true)
    const receipt = await fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'skill-invalid', text, [], fixture.selection, false, { skillIds: [] })
    expect(receipt).toHaveProperty('id')
    await vi.waitFor(() => expect(fixture.prompts).toHaveLength(1))
    expect(fixture.prompts[0]).not.toContain('MIRA_EXPLICIT_RESEARCH_INSTRUCTIONS')
  })

  it.each(['full', 'default'] as const)('authorizes real write tools using frozen explicit submission permission (%s)', async permissionMode => {
    const gate = deferred()
    const fixture = setup([{ text: 'Before write', wait: gate, tools: [{ id: 'permission-write', name: 'write', arguments: { path: 'permission.txt', content: 'Frozen permission' } }] }, { text: 'After write' }])
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: permissionMode === 'full' ? 'default' : 'full' })
    await fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'permission-tool', 'Write fixture', [], fixture.selection, false, { permissionMode })
    await fixture.entered.promise
    gate.resolve()
    if (permissionMode === 'default') {
      await vi.waitFor(() => expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toHaveLength(1))
      fixture.runtime.resolvePermission(fixture.runtime.listPendingPermissions(fixture.sessionId)[0]!.requestId, false)
    }
    await vi.waitFor(() => expect(fixture.runtime.getSession(fixture.sessionId).activeRun).toBeUndefined())
    expect(fixture.runtime.getSession(fixture.sessionId).permissionMode).toBe(permissionMode)
    expect(fixture.runtime.getSession(fixture.sessionId).toolCalls[0]?.status).toBe(permissionMode === 'full' ? 'ok' : 'cancelled')
    expect(existsSync(join(fixture.directory, 'permission.txt'))).toBe(permissionMode === 'full')
  })

  it('queues a guide with a different explicit permission instead of changing the executing run', async () => {
    const gate = deferred(), fixture = setup([{ text: 'Running', wait: gate }, { text: 'Queued permission' }])
    const task = fixture.run(); await fixture.entered.promise
    const receipt = await fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'different-permission-guide', 'Next permission', [], fixture.selection, false, { delivery: 'guide', expectedRunId: fixture.runtime.getSession(fixture.sessionId).activeRun!.id, permissionMode: 'full' })
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ permissionMode: 'full', fallbackReason: 'permission-mismatch' }] } })
    expect(fixture.runtime.getSession(fixture.sessionId).permissionMode).toBe('default')
    gate.resolve(); await task
    await vi.waitFor(() => expect(fixture.runtime.getSession(fixture.sessionId).permissionMode).toBe('full'))
    await vi.waitFor(() => expect(fixture.runtime.getSession(fixture.sessionId).activeRun).toBeUndefined())
  })

  it('accepts only an identified guide target at the authority parser and drops injected authorization fields', () => {
    const input = { sessionId: 's', submissionId: 'one', text: 'Guide', references: [], planning: false, selection: { providerId: 'p', modelId: 'm' } }
    const options = { permissionMode: 'full', delivery: 'guide', expectedRunId: 'run' }
    const parsed = parseFirstPartyHarnessCall('message.submit', { ...input, options: { ...options, apiKey: 'injected' } })
    expect(parsed).toEqual({ method: 'message.submit', ...input, options })
    expect(parseFirstPartyHarnessCall('message.submit', parsed)).toEqual(parsed)
    for (const invalid of [{ delivery: 'guide' }, { ...options, expectedRunId: null }, { ...options, expectedRunId: '' }, { ...options, pausedQueueDecision: 'retain', expectedQueueRevision: 0, expectedQueueItemIds: [] }]) {
      expect(() => parseFirstPartyHarnessCall('message.submit', { ...input, options: invalid })).toThrow()
    }
  })

  it('finishes the complete current tool batch, steers the same run, and persists distinct assistant/user/assistant segments once', async () => {
    const modelGate = deferred(), toolGate = deferred(), toolEntered = deferred()
    const fixture = setup([{ text: 'Before', wait: modelGate, tools: [{ id: 'one', name: 'read', arguments: { path: 'note.txt' } }, { id: 'two', name: 'list_files', arguments: { path: '.' } }] }, { text: 'After' }])
    fixture.addRelease(toolGate.resolve)
    const originalTools = (fixture.runtime as any).tools.bind(fixture.runtime)
    vi.spyOn(fixture.runtime as any, 'tools').mockImplementation((...args) => {
      const registered = originalTools(...args)
      const read = registered.tools.find((tool: any) => tool.name === 'read'), execute = read.execute
      read.execute = async (...values: any[]) => { toolEntered.resolve(); await toolGate.promise; return execute(...values) }
      return registered
    })
    const task = fixture.run()
    await fixture.entered.promise
    expect(fixture.runtime.listSessions().find(session => session.id === fixture.sessionId)?.isRunning).toBe(true)
    modelGate.resolve(); await toolEntered.promise
    const receipt = fixture.guide()
    expect(receipt.delivery).toBe('guide')
    expect(fixture.events.some(event => event.type === 'message-boundary')).toBe(false)
    expect(fixture.runtime.getMessageQueue(fixture.sessionId).items).toHaveLength(1)
    toolGate.resolve(); await task
    expect(fixture.runtime.listSessions().find(session => session.id === fixture.sessionId)?.isRunning).toBe(false)
    const session = fixture.runtime.getSession(fixture.sessionId)
    expect(session.messages.map(message => [message.role, message.content])).toEqual([['user', 'Original task'], ['assistant', 'Before'], ['user', 'Change the result'], ['assistant', 'After']])
    expect(session.messages[2]).toMatchObject({ id: receipt.id, delivery: 'guide', submissionId: 'guide-one', runId: session.messages[1]!.runId })
    expect(session.messages[1]!.parts?.map(part => part.type)).toEqual(['text', 'tool', 'tool'])
    expect(session.messages[1]!.run).toBeUndefined()
    expect(session.messages[3]!.run?.status).toBe('completed')
    expect(session.messages[3]!.parts?.map(part => part.type)).toEqual(['text'])
    expect(new Set(session.messages.filter(message => message.role === 'assistant').map(message => message.id)).size).toBe(2)
    expect(fixture.contexts).toHaveLength(2)
    expect(fixture.contexts[1]!.filter(message => message.role === 'toolResult')).toHaveLength(2)
    expect(fixture.contexts[1]!.at(-1)).toMatchObject({ role: 'user', content: 'Change the result' })
    const boundary = fixture.events.find(event => event.type === 'message-boundary')!
    expect(boundary.payload).toMatchObject({ message: session.messages[2], previousAssistantMessageId: session.messages[1]!.id, previousAssistantMessage: session.messages[1], nextAssistantMessageId: session.messages[3]!.id, queueItemId: receipt.id })
    expect(fixture.events.filter(event => event.type === 'run-start')).toHaveLength(1)
    expect(fixture.events.filter(event => event.type === 'status' && event.payload.state === 'idle')).toHaveLength(1)
    const lastToolEnd = fixture.events.map(event => event.type === 'tool-call' && ['ok', 'failed', 'cancelled'].includes(String(event.payload.status))).lastIndexOf(true)
    expect(fixture.events.indexOf(boundary)).toBeGreaterThan(lastToolEnd)
    expect(fixture.events.filter(event => ['message-part', 'message-delta', 'message-complete'].includes(event.type)).every(event => [session.messages[1]!.id, session.messages[3]!.id].includes(String(event.payload.messageId)))).toBe(true)
    expect(fixture.runtime.getMessageQueue(fixture.sessionId).items).toEqual([])
    const reload = new PlatformDatabase(fixture.root)
    try {
      const { pluginCatalog, ...persistedSession } = reload.harness.getSession(fixture.sessionId)
      expect(pluginCatalog).toEqual([])
      expect(session).not.toHaveProperty('pluginCatalog')
      expect(persistedSession).toEqual(session)
    } finally { reload.close() }
  })

  it('consumes multiple guides one at a time without replaying earlier text or colliding part identities', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'A', wait: gate }, { text: 'B' }, { text: 'C' }])
    const task = fixture.run(); await fixture.entered.promise
    const first = fixture.guide('Guide one', 'one'), second = fixture.guide('Guide two', 'two')
    gate.resolve(); await task
    const messages = fixture.runtime.getSession(fixture.sessionId).messages
    expect(messages.map(message => message.content)).toEqual(['Original task', 'A', 'Guide one', 'B', 'Guide two', 'C'])
    expect(messages.filter(message => message.delivery === 'guide').map(message => message.id)).toEqual([first.id, second.id])
    expect(fixture.events.filter(event => event.type === 'message-boundary')).toHaveLength(2)
    const ids = messages.flatMap(message => message.parts?.map(part => part.id) || [])
    expect(new Set(ids).size).toBe(ids.length)
    expect(messages.at(-1)?.usage?.input).toBe(30)
  })

  it('withdraws a still-pending guide without putting it in either engine context or public history', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'Original result', wait: gate }])
    const task = fixture.run(); await fixture.entered.promise
    const receipt = fixture.guide()
    fixture.runtime.withdrawMessage(fixture.sessionId, receipt.id)
    gate.resolve(); await task
    expect(fixture.contexts).toHaveLength(1)
    expect(fixture.runtime.getSession(fixture.sessionId).messages.map(message => message.content)).toEqual(['Original task', 'Original result'])
    expect(fixture.events.some(event => event.type === 'message-boundary')).toBe(false)
  })

  it.each(['attachments', 'planning', 'model-mismatch', 'permission-mismatch'] as const)('visibly falls back with all original Composer fields intact (%s)', async reason => {
    const gate = deferred()
    const fixture = setup([{ text: 'Original result', wait: gate }])
    const task = fixture.run(); await fixture.entered.promise
    if (reason === 'permission-mismatch') fixture.database.harness.setPermission(fixture.sessionId, 'full')
    const references = reason === 'attachments' ? [{ path: 'note.txt', name: 'note.txt' }] : []
    const selection = reason === 'model-mismatch' ? { modelId: 'other' } : {}
    const receipt = fixture.guide('Requested task', 'fallback', selection, references, reason === 'planning')
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ text: 'Requested task', requestedDelivery: 'guide', fallbackReason: reason, references, selection: { ...fixture.selection, ...selection }, planning: reason === 'planning', permissionMode: reason === 'permission-mismatch' ? 'full' : 'default' }] } })
    expect(receipt.queue.items[0]!.delivery).toBeUndefined()
    fixture.runtime.abort(fixture.sessionId); gate.resolve(); await task
    expect(fixture.runtime.getSession(fixture.sessionId).messages.some(message => message.content === 'Requested task')).toBe(false)
    expect(fixture.contexts).toHaveLength(1)
  })

  it('preserves a frozen attachment when a guide falls back and later runs as an ordinary queued task', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'Original result', wait: gate }, { text: 'Attachment result' }])
    const task = fixture.run(); await fixture.entered.promise
    const receipt = fixture.guide('Use the attached file', 'file-guide', {}, [{ path: 'note.txt', name: 'note.txt' }])
    expect(receipt.delivery).toBe('queue')
    writeFileSync(join(fixture.directory, 'note.txt'), 'Changed after acceptance', 'utf8')
    gate.resolve(); await task
    await vi.waitFor(() => expect(fixture.runtime.getSession(fixture.sessionId).messages.at(-1)?.content).toBe('Attachment result'))
    await vi.waitFor(() => expect((fixture.runtime as any).runCoordinator.isRunning(fixture.sessionId)).toBe(false))
    const user = fixture.runtime.getSession(fixture.sessionId).messages.find(message => message.content === 'Use the attached file')!
    expect(user.attachments?.[0]).toMatchObject({ path: 'note.txt', content: 'Local test contents' })
    expect(user.delivery).toBeUndefined()
  })

  it('retains the existing permission-command semantics without requiring a new model or feeding the command to the Agent', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'Original result', wait: gate }])
    const task = fixture.run(); await fixture.entered.promise
    const runId = fixture.runtime.getSession(fixture.sessionId).activeRun!.id
    const receipt = fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'perm-guide', '/perm full', [{ path: 'missing.txt', name: 'missing.txt' }], { providerId: '', modelId: '' }, false, { delivery: 'guide', expectedRunId: runId }) as HarnessMessageSubmissionReceipt
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ references: [{ path: 'missing.txt', name: 'missing.txt' }], fallbackReason: 'run-unavailable', text: '/perm full' }] } })
    gate.resolve(); await task
    await vi.waitFor(() => expect(fixture.runtime.getSession(fixture.sessionId).permissionMode).toBe('full'))
    expect(fixture.contexts).toHaveLength(1)
    expect(fixture.runtime.getSession(fixture.sessionId).messages.some(message => message.content === '/perm full')).toBe(false)
  })

  it('rejects a stale guide target before reading references or validating a changed provider', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'Original result', wait: gate }])
    const task = fixture.run(); await fixture.entered.promise
    const read = vi.spyOn(fixture.database.harness, 'resolveMessageAttachments')
    expect(fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'stale-guide', 'Guidance', [{ path: 'missing.txt', name: 'missing.txt' }], { providerId: '', modelId: '' }, false, { delivery: 'guide', expectedRunId: 'retired-run' })).toMatchObject({ retryRequired: true, queue: { items: [] } })
    expect(read).not.toHaveBeenCalled()
    gate.resolve(); await task
  })

  it('keeps an approval intact and falls back rather than using guidance to authorize a pending write', async () => {
    const fixture = setup([{ text: 'Before write', tools: [{ id: 'write-one', name: 'write', arguments: { path: 'approved.txt', content: 'Needs authorization' } }] }, { text: 'Denied' }])
    const task = fixture.run()
    await vi.waitFor(() => expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toHaveLength(1))
    const request = fixture.runtime.listPendingPermissions(fixture.sessionId)[0]!
    const receipt = fixture.guide('Continue without changing approvals', 'approval-guide')
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ fallbackReason: 'confirmation' }] } })
    expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toEqual([request])
    fixture.runtime.abort(fixture.sessionId); await task
    expect(fixture.runtime.getSession(fixture.sessionId).toolCalls[0]!.status).toBe('cancelled')
    expect(fixture.runtime.getMessageQueue(fixture.sessionId).paused).toBe('stopped')
  })

  it.each(['deny', 'stop'] as const)('holds an already-accepted guide through a later approval (%s)', async outcome => {
    const gate = deferred()
    const fixture = setup([{ text: 'Before write', wait: gate, tools: [{ id: 'write-one', name: 'write', arguments: { path: 'approved.txt', content: 'Needs authorization' } }] }, { text: 'After denied write' }])
    const task = fixture.run(); await fixture.entered.promise
    const receipt = fixture.guide()
    expect(receipt.delivery).toBe('guide')
    gate.resolve()
    await vi.waitFor(() => expect(fixture.runtime.listPendingPermissions(fixture.sessionId)).toHaveLength(1))
    expect(fixture.runtime.getMessageQueue(fixture.sessionId).items).toMatchObject([{ id: receipt.id, delivery: 'guide' }])
    expect(fixture.events.some(event => event.type === 'message-boundary')).toBe(false)
    if (outcome === 'stop') fixture.runtime.abort(fixture.sessionId)
    else fixture.runtime.resolvePermission(fixture.runtime.listPendingPermissions(fixture.sessionId)[0]!.requestId, false)
    await task
    expect(fixture.runtime.getSession(fixture.sessionId).toolCalls[0]!.status).toBe('cancelled')
    expect(existsSync(join(fixture.directory, 'approved.txt'))).toBe(false)
    if (outcome === 'stop') {
      expect(fixture.runtime.getSession(fixture.sessionId).messages.some(message => message.id === receipt.id)).toBe(false)
      expect(fixture.runtime.getMessageQueue(fixture.sessionId)).toMatchObject({ paused: 'stopped', items: [{ id: receipt.id, fallbackReason: 'run-ended' }] })
    } else {
      expect(fixture.runtime.getSession(fixture.sessionId).messages.filter(message => message.id === receipt.id)).toHaveLength(1)
      expect(fixture.contexts[1]!.at(-1)).toMatchObject({ role: 'user', content: 'Change the result' })
      expect(fixture.runtime.getMessageQueue(fixture.sessionId).items).toEqual([])
    }
  })

  it('keeps the session permission snapshot when the global default changes after guidance admission', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'Before write', wait: gate, tools: [{ id: 'write-one', name: 'write', arguments: { path: 'approved.txt', content: 'Needs authorization' } }] }, { text: 'After denied write' }])
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    fixture.database.harness.setPermission(fixture.sessionId, 'full')
    const task = fixture.run(); await fixture.entered.promise
    const receipt = fixture.guide()
    expect(receipt.delivery).toBe('guide')
    fixture.database.harness.savePermissionConfig({ ...fixture.database.harness.getPermissionConfig(), globalDefaultMode: 'default' })
    gate.resolve()
    await task
    expect(fixture.runtime.getSession(fixture.sessionId).toolCalls[0]!).toMatchObject({ status: 'ok' })
    expect(existsSync(join(fixture.directory, 'approved.txt'))).toBe(true)
    expect(fixture.events.some(event => event.type === 'permission-request')).toBe(false)
    expect(fixture.runtime.getSession(fixture.sessionId).messages.filter(message => message.id === receipt.id)).toHaveLength(1)
  })

  it('falls back during preparation before an Agent can accept guidance', async () => {
    const gate = deferred(), preparing = deferred()
    const fixture = setup([{ text: 'Original result' }, { text: 'Queued result' }])
    fixture.addRelease(gate.resolve)
    vi.spyOn(fixture.runtime as any, 'compactContext').mockImplementationOnce(async (_sender, session) => { preparing.resolve(); await gate.promise; return session })
    const task = fixture.run(); await preparing.promise
    const receipt = fixture.guide()
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ fallbackReason: 'run-unavailable' }] } })
    expect(fixture.contexts).toHaveLength(0)
    gate.resolve(); await task
    await vi.waitFor(() => expect((fixture.runtime as any).runCoordinator.isRunning(fixture.sessionId)).toBe(false))
    expect(fixture.runtime.getSession(fixture.sessionId).messages.map(message => message.content)).toEqual(['Original task', 'Original result', 'Change the result', 'Queued result'])
    expect(fixture.events.some(event => event.type === 'message-boundary')).toBe(false)
  })

  it('falls back after the engine has ended without reopening or injecting into the completed parent', async () => {
    const fixture = setup([{ text: 'Original result' }, { text: 'Queued result' }])
    let receipt: HarnessMessageSubmissionReceipt | undefined
    fixture.setEventHook(event => { if (event.type === 'message-complete' && !receipt) receipt = fixture.guide('Late guidance', 'late-guide') })
    await fixture.run()
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ fallbackReason: 'run-unavailable' }] } })
    await vi.waitFor(() => expect((fixture.runtime as any).runCoordinator.isRunning(fixture.sessionId)).toBe(false))
    expect(fixture.runtime.getSession(fixture.sessionId).messages.map(message => message.content)).toEqual(['Original task', 'Original result', 'Late guidance', 'Queued result'])
    expect(fixture.events.filter(event => event.type === 'run-start')).toHaveLength(2)
    expect(fixture.events.some(event => event.type === 'message-boundary')).toBe(false)
  })

  it('retains pending guidance rather than consuming it in a changed workspace', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'Before', wait: gate }])
    const task = fixture.run(); await fixture.entered.promise
    const receipt = fixture.guide()
    const session = fixture.runtime.getSession(fixture.sessionId)
    fixture.database.harness.updateSession({ ...session, workingDirectory: join(fixture.root, 'different-workspace') })
    gate.resolve(); await expect(task).rejects.toThrow('工作目录已变化')
    expect(fixture.runtime.getMessageQueue(fixture.sessionId)).toMatchObject({ paused: 'failed', items: [{ id: receipt.id, fallbackReason: 'run-ended' }] })
    expect(fixture.runtime.getSession(fixture.sessionId).messages.some(message => message.delivery === 'guide')).toBe(false)
    expect(fixture.events.some(event => event.type === 'message-boundary')).toBe(false)
    expect(fixture.contexts).toHaveLength(1)
  })

  it('replays the original receipt before and after consumption without rereading input or duplicating the engine message', async () => {
    const gate = deferred(), afterGate = deferred()
    const fixture = setup([{ text: 'Before', wait: gate }, { text: 'After', wait: afterGate }])
    const task = fixture.run(); await fixture.entered.promise
    const runId = fixture.runtime.getSession(fixture.sessionId).activeRun!.id
    const read = vi.spyOn(fixture.database.harness, 'resolveMessageAttachments')
    const submit = () => fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'retry-guide', 'Guidance', [], fixture.selection, false, { delivery: 'guide', expectedRunId: runId }) as HarnessMessageSubmissionReceipt
    const receipt = submit()
    expect(submit()).toMatchObject({ id: receipt.id, delivery: 'guide' })
    gate.resolve()
    await vi.waitFor(() => expect(fixture.contexts).toHaveLength(2))
    expect(submit()).toMatchObject({ id: receipt.id, delivery: 'guide', queue: { items: [] } })
    afterGate.resolve(); await task
    expect(submit()).toMatchObject({ id: receipt.id, delivery: 'guide', queue: { items: [] } })
    expect(read).toHaveBeenCalledOnce()
    expect(fixture.events.filter(event => event.type === 'message-boundary')).toHaveLength(1)
    expect(fixture.runtime.getSession(fixture.sessionId).messages.filter(message => message.id === receipt.id)).toHaveLength(1)
  })

  it('does not resurrect an already-consumed guide if Stop arrives at its published boundary', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'Before', wait: gate }])
    const task = fixture.run(); await fixture.entered.promise
    const receipt = fixture.guide()
    fixture.setEventHook(event => { if (event.type === 'message-boundary') fixture.runtime.abort(fixture.sessionId) })
    gate.resolve(); await task
    expect(fixture.runtime.getSession(fixture.sessionId).messages.filter(message => message.id === receipt.id)).toHaveLength(1)
    expect(fixture.events.filter(event => event.type === 'message-boundary')).toHaveLength(1)
    expect(fixture.runtime.getSession(fixture.sessionId).messages.at(-1)?.run?.status).toBe('stopped')
    expect(fixture.runtime.getMessageQueue(fixture.sessionId).items).toEqual([])
  })

  it.each(['completed', 'stopped'] as const)('reconciles guidance on a queue-owned parent run (%s)', async outcome => {
    const gate = deferred()
    const fixture = setup([{ text: 'Before', wait: gate }, { text: 'After' }])
    fixture.runtime.submitMessage(fixture.sender, fixture.sessionId, 'queued-parent', 'Queued original', [], fixture.selection, false)
    await fixture.entered.promise
    const receipt = fixture.guide()
    if (outcome === 'stopped') fixture.runtime.abort(fixture.sessionId)
    gate.resolve()
    await vi.waitFor(() => expect((fixture.runtime as any).runCoordinator.isRunning(fixture.sessionId)).toBe(false))
    if (outcome === 'completed') {
      expect(fixture.runtime.getSession(fixture.sessionId).messages.map(message => message.content)).toEqual(['Queued original', 'Before', 'Change the result', 'After'])
      expect(fixture.runtime.getMessageQueue(fixture.sessionId).items).toEqual([])
      expect(fixture.events.filter(event => event.type === 'run-start')).toHaveLength(1)
    } else {
      expect(fixture.runtime.getMessageQueue(fixture.sessionId)).toMatchObject({ paused: 'stopped', items: [{ id: receipt.id, fallbackReason: 'run-ended' }] })
      expect(fixture.runtime.getMessageQueue(fixture.sessionId).items[0]!.delivery).toBeUndefined()
      expect(fixture.runtime.getSession(fixture.sessionId).messages.some(message => message.delivery === 'guide')).toBe(false)
    }
  })

  it('retains guidance when Stop races with the engine staging boundary, without committing a public user message', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'Before', wait: gate }])
    const task = fixture.run(); await fixture.entered.promise
    const receipt = fixture.guide()
    fixture.setEventHook(event => { if (event.type === 'queue-updated' && (event.payload.queue as any)?.promotingItemId === receipt.id) fixture.runtime.abort(fixture.sessionId) })
    gate.resolve(); await task
    expect(fixture.runtime.getMessageQueue(fixture.sessionId)).toMatchObject({ paused: 'stopped', items: [{ id: receipt.id, fallbackReason: 'run-ended' }] })
    expect(fixture.runtime.getMessageQueue(fixture.sessionId).promotingItemId).toBeUndefined()
    expect(fixture.runtime.getSession(fixture.sessionId).messages.some(message => message.delivery === 'guide')).toBe(false)
    expect(fixture.events.some(event => event.type === 'message-boundary')).toBe(false)
    expect(fixture.contexts).toHaveLength(1)
  })

  it('retains a guide if atomic public-message persistence fails before consumption', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'Before', wait: gate }])
    const task = fixture.run(); await fixture.entered.promise
    const receipt = fixture.guide()
    vi.spyOn(fixture.database.harness, 'appendGuidanceMessage').mockImplementationOnce(() => { throw new Error('Fixture guidance persistence failed') })
    gate.resolve(); await expect(task).rejects.toThrow('Fixture guidance persistence failed')
    expect(fixture.runtime.getMessageQueue(fixture.sessionId)).toMatchObject({ paused: 'failed', items: [{ id: receipt.id, fallbackReason: 'run-ended' }] })
    expect(fixture.runtime.getSession(fixture.sessionId).messages.some(message => message.delivery === 'guide')).toBe(false)
    expect(fixture.events.some(event => event.type === 'message-boundary')).toBe(false)
  })

  it('does not resurrect or duplicate an already-consumed guide when its subsequent assistant fails', async () => {
    const gate = deferred()
    const fixture = setup([{ text: 'Before', wait: gate }, { text: 'Partial after', fail: true }])
    const task = fixture.run(); await fixture.entered.promise
    const receipt = fixture.guide()
    gate.resolve(); await expect(task).rejects.toMatchObject({ message: MIRA_MODEL_ERROR_MESSAGE, modelError: { code: 'MODEL_REQUEST_FAILED', detail: expect.stringContaining('Fixture model failure') } })
    expect(fixture.runtime.getSession(fixture.sessionId).messages.map(message => message.content)).toEqual(['Original task', 'Before', 'Change the result', 'Partial after'])
    expect(fixture.runtime.getSession(fixture.sessionId).messages.filter(message => message.id === receipt.id)).toHaveLength(1)
    expect(fixture.runtime.getSession(fixture.sessionId).messages.at(-1)?.run?.status).toBe('failed')
    expect(fixture.runtime.getMessageQueue(fixture.sessionId).items).toEqual([])
  })

  it.each(['stopped', 'failed'] as const)('preserves an unconsumed %s guide as a paused ordinary input until explicit resume', async outcome => {
    const gate = deferred()
    const fixture = setup([{ text: 'Partial', wait: gate, fail: outcome === 'failed' }, { text: 'Retried' }])
    const task = fixture.run(); await fixture.entered.promise
    const receipt = fixture.guide()
    if (outcome === 'stopped') fixture.runtime.abort(fixture.sessionId)
    gate.resolve()
    if (outcome === 'failed') await expect(task).rejects.toMatchObject({ message: MIRA_MODEL_ERROR_MESSAGE, modelError: { code: 'MODEL_REQUEST_FAILED', detail: expect.stringContaining('Fixture model failure') } }); else await task
    expect(fixture.runtime.getMessageQueue(fixture.sessionId)).toMatchObject({ paused: outcome, items: [{ id: receipt.id, requestedDelivery: 'guide', fallbackReason: 'run-ended' }] })
    expect(fixture.runtime.getMessageQueue(fixture.sessionId).items[0]!.delivery).toBeUndefined()
    expect(fixture.runtime.getSession(fixture.sessionId).messages.some(message => message.delivery === 'guide')).toBe(false)
    expect(fixture.contexts).toHaveLength(1)
    fixture.runtime.resumeMessageQueue(fixture.sessionId)
    await vi.waitFor(() => expect(fixture.runtime.getSession(fixture.sessionId).messages.at(-1)?.content).toBe('Retried'))
    await vi.waitFor(() => expect((fixture.runtime as any).runCoordinator.isRunning(fixture.sessionId)).toBe(false))
    expect(fixture.runtime.getSession(fixture.sessionId).messages.filter(message => message.content === 'Change the result')).toHaveLength(1)
    expect(fixture.contexts).toHaveLength(2)
  })
})
