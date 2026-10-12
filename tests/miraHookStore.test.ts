import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraHookStore } from '../electron/storage/miraHookStore'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MIRA_HOOK_EVENTS, type MiraHookWrite } from '../src/config/miraHooks'

const homes: string[] = []
afterEach(() => homes.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'mira-hook-store-')); homes.push(home)
  const paths = new MiraPaths(home).ensure(), project = join(home, 'project'), other = join(home, 'other-project')
  mkdirSync(project); mkdirSync(other)
  return { paths, project, other, store: new MiraHookStore(paths), globalFile: join(paths.root, 'hooks.json'), projectFile: join(project, '.mira', 'hooks.json'), trustFile: join(paths.config, 'hook-trust.json') }
}
const config: MiraHookWrite = { scope: 'global', name: '格式化', event: 'PostToolUse', type: 'command', command: 'echo done' }
function changeFile(file: string, update: (row: Record<string, unknown>) => void) {
  const document = JSON.parse(readFileSync(file, 'utf8'))
  update(document.hooks[0]); writeFileSync(file, JSON.stringify(document))
}

describe('Mira Hook declaration and host trust storage', () => {
  it('reads empty catalogs without creating config, project directories or trust records', () => {
    const view = fixture()
    expect(view.store.list(view.project)).toEqual([])
    expect(existsSync(view.globalFile)).toBe(false)
    expect(existsSync(join(view.project, '.mira'))).toBe(false)
    expect(existsSync(view.trustFile)).toBe(false)
  })
  it.each(MIRA_HOOK_EVENTS)('persists and trusts an explicit %s setting with normalized defaults', event => {
    const view = fixture(), item = view.store.save({ ...config, event })
    expect(item).toMatchObject({ name: config.name, event, enabled: true, args: [], async: false, timeout: 60, trusted: true, scope: 'global' })
    expect(item.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(item.sourcePath).toBe(realpathSync(view.globalFile))
    expect(item.createdAt).toBe(item.updatedAt)
    expect(view.store.list()).toEqual([item])
    expect(() => view.store.assert(item)).not.toThrow()
    expect(new MiraHookStore(view.paths).list()).toEqual([item])
    expect(JSON.parse(readFileSync(view.globalFile, 'utf8')).hooks[0]).not.toHaveProperty('trusted')
    expect(readdirSync(view.paths.root).some(name => name.endsWith('.tmp'))).toBe(false)
  })
  it('retains all command/process options and isolates global/project catalogs', () => {
    const view = fixture(), global = view.store.save(config)
    const item = view.store.save({ ...config, scope: 'project', name: '本地流程', type: 'process', command: 'node', args: ['script.js', '', 'a $b'], matcher: 'Write|Edit', async: true, shell: '/bin/zsh', timeout: 600, statusMessage: '正在格式化', custom: { nested: ['text', true, null, { n: 4 }] } }, view.project)
    expect(item).toMatchObject({ type: 'process', args: ['script.js', '', 'a $b'], matcher: 'Write|Edit', async: true, shell: '/bin/zsh', timeout: 600, custom: { nested: ['text', true, null, { n: 4 }] } })
    expect(view.store.list(view.project)).toEqual([item, global])
    expect(view.store.list(view.other)).toEqual([global])
    expect(() => view.store.assert(item, view.other)).toThrow('刷新')
    expect(() => view.store.delete({ scope: 'project', id: global.id, expectedRevision: global.revision }, view.project)).toThrow('刷新')
    expect(() => view.store.save({ ...config, scope: 'project' })).toThrow('项目目录')
    expect(() => view.store.save({ ...config, scope: 'other' as 'global' })).toThrow('范围')
  })
  it('requires current revisions on all changes and preserves creation time and stable identity', () => {
    const view = fixture(), original = view.store.save(config)
    expect(() => view.store.save({ ...config, id: original.id })).toThrow('刷新')
    expect(() => view.store.save({ ...config, id: 'missing', expectedRevision: original.revision })).toThrow('刷新')
    expect(() => view.store.save({ ...config, expectedRevision: original.revision })).toThrow('刷新')
    const updated = view.store.save({ ...config, id: original.id, name: '更改名称', expectedRevision: original.revision })
    expect(updated.id).toBe(original.id); expect(updated.createdAt).toBe(original.createdAt)
    expect(updated.updatedAt).toBeGreaterThan(original.updatedAt); expect(updated.revision).not.toBe(original.revision)
    for (const action of [view.store.delete, view.store.trust, view.store.setEnabled]) {
      expect(() => action.call(view.store, { scope: 'global', id: original.id, expectedRevision: original.revision, enabled: true })).toThrow('刷新')
    }
    const disabled = view.store.setEnabled({ scope: 'global', id: updated.id, expectedRevision: updated.revision, enabled: false })
    expect(disabled).toMatchObject({ trusted: true, enabled: false })
    expect(() => view.store.assert(disabled)).toThrow('禁用')
    const enabled = view.store.setEnabled({ scope: 'global', id: disabled.id, expectedRevision: disabled.revision, enabled: true })
    expect(() => view.store.assert(enabled)).not.toThrow()
    expect(() => view.store.setEnabled({ scope: 'global', id: enabled.id, expectedRevision: enabled.revision, enabled: 'yes' as unknown as boolean })).toThrow('状态')
  })
  it('does not auto-trust externally changed command, args, enabled, custom, type or matcher', () => {
    for (const changes of [{ command: 'echo external' }, { args: ['external'] }, { enabled: false }, { custom: { changed: true } }, { type: 'process' }, { matcher: 'Other' }]) {
      const view = fixture(), accepted = view.store.save({ ...config, scope: 'project' }, view.project)
      changeFile(view.projectFile, row => Object.assign(row, changes))
      const [pending] = view.store.list(view.project)
      expect(pending.trusted).toBe(false); expect(pending.unavailableReason).toContain('信任')
      expect(pending.revision).not.toBe(accepted.revision)
      expect(() => view.store.assert(accepted, view.project)).toThrow('刷新')
      expect(() => view.store.assert(pending, view.project)).toThrow('信任')
      expect(() => view.store.trust({ scope: 'project', id: pending.id, expectedRevision: accepted.revision }, view.project)).toThrow('刷新')
      const trusted = view.store.trust({ scope: 'project', id: pending.id, expectedRevision: pending.revision }, view.project)
      expect(trusted.trusted).toBe(true); expect(trusted.revision).toBe(pending.revision)
      expect(trusted.unavailableReason).toBeUndefined()
      if (trusted.enabled) expect(() => view.store.assert(trusted, view.project)).not.toThrow()
    }
  })
  it('requires explicit review of imported project files and does not transfer trust across directories', () => {
    const view = fixture(), original = view.store.save({ ...config, scope: 'project' }, view.project)
    mkdirSync(join(view.other, '.mira'))
    writeFileSync(join(view.other, '.mira', 'hooks.json'), readFileSync(view.projectFile))
    const [copied] = view.store.list(view.other)
    expect(copied.trusted).toBe(false)
    expect(copied.revision).toBe(original.revision)
    expect(() => view.store.assert({ ...copied, trusted: true, unavailableReason: undefined }, view.other)).toThrow('信任')
    expect(() => view.store.assert(original, view.other)).toThrow('来源')
    const trusted = view.store.trust({ scope: 'project', id: copied.id, expectedRevision: copied.revision }, view.other)
    expect(() => view.store.assert(trusted, view.other)).not.toThrow()
    expect(view.store.list(view.project)[0].trusted).toBe(true)
  })
  it('also requires host review for external global changes and checks complete accepted content', () => {
    const view = fixture(), accepted = view.store.save(config)
    expect(() => view.store.assert({ ...accepted, command: 'echo forged' })).toThrow('来源')
    expect(() => view.store.assert({ ...accepted, sourcePath: join(view.paths.root, 'other.json') })).toThrow('来源')
    changeFile(view.globalFile, row => { row.command = 'external global' })
    const [pending] = view.store.list()
    expect(pending.trusted).toBe(false)
    const saved = view.store.save({ ...pending, expectedRevision: pending.revision })
    expect(saved.trusted).toBe(true)
    expect(() => view.store.assert(saved)).not.toThrow()
  })
  it.each(['global', 'project'] as const)('deletes %s entries recoverably and keeps sibling hooks', scope => {
    const view = fixture(), item = view.store.save({ ...config, scope }, view.project), sibling = view.store.save({ ...config, name: '另一个', scope }, view.project)
    const source = readFileSync(scope === 'global' ? view.globalFile : view.projectFile, 'utf8')
    view.store.delete({ scope, id: item.id, expectedRevision: item.revision }, view.project)
    expect(view.store.list(view.project)).toEqual([sibling])
    const trash = scope === 'global' ? join(view.paths.trash, 'hooks') : join(view.project, '.mira', 'trash', 'hooks')
    expect(readFileSync(join(trash, readdirSync(trash)[0]), 'utf8')).toBe(source)
    expect(() => view.store.assert(item, view.project)).toThrow('刷新')
    writeFileSync(scope === 'global' ? view.globalFile : view.projectFile, source)
    expect(view.store.list(view.project).find(row => row.id === item.id)?.trusted).toBe(false)
  })
  it.each(['{broken', '{}', '{"version":2,"hooks":[]}', '{"version":1,"hooks":[{}]}', '{"version":1,"hooks":[],"trusted":true}'])('never overwrites malformed files during save/delete/enable/trust: %s', source => {
    const view = fixture(), item = view.store.save(config)
    writeFileSync(view.globalFile, source)
    for (const action of [() => view.store.list(), () => view.store.save(config), () => view.store.delete({ scope: 'global', id: item.id, expectedRevision: item.revision }), () => view.store.setEnabled({ scope: 'global', id: item.id, expectedRevision: item.revision, enabled: false }), () => view.store.trust({ scope: 'global', id: item.id, expectedRevision: item.revision })]) expect(action).toThrow('损坏')
    expect(readFileSync(view.globalFile, 'utf8')).toBe(source)
  })
  it('preserves declarations and damaged host trust records rather than overwriting them', () => {
    const view = fixture(), item = view.store.save(config), source = readFileSync(view.globalFile, 'utf8')
    writeFileSync(view.trustFile, '{damaged')
    expect(() => view.store.list()).toThrow('信任记录损坏')
    expect(() => view.store.save({ ...config, id: item.id, expectedRevision: item.revision })).toThrow('信任记录损坏')
    expect(() => view.store.delete({ scope: 'global', id: item.id, expectedRevision: item.revision })).toThrow('信任记录损坏')
    expect(readFileSync(view.globalFile, 'utf8')).toBe(source)
    expect(readFileSync(view.trustFile, 'utf8')).toBe('{damaged')
  })
  it.each([
    { name: '' }, { event: 'Unknown' }, { type: 'unknown' }, { command: '' }, { command: 'a\0b' }, { command: 'x'.repeat(8193) },
    { args: 'text' }, { args: [1] }, { args: Array(129).fill('x') }, { args: Array(9).fill('x'.repeat(8192)) },
    { async: 'yes' }, { enabled: 1 }, { timeout: null }, { timeout: 0 }, { timeout: 601 }, { timeout: 1.5 }, { timeout: Infinity },
    { shell: false }, { shell: '' }, { matcher: 1 }, { statusMessage: 'x'.repeat(257) }, { custom: [] },
    { custom: { invalid: undefined } }, { custom: { number: Infinity } }, { custom: { callback: () => {} } }, { custom: { text: 'x'.repeat(8192) } },
  ])('rejects invalid or oversized inputs before creating files (case %#)', changes => {
    const view = fixture()
    expect(() => view.store.save({ ...config, ...changes } as MiraHookWrite)).toThrow('Hook')
    expect(existsSync(view.globalFile)).toBe(false); expect(existsSync(view.trustFile)).toBe(false)
  })
  it('rejects duplicate identifiers, unsupported fields, invalid dates, oversized files and catalogs', () => {
    const view = fixture(); view.store.save(config)
    const original = JSON.parse(readFileSync(view.globalFile, 'utf8'))
    for (const hooks of [[original.hooks[0], original.hooks[0]], [{ ...original.hooks[0], trusted: true }], [{ ...original.hooks[0], updatedAt: -1 }], Array.from({ length: 129 }, (_, i) => ({ ...original.hooks[0], id: String(i) }))]) {
      writeFileSync(view.globalFile, JSON.stringify({ version: 1, hooks }))
      expect(() => view.store.list()).toThrow('损坏')
    }
    writeFileSync(view.globalFile, 'x'.repeat(256 * 1024 + 1))
    expect(() => view.store.list()).toThrow('大小限制')
  })
  it('bounds normal creation at 128 entries without losing the existing catalog', () => {
    const view = fixture()
    for (let i = 0; i < 128; i++) view.store.save({ ...config, name: `Hook ${i}` })
    const source = readFileSync(view.globalFile, 'utf8')
    expect(() => view.store.save(config)).toThrow('128')
    expect(readFileSync(view.globalFile, 'utf8')).toBe(source)
    expect(view.store.list()).toHaveLength(128)
  })
  it('rejects source, project container, host trust, and recovery-directory symlink escapes', () => {
    const view = fixture(), original = view.store.save(config), external = join(view.other, 'external.json')
    const source = readFileSync(view.globalFile, 'utf8'); writeFileSync(external, source)
    rmSync(view.globalFile); symlinkSync(external, view.globalFile)
    expect(() => view.store.list()).toThrow('符号链接')
    expect(() => view.store.save(config)).toThrow('符号链接')
    expect(readFileSync(external, 'utf8')).toBe(source)
    rmSync(view.globalFile); writeFileSync(view.globalFile, source)
    symlinkSync(view.paths.root, join(view.project, '.mira'))
    expect(() => view.store.list(view.project)).toThrow('符号链接')
    rmSync(view.trustFile); symlinkSync(external, view.trustFile)
    expect(() => view.store.trust({ scope: 'global', id: original.id, expectedRevision: original.revision })).toThrow('符号链接')
    rmSync(view.trustFile)
    symlinkSync(view.other, join(view.paths.trash, 'hooks'))
    expect(() => view.store.delete({ scope: 'global', id: original.id, expectedRevision: original.revision })).toThrow('符号链接')
    expect(readFileSync(view.globalFile, 'utf8')).toBe(source)
  })
})
