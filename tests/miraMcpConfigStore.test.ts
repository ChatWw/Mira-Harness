import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpConfigStore } from '../electron/storage/mcpConfigStore'

const homes: string[] = []
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'mira-mcp-store-')); homes.push(home)
  return new McpConfigStore(home)
}
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))

describe('Mira MCP transport configuration', () => {
  it('persists OAuth in global and project scope, clears it on protocol change, and rejects mixed authentication before write', () => {
    const global = fixture(), home = mkdtempSync(join(tmpdir(), 'mira-mcp-auth-project-')); homes.push(home)
    const project = global.forProject(home)
    for (const store of [global, project]) {
      const remote = store.save({ name: 'OAuth', type: 'streamableHttp', url: 'https://example.test/mcp', authentication: 'oauth' })
      expect(store.list()[0].authentication).toBe('oauth')
      expect(() => store.save({ id: remote.id, headers: { aUtHoRiZaTiOn: 'Bearer private' } })).toThrow('不能同时')
      expect(store.list()[0]).toEqual(remote)
      expect(store.save({ id: remote.id, authentication: 'headers', headers: { Authorization: 'Bearer private' } }).authentication).toBeUndefined()
      expect(store.save({ id: remote.id, type: 'stdio', command: 'node' }).authentication).toBeUndefined()
      expect(() => store.save({ name: 'Bad', command: 'node', authentication: 'oauth' })).toThrow('仅支持远程')
      expect(() => store.save({ name: 'Bad', command: 'node', authentication: 'other' as never })).toThrow('认证方式无效')
    }
  })
  it('keeps missing project configuration side-effect free and isolates stable external ids from raw persisted ids', () => {
    const global = fixture(), directory = mkdtempSync(join(tmpdir(), 'mira-mcp-project-')); homes.push(directory)
    const store = global.forProject(directory)
    expect(store.list()).toEqual([])
    expect(existsSync(join(directory, '.mira'))).toBe(false)
    const saved = store.save({ name: 'Project MCP', command: 'node', cwd: '/untrusted' })
    expect(saved.id).toMatch(/^project:[a-f0-9]{10}:/)
    expect(saved.cwd).toBe(realpathSync(directory))
    expect(global.list()).toEqual([])
    const persisted = JSON.parse(readFileSync(store.path(), 'utf8')).servers[0]
    expect(persisted.id).not.toContain('project:')
    expect(persisted).not.toHaveProperty('cwd')
    expect(() => store.save({ id: persisted.id, enabled: false })).toThrow('项目 MCP 服务 ID无效')
    expect(() => store.delete(persisted.id)).toThrow('项目 MCP 服务 ID无效')
    expect(global.forProject(directory).list()[0].id).toBe(saved.id)
    expect(store.save({ id: saved.id, enabled: false })).toMatchObject({ id: saved.id, enabled: false })
    store.delete(saved.id)
    expect(store.list()).toEqual([])
  })
  it('changes external identity for a copied project while retaining original ids in its file', () => {
    const global = fixture(), first = mkdtempSync(join(tmpdir(), 'mira-mcp-first-')), second = mkdtempSync(join(tmpdir(), 'mira-mcp-second-')); homes.push(first, second)
    const a = global.forProject(first), b = global.forProject(second), saved = a.save({ name: 'Original', command: 'node' })
    mkdirSync(join(second, '.mira')); writeFileSync(b.path(), readFileSync(a.path()))
    expect(b.list()[0].id).not.toBe(saved.id)
    expect(b.list()[0].cwd).toBe(realpathSync(second))
    const before = readFileSync(b.path(), 'utf8')
    expect(() => b.save({ id: saved.id, enabled: false })).toThrow('项目 MCP 服务 ID无效')
    expect(() => b.delete(saved.id)).toThrow('项目 MCP 服务 ID无效')
    expect(readFileSync(b.path(), 'utf8')).toBe(before)
  })
  it.each(['directory-link', 'file-link', 'file-directory', 'mira-file'])('rejects unsafe project configuration paths without touching the target (%s)', kind => {
    const global = fixture(), directory = mkdtempSync(join(tmpdir(), 'mira-mcp-unsafe-')), outside = mkdtempSync(join(tmpdir(), 'mira-mcp-outside-')); homes.push(directory, outside)
    const store = global.forProject(directory), external = join(outside, 'mcp.json')
    writeFileSync(external, 'outside private bytes')
    if (kind === 'directory-link') symlinkSync(outside, join(directory, '.mira'))
    else if (kind === 'mira-file') writeFileSync(join(directory, '.mira'), 'not a directory')
    else { mkdirSync(join(directory, '.mira')); if (kind === 'file-link') symlinkSync(external, store.path()); else mkdirSync(store.path()) }
    expect(() => store.list()).toThrow('项目 MCP 配置路径无效')
    expect(() => store.save({ name: 'Reject', command: 'node' })).toThrow('项目 MCP 配置路径无效')
    expect(() => store.delete('raw')).toThrow('项目 MCP 服务 ID无效')
    expect(readFileSync(external, 'utf8')).toBe('outside private bytes')
  })
  it('rechecks paths after constructing a project store and keeps corrupt file bytes intact', () => {
    const global = fixture(), directory = mkdtempSync(join(tmpdir(), 'mira-mcp-corrupt-')); homes.push(directory)
    const store = global.forProject(directory)
    store.save({ name: 'Initial', command: 'node' })
    writeFileSync(store.path(), '{broken private bytes')
    expect(() => store.save({ name: 'Reject', command: 'node' })).toThrow('配置读取失败')
    expect(readFileSync(store.path(), 'utf8')).toBe('{broken private bytes')
    rmSync(store.path()); symlinkSync(global.path(), store.path())
    expect(() => store.list()).toThrow('项目 MCP 配置路径无效')
    expect(global.list()).toEqual([])
  })
  it('gives remote project services no process cwd and cannot treat a scoped project id as global', () => {
    const global = fixture(), directory = mkdtempSync(join(tmpdir(), 'mira-mcp-remote-project-')); homes.push(directory)
    const saved = global.forProject(directory).save({ name: 'Remote', type: 'sse', url: 'https://example.test/sse', cwd: '/untrusted' })
    expect(saved).not.toHaveProperty('cwd')
    expect(() => global.save({ id: saved.id, name: 'Reject', command: 'node' })).toThrow('项目 MCP 服务 ID无效')
    expect(() => global.delete(saved.id)).toThrow('项目 MCP 服务 ID无效')
  })
  it('rejects invalid host project directories before falling back to global configuration', () => {
    const global = fixture()
    for (const directory of [undefined, null, '', 'relative-private', '/not-a-valid-private-project']) expect(() => global.forProject(directory as never)).toThrow('MCP 项目目录无效')
    expect(global.list()).toEqual([])
  })
  it('does not create project configuration on rejected saves and rechecks replaced project roots', () => {
    const global = fixture(), directory = mkdtempSync(join(tmpdir(), 'mira-mcp-project-root-')), outside = mkdtempSync(join(tmpdir(), 'mira-mcp-other-root-')); homes.push(directory, outside)
    const store = global.forProject(directory)
    expect(() => store.save({ name: 'Invalid', command: '' })).toThrow('启动命令')
    expect(existsSync(join(directory, '.mira'))).toBe(false)
    rmSync(directory, { recursive: true }); symlinkSync(outside, directory)
    expect(() => store.list()).toThrow('项目 MCP 配置路径无效')
    expect(() => store.save({ name: 'Reject', command: 'node' })).toThrow('项目 MCP 配置路径无效')
    expect(existsSync(join(outside, '.mira'))).toBe(false)
  })
  it.each([{ env: { TOKEN: 5 } }, { type: 'unknown' }, { command: '' }, { id: 'project:foreign:raw' }])('preserves invalid project configuration fields without a partial write (%j)', invalid => {
    const global = fixture(), directory = mkdtempSync(join(tmpdir(), 'mira-mcp-invalid-project-')); homes.push(directory)
    const store = global.forProject(directory)
    store.save({ name: 'Initial', command: 'node' })
    const content = JSON.parse(readFileSync(store.path(), 'utf8')); Object.assign(content.servers[0], invalid)
    const bytes = JSON.stringify(content); writeFileSync(store.path(), bytes)
    expect(() => store.save({ name: 'Reject', command: 'node' })).toThrow('MCP 配置读取失败')
    expect(readFileSync(store.path(), 'utf8')).toBe(bytes)
  })
  it('reads legacy stdio without migration and preserves args/env across partial enable changes', () => {
    const store = fixture()
    writeFileSync(store.path(), JSON.stringify([{ id: 'legacy', name: 'Legacy', command: 'node', args: ['--server'], enabled: true, createdAt: 1, updatedAt: 1 }]))
    expect(store.list()[0]).not.toHaveProperty('type')
    const saved = store.save({ id: 'legacy', env: { MIRA_TEST_TOKEN: 'stdio-private' } })
    const toggled = store.save({ id: saved.id, enabled: false })
    expect(toggled).toMatchObject({ command: 'node', args: ['--server'], env: { MIRA_TEST_TOKEN: 'stdio-private' }, enabled: false, createdAt: 1 })
  })

  it.each(['streamableHttp', 'sse'] as const)('persists %s with partial toggles and reloads without dropping credentials', type => {
    const store = fixture()
    const saved = store.save({ name: 'Remote', type, url: 'https://example.test/mcp?key=query-private', headers: { Authorization: 'Bearer header-private' } })
    expect(saved).toMatchObject({ type, command: '', args: [], enabled: true })
    expect(store.save({ id: saved.id, enabled: false })).toMatchObject({ url: saved.url, headers: saved.headers, enabled: false })
    expect(JSON.parse(readFileSync(store.path(), 'utf8')).servers[0]).toMatchObject({ url: saved.url, headers: saved.headers })
    expect(store.save({ id: saved.id, enabled: true })).toMatchObject({ url: saved.url, headers: saved.headers, enabled: true })
  })

  it('drops unrelated credentials on protocol switches and clears explicit empty maps', () => {
    const store = fixture()
    const stdio = store.save({ name: 'Switch', command: 'node', args: ['secret-argument'], env: { PRIVATE: 'stdio-private' } })
    const remote = store.save({ id: stdio.id, type: 'streamableHttp', url: 'https://example.test/mcp', headers: { Authorization: 'remote-private' } })
    expect(remote).not.toHaveProperty('env'); expect(remote.args).toEqual([]); expect(remote.command).toBe('')
    const sse = store.save({ id: stdio.id, type: 'sse', url: 'https://example.test/sse' })
    expect(sse).not.toHaveProperty('headers')
    store.save({ id: stdio.id, headers: { Authorization: 'replacement' } })
    expect(store.save({ id: stdio.id, headers: {} }).headers).toEqual({})
    const local = store.save({ id: stdio.id, type: 'stdio', command: 'node' })
    expect(local).not.toHaveProperty('headers'); expect(local).not.toHaveProperty('url'); expect(local.args).toEqual([])
  })

  it.each(['{broken private bytes', '{"version":1}', '{"servers":[{"id":"partial"}]}'])('keeps corrupt existing configuration bytes untouched when saving fails', bytes => {
    const store = fixture(); writeFileSync(store.path(), bytes)
    expect(() => store.save({ name: 'Do not replace', command: 'node' })).toThrow('配置读取失败')
    expect(readFileSync(store.path(), 'utf8')).toBe(bytes)
  })

  it.each(['file:///tmp/private', 'javascript:private', 'https://user:private@example.test/mcp', 'https://example.test/mcp#private', 'not-a-private-url'])('rejects invalid remote addresses without echoing the submitted URL: %s', url => {
    const store = fixture()
    expect(() => store.save({ name: 'Remote', type: 'sse', url })).toThrow('有效的 HTTP')
    expect(store.list()).toEqual([])
  })

  it.each([
    { headers: { Authorization: 'secret\r\nInjected: true' } },
    { headers: { 'invalid header': 'private' } },
    { headers: { Authorization: 123 } },
    { env: { 'bad=key': 'private' } },
    { env: { TOKEN: ['private'] } },
    { args: ['safe', 12] },
    { type: 'unknown-private' },
    { type: null },
    { enabled: 'private' },
    { id: 'bad\nprivate' },
    { id: 123 },
    { name: 'Private\0Name' },
    { command: 'private\0command' },
  ])('rejects invalid maps/protocol fields without writing a partial record', invalid => {
    const store = fixture()
    expect(() => store.save({ name: 'Local', command: 'node', ...invalid } as never)).toThrow(/MCP/)
    expect(store.list()).toEqual([])
  })

  it.each([null, undefined, [], 'private-input'])('rejects nonobject save inputs without exposing native error text', input => {
    const store = fixture()
    expect(() => store.save(input as never)).toThrow('MCP 配置参数无效')
    expect(store.list()).toEqual([])
  })
})
