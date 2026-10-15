/* Market catalog/package separation follows ZCode pluginManagement.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; Mira host adaptation. */
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { MiraPluginMarketDetail, MiraPluginMarketItem, MiraPluginMarketplaceSource, MiraPluginListing } from '../../src/config/miraPlugins'
import { miraPluginListing } from '../../src/config/miraPlugins'
import type { MiraPaths } from '../storage/miraPaths'
import { MiraPluginStore } from '../storage/miraPluginStore'

const NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/
const MAX_FILE = 4 * 1024 * 1024
const exec = promisify(execFile)
type Entry = { name: string; description?: string; version?: string; source: string; listing?: MiraPluginListing; files?: Array<{ path: string; sha256: string }> }
type Catalog = { name: string; plugins: Entry[] }
type Resolved = { source: MiraPluginMarketplaceSource; catalog: Catalog; base: string; remote: boolean }

function safeRelative(path: string) {
  if (!path || path.length > 1024 || isAbsolute(path) || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..' || /[\x00-\x1f<>:"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('市场文件路径无效')
  return path
}
function localPath(root: string, path: string) {
  const safe = safeRelative(path)
  let current = root
  for (const part of safe.split('/')) {
    current = join(current, part)
    if (lstatSync(current).isSymbolicLink()) throw new Error('市场文件不能经过符号链接')
  }
  const target = resolve(root, safe), child = relative(realpathSync(root), realpathSync(target))
  if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child) || lstatSync(target).isSymbolicLink()) throw new Error('市场文件不能超出来源目录或经过符号链接')
  return target
}
function parseCatalog(text: string): Catalog {
  const value = JSON.parse(text)
  if (typeof value?.name !== 'string' || !NAME.test(value.name) || !Array.isArray(value.plugins) || value.plugins.length > 256) throw new Error('市场需要有效的 name 和 plugins 列表')
  const names = new Set<string>()
  for (const item of value.plugins) {
    if (typeof item?.name !== 'string' || !NAME.test(item.name) || typeof item.source !== 'string' || names.has(item.name)) throw new Error('市场插件名称或来源无效、重复')
    safeRelative(item.source.replace(/^\.\//, '')); names.add(item.name)
    if (item.description !== undefined && typeof item.description !== 'string' || item.version !== undefined && typeof item.version !== 'string') throw new Error('插件描述或版本无效')
    item.listing = miraPluginListing(item.listing)
    if (item.files !== undefined && (!Array.isArray(item.files) || item.files.length > 256 || item.files.some((file: any) => typeof file?.path !== 'string' || !/^[a-f0-9]{64}$/i.test(file.sha256)))) throw new Error('在线插件文件清单需要 SHA-256 校验值')
  }
  return value
}

export class MiraPluginMarketplace {
  get hasBuiltins() { return Boolean(this.builtinRoot) }
  private readonly plugins: MiraPluginStore
  private catalogs = new Map<string, Resolved>()
  private installing = new Set<string>()
  constructor(private readonly paths: MiraPaths, private readonly fetcher: typeof fetch = fetch, private readonly builtinRoot?: string) { this.plugins = new MiraPluginStore(paths) }
  private file() { return join(this.paths.config, 'plugin-marketplaces.json') }
  sources(): MiraPluginMarketplaceSource[] {
    const stored = existsSync(this.file()) ? JSON.parse(readFileSync(this.file(), 'utf8')) : []
    if (!Array.isArray(stored) || stored.length > 32 || stored.some(item => typeof item?.id !== 'string' || !NAME.test(item.id) || typeof item.source !== 'string' || typeof item.name !== 'string')) throw new Error('市场来源配置无效')
    return stored
  }
  private async save(sources: MiraPluginMarketplaceSource[]) {
    this.paths.ensure()
    const temporary = `${this.file()}.${randomUUID()}.tmp`
    try { await writeFile(temporary, JSON.stringify(sources, null, 2), { flag: 'wx' }); await rename(temporary, this.file()) }
    finally { await rm(temporary, { force: true }) }
  }
  private async download(url: string, max = MAX_FILE) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('在线市场必须使用不含凭据的 HTTPS 地址')
    const response = await this.fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
    if (!response.ok || !response.body) throw new Error(`市场下载失败（HTTP ${response.status}）`)
    const chunks: Uint8Array[] = []; let bytes = 0
    for await (const chunk of response.body as any as AsyncIterable<Uint8Array>) {
      bytes += chunk.length
      if (bytes > max) throw new Error('市场文件超过大小限制')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  private async load(source: MiraPluginMarketplaceSource, refresh = false): Promise<Resolved> {
    if (!refresh && this.catalogs.has(source.id)) return this.catalogs.get(source.id)!
    if (source.checkout && refresh) {
      const fresh = await this.clone(source.source)
      try {
      const catalog = parseCatalog(await readFile(fresh.manifest, 'utf8'))
      if (catalog.name !== source.id) throw new Error('市场身份已变化，请重新添加来源')
      source = { ...source, checkout: fresh.root, revision: fresh.revision }
      await this.save(this.sources().map(item => item.id === source.id ? source : item))
      } catch (error) { await rm(fresh.root, { recursive: true, force: true }); throw error }
    }
    const manifest = source.checkout ? this.manifest(source.checkout) : source.source
    const remote = !source.checkout && /^https:/i.test(source.source)
    const text = remote ? (await this.download(manifest, 512 * 1024)).toString('utf8') : await readFile(manifest, 'utf8')
    if (Buffer.byteLength(text) > 512 * 1024) throw new Error('市场目录超过大小限制')
    const catalog = parseCatalog(text)
    if (catalog.name !== source.id) throw new Error('市场身份已变化，请重新添加来源')
    const directory = remote ? '' : dirname(realpathSync(manifest))
    const result = { source, catalog, base: source.checkout || (remote ? new URL('.', source.source).href : /[\\/]\.(?:mira|claude|zcode)-plugin$/.test(directory) ? dirname(directory) : directory), remote }
    this.catalogs.set(source.id, result)
    // 保存成功目录用于断网浏览；安装仍重新校验包内容。
    if (remote) { this.paths.ensure(); await writeFile(join(this.paths.config, `market-cache-${source.id}.json`), text) }
    return result
  }
  async add(input: string, assertAuthorized = () => {}) {
    let source = input.trim()
    if (!source) throw new Error('请输入市场清单地址或本地市场目录')
    if (/^[\w.-]+\/[\w.-]+$/.test(source)) source = `https://github.com/${source}`
    const gitSource = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(source)
    const cloned = gitSource ? await this.clone(source) : undefined
    let saved = false
    try {
    if (!gitSource && !/^https:/i.test(source)) {
      if (!isAbsolute(source)) throw new Error('本地市场需要绝对路径；在线市场需要 HTTPS 清单地址')
      source = realpathSync(source)
      if (lstatSync(source).isDirectory()) source = ['marketplace.json', '.mira-plugin/marketplace.json', '.claude-plugin/marketplace.json', '.zcode-plugin/marketplace.json'].map(path => join(source, path)).find(existsSync) ?? join(source, 'marketplace.json')
    }
    const text = cloned ? await readFile(cloned.manifest, 'utf8') : /^https:/i.test(source) ? (await this.download(source, 512 * 1024)).toString('utf8') : await readFile(source, 'utf8')
    if (Buffer.byteLength(text) > 512 * 1024) throw new Error('市场目录超过大小限制')
    const catalog = parseCatalog(text), sources = this.sources(), item = { id: catalog.name, name: catalog.name, source, ...(cloned ? { checkout: cloned.root, revision: cloned.revision } : {}) }
    if (catalog.name === 'mira-builtin' || catalog.name === 'anthropic-agent-skills') throw new Error('此市场身份由 Mira 保留')
    if (sources.some(item => item.id === catalog.name && item.source !== source)) throw new Error('已有同名市场，请先移除旧来源')
    if (sources.length >= 32 && !sources.some(item => item.id === catalog.name)) throw new Error('最多添加 32 个市场')
    assertAuthorized(); await this.save([...sources.filter(value => value.id !== item.id), item]); this.catalogs.delete(item.id)
    saved = true
    return this.sources()
    } finally { if (cloned && !saved) await rm(cloned.root, { recursive: true, force: true }) }
  }
  private manifest(root: string) {
    const file = ['marketplace.json', '.mira-plugin/marketplace.json', '.claude-plugin/marketplace.json', '.zcode-plugin/marketplace.json'].map(path => join(root, path)).find(existsSync)
    if (!file) throw new Error('仓库中没有找到 marketplace.json；请添加插件市场仓库，而非普通 Skill 仓库')
    return file
  }
  private async clone(url: string) {
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(url)) throw new Error('Git 市场目前支持 GitHub 仓库地址')
    const parent = join(this.paths.root, 'marketplaces'); await mkdir(parent, { recursive: true })
    const root = join(parent, randomUUID())
    try {
      await exec('git', ['-c', 'core.hooksPath=', '-c', 'credential.interactive=false', 'clone', '--depth', '1', '--', url, root], { timeout: 120_000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
      const { stdout } = await exec('git', ['-C', root, 'rev-parse', 'HEAD'], { timeout: 5000, windowsHide: true })
      return { root, manifest: this.manifest(root), revision: stdout.trim() }
    } catch (error) { await rm(root, { recursive: true, force: true }); throw new Error(`无法读取 GitHub 市场，请检查 Git 和网络，或下载后添加本地目录。${(error as NodeJS.ErrnoException).code === 'ENOENT' ? '未找到 Git。' : ''}`) }
  }
  async remove(id: string) { await this.save(this.sources().filter(item => item.id !== id)); this.catalogs.delete(id); return this.sources() }
  private async allSources() {
    const sources = this.sources()
    if (this.builtinRoot) sources.unshift({ id: 'mira-builtin', name: 'Mira 内置插件', source: join(this.builtinRoot, 'marketplace.json') })
    return sources
  }
  async browse(refresh = false) {
    const items: MiraPluginMarketItem[] = [], errors: string[] = [], inventory = this.plugins.list()
    for (const source of await this.allSources()) {
      let loaded: Resolved
      try { loaded = await this.load(source, refresh) }
      catch (error) {
        errors.push(`${source.name}：${error instanceof Error ? error.message : '读取失败'}`)
        const cache = join(this.paths.config, `market-cache-${source.id}.json`)
        if (this.catalogs.has(source.id)) loaded = this.catalogs.get(source.id)!
        else if (/^https:/i.test(source.source) && existsSync(cache)) loaded = { source, catalog: parseCatalog(await readFile(cache, 'utf8')), base: new URL('.', source.source).href, remote: true }
        else continue
      }
      for (const entry of loaded.catalog.plugins) {
        const id = `${entry.name}@${source.id}`, installed = inventory.find(plugin => plugin.id === id)
        items.push({ id, name: entry.name, description: entry.description ?? '', marketplace: source.id, sourceName: source.name, repositoryUrl: source.id === 'mira-builtin' ? '' : source.source, commit: entry.version ?? '', version: entry.version, listing: entry.listing, skills: installed?.skills ?? [], unsupported: installed?.unsupported ?? [], installed: Boolean(installed), enabled: Boolean(installed?.enabled && !installed.error), ...(!entry.files?.length && loaded.remote ? { unavailableReason: '此在线插件缺少带 SHA-256 的文件清单' } : installed?.unavailableReason ? { unavailableReason: installed.unavailableReason } : {}) })
      }
    }
    return { sourceName: '公共插件', items, errors }
  }
  owns(id: string) { return id.endsWith('@mira-builtin') || this.sources().some(source => id.endsWith(`@${source.id}`)) }
  private async entry(id: string) {
    const source = (await this.allSources()).find(source => id.endsWith(`@${source.id}`))
    if (!source) throw new Error('插件市场不存在')
    const loaded = await this.load(source), entry = loaded.catalog.plugins.find(entry => `${entry.name}@${source.id}` === id)
    if (!entry) throw new Error('插件不存在，请刷新市场')
    return { ...loaded, entry }
  }
  async detail(id: string): Promise<MiraPluginMarketDetail> {
    const { entry } = await this.entry(id), item = (await this.browse()).items.find(item => item.id === id)!
    return { ...item, files: entry.files?.map(file => ({ path: file.path, size: 0 })) ?? [], totalBytes: 0, licenses: [] }
  }
  async seed() {
    if (!this.builtinRoot) return
    this.paths.ensure()
    const marker = join(this.paths.config, 'builtin-plugins.json')
    const seeded: string[] = existsSync(marker) ? JSON.parse(await readFile(marker, 'utf8')) : []
    const { plugins } = parseCatalog(await readFile(join(this.builtinRoot, 'marketplace.json'), 'utf8'))
    for (const entry of plugins) if (!seeded.includes(entry.name)) {
      if (!this.plugins.list().some(item => item.id === `${entry.name}@mira-builtin`)) this.plugins.register(localPath(this.builtinRoot, entry.source.replace(/^\.\//, '')), 'mira-builtin')
      seeded.push(entry.name)
      await writeFile(marker, JSON.stringify(seeded))
    }
  }
  async install(id: string, assertAuthorized = () => {}) {
    if (this.installing.has(id)) throw new Error('此插件正在安装')
    this.installing.add(id)
    let stage: string | undefined
    try {
      const { entry, base, remote, source } = await this.entry(id)
      if (this.plugins.list().some(item => item.id === id)) throw new Error('此插件已安装')
      let root: string
      if (!remote) root = localPath(base, entry.source.replace(/^\.\//, ''))
      else {
        if (!entry.files?.length) throw new Error('在线插件需要带 SHA-256 的文件清单')
        const parent = join(this.paths.root, 'plugins', source.id); await mkdir(parent, { recursive: true })
        stage = join(parent, `.stage-${randomUUID()}`); await mkdir(stage)
        let bytes = 0
        for (const file of entry.files) {
          const path = safeRelative(file.path), prefix = safeRelative(entry.source.replace(/^\.\//, ''))
          const content = await this.download(new URL(`${prefix}/${path.split('/').map(encodeURIComponent).join('/')}`, base).href)
          assertAuthorized(); bytes += content.length
          if (bytes > 32 * 1024 * 1024 || createHash('sha256').update(content).digest('hex') !== file.sha256.toLowerCase()) throw new Error('插件校验失败或超过 32MB')
          const destination = join(stage, path); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, content, { flag: 'wx' })
        }
        root = join(parent, `${entry.name}-${randomUUID()}`)
        assertAuthorized(); await rename(stage, root); stage = root
      }
      assertAuthorized(); this.plugins.register(root, source.id); stage = undefined
      return (await this.browse()).items.find(item => item.id === id)!
    } finally { if (stage) await rm(stage, { recursive: true, force: true }); this.installing.delete(id) }
  }
}
