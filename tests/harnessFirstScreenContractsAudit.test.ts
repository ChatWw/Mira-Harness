import Database from 'better-sqlite3'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessStore } from '../electron/storage/harnessStore'
import { MiraPaths } from '../electron/storage/miraPaths'
import { FirstPartyGrantStore } from '../electron/security/firstPartyGrant'
import { firstPartyAppManifests } from '../src/config/firstPartyApps'
import type { AutomationTaskInput } from '../src/config/harness'
import { handleFirstPartyRequest } from '../src/platform/firstPartyBridge'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'

const electron = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>(), dialog: vi.fn(), openPath: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => unknown) => electron.handlers.set(name, handler) }, BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null }, dialog: { showOpenDialog: electron.dialog }, shell: { openPath: electron.openPath } }))
import { registerPlatformIpcHandlers } from '../electron/ipc/platformIpc'
import { saveAutomationTask } from '../electron/ipc/automationIpc'

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const input: AutomationTaskInput = { id: 'task', name: '归档研究', projectId: 'project', prompt: '汇总内容', model: { providerId: 'provider', modelId: 'model', thinkingLevel: 'high' }, permissionMode: 'default', enabled: true, trigger: { type: 'cron', expression: '0 9 * * *', humanLabel: '每天上午九点' }, target: { type: 'existing-session', sessionId: 'session' }, templateId: 'summary', validFrom: 2_000_000_000_000, validUntil: 2_100_000_000_000 }

function register() {
  const database = {
    getSnapshot: vi.fn(), harness: { queryHistory: vi.fn(query => query), searchConversations: vi.fn(async () => []), createProject: vi.fn(path => ({ id: 'project', directory: path })), renameProject: vi.fn((id, name) => ({ id, name })), getProject: vi.fn(() => ({ id: 'project', directory: '/actual/project', directoryExists: true })), getSession: vi.fn(() => ({ id: 'session', projectId: 'project' })), getPermissionConfig: vi.fn(() => ({ autoApproveEnabled: false, fullAccessEnabled: false })) },
    models: { get: vi.fn(() => ({ id: 'provider', enabled: true, authMode: 'api-key', hasApiKey: true, endpoint: 'https://provider.invalid', models: [{ id: 'model', enabled: true }] })), getSecret: vi.fn(() => 'isolated-fixture-key') }, automations: { saveTask: vi.fn(value => value), getRun: vi.fn(() => ({ id: 'failed-run', taskId: 'task', status: 'failed', sessionId: 'session' })), listRuns: vi.fn(() => []), getTask: vi.fn(), listTasks: vi.fn(() => []), setEnabled: vi.fn() },
  }
  const scheduler = { nextRuns: vi.fn(() => [3]), reschedule: vi.fn(), launch: vi.fn(async () => ({ id: 'run', taskId: 'task', status: 'running', sessionId: 'session' })), abort: vi.fn() }
  const grants = new FirstPartyGrantStore()
  registerPlatformIpcHandlers({ database, harnessRuntime: {}, localMicroAppServer: {}, automationScheduler: scheduler, firstPartyGrantStore: grants } as never)
  const sender = Object.assign(new EventEmitter(), { id: 8, isDestroyed: () => false })
  const grantId = electron.handlers.get('platform:create-first-party-grant')!({ sender }, 'mira-harness') as string
  const invoke = (method: string, raw?: unknown, senderId = sender.id, subframe = false) => electron.handlers.get('platform:first-party-harness')!({ sender: senderId === sender.id ? sender : { ...sender, id: senderId }, ...(subframe ? { senderFrame: { parent: {} } } : {}) }, grantId, method, raw)
  const bridge = (method: string, params?: unknown) => handleFirstPartyRequest({ manifest: firstPartyAppManifests.find(item => item.appId === 'mira-harness')!, grantId, api: { invokeFirstPartyHarness: (_grant: string, call: string, raw: unknown) => invoke(call, raw) } as never, context: {} as never, route: '/workspace/harness-react', navigate: () => undefined }, { type: 'mira:request', id: 'audit', method: `harness.${method}`, params })
  return { database, scheduler, grants, grantId, sender, invoke, bridge }
}
beforeEach(() => { electron.handlers.clear(); vi.clearAllMocks() })

