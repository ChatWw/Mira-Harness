import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlatformIpcDependencies } from '../electron/ipc/platformIpc'
import { LocalMicroAppServer } from '../electron/adapters/localMicroAppServer'
import type { FirstPartyAppManifest } from '../src/config/firstPartyApps'
import { FirstPartyGrantStore } from '../electron/security/firstPartyGrant'
import * as workspaceGit from '../electron/services/harnessWorkspaceGit'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => electron.handlers.set(channel, handler)),
  fromWebContents: vi.fn(() => null),
  getFocusedWindow: vi.fn(() => null),
  showOpenDialog: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: electron.handle },
  BrowserWindow: { fromWebContents: electron.fromWebContents, getFocusedWindow: electron.getFocusedWindow },
  dialog: { showOpenDialog: electron.showOpenDialog },
}))

import { registerPlatformIpcHandlers } from '../electron/ipc/platformIpc'

function register(options: Partial<PlatformIpcDependencies> = {}) {
  const snapshot = { microApps: [{ id: 'micro-sample' }] }
  const database = {
    getSnapshot: vi.fn(() => snapshot),
    savePreference: vi.fn((key, value) => ({ key, value })),
    saveMenus: vi.fn(menus => menus),
    saveMicroApps: vi.fn(() => snapshot),
    importSnapshot: vi.fn(() => snapshot),
    restoreDefaults: vi.fn(() => snapshot),
    exportSnapshot: vi.fn(() => 'snapshot-json'),
    novels: {
      listProjects: vi.fn(() => [{ id: 'project-1' }]),
      getProject: vi.fn(id => ({ version: 1, id, title: 'Project' })),
      saveProject: vi.fn(project => project),
    },
    harness: {
      listSessions: vi.fn(() => []),
      listProjects: vi.fn(() => []),
      getSession: vi.fn((id: string) => ({ id, projectId: 'project', workingDirectory: undefined })),
      createSession: vi.fn(() => ({ id: 'session-1' })),
      getProject: vi.fn(() => ({ id: 'project', directory: process.cwd() })),
      selectFileReferences: vi.fn((_projectId, paths) => paths.map((path: string) => ({ path }))),
    },
  }
  const localMicroAppServer = {
    validateApps: vi.fn(),
    setApps: vi.fn(),
    validateDirectory: vi.fn(path => path),
    getEntryUrl: vi.fn(id => `http://localhost/${id}`),
    getApiBaseUrl: vi.fn(id => `http://localhost/apps/${id}`),
  }
  registerPlatformIpcHandlers({ database, localMicroAppServer, ...options } as unknown as PlatformIpcDependencies)
  const sender = Object.assign(new EventEmitter(), { id: 1 })
  const invoke = (channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender }, ...args)
  const invokeAs = (id: number, channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender: { id, once: vi.fn() } }, ...args)
  const invokeFromSubframe = (channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender, senderFrame: { parent: {} } }, ...args)
  return { database, localMicroAppServer, snapshot, sender, invoke, invokeAs, invokeFromSubframe }
}

