import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageChannel } from 'node:worker_threads'
import type { MiraAppNavigationSnapshot, MiraAppNavigationState } from '../src/platform/appNavigation'
import { FirstPartyHarnessHost } from '../apps/harness-react/src/platform/first-party-host'

function fixture() {
  const port = { onmessage: undefined as ((message: { data: unknown }) => void) | undefined, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
  const host = new FirstPartyHarnessHost(port as unknown as MessagePort)
  const receive = (data: unknown) => port.onmessage?.({ data })
  return { host, port, receive }
}

describe('React Harness prepare-leave handshake', () => {
  it('preserves the Shell search focus request and acknowledges only the matching cancellation contract', () => {
    const { host, port, receive } = fixture(), listener = vi.fn()
    const remove = host.onCommandCenterOpen(listener)
    receive({ type: 'mira:command-center-open', focusRequestId: 'shell-search-1' })
    expect(listener).toHaveBeenLastCalledWith('shell-search-1')
    receive({ type: 'mira:command-center-open' })
    expect(listener).toHaveBeenLastCalledWith(undefined)
    for (const data of [
      { type: 'mira:command-center-open', focusRequestId: '' },
      { type: 'mira:command-center-open', focusRequestId: 1 },
      { type: 'mira:command-center-open', focusRequestId: 'x'.repeat(129) },
      { type: 'mira:command-center-open', focusRequestId: 'search', target: 'arbitrary-selector' },
    ]) receive(data)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(host.dismissCommandCenterFocus('shell-search-1')).toBe(true)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:command-center-dismiss', focusRequestId: 'shell-search-1' })
    expect(host.dismissCommandCenterFocus('')).toBe(false)
    remove(); receive({ type: 'mira:command-center-open', focusRequestId: 'shell-search-2' })
    expect(listener).toHaveBeenCalledTimes(2)
    host.close()
    expect(host.dismissCommandCenterFocus('shell-search-1')).toBe(false)
    expect(port.postMessage).toHaveBeenCalledTimes(1)
  })
  it('prepares an attachment owner through the existing creation grant without changing ordinary creation', async () => {
    const { host, port, receive } = fixture()
    const preparing = host.prepareSession('project')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.session.create', params: { projectId: 'project', prepared: true } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { id: 'prepared', draftState: 'prepared' } })
    await expect(preparing).resolves.toEqual({ id: 'prepared', draftState: 'prepared' })
    const creating = host.createSession('project')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.session.create', params: { projectId: 'project' } })
    receive({ type: 'mira:response', id: '2', ok: true, value: { id: 'ordinary' } })
    await expect(creating).resolves.toEqual({ id: 'ordinary' })
    host.close()
  })
  it('requests a native attachment save with only the captured session and source token', async () => {
    const { host, port, receive } = fixture()
    const saving = host.saveAttachment('session-a', 'mira-attachment:frozen')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.attachments.save', params: { sessionId: 'session-a', path: 'mira-attachment:frozen' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { status: 'canceled' } })
    await expect(saving).resolves.toEqual({ status: 'canceled' })
    const retry = host.saveAttachment('session-a', 'mira-attachment:frozen')
    receive({ type: 'mira:response', id: '2', ok: true, value: { status: 'saved' } })
    await expect(retry).resolves.toEqual({ status: 'saved' })
    host.close()
  })
  it('freezes a workspace reference through the session-bound attachment stage contract', async () => {
    const { host, port, receive } = fixture()
    const staging = host.stageAttachment('session-a', 'src/mira.ts')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.attachments.stage', params: { sessionId: 'session-a', path: 'src/mira.ts' } })
    const reference = { path: 'mira-attachment:frozen', name: 'mira.ts', size: 20 }
    receive({ type: 'mira:response', id: '1', ok: true, value: reference })
    await expect(staging).resolves.toEqual(reference)
    host.close()
  })
  it('sends Git context and token-bound local branch actions without renderer paths or model permissions', async () => {
    const { host, port, receive } = fixture()
    const context = { projectId: 'project', directory: '/fixture/project', isRepository: true, headType: 'branch', branchName: 'main', uncommittedFileCount: 0, branches: [], snapshotToken: 'a'.repeat(64), mutationBlocked: false }
    const reading = host.getGitContext('project')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.git.context', params: { projectId: 'project' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: context }); await expect(reading).resolves.toEqual(context)
    const switching = host.checkoutGitBranch('project', 'topic', context.snapshotToken)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.git.checkout', params: { projectId: 'project', branch: 'topic', snapshotToken: context.snapshotToken } })
    receive({ type: 'mira:response', id: '2', ok: true, value: { ...context, branchName: 'topic' } }); await expect(switching).resolves.toMatchObject({ branchName: 'topic' })
    const creating = host.createGitBranch('project', 'mira/task', context.snapshotToken)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '3', method: 'harness.git.create-branch', params: { projectId: 'project', branch: 'mira/task', snapshotToken: context.snapshotToken } })
    receive({ type: 'mira:response', id: '3', ok: false, error: { message: 'Git 工作区或分支已变化，请刷新后重试' } })
    await expect(creating).rejects.toThrow('Git 工作区或分支已变化'); host.close()
  })
  it('reads Git decorations using the captured session and exact relative paths', async () => {
    const { host, port, receive } = fixture()
    const status = host.getWorkspaceGit('session-a')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.files.git-status', params: { sessionId: 'session-a' } })
    const value = { available: true, entries: [{ path: 'src/mira.ts', status: 'modified' }] }
    receive({ type: 'mira:response', id: '1', ok: true, value })
    await expect(status).resolves.toEqual(value)
    const ignored = host.getWorkspaceIgnored('session-a', ['src/mira.ts', 'node_modules'])
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.files.git-ignored', params: { sessionId: 'session-a', paths: ['src/mira.ts', 'node_modules'] } })
    receive({ type: 'mira:response', id: '2', ok: true, value: ['node_modules'] })
    await expect(ignored).resolves.toEqual(['node_modules'])
    host.close()
  })
  it('reads a bitmap through a session-scoped image method without renderer MIME or size controls', async () => {
    const { host, port, receive } = fixture()
    const reading = host.readImage('session-a', 'assets/mira@2x.png')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.files.read-image', params: { sessionId: 'session-a', path: 'assets/mira@2x.png' } })
    const value = { path: 'assets/mira@2x.png', mediaType: 'image/png', dataBase64: 'aW1hZ2U=', byteLength: 5 }
    receive({ type: 'mira:response', id: '1', ok: true, value })
    await expect(reading).resolves.toEqual(value)
    const failure = host.readImage('session-a', 'assets/missing.png')
    receive({ type: 'mira:response', id: '2', ok: false, error: { message: '文件或目录不存在' } })
    await expect(failure).rejects.toThrow('文件或目录不存在')
    host.close()
  })
  it('sends scoped file watches and editor operations through the first-party contract', async () => {
    const { host, port, receive } = fixture()
    const watching = host.watchFiles('session', ['', 'src'])
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.files.watch', params: { sessionId: 'session', paths: ['', 'src'] } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { watchId: 'watch' } })
    await expect(watching).resolves.toEqual({ watchId: 'watch' })
    const unwatching = host.unwatchFiles('session', 'watch')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.files.unwatch', params: { sessionId: 'session', watchId: 'watch' } })
    receive({ type: 'mira:response', id: '2', ok: true })
    await unwatching
    const editors = host.listEditors(true)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '3', method: 'harness.editors.list', params: { refresh: true } })
    receive({ type: 'mira:response', id: '3', ok: true, value: [{ id: 'code', name: 'Visual Studio Code' }] })
    await expect(editors).resolves.toEqual([{ id: 'code', name: 'Visual Studio Code' }])
    const editing = host.openFileInEditor('session', 'src/main.ts', 'code')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '4', method: 'harness.files.open-editor', params: { sessionId: 'session', path: 'src/main.ts', editorId: 'code' } })
    receive({ type: 'mira:response', id: '4', ok: true })
    await editing
    host.close()
  })
  it('acknowledges the shell only after the registered draft flush completes', async () => {
    const { host, port, receive } = fixture()
    let finishSave: (() => void) | undefined
    host.onPrepareLeave(() => new Promise<void>(resolve => { finishSave = resolve }))
    receive({ type: 'mira:prepare-leave', id: 'leave-1' })
    await Promise.resolve()
    expect(port.postMessage).not.toHaveBeenCalled()
    finishSave!()
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ type: 'mira:leave-ready', id: 'leave-1', ok: true }))
    host.close()
  })

  it('reports a rejected save instead of acknowledging a successful leave', async () => {
    const { host, port, receive } = fixture()
    host.onPrepareLeave(async () => { throw new Error('无法保存草稿') })
    receive({ type: 'mira:prepare-leave', id: 'leave-2' })
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ type: 'mira:leave-ready', id: 'leave-2', ok: false, error: '无法保存草稿' }))
    host.onPrepareLeave(() => Promise.reject())
    receive({ type: 'mira:prepare-leave', id: 'leave-3' })
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ type: 'mira:leave-ready', id: 'leave-3', ok: false, error: '草稿保存失败' }))
    host.close()
  })

  it('does not reply from a disconnected frame after a late save resolves', async () => {
    const { host, port, receive } = fixture()
    let finishSave: (() => void) | undefined
    host.onPrepareLeave(() => new Promise<void>(resolve => { finishSave = resolve }))
    receive({ type: 'mira:prepare-leave', id: 'leave-4' })
    await Promise.resolve()
    host.close()
    finishSave!()
    await Promise.resolve()
    await Promise.resolve()
    expect(port.postMessage).not.toHaveBeenCalled()
    expect(port.close).toHaveBeenCalledOnce()
  })
})

