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
    hooks: { list: () => [], assert: () => {} },
    promptHistory: { append: vi.fn() },
    memories: { enabled: () => false }, skills: { resolve: () => [] }, instructions: { resolve: () => [] },
    plugins: { snapshots: () => [], catalog: () => [], reminder: () => '' },
    userAgents: { list: () => [] },
    promptCommands: { resolve: () => undefined },
    models: { get: () => provider, getSecret: () => '' }, getSnapshot: () => ({ preferences: {} }),
    harness: {
      sideConversationIds: vi.fn(() => []),
      getPermissionConfig: () => ({ globalDefaultMode: 'default' }),
      getSession: () => structuredClone(session),
      getProject: (id: string) => ({ id, directory: '/project' }),
      acceptPreparedSession: vi.fn((_id, persist) => { session.draftState = 'accepted'; persist?.() }),
      updateSession: (value: any) => { session = structuredClone(value); return structuredClone(session) },
      resolveMessageAttachments: () => [],
      addMessage: vi.fn((_id, role, content, _attachments, _internal, permissionMode) => { if (permissionMode !== undefined) session.permissionMode = permissionMode; session.messages.push({ id: `m-${session.messages.length}`, role, content, createdAt: Date.now() }); return structuredClone(session) }),
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
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any)
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
  it('records accepted input once, excludes rejected intent and ignores submission replay', () => {
    const view = setup(), selection = { providerId: 'p', modelId: 'model' }
    const receipt = view.runtime.submitMessage(view.sender, 's', 'recall-one', '  Accepted  ', [], selection, false)
    expect(receipt).toHaveProperty('submissionId', 'recall-one')
    expect(view.database.promptHistory.append).toHaveBeenCalledExactlyOnceWith(undefined, 'Accepted')
    view.runtime.submitMessage(view.sender, 's', 'recall-one', 'Accepted', [], selection, false)
    expect(view.database.promptHistory.append).toHaveBeenCalledOnce()
    expect(view.runtime.submitMessage(view.sender, 's', 'recall-rejected', 'Not accepted', [], selection, false, { delivery: 'guide', expectedRunId: 'foreign-run' })).toHaveProperty('retryRequired', true)
    expect(view.database.promptHistory.append).toHaveBeenCalledOnce()
  })

  it('waits for asynchronous admission and retains its original directory across late acknowledgement', async () => {
    const view = setup(), pending = deferred()
    const session = view.database.harness.getSession()
    vi.spyOn(view.database.harness, 'getSession').mockReturnValue({ ...session, workingDirectory: '/original' })
    vi.spyOn((view.runtime as any).messageQueue, 'submit').mockReturnValue(pending.promise.then(() => ({ id: 'accepted', submissionId: 'late', queue: { sessionId: 's', revision: 1, items: [] } })))
    const result = view.runtime.submitMessage(view.sender, 's', 'late', 'Late input', [], { providerId: 'p', modelId: 'model' }, false, { delivery: 'immediate', expectedRunId: null })
    expect(view.database.promptHistory.append).not.toHaveBeenCalled()
    vi.mocked(view.database.harness.getSession).mockReturnValue({ ...session, workingDirectory: '/other' })
    pending.resolve(); await result
    expect(view.database.promptHistory.append).toHaveBeenCalledExactlyOnceWith('/original', 'Late input')
  })

  it('does not record rejected async admission or turn a history write error into send failure', async () => {
    const view = setup(), warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const submit = vi.spyOn((view.runtime as any).messageQueue, 'submit')
    submit.mockReturnValueOnce(Promise.reject(new Error('Rejected')))
    await expect(view.runtime.submitMessage(view.sender, 's', 'rejected', 'Not accepted', [], { providerId: 'p', modelId: 'model' }, false, { expectedRunId: null })).rejects.toThrow('Rejected')
    expect(view.database.promptHistory.append).not.toHaveBeenCalled()
    view.database.promptHistory.append.mockImplementationOnce(() => { throw new Error('Disk unavailable') })
    submit.mockReturnValueOnce({ id: 'accepted', submissionId: 'saved', queue: { sessionId: 's', revision: 1, items: [] } })
    expect(view.runtime.submitMessage(view.sender, 's', 'saved', 'Accepted input', [], { providerId: 'p', modelId: 'model' }, false)).toHaveProperty('id', 'accepted')
    expect(warn).toHaveBeenCalledOnce()
  })
  function compactionFixture() {
    const view = setup()
    vi.mocked((view.runtime as any).compactContext).mockRestore()
    view.database.harness.addMessage('s', 'user', 'Earlier request')
    view.database.harness.addMessage('s', 'assistant', 'Earlier response')
    view.database.harness.addMessage('s', 'user', 'Recent request')
    view.database.harness.addMessage('s', 'assistant', 'Recent response')
    vi.mocked(generateSummaryWithUsage).mockResolvedValue({ ok: true, value: { text: 'Earlier context summary' } } as any)
    return view
  }

  it('queues a typed compaction between real messages with frozen selection, no command in history, and no parallel model request', async () => {
    const { runtime, database, sender, memory, prompt, send } = compactionFixture()
    vi.spyOn(runtime as any, 'publishContextUsage').mockRestore()
    const running = send('Current turn'), gate = deferred()
    vi.mocked(generateSummaryWithUsage).mockImplementationOnce(async () => { await gate.promise; return { ok: true, value: { text: 'Queued summary' } } as any })
    const selection = { providerId: 'p', modelId: 'model' }, authorize = vi.fn()
    const receipt = await runtime.compactConversation(sender, 's', selection, authorize, 'compact-id')
    expect(receipt).toMatchObject({ status: 'queued', queue: { items: [{ operation: 'context-compaction', selection }] } })
    selection.modelId = 'changed-after-ack'
    await expect(runtime.compactConversation(sender, 's', { providerId: 'p', modelId: 'model' }, authorize, 'compact-id')).resolves.toMatchObject({ status: 'queued' })
    await expect(runtime.compactConversation(sender, 's', { providerId: 'p', modelId: 'model' }, authorize, 'other-id')).rejects.toThrow('已在运行或排队')
    await runtime.submitMessage(sender, 's', 'next-id', 'After compression', [], { providerId: 'p', modelId: 'model' }, false)
    expect(generateSummaryWithUsage).not.toHaveBeenCalled()
    memory.resolve(); await running
    await vi.waitFor(() => expect(generateSummaryWithUsage).toHaveBeenCalledOnce())
    expect(prompt).toHaveBeenCalledOnce()
    expect(database.harness.getSession('s').activeRun.kind).toBe('context-compaction')
    await expect(runtime.compactConversation(sender, 's', { providerId: 'p', modelId: 'model' }, authorize, 'compact-id')).resolves.toMatchObject({ status: 'queued' })
    await expect(runtime.compactConversation(sender, 's', { providerId: 'p', modelId: 'model' }, authorize, 'other-id')).rejects.toThrow('已在运行或排队')
    gate.resolve()
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(runtime.getMessageQueue('s').items).toHaveLength(0))
    expect(database.harness.getSession('s').context.summary).toBe('Queued summary')
    expect(database.harness.getSession('s').messages.some((message: any) => message.content === '/compact')).toBe(false)
    expect(authorize.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it.each(['revoked', 'moved', 'failed', 'stopped'] as const)('retains the queued compaction and pauses following inputs when %s', async mode => {
    const { runtime, database, sender, memory, send } = compactionFixture()
    vi.spyOn(runtime as any, 'publishContextUsage').mockRestore()
    const running = send('Current turn'), selection = { providerId: 'p', modelId: 'model' }, authorize = vi.fn()
    await runtime.compactConversation(sender, 's', selection, authorize, 'compact-id')
    await runtime.submitMessage(sender, 's', 'next-id', 'After compression', [], selection, false)
    const gate = deferred()
    vi.mocked(generateSummaryWithUsage).mockImplementationOnce(async () => { await gate.promise; return { ok: false, error: { message: 'Model error' } } as any })
    if (mode === 'revoked') authorize.mockImplementation(() => { throw new Error('Grant revoked') })
    if (mode === 'moved') database.harness.updateSession({ ...database.harness.getSession('s'), workingDirectory: '/changed' })
    memory.resolve(); await running.catch(() => undefined)
    if (mode === 'failed' || mode === 'stopped') {
      await vi.waitFor(() => expect(generateSummaryWithUsage).toHaveBeenCalledOnce())
      if (mode === 'stopped') expect(runtime.abort('s')).toBe(true)
      gate.resolve()
    }
    await vi.waitFor(() => expect(runtime.getMessageQueue('s').paused).toBe(mode === 'stopped' ? 'stopped' : 'failed'))
    await vi.waitFor(() => expect(runtime.getMessageQueue('s').items).toHaveLength(2))
    expect(runtime.getMessageQueue('s').items.map(item => item.submissionId)).toEqual(['compact-id', 'next-id'])
    expect(database.harness.getSession('s').context?.summary).not.toBe('Queued summary')
    const withdrawn = runtime.withdrawMessage('s', runtime.getMessageQueue('s').items[0].id)
    expect(withdrawn.item.operation).toBe('context-compaction')
  })

  it('manually compacts below the automatic threshold without appending a command or overwriting history', async () => {
    const { runtime, database, sender } = compactionFixture()
    vi.spyOn(runtime as any, 'publishContextUsage').mockRestore()
    const before = database.harness.getSession('s'), authorize = vi.fn()
    const result = await runtime.compactConversation(sender, 's', { providerId: 'p', modelId: 'model' }, authorize)
    expect(result).toMatchObject({ status: 'compacted', usage: { source: 'estimated' } })
    expect(database.harness.getSession('s')).toMatchObject({ messages: before.messages, context: { summary: 'Earlier context summary', compactedThroughMessageId: 'm-1' } })
    expect(database.harness.getSession('s').activeRun).toBeUndefined()
    expect(generateSummaryWithUsage).toHaveBeenCalledOnce()
    expect(authorize).toHaveBeenCalledTimes(3)
    await expect(runtime.compactConversation(sender, 's', { providerId: 'p', modelId: 'model' }, authorize)).resolves.toMatchObject({ status: 'unchanged' })
    expect(generateSummaryWithUsage).toHaveBeenCalledOnce()
  })

  it.each(['stopped', 'revoked', 'moved', 'archived', 'history', 'failed', 'empty'] as const)('keeps the previous context intact when manual compaction is %s', async mode => {
    const { runtime, database, sender } = compactionFixture()
    const previous = { summary: 'Keep existing context', compactedAt: 123 }
    database.harness.updateSession({ ...database.harness.getSession('s'), context: previous })
    const gate = deferred(), requested = deferred(), authorize = vi.fn()
    vi.mocked(generateSummaryWithUsage).mockImplementationOnce(async () => { requested.resolve(); await gate.promise; return mode === 'failed' ? { ok: false, error: { message: 'Model error' } } as any : { ok: true, value: { text: mode === 'empty' ? ' ' : 'Changed summary' } } as any })
    const pending = runtime.compactConversation(sender, 's', { providerId: 'p', modelId: 'model' }, authorize)
    const outcome = pending.catch(error => error)
    await requested.promise
    expect(() => runtime.assertSessionMutable('s')).toThrow('正在运行')
    await expect(runtime.compactConversation(sender, 's', { providerId: 'p', modelId: 'model' }, authorize)).rejects.toThrow('上下文压缩已在运行或排队')
    if (mode === 'stopped') expect(runtime.abort('s')).toBe(true)
    if (mode === 'revoked') authorize.mockImplementation(() => { throw new Error('Grant revoked') })
    if (mode === 'moved') database.harness.updateSession({ ...database.harness.getSession('s'), workingDirectory: '/new-project' })
    if (mode === 'archived') database.harness.updateSession({ ...database.harness.getSession('s'), archivedAt: 100 })
    if (mode === 'history') database.harness.addMessage('s', 'user', 'Changed history')
    gate.resolve()
    expect(await outcome).toBeInstanceOf(Error)
    expect(database.harness.getSession('s').context).toEqual(previous)
    expect(database.harness.getSession('s').activeRun).toBeUndefined()
    expect(() => runtime.assertSessionMutable('s')).not.toThrow()
  })

  it('freezes explicit next-message permissions without changing the running session on admission', async () => {
    const { runtime, database, memory, sender, prompt } = setup()
    vi.spyOn(database.harness, 'getPermissionConfig').mockReturnValue({ globalDefaultMode: 'default', autoApproveEnabled: true, fullAccessEnabled: true })
    const selection = { providerId: 'p', modelId: 'model' }, options = { permissionMode: 'full' as const }
    const receipt = await runtime.submitMessage(sender, 's', 'permission-intent', 'Next', [], selection, false, options)
    expect(receipt.queue.items[0]?.permissionMode).toBe('full')
    expect(database.harness.getSession().permissionMode).toBe('default')
    expect(() => runtime.submitMessage(sender, 's', 'permission-intent', 'Next', [], selection, false, { permissionMode: 'default' })).toThrow('内容不同')
    vi.spyOn(database.harness, 'getPermissionConfig').mockReturnValue({ globalDefaultMode: 'default', autoApproveEnabled: false, fullAccessEnabled: false })
    expect(await runtime.submitMessage(sender, 's', 'permission-intent', 'Next', [], selection, false, options)).toMatchObject({ id: receipt.id })
    memory.resolve()
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    expect(database.harness.getSession().permissionMode).toBe('full')
    expect((runtime as any).environmentContext).toHaveBeenCalledWith(expect.anything(), 'manual', 'full')
  })

  it.each(['full', 'auto-approve'])('rejects a disabled permission intent before admission and permits a changed retry (%s)', mode => {
    const { runtime, database, sender } = setup()
    expect(runtime.submitMessage(sender, 's', 'invalid-mode', 'Next', [], { providerId: 'p', modelId: 'model' }, false, { permissionMode: mode as any })).toMatchObject({ retryRequired: true, reason: 'permission-mode-disabled' })
    expect(runtime.getMessageQueue('s').items).toEqual([])
    expect(database.harness.setPermission).not.toHaveBeenCalled()
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    expect(runtime.submitMessage(sender, 's', 'invalid-mode', 'Next', [], { providerId: 'p', modelId: 'model' }, false, { permissionMode: 'default' })).toHaveProperty('id')
  })

  it('rejects malformed permission intent before admission', () => {
    const { runtime, database, sender } = setup()
    expect(() => runtime.submitMessage(sender, 's', 'invalid-mode', 'Next', [], { providerId: 'p', modelId: 'model' }, false, { permissionMode: 'invalid' as any })).toThrow('无效的权限档位')
    expect(runtime.getMessageQueue('s').items).toEqual([])
    expect(database.harness.addMessage).not.toHaveBeenCalled()
  })
  it('promotes prepared owners only after queue admission, with stable replay and no premature history', async () => {
    const { runtime, memory, database, prompt, sender } = setup()
    database.harness.updateSession({ ...database.harness.getSession(), draftState: 'prepared' })
    const selection = { providerId: 'p', modelId: 'model' }
    const receipt = runtime.submitMessage(sender, 's', 'first', '开始', [], selection, false)
    expect(database.harness.acceptPreparedSession).toHaveBeenCalledOnce()
    expect(database.harness.getSession()).toMatchObject({ draftState: 'accepted', messages: [] })
    expect(runtime.submitMessage(sender, 's', 'first', '开始', [], selection, false)).toMatchObject({ id: receipt.id })
    expect(database.harness.acceptPreparedSession).toHaveBeenCalledOnce()
    memory.resolve()
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isRunning('s')).toBe(false))
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('does not promote prepared owners on validation, stale-run or durable admission failures', async () => {
    const { runtime, database, sender } = setup()
    database.harness.updateSession({ ...database.harness.getSession(), draftState: 'prepared' })
    const selection = { providerId: 'p', modelId: 'model' }
    expect(() => runtime.submitMessage(sender, 's', 'invalid', '开始', [], { providerId: 'p', modelId: 'missing' }, false)).toThrow()
    expect(runtime.submitMessage(sender, 's', 'stale', '开始', [], selection, false, { delivery: 'immediate', expectedRunId: 'old-run' })).toMatchObject({ retryRequired: true })
    expect(database.harness.acceptPreparedSession).not.toHaveBeenCalled()
    database.harness.acceptPreparedSession.mockImplementationOnce(() => { throw new Error('存储失败') })
    expect(() => runtime.submitMessage(sender, 's', 'first', '开始', [], selection, false)).toThrow('待发送消息执行失败')
    expect(database.harness.getSession()).toMatchObject({ draftState: 'prepared', messages: [] })
    expect(runtime.getMessageQueue('s').items).toEqual([])
    expect((runtime as any).messageQueue.hasPending('s')).toBe(false)
  })

  it('promotes an immediate prepared owner together with first-message persistence only after preflight succeeds', async () => {
    const { runtime, memory, database, sender } = setup()
    database.harness.updateSession({ ...database.harness.getSession(), draftState: 'prepared' })
    const pending = runtime.submitMessage(sender, 's', 'immediate', '开始', [], { providerId: 'p', modelId: 'model' }, false, { delivery: 'immediate', expectedRunId: null })
    await vi.waitFor(() => expect(database.harness.setActiveRun).toHaveBeenCalled())
    expect(database.harness.acceptPreparedSession).not.toHaveBeenCalled()
    expect(database.harness.addMessage).not.toHaveBeenCalled()
    memory.resolve()
    expect(await pending).toMatchObject({ submissionId: 'immediate' })
    expect(database.harness.acceptPreparedSession).toHaveBeenCalledExactlyOnceWith('s', expect.any(Function))
    expect(database.harness.getSession()).toMatchObject({ draftState: 'accepted', messages: [{ role: 'user', content: '开始' }] })
    await vi.waitFor(() => expect((runtime as any).runCoordinator.isRunning('s')).toBe(false))
  })

  it('admits a prepared owner through legacy runMessage only at successful first-message persistence', async () => {
    const { memory, database, send } = setup()
    database.harness.updateSession({ ...database.harness.getSession(), draftState: 'prepared' })
    const running = send('直接发送')
    expect(database.harness.acceptPreparedSession).toHaveBeenCalledExactlyOnceWith('s', expect.any(Function))
    expect(database.harness.getSession()).toMatchObject({ draftState: 'accepted', messages: [{ role: 'user', content: '直接发送' }] })
    memory.resolve(); await running
  })

  it('admits a successful prepared permission command and rejects failed persistence without an Agent or message', async () => {
    const { database, prompt, send } = setup()
    database.harness.updateSession({ ...database.harness.getSession(), draftState: 'prepared' })
    database.harness.acceptPreparedSession.mockImplementationOnce(() => { throw new Error('存储失败') })
    await expect(send('/perm full')).rejects.toThrow('存储失败')
    expect(database.harness.getSession()).toMatchObject({ draftState: 'prepared', permissionMode: 'default', messages: [] })
    await send('/perm full')
    expect(database.harness.getSession()).toMatchObject({ draftState: 'accepted', permissionMode: 'full', messages: [] })
    expect(prompt).not.toHaveBeenCalled()
    expect(database.harness.addMessage).not.toHaveBeenCalled()
  })
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
    expect(database.harness.addMessage).toHaveBeenCalledWith('s', 'user', 'New', [{ path: 'note.md', name: 'note.md', content: 'Frozen content' }], false, 'default', undefined)
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
    expect(database.harness.addMessage).toHaveBeenCalledWith('s', 'user', 'C', [{ path: 'note.md', name: 'note.md', content: 'Frozen note' }], false, 'default', undefined)
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
    expect(database.harness.addMessage).toHaveBeenCalledExactlyOnceWith('s', 'user', 'Frozen', [], false, 'default', undefined)
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
    expect(database.harness.addMessage).toHaveBeenCalledExactlyOnceWith('s', 'user', 'Queued', [], false, 'default', undefined)
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
    expect(database.harness.addMessage).toHaveBeenCalledExactlyOnceWith('s', 'user', 'Pending', [], false, 'default', undefined)
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

  it.each([
    { selected: ['资料', '代码'], custom: '保留引用\n附上摘要', expected: '资料、代码；补充：保留引用\n附上摘要' },
    { selected: ['资料'], custom: undefined, expected: '资料' },
    { selected: [], custom: '只整理资料', expected: '只整理资料' },
    { selected: ['资料'], custom: '   ', expected: '资料' },
    { selected: [], custom: '', expected: '（用户跳过）' },
  ])('passes the full clarification answer to the Agent: $expected', async ({ selected, custom, expected }) => {
    const { runtime, memory, database, prompt, sender } = setup()
    database.harness.setActivePlan('s', { id: 'plan', status: 'awaiting_input', request: '整理', understanding: '', steps: [], risks: [], createdAt: 1, updatedAt: 1 })
    database.harness.setPendingInteraction('s', { id: 'interaction', kind: 'question', status: 'waiting', questions: [{ id: 'scope', question: '处理范围？', multiSelect: true, options: [{ label: '资料' }, { label: '代码' }] }], createdAt: 1 })
    const answers = [{ id: 'scope', selected, ...(custom !== undefined ? { custom } : {}) }]
    prompt.mockImplementation(async () => { database.harness.setPendingInteraction('s', { id: 'next-review', kind: 'plan-review', status: 'waiting', planId: 'plan', createdAt: 1 }) })
    memory.resolve()
    await runtime.answerInteraction(sender, 's', 'interaction', answers, { providerId: 'p', modelId: 'model' })
    expect(database.harness.resolvePendingInteraction).toHaveBeenCalledExactlyOnceWith('s', 'interaction', 'answered', answers)
    expect(database.harness.addMessage).toHaveBeenCalledExactlyOnceWith('s', 'user', `用户对澄清问题的回答：\n- 处理范围？：${expected}`, undefined, true)
    expect(prompt).toHaveBeenCalledExactlyOnceWith(`用户对澄清问题的回答：\n- 处理范围？：${expected}`)
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
