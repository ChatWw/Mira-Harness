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
  it('acknowledges consumed close only after its current workbench owner settles', async () => {
    const { host, port, receive } = fixture()
    let done!: (value: boolean) => void
    const action = vi.fn(() => new Promise<boolean>(resolve => { done = resolve })), remove = host.onCloseContext(action)
    receive({ type: 'mira:close-context', id: 'close-1', extra: true }); await Promise.resolve(); expect(action).not.toHaveBeenCalled()
    receive({ type: 'mira:close-context', id: 'close-1' }); await Promise.resolve(); expect(action).toHaveBeenCalledOnce(); expect(port.postMessage).not.toHaveBeenCalled()
    done(true); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:close-ready', id: 'close-1', ok: true, consumed: true })
    remove(); receive({ type: 'mira:close-context', id: 'close-2' }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'mira:close-ready', id: 'close-2', ok: false }))
    host.close()
  })
  it('preserves failed close identity and cannot send a late close acknowledgement after teardown', async () => {
    const { host, port, receive } = fixture()
    host.onCloseContext(async () => { throw new Error('保存失败') })
    receive({ type: 'mira:close-context', id: 'failure' }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:close-ready', id: 'failure', ok: false, error: '保存失败' })
    let done!: (value: boolean) => void
    host.onCloseContext(() => new Promise<boolean>(resolve => { done = resolve }))
    receive({ type: 'mira:close-context', id: 'late' }); await Promise.resolve(); host.close(); port.postMessage.mockClear(); done(false)
    await Promise.resolve(); await Promise.resolve(); expect(port.postMessage).not.toHaveBeenCalled()
  })
  it('observes only valid host theme context and requests a Shell-owned toggle', async () => {
    const { host, port, receive } = fixture(), listener = vi.fn(), remove = host.onThemeChange(listener)
    expect(host.getTheme()).toBe('light')
    for (const theme of ['system', 'red', undefined, null]) receive({ type: 'mira:context', context: { theme } })
    expect(listener).not.toHaveBeenCalled()
    receive({ type: 'mira:context', context: { theme: 'dark' } }); receive({ type: 'mira:context', context: { theme: 'dark' } })
    expect(host.getTheme()).toBe('dark'); expect(listener).toHaveBeenCalledOnce()
    const toggling = host.toggleTheme()
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'appearance.toggle-theme', params: undefined })
    receive({ type: 'mira:response', id: '1', ok: true, value: 'light' }); await expect(toggling).resolves.toBe('light')
    expect(host.getTheme()).toBe('dark') // Only authoritative context changes the displayed theme.
    remove(); receive({ type: 'mira:context', context: { theme: 'light' } }); expect(listener).toHaveBeenCalledOnce()
    host.onThemeChange(listener); host.close(); receive({ type: 'mira:context', context: { theme: 'dark' } }); expect(listener).toHaveBeenCalledOnce()
  })
  it('reads complete output using only the captured canonical identity through its authorized port', async () => {
    const { host, port, receive } = fixture()
    const reading = host.readCommandOutput('owner', 'run', 'canonical-tool')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.command.output', params: { sessionId: 'owner', runId: 'run', toolId: 'canonical-tool' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: 'FIRST\nLAST' })
    await expect(reading).resolves.toBe('FIRST\nLAST'); host.close()
  })
  it('carries the confirmed edit-and-rewind token and returns authoritative conflicts', async () => {
    const { host, port, receive } = fixture(), selection = { providerId: 'p', modelId: 'm' }, workspace = { mode: 'rewind' as const, snapshotToken: 'a'.repeat(64) }
    const request = host.editAndRerun('owner', 'input', 'changed', selection, [], workspace)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.run.edit-rerun', params: { sessionId: 'owner', messageId: 'input', content: 'changed', selection, references: [], workspace } })
    const blocked = { disposition: 'blocked', message: '文件已变化', preview: { messageId: 'input', safeFiles: [], unsafeFiles: [], ignoredTools: [], canApply: false } }
    receive({ type: 'mira:response', id: '1', ok: true, value: blocked }); await expect(request).resolves.toEqual(blocked); host.close()
  })
  it('sends a confirmed snapshot token or pending recovery identity without renderer file bytes', async () => {
    const { host, port, receive } = fixture()
    const result = { applied: true, preview: { messageId: 'input', safeFiles: [], unsafeFiles: [], ignoredTools: [], canApply: false }, message: '已恢复' }
    const apply = host.applyFileRewind('owner', 'input', 'a'.repeat(64))
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.files.rewind-apply', params: { sessionId: 'owner', messageId: 'input', snapshotToken: 'a'.repeat(64) } })
    receive({ type: 'mira:response', id: '1', ok: true, value: result }); await expect(apply).resolves.toEqual(result)
    const recover = host.recoverFileRewind('owner', 'recovery')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.files.rewind-recover', params: { sessionId: 'owner', recoveryId: 'recovery' } })
    receive({ type: 'mira:response', id: '2', ok: true, value: result }); await recover; host.close()
  })
  it('requests a read-only rewind preview with the captured owner and message', async () => {
    const { host, port, receive } = fixture()
    const reading = host.previewFileRewind('owner', 'input')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.files.rewind-preview', params: { sessionId: 'owner', messageId: 'input' } })
    const preview = { messageId: 'input', safeFiles: [], unsafeFiles: [], ignoredTools: [], canApply: false }
    receive({ type: 'mira:response', id: '1', ok: true, value: preview })
    await expect(reading).resolves.toEqual(preview); host.close()
  })
  it('distinguishes omitted history attachments from explicit removal through the authorized port', async () => {
    const { host, port, receive } = fixture()
    const selection = { providerId: 'provider', modelId: 'model' }
    const legacy = host.editAndRerun('owner', 'message', 'changed', selection)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.run.edit-rerun', params: { sessionId: 'owner', messageId: 'message', content: 'changed', selection } })
    receive({ type: 'mira:response', id: '1', ok: true }); await legacy
    const removal = host.editAndRerun('owner', 'message', 'changed', selection, [])
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.run.edit-rerun', params: { sessionId: 'owner', messageId: 'message', content: 'changed', selection, references: [] } })
    receive({ type: 'mira:response', id: '2', ok: true }); await removal; host.close()
  })
  it('forwards Goal controls with both target identity and expected revision', async () => {
    const { host, port, receive } = fixture()
    const selection = { providerId: 'provider', modelId: 'model' }
    const calls = [
      ['pause', () => host.pauseGoal('owner', 7, 'goal-id'), { sessionId: 'owner', expectedRevision: 7, expectedGoalId: 'goal-id' }],
      ['resume', () => host.resumeGoal('owner', 7, 'goal-id', selection, 'full'), { sessionId: 'owner', expectedRevision: 7, expectedGoalId: 'goal-id', selection, permissionMode: 'full' }],
      ['budget', () => host.updateGoalBudget('owner', null, 7, 'goal-id'), { sessionId: 'owner', expectedRevision: 7, expectedGoalId: 'goal-id', tokenBudget: null }],
      ['clear', () => host.clearGoal('owner', 7, 'goal-id'), { sessionId: 'owner', expectedRevision: 7, expectedGoalId: 'goal-id' }],
    ] as const
    for (const [index, [method, call, params]] of calls.entries()) {
      const pending = call(), id = String(index + 1)
      expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id, method: `harness.goal.${method}`, params })
      receive({ type: 'mira:response', id, ok: true, value: method === 'clear' ? undefined : { id: 'goal-id', revision: 8 } }); await pending
    }
    host.close()
  })
  it('reads input history through the authorized session or project scope without accepting a renderer directory', async () => {
    const { host, port, receive } = fixture()
    const pending = host.listPromptHistory({ sessionId: 'current' })
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.input-history.list', params: { sessionId: 'current' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: ['Earlier input'] })
    await expect(pending).resolves.toEqual(['Earlier input']); host.close()
  })
  it('compacts through the authorized bridge with only session and model identity', async () => {
    const { port, host, receive } = fixture()
    const selection = { providerId: 'provider', modelId: 'model' }
    const pending = host.compactConversation('source', selection)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.context.compact', params: { sessionId: 'source', selection, submissionId: expect.any(String) } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { status: 'compacted' } })
    await expect(pending).resolves.toEqual({ status: 'compacted' }); host.close()
  })

  it('forks an exact reply with a stable request identity through the authorized bridge', async () => {
    const { host, port, receive } = fixture()
    const pending = host.forkConversation('source', 'reply', '55cabc22-257e-41d4-8ec2-9fc83671dd12')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.session.fork', params: { id: 'source', messageId: 'reply', requestId: '55cabc22-257e-41d4-8ec2-9fc83671dd12' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { id: 'fork' } })
    await expect(pending).resolves.toEqual({ id: 'fork' }); host.close()
  })
  it('reconnects a configured MCP identity through the first-party bridge', async () => {
    const { host, port, receive } = fixture()
    const pending = host.reconnectMcp('configured')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.mcp.reconnect', params: { id: 'configured' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { state: 'connected', toolCount: 2 } })
    await expect(pending).resolves.toEqual({ state: 'connected', toolCount: 2 }); host.close()
  })
  it('reads the MCP catalog for the captured session and preserves latest-catalog reads without a session', async () => {
    const { host, port, receive } = fixture()
    const scoped = host.listMcp('owner')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.mcp.list', params: { sessionId: 'owner' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: [] }); await scoped
    const latest = host.listMcp()
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.mcp.list', params: undefined })
    receive({ type: 'mira:response', id: '2', ok: true, value: [] }); await latest; host.close()
  })
  it('reads an anonymous project MCP catalog by registered identity without renderer directory', async () => {
    const { host, port, receive } = fixture()
    const pending = host.listMcp(undefined, 'writing-project')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.mcp.list', params: { projectId: 'writing-project' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: [] }); await pending; host.close()
  })
  it('queries browser protection using task and resource identity without exposing a guest handle', async () => {
    const { host, port, receive } = fixture()
    const reading = host.browserProtected('owner', 'browser:one')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.browser.protection', params: { sessionId: 'owner', browserId: 'browser:one' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { protected: true } })
    await expect(reading).resolves.toEqual({ protected: true }); host.close()
  })
  it('routes external and devtools actions with captured browser and task identities', async () => {
    const { host, port, receive } = fixture()
    const external = host.openBrowserExternal('a', 'https://mira.test/redirected', 'browser:one')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.browser.external', params: { sessionId: 'a', browserId: 'browser:one', url: 'https://mira.test/redirected' } })
    receive({ type: 'mira:response', id: '1', ok: true }); await external
    const devtools = host.controlBrowser('b', 'devtools', 'browser:two')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.browser.control', params: { sessionId: 'b', browserId: 'browser:two', action: 'devtools' } })
    receive({ type: 'mira:response', id: '2', ok: true }); await devtools; host.close()
  })
  it('sends captured task and browser identities on navigation, visibility and bounds without exposing a guest handle', async () => {
    const { host, port, receive } = fixture(), bounds = { x: 0, y: 0, width: 400, height: 300 }
    const navigation = host.navigateBrowser('a', 'https://mira.test/', bounds, 'browser:one', false)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.browser.navigate', params: { sessionId: 'a', url: 'https://mira.test/', bounds, browserId: 'browser:one', visible: false } })
    receive({ type: 'mira:response', id: '1', ok: true, value: 'https://mira.test/' }); await expect(navigation).resolves.toBe('https://mira.test/')
    const control = host.controlBrowser('a', 'close', 'browser:one')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.browser.control', params: { sessionId: 'a', action: 'close', browserId: 'browser:one' } })
    receive({ type: 'mira:response', id: '2', ok: true, value: undefined }); await control
    const resize = host.setBrowserBounds('b', bounds, 'browser:two')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '3', method: 'harness.browser.bounds', params: { sessionId: 'b', bounds, browserId: 'browser:two' } })
    receive({ type: 'mira:response', id: '3', ok: true, value: undefined }); await resize; host.close()
  })
  it('pastes into a captured terminal without receiving clipboard contents', async () => {
    const { host, port, receive } = fixture()
    const paste = host.pasteTerminal('owner', 'terminal', true)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.terminal.paste', params: { sessionId: 'owner', terminalId: 'terminal', bracketed: true } })
    receive({ type: 'mira:response', id: '1', ok: true, value: undefined })
    await expect(paste).resolves.toBeUndefined(); host.close()
  })
  it('creates a real side session through the scoped parent IPC contract', async () => {
    const { host, port, receive } = fixture()
    const creation = host.createSideConversation('parent')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.session.create-side', params: { parentId: 'parent' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { id: 'child', parentSessionId: 'parent' } })
    await expect(creation).resolves.toEqual({ id: 'child', parentSessionId: 'parent' })
    host.close()
  })
  it('captures side first-input identity and model in one scoped host request', async () => {
    const { host, port, receive } = fixture()
    const input = { submissionId: 'side-first', text: '一个旁路问题', selection: { providerId: 'p', modelId: 'm', thinkingLevel: 'high' as const }, permissionMode: 'default' as const }
    const creation = host.createSideConversation('parent', input)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.session.create-side', params: { parentId: 'parent', input } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { id: 'child', parentSessionId: 'parent' } })
    await expect(creation).resolves.toEqual({ id: 'child', parentSessionId: 'parent' }); host.close()
  })
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
  it('detaches a prepared draft through the existing authorized session move', async () => {
    const { host, port, receive } = fixture()
    const moving = host.moveSession('prepared')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.session.move', params: { id: 'prepared', projectId: undefined } })
    receive({ type: 'mira:response', id: '1', ok: true })
    await expect(moving).resolves.toBeUndefined()
    host.close()
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
  it('forwards HTML, reveal and project editor requests through the authorized port', async () => {
    const { host, port, receive } = fixture()
    const url = host.getWorkspaceHtmlUrl({ projectId: 'p' }, '原型/index.html')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.files.browser-url', params: { projectId: 'p', path: '原型/index.html' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: 'http://127.0.0.1:8123/preview' }); await expect(url).resolves.toContain('127.0.0.1')
    const reveal = host.revealWorkspaceFile({ sessionId: 's' }, 'index.html')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.files.reveal', params: { sessionId: 's', path: 'index.html' } })
    receive({ type: 'mira:response', id: '2', ok: true }); await reveal
    const editor = host.openProjectFileInEditor('p', 'index.html', 'mira-vscode')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '3', method: 'harness.files.open-editor', params: { projectId: 'p', path: 'index.html', editorId: 'mira-vscode' } })
    receive({ type: 'mira:response', id: '3', ok: true }); await editor
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


it('requests the shared About window through the host port without navigation', async () => {
  const { host, port, receive } = fixture()
  const opening = host.showAbout()
  expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'about.show', params: undefined })
  receive({ type: 'mira:response', id: '1', ok: true, value: null })
  await opening
  host.close()
})


