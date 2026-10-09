import { describe, expect, it, vi } from 'vitest'
import type { HarnessEvent, HarnessSession } from '../src/config/harness'
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
  const emit = (type: HarnessEvent['type'], payload: Record<string, unknown>, sessionId = 'a') => listener?.({ sessionId, type, payload })
  return { controller, host, snapshots, emit, unsubscribe }
}

describe('React Harness pilot controller', () => {
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
