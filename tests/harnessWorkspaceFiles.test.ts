import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as timers from 'node:timers/promises'
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { listHarnessWorkspaceFiles, readHarnessWorkspaceFile, readHarnessWorkspaceImage, searchHarnessWorkspaceFiles } from '../electron/services/harnessWorkspaceFiles'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readdir: vi.fn(actual.readdir), readFile: vi.fn(actual.readFile), realpath: vi.fn(actual.realpath), lstat: vi.fn(actual.lstat), access: vi.fn(actual.access), open: vi.fn(actual.open) }
})

vi.mock('node:timers/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:timers/promises')>()
  return { ...actual, setImmediate: vi.fn(actual.setImmediate) }
})

const roots: string[] = []
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'mira-workspace-files-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Harness workspace files', () => {
  it('lists a directory and reads only its regular text files', async () => {
    const root = await workspace()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'note.md'), '# Mira\n')
    const listing = await listHarnessWorkspaceFiles(root, '')
    expect(listing.entries).toEqual([{ name: 'src', path: 'src', type: 'directory' }])
    expect((await listHarnessWorkspaceFiles(root, 'src')).entries).toEqual([{ name: 'note.md', path: 'src/note.md', type: 'file' }])
    expect(await readHarnessWorkspaceFile(root, 'src/note.md')).toEqual({ path: 'src/note.md', content: '# Mira\n' })
  })

  it('rejects traversal, absolute paths and links outside the workspace', async () => {
    const root = await workspace()
    const outside = await workspace()
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(outside, join(root, 'external'))
    await expect(listHarnessWorkspaceFiles(root, '../')).rejects.toThrow('路径无效')
    await expect(readHarnessWorkspaceFile(root, '/etc/passwd')).rejects.toThrow('路径无效')
    await expect(readHarnessWorkspaceFile(root, 'external/secret.txt')).rejects.toThrow('工作目录')
    expect((await listHarnessWorkspaceFiles(root, '')).entries).toEqual([])
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('secret')
  })

  it('refuses binary and oversized files', async () => {
    const root = await workspace()
    await writeFile(join(root, 'binary.dat'), Buffer.from([0, 1, 2]))
    await writeFile(join(root, 'large.txt'), 'x'.repeat(1_000_001))
    await expect(readHarnessWorkspaceFile(root, 'binary.dat')).rejects.toThrow('二进制')
    await expect(readHarnessWorkspaceFile(root, 'large.txt')).rejects.toThrow('过大')
  })

  it('includes dotfiles and hidden directories without recursively loading children', async () => {
    const root = await workspace()
    await mkdir(join(root, '.git'))
    await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    await mkdir(join(root, '.github'))
    await writeFile(join(root, '.github', 'workflow.yml'), 'name: Mira')
    await writeFile(join(root, '.gitignore'), 'node_modules\n')
    expect((await listHarnessWorkspaceFiles(root, '')).entries).toEqual([
      { name: '.git', path: '.git', type: 'directory' },
      { name: '.github', path: '.github', type: 'directory' },
      { name: '.gitignore', path: '.gitignore', type: 'file' },
    ])
    expect(await readHarnessWorkspaceFile(root, '.gitignore')).toEqual({ path: '.gitignore', content: 'node_modules\n' })
  })

  it('keeps a linked-worktree gitfile visible without resolving its metadata pointer', async () => {
    const root = await workspace()
    const content = 'gitdir: /outside/worktree-metadata\n'
    await writeFile(join(root, '.git'), content)
    expect((await listHarnessWorkspaceFiles(root, '')).entries).toEqual([{ name: '.git', path: '.git', type: 'file' }])
    expect(await readHarnessWorkspaceFile(root, '.git')).toEqual({ path: '.git', content })
  })

  it('reads internal file links and lists internal directory links without exposing broken links', async () => {
    const root = await workspace()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'note.md'), 'Mira')
    await symlink(join(root, 'src', 'note.md'), join(root, 'note-link.md'))
    await symlink(join(root, 'src'), join(root, 'src-link'))
    await symlink(join(root, 'missing.md'), join(root, 'broken.md'))
    expect((await listHarnessWorkspaceFiles(root, '')).entries).toEqual([
      { name: 'src', path: 'src', type: 'directory' },
      { name: 'src-link', path: 'src-link', type: 'directory' },
      { name: 'note-link.md', path: 'note-link.md', type: 'file' },
    ])
    expect(await readHarnessWorkspaceFile(root, 'note-link.md')).toEqual({ path: 'note-link.md', content: 'Mira' })
    expect((await listHarnessWorkspaceFiles(root, 'src-link')).entries).toEqual([{ name: 'note.md', path: 'src-link/note.md', type: 'file' }])
  })

  it.each(['list', 'read'] as const)('reports a safe missing-path error for %s at missing roots and children', async method => {
    const root = await workspace()
    const operation = method === 'list' ? listHarnessWorkspaceFiles : readHarnessWorkspaceFile
    await expect(operation(join(root, 'removed'), 'note.md')).rejects.toThrow('文件或目录不存在')
    await expect(operation(root, 'removed')).rejects.toThrow('文件或目录不存在')
  })

  it('distinguishes file and directory requests', async () => {
    const root = await workspace()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'note.md'), 'Mira')
    await expect(listHarnessWorkspaceFiles(root, 'note.md')).rejects.toThrow('目标不是目录')
    await expect(readHarnessWorkspaceFile(root, 'src')).rejects.toThrow('目标不是文件')
  })

  it.each(['EACCES', 'EPERM'].flatMap(code => ['list', 'read'].map(method => ({ code, method }))))('maps $code from $method to a stable permission message', async ({ code, method }) => {
    const root = await workspace()
    await writeFile(join(root, 'note.md'), 'Mira')
    const error = Object.assign(new Error('private filesystem detail'), { code })
    if (method === 'list') {
      vi.spyOn(fs, 'readdir').mockRejectedValueOnce(error)
      await expect(listHarnessWorkspaceFiles(root, '')).rejects.toThrow('没有权限读取文件或目录')
    } else {
      vi.spyOn(fs, 'readFile').mockRejectedValueOnce(error)
      await expect(readHarnessWorkspaceFile(root, 'note.md')).rejects.toThrow('没有权限读取文件或目录')
    }
  })

  it('keeps unknown filesystem errors unknown instead of labelling them missing', async () => {
    const root = await workspace()
    const failure = Object.assign(new Error('private I/O detail'), { code: 'EIO' })
    vi.spyOn(fs, 'realpath').mockRejectedValueOnce(failure)
    await expect(readHarnessWorkspaceFile(root, 'note.md')).rejects.toBe(failure)
  })

  it('accepts the preview limit and empty text while rejecting content that grew after stat', async () => {
    const root = await workspace()
    await writeFile(join(root, 'empty.md'), '')
    await writeFile(join(root, 'limit.md'), 'x'.repeat(1_000_000))
    expect(await readHarnessWorkspaceFile(root, 'empty.md')).toEqual({ path: 'empty.md', content: '' })
    expect((await readHarnessWorkspaceFile(root, 'limit.md')).content).toHaveLength(1_000_000)
    vi.spyOn(fs, 'readFile').mockResolvedValueOnce(Buffer.alloc(1_000_001, 65))
    await expect(readHarnessWorkspaceFile(root, 'empty.md')).rejects.toThrow('文件过大')
  })
})

