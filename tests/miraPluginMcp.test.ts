import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraPluginStore } from '../electron/storage/miraPluginStore'

const homes: string[] = []
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
function fixture(mcpServers?: unknown, skill = false) {
  const home = mkdtempSync(join(tmpdir(), 'mira-plugin-mcp-')); homes.push(home)
  const root = join(home, 'package'), manifest = join(root, '.mira-plugin/plugin.json')
  mkdirSync(join(root, '.mira-plugin'), { recursive: true })
  writeFileSync(manifest, JSON.stringify({ name: 'tools', ...(mcpServers === undefined ? {} : { mcpServers }) }))
  if (skill) {
    mkdirSync(join(root, 'skills/check'), { recursive: true })
    writeFileSync(join(root, 'skills/check/SKILL.md'), '---\nname: check\ndescription: Check code\n---\nInspect changes.')
  }
  return { home, root, manifest, store: new MiraPluginStore(new MiraPaths(home).ensure()) }
}
const command = { command: 'node', args: ['${MIRA_PLUGIN_ROOT}/server.mjs'] }

describe('Mira plugin MCP declarations and frozen capability identity', () => {
  it('registers MCP-only packages and keeps connection credentials out of every public descriptor', () => {
    const view = fixture({ search: { type: 'http', url: 'https://example.test/SECRET_URL', headers: { Authorization: 'SECRET_HEADER' } } })
    const listed = view.store.register(view.root), frozen = view.store.snapshots()
    expect(listed[0]).toMatchObject({ skills: [], unsupported: [], mcpServers: [{ id: 'plugin:tools@local:search', key: 'search', name: 'plugin:tools:search', type: 'streamableHttp', enabled: true }] })
    for (const snapshot of [listed, frozen, view.store.catalog(frozen)]) {
      expect(JSON.stringify(snapshot)).not.toContain('SECRET_')
      expect(JSON.stringify(snapshot)).not.toContain('https://')
    }
    expect(view.store.resolveMcp(frozen)).toMatchObject([{ id: 'plugin:tools@local:search', name: 'plugin:tools:search', type: 'streamableHttp', url: 'https://example.test/SECRET_URL', headers: { Authorization: 'SECRET_HEADER' } }])
    expect(readFileSync(join(view.home, '.mira/config/plugins.json'), 'utf8')).not.toContain('SECRET_')
  })
  it('merges the default file, relative files and inline arrays, with later manifest declarations winning', () => {
    const view = fixture(['extra.json', { shared: { command: 'last' } }, { mcpServers: { final: command } }])
    writeFileSync(join(view.root, '.mcp.json'), JSON.stringify({ mcpServers: { shared: { command: 'first' }, default: command } }))
    writeFileSync(join(view.root, 'extra.json'), JSON.stringify({ shared: { command: 'middle' }, remote: { type: 'sse', url: 'https://example.test/sse' } }))
    view.store.register(view.root)
    const configs = view.store.resolveMcp(view.store.snapshots())
    expect(configs.map(config => config.name)).toEqual(['plugin:tools:shared', 'plugin:tools:default', 'plugin:tools:remote', 'plugin:tools:final'])
    expect(configs[0].command).toBe('last')
    expect(configs[2].type).toBe('sse')
  })
  it('resolves roots and real project variables without allowing configured env to spoof the host identity', () => {
    const view = fixture({ local: { ...command, cwd: '${CLAUDE_PROJECT_DIR}', env: { MIRA_PLUGIN_ID: 'fake', MIRA_PLUGIN_ROOT: 'fake', MIRA_PROJECT_DIR: 'fake', ROOTS: '${CLAUDE_PLUGIN_ROOT}:${ZCODE_PLUGIN_ROOT}', PROJECT: '${ZCODE_PROJECT_DIR}' } } })
    view.store.register(view.root)
    const frozen = view.store.snapshots(), project = join(view.home, 'project'); mkdirSync(project)
    const root = frozen[0].root
    expect(view.store.resolveMcp(frozen, project)[0]).toMatchObject({ cwd: project, args: [join(root, 'server.mjs')], env: { MIRA_PLUGIN_ID: 'tools@local', MIRA_PLUGIN_ROOT: root, MIRA_PROJECT_DIR: project, ROOTS: `${root}:${root}`, PROJECT: project } })
    expect(view.store.resolveMcp(frozen)[0].cwd).toBe(root)
  })
  it('expands ENV syntax only in credentials, with nonrecursive substitutions and explicit missing values', () => {
    const old = process.env.MIRA_TEST_PLUGIN_TOKEN; process.env.MIRA_TEST_PLUGIN_TOKEN = '${MIRA_PLUGIN_ROOT}-secret'
    try {
      const view = fixture({ good: { command: 'node', args: ['${MIRA_TEST_PLUGIN_TOKEN}'], env: { KEY: '${MIRA_TEST_PLUGIN_TOKEN}', OTHER: '${ENV:MIRA_TEST_PLUGIN_TOKEN}' } }, missing: { command: 'node', env: { KEY: '${ENV:MIRA_PLUGIN_MISSING_RANDOM}' } } })
      view.store.register(view.root); const frozen = view.store.snapshots()
      const configs = view.store.resolveMcp(frozen)
      expect(configs).toHaveLength(1)
      expect(configs[0]).toMatchObject({ args: ['${MIRA_TEST_PLUGIN_TOKEN}'], env: { KEY: '${MIRA_PLUGIN_ROOT}-secret', OTHER: '${MIRA_PLUGIN_ROOT}-secret' } })
      expect(frozen[0].mcpServers?.find(server => server.key === 'missing')?.unavailableReason).toContain('环境变量')
    } finally { if (old === undefined) delete process.env.MIRA_TEST_PLUGIN_TOKEN; else process.env.MIRA_TEST_PLUGIN_TOKEN = old }
  })
  it('isolates malformed/unsupported services while keeping other MCPs and Skills usable', () => {
    const view = fixture({ good: command, bad: { command: 5 }, oauth: { ...command, oauth: {} }, auth: { ...command, auth: { token: 'SECRET_TOKEN' } }, options: { command: '${user_config.cmd}' }, data: { ...command, env: { DATA: '${CLAUDE_PLUGIN_DATA}' } }, disabled: { ...command, enabled: false } }, true)
    expect(view.store.register(view.root)[0].skills).toHaveLength(1)
    const frozen = view.store.snapshots()
    expect(view.store.resolveMcp(frozen).map(server => server.name)).toEqual(['plugin:tools:good'])
    expect(frozen[0].mcpServers?.filter(server => server.unavailableReason)).toHaveLength(5)
    expect(JSON.stringify(frozen)).not.toContain('SECRET_TOKEN')
  })
  it('intersects frozen and live identities, rejecting execution after replacement, removal, disabling or conflicts', () => {
    const view = fixture({ tool: command }); view.store.register(view.root)
    const frozen = view.store.snapshots(), id = frozen[0].mcpServers![0].id
    expect(() => view.store.assertMcp(frozen, id)).not.toThrow()
    writeFileSync(view.manifest, JSON.stringify({ name: 'tools', mcpServers: { tool: { command: 'changed' }, later: command } }))
    expect(view.store.resolveMcp(frozen)).toEqual([])
    expect(view.store.catalog(frozen)[0].mcpServers![0].unavailableReason).toContain('变化')
    expect(() => view.store.assertMcp(frozen, id)).toThrow('变化')
    writeFileSync(view.manifest, JSON.stringify({ name: 'tools', mcpServers: { tool: command } }))
    view.store.setEnabled('tools@local', false)
    expect(() => view.store.assertMcp(frozen, id)).toThrow('停用')
    view.store.setEnabled('tools@local', true)
    expect(view.store.resolveMcp([...frozen, { ...frozen[0], id: 'tools@other' }])).toEqual([])
    expect(() => view.store.assertMcp([...frozen, { ...frozen[0], id: 'tools@other' }], id)).toThrow('冲突')
    view.store.remove('tools@local')
    expect(() => view.store.assertMcp(frozen, id)).toThrow('停用')
  })
  it('rejects path escapes, substituted symlinks and oversized configs without dropping unrelated Skills', () => {
    const view = fixture('../outside.json', true)
    writeFileSync(join(view.home, 'outside.json'), JSON.stringify({ unsafe: command }))
    expect(view.store.register(view.root)[0].mcpServers?.[0].unavailableReason).toContain('路径')
    expect(view.store.resolveMcp(view.store.snapshots())).toEqual([])
    const linked = fixture('linked.json', true)
    symlinkSync(join(view.home, 'outside.json'), join(linked.root, 'linked.json'))
    expect(linked.store.register(linked.root)[0].mcpServers?.[0].unavailableReason).toContain('路径')
    const bounded = fixture(undefined, true)
    writeFileSync(join(bounded.root, '.mcp.json'), ' '.repeat(256 * 1024 + 1))
    expect(bounded.store.register(bounded.root)[0].mcpServers?.[0].unavailableReason).toContain('读取')
  })
  it('hashes source bytes and origin so same-value file edits also invalidate a frozen service', () => {
    const view = fixture('mcp.json'); writeFileSync(join(view.root, 'mcp.json'), JSON.stringify({ tool: command }))
    view.store.register(view.root); const frozen = view.store.snapshots()
    writeFileSync(join(view.root, 'mcp.json'), JSON.stringify({ tool: command }, null, 2))
    expect(view.store.resolveMcp(frozen)).toEqual([])
    expect(() => view.store.assertMcp(frozen, frozen[0].mcpServers![0].id)).toThrow('变化')
  })
  it('blocks a single disabled or removed key without preventing another frozen service from resolving', () => {
    const view = fixture({ first: command, second: command }); view.store.register(view.root)
    const frozen = view.store.snapshots(), first = frozen[0].mcpServers![0].id
    writeFileSync(view.manifest, JSON.stringify({ name: 'tools', mcpServers: { first: { ...command, enabled: false }, second: command } }))
    expect(view.store.resolveMcp(frozen).map(server => server.name)).toEqual(['plugin:tools:second'])
    expect(() => view.store.assertMcp(frozen, first)).toThrow('停用')
    writeFileSync(view.manifest, JSON.stringify({ name: 'tools', mcpServers: { second: command } }))
    expect(view.store.catalog(frozen)[0].mcpServers![0].unavailableReason).toContain('移除')
  })
  it('blocks a live marketplace conflict even if it was absent from the frozen catalog', () => {
    const view = fixture({ tool: command }); view.store.register(view.root)
    const frozen = view.store.snapshots(), id = frozen[0].mcpServers![0].id
    view.store.register(view.root, 'other')
    expect(view.store.resolveMcp(frozen)).toEqual([])
    expect(() => view.store.assertMcp(frozen, id)).toThrow('冲突')
    expect(view.store.catalog(frozen)[0].mcpServers![0].unavailableReason).toContain('冲突')
  })
  it('rejects substituted source symlinks and preserves safe unavailable diagnostics in the frozen catalog', () => {
    const view = fixture('mcp.json', true); writeFileSync(join(view.root, 'mcp.json'), JSON.stringify({ tool: command }))
    view.store.register(view.root); const frozen = view.store.snapshots()
    const outside = join(view.home, 'outside.json'); writeFileSync(outside, JSON.stringify({ tool: { command: 'SECRET_COMMAND' } }))
    rmSync(join(view.root, 'mcp.json')); symlinkSync(outside, join(view.root, 'mcp.json'))
    expect(view.store.resolveMcp(frozen)).toEqual([])
    expect(() => view.store.assertMcp(frozen, frozen[0].mcpServers![0].id)).toThrow('移除')
    const invalid = view.store.snapshots()
    expect(view.store.catalog(invalid)[0].mcpServers![0].unavailableReason).toContain('路径')
    expect(JSON.stringify(view.store.catalog(invalid))).not.toContain('SECRET_COMMAND')
  })
})
