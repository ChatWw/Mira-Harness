import { afterEach, describe, expect, it, vi } from 'vitest'
import { Agent } from '@earendil-works/pi-agent-core'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import { generateSummaryWithUsage } from '@earendil-works/pi-agent-core'

vi.mock('@earendil-works/pi-agent-core', async importOriginal => ({
  ...await importOriginal<typeof import('@earendil-works/pi-agent-core')>(),
  generateSummaryWithUsage: vi.fn(),
}))

afterEach(() => vi.restoreAllMocks())

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function setup() {
  let session: any = { version: 1, id: 's', title: 'Admission', titleSource: 'manual', permissionMode: 'default', status: 'active', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1 }
  const provider = { id: 'p', providerKey: 'openai-compatible', name: 'Test', endpoint: 'http://127.0.0.1:1', enabled: true, authMode: 'none', models: [{ id: 'model', enabled: true, reasoning: false }] }
  const database: any = {
    memories: { enabled: () => false }, skills: { resolve: () => [] }, instructions: { resolve: () => [] },
    models: { get: () => provider, getSecret: () => '' }, getSnapshot: () => ({ preferences: {} }),
    harness: {
      getSession: () => structuredClone(session),
      updateSession: (value: any) => { session = structuredClone(value); return structuredClone(session) },
      resolveMessageAttachments: () => [],
      addMessage: vi.fn((_id, role, content) => { session.messages.push({ id: `m-${session.messages.length}`, role, content, createdAt: Date.now() }); return structuredClone(session) }),
      setActiveRun: vi.fn((_id, run) => { session.activeRun = run; return structuredClone(session) }),
      setStatus: vi.fn((_id, status) => { session.status = status }),
      setPermission: vi.fn((_id, mode) => { session.permissionMode = mode; return structuredClone(session) }),
      setActivePlan: vi.fn((_id, plan) => { session.activePlan = plan; return structuredClone(session) }),
      updatePlan: vi.fn((_id, patch) => { Object.assign(session.activePlan, patch); return structuredClone(session) }),
      setPendingInteraction: vi.fn((_id, interaction) => { session.pendingInteraction = interaction }),
      resolvePendingInteraction: vi.fn((_id, _interactionId, status) => { session.pendingInteraction.status = status }),
      confirmPlan: vi.fn(() => { session.activePlan.status = 'executing'; return structuredClone(session) }),
      appendAssistantDelta: vi.fn(), finalizeAssistantMessage: vi.fn(() => structuredClone(session)),
    },
  }
  const runtime = new HarnessRuntime(database, {} as any)
  const memory = deferred()
  ;(runtime as any).memoryCoordinator.writes.set('s', memory.promise)
  vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, value) => value)
  vi.spyOn(runtime as any, 'tools').mockReturnValue({ tools: [], descriptors: new Map(), cancelPending: vi.fn() })
  vi.spyOn(runtime as any, 'environmentContext').mockReturnValue({})
  vi.spyOn(runtime as any, 'publishContextUsage').mockImplementation((_sender, value) => value)
  let notify!: (event: any) => void
  vi.spyOn(Agent.prototype, 'subscribe').mockImplementation(listener => { notify = event => { void listener(event, new AbortController().signal) }; return () => {} })
  const prompt = vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async () => { notify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Done' } }) })
  const sender: any = { isDestroyed: () => false, send: vi.fn() }
  const send = (text: string) => runtime.runMessage(sender, 's', text, [], { providerId: 'p', modelId: 'model' })
  return { runtime, memory, database, prompt, sender, send }
}

