import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraPluginStore } from '../electron/storage/miraPluginStore'
import { loadMiraPluginHooks } from '../electron/storage/miraPluginHooks'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
const event = (command = 'node', extra: Record<string, unknown> = {}) => ({ PreToolUse: [{ matcher: 'write|edit', hooks: [{ type: 'process', command, args: ['${MIRA_PLUGIN_ROOT}/check.mjs'], ...extra }] }] })
function fixture(manifest: Record<string, unknown> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'mira-plugin-hooks-')); directories.push(home)
  const paths = new MiraPaths(home).ensure(), root = join(home, 'package'), manifestPath = join(root, '.mira-plugin/plugin.json')
  mkdirSync(join(root, '.mira-plugin'), { recursive: true })
  writeFileSync(manifestPath, JSON.stringify({ name: 'checks', ...manifest }))
  return { home, root, paths, manifestPath, store: new MiraPluginStore(paths) }
}
describe('Mira plugin Hook declarations and frozen lifecycle', () => {
  it('merges the standard file, declared paths and inline objects, deduplicating the same file', () => {
    const files: Record<string, string> = { 'hooks/hooks.json': JSON.stringify({ hooks: event() }), 'extra.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo done', async: true, timeout: 5, shell: true, statusMessage: 'Checking' }] }] } }) }
    const read = (path: string) => files[path]
    const context = { id: 'checks@local', name: 'checks', root: '/package', manifestPath: '.mira-plugin/plugin.json' }
    const manifest = { hooks: ['hooks/../hooks/hooks.json', './extra.json', { SessionStart: [{ hooks: [{ type: 'process', command: 'node', timeoutMs: 250 }] }] }] }
    const result = loadMiraPluginHooks(context, manifest, read)
    expect(result.diagnostics).toEqual([]); expect(result.hooks).toHaveLength(3)
    expect(result.hooks[0]).toMatchObject({ event: 'PreToolUse', matcher: 'write|edit', args: ['${MIRA_PLUGIN_ROOT}/check.mjs'], sourcePath: 'hooks/hooks.json', enabled: true })
    expect(result.hooks[1]).toMatchObject({ event: 'Stop', timeout: 5, async: true, shell: true, statusMessage: 'Checking' })
    expect(result.hooks[2]).toMatchObject({ timeout: .25, sourcePath: '.mira-plugin/plugin.json#hooks/2' })
    expect(loadMiraPluginHooks(context, manifest, read)).toEqual(result)
    files['hooks/hooks.json'] += '\n'; const changed = loadMiraPluginHooks(context, manifest, read)
    expect(changed.hooks[0].id).toBe(result.hooks[0].id); expect(changed.hooks[0].revision).not.toBe(result.hooks[0].revision)
  })
  it('reports unsupported events/types, invalid fields and bad paths while retaining valid hooks', () => {
    const result = loadMiraPluginHooks({ id: 'checks@local', name: 'checks', root: '/package', manifestPath: 'plugin.json' }, { hooks: ['../escape.json', 'missing.json', {
      FutureEvent: [], Stop: [{ hooks: [{ type: 'prompt', prompt: 'Never execute' }, { type: 'command', command: 'ok', timeout: 0 }, { type: 'command', command: 'ok', enabled: false }] }],
    }] }, () => undefined)
    expect(result.hooks).toHaveLength(1); expect(result.hooks[0].enabled).toBe(false)
    expect(result.diagnostics.join('\n')).toContain('超出'); expect(result.diagnostics.join('\n')).toContain('不存在')
    expect(result.diagnostics.join('\n')).toContain('FutureEvent'); expect(result.diagnostics.join('\n')).toContain('prompt'); expect(result.diagnostics.join('\n')).toContain('声明无效')
  })
  it.each([{ type: 'process', async: true }, { type: 'process', shell: true }, { type: 'command', args: ['ignored'] }])('does not silently discard unsupported execution fields %j', fields => {
    const result = loadMiraPluginHooks({ id: 'checks@local', name: 'checks', root: '/package', manifestPath: 'plugin.json' }, { hooks: { Stop: [{ hooks: [{ command: 'node', ...fields }] }] } }, () => undefined)
    expect(result.hooks).toEqual([]); expect(result.diagnostics.join('\n')).toContain('参数不匹配')
  })
  it('registers Hook-only packages and resolves declarations without executing or trusting them', () => {
    const view = fixture(), marker = join(view.root, 'ran')
    writeFileSync(view.manifestPath, JSON.stringify({ name: 'checks', hooks: event(`touch ${marker}`) }))
    const listed = view.store.register(view.root), frozen = view.store.snapshots()
    expect(listed[0].hooks).toHaveLength(1); expect(listed[0].unsupported).toEqual([])
    expect(listed[0]).not.toHaveProperty('root'); expect(listed[0].hooks?.[0].sourcePath).toBe('.mira-plugin/plugin.json#hooks'); expect(existsSync(marker)).toBe(false)
    expect(view.store.resolveHooks(frozen)).toEqual([expect.objectContaining({ pluginId: 'checks@local', pluginName: 'checks', sourceRoot: frozen[0].root, command: `touch ${marker}` })])
    expect(view.store.resolveHooks(frozen)[0]).not.toHaveProperty('trusted')
    expect(JSON.parse(readFileSync(view.manifestPath, 'utf8')).hooks).toEqual(event(`touch ${marker}`))
  })
  it('invalidates frozen declarations on source changes, disable, removal, source-root replacement and conflicts', () => {
    const view = fixture({ hooks: event() }); view.store.register(view.root)
    const frozen = view.store.snapshots(), accepted = view.store.resolveHooks(frozen)[0]
    writeFileSync(view.manifestPath, JSON.stringify({ name: 'checks', hooks: event('python') }))
    expect(() => view.store.assertHook(frozen, accepted.id)).toThrow('变化'); expect(view.store.resolveHooks(frozen)).toEqual([])
    expect(view.store.catalog(frozen)[0].hooks?.[0].unavailableReason).toContain('变化')
    writeFileSync(view.manifestPath, JSON.stringify({ name: 'checks', hooks: event() }))
    expect(view.store.assertHook(frozen, accepted.id)).toEqual(accepted)
    view.store.setEnabled('checks@local', false); expect(() => view.store.assertHook(frozen, accepted.id)).toThrow('停用')
    view.store.setEnabled('checks@local', true)
    expect(() => view.store.assertHook([{ ...frozen[0], root: '/replaced' }], accepted.id)).toThrow('停用')
    expect(() => view.store.assertHook([...frozen, { ...frozen[0], id: 'checks@other', hooks: [] }], accepted.id)).toThrow('冲突')
    view.store.register(view.root, 'other'); expect(() => view.store.assertHook(frozen, accepted.id)).toThrow('冲突')
    view.store.remove('checks@other'); view.store.remove('checks@local'); expect(view.store.resolveHooks(frozen)).toEqual([])
  })
  it('excludes disabled declarations and does not admit Hooks added after the snapshot', () => {
    const view = fixture({ hooks: event('node', { enabled: false }) }); view.store.register(view.root)
    const disabled = view.store.snapshots(); expect(view.store.resolveHooks(disabled)).toEqual([])
    writeFileSync(view.manifestPath, JSON.stringify({ name: 'checks', hooks: event() }))
    const frozen = view.store.snapshots(), id = frozen[0].hooks![0].id
    writeFileSync(view.manifestPath, JSON.stringify({ name: 'checks', hooks: { ...event(), Stop: [{ hooks: [{ type: 'command', command: 'echo done' }] }] } }))
    const later = view.store.snapshots()[0].hooks!.find(hook => hook.event === 'Stop')!
    expect(() => view.store.assertHook(frozen, later.id)).toThrow('不属于'); expect(() => view.store.assertHook(frozen, id)).toThrow('变化')
  })
  it('diagnoses symlink and oversized sources instead of reading or executing them', () => {
    const view = fixture({ hooks: ['linked.json', 'large.json'] })
    mkdirSync(join(view.root, 'hooks')); writeFileSync(join(view.root, 'hooks/hooks.json'), JSON.stringify({ hooks: event() }))
    const external = join(view.home, 'external.json'); writeFileSync(external, JSON.stringify({ hooks: event('secret') }))
    symlinkSync(external, join(view.root, 'linked.json')); writeFileSync(join(view.root, 'large.json'), ' '.repeat(256 * 1024 + 1))
    const listed = view.store.register(view.root)[0]
    expect(listed.hooks).toHaveLength(1); expect(listed.hookDiagnostics).toEqual(expect.arrayContaining([expect.stringContaining('linked.json'), expect.stringContaining('large.json')]))
    const frozen = view.store.snapshots(), id = frozen[0].hooks![0].id
    rmSync(join(view.root, 'hooks/hooks.json')); symlinkSync(external, join(view.root, 'hooks/hooks.json'))
    expect(() => view.store.assertHook(frozen, id)).toThrow('停用')
  })
})
