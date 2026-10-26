import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { HarnessRuntime } from '../electron/services/harnessRuntime'

vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>() }))

const cleanups: Array<() => void> = []
afterEach(() => { vi.restoreAllMocks(); cleanups.splice(0).reverse().forEach(cleanup => cleanup()) })
function fixture(projectRoot?: string) {
  const home = fs.mkdtempSync(join(tmpdir(), 'mira-trash-move-'))
  const directory = projectRoot ? fs.mkdtempSync(join(projectRoot, 'mira-trash-project-')) : join(home, 'project')
  if (!projectRoot) fs.mkdirSync(directory)
  const database = new PlatformDatabase(home)
  cleanups.push(() => {
    database.close()
    fs.rmSync(home, { recursive: true, force: true })
    if (projectRoot) fs.rmSync(directory, { recursive: true, force: true })
  })
  const store = database.harness, project = store.createProject(directory), session = store.createSession(project.id)
  return { home, directory, database, store, project, session, trash: join(home, '.mira', 'trash', project.id) }
}
function crossDevice(source: string) {
  const rename = fs.renameSync
  return vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (String(from) === source) throw Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' })
    return rename(from, to)
  })
}

describe('Mira project trash moves', () => {
  it.skipIf(!process.env.MIRA_TEST_CROSS_DEVICE_ROOT)('executes the approved delete tool and restores on two physical filesystems', async () => {
    const f = fixture(process.env.MIRA_TEST_CROSS_DEVICE_ROOT)
    expect(fs.statSync(f.directory).dev).not.toBe(fs.statSync(f.home).dev)
    const source = join(f.directory, 'test-02.md')
    fs.writeFileSync(source, 'physical cross-device contents')
    f.store.updateSession({ ...f.session, permissionMode: 'full' })
    const runtime = new HarnessRuntime(f.database, { getTools: () => [] } as any)
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const registered = (runtime as any).tools(sender, f.session.id)
    await expect((runtime as any).preflightToolCall(sender, f.session.id, registered.descriptors, 'delete_file', { path: source }, false, 'full')).resolves.toBeUndefined()
    const result = await registered.tools.find((tool: any) => tool.name === 'delete_file').execute('cross-device-delete', { path: source })
    expect(result.details).toMatchObject({ path: 'test-02.md', trashed: true })
    expect(fs.existsSync(source)).toBe(false)
    const entry = f.store.listTrash(f.project.id)[0]
    expect(entry.paths).toEqual(['test-02.md'])
    f.store.restoreTrash(f.project.id, entry.token)
    expect(fs.readFileSync(source, 'utf8')).toBe('physical cross-device contents')
    expect(f.store.listTrash(f.project.id)).toEqual([])
  })

  it.each(['relative', 'absolute'])('accepts a project %s path and restores its original contents', kind => {
    const f = fixture(), path = join(f.directory, 'test-02.md')
    fs.writeFileSync(path, 'original contents')
    const result = f.store.deleteProjectFile(f.session.id, kind === 'absolute' ? path : 'test-02.md')
    expect(result).toMatchObject({ path: 'test-02.md', trashed: true })
    expect(fs.existsSync(path)).toBe(false)
    expect(f.store.listTrash(f.project.id)).toMatchObject([{ paths: ['test-02.md'] }])
    f.store.restoreTrash(f.project.id, f.store.listTrash(f.project.id)[0].token)
    expect(fs.readFileSync(path, 'utf8')).toBe('original contents')
  })

  it('copies a directory completely across devices before removing it and restores nested files and symlinks', () => {
    const f = fixture(), source = join(f.directory, 'nested')
    fs.mkdirSync(join(source, 'docs'), { recursive: true })
    fs.writeFileSync(join(source, 'docs', 'note.md'), 'nested content')
    fs.writeFileSync(join(source, 'binary.bin'), Buffer.from([0, 255, 1, 23]))
    fs.symlinkSync('docs/note.md', join(source, 'link.md'))
    const rename = crossDevice(source)
    const copy = fs.cpSync
    vi.spyOn(fs, 'cpSync').mockImplementation((from, to, options) => {
      if (String(from) === source) {
        expect(fs.existsSync(source)).toBe(true)
        expect(f.store.listTrash(f.project.id)).toEqual([])
      }
      return copy(from, to, options)
    })
    f.store.deleteProjectFile(f.session.id, 'nested')
    expect(rename).toHaveBeenCalled()
    expect(fs.existsSync(source)).toBe(false)
    const entry = f.store.listTrash(f.project.id)[0]
    expect(entry.paths).toEqual(expect.arrayContaining(['nested/docs/note.md', 'nested/binary.bin', 'nested/link.md']))
    f.store.restoreTrash(f.project.id, entry.token)
    expect(fs.readFileSync(join(source, 'docs/note.md'), 'utf8')).toBe('nested content')
    expect(fs.readFileSync(join(source, 'binary.bin'))).toEqual(Buffer.from([0, 255, 1, 23]))
    expect(fs.readFileSync(join(source, 'link.md'), 'utf8')).toBe('nested content')
  })

  it('keeps the original and removes partial trash if a cross-device copy fails', () => {
    const f = fixture(), source = join(f.directory, 'notes.md')
    fs.writeFileSync(source, 'must be preserved'); crossDevice(source)
    vi.spyOn(fs, 'cpSync').mockImplementation((_from, to) => {
      fs.writeFileSync(to, 'partial')
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    })
    expect(() => f.store.deleteProjectFile(f.session.id, 'notes.md')).toThrow('disk full')
    expect(fs.readFileSync(source, 'utf8')).toBe('must be preserved')
    expect(f.store.listTrash(f.project.id)).toEqual([])
    expect(fs.readdirSync(f.trash)).toEqual([])
  })

  it('preserves permission errors instead of trying a copy or removing the original', () => {
    const f = fixture(), source = join(f.directory, 'notes.md')
    fs.writeFileSync(source, 'keep')
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }) })
    const copy = vi.spyOn(fs, 'cpSync')
    expect(() => f.store.deleteProjectFile(f.session.id, 'notes.md')).toThrow('permission denied')
    expect(copy).not.toHaveBeenCalled(); expect(fs.readFileSync(source, 'utf8')).toBe('keep')
    expect(f.store.listTrash(f.project.id)).toEqual([])
  })

  it('returns a same-device source to its original path if publishing the trash entry fails', () => {
    const f = fixture(), source = join(f.directory, 'notes.md')
    fs.writeFileSync(source, 'keep')
    const rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(from).endsWith('.pending')) throw new Error('publish failed')
      return rename(from, to)
    })
    expect(() => f.store.deleteProjectFile(f.session.id, 'notes.md')).toThrow('publish failed')
    expect(fs.readFileSync(source, 'utf8')).toBe('keep'); expect(fs.readdirSync(f.trash)).toEqual([])
  })

  it('does not list empty records left by previous failed moves', () => {
    const f = fixture()
    fs.mkdirSync(join(f.trash, '1792976190135-empty'), { recursive: true })
    expect(f.store.listTrash(f.project.id)).toEqual([])
  })
})
