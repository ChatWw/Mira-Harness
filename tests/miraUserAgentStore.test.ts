import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraUserAgentStore, parseMiraUserAgent } from '../electron/storage/miraUserAgentStore'
import { parseMiraPluginAgent } from '../electron/storage/miraPluginAgents'
import { MIRA_RESERVED_USER_AGENTS } from '../src/config/miraUserAgents'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'mira-user-agents-')); directories.push(home)
  const paths = new MiraPaths(home).ensure(), project = join(home, 'project'); mkdirSync(project)
  return { paths, project, store: new MiraUserAgentStore(paths) }
}
const profile = (name = 'code-review', fields = '', body = 'Review actual changed behavior.') => `---\nname: ${name}\ndescription: Review code\n${fields}---\n${body}`

describe('Mira user and project Agent profiles', () => {
  it('lists both scopes, resolves project first and keeps shadowed and disabled profiles editable', () => {
    const view = fixture()
    expect(view.store.list(view.project)).toEqual([])
    const global = view.store.save({ scope: 'global', name: 'code-review', source: profile() })
    const project = view.store.save({ scope: 'project', name: 'code-review', source: profile('code-review', 'enabled: false\n') }, view.project)
    expect(view.store.list(view.project)).toEqual([project, { ...global, shadowed: true }])
    expect(() => view.store.resolve('code-review', view.project)).toThrow('已停用')
    expect(view.store.read('global', 'code-review').source).toBe(profile())
    const enabled = view.store.setEnabled({ scope: 'project', name: 'code-review', enabled: true, expectedRevision: project.revision }, view.project)
    expect(view.store.resolve('code-review', view.project)).toMatchObject({ scope: 'project', revision: enabled.revision, body: 'Review actual changed behavior.', injectAgentsMd: true })
    expect(view.store.resolve('code-review')?.scope).toBe('global')
    expect(JSON.stringify(view.store.list(view.project))).not.toContain(view.paths.root)
    expect(JSON.stringify(view.store.list(view.project))).not.toContain('Review actual changed behavior.')
  })
  it('requires identity consistency while preserving unsupported metadata for editing', () => {
    const view = fixture()
    expect(() => view.store.save({ scope: 'global', name: 'code-review', source: profile('other-name') })).toThrow('文件名')
    const source = profile('code-review', 'permissionMode: auto\nbackground: true\nskills: [review]\nmcpServers: [search]\nmaxTurns: 2\nunknown: value\n')
    const item = view.store.save({ scope: 'global', name: 'code-review', source })
    for (const field of ['permissionMode', 'background', 'skills', 'maxTurns', 'unknown']) expect(item.unavailableReason).toContain(field)
    expect(item.mcpServers).toEqual(['search'])
    expect(view.store.read('global', 'code-review').source).toBe(source)
    expect(() => view.store.resolve('code-review')).toThrow('尚未支持')
    const path = join(view.paths.root, 'agents/code-review.md')
    writeFileSync(path, profile('other-name'))
    expect(view.store.list()[0].unavailableReason).toContain('文件名')
    expect(() => view.store.resolve('code-review')).toThrow('文件名')
  })
  it('normalizes tools, retains empty restrictions and freezes model/AGENTS/color configuration', () => {
    const view = fixture()
    view.store.save({ scope: 'global', name: 'code-review', source: profile('code-review', 'tools: []\ndisallowedTools: [Bash]\nmodelSelection:\n  providerId: fixture\n  modelId: reasoning\n  thinkingLevel: high\ninjectAgentsMd: false\ncolor: purple\n') })
    const accepted = view.store.resolve('code-review')!
    expect(accepted).toMatchObject({ tools: [], disallowedTools: ['bash'], modelSelection: { providerId: 'fixture', modelId: 'reasoning', thinkingLevel: 'high' }, injectAgentsMd: false, color: 'purple' })
    expect(() => view.store.assert(accepted)).not.toThrow()
    expect(() => view.store.assert({ ...accepted, modelSelection: { providerId: 'other', modelId: 'other' } })).toThrow('变化')
    expect(() => view.store.assert({ ...accepted, injectAgentsMd: true })).toThrow('变化')
    expect(() => view.store.assert({ ...accepted, color: 'blue' })).toThrow('变化')
    expect(() => view.store.assert({ ...accepted, tools: ['bash'] })).toThrow('变化')
  })
  it('preserves named parent MCP requirements in catalog, resolution and frozen capability checks', () => {
    const view = fixture(), source = profile('code-review', 'mcpServers: ["plugin:Search:Echo", Search]\ntools: [MCP]\n')
    const item = view.store.save({ scope: 'global', name: 'code-review', source })
    expect(item).toMatchObject({ mcpServers: ['plugin:Search:Echo', 'Search'], tools: ['mcp'] })
    expect(item.unavailableReason).toBeUndefined()
    const accepted = view.store.resolve('code-review')!
    expect(accepted.mcpServers).toEqual(item.mcpServers)
    expect(() => view.store.assert({ ...accepted, mcpServers: ['Search'] })).toThrow('变化')
    writeFileSync(join(view.paths.root, 'agents/code-review.md'), profile('code-review', 'mcpServers: []\n'))
    expect(() => view.store.assert(accepted)).toThrow('变化')
    expect(view.store.resolve('code-review')?.mcpServers).toEqual([])
  })
  it('setEnabled updates only its YAML field while preserving unknown fields, comments and exact body', () => {
    const view = fixture(), body = '\n# Task\r\n\nKeep !`pwd` and $1 literally.\n'
    const source = '\n\n---\n# preserved comment\nname: code-review\ndescription: >-\n  Review\n  code\nunknown:\n  nested: value\nmodelSelection:\n  providerId: fixture\n  modelId: model\n---\n' + body
    const created = view.store.save({ scope: 'global', name: 'code-review', source })
    const disabled = view.store.setEnabled({ scope: 'global', name: 'code-review', enabled: false, expectedRevision: created.revision })
    const result = view.store.read('global', 'code-review').source
    expect(result.startsWith('\n\n---\n')).toBe(true)
    expect(result).toContain('# preserved comment')
    expect(result).toContain('nested: value')
    expect(result).toContain('providerId: fixture')
    expect(result).toContain('enabled: false')
    expect(result.slice(result.indexOf('\n---\n', result.indexOf('name:')) + 5)).toBe(body)
    expect(disabled.enabled).toBe(false)
    expect(() => view.store.setEnabled({ scope: 'global', name: 'code-review', enabled: true, expectedRevision: created.revision })).toThrow('刷新')
  })
  it('protects writes and deletions from stale revisions and keeps deleted profiles recoverable on their own volume', () => {
    const view = fixture(), created = view.store.save({ scope: 'global', name: 'code-review', source: profile() })
    expect(() => view.store.save({ scope: 'global', name: 'code-review', source: profile() })).toThrow('刷新')
    const changed = view.store.save({ scope: 'global', name: 'code-review', source: profile('code-review', '', 'Changed.'), expectedRevision: created.revision })
    expect(changed.id).toBe(created.id)
    expect(() => view.store.delete({ scope: 'global', name: 'code-review', expectedRevision: created.revision })).toThrow('刷新')
    view.store.delete({ scope: 'global', name: 'code-review', expectedRevision: changed.revision })
    expect(view.store.list()).toEqual([])
    const trash = join(view.paths.trash, 'agents')
    expect(readFileSync(join(trash, readdirSync(trash)[0]), 'utf8')).toContain('Changed.')
    const local = view.store.save({ scope: 'project', name: 'code-review', source: profile() }, view.project)
    view.store.delete({ scope: 'project', name: 'code-review', expectedRevision: local.revision }, view.project)
    const localTrash = join(view.project, '.mira/trash/agents')
    expect(readFileSync(join(localTrash, readdirSync(localTrash)[0]), 'utf8')).toBe(profile())
  })
  it('rejects external source edits, enabled changes and replacement project overrides before execution', () => {
    const view = fixture(); view.store.save({ scope: 'global', name: 'code-review', source: profile() })
    const accepted = view.store.resolve('code-review', view.project)!
    view.store.save({ scope: 'project', name: 'code-review', source: profile() }, view.project)
    expect(() => view.store.assert(accepted, view.project)).toThrow('变化')
    const project = view.store.resolve('code-review', view.project)!
    writeFileSync(join(view.project, '.mira/agents/code-review.md'), profile('code-review', 'tools: [Bash]\n'))
    expect(() => view.store.assert(project, view.project)).toThrow('变化')
    writeFileSync(join(view.project, '.mira/agents/code-review.md'), profile('code-review', 'enabled: false\n'))
    expect(() => view.store.assert(project, view.project)).toThrow('已停用')
  })
  it('keeps unsupported highest-priority profiles from falling back to globals', () => {
    const view = fixture(); view.store.save({ scope: 'global', name: 'code-review', source: profile() })
    view.store.save({ scope: 'project', name: 'code-review', source: profile('code-review', 'model: unsupported\n') }, view.project)
    expect(() => view.store.resolve('code-review', view.project)).toThrow('model')
    expect(view.store.resolve('missing-agent', view.project)).toBeUndefined()
  })
  it.each(['explorer', 'reviewer', 'tester', 'implementer'])('prevents overriding built-in %s', name => {
    const view = fixture()
    expect(MIRA_RESERVED_USER_AGENTS).toContain(name)
    expect(() => view.store.save({ scope: 'global', name, source: profile(name) })).toThrow('内置')
    expect(view.store.resolve(name)).toBeUndefined()
  })
  it.each(['ab', 'Code-Review', 'plugin:agent', '../escape', 'under_score', 'a'.repeat(51)])('rejects invalid or misleading identity %s', name => {
    const view = fixture()
    expect(() => view.store.save({ scope: 'global', name, source: profile(name) })).toThrow('名称')
    expect(view.store.resolve(name)).toBeUndefined()
  })
  it('does not follow substituted profile, directory or trash symlinks', () => {
    const view = fixture(), outside = join(view.project, 'outside.md'); writeFileSync(outside, profile())
    const created = view.store.save({ scope: 'global', name: 'code-review', source: profile() })
    const file = join(view.paths.root, 'agents/code-review.md'); rmSync(file); symlinkSync(outside, file)
    expect(() => view.store.read('global', 'code-review')).toThrow('符号链接')
    expect(() => view.store.delete({ scope: 'global', name: 'code-review', expectedRevision: created.revision })).toThrow('符号链接')
    expect(readFileSync(outside, 'utf8')).toBe(profile())
    rmSync(file); writeFileSync(file, profile())
    symlinkSync(view.project, join(view.paths.trash, 'agents'))
    expect(() => view.store.delete({ scope: 'global', name: 'code-review', expectedRevision: created.revision })).toThrow('符号链接')
    mkdirSync(join(view.project, '.mira')); symlinkSync(join(view.paths.root, 'agents'), join(view.project, '.mira/agents'))
    expect(() => view.store.list(view.project)).toThrow('符号链接')
  })
  it('bounds file sizes and needs a host-selected project for project writes', () => {
    const view = fixture()
    expect(() => view.store.save({ scope: 'project', name: 'code-review', source: profile() })).toThrow('项目目录')
    expect(() => view.store.save({ scope: 'global', name: 'code-review', source: profile('code-review', '', 'x'.repeat(256 * 1024)) })).toThrow('256KB')
  })
  it('catalogs invalid external instructions for repair and detects cross-project frozen identity', () => {
    const view = fixture(); mkdirSync(join(view.paths.root, 'agents'))
    const file = join(view.paths.root, 'agents/code-review.md')
    writeFileSync(file, 'Missing metadata and instructions.')
    expect(view.store.list()[0]).toMatchObject({ name: 'code-review', enabled: false, unavailableReason: expect.stringContaining('YAML') })
    expect(view.store.read('global', 'code-review').source).toBe('Missing metadata and instructions.')
    const item = view.store.read('global', 'code-review').agent
    view.store.save({ scope: 'global', name: 'code-review', source: profile(), expectedRevision: item.revision })
    view.store.save({ scope: 'project', name: 'code-review', source: profile() }, view.project)
    const accepted = view.store.resolve('code-review', view.project)!
    const other = join(view.project, 'other'); mkdirSync(other)
    view.store.save({ scope: 'project', name: 'code-review', source: profile() }, other)
    expect(() => view.store.assert(accepted, other)).toThrow('变化')
  })
})

