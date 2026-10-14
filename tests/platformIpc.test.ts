import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlatformIpcDependencies } from '../electron/ipc/platformIpc'
import { LocalMicroAppServer } from '../electron/adapters/localMicroAppServer'
import type { FirstPartyAppManifest } from '../src/config/firstPartyApps'
import { FirstPartyGrantStore } from '../electron/security/firstPartyGrant'
import * as workspaceGit from '../electron/services/harnessWorkspaceGit'
import * as workspaceFiles from '../electron/services/harnessWorkspaceFiles'
import { handleFirstPartyRequest } from '../src/platform/firstPartyBridge'
import { firstPartyAppManifests } from '../src/config/firstPartyApps'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraPaths } from '../electron/storage/miraPaths'
import { McpConfigStore } from '../electron/storage/mcpConfigStore'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import { miraPluginItems } from '../src/config/miraPlugins'
import { MiraWorkspaceMedia } from '../electron/services/miraWorkspaceMedia'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => electron.handlers.set(channel, handler)),
  fromWebContents: vi.fn(() => null),
  getFocusedWindow: vi.fn(() => null),
  showOpenDialog: vi.fn(),
  readClipboard: vi.fn(),
  openExternal: vi.fn(async () => undefined),
  openPath: vi.fn(async () => ''),
  guestFromId: vi.fn(),
  browserSession: { on: vi.fn() },
}))

vi.mock('electron', () => ({
  ipcMain: { handle: electron.handle },
  webContents: { fromId: electron.guestFromId },
  session: { fromPartition: () => electron.browserSession },
  BrowserWindow: { fromWebContents: electron.fromWebContents, getFocusedWindow: electron.getFocusedWindow },
  dialog: { showOpenDialog: electron.showOpenDialog },
  clipboard: { readText: electron.readClipboard },
  shell: { openExternal: electron.openExternal, openPath: electron.openPath },
}))

import { registerPlatformIpcHandlers } from '../electron/ipc/platformIpc'

function register(options: Partial<PlatformIpcDependencies> = {}) {
  const snapshot = { microApps: [{ id: 'micro-sample' }] }
  const database = {
    getSnapshot: vi.fn(() => snapshot),
    savePreference: vi.fn((key, value) => ({ key, value })),
    removeHarnessDraftOwners: vi.fn(),
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
      sideConversationIds: vi.fn(() => []),
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
  const sender = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false })
  const invoke = (channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender }, ...args)
  const invokeAs = (id: number, channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender: { id, once: vi.fn() } }, ...args)
  const invokeFromSubframe = (channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender, senderFrame: { parent: {} } }, ...args)
  return { database, localMicroAppServer, snapshot, sender, invoke, invokeAs, invokeFromSubframe }
}

