import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraPluginStore } from '../electron/storage/miraPluginStore'
import { MiraPluginMarketplace } from '../electron/services/miraPluginMarketplace'

const directories: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
function fixture(builtins = false, fetcher: typeof fetch = vi.fn(), resolveProxy?: (url: string) => Promise<string>) {
  const home = mkdtempSync(join(tmpdir(), 'mira-plugin-market-')); directories.push(home)
  const paths = new MiraPaths(home).ensure()
  return { home, paths, store: new MiraPluginStore(paths), market: new MiraPluginMarketplace(paths, fetcher, builtins ? resolve('resources/plugins') : undefined, resolveProxy) }
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
  it.each(['https', 'local'])('accepts a mixed Claude %s catalog and defers external downloads until installation', async kind => {
    const catalog = { name: 'claude-plugins-official', plugins: [
      { name: 'local-review', source: './plugins/local-review' },
      { name: 'remote-review', source: { source: 'url', url: 'https://github.com/example/review.git', sha: 'a'.repeat(40) } },
      { name: 'subdir-review', source: { source: 'git-subdir', url: 'https://github.com/example/plugins.git', path: 'plugins/review', ref: 'v1.0.0', sha: 'b'.repeat(40) } },
    ] }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(catalog)))
    const { market, home, paths } = fixture(false, fetcher)
    const file = join(home, 'marketplace.json'); writeFileSync(file, JSON.stringify(catalog))
    await market.add(kind === 'https' ? 'https://example.com/index.json' : file)
    const result = await market.browse()
    expect(result.errors).toEqual([])
    expect(result.items).toHaveLength(3)
    expect(result.items.filter(item => item.name !== 'local-review').every(item => !item.unavailableReason)).toBe(true)
    expect(existsSync(join(paths.root, 'marketplaces'))).toBe(false)
    const restarted = await new MiraPluginMarketplace(paths, vi.fn().mockRejectedValue(new TypeError('offline'))).browse()
    expect(restarted.items).toHaveLength(3)
  })
  it('installs Claude Git roots and subdirectories at the pinned commit and retains them after source removal', async () => {
    const { market, home, paths, store } = fixture()
    const repo = join(home, 'repo'); mkdirSync(repo)
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
    git('init', '-q', '--initial-branch=main')
    packageAt(repo, 'root-review'); packageAt(join(repo, 'plugins/subdir'), 'subdir-review')
    packageAt(join(home, 'outside'), 'escaped-review'); symlinkSync(join(home, 'outside'), join(repo, 'escaped'), 'dir')
    git('add', '.'); git('-c', 'user.name=Mira Test', '-c', 'user.email=mira@example.test', 'commit', '-qm', 'First plugin version')
    const sha = git('rev-parse', 'HEAD')
    writeFileSync(join(repo, 'skills/review/SKILL.md'), 'changed after pinned version')
    git('add', '.'); git('-c', 'user.name=Mira Test', '-c', 'user.email=mira@example.test', 'commit', '-qm', 'New plugin version')
    const config = join(home, 'gitconfig')
    writeFileSync(config, `[url "${repo}"]\n\tinsteadOf = https://github.com/example/review.git\n`)
    vi.stubEnv('GIT_CONFIG_GLOBAL', config)
    writeFileSync(join(home, 'marketplace.json'), JSON.stringify({ name: 'claude-test', plugins: [
      { name: 'root-review', source: { source: 'url', url: 'https://github.com/example/review.git', sha } },
      { name: 'subdir-review', source: { source: 'git-subdir', url: 'https://github.com/example/review.git', path: 'plugins/subdir', ref: 'main', sha } },
      { name: 'escaped-review', source: { source: 'git-subdir', url: 'https://github.com/example/review.git', path: 'escaped', sha } },
      { name: 'wrong-name', source: { source: 'url', url: 'https://github.com/example/review.git', sha } },
      { name: 'missing-version', source: { source: 'url', url: 'https://github.com/example/review.git', sha: 'f'.repeat(40) } },
    ] }))
    await market.add(home)
    await market.install('root-review@claude-test'); await market.install('subdir-review@claude-test')
    expect(store.list().map(item => item.id)).toEqual(expect.arrayContaining(['root-review@claude-test', 'subdir-review@claude-test']))
    expect(store.readSkill(store.snapshots(), 'root-review:review')).toContain('Inspect actual changes.')
    const checkouts = readdirSync(join(paths.root, 'marketplaces'))
    await expect(market.install('escaped-review@claude-test')).rejects.toThrow('符号链接')
    await expect(market.install('wrong-name@claude-test')).rejects.toThrow('名称与市场清单不一致')
    await expect(market.install('missing-version@claude-test')).rejects.toMatchObject({ message: expect.stringContaining('清单指定的版本'), cause: { stderr: expect.stringContaining('not our ref') } })
    expect(readdirSync(join(paths.root, 'marketplaces')).sort()).toEqual(checkouts.sort())
    await market.remove('claude-test')
    expect(new MiraPluginStore(paths).list()).toHaveLength(2)
  })
  it.each([
    ['PROXY 127.0.0.1:7897; DIRECT', 'http://127.0.0.1:7897'],
    ['HTTPS proxy.example.test:443', 'https://proxy.example.test:443'],
    ['SOCKS5 127.0.0.1:7897', 'socks5h://127.0.0.1:7897'],
    ['DIRECT', ''],
  ])('passes Electron proxy resolution %s to every Git operation', async (resolved, expected) => {
    const resolveProxy = vi.fn(async () => resolved)
    const { market, home } = fixture(false, vi.fn(), resolveProxy)
    const repo = join(home, 'repo'); mkdirSync(repo); packageAt(repo)
    execFileSync('git', ['init', '-q', repo])
    execFileSync('git', ['-C', repo, 'add', '.'])
    execFileSync('git', ['-C', repo, '-c', 'user.name=Mira', '-c', 'user.email=test@example.test', 'commit', '-qm', 'Plugin'])
    const sha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const config = join(home, 'gitconfig'), trace = join(home, 'git-trace.log')
    writeFileSync(config, `[url "${repo}"]\n\tinsteadOf = https://github.com/example/review.git\n`)
    vi.stubEnv('GIT_CONFIG_GLOBAL', config); vi.stubEnv('GIT_TRACE2_EVENT', trace)
    writeFileSync(join(home, 'marketplace.json'), JSON.stringify({ name: 'proxy-test', plugins: [{ name: 'review', source: { source: 'url', url: 'https://github.com/example/review.git', sha } }] }))
    await market.add(home); await market.install('review@proxy-test')
    expect(resolveProxy).toHaveBeenCalledWith('https://github.com/example/review.git')
    const commands = readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(event => event.event === 'start' && event.argv.some((arg: string) => ['clone', 'fetch', 'checkout', 'rev-parse'].includes(arg))).map(event => event.argv)
    expect(commands).toHaveLength(4)
    for (const command of commands) expect(command).toContain(`http.proxy=${expected}`)
  })
  it.each([
    { source: 'url', url: 'file:///outside' },
    { source: 'url', url: 'https://user:secret@example.com/repo.git' },
    { source: 'git-subdir', url: 'https://example.com/repo.git', path: '../outside' },
    { source: 'git-subdir', url: 'https://example.com/repo.git' },
    { source: 'url', url: 'https://example.com/repo.git', sha: 'invalid' },
    { source: 'url', url: 'https://example.com/repo.git', ref: '--upload-pack=other' },
  ])('rejects an invalid external plugin source before download: %j', async source => {
    const { market, home } = fixture()
    writeFileSync(join(home, 'marketplace.json'), JSON.stringify({ name: 'invalid', plugins: [{ name: 'review', source }] }))
    await expect(market.add(home)).rejects.toThrow()
    expect(market.sources()).toEqual([])
  })
  it.each(['https', 'local'])('adds, browses and refreshes a large %s catalog without a plugin-count limit', async kind => {
    const catalog = { name: 'large', plugins: Array.from({ length: 5000 }, (_, index) => ({ name: `plugin-${index}`, source: `plugin-${index}`, description: '插件说明'.repeat(50) })) }
    let text = JSON.stringify(catalog)
    expect(Buffer.byteLength(text)).toBeGreaterThan(3 * 1024 * 1024)
    const fetcher = vi.fn(async () => new Response(text))
    const { market, home, paths } = fixture(false, fetcher)
    const file = join(home, 'marketplace.json'), source = kind === 'https' ? 'https://example.com/index.json' : file
    writeFileSync(file, text)
    await market.add(source)
    expect((await market.browse()).items).toHaveLength(5000)
    catalog.plugins.push({ name: 'last-plugin', source: 'last-plugin', description: 'Added on refresh' })
    text = JSON.stringify(catalog); writeFileSync(file, text)
    const refreshed = await market.browse(true)
    expect(refreshed.errors).toEqual([])
    expect(refreshed.items).toHaveLength(5001)
    const offline = vi.fn().mockRejectedValue(new TypeError('offline'))
    const restarted = await new MiraPluginMarketplace(paths, offline).browse()
    expect(restarted.items).toHaveLength(5001)
    expect(restarted.items.at(-1)?.name).toBe('last-plugin')
    expect(restarted.errors).toHaveLength(kind === 'https' ? 1 : 0)
  })
  it.each(['https', 'local'])('rejects %s catalogs above 32 MiB without saving them', async kind => {
    const text = JSON.stringify({ name: 'large', plugins: [], description: 'x'.repeat(32 * 1024 * 1024) })
    const fetcher = vi.fn(async () => new Response(text))
    const { market, home } = fixture(false, fetcher)
    const file = join(home, 'marketplace.json'); writeFileSync(file, text)
    await expect(market.add(kind === 'https' ? 'https://example.com/index.json' : file)).rejects.toThrow('市场目录超过大小限制')
    expect(market.sources()).toEqual([])
  })
  it('keeps the 4 MiB per-plugin-file limit separate from catalog capacity', async () => {
    const catalog = { name: 'online', plugins: [{ name: 'review', source: 'review', files: [{ path: 'large.txt', sha256: 'a'.repeat(64) }] }] }
    const fetcher = vi.fn(async (url: any) => new Response(String(url).endsWith('index.json') ? JSON.stringify(catalog) : 'x'.repeat(4 * 1024 * 1024 + 1))) as unknown as typeof fetch
    const { market, store } = fixture(false, fetcher)
    await market.add('https://example.com/index.json')
    await expect(market.install('review@online')).rejects.toThrow('市场文件超过大小限制')
    expect(store.list()).toEqual([])
  })
  it('distinguishes incompatible DSH catalogs, invalid JSON and HTTP failures', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ format: 1, title: { zh: 'DSH' }, plugins: [] })))
      .mockResolvedValueOnce(new Response('<html>not a catalog</html>'))
      .mockResolvedValueOnce(new Response('missing', { status: 404 })) as unknown as typeof fetch
    const { market } = fixture(false, fetcher)
    await expect(market.add('https://example.com/index.json')).rejects.toThrow('暂不支持 DSH/npm 插件目录')
    await expect(market.add('https://example.com/index.json')).rejects.toThrow('市场清单不是有效的 JSON')
    await expect(market.add('https://example.com/index.json')).rejects.toThrow('市场下载失败（HTTP 404）')
    expect(market.sources()).toEqual([])
  })
  it('normalizes transport errors without exposing low-level details', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError')).mockRejectedValueOnce(new TypeError('private proxy detail')) as unknown as typeof fetch
    const { market } = fixture(false, fetcher)
    await expect(market.add('https://example.com/index.json')).rejects.toThrow('插件市场读取超时')
    await expect(market.add('https://example.com/index.json')).rejects.toThrow('无法连接插件市场')
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
