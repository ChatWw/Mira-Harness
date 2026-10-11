import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { McpManager } from '../electron/adapters/mcpManager'
import type { McpServerConfig } from '../electron/storage/mcpConfigStore'

const sdk = vi.hoisted(() => ({ clients: [] as any[], next: undefined as { listGate?: Promise<void>; failList?: boolean } | undefined }))
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: class {
  onclose?: () => void
  connect = vi.fn(async () => undefined)
  listTools = vi.fn(async () => ({ tools: [{ name: 'mira_review' }] }))
  callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'reviewed' }] }))
  close = vi.fn(async () => { this.onclose?.() })
  constructor() {
    const plan = sdk.next; sdk.next = undefined
    if (plan) this.listTools.mockImplementation(async () => { await plan.listGate; if (plan.failList) throw new Error('server error'); return { tools: [{ name: 'stale' }] } })
    sdk.clients.push(this)
  }
} }))
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: class { constructor(public config: unknown) {} } }))
const config: McpServerConfig = { id: 'review', name: 'Review', command: 'test-owned-server', args: [], enabled: true, createdAt: 1, updatedAt: 1 }
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes }); return { promise, resolve } }
let manager: McpManager
beforeEach(() => { sdk.clients = []; sdk.next = undefined; manager = new McpManager(); vi.spyOn(console, 'error').mockImplementation(() => undefined) })
afterEach(async () => { await manager.closeAll(); vi.restoreAllMocks() })

describe('Mira MCP connection state', () => {
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
    expect(manager.getTools().map(tool => tool.name)).toEqual(['mira_review'])
    expect(sdk.clients[1].close).not.toHaveBeenCalled()
    const nextGate = deferred(); sdk.clients[1].onclose(); sdk.next = { listGate: nextGate.promise }
    const oldConfig = manager.reconnect(config); await tick()
    await manager.refresh([{ ...config, command: 'replacement' }]); nextGate.resolve(); await oldConfig
    expect(manager.getTools().map(tool => tool.name)).toEqual(['mira_review'])
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
    expect(manager.getStatus(config.id)).toEqual({ state: 'failed', toolCount: 0 })
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
    expect(manager.getTools().map(tool => tool.name)).toEqual(['mira_review'])
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