describe('platform IPC registration', () => {
  it('reads exact-task model records and diagnostic paths through the owner grant, and rechecks revoked asynchronous access', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-trace-ipc-')), database = new PlatformDatabase(root)
    try {
      const task = database.harness.createSession(), other = database.harness.createSession()
      const view = register({ database, harnessRuntime: {} as never })
      const grant = view.invoke('platform:create-first-party-grant', 'mira-harness') as string
      const record = { id: 'call', sessionId: task.id, source: 'main' as const, providerId: 'local', providerName: 'Local', modelId: 'model', startedAt: 1, status: 'completed' as const, request: { messages: [{ role: 'user', content: 'EXACT_TASK' }] } }
      database.modelTrace.write(record)
      const paths = view.invoke('platform:first-party-harness', grant, 'session.paths', { id: task.id, path: '/untrusted' }) as any
      expect(paths.sessionFile).toBe(new MiraPaths(root).session(task.id))
      expect(paths.modelTrace).toBe(database.modelTrace.path(task.id))
      expect(paths.runtimeLog).toContain('harness-')
      expect(await view.invoke('platform:first-party-harness', grant, 'session.trace', { id: task.id, path: '/untrusted' })).toMatchObject({ sessionId: task.id, records: [record] })
      expect(await view.invoke('platform:first-party-harness', grant, 'session.trace', { id: other.id })).toMatchObject({ records: [] })
      expect(() => view.invokeAs(2, 'platform:first-party-harness', grant, 'session.trace', { id: task.id })).toThrow('授权无效')
      expect(() => view.invoke('platform:first-party-harness', grant, 'session.paths', { id: '../outside' })).toThrow()
      await view.invoke('platform:first-party-harness', grant, 'session.trace.open', { id: task.id, path: '/untrusted' })
      expect(electron.openPath).toHaveBeenLastCalledWith(database.modelTrace.directory)
      const read = view.invoke('platform:first-party-harness', grant, 'session.trace', { id: task.id }) as Promise<unknown>
      view.invoke('platform:revoke-first-party-grant', grant)
      await expect(read).rejects.toThrow('授权无效')
    } finally { database.close(); await rm(root, { recursive: true, force: true }) }
  })
  it('removes a project with its tasks and automations through the harness bridge and refuses while it is running', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-project-remove-ipc-')), database = new PlatformDatabase(root)
    try {
      const project = database.harness.createProject(root, '移除我'), session = database.harness.createSession(project.id)
      const automation = database.automations.saveTask({ name: '每早汇总', projectId: project.id, trigger: { type: 'cron', expression: '0 9 * * *' }, target: { type: 'new-session' }, prompt: '汇总昨天的改动', model: { providerId: 'local', modelId: 'model' }, permissionMode: 'default' })
      await mkdir(join(root, 'keep'), { recursive: true })
      const other = database.harness.createProject(join(root, 'keep'), '保留我')
      let running = true
      const reschedule = vi.fn(), closeInvalid = vi.fn()
      const view = register({ database, harnessRuntime: { isProjectRunning: (id: string) => running && id === project.id } as never, automationScheduler: { reschedule } as never, workspaceWatch: { closeInvalid } as never })
      const grant = view.invoke('platform:create-first-party-grant', 'mira-harness') as string
      expect(() => view.invoke('platform:first-party-harness', grant, 'projects.remove', { id: project.id })).toThrow('请先停止项目任务并处理待发送消息')
      expect(database.harness.listProjects().map(item => item.id)).toContain(project.id)
      expect(database.automations.listTasks().map(task => task.id)).toContain(automation.id)
      running = false
      expect(view.invoke('platform:first-party-harness', grant, 'projects.remove', { id: project.id })).toBeUndefined()
      expect(database.harness.listProjects().map(item => item.id)).toEqual([other.id])
      expect(() => database.harness.getSession(session.id)).toThrow()
      expect(database.automations.listTasks()).toEqual([])
      expect(() => view.invoke('platform:first-party-harness', grant, 'projects.remove', { id: 'missing' })).toThrow('未找到项目')
      expect(closeInvalid).toHaveBeenCalledOnce(); expect(reschedule).toHaveBeenCalledOnce()
    } finally { database.close(); await rm(root, { recursive: true, force: true }) }
  })

  it('persists actual built-in model overrides through owner-checked IPC and refuses fake identities', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-agent-model-ipc-')), database = new PlatformDatabase(root)
    try {
      const { invoke, invokeAs, invokeFromSubframe } = register({ database, harnessRuntime: {} as never })
      const provider = database.models.save({ providerKey: 'custom', name: 'Local model', endpoint: 'http://127.0.0.1:9000/v1', authMode: 'none', models: [{ id: 'child-model', enabled: true, reasoning: true, contextWindow: 16384 }], enabled: true })
      const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
      const target = { kind: 'builtin', name: 'reviewer' }, modelSelection = { providerId: provider.id, modelId: 'child-model', thinkingLevel: 'low' }
      expect(invoke('platform:agent-models', 'agent-models.set', { target, modelSelection })).toEqual({ target, modelSelection })
      expect(invoke('platform:first-party-harness', grant, 'agent-models.list')).toContainEqual({ target, modelSelection })
      expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'agent-models.set', { target })).toThrow('授权无效')
      expect(() => invokeFromSubframe('platform:agent-models', 'agent-models.list')).toThrow('主页面')
      expect(() => invoke('platform:agent-models', 'agent-models.set', { target: { kind: 'builtin', name: 'constructor' }, modelSelection })).toThrow('目标')
      expect(() => invoke('platform:agent-models', 'agent-models.set', { target: { ...target, path: root }, modelSelection })).toThrow('目标')
      expect(() => invoke('platform:agent-models', 'agent-models.set', { target, modelSelection: { ...modelSelection, apiKey: 'untrusted' } })).toThrow('选择')
      expect(() => invoke('platform:agent-models', 'agent-models.set', { target: { kind: 'plugin', pluginId: 'fake@local', name: 'fake:agent' }, modelSelection })).toThrow('未安装')
      expect(invoke('platform:first-party-harness', grant, 'agent-models.set', { target })).toEqual({ target })
      expect(database.agentModels.get(target as any)).toBeUndefined()
    } finally { database.close(); await rm(root, { recursive: true, force: true }) }
  })
  it('manages user Agents through host project IDs, revisions and owner grants', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-user-agent-ipc-')), database = new PlatformDatabase(root)
    try {
      const directory = join(root, 'project'); await mkdir(directory)
      const project = database.harness.createProject(directory), { invoke, invokeAs, invokeFromSubframe } = register({ database, harnessRuntime: {} as never })
      const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
      const source = (body: string) => `---\nname: mira-auditor\ndescription: Audit requested files\ntools: Read\n---\n${body}`
      const global = invoke('platform:user-agents', 'agents.save', { scope: 'global', name: 'mira-auditor', source: source('GLOBAL') }) as any
      const local = invoke('platform:first-party-harness', grant, 'agents.save', { scope: 'project', projectId: project.id, name: 'mira-auditor', source: source('PROJECT'), directory: '/untrusted' }) as any
      expect(invoke('platform:first-party-harness', grant, 'agents.list', { projectId: project.id })).toEqual([expect.objectContaining({ scope: 'project', revision: local.revision }), expect.objectContaining({ scope: 'global', shadowed: true })])
      expect(invoke('platform:user-agents', 'agents.read', { scope: 'project', projectId: project.id, name: 'mira-auditor' })).toMatchObject({ source: source('PROJECT') })
      expect(() => invoke('platform:user-agents', 'agents.save', { scope: 'project', name: 'mira-auditor', source: source('INJECTED'), directory: root })).toThrow('选择项目')
      expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'agents.list')).toThrow('授权无效')
      expect(() => invokeFromSubframe('platform:user-agents', 'agents.list')).toThrow('主页面')
      expect(() => invoke('platform:user-agents', 'agents.setEnabled', { scope: 'global', name: 'mira-auditor', enabled: false })).toThrow('版本')
      expect(() => invoke('platform:user-agents', 'agents.delete', { scope: 'global', name: 'mira-auditor', expectedRevision: 'f'.repeat(64) })).toThrow('修改')
      const disabled = invoke('platform:first-party-harness', grant, 'agents.setEnabled', { scope: 'project', projectId: project.id, name: 'mira-auditor', enabled: false, expectedRevision: local.revision }) as any
      expect(disabled.enabled).toBe(false)
      expect(() => database.userAgents.resolve('mira-auditor', directory)).toThrow('停用')
      invoke('platform:first-party-harness', grant, 'agents.delete', { scope: 'project', projectId: project.id, name: 'mira-auditor', expectedRevision: disabled.revision })
      expect(database.userAgents.resolve('mira-auditor', directory)).toMatchObject({ scope: 'global', body: 'GLOBAL' })
      invoke('platform:user-agents', 'agents.delete', { scope: 'global', name: 'mira-auditor', expectedRevision: global.revision })
      expect(invoke('platform:user-agents', 'agents.list')).toEqual([])
    } finally { database.close(); await rm(root, { recursive: true, force: true }) }
  })
  it('manages custom commands through host project IDs without trusting renderer directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-command-ipc-')), database = new PlatformDatabase(root)
    try {
      const directory = join(root, 'project'); await mkdir(directory)
      const project = database.harness.createProject(directory), { invoke, invokeAs, invokeFromSubframe } = register({ database, harnessRuntime: {} as never })
      const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
      const global = invoke('platform:prompt-commands', 'commands.save', { scope: 'global', name: 'review', source: 'GLOBAL' }) as any
      const local = invoke('platform:first-party-harness', grant, 'commands.save', { scope: 'project', projectId: project.id, name: 'review', source: 'PROJECT', directory: '/untrusted' }) as any
      expect(invoke('platform:first-party-harness', grant, 'commands.list', { projectId: project.id })).toEqual([expect.objectContaining({ scope: 'project', revision: local.revision }), expect.objectContaining({ scope: 'global', shadowed: true })])
      expect(invoke('platform:prompt-commands', 'commands.read', { scope: 'project', projectId: project.id, name: 'review' })).toMatchObject({ source: 'PROJECT' })
      expect(() => invoke('platform:prompt-commands', 'commands.save', { scope: 'project', name: 'review', source: 'INJECTED', directory: root })).toThrow('选择项目')
      expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'commands.list')).toThrow('授权无效')
      expect(() => invokeFromSubframe('platform:prompt-commands', 'commands.list')).toThrow('主页面')
      expect(() => invoke('platform:prompt-commands', 'commands.save', { scope: 'global', name: 'review', source: 'STALE', expectedRevision: 'f'.repeat(64) })).toThrow('修改')
      invoke('platform:prompt-commands', 'commands.delete', { scope: 'global', name: 'review', expectedRevision: global.revision })
      expect(invoke('platform:prompt-commands', 'commands.list')).toEqual([])
    } finally { database.close(); await rm(root, { recursive: true, force: true }) }
  })
  it('limits manual compaction to the owner grant and rechecks authorization after waiting', async () => {
    let authorize!: () => void
    const compactConversation = vi.fn(async (_sender, _id, _selection, guard) => { authorize = guard; return { status: 'unchanged' } })
    const { invoke, invokeAs, sender } = register({ harnessRuntime: { compactConversation } as never })
    const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
    const selection = { providerId: 'provider', modelId: 'model' }
    await expect(invoke('platform:first-party-harness', grant, 'context.compact', { sessionId: 'task', selection, summary: 'Injected summary', messages: [] })).resolves.toEqual({ status: 'unchanged' })
    expect(compactConversation).toHaveBeenCalledExactlyOnceWith(sender, 'task', selection, expect.any(Function), undefined)
    expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'context.compact', { sessionId: 'task', selection })).toThrow('授权无效')
    expect(() => invoke('platform:first-party-harness', grant, 'context.compact', { sessionId: 'task' })).toThrow()
    invoke('platform:revoke-first-party-grant', grant)
    expect(authorize).toThrow('授权无效')
  })

  it('admits exact reply forks only through an owner grant and mutable source task', () => {
    const assertSessionMutable = vi.fn(), forkConversation = vi.fn(() => ({ id: 'new-task' }))
    const { invoke, invokeAs, database } = register({ harnessRuntime: { assertSessionMutable } as never })
    Object.assign(database.harness, { forkConversation })
    const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
    const params = { id: 'source', messageId: 'reply', requestId: '55cabc22-257e-41d4-8ec2-9fc83671dd12', messages: [{ content: 'injected' }] }
    expect(invoke('platform:first-party-harness', grant, 'session.fork', params)).toEqual({ id: 'new-task' })
    expect(assertSessionMutable).toHaveBeenCalledExactlyOnceWith('source')
    expect(forkConversation).toHaveBeenCalledExactlyOnceWith(params.id, params.messageId, params.requestId)
    expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'session.fork', params)).toThrow('授权无效')
    expect(() => invoke('platform:first-party-harness', grant, 'session.fork', { ...params, requestId: '../invalid' })).toThrow('请求 ID')
    assertSessionMutable.mockImplementationOnce(() => { throw new Error('请先处理待发送消息') })
    expect(() => invoke('platform:first-party-harness', grant, 'session.fork', params)).toThrow('待发送消息')
    expect(forkConversation).toHaveBeenCalledOnce()
  })

  it('reads directory-scoped input history under the Harness owner grant and rejects ambiguous scope', () => {
    const { invoke, invokeAs, database } = register({ harnessRuntime: {} as never })
    const list = vi.fn(() => ['Accepted input'])
    Object.assign(database, { promptHistory: { list } })
    Object.assign(database.harness, { getSession: vi.fn(() => ({ workingDirectory: '/session-directory', projectId: 'project' })), getProject: vi.fn(() => ({ directory: '/project-directory' })) })
    const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
    expect(invoke('platform:first-party-harness', grant, 'input-history.list', { sessionId: 'session', directory: '/injected' })).toEqual(['Accepted input'])
    expect(list).toHaveBeenLastCalledWith('/session-directory')
    invoke('platform:first-party-harness', grant, 'input-history.list', { projectId: 'project' })
    expect(list).toHaveBeenLastCalledWith('/project-directory')
    invoke('platform:first-party-harness', grant, 'input-history.list', {})
    expect(list).toHaveBeenLastCalledWith(undefined)
    expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'input-history.list', {})).toThrow('授权无效')
    expect(() => invoke('platform:first-party-harness', grant, 'input-history.list', { sessionId: 's', projectId: 'p' })).toThrow('输入历史范围无效')
    expect(list).toHaveBeenCalledTimes(3)
  })
  beforeEach(() => {
    electron.handlers.clear()
    vi.clearAllMocks()
  })

  it('binds a complete archive snapshot to its grant and consumes only that frozen scope once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-archive-ipc-'))
    const database = new PlatformDatabase(root)
    try {
      const runtime = new HarnessRuntime(database, { getTools: () => [] } as never)
      const workspaceWatch = { closeForSession: vi.fn(), closeForGrant: vi.fn(), closeForWebContents: vi.fn() }
      const { invoke } = register({ database, harnessRuntime: runtime, workspaceWatch: workspaceWatch as never })
      const sessions = Array.from({ length: 53 }, () => database.harness.createSession())
      database.harness.archiveSessions(sessions.map(session => session.id))
      const first = invoke('platform:create-first-party-grant', 'mira-harness') as string
      const second = invoke('platform:create-first-party-grant', 'mira-harness') as string
      const snapshot = invoke('platform:first-party-harness', first, 'sessions.archived-snapshot') as { snapshotId: string; count: number }
      expect(snapshot.count).toBe(53)
      expect(() => invoke('platform:first-party-harness', second, 'sessions.delete-archived', { snapshotId: snapshot.snapshotId })).toThrow('归档快照已失效')
      database.harness.restoreSessions([sessions[0].id])
      const later = database.harness.createSession(); database.harness.archiveSessions([later.id])
      const deletion = invoke('platform:first-party-harness', first, 'sessions.delete-archived', { snapshotId: snapshot.snapshotId }) as Promise<{ deletedIds: string[]; skippedIds: string[]; failedIds: string[] }>
      expect(() => invoke('platform:first-party-harness', first, 'sessions.delete-archived', { snapshotId: snapshot.snapshotId })).toThrow('归档快照已失效')
      const result = await deletion
      expect(result.deletedIds).toHaveLength(52); expect(result.skippedIds).toEqual([sessions[0].id]); expect(result.failedIds).toEqual([])
      expect(database.harness.archivedSessionIds()).toEqual([later.id])
      expect(workspaceWatch.closeForSession).toHaveBeenCalledTimes(52)
      const superseded = invoke('platform:first-party-harness', first, 'sessions.archived-snapshot') as { snapshotId: string }
      const latest = invoke('platform:first-party-harness', first, 'sessions.archived-snapshot') as { snapshotId: string }
      expect(() => invoke('platform:first-party-harness', first, 'sessions.delete-archived', { snapshotId: superseded.snapshotId })).toThrow('归档快照已失效')
      invoke('platform:revoke-first-party-grant', first)
      expect(() => invoke('platform:first-party-harness', first, 'sessions.delete-archived', { snapshotId: latest.snapshotId })).toThrow('第一方授权无效')
      expect(database.harness.archivedSessionIds()).toEqual([later.id])
    } finally { database.close(); await rm(root, { recursive: true, force: true }) }
  })

  it('retains successful cleanup and reports unprocessed targets when the grant is revoked between real batches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-archive-revoke-')), database = new PlatformDatabase(root)
    try {
      const runtime = new HarnessRuntime(database, { getTools: () => [] } as never)
      const workspaceWatch = { closeForSession: vi.fn(), closeForGrant: vi.fn(), closeForWebContents: vi.fn() }
      const { invoke } = register({ database, harnessRuntime: runtime, workspaceWatch: workspaceWatch as never })
      const sessions = Array.from({ length: 52 }, () => database.harness.createSession())
      database.harness.archiveSessions(sessions.map(session => session.id))
      const draftKey = 'first-party.mira-harness.harness-react-composer-drafts'
      database.savePreference(draftKey, { drafts: Object.fromEntries(sessions.map(session => [session.id, 'draft'])), fileDrafts: {}, config: {} })
      const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
      const snapshot = invoke('platform:first-party-harness', grant, 'sessions.archived-snapshot') as { snapshotId: string }
      const deleting = invoke('platform:first-party-harness', grant, 'sessions.delete-archived', { snapshotId: snapshot.snapshotId }) as Promise<{ deletedIds: string[]; skippedIds: string[]; failedIds: string[] }>
      invoke('platform:revoke-first-party-grant', grant)
      const result = await deleting
      expect(result.deletedIds).toHaveLength(50); expect(result.skippedIds).toHaveLength(2); expect(result.failedIds).toEqual([])
      expect(workspaceWatch.closeForSession).toHaveBeenCalledTimes(50)
      expect(Object.keys((database.getSnapshot().preferences[draftKey] as { drafts: Record<string, string> }).drafts).sort()).toEqual([...result.skippedIds].sort())
      expect(database.harness.archivedSessionIds().sort()).toEqual([...result.skippedIds].sort())
    } finally { database.close(); await rm(root, { recursive: true, force: true }) }
  })

  it('registers the existing platform and local micro-app channels', () => {
    const { invoke, database, localMicroAppServer, snapshot } = register()
    expect([...electron.handlers.keys()]).toEqual([
      'platform:get-snapshot',
      'platform:agent-models',
      'platform:user-agents',
      'platform:prompt-commands',
      'platform:hooks',
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

  it('routes first-party session lists through the live runtime snapshot rather than persisted database status', () => {
    const sessions = [{ id: 'running', isRunning: true }, { id: 'idle', isRunning: false }]
    const listSessions = vi.fn(() => sessions)
    const { invoke, database } = register({ harnessRuntime: { listSessions } as never })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    expect(invoke('platform:first-party-harness', grantId, 'sessions.list')).toBe(sessions)
    expect(listSessions).toHaveBeenCalledExactlyOnceWith()
    expect(database.harness.listSessions).not.toHaveBeenCalled()
  })
  it('reads MCP connection metadata without launching servers or exposing startup configuration', () => {
    const getStatus = vi.fn(() => ({ state: 'connected' as const, toolCount: 4 }))
    const mcpConfigStore = { list: () => [
      { id: 'mira-tools', name: 'Mira tools', enabled: true, command: 'private-command', args: ['private-argument'] },
      { id: 'disabled', name: 'Disabled', enabled: false, command: 'private-command', args: [] },
    ] }
    const { invoke } = register({ harnessRuntime: {} as never, mcpConfigStore: mcpConfigStore as never, mcpManager: { getStatus } })
    const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
    const items = invoke('platform:first-party-harness', grant, 'mcp.list')
    expect(items).toEqual([
      { id: 'mira-tools', name: 'Mira tools', enabled: true, connection: { state: 'connected', toolCount: 4 } },
      { id: 'disabled', name: 'Disabled', enabled: false },
    ])
    expect(getStatus).toHaveBeenCalledExactlyOnceWith('mira-tools')
    expect(JSON.stringify(items)).not.toContain('private-')
    invoke('platform:revoke-first-party-grant', grant)
    expect(() => invoke('platform:first-party-harness', grant, 'mcp.list')).toThrow('第一方授权无效')
    expect(getStatus).toHaveBeenCalledOnce()
  })
  it('lists and selects only live plugin MCP metadata in the owning session without exposing configuration', () => {
    const frozen = [{ id: 'probe@local', root: '/private-package' }]
    const catalog = vi.fn(() => [{ id: 'probe@local', name: 'probe', enabled: true, conflicts: [], mcpServers: [
      { id: 'plugin:probe@local:echo', name: 'plugin:probe:echo', enabled: true, type: 'stdio', revision: 'safe-hash' },
      { id: 'plugin:probe@local:bad', name: 'plugin:probe:bad', enabled: true, unavailableReason: '插件 MCP 尚未支持 oauth' },
    ] }])
    const pluginMcpStatus = vi.fn(() => ({ state: 'connected', toolCount: 1 }))
    const view = register({ harnessRuntime: { pluginMcpStatus } as never, mcpConfigStore: { list: () => [] } as never })
    Object.assign(view.database, { plugins: { catalog } })
    view.database.harness.getSession.mockImplementation((id: string) => ({ id, pluginCatalog: frozen }) as any)
    const select = vi.fn(); Object.assign(view.database.harness, { setActiveMcpServers: select })
    const grant = view.invoke('platform:create-first-party-grant', 'mira-harness') as string
    const items = view.invoke('platform:first-party-harness', grant, 'mcp.list', { sessionId: 'owner', command: 'injected-command' }) as any[]
    expect(catalog).toHaveBeenLastCalledWith(frozen)
    expect(items[0]).toMatchObject({ id: 'plugin:probe@local:echo', source: { kind: 'plugin', pluginId: 'probe@local', pluginName: 'probe' }, connection: { state: 'connected', toolCount: 1 } })
    expect(items[1]).toMatchObject({ enabled: false, unavailableReason: '插件 MCP 尚未支持 oauth' })
    expect(JSON.stringify(items)).not.toMatch(/private-package|safe-hash|injected-command/)
    view.invoke('platform:first-party-harness', grant, 'session.set-mcp-servers', { id: 'owner', serverIds: ['plugin:probe@local:echo'] })
    expect(select).toHaveBeenCalledExactlyOnceWith('owner', ['plugin:probe@local:echo'])
    for (const id of ['plugin:probe@local:bad', 'plugin:other@local:echo']) expect(() => view.invoke('platform:first-party-harness', grant, 'session.set-mcp-servers', { id: 'owner', serverIds: [id] })).toThrow('只能选择已启用')
    expect(() => view.invoke('platform:first-party-harness', grant, 'mcp.list', { sessionId: {} })).toThrow('会话 ID')
  })
  it('projects only the owning project MCP metadata and rejects other project selections without exposing credentials', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-project-mcp-bridge-')), database = new PlatformDatabase(root), store = new McpConfigStore(root)
    try {
      const paths = [join(root, 'east'), join(root, 'west')]; await Promise.all(paths.map(directory => mkdir(directory)))
      const projects = paths.map(directory => database.harness.createProject(directory))
      const sessions = projects.map(project => database.harness.createSession(project.id)), personal = database.harness.createSession()
      const configs = paths.map(directory => store.forProject(directory).save({ name: 'same-name', command: 'private-command', args: ['private-argument'], env: { TOKEN: 'private-project-token' } }))
      const global = store.save({ name: 'same-name', type: 'sse', url: 'https://example.test/private-url', headers: { Authorization: 'private-header' } })
      const projectMcpStatus = vi.fn(() => ({ state: 'connected', toolCount: 1 }))
      const { invoke, invokeAs } = register({ database, harnessRuntime: { projectMcpStatus } as never, mcpConfigStore: store })
      const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
      const items = invoke('platform:first-party-harness', grant, 'mcp.list', { sessionId: sessions[0].id, directory: paths[1] }) as any[]
      expect(items.map(item => item.id)).toEqual([global.id, configs[0].id])
      expect(items[1]).toMatchObject({ source: { kind: 'project', projectId: projects[0].id, projectName: projects[0].name }, connection: { state: 'connected', toolCount: 1 } })
      expect(projectMcpStatus).toHaveBeenCalledExactlyOnceWith(sessions[0].id, configs[0].id)
      expect(JSON.stringify(items)).not.toMatch(/private-|command|args|env|headers|cwd/)
      expect((invoke('platform:first-party-harness', grant, 'mcp.list', { sessionId: personal.id }) as any[]).map(item => item.id)).toEqual([global.id])
      expect((invoke('platform:first-party-harness', grant, 'mcp.list') as any[]).map(item => item.id)).toEqual([global.id])
      projectMcpStatus.mockClear()
      const beforeSessions = database.harness.listSessions().length
      const draftItems = invoke('platform:first-party-harness', grant, 'mcp.list', { projectId: projects[0].id, directory: paths[1] }) as any[]
      expect(draftItems.map(item => item.id)).toEqual([global.id, configs[0].id])
      expect(draftItems[1]).toMatchObject({ source: { kind: 'project', projectId: projects[0].id } })
      expect(draftItems[1]).not.toHaveProperty('connection')
      expect(JSON.stringify(draftItems)).not.toMatch(/private-|command|args|env|headers|cwd/)
      expect(projectMcpStatus).not.toHaveBeenCalled()
      expect(database.harness.listSessions()).toHaveLength(beforeSessions)
      expect((invoke('platform:first-party-harness', grant, 'mcp.list', { projectId: projects[1].id }) as any[]).map(item => item.id)).toEqual([global.id, configs[1].id])
      expect(() => invoke('platform:first-party-harness', grant, 'mcp.list', { projectId: 'unknown-project' })).toThrow()
      expect(() => invoke('platform:first-party-harness', grant, 'mcp.list', { projectId: {}, directory: paths[0] })).toThrow('项目 ID')
      expect(() => invoke('platform:first-party-harness', grant, 'mcp.list', { projectId: projects[1].id, sessionId: sessions[0].id })).toThrow('范围只能指定一个')
      expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'mcp.list', { projectId: projects[0].id })).toThrow('授权无效')
      invoke('platform:first-party-harness', grant, 'session.set-mcp-servers', { id: sessions[0].id, serverIds: [global.id, configs[0].id] })
      expect(database.harness.getSession(sessions[0].id).activeMcpServerIds).toEqual([global.id, configs[0].id])
      for (const id of [sessions[0].id, personal.id]) expect(() => invoke('platform:first-party-harness', grant, 'session.set-mcp-servers', { id, serverIds: [configs[1].id] })).toThrow('只能选择已启用')
      expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'mcp.list', { sessionId: sessions[0].id })).toThrow('授权无效')
      store.forProject(paths[0]).save({ id: configs[0].id, enabled: false })
      expect(() => invoke('platform:first-party-harness', grant, 'session.set-mcp-servers', { id: sessions[0].id, serverIds: [configs[0].id] })).toThrow('只能选择已启用')
    } finally { database.close(); await rm(root, { recursive: true, force: true }) }
  })

  it('reconnects only a stored enabled MCP server and rechecks the grant after completion', async () => {
    let complete!: () => void
    const reconnect = vi.fn(() => new Promise<void>(done => { complete = done }))
    const server = { id: 'configured', name: 'Configured', enabled: true, command: 'stored-command', args: [] }
    const getStatus = vi.fn(() => ({ state: 'connected' as const, toolCount: 1 }))
    const { invoke } = register({ harnessRuntime: {} as never, mcpConfigStore: { list: () => [server, { ...server, id: 'disabled', enabled: false }] } as never, mcpManager: { getStatus, reconnect } })
    const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
    for (const id of ['missing', 'disabled']) expect(() => invoke('platform:first-party-harness', grant, 'mcp.reconnect', { id })).toThrow('已配置且启用')
    expect(() => invoke('platform:first-party-harness', grant, 'mcp.reconnect', { id: '' })).toThrow('MCP 服务 ID无效')
    const pending = invoke('platform:first-party-harness', grant, 'mcp.reconnect', { id: server.id, command: 'untrusted-command' }) as Promise<unknown>
    expect(reconnect).toHaveBeenCalledExactlyOnceWith(server)
    invoke('platform:revoke-first-party-grant', grant); complete()
    await expect(pending).rejects.toThrow('第一方授权无效')
    expect(getStatus).not.toHaveBeenCalled()
    const next = invoke('platform:create-first-party-grant', 'mira-harness') as string
    const success = invoke('platform:first-party-harness', next, 'mcp.reconnect', { id: server.id }) as Promise<unknown>; complete()
    await expect(success).resolves.toEqual({ state: 'connected', toolCount: 1 })
  })

  it('projects remote MCP transport and recovery status without exposing endpoint credentials', () => {
    const reason = '远程 MCP 需要认证，请检查请求头后重试'
    const getStatus = vi.fn(() => ({ state: 'failed' as const, toolCount: 0, error: reason }))
    const config = { id: 'remote', name: 'Remote', enabled: true, type: 'streamableHttp', command: '', args: [], url: 'https://private.example/mcp?secret=hidden-token', headers: { Authorization: 'Bearer private-header' }, env: { KEY: 'private-env' } }
    const view = register({ harnessRuntime: {} as never, mcpConfigStore: { list: () => [config] } as never, mcpManager: { getStatus } })
    const grant = view.invoke('platform:create-first-party-grant', 'mira-harness') as string
    const items = view.invoke('platform:first-party-harness', grant, 'mcp.list')
    expect(items).toEqual([{ id: 'remote', name: 'Remote', enabled: true, type: 'streamableHttp', connection: { state: 'failed', toolCount: 0, error: reason } }])
    expect(JSON.stringify(items)).not.toMatch(/hidden-token|private-header|private-env|private\.example/)
  })

  it('rechecks plugin import authority after the native directory selection before registering anything', async () => {
    let finish!: (value: { canceled: boolean; filePaths: string[] }) => void
    electron.showOpenDialog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const view = register({ harnessRuntime: {} as never })
    const registerPlugin = vi.fn(), list = vi.fn(() => [])
    Object.assign(view.database, { plugins: { register: registerPlugin, list } })
    const grant = view.invoke('platform:create-first-party-grant', 'mira-harness') as string
    const importing = view.invoke('platform:first-party-harness', grant, 'plugins.import') as Promise<unknown>
    view.invoke('platform:revoke-first-party-grant', grant)
    finish({ canceled: false, filePaths: ['/test-owned/plugin'] })
    await expect(importing).rejects.toThrow('第一方授权无效')
    expect(registerPlugin).not.toHaveBeenCalled()
  })
  it('returns canceled native plugin selection without installing and exposes catalog metadata without paths', async () => {
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    const view = register({ harnessRuntime: {} as never })
    const registerPlugin = vi.fn(), plugins = [{ id: 'review@local', name: 'review', description: '', enabled: true, root: '/owned', skills: [{ name: 'check', description: '', path: '/owned/skills/check/SKILL.md' }], unsupported: [] }]
    const catalogFor = vi.fn(frozen => miraPluginItems(frozen))
    Object.assign(view.database, { plugins: { register: registerPlugin, list: () => [], catalog: catalogFor } })
    view.database.harness.getSession.mockReturnValueOnce({ id: 's', pluginCatalog: plugins } as any)
    const grant = view.invoke('platform:create-first-party-grant', 'mira-harness') as string
    const catalog = view.invoke('platform:first-party-harness', grant, 'plugins.catalog', { sessionId: 's' })
    expect(JSON.stringify(catalog)).not.toContain('/owned')
    expect(catalog).toMatchObject([{ id: 'review@local', skills: [{ name: 'check' }] }])
    expect(catalogFor).toHaveBeenCalledWith(plugins)
    await expect(view.invoke('platform:first-party-harness', grant, 'plugins.import')).resolves.toBeNull()
    expect(registerPlugin).not.toHaveBeenCalled()
  })

  it('creates prepared attachment owners only through a validated boolean while preserving ordinary creation', () => {
    const { invoke, database } = register({ harnessRuntime: {} as never })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    invoke('platform:first-party-harness', grantId, 'session.create', { projectId: 'project', prepared: true })
    expect(database.harness.createSession).toHaveBeenLastCalledWith('project', undefined, true)
    invoke('platform:first-party-harness', grantId, 'session.create', { projectId: 'project' })
    expect(database.harness.createSession).toHaveBeenLastCalledWith('project')
    for (const prepared of ['true', 1, null, {}]) expect(() => invoke('platform:first-party-harness', grantId, 'session.create', { prepared })).toThrow('草稿准备状态无效')
    expect(database.harness.createSession).toHaveBeenCalledTimes(2)
  })

  it('binds media previews to the host workspace and owner, and revokes URLs on navigation or grant removal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-media-ipc-')), workspaceMedia = new MiraWorkspaceMedia()
    const server = new LocalMicroAppServer({ mediaHandler: (path, request, response) => { void workspaceMedia.handle(path, request, response) } })
    try {
      await writeFile(join(root, 'sound.wav'), 'media fixture'); await server.start([])
      const { invoke, invokeAs, database, sender } = register({ harnessRuntime: {} as never, workspaceMedia, localMicroAppServer: server })
      database.harness.getProject.mockReturnValue({ id: 'project', directory: root })
      const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
      const preview = await invoke('platform:first-party-harness', grant, 'files.media-open', { sessionId: 's', path: 'sound.wav', root: '/untrusted', url: 'https://untrusted.example', mediaType: 'text/html' }) as { id: string; url: string; mediaType: string }
      expect(preview.mediaType).toBe('audio/wav'); expect((await fetch(preview.url, { method: 'HEAD' })).status).toBe(200)
      expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'files.media-close', { id: preview.id })).toThrow('授权无效')
      invokeAs(2, 'platform:revoke-first-party-grant', grant)
      expect((await fetch(preview.url, { method: 'HEAD' })).status).toBe(200)
      database.harness.getProject.mockReturnValueOnce({ id: 'project', directory: '/changed' })
      expect((await fetch(preview.url, { method: 'HEAD' })).status).toBe(403)
      const next = await invoke('platform:first-party-harness', grant, 'files.media-open', { sessionId: 's', path: 'sound.wav' }) as { id: string; url: string }
      invoke('platform:first-party-harness', grant, 'files.media-close', { id: next.id })
      expect((await fetch(next.url, { method: 'HEAD' })).status).toBe(404)
      const revoked = await invoke('platform:first-party-harness', grant, 'files.media-open', { sessionId: 's', path: 'sound.wav' }) as { url: string }
      invoke('platform:revoke-first-party-grant', grant)
      expect((await fetch(revoked.url, { method: 'HEAD' })).status).toBe(404)
      const freshGrant = invoke('platform:create-first-party-grant', 'mira-harness') as string
      const navigating = await invoke('platform:first-party-harness', freshGrant, 'files.media-open', { sessionId: 's', path: 'sound.wav' }) as { url: string }
      sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
      expect((await fetch(navigating.url, { method: 'HEAD' })).status).toBe(404)
    } finally { workspaceMedia.closeAll(); await server.stop(); await rm(root, { recursive: true, force: true }) }
  })

  it('releases a late media grant if the host project changes before the open reply', async () => {
    const id = 'a'.repeat(64), workspaceMedia = { open: vi.fn(), release: vi.fn() }
    const { invoke, database, sender } = register({ harnessRuntime: {} as never, workspaceMedia: workspaceMedia as never })
    workspaceMedia.open.mockImplementation(async (_root, path, _owner, authorize) => { authorize(); database.harness.getProject.mockReturnValue({ id: 'project', directory: '/changed' }); return { id, path } })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    await expect(invoke('platform:first-party-harness', grantId, 'files.media-open', { sessionId: 's', path: 'sound.wav' })).rejects.toThrow('工作目录已变化')
    expect(workspaceMedia.release).toHaveBeenCalledExactlyOnceWith(id, { grantId, webContentsId: sender.id })
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
    const { invoke, database } = register({ harnessRuntime: { assertSessionMutable: vi.fn() } as never, workspaceWatch: workspaceWatch as never })
    const moveSession = vi.fn(() => ({ id: 's' }))
    const deleteSession = vi.fn()
    Object.assign(database.harness, { moveSession, deleteSession })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    invoke('platform:first-party-harness', grantId, 'session.move', { id: 's', projectId: 'other' })
    expect(moveSession).toHaveBeenCalledWith('s', 'other')
    invoke('platform:first-party-harness', grantId, 'session.move', { id: 's' })
    expect(moveSession).toHaveBeenLastCalledWith('s', undefined)
    invoke('platform:first-party-harness', grantId, 'session.delete', { id: 's' })
    expect(deleteSession).toHaveBeenCalledWith('s')
    expect(workspaceWatch.closeForSession.mock.calls).toEqual([['s'], ['s'], ['s']])
    invoke('platform:import-snapshot', '{}')
    invoke('platform:restore-defaults')
    expect(workspaceWatch.closeInvalid).toHaveBeenCalledTimes(2)
  })

  it.each(['session.archive', 'session.delete', 'session.move'])('guards %s before changing running or paused queued task scope', method => {
    const assertSessionMutable = vi.fn()
    const workspaceWatch = { closeForSession: vi.fn() }
    const { invoke, database } = register({ harnessRuntime: { assertSessionMutable } as never, workspaceWatch: workspaceWatch as never })
    const archiveSessions = vi.fn(), deleteSession = vi.fn(), moveSession = vi.fn()
    Object.assign(database.harness, { archiveSessions, deleteSession, moveSession })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    for (const message of ['该会话正在运行', '请先处理待发送消息']) {
      assertSessionMutable.mockImplementation(() => { throw new Error(message) })
      expect(() => invoke('platform:first-party-harness', grantId, method, { id: 's', projectId: 'other' })).toThrow(message)
      expect(archiveSessions).not.toHaveBeenCalled()
      expect(deleteSession).not.toHaveBeenCalled()
      expect(moveSession).not.toHaveBeenCalled()
      expect(workspaceWatch.closeForSession).not.toHaveBeenCalled()
    }
  })

  it('routes owner-authorized queue reorder and send-now with parsed authority-bound parameters', async () => {
    const queue = { sessionId: 's', revision: 2, items: [] }
    const harnessRuntime = { reorderMessageQueue: vi.fn(() => queue), sendQueuedMessageNow: vi.fn(async () => queue) }
    const { invoke, invokeAs } = register({ harnessRuntime: harnessRuntime as never })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    expect(invoke('platform:first-party-harness', grantId, 'queue.reorder', { sessionId: 's', itemId: 'item', beforeItemId: null, apiKey: 'ignored' })).toEqual(queue)
    await expect(invoke('platform:first-party-harness', grantId, 'queue.send-now', { sessionId: 's', itemId: 'item', expectedRunId: 'run', injected: true })).resolves.toEqual(queue)
    expect(harnessRuntime.reorderMessageQueue).toHaveBeenCalledExactlyOnceWith('s', 'item', null)
    expect(harnessRuntime.sendQueuedMessageNow).toHaveBeenCalledExactlyOnceWith('s', 'item', 'run')
    expect(() => invokeAs(2, 'platform:first-party-harness', grantId, 'queue.send-now', { sessionId: 's', itemId: 'item' })).toThrow('授权无效')
    expect(harnessRuntime.sendQueuedMessageNow).toHaveBeenCalledOnce()
  })

  it('reads archived pages and restores the selected task through an owner-bound Harness grant', () => {
    const { invoke, invokeAs, database } = register({ harnessRuntime: {} as never })
    const queryHistory = vi.fn(() => ({ rows: [{ id: 'archived' }], total: 1 }))
    const restoreSessions = vi.fn(() => [{ id: 'archived' }])
    Object.assign(database.harness, { queryHistory, restoreSessions })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    expect(invoke('platform:first-party-harness', grantId, 'sessions.history', { archiveView: 'archived', page: 2, pageSize: 50 })).toMatchObject({ total: 1 })
    expect(queryHistory).toHaveBeenCalledWith({ archiveView: 'archived', sort: 'updated-desc', page: 2, pageSize: 50, q: undefined })
    invoke('platform:first-party-harness', grantId, 'session.restore', { id: 'archived' })
    expect(restoreSessions).toHaveBeenCalledExactlyOnceWith(['archived'])
    expect(() => invokeAs(2, 'platform:first-party-harness', grantId, 'session.restore', { id: 'archived' })).toThrow('授权无效')
    expect(restoreSessions).toHaveBeenCalledOnce()
  })

  it('retains archive filters through the actual bridge-to-IPC double parsing chain', async () => {
    const view = register({ harnessRuntime: {} as never })
    const queryHistory = vi.fn(() => ({ rows: [], total: 0 }))
    Object.assign(view.database.harness, { queryHistory })
    const grantId = view.invoke('platform:create-first-party-grant', 'mira-harness') as string
    await handleFirstPartyRequest({ manifest: firstPartyAppManifests.find(item => item.appId === 'mira-harness')!, grantId, context: {} as never, route: '/', navigate: vi.fn(), api: { invokeFirstPartyHarness: (grant, method, params) => view.invoke('platform:first-party-harness', grant, method, params) } as never }, { type: 'mira:request', id: '1', method: 'harness.sessions.history', params: { archiveView: 'archived', sort: 'created-desc', page: 2, pageSize: 20 } })
    expect(queryHistory).toHaveBeenCalledExactlyOnceWith({ archiveView: 'archived', sort: 'created-desc', page: 2, pageSize: 20, q: undefined })
  })

  it('returns only the global composer preferences, not the platform snapshot', () => {
    const { invoke, database } = register({ harnessRuntime: {} as never })
    database.getSnapshot.mockReturnValueOnce({ preferences: { sendShortcut: 'mod-enter', showContextUsage: false, secret: 'not-exposed' } } as never)
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    expect(invoke('platform:first-party-harness', grantId, 'composer.preferences', undefined)).toEqual({ sendShortcut: 'mod-enter', showContextUsage: false, followupMode: 'queue' })
  })

  it.each(['queue', 'guide'])('persists and projects the global %s follow-up preference without changing existing input preferences', followupMode => {
    const { invoke, database } = register({ harnessRuntime: {} as never })
    const preferences = { sendShortcut: 'mod-enter', showContextUsage: false, followupMode: 'queue' }
    database.savePreference.mockImplementation((key: string, value: unknown) => {
      Object.assign(preferences, { [key]: value })
      return { key, value }
    })
    database.getSnapshot.mockImplementation(() => ({ preferences }) as never)
    expect(invoke('platform:save-preference', 'followupMode', followupMode)).toEqual({ key: 'followupMode', value: followupMode })
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    expect(invoke('platform:first-party-harness', grantId, 'composer.preferences', undefined)).toEqual({ sendShortcut: 'mod-enter', showContextUsage: false, followupMode })
    expect(database.savePreference).toHaveBeenCalledExactlyOnceWith('followupMode', followupMode)
  })

  it.each([undefined, null, '', 'start-now', 'QUEUE', false, 1, {}])('defaults a legacy or unknown follow-up preference to queue (%j)', followupMode => {
    const { invoke, database } = register({ harnessRuntime: {} as never })
    database.getSnapshot.mockReturnValueOnce({ preferences: { sendShortcut: 'enter', showContextUsage: true, followupMode } } as never)
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    expect(invoke('platform:first-party-harness', grantId, 'composer.preferences', undefined)).toEqual({ sendShortcut: 'enter', showContextUsage: true, followupMode: 'queue' })
    expect(database.savePreference).not.toHaveBeenCalled()
  })

  it.each([undefined, null, '', 'start-now', 'QUEUE', false, 1, {}])('rejects an invalid follow-up preference before any persistent write (%j)', value => {
    const { invoke, database } = register()
    expect(() => invoke('platform:save-preference', 'followupMode', value)).toThrow('运行中消息处理只允许队列或引导')
    expect(database.savePreference).not.toHaveBeenCalled()
  })

  it.each(['marketplace', 'plugin-marketplace'])('rechecks revoked %s authority after a read and passes a commit guard to installation', async prefix => {
    let finishBrowse!: (value: unknown) => void
    const browse = vi.fn(() => new Promise(resolve => { finishBrowse = resolve }))
    const install = vi.fn(async (_id: string, assertAuthorized: () => void) => { await Promise.resolve(); assertAuthorized(); return { installed: true } })
    const view = register({ harnessRuntime: {} as never, skillMarketplace: { browse, install, browsePlugins: browse, installPlugin: install } as never })
    Object.assign(view.sender, { isDestroyed: () => false })
    const grantId = view.invoke('platform:create-first-party-grant', 'mira-harness') as string
    const read = view.invoke('platform:first-party-harness', grantId, `${prefix}.browse`, { refresh: true }) as Promise<unknown>
    view.invoke('platform:revoke-first-party-grant', grantId)
    finishBrowse({ items: [] })
    await expect(read).rejects.toThrow('授权无效')
    const nextGrant = view.invoke('platform:create-first-party-grant', 'mira-harness') as string
    const installation = view.invoke('platform:first-party-harness', nextGrant, `${prefix}.install`, { id: 'public-skill' }) as Promise<unknown>
    view.invoke('platform:revoke-first-party-grant', nextGrant)
    await expect(installation).rejects.toThrow('授权无效')
    expect(install).toHaveBeenCalledWith('public-skill', expect.any(Function))
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

  it('scopes context paste to the existing grant and session and returns no clipboard text', () => {
    const paste = vi.fn((_sender, _session, _terminal, read) => { read() })
    const { invoke, sender, database, invokeFromSubframe } = register({ terminalSessions: { paste } as never, harnessRuntime: {} as never })
    electron.readClipboard.mockReturnValue('isolated clipboard')
    const grant = invoke('platform:create-first-party-grant', 'mira-harness') as string
    expect(invoke('platform:first-party-harness', grant, 'terminal.paste', { sessionId: 'session-1', terminalId: 'terminal-1', bracketed: true })).toBeUndefined()
    expect(database.harness.getSession).toHaveBeenCalledWith('session-1')
    expect(paste).toHaveBeenCalledExactlyOnceWith(sender, 'session-1', 'terminal-1', expect.any(Function), true)
    expect(electron.readClipboard).toHaveBeenCalledOnce()
    paste.mockClear(); electron.readClipboard.mockClear()
    expect(() => invokeFromSubframe('platform:first-party-harness', grant, 'terminal.paste', { sessionId: 'session-1', terminalId: 'terminal-1', bracketed: false })).toThrow('宿主主页面')
    expect(() => invoke('platform:first-party-harness', 'invalid', 'terminal.paste', { sessionId: 'session-1', terminalId: 'terminal-1', bracketed: false })).toThrow('授权无效')
    vi.mocked(database.harness.getSession).mockImplementation(() => { throw new Error('session removed') })
    expect(() => invoke('platform:first-party-harness', grant, 'terminal.paste', { sessionId: 'session-1', terminalId: 'terminal-1', bracketed: false })).toThrow('session removed')
    expect(paste).not.toHaveBeenCalled(); expect(electron.readClipboard).not.toHaveBeenCalled()
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
    expect(harnessRuntime.abort).toHaveBeenCalledWith('s', undefined)
    invoke('platform:first-party-harness', grant, 'run.abort', { sessionId: 's', expectedRunId: 'run-1' })
    expect(harnessRuntime.abort).toHaveBeenLastCalledWith('s', 'run-1')
    invoke('platform:revoke-first-party-grant', grant)
    expect(() => invoke('platform:first-party-harness', grant, 'run.abort', { sessionId: 's' })).toThrow('授权无效')
    expect(harnessRuntime.abort).toHaveBeenCalledTimes(2)
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

  it('requires grant, main frame, valid session and exact guest ownership for residency protection', () => {
    const { invoke, invokeAs, invokeFromSubframe, sender, database } = register({ harnessRuntime: {} as never })
    const grant = invoke('platform:create-first-party-grant', 'mira-harness')
    const params = { sessionId: 'a', browserId: 'browser:one', guestId: 10 }
    const guest = { getType: () => 'webview', hostWebContents: sender, isDestroyed: () => false, isLoading: () => false, isCurrentlyAudible: () => false, isBeingCaptured: () => false }
    electron.guestFromId.mockReturnValue(guest)
    expect(invoke('platform:first-party-harness', grant, 'browser.protection', params)).toEqual({ protected: false })
    expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'browser.protection', params)).toThrow('授权无效')
    expect(() => invokeFromSubframe('platform:first-party-harness', grant, 'browser.protection', params)).toThrow()
    guest.hostWebContents = {} as never; expect(() => invoke('platform:first-party-harness', grant, 'browser.protection', params)).toThrow('不属于当前窗口')
    guest.hostWebContents = sender; database.harness.getSession.mockImplementation(() => { throw Error('会话不存在') })
    expect(() => invoke('platform:first-party-harness', grant, 'browser.protection', params)).toThrow('会话不存在')
  })
  it('validates element picker grant, frame, session, fixed actions and exact native owner', () => {
    const { invoke, invokeAs, invokeFromSubframe, sender, database } = register({ harnessRuntime: {} as never })
    const grant = invoke('platform:create-first-party-grant', 'mira-harness')
    const params = { sessionId: 'a', browserId: 'browser:one', action: 'start', guestId: 10 }
    const guest = { getType: () => 'webview', hostWebContents: sender, isDestroyed: () => false }
    electron.guestFromId.mockReturnValue(guest)
    expect(invoke('platform:first-party-harness', grant, 'browser.pick', params)).toBeNull()
    expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'browser.pick', params)).toThrow('授权无效')
    expect(() => invokeFromSubframe('platform:first-party-harness', grant, 'browser.pick', params)).toThrow()
    expect(() => invoke('platform:first-party-harness', grant, 'browser.pick', { ...params, action: 'execute' })).toThrow()
    guest.hostWebContents = {} as never
    expect(() => invoke('platform:first-party-harness', grant, 'browser.pick', params)).toThrow('不属于当前窗口')
    guest.hostWebContents = sender
    database.harness.getSession.mockImplementation(() => { throw Error('会话不存在') })
    expect(() => invoke('platform:first-party-harness', grant, 'browser.pick', params)).toThrow('会话不存在')
    expect(invoke('platform:first-party-harness', grant, 'browser.pick', { ...params, action: 'cancel' })).toBeNull()
  })
  it('checks grant, main frame, session and native guest ownership before changing real viewport metrics', async () => {
    const { invoke, invokeAs, invokeFromSubframe, sender, database } = register({ harnessRuntime: {} as never })
    const grant = invoke('platform:create-first-party-grant', 'mira-harness')
    const guest = Object.assign(new EventEmitter(), { getType: () => 'webview', hostWebContents: sender, isDestroyed: () => false, setZoomFactor: vi.fn(), debugger: { isAttached: () => true, attach: vi.fn(), sendCommand: vi.fn(async () => undefined) } })
    Object.assign(sender, { getZoomFactor: () => 1.25 }); electron.guestFromId.mockReturnValue(guest)
    const bounds = { x: 0, y: 0, width: 400, height: 500 }, params = { sessionId: 'a', browserId: 'browser:one', viewport: { width: 800, height: 600 }, bounds, clip: bounds, scale: .5, guestId: 10 }
    expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'browser.viewport', params)).toThrow('授权无效')
    expect(() => invokeFromSubframe('platform:first-party-harness', grant, 'browser.viewport', params)).toThrow()
    await expect(invoke('platform:first-party-harness', grant, 'browser.viewport', { ...params, guestId: undefined })).rejects.toThrow('不属于当前窗口')
    guest.hostWebContents = {} as never
    await expect(invoke('platform:first-party-harness', grant, 'browser.viewport', params)).rejects.toThrow('不属于当前窗口')
    expect(guest.debugger.sendCommand).not.toHaveBeenCalled()
    guest.hostWebContents = sender
    await expect(invoke('platform:first-party-harness', grant, 'browser.viewport', params)).resolves.toEqual({ desktopZoomFactor: 1.25 })
    expect(guest.debugger.sendCommand).toHaveBeenCalledExactlyOnceWith('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, mobile: false, deviceScaleFactor: 1, dontSetVisibleSize: true, scale: 1.25 })
    database.harness.getSession.mockImplementation(() => { throw new Error('会话不存在') })
    expect(() => invoke('platform:first-party-harness', grant, 'browser.viewport', params)).toThrow('会话不存在')
  })
  it('preserves browser resource identity through main-process validation and rejects unauthorized navigation', () => {
    const manifest: FirstPartyAppManifest = {
      appId: 'mira-harness', legacyIds: [], enabled: true,
      trustedSource: { type: 'builtin', packagePath: 'harness-react-app' },
      entry: { path: 'index.html' }, shellCompatibility: { minVersion: '0.0.10' },
      apiCompatibility: { major: 1 }, capabilities: ['harness:workbench'],
    }
    const { invoke, invokeAs, invokeFromSubframe, database } = register({ firstPartyManifests: [manifest], harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
    const grant = invoke('platform:create-first-party-grant', 'mira-harness')
    const params = { sessionId: 'project-session', browserId: 'browser:page-one', visible: false, url: 'https://mira.test/page', bounds: { x: 0, y: 0, width: 500, height: 400 } }
    expect(invoke('platform:first-party-harness', grant, 'browser.navigate', params)).toEqual(params)
    expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'browser.navigate', params)).toThrow('授权无效')
    expect(() => invoke('platform:first-party-harness', grant, 'browser.navigate', { ...params, browserId: 'browser:../invalid' })).toThrow()
    expect(invoke('platform:first-party-harness', grant, 'browser.control', { sessionId: params.sessionId, browserId: params.browserId, action: 'devtools' })).toMatchObject({ action: 'devtools', browserId: params.browserId })
    invoke('platform:first-party-harness', grant, 'browser.external', params)
    expect(electron.openExternal).toHaveBeenCalledExactlyOnceWith(params.url); electron.openExternal.mockClear()
    expect(() => invokeAs(2, 'platform:first-party-harness', grant, 'browser.external', params)).toThrow('授权无效')
    expect(() => invokeFromSubframe('platform:first-party-harness', grant, 'browser.external', params)).toThrow()
    for (const url of ['file:///tmp/secret', 'javascript:alert(1)', 'https://user:secret@mira.test']) expect(() => invoke('platform:first-party-harness', grant, 'browser.external', { ...params, url })).toThrow()
    expect(electron.openExternal).not.toHaveBeenCalled()
    database.harness.getSession.mockImplementation(() => { throw new Error('会话不存在') })
    expect(() => invoke('platform:first-party-harness', grant, 'browser.navigate', params)).toThrow('会话不存在')
    expect(() => invoke('platform:first-party-harness', grant, 'browser.external', params)).toThrow('会话不存在')
    expect(electron.openExternal).not.toHaveBeenCalled()
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

  it('browses persisted project roots without a session and never trusts a caller root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mira-platform-project-files-'))
    try {
      await writeFile(join(root, 'project.md'), 'project-only fixture')
      const registered = register({ harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
      registered.database.harness.getProject.mockReturnValue({ id: 'empty-project', directory: root })
      registered.database.harness.getSession.mockImplementation(() => { throw new Error('No session should be resolved') })
      const grant = registered.invoke('platform:create-first-party-grant', 'mira-harness')
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.list', { projectId: 'empty-project', path: '', root: '/private/injected' })).resolves.toMatchObject({ path: '', entries: [{ path: 'project.md' }] })
      await expect(registered.invoke('platform:first-party-harness', grant, 'files.search', { projectId: 'empty-project', query: 'project', root: '/private/injected' })).resolves.toMatchObject({ entries: [{ path: 'project.md' }] })
      expect(registered.database.harness.getProject).toHaveBeenCalledWith('empty-project')
      expect(registered.database.harness.getSession).not.toHaveBeenCalled()
      expect(registered.database.harness.createSession).not.toHaveBeenCalled()
      expect(() => registered.invoke('platform:first-party-harness', grant, 'files.list', { projectId: 'empty-project', path: '../secret' })).toThrow('路径无效')
      expect(() => registered.invoke('platform:first-party-harness', grant, 'files.list', { projectId: 'empty-project', sessionId: 's', path: '' })).toThrow('文件范围')
      registered.database.harness.getProject.mockImplementation(() => { throw new Error('未找到项目') })
      expect(() => registered.invoke('platform:first-party-harness', grant, 'files.list', { projectId: 'unknown', path: '' })).toThrow('未找到项目')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it.each(['files.list', 'files.search', 'files.git-status', 'files.git-ignored'])('%s checks project grants before reading and rejects all late invalidation cases', async method => {
    const source = method === 'files.list' ? workspaceFiles : method === 'files.search' ? workspaceFiles : workspaceGit
    const helper = method === 'files.list' ? 'listHarnessWorkspaceFiles' : method === 'files.search' ? 'searchHarnessWorkspaceFiles' : method === 'files.git-status' ? 'readHarnessWorkspaceGit' : 'readHarnessWorkspaceIgnored'
    let finish!: (value: unknown) => void
    const read = vi.spyOn(source as typeof workspaceFiles & typeof workspaceGit, helper).mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
    try {
      for (const invalidation of ['revoked-grant', 'changed-project-directory', 'deleted-project', 'destroyed-sender']) {
        const registered = register({ harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
        registered.database.harness.getProject.mockReturnValue({ id: 'project', directory: '/mira-project' })
        const isDestroyed = vi.fn(() => false); Object.assign(registered.sender, { isDestroyed })
        const grant = registered.invoke('platform:create-first-party-grant', 'mira-harness')
        const params = { projectId: 'project', path: '', query: 'notes', paths: ['build'], root: '/private/injected' }
        expect(() => registered.invokeAs(2, 'platform:first-party-harness', grant, method, params)).toThrow('授权无效')
        expect(() => registered.invokeFromSubframe('platform:first-party-harness', grant, method, params)).toThrow('宿主主页面')
        const request = registered.invoke('platform:first-party-harness', grant, method, params)
        expect(read).toHaveBeenLastCalledWith('/mira-project', ...(method === 'files.list' ? [''] : method === 'files.search' ? ['notes', false, expect.any(Function)] : method === 'files.git-ignored' ? [['build']] : []))
        if (invalidation === 'revoked-grant') registered.invoke('platform:revoke-first-party-grant', grant)
        else if (invalidation === 'changed-project-directory') registered.database.harness.getProject.mockReturnValue({ id: 'project', directory: '/different-project' })
        else if (invalidation === 'deleted-project') registered.database.harness.getProject.mockImplementation(() => { throw new Error('未找到项目') })
        else isDestroyed.mockReturnValue(true)
        finish(method === 'files.list' ? { path: '', entries: [] } : method === 'files.search' ? { entries: [], truncated: false } : method === 'files.git-status' ? { available: true, entries: [] } : [])
        await expect(request).rejects.toThrow(invalidation === 'revoked-grant' ? '授权无效' : invalidation === 'changed-project-directory' ? '工作目录已变化' : invalidation === 'deleted-project' ? '未找到项目' : '连接已关闭')
        expect(registered.database.harness.getSession).not.toHaveBeenCalled()
        expect(registered.database.harness.createSession).not.toHaveBeenCalled()
      }
    } finally { read.mockRestore() }
  })

  it.each(['files.git-status', 'files.git-ignored'])('%s reads project Git state without session fallback', async method => {
    const helper = method === 'files.git-status' ? 'readHarnessWorkspaceGit' : 'readHarnessWorkspaceIgnored'
    const result = method === 'files.git-status' ? { available: true, entries: [] } : ['build']
    const read = vi.spyOn(workspaceGit, helper).mockResolvedValue(result as never)
    try {
      const registered = register({ harnessRuntime: {} as PlatformIpcDependencies['harnessRuntime'] })
      registered.database.harness.getProject.mockReturnValue({ id: 'project', directory: '/mira-project' })
      const grant = registered.invoke('platform:create-first-party-grant', 'mira-harness')
      await expect(registered.invoke('platform:first-party-harness', grant, method, { projectId: 'project', paths: ['build'] })).resolves.toEqual(result)
      expect(registered.database.harness.getSession).not.toHaveBeenCalled()
    } finally { read.mockRestore() }
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
