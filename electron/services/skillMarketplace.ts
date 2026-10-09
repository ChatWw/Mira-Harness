import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type { HarnessSkillMarketCatalog, HarnessSkillMarketDetail, HarnessSkillMarketItem } from '../../src/config/harness'
import type { MiraPaths } from '../storage/miraPaths'
import { parseSkill, type SkillStore } from '../storage/skillStore'
import curatedSource from './marketplace/curated-skill-source.json'

const SOURCE_ID = 'anthropic-skills'
const SOURCE_NAME = 'Anthropic Skills'
const REPOSITORY_URL = 'https://github.com/anthropics/skills'
const DOWNLOAD_ROOT = 'https://raw.githubusercontent.com/anthropics/skills'
const META_FILE = 'MIRA_MARKETPLACE_SOURCE.json'
const NOTICE_FILE = 'UPSTREAM_THIRD_PARTY_NOTICES.md'
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_PACKAGE_BYTES = 32 * 1024 * 1024
const MAX_PACKAGE_FILES = 128
const CACHE_MS = 10 * 60 * 1000

type TreeEntry = { path: string; type: string; mode: string; sha: string; size?: number }
type Candidate = { item: HarnessSkillMarketItem; files: TreeEntry[]; instructions: string; licenseText: string }
type Snapshot = { commit: string; refreshedAt: number; excludedCount: number; candidates: Map<string, Candidate>; notice?: TreeEntry }
type InstalledMeta = HarnessSkillMarketItem & { version: 1; files: Array<{ path: string; sha: string; size: number }> }

