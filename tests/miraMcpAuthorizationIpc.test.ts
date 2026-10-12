import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpManager } from '../electron/adapters/mcpManager'
import { McpConfigStore } from '../electron/storage/mcpConfigStore'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraMcpCredentialStore } from '../electron/storage/miraMcpCredentialStore'
import { MiraMcpAuthorization } from '../electron/services/miraMcpAuthorization'
import { registerMcpIpcHandlers } from '../electron/ipc/mcpIpc'
import { miraMcpOAuthServer } from './helpers/miraMcpOAuthServer'

const electron = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), urls: [] as string[], open: vi.fn(async (_: string) => undefined) }))
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => electron.handlers.set(channel, handler) }, BrowserWindow: { fromWebContents: () => ({}) }, shell: { openExternal: (url: string) => { electron.urls.push(url); return electron.open(url) } } }))
const cleanups: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); electron.handlers.clear(); electron.urls = []; electron.open.mockReset(); electron.open.mockResolvedValue(undefined) })
async function until(predicate: () => boolean) { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) } throw new Error('Expected IPC state did not arrive') }
async function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'mira-mcp-oauth-ipc-')); cleanups.push(() => rmSync(home, { recursive: true, force: true }))
  const paths = new MiraPaths(home).ensure(), store = new McpConfigStore(paths)
  // Encryption is substituted only in this IPC fixture; cryptographic persistence has a separate real-cipher test.
  const credentials = new MiraMcpCredentialStore(paths, { encryptString: value => Buffer.from(value), decryptString: value => value.toString() })
  const authorization = new MiraMcpAuthorization(credentials); cleanups.push(() => authorization.closeAll())
  const manager = new McpManager(authorization.fork(), authorization); cleanups.push(() => manager.closeAll())
  const server = await miraMcpOAuthServer(); cleanups.push(() => server.close())
  const directory = join(home, 'project'); mkdirSync(directory)
  registerMcpIpcHandlers({ mcpConfigStore: store, mcpManager: manager, mcpAuthorization: authorization, database: { harness: { getProject: (id: string) => { if (id !== 'owned') throw new Error('unregistered'); return { directory } } } } as never })
  const frame = { parent: null }, event = { senderFrame: frame, sender: { mainFrame: frame, isDestroyed: () => false } }
  const invoke = (name: string, ...args: unknown[]) => Promise.resolve().then(() => electron.handlers.get(`mcp:${name}`)!(event, ...args))
  return { home, paths, store, manager, authorization, credentials, server, directory, event, invoke }
}
describe('OAuth settings IPC using actual configuration and transports', () => {
  it.each(['global', 'project'])('opens a host-owned %s authorization URL and resolves callback to the correct row', async scope => {
    const view = await fixture(), selectedScope = scope === 'global' ? undefined : { projectId: 'owned' }
    const saved = await view.invoke('save-server', { name: 'OAuth service', type: 'streamableHttp', url: view.server.url, authentication: 'oauth' }, selectedScope)
    if (scope === 'global') await until(() => view.manager.getStatus(saved.id).state === 'authorization-required')
    electron.open.mockRejectedValueOnce(new Error('private-browser-path'))
    await expect(view.invoke('authorize-server', saved.id, selectedScope)).rejects.toThrow('浏览器无法打开')
    expect(view.server.counts.exchange).toBe(0)
    const pending = await view.invoke('authorize-server', saved.id, selectedScope)
    expect(pending.state).toBe('authorization-required'); expect(pending).not.toHaveProperty('url')
    expect(electron.urls).toHaveLength(2)
    expect(new URL(electron.urls[1]).pathname).toBe('/authorize')
    expect(electron.urls[0]).toBe(electron.urls[1])
    await fetch(await view.server.browserCallback(electron.urls[1]))
    let rows: any[] = []
    for (let i = 0; i < 200; i++) { rows = await view.invoke('list-servers', selectedScope); if (rows[0].connection.state === (scope === 'global' ? 'connected' : 'authorized')) break; await new Promise(resolve => setTimeout(resolve, 10)) }
    expect(rows[0].connection.state).toBe(scope === 'global' ? 'connected' : 'authorized')
    const stored = view.credentials.read(saved.id, view.server.url)!
    expect(JSON.stringify(rows)).not.toContain(stored.tokens.access_token)
    expect(view.server.counts.exchange).toBe(1)
    expect(scope === 'global' ? view.store.list() : view.store.forProject(view.directory).list()).toHaveLength(1)
    if (scope === 'project') expect(view.manager.getTools()).toEqual([])
  })
  it('rejects subframes, arbitrary URLs, unregistered scope and non-OAuth services before opening a browser', async () => {
    const view = await fixture(), saved = view.store.save({ name: 'Headers', type: 'streamableHttp', url: view.server.url })
    for (const input of [saved.id, 'https://forged.example/authorize', { id: saved.id, url: 'https://forged.example' }]) await expect(view.invoke('authorize-server', input)).rejects.toThrow(/只能授权|ID 无效/)
    await expect(view.invoke('authorize-server', saved.id, { projectId: 'unregistered' })).rejects.toThrow('项目范围无效')
    view.event.senderFrame = { parent: {} } as never
    await expect(view.invoke('authorize-server', saved.id)).rejects.toThrow('仅可在平台设置')
    expect(electron.urls).toEqual([]); expect(view.server.counts.registration).toBe(0)
  })
})
