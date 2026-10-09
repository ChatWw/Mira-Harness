import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillMarketplaceService } from '../electron/services/skillMarketplace'
import { MiraPaths } from '../electron/storage/miraPaths'
import { SkillStore } from '../electron/storage/skillStore'

const homes: string[] = []
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
const APACHE = 'Apache License\nVersion 2.0, January 2004\nGrant of Copyright License\nRedistribution\nCopyright fixture contributors'
const COMMIT = 'a'.repeat(40)
const SKILL = '---\nname: Review\ndescription: Review project regressions\n---\n# Review\n\nRead the real source and report regressions.'
type Entry = { path: string; type: string; mode: string; sha: string; size: number }

function fixture(extra: Record<string, { content: string | Buffer; mode?: string; type?: string }> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'mira-market-')); homes.push(home)
  const paths = new MiraPaths(home).ensure(); const store = new SkillStore(paths)
  const sources = {
    'skills/review/SKILL.md': { content: SKILL },
    'skills/review/LICENSE.txt': { content: APACHE },
    'skills/review/scripts/check.sh': { content: '#!/bin/sh\nprintf "do not execute"\n', mode: '100755' },
    'skills/review/references/guide.md': { content: 'Supporting instructions.' },
    'THIRD_PARTY_NOTICES.md': { content: 'Third party fixture notice.' },
    'skills/restricted/SKILL.md': { content: SKILL },
    'skills/restricted/LICENSE.txt': { content: 'All rights reserved' },
    'skills/unlicensed/SKILL.md': { content: SKILL },
    ...extra,
  } as Record<string, { content: string | Buffer; mode?: string; type?: string }>
  const entries: Entry[] = []
  const contents = new Map<string, Buffer>()
  for (const [path, value] of Object.entries(sources)) {
    const content = Buffer.from(value.content)
    const sha = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
    entries.push({ path, type: value.type ?? 'blob', mode: value.mode ?? '100644', sha, size: content.length })
    contents.set(sha, content)
  }
  const request = vi.fn(async (url: string | URL | Request) => {
    const path = String(url)
    const entry = entries.find(entry => path.endsWith(`/${entry.path}`)); const content = entry && contents.get(entry.sha)
    return content ? new Response(new Uint8Array(content)) : new Response(null, { status: 404 })
  })
  const service = new SkillMarketplaceService(paths, store, request as typeof fetch, { commit: COMMIT, tree: entries })
  return { home, paths, store, service, request, entries, contents }
}