const navigationSnapshot = (): MiraAppNavigationSnapshot => ({ entries: [{ kind: 'conversation', sessionId: 'task-a' }, { kind: 'extensions' }], cursor: 1, detached: false })
const navigationState = (): MiraAppNavigationState => ({ type: 'mira:app-navigation-state', revision: 2, canGoBack: true, canGoForward: false, busy: false, snapshot: navigationSnapshot() })
const navigationCommand = { type: 'mira:app-navigation-command', direction: 'back', expectedRevision: 2 } as const
const channels: Array<() => void> = []
afterEach(() => channels.splice(0).forEach(close => close()))

function navigationChannel() {
  const channel = new MessageChannel()
  const host = new FirstPartyHarnessHost(channel.port1 as unknown as MessagePort)
  const received: unknown[] = []
  channel.port2.on('message', value => received.push(value))
  channels.push(() => { host.close(); channel.port2.close() })
  return { host, send: (value: unknown) => channel.port2.postMessage(value), received }
}

describe('React Harness application navigation port', () => {
  it('delivers commands and publishes state exclusively through the captured MessagePort', async () => {
    const { host, send, received } = navigationChannel()
    const command = vi.fn()
    host.onNavigationCommand(command)
    send(navigationCommand)
    await vi.waitFor(() => expect(command).toHaveBeenCalledExactlyOnceWith(navigationCommand))
    const other = new MessageChannel()
    other.port2.postMessage(navigationCommand)
    other.port1.close(); other.port2.close()
    host.publishNavigationState(navigationState())
    await vi.waitFor(() => expect(received).toEqual([navigationState()]))
    expect(command).toHaveBeenCalledOnce()
  })

  it('ignores malformed command fields and passes valid revision expectations to the authoritative owner', async () => {
    const { host, send } = navigationChannel()
    const command = vi.fn()
    host.onNavigationCommand(command)
    for (const invalid of [
      { ...navigationCommand, direction: 'reload' }, { ...navigationCommand, expectedRevision: -1 },
      { ...navigationCommand, expectedRevision: '2' }, { ...navigationCommand, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...navigationCommand, path: '/settings' }, { type: navigationCommand.type, direction: 'back' },
    ]) send(invalid)
    // Revision rejection belongs to the history owner; the port does not duplicate its cursor.
    send({ ...navigationCommand, expectedRevision: 1 })
    await vi.waitFor(() => expect(command).toHaveBeenCalledExactlyOnceWith({ ...navigationCommand, expectedRevision: 1 }))
  })

  it('captures an initial restore before listeners mount and retains automation detail targets', async () => {
    const { host, send } = navigationChannel()
    const snapshot: MiraAppNavigationSnapshot = { entries: [{ kind: 'automations', taskId: 'automation-a', tab: 'history', section: 'runs', runStatus: 'interrupted' }], cursor: 0, detached: false }
    const first = vi.fn()
    const unsubscribe = host.onNavigationRestore(first)
    send({ type: 'mira:app-navigation-restore', snapshot })
    await vi.waitFor(() => expect(first).toHaveBeenCalledExactlyOnceWith(snapshot))
    unsubscribe()
    const late = vi.fn()
    host.onNavigationRestore(late)
    expect(late).toHaveBeenCalledExactlyOnceWith(snapshot)
    send({ type: 'mira:app-navigation-restore', snapshot: navigationSnapshot() })
    // A command received after the duplicate restore establishes the MessagePort delivery boundary.
    const command = vi.fn(); host.onNavigationCommand(command); send(navigationCommand)
    await vi.waitFor(() => expect(command).toHaveBeenCalledOnce())
    expect(late).toHaveBeenCalledOnce()
    expect(first).toHaveBeenCalledOnce()
  })

  it('distinguishes an explicit undefined restore from malformed or missing snapshot data', async () => {
    const { host, send } = navigationChannel()
    const restore = vi.fn(); host.onNavigationRestore(restore)
    for (const invalid of [
      { type: 'mira:app-navigation-restore' }, { type: 'mira:app-navigation-restore', snapshot: null },
      { type: 'mira:app-navigation-restore', snapshot: { ...navigationSnapshot(), cursor: 9 } },
      { type: 'mira:app-navigation-restore', snapshot: undefined, route: '/settings' },
    ]) send(invalid)
    send({ type: 'mira:app-navigation-restore', snapshot: undefined })
    await vi.waitFor(() => expect(restore).toHaveBeenCalledExactlyOnceWith(undefined))
    const late = vi.fn(); host.onNavigationRestore(late)
    expect(late).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it('unsubscribes commands and restore listeners before subsequent messages arrive', async () => {
    const { host, send } = navigationChannel()
    const restore = vi.fn(), command = vi.fn(), active = vi.fn()
    host.onNavigationRestore(restore)()
    host.onNavigationCommand(command)()
    host.onNavigationCommand(active)
    send({ type: 'mira:app-navigation-restore', snapshot: navigationSnapshot() })
    send(navigationCommand)
    await vi.waitFor(() => expect(active).toHaveBeenCalledOnce())
    expect(restore).not.toHaveBeenCalled()
    expect(command).not.toHaveBeenCalled()
  })

  it('normalizes published state and never sends malformed snapshots or injected fields', () => {
    const { host, port } = fixture()
    const valid: MiraAppNavigationState = { ...navigationState(), snapshot: { entries: [{ kind: 'automations', tab: 'settings', section: 'tasks', filter: 'all', runStatus: 'all' }], cursor: 0, detached: true } }
    host.publishNavigationState(valid)
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ ...valid, snapshot: { entries: [{ kind: 'automations' }], cursor: 0, detached: true } })
    for (const invalid of [
      { ...valid, revision: Infinity }, { ...valid, canGoBack: 'true' }, { ...valid, busy: undefined },
      { ...valid, snapshot: undefined }, { ...valid, snapshot: { ...valid.snapshot, cursor: 1 } },
      { ...valid, appId: 'mira-novel-studio' },
    ]) host.publishNavigationState(invalid as unknown as MiraAppNavigationState)
    expect(port.postMessage).toHaveBeenCalledOnce()
    host.close()
  })

  it('ignores stale delivery callbacks and late subscriptions after the connection closes', () => {
    const { host, port, receive } = fixture()
    const oldCallback = port.onmessage!, command = vi.fn(), restore = vi.fn()
    host.onNavigationCommand(command); host.onNavigationRestore(restore)
    receive({ type: 'mira:app-navigation-restore', snapshot: undefined })
    expect(restore).toHaveBeenCalledExactlyOnceWith(undefined)
    restore.mockClear()
    host.close()
    oldCallback({ data: navigationCommand })
    oldCallback({ data: { type: 'mira:app-navigation-restore', snapshot: navigationSnapshot() } })
    const late = vi.fn(); host.onNavigationRestore(late); host.onNavigationCommand(late)
    host.publishNavigationState(navigationState())
    expect(command).not.toHaveBeenCalled()
    expect(restore).not.toHaveBeenCalled()
    expect(late).not.toHaveBeenCalled()
    expect(port.postMessage).not.toHaveBeenCalled()
  })
})
