import { describe, expect, it, vi } from 'vitest'
import type { HarnessEvent, HarnessSession } from '../src/config/harness'
import { getPilotTaskState, getPilotTaskTone, PilotController, projectPilotMessage, shouldRenderPilotStream, type PilotHost } from '../prototypes/harness-react/src/pilot-state'

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
  }
  const controller = new PilotController(host)
  const emit = (type: HarnessEvent['type'], payload: Record<string, unknown>, sessionId = 'a') => listener?.({ sessionId, type, payload })
  return { controller, host, snapshots, emit, unsubscribe }
}

describe('React Harness pilot controller', () => {
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
    await empty.controller.send('不要自动创建')
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
    await controller.send('先计划', true)
    expect(host.runMessage).toHaveBeenCalledWith('a', '先计划', { providerId: 'provider', modelId: 'model' }, true)
    snapshots.set('a', { ...session('a'), messages: [{ id: 'reply', role: 'assistant', content: '已停止', createdAt: 1, run: { status: 'stopped', startedAt: 1, completedAt: 2, durationMs: 1, activities: [] } }] })
    emit('status', { state: 'completed' })
    await vi.waitFor(() => expect(controller.getSnapshot().running).toBe(false))
    await controller.send('继续处理')
    expect(host.runMessage).toHaveBeenLastCalledWith('a', '继续处理', { providerId: 'provider', modelId: 'model' }, false)
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
})
