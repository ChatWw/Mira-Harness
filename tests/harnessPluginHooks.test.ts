import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraHookStore } from '../electron/storage/miraHookStore'
import { MiraPluginStore } from '../electron/storage/miraPluginStore'
import { HarnessHookCatalog } from '../electron/services/harnessHookCatalog'
import { HarnessHooks } from '../electron/services/harnessHooks'
import type { ToolCallRecord } from '../src/config/harness'

const homes: string[] = []
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'mira-plugin-hook-chain-')); homes.push(home)
  const paths = new MiraPaths(home).ensure(), hooks = new MiraHookStore(paths), plugins = new MiraPluginStore(paths)
  const root = join(home, 'package with spaces'), directory = join(home, 'project'), marker = join(directory, 'marker')
  mkdirSync(directory); mkdirSync(join(root, '.mira-plugin'), { recursive: true }); mkdirSync(join(root, 'hooks'))
  const manifest = join(root, '.mira-plugin/plugin.json'), source = join(root, 'hooks/hooks.json')
  writeFileSync(manifest, JSON.stringify({ name: 'reviewed' }))
  const declaration = { hooks: { UserPromptSubmit: [{ hooks: [{ type: 'process', command: process.execPath, args: ['${CLAUDE_PLUGIN_ROOT}/run.cjs'] }] }] } }
  writeFileSync(source, JSON.stringify(declaration))
  writeFileSync(join(root, 'run.cjs'), `const fs=require('fs');fs.appendFileSync(${JSON.stringify(marker)},process.env.MIRA_PLUGIN_ROOT+'\\n');console.log(JSON.stringify({additionalContext:'REAL_PLUGIN_CONTEXT'}))`)
  plugins.register(root)
  const current = () => new HarnessHookCatalog(hooks, plugins)
  const accepted = () => plugins.assertHook(plugins.snapshots(), plugins.snapshots()[0].hooks![0].id)
  const approve = () => { const row = accepted(); return hooks.trustPlugin(row, row.revision, true) }
  const records: ToolCallRecord[] = [], signal = new AbortController().signal
  const coordinator = () => new HarnessHooks({ store: current(), directory, signal, inputBase: { sessionId: 'actual-session', runId: 'actual-run', cwd: directory }, onRecord: row => records.push(row) })
  return { paths, hooks, plugins, root, directory, marker, source, declaration, current, accepted, approve, records, coordinator }
}

describe('installed plugin Hook approval and actual execution', () => {
  it('shows and skips an unreviewed Hook-only plugin, then runs the exact approved source', async () => {
    const view = fixture(), row = view.current().list()[0]
    expect(row).toMatchObject({ scope: 'plugin', trusted: false, pluginId: 'reviewed@local', enabled: true })
    expect(await view.coordinator().run('UserPromptSubmit')).toMatchObject({ contexts: [] })
    expect(existsSync(view.marker)).toBe(false)
    expect(view.records).toHaveLength(1); expect(view.records[0].skipReason).toContain('信任')
    expect(view.records[0].status).toBe('cancelled'); expect(view.records[0].error).toBeUndefined()
    view.approve()
    const result = await view.coordinator().run('UserPromptSubmit')
    expect(result.contexts).toEqual(['REAL_PLUGIN_CONTEXT'])
    expect(readFileSync(view.marker, 'utf8').trim()).toBe(view.accepted().sourceRoot)
    expect(view.records.at(-1)).toMatchObject({ status: 'ok', tool: 'hook', runId: 'actual-run' })
    expect(view.records.at(-1)?.input?.text).toContain('reviewed@local')
    expect(view.records.at(-1)?.input?.text).toContain('hooks/hooks.json')
    expect(readFileSync(view.source, 'utf8')).toBe(JSON.stringify(view.declaration))
  })

  it.each(['revoke', 'disable', 'remove', 'change'] as const)('prevents spawning an already accepted hook after %s', async action => {
    const view = fixture(), approved = view.approve(), running = view.coordinator()
    if (action === 'revoke') view.hooks.trustPlugin(view.accepted(), approved.revision, false)
    if (action === 'disable') view.plugins.setEnabled('reviewed@local', false)
    if (action === 'remove') view.plugins.remove('reviewed@local')
    if (action === 'change') { view.declaration.hooks.UserPromptSubmit[0].hooks[0].args.push('changed'); writeFileSync(view.source, JSON.stringify(view.declaration)) }
    expect(await running.run('UserPromptSubmit')).toMatchObject({ blocked: expect.stringContaining('变化'), contexts: [] })
    expect(existsSync(view.marker)).toBe(false)
    expect(view.records.map(row => row.status)).toEqual(['failed'])
  })

  it('persists approval by plugin identity and root, keeps disabled rows visible, and invalidates changed content', () => {
    const view = fixture(), item = view.approve()
    expect(new MiraHookStore(view.paths).pluginItem(view.accepted()).trusted).toBe(true)
    view.plugins.setEnabled('reviewed@local', false)
    expect(view.current().list()[0]).toMatchObject({ trusted: true, enabled: false, unavailableReason: expect.stringContaining('停用') })
    view.plugins.setEnabled('reviewed@local', true)
    view.declaration.hooks.UserPromptSubmit[0].hooks[0].args.push('changed'); writeFileSync(view.source, JSON.stringify(view.declaration))
    expect(view.current().list()[0].trusted).toBe(false)
    expect(() => view.hooks.trustPlugin(view.accepted(), item.revision, true)).toThrow('修改')
    expect(new MiraHookStore(view.paths).pluginItem({ ...view.accepted(), sourceRoot: view.directory }).trusted).toBe(false)
  })
})
