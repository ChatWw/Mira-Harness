import { describe, expect, it, vi } from 'vitest'
import type { HarnessEvent, HarnessMessage, HarnessMessagePart, HarnessMessageQueueSnapshot, HarnessSession } from '../src/config/harness'
import { getPilotTaskState, getPilotTaskTone, PilotController, projectPilotMessage, shouldRenderPilotStream, type PilotHost } from '../apps/harness-react/src/state/pilot-state'

function session(id: string, content = ''): HarnessSession {
  return { version: 1, id, title: id, permissionMode: 'default', messages: content ? [{ id: `${id}-answer`, role: 'assistant', content, createdAt: 1 }] : [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false }
}

function fixture() {
  let listener: ((event: HarnessEvent) => void) | undefined
  const unsubscribe = vi.fn(() => { listener = undefined })
  const snapshots = new Map([['a', session('a')], ['b', session('b')]])
  const host: PilotHost = {
    listSessions: vi.fn(async () => [session('a'), session('b')]),
    listProjects: vi.fn(async () => [{ id: 'project', name: '测试项目', icon: 'FolderOpened', directory: '/tmp/mira-project', directoryExists: true, createdAt: 1, updatedAt: 1, sessionCount: 0 }]),
    getSession: vi.fn(async id => snapshots.get(id)!),
    createSession: vi.fn(async () => session('a')),
    listProviders: vi.fn(async () => [{ id: 'provider', providerKey: 'custom', name: 'Test', endpoint: 'http://localhost', authMode: 'none', models: [{ id: 'model', enabled: true, reasoning: false, contextWindow: 1000 }], enabled: true, hasApiKey: false, createdAt: 1, updatedAt: 1 }]),
    runMessage: vi.fn(async () => undefined),
    onEvent: vi.fn(callback => { listener = callback; return unsubscribe }),
    respondPermission: vi.fn(async () => undefined),
    listPendingPermissions: vi.fn(async () => []),
    openSessionProject: vi.fn(async () => ''),
    abortRun: vi.fn(async () => undefined),
    confirmPlan: vi.fn(async () => undefined),
    answerInteraction: vi.fn(async () => undefined),
    listFiles: vi.fn(async (_id, path) => ({ path, entries: [] })),
    readFile: vi.fn(async (_id, path) => ({ path, content: '' })),
    openTerminal: vi.fn(async id => ({ terminalId: 'terminal-1', sessionId: id, cwd: '/tmp' })),
    writeTerminal: vi.fn(async () => undefined),
    resizeTerminal: vi.fn(async () => undefined),
    closeTerminal: vi.fn(async () => undefined),
    navigateBrowser: vi.fn(async (_id, url) => url),
    setBrowserBounds: vi.fn(async () => undefined),
    controlBrowser: vi.fn(async () => undefined),
    onBrowserEvent: vi.fn(() => () => undefined),
  }
  const controller = new PilotController(host)
  const emit = (type: HarnessEvent['type'], payload: Record<string, unknown>, sessionId = 'a', runId?: string, metadata: Partial<HarnessEvent> = {}) => listener?.({ sessionId, type, payload, ...(runId ? { runId } : {}), ...metadata })
  return { controller, host, snapshots, emit, unsubscribe }
}

describe('React Harness pilot controller', () => {
  it('deduplicates batch confirmation, removes only successful owners, notifies and refreshes once', async () => {
    const { controller, host } = fixture()
    let finish!: (result: { deletedIds: string[]; skippedIds: string[]; failedIds: string[] }) => void
    host.deleteArchivedSessions = vi.fn(() => new Promise(resolve => { finish = resolve }))
    host.getArchivedSnapshot = vi.fn(async () => ({ snapshotId: 'frozen', count: 3 }))
    host.setPreference = vi.fn(async () => undefined)
    await controller.start(); await controller.open('a')
    vi.mocked(host.listSessions).mockClear()
    const deleted = vi.fn(); controller.onSessionDeleted(deleted)
    const first = controller.deleteArchivedSessions('frozen'), second = controller.deleteArchivedSessions('frozen')
    expect(first).toBe(second)
    for (let index = 0; index < 5; index++) await Promise.resolve()
    finish({ deletedIds: ['a'], skippedIds: ['b'], failedIds: ['c'] })
    vi.mocked(host.listSessions).mockResolvedValueOnce([session('b')])
    await expect(first).resolves.toEqual({ deletedIds: ['a'], skippedIds: ['b'], failedIds: ['c'] })
    expect(host.deleteArchivedSessions).toHaveBeenCalledExactlyOnceWith('frozen')
    expect(host.listSessions).toHaveBeenCalledOnce(); expect(deleted).toHaveBeenCalledExactlyOnceWith('a')
    expect(controller.getSnapshot().session?.id).toBe('b')
    expect(host.setPreference).toHaveBeenCalledWith('session-model-selection.a', null)
    expect(host.setPreference).not.toHaveBeenCalledWith('session-model-selection.b', null)
    controller.dispose()
  })
  it('reports completed deletion separately from read failure and lets refresh retry remain read-only', async () => {
    const { controller, host } = fixture(); await controller.start()
    host.deleteArchivedSessions = vi.fn(async () => ({ deletedIds: ['unused'], skippedIds: [], failedIds: [] }))
    vi.mocked(host.listSessions).mockRejectedValueOnce(new Error('read failed'))
    const result = await controller.deleteArchivedSessions('frozen')
    expect(result.deletedIds).toEqual(['unused']); expect(result.refreshError).toContain('删除操作已完成')
    await controller.refreshSessions()
    expect(host.deleteArchivedSessions).toHaveBeenCalledOnce()
    controller.dispose()
  })
  it('exports an attachment without mutating messages or navigation state', async () => {
    const { controller, host } = fixture()
    expect(controller.supportsAttachmentSave).toBe(false)
    host.saveAttachment = vi.fn(async () => ({ status: 'canceled' as const }))
    expect(controller.supportsAttachmentSave).toBe(true)
    await controller.start()
    const before = controller.getSnapshot()
    await expect(controller.saveAttachment('a', 'mira-attachment:frozen')).resolves.toEqual({ status: 'canceled' })
    expect(host.saveAttachment).toHaveBeenCalledExactlyOnceWith('a', 'mira-attachment:frozen')
    expect(controller.getSnapshot()).toBe(before)
    controller.dispose()
  })
  it('allows an explicit pre-admission image capability refusal to be retried with a different model', async () => {
    const { controller, host } = fixture()
    const queue: HarnessMessageQueueSnapshot = { sessionId: 'a', revision: 0, items: [] }
    host.submitMessage = vi.fn(async () => ({ retryRequired: true as const, reason: 'image-model-unsupported' as const, queue }))
    host.getMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 0, items: [] })); host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn()
    await controller.start()
    expect(await controller.send('', false, [{ path: 'mira-attachment:frozen', name: '截图.png', mediaType: 'image/png' }], 'rejected')).toBe('retry-required')
    expect(controller.getSnapshot().error).toContain('所选模型不支持图片输入')
    expect(controller.getSnapshot().messages).toEqual([])
    controller.dispose()
  })

  it.each(['archiveSession', 'deleteSession'] as const)('waits for current draft staging before %s and refuses the action when saving fails', async action => {
    const { controller, host } = fixture()
    host[action] = vi.fn(async () => undefined)
    await controller.start()
    let finish!: () => void
    const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const unregister = controller.registerBeforeNavigation(save)
    const change = controller[action]('a')
    expect(host[action]).not.toHaveBeenCalled()
    finish(); await change; expect(host[action]).toHaveBeenCalledWith('a')
    unregister(); await controller.open('a'); vi.mocked(host[action]!).mockClear()
    controller.registerBeforeNavigation(async () => { throw new Error('附件尚未添加成功') })
    await expect(controller[action]('a')).rejects.toThrow('附件尚未添加成功')
    expect(host[action]).not.toHaveBeenCalled(); expect(controller.getSnapshot().session?.id).toBe('a')
    controller.dispose()
  })

  it('rejects a failed archive without removing the displayed task or its saved draft ownership', async () => {
    const { controller, host } = fixture()
    await controller.start()
    const previous = controller.getSnapshot(), deleted = vi.fn()
    controller.onSessionDeleted(deleted)
    host.archiveSession = vi.fn(async () => { throw new Error('任务正在运行，不能归档') })
    await expect(controller.archiveSession('a')).rejects.toThrow('任务正在运行，不能归档')
    expect(controller.getSnapshot()).toBe(previous)
    expect(host.listSessions).toHaveBeenCalledTimes(1)
    expect(deleted).not.toHaveBeenCalled()
    controller.dispose()
  })

  it.each([true, false])('archives the current task without deleting its draft ownership and selects a replacement only when available: %s', async hasReplacement => {
    const { controller, host } = fixture()
    host.setPreference = vi.fn(async () => undefined)
    await controller.start()
    host.archiveSession = vi.fn(async () => undefined)
    vi.mocked(host.listSessions).mockResolvedValueOnce(hasReplacement ? [session('b')] : [])
    const deleted = vi.fn(); controller.onSessionDeleted(deleted)
    await controller.archiveSession('a')
    expect(controller.getSnapshot().session?.id).toBe(hasReplacement ? 'b' : undefined)
    expect(controller.getSnapshot().sessions.some(item => item.id === 'a')).toBe(false)
    expect(host.archiveSession).toHaveBeenCalledExactlyOnceWith('a')
    expect(host.setPreference).not.toHaveBeenCalledWith('session-model-selection.a', null)
    expect(host.createSession).not.toHaveBeenCalled()
    expect(host.abortRun).not.toHaveBeenCalled()
    expect(deleted).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('leaves a successfully archived task absent when the following list refresh fails', async () => {
    const { controller, host } = fixture()
    await controller.start()
    host.archiveSession = vi.fn(async () => undefined)
    vi.mocked(host.listSessions).mockRejectedValueOnce(new Error('列表读取失败'))
    const deleted = vi.fn(); controller.onSessionDeleted(deleted)
    await expect(controller.archiveSession('a')).rejects.toThrow('任务已归档，但任务列表刷新失败')
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: false, messages: [], error: '任务已归档，但任务列表刷新失败，请重试刷新。' })
    expect(controller.getSnapshot().sessions.map(item => item.id)).toEqual(['b'])
    expect(deleted).not.toHaveBeenCalled()
    vi.mocked(host.listSessions).mockResolvedValueOnce([session('b')])
    await controller.refreshSessions()
    expect(host.archiveSession).toHaveBeenCalledExactlyOnceWith('a')
    controller.dispose()
  })

  it('does not open an archive replacement over a newer draft during the host request', async () => {
    const { controller, host } = fixture()
    await controller.start()
    let finish!: () => void
    host.archiveSession = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const archiving = controller.archiveSession('a')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    controller.newConversation()
    vi.mocked(host.listSessions).mockResolvedValueOnce([session('b')])
    finish(); await archiving
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(host.getSession).not.toHaveBeenCalledWith('b')
    controller.dispose()
  })

  it('does not open an archive replacement over a task selected during list refresh', async () => {
    const { controller, host, snapshots } = fixture()
    snapshots.set('c', session('c'))
    await controller.start()
    host.archiveSession = vi.fn(async () => undefined)
    let finish!: (value: Awaited<ReturnType<PilotHost['listSessions']>>) => void
    vi.mocked(host.listSessions).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const archiving = controller.archiveSession('a')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(controller.getSnapshot().session).toBeUndefined()
    expect(await controller.open('b', () => true)).toBe(true)
    finish([session('c'), session('b')]); await archiving
    expect(controller.getSnapshot().session?.id).toBe('b')
    expect(host.getSession).not.toHaveBeenCalledWith('c')
    controller.dispose()
  })

  it('preserves a newer guarded load when the previously displayed task is archived', async () => {
    const { controller, host } = fixture()
    await controller.start()
    let finishArchive!: () => void, finishLoad!: (value: HarnessSession) => void
    host.archiveSession = vi.fn(() => new Promise<void>(resolve => { finishArchive = resolve }))
    const archiving = controller.archiveSession('a')
    await vi.waitFor(() => expect(finishArchive).toBeTypeOf('function'))
    vi.mocked(host.getSession).mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve }))
    const opening = controller.open('b', () => true)
    vi.mocked(host.listSessions).mockResolvedValueOnce([session('b')])
    finishArchive(); await archiving
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: true })
    finishLoad(session('b', '新导航内容'))
    expect(await opening).toBe(true)
    expect(controller.getSnapshot()).toMatchObject({ session: { id: 'b' }, sessionLoading: false })
    controller.dispose()
  })

  it('invalidates a guarded load of an archived task without abandoning the displayed task', async () => {
    const { controller, host } = fixture()
    await controller.start()
    let finishLoad!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve }))
    const opening = controller.open('b', () => true)
    host.archiveSession = vi.fn(async () => undefined)
    vi.mocked(host.listSessions).mockResolvedValueOnce([session('a')])
    await controller.archiveSession('b')
    expect(controller.getSnapshot()).toMatchObject({ session: { id: 'a' }, sessionLoading: false })
    finishLoad(session('b', '归档前的晚到内容'))
    expect(await opening).toBe(false)
    expect(controller.getSnapshot().session?.id).toBe('a')
    controller.dispose()
  })

  it('keeps initialization pending until startup restores the initial task', async () => {
    const { controller, host } = fixture()
    let finish!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const starting = controller.start()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(controller.getSnapshot().initialized).toBe(false)
    finish(session('a'))
    await starting
    expect(controller.getSnapshot()).toMatchObject({ initialized: true, session: { id: 'a' } })
    controller.dispose()
  })

  it('settles initialization when startup fails so navigation can use an empty fallback', async () => {
    const { controller, host } = fixture()
    vi.mocked(host.listSessions).mockRejectedValueOnce(new Error('会话列表不可用'))
    await controller.start()
    expect(controller.getSnapshot()).toMatchObject({ initialized: true, sessionLoading: false, error: '会话列表不可用' })
    expect(controller.getSnapshot().session).toBeUndefined()
    controller.dispose()
  })

  it('hydrates active and background running badges from the live session list on remount', async () => {
    const { controller, host, snapshots } = fixture()
    host.listSessions = vi.fn(async () => [{ ...session('a'), isRunning: true }, { ...session('b'), isRunning: true }])
    snapshots.set('a', { ...session('a'), activeRun: { id: 'run', messageId: 'first', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    expect(controller.getSnapshot().runningSessionIds).toEqual(['a', 'b'])
    expect(controller.getSnapshot().running).toBe(true)
    controller.dispose()
  })

  it('does not let a late initial list erase a newer running event', async () => {
    const { controller, host, emit } = fixture()
    let finish!: (value: Awaited<ReturnType<PilotHost['listSessions']>>) => void
    vi.mocked(host.listSessions).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const starting = controller.start()
    emit('run-start', { startedAt: 10, messageId: 'first' }, 'b', 'background-run', { sequence: 1 })
    finish([{ ...session('a'), isRunning: false }, { ...session('b'), isRunning: false }])
    await starting
    expect(controller.getSnapshot().runningSessionIds).toEqual(['b'])
    controller.dispose()
  })

  it('does not let an older list refresh resurrect a run after a terminal event', async () => {
    const { controller, host, emit } = fixture()
    host.listSessions = vi.fn(async () => [{ ...session('a'), isRunning: false }, { ...session('b'), isRunning: true }])
    await controller.start()
    let finish!: (value: Awaited<ReturnType<PilotHost['listSessions']>>) => void
    vi.mocked(host.listSessions).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    emit('title-updated', { title: 'renamed' }, 'b')
    host.listSessions = vi.fn(async () => [{ ...session('a'), isRunning: false }, { ...session('b'), isRunning: false }])
    emit('status', { state: 'completed' }, 'b', 'background-run', { sequence: 1 })
    finish([{ ...session('a'), isRunning: false }, { ...session('b'), isRunning: true }])
    await vi.waitFor(() => expect(vi.mocked(host.listSessions)).toHaveBeenCalled())
    expect(controller.getSnapshot().runningSessionIds).toEqual([])
    controller.dispose()
  })

  it('separates consumed guidance inside the same run and ignores late old-segment output', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const active = { id: 'run', messageId: 'first', startedAt: 10, activities: [], subtasks: [] }
    snapshots.set('a', { ...session('a'), activeRun: active })
    await controller.start()
    emit('message-delta', { messageId: 'first', delta: '前段' }, 'a', 'run', { sequence: 1 })
    const previous: HarnessMessage = { id: 'first', runId: 'run', role: 'assistant', content: '权威前段', createdAt: 11 }
    const guide: HarnessMessage = { id: 'guide', submissionId: 'submit-guide', runId: 'run', delivery: 'guide', role: 'user', content: '只做必要修改', createdAt: 20 }
    snapshots.set('a', { ...session('a'), messages: [previous, guide], activeRun: { ...active, messageId: 'second' } })
    emit('message-boundary', { previousAssistantMessageId: 'first', previousAssistantMessage: previous, message: guide, nextAssistantMessageId: 'second', queueItemId: 'guide', submissionId: 'submit-guide' }, 'a', 'run', { sequence: 2 })
    emit('message-delta', { messageId: 'second', delta: '后段' }, 'a', 'run', { sequence: 3 })
    emit('message-delta', { messageId: 'first', delta: '过期' }, 'a', 'run', { sequence: 99 })
    emit('message-delta', { messageId: 'second', delta: '继续' }, 'a', 'run', { sequence: 4 })
    await vi.waitFor(() => expect(controller.getSnapshot().messages).toMatchObject([previous, guide, { id: 'stream-second', runId: 'run', content: '后段继续' }]))
    expect(controller.getSnapshot().session?.activeRun).toMatchObject({ id: 'run', messageId: 'second' })
    expect(controller.getSnapshot().running).toBe(true)
    const reads = vi.mocked(host.getSession).mock.calls.length
    emit('message-complete', { messageId: 'first' }, 'a', 'run', { sequence: 100 })
    expect(vi.mocked(host.getSession).mock.calls).toHaveLength(reads)
    controller.dispose()
  })

  it('invalidates an old same-run snapshot at a guide boundary without losing the closed segment', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const active = { id: 'run', messageId: 'first', startedAt: 10, activities: [], subtasks: [] }
    snapshots.set('a', { ...session('a'), activeRun: active })
    await controller.start()
    emit('message-delta', { messageId: 'first', delta: 'before' }, 'a', 'run')
    let finish!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    emit('run-activity', {}, 'a', 'run')
    const previous: HarnessMessage = { id: 'first', role: 'assistant', runId: 'run', content: 'closed', createdAt: 11 }
    const guide: HarnessMessage = { id: 'guide', role: 'user', runId: 'run', delivery: 'guide', content: 'steer', createdAt: 20 }
    snapshots.set('a', { ...session('a'), messages: [previous, guide], activeRun: { ...active, messageId: 'second' } })
    emit('message-boundary', { previousAssistantMessageId: 'first', previousAssistantMessage: previous, message: guide, nextAssistantMessageId: 'second', queueItemId: 'guide', submissionId: 'submission' }, 'a', 'run')
    emit('message-delta', { messageId: 'second', delta: 'after' }, 'a', 'run')
    finish({ ...session('a'), activeRun: active, messages: [{ ...previous, content: 'stale' }] })
    await vi.waitFor(() => expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['closed', 'steer', 'after']))
    expect(controller.getSnapshot().session?.activeRun?.messageId).toBe('second')
    controller.dispose()
  })

  it('resumes the identified live segment without appending to an earlier assistant from the same run', async () => {
    const { controller, snapshots, emit } = fixture()
    const first: HarnessMessage = { id: 'first', role: 'assistant', runId: 'run', content: 'closed', createdAt: 11 }
    const guide: HarnessMessage = { id: 'guide', role: 'user', runId: 'run', delivery: 'guide', content: 'steer', createdAt: 20 }
    const text: HarnessMessagePart = { id: 'second-text', type: 'text', text: 'saved', state: 'streaming', startedAt: 21 }
    snapshots.set('a', { ...session('a'), messages: [first, guide, { id: 'second', role: 'assistant', runId: 'run', content: 'saved', parts: [text], createdAt: 21 }], activeRun: { id: 'run', messageId: 'second', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    emit('message-part', { messageId: 'first', partId: 'old', delta: 'stale' }, 'a', 'run', { sequence: 99 })
    emit('message-part', { messageId: 'second', partId: text.id, delta: ' continued', offset: 5 }, 'a', 'run', { sequence: 1 })
    expect(controller.getSnapshot().messages).toMatchObject([first, guide, { id: 'stream-second', content: 'saved continued', parts: [{ ...text, text: 'saved continued' }] }])
    controller.dispose()
  })

  it('accepts guidance already reflected in a snapshot once, and keeps next-segment live bytes', async () => {
    const { controller, snapshots, emit } = fixture()
    const previous: HarnessMessage = { id: 'first', role: 'assistant', runId: 'run', content: 'closed', createdAt: 11 }
    const guide: HarnessMessage = { id: 'guide', role: 'user', runId: 'run', delivery: 'guide', content: 'steer', createdAt: 20 }
    snapshots.set('a', { ...session('a'), messages: [previous, guide, { id: 'second', role: 'assistant', runId: 'run', content: 'saved', createdAt: 21 }], activeRun: { id: 'run', messageId: 'second', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    emit('message-delta', { messageId: 'second', delta: ' live' }, 'a', 'run', { sequence: 3 })
    const boundary = { previousAssistantMessageId: 'first', previousAssistantMessage: previous, message: guide, nextAssistantMessageId: 'second', queueItemId: 'guide', submissionId: 'submission' }
    emit('message-boundary', boundary, 'a', 'run', { sequence: 4 })
    emit('message-boundary', boundary, 'a', 'run', { sequence: 5 })
    await vi.waitFor(() => expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['closed', 'steer', 'saved live']))
    expect(controller.getSnapshot().messages.filter(message => message.id === 'guide')).toHaveLength(1)
    controller.dispose()
  })

  it('rereads an opening snapshot that crossed a guidance boundary before restoring the thread', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const active = { id: 'run', messageId: 'first', startedAt: 10, activities: [], subtasks: [] }
    const stale = { ...session('a'), activeRun: active }
    snapshots.set('a', stale)
    let finish!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const opening = controller.start()
    await vi.waitFor(() => expect(finish).toBeDefined())
    emit('run-start', { startedAt: 10, messageId: 'first' }, 'a', 'run')
    const previous: HarnessMessage = { id: 'first', role: 'assistant', runId: 'run', content: 'closed', createdAt: 11 }
    const guide: HarnessMessage = { id: 'guide', role: 'user', runId: 'run', delivery: 'guide', content: 'steer', createdAt: 20 }
    snapshots.set('a', { ...session('a'), messages: [previous, guide, { id: 'second', role: 'assistant', runId: 'run', content: 'saved after', createdAt: 21 }], activeRun: { ...active, messageId: 'second' } })
    emit('message-boundary', { previousAssistantMessageId: 'first', previousAssistantMessage: previous, message: guide, nextAssistantMessageId: 'second', queueItemId: 'guide', submissionId: 'submission' }, 'a', 'run')
    finish(stale)
    await opening
    expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['closed', 'steer', 'saved after'])
    expect(controller.getSnapshot().session?.activeRun?.messageId).toBe('second')
    expect(controller.getSnapshot().sessionLoading).toBe(false)
    controller.dispose()
  })

  it('restores a snapshot-ahead guide segment when its boundary event was missed', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const active = { id: 'run', messageId: 'first', startedAt: 10, activities: [], subtasks: [] }
    snapshots.set('a', { ...session('a'), activeRun: active })
    await controller.start()
    const first: HarnessMessage = { id: 'first', role: 'assistant', runId: 'run', content: 'closed', createdAt: 11 }
    const guide: HarnessMessage = { id: 'guide', role: 'user', runId: 'run', delivery: 'guide', content: 'steer', createdAt: 20 }
    snapshots.set('a', { ...session('a'), messages: [first, guide, { id: 'second', role: 'assistant', runId: 'run', content: 'saved', createdAt: 21 }], activeRun: { ...active, messageId: 'second' } })
    let reads = 0
    vi.mocked(host.getSession).mockImplementation(async id => {
      if (++reads > 4) throw new Error('unexpected repeated snapshot read')
      return snapshots.get(id)!
    })
    expect(await controller.open('a')).toBe(true)
    expect(reads).toBe(1)
    expect(controller.getSnapshot().sessionLoading).toBe(false)
    emit('message-delta', { messageId: 'first', delta: 'stale' }, 'a', 'run', { sequence: 99 })
    emit('message-delta', { messageId: 'second', delta: ' live' }, 'a', 'run', { sequence: 1 })
    expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['closed', 'steer', 'saved live'])
    controller.dispose()
  })

  it('restores a terminal snapshot and closes its cursor when the terminal event was missed', async () => {
    const { controller, host, snapshots, emit } = fixture()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'run', messageId: 'first', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    const final: HarnessMessage = { id: 'first', role: 'assistant', runId: 'run', content: 'finished', createdAt: 11, run: { status: 'completed', startedAt: 10, completedAt: 20, durationMs: 10, activities: [] } }
    snapshots.set('a', { ...session('a'), messages: [final] })
    let reads = 0
    vi.mocked(host.getSession).mockImplementation(async id => {
      if (++reads > 4) throw new Error('unexpected repeated snapshot read')
      return snapshots.get(id)!
    })
    expect(await controller.open('a')).toBe(true)
    expect(reads).toBe(1)
    emit('message-delta', { messageId: 'first', delta: 'late' }, 'a', 'run', { sequence: 99 })
    expect(controller.getSnapshot().messages).toEqual([final])
    expect(controller.getSnapshot()).toMatchObject({ running: false, sessionLoading: false })
    controller.dispose()
  })

  it('bounds stale opening reads and allows a later explicit retry', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const active = { id: 'run', messageId: 'first', startedAt: 10, activities: [], subtasks: [] }
    snapshots.set('a', { ...session('a'), activeRun: active })
    await controller.start()
    const previous: HarnessMessage = { id: 'first', role: 'assistant', runId: 'run', content: 'closed', createdAt: 11 }
    const guide: HarnessMessage = { id: 'guide', role: 'user', runId: 'run', delivery: 'guide', content: 'steer', createdAt: 20 }
    emit('message-boundary', { previousAssistantMessageId: 'first', previousAssistantMessage: previous, message: guide, nextAssistantMessageId: 'second', queueItemId: 'guide', submissionId: 'submission' }, 'a', 'run')
    let reads = 0
    vi.mocked(host.getSession).mockImplementation(async id => {
      if (++reads > 6) throw new Error('unexpected repeated snapshot read')
      return snapshots.get(id)!
    })
    expect(await controller.open('a')).toBe(false)
    expect(reads).toBeLessThanOrEqual(4)
    expect(controller.getSnapshot()).toMatchObject({ sessionLoading: false, error: '任务快照尚未同步，请重新打开任务' })
    snapshots.set('a', { ...session('a'), messages: [previous, guide], activeRun: { ...active, messageId: 'second' } })
    expect(await controller.open('a')).toBe(true)
    expect(controller.getSnapshot().session?.activeRun?.messageId).toBe('second')
    controller.dispose()
  })

  it('recovers a snapshot-ahead guide segment during activity refresh without a boundary event', async () => {
    const { controller, snapshots, emit } = fixture()
    const active = { id: 'run', messageId: 'first', startedAt: 10, activities: [], subtasks: [] }
    snapshots.set('a', { ...session('a'), activeRun: active })
    await controller.start()
    const previous: HarnessMessage = { id: 'first', role: 'assistant', runId: 'run', content: 'closed', createdAt: 11 }
    const guide: HarnessMessage = { id: 'guide', role: 'user', runId: 'run', delivery: 'guide', content: 'steer', createdAt: 20 }
    snapshots.set('a', { ...session('a'), messages: [previous, guide, { id: 'second', role: 'assistant', runId: 'run', content: 'saved', createdAt: 21 }], activeRun: { ...active, messageId: 'second' } })
    emit('run-activity', {}, 'a', 'run', { sequence: 1 })
    await vi.waitFor(() => expect(controller.getSnapshot().session?.activeRun?.messageId).toBe('second'))
    emit('message-delta', { messageId: 'second', delta: ' live' }, 'a', 'run', { sequence: 2 })
    expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['closed', 'steer', 'saved live'])
    controller.dispose()
  })

  it('restores a newer authoritative run during refresh when its start event was missed', async () => {
    const { controller, snapshots, emit } = fixture()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'old-run', messageId: 'first', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    snapshots.set('a', { ...session('a'), messages: [{ id: 'new-user', role: 'user', runId: 'new-run', content: 'queued task', createdAt: 20 }], activeRun: { id: 'new-run', messageId: 'second', startedAt: 20, activities: [], subtasks: [] } })
    emit('run-activity', {}, 'a', 'old-run', { sequence: 1 })
    await vi.waitFor(() => expect(controller.getSnapshot().session?.activeRun?.id).toBe('new-run'))
    emit('message-delta', { messageId: 'first', delta: 'late old' }, 'a', 'old-run', { sequence: 99 })
    emit('message-delta', { messageId: 'second', delta: 'new output' }, 'a', 'new-run', { sequence: 1 })
    expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['queued task', 'new output'])
    controller.dispose()
  })

  it('does not reopen a retired run from an older snapshot after the newer run closes', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const retired = { ...session('a'), activeRun: { id: 'old-run', messageId: 'first', startedAt: 10, activities: [], subtasks: [] } }
    snapshots.set('a', retired)
    await controller.start()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'new-run', messageId: 'second', startedAt: 20, activities: [], subtasks: [] } })
    emit('run-start', { startedAt: 20, messageId: 'second' }, 'a', 'new-run', { sequence: 1 })
    await vi.waitFor(() => expect(controller.getSnapshot().session?.activeRun?.id).toBe('new-run'))
    snapshots.set('a', session('a'))
    emit('status', { state: 'completed' }, 'a', 'new-run', { sequence: 2 })
    await vi.waitFor(() => expect(controller.getSnapshot().session?.activeRun).toBeUndefined())
    snapshots.set('a', retired)
    let reads = 0
    vi.mocked(host.getSession).mockImplementation(async id => {
      if (++reads > 5) throw new Error('unexpected repeated snapshot read')
      return snapshots.get(id)!
    })
    expect(await controller.open('a')).toBe(false)
    expect(controller.getSnapshot()).toMatchObject({ running: false, sessionLoading: false, error: '任务快照尚未同步，请重新打开任务' })
    controller.dispose()
  })

  it('offers queue actions only with the base queue and corresponding optional host method', async () => {
    const { controller, host } = fixture()
    host.reorderMessageQueue = vi.fn(); host.sendQueuedMessageNow = vi.fn()
    expect(controller.supportsQueueReorder).toBe(false); expect(controller.supportsQueueSendNow).toBe(false)
    host.submitMessage = vi.fn(); host.getMessageQueue = vi.fn(); host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn()
    expect(controller.supportsQueueReorder).toBe(true); expect(controller.supportsQueueSendNow).toBe(true)
    host.reorderMessageQueue = undefined; expect(controller.supportsQueueReorder).toBe(false)
    expect(await controller.reorderMessageQueue('a', 'item', null)).toBeUndefined()
    controller.dispose()
  })

  it('accepts queue reorder/send-now ACKs without local reorder and rejects older revisions', async () => {
    const { controller, host, emit } = fixture()
    const initial = { sessionId: 'a', revision: 1, items: [] }
    let resolve!: (queue: HarnessMessageQueueSnapshot) => void
    host.submitMessage = vi.fn(); host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn(); host.getMessageQueue = vi.fn(async () => initial)
    host.reorderMessageQueue = vi.fn(() => new Promise(done => { resolve = done }))
    host.sendQueuedMessageNow = vi.fn(async () => ({ sessionId: 'a', revision: 5, items: [], paused: 'stopped' }))
    await controller.start()
    const pending = controller.reorderMessageQueue('a', 'item', 'next')
    expect(controller.getSnapshot().queue).toEqual(initial)
    emit('queue-updated', { queue: { sessionId: 'a', revision: 4, items: [] } })
    resolve({ sessionId: 'a', revision: 2, items: [] }); await pending
    expect(controller.getSnapshot().queue?.revision).toBe(4)
    await controller.sendQueuedMessageNow('a', 'item', 'run-a')
    expect(host.sendQueuedMessageNow).toHaveBeenCalledExactlyOnceWith('a', 'item', 'run-a')
    expect(controller.getSnapshot().queue).toMatchObject({ revision: 5, paused: 'stopped' })
    controller.dispose()
  })

  it('keeps late queue actions and their failures out of a newly opened session', async () => {
    const { controller, host } = fixture()
    let resolve!: (queue: HarnessMessageQueueSnapshot) => void
    host.submitMessage = vi.fn(); host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn(); host.getMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 0, items: [] }))
    host.reorderMessageQueue = vi.fn(() => new Promise(done => { resolve = done }))
    await controller.start()
    const pending = controller.reorderMessageQueue('a', 'item', null)
    await controller.open('b'); resolve({ sessionId: 'a', revision: 1, items: [] })
    expect(await pending).toBeUndefined(); expect(controller.getSnapshot().queue?.sessionId).toBe('b')
    host.sendQueuedMessageNow = vi.fn(async () => { throw new Error('authoritative failure') })
    await expect(controller.sendQueuedMessageNow('b', 'item')).rejects.toThrow('authoritative failure')
    expect(controller.getSnapshot().queueError).toBe('authoritative failure')
    expect(controller.getSnapshot().running).toBe(false)
    controller.dispose()
  })

  it('keeps a prepared task late ACK refresh failure out of a newly opened task', async () => {
    const { controller, host, snapshots } = fixture()
    const prepared = { ...session('prepared'), draftState: 'prepared' as const }
    snapshots.set(prepared.id, prepared)
    let finish!: (receipt: { id: string; submissionId: string; queue: HarnessMessageQueueSnapshot }) => void
    host.submitMessage = vi.fn(() => new Promise(resolve => { finish = resolve }))
    host.getMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 0, items: [] }))
    host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn()
    host.setPreference = vi.fn(async () => undefined)
    await controller.start(); await controller.open(prepared.id)
    const sending = controller.send('第一条消息', false, [], 'prepared-submission')
    await controller.open('b')
    const current = controller.getSnapshot()
    const projects = current.projects.map(project => ({ ...project, sessionCount: 1 }))
    vi.mocked(host.listSessions).mockClear().mockRejectedValueOnce(new Error('列表读取失败'))
    vi.mocked(host.listProjects).mockClear().mockResolvedValueOnce(projects)
    vi.mocked(host.setPreference).mockClear()
    finish({ id: 'admitted', submissionId: 'prepared-submission', queue: { sessionId: prepared.id, revision: 1, items: [] } })
    await expect(sending).resolves.toBe(true)
    expect(host.listSessions).toHaveBeenCalledOnce(); expect(host.listProjects).toHaveBeenCalledOnce()
    expect(controller.getSnapshot()).toMatchObject({ session: current.session, messages: current.messages, queue: current.queue, projects, error: undefined })
    expect(host.setPreference).not.toHaveBeenCalledWith('active-session', prepared.id)
    controller.dispose()
  })

  it('submits busy input through queue ACK without optimistic conversation messages', async () => {
    const { controller, host, emit } = fixture()
    const queue: HarnessMessageQueueSnapshot = { sessionId: 'a', revision: 1, items: [] }
    host.submitMessage = vi.fn(async (_id, _text, _selection, _planning, _refs, submissionId) => ({ id: 'queued', submissionId, queue }))
    host.getMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 0, items: [] }))
    host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn()
    await controller.start()
    emit('run-start', { startedAt: 10 }, 'a', 'run-a')
    const before = controller.getSnapshot().messages
    expect(await controller.send('下一条', true, [{ path: 'README.md', name: 'README.md' }], 'stable-submission')).toBe(true)
    expect(host.submitMessage).toHaveBeenCalledWith('a', '下一条', { providerId: 'provider', modelId: 'model' }, true, [{ path: 'README.md', name: 'README.md' }], 'stable-submission')
    expect(host.runMessage).not.toHaveBeenCalled()
    expect(controller.getSnapshot().messages).toEqual(before)
    expect(controller.getSnapshot().queue).toEqual(queue)
    controller.dispose()
  })

  it('gates atomic delivery on explicit host support and projects confirmation without accepting the draft', async () => {
    const { controller, host } = fixture()
    const queue: HarnessMessageQueueSnapshot = { sessionId: 'a', revision: 3, items: [], paused: 'stopped' }
    host.submitMessage = vi.fn(async () => ({ confirmationRequired: true as const, queue }))
    host.getMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 0, items: [] })); host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn()
    await controller.start()
    expect(controller.supportsQueueSubmissionOptions).toBe(false)
    expect(await controller.send('Immediate', false, [], 'id', undefined, { delivery: 'immediate', expectedRunId: null })).toBe(false)
    expect(host.submitMessage).not.toHaveBeenCalled()
    Object.defineProperty(host, 'supportsQueueSubmissionOptions', { value: true })
    expect(controller.supportsQueueSubmissionOptions).toBe(true)
    expect(await controller.send('Current draft', false, [], 'id')).toBe('confirmation-required')
    expect(host.submitMessage).toHaveBeenCalledWith('a', 'Current draft', { providerId: 'provider', modelId: 'model' }, false, [], 'id', {})
    expect(controller.getSnapshot().queue).toEqual(queue)
    expect(controller.getSnapshot().messages).toEqual([])
    expect(controller.getSnapshot().running).toBe(false)
    controller.dispose()
  })

  it('freezes atomic options for its host request and never applies a late confirmation to another session', async () => {
    const { controller, host } = fixture()
    let resolve!: (result: { confirmationRequired: true; queue: HarnessMessageQueueSnapshot }) => void
    Object.defineProperty(host, 'supportsQueueSubmissionOptions', { value: true })
    host.submitMessage = vi.fn(() => new Promise(done => { resolve = done }))
    host.getMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 0, items: [] })); host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn()
    await controller.start()
    const options = { delivery: 'immediate' as const, pausedQueueDecision: 'retain' as const, expectedRunId: null, expectedQueueRevision: 3, expectedQueueItemIds: ['old'] }
    const sending = controller.send('Frozen', true, [], 'id', undefined, options)
    options.expectedQueueItemIds[0] = 'changed'
    expect(vi.mocked(host.submitMessage).mock.calls[0]![6]?.expectedQueueItemIds).toEqual(['old'])
    await controller.open('b')
    resolve({ confirmationRequired: true, queue: { sessionId: 'a', revision: 5, items: [] } })
    expect(await sending).toBe('confirmation-required')
    expect(controller.getSnapshot().queue?.sessionId).toBe('b')
    controller.dispose()
  })

  it('refreshes an explicitly rejected old run so the unchanged draft can be submitted against the new run', async () => {
    const { controller, host, snapshots, emit } = fixture()
    Object.defineProperty(host, 'supportsQueueSubmissionOptions', { value: true })
    const queue: HarnessMessageQueueSnapshot = { sessionId: 'a', revision: 1, items: [] }
    host.submitMessage = vi.fn().mockResolvedValueOnce({ retryRequired: true, queue }).mockResolvedValueOnce({ id: 'accepted', submissionId: 'retry-id', queue: { ...queue, revision: 2 } })
    host.getMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 0, items: [] })); host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn()
    await controller.start()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'old', startedAt: 10, activities: [], subtasks: [] } })
    emit('run-start', { startedAt: 10 }, 'a', 'old')
    await Promise.resolve()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'new', startedAt: 20, activities: [], subtasks: [] } })
    expect(await controller.send('Unchanged draft', false, [], 'old-id', undefined, { delivery: 'immediate', expectedRunId: 'old' })).toBe('retry-required')
    expect(controller.getSnapshot().session?.activeRun?.id).toBe('new')
    expect(await controller.send('Unchanged draft', false, [], 'retry-id', undefined, { delivery: 'immediate', expectedRunId: controller.getSnapshot().session?.activeRun?.id ?? null })).toBe(true)
    expect(vi.mocked(host.submitMessage).mock.calls[1]![6]).toEqual({ delivery: 'immediate', expectedRunId: 'new' })
    emit('status', { state: 'idle' }, 'a', 'old')
    expect(controller.getSnapshot().running).toBe(true)
    controller.dispose()
  })

  it('uses the frozen submitted model instead of newer next-message settings', async () => {
    const { controller, host } = fixture()
    host.submitMessage = vi.fn(async (_id, _text, _selection, _planning, _refs, submissionId) => ({ id: 'item', submissionId, queue: { sessionId: 'a', revision: 1, items: [] } }))
    host.getMessageQueue = vi.fn(async () => ({ sessionId: 'a', revision: 0, items: [] })); host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn()
    await controller.start()
    const original = { providerId: 'provider', modelId: 'model', thinkingLevel: 'medium' as const }
    controller.select({ ...original, thinkingLevel: 'high' })
    await controller.send('原提交', false, [], 'original-id', original)
    expect(host.submitMessage).toHaveBeenCalledWith('a', '原提交', original, false, [], 'original-id')
    expect(controller.getSnapshot().selection?.thinkingLevel).toBe('high')
    controller.dispose()
  })

  it('rejects stale queue snapshots and background updates and resets queue for new drafts', async () => {
    const { controller, host, emit } = fixture()
    let resolve!: (queue: HarnessMessageQueueSnapshot) => void
    host.submitMessage = vi.fn(); host.withdrawMessage = vi.fn(); host.resumeMessageQueue = vi.fn()
    host.getMessageQueue = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValue({ sessionId: 'b', revision: 0, items: [] })
    const opening = controller.start()
    for (let index = 0; index < 12; index++) await Promise.resolve()
    emit('queue-updated', { queue: { sessionId: 'a', revision: 4, items: [], paused: 'failed', error: 'queue failed' } })
    resolve({ sessionId: 'a', revision: 1, items: [] }); await opening
    expect(controller.getSnapshot().queue).toMatchObject({ revision: 4, paused: 'failed' })
    emit('queue-updated', { queue: { sessionId: 'a', revision: 3, items: [] } })
    expect(controller.getSnapshot().queue?.revision).toBe(4)
    await controller.open('b')
    emit('queue-updated', { queue: { sessionId: 'a', revision: 5, items: [] } })
    expect(controller.getSnapshot().queue?.sessionId).toBe('b')
    controller.newConversation(); expect(controller.getSnapshot().queue).toBeUndefined()
    controller.dispose()
  })

  it('keeps queue withdrawal and resume bound to the requested session after navigation', async () => {
    const { controller, host } = fixture()
    let resolve!: (value: any) => void
    host.submitMessage = vi.fn(); host.getMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 0, items: [] }))
    host.withdrawMessage = vi.fn(() => new Promise(done => { resolve = done }))
    host.resumeMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 8, items: [] }))
    await controller.start()
    const withdrawal = controller.withdrawMessage('a', 'item-a')
    await controller.open('b')
    resolve({ item: { sessionId: 'a', id: 'item-a' }, queue: { sessionId: 'a', revision: 7, items: [] } })
    expect(await withdrawal).toMatchObject({ item: { sessionId: 'a', id: 'item-a' } })
    expect(controller.getSnapshot().queue?.sessionId).toBe('b')
    expect(await controller.resumeMessageQueue('a')).toBeUndefined()
    expect(host.resumeMessageQueue).not.toHaveBeenCalled()
    expect(host.withdrawMessage).toHaveBeenCalledWith('a', 'item-a')
    controller.dispose()
  })

  it('lets the authority decide resume when an obsolete queue snapshot still says confirmation', async () => {
    const { controller, host, emit } = fixture()
    host.submitMessage = vi.fn(); host.withdrawMessage = vi.fn()
    host.getMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 0, items: [] }))
    host.resumeMessageQueue = vi.fn(async id => ({ sessionId: id, revision: 2, items: [] }))
    await controller.start()
    emit('queue-updated', { queue: { sessionId: 'a', revision: 1, items: [], paused: 'confirmation' } })
    expect(await controller.resumeMessageQueue('a')).toEqual({ sessionId: 'a', revision: 2, items: [] })
    expect(host.resumeMessageQueue).toHaveBeenCalledWith('a')
    controller.dispose()
  })

  it('rejects old-run deltas and terminal events and deduplicates current deltas without waiting for dense sequences', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    emit('run-start', { startedAt: 1 }, 'a', 'old', { sequence: 1, eventId: 'old-start' })
    emit('run-start', { startedAt: 2 }, 'a', 'current', { sequence: 1, eventId: 'new-start' })
    emit('message-delta', { delta: 'CURRENT' }, 'a', 'current', { sequence: 8, eventId: 'delta' })
    emit('message-delta', { delta: 'STALE' }, 'a', 'old', { sequence: 9, eventId: 'old-delta' })
    emit('message-delta', { delta: 'CURRENT' }, 'a', 'current', { sequence: 8, eventId: 'delta' })
    emit('message-delta', { delta: 'sequence duplicate' }, 'a', 'current', { sequence: 8, eventId: 'other-id' })
    const reads = vi.mocked(host.getSession).mock.calls.length
    emit('message-complete', {}, 'a', 'old', { sequence: 10 })
    emit('status', { state: 'idle' }, 'a', 'old', { sequence: 11 })
    emit('run-start', { startedAt: 1 }, 'a', 'old', { sequence: 12 })
    expect(controller.getSnapshot().messages.at(-1)?.content).toBe('CURRENT')
    expect(controller.getSnapshot().running).toBe(true)
    expect(controller.getSnapshot().session?.activeRun?.id).toBe('current')
    expect(host.getSession).toHaveBeenCalledTimes(reads)
    controller.dispose()
  })

  it('retains run duplicate protection across session reopening with a sequence-less active snapshot', async () => {
    const { controller, snapshots, emit } = fixture()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'run-a', startedAt: 1, activities: [], subtasks: [] } })
    await controller.start()
    emit('message-delta', { delta: 'once' }, 'a', 'run-a', { sequence: 3, eventId: 'delta-a' })
    await controller.open('b'); await controller.open('a')
    emit('message-delta', { delta: 'duplicate' }, 'a', 'run-a', { sequence: 3, eventId: 'delta-a' })
    expect(controller.getSnapshot().messages).toEqual([])
    emit('message-delta', { delta: 'new' }, 'a', 'run-a', { sequence: 9, eventId: 'next' })
    expect(controller.getSnapshot().messages.at(-1)?.content).toBe('new')
    controller.dispose()
  })

  it('closes a run on terminal status and rejects later higher-sequence output from that same run', async () => {
    const { controller, emit } = fixture()
    await controller.start()
    emit('run-start', { startedAt: 1 }, 'a', 'closed-run', { sequence: 1 })
    emit('message-delta', { delta: 'before idle' }, 'a', 'closed-run', { sequence: 2 })
    emit('status', { state: 'idle' }, 'a', 'closed-run', { sequence: 3 })
    for (let index = 0; index < 12; index++) await Promise.resolve()
    expect(controller.getSnapshot().running).toBe(false)
    const before = controller.getSnapshot().messages
    emit('message-delta', { delta: 'after idle' }, 'a', 'closed-run', { sequence: 9 })
    emit('run-start', { startedAt: 1 }, 'a', 'closed-run', { sequence: 10 })
    expect(controller.getSnapshot().messages).toEqual(before)
    expect(controller.getSnapshot().running).toBe(false)
    emit('run-start', { startedAt: 2 }, 'a', 'next-run', { sequence: 1 })
    emit('message-delta', { delta: 'next' }, 'a', 'next-run', { sequence: 4 })
    expect(controller.getSnapshot().messages.at(-1)?.content).toBe('next')
    controller.dispose()
  })

  it('keeps queue, workspace, terminal and legacy events independent from the closed-run gate', async () => {
    const { controller, emit } = fixture(), workspace = vi.fn(), terminal = vi.fn()
    await controller.start(); controller.onWorkspaceFilesChanged(workspace); controller.onTerminalEvent(terminal)
    emit('run-start', { startedAt: 1 }, 'a', 'run', { sequence: 1 })
    emit('status', { state: 'idle' }, 'a', 'run', { sequence: 2 })
    emit('workspace-files-changed', { watchId: 'watch', directory: '/tmp', paths: ['README.md'] }, 'a', 'run', { sequence: 3 })
    emit('terminal-output', { terminalId: 'terminal', data: 'output' }, 'a', 'run', { sequence: 4 })
    emit('queue-updated', { queue: { sessionId: 'a', revision: 2, items: [] } }, 'a', 'run', { sequence: 5 })
    emit('message-delta', { delta: 'legacy' })
    expect(workspace).toHaveBeenCalledOnce(); expect(terminal).toHaveBeenCalledOnce()
    expect(controller.getSnapshot().queue?.revision).toBe(2)
    expect(controller.getSnapshot().messages.at(-1)?.content).toBe('legacy')
    controller.dispose()
  })

  it('can stop the preparing run from its event identity before a snapshot arrives', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    emit('run-start', { startedAt: 10, activities: [], subtasks: [] }, 'a', 'preparing-run')
    await controller.stop()
    expect(host.abortRun).toHaveBeenCalledExactlyOnceWith('a', 'preparing-run')
    expect(controller.getSnapshot().session?.activeRun?.id).toBe('preparing-run')
    controller.dispose()
  })

  it('uses the restored active run identity and never sends an unscoped stop', async () => {
    const { controller, host, snapshots } = fixture()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'restored-run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    await controller.stop()
    expect(host.abortRun).toHaveBeenCalledExactlyOnceWith('a', 'restored-run')
    await controller.open('b')
    await controller.stop()
    expect(host.abortRun).toHaveBeenCalledOnce()
    controller.dispose()
  })

  it('does not let a snapshot started before run admission erase the stop target', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    let resolve!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockReturnValueOnce(new Promise(done => { resolve = done }))
    emit('run-activity', { activities: [] })
    emit('run-start', { startedAt: 10, activities: [], subtasks: [] }, 'a', 'new-run')
    resolve(session('a'))
    await Promise.resolve()
    await controller.stop()
    expect(host.abortRun).toHaveBeenCalledExactlyOnceWith('a', 'new-run')
    expect(controller.getSnapshot().running).toBe(true)
    controller.dispose()
  })

  it('loads the admitted user and previous authoritative turn at run start without dropping later live deltas', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    let resolve!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockReturnValueOnce(new Promise(done => { resolve = done }))
    emit('run-start', { startedAt: 10 }, 'a', 'queued-run')
    emit('message-delta', { delta: '新回复' }, 'a', 'queued-run')
    expect(controller.getSnapshot().messages.some(message => message.role === 'user')).toBe(false)
    const messages: HarnessSession['messages'] = [
      { id: 'old-user', role: 'user', content: '上一条问题', createdAt: 1 },
      { id: 'old-assistant', role: 'assistant', content: '上一条权威回复', createdAt: 2, runId: 'old-run' },
      { id: 'queued-user', role: 'user', content: '已实际开始的排队消息', createdAt: 10, runId: 'queued-run' },
      { id: 'internal', role: 'user', content: '隐藏上下文', createdAt: 10, internal: true },
    ]
    resolve({ ...session('a'), messages, activeRun: { id: 'queued-run', startedAt: 10, activities: [], subtasks: [] } })
    await vi.waitFor(() => expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['上一条问题', '上一条权威回复', '已实际开始的排队消息', '新回复']))
    emit('message-delta', { delta: '继续' }, 'a', 'queued-run')
    expect(controller.getSnapshot().messages.at(-1)?.content).toBe('新回复继续')
    controller.dispose()
  })

  it('still syncs the admitted transcript when an activity read supersedes the start read', async () => {
    const { controller, host, snapshots, emit } = fixture()
    await controller.start()
    let resolve!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockReturnValueOnce(new Promise(done => { resolve = done }))
    emit('run-start', { startedAt: 10 }, 'a', 'queued-run')
    const admitted = { ...session('a'), messages: [{ id: 'queued-user', role: 'user' as const, content: 'admitted', createdAt: 10 }], activeRun: { id: 'queued-run', startedAt: 10, activities: [], subtasks: [] } }
    snapshots.set('a', admitted)
    emit('run-activity', {}, 'a', 'queued-run'); emit('message-delta', { delta: 'live' }, 'a', 'queued-run')
    await vi.waitFor(() => expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['admitted', 'live']))
    resolve(session('a', '过时的开始快照')); await Promise.resolve()
    expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['admitted', 'live'])
    controller.dispose()
  })

  it.each([undefined, { id: 'old-run', startedAt: 1, activities: [], subtasks: [] }])('does not let a stale start snapshot replace a newer active identity: %j', async staleRun => {
    const { controller, host, emit } = fixture()
    await controller.start()
    vi.mocked(host.getSession).mockResolvedValueOnce({ ...session('a', 'stale'), activeRun: staleRun })
    emit('run-start', { startedAt: 10 }, 'a', 'new-run'); emit('message-delta', { delta: 'current live' }, 'a', 'new-run')
    for (let index = 0; index < 12; index++) await Promise.resolve()
    expect(controller.getSnapshot().session?.activeRun?.id).toBe('new-run')
    expect(controller.getSnapshot().messages.at(-1)?.content).toBe('current live')
    expect(controller.getSnapshot().running).toBe(true)
    controller.dispose()
  })

  it('keeps a newer queued run when a previous start snapshot resolves late', async () => {
    const { controller, host, snapshots, emit } = fixture()
    await controller.start()
    let resolve!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockReturnValueOnce(new Promise(done => { resolve = done }))
    emit('run-start', { startedAt: 10 }, 'a', 'first-run')
    snapshots.set('a', { ...session('a'), messages: [{ id: 'new-user', role: 'user', content: 'new admitted user', createdAt: 20 }], activeRun: { id: 'second-run', startedAt: 20, activities: [], subtasks: [] } })
    emit('run-start', { startedAt: 20 }, 'a', 'second-run'); emit('message-delta', { delta: 'new live' }, 'a', 'second-run')
    await vi.waitFor(() => expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['new admitted user', 'new live']))
    resolve({ ...session('a', 'old response'), activeRun: { id: 'first-run', startedAt: 10, activities: [], subtasks: [] } }); await Promise.resolve()
    expect(controller.getSnapshot().session?.activeRun?.id).toBe('second-run')
    expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['new admitted user', 'new live'])
    controller.dispose()
  })

  it('merges an active persisted assistant into its live stream without rendering a duplicate reply', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    let resolve!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockReturnValueOnce(new Promise(done => { resolve = done }))
    emit('run-start', { startedAt: 10 }, 'a', 'run'); emit('message-delta', { delta: '完整实时回复' }, 'a', 'run')
    resolve({ ...session('a'), messages: [{ id: 'user', role: 'user', content: 'admitted', createdAt: 10, runId: 'run' }, { id: 'persisted', role: 'assistant', content: '完整', createdAt: 11, runId: 'run' }], activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await vi.waitFor(() => expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['admitted', '完整实时回复']))
    expect(controller.getSnapshot().messages.at(-1)?.id).toBe('stream-run')
    controller.dispose()
  })

  it('does not consume future persisted delta bytes before their live event arrives', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    let resolve!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockReturnValueOnce(new Promise(done => { resolve = done }))
    emit('run-start', { startedAt: 10 }, 'a', 'run'); emit('message-delta', { delta: '已到达' }, 'a', 'run')
    resolve({ ...session('a'), messages: [{ id: 'user', role: 'user', content: 'admitted', createdAt: 10, runId: 'run' }, { id: 'persisted', role: 'assistant', content: '已到达下一段', createdAt: 11, runId: 'run' }], activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await vi.waitFor(() => expect(controller.getSnapshot().messages[0]?.role).toBe('user'))
    emit('message-delta', { delta: '下一段' }, 'a', 'run')
    expect(controller.getSnapshot().messages.at(-1)?.content).toBe('已到达下一段')
    controller.dispose()
  })

  it('continues a persisted active reply after reopening with its existing prefix intact', async () => {
    const { controller, snapshots, emit } = fixture()
    snapshots.set('a', { ...session('a'), messages: [{ id: 'user', role: 'user', content: 'admitted', createdAt: 10, runId: 'run' }, { id: 'persisted', role: 'assistant', content: '重开前的正文', createdAt: 11, runId: 'run' }], activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start(); emit('message-delta', { delta: '之后的增量' }, 'a', 'run')
    expect(controller.getSnapshot().messages.map(message => message.content)).toEqual(['admitted', '重开前的正文之后的增量'])
    controller.dispose()
  })

  it('keeps text, tool and reasoning parts in received order without double-appending legacy content deltas', async () => {
    const { controller, emit } = fixture()
    await controller.start(); emit('run-start', { startedAt: 10 }, 'a', 'run', { sequence: 1 })
    const text: HarnessMessagePart = { id: 'text-1', type: 'text', text: '', state: 'streaming', startedAt: 10 }
    const reasoning: HarnessMessagePart = { id: 'reasoning', type: 'reasoning', text: '', state: 'streaming', startedAt: 11 }
    emit('message-part', { part: text }, 'a', 'run', { sequence: 2 }); emit('message-part', { partId: text.id, delta: '工具前正文' }, 'a', 'run', { sequence: 3 })
    emit('message-delta', { delta: '工具前正文' }, 'a', 'run', { sequence: 4 }); emit('message-part', { part: { ...text, text: '工具前正文', state: 'complete', completedAt: 11 } }, 'a', 'run', { sequence: 5 })
    emit('message-part', { part: { id: 'tool', type: 'tool', toolCallId: 'tool-call' } }, 'a', 'run', { sequence: 6 })
    emit('message-part', { part: reasoning }, 'a', 'run', { sequence: 7 }); emit('message-part', { partId: reasoning.id, delta: '公开推理' }, 'a', 'run', { sequence: 8 })
    emit('message-part', { part: { ...reasoning, text: '公开推理', state: 'complete', truncated: true } }, 'a', 'run', { sequence: 9 })
    const message = controller.getSnapshot().messages.at(-1)!
    expect(message.id).toBe('stream-run'); expect(message.runId).toBe('run'); expect(message.content).toBe('工具前正文')
    expect(message.parts?.map(part => part.id)).toEqual(['text-1', 'tool', 'reasoning'])
    expect(message.parts?.[0]).toMatchObject({ text: '工具前正文', state: 'complete' })
    expect(message.parts?.[2]).toMatchObject({ text: '公开推理', truncated: true })
    emit('message-part', { partId: text.id, delta: '不应追加' }, 'a', 'run', { sequence: 10 })
    emit('message-part', { part: { id: 'late-old', type: 'tool', toolCallId: 'old-tool' } }, 'a', 'old', { sequence: 11 })
    expect(controller.getSnapshot().messages.at(-1)?.parts).toEqual(message.parts)
    controller.dispose()
  })

  it('merges snapshot part IDs with newer live states without losing an inline approval tool', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    let resolve!: (value: HarnessSession) => void; vi.mocked(host.getSession).mockReturnValueOnce(new Promise(done => { resolve = done }))
    emit('run-start', { startedAt: 10 }, 'a', 'run')
    const text: HarnessMessagePart = { id: 'text', type: 'text', text: 'live text', state: 'complete', startedAt: 10, completedAt: 11 }
    const tool: HarnessMessagePart = { id: 'tool', type: 'tool', toolCallId: 'approved-tool' }
    emit('message-part', { part: text }, 'a', 'run'); emit('message-part', { part: tool }, 'a', 'run')
    emit('permission-request', { requestId: 'approval', title: '写入文件', toolCallId: 'approved-tool', runId: 'run' }, 'a', 'run')
    resolve({ ...session('a'), messages: [{ id: 'user', role: 'user', content: 'admitted', createdAt: 10 }, { id: 'persisted', role: 'assistant', content: '', runId: 'run', parts: [{ ...text, text: 'stale', state: 'streaming' }], createdAt: 11 }], activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await vi.waitFor(() => expect(controller.getSnapshot().messages[0]?.role).toBe('user'))
    expect(controller.getSnapshot().messages.at(-1)?.parts).toEqual([text, tool])
    expect(controller.getSnapshot().permission).toMatchObject({ requestId: 'approval', toolCallId: 'approved-tool', runId: 'run' })
    controller.dispose()
  })

  it('resumes persisted parts in the same assistant after reopening and reconciles a snapshot-ahead part create', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const existing: HarnessMessagePart = { id: 'existing', type: 'text', text: '已保存', state: 'streaming', startedAt: 10 }
    snapshots.set('a', { ...session('a'), messages: [{ id: 'persisted', role: 'assistant', runId: 'run', content: '已保存', parts: [existing], createdAt: 11 }], activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start(); emit('message-part', { partId: existing.id, delta: '新增' }, 'a', 'run'); emit('message-delta', { delta: '新增' }, 'a', 'run')
    expect(controller.getSnapshot().messages).toHaveLength(1); expect(controller.getSnapshot().messages[0].parts?.[0]).toMatchObject({ text: '已保存新增' })
    const ahead: HarnessMessagePart = { id: 'ahead', type: 'text', text: '还没收到事件', state: 'streaming', startedAt: 12 }
    vi.mocked(host.getSession).mockResolvedValueOnce({ ...snapshots.get('a')!, messages: [{ ...snapshots.get('a')!.messages[0], parts: [existing, ahead] }] })
    emit('run-activity', {}, 'a', 'run'); await vi.waitFor(() => expect(controller.getSnapshot().messages[0].parts).toHaveLength(2))
    emit('message-part', { part: { ...ahead, text: '' } }, 'a', 'run'); emit('message-part', { partId: ahead.id, delta: '还没收到事件', offset: 0 }, 'a', 'run')
    expect(controller.getSnapshot().messages[0].parts?.[1]).toMatchObject({ text: '还没收到事件' })
    expect(controller.getSnapshot().messages).toHaveLength(1)
    controller.dispose()
  })

  it('deduplicates late and overlapping part deltas after reload and projects content only once', async () => {
    const { controller, snapshots, emit } = fixture()
    const part: HarnessMessagePart = { id: 'text', type: 'text', text: '前缀已保存', state: 'streaming', startedAt: 10 }
    snapshots.set('a', { ...session('a'), messages: [{ id: 'persisted', role: 'assistant', runId: 'run', content: part.text, parts: [part], createdAt: 11 }], activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    emit('message-part', { part: { ...part, text: '前缀' } }, 'a', 'run', { sequence: 1 })
    emit('message-part', { partId: part.id, delta: '已保存', offset: 2 }, 'a', 'run', { sequence: 2 })
    emit('message-part', { partId: part.id, delta: '保存后续', offset: 3 }, 'a', 'run', { sequence: 3 })
    emit('message-delta', { delta: '后续' }, 'a', 'run', { sequence: 4 })
    const message = controller.getSnapshot().messages[0]
    expect(message.parts?.[0]).toMatchObject({ text: '前缀已保存后续' }); expect(message.content).toBe('前缀已保存后续')
    emit('message-part', { part: { ...part, text: '前缀', state: 'complete', completedAt: 20 } }, 'a', 'run', { sequence: 5 })
    emit('message-part', { part: { ...part, text: '前缀', state: 'streaming' } }, 'a', 'run', { sequence: 6 })
    expect(controller.getSnapshot().messages[0].parts?.[0]).toMatchObject({ text: '前缀已保存后续', state: 'complete' })
    controller.dispose()
  })

  it('resyncs a part offset gap from authority instead of fabricating missing characters', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const part: HarnessMessagePart = { id: 'text', type: 'text', text: 'A', state: 'streaming', startedAt: 10 }
    snapshots.set('a', { ...session('a'), messages: [{ id: 'persisted', role: 'assistant', runId: 'run', content: 'A', parts: [part], createdAt: 11 }], activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start(); const reads = vi.mocked(host.getSession).mock.calls.length
    snapshots.set('a', { ...snapshots.get('a')!, messages: [{ ...snapshots.get('a')!.messages[0], content: 'ABC', parts: [{ ...part, text: 'ABC' }] }] })
    emit('message-part', { partId: 'text', delta: 'C', offset: 2 }, 'a', 'run')
    expect(controller.getSnapshot().messages[0].content).toBe('A')
    await vi.waitFor(() => expect(controller.getSnapshot().messages[0].content).toBe('ABC'))
    expect(host.getSession).toHaveBeenCalledTimes(reads + 1)
    controller.dispose()
  })

  it('counts overlap offsets in UTF-16 code units and excludes reasoning from canonical content', async () => {
    const { controller, snapshots, emit } = fixture()
    const part: HarnessMessagePart = { id: 'text', type: 'text', text: '\uD83D\uDE00A', state: 'streaming', startedAt: 10 }
    const reasoning: HarnessMessagePart = { id: 'reasoning', type: 'reasoning', text: '公开推理', state: 'complete', startedAt: 9 }
    snapshots.set('a', { ...session('a'), messages: [{ id: 'persisted', role: 'assistant', runId: 'run', content: 'stale projection', parts: [reasoning, part], createdAt: 11 }], activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    expect(controller.getSnapshot().messages[0].content).toBe('\uD83D\uDE00A')
    emit('message-part', { partId: 'text', delta: 'AB', offset: 2 }, 'a', 'run')
    expect(controller.getSnapshot().messages[0].content).toBe('\uD83D\uDE00AB')
    expect(controller.getSnapshot().messages[0].parts?.[1]).toMatchObject({ text: '\uD83D\uDE00AB' })
    controller.dispose()
  })

  it('resyncs mismatched overlap without losing other live parts or inline approval', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const part: HarnessMessagePart = { id: 'text', type: 'text', text: 'AB', state: 'streaming', startedAt: 10 }
    snapshots.set('a', { ...session('a'), messages: [{ id: 'persisted', role: 'assistant', runId: 'run', content: 'AB', parts: [part], createdAt: 11 }], activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    const tool: HarnessMessagePart = { id: 'tool', type: 'tool', toolCallId: 'tool-call' }
    emit('message-part', { part: tool }, 'a', 'run')
    emit('permission-request', { requestId: 'approval', title: '执行工具', toolCallId: 'tool-call', runId: 'run' }, 'a', 'run')
    let resolve!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockReturnValueOnce(new Promise(done => { resolve = done }))
    emit('message-part', { partId: 'text', delta: 'CD', offset: 1 }, 'a', 'run')
    expect(controller.getSnapshot().messages[0].content).toBe('AB')
    resolve({ ...snapshots.get('a')!, messages: [{ ...snapshots.get('a')!.messages[0], content: 'ABCD', parts: [{ ...part, text: 'ABCD' }] }] })
    await vi.waitFor(() => expect(controller.getSnapshot().messages[0].content).toBe('ABCD'))
    expect(controller.getSnapshot().messages[0].parts?.[1]).toEqual(tool)
    expect(controller.getSnapshot().permission).toMatchObject({ requestId: 'approval', toolCallId: 'tool-call', runId: 'run' })
    controller.dispose()
  })

  it('rejects gap resync from the previous session after navigation and ignores parts for a closed run', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const part: HarnessMessagePart = { id: 'text', type: 'text', text: 'A', state: 'streaming', startedAt: 10 }
    snapshots.set('a', { ...session('a'), messages: [{ id: 'persisted', role: 'assistant', runId: 'run', content: 'A', parts: [part], createdAt: 11 }], activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    let resolve!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockReturnValueOnce(new Promise(done => { resolve = done }))
    emit('message-part', { partId: 'text', delta: 'C', offset: 2 }, 'a', 'run')
    await controller.open('b')
    resolve({ ...snapshots.get('a')!, messages: [{ ...snapshots.get('a')!.messages[0], content: 'ABC', parts: [{ ...part, text: 'ABC' }] }] })
    await Promise.resolve(); await Promise.resolve()
    expect(controller.getSnapshot().session?.id).toBe('b'); expect(controller.getSnapshot().messages).toEqual([])
    emit('run-start', { startedAt: 20 }, 'b', 'b-run', { sequence: 1 })
    emit('message-part', { part }, 'b', 'b-run', { sequence: 2 })
    emit('status', { state: 'idle' }, 'b', 'b-run', { sequence: 3 })
    const reads = vi.mocked(host.getSession).mock.calls.length
    emit('message-part', { partId: 'text', delta: 'late', offset: 1 }, 'b', 'b-run', { sequence: 4 })
    expect(host.getSession).toHaveBeenCalledTimes(reads)
    expect(controller.getSnapshot().messages.at(-1)?.content).toBe('A')
    controller.dispose()
  })

  it('keeps image reads scoped to their captured session after switching tasks', async () => {
    const { controller, host } = fixture()
    const image = { path: 'assets/mira.png', mediaType: 'image/png', dataBase64: 'aW1hZ2U=', byteLength: 5 }
    host.readImage = vi.fn(async () => image)
    await controller.start()
    await controller.open('b')
    await expect(controller.readImageFor('a', 'assets/mira.png')).resolves.toEqual(image)
    expect(host.readImage).toHaveBeenCalledWith('a', 'assets/mira.png')
    expect(host.readFile).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('reports a missing image-preview capability instead of falling back to binary text', async () => {
    const { controller, host } = fixture()
    await expect(controller.readImageFor('a', 'assets/mira.png')).rejects.toThrow('当前宿主不支持图片预览')
    expect(host.readFile).not.toHaveBeenCalled()
  })

  it('does not present a completed session with failed activity as fully successful', () => {
    const completed = session('a')
    completed.status = 'completed'
    completed.toolCalls = [{ id: 'write', tool: 'write', status: 'failed', createdAt: 2 }]
    expect(getPilotTaskState({ sessions: [], projects: [], providers: [], messages: [{ id: 'answer', role: 'assistant', content: '', createdAt: 1, run: { status: 'completed', startedAt: 1, completedAt: 3, durationMs: 2, activities: [] } }], session: completed, running: false })).toBe('部分操作未完成')
    expect(getPilotTaskState({ sessions: [], projects: [], providers: [], messages: [{ id: 'answer', role: 'assistant', content: '', createdAt: 1, run: { status: 'failed', startedAt: 1, completedAt: 3, durationMs: 2, activities: [] } }], session: completed, running: false })).toBe('执行失败')
  })

  it('shows user confirmation before a still-running task', () => {
    const waiting = { ...session('a'), pendingInteraction: { id: 'review', kind: 'plan-review' as const, status: 'waiting' as const, planId: 'plan', createdAt: 1 } }
    expect(getPilotTaskState({ sessions: [], projects: [], providers: [], messages: [], session: waiting, running: true })).toBe('等待确认')
    expect(getPilotTaskState({ sessions: [], projects: [], providers: [], messages: [], session: session('a'), running: true, permission: { sessionId: 'a', requestId: 'permission', title: '写入', detail: 'file.md' } })).toBe('等待确认')
  })

  it('renders the controlled stream for both the optimistic and authoritative assistant node', () => {
    expect(shouldRenderPilotStream('optimistic', true, 'stream-1')).toBe(true)
    expect(shouldRenderPilotStream('stream-1', false, 'stream-1')).toBe(true)
    expect(shouldRenderPilotStream('other', false, 'stream-1')).toBe(false)
  })

  it('maps task states to stable visual tones', () => {
    expect(getPilotTaskTone('正在执行')).toBe('running')
    expect(getPilotTaskTone('等待确认')).toBe('waiting')
    expect(getPilotTaskTone('最近任务已完成')).toBe('completed')
    expect(getPilotTaskTone('部分操作未完成')).toBe('partial')
    expect(getPilotTaskTone('执行失败')).toBe('failed')
    expect(getPilotTaskTone('已停止，可继续发送')).toBe('stopped')
    expect(getPilotTaskTone('等待下一步')).toBe('idle')
  })

  it('releases the old event subscription and restores a pending plan after remount', async () => {
    const { controller, host, snapshots, unsubscribe } = fixture()
    snapshots.set('a', { ...session('a'), pendingInteraction: { id: 'review', kind: 'plan-review', status: 'waiting', planId: 'plan', createdAt: 1 } })
    await controller.start()
    controller.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()

    const remounted = new PilotController(host)
    await remounted.start()
    expect(remounted.getSnapshot().session?.pendingInteraction).toMatchObject({ id: 'review', status: 'waiting' })
    expect(host.onEvent).toHaveBeenCalledTimes(2)
    remounted.dispose()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('routes a background terminal through its owning session after switching tasks', async () => {
    const { controller, host } = fixture()
    await controller.start()
    await controller.open('b')
    await controller.writeTerminalFor('a', 'terminal-a', 'pwd\n')
    await controller.resizeTerminalFor('a', 'terminal-a', 80, 24)
    expect(host.writeTerminal).toHaveBeenCalledWith('a', 'terminal-a', 'pwd\n')
    expect(host.resizeTerminal).toHaveBeenCalledWith('a', 'terminal-a', 80, 24)
    controller.dispose()
  })

  it('routes file watch changes outside chat state and supports captured lifecycle and optional hosts', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    expect(controller.supportsWorkspaceWatch).toBe(false)
    await expect(controller.watchFilesFor('a', [''])).rejects.toThrow('不支持文件自动刷新')
    await expect(controller.unwatchFilesFor('a', 'old')).resolves.toBeUndefined()
    host.watchFiles = vi.fn(async () => ({ watchId: 'watch-a' }))
    host.unwatchFiles = vi.fn(async () => undefined)
    expect(controller.supportsWorkspaceWatch).toBe(true)
    await expect(controller.watchFilesFor('a', ['', 'src'])).resolves.toEqual({ watchId: 'watch-a' })
    await controller.open('b')
    const fileListener = vi.fn(), stateListener = vi.fn(), terminalListener = vi.fn()
    controller.onWorkspaceFilesChanged(fileListener)
    controller.onTerminalEvent(terminalListener)
    controller.subscribe(stateListener)
    const snapshot = controller.getSnapshot()
    emit('workspace-files-changed', { grantId: 'grant', watchId: 'watch-a', directory: '/private/tmp/project', paths: ['src'] }, 'a')
    expect(fileListener).toHaveBeenCalledWith({ sessionId: 'a', watchId: 'watch-a', directory: '/private/tmp/project', paths: ['src'] })
    expect(controller.getSnapshot()).toBe(snapshot)
    expect(stateListener).not.toHaveBeenCalled()
    expect(terminalListener).not.toHaveBeenCalled()
    emit('workspace-files-changed', { watchId: 9, directory: '/tmp', paths: [''] })
    expect(fileListener).toHaveBeenCalledOnce()
    await controller.unwatchFilesFor('a', 'watch-a')
    expect(host.unwatchFiles).toHaveBeenCalledWith('a', 'watch-a')
    controller.dispose()
  })

  it('keeps captured browser operations attached to their owning task after switching sessions', async () => {
    const { controller, host } = fixture()
    await controller.start()
    await controller.open('b')
    const bounds = { x: 20, y: 40, width: 400, height: 500 }
    await controller.navigateBrowserFor('a', 'https://example.com', bounds)
    await controller.controlBrowserFor('a', 'hide')
    await controller.setBrowserBoundsFor('a', bounds)
    expect(host.navigateBrowser).toHaveBeenCalledWith('a', 'https://example.com', bounds)
    expect(host.controlBrowser).toHaveBeenCalledWith('a', 'hide')
    expect(host.setBrowserBounds).toHaveBeenCalledWith('a', bounds)
    controller.newConversation()
    await controller.closeBrowserFor('a')
    expect(host.controlBrowser).toHaveBeenLastCalledWith('a', 'close')
    controller.dispose()
  })

  it('only projects status for assistant messages', () => {
    expect(projectPilotMessage({ id: 'user', role: 'user', content: 'hello', createdAt: 1 })).not.toHaveProperty('status')
    expect(projectPilotMessage({ id: 'stream-1', role: 'assistant', content: 'world', createdAt: 1 })).toMatchObject({ status: { type: 'running' } })
  })

  it('projects deltas, then replaces the stream with the authoritative session', async () => {
    const { controller, snapshots, emit } = fixture()
    await controller.start()
    emit('message-delta', { delta: '正在' })
    emit('message-delta', { delta: '处理' })
    expect(controller.getSnapshot().messages[0].content).toBe('正在处理')
    snapshots.set('a', session('a', '最终结果'))
    emit('message-complete', {})
    await vi.waitFor(() => expect(controller.getSnapshot().messages[0].content).toBe('最终结果'))
    controller.dispose()
  })

  it('keeps permission pending until the host call resolves', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    emit('permission-request', { requestId: 'req', title: '写入', detail: 'file.md' })
    let resolve!: () => void
    vi.mocked(host.respondPermission).mockImplementation(() => new Promise<void>(done => { resolve = done }))
    const response = controller.permission(true)
    expect(controller.getSnapshot().permission?.requestId).toBe('req')
    resolve()
    await response
    expect(host.respondPermission).toHaveBeenCalledWith('req', true)
    expect(controller.getSnapshot().permission).toBeUndefined()
    controller.dispose()
  })

  it('clears an expired tool approval while the same run continues and ignores a later approval click', async () => {
    const { controller, host, snapshots, emit } = fixture()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    emit('permission-request', { requestId: 'expired', title: '写入文件', toolCallId: 'tool', runId: 'run' }, 'a', 'run')
    emit('tool-call', { id: 'tool', status: 'cancelled', approvalRequestId: 'expired', runId: 'run', error: '权限确认超时' }, 'a', 'run')
    expect(controller.getSnapshot().permission).toBeUndefined()
    expect(controller.getSnapshot().pendingPermissions.a).toBeUndefined()
    expect(controller.getSnapshot().running).toBe(true)
    await controller.permission(true)
    expect(host.respondPermission).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('clears a matching cancelled tool approval before Stop publishes its terminal run status', async () => {
    const { controller, snapshots, emit } = fixture()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    emit('permission-request', { requestId: 'stopped', title: '执行命令', toolCallId: 'tool', runId: 'run' }, 'a', 'run')
    emit('tool-call', { id: 'tool', status: 'cancelled', approvalRequestId: 'stopped', runId: 'run', error: '运行已停止' }, 'a', 'run')
    expect(controller.getSnapshot().permission).toBeUndefined()
    expect(controller.getSnapshot().pendingPermissions.a).toBeUndefined()
    emit('status', { state: 'stopped' }, 'a', 'run')
    expect(controller.getSnapshot().running).toBe(false)
    controller.dispose()
  })

  it.each(['ok', 'failed', 'cancelled'])('only clears the exact request, tool and run when a tool becomes %s', async status => {
    const { controller, snapshots, emit } = fixture()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    const request = { requestId: 'new', title: '新的请求', toolCallId: 'new-tool', runId: 'run' }
    emit('permission-request', request, 'a', 'run')
    for (const payload of [
      { id: 'old-tool', approvalRequestId: 'old', runId: 'run' },
      { id: 'new-tool', approvalRequestId: 'old', runId: 'run' },
      { id: 'old-tool', approvalRequestId: 'new', runId: 'run' },
      { id: 'new-tool', approvalRequestId: 'new', runId: 'old-run' },
      { id: 'new-tool', runId: 'run' },
    ]) {
      emit('tool-call', { ...payload, status }, 'a', 'run')
      expect(controller.getSnapshot().permission?.requestId).toBe('new')
      expect(controller.getSnapshot().pendingPermissions.a?.requestId).toBe('new')
    }
    emit('tool-call', { id: 'new-tool', approvalRequestId: 'new', runId: 'run', status }, 'a', 'run')
    expect(controller.getSnapshot().permission).toBeUndefined()
    expect(controller.getSnapshot().pendingPermissions.a).toBeUndefined()
    controller.dispose()
  })

  it('clears only a matching background tool approval and preserves the active session request', async () => {
    const { controller, snapshots, emit } = fixture()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'run-a', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    emit('permission-request', { requestId: 'a-request', title: 'A请求', toolCallId: 'tool-a', runId: 'run-a' }, 'a', 'run-a')
    emit('run-start', { startedAt: 20 }, 'b', 'run-b')
    emit('permission-request', { requestId: 'b-request', title: 'B请求', toolCallId: 'tool-b', runId: 'run-b' }, 'b', 'run-b')
    emit('tool-call', { id: 'tool-a', approvalRequestId: 'a-request', runId: 'run-b', status: 'cancelled' }, 'b', 'run-b')
    expect(controller.getSnapshot().pendingPermissions.b?.requestId).toBe('b-request')
    emit('tool-call', { id: 'tool-b', approvalRequestId: 'b-request', runId: 'run-b', status: 'cancelled' }, 'b', 'run-b')
    expect(controller.getSnapshot().pendingPermissions.b).toBeUndefined()
    expect(controller.getSnapshot().permission?.requestId).toBe('a-request')
    expect(controller.getSnapshot().pendingPermissions.a?.requestId).toBe('a-request')
    controller.dispose()
  })

  it('does not restore an expired approval from an older pending query during session reopen', async () => {
    const { controller, host, snapshots, emit } = fixture()
    snapshots.set('a', { ...session('a'), activeRun: { id: 'run', startedAt: 10, activities: [], subtasks: [] } })
    await controller.start()
    const request = { sessionId: 'a', requestId: 'expired', title: '过期请求', detail: '', toolCallId: 'tool', runId: 'run' }
    emit('permission-request', request, 'a', 'run')
    let resolve!: (value: Awaited<ReturnType<PilotHost['listPendingPermissions']>>) => void
    vi.mocked(host.listPendingPermissions).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const opening = controller.open('a')
    emit('tool-call', { id: 'tool', approvalRequestId: 'expired', runId: 'run', status: 'cancelled' }, 'a', 'run')
    resolve([request]); await opening
    expect(controller.getSnapshot().permission).toBeUndefined()
    expect(controller.getSnapshot().pendingPermissions.a).toBeUndefined()
    controller.dispose()
  })

  it('binds new tasks to the selected project and never creates one implicitly on send', async () => {
    const { controller, host, snapshots } = fixture()
    await controller.start()
    snapshots.set('project-session', { ...session('project-session'), projectId: 'project', workingDirectory: '/tmp/mira-project' })
    vi.mocked(host.createSession).mockResolvedValueOnce(snapshots.get('project-session')!)
    expect(await controller.create('project')).toBe(true)
    expect(host.createSession).toHaveBeenCalledWith('project')
    expect(controller.getSnapshot().session?.workingDirectory).toBe('/tmp/mira-project')
    expect(await controller.create('missing')).toBe(false)
    expect(host.createSession).toHaveBeenCalledTimes(1)
    controller.dispose()

    const empty = fixture()
    vi.mocked(empty.host.listSessions).mockResolvedValueOnce([])
    await empty.controller.start()
    expect(await empty.controller.send('不要自动创建')).toBe(false)
    expect(empty.host.createSession).not.toHaveBeenCalled()
    expect(empty.host.runMessage).not.toHaveBeenCalled()
    empty.controller.dispose()
  })

  it('opens only the persisted active session directory and reports shell errors', async () => {
    const { controller, host, snapshots } = fixture()
    snapshots.set('a', { ...session('a'), workingDirectory: '/tmp/mira-project' })
    snapshots.set('b', { ...session('b'), workingDirectory: '/tmp/another-project' })
    await controller.start()
    await controller.openProjectDirectory()
    expect(host.openSessionProject).toHaveBeenCalledWith('a')
    vi.mocked(host.openSessionProject).mockResolvedValueOnce('目录无法打开')
    await controller.openProjectDirectory()
    expect(controller.getSnapshot().error).toBe('目录无法打开')
    await controller.open('b')
    await controller.openProjectDirectory()
    expect(host.openSessionProject).toHaveBeenLastCalledWith('b')
    controller.dispose()

    const empty = fixture()
    vi.mocked(empty.host.listSessions).mockResolvedValueOnce([])
    await empty.controller.start()
    await empty.controller.openProjectDirectory()
    expect(empty.host.openSessionProject).not.toHaveBeenCalled()
    empty.controller.dispose()
  })

  it('ignores a directory-open failure after switching sessions', async () => {
    const { controller, host, snapshots } = fixture()
    snapshots.set('a', { ...session('a'), workingDirectory: '/tmp/mira-project' })
    await controller.start()
    let reject!: (error: Error) => void
    vi.mocked(host.openSessionProject).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    const opening = controller.openProjectDirectory()
    await controller.open('b')
    reject(new Error('旧会话目录不可用'))
    await opening
    expect(controller.getSnapshot().error).toBeUndefined()
    controller.dispose()
  })

  it('prevents duplicate directory opens while the system call is pending', async () => {
    const { controller, host, snapshots } = fixture()
    snapshots.set('a', { ...session('a'), workingDirectory: '/tmp/mira-project' })
    await controller.start()
    let resolve!: (value: string) => void
    vi.mocked(host.openSessionProject).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const opening = controller.openProjectDirectory()
    await controller.openProjectDirectory()
    expect(host.openSessionProject).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().openingProjectDirectory).toBe(true)
    resolve('')
    await opening
    expect(controller.getSnapshot().openingProjectDirectory).toBe(false)
    controller.dispose()
  })

  it('restores the selected session model instead of carrying over another session model', async () => {
    const { controller, host, snapshots } = fixture()
    snapshots.set('b', { ...session('b'), modelProviderId: 'missing', modelId: 'unavailable' })
    await controller.start()
    expect(controller.getSnapshot().selection).toEqual({ providerId: 'provider', modelId: 'model' })
    await controller.open('b')
    expect(controller.getSnapshot().selection).toBeUndefined()
    snapshots.set('b', { ...session('b'), modelProviderId: 'provider', modelId: 'model' })
    await controller.open('b')
    expect(controller.getSnapshot().selection).toEqual({ providerId: 'provider', modelId: 'model' })
    expect(host.getSession).toHaveBeenCalledWith('b')
    controller.dispose()
  })

  it('shows rejected permission outcome after reopening the session', async () => {
    const { controller, host, snapshots, emit } = fixture()
    await controller.start()
    emit('permission-request', { requestId: 'denied', title: '写入', detail: 'draft.md' })
    await controller.permission(false)
    expect(host.respondPermission).toHaveBeenCalledWith('denied', false)
    snapshots.set('a', { ...session('a'), status: 'failed', toolCalls: [{ id: 'write', tool: 'write', target: 'draft.md', status: 'failed', error: '用户拒绝了操作', createdAt: 1 }] })
    emit('status', { state: 'failed' })
    await vi.waitFor(() => expect(controller.getSnapshot().session?.status).toBe('failed'))
    await controller.open('b')
    await controller.open('a')
    expect(controller.getSnapshot().permission).toBeUndefined()
    expect(controller.getSnapshot().session?.toolCalls[0]).toMatchObject({ status: 'failed', error: '用户拒绝了操作' })
    controller.dispose()
  })

  it('passes plan mode to the host and can send again after a stopped run', async () => {
    const { controller, host, snapshots, emit } = fixture()
    await controller.start()
    expect(await controller.send('先计划', true)).toBe(true)
    expect(host.runMessage).toHaveBeenCalledWith('a', '先计划', { providerId: 'provider', modelId: 'model' }, true, [])
    snapshots.set('a', { ...session('a'), messages: [{ id: 'reply', role: 'assistant', content: '已停止', createdAt: 1, run: { status: 'stopped', startedAt: 1, completedAt: 2, durationMs: 1, activities: [] } }] })
    emit('status', { state: 'completed' })
    await vi.waitFor(() => expect(controller.getSnapshot().running).toBe(false))
    await controller.send('继续处理')
    expect(host.runMessage).toHaveBeenLastCalledWith('a', '继续处理', { providerId: 'provider', modelId: 'model' }, false, [])
    controller.dispose()
  })

  it.each([true, false])('returns the original send result (%s) without changing the newly selected task', async success => {
    const { controller, host, emit } = fixture()
    await controller.start()
    let finishRun!: () => void
    vi.mocked(host.runMessage).mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
      finishRun = () => { if (success) resolve(); else reject(new Error('A 发送失败')) }
    }))
    const sending = controller.send('A 的消息')
    expect(controller.getSnapshot().running).toBe(true)
    await controller.open('b')
    emit('message-delta', { delta: 'B 的流消息' }, 'b')
    emit('error', { message: 'B 自己的错误' }, 'b')
    const currentTask = controller.getSnapshot()
    finishRun()
    expect(await sending).toBe(success)
    expect(controller.getSnapshot()).toBe(currentTask)
    expect(controller.getSnapshot()).toMatchObject({ session: { id: 'b' }, running: true, messages: [{ content: 'B 的流消息' }], error: 'B 自己的错误' })
    expect(host.getSession).toHaveBeenLastCalledWith('b')
    controller.dispose()
  })

  it('submits multi-select and custom clarification answers through the selected session', async () => {
    const { controller, host, snapshots } = fixture()
    snapshots.set('a', { ...session('a'), pendingInteraction: { id: 'question', kind: 'question', status: 'waiting', createdAt: 1, questions: [{ id: 'q1', question: '选哪些', options: [{ label: '资料' }, { label: '代码' }], multiSelect: true }, { id: 'q2', question: '补充', allowCustom: true }] } })
    await controller.start()
    const answers = [{ id: 'q1', selected: ['资料', '代码'] }, { id: 'q2', selected: [], custom: '还要总结' }]
    await controller.answerQuestion(answers)
    expect(host.answerInteraction).toHaveBeenCalledWith('a', 'question', answers, { providerId: 'provider', modelId: 'model' })
    controller.dispose()
  })

  it('restores a pending permission on session open and ignores an older pending query', async () => {
    const { controller, host, emit } = fixture()
    vi.mocked(host.listPendingPermissions).mockResolvedValueOnce([{ sessionId: 'a', requestId: 'stored', title: '写入', detail: 'draft.md' }])
    await controller.start()
    expect(controller.getSnapshot().permission?.requestId).toBe('stored')

    let resolve!: (value: Awaited<ReturnType<PilotHost['listPendingPermissions']>>) => void
    vi.mocked(host.listPendingPermissions).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const opening = controller.open('a')
    emit('permission-request', { requestId: 'new', title: '执行命令', detail: 'npm test' })
    resolve([{ sessionId: 'a', requestId: 'old', title: '旧请求', detail: 'old' }])
    await opening
    expect(controller.getSnapshot().permission?.requestId).toBe('new')
    controller.dispose()
  })

  it('refreshes tool activity without discarding the temporary stream', async () => {
    const { controller, snapshots, emit } = fixture()
    await controller.start()
    emit('message-delta', { delta: '生成中' })
    snapshots.set('a', { ...session('a'), activeRun: { id: 'run', startedAt: 1, activities: [{ id: 'activity', label: '写入摘要', status: 'running', startedAt: 1 }], subtasks: [] }, toolCalls: [{ id: 'tool', tool: 'write', status: 'running', createdAt: 1 }] })
    emit('run-activity', {})
    await vi.waitFor(() => expect(controller.getSnapshot().session?.toolCalls[0]?.tool).toBe('write'))
    expect(controller.getSnapshot().messages[0]?.content).toBe('生成中')
    controller.dispose()
  })

  it('ignores old-session events and stale loads, then unsubscribes on dispose', async () => {
    const { controller, host, emit, unsubscribe } = fixture()
    await controller.start()
    let resolve!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const oldOpen = controller.open('b')
    await controller.open('a')
    resolve(session('b', 'stale'))
    await oldOpen
    emit('message-delta', { delta: 'other' }, 'b')
    expect(controller.getSnapshot().session?.id).toBe('a')
    expect(controller.getSnapshot().messages).toEqual([])
    controller.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
    emit('message-delta', { delta: 'late' })
    expect(controller.getSnapshot().messages).toEqual([])
  })

  it('tracks cross-session running, unread and pending-permission badges', async () => {
    const { controller, emit } = fixture()
    await controller.start()
    emit('status', { state: 'running' }, 'b')
    expect(controller.getSnapshot().runningSessionIds).toEqual(['b'])
    emit('permission-request', { requestId: 'perm-b', title: '写入', detail: 'file.md' }, 'b')
    expect(controller.getSnapshot().pendingPermissions['b']).toMatchObject({ requestId: 'perm-b' })
    expect(controller.getSnapshot().permission).toBeUndefined()
    emit('status', { state: 'completed' }, 'b')
    expect(controller.getSnapshot().runningSessionIds).toEqual([])
    expect(controller.getSnapshot().unreadSessionIds).toEqual(['b'])
    expect(controller.getSnapshot().pendingPermissions['b']).toBeUndefined()
    emit('status', { state: 'failed' }, 'a')
    expect(controller.getSnapshot().unreadSessionIds).toEqual(['b'])
    controller.dispose()
  })

  it('marks a session read when it is opened and notifies the host', async () => {
    const { controller, host, snapshots } = fixture()
    const list = host.listSessions as ReturnType<typeof vi.fn>
    list.mockResolvedValue([{ ...session('b'), unread: true }, session('a')])
    snapshots.set('b', { ...session('b'), unread: true })
    const setSessionUnread = vi.fn(async () => undefined)
    Object.assign(host, { setSessionUnread })
    await controller.start()
    await controller.open('b')
    expect(setSessionUnread).toHaveBeenCalledWith('b', false)
    expect(controller.getSnapshot().unreadSessionIds).not.toContain('b')
    controller.dispose()
  })

  it('renames the active session and updates its header without replacing a stream', async () => {
    const { controller, host, snapshots, emit } = fixture()
    await controller.start()
    emit('message-delta', { delta: '正在处理' })
    const renameSession = vi.fn(async (_id: string, title: string) => { snapshots.set('a', { ...snapshots.get('a')!, title }) })
    Object.assign(host, { renameSession })
    await controller.renameSession('a', '新标题')
    expect(renameSession).toHaveBeenCalledWith('a', '新标题')
    expect(controller.getSnapshot().error).toBeUndefined()
    expect(controller.getSnapshot().session?.title).toBe('新标题')
    expect(controller.getSnapshot().messages.at(-1)?.content).toBe('正在处理')
    controller.dispose()
  })

  it('refreshes the active project after moving a task', async () => {
    const { controller, host, snapshots } = fixture()
    await controller.start()
    Object.assign(host, { moveSession: vi.fn(async (_id: string, projectId: string) => { snapshots.set('a', { ...snapshots.get('a')!, projectId, workingDirectory: '/tmp/next-project' }) }) })
    await controller.moveSession('a', 'project')
    expect(controller.getSnapshot().session).toMatchObject({ projectId: 'project', workingDirectory: '/tmp/next-project' })
    controller.dispose()
  })

  it('reports an inactive move failure in its current navigation but ignores a prepared owner late failure after switching tasks', async () => {
    const { controller, host, snapshots } = fixture()
    const prepared = { ...session('prepared'), draftState: 'prepared' as const }
    snapshots.set(prepared.id, prepared)
    let fail!: (error: Error) => void
    host.moveSession = vi.fn().mockRejectedValueOnce(new Error('当前迁移失败')).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject }))
    await controller.start()
    await expect(controller.moveSession('b', 'project')).resolves.toBeUndefined()
    expect(controller.getSnapshot().error).toBe('当前迁移失败')
    await controller.open(prepared.id)
    const moving = controller.moveSession(prepared.id, 'project')
    await controller.open('b')
    const current = controller.getSnapshot()
    vi.mocked(host.listSessions).mockClear()
    fail(new Error('旧草稿迁移失败'))
    await expect(moving).resolves.toBeUndefined()
    expect(controller.getSnapshot()).toBe(current)
    expect(controller.getSnapshot()).toMatchObject({ session: { id: 'b' }, error: undefined })
    expect(host.listSessions).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('updates global list project facts after a late move without refreshing a newer navigation to the same owner', async () => {
    const { controller, host, snapshots } = fixture()
    const prepared = { ...session('prepared'), projectId: 'old-project', workingDirectory: '/tmp/old-project', draftState: 'prepared' as const }
    snapshots.set(prepared.id, prepared)
    let finish!: () => void
    host.moveSession = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    await controller.start(); await controller.open(prepared.id)
    const moving = controller.moveSession(prepared.id, 'project')
    await controller.open('b'); await controller.open(prepared.id)
    const current = controller.getSnapshot()
    snapshots.set(prepared.id, { ...prepared, projectId: 'project', workingDirectory: '/tmp/next-project' })
    const sessions = [{ ...session('a'), projectId: 'project', title: '最新列表事实' }, session('b')]
    vi.mocked(host.listSessions).mockClear().mockResolvedValueOnce(sessions)
    vi.mocked(host.getSession).mockClear()
    finish(); await expect(moving).resolves.toBeUndefined()
    expect(host.listSessions).toHaveBeenCalledOnce(); expect(controller.getSnapshot().sessions).toEqual(sessions)
    expect(host.getSession).not.toHaveBeenCalled()
    expect(controller.getSnapshot().session).toBe(current.session)
    expect(controller.getSnapshot().messages).toBe(current.messages); expect(controller.getSnapshot().error).toBeUndefined()
    controller.dispose()
  })

  it('returns to a draft without creating or stopping a task and ignores its late load', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    emit('memory-status', { status: 'needs_confirmation', requestId: 'mem-1', content: 'memory' })
    let finishLoad: ((value: HarnessSession) => void) | undefined
    ;(host.getSession as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<HarnessSession>(resolve => { finishLoad = resolve }))
    const opening = controller.open('b')
    controller.newConversation()
    finishLoad!(session('b', 'late response'))
    await opening
    emit('message-delta', { delta: 'background response' })
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, messages: [], permission: undefined, memoryConfirmation: undefined, running: false })
    expect(controller.getSnapshot().selection).toEqual({ providerId: 'provider', modelId: 'model' })
    expect(host.createSession).not.toHaveBeenCalled()
    expect(host.abortRun).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('does not open an older creation after the user starts another draft', async () => {
    const { controller, host } = fixture()
    await controller.start()
    let finishCreate: ((value: HarnessSession) => void) | undefined
    ;(host.createSession as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<HarnessSession>(resolve => { finishCreate = resolve }))
    const creating = controller.create()
    controller.newConversation()
    finishCreate!(session('b'))
    expect(await creating).toBe(false)
    expect(controller.getSnapshot().session).toBeUndefined()
    controller.dispose()
  })

  it('prepares a private attachment owner without creating or publishing an ordinary task', async () => {
    const { controller, host, snapshots } = fixture()
    const prepared = { ...session('prepared'), draftState: 'prepared' as const }
    snapshots.set(prepared.id, prepared)
    host.prepareSession = vi.fn(async () => prepared)
    host.setPreference = vi.fn(async () => undefined)
    await controller.start(); controller.newConversation()
    vi.mocked(host.listSessions).mockClear(); vi.mocked(host.listProjects).mockClear()
    expect(controller.supportsPreparedSessions).toBe(true)
    await expect(controller.prepare('project')).resolves.toBe(true)
    expect(host.prepareSession).toHaveBeenCalledExactlyOnceWith('project')
    expect(host.createSession).not.toHaveBeenCalled()
    expect(host.listSessions).not.toHaveBeenCalled(); expect(host.listProjects).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({ session: { id: prepared.id, draftState: 'prepared' }, sessionLoading: false, messages: [] })
    expect(controller.getSnapshot().sessions.map(item => item.id)).toEqual(['a', 'b'])
    expect(host.setPreference).toHaveBeenLastCalledWith('active-session', null)
    controller.dispose()
  })

  it('refuses unavailable preparation instead of falling back to ordinary creation', async () => {
    const { controller, host } = fixture()
    await controller.start(); controller.newConversation()
    expect(controller.supportsPreparedSessions).toBe(false)
    await expect(controller.prepare()).resolves.toBe(false)
    expect(host.createSession).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: false, error: '当前宿主不支持任务草稿准备' })
    controller.dispose()
  })

  it('keeps preparation single-flight and ignores a late prepared owner after starting another draft', async () => {
    const { controller, host } = fixture()
    let finish!: (value: HarnessSession) => void
    host.prepareSession = vi.fn(() => new Promise(resolve => { finish = resolve }))
    await controller.start(); controller.newConversation()
    vi.mocked(host.getSession).mockClear()
    const preparing = controller.prepare()
    expect(controller.getSnapshot().sessionLoading).toBe(true)
    await expect(controller.prepare()).resolves.toBe(false)
    expect(host.prepareSession).toHaveBeenCalledOnce()
    controller.newConversation()
    finish({ ...session('old-prepared'), draftState: 'prepared' })
    await expect(preparing).resolves.toBe(false)
    expect(host.getSession).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: false, error: undefined })
    controller.dispose()
  })

  it('leaves the original draft available when preparation fails or its navigation guard expires', async () => {
    const { controller, host } = fixture()
    host.prepareSession = vi.fn().mockRejectedValueOnce(new Error('准备失败'))
    await controller.start(); controller.newConversation()
    await expect(controller.prepare()).resolves.toBe(false)
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: false, error: '准备失败' })
    let current = true
    vi.mocked(host.prepareSession).mockImplementationOnce(async () => { current = false; return { ...session('stale'), draftState: 'prepared' } })
    controller.newConversation()
    await expect(controller.prepare(undefined, () => current)).resolves.toBe(false)
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: false, error: undefined })
    await expect(controller.prepare('missing')).resolves.toBe(false)
    expect(host.prepareSession).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot().error).toBe('所选项目目录不可用，请重新选择')
    controller.dispose()
  })

  it('rejects a visible session returned for draft preparation', async () => {
    const { controller, host } = fixture()
    host.prepareSession = vi.fn(async () => session('ordinary'))
    await controller.start(); controller.newConversation()
    vi.mocked(host.getSession).mockClear()
    await expect(controller.prepare()).resolves.toBe(false)
    expect(host.getSession).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: false, error: '任务草稿准备结果无效' })
    controller.dispose()
  })

  it('keeps a loading task separate from a new draft and refuses implicit creation', async () => {
    const { controller, host } = fixture()
    await controller.start()
    let finishLoad: ((value: HarnessSession) => void) | undefined
    ;(host.getSession as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<HarnessSession>(resolve => { finishLoad = resolve }))
    const opening = controller.open('b')
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: true })
    expect(await controller.create()).toBe(false)
    expect(host.createSession).not.toHaveBeenCalled()
    finishLoad!(session('b', 'existing task'))
    await opening
    expect(controller.getSnapshot()).toMatchObject({ session: { id: 'b' }, sessionLoading: false })
    controller.newConversation()
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: false })
    controller.dispose()
  })

  it('clears loading on failure and ignores an older failure after switching tasks', async () => {
    const { controller, host } = fixture()
    await controller.start()
    ;(host.getSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('任务读取失败'))
    await controller.open('b')
    expect(controller.getSnapshot()).toMatchObject({ sessionLoading: false, error: '任务读取失败' })
    let rejectLoad: ((error: Error) => void) | undefined
    ;(host.getSession as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<HarnessSession>((_resolve, reject) => { rejectLoad = reject }))
    const opening = controller.open('b')
    controller.newConversation()
    rejectLoad!(new Error('旧请求失败'))
    await opening
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: false, error: undefined })
    controller.dispose()
  })

  it.each(['failed', 'cancelled'] as const)('retains the displayed task and its queue when a guarded opening is %s', async outcome => {
    const { controller, host, snapshots } = fixture()
    snapshots.set('a', session('a', '原任务内容'))
    const queue: HarnessMessageQueueSnapshot = { sessionId: 'a', revision: 1, items: [], paused: 'stopped' }
    host.getMessageQueue = vi.fn(async id => id === 'a' ? queue : { sessionId: id, revision: 0, items: [] })
    await controller.start()
    const previous = controller.getSnapshot()
    let finish!: (value: HarnessSession) => void
    let fail!: (cause: Error) => void
    let current = true
    vi.mocked(host.getSession).mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject }))
    const opening = controller.open('b', () => current)
    expect(controller.getSnapshot()).toMatchObject({ session: previous.session, messages: previous.messages, selection: previous.selection, queue, sessionLoading: true })
    if (outcome === 'failed') fail(new Error('任务读取失败'))
    else { current = false; finish(session('b', '已取消的任务')) }
    expect(await opening).toBe(false)
    expect(controller.getSnapshot()).toMatchObject({ session: previous.session, messages: previous.messages, selection: previous.selection, queue, sessionLoading: false })
    expect(controller.getSnapshot().error).toBe(outcome === 'failed' ? '任务读取失败' : undefined)
    controller.dispose()
  })

  it('preserves the active live-part cursor after a guarded task opening fails', async () => {
    const { controller, host, snapshots, emit } = fixture()
    const part: HarnessMessagePart = { id: 'text', type: 'text', text: '旧文', state: 'streaming', startedAt: 10 }
    snapshots.set('a', { ...session('a'), activeRun: { id: 'run', messageId: 'reply', startedAt: 10, activities: [], subtasks: [] }, messages: [{ id: 'reply', role: 'assistant', runId: 'run', content: '旧文', parts: [part], createdAt: 10 }] })
    await controller.start()
    emit('message-part', { partId: 'text', delta: '新增', offset: 2 }, 'a', 'run')
    expect(controller.getSnapshot().messages[0].content).toBe('旧文新增')
    let fail!: (cause: Error) => void
    vi.mocked(host.getSession).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    const opening = controller.open('b', () => true)
    fail(new Error('任务读取失败'))
    expect(await opening).toBe(false)
    emit('run-activity', {}, 'a', 'run')
    await vi.waitFor(() => expect(host.listSessions).toHaveBeenCalledTimes(2))
    expect(controller.getSnapshot().messages[0].content).toBe('旧文新增')
    expect(controller.getSnapshot().messages[0].parts?.[0]).toMatchObject({ text: '旧文新增' })
    controller.dispose()
  })

  it('settles a successful guarded opening without waiting for best-effort unread persistence', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    emit('status', { state: 'completed' }, 'b')
    let finish!: () => void
    const unreadWrite = new Promise<void>(resolve => { finish = resolve })
    host.setSessionUnread = vi.fn(() => unreadWrite)
    let settled: boolean | undefined
    const opening = controller.open('b', () => true)
    void opening.then(value => { settled = value })
    await vi.waitFor(() => expect(settled).toBe(true), { timeout: 100 })
    expect(controller.getSnapshot()).toMatchObject({ session: { id: 'b' }, sessionLoading: false })
    expect(controller.getSnapshot().unreadSessionIds).not.toContain('b')
    expect(host.setSessionUnread).toHaveBeenCalledWith('b', false)
    finish()
    expect(await opening).toBe(true)
    controller.dispose()
  })

  it('notifies successful session deletion before a subsequent list refresh can fail', async () => {
    const { controller, host } = fixture()
    await controller.start()
    let finish!: () => void
    host.deleteSession = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    vi.mocked(host.listSessions).mockRejectedValueOnce(new Error('列表刷新失败'))
    const deleted = vi.fn()
    const unsubscribe = controller.onSessionDeleted(deleted)
    const deleting = controller.deleteSession('b')
    expect(deleted).not.toHaveBeenCalled()
    finish()
    await expect(deleting).rejects.toThrow('列表刷新失败')
    expect(deleted).toHaveBeenCalledExactlyOnceWith('b')
    unsubscribe()
    host.deleteSession = vi.fn(async () => undefined)
    await controller.deleteSession('b')
    expect(deleted).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('does not publish deletion or change the current task when deletion fails', async () => {
    const { controller, host } = fixture()
    await controller.start()
    const previous = controller.getSnapshot()
    host.deleteSession = vi.fn(async () => { throw new Error('删除失败') })
    const deleted = vi.fn()
    controller.onSessionDeleted(deleted)
    await expect(controller.deleteSession('a')).rejects.toThrow('删除失败')
    expect(deleted).not.toHaveBeenCalled()
    expect(host.listSessions).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot()).toBe(previous)
    controller.dispose()
  })

  it('leaves a deleted active task before notifying history, even if the following refresh fails', async () => {
    const { controller, host } = fixture()
    await controller.start()
    host.deleteSession = vi.fn(async () => undefined)
    let fail!: (cause: Error) => void
    vi.mocked(host.listSessions).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    const deletedCurrent: (string | undefined)[] = []
    controller.onSessionDeleted(() => { deletedCurrent.push(controller.getSnapshot().session?.id) })
    const deleting = controller.deleteSession('a')
    await vi.waitFor(() => expect(fail).toBeTypeOf('function'))
    expect(deletedCurrent).toEqual([undefined])
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: false, messages: [] })
    fail(new Error('列表刷新失败'))
    await expect(deleting).rejects.toThrow('列表刷新失败')
    expect(controller.getSnapshot().session).toBeUndefined()
    controller.dispose()
  })

  it('does not override a user switch while a deleted task awaits list refresh', async () => {
    const { controller, host, snapshots } = fixture()
    snapshots.set('c', session('c'))
    await controller.start()
    host.deleteSession = vi.fn(async () => undefined)
    let finish!: (value: Awaited<ReturnType<PilotHost['listSessions']>>) => void
    vi.mocked(host.listSessions).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const deleting = controller.deleteSession('a')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(await controller.open('b', () => true)).toBe(true)
    finish([session('c'), session('b')])
    await deleting
    expect(controller.getSnapshot().session?.id).toBe('b')
    expect(host.getSession).not.toHaveBeenCalledWith('c')
    controller.dispose()
  })

  it('cancels a deleted guarded load before notification without abandoning the displayed task', async () => {
    const { controller, host } = fixture()
    await controller.start()
    let finish!: (value: HarnessSession) => void
    vi.mocked(host.getSession).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const opening = controller.open('b', () => true)
    host.deleteSession = vi.fn(async () => undefined)
    vi.mocked(host.listSessions).mockResolvedValueOnce([session('a')])
    const deletedLoading: (boolean | undefined)[] = []
    controller.onSessionDeleted(() => { deletedLoading.push(controller.getSnapshot().sessionLoading) })
    await controller.deleteSession('b')
    expect(deletedLoading).toEqual([false])
    expect(controller.getSnapshot()).toMatchObject({ session: { id: 'a' }, sessionLoading: false })
    finish(session('b', '已删除的晚到内容'))
    expect(await opening).toBe(false)
    expect(controller.getSnapshot().session?.id).toBe('a')
    controller.dispose()
  })

  it('keeps a deleted task absent when opening its replacement fails', async () => {
    const { controller, host } = fixture()
    await controller.start()
    host.deleteSession = vi.fn(async () => undefined)
    vi.mocked(host.listSessions).mockResolvedValueOnce([session('b')])
    vi.mocked(host.getSession).mockRejectedValueOnce(new Error('替代任务读取失败'))
    await controller.deleteSession('a')
    expect(controller.getSnapshot()).toMatchObject({ session: undefined, sessionLoading: false, messages: [], error: '替代任务读取失败' })
    controller.dispose()
  })

  it('navigates through the host and reports an unavailable navigation capability', async () => {
    const { controller, host } = fixture()
    await controller.navigate('/settings/mcp')
    expect(controller.getSnapshot().error).toBe('当前宿主不支持该操作')
    const navigate = vi.fn(async () => undefined)
    Object.assign(host, { navigate })
    await controller.navigate('/workspace/automations')
    expect(navigate).toHaveBeenCalledWith('/workspace/automations')
    controller.dispose()
  })

  it('prevents repeated regeneration and history edits while a run is pending', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    let finishRun: (() => void) | undefined
    const rerun = vi.fn(() => new Promise<void>(resolve => { finishRun = resolve }))
    const editAndRerun = vi.fn(async () => undefined)
    Object.assign(host, { rerun, editAndRerun })
    const first = controller.rerun()
    await controller.rerun()
    await controller.editAndRerun('user-1', 'changed')
    expect(rerun).toHaveBeenCalledOnce()
    expect(editAndRerun).not.toHaveBeenCalled()
    finishRun!()
    await first
    expect(controller.getSnapshot().running).toBe(false)
    emit('permission-request', { requestId: 'write-confirmation', title: '写入文件', detail: 'result.md' })
    await controller.rerun()
    await controller.editAndRerun('user-1', 'changed')
    expect(rerun).toHaveBeenCalledOnce()
    expect(editAndRerun).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('deletes the active session and falls back to the next remaining session', async () => {
    const { controller, host, snapshots } = fixture()
    await controller.start()
    expect(controller.getSnapshot().session?.id).toBe('a')
    const deleteSession = vi.fn(async () => undefined)
    Object.assign(host, { deleteSession })
    snapshots.delete('a')
    const list = host.listSessions as ReturnType<typeof vi.fn>
    list.mockResolvedValue([session('b')])
    await controller.deleteSession('a')
    expect(deleteSession).toHaveBeenCalledWith('a')
    expect(controller.getSnapshot().session?.id).toBe('b')
    controller.dispose()
  })

  it('clears the current task after deleting the last session', async () => {
    const { controller, host } = fixture()
    await controller.start()
    Object.assign(host, { deleteSession: vi.fn(async () => undefined) })
    ;(host.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([])
    await controller.deleteSession('a')
    expect(controller.getSnapshot()).toMatchObject({ sessions: [], session: undefined, messages: [], permission: undefined, running: false })
    controller.dispose()
  })

  it('reports host operations that are unavailable instead of throwing', async () => {
    const { controller } = fixture()
    await controller.start()
    await controller.renameSession('a', '标题')
    expect(controller.getSnapshot().error).toBe('当前宿主不支持该操作')
    controller.dispose()
  })

  it('surfaces memory confirmations for the active session and clears after response', async () => {
    const { controller, host, emit } = fixture()
    await controller.start()
    emit('memory-status', { status: 'needs_confirmation', requestId: 'mem-1', candidateId: 'cand-1', content: '用户偏好深色主题' })
    expect(controller.getSnapshot().memoryConfirmation).toMatchObject({ requestId: 'mem-1', content: '用户偏好深色主题' })
    emit('memory-status', { status: 'needs_confirmation', requestId: 'mem-other' }, 'b')
    expect(controller.getSnapshot().memoryConfirmation?.requestId).toBe('mem-1')
    const respondMemory = vi.fn(async () => undefined)
    Object.assign(host, { respondMemory })
    await controller.respondMemory('mem-1', true)
    expect(respondMemory).toHaveBeenCalledWith('mem-1', true)
    expect(controller.getSnapshot().memoryConfirmation).toBeUndefined()
    controller.dispose()
  })

  it('restores the last model selection from host preferences and saves new picks', async () => {
    const store = new Map<string, unknown>([['model-selection', { providerId: 'provider', modelId: 'model' }]])
    const { host } = fixture()
    const preferenceHost = {
      ...host,
      getPreference: vi.fn(async (key: string) => store.get(key)),
      setPreference: vi.fn(async (key: string, value: unknown) => { store.set(key, value) }),
    }
    const persisted = new PilotController(preferenceHost)
    await persisted.start()
    expect(persisted.getSnapshot().selection).toEqual({ providerId: 'provider', modelId: 'model' })

    persisted.select({ providerId: 'provider', modelId: 'model-2' })
    expect(preferenceHost.setPreference).toHaveBeenCalledWith('model-selection', { providerId: 'provider', modelId: 'model-2' })

    store.set('model-selection', { providerId: 'ghost', modelId: 'ghost' })
    const fallback = new PilotController(preferenceHost)
    await fallback.start()
    expect(fallback.getSnapshot().selection).toEqual({ providerId: 'provider', modelId: 'model' })
    fallback.dispose()
  })

  it('keeps different per-session model and reasoning choices when switching A to B and back', async () => {
    const { controller, host, snapshots } = fixture()
    const providers = await host.listProviders()
    providers[0].models.push({ id: 'model-2', enabled: true, reasoning: true, contextWindow: 1000 })
    vi.mocked(host.listProviders).mockResolvedValue(providers)
    for (const id of ['a', 'b']) snapshots.set(id, { ...session(id), modelProviderId: 'provider', modelId: 'model' })
    await controller.start()
    const selectionA = { providerId: 'provider', modelId: 'model-2', thinkingLevel: 'high' as const }
    const selectionB = { providerId: 'provider', modelId: 'model', thinkingLevel: 'low' as const }
    controller.select(selectionA)
    await controller.open('b')
    controller.select(selectionB)
    await controller.open('a')
    expect(controller.getSnapshot().selection).toEqual(selectionA)
    await controller.open('b')
    expect(controller.getSnapshot().selection).toEqual(selectionB)
    controller.dispose()
  })

  it('restores per-session reasoning choices after restart and submits the restored level', async () => {
    const { host, snapshots } = fixture()
    for (const id of ['a', 'b']) snapshots.set(id, { ...session(id), modelProviderId: 'provider', modelId: 'model' })
    const preferences = new Map<string, unknown>()
    Object.assign(host, { getPreference: vi.fn(async (key: string) => preferences.get(key)), setPreference: vi.fn(async (key: string, value: unknown) => { preferences.set(key, value) }) })
    const selectionA = { providerId: 'provider', modelId: 'model', thinkingLevel: 'high' as const }
    const selectionB = { providerId: 'provider', modelId: 'model', thinkingLevel: 'off' as const }
    const first = new PilotController(host)
    await first.start()
    first.select(selectionA)
    await first.open('b')
    first.select(selectionB)
    first.dispose()

    const restored = new PilotController(host)
    await restored.start()
    expect(restored.getSnapshot()).toMatchObject({ session: { id: 'b' }, selection: selectionB })
    await restored.open('a')
    expect(restored.getSnapshot().selection).toEqual(selectionA)
    await restored.send('恢复后继续')
    expect(host.runMessage).toHaveBeenLastCalledWith('a', '恢复后继续', selectionA, false, [])
    restored.dispose()
  })

  it('restores a matching legacy session model with the existing global reasoning preference', async () => {
    const { host, snapshots } = fixture()
    snapshots.set('a', { ...session('a'), modelProviderId: 'provider', modelId: 'model' })
    const selection = { providerId: 'provider', modelId: 'model', thinkingLevel: 'high' as const }
    Object.assign(host, { getPreference: vi.fn(async (key: string) => key === 'model-selection' ? selection : undefined) })
    const controller = new PilotController(host)
    await controller.start()
    expect(controller.getSnapshot().selection).toEqual(selection)
    controller.dispose()
  })

  it.each([
    { providerId: 'missing', modelId: 'model', thinkingLevel: 'high' },
    { providerId: 'provider', modelId: 'missing', thinkingLevel: 'high' },
    { providerId: 'provider', modelId: 'model', thinkingLevel: 'xhigh' },
    { providerId: 'provider', modelId: 'model', thinkingLevel: null },
  ])('ignores unavailable or invalid persisted per-session selections: %j', async invalid => {
    const { host, snapshots } = fixture()
    snapshots.set('a', { ...session('a'), modelProviderId: 'provider', modelId: 'model' })
    const preferences = new Map<string, unknown>([['session-model-selection.a', invalid]])
    Object.assign(host, { getPreference: vi.fn(async (key: string) => preferences.get(key)), setPreference: vi.fn(async (key: string, value: unknown) => { preferences.set(key, value) }) })
    const controller = new PilotController(host)
    await controller.start()
    expect(controller.getSnapshot().selection).toEqual({ providerId: 'provider', modelId: 'model' })
    controller.dispose()
  })

  it('restores the selected non-first session after navigating away and remounting', async () => {
    const { host } = fixture()
    const preferences = new Map<string, unknown>()
    Object.assign(host, { getPreference: vi.fn(async (key: string) => preferences.get(key)), setPreference: vi.fn(async (key: string, value: unknown) => { preferences.set(key, value) }) })
    const first = new PilotController(host)
    await first.start()
    await first.open('b')
    first.dispose()
    const restored = new PilotController(host)
    await restored.start()
    expect(restored.getSnapshot().session?.id).toBe('b')
    expect(preferences.get('active-session')).toBe('b')
    restored.dispose()
  })

  it('waits for draft persistence before invoking host navigation', async () => {
    const { controller, host } = fixture()
    const order: string[] = []
    let finishSave: (() => void) | undefined
    Object.assign(host, { navigate: vi.fn(async () => { order.push('navigate') }), setPreference: vi.fn(() => new Promise<void>(resolve => { finishSave = () => { order.push('saved'); resolve() } })) })
    const unregister = controller.registerBeforeNavigation(() => controller.setPreference('composer-drafts', { drafts: { draft: '未发送文字' } }, true))
    const navigating = controller.navigate('/settings/model-config')
    expect(host.navigate).not.toHaveBeenCalled()
    finishSave!()
    await navigating
    expect(order).toEqual(['saved', 'navigate'])
    unregister()
    controller.dispose()
  })

  it('keeps the workbench open if a required pre-navigation draft save fails', async () => {
    const { controller, host } = fixture()
    Object.assign(host, { navigate: vi.fn(async () => undefined), setPreference: vi.fn(async () => { throw new Error('草稿保存失败') }) })
    const unregister = controller.registerBeforeNavigation(() => controller.setPreference('composer-drafts', {}, true))
    await controller.navigate('/workspace/automations')
    expect(host.navigate).not.toHaveBeenCalled()
    expect(controller.getSnapshot().error).toBe('草稿保存失败')
    unregister()
    controller.dispose()
  })

  it('unregisters disposed composer callbacks and preserves best-effort preference writes', async () => {
    const { controller, host } = fixture()
    const save = vi.fn(async () => { throw new Error('已卸载输入区不应调用') })
    Object.assign(host, { navigate: vi.fn(async () => undefined), setPreference: vi.fn(async () => { throw new Error('存储不可用') }) })
    const unregister = controller.registerBeforeNavigation(save)
    unregister()
    await controller.navigate('/settings/mcp')
    expect(save).not.toHaveBeenCalled()
    expect(host.navigate).toHaveBeenCalledWith('/settings/mcp')
    await expect(controller.setPreference('workspace', {})).resolves.toBeUndefined()
    await expect(controller.setPreference('composer-drafts', {}, true)).rejects.toThrow('存储不可用')
    controller.dispose()
  })

  it('preserves an explicit new-task draft instead of reopening the first session', async () => {
    const { host } = fixture()
    const preferences = new Map<string, unknown>()
    Object.assign(host, { getPreference: vi.fn(async (key: string) => preferences.get(key)), setPreference: vi.fn(async (key: string, value: unknown) => { preferences.set(key, value) }) })
    const first = new PilotController(host)
    await first.start()
    first.newConversation()
    first.dispose()
    expect(preferences.get('active-session')).toBeNull()
    const restored = new PilotController(host)
    await restored.start()
    expect(restored.getSnapshot().session).toBeUndefined()
    expect(restored.getSnapshot().sessions).toHaveLength(2)
    restored.dispose()
  })

  it('falls back from a deleted stored selection and does not let startup restoration override a newer draft', async () => {
    const { host } = fixture()
    Object.assign(host, { getPreference: vi.fn(async (key: string) => key === 'active-session' ? 'deleted' : undefined), setPreference: vi.fn(async () => undefined) })
    const fallback = new PilotController(host)
    await fallback.start()
    expect(fallback.getSnapshot().session?.id).toBe('a')
    fallback.dispose()

    let resolvePreference: ((value: string) => void) | undefined
    ;(host.getPreference as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => key === 'active-session' ? new Promise(resolve => { resolvePreference = resolve }) : undefined)
    const raced = new PilotController(host)
    const starting = raced.start()
    await vi.waitFor(() => expect(resolvePreference).toBeTypeOf('function'))
    raced.newConversation()
    resolvePreference!('b')
    await starting
    expect(raced.getSnapshot().session).toBeUndefined()
    raced.dispose()
  })
})
