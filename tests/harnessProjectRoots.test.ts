import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraPaths } from '../electron/storage/miraPaths'
import { PlatformDatabase } from '../electron/storage/database'

const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup()))
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mira-project-roots-'))
  let db = new PlatformDatabase(root)
  cleanups.push(() => { db.close(); rmSync(root, { recursive: true, force: true }) })
  const a = join(root, 'a'), b = join(root, 'b')
  mkdirSync(a); mkdirSync(b)
  const project = db.harness.createProject(a, 'Project')
  return { root, a, b, project, get db() { return db }, reopen() { db.close(); db = new PlatformDatabase(root); return db } }
}

describe('project source folders', () => {
  it('creates multiple roots atomically and leaves no registration on invalid input', () => {
    const f = fixture()
    const before = f.db.harness.listProjects()
    expect(() => f.db.harness.createProjectWithRoots({ name: 'New', roots: [f.b, join(f.root, 'missing')], primaryRoot: f.b })).toThrow()
    expect(f.db.harness.listProjects()).toEqual(before)
    const created = f.db.harness.createProjectWithRoots({ name: 'New', roots: [f.a, f.b], primaryRoot: f.b })
    expect(created.name).toBe('New')
    expect(created.roots).toEqual([{ rootPath: f.a, isPrimary: false }, { rootPath: f.b, isPrimary: true }])
    expect(f.reopen().harness.getProject(created.id).roots).toEqual(created.roots)
    expect(() => f.db.harness.createProjectWithRoots({ name: 'Duplicate', roots: [f.b], primaryRoot: f.b })).toThrow('其他项目')
    expect(f.db.harness.getProject(created.id).name).toBe('New')
  })

  it('reads existing single-root projects, persists multiple roots and uses primary for new tasks only', () => {
    const f = fixture(), oldTask = f.db.harness.createSession(f.project.id)
    expect(f.project.roots).toEqual([{ rootPath: f.a, isPrimary: true }])
    const updated = f.db.harness.updateProject(f.project.id, { name: 'Renamed', roots: [f.a, f.b, f.a], primaryRoot: f.b })
    expect(updated.directory).toBe(f.b)
    expect(updated.roots).toEqual([{ rootPath: f.a, isPrimary: false }, { rootPath: f.b, isPrimary: true }])
    expect(f.db.harness.getSession(oldTask.id).workingDirectory).toBe(f.a)
    expect(f.db.harness.createSession(f.project.id).workingDirectory).toBe(f.b)
    const db = f.reopen()
    expect(db.harness.listProjects()[0]).toMatchObject({ name: 'Renamed', directory: f.b, roots: updated.roots })
    const remaining = db.harness.updateProject(f.project.id, { name: 'Renamed', roots: [f.a], primaryRoot: f.a })
    expect(remaining.roots).toEqual([{ rootPath: f.a, isPrimary: true }])
  })

  it('rejects empty, invalid, missing and conflicting roots without partial updates', () => {
    const f = fixture(), store = f.db.harness
    const save = (roots: string[], primaryRoot: string) => store.updateProject(f.project.id, { name: 'Changed', roots, primaryRoot })
    expect(() => save([], f.a)).toThrow('至少保留')
    expect(() => save([f.a], f.b)).toThrow('主要目录')
    expect(() => save([f.a, join(f.b, 'missing')], f.a)).toThrow('源文件夹不可用')
    const file = join(f.b, 'file'); writeFileSync(file, 'data')
    expect(() => save([f.a, file], f.a)).toThrow('源文件夹不可用')
    store.createProject(f.b)
    expect(() => save([f.a, f.b], f.b)).toThrow('其他项目')
    expect(store.getProject(f.project.id)).toMatchObject({ name: 'Project', directory: f.a, roots: [{ rootPath: f.a, isPrimary: true }] })
  })

  it('keeps relative attachments bound to the existing task after switching primary', () => {
    const f = fixture(), store = f.db.harness, task = store.createSession(f.project.id)
    writeFileSync(join(f.a, 'file.txt'), 'original task file')
    writeFileSync(join(f.b, 'file.txt'), 'new project file')
    store.updateProject(f.project.id, { name: 'Project', roots: [f.a, f.b], primaryRoot: f.b })
    expect(store.getMessageAttachment(task.id, 'file.txt').content).toContain('original task file')
    expect(store.selectFileReferences(f.project.id, [join(f.a, 'file.txt')], f.a)[0].path).toBe('file.txt')
  })

  it.each([false, true])('restores trash to its original folder after primary changes (legacy: %s)', legacy => {
    const f = fixture(), store = f.db.harness, task = store.createSession(f.project.id)
    let token: string
    if (legacy) {
      token = '1700000000000-legacy'
      const trash = join(new MiraPaths(f.root).projectTrash(f.project.id), token)
      mkdirSync(trash, { recursive: true }); writeFileSync(join(trash, 'before.txt'), 'before switch')
    } else {
      writeFileSync(join(f.a, 'before.txt'), 'before switch')
      token = store.moveToTrash(task.id, 'before.txt').token
    }
    store.updateProject(f.project.id, { name: 'Project', roots: [f.a, f.b], primaryRoot: f.b })
    store.restoreTrash(f.project.id, token)
    expect(readFileSync(join(f.a, 'before.txt'), 'utf8')).toBe('before switch')
    expect(existsSync(join(f.b, 'before.txt'))).toBe(false)
    writeFileSync(join(f.a, 'after.txt'), 'after switch')
    const next = store.moveToTrash(task.id, 'after.txt')
    store.restoreTrash(f.project.id, next.token)
    expect(readFileSync(join(f.a, 'after.txt'), 'utf8')).toBe('after switch')
    expect(existsSync(join(f.b, 'after.txt'))).toBe(false)
  })

  it('retains an offline existing source folder while allowing another folder to become primary', () => {
    const f = fixture()
    rmSync(f.a, { recursive: true })
    expect(f.db.harness.updateProject(f.project.id, { name: 'Offline', roots: [f.a, f.b], primaryRoot: f.b }).roots).toHaveLength(2)
  })
})