describe('platform IPC registration', () => {
  beforeEach(() => {
    electron.handlers.clear()
    vi.clearAllMocks()
  })

  it('registers the existing platform and local micro-app channels', () => {
    const { invoke, database, localMicroAppServer, snapshot } = register()
    expect([...electron.handlers.keys()]).toEqual([
      'platform:get-snapshot',
      'platform:save-preference',
      'platform:update-menus',
      'platform:update-microapps',
      'platform:select-microapp-directory',
      'platform:resolve-local-microapp-url',
      'platform:get-novel-api-base-url',
      'platform:create-first-party-grant',
      'platform:revoke-first-party-grant',
      'platform:generate-first-party-text',
      'platform:first-party-list-novel-projects',
      'platform:first-party-get-novel-project',
      'platform:first-party-save-novel-project',
      'platform:first-party-harness',
      'platform:import-snapshot',
      'platform:restore-defaults',
      'platform:export-snapshot',
    ])
    expect(invoke('platform:get-snapshot')).toBe(snapshot)
    expect(invoke('platform:save-preference', 'theme', 'dark')).toEqual({ key: 'theme', value: 'dark' })
    expect(invoke('platform:update-menus', [])).toEqual([])
    expect(invoke('platform:resolve-local-microapp-url', 'micro-sample')).toBe('http://localhost/micro-sample')
    expect(invoke('platform:get-novel-api-base-url')).toBe('http://localhost/apps/novel')
    expect(invoke('platform:import-snapshot', '{"mainMenus":[],"microApps":[],"preferences":{}}')).toBe(snapshot)
    expect(invoke('platform:restore-defaults')).toBe(snapshot)
    expect(invoke('platform:export-snapshot')).toBe('snapshot-json')
    expect(database.exportSnapshot).toHaveBeenCalledOnce()
    expect(database.savePreference).toHaveBeenCalledWith('theme', 'dark')
    expect(localMicroAppServer.getApiBaseUrl).toHaveBeenCalledWith('novel')
    expect(database.importSnapshot).toHaveBeenCalledWith('{"mainMenus":[],"microApps":[],"preferences":{}}')
    expect(database.restoreDefaults).toHaveBeenCalledOnce()
    expect(localMicroAppServer.setApps).toHaveBeenCalledTimes(2)
  })

  it('binds workspace watchers to the host grant and checks session ownership throughout their lifetime', async () => {
    const workspaceWatch = { start: vi.fn(async () => ({ watchId: 'watch' })), stop: vi.fn(), closeForGrant: vi.fn(), closeForWebContents: vi.fn(), closeForSession: vi.fn(), closeInvalid: vi.fn() }
    const { invoke, sender, database } = register({ harnessRuntime: {} as never, workspaceWatch: workspaceWatch as never })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    await expect(invoke('platform:first-party-harness', grantId, 'files.watch', { sessionId: 's', paths: ['', 'src'], grantId: 'injected' })).resolves.toEqual({ watchId: 'watch' })
    expect(workspaceWatch.start).toHaveBeenCalledWith(sender, grantId, 's', ['', 'src'], expect.any(Function), expect.any(Function))
    const [, , , , resolveWorkspace, isAuthorized] = workspaceWatch.start.mock.calls[0] as unknown as [unknown, string, string, string[], () => string, () => boolean]
    expect(resolveWorkspace()).toBe(process.cwd())
    expect(isAuthorized()).toBe(true)
    database.harness.getProject.mockReturnValueOnce({ id: 'project', directory: '/different-workspace' })
    expect(isAuthorized()).toBe(false)
    database.harness.getSession.mockImplementationOnce(() => { throw new Error('removed session') })
    expect(isAuthorized()).toBe(false)
    expect(() => invoke('platform:first-party-harness', grantId, 'files.watch', { sessionId: 's', paths: ['../secret'] })).toThrow('路径无效')
    expect(workspaceWatch.start).toHaveBeenCalledOnce()
    invoke('platform:revoke-first-party-grant', grantId)
    expect(workspaceWatch.closeForGrant).toHaveBeenCalledExactlyOnceWith(grantId, sender.id)
    expect(isAuthorized()).toBe(false)
    sender.emit('destroyed')
    expect(workspaceWatch.closeForWebContents).toHaveBeenCalledExactlyOnceWith(sender.id)
  })

  it('does not let another window revoke a watch and can unwatch after its session has been deleted', () => {
    const workspaceWatch = { stop: vi.fn(), closeForGrant: vi.fn(), closeForWebContents: vi.fn() }
    const { invoke, invokeAs, sender, database } = register({ harnessRuntime: {} as never, workspaceWatch: workspaceWatch as never })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    invokeAs(2, 'platform:revoke-first-party-grant', grantId)
    expect(workspaceWatch.closeForGrant).not.toHaveBeenCalled()
    database.harness.getSession.mockImplementation(() => { throw new Error('removed session') })
    invoke('platform:first-party-harness', grantId, 'files.unwatch', { sessionId: 'removed', watchId: 'watch' })
    expect(workspaceWatch.stop).toHaveBeenCalledExactlyOnceWith(sender.id, grantId, 'removed', 'watch')
    expect(() => invokeAs(2, 'platform:first-party-harness', grantId, 'files.unwatch', { sessionId: 'removed', watchId: 'watch' })).toThrow('授权无效')
    expect(workspaceWatch.stop).toHaveBeenCalledOnce()
  })

  it('reclaims watchers when first-party sessions move or delete and imported configuration invalidates their roots', () => {
    const workspaceWatch = { closeForSession: vi.fn(), closeInvalid: vi.fn(), closeForGrant: vi.fn(), closeForWebContents: vi.fn() }
    const { invoke, database } = register({ harnessRuntime: {} as never, workspaceWatch: workspaceWatch as never })
    const moveSession = vi.fn(() => ({ id: 's' }))
    const deleteSession = vi.fn()
    Object.assign(database.harness, { moveSession, deleteSession })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    invoke('platform:first-party-harness', grantId, 'session.move', { id: 's', projectId: 'other' })
    expect(moveSession).toHaveBeenCalledWith('s', 'other')
    invoke('platform:first-party-harness', grantId, 'session.delete', { id: 's' })
    expect(deleteSession).toHaveBeenCalledWith('s')
    expect(workspaceWatch.closeForSession.mock.calls).toEqual([['s'], ['s']])
    invoke('platform:import-snapshot', '{}')
    invoke('platform:restore-defaults')
    expect(workspaceWatch.closeInvalid).toHaveBeenCalledTimes(2)
  })

  it('validates micro-apps before saving and leaves the server unchanged on failure', () => {
    const { invoke, database, localMicroAppServer, snapshot } = register()
    const apps = [{ id: 'micro-sample' }]
    expect(invoke('platform:update-microapps', apps)).toBe(snapshot)
    expect(localMicroAppServer.validateApps).toHaveBeenCalledWith(apps)
    expect(database.saveMicroApps).toHaveBeenCalledWith(apps)
    expect(localMicroAppServer.setApps).toHaveBeenCalledWith(snapshot.microApps)

    localMicroAppServer.validateApps.mockImplementation(() => { throw new Error('invalid app') })
    database.saveMicroApps.mockClear()
    localMicroAppServer.setApps.mockClear()
    expect(() => invoke('platform:update-microapps', apps)).toThrow('invalid app')
    expect(database.saveMicroApps).not.toHaveBeenCalled()
    expect(localMicroAppServer.setApps).not.toHaveBeenCalled()
  })

  it('returns null for a canceled directory selection and propagates validation errors', async () => {
    const { invoke, localMicroAppServer } = register()
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    await expect(invoke('platform:select-microapp-directory')).resolves.toBeNull()
    expect(localMicroAppServer.validateDirectory).not.toHaveBeenCalled()

    electron.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\apps\\sample'] })
    localMicroAppServer.validateDirectory.mockImplementation(() => { throw new Error('missing entry') })
    await expect(invoke('platform:select-microapp-directory')).rejects.toThrow('missing entry')
  })

  it('keeps first-party model credentials in the host channel', async () => {
    const manifest: FirstPartyAppManifest = {
      appId: 'mira-novel-studio', legacyIds: [], enabled: true,
      trustedSource: { type: 'builtin', packagePath: 'novel-studio' },
      entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
      apiCompatibility: { major: 1 }, capabilities: ['models:text.generate'],
    }
    const fetchImpl = vi.fn(async () => new Response('generated')) as unknown as typeof fetch
    const { invoke } = register({ legacyNovelApiToken: 'host-token', firstPartyManifests: [manifest], fetchImpl })
    const grant = await invoke('platform:create-first-party-grant', 'mira-novel-studio')
    await expect(invoke('platform:generate-first-party-text', grant, 'authoring', 'write', { providerId: 'provider', modelId: 'model', apiKey: 'should-not-pass' })).resolves.toBe('generated')
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost/apps/novel/authoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer host-token' },
      body: JSON.stringify({ prompt: 'write', selection: { providerId: 'provider', modelId: 'model' } }),
    })
  })

  it('does not allow an embedded frame to create or use a host grant', async () => {
    const manifest: FirstPartyAppManifest = {
      appId: 'mira-novel-studio', legacyIds: [], enabled: true,
      trustedSource: { type: 'builtin', packagePath: 'novel-studio' },
      entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
      apiCompatibility: { major: 1 }, capabilities: ['models:text.generate'],
    }
    const { invokeFromSubframe } = register({ firstPartyManifests: [manifest] })
    expect(() => invokeFromSubframe('platform:create-first-party-grant', 'mira-novel-studio')).toThrow('宿主主页面')
  })

  it('keeps one owner lifecycle listener across repeated grant creation and revocation', () => {
    const firstPartyGrantStore = new FirstPartyGrantStore()
    const { sender, invoke } = register({ firstPartyGrantStore })
    for (let index = 0; index < 16; index++) {
      const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
      invoke('platform:revoke-first-party-grant', grant)
      expect(firstPartyGrantStore.resolve(grant, sender.id)).toBeUndefined()
    }
    expect(sender.listenerCount('destroyed')).toBe(1)
    sender.emit('destroyed')
    expect(sender.listenerCount('destroyed')).toBe(0)
  })

  it('shares owner destruction cleanup across grants and repeated terminal opens', () => {
    const firstPartyGrantStore = new FirstPartyGrantStore()
    const terminalSessions = { open: vi.fn(), close: vi.fn(), closeForWebContents: vi.fn() }
    const { sender, invoke } = register({ firstPartyGrantStore, terminalSessions, harnessRuntime: {} } as unknown as Partial<PlatformIpcDependencies>)
    const first = invoke('platform:create-first-party-grant', 'mira-harness') as string
    const second = invoke('platform:create-first-party-grant', 'mira-harness') as string
    const unrelated = firstPartyGrantStore.issue('mira-harness', 2, ['harness:workbench'])
    for (let index = 0; index < 16; index++) {
      invoke('platform:first-party-harness', first, 'terminal.open', { sessionId: 'session-1' })
      invoke('platform:first-party-harness', first, 'terminal.close', { sessionId: 'session-1', terminalId: 'terminal-1' })
    }
    expect(sender.listenerCount('destroyed')).toBe(1)
    invoke('platform:revoke-first-party-grant', first)
    expect(firstPartyGrantStore.resolve(second, sender.id)).toBeDefined()
    terminalSessions.closeForWebContents.mockClear()
    sender.emit('destroyed')
    expect(firstPartyGrantStore.resolve(second, sender.id)).toBeUndefined()
    expect(firstPartyGrantStore.resolve(unrelated, 2)).toBeDefined()
    expect(terminalSessions.closeForWebContents).toHaveBeenCalledExactlyOnceWith(sender.id)
    expect(sender.listenerCount('destroyed')).toBe(0)
    expect(() => invoke('platform:first-party-harness', second, 'terminal.open', { sessionId: 'session-1' })).toThrow('授权无效')
  })

  it('keeps destruction hooks and grant cleanup isolated between windows', () => {
    const firstPartyGrantStore = new FirstPartyGrantStore()
    const terminalSessions = { closeForWebContents: vi.fn() }
    const { sender, invoke } = register({ firstPartyGrantStore, terminalSessions } as unknown as Partial<PlatformIpcDependencies>)
    const otherSender = Object.assign(new EventEmitter(), { id: 2 })
    const first = invoke('platform:create-first-party-grant', 'mira-harness') as string
    const second = electron.handlers.get('platform:create-first-party-grant')!({ sender: otherSender }, 'mira-harness') as string
    expect(sender.listenerCount('destroyed')).toBe(1)
    expect(otherSender.listenerCount('destroyed')).toBe(1)
    sender.emit('destroyed')
    expect(firstPartyGrantStore.resolve(first, sender.id)).toBeUndefined()
    expect(firstPartyGrantStore.resolve(second, otherSender.id)).toBeDefined()
    expect(terminalSessions.closeForWebContents).toHaveBeenCalledExactlyOnceWith(sender.id)
    otherSender.emit('destroyed')
    expect(firstPartyGrantStore.resolve(second, otherSender.id)).toBeUndefined()
    expect(terminalSessions.closeForWebContents).toHaveBeenNthCalledWith(2, otherSender.id)
  })

  it('reclaims every owner grant and workspace handle on main-document reload without destroying WebContents', () => {
    const firstPartyGrantStore = new FirstPartyGrantStore()
    const terminalSessions = { closeForWebContents: vi.fn() }
    const workspaceWatch = { closeForWebContents: vi.fn() }
    const { sender, invoke } = register({ firstPartyGrantStore, terminalSessions, workspaceWatch, harnessRuntime: {} } as unknown as Partial<PlatformIpcDependencies>)
    const first = invoke('platform:create-first-party-grant', 'mira-harness') as string
    const second = invoke('platform:create-first-party-grant', 'mira-harness') as string
    const unrelated = firstPartyGrantStore.issue('mira-harness', 2, ['harness:workbench'])
    sender.emit('did-start-navigation', { url: 'http://localhost/index.html', isMainFrame: true, isSameDocument: false })
    expect(firstPartyGrantStore.resolve(first, sender.id)).toBeUndefined()
    expect(firstPartyGrantStore.resolve(second, sender.id)).toBeUndefined()
    expect(firstPartyGrantStore.resolve(unrelated, 2)).toBeDefined()
    expect(terminalSessions.closeForWebContents).toHaveBeenCalledExactlyOnceWith(sender.id)
    expect(workspaceWatch.closeForWebContents).toHaveBeenCalledExactlyOnceWith(sender.id)
    expect(() => invoke('platform:first-party-harness', first, 'sessions.list')).toThrow('授权无效')
    const replacement = invoke('platform:create-first-party-grant', 'mira-harness') as string
    expect(firstPartyGrantStore.resolve(replacement, sender.id)).toBeDefined()
    expect(sender.listenerCount('did-start-navigation')).toBe(1)
    expect(sender.listenerCount('render-process-gone')).toBe(1)
    expect(sender.listenerCount('destroyed')).toBe(1)
  })

  it('preserves grants and live workspace handles for same-document and subframe navigation', () => {
    const firstPartyGrantStore = new FirstPartyGrantStore()
    const terminalSessions = { closeForWebContents: vi.fn() }
    const workspaceWatch = { closeForWebContents: vi.fn() }
    const { sender, invoke } = register({ firstPartyGrantStore, terminalSessions, workspaceWatch } as unknown as Partial<PlatformIpcDependencies>)
    const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
    for (const [isMainFrame, isSameDocument] of [[true, true], [false, false], [false, true]]) {
      sender.emit('did-start-navigation', { url: 'http://localhost/index.html#/settings', isMainFrame, isSameDocument })
      expect(firstPartyGrantStore.resolve(grant, sender.id)).toBeDefined()
    }
    expect(terminalSessions.closeForWebContents).not.toHaveBeenCalled()
    expect(workspaceWatch.closeForWebContents).not.toHaveBeenCalled()
  })

  it('cleans crashed renderer owners repeatedly and lets the recovered renderer register fresh grants', () => {
    const firstPartyGrantStore = new FirstPartyGrantStore()
    const terminalSessions = { closeForWebContents: vi.fn() }
    const workspaceWatch = { closeForWebContents: vi.fn() }
    const { sender, invoke } = register({ firstPartyGrantStore, terminalSessions, workspaceWatch } as unknown as Partial<PlatformIpcDependencies>)
    for (let index = 0; index < 10; index++) {
      const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
      sender.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
      sender.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
      expect(firstPartyGrantStore.resolve(grant, sender.id)).toBeUndefined()
      expect(sender.listenerCount('did-start-navigation')).toBe(1)
      expect(sender.listenerCount('render-process-gone')).toBe(1)
    }
    expect(terminalSessions.closeForWebContents).toHaveBeenCalledTimes(20)
    expect(workspaceWatch.closeForWebContents).toHaveBeenCalledTimes(20)
    sender.emit('destroyed')
    sender.emit('destroyed')
    expect(terminalSessions.closeForWebContents).toHaveBeenCalledTimes(21)
    expect(workspaceWatch.closeForWebContents).toHaveBeenCalledTimes(21)
    expect(sender.listenerCount('did-start-navigation')).toBe(0)
    expect(sender.listenerCount('render-process-gone')).toBe(0)
    expect(sender.listenerCount('destroyed')).toBe(0)
    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    sender.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    expect(workspaceWatch.closeForWebContents).toHaveBeenCalledTimes(21)
  })

  it('keeps first-party novel storage behind the owning grant', () => {
    const manifest: FirstPartyAppManifest = {
      appId: 'mira-novel-studio', legacyIds: [], enabled: true,
      trustedSource: { type: 'builtin', packagePath: 'novel-studio' },
      entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
      apiCompatibility: { major: 1 }, capabilities: ['storage:novel-projects'],
    }
    const { invoke, invokeAs, invokeFromSubframe, database } = register({ firstPartyManifests: [manifest] })
    const grant = invoke('platform:create-first-party-grant', 'mira-novel-studio')
    const project = { version: 1, id: 'project-1', title: 'Project' }
    expect(invoke('platform:first-party-list-novel-projects', grant)).toEqual([{ id: 'project-1' }])
    expect(invoke('platform:first-party-get-novel-project', grant, 'project-1')).toMatchObject(project)
    expect(invoke('platform:first-party-save-novel-project', grant, project)).toBe(project)
    expect(() => invokeAs(2, 'platform:first-party-list-novel-projects', grant)).toThrow('授权无效')
    expect(() => invokeFromSubframe('platform:first-party-list-novel-projects', grant)).toThrow('宿主主页面')
    expect(() => invoke('platform:first-party-get-novel-project', grant, '')).toThrow('作品 ID 无效')
    invoke('platform:revoke-first-party-grant', grant)
    expect(() => invoke('platform:first-party-save-novel-project', grant, project)).toThrow('授权无效')
    expect(database.novels.listProjects).toHaveBeenCalledOnce()
    expect(database.novels.getProject).toHaveBeenCalledOnce()
    expect(database.novels.saveProject).toHaveBeenCalledOnce()
  })

  it('denies novel storage to grants without the storage capability or novel identity', () => {
    const base: FirstPartyAppManifest = {
      appId: 'mira-novel-studio', legacyIds: [], enabled: true,
      trustedSource: { type: 'builtin', packagePath: 'novel-studio' },
      entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
      apiCompatibility: { major: 1 }, capabilities: [],
    }
    const other = { ...base, appId: 'other-app', capabilities: ['storage:novel-projects'] as FirstPartyAppManifest['capabilities'] }
    const { invoke, database } = register({ firstPartyManifests: [base, other] })
    const noCapability = invoke('platform:create-first-party-grant', 'mira-novel-studio')
    const otherApp = invoke('platform:create-first-party-grant', 'other-app')
    expect(() => invoke('platform:first-party-list-novel-projects', noCapability)).toThrow('没有所需能力')
    expect(() => invoke('platform:first-party-list-novel-projects', otherApp)).toThrow('授权无效')
    expect(database.novels.listProjects).not.toHaveBeenCalled()
  })

  it('confines Harness calls to the owning renderer and an active workbench grant', () => {
    const manifest: FirstPartyAppManifest = {
      appId: 'mira-harness', legacyIds: [], enabled: true,
      trustedSource: { type: 'builtin', packagePath: 'harness-react-app' },
      entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
      apiCompatibility: { major: 1 }, capabilities: ['harness:workbench'],
    }
    const harnessRuntime = { abort: vi.fn() }
    const { invoke, invokeAs, invokeFromSubframe } = register({ firstPartyManifests: [manifest], harnessRuntime } as Partial<PlatformIpcDependencies>)
    const grant = invoke('platform:create-first-party-grant', 'mira-harness')
    expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'run.abort', { sessionId: 's' })).toThrow('授权无效')
    expect(() => invokeFromSubframe('platform:first-party-harness', grant, 'run.abort', { sessionId: 's' })).toThrow('宿主主页面')
    expect(() => invoke('platform:first-party-harness', grant, 'run.abort', { sessionId: '' })).toThrow('会话 ID无效')
    expect(harnessRuntime.abort).not.toHaveBeenCalled()
    expect(invoke('platform:first-party-harness', grant, 'run.abort', { sessionId: 's' })).toBeUndefined()
    expect(harnessRuntime.abort).toHaveBeenCalledWith('s')
    invoke('platform:revoke-first-party-grant', grant)
    expect(() => invoke('platform:first-party-harness', grant, 'run.abort', { sessionId: 's' })).toThrow('授权无效')
    expect(harnessRuntime.abort).toHaveBeenCalledTimes(1)
  })

  it('rejects personal-workspace file selection before opening a picker and preserves project-file validation', async () => {
    const manifest: FirstPartyAppManifest = {
      appId: 'mira-harness', legacyIds: [], enabled: true,
      trustedSource: { type: 'builtin', packagePath: 'harness-react-app' },
      entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
      apiCompatibility: { major: 1 }, capabilities: ['harness:workbench'],
    }
    const { invoke, database } = register({ firstPartyManifests: [manifest], harnessRuntime: {} } as Partial<PlatformIpcDependencies>)
    const grant = invoke('platform:create-first-party-grant', 'mira-harness')
    database.harness.getSession.mockReturnValueOnce({ id: 'personal', projectId: undefined, workingDirectory: process.cwd() } as any)
    expect(() => invoke('platform:first-party-harness', grant, 'files.select', { sessionId: 'personal' })).toThrow('请先选择项目')
    expect(electron.showOpenDialog).not.toHaveBeenCalled()

    electron.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['README.md'] })
    await expect(invoke('platform:first-party-harness', grant, 'files.select', { sessionId: 'project-session' })).resolves.toEqual([{ path: 'README.md' }])
    expect(database.harness.selectFileReferences).toHaveBeenCalledWith('project', ['README.md'])
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    await expect(invoke('platform:first-party-harness', grant, 'files.select', { sessionId: 'project-session' })).resolves.toEqual([])
    expect(database.harness.selectFileReferences).toHaveBeenCalledTimes(1)
  })

  it('releases deleted task browser views while keeping grants and live controls checked', () => {
    const manifest: FirstPartyAppManifest = {
      appId: 'mira-harness', legacyIds: [], enabled: true,
      trustedSource: { type: 'builtin', packagePath: 'harness-react-app' },
      entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
      apiCompatibility: { major: 1 }, capabilities: ['harness:workbench'],
    }
    const { invoke, invokeAs, database } = register({ firstPartyManifests: [manifest], harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
    const grant = invoke('platform:create-first-party-grant', 'mira-harness')
    database.harness.getSession.mockImplementation(() => { throw new Error('会话不存在') })
    for (const action of ['close', 'hide']) {
      expect(invoke('platform:first-party-harness', grant, 'browser.control', { sessionId: 'deleted', action })).toMatchObject({ sessionId: 'deleted', action })
      expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'browser.control', { sessionId: 'deleted', action })).toThrow('授权无效')
    }
    expect(() => invoke('platform:first-party-harness', grant, 'browser.control', { sessionId: 'deleted', action: 'show' })).toThrow('会话不存在')
    expect(() => invoke('platform:first-party-harness', grant, 'browser.control', { sessionId: 'deleted', action: 'reload' })).toThrow('会话不存在')
  })

  it('resolves files only from the active session project directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-platform-files-'))
    try {
      await writeFile(join(root, 'README.md'), '# Mira\n')
      const manifest: FirstPartyAppManifest = {
        appId: 'mira-harness', legacyIds: [], enabled: true,
        trustedSource: { type: 'builtin', packagePath: 'harness-react-app' },
        entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
        apiCompatibility: { major: 1 }, capabilities: ['harness:workbench'],
      }
      const registered = register({ firstPartyManifests: [manifest], harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
      vi.mocked(registered.database.harness.getProject).mockReturnValue({ id: 'project', directory: root } as never)
      const grant = registered.invoke('platform:create-first-party-grant', 'mira-harness')
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.list', { sessionId: 'session-1', path: '' })).resolves.toMatchObject({ path: '', entries: [{ name: 'README.md', type: 'file' }] })
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.read', { sessionId: 'session-1', path: 'README.md' })).resolves.toEqual({ path: 'README.md', content: '# Mira\n' })
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.search', { sessionId: 'session-1', query: 'readme', root: '/private/injected' })).resolves.toEqual({ entries: [{ name: 'README.md', path: 'README.md', type: 'file' }], truncated: false })
      expect(registered.database.harness.getSession).toHaveBeenCalledWith('session-1')
      expect(registered.database.harness.getProject).toHaveBeenCalledWith('project')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('requires a current workbench grant and resolves search roots again after a session changes project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-platform-search-'))
    const other = await mkdtemp(join(tmpdir(), 'mira-platform-search-'))
    try {
      await writeFile(join(root, 'first.md'), 'first')
      await writeFile(join(other, 'second.md'), 'second')
      const registered = register({ harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
      registered.database.harness.getProject.mockReturnValue({ id: 'project', directory: root })
      const grant = registered.invoke('platform:create-first-party-grant', 'mira-harness')
      expect(() => registered.invokeAs(2, 'platform:first-party-harness', grant, 'files.search', { sessionId: 's', query: 'md' })).toThrow('授权无效')
      expect(() => registered.invokeFromSubframe('platform:first-party-harness', grant, 'files.search', { sessionId: 's', query: 'md' })).toThrow('宿主主页面')
      expect(() => registered.invoke('platform:first-party-harness', grant, 'files.search', { sessionId: 's', query: 'x'.repeat(257) })).toThrow('搜索关键词无效')
      expect(() => registered.invoke('platform:first-party-harness', grant, 'files.search', { sessionId: 's', query: 'md', refresh: 'true' })).toThrow('刷新状态无效')
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.search', { sessionId: 's', query: 'md', workspacePath: other })).resolves.toMatchObject({ entries: [{ path: 'first.md' }] })
      registered.database.harness.getProject.mockReturnValue({ id: 'project', directory: other })
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.search', { sessionId: 's', query: 'md' })).resolves.toMatchObject({ entries: [{ path: 'second.md' }] })
      registered.database.harness.getSession.mockReturnValue({ id: 's', projectId: undefined, workingDirectory: root } as never)
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.search', { sessionId: 's', query: 'md' })).resolves.toMatchObject({ entries: [{ path: 'first.md' }] })
      registered.invoke('platform:revoke-first-party-grant', grant)
      expect(() => registered.invoke('platform:first-party-harness', grant, 'files.search', { sessionId: 's', query: 'md' })).toThrow('授权无效')
    } finally {
      await Promise.all([root, other].map(directory => rm(directory, { recursive: true, force: true })))
    }
  })

  it.each(['revoked-grant', 'changed-project-directory', 'destroyed-sender'] as const)('does not initialize search rules when %s invalidates authorization during the final asynchronous directory checks', async invalidation => {
    const root = await mkdtemp(join(tmpdir(), 'mira-platform-search-authorization-'))
    const other = await mkdtemp(join(tmpdir(), 'mira-platform-search-authorization-'))
    try {
      await writeFile(join(root, 'needle.md'), 'original workspace')
      await writeFile(join(other, 'needle.md'), 'replacement workspace')
      const firstPartyGrantStore = new FirstPartyGrantStore()
      const registered = register({ firstPartyGrantStore, harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
      const isDestroyed = vi.fn(() => false)
      Object.assign(registered.sender, { isDestroyed })
      const grant = registered.invoke('platform:create-first-party-grant', 'mira-harness') as string
      let directory = root
      let reads = 0
      let invalidated = false
      registered.database.harness.getProject.mockImplementation(() => {
        // Root resolution, search/load authorization, then initialization's pre-commit authorization.
        if (++reads === 4) queueMicrotask(() => {
          if (invalidation === 'revoked-grant') registered.invoke('platform:revoke-first-party-grant', grant)
          else if (invalidation === 'changed-project-directory') directory = other
          else isDestroyed.mockReturnValue(true)
          invalidated = true
        })
        return { id: 'project', directory }
      })
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.search', { sessionId: 's', query: 'needle' })).rejects.toThrow(/^工作目录搜索未完成$/)
      expect(invalidated).toBe(true)
      expect(reads).toBe(invalidation === 'changed-project-directory' ? 5 : 4)
      if (invalidation === 'revoked-grant') expect(firstPartyGrantStore.resolve(grant, registered.sender.id)).toBeUndefined()
      else expect(firstPartyGrantStore.resolve(grant, registered.sender.id)).toBeDefined()
      for (const directory of [root, other]) {
        await expect(readFile(join(directory, '.miraignore'))).rejects.toMatchObject({ code: 'ENOENT' })
        expect(await readdir(directory)).toEqual(['needle.md'])
      }
      expect(await readFile(join(root, 'needle.md'), 'utf8')).toBe('original workspace')
      expect(await readFile(join(other, 'needle.md'), 'utf8')).toBe('replacement workspace')
    } finally {
      await Promise.all([root, other].map(directory => rm(directory, { recursive: true, force: true })))
    }
  })

  it('resolves Git status and ignored paths from the persisted session root, stripping untrusted command controls', async () => {
    const status = vi.spyOn(workspaceGit, 'readHarnessWorkspaceGit').mockResolvedValue({ available: true, entries: [{ path: 'mira.ts', status: 'modified' }] })
    const ignored = vi.spyOn(workspaceGit, 'readHarnessWorkspaceIgnored').mockResolvedValue(['build'])
    try {
      const registered = register({ harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
      registered.database.harness.getProject.mockReturnValue({ id: 'project', directory: '/mira-project' })
      const grant = registered.invoke('platform:create-first-party-grant', 'mira-harness')
      const params = { sessionId: 's', paths: ['build'], root: '/private/injected', command: 'reset', args: ['--hard'] }
      for (const method of ['files.git-status', 'files.git-ignored']) {
        expect(() => registered.invokeAs(2, 'platform:first-party-harness', grant, method, params)).toThrow('授权无效')
        expect(() => registered.invokeFromSubframe('platform:first-party-harness', grant, method, params)).toThrow('宿主主页面')
      }
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.git-status', params)).resolves.toMatchObject({ available: true })
      expect(status).toHaveBeenLastCalledWith('/mira-project')
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.git-ignored', params)).resolves.toEqual(['build'])
      expect(ignored).toHaveBeenLastCalledWith('/mira-project', ['build'])
      registered.database.harness.getSession.mockReturnValue({ id: 's', projectId: undefined, workingDirectory: '/personal-workspace' } as never)
      await registered.invoke('platform:first-party-harness', grant, 'files.git-status', params)
      expect(status).toHaveBeenLastCalledWith('/personal-workspace')
      expect(() => registered.invoke('platform:first-party-harness', grant, 'files.git-ignored', { sessionId: 's', paths: ['../secret'] })).toThrow('路径无效')
    } finally { status.mockRestore(); ignored.mockRestore() }
  })

  it.each(['files.git-status', 'files.git-ignored'])('%s discards in-flight data after grant revocation or persisted root changes', async method => {
    const helper = method === 'files.git-status' ? 'readHarnessWorkspaceGit' : 'readHarnessWorkspaceIgnored'
    let finish!: (value: any) => void
    const read = vi.spyOn(workspaceGit, helper).mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
    try {
      const registered = register({ harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
      registered.database.harness.getProject.mockReturnValue({ id: 'project', directory: '/mira-project' })
      const grant = registered.invoke('platform:create-first-party-grant', 'mira-harness')
      const revoked = registered.invoke('platform:first-party-harness', grant, method, { sessionId: 's', paths: ['build'] })
      registered.invoke('platform:revoke-first-party-grant', grant)
      finish(method === 'files.git-status' ? { available: true, entries: [] } : [])
      await expect(revoked).rejects.toThrow('授权无效')
      const nextGrant = registered.invoke('platform:create-first-party-grant', 'mira-harness')
      const changed = registered.invoke('platform:first-party-harness', nextGrant, method, { sessionId: 's', paths: ['build'] })
      registered.database.harness.getProject.mockReturnValue({ id: 'project', directory: '/other-project' })
      finish(method === 'files.git-status' ? { available: true, entries: [] } : [])
      await expect(changed).rejects.toThrow('工作目录已变化')
    } finally { read.mockRestore() }
  })

  it('requires an owner workbench grant and resolves image roots from the active session on every read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-platform-image-'))
    const other = await mkdtemp(join(tmpdir(), 'mira-platform-image-'))
    try {
      await writeFile(join(root, 'image.png'), 'first image')
      await writeFile(join(other, 'image.png'), 'second image')
      const registered = register({ harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
      registered.database.harness.getProject.mockReturnValue({ id: 'project', directory: root })
      const grant = registered.invoke('platform:create-first-party-grant', 'mira-harness')
      expect(() => registered.invokeAs(2, 'platform:first-party-harness', grant, 'files.read-image', { sessionId: 's', path: 'image.png' })).toThrow('授权无效')
      expect(() => registered.invokeFromSubframe('platform:first-party-harness', grant, 'files.read-image', { sessionId: 's', path: 'image.png' })).toThrow('宿主主页面')
      const params = { sessionId: 's', path: 'image.png', workspacePath: other, mediaType: 'text/html', maxBytes: 99999999 }
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.read-image', params)).resolves.toEqual({ path: 'image.png', mediaType: 'image/png', dataBase64: Buffer.from('first image').toString('base64'), byteLength: 11 })
      registered.database.harness.getProject.mockReturnValue({ id: 'project', directory: other })
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.read-image', params)).resolves.toMatchObject({ dataBase64: Buffer.from('second image').toString('base64') })
      registered.database.harness.getSession.mockReturnValue({ id: 's', projectId: undefined, workingDirectory: root } as never)
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.read-image', params)).resolves.toMatchObject({ dataBase64: Buffer.from('first image').toString('base64') })
      registered.database.harness.getSession.mockReturnValue({ id: 's', projectId: undefined, workingDirectory: undefined } as never)
      expect(() => registered.invoke('platform:first-party-harness', grant, 'files.read-image', params)).toThrow('没有可用工作目录')
      registered.database.harness.getSession.mockImplementation(() => { throw new Error('会话不存在') })
      expect(() => registered.invoke('platform:first-party-harness', grant, 'files.read-image', params)).toThrow('会话不存在')
      registered.invoke('platform:revoke-first-party-grant', grant)
      expect(() => registered.invoke('platform:first-party-harness', grant, 'files.read-image', params)).toThrow('授权无效')
    } finally {
      await Promise.all([root, other].map(directory => rm(directory, { recursive: true, force: true })))
    }
  })

  it('rejects unregistered apps, missing capabilities, and malformed model requests', async () => {
    const manifest: FirstPartyAppManifest = {
      appId: 'mira-novel-studio', legacyIds: [], enabled: true,
      trustedSource: { type: 'builtin', packagePath: 'novel-studio' },
      entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
      apiCompatibility: { major: 1 }, capabilities: [],
    }
    const fetchImpl = vi.fn(async () => new Response('generated')) as unknown as typeof fetch
    const { invoke } = register({ legacyNovelApiToken: 'host-token', firstPartyManifests: [manifest], fetchImpl })
    const selection = { providerId: 'provider', modelId: 'model' }
    expect(() => invoke('platform:create-first-party-grant', 'unknown')).toThrow('未登记')
    const grant = await invoke('platform:create-first-party-grant', 'mira-novel-studio')
    await expect(invoke('platform:generate-first-party-text', grant, 'authoring', 'write', selection)).rejects.toThrow('没有模型生成能力')
    manifest.capabilities.push('models:text.generate')
    const enabledGrant = await invoke('platform:create-first-party-grant', 'mira-novel-studio')
    await expect(invoke('platform:generate-first-party-text', enabledGrant, 'invalid', 'write', selection)).rejects.toThrow('模型职责无效')
    await expect(invoke('platform:generate-first-party-text', enabledGrant, 'authoring', '', selection)).rejects.toThrow('模型请求内容 无效')
    await expect(invoke('platform:generate-first-party-text', enabledGrant, 'authoring', 'write', { providerId: 'provider' })).rejects.toThrow('模型 ID 无效')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reaches the local model route only with the host-held grant', async () => {
    const route = vi.fn((_path, _request, response) => response.writeHead(200).end('generated'))
    const server = new LocalMicroAppServer({ apiHandlers: new Map([['novel', { capability: 'models:text.generate', handle: route }]]) })
    await server.start([])
    try {
      const manifest: FirstPartyAppManifest = {
        appId: 'mira-novel-studio', legacyIds: [], enabled: true,
        trustedSource: { type: 'builtin', packagePath: 'novel-studio' },
        entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
        apiCompatibility: { major: 1 }, capabilities: ['models:text.generate'],
      }
      const token = server.issueApiToken('novel', ['models:text.generate'])
      const { invoke, invokeAs } = register({ localMicroAppServer: server, legacyNovelApiToken: token, firstPartyManifests: [manifest] })
      const selection = { providerId: 'provider', modelId: 'model' }
      const grant = await invoke('platform:create-first-party-grant', 'mira-novel-studio')
      await expect(invoke('platform:generate-first-party-text', grant, 'authoring', 'write', selection)).resolves.toBe('generated')
      await expect(invokeAs(2, 'platform:generate-first-party-text', grant, 'authoring', 'write', selection)).rejects.toThrow('授权无效')
      expect(route).toHaveBeenCalledOnce()
      invoke('platform:revoke-first-party-grant', grant)
      await expect(invoke('platform:generate-first-party-text', grant, 'authoring', 'write', selection)).rejects.toThrow('授权无效')
      server.revokeApiToken(token)
      const replacementGrant = await invoke('platform:create-first-party-grant', 'mira-novel-studio')
      await expect(invoke('platform:generate-first-party-text', replacementGrant, 'authoring', 'write', selection)).rejects.toThrow('403')
    } finally {
      await server.stop()
    }
  })
})
