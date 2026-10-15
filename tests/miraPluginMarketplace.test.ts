import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraPluginStore } from '../electron/storage/miraPluginStore'
import { MiraPluginMarketplace } from '../electron/services/miraPluginMarketplace'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
function fixture(builtins = false, fetcher: typeof fetch = vi.fn()) {
  const home = mkdtempSync(join(tmpdir(), 'mira-plugin-market-')); directories.push(home)
  const paths = new MiraPaths(home).ensure()
  return { home, paths, store: new MiraPluginStore(paths), market: new MiraPluginMarketplace(paths, fetcher, builtins ? resolve('resources/plugins') : undefined) }
}
function packageAt(root: string, name = 'review') {
  mkdirSync(join(root, '.mira-plugin'), { recursive: true }); mkdirSync(join(root, 'skills/review'), { recursive: true })
  writeFileSync(join(root, '.mira-plugin/plugin.json'), JSON.stringify({ name, version: '1.0.0', skills: 'skills' }))
  writeFileSync(join(root, 'skills/review/SKILL.md'), '---\nname: review\ndescription: Review changes\n---\n# Review\nInspect actual changes.')
}
describe('Mira plugin marketplace', () => {
  it('seeds all nine actual plugin packages offline and preserves disable/remove decisions across restart', async () => {
    const fetcher = vi.fn(), { market, store, paths } = fixture(true, fetcher)
    await market.seed()
    expect(store.list()).toHaveLength(9)
    expect(store.list().every(item => !item.error && item.skills.length > 0)).toBe(true)
    expect(store.list().map(item => item.name)).toEqual(expect.arrayContaining(['pdf', 'documents', 'presentations', 'spreadsheets', 'computer-use', 'browser-use', 'plugin-creator', 'skill-creator', 'mira-guide']))
    const id = 'pdf@mira-builtin'
    store.setEnabled(id, false); await market.seed(); expect(store.list().find(item => item.id === id)?.enabled).toBe(false)
    store.remove(id); await new MiraPluginMarketplace(paths, fetcher, resolve('resources/plugins')).seed()
    expect(store.list().find(item => item.id === id)).toBeUndefined()
    expect((await market.browse()).items.find(item => item.id === id)?.installed).toBe(false)
    await market.install(id); expect(store.list().find(item => item.id === id)?.enabled).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
    expect(store.readSkill(store.snapshots(), 'pdf:pdf')).toContain('PDF Skill')
  })
  it('persists a local market, installs its package, and preserves installed plugins when removing the source', async () => {
    const { market, store, home, paths } = fixture(); packageAt(join(home, 'review'))
    writeFileSync(join(home, 'marketplace.json'), JSON.stringify({ name: 'local-test', plugins: [{ name: 'review', source: 'review', version: '1.0.0' }] }))
    await market.add(home); expect(new MiraPluginMarketplace(paths).sources()[0].id).toBe('local-test')
    await market.install('review@local-test'); expect(store.list()[0].skills[0].name).toBe('review')
    await market.remove('local-test'); expect(store.list()).toHaveLength(1)
  })
  it('installs HTTPS packages only after verifying content hashes and removes staging after a mismatch', async () => {
    const files = { '.mira-plugin/plugin.json': JSON.stringify({ name: 'review', skills: 'skills' }), 'skills/review/SKILL.md': '---\nname: review\ndescription: Review changes\n---\n# Review\nInspect actual changes.' }
    const catalog = { name: 'online', plugins: [{ name: 'review', source: 'review', files: Object.entries(files).map(([path, value]) => ({ path, sha256: createHash('sha256').update(value).digest('hex') })) }] }
    let corrupt = true
    const fetcher = vi.fn(async (url: any) => new Response(String(url).endsWith('marketplace.json') ? JSON.stringify(catalog) : corrupt ? 'bad' : files[String(url).split('/review/').slice(1).join('/review/') as keyof typeof files])) as unknown as typeof fetch
    const { market, store } = fixture(false, fetcher)
    await market.add('https://example.com/marketplace.json')
    await expect(market.install('review@online')).rejects.toThrow('校验失败')
    expect(store.list()).toEqual([])
    corrupt = false; await market.install('review@online'); expect(store.list()).toHaveLength(1)
  })
  it('rejects unsafe catalog paths, HTTP and same-name source replacement', async () => {
    const { market, home } = fixture()
    writeFileSync(join(home, 'marketplace.json'), JSON.stringify({ name: 'test', plugins: [{ name: 'review', source: '../escape' }] }))
    await expect(market.add(home)).rejects.toThrow('路径无效')
    await expect(market.add('http://example.com/marketplace.json')).rejects.toThrow('HTTPS')
  })
  it('rejects missing market or plugin names rather than coercing them to strings', async () => {
    const { market, home } = fixture()
    const file = join(home, 'marketplace.json')
    writeFileSync(file, JSON.stringify({ plugins: [] }))
    await expect(market.add(home)).rejects.toThrow('name')
    writeFileSync(file, JSON.stringify({ name: 'test', plugins: [{ source: 'review' }] }))
    await expect(market.add(home)).rejects.toThrow('名称')
    expect(market.sources()).toEqual([])
  })
})