describe('actual first-screen bridge parameter and authority chain', () => {
  it('round-trips canonical and original history requests without losing archive, query, or paging', async () => {
    const view = register()
    const query = { archiveView: 'archived', sort: 'created-desc', page: 3, pageSize: 20, q: '研究关键词' }
    const canonical = parseFirstPartyHarnessCall('sessions.history', query)
    expect(parseFirstPartyHarnessCall(canonical.method, canonical)).toEqual(canonical)
    await view.bridge('sessions.history', query)
    expect(view.database.harness.queryHistory).toHaveBeenCalledExactlyOnceWith(query)
  })
  it('round-trips every supported automation trigger with model reasoning and validity fields', () => {
    for (const trigger of [input.trigger, { type: 'once', scheduledAt: 2_010_000_000_000 } as const, { type: 'session-completed' } as const]) {
      const canonical = parseFirstPartyHarnessCall('automations.save', { input: { ...input, trigger } })
      expect(parseFirstPartyHarnessCall(canonical.method, canonical)).toEqual(canonical)
      expect(canonical).toEqual({ method: 'automations.save', input: { ...input, trigger } })
    }
  })
  it('uses one validated save helper through the genuine Vue-to-main double parser', async () => {
    const view = register(); await view.bridge('automations.save', { input })
    expect(view.database.automations.saveTask).toHaveBeenCalledExactlyOnceWith(input)
    expect(view.scheduler.nextRuns).toHaveBeenCalledExactlyOnceWith('0 9 * * *')
    expect(view.scheduler.reschedule).toHaveBeenCalledOnce()
  })
  it.each(['model', 'permission', 'project', 'session'] as const)('rejects an unavailable %s before writing an automation', boundary => {
    const view = register()
    if (boundary === 'model') view.database.models.getSecret.mockReturnValueOnce('')
    if (boundary === 'project') view.database.harness.getProject.mockReturnValueOnce({ id: 'project', directory: '/missing', directoryExists: false })
    if (boundary === 'session') view.database.harness.getSession.mockReturnValueOnce({ id: 'session', projectId: 'elsewhere' })
    expect(() => saveAutomationTask(view.database as never, view.scheduler as never, { ...input, ...(boundary === 'permission' ? { permissionMode: 'full' } : {}) })).toThrow()
    expect(view.database.automations.saveTask).not.toHaveBeenCalled(); expect(view.scheduler.reschedule).not.toHaveBeenCalled()
  })
  it('rejects another window or child frame before search and automation reads', () => {
    const view = register()
    expect(() => view.invoke('sessions.search', { query: '正文' }, 9)).toThrow('授权无效')
    expect(() => view.invoke('automations.list', undefined, 8, true)).toThrow('主页面')
    expect(view.database.harness.searchConversations).not.toHaveBeenCalled(); expect(view.database.automations.listTasks).not.toHaveBeenCalled()
  })
  it('does not deliver search results after the owning grant is revoked while search is pending', async () => {
    const view = register(), pending = deferred<never[]>(); view.database.harness.searchConversations.mockReturnValueOnce(pending.promise)
    const request = view.bridge('sessions.search', { query: '  正文  ' })
    view.grants.revoke(view.grantId, view.sender.id); pending.resolve([])
    await expect(request).rejects.toThrow('授权无效')
    expect(view.database.harness.searchConversations).toHaveBeenCalledExactlyOnceWith('正文')
  })
  it('does not create a project after folder selection returns to a revoked host', async () => {
    const view = register(), pending = deferred<{ canceled: boolean; filePaths: string[] }>(); electron.dialog.mockReturnValueOnce(pending.promise)
    const request = view.bridge('projects.select')
    view.grants.revoke(view.grantId, view.sender.id); pending.resolve({ canceled: false, filePaths: ['/selected/project'] })
    await expect(request).rejects.toThrow('授权无效'); expect(view.database.harness.createProject).not.toHaveBeenCalled()
  })
  it('uses the registered project directory and passes rename fields through both parsers', async () => {
    const view = register(); await view.bridge('projects.open', { projectId: 'project', directory: '/injected' })
    expect(electron.openPath).toHaveBeenCalledExactlyOnceWith('/actual/project')
    await view.bridge('projects.rename', { id: 'project', name: '新名称' })
    expect(view.database.harness.renameProject).toHaveBeenCalledExactlyOnceWith('project', '新名称')
  })
  it('retries only failed records and keeps the run id bound to the real owning task', async () => {
    const view = register(); await view.bridge('automations.retry', { id: 'failed-run', taskId: 'injected' })
    expect(view.scheduler.launch).toHaveBeenCalledExactlyOnceWith('task', 'manual-retry', 'failed-run')
    view.database.automations.getRun.mockReturnValueOnce({ id: 'completed-run', taskId: 'task', status: 'completed', sessionId: 'session' })
    await expect(view.bridge('automations.retry', { id: 'completed-run' })).rejects.toThrow('只能重试失败')
    expect(view.scheduler.launch).toHaveBeenCalledOnce()
  })
})

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach(callback => callback()))
function searchStore() {
  const root = mkdtempSync(join(tmpdir(), 'mira-search-audit-')), database = new Database(':memory:')
  cleanup.push(() => { database.close(); rmSync(root, { recursive: true, force: true }) })
  database.exec('CREATE TABLE harness_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT "FolderOpened", directory TEXT NOT NULL UNIQUE, default_model_provider_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_session_at INTEGER); CREATE TABLE harness_sessions (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, model_provider_id TEXT, model_id TEXT, permission_mode TEXT NOT NULL, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0, archived_at INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL, working_directory TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE harness_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);')
  return new HarnessStore(database, new MiraPaths(root))
}

describe('real SQL Unicode full-text audit', () => {
  it.each(['ÜBER研究', 'ΑΘΗΝΑ研究', 'МОСКВА研究'])('matches original and case-folded non-ASCII message content: %s', async content => {
    const store = searchStore(), session = store.createSession(); store.addMessage(session.id, 'assistant', content)
    await expect(store.searchConversations(content)).resolves.toContainEqual(expect.objectContaining({ id: session.id }))
    await expect(store.searchConversations(content.toLocaleLowerCase())).resolves.toContainEqual(expect.objectContaining({ id: session.id }))
  })
})