describe('Mira user Agent metadata parsing', () => {
  it('defaults enabled and AGENTS inheritance, keeps plugin parser unsupported policy separate', () => {
    expect(parseMiraUserAgent(profile())).toMatchObject({ enabled: true, injectAgentsMd: true })
    const source = profile('code-review', 'enabled: true\nmodelSelection: {providerId: fixture, modelId: model}\ninjectAgentsMd: false\ncolor: blue\n')
    expect(parseMiraUserAgent(source).unavailableReason).toBeUndefined()
    expect(parseMiraPluginAgent(source).unavailableReason).toContain('enabled、modelSelection、injectAgentsMd')
  })
  it.each([
    ['enabled: yes\n', 'enabled'],
    ['injectAgentsMd: 1\n', 'injectAgentsMd'],
    ['color: beige\n', 'color'],
    ['modelSelection: {providerId: fixture}\n', 'modelSelection'],
    ['modelSelection: {providerId: fixture, modelId: model, thinkingLevel: ultra}\n', 'modelSelection'],
    ['modelSelection: {providerId: fixture, modelId: model, apiKey: secret}\n', 'modelSelection'],
    ['tools: [Agent, Grep]\n', 'Agent、Grep'],
    ['disallowedTools: [Unknown]\n', 'disallowedTools'],
  ])('rejects invalid configuration without silently executing defaults', (fields, reason) => {
    expect(parseMiraUserAgent(profile('code-review', fields)).unavailableReason).toContain(reason)
  })
})
