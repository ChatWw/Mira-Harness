import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { McpManager } from '../electron/adapters/mcpManager'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpServerConfig } from '../electron/storage/mcpConfigStore'

const sdk = vi.hoisted(() => ({ clients: [] as any[], next: undefined as { connectGate?: Promise<void>; listGate?: Promise<void>; failList?: boolean } | undefined }))
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: class {
  onclose?: () => void
  connect = vi.fn(async () => undefined)
  listTools = vi.fn(async () => ({ tools: [{ name: 'mira_review' }] }))
  callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'reviewed' }] }))
  close = vi.fn(async () => { this.onclose?.() })
  constructor() {
    const plan = sdk.next; sdk.next = undefined
    if (plan?.connectGate) this.connect.mockImplementation(async () => { await plan.connectGate })
    if (plan) this.listTools.mockImplementation(async () => { await plan.listGate; if (plan.failList) throw new Error('server error'); return { tools: [{ name: 'stale' }] } })
    sdk.clients.push(this)
  }
} }))
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ getDefaultEnvironment: () => ({ PATH: '/owned/bin' }), StdioClientTransport: class { constructor(public config: unknown) {} } }))
const config: McpServerConfig = { id: 'review', name: 'Review', command: 'test-owned-server', args: [], enabled: true, createdAt: 1, updatedAt: 1 }
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes }); return { promise, resolve } }
let manager: McpManager
beforeEach(() => { sdk.clients = []; sdk.next = undefined; manager = new McpManager(); vi.spyOn(console, 'error').mockImplementation(() => undefined) })
afterEach(async () => { await manager.closeAll(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('Mira MCP connection state', () => {
  it('routes only the builtin computer plugin to the bundled executable, including run-owned siblings', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-cua-path-')), binary = join(root, 'cua-driver')
    writeFileSync(binary, 'fixture')
    const owned = new McpManager(undefined, undefined, binary), sibling = owned.createSibling()
    const desktop = { ...config, id: 'plugin:computer-use@mira-builtin:desktop', command: 'cua-driver' }
    try {
      await sibling.refresh([desktop, { ...desktop, id: 'plugin:computer-use@local:desktop' }])
      expect(sdk.clients[0].connect.mock.calls[0][0].config.command).toBe(binary)
      expect(sdk.clients[1].connect.mock.calls[0][0].config.command).toBe('cua-driver')
      rmSync(binary); await owned.refresh([desktop])
      expect(owned.getStatus(desktop.id)).toMatchObject({ state: 'failed', error: expect.stringContaining('电脑控制组件缺失') })
    } finally { await sibling.closeAll(); await owned.closeAll(); rmSync(root, { recursive: true, force: true }) }
  })

  it('retains image blocks while redacting credentials in text and errors', async () => {
    await manager.refresh([{ ...config, env: { TOKEN: 'secret-token' } }])
    const result = { content: [{ type: 'text', text: 'secret-token' }, { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' }] }
    sdk.clients[0].callTool.mockResolvedValue(result)
    const tool = manager.getTools()[0]
    expect(await tool.execute('pixels', {})).toMatchObject({ content: [{ type: 'text', text: expect.not.stringContaining('secret-token') }, result.content[1]] })
    sdk.clients[0].callTool.mockResolvedValue({ ...result, isError: true })
    await expect(tool.execute('error', {})).rejects.not.toThrow('aW1hZ2U=')
  })

  it.each([{ data: 'not base64', mimeType: 'image/png' }, { data: 'YQ==', mimeType: 'text/html' }, { data: 'a'.repeat(28 * 1024 * 1024 + 4), mimeType: 'image/png' }])('rejects malformed or oversized image results', async image => {
    await manager.refresh([config])
    sdk.clients[0].callTool.mockResolvedValue({ content: [{ type: 'image', ...image }] })
    await expect(manager.getTools()[0].execute('bad-image', {})).rejects.toThrow('图片格式无效')
  })

  it('closes a plugin run handshake promptly on cancellation instead of waiting for its timeout', async () => {
    const gate = deferred(); sdk.next = { connectGate: gate.promise }
    const controller = new AbortController()
    const pending = manager.refresh([config], controller.signal)
    await tick(); controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(sdk.clients[0].close).toHaveBeenCalledOnce()
    expect(manager.getTools()).toEqual([])
    gate.resolve(); await tick()
    expect(manager.getTools()).toEqual([])
  })
  it('bounds an unresponsive transport handshake and continues connecting later servers', async () => {
    vi.useFakeTimers(); const gate = deferred(); sdk.next = { connectGate: gate.promise }
    const pending = manager.refresh([config, { ...config, id: 'later' }]); await tick()
    expect(manager.getStatus(config.id).state).toBe('connecting')
    await vi.advanceTimersByTimeAsync(15_000); await pending
    expect(manager.getStatus(config.id)).toMatchObject({ state: 'failed', error: expect.any(String) })
    expect(manager.getStatus('later')).toEqual({ state: 'connected', toolCount: 1 })
    expect(sdk.clients[0].close).toHaveBeenCalledOnce()
    gate.resolve(); await tick()
    expect(manager.getStatus(config.id).state).toBe('failed')
  })

  it('immediately cancels a pending transport handshake on closeAll without waiting for its timeout', async () => {
    const gate = deferred(); sdk.next = { connectGate: gate.promise }
    const pending = manager.refresh([config]); await tick()
    await manager.closeAll(); await pending
    expect(manager.getStatus(config.id)).toEqual({ state: 'disconnected', toolCount: 0 })
    gate.resolve(); await tick(); expect(manager.getTools()).toEqual([])
  })

  it('passes stdio env together with SDK default environment and keeps child stderr out of unredacted app logs', async () => {
    await manager.refresh([{ ...config, env: { MIRA_TOKEN: 'private' } }])
    expect(sdk.clients[0].connect.mock.calls[0][0].config).toMatchObject({ env: { PATH: '/owned/bin', MIRA_TOKEN: 'private' }, stderr: 'ignore' })
  })

  it('reconnects only a failed enabled server and preserves a connected sibling', async () => {
    sdk.next = { failList: true }
    await manager.refresh([config, { ...config, id: 'sibling' }])
    const sibling = sdk.clients[1]
    await manager.reconnect(config)
    expect(manager.getStatus(config.id)).toEqual({ state: 'connected', toolCount: 1 })
    expect(sdk.clients).toHaveLength(3)
    expect(sibling.close).not.toHaveBeenCalled()
    await manager.reconnect(config)
    await expect(manager.reconnect({ ...config, enabled: false })).rejects.toThrow('已启用')
    expect(sdk.clients).toHaveLength(3)
  })

  it('coalesces repeated retries and cannot restore a deleted connection after closeAll', async () => {
    const gate = deferred(); sdk.next = { listGate: gate.promise }
    const retry = manager.reconnect(config); await tick()
    await manager.reconnect(config)
    expect(sdk.clients).toHaveLength(1)
    expect(manager.getStatus(config.id).state).toBe('connecting')
    await manager.closeAll(); gate.resolve(); await retry
    expect(manager.getTools()).toEqual([])
    expect(manager.getStatus(config.id).state).toBe('disconnected')
    expect(sdk.clients[0].close).toHaveBeenCalledOnce()
  })

  it('ignores a disconnected retry finishing after another retry or configuration refresh', async () => {
    const gate = deferred(); sdk.next = { listGate: gate.promise }
    const stale = manager.reconnect(config); await tick(); sdk.clients[0].onclose()
    await manager.reconnect(config)
    gate.resolve(); await stale
    expect(manager.getTools().map(tool => tool.miraMcpToolName)).toEqual(['mira_review'])
    expect(sdk.clients[1].close).not.toHaveBeenCalled()
    const nextGate = deferred(); sdk.clients[1].onclose(); sdk.next = { listGate: nextGate.promise }
    const oldConfig = manager.reconnect(config); await tick()
    await manager.refresh([{ ...config, command: 'replacement' }]); nextGate.resolve(); await oldConfig
    expect(manager.getTools().map(tool => tool.miraMcpToolName)).toEqual(['mira_review'])
    expect(sdk.clients[2].close).toHaveBeenCalledOnce()
    expect(sdk.clients[3].close).not.toHaveBeenCalled()
  })

  it('reports actual tools and keeps a status read side-effect free and independent from its internal map', async () => {
    const refresh = manager.refresh([config, { ...config, id: 'disabled', enabled: false }])
    expect(manager.getStatus(config.id)).toEqual({ state: 'connecting', toolCount: 0 })
    await refresh
    expect(sdk.clients).toHaveLength(1)
    expect(manager.getStatus(config.id)).toEqual({ state: 'connected', toolCount: 1 })
    const status = manager.getStatus(config.id); status.state = 'failed'
    expect(manager.getStatus(config.id).state).toBe('connected')
    expect(manager.getTools(['disabled'])).toEqual([])
    expect(sdk.clients[0].connect).toHaveBeenCalledOnce()
    expect(await manager.getTools([config.id])[0].execute('call', {})).toMatchObject({ content: [{ text: 'reviewed' }] })
  })

  it('closes a failed client and reports no available tools', async () => {
    sdk.next = { failList: true }
    await manager.refresh([config])
    expect(manager.getStatus(config.id)).toMatchObject({ state: 'failed', toolCount: 0, error: expect.stringContaining('启动命令') })
    expect(manager.getTools()).toEqual([])
    expect(sdk.clients.at(-1).close).toHaveBeenCalledOnce()
  })

  it('cannot resurrect an old configuration after a newer refresh completes', async () => {
    const gate = deferred(); sdk.next = { listGate: gate.promise }
    const first = manager.refresh([config])
    await tick()
    await manager.refresh([{ ...config, command: 'new-owned-server' }])
    gate.resolve(); await first
    expect(manager.getStatus(config.id)).toEqual({ state: 'connected', toolCount: 1 })
    expect(manager.getTools().map(tool => tool.miraMcpToolName)).toEqual(['mira_review'])
    expect(sdk.clients[0].close).toHaveBeenCalledOnce()
    expect(sdk.clients[1].close).not.toHaveBeenCalled()
  })

  it('invalidates an in-flight connection on close and clears tools after a live disconnect', async () => {
    const gate = deferred(); sdk.next = { listGate: gate.promise }
    const pending = manager.refresh([config])
    await tick(); await manager.closeAll()
    const immediateCloses = sdk.clients[0].close.mock.calls.length
    gate.resolve(); await pending
    expect(immediateCloses).toBe(1)
    expect(manager.getTools()).toEqual([])
    expect(manager.getStatus(config.id)).toEqual({ state: 'disconnected', toolCount: 0 })
    await manager.refresh([config])
    sdk.clients[1].onclose()
    expect(manager.getTools()).toEqual([])
    expect(manager.getStatus(config.id)).toEqual({ state: 'disconnected', toolCount: 0 })
  })
})
