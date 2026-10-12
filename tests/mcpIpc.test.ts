import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpConfigStore } from '../electron/storage/mcpConfigStore'
import { registerMcpIpcHandlers } from '../electron/ipc/mcpIpc'

const electron = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), owner: true }))
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => electron.handlers.set(channel, handler) }, BrowserWindow: { fromWebContents: () => electron.owner ? {} : null } }))
const homes: string[] = []
beforeEach(() => { electron.handlers.clear(); electron.owner = true })
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })
function setup() {
  const home = mkdtempSync(join(tmpdir(), 'mira-mcp-ipc-')); homes.push(home)
  const store = new McpConfigStore(home)
  const manager = { refresh: vi.fn(async () => undefined), getStatus: vi.fn(() => ({ state: 'connected', toolCount: 2 })), reconnect: vi.fn(async () => undefined) }
  const directory = join(home, 'project'); mkdirSync(directory)
  const getProject = vi.fn((id: string) => { if (id !== 'registered') throw new Error('private unknown project'); return { id, directory } })
  registerMcpIpcHandlers({ mcpConfigStore: store, mcpManager: manager as never, database: { harness: { getProject } } as never })
  const frame = { parent: null as unknown }, sender = { mainFrame: frame, isDestroyed: vi.fn(() => false) }
  const event = { sender, senderFrame: frame as typeof frame | undefined }
  const invoke = (operation: string, ...args: unknown[]) => Promise.resolve().then(() => electron.handlers.get(`mcp:${operation}`)!(event, ...args))
  return { home, directory, store, manager, getProject, sender, event, invoke }
}
const remote = { name: 'Remote docs', type: 'streamableHttp' as const, url: 'https://mcp.example/tools', headers: { Authorization: 'Bearer private-token' }, enabled: true }