function safePath(path: string) {
  return path.length > 0 && path.length <= 1024 && path.split('/').every(part => part && part !== '.' && part !== '..'
    && !/[\\\u0000-\u001f<>:"|?*]/.test(part) && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
}
function isApacheLicense(text: string) {
  return /Apache License\s+Version 2\.0/.test(text) && text.includes('Grant of Copyright License') && text.includes('Redistribution')
}
function slugFromId(id: string) {
  const match = /^anthropic-skills:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id)
  if (!match || match[1].length > 80) throw new Error('市场 Skill 不存在，请刷新后重试')
  return match[1]
}
function assertDirectory(path: string) {
  if (existsSync(path)) {
    const stat = lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Skill 安装目录不可用，请检查目录设置')
  } else mkdirSync(path)
}

export class SkillMarketplaceService {
  private snapshot?: Snapshot
  private browsing?: Promise<Snapshot>
  private blobs = new Map<string, Promise<Buffer>>()
  private installing = new Set<string>()

  constructor(private readonly paths: MiraPaths, private readonly skills: SkillStore, private readonly fetcher: typeof fetch = fetch, private readonly source: { commit: string; tree: TreeEntry[] } = curatedSource) {}

  private async download(url: string, maxBytes: number): Promise<Buffer> {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 20_000)
    try {
      const response = await this.fetcher(url, { headers: { 'User-Agent': 'Mira-Harness' }, signal: abort.signal, redirect: 'error' })
      if (response.status === 403 || response.status === 429) throw new Error('GitHub 公开请求额度暂时用完，请稍后刷新重试')
      if (!response.ok) throw new Error(`Skill 市场读取失败（HTTP ${response.status}），请刷新重试`)
      if (Number(response.headers.get('content-length')) > maxBytes || !response.body) throw new Error('Skill 市场响应过大或无内容')
      const chunks: Uint8Array[] = []; let bytes = 0
      const reader = response.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > maxBytes) { await reader.cancel(); throw new Error('Skill 市场响应超过大小限制') }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
      return Buffer.concat(chunks)
    } catch (error) {
      if (abort.signal.aborted) throw new Error('Skill 市场读取超时，请检查网络后重试')
      if (error instanceof Error && (error.message.startsWith('Skill ') || error.message.startsWith('GitHub '))) throw error
      throw new Error('无法连接 Skill 市场，请检查网络后刷新重试')
    } finally { clearTimeout(timer) }
  }

  private blob(entry: TreeEntry) {
    const existing = this.blobs.get(entry.sha)
    if (existing) return existing.then(content => {
      if (content.length !== entry.size) throw new Error('Skill 文件完整性校验失败，请刷新重试')
      return content
    })
    const pending = this.download(`${DOWNLOAD_ROOT}/${this.source.commit}/${entry.path.split('/').map(encodeURIComponent).join('/')}`, MAX_FILE_BYTES).then(content => {
      const hash = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
      if (content.length !== entry.size || content.length > MAX_FILE_BYTES || hash !== entry.sha) throw new Error('Skill 文件完整性校验失败，请刷新重试')
      return content
    })
    this.blobs.set(entry.sha, pending)
    void pending.catch(() => { if (this.blobs.get(entry.sha) === pending) this.blobs.delete(entry.sha) })
    return pending
  }

  private async loadSnapshot(): Promise<Snapshot> {
    const { commit, tree: entries } = this.source
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Skill 市场版本无效，请刷新重试')
    const candidates = new Map<string, Candidate>(); let excludedCount = 0
    const skills = entries.filter(entry => typeof entry.path === 'string' && /^skills\/[a-z0-9]+(?:-[a-z0-9]+)*\/SKILL\.md$/.test(entry.path))
    for (const skill of skills) {
      const prefix = skill.path.slice(0, -'SKILL.md'.length)
      const directory = entries.filter(entry => typeof entry.path === 'string' && entry.path.startsWith(prefix))
      const files = directory.filter(entry => entry.type === 'blob')
      const relativePaths = files.map(entry => entry.path.slice(prefix.length))
      const license = files.find(entry => /^(LICENSE|LICENSE\.txt|LICENSE\.md)$/.test(entry.path.slice(prefix.length)))
      if (!license || files.length > MAX_PACKAGE_FILES || directory.some(entry => !safePath(entry.path.slice(prefix.length))
        || !['tree', 'blob'].includes(entry.type) || (entry.type === 'blob' && !['100644', '100755'].includes(entry.mode)))
        || files.some(entry => !/^[a-f0-9]{40}$/.test(entry.sha) || !Number.isSafeInteger(entry.size) || entry.size! < 0 || entry.size! > MAX_FILE_BYTES)
        || files.reduce((total, entry) => total + entry.size!, 0) > MAX_PACKAGE_BYTES
        || new Set(relativePaths.map(path => path.toLowerCase())).size !== files.length
        || relativePaths.some(path => [META_FILE, NOTICE_FILE].includes(path))) { excludedCount++; continue }
      const licenseText = (await this.blob(license)).toString('utf8')
      if (!isApacheLicense(licenseText)) { excludedCount++; continue }
      const source = (await this.blob(skill)).toString('utf8')
      const parsed = parseSkill(skill.path, source)
      if (!parsed.valid) { excludedCount++; continue }
      const slug = prefix.split('/')[1]
      const item: HarnessSkillMarketItem = { id: `${SOURCE_ID}:${slug}`, name: parsed.name, description: parsed.description, sourceId: SOURCE_ID, sourceName: SOURCE_NAME, repositoryUrl: REPOSITORY_URL, commit, license: 'Apache-2.0', installed: false, enabled: false }
      candidates.set(item.id, { item, files, instructions: source, licenseText })
    }
    const notice = entries.find(entry => entry.path === 'THIRD_PARTY_NOTICES.md' && entry.type === 'blob' && entry.mode === '100644' && Number.isSafeInteger(entry.size) && entry.size! <= MAX_FILE_BYTES && /^[a-f0-9]{40}$/.test(entry.sha))
    return { commit, refreshedAt: Date.now(), excludedCount, candidates, notice }
  }

  private async catalog(refresh = false) {
    if (this.browsing) return this.browsing
    if (!refresh && this.snapshot && Date.now() - this.snapshot.refreshedAt < CACHE_MS) return this.snapshot
    if (refresh) this.blobs.clear()
    this.browsing = this.loadSnapshot()
    try { this.snapshot = await this.browsing; return this.snapshot }
    finally { this.browsing = undefined }
  }

  async browse(refresh = false): Promise<HarnessSkillMarketCatalog> {
    const snapshot = await this.catalog(refresh)
    const installed = new Map(this.installed().map(item => [item.id, item]))
    return { sourceId: SOURCE_ID, sourceName: SOURCE_NAME, repositoryUrl: REPOSITORY_URL, commit: snapshot.commit, refreshedAt: snapshot.refreshedAt, excludedCount: snapshot.excludedCount,
      items: [...snapshot.candidates.values()].map(({ item }) => ({ ...item, installed: installed.has(item.id), enabled: installed.get(item.id)?.enabled ?? false, skillId: installed.get(item.id)?.skillId })).sort((a, b) => a.name.localeCompare(b.name)) }
  }

  async detail(id: string): Promise<HarnessSkillMarketDetail> {
    slugFromId(id)
    const snapshot = await this.catalog()
    const candidate = snapshot.candidates.get(id)
    if (!candidate) throw new Error('市场 Skill 不存在或不符合安装许可，请刷新后重试')
    const item = (await this.browse()).items.find(item => item.id === id)!
    const prefix = `skills/${slugFromId(id)}/`
    return { ...item, instructions: candidate.instructions, licenseText: candidate.licenseText,
      files: candidate.files.map(file => ({ path: file.path.slice(prefix.length), size: file.size! })), totalBytes: candidate.files.reduce((total, file) => total + file.size!, 0) }
  }

  installed(): HarnessSkillMarketItem[] {
    const root = join(this.paths.skills, 'marketplace')
    if (!existsSync(root) || lstatSync(root).isSymbolicLink()) return []
    const skills = this.skills.list()
    const installed: HarnessSkillMarketItem[] = []
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^anthropic-[a-z0-9-]+$/.test(entry.name)) continue
      const directory = join(root, entry.name, 'package'); const file = join(directory, META_FILE)
      try {
        if (lstatSync(directory).isSymbolicLink() || lstatSync(file).isSymbolicLink()) continue
        const meta = JSON.parse(readFileSync(file, 'utf8')) as InstalledMeta
        const skill = skills.find(skill => skill.path === join(directory, 'SKILL.md') && skill.valid)
        if (meta.version !== 1 || meta.sourceId !== SOURCE_ID || !skill || entry.name !== `anthropic-${slugFromId(meta.id)}`) continue
        installed.push({ id: meta.id, name: skill.name, description: skill.description, sourceId: SOURCE_ID, sourceName: SOURCE_NAME, repositoryUrl: REPOSITORY_URL, commit: meta.commit, license: 'Apache-2.0', installed: true, enabled: skill.enabled, skillId: skill.id })
      } catch { /* 非市场目录或损坏的来源记录不作为已安装项。 */ }
    }
    return installed.sort((a, b) => a.name.localeCompare(b.name))
  }

  async install(id: string, assertAuthorized: () => void = () => undefined): Promise<HarnessSkillMarketItem> {
    const slug = slugFromId(id)
    if (this.installing.has(id)) throw new Error('此 Skill 正在安装，请稍后查看结果')
    this.installing.add(id)
    let stage: string | undefined; let published: string | undefined
    let originalDirectories: string[] | undefined
    try {
      const snapshot = await this.catalog()
      assertAuthorized()
      const candidate = snapshot.candidates.get(id)
      if (!candidate) throw new Error('市场 Skill 不存在或不符合安装许可，请刷新后重试')
      for (const path of [this.paths.root, this.paths.config, this.paths.skills]) assertDirectory(path)
      const root = join(this.paths.skills, 'marketplace'); assertDirectory(root)
      if (realpathSync(root) !== join(realpathSync(this.paths.skills), 'marketplace')) throw new Error('Skill 安装目录不能经过符号链接')
      const target = join(root, `anthropic-${slug}`)
      if (existsSync(target) || (() => { try { lstatSync(target); return true } catch { return false } })()) throw new Error('此 Skill 安装目录已存在，请到技能设置管理；不会覆盖现有文件')
      stage = mkdtempSync(join(this.paths.config, '.market-skill-'))
      const prefix = `skills/${slug}/`; const written: InstalledMeta['files'] = []
      for (const file of candidate.files) {
        const path = file.path.slice(prefix.length)
        const destination = resolve(stage, path)
        if (!safePath(path) || relative(stage, destination).startsWith(`..${sep}`)) throw new Error('Skill 包含无效文件路径')
        mkdirSync(resolve(destination, '..'), { recursive: true })
        const content = await this.blob(file)
        assertAuthorized()
        writeFileSync(destination, content, { flag: 'wx', mode: 0o644 })
        written.push({ path, sha: file.sha, size: file.size! })
      }
      if (snapshot.notice) {
        const content = await this.blob(snapshot.notice)
        assertAuthorized()
        writeFileSync(join(stage, NOTICE_FILE), content, { flag: 'wx', mode: 0o644 })
      }
      assertAuthorized()
      writeFileSync(join(stage, META_FILE), `${JSON.stringify({ ...candidate.item, version: 1, files: written }, null, 2)}\n`, { flag: 'wx', mode: 0o644 })
      // 目录完整写入后才发布；下载过程不进入 SkillStore 的扫描目录，也不执行任何包内脚本。
      mkdirSync(target); published = target
      const packageRoot = join(target, 'package')
      renameSync(stage, packageRoot); stage = undefined
      const settings = this.skills.settings()
      if (!settings.directories.some(path => resolve(path) === resolve(root) || resolve(path) === resolve(this.paths.skills))) {
        originalDirectories = settings.directories
        this.skills.saveSettings({ directories: [...settings.directories, root] })
      }
      const skill = this.skills.list().find(skill => skill.path === join(packageRoot, 'SKILL.md') && skill.valid)
      if (!skill) throw new Error('已下载 Skill 无法被技能目录识别，安装已取消')
      assertAuthorized()
      this.skills.setEnabled(skill.id, true)
      return this.installed().find(item => item.id === id)!
    } catch (error) {
      if (published) rmSync(published, { recursive: true, force: true })
      if (originalDirectories) this.skills.saveSettings({ directories: originalDirectories })
      throw error
    } finally {
      if (stage) rmSync(stage, { recursive: true, force: true })
      this.installing.delete(id)
    }
  }
}
