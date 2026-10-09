import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as timers from 'node:timers/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { searchHarnessWorkspaceFiles } from '../electron/services/harnessWorkspaceSearch'
import { listHarnessWorkspaceFiles, readHarnessWorkspaceFile } from '../electron/services/harnessWorkspaceFiles'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readdir: vi.fn(actual.readdir), lstat: vi.fn(actual.lstat), link: vi.fn(actual.link) }
})
vi.mock('node:timers/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:timers/promises')>()
  return { ...actual, setImmediate: vi.fn(actual.setImmediate) }
})

const fixtures: string[] = []
async function workspace() {
  const root = await fs.mkdtemp(join(tmpdir(), 'mira-search-ignore-test-'))
  fixtures.push(root)
  return root
}
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(fixtures.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('Mira file search rule integration', () => {
  it('prunes ignored directories before reading them, without changing browse or preview access', async () => {
    const root = await workspace()
    await fs.mkdir(join(root, 'node_modules'))
    await fs.writeFile(join(root, 'node_modules', 'needle.txt'), 'dependency')
    await fs.writeFile(join(root, 'needle.txt'), 'ordinary')
    const read = vi.spyOn(fs, 'readdir')
    expect((await searchHarnessWorkspaceFiles(root, 'needle')).entries.map(entry => entry.path)).toEqual(['needle.txt'])
    expect(read.mock.calls.every(([path]) => !String(path).endsWith('/node_modules'))).toBe(true)
    expect((await listHarnessWorkspaceFiles(root, '')).entries.some(entry => entry.path === 'node_modules')).toBe(true)
    expect(await readHarnessWorkspaceFile(root, 'node_modules/needle.txt')).toEqual({ path: 'node_modules/needle.txt', content: 'dependency' })
  })

  it('uses only .miraignore after initialization and invalidates the warm cache when it is edited', async () => {
    const root = await workspace()
    for (const path of ['alpha.md', 'bravo.md']) await fs.writeFile(join(root, path), path)
    await fs.writeFile(join(root, '.gitignore'), 'alpha.md\n')
    expect((await searchHarnessWorkspaceFiles(root, '.md')).entries.map(entry => entry.path)).toEqual(['bravo.md'])
    expect((await searchHarnessWorkspaceFiles(root, 'miraignore')).entries.every(entry => entry.path !== '.miraignore')).toBe(true)
    await fs.writeFile(join(root, '.gitignore'), 'bravo.md\n')
    expect((await searchHarnessWorkspaceFiles(root, '.md')).entries.map(entry => entry.path)).toEqual(['bravo.md'])
    await fs.writeFile(join(root, '.miraignore'), 'bravo.md\n')
    expect((await searchHarnessWorkspaceFiles(root, '.md')).entries.map(entry => entry.path)).toEqual(['alpha.md'])
    await fs.writeFile(join(root, '.miraignore'), '')
    expect((await searchHarnessWorkspaceFiles(root, '.md')).entries.map(entry => entry.path)).toEqual(['alpha.md', 'bravo.md'])
    await fs.unlink(join(root, '.miraignore'))
    expect((await searchHarnessWorkspaceFiles(root, '.md')).entries.map(entry => entry.path)).toEqual(['alpha.md'])
  })

  it('rejects a warm result if the workspace alias changes after loading the rules', async () => {
    const parent = await workspace()
    const first = await workspace()
    const second = await workspace()
    await fs.writeFile(join(first, 'needle.md'), 'old root')
    await fs.writeFile(join(second, 'needle.md'), 'new root')
    const alias = join(parent, 'workspace-link')
    await fs.symlink(first, alias)
    await searchHarnessWorkspaceFiles(alias, 'needle')
    vi.mocked(timers.setImmediate).mockImplementationOnce(async () => {
      await fs.unlink(alias)
      await fs.symlink(second, alias)
    })
    await expect(searchHarnessWorkspaceFiles(alias, 'needle')).rejects.toThrow('工作目录搜索未完成')
  })

  it('rejects a warm result if the directory is replaced after loading the rules', async () => {
    const root = await workspace()
    await fs.writeFile(join(root, 'needle.md'), 'old root')
    await searchHarnessWorkspaceFiles(root, 'needle')
    const retired = root + '-retired'
    fixtures.push(retired)
    vi.mocked(timers.setImmediate).mockImplementationOnce(async () => {
      await fs.rename(root, retired)
      await fs.mkdir(root)
      await fs.writeFile(join(root, 'needle.md'), 'new root')
    })
    await expect(searchHarnessWorkspaceFiles(root, 'needle')).rejects.toThrow('工作目录搜索未完成')
  })

  it('honors nested glob, escaped literal, directory-only and git negation semantics', async () => {
    const root = await workspace()
    for (const path of ['excluded', 'allowed/deep', 'folder.cache']) await fs.mkdir(join(root, path), { recursive: true })
    for (const path of ['excluded/keep.md', 'allowed/deep/keep.md', 'allowed/deep/drop.md', '#literal.md', 'folder.cache/note.md', 'file.cache']) await fs.writeFile(join(root, path), path)
    await fs.writeFile(join(root, '.miraignore'), 'excluded/\n!excluded/keep.md\nallowed/**/drop.md\n\\#literal.md\n*.cache/\n')
    expect((await searchHarnessWorkspaceFiles(root, '.md')).entries.map(entry => entry.path)).toEqual(['allowed/deep/keep.md'])
    const matches = (await searchHarnessWorkspaceFiles(root, 'cache')).entries.map(entry => entry.path)
    expect(matches[0]).toBe('file.cache')
    expect(matches.some(path => path.startsWith('folder.cache'))).toBe(false)
  })

  it('does not let an older scan repopulate the cache after rules change', async () => {
    const root = await workspace()
    await fs.writeFile(join(root, 'needle.md'), 'Mira')
    await fs.writeFile(join(root, '.miraignore'), '')
    const original = fs.readdir
    const snapshot = await original(root, { withFileTypes: true })
    let release!: () => void
    let started!: () => void
    const scanning = new Promise<void>(resolve => { started = resolve })
    vi.spyOn(fs, 'readdir').mockImplementationOnce(() => {
      started()
      return new Promise(resolve => { release = () => resolve(snapshot) }) as ReturnType<typeof fs.readdir>
    })
    const old = searchHarnessWorkspaceFiles(root, 'needle')
    await scanning
    await fs.writeFile(join(root, '.miraignore'), 'needle.md\n')
    expect((await searchHarnessWorkspaceFiles(root, 'needle')).entries).toEqual([])
    release()
    await old
    expect((await searchHarnessWorkspaceFiles(root, 'needle')).entries).toEqual([])
  })

  it('does not initialize rules when authorization is revoked before the atomic commit', async () => {
    const root = await workspace()
    let checks = 0
    await expect(searchHarnessWorkspaceFiles(root, 'needle', false, () => {
      if (++checks === 3) throw new Error('工作目录已变化，请重新加载规则')
    })).rejects.toThrow('工作目录搜索未完成')
    expect(checks).toBe(3)
    await expect(fs.readFile(join(root, '.miraignore'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await fs.readdir(root)).some(name => name.endsWith('.tmp'))).toBe(false)
  })

  it('does not initialize rules after revocation during the awaited root checks before commit', async () => {
    const root = await workspace()
    const originalStat = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).lstat
    let checks = 0
    let authorized = true
    vi.mocked(fs.lstat).mockImplementation(async (path, options) => {
      if (checks >= 3) authorized = false
      return originalStat(path, options)
    })
    await expect(searchHarnessWorkspaceFiles(root, 'needle', false, () => {
      checks++
      if (!authorized) throw new Error('工作目录已变化，请重新加载规则')
    })).rejects.toThrow('工作目录搜索未完成')
    expect(fs.link).not.toHaveBeenCalled()
    expect(await fs.readdir(root)).toEqual([])
  })
})