describe('MCP settings IPC', () => {
  it('manages registered project configuration without opening connections or touching global settings', async () => {
    const view = setup(), scope = { projectId: 'registered' }, globalBefore = readFileSync(view.store.path(), 'utf8')
    expect(await view.invoke('list-servers', scope)).toEqual([])
    expect(existsSync(join(view.directory, '.mira'))).toBe(false)
    const saved = await view.invoke('save-server', { name: 'Project', command: 'node', cwd: '/private/untrusted' }, scope)
    expect(saved).toMatchObject({ scope: 'project', id: expect.stringMatching(/^project:/) })
    expect(saved).not.toHaveProperty('connection')
    expect(saved.cwd).not.toBe('/private/untrusted')
    expect(await view.invoke('list-servers', scope)).toEqual([saved])
    await expect(view.invoke('reconnect-server', saved.id, scope)).rejects.toThrow('项目 MCP 在任务启动时连接')
    await view.invoke('delete-server', saved.id, scope)
    expect(await view.invoke('list-servers', scope)).toEqual([])
    expect(readFileSync(view.store.path(), 'utf8')).toBe(globalBefore)
    expect(view.manager.refresh).not.toHaveBeenCalled(); expect(view.manager.reconnect).not.toHaveBeenCalled(); expect(view.manager.getStatus).not.toHaveBeenCalled()
    expect(view.getProject).toHaveBeenCalledWith('registered')
  })
  it.each([null, [], 'private-path', { directory: '/private/path' }, { projectId: '' }, { projectId: 5 }, { projectId: 'unregistered' }, { projectId: 'registered', path: '/private/path' }])('rejects arbitrary or unregistered project scope without leaking its content (%j)', async scope => {
    const view = setup(), before = readFileSync(view.store.path(), 'utf8')
    for (const [operation, args] of [['list-servers', [scope]], ['save-server', [remote, scope]], ['delete-server', ['id', scope]], ['reconnect-server', ['id', scope]]] as const) await expect(view.invoke(operation, ...args)).rejects.toThrow('MCP 项目范围无效')
    expect(readFileSync(view.store.path(), 'utf8')).toBe(before)
    expect(existsSync(join(view.directory, '.mira'))).toBe(false)
    expect(view.manager.refresh).not.toHaveBeenCalled(); expect(view.manager.reconnect).not.toHaveBeenCalled()
  })
  it('retains old dependency and unscoped global API compatibility while refusing unavailable project access', async () => {
    const view = setup()
    registerMcpIpcHandlers({ mcpConfigStore: view.store, mcpManager: view.manager as never })
    expect(await view.invoke('save-server', remote)).toMatchObject(remote)
    await expect(view.invoke('list-servers', { projectId: 'registered' })).rejects.toThrow('MCP 项目范围无效')
    expect(await view.invoke('list-servers', {})).toHaveLength(1)
  })
  it('reports safe project path failures without exposing credentials or following linked configuration', async () => {
    const view = setup(), scope = { projectId: 'registered' }
    mkdirSync(join(view.directory, '.mira'))
    symlinkSync(view.store.path(), join(view.directory, '.mira', 'mcp.json'))
    for (const operation of ['list-servers', 'save-server']) {
      const pending = operation === 'list-servers' ? view.invoke(operation, scope) : view.invoke(operation, { ...remote, headers: { Authorization: 'private-token' } }, scope)
      await expect(pending).rejects.toThrow('项目 MCP 配置路径无效')
    }
    expect(view.store.list()).toEqual([])
    expect(view.manager.refresh).not.toHaveBeenCalled(); expect(view.manager.reconnect).not.toHaveBeenCalled()
  })
  it('saves and lists real remote records with live connection status, without initiating another connection on read', async () => {
    const view = setup(), saved = await view.invoke('save-server', remote)
    expect(saved).toMatchObject({ ...remote, connection: { state: 'connected', toolCount: 2 } })
    expect(view.manager.refresh).toHaveBeenCalledOnce()
    const listed = await view.invoke('list-servers')
    expect(listed).toEqual([saved]); expect(view.manager.refresh).toHaveBeenCalledOnce()
    expect(new McpConfigStore(view.home).list()).toEqual(view.store.list())
  })

  it.each(['subframe', 'missing', 'foreign-frame', 'destroyed', 'ownerless'])('rejects %s before exposing credentials or changing configuration', async caller => {
    const view = setup(); view.store.save(remote)
    const before = readFileSync(view.store.path(), 'utf8')
    if (caller === 'subframe') view.event.senderFrame!.parent = {}
    if (caller === 'missing') view.event.senderFrame = undefined
    if (caller === 'foreign-frame') view.event.senderFrame = { parent: null }
    if (caller === 'destroyed') view.sender.isDestroyed.mockReturnValue(true)
    if (caller === 'ownerless') electron.owner = false
    for (const operation of ['list-servers', 'save-server', 'delete-server', 'reconnect-server']) await expect(view.invoke(operation, remote)).rejects.toThrow('仅可在平台设置')
    expect(readFileSync(view.store.path(), 'utf8')).toBe(before)
    expect(view.manager.refresh).not.toHaveBeenCalled(); expect(view.manager.reconnect).not.toHaveBeenCalled()
  })

  it('reconnects the stored enabled configuration without trusting caller fields and rechecks the owner', async () => {
    const view = setup(), saved = view.store.save(remote)
    let finish!: () => void
    view.manager.reconnect.mockImplementationOnce(() => new Promise<void>(done => { finish = done }))
    const pending = view.invoke('reconnect-server', saved.id); await Promise.resolve(); await Promise.resolve()
    expect(view.manager.reconnect).toHaveBeenCalledExactlyOnceWith(saved)
    view.sender.isDestroyed.mockReturnValue(true); finish()
    await expect(pending).rejects.toThrow('仅可在平台设置')
    expect(view.manager.getStatus).not.toHaveBeenCalled()
    view.sender.isDestroyed.mockReturnValue(false)
    await expect(view.invoke('reconnect-server', saved.id)).resolves.toEqual({ state: 'connected', toolCount: 2 })
  })

  it('preserves a record on rejected edits and deletes only the selected stored server', async () => {
    const view = setup(), saved = view.store.save(remote), sibling = view.store.save({ name: 'Local', command: 'node', args: [] })
    const before = readFileSync(view.store.path(), 'utf8')
    await expect(view.invoke('save-server', { ...remote, id: saved.id, headers: { Authorization: 42 } })).rejects.toThrow(/请求头/)
    expect(readFileSync(view.store.path(), 'utf8')).toBe(before)
    expect(view.manager.refresh).not.toHaveBeenCalled()
    await view.invoke('delete-server', saved.id)
    expect(view.store.list()).toEqual([sibling]); expect(view.manager.refresh).toHaveBeenCalledExactlyOnceWith([sibling])
  })

  it('reports safe storage errors and never exposes native paths, request headers or tokens', async () => {
    const view = setup()
    vi.spyOn(view.store, 'save').mockImplementationOnce(() => { throw new Error('EACCES /private/database Authorization: Bearer private-token') })
    await expect(view.invoke('save-server', remote)).rejects.toThrow('MCP 配置操作失败，请检查配置文件权限后重试')
    expect(view.manager.refresh).not.toHaveBeenCalled()
  })

  it('rejects invalid, missing or disabled reconnect targets and malformed deletion ids', async () => {
    const view = setup(), disabled = view.store.save({ ...remote, enabled: false })
    for (const id of ['', undefined, {}, 'bad\0id', 'x'.repeat(257)]) {
      await expect(view.invoke('reconnect-server', id)).rejects.toThrow('ID 无效')
      await expect(view.invoke('delete-server', id)).rejects.toThrow('ID 无效')
    }
    for (const id of ['missing', disabled.id]) await expect(view.invoke('reconnect-server', id)).rejects.toThrow('已配置且启用')
    expect(view.manager.reconnect).not.toHaveBeenCalled(); expect(view.manager.refresh).not.toHaveBeenCalled()
  })
})