describe('Harness workspace image preview', () => {
  const limit = 4 * 1024 * 1024
  const mediaTypes = { apng: 'image/apng', avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif', ico: 'image/x-icon', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

  beforeEach(() => {
    vi.spyOn(fs, 'open')
    vi.spyOn(fs, 'readFile')
  })

  it.each(Object.entries(mediaTypes))('returns bounded base64 with a host-selected MIME for %s', async (extension, mediaType) => {
    const root = await workspace()
    const content = Buffer.from([0, 1, 2, 254, 255])
    const path = `image.${extension.toUpperCase()}`
    await writeFile(join(root, path), content)
    vi.mocked(fs.readFile).mockClear()
    expect(await readHarnessWorkspaceImage(root, path)).toEqual({ path, mediaType, dataBase64: content.toString('base64'), byteLength: content.byteLength })
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('keeps SVG and non-image files on the text path', async () => {
    const root = await workspace()
    for (const path of ['image.svg', 'image.html', 'image.bin']) {
      await writeFile(join(root, path), '<svg/>')
      await expect(readHarnessWorkspaceImage(root, path)).rejects.toThrow('图片格式暂不支持预览')
    }
    expect(await readHarnessWorkspaceFile(root, 'image.svg')).toEqual({ path: 'image.svg', content: '<svg/>' })
  })

  it('rejects absolute, URL, traversal, NUL and external-link requests', async () => {
    const root = await workspace()
    const outside = await workspace()
    await writeFile(join(outside, 'private.png'), 'secret')
    await symlink(join(outside, 'private.png'), join(root, 'external.png'))
    for (const path of ['/private/image.png', 'C:/private/image.png', 'https://example.com/image.png', '../private.png', 'a/../private.png', 'a\\private.png', 'a\0.png']) {
      await expect(readHarnessWorkspaceImage(root, path)).rejects.toThrow('路径无效')
    }
    await expect(readHarnessWorkspaceImage(root, 'external.png')).rejects.toThrow('路径不能离开工作目录')
  })

  it('reads an internal link while returning the requested relative identity', async () => {
    const root = await workspace()
    await writeFile(join(root, 'actual.png'), 'image')
    await symlink(join(root, 'actual.png'), join(root, 'linked.png'))
    expect(await readHarnessWorkspaceImage(root, 'linked.png')).toMatchObject({ path: 'linked.png', dataBase64: Buffer.from('image').toString('base64') })
  })

  it('accepts exactly 4 MiB and refuses oversized images before opening them', async () => {
    const root = await workspace()
    await writeFile(join(root, 'limit.png'), Buffer.alloc(limit, 1))
    await writeFile(join(root, 'oversized.png'), Buffer.alloc(limit + 1, 1))
    expect((await readHarnessWorkspaceImage(root, 'limit.png')).byteLength).toBe(limit)
    vi.mocked(fs.open).mockClear()
    await expect(readHarnessWorkspaceImage(root, 'oversized.png')).rejects.toThrow('图片文件超过 4 MiB 预览限制')
    expect(fs.open).not.toHaveBeenCalled()
  })

  it('rejects a file identity changed between checking the path and opening it, and closes the handle', async () => {
    const root = await workspace()
    await writeFile(join(root, 'image.png'), 'old')
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let close!: ReturnType<typeof vi.spyOn>
    let read!: ReturnType<typeof vi.spyOn>
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags) => {
      await fs.rename(join(root, 'image.png'), join(root, 'old.png'))
      await writeFile(join(root, 'image.png'), 'new')
      const handle = await actual.open(path, flags)
      close = vi.spyOn(handle, 'close')
      read = vi.spyOn(handle, 'read')
      return handle
    })
    await expect(readHarnessWorkspaceImage(root, 'image.png')).rejects.toThrow('文件在读取期间发生变化')
    expect(read).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  })

  it('bounds reads and refuses a file that grows after the initial stat', async () => {
    const root = await workspace()
    await writeFile(join(root, 'image.png'), 'old')
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let close!: ReturnType<typeof vi.spyOn>
    let read!: ReturnType<typeof vi.spyOn>
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags) => {
      const handle = await actual.open(path, flags)
      close = vi.spyOn(handle, 'close')
      const original = handle.read.bind(handle)
      read = vi.spyOn(handle, 'read').mockImplementationOnce(async (...args) => {
        await writeFile(join(root, 'image.png'), Buffer.alloc(limit + 1, 1))
        return original(...args as Parameters<typeof original>)
      })
      return handle
    })
    await expect(readHarnessWorkspaceImage(root, 'image.png')).rejects.toThrow(/发生变化|4 MiB/)
    expect(read).toHaveBeenCalled()
    for (const call of read.mock.calls) expect((call[0] as Buffer).byteLength).toBeLessThanOrEqual(limit + 1)
    expect(close).toHaveBeenCalledOnce()
  })

  it.each(['', 'new'])('rejects an image modified in place during its read (%j)', async replacement => {
    const root = await workspace()
    await writeFile(join(root, 'image.png'), 'old')
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let close!: ReturnType<typeof vi.spyOn>
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags) => {
      const handle = await actual.open(path, flags)
      close = vi.spyOn(handle, 'close')
      const original = handle.read.bind(handle)
      vi.spyOn(handle, 'read').mockImplementationOnce(async (...args) => {
        await writeFile(join(root, 'image.png'), replacement)
        return original(...args as Parameters<typeof original>)
      })
      return handle
    })
    await expect(readHarnessWorkspaceImage(root, 'image.png')).rejects.toThrow('文件在读取期间发生变化')
    expect(close).toHaveBeenCalledOnce()
  })

  it('handles legitimate short reads without dropping bytes', async () => {
    const root = await workspace()
    await writeFile(join(root, 'image.png'), 'abcdef')
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags) => {
      const handle = await actual.open(path, flags)
      const original = handle.read.bind(handle)
      vi.spyOn(handle, 'read').mockImplementation(async (buffer, offset, length, position) => original(buffer as Buffer, offset as number, Math.min(length as number, 2), position as number))
      return handle
    })
    expect(await readHarnessWorkspaceImage(root, 'image.png')).toMatchObject({ dataBase64: Buffer.from('abcdef').toString('base64'), byteLength: 6 })
  })

  it('closes a handle after an unexpected read failure and keeps its details private', async () => {
    const root = await workspace()
    await writeFile(join(root, 'image.png'), 'image')
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let close!: ReturnType<typeof vi.spyOn>
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags) => {
      const handle = await actual.open(path, flags)
      close = vi.spyOn(handle, 'close')
      vi.spyOn(handle, 'read').mockRejectedValueOnce(new Error('/private/client/token=unsafe'))
      return handle
    })
    await expect(readHarnessWorkspaceImage(root, 'image.png')).rejects.toThrow(/^图片读取失败，请重试$/)
    expect(close).toHaveBeenCalledOnce()
  })

  it('rejects a workspace root replaced during the read', async () => {
    const root = await workspace()
    await writeFile(join(root, 'image.png'), 'image')
    const oldRoot = `${root}-old`
    roots.push(oldRoot)
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags) => {
      const handle = await actual.open(path, flags)
      const original = handle.read.bind(handle)
      vi.spyOn(handle, 'read').mockImplementationOnce(async (...args) => {
        await fs.rename(root, oldRoot)
        await mkdir(root)
        return original(...args as Parameters<typeof original>)
      })
      return handle
    })
    await expect(readHarnessWorkspaceImage(root, 'image.png')).rejects.toThrow('文件在读取期间发生变化')
  })

  it('rejects an escaping link installed after a handle was opened', async () => {
    const root = await workspace()
    const outside = await workspace()
    await writeFile(join(root, 'image.png'), 'old')
    await writeFile(join(outside, 'private.png'), 'secret')
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let close!: ReturnType<typeof vi.spyOn>
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags) => {
      const handle = await actual.open(path, flags)
      close = vi.spyOn(handle, 'close')
      const original = handle.read.bind(handle)
      vi.spyOn(handle, 'read').mockImplementationOnce(async (...args) => {
        await rm(join(root, 'image.png'))
        await symlink(join(outside, 'private.png'), join(root, 'image.png'))
        return original(...args as Parameters<typeof original>)
      })
      return handle
    })
    await expect(readHarnessWorkspaceImage(root, 'image.png')).rejects.toThrow(/发生变化|工作目录/)
    expect(close).toHaveBeenCalledOnce()
  })

  it.each(['EACCES', 'EPERM', 'ENOENT', 'EIO'])('does not expose filesystem details for %s', async code => {
    const root = await workspace()
    await writeFile(join(root, 'image.png'), 'image')
    vi.mocked(fs.open).mockRejectedValueOnce(Object.assign(new Error('/private/client/token=unsafe'), { code }))
    const error = await readHarnessWorkspaceImage(root, 'image.png').catch(cause => cause)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).not.toMatch(/private|client|token|unsafe/)
  })
})

