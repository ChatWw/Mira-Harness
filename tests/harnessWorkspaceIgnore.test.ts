import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadHarnessWorkspaceSearchIgnore,
  readHarnessWorkspaceSearchIgnore,
  transformHarnessWorkspaceSearchIgnore,
  writeHarnessWorkspaceSearchIgnore,
} from '../electron/services/harnessWorkspaceIgnore'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, open: vi.fn(actual.open), link: vi.fn(actual.link), rename: vi.fn(actual.rename), lstat: vi.fn(actual.lstat) }
})

const roots: string[] = []
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'mira-workspace-ignore-'))
  roots.push(root)
  return root
}
const seedMarker = '# === Mira: end of .gitignore seed ==='
const defaultMarker = '# === Mira: end of default search exclusions ==='

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Harness workspace search ignore rules', () => {
  it('previews a partitioned template without writing and conservatively deduplicates defaults', async () => {
    const root = await workspace()
    await writeFile(join(root, '.gitignore'), 'node_modules\n!venv/\n/build/\n')
    const preview = await readHarnessWorkspaceSearchIgnore(root)
    expect(preview.source).toBe('template')
    expect(preview.revision).toBeTruthy()
    expect(preview.content).toContain('node_modules\n!venv/\n/build/\n' + seedMarker)
    expect(preview.content).not.toContain('\nnode_modules/\n')
    expect(preview.content).toContain('\nvenv/\n')
    expect(preview.content).toContain(defaultMarker)
    expect(await readdir(root)).toEqual(['.gitignore'])
    expect(await readHarnessWorkspaceSearchIgnore(root)).toEqual(preview)
  })

  it('safely initializes once during concurrent searches and returns the persisted fingerprint', async () => {
    const root = await workspace()
    await writeFile(join(root, '.gitignore'), 'build/\n')
    const loaded = await Promise.all(Array.from({ length: 6 }, () => loadHarnessWorkspaceSearchIgnore(root)))
    expect(new Set(loaded.map(result => result.fingerprint)).size).toBe(1)
    expect(loaded[0].matcher.ignores('build/')).toBe(true)
    expect(loaded[0].matcher.ignores('node_modules/')).toBe(true)
    const persisted = await readHarnessWorkspaceSearchIgnore(root)
    expect(persisted.source).toBe('file')
    expect(persisted.revision).toBe(loaded[0].fingerprint)
    expect((await readdir(root)).sort()).toEqual(['.gitignore', '.miraignore'])
  })

  it('never overwrites rules created by another process during initialization', async () => {
    const root = await workspace()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.link).mockImplementationOnce(async (source, destination) => {
      await writeFile(destination, 'external/\n')
      return actual.link(source, destination)
    })
    const loaded = await loadHarnessWorkspaceSearchIgnore(root)
    expect(await readFile(join(root, '.miraignore'), 'utf8')).toBe('external/\n')
    expect(loaded.matcher.ignores('external/')).toBe(true)
    expect(loaded.matcher.ignores('node_modules/')).toBe(false)
    expect(await readdir(root)).toEqual(['.miraignore'])
  })

  it('treats an existing empty .miraignore as the sole source without hidden defaults', async () => {
    const root = await workspace()
    await writeFile(join(root, '.miraignore'), '')
    await writeFile(join(root, '.gitignore'), 'private/\n')
    const initial = await loadHarnessWorkspaceSearchIgnore(root)
    expect(initial.matcher.ignores('private/')).toBe(false)
    expect(initial.matcher.ignores('node_modules/')).toBe(false)
    await writeFile(join(root, '.gitignore'), 'different/\n')
    expect((await loadHarnessWorkspaceSearchIgnore(root)).fingerprint).toBe(initial.fingerprint)
    expect((await readHarnessWorkspaceSearchIgnore(root)).content).toBe('')
  })

  it('uses mature gitignore semantics including parent pruning, anchoring, escaping and directory-only rules', async () => {
    const root = await workspace()
    await writeFile(join(root, '.miraignore'), '/root.txt\n**/cache/\nblocked/\n!blocked/keep.txt\n*.tmp\n!important.tmp\n\\#note\n[ab].log\n.git/\n')
    const { matcher } = await loadHarnessWorkspaceSearchIgnore(root)
    for (const path of ['root.txt', 'src/cache/', 'src/cache/child.txt', 'blocked/keep.txt', 'ordinary.tmp', '#note', 'a.log', '.git/']) expect(matcher.ignores(path), path).toBe(true)
    for (const path of ['src/root.txt', 'important.tmp', 'c.log', '.git']) expect(matcher.ignores(path), path).toBe(false)
  })

  it.each(['EACCES', 'EPERM', 'EROFS'])('degrades first-search creation %s to the full in-memory template', async code => {
    const root = await workspace()
    await writeFile(join(root, '.gitignore'), 'secret/\n')
    vi.mocked(fs.link).mockRejectedValueOnce(Object.assign(new Error('private filesystem detail'), { code }))
    const result = await loadHarnessWorkspaceSearchIgnore(root)
    expect(result.matcher.ignores('secret/')).toBe(true)
    expect(result.matcher.ignores('node_modules/')).toBe(true)
    expect(result.fingerprint).toContain('|memory|')
    expect(await readdir(root)).toEqual(['.gitignore'])
  })

  it('degrades unreadable existing rules without overwriting them', async () => {
    const root = await workspace()
    await writeFile(join(root, '.miraignore'), 'original/\n')
    await writeFile(join(root, '.gitignore'), 'seed/\n')
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags, mode) => {
      if (typeof path === 'string' && path.endsWith('/.miraignore')) throw Object.assign(new Error('private permission detail'), { code: 'EACCES' })
      return actual.open(path, flags, mode)
    })
    const result = await loadHarnessWorkspaceSearchIgnore(root)
    expect(result.matcher.ignores('seed/')).toBe(true)
    expect(result.matcher.ignores('node_modules/')).toBe(true)
    expect(await readFile(join(root, '.miraignore'), 'utf8')).toBe('original/\n')
  })

  it.each(['.miraignore', '.gitignore'] as const)('rejects internal and external symlink rule files: %s', async name => {
    const root = await workspace()
    const outside = await workspace()
    await writeFile(join(outside, 'rules'), 'secret/\n')
    await symlink(join(outside, 'rules'), join(root, name))
    await expect(readHarnessWorkspaceSearchIgnore(root)).rejects.toThrow('不能是链接或特殊文件')
    await expect(loadHarnessWorkspaceSearchIgnore(root)).rejects.toThrow('不能是链接或特殊文件')
    await fs.unlink(join(root, name))
    await writeFile(join(root, 'rules'), 'internal/\n')
    await symlink(join(root, 'rules'), join(root, name))
    await expect(loadHarnessWorkspaceSearchIgnore(root)).rejects.toThrow('不能是链接或特殊文件')
    expect(await readFile(join(outside, 'rules'), 'utf8')).toBe('secret/\n')
  })

  it('rejects non-regular, oversized, binary and invalid UTF-8 rules without fallback', async () => {
    const root = await workspace()
    const path = join(root, '.miraignore')
    await mkdir(path)
    await expect(loadHarnessWorkspaceSearchIgnore(root)).rejects.toThrow('不能是链接或特殊文件')
    await rm(path, { recursive: true })
    await writeFile(path, '#'.repeat(256 * 1024 + 1))
    await expect(loadHarnessWorkspaceSearchIgnore(root)).rejects.toThrow('256 KiB')
    for (const content of [Buffer.from([0]), Buffer.from([0xc3, 0x28])]) {
      await writeFile(path, content)
      await expect(readHarnessWorkspaceSearchIgnore(root)).rejects.toThrow('UTF-8')
    }
  })

  it('accepts the byte limit and preserves UTF-8 BOM while rejecting invalid save payloads', async () => {
    const root = await workspace()
    const content = '\uFEFF#' + 'x'.repeat(256 * 1024 - 4)
    await writeFile(join(root, '.miraignore'), content)
    const current = await readHarnessWorkspaceSearchIgnore(root)
    expect(current.content).toBe(content)
    expect((await writeHarnessWorkspaceSearchIgnore(root, content, current.revision)).content).toBe(content)
    await expect(writeHarnessWorkspaceSearchIgnore(root, 'é'.repeat(256 * 1024), current.revision)).rejects.toThrow('256 KiB')
    await expect(writeHarnessWorkspaceSearchIgnore(root, '\ud800', current.revision)).rejects.toThrow('UTF-8')
    await expect(writeHarnessWorkspaceSearchIgnore(root, '\0', current.revision)).rejects.toThrow('UTF-8')
  })

  it('detects rules that change between stat and open instead of reading an unbounded payload', async () => {
    const root = await workspace()
    const path = join(root, '.miraignore')
    await writeFile(path, 'old/\n')
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.open).mockImplementationOnce(async (openedPath, flags, mode) => {
      const handle = await actual.open(openedPath, flags, mode)
      await writeFile(path, 'new rules grew/\n')
      return handle
    })
    await expect(readHarnessWorkspaceSearchIgnore(root)).rejects.toThrow('操作期间发生变化')
  })

  it('syncs only the seed and resets only defaults while preserving unsaved custom bytes', async () => {
    const root = await workspace()
    const preview = await readHarnessWorkspaceSearchIgnore(root)
    const custom = '# 未保存的自定义规则\r\nprivate/\r\n!private/keep.txt\r\n\r\n'
    const draft = 'old-seed/\r\n' + seedMarker + '\r\n# edited defaults\r\nmanual-default/\r\n' + defaultMarker + '\r\n' + custom
    await writeFile(join(root, '.gitignore'), 'new-seed/\n')
    const synced = (await transformHarnessWorkspaceSearchIgnore(root, draft, 'sync-gitignore')).content
    expect(synced).toBe('new-seed/\n' + draft.slice(draft.indexOf(seedMarker)))
    const reset = (await transformHarnessWorkspaceSearchIgnore(root, synced, 'reset-defaults')).content
    expect(reset).toContain('new-seed/\n' + seedMarker + '\r\n.git/\n')
    expect(reset).not.toContain('manual-default/')
    expect(reset.endsWith(defaultMarker + '\r\n' + custom)).toBe(true)
    expect(await readdir(root)).toEqual(['.gitignore'])
    expect(preview.source).toBe('template')
  })

  it.each(['custom/\n', defaultMarker + '\n' + seedMarker, seedMarker + '\n' + seedMarker + '\n' + defaultMarker])('refuses broken partitions without discarding custom rules', async draft => {
    const root = await workspace()
    for (const transform of ['sync-gitignore', 'reset-defaults'] as const) await expect(transformHarnessWorkspaceSearchIgnore(root, draft, transform)).rejects.toThrow('分区标记缺失或重复')
    expect(await readdir(root)).toEqual([])
  })

  it('atomically saves a missing template and refuses empty or stale revisions', async () => {
    const root = await workspace()
    const preview = await readHarnessWorkspaceSearchIgnore(root)
    await expect(writeHarnessWorkspaceSearchIgnore(root, 'custom/\n', '')).rejects.toThrow('已被修改')
    const saved = await writeHarnessWorkspaceSearchIgnore(root, 'custom/\n', preview.revision)
    expect(saved.source).toBe('file')
    expect(saved.content).toBe('custom/\n')
    expect(saved.revision).not.toBe(preview.revision)
    await expect(writeHarnessWorkspaceSearchIgnore(root, 'stale/\n', preview.revision)).rejects.toThrow('已被修改')
    expect(await readdir(root)).toEqual(['.miraignore'])
  })

  it('detects external file edits and fingerprints same-sized new content', async () => {
    const root = await workspace()
    const path = join(root, '.miraignore')
    await writeFile(path, 'first/\n')
    const initial = await readHarnessWorkspaceSearchIgnore(root)
    await writeFile(path, 'other/\n')
    const changed = await loadHarnessWorkspaceSearchIgnore(root)
    expect(changed.fingerprint).not.toBe(initial.revision)
    await expect(writeHarnessWorkspaceSearchIgnore(root, 'stale/\n', initial.revision)).rejects.toThrow('已被修改')
    expect(await readFile(path, 'utf8')).toBe('other/\n')
  })

  it('keeps private file permissions when atomically replacing existing rules', async () => {
    const root = await workspace()
    const path = join(root, '.miraignore')
    await writeFile(path, 'original/\n', { mode: 0o600 })
    const current = await readHarnessWorkspaceSearchIgnore(root)
    await writeHarnessWorkspaceSearchIgnore(root, 'replacement/\n', current.revision)
    expect((await fs.stat(path)).mode & 0o777).toBe(0o600)
  })

  it('keeps the old rules and removes its temporary file after a failed atomic commit', async () => {
    const root = await workspace()
    const path = join(root, '.miraignore')
    await writeFile(path, 'original/\n')
    const current = await readHarnessWorkspaceSearchIgnore(root)
    vi.mocked(fs.rename).mockRejectedValueOnce(Object.assign(new Error('private rename EIO detail'), { code: 'EIO' }))
    await expect(writeHarnessWorkspaceSearchIgnore(root, 'replacement/\n', current.revision)).rejects.toThrow('操作失败')
    expect(await readFile(path, 'utf8')).toBe('original/\n')
    expect(await readdir(root)).toEqual(['.miraignore'])
  })

  it('detects an external edit while the temporary replacement is being prepared', async () => {
    const root = await workspace()
    const path = join(root, '.miraignore')
    await writeFile(path, 'original/\n')
    const current = await readHarnessWorkspaceSearchIgnore(root)
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.open).mockImplementation(async (openedPath, flags, mode) => {
      const handle = await actual.open(openedPath, flags, mode)
      if (typeof openedPath === 'string' && openedPath.endsWith('.tmp')) await writeFile(path, 'external/\n')
      return handle
    })
    await expect(writeHarnessWorkspaceSearchIgnore(root, 'replacement/\n', current.revision)).rejects.toThrow('已被修改')
    expect(await readFile(path, 'utf8')).toBe('external/\n')
    expect(await readdir(root)).toEqual(['.miraignore'])
  })

  it('serializes concurrent saves so only one can commit the same expected revision', async () => {
    const root = await workspace()
    await writeFile(join(root, '.miraignore'), 'original/\n')
    const initial = await readHarnessWorkspaceSearchIgnore(root)
    const results = await Promise.allSettled([
      writeHarnessWorkspaceSearchIgnore(root, 'first/\n', initial.revision),
      writeHarnessWorkspaceSearchIgnore(root, 'second/\n', initial.revision),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected?.status === 'rejected' && rejected.reason.message).toContain('已被修改')
    expect(await readFile(join(root, '.miraignore'), 'utf8')).toBe('first/\n')
  })

  it('rechecks authorization immediately before commit and cleans a denied temporary save', async () => {
    const root = await workspace()
    await writeFile(join(root, '.miraignore'), 'original/\n')
    const current = await readHarnessWorkspaceSearchIgnore(root)
    let checks = 0
    const authorize = () => { if (++checks === 2) throw new Error('工作目录已变化，请重新加载规则') }
    await expect(writeHarnessWorkspaceSearchIgnore(root, 'replacement/\n', current.revision, authorize)).rejects.toThrow('工作目录已变化，请重新加载规则')
    expect(checks).toBe(2)
    expect(await readFile(join(root, '.miraignore'), 'utf8')).toBe('original/\n')
    expect(await readdir(root)).toEqual(['.miraignore'])
  })

  it('rejects revocation during awaited commit checks before replacing the rules file', async () => {
    const root = await workspace()
    await writeFile(join(root, '.miraignore'), 'original/\n')
    const current = await readHarnessWorkspaceSearchIgnore(root)
    const originalStat = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).lstat
    let checks = 0
    let authorized = true
    vi.mocked(fs.lstat).mockImplementation(async (path, options) => {
      if (checks >= 2) authorized = false
      return originalStat(path, options)
    })
    await expect(writeHarnessWorkspaceSearchIgnore(root, 'replacement/\n', current.revision, () => {
      checks++
      if (!authorized) throw new Error('工作目录已变化，请重新加载规则')
    })).rejects.toThrow('工作目录已变化，请重新加载规则')
    expect(await readFile(join(root, '.miraignore'), 'utf8')).toBe('original/\n')
    expect((await readdir(root)).some(name => name.endsWith('.tmp'))).toBe(false)
  })

  it.each(['template-save', 'first-search'] as const)('does not create rules after revocation during awaited initialization checks: %s', async operation => {
    const root = await workspace()
    const current = await readHarnessWorkspaceSearchIgnore(root)
    const originalStat = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).lstat
    let checks = 0
    let authorized = true
    vi.mocked(fs.lstat).mockImplementation(async (path, options) => {
      if (checks >= 2) authorized = false
      return originalStat(path, options)
    })
    const authorize = () => {
      checks++
      if (!authorized) throw new Error('工作目录已变化，请重新加载规则')
    }
    const action = operation === 'template-save'
      ? writeHarnessWorkspaceSearchIgnore(root, 'replacement/\n', current.revision, authorize)
      : loadHarnessWorkspaceSearchIgnore(root, authorize)
    await expect(action).rejects.toThrow('工作目录已变化，请重新加载规则')
    expect(fs.link).not.toHaveBeenCalled()
    expect(await readdir(root)).toEqual([])
  })

  it('binds even a template revision to the root identity', async () => {
    const container = await workspace()
    const root = join(container, 'project')
    await mkdir(root)
    const initial = await readHarnessWorkspaceSearchIgnore(root)
    await rename(root, join(container, 'previous'))
    await mkdir(root)
    await expect(writeHarnessWorkspaceSearchIgnore(root, 'replacement/\n', initial.revision)).rejects.toThrow('已被修改')
    expect(await readdir(root)).toEqual([])
  })

  it('rejects a switched root during a save without changing either rules file', async () => {
    const container = await workspace()
    const root = join(container, 'project')
    const previous = join(container, 'previous')
    await mkdir(root)
    await writeFile(join(root, '.miraignore'), 'original/\n')
    const current = await readHarnessWorkspaceSearchIgnore(root)
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags, mode) => actual.open(path, flags, mode))
    const openMock = vi.mocked(fs.open)
    openMock.mockImplementation(async (path, flags, mode) => {
      const handle = await actual.open(path, flags, mode)
      if (typeof path === 'string' && path.endsWith('.tmp')) {
        await actual.rename(root, previous)
        await mkdir(root)
        await writeFile(join(root, '.miraignore'), 'new-root/\n')
      }
      return handle
    })
    await expect(writeHarnessWorkspaceSearchIgnore(root, 'replacement/\n', current.revision)).rejects.toThrow('工作目录在操作期间发生变化')
    expect(await readFile(join(previous, '.miraignore'), 'utf8')).toBe('original/\n')
    expect(await readFile(join(root, '.miraignore'), 'utf8')).toBe('new-root/\n')
  })

  it('reports safe errors without leaking filesystem details', async () => {
    const root = await workspace()
    await writeFile(join(root, '.miraignore'), '')
    vi.mocked(fs.open).mockRejectedValueOnce(Object.assign(new Error('/private/root/secret EIO details'), { code: 'EIO' }))
    await expect(readHarnessWorkspaceSearchIgnore(root)).rejects.toThrow('忽略规则操作失败，请重试')
    await expect(readHarnessWorkspaceSearchIgnore(join(root, 'missing'))).rejects.toThrow('工作目录无效')
    await expect(transformHarnessWorkspaceSearchIgnore(root, '', 'bad' as never)).rejects.toThrow('变换无效')
  })
})