describe('public Skill marketplace', () => {
  it('downloads fixed-commit files and licenses, publishes once, and enables the existing SkillStore capability chain', async () => {
    const { paths, store, service, request } = fixture()
    const catalog = await service.browse()
    expect(catalog).toMatchObject({ commit: COMMIT, excludedCount: 2, items: [{ id: 'anthropic-skills:review', installed: false, license: 'Apache-2.0' }] })
    const detail = await service.detail('anthropic-skills:review')
    expect(detail.instructions).toBe(SKILL)
    expect(detail.licenseText).toBe(APACHE)
    expect(detail.files.map(file => file.path)).toEqual(['SKILL.md', 'LICENSE.txt', 'scripts/check.sh', 'references/guide.md'])
    const result = await service.install('anthropic-skills:review')
    expect(result).toMatchObject({ installed: true, enabled: true, name: 'Review' })
    const packageRoot = join(paths.skills, 'marketplace', 'anthropic-review', 'package')
    expect(readFileSync(join(packageRoot, 'SKILL.md'), 'utf8')).toBe(SKILL)
    expect(readFileSync(join(packageRoot, 'LICENSE.txt'), 'utf8')).toBe(APACHE)
    expect(readFileSync(join(packageRoot, 'UPSTREAM_THIRD_PARTY_NOTICES.md'), 'utf8')).toContain('fixture notice')
    expect(readFileSync(join(packageRoot, 'references', 'guide.md'), 'utf8')).toBe('Supporting instructions.')
    expect(lstatSync(join(packageRoot, 'scripts', 'check.sh')).mode & 0o111).toBe(0)
    const meta = JSON.parse(readFileSync(join(packageRoot, 'MIRA_MARKETPLACE_SOURCE.json'), 'utf8'))
    expect(meta).toMatchObject({ version: 1, commit: COMMIT, sourceId: 'anthropic-skills' })
    expect(store.resolve([result.skillId!]).map(skill => skill.name)).toEqual(['Review'])
    expect((await service.browse()).items[0]).toMatchObject({ installed: true, enabled: true, skillId: result.skillId })
    expect(new SkillMarketplaceService(paths, new SkillStore(paths)).installed()).toMatchObject([{ id: result.id, enabled: true }])
    expect(request.mock.calls.every(([url]) => String(url).startsWith(`https://raw.githubusercontent.com/anthropics/skills/${COMMIT}/`))).toBe(true)
    await expect(service.install(result.id)).rejects.toThrow('不会覆盖')
    expect(readFileSync(join(packageRoot, 'SKILL.md'), 'utf8')).toBe(SKILL)
  })

  it('keeps custom skill directories and adds only the managed root for discovery', async () => {
    const { paths, store, service } = fixture()
    const custom = join(paths.root, 'custom'); mkdirSync(custom)
    store.saveSettings({ directories: [custom] })
    const result = await service.install('anthropic-skills:review')
    expect(store.settings().directories).toEqual([custom, join(paths.skills, 'marketplace')])
    expect(store.resolve([result.skillId!])).toHaveLength(1)
  })

  it.each(['anthropic-skills:../review', 'https://example.com/skill', 'anthropic-skills:restricted', 'anthropic-skills:unlicensed'])('rejects arbitrary sources and non-distributable packages: %s', async id => {
    const { paths, service } = fixture()
    await expect(service.install(id)).rejects.toThrow()
    expect(existsSync(join(paths.skills, 'marketplace', 'anthropic-review'))).toBe(false)
  })

  it.each([
    ['skills/review/../escape.md', { content: 'escape' }],
    ['skills/review/link.md', { content: '/private/file', mode: '120000' }],
    ['skills/review/submodule', { content: 'link', mode: '160000', type: 'commit' }],
    ['skills/review/CON.txt', { content: 'Windows reserved' }],
    ['skills/review/skill.md', { content: 'case collision' }],
    ['skills/review/too-big.bin', { content: Buffer.alloc(4 * 1024 * 1024 + 1) }],
  ] as const)('excludes unsafe directories before any installation: %s', async (path, value) => {
    const { service } = fixture({ [path]: value })
    expect((await service.browse()).items).toEqual([])
    await expect(service.install('anthropic-skills:review')).rejects.toThrow('不符合安装许可')
  })

  it('fails an incomplete download atomically and retries without a broken published skill', async () => {
    const { paths, store, service, contents, entries } = fixture()
    await service.browse()
    const script = entries.find(entry => entry.path.endsWith('check.sh'))!
    const original = contents.get(script.sha)!; contents.set(script.sha, Buffer.from('tampered'))
    await expect(service.install('anthropic-skills:review')).rejects.toThrow('完整性')
    expect(store.list()).toEqual([])
    expect(readdirSync(join(paths.skills, 'marketplace'))).toEqual([])
    expect(readdirSync(paths.config).filter(name => name.startsWith('.market-skill-'))).toEqual([])
    contents.set(script.sha, original)
    await expect(service.install('anthropic-skills:review')).resolves.toMatchObject({ enabled: true })
  })

  it('rolls back the published package and directory preference when enabling fails', async () => {
    const { paths, store, service } = fixture()
    const custom = join(paths.root, 'custom'); mkdirSync(custom); store.saveSettings({ directories: [custom] })
    vi.spyOn(store, 'setEnabled').mockImplementationOnce(() => { throw new Error('保存启用状态失败') })
    await expect(service.install('anthropic-skills:review')).rejects.toThrow('保存启用状态失败')
    expect(store.settings().directories).toEqual([custom])
    expect(readdirSync(join(paths.skills, 'marketplace'))).toEqual([])
  })

  it('never follows an existing managed directory symlink or overwrites user files', async () => {
    const { paths, service } = fixture()
    const outside = join(paths.root, 'outside'); mkdirSync(outside)
    symlinkSync(outside, join(paths.skills, 'marketplace'))
    await expect(service.install('anthropic-skills:review')).rejects.toThrow('安装目录不可用')
    expect(readdirSync(outside)).toEqual([])
  })

  it('leaves an existing user directory and file untouched', async () => {
    const { paths, service } = fixture()
    const existing = join(paths.skills, 'marketplace', 'anthropic-review'); mkdirSync(existing, { recursive: true })
    writeFileSync(join(existing, 'notes.txt'), 'User-owned file')
    await expect(service.install('anthropic-skills:review')).rejects.toThrow('不会覆盖')
    expect(readFileSync(join(existing, 'notes.txt'), 'utf8')).toBe('User-owned file')
    expect(readdirSync(existing)).toEqual(['notes.txt'])
  })

  it('times out the network request without publishing a directory', async () => {
    const { paths, service, request } = fixture()
    vi.useFakeTimers()
    request.mockImplementationOnce((_url, options?: RequestInit) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    try {
      const failure = service.install('anthropic-skills:review').catch(error => error)
      await vi.advanceTimersByTimeAsync(20_001)
      expect(await failure).toMatchObject({ message: 'Skill 市场读取超时，请检查网络后重试' })
      expect(existsSync(join(paths.skills, 'marketplace'))).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it('retains a previous catalog but reports an explicit refresh rate-limit error', async () => {
    const { service, request } = fixture()
    await service.browse()
    request.mockImplementationOnce(async () => new Response(null, { status: 429 }))
    await expect(service.browse(true)).rejects.toThrow('额度')
    expect((await service.browse()).items).toHaveLength(1)
  })

  it('rejects tampered public instruction bytes instead of displaying a partial catalog', async () => {
    const { service, request } = fixture()
    request.mockImplementationOnce(async () => new Response('tampered'))
    await expect(service.browse()).rejects.toThrow('完整性')
  })

  it('shares simultaneous catalog requests and bounds duplicate installs', async () => {
    const { service, request } = fixture()
    const [a, b] = await Promise.all([service.browse(), service.browse()])
    expect(a).toEqual(b)
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/skills/review/SKILL.md'))).toHaveLength(1)
    const first = service.install('anthropic-skills:review')
    await expect(service.install('anthropic-skills:review')).rejects.toThrow('正在安装')
    await first
  })

  it('does not publish or enable a package after authorization is revoked during download', async () => {
    const { paths, store, service } = fixture()
    await service.browse()
    let checks = 0
    const authorize = () => { if (++checks > 2) throw new Error('应用授权已撤销') }
    await expect(service.install('anthropic-skills:review', authorize)).rejects.toThrow('应用授权已撤销')
    expect(store.list()).toEqual([])
    expect(readdirSync(join(paths.skills, 'marketplace'))).toEqual([])
    expect(readdirSync(paths.config).filter(name => name.startsWith('.market-skill-'))).toEqual([])
  })

  it('reports the current disabled state from the existing SkillStore after installation', async () => {
    const { store, service } = fixture()
    const installed = await service.install('anthropic-skills:review')
    store.setEnabled(installed.skillId!, false)
    expect(service.installed()[0]).toMatchObject({ installed: true, enabled: false })
    expect((await service.browse()).items[0]).toMatchObject({ installed: true, enabled: false })
    expect(store.resolve([installed.skillId!])).toEqual([])
  })
})