describe('Harness workspace search', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'readdir')
    vi.spyOn(fs, 'realpath')
    vi.spyOn(fs, 'lstat')
    vi.spyOn(fs, 'access')
    vi.spyOn(timers, 'setImmediate')
  })

  it('searches unseen deep and hidden paths, with dependencies excluded unless rules explicitly allow them', async () => {
    const root = await workspace()
    for (const path of ['src/features/notes', 'tests/notes', 'node_modules/package/lib', '.github/workflows']) await mkdir(join(root, path), { recursive: true })
    for (const path of ['src/features/notes/index.ts', 'tests/notes/index.ts', 'node_modules/package/lib/dependency.ts', '.github/workflows/build.yml', 'HarnessWorkbench.tsx']) await writeFile(join(root, path), path)
    expect((await searchHarnessWorkspaceFiles(root, 'index')).entries.slice(0, 2).map(entry => entry.path)).toEqual(['src/features/notes/index.ts', 'tests/notes/index.ts'])
    expect((await searchHarnessWorkspaceFiles(root, 's/f/n/i')).entries[0]).toEqual({ name: 'index.ts', path: 'src/features/notes/index.ts', type: 'file' })
    expect((await searchHarnessWorkspaceFiles(root, 'hwb')).entries[0].path).toBe('HarnessWorkbench.tsx')
    expect((await searchHarnessWorkspaceFiles(root, 'dependency')).entries).toEqual([])
    expect((await searchHarnessWorkspaceFiles(root, 'workflow')).entries.slice(0, 2).map(entry => entry.path)).toEqual(['.github/workflows', '.github/workflows/build.yml'])
    await writeFile(join(root, '.miraignore'), '')
    expect((await searchHarnessWorkspaceFiles(root, 'dependency')).entries[0].path).toBe('node_modules/package/lib/dependency.ts')
  })

  it('lists safe internal links without following directory cycles, and excludes external and broken links', async () => {
    const root = await workspace()
    const outside = await workspace()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'note.md'), 'Mira')
    await writeFile(join(outside, 'secret.md'), 'secret')
    await symlink(join(root, 'src', 'note.md'), join(root, 'note-link.md'))
    await symlink(join(root, 'src'), join(root, 'src-link'))
    await symlink(root, join(root, 'src', 'loop'))
    await symlink(join(root, 'missing'), join(root, 'broken'))
    await symlink(outside, join(root, 'external'))
    await symlink(join(outside, 'secret.md'), join(root, 'secret-link.md'))
    expect((await searchHarnessWorkspaceFiles(root, 'note')).entries.map(entry => entry.path)).toEqual(['src/note.md', 'note-link.md'])
    expect((await searchHarnessWorkspaceFiles(root, 'src-link')).entries[0]).toEqual({ name: 'src-link', path: 'src-link', type: 'directory' })
    expect((await searchHarnessWorkspaceFiles(root, 'loop')).entries).toEqual([{ name: 'loop', path: 'src/loop', type: 'directory' }])
    for (const query of ['external', 'secret', 'broken', 'src-link/note']) expect((await searchHarnessWorkspaceFiles(root, query)).entries.every(entry => !/external|secret|broken|src-link\//.test(entry.path))).toBe(true)
  })

  it('does not scan blank queries and rejects invalid queries before accessing the filesystem', async () => {
    vi.mocked(fs.realpath).mockClear()
    vi.mocked(fs.readdir).mockClear()
    expect(await searchHarnessWorkspaceFiles('/unavailable', '   ', true)).toEqual({ entries: [], truncated: false })
    for (const query of ['a'.repeat(257), 'a\0b', 'a\nb', null, 1]) await expect(searchHarnessWorkspaceFiles('/unavailable', query as string)).rejects.toThrow('搜索关键词无效')
    await expect(searchHarnessWorkspaceFiles('/unavailable', 'a', 'true' as unknown as boolean)).rejects.toThrow('刷新状态无效')
    expect(fs.realpath).not.toHaveBeenCalled()
    expect(fs.readdir).not.toHaveBeenCalled()
  })

  it('shares scans, caches by root, and refreshes created and deleted files', async () => {
    const root = await workspace()
    const other = await workspace()
    await writeFile(join(root, 'old.md'), 'old')
    await writeFile(join(other, 'other.md'), 'other')
    vi.mocked(fs.readdir).mockClear()
    const [first, concurrent] = await Promise.all([searchHarnessWorkspaceFiles(root, 'old'), searchHarnessWorkspaceFiles(root, 'old')])
    expect(first).toEqual(concurrent)
    expect(fs.readdir).toHaveBeenCalledTimes(1)
    await writeFile(join(root, 'new.md'), 'new')
    expect((await searchHarnessWorkspaceFiles(root, 'new')).entries.some(entry => entry.path === 'new.md')).toBe(false)
    await rm(join(root, 'old.md'))
    expect((await searchHarnessWorkspaceFiles(root, 'md', true)).entries.map(entry => entry.path)).toEqual(['new.md'])
    expect((await searchHarnessWorkspaceFiles(other, 'md')).entries.map(entry => entry.path)).toEqual(['other.md'])
    expect((await searchHarnessWorkspaceFiles(root, 'old')).entries.some(entry => entry.path === 'old.md')).toBe(false)
  })

  it('lets fresh scans replace old scans without old results repopulating the cache', async () => {
    const root = await workspace()
    await writeFile(join(root, 'old.md'), 'old')
    const oldEntries = await fs.readdir(root, { withFileTypes: true })
    let release!: (entries: typeof oldEntries) => void
    let started!: () => void
    const waiting = new Promise<void>(resolve => { started = resolve })
    vi.mocked(fs.readdir).mockImplementationOnce(() => { started(); return new Promise<typeof oldEntries>(resolve => { release = resolve }) as unknown as ReturnType<typeof fs.readdir> })
    const oldSearch = searchHarnessWorkspaceFiles(root, 'old')
    await waiting
    await writeFile(join(root, 'new.md'), 'new')
    const fresh = await searchHarnessWorkspaceFiles(root, 'new', true)
    expect(fresh.entries[0].path).toBe('new.md')
    release(oldEntries)
    await oldSearch
    expect((await searchHarnessWorkspaceFiles(root, 'new')).entries).toEqual(fresh.entries)
  })

  it('makes concurrent queries wait for an explicit refresh instead of reading its old cache', async () => {
    const root = await workspace()
    await writeFile(join(root, 'old.md'), 'old')
    await searchHarnessWorkspaceFiles(root, 'old')
    await writeFile(join(root, 'new.md'), 'new')
    const entries = await fs.readdir(root, { withFileTypes: true })
    let release!: (value: typeof entries) => void
    let started!: () => void
    const waiting = new Promise<void>(resolve => { started = resolve })
    vi.mocked(fs.readdir).mockImplementationOnce(() => { started(); return new Promise<typeof entries>(resolve => { release = resolve }) as unknown as ReturnType<typeof fs.readdir> })
    const refreshed = searchHarnessWorkspaceFiles(root, 'new', true)
    await waiting
    const concurrent = searchHarnessWorkspaceFiles(root, 'new')
    release(entries)
    expect((await concurrent).entries).toEqual((await refreshed).entries)
    expect((await concurrent).entries[0].path).toBe('new.md')
  })

  it.each(['ENOENT', 'EACCES', 'EPERM', 'EIO'])('rejects root failures with a safe explicit failure (%s)', async code => {
    const root = await workspace()
    vi.mocked(fs.realpath).mockRejectedValueOnce(Object.assign(new Error('private root detail'), { code }))
    await expect(searchHarnessWorkspaceFiles(root, 'note')).rejects.toThrow(/^工作目录搜索未完成$/)
  })

  it('rejects unreadable child directories instead of presenting a partial index as complete', async () => {
    const root = await workspace()
    await mkdir(join(root, 'private'))
    await writeFile(join(root, 'note.md'), 'Mira')
    const original = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).readdir
    vi.mocked(fs.readdir).mockImplementation((path, options) => String(path).endsWith('/private') ? Promise.reject(Object.assign(new Error('/private/secret-detail'), { code: 'EACCES' })) : original(path, options))
    await expect(searchHarnessWorkspaceFiles(root, 'note')).rejects.toThrow(/^工作目录搜索未完成$/)
    vi.mocked(fs.readdir).mockImplementation(original)
    expect((await searchHarnessWorkspaceFiles(root, 'note')).entries[0].path).toBe('note.md')
  })

  it('rechecks cached results before returning a file replaced by an escaping link', async () => {
    const root = await workspace()
    const outside = await workspace()
    await writeFile(join(root, 'note.md'), 'Mira')
    await writeFile(join(outside, 'secret.md'), 'secret')
    await searchHarnessWorkspaceFiles(root, 'note')
    await rm(join(root, 'note.md'))
    await symlink(join(outside, 'secret.md'), join(root, 'note.md'))
    await expect(searchHarnessWorkspaceFiles(root, 'note')).rejects.toThrow(/^工作目录搜索未完成$/)
    expect((await searchHarnessWorkspaceFiles(root, 'note', true)).entries).toEqual([])
  })

  it('expires idle indexes after 60 seconds instead of retaining them for the process lifetime', async () => {
    const root = await workspace()
    await writeFile(join(root, 'old.md'), 'old')
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    await searchHarnessWorkspaceFiles(root, 'md')
    await writeFile(join(root, 'new.md'), 'new')
    vi.mocked(fs.readdir).mockClear()
    await searchHarnessWorkspaceFiles(root, 'md')
    expect(fs.readdir).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_001)
    expect((await searchHarnessWorkspaceFiles(root, 'md')).entries.map(entry => entry.path)).toEqual(['new.md', 'old.md'])
    expect(fs.readdir).toHaveBeenCalledTimes(1)
  })

  it('retains at most four workspace indexes and evicts the least recently used root', async () => {
    const workspaces = await Promise.all(Array.from({ length: 5 }, () => workspace()))
    for (const root of workspaces) {
      await writeFile(join(root, 'note.md'), 'Mira')
      await searchHarnessWorkspaceFiles(root, 'note')
    }
    vi.mocked(fs.readdir).mockClear()
    await searchHarnessWorkspaceFiles(workspaces[4], 'note')
    expect(fs.readdir).not.toHaveBeenCalled()
    await searchHarnessWorkspaceFiles(workspaces[0], 'note')
    expect(fs.readdir).toHaveBeenCalledTimes(1)
  })

  it('invalidates a cached path when the directory identity changes', async () => {
    const root = await workspace()
    await writeFile(join(root, 'old.md'), 'old')
    await searchHarnessWorkspaceFiles(root, 'md')
    await writeFile(join(root, 'new.md'), 'new')
    const original = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).lstat
    const stat = await fs.lstat(root)
    const replaced = Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { ino: Number(stat.ino) + 1 })
    const canonical = await fs.realpath(root)
    vi.mocked(fs.lstat).mockImplementation((path, options) => String(path) === root || String(path) === canonical ? Promise.resolve(replaced) : original(path, options))
    expect((await searchHarnessWorkspaceFiles(root, 'md')).entries.map(entry => entry.path)).toEqual(['new.md', 'old.md'])
  })

  it('bounds 65,000 matching candidates, reports exact truncation, and yields host work to the event loop', async () => {
    const root = await workspace()
    const canonicalRoot = await fs.realpath(root)
    const directoryStat = await fs.lstat(root)
    await writeFile(join(root, '.miraignore'), '')
    await writeFile(join(root, 'file.md'), 'Mira')
    const fileStat = await fs.lstat(join(root, 'file.md'))
    const entries = Array.from({ length: 65_000 }, (_, index) => ({ name: `note-${String(index).padStart(5, '0')}.md`, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }))
    vi.mocked(fs.readdir).mockResolvedValue(entries as never)
    vi.mocked(fs.realpath).mockImplementation(async path => String(path) === root ? canonicalRoot : String(path))
    const originalStat = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).lstat
    vi.mocked(fs.lstat).mockImplementation(async (path, options) => {
      if (String(path).endsWith('/.miraignore') || String(path).endsWith('/.gitignore')) return originalStat(path, options)
      return String(path) === root || String(path) === canonicalRoot ? directoryStat : fileStat
    })
    vi.mocked(timers.setImmediate).mockClear()
    const result = await searchHarnessWorkspaceFiles(root, 'note')
    expect(result.entries).toHaveLength(1000)
    expect(result.entries[0].path).toBe('note-00000.md')
    expect(result.entries[999].path).toBe('note-00999.md')
    expect(result.truncated).toBe(true)
    expect(timers.setImmediate).toHaveBeenCalled()
    vi.mocked(fs.readdir).mockClear()
    expect((await searchHarnessWorkspaceFiles(root, 'note-00999.md')).truncated).toBe(false)
    expect(fs.readdir).not.toHaveBeenCalled()
    vi.mocked(fs.readdir).mockResolvedValue(entries.slice(0, 1000) as never)
    expect((await searchHarnessWorkspaceFiles(root, 'note', true)).truncated).toBe(false)
    vi.mocked(fs.readdir).mockResolvedValue(entries.slice(0, 1001) as never)
    expect((await searchHarnessWorkspaceFiles(root, 'note', true)).truncated).toBe(true)
    // Legal 253-character filenames put this index over the 128 MiB estimate; it must not stay cached.
    vi.mocked(fs.readdir).mockResolvedValue(entries.map(entry => ({ ...entry, name: entry.name + 'x'.repeat(240) })) as never)
    await searchHarnessWorkspaceFiles(root, 'note', true)
    vi.mocked(fs.readdir).mockClear()
    await searchHarnessWorkspaceFiles(root, 'note')
    expect(fs.readdir).toHaveBeenCalledTimes(1)
  })
})
