import { describe, expect, it, vi } from 'vitest'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
import { FirstPartyHarnessHost } from '../apps/harness-react/src/platform/first-party-host'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import { handleFirstPartyRequest } from '../src/platform/firstPartyBridge'
import { firstPartyAppManifests } from '../src/config/firstPartyApps'
import type { HarnessGitContext } from '../src/config/harness'

const methods = [
  { method: 'files.list', params: { path: '' } },
  { method: 'files.search', params: { query: 'notes', refresh: true } },
  { method: 'files.git-status', params: {} },
  { method: 'files.git-ignored', params: { paths: ['src', 'dist'] } },
] as const

describe('project-root read-only file contracts', () => {
  it('patches only the matching project after a successful Git mutation and does not turn list refresh failure into an action retry', async () => {
    const context: HarnessGitContext = { projectId: 'p', directory: '/project', isRepository: true, headType: 'branch', branchName: 'topic', uncommittedFileCount: 0, branches: [], snapshotToken: 'a'.repeat(64), mutationBlocked: false }
    const host = { getGitContext: vi.fn(async () => context), checkoutGitBranch: vi.fn(async () => context), createGitBranch: vi.fn(async () => ({ ...context, branchName: 'mira/new' })), listProjects: vi.fn(async () => { throw new Error('list failed') }) }
    const controller = new PilotController(host as unknown as PilotHost)
    ;(controller as any).state.projects = [{ id: 'p', directory: '/project', gitBranch: 'main' }, { id: 'other', directory: '/other', gitBranch: 'other' }]
    const listener = vi.fn(); controller.subscribe(listener)
    expect(controller.supportsGitActions).toBe(true)
    expect(await controller.getGitContext('p')).toBe(context)
    expect(controller.getSnapshot().projects[0]?.gitBranch).toBe('topic'); expect(listener).toHaveBeenCalledOnce()
    expect(await controller.checkoutGitBranch('p', 'topic', context.snapshotToken)).toBe(context)
    expect(controller.getSnapshot().projects.map(project => project.gitBranch)).toEqual(['topic', 'other'])
    await controller.createGitBranch('p', 'mira/new', context.snapshotToken)
    expect(controller.getSnapshot().projects[0]?.gitBranch).toBe('mira/new')
    expect(host.listProjects).not.toHaveBeenCalled()
    ;(controller as any).state.projects = [{ id: 'p', directory: '/replacement', gitBranch: 'replacement' }]
    await controller.checkoutGitBranch('p', 'topic', context.snapshotToken)
    expect(controller.getSnapshot().projects[0]?.gitBranch).toBe('replacement')
    expect(new PilotController({ getGitContext: host.getGitContext } as unknown as PilotHost).supportsGitActions).toBe(false)
  })

  it('rejects out-of-order context reads and keeps project identity and other project scopes intact', async () => {
    const context: HarnessGitContext = { projectId: 'p', directory: '/project', isRepository: true, headType: 'branch', branchName: 'new', uncommittedFileCount: 0, branches: [], snapshotToken: 'a'.repeat(64), mutationBlocked: false }
    let resolveOld!: (context: HarnessGitContext) => void
    const old = new Promise<HarnessGitContext>(done => { resolveOld = done })
    const host = { getGitContext: vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(context).mockResolvedValueOnce({ ...context, projectId: 'other', directory: '/other', branchName: 'other-new' }) }
    const controller = new PilotController(host as unknown as PilotHost)
    ;(controller as any).state.projects = [{ id: 'p', directory: '/project', gitBranch: 'old' }, { id: 'other', directory: '/other', gitBranch: 'other-old' }]
    const first = controller.getGitContext('p'), stale = expect(first).rejects.toThrow('Git 上下文已更新')
    await controller.getGitContext('p'); await controller.getGitContext('other')
    resolveOld({ ...context, branchName: 'stale' }); await stale
    expect(controller.getSnapshot().projects.map(project => project.gitBranch)).toEqual(['new', 'other-new'])
  })

  it.each([false, true])('invalidates pending context reads when a mutation settles (failure=%s)', async failure => {
    const context: HarnessGitContext = { projectId: 'p', directory: '/project', isRepository: true, headType: 'branch', branchName: 'new', uncommittedFileCount: 0, branches: [], snapshotToken: 'a'.repeat(64), mutationBlocked: false }
    let resolveOld!: (context: HarnessGitContext) => void, finish!: () => void
    const old = new Promise<HarnessGitContext>(done => { resolveOld = done }), changing = new Promise<void>(done => { finish = done })
    const host = { getGitContext: vi.fn(() => old), checkoutGitBranch: vi.fn(async () => { await changing; if (failure) throw new Error('Git action rejected'); return context }) }
    const controller = new PilotController(host as unknown as PilotHost)
    ;(controller as any).state.projects = [{ id: 'p', directory: '/project', gitBranch: 'old' }]
    const first = controller.getGitContext('p'), stale = expect(first).rejects.toThrow('Git 上下文已更新')
    const change = controller.checkoutGitBranch('p', 'new', context.snapshotToken)
    const result = failure ? expect(change).rejects.toThrow('Git action rejected') : expect(change).resolves.toBe(context)
    finish(); await result
    resolveOld({ ...context, branchName: 'stale' }); await stale
    expect(controller.getSnapshot().projects[0]?.gitBranch).toBe(failure ? 'old' : 'new')
  })

  it('invalidates reads begun during a mutation and rejects a read returning a different project scope', async () => {
    const context: HarnessGitContext = { projectId: 'p', directory: '/project', isRepository: true, headType: 'branch', branchName: 'new', uncommittedFileCount: 0, branches: [], snapshotToken: 'a'.repeat(64), mutationBlocked: false }
    let finish!: () => void, resolveRead!: (context: HarnessGitContext) => void
    const gate = new Promise<void>(done => { finish = done }), reading = new Promise<HarnessGitContext>(done => { resolveRead = done })
    const host = { getGitContext: vi.fn().mockReturnValueOnce(reading).mockResolvedValueOnce({ ...context, projectId: 'other', directory: '/other' }), createGitBranch: vi.fn(async () => { await gate; return context }) }
    const controller = new PilotController(host as unknown as PilotHost)
    ;(controller as any).state.projects = [{ id: 'p', directory: '/project', gitBranch: 'old' }, { id: 'other', directory: '/other', gitBranch: 'untouched' }]
    const change = controller.createGitBranch('p', 'new', context.snapshotToken)
    const read = controller.getGitContext('p'), stale = expect(read).rejects.toThrow('Git 上下文已更新')
    finish(); await change; resolveRead({ ...context, branchName: 'old' }); await stale
    await expect(controller.getGitContext('p')).rejects.toThrow('Git 上下文已更新')
    expect(controller.getSnapshot().projects.map(project => project.gitBranch)).toEqual(['new', 'untouched'])
  })
  it.each(methods)('$method preserves exactly one project or session scope through both parsers', ({ method, params }) => {
    for (const scope of [{ projectId: 'project' }, { sessionId: 'session' }]) {
      const first = parseFirstPartyHarnessCall(method, { ...scope, ...params, root: '/private/injected' })
      expect(first).toEqual({ method, ...scope, ...params })
      const { method: parsedMethod, ...parsedParams } = first
      expect(parseFirstPartyHarnessCall(parsedMethod, parsedParams)).toEqual(first)
    }
  })

  it.each(methods)('$method rejects missing, mixed or invalid scope and never accepts a root as scope', ({ method, params }) => {
    for (const scope of [{}, { root: '/private/injected' }, { sessionId: 'session', projectId: 'project' }, { sessionId: 'session', projectId: undefined }, { projectId: 'project', sessionId: undefined }, { projectId: '' }, { projectId: null }, { projectId: 12 }, { projectId: 'x'.repeat(129) }, { projectId: '\0' }]) expect(() => parseFirstPartyHarnessCall(method, { ...scope, ...params })).toThrow()
  })

  it('keeps project browsing bounded and does not extend read, editor, image or watch operations', () => {
    for (const path of ['../secret', '/absolute', 'C:/secret', 'src\\secret', '\0']) expect(() => parseFirstPartyHarnessCall('files.list', { projectId: 'p', path })).toThrow()
    expect(() => parseFirstPartyHarnessCall('files.search', { projectId: 'p', query: 'x'.repeat(257) })).toThrow()
    expect(() => parseFirstPartyHarnessCall('files.git-ignored', { projectId: 'p', paths: ['../secret'] })).toThrow()
    for (const method of ['files.read', 'files.read-image', 'files.open-editor', 'files.watch', 'files.unwatch']) expect(() => parseFirstPartyHarnessCall(method, { projectId: 'p', path: 'README.md', paths: [''], editorId: 'mira-vscode', watchId: 'w' })).toThrow()
  })

  it('sends project-only requests without borrowing or creating a session', async () => {
    const port = { onmessage: undefined as ((message: { data: unknown }) => void) | undefined, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
    const host = new FirstPartyHarnessHost(port as unknown as MessagePort)
    const calls = [
      () => host.listProjectFiles('p', 'src'),
      () => host.searchProjectFiles('p', 'notes', true),
      () => host.getProjectWorkspaceGit('p'),
      () => host.getProjectWorkspaceIgnored('p', ['build']),
    ]
    const expected = [
      { method: 'harness.files.list', params: { projectId: 'p', path: 'src' } },
      { method: 'harness.files.search', params: { projectId: 'p', query: 'notes', refresh: true } },
      { method: 'harness.files.git-status', params: { projectId: 'p' } },
      { method: 'harness.files.git-ignored', params: { projectId: 'p', paths: ['build'] } },
    ]
    for (const [index, call] of calls.entries()) {
      const response = call()
      expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: String(index + 1), ...expected[index] })
      port.onmessage!({ data: { type: 'mira:response', id: String(index + 1), ok: true, value: [] } })
      await response
    }
    host.close()
  })

  it.each(methods)('$method traverses the real renderer bridge and second parser without gaining an injected root', async ({ method, params }) => {
    const invokeFirstPartyHarness = vi.fn(async (_grant: string, name: string, payload: unknown) => parseFirstPartyHarnessCall(name, payload))
    const options = { manifest: firstPartyAppManifests.find(app => app.appId === 'mira-harness')!, grantId: 'owner-grant', api: { invokeFirstPartyHarness } as never, context: { version: 1, theme: 'light', language: 'zh-CN', user: { id: 'user', name: 'Mira' } } as never, route: '/workspace/harness-react', navigate: vi.fn() }
    const request = { type: 'mira:request' as const, id: 'request', method: `harness.${method}`, params: { ...params, projectId: 'project', root: '/private/injected' } }
    await expect(handleFirstPartyRequest(options, request)).resolves.toEqual({ method, projectId: 'project', ...params })
    expect(invokeFirstPartyHarness).toHaveBeenCalledExactlyOnceWith('owner-grant', method, { projectId: 'project', ...params })
    await expect(handleFirstPartyRequest(options, { ...request, params: { ...request.params, sessionId: 'session' } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(invokeFirstPartyHarness).toHaveBeenCalledTimes(1)
  })

  it('routes explicit project methods without mutating current task or falling back to its files', async () => {
    const host = {
      listProjectFiles: vi.fn(async () => ({ path: '', entries: [] })), searchProjectFiles: vi.fn(async () => ({ entries: [], truncated: false })),
      getProjectWorkspaceGit: vi.fn(async () => ({ available: false, entries: [] })), getProjectWorkspaceIgnored: vi.fn(async () => []),
      listFiles: vi.fn(), searchFiles: vi.fn(), getWorkspaceGit: vi.fn(), getWorkspaceIgnored: vi.fn(), createSession: vi.fn(), getSession: vi.fn(),
    }
    const controller = new PilotController(host as unknown as PilotHost), snapshot = controller.getSnapshot()
    await controller.listProjectFiles('p'); await controller.searchProjectFiles('p', 'notes', true)
    await controller.getProjectWorkspaceGit('p'); await controller.getProjectWorkspaceIgnored('p', ['build'])
    expect(host.listProjectFiles).toHaveBeenCalledExactlyOnceWith('p', '')
    expect(host.searchProjectFiles).toHaveBeenCalledExactlyOnceWith('p', 'notes', true)
    expect(host.getProjectWorkspaceGit).toHaveBeenCalledExactlyOnceWith('p')
    expect(host.getProjectWorkspaceIgnored).toHaveBeenCalledExactlyOnceWith('p', ['build'])
    for (const method of [host.listFiles, host.searchFiles, host.getWorkspaceGit, host.getWorkspaceIgnored, host.createSession, host.getSession]) expect(method).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toBe(snapshot)
    expect(controller.supportsProjectWorkspaceGit).toBe(true)
  })

  it('rejects unsupported project methods on an older host instead of using session permissions', async () => {
    const host = { listFiles: vi.fn(), searchFiles: vi.fn(), getWorkspaceGit: vi.fn(), getWorkspaceIgnored: vi.fn() }
    const controller = new PilotController(host as unknown as PilotHost)
    await expect(controller.listProjectFiles('p')).rejects.toThrow('不支持项目文件')
    await expect(controller.searchProjectFiles('p', 'notes')).rejects.toThrow('不支持项目文件')
    await expect(controller.getProjectWorkspaceGit('p')).rejects.toThrow('不支持项目 Git')
    await expect(controller.getProjectWorkspaceIgnored('p', [])).rejects.toThrow('不支持项目 Git')
    expect(controller.supportsProjectWorkspaceGit).toBe(false)
    for (const method of Object.values(host)) expect(method).not.toHaveBeenCalled()
  })
})
