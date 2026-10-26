import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpConfigStore } from '../electron/storage/mcpConfigStore'
import { registerMcpIpcHandlers } from '../electron/ipc/mcpIpc'

const host = vi.hoisted(() => ({ home: '', handlers: new Map<string, Function>(), owner: true }))
vi.mock('node:os', async importOriginal => ({ ...await importOriginal<typeof import('node:os')>(), homedir: () => host.home }))
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: Function) => host.handlers.set(channel, handler) }, BrowserWindow: { fromWebContents: () => host.owner ? {} : null } }))
beforeEach(() => { host.home = mkdtempSync(join(tmpdir(), 'mira-mcp-import-ipc-')); host.owner = true; host.handlers.clear() })
afterEach(() => rmSync(host.home, { recursive: true, force: true }))
function setup() {
  const store = new McpConfigStore(host.home), manager = { refresh: vi.fn(), getStatus: vi.fn() }
  registerMcpIpcHandlers({ mcpConfigStore: store, mcpManager: manager as never })
  const frame = { parent: null }, event = { senderFrame: frame, sender: { mainFrame: frame, isDestroyed: () => false } }
  return { store, manager, invoke: (name: string, ...args: unknown[]) => host.handlers.get(`mcp:${name}`)!(event, ...args) }
}
describe('external MCP import IPC integration', () => {
  it('discovers through the host and imports globally once, then skips existing names without refreshing connections', async () => {
    mkdirSync(join(host.home, '.codex')); writeFileSync(join(host.home, '.codex/config.toml'), '[mcp_servers.docs]\ncommand = "node"\n')
    const view = setup(), sources = await view.invoke('discover-external')
    expect(sources[0].name).toBe('Codex CLI')
    const ids = [sources[0].servers[0].id]
    expect(await view.invoke('import-external', ids)).toMatchObject([{ name: 'docs', status: 'imported' }])
    expect(view.store.list()[0].name).toBe('docs'); expect(view.manager.refresh).toHaveBeenCalledOnce()
    expect(await view.invoke('import-external', ids)).toMatchObject([{ status: 'skipped' }]); expect(view.manager.refresh).toHaveBeenCalledOnce()
  })
  it('rejects untrusted owners and malformed import requests before any store write', async () => {
    const view = setup()
    await expect(view.invoke('import-external', ['../private'])).rejects.toThrow('导入选择无效')
    host.owner = false
    await expect(view.invoke('import-external', [])).rejects.toThrow('仅可在平台设置')
    await expect(view.invoke('discover-external')).rejects.toThrow('仅可在平台设置')
    expect(view.store.list()).toEqual([]); expect(view.manager.refresh).not.toHaveBeenCalled()
  })
})