describe('Harness runtime admission', () => {
  it('admits one frozen immediate draft atomically after teardown and replays accepted input without rereading files', async () => {
    const { runtime, memory, database, prompt, sender, send } = setup()
    const first = send('A'), runId = database.harness.getSession().activeRun.id
    const selection = { providerId: 'p', modelId: 'model', thinkingLevel: 'high' as const }, references = [{ path: 'note.md', name: 'note.md' }]
    const attachment = { ...references[0]!, content: 'Frozen content' }
    const resolveFiles = vi.spyOn(database.harness, 'resolveMessageAttachments').mockReturnValue([attachment])
    const options = { delivery: 'immediate' as const, expectedRunId: runId }
    const child = deferred()
    ;(runtime as any).runCoordinator.attachSubtasks('s', { active: () => [{}], stop: vi.fn(), close: () => child.promise })
    const accepted = runtime.submitMessage(sender, 's', 'immediate-new', 'New', references, selection, true, options)
    expect(runtime.submitMessage(sender, 's', 'immediate-new', 'New', references, selection, true, options)).toBe(accepted)
    expect(resolveFiles).toHaveBeenCalledOnce()
    references[0]!.path = 'changed'; attachment.content = 'Changed'; selection.modelId = 'Changed'
    resolveFiles.mockImplementation(() => { throw new Error('Files removed') })
    await vi.waitFor(() => expect(database.harness.finalizeAssistantMessage).toHaveBeenCalled())
    expect(runtime.getMessageQueue('s').items).toEqual([])
    expect((runtime as any).messageQueue.hasPending('s')).toBe(true)
    expect((runtime as any).messageQueue.pendingSessionIds()).toEqual(['s'])
    expect(() => runtime.assertSessionMutable('s')).toThrow()
    expect(prompt).not.toHaveBeenCalled()
    child.resolve(); await first; memory.resolve()
    const receipt = await accepted
    expect('id' in receipt).toBe(true)
    expect(database.harness.addMessage).toHaveBeenCalledWith('s', 'user', 'New', [{ path: 'note.md', name: 'note.md', content: 'Frozen content' }])
    expect(await runtime.submitMessage(sender, 's', 'immediate-new', 'New', [{ path: 'note.md', name: 'note.md' }], { providerId: 'p', modelId: 'model', thinkingLevel: 'high' }, true, options)).toMatchObject({ id: 'id' in receipt ? receipt.id : 'unexpected' })
    expect(resolveFiles).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isRunning('s')).toBe(false))
  })

  it.each(['retain', 'discard'] as const)('starts a confirmed new draft while %s handles only the paused backlog', async decision => {
    const { runtime, memory, database, prompt, sender, send } = setup()
    const first = send('A')
    const queued = runtime.submitMessage(sender, 's', 'old', 'Old', [], { providerId: 'p', modelId: 'model' }, false)
    runtime.abort('s', database.harness.getSession().activeRun.id); await first
    const before = runtime.getMessageQueue('s')
    expect(runtime.submitMessage(sender, 's', 'new', 'New', [], { providerId: 'p', modelId: 'model' }, false, {})).toEqual({ confirmationRequired: true, queue: before })
    expect(database.harness.addMessage).toHaveBeenCalledTimes(1)
    const options = { pausedQueueDecision: decision, expectedRunId: null, expectedQueueRevision: before.revision, expectedQueueItemIds: [queued.id] }
    const accepted = runtime.submitMessage(sender, 's', 'new', 'New', [], { providerId: 'p', modelId: 'model' }, false, options)
    expect(runtime.getMessageQueue('s').items.map(item => item.id)).toEqual([queued.id])
    memory.resolve(); const receipt = await accepted
    expect(receipt.queue.items.map(item => item.id)).toEqual(decision === 'retain' ? [queued.id] : [])
    expect(receipt.queue.paused).toBe(decision === 'retain' ? 'stopped' : undefined)
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isRunning('s')).toBe(false))
    expect(prompt).toHaveBeenCalledExactlyOnceWith('New')
    expect(database.harness.getSession().messages.map((message: any) => message.content)).toEqual(['A', 'New'])
  })

  it('does not let an atomic immediate draft bypass a live permission approval', async () => {
    const { runtime, database, prompt, sender } = setup()
    ;(runtime as any).permissionPolicy.pending.set('approval', { request: { requestId: 'approval', sessionId: 's', title: 'Permission', detail: '' } })
    expect(() => runtime.submitMessage(sender, 's', 'blocked', 'Blocked', [], { providerId: 'p', modelId: 'model' }, false, { delivery: 'immediate', expectedRunId: null })).toThrow('处理当前任务的确认')
    expect(runtime.getMessageQueue('s').items).toEqual([])
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()
  })

  it('promotes an original frozen queued item after old teardown, then drains the remaining FIFO without overlap', async () => {
    const { runtime, memory, database, prompt, sender, send } = setup()
    const first = send('A')
    const oldRun = database.harness.getSession().activeRun.id
    const selection = { providerId: 'p', modelId: 'model', thinkingLevel: 'high' as const }
    const originalAttachment = { path: 'note.md', name: 'note.md', content: 'Frozen note' }
    const attachments = vi.spyOn(database.harness, 'resolveMessageAttachments').mockReturnValue([originalAttachment])
    const b = runtime.submitMessage(sender, 's', 'queued-b', 'B', [], selection, false)
    const references = [{ path: 'note.md', name: 'note.md' }]
    const c = runtime.submitMessage(sender, 's', 'queued-c', 'C', references, selection, false)
    references[0]!.path = 'changed.md'
    originalAttachment.content = 'Changed on disk'
    selection.modelId = 'changed'
    attachments.mockImplementation(() => { throw new Error('Files no longer readable') })
    const child = deferred()
    ;(runtime as any).runCoordinator.attachSubtasks('s', { active: () => [{}], stop: vi.fn(), close: () => child.promise })
    const output = deferred()
    const completePrompt = prompt.getMockImplementation()!
    prompt.mockImplementationOnce(async (...args) => { await output.promise; return completePrompt(...args) })
    const promoted = runtime.sendQueuedMessageNow('s', c.id, oldRun)
    await vi.waitFor(() => expect(database.harness.finalizeAssistantMessage).toHaveBeenCalled())
    expect(prompt).not.toHaveBeenCalled()
    expect(runtime.getMessageQueue('s').items.map(item => item.id)).toEqual([b.id, c.id])
    child.resolve()
    await first
    memory.resolve()
    const snapshot = await promoted
    expect(snapshot.items.map(item => item.id)).toEqual([b.id])
    expect(snapshot.paused).toBeUndefined()
    expect(database.harness.addMessage).toHaveBeenCalledWith('s', 'user', 'C', [{ path: 'note.md', name: 'note.md', content: 'Frozen note' }])
    expect(database.harness.getSession().modelId).toBe('model')
    expect(prompt).toHaveBeenCalledExactlyOnceWith('C')
    expect(runtime.abort('s', oldRun)).toBe(false)
    expect(database.harness.getSession().activeRun.id).not.toBe(oldRun)
    output.resolve()
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isRunning('s')).toBe(false))
    expect(database.harness.getSession().messages.map((message: any) => message.content)).toEqual(['A', 'C', 'B'])
    expect(runtime.getMessageQueue('s').items).toEqual([])
  })

  it('lets user Stop cancel promotion while old child teardown is still pending', async () => {
    const { runtime, memory, database, prompt, sender, send } = setup()
    const first = send('A')
    const oldRun = database.harness.getSession().activeRun.id
    const b = runtime.submitMessage(sender, 's', 'cancel-b', 'B', [], { providerId: 'p', modelId: 'model' }, false)
    const c = runtime.submitMessage(sender, 's', 'cancel-c', 'C', [], { providerId: 'p', modelId: 'model' }, false)
    const child = deferred()
    ;(runtime as any).runCoordinator.attachSubtasks('s', { active: () => [{}], stop: vi.fn(), close: () => child.promise })
    const promoted = runtime.sendQueuedMessageNow('s', c.id, oldRun)
    const rejected = expect(promoted).rejects.toThrow('立即发送已取消')
    expect(runtime.abort('s', 'stale-run')).toBe(false)
    expect(runtime.abort('s', oldRun)).toBe(true)
    child.resolve()
    await first
    await rejected
    expect(runtime.getMessageQueue('s')).toMatchObject({ paused: 'stopped', items: [{ id: b.id }, { id: c.id }] })
    expect(database.harness.getSession().messages.map((message: any) => message.content)).toEqual(['A'])
    expect((runtime as any).runCoordinator.isRunning('s')).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
    memory.resolve()
  })

  it.each(['stop', 'scope-change'] as const)('preserves original promotion position on %s before admission', async failure => {
    const { runtime, memory, database, prompt, sender, send } = setup()
    const first = send('A')
    const b = runtime.submitMessage(sender, 's', 'prepare-b', 'B', [], { providerId: 'p', modelId: 'model' }, false)
    const c = runtime.submitMessage(sender, 's', 'prepare-c', 'C', [], { providerId: 'p', modelId: 'model' }, false)
    runtime.abort('s', database.harness.getSession().activeRun.id)
    await first
    const finalized = database.harness.finalizeAssistantMessage.mock.calls.length
    const promoted = runtime.sendQueuedMessageNow('s', c.id)
    const rejected = expect(promoted).rejects.toThrow(failure === 'stop' ? '立即发送已取消' : '工作目录已变化')
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isExecuting('s')).toBe(true))
    if (failure === 'stop') runtime.abort('s', database.harness.getSession().activeRun.id)
    else database.harness.updateSession({ ...database.harness.getSession(), workingDirectory: '/other-project' })
    memory.resolve()
    await rejected
    expect(runtime.getMessageQueue('s').items.map(item => item.id)).toEqual([b.id, c.id])
    expect(database.harness.getSession().messages.map((message: any) => message.content)).toEqual(['A'])
    expect(database.harness.finalizeAssistantMessage.mock.calls).toHaveLength(finalized)
    expect((runtime as any).runCoordinator.isRunning('s')).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
  })

  it('guards active lifecycle changes and requires paused backlog to be explicitly handled', async () => {
    const { runtime, memory, database, sender, send } = setup()
    const first = send('A')
    const b = runtime.submitMessage(sender, 's', 'lifecycle-b', 'B', [], { providerId: 'p', modelId: 'model' }, false)
    expect(() => runtime.assertSessionMutable('s')).toThrow('该会话正在运行')
    runtime.abort('s', database.harness.getSession().activeRun.id)
    await first
    expect(() => runtime.assertSessionMutable('s')).toThrow('请先处理待发送消息')
    runtime.withdrawMessage('s', b.id)
    expect(() => runtime.assertSessionMutable('s')).not.toThrow()
    memory.resolve()
  })

  it('reserves the run before waiting for memory and rejects a second input before it enters history', async () => {
    const { runtime, memory, database, send } = setup()
    const first = send('First')
    await expect(send('Second')).rejects.toThrow('该会话正在运行')
    expect(database.harness.addMessage).toHaveBeenCalledTimes(1)
    expect(database.harness.getSession().activeRun?.id).toBeTruthy()
    expect(runtime.isProjectRunning('unused')).toBe(false)
    memory.resolve()
    await first
    expect(database.harness.getSession().messages[0].content).toBe('First')
  })

  it('stops preparing immediately without waiting for the memory write or constructing an Agent', async () => {
    const { runtime, memory, database, prompt, send } = setup()
    const first = send('First')
    const runId = database.harness.getSession().activeRun?.id
    expect(runId).toBeTruthy()
    runtime.abort('s', runId)
    await expect(first).resolves.toMatchObject({ interrupted: true })
    expect(prompt).not.toHaveBeenCalled()
    expect(database.harness.getSession().activeRun).toBeUndefined()
    expect(database.harness.finalizeAssistantMessage).toHaveBeenCalledWith('s', expect.objectContaining({ interrupted: true, run: expect.objectContaining({ status: 'stopped' }) }))
    memory.resolve()
  })

  it('releases the reserved run if waiting for memory fails', async () => {
    const { memory, database, send } = setup()
    const first = send('First')
    memory.reject(new Error('Memory failed'))
    await expect(first).rejects.toThrow('Memory failed')
    expect(database.harness.getSession().activeRun).toBeUndefined()
    expect(database.harness.getSession().status).toBe('failed')
    expect(database.harness.finalizeAssistantMessage).toHaveBeenCalledWith('s', expect.objectContaining({ run: expect.objectContaining({ status: 'failed' }) }))
  })

  it.each(['updateSession', 'setActiveRun'] as const)('releases admission if initial %s persistence fails', async method => {
    const { runtime, memory, database, send } = setup()
    vi.spyOn(database.harness, method).mockImplementationOnce(() => { throw new Error('Storage failed') })
    await expect(send('First')).rejects.toThrow('Storage failed')
    expect((runtime as any).runCoordinator.isRunning('s')).toBe(false)
    memory.resolve()
    await expect(send('Retry')).resolves.toMatchObject({ content: 'Done' })
  })

  it('releases admission if automatic title reservation fails', async () => {
    const { runtime, memory, database, send } = setup()
    database.harness.updateSession({ ...database.harness.getSession(), titleSource: 'auto' })
    database.harness.reserveAutoTitle = vi.fn(() => { throw new Error('Title storage failed') })
    await expect(send('Please analyze this desktop application and explain the smallest safe implementation plan.')).rejects.toThrow('Title storage failed')
    expect(database.harness.reserveAutoTitle).toHaveBeenCalledOnce()
    expect((runtime as any).runCoordinator.isRunning('s')).toBe(false)
    memory.resolve()
    await expect(send('Retry')).resolves.toMatchObject({ content: 'Done' })
  })

  it('releases admission even if failure cleanup cannot persist the active run', async () => {
    const { runtime, memory, database, send } = setup()
    const persist = database.harness.setActiveRun.getMockImplementation()
    database.harness.setActiveRun.mockImplementation(() => { throw new Error('Storage unavailable') })
    await expect(send('First')).rejects.toThrow('Storage unavailable')
    expect((runtime as any).runCoordinator.isRunning('s')).toBe(false)
    database.harness.setActiveRun.mockImplementation(persist)
    memory.resolve()
    await expect(send('Retry')).resolves.toMatchObject({ content: 'Done' })
  })

  it('keeps the latest session changes when the memory wait finishes and ignores an old stop', async () => {
    const { runtime, memory, database, prompt, send } = setup()
    const first = send('First')
    const active = database.harness.getSession().activeRun
    database.harness.updateSession({ ...database.harness.getSession(), activeSkillIds: ['current-skill'], context: { summary: 'Updated while preparing' } })
    expect(runtime.abort('s', 'old-run')).toBe(false)
    expect(database.harness.getSession().activeRun.id).toBe(active.id)
    memory.resolve()
    await first
    expect(prompt).toHaveBeenCalledOnce()
    expect(database.harness.getSession().activeSkillIds).toEqual(['current-skill'])
    expect(database.harness.getSession().context?.summary).toBe('Updated while preparing')
  })

  it('persists a newly admitted plan before constructing the planning Agent tools', async () => {
    const { runtime, memory, database, prompt, sender } = setup()
    const tools = vi.spyOn(runtime as any, 'tools').mockImplementation(() => {
      expect(database.harness.getSession().activePlan).toMatchObject({ status: 'planning', request: 'Plan this' })
      return { tools: [], descriptors: new Map() }
    })
    prompt.mockImplementation(async () => { database.harness.setPendingInteraction('s', { id: 'review', kind: 'plan-review', status: 'waiting' }) })
    const run = runtime.runMessage(sender, 's', 'Plan this', [], { providerId: 'p', modelId: 'model' }, true)
    expect(database.harness.setActivePlan).toHaveBeenCalledOnce()
    memory.resolve()
    await run
    expect(tools).toHaveBeenCalledOnce()
    expect(prompt).toHaveBeenCalledExactlyOnceWith('Plan this')
  })

  it.each(['moved', 'archived', 'deleted'] as const)('does not overwrite a %s session when actual context compaction finishes', async change => {
    const { runtime, database, sender } = setup()
    vi.spyOn(runtime as any, 'compactContext').mockRestore()
    vi.spyOn(runtime as any, 'publishContextUsage').mockRestore()
    database.harness.updateSession({ ...database.harness.getSession(), projectId: 'original', workingDirectory: '/original-project', messages: Array.from({ length: 8 }, (_, index) => ({ id: `old-${index}`, role: 'user', content: 'x'.repeat(25000), createdAt: index })) })
    const summary = deferred()
    vi.mocked(generateSummaryWithUsage).mockImplementation(async () => {
      await summary.promise
      return { ok: true, value: { text: 'Compacted summary' } } as any
    })
    const compaction = (runtime as any).compactContext(sender, database.harness.getSession(), { id: 'model', provider: 'test', api: 'openai-completions', contextWindow: 25000 }, {}, new AbortController(), 'off', [], vi.fn(), { text: 'Pending request', attachments: [] })
    const outcome = compaction.then((value: any) => ({ value }), (error: Error) => ({ error }))
    expect(generateSummaryWithUsage).toHaveBeenCalled()
    const update = vi.spyOn(database.harness, 'updateSession')
    let unavailable: ReturnType<typeof vi.spyOn> | undefined
    if (change === 'deleted') unavailable = vi.spyOn(database.harness, 'getSession').mockImplementation(() => { throw new Error('未找到会话') })
    else database.harness.updateSession({ ...database.harness.getSession(), title: 'Latest title', ...(change === 'moved' ? { projectId: 'moved', workingDirectory: '/moved-project' } : { archivedAt: 100 }) })
    update.mockClear()
    summary.resolve()
    const result = await outcome
    if (change === 'deleted') {
      expect(result.error?.message).toBe('未找到会话')
      expect(update).not.toHaveBeenCalled()
      unavailable?.mockRestore()
    } else {
      expect(result.error).toBeUndefined()
      expect(database.harness.getSession()).toMatchObject({ title: 'Latest title', context: { summary: 'Compacted summary' }, ...(change === 'moved' ? { projectId: 'moved', workingDirectory: '/moved-project' } : { archivedAt: 100 }) })
    }
  })

  it('acknowledges B and C during A without adding them to the current transcript, then dispatches FIFO', async () => {
    const { runtime, memory, database, prompt, sender, send } = setup()
    const first = send('A')
    const selection = { providerId: 'p', modelId: 'model' }
    const b = runtime.submitMessage(sender, 's', 'submission-b', 'B', [], selection, false)
    const c = runtime.submitMessage(sender, 's', 'submission-c', 'C', [], selection, false)
    expect(b.id).toBeTruthy()
    expect(c.id).not.toBe(b.id)
    expect(runtime.getMessageQueue('s').items.map(item => item.text)).toEqual(['B', 'C'])
    expect(database.harness.getSession().messages.map((message: any) => message.content)).toEqual(['A'])
    expect(prompt).not.toHaveBeenCalled()
    memory.resolve()
    await first
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(3))
    expect(database.harness.getSession().messages.map((message: any) => message.content)).toEqual(['A', 'B', 'C'])
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isRunning('s')).toBe(false))
    expect(runtime.getMessageQueue('s').items).toEqual([])
  })

  it('stops A and keeps B paused until explicit resume, ignoring a stale stop after B begins', async () => {
    const { runtime, memory, database, prompt, sender, send } = setup()
    const first = send('A')
    const firstRun = database.harness.getSession().activeRun.id
    runtime.submitMessage(sender, 's', 'submission-b', 'B', [], { providerId: 'p', modelId: 'model' }, false)
    expect(runtime.abort('s', firstRun)).toBe(true)
    await first
    expect(runtime.getMessageQueue('s')).toMatchObject({ paused: 'stopped', items: [{ text: 'B' }] })
    expect(prompt).not.toHaveBeenCalled()
    memory.resolve()
    runtime.resumeMessageQueue('s')
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    expect(runtime.abort('s', firstRun)).toBe(false)
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isRunning('s')).toBe(false))
    expect(database.harness.getSession().messages.map((message: any) => message.content)).toEqual(['A', 'B'])
  })

  it('retries an acknowledged submission without rereading an attachment or consulting a changed provider', () => {
    const { runtime, database, sender } = setup()
    const read = vi.spyOn(database.harness, 'resolveMessageAttachments').mockReturnValue([{ path: 'note.md', name: 'note.md', content: 'original' }])
    const refs = [{ path: 'note.md', name: 'note.md' }]
    const selection = { providerId: 'p', modelId: 'model' }
    const first = runtime.submitMessage(sender, 's', 'stable-submission', 'Read this', refs, selection, false)
    read.mockImplementation(() => { throw new Error('File removed after acceptance') })
    vi.spyOn(database.models, 'get').mockImplementation(() => { throw new Error('Provider changed after acceptance') })
    const replay = runtime.submitMessage(sender, 's', 'stable-submission', 'Read this', refs, selection, false)
    expect(replay.id).toBe(first.id)
    expect(read).toHaveBeenCalledOnce()
    runtime.withdrawMessage('s', first.id)
  })

  it('retains a queued input if its project scope changes before dispatch and does not append it', async () => {
    const { runtime, memory, database, sender, send } = setup()
    const first = send('A')
    const receipt = runtime.submitMessage(sender, 's', 'submission-b', 'B', [], { providerId: 'p', modelId: 'model' }, false)
    database.harness.updateSession({ ...database.harness.getSession(), workingDirectory: '/different-project' })
    memory.resolve()
    await first
    await vi.waitFor(() => expect(runtime.getMessageQueue('s')).toMatchObject({ paused: 'failed', items: [{ id: receipt.id }] }))
    expect(database.harness.getSession().messages.map((message: any) => message.content)).toEqual(['A'])
    expect(runtime.withdrawMessage('s', receipt.id).item.text).toBe('B')
  })

  it.each(['memory', 'compaction'] as const)('keeps moved queued input recoverable during %s preparation', async phase => {
    const { runtime, memory, database, prompt, sender } = setup()
    database.harness.updateSession({ ...database.harness.getSession(), projectId: 'original', workingDirectory: '/original-project' })
    const compact = deferred()
    const compaction = vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, value) => {
      if (phase === 'compaction') await compact.promise
      return value
    })
    const receipt = runtime.submitMessage(sender, 's', 'frozen-input', 'Frozen', [], { providerId: 'p', modelId: 'model' }, false)
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isExecuting('s')).toBe(true))
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    if (phase === 'compaction') {
      memory.resolve()
      await vi.waitFor(() => expect(compaction).toHaveBeenCalledOnce())
      expect(compaction.mock.calls[0][8]).toMatchObject({ text: 'Frozen', attachments: [] })
    }
    database.harness.updateSession({ ...database.harness.getSession(), projectId: 'moved', workingDirectory: '/different-project' })
    memory.resolve()
    compact.resolve()
    await vi.waitFor(() => expect(runtime.getMessageQueue('s')).toMatchObject({ paused: 'failed', error: '工作目录已变化，请撤回消息后重新发送', items: [{ id: receipt.id }] }))
    expect(prompt).not.toHaveBeenCalled()
    expect((runtime as any).tools).not.toHaveBeenCalled()
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    expect(database.harness.finalizeAssistantMessage).not.toHaveBeenCalled()
    expect((runtime as any).runCoordinator.isRunning('s')).toBe(false)
    runtime.resumeMessageQueue('s')
    await vi.waitFor(() => expect(runtime.getMessageQueue('s')).toMatchObject({ paused: 'failed', items: [{ id: receipt.id }] }))
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    database.harness.updateSession({ ...database.harness.getSession(), projectId: 'original', workingDirectory: '/original-project' })
    runtime.resumeMessageQueue('s')
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isRunning('s')).toBe(false))
    expect(database.harness.addMessage).toHaveBeenCalledExactlyOnceWith('s', 'user', 'Frozen', [])
  })

  it.each(['memory', 'compaction'] as const)('does not recreate an archived or deleted session during %s preparation', async phase => {
    const { runtime, memory, database, prompt, sender } = setup()
    const compact = deferred()
    const compaction = vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, value) => {
      if (phase === 'compaction') await compact.promise
      return value
    })
    const receipt = runtime.submitMessage(sender, 's', 'archived-input', 'Pending', [], { providerId: 'p', modelId: 'model' }, false)
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isExecuting('s')).toBe(true))
    if (phase === 'compaction') {
      memory.resolve()
      await vi.waitFor(() => expect(compaction).toHaveBeenCalledOnce())
    }
    database.harness.updateSession({ ...database.harness.getSession(), archivedAt: Date.now() })
    memory.resolve()
    compact.resolve()
    await vi.waitFor(() => expect(runtime.getMessageQueue('s')).toMatchObject({ paused: 'failed', items: [{ id: receipt.id }] }))
    expect(database.harness.getSession().archivedAt).toBeTruthy()
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()
    expect((runtime as any).runCoordinator.isRunning('s')).toBe(false)
    expect(runtime.withdrawMessage('s', receipt.id).item.text).toBe('Pending')

    database.harness.updateSession({ ...database.harness.getSession(), archivedAt: undefined })
    const deletionCompact = deferred()
    compaction.mockClear().mockImplementation(async (_sender, value) => {
      if (phase === 'compaction') await deletionCompact.promise
      return value
    })
    const deleted = runtime.submitMessage(sender, 's', 'deleted-input', 'Deleted', [], { providerId: 'p', modelId: 'model' }, false)
    const pending = deferred()
    ;(runtime as any).memoryCoordinator.writes.set('s', pending.promise)
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isExecuting('s')).toBe(true))
    if (phase === 'compaction') {
      pending.resolve()
      await vi.waitFor(() => expect(compaction).toHaveBeenCalledOnce())
    }
    const get = vi.spyOn(database.harness, 'getSession').mockImplementation(() => { throw new Error('未找到会话') })
    const persist = database.harness.setActiveRun.getMockImplementation()
    database.harness.setActiveRun.mockImplementation(() => { throw new Error('未找到会话') })
    expect(() => runtime.isProjectRunning('project')).not.toThrow()
    pending.resolve()
    deletionCompact.resolve()
    await vi.waitFor(() => expect((runtime as any).messageQueue.get('s')).toMatchObject({ paused: 'failed', items: [{ id: deleted.id }] }))
    expect((runtime as any).runCoordinator.isRunning('s')).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    expect(database.harness.finalizeAssistantMessage).not.toHaveBeenCalled()
    get.mockRestore()
    database.harness.setActiveRun.mockImplementation(persist)
    expect(runtime.withdrawMessage('s', deleted.id).item.text).toBe('Deleted')
  })

  it('does not consume input, append history or publish completion if begin fails', async () => {
    const { runtime, memory, database, prompt, sender, send } = setup()
    const coordinator = (runtime as any).runCoordinator
    const completion = vi.fn()
    runtime.onRunComplete(completion)
    const begin = vi.spyOn(coordinator, 'begin').mockImplementationOnce(() => { throw new Error('Admission failed') })
    await expect(send('Legacy')).rejects.toThrow('Admission failed')
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    begin.mockImplementationOnce(() => { throw new Error('Admission failed') })
    const receipt = runtime.submitMessage(sender, 's', 'begin-failed', 'Queued', [], { providerId: 'p', modelId: 'model' }, false)
    await vi.waitFor(() => expect(runtime.getMessageQueue('s')).toMatchObject({ paused: 'failed', items: [{ id: receipt.id }] }))
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    expect(completion).not.toHaveBeenCalled()
    expect(coordinator.isRunning('s')).toBe(false)
    memory.resolve()
    runtime.resumeMessageQueue('s')
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(completion).toHaveBeenCalledOnce())
    expect(database.harness.addMessage).toHaveBeenCalledExactlyOnceWith('s', 'user', 'Queued', [])
  })

  it.each(['memory', 'compaction'] as const)('retains stopped queued input before history admission during %s', async phase => {
    const { runtime, memory, database, prompt, sender } = setup()
    const compact = deferred()
    const compaction = vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, value) => {
      if (phase === 'compaction') await compact.promise
      return value
    })
    const receipt = runtime.submitMessage(sender, 's', 'stop-preparing', 'Pending', [], { providerId: 'p', modelId: 'model' }, false)
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isExecuting('s')).toBe(true))
    if (phase === 'compaction') {
      memory.resolve()
      await vi.waitFor(() => expect(compaction).toHaveBeenCalledOnce())
    }
    runtime.abort('s', database.harness.getSession().activeRun.id)
    compact.resolve()
    await vi.waitFor(() => expect(runtime.getMessageQueue('s')).toMatchObject({ paused: 'stopped', items: [{ id: receipt.id }] }))
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    expect(database.harness.finalizeAssistantMessage).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()
    expect((runtime as any).runCoordinator.isRunning('s')).toBe(false)
    memory.resolve()
    runtime.resumeMessageQueue('s')
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isRunning('s')).toBe(false))
    expect(database.harness.addMessage).toHaveBeenCalledExactlyOnceWith('s', 'user', 'Pending', [])
  })

  it('keeps legacy sends and planning=true from bypassing stopped backlog', async () => {
    const { runtime, memory, database, prompt, sender, send } = setup()
    const first = send('A')
    const receipt = runtime.submitMessage(sender, 's', 'paused-b', 'B', [], { providerId: 'p', modelId: 'model' }, false)
    runtime.abort('s', database.harness.getSession().activeRun.id)
    await first
    for (const planning of [false, true]) await expect(runtime.runMessage(sender, 's', 'Bypass', [], { providerId: 'p', modelId: 'model' }, planning)).rejects.toThrow('请先处理待发送消息')
    await expect(send('/perm full')).rejects.toThrow('请先处理待发送消息')
    expect(database.harness.getSession().messages.map((message: any) => message.content)).toEqual(['A'])
    expect(database.harness.setPermission).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()
    expect(runtime.withdrawMessage('s', receipt.id).item.text).toBe('B')
    memory.resolve()
  })

  it('preserves /perm as an idempotent control command without a model or Agent', async () => {
    const { runtime, database, prompt, sender } = setup()
    vi.spyOn(database.models, 'get').mockImplementation(() => { throw new Error('No provider configured') })
    const attachments = vi.spyOn(database.harness, 'resolveMessageAttachments').mockImplementation(() => { throw new Error('No file readable') })
    const selection = { providerId: 'missing', modelId: 'missing' }
    expect(() => runtime.submitMessage(sender, 's', 'invalid-perm', '/perm invalid', [], selection, false)).toThrow('权限档位应为 default、auto-approve 或 full')
    const receipt = runtime.submitMessage(sender, 's', 'permission-command', '/perm full', [{ path: 'missing', name: 'missing' }], selection, false)
    await vi.waitFor(() => expect(database.harness.setPermission).toHaveBeenCalledExactlyOnceWith('s', 'full'))
    expect(runtime.submitMessage(sender, 's', 'permission-command', '/perm full', [{ path: 'missing', name: 'missing' }], selection, false).id).toBe(receipt.id)
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isRunning('s')).toBe(false))
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    expect(attachments).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()
    expect(sender.send).toHaveBeenCalledWith('harness:event', expect.objectContaining({ type: 'status', payload: { permissionMode: 'full' } }))
  })

  it.each(['continue', 'answer', 'confirm'] as const)('allows explicit plan %s while preserving paused backlog', async action => {
    const { runtime, memory, database, prompt, sender, send } = setup()
    const first = send('A')
    const receipt = runtime.submitMessage(sender, 's', 'plan-backlog', 'B', [], { providerId: 'p', modelId: 'model' }, false)
    runtime.abort('s', database.harness.getSession().activeRun.id)
    await first
    const question = action === 'answer'
    database.harness.setActivePlan('s', { id: 'plan', status: question ? 'awaiting_input' : 'awaiting_confirmation', request: 'A', understanding: 'A', steps: [{ label: 'Step' }], risks: [], createdAt: 1, updatedAt: 1 })
    database.harness.setPendingInteraction('s', question
      ? { id: 'interaction', kind: 'question', status: 'waiting', questions: [{ id: 'q', question: 'Question' }], createdAt: 1 }
      : { id: 'interaction', kind: 'plan-review', status: 'waiting', planId: 'plan', createdAt: 1 })
    if (action !== 'confirm') prompt.mockImplementation(async () => {
      database.harness.setPendingInteraction('s', { id: 'next-review', kind: 'plan-review', status: 'waiting', planId: 'plan', createdAt: 1 })
    })
    memory.resolve()
    const selection = { providerId: 'p', modelId: 'model' }
    if (action === 'continue') await runtime.continuePlan(sender, 's', 'plan', 'Revise', [], selection)
    else if (action === 'answer') await runtime.answerInteraction(sender, 's', 'interaction', [{ id: 'q', selected: ['Answer'] }], selection)
    else await runtime.confirmPlan(sender, 's', 'plan', selection)
    expect(prompt).toHaveBeenCalledOnce()
    expect(runtime.getMessageQueue('s')).toMatchObject({ paused: 'stopped', items: [{ id: receipt.id }] })
    expect((runtime as any).runCoordinator.isRunning('s')).toBe(false)
    expect(database.harness.getSession().messages.some((message: any) => message.content === 'B')).toBe(false)
  })

  it('keeps automation out of a project while manual backlog is paused and releases it after withdrawal', async () => {
    const { runtime, memory, database, sender, send } = setup()
    database.harness.updateSession({ ...database.harness.getSession(), projectId: 'project' })
    const first = send('A')
    const receipt = runtime.submitMessage(sender, 's', 'submission-b', 'B', [], { providerId: 'p', modelId: 'model' }, false)
    runtime.abort('s', database.harness.getSession().activeRun.id)
    await first
    expect(runtime.isProjectRunning('project')).toBe(true)
    await expect(runtime.runAutomation('s', 'Automation', { providerId: 'p', modelId: 'model' }, 'default')).rejects.toThrow('请先处理当前任务的确认或待发送消息')
    expect(database.harness.getSession().messages.map((message: any) => message.content)).toEqual(['A'])
    runtime.withdrawMessage('s', receipt.id)
    expect(runtime.isProjectRunning('project')).toBe(false)
    memory.resolve()
  })

  it('notifies completion after child teardown and lets the manual queue claim the next admission first', async () => {
    const { runtime, memory, database, sender, send } = setup()
    database.harness.updateSession({ ...database.harness.getSession(), projectId: 'project' })
    const observed: Array<{ text: string; busy: boolean }> = []
    runtime.onRunComplete(event => observed.push({ text: event.session.messages.at(-1)!.content, busy: runtime.isProjectRunning('project') }))
    const first = send('A')
    runtime.submitMessage(sender, 's', 'submission-b', 'B', [], { providerId: 'p', modelId: 'model' }, false)
    const child = deferred()
    ;(runtime as any).runCoordinator.attachSubtasks('s', { active: () => [{}], close: () => child.promise })
    memory.resolve()
    await vi.waitFor(() => expect(database.harness.setStatus).toHaveBeenCalledWith('s', 'completed'))
    expect(observed).toEqual([])
    child.resolve()
    await first
    await vi.waitFor(() => expect(observed).toHaveLength(2))
    expect(observed[0]).toMatchObject({ text: 'A', busy: true })
    expect(observed[1]).toMatchObject({ text: 'B', busy: false })
  })
})
