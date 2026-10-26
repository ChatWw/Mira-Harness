import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { McpConfigStore } from '../electron/storage/mcpConfigStore'
import { discoverExternalMcpServers, importExternalMcpServers } from '../electron/services/externalMcpImport'

const homes: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })
function setup() {
  const home = mkdtempSync(join(tmpdir(), 'mira-external-mcp-')); homes.push(home)
  const store = new McpConfigStore(home)
  const write = (path: string, value: string | object) => { const full = join(home, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, typeof value === 'string' ? value : JSON.stringify(value)); return full }
  return { home, store, write, discover: () => discoverExternalMcpServers(store, home), import: (ids: unknown) => importExternalMcpServers(store, ids, home) }
}

describe('external MCP source discovery and global merge', () => {
  it('reads real Codex TOML with multiline arrays and nested env without exposing credentials in discovery or writing sources', async () => {
    const view = setup()
    const path = view.write('.codex/config.toml', '[mcp_servers."docs.server"]\ncommand = "node"\nargs = [\n "server.js",\n "space path",\n]\nstartup_timeout_sec = 30\n[mcp_servers."docs.server".env]\nTOKEN = "fixture-secret"\n')
    const before = readFileSync(path, 'utf8'), sources = await view.discover()
    expect(sources).toHaveLength(1); expect(sources[0].name).toBe('Codex CLI'); expect(JSON.stringify(sources)).not.toContain('fixture-secret')
    expect(view.store.list()).toEqual([])
    expect(await view.import([sources[0].servers[0].id])).toMatchObject([{ status: 'imported' }])
    expect(view.store.list()[0]).toMatchObject({ name: 'docs.server', command: 'node', args: ['server.js', 'space path'], env: { TOKEN: 'fixture-secret' } })
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it('normalizes OpenCode command arrays and remote transports, headers and disabled state', async () => {
    const view = setup()
    view.write('.config/opencode/opencode.json', { mcp: { local: { type: 'local', command: ['node', 'space path'], environment: { MODE: 'test' }, enabled: false }, remote: { type: 'remote', url: 'https://example.test/mcp', headers: { 'X-Token': 'secret' } } } })
    view.write('.claude/settings.json', { mcpServers: { events: { type: 'sse', url: 'https://example.test/sse' } } })
    const sources = await view.discover()
    await view.import(sources.flatMap(source => source.servers.map(server => server.id)))
    expect(view.store.list()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'local', type: 'stdio', args: ['space path'], env: { MODE: 'test' }, enabled: false }), expect.objectContaining({ name: 'remote', type: 'streamableHttp', headers: { 'X-Token': 'secret' } }), expect.objectContaining({ name: 'events', type: 'sse' })]))
  })

  it('preserves existing same-name servers case-insensitively and resolves duplicates across selected sources', async () => {
    const view = setup(), original = view.store.save({ name: 'Docs', command: 'original' })
    view.write('.claude/settings.json', { mcpServers: { docs: { command: 'external' }, shared: { command: 'first' } } })
    view.write('.agents/mcp.json', { mcpServers: { shared: { command: 'second' } } })
    const sources = await view.discover()
    expect(sources[0].servers[0]).toMatchObject({ importable: false, reason: expect.stringContaining('同名') })
    expect((await view.import(sources.flatMap(source => source.servers.map(server => server.id)))).map(result => result.status)).toEqual(['skipped', 'imported', 'skipped'])
    expect(view.store.list()).toHaveLength(2); expect(view.store.list()[0]).toEqual(original)
  })

  it('reports malformed sources and invalid entries while importing valid siblings and ignores Gemini', async () => {
    const view = setup()
    view.write('.codex/config.toml', '[invalid'); view.write('.gemini/settings.json', { mcpServers: { hidden: { command: 'node' } } })
    view.write('.qwen/settings.json', { mcpServers: { valid: { command: 'node' }, invalid: { url: 'file:///private' }, badArgs: { command: 'node', args: [7] } } })
    const sources = await view.discover()
    expect(sources).toHaveLength(2); expect(sources[0].error).toContain('格式无效')
    expect(sources[1].servers.map(server => server.importable)).toEqual([true, false, false])
    expect((await view.import(sources[1].servers.map(server => server.id))).map(result => result.status)).toEqual(['imported', 'failed', 'failed'])
    expect(view.store.list()).toHaveLength(1)
  })

  it('rechecks the source and target on import, handles vanished sources and rejects arbitrary selections', async () => {
    const view = setup()
    view.write('.agents/mcp.json', { mcpServers: { docs: { command: 'node' } } })
    const id = (await view.discover())[0].servers[0].id
    view.store.save({ name: 'docs', command: 'existing' })
    expect(await view.import([id])).toMatchObject([{ status: 'skipped' }])
    view.write('.agents/mcp.json', { mcpServers: {} })
    expect(await view.import([id])).toMatchObject([{ status: 'failed' }])
    for (const invalid of ['path', ['../secret'], [{ command: 'node' }]]) await expect(view.import(invalid)).rejects.toThrow('导入选择无效')
  })

  it('rechecks ownership after scanning before persisting and safely reports per-item validation errors', async () => {
    const view = setup()
    view.write('.agents/mcp.json', { mcpServers: { bad: { command: 'node', env: { 'INVALID KEY': 'secret-value' } }, valid: { command: 'node' } } })
    const ids = (await view.discover())[0].servers.map(server => server.id)
    await expect(importExternalMcpServers(view.store, ids, view.home, () => { throw new Error('owner gone') })).rejects.toThrow('owner gone')
    expect(view.store.list()).toEqual([])
    const results = await view.import(ids)
    expect(results.map(result => result.status)).toEqual(['failed', 'imported']); expect(JSON.stringify(results)).not.toContain('secret-value')
  })

  it('resolves Codex environment-backed authentication and skips missing credentials with a useful reason', async () => {
    const view = setup(); vi.stubEnv('MIRA_IMPORT_TOKEN', 'fixture-token')
    view.write('.codex/config.toml', '[mcp_servers.remote]\nurl = "https://example.test/mcp"\nbearer_token_env_var = "MIRA_IMPORT_TOKEN"\n[mcp_servers.missing]\nurl = "https://example.test/mcp"\nbearer_token_env_var = "MIRA_MISSING_IMPORT_TOKEN"\n')
    const servers = (await view.discover())[0].servers
    expect(servers[1].importable).toBe(false)
    await view.import([servers[0].id]); expect(view.store.list()[0].headers).toEqual({ Authorization: 'Bearer fixture-token' })
  })
})
