import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { watch } from 'node:fs'
import { chmod, mkdtemp, mkdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HarnessEvent } from '../src/config/harness'
import { HarnessWorkspaceWatch } from '../electron/services/harnessWorkspaceWatch'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'

const roots: string[] = []
const services: HarnessWorkspaceWatch[] = []
async function workspace() { const root = await realpath(await mkdtemp(join(tmpdir(), 'mira-workspace-watch-'))); roots.push(root); return root }
function fixture() {
  const opened: Array<{ directory: string; changed: (filename: string | Buffer | null) => void; handle: EventEmitter & { close: ReturnType<typeof vi.fn> } }> = []
  const watchDirectory = vi.fn((directory: string, changed: (filename: string | Buffer | null) => void) => {
    const handle = Object.assign(new EventEmitter(), { close: vi.fn() })
    opened.push({ directory, changed, handle })
    return handle
  })
  const service = new HarnessWorkspaceWatch(watchDirectory)
  services.push(service)
  const sender = { id: 1, isDestroyed: vi.fn(() => false), send: vi.fn<(channel: string, event: HarnessEvent) => void>() }
  return { service, sender, opened, watchDirectory }
}
async function nativeFixture(root: string) {
  const observed = new Set<string>()
  const opened: string[] = []
  const service = new HarnessWorkspaceWatch((directory, changed) => {
    opened.push(directory)
    return watch(directory, { recursive: false, persistent: false }, (_event, filename) => { observed.add(directory); changed(filename) })
  })
  services.push(service)
  const sender = { id: 1, isDestroyed: () => false, send: vi.fn<(channel: string, event: HarnessEvent) => void>() }
  await service.start(sender, 'g', 's', ['', 'src'], () => root, () => true)
  // A returned FSWatcher does not guarantee that macOS has begun delivering native events.
  await vi.waitFor(async () => {
    await Promise.all([root, join(root, 'src')].map(directory => writeFile(join(directory, '.mira-watch-ready'), 'ready')))
    expect(observed.has(root) && observed.has(join(root, 'src'))).toBe(true)
  }, { timeout: 5000 })
  sender.send.mockClear()
  return { service, sender, opened }
}
afterEach(async () => {
  services.splice(0).forEach(service => service.closeAll())
  vi.useRealTimers()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('workspace watch request contract', () => {
  it('accepts relative displayed directories and removes duplicates without accepting a caller grant', () => {
    expect(parseFirstPartyHarnessCall('files.watch', { sessionId: 's', paths: ['', 'src', 'src'], grantId: 'injected' })).toEqual({ method: 'files.watch', sessionId: 's', paths: ['', 'src'] })
    expect(parseFirstPartyHarnessCall('files.unwatch', { sessionId: 's', watchId: 'w' })).toEqual({ method: 'files.unwatch', sessionId: 's', watchId: 'w' })
  })
  it('rejects traversal, absolute and unbounded directory selections', () => {
    for (const paths of [[], null, ['/tmp'], ['../secret'], ['C:/secret'], ['a\\b'], ['a\0b'], ['a'.repeat(2049)], Array.from({ length: 257 }, () => ''), Array.from({ length: 256 }, (_, i) => `dir${i}`)]) {
      expect(() => parseFirstPartyHarnessCall('files.watch', { sessionId: 's', paths })).toThrow()
    }
    expect(() => parseFirstPartyHarnessCall('files.unwatch', { sessionId: 's', watchId: '' })).toThrow('监听 ID')
  })
})

describe('controlled workspace directory watches', () => {
  it('watches only root and requested directories, deduplicates internal aliases, and batches changed parents', async () => {
    const root = await workspace()
    await mkdir(join(root, 'src/deep'), { recursive: true })
    await symlink(join(root, 'src'), join(root, 'alias'))
    const { service, sender, opened } = fixture()
    const result = await service.start(sender, 'grant', 's', ['src', 'alias', 'src'], () => root, () => true)
    expect(opened.map(entry => entry.directory)).toEqual([root, join(root, 'src')])
    opened[1].changed('note.md')
    opened[1].changed('second.md')
    opened[0].changed('new.txt')
    expect(sender.send).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledOnce())
    expect(sender.send).toHaveBeenCalledWith('harness:event', expect.objectContaining({ sessionId: 's', type: 'workspace-files-changed', payload: { grantId: 'grant', watchId: result.watchId, directory: root, paths: ['src', 'alias', ''] } }))
    service.stop(sender.id, 'grant', 's', result.watchId)
    expect(opened.every(entry => entry.handle.close.mock.calls.length === 1)).toBe(true)
  })

  it('treats an unknown filename as a complete displayed-tree invalidation', async () => {
    const root = await workspace()
    const { service, sender, opened } = fixture()
    await service.start(sender, 'grant', 's', [''], () => root, () => true)
    opened[0].changed(null)
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledOnce())
    expect(sender.send.mock.calls[0][1].payload.paths).toEqual([])
  })

  it('fully invalidates when an alias moves between already-watched canonical directories without reopening handles', async () => {
    const root = await workspace()
    await mkdir(join(root, 'one'))
    await mkdir(join(root, 'two'))
    await symlink(join(root, 'one'), join(root, 'alias'))
    const { service, sender, opened } = fixture()
    await service.start(sender, 'g', 's', ['', 'one', 'two', 'alias'], () => root, () => true)
    expect(opened.map(binding => binding.directory)).toEqual([root, join(root, 'one'), join(root, 'two')])
    await rm(join(root, 'alias'))
    await symlink(join(root, 'two'), join(root, 'alias'))
    opened[0].changed('alias')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledOnce())
    expect(sender.send.mock.calls[0][1].payload.paths).toEqual([])
    expect(opened).toHaveLength(3)
    expect(opened.every(binding => binding.handle.close.mock.calls.length === 0)).toBe(true)
    opened[2].changed('fresh.md')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(2))
    expect(sender.send.mock.calls[1][1].payload.paths).toEqual(['two', 'alias'])
    opened[1].changed('one.md')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(3))
    expect(sender.send.mock.calls[2][1].payload.paths).toEqual(['one'])
  })

  it('refuses outside links and regular files before allocating any watcher', async () => {
    const root = await workspace()
    const outside = await workspace()
    await symlink(outside, join(root, 'external'))
    await writeFile(join(root, 'note.txt'), 'Mira')
    const { service, sender, watchDirectory } = fixture()
    await expect(service.start(sender, 'g', 's', ['external'], () => root, () => true)).rejects.toThrow('路径不能离开工作目录')
    await expect(service.start(sender, 'g', 's', ['note.txt'], () => root, () => true)).rejects.toThrow('目标不是目录')
    expect(watchDirectory).not.toHaveBeenCalled()
  })

  it('closes a partially opened batch and reports safe permission or resource failures', async () => {
    const root = await workspace()
    await mkdir(join(root, 'src'))
    for (const [code, message] of [['EACCES', '没有权限监听'], ['ENOSPC', '监听资源不足'], ['EIO', '文件变化监听失败']]) {
      const { service, sender, opened, watchDirectory } = fixture()
      watchDirectory.mockImplementationOnce((directory, changed) => {
        const handle = Object.assign(new EventEmitter(), { close: vi.fn() })
        opened.push({ directory, changed, handle })
        return handle
      }).mockImplementationOnce(() => { throw Object.assign(new Error('private path details'), { code }) })
      await expect(service.start(sender, 'g', 's', ['', 'src'], () => root, () => true)).rejects.toThrow(message)
      expect(opened[0].handle.close).toHaveBeenCalledOnce()
      expect(sender.send).not.toHaveBeenCalled()
    }
  })

  it('binds unwatch to owner, grant and session, and makes repeat disposal harmless', async () => {
    const root = await workspace()
    const { service, sender, opened } = fixture()
    const { watchId } = await service.start(sender, 'g', 's', [''], () => root, () => true)
    for (const [owner, grant, session] of [[2, 'g', 's'], [1, 'other', 's'], [1, 'g', 'other']] as const) expect(() => service.stop(owner, grant, session, watchId)).toThrow('授权已失效')
    expect(opened[0].handle.close).not.toHaveBeenCalled()
    service.stop(1, 'g', 's', watchId)
    service.stop(1, 'g', 's', watchId)
    opened[0].changed('late.txt')
    expect(opened[0].handle.close).toHaveBeenCalledOnce()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('cancels a watch opening when its grant is revoked before async directory resolution returns', async () => {
    const root = await workspace()
    const { service, sender, watchDirectory } = fixture()
    let resolve!: (directory: string) => void
    const opening = service.start(sender, 'g', 's', [''], () => new Promise<string>(done => { resolve = done }), () => true)
    service.closeForGrant('g', sender.id)
    resolve(root)
    await expect(opening).rejects.toThrow('授权已失效')
    expect(watchDirectory).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('reclaims an allocated watcher if authorization disappears during its opening validation', async () => {
    const root = await workspace()
    const { service, sender, opened, watchDirectory } = fixture()
    let active = true
    watchDirectory.mockImplementationOnce((directory, changed) => {
      const handle = Object.assign(new EventEmitter(), { close: vi.fn() })
      opened.push({ directory, changed, handle })
      active = false
      return handle
    })
    await expect(service.start(sender, 'g', 's', [''], () => root, () => active)).rejects.toThrow('授权已失效')
    expect(opened[0].handle.close).toHaveBeenCalledOnce()
    opened[0].changed('late.txt')
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('does not open or emit after a stale session root, revoked grant or destroyed window', async () => {
    const root = await workspace()
    const { service, sender, opened, watchDirectory } = fixture()
    await expect(service.start(sender, 'g', 's', [''], () => root, () => false)).rejects.toThrow('授权已失效')
    expect(watchDirectory).not.toHaveBeenCalled()
    let authorized = true
    await service.start(sender, 'g', 's', [''], () => root, () => authorized)
    opened[0].changed('late.txt')
    authorized = false
    await vi.waitFor(() => expect(opened[0].handle.close).toHaveBeenCalledOnce())
    expect(sender.send).not.toHaveBeenCalled()
    sender.isDestroyed.mockReturnValue(true)
    await expect(service.start(sender, 'g', 's', [''], () => root, () => true)).rejects.toThrow('授权已失效')
  })

  it('invalidates a moved or inode-replaced workspace instead of emitting stale changed paths', async () => {
    const root = await workspace()
    const other = await workspace()
    const { service, sender, opened } = fixture()
    let currentRoot = root
    await service.start(sender, 'g', 's', [''], () => currentRoot, () => true)
    currentRoot = other
    opened[0].changed('private.txt')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledOnce())
    expect(sender.send.mock.calls[0][1].payload).toMatchObject({ paths: [], error: '工作目录已变化，请重新打开文件工作区。' })
    expect(opened[0].handle.close).toHaveBeenCalledOnce()
    currentRoot = root
    await service.start(sender, 'g2', 's', [''], () => currentRoot, () => true)
    await rename(root, `${root}-old`)
    roots.push(`${root}-old`)
    await mkdir(root)
    opened[1].changed('changed.txt')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(2))
    expect(sender.send.mock.calls[1][1].payload.paths).toEqual([])
    expect(opened[1].handle.close).toHaveBeenCalledOnce()
  })

  it('rebinds a replaced child inode and ignores callbacks from the directory moved outside the workspace', async () => {
    const root = await workspace()
    const outside = await workspace()
    await mkdir(join(root, 'src'))
    const { service, sender, opened } = fixture()
    await service.start(sender, 'g', 's', ['', 'src'], () => root, () => true)
    await rename(join(root, 'src'), join(outside, 'removed-src'))
    await mkdir(join(root, 'src'))
    opened[0].changed('src')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledOnce())
    expect(opened.map(binding => binding.directory)).toEqual([root, join(root, 'src'), join(root, 'src')])
    expect(opened[1].handle.close).toHaveBeenCalledOnce()
    expect(opened[0].handle.close).not.toHaveBeenCalled()
    expect(sender.send.mock.calls[0][1].payload.paths).toEqual([])
    opened[2].changed('fresh.md')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(2))
    expect(sender.send.mock.calls[1][1].payload.paths).toEqual(['src'])
    vi.useFakeTimers()
    opened[1].changed('outside-secret.md')
    opened[1].handle.emit('error', new Error('outside failure'))
    await vi.advanceTimersByTimeAsync(300)
    expect(sender.send).toHaveBeenCalledTimes(2)
    expect(opened[2].handle.close).not.toHaveBeenCalled()
  })

  it('keeps surviving ancestor watchers and restores a removed descendant in stages without polling', async () => {
    const root = await workspace()
    await mkdir(join(root, 'src/deep'), { recursive: true })
    const { service, sender, opened } = fixture()
    await service.start(sender, 'g', 's', ['', 'src/deep'], () => root, () => true)
    await rm(join(root, 'src'), { recursive: true })
    opened[0].changed('src')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledOnce())
    expect(opened[1].handle.close).toHaveBeenCalledOnce()
    expect(opened).toHaveLength(2)
    expect(opened[0].handle.close).not.toHaveBeenCalled()
    await mkdir(join(root, 'src'))
    opened[0].changed('src')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(2))
    expect(opened[2].directory).toBe(join(root, 'src'))
    await mkdir(join(root, 'src/deep'))
    opened[2].changed('deep')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(3))
    expect(opened[2].handle.close).toHaveBeenCalledOnce()
    expect(opened[3].directory).toBe(join(root, 'src/deep'))
    expect(sender.send.mock.calls.slice(0, 3).map(([, event]) => event.payload.paths)).toEqual([[], [], []])
    opened[3].changed('restored.md')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(4))
    expect(sender.send.mock.calls[3][1].payload.paths).toEqual(['src/deep'])
  })

  it('closes the old child binding and reports a safe error when its relative path becomes an outside link', async () => {
    const root = await workspace()
    const outside = await workspace()
    await mkdir(join(root, 'src'))
    const { service, sender, opened } = fixture()
    await service.start(sender, 'g', 's', ['', 'src'], () => root, () => true)
    await rename(join(root, 'src'), join(outside, 'removed-src'))
    await symlink(outside, join(root, 'src'))
    opened[0].changed('src')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledOnce())
    expect(sender.send.mock.calls[0][1].payload).toMatchObject({ paths: [], error: '路径不能离开工作目录' })
    expect(opened).toHaveLength(2)
    expect(opened.every(binding => binding.handle.close.mock.calls.length === 1)).toBe(true)
    vi.useFakeTimers()
    opened[1].changed('outside-secret.txt')
    await vi.advanceTimersByTimeAsync(300)
    expect(sender.send).toHaveBeenCalledOnce()
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reports a real child chmod failure safely and releases all of its watches', async () => {
    const root = await workspace()
    const child = join(root, 'src')
    await mkdir(child)
    const { service, sender, opened } = fixture()
    await service.start(sender, 'g', 's', ['', 'src'], () => root, () => true)
    try {
      await chmod(child, 0)
      opened[0].changed('src')
      await vi.waitFor(() => expect(sender.send).toHaveBeenCalledOnce())
      expect(sender.send.mock.calls[0][1].payload).toMatchObject({ paths: [], error: '没有权限监听文件或目录，请检查系统访问权限后重试。' })
      expect(opened.every(binding => binding.handle.close.mock.calls.length === 1)).toBe(true)
    } finally { await chmod(child, 0o755) }
  })

  it('disposes old and newly allocated child bindings if a grant is revoked during rebinding', async () => {
    const root = await workspace()
    const outside = await workspace()
    await mkdir(join(root, 'src'))
    const { service, sender, opened, watchDirectory } = fixture()
    let authorized = true
    await service.start(sender, 'g', 's', ['', 'src'], () => root, () => authorized)
    await rename(join(root, 'src'), join(outside, 'removed-src'))
    await mkdir(join(root, 'src'))
    watchDirectory.mockImplementationOnce((directory, changed) => {
      const handle = Object.assign(new EventEmitter(), { close: vi.fn() })
      opened.push({ directory, changed, handle })
      authorized = false
      return handle
    })
    opened[0].changed('src')
    await vi.waitFor(() => expect(opened).toHaveLength(3))
    await vi.waitFor(() => expect(opened.every(binding => binding.handle.close.mock.calls.length === 1)).toBe(true))
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('serializes batches arriving during a rebind without creating duplicate child handles', async () => {
    const root = await workspace()
    const outside = await workspace()
    await mkdir(join(root, 'src'))
    const { service, sender, opened, watchDirectory } = fixture()
    await service.start(sender, 'g', 's', ['', 'src'], () => root, () => true)
    await rename(join(root, 'src'), join(outside, 'removed-src'))
    await mkdir(join(root, 'src'))
    watchDirectory.mockImplementationOnce((directory, changed) => {
      const handle = Object.assign(new EventEmitter(), { close: vi.fn() })
      opened.push({ directory, changed, handle })
      opened[0].changed('another-change')
      return handle
    })
    opened[0].changed('src')
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(2))
    expect(opened).toHaveLength(3)
    expect(opened[1].handle.close).toHaveBeenCalledOnce()
    expect(opened[2].handle.close).not.toHaveBeenCalled()
    expect(sender.send.mock.calls[0][1].payload.paths).toEqual([])
    expect(sender.send.mock.calls[1][1].payload.paths).toEqual([''])
  })

  it('reports a safe runtime watcher error and releases the failed batch', async () => {
    const root = await workspace()
    const { service, sender, opened } = fixture()
    await service.start(sender, 'g', 's', [''], () => root, () => true)
    opened[0].handle.emit('error', Object.assign(new Error('private detail'), { code: 'ENOSPC' }))
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledOnce())
    expect(sender.send.mock.calls[0][1].payload).toMatchObject({ paths: [], error: '系统文件监听资源不足，请关闭部分目录后重试。' })
    expect(opened[0].handle.close).toHaveBeenCalledOnce()
  })

  it('cleans only the exact grant, owner or session and cancels pending notifications', async () => {
    const root = await workspace()
    const { service, sender, opened } = fixture()
    const secondSender = { ...sender, id: 2 }
    await service.start(sender, 'g1', 's1', [''], () => root, () => true)
    await service.start(sender, 'g2', 's2', [''], () => root, () => true)
    await service.start(secondSender, 'g3', 's3', [''], () => root, () => true)
    opened.forEach(entry => entry.changed('pending.txt'))
    service.closeForGrant('g1', 2)
    expect(opened[0].handle.close).not.toHaveBeenCalled()
    service.closeForGrant('g1', 1)
    service.closeForSession('s2')
    expect(opened[0].handle.close).toHaveBeenCalledOnce()
    expect(opened[1].handle.close).toHaveBeenCalledOnce()
    expect(opened[2].handle.close).not.toHaveBeenCalled()
    service.closeForWebContents(2)
    service.closeAll()
    expect(opened[2].handle.close).toHaveBeenCalledOnce()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('bounds opening watches and restores the allocation capacity after disposal', async () => {
    const root = await workspace()
    const { service, sender } = fixture()
    for (let index = 0; index < 8; index++) await service.start(sender, `g${index}`, `s${index}`, [''], () => root, () => true)
    await expect(service.start(sender, 'extra', 's', [''], () => root, () => true)).rejects.toThrow('数量已达上限')
    service.closeForGrant('g0', sender.id)
    await expect(service.start(sender, 'extra', 's', [''], () => root, () => true)).resolves.toHaveProperty('watchId')
  })

  it('reclaims invalid or destroyed watches without touching still-authorized grants', async () => {
    const root = await workspace()
    const { service, sender, opened } = fixture()
    let active = true
    await service.start(sender, 'g1', 'archived', [''], () => root, () => active)
    await service.start(sender, 'g2', 'live', [''], () => root, () => true)
    active = false
    service.closeInvalid()
    expect(opened[0].handle.close).toHaveBeenCalledOnce()
    expect(opened[1].handle.close).not.toHaveBeenCalled()
    sender.isDestroyed.mockReturnValue(true)
    service.closeInvalid()
    expect(opened[1].handle.close).toHaveBeenCalledOnce()
  })

  it('observes actual filesystem creation without recursively watching unrequested directories', async () => {
    const root = await workspace()
    await mkdir(join(root, 'src'))
    const { sender } = await nativeFixture(root)
    await writeFile(join(root, 'src/note.md'), 'Mira')
    await vi.waitFor(() => expect(sender.send.mock.calls.some(([, event]) => !event.payload.error && ((event.payload.paths as string[]).length === 0 || (event.payload.paths as string[]).includes('src')))).toBe(true), { timeout: 5000 })
  })

  it('continues receiving native child events after a real same-path directory replacement', async () => {
    const root = await workspace()
    const outside = await workspace()
    await mkdir(join(root, 'src'))
    const { sender, opened } = await nativeFixture(root)
    await rename(join(root, 'src'), join(outside, 'old-src'))
    await mkdir(join(root, 'src'))
    await vi.waitFor(() => expect(opened.filter(directory => directory === join(root, 'src'))).toHaveLength(2), { timeout: 5000 })
    await vi.waitFor(() => expect(sender.send.mock.calls.some(([, event]) => !event.payload.error && (event.payload.paths as string[]).length === 0)).toBe(true), { timeout: 5000 })
    sender.send.mockClear()
    await writeFile(join(root, 'src/fresh.md'), 'Mira')
    await vi.waitFor(() => expect(sender.send.mock.calls.some(([, event]) => !event.payload.error && ((event.payload.paths as string[]).length === 0 || (event.payload.paths as string[]).includes('src')))).toBe(true), { timeout: 5000 })
  })
})