it.each([
  ['readProjectFile', 'files.read'], ['readProjectImage', 'files.read-image'], ['openProjectMedia', 'files.media-open'],
] as const)('requests %s with the captured project instead of a current task', async (action, method) => {
  const { host, port, receive } = fixture()
  const pending = host[action]('project-a', 'file.md')
  expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: `harness.${method}`, params: { projectId: 'project-a', path: 'file.md' } })
  receive({ type: 'mira:response', id: '1', ok: true, value: { path: 'file.md' } })
  await pending; host.close()
})

describe('Git tools authorized host transport', () => {
  it('sends repository operations with project identity and reviewed token only', async () => {
    const { host, port, receive } = fixture(), token = 'a'.repeat(64)
    const snapshot = host.getGitTools('side-project')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.git.tools', params: { projectId: 'side-project' } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { token } }); await snapshot
    const graph = host.getGitGraph('side-project', 50)
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'harness.git.graph', params: { projectId: 'side-project', skip: 50 } }))
    receive({ type: 'mira:response', id: '2', ok: true, value: { commits: [], hasMore: false } }); await graph
    const action = host.gitAction('side-project', 'commit', token, 'fix: reviewed', false)
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'harness.git.action', params: { projectId: 'side-project', action: 'commit', token, message: 'fix: reviewed', includeUnstaged: false } }))
    receive({ type: 'mira:response', id: '3', ok: true, value: { committed: true, pushed: false } }); await action
    const selection = { providerId: 'provider', modelId: 'model' }
    const generating = host.generateGitMessage('side-project', token, true, selection)
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'harness.git.generate-message', params: { projectId: 'side-project', token, includeUnstaged: true, selection } }))
    receive({ type: 'mira:response', id: '4', ok: true, value: 'feat: generated' })
    await expect(generating).resolves.toBe('feat: generated')
    host.close()
  })
})
