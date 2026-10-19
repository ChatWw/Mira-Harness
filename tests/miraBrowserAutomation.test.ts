import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { McpManager } from '../electron/adapters/mcpManager'
import { MiraBrowserAutomation } from '../electron/services/miraBrowserAutomation'
import { createMiraBrowserTransport } from '../electron/services/miraBrowserMcp'

function fixture() {
  const service = new MiraBrowserAutomation()
  const owner = { isDestroyed: () => false, send: vi.fn() } as any
  const guest = Object.assign(new EventEmitter(), {
    isDestroyed: () => false, getType: () => 'webview', hostWebContents: owner, getURL: () => 'https://example.com/', getTitle: () => 'Fixture',
    isLoadingMainFrame: () => false, loadURL: vi.fn(async () => undefined), capturePage: vi.fn(async () => ({ toPNG: () => Buffer.from('image') })),
    debugger: { isAttached: () => true, attach: vi.fn(), sendCommand: vi.fn(async (method: string) => method === 'Page.getFrameTree' ? { frameTree: { frame: { id: 'frame' } } } : method === 'Page.createIsolatedWorld' ? { executionContextId: 1 } : { result: { value: { title: 'Fixture', elements: [] } } }) },
  }) as any
  service.bind(owner, 'task', 'browser:one', guest)
  return { service, owner, guest }
}

describe('task-scoped embedded browser control', () => {
  it('connects the built-in declaration through the real manager without spawning a browser process', async () => {
    const v = fixture()
    const manager = new McpManager().createSibling(() => createMiraBrowserTransport(v.owner, 'task', v.service))
    const config = { id: 'plugin:browser-use@mira-builtin:browser', name: 'browser', command: 'mira:embedded-browser', args: [], enabled: true, createdAt: 0, updatedAt: 0 }
    try {
      await manager.refresh([config])
      expect(manager.getStatus(config.id)).toMatchObject({ state: 'connected', toolCount: 8 })
      const tool = manager.getTools().find(tool => tool.miraMcpToolName === 'browser_list')
      expect(JSON.parse((await tool.execute('call', {})).content[0].text)).toEqual([expect.objectContaining({ browserId: 'browser:one' })])
    } finally { await manager.closeAll() }
  })

  it('rejects foreign guests, windows and task ids', async () => {
    const v = fixture()
    expect(() => v.service.bind({} as any, 'task', 'browser:one', v.guest)).toThrow('不属于当前窗口')
    expect(() => v.service.bind(v.owner, 'other', 'browser:one', v.guest)).toThrow('已绑定其他任务')
    v.guest.getType = () => 'window'
    expect(() => v.service.bind(v.owner, 'task', 'browser:bad', v.guest)).toThrow('不属于当前窗口')
    await expect(v.service.execute(v.owner, 'other', 'browser_snapshot', { browserId: 'browser:one' })).rejects.toThrow('不属于当前任务')
    await expect(v.service.execute({ isDestroyed: () => false } as any, 'task', 'browser_snapshot', { browserId: 'browser:one' })).rejects.toThrow('不属于当前任务')
    expect(v.guest.debugger.sendCommand).not.toHaveBeenCalled()
  })
  it('rejects queued commands after guest replacement, closure or abort', async () => {
    const v = fixture(), params = { browserId: 'browser:one' }
    const queued = v.service.execute(v.owner, 'task', 'browser_snapshot', params)
    const replacement = Object.assign(new EventEmitter(), v.guest)
    v.service.bind(v.owner, 'task', 'browser:one', replacement)
    await expect(queued).rejects.toThrow('已替换')
    replacement.emit('destroyed')
    await expect(v.service.execute(v.owner, 'task', 'browser_snapshot', params)).rejects.toThrow('已关闭')
    const controller = new AbortController(); controller.abort()
    await expect(v.service.execute(v.owner, 'task', 'browser_list', {}, controller.signal)).rejects.toThrow()
  })
  it('opens through the task UI and cleans cancellation without allowing caller-supplied scope', async () => {
    const v = fixture()
    v.owner.send.mockImplementation((_channel: string, event: any) => v.service.bind(v.owner, event.sessionId, event.payload.browserId, Object.assign(new EventEmitter(), v.guest)))
    const result = await v.service.execute(v.owner, 'task', 'browser_open', { url: 'https://example.com' })
    expect(result.browserId).toMatch(/^browser:/)
    expect(v.owner.send).toHaveBeenCalledWith('harness:event', expect.objectContaining({ sessionId: 'task', type: 'browser-open' }))
    v.owner.send.mockImplementation(() => undefined)
    const abort = new AbortController()
    const pending = v.service.execute(v.owner, 'task', 'browser_open', { url: 'https://example.com' }, abort.signal)
    abort.abort(); await expect(pending).rejects.toThrow()
    expect((v.service as any).waiting.size).toBe(0)
    await expect(v.service.execute(v.owner, 'task', 'browser_open', { url: 'file:///secret' })).rejects.toThrow('HTTP')
  })
  it('runs a real MCP handshake, exposes only the scoped tools and returns native images', async () => {
    const v = fixture(), client = new Client({ name: 'test', version: '1' })
    await client.connect(await createMiraBrowserTransport(v.owner, 'task', v.service))
    try {
      expect((await client.listTools()).tools).toHaveLength(8)
      const result = await client.callTool({ name: 'browser_snapshot', arguments: { browserId: 'browser:one' } })
      expect(result.isError).not.toBe(true)
      expect(v.guest.debugger.sendCommand).toHaveBeenCalledWith('Page.createIsolatedWorld', expect.objectContaining({ worldName: 'mira-browser-automation' }))
      expect((await client.callTool({ name: 'browser_screenshot', arguments: { browserId: 'browser:one' } })).content).toEqual([{ type: 'image', data: Buffer.from('image').toString('base64'), mimeType: 'image/png' }])
      expect((await client.callTool({ name: 'browser_list', arguments: { sessionId: 'other' } })).isError).toBe(true)
    } finally { await client.close() }
  })
})
