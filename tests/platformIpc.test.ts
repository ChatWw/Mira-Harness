import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlatformIpcDependencies } from '../electron/ipc/platformIpc'
import { LocalMicroAppServer } from '../electron/adapters/localMicroAppServer'
import type { FirstPartyAppManifest } from '../src/config/firstPartyApps'

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
  const sender = { id: 1, once: vi.fn() }
  const invoke = (channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender }, ...args)
  const invokeAs = (id: number, channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender: { id, once: vi.fn() } }, ...args)
  const invokeFromSubframe = (channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender, senderFrame: { parent: {} } }, ...args)
  return { database, localMicroAppServer, snapshot, invoke, invokeAs, invokeFromSubframe }
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
      expect(registered.database.harness.getSession).toHaveBeenCalledWith('session-1')
      expect(registered.database.harness.getProject).toHaveBeenCalledWith('project')
    } finally {
      await rm(root, { recursive: true, force: true })
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
