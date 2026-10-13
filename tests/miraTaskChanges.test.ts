import Database from 'better-sqlite3'
import { createEditTool, createWriteTool } from '@earendil-works/pi-agent-core'
import * as diff from 'diff'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSandboxedEnv, publicHarnessText, wrapHarnessTool } from '../electron/services/agentTools'
import { buildMiraTaskFileChange, readMiraTaskFile } from '../electron/services/miraTaskChanges'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraPaths } from '../electron/storage/miraPaths'
import { miraTaskLineChanges } from '../src/config/miraTaskChanges'

vi.mock('diff', async importOriginal => {
  const actual = await importOriginal<typeof import('diff')>()
  return { ...actual, createTwoFilesPatch: vi.fn(actual.createTwoFilesPatch) }
})

const cleanups: Array<() => Promise<void>> = []
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-task-changes-')))
  const projectDirectory = join(root, 'project'); mkdirSync(projectDirectory)
  const paths = new MiraPaths(root)
  let database = new PlatformDatabase(paths)
  const project = database.harness.createProject(projectDirectory)
  const session = database.harness.createSession(project.id)
  database.harness.addMessage(session.id, 'user', 'Retain this task on restart')
  const env = createSandboxedEnv(projectDirectory)
  let sequence = 0
  const secrets = ['mira-fixture-credential-98765']
  function tool(tool: ReturnType<typeof createWriteTool> | ReturnType<typeof createEditTool>) {
    return wrapHarnessTool(tool, { env }, {
      record: (name, target) => {
        const id = `operation-${++sequence}`
        database.harness.recordTool(session.id, { id, tool: name, target, status: 'running', createdAt: sequence })
        return id
      },
      finish: (id, status, text) => database.harness.updateTool(session.id, id, { status, ...(text ? { diff: publicHarnessText(text, secrets).text } : {}) }),
      readSnapshot: path => readMiraTaskFile(env, path),
      snapshot: (id, path, before, after) => database.harness.recordTaskFileChange(session.id, id, { path, before, after }, secrets),
      target: params => params.path,
    })
  }
  const write = tool(createWriteTool()), edit = tool(createEditTool())
  cleanups.push(async () => { await env.cleanup(); database.close(); rmSync(root, { recursive: true, force: true }) })
  return {
    root, paths, projectDirectory, session, env, secrets,
    get database() { return database },
    wrap: tool,
    write: (path: string, content: string) => write.execute('write', { path, content }),
    edit: (path: string, oldText: string, newText: string) => edit.execute('edit', { path, edits: [{ oldText, newText }] }),
    summary: (includeDiff = true) => database.harness.getTaskChangeSummary(session.id, includeDiff),
    reopen: () => { database.close(); database = new PlatformDatabase(paths) },
    remove: async (path: string) => {
      const before = await readMiraTaskFile(env, path), id = `operation-${++sequence}`
      database.harness.recordTool(session.id, { id, tool: 'delete', target: path, status: 'running', createdAt: sequence })
      const result = await env.remove(path); expect(result.ok).toBe(true)
      database.harness.recordTaskFileChange(session.id, id, { path, before, after: null }, secrets)
      database.harness.updateTool(session.id, id, { status: 'ok' })
    },
  }
}

afterEach(async () => {
  vi.mocked(diff.createTwoFilesPatch).mockReset()
  vi.mocked(diff.createTwoFilesPatch).mockImplementation((await vi.importActual<typeof import('diff')>('diff')).createTwoFilesPatch)
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe('bounded task line statistics', () => {
  it('distinguishes exact unchanged bytes from creation of an empty file and newline-only edits', () => {
    expect(buildMiraTaskFileChange('a', 'same.txt', 'edit', 2, '\ufeffold\r\n', '\ufeffold\r\n', [])).toMatchObject({ unchanged: true, added: 0, removed: 0 })
    expect(buildMiraTaskFileChange('b', 'empty.txt', 'write', 1, null, '', []).unchanged).toBeUndefined()
    expect(buildMiraTaskFileChange('c', 'newline.txt', 'edit', 1, 'old\n', 'old', []).unchanged).toBeUndefined()
  })
  it.each([
    [null, 'one\ntwo\n', 2, 0], ['one\ntwo\n', null, 0, 2],
    ['one\ntwo\n', 'one\ntwo', 0, 0],
    ['same\nsame\ntail\n', 'same\nnew\nsame\ntail\n', 1, 0],
    ['head\na\nb\na\ntail\n', 'head\nb\na\nb\ntail\n', 1, 1],
    ['\n', '', 0, 1], ['', '\n', 1, 0],
  ])('computes logical changes for %j → %j', (before, after, added, removed) => {
    expect(miraTaskLineChanges(before, after)).toEqual({ added, removed })
  })

  it('marks a bounded fallback as estimated rather than asserting an exact LCS', () => {
    const before = Array.from({ length: 700 }, (_, index) => `old-${index}`).join('\n')
    const after = Array.from({ length: 700 }, (_, index) => `new-${index}`).join('\n')
    expect(miraTaskLineChanges(before, after)).toEqual({ added: 700, removed: 700, estimated: true })
  })
})

describe('persistent task-owned net changes through real write/edit tools', () => {
  it('counts the first-to-last snapshot, preserves operation history, and reaches zero on revert', async () => {
    const f = fixture(), initial = 'head\nold\ntail\n'
    writeFileSync(join(f.projectDirectory, 'note.txt'), initial)
    await f.edit('note.txt', 'old', 'new')
    await f.edit('note.txt', 'new', 'latest\nextra')
    expect(readFileSync(join(f.projectDirectory, 'note.txt'), 'utf8')).toBe('head\nlatest\nextra\ntail\n')
    expect(f.summary()).toMatchObject({ added: 2, removed: 1, incomplete: false, files: [{ path: 'note.txt', writes: 2, added: 2, removed: 1 }] })
    expect(f.summary()!.files[0]!.diff).toContain('-old')
    expect(f.summary()!.files[0]!.diff).not.toContain('+new\n')
    expect(f.database.harness.getSession(f.session.id).toolCalls.filter(tool => tool.status === 'ok')).toHaveLength(2)
    await f.write('note.txt', initial)
    expect(f.summary()).toMatchObject({ added: 0, removed: 0, incomplete: false, files: [{ writes: 3 }] })
    expect(f.summary()!.files[0]!.diff).toBe('')
  })

  it('returns a compact correctly located net patch for a small edit deep inside a large file', async () => {
    const f = fixture()
    const lines = Array.from({ length: 15_000 }, (_, index) => `line-${index + 1} ${'context'.repeat(5)}`)
    const initial = `${lines.join('\n')}\n`
    writeFileSync(join(f.projectDirectory, 'large-context.txt'), initial)
    await f.edit('large-context.txt', lines[7_999]!, 'updated line 8000')
    const file = f.summary()!.files[0]!
    expect(file).toMatchObject({ added: 1, removed: 1 })
    expect(file.diffTruncated).not.toBe(true)
    expect(file.diff).toContain('@@ -7997,7 +7997,7 @@')
    expect(file.diff).toContain(`-${lines[7_999]}`)
    expect(file.diff).toContain('+updated line 8000')
    expect(file.diff).not.toContain(lines[0]!); expect(file.diff).not.toContain(lines.at(-1)!)
    expect(Buffer.byteLength(file.diff!)).toBeLessThan(2048)
  })

  it('uses a missing-file baseline for creation and a known empty final state for deletion', async () => {
    const f = fixture()
    await f.write('nested/new.txt', 'first\nsecond\n')
    expect(f.summary()).toMatchObject({ added: 2, removed: 0, files: [{ path: 'nested/new.txt', tool: 'write' }] })
    await f.remove('nested/new.txt')
    expect(f.summary()).toMatchObject({ added: 0, removed: 0, incomplete: false, files: [{ tool: 'delete', writes: 2 }] })
    writeFileSync(join(f.projectDirectory, 'existing.txt'), 'removed\nlines\n')
    await f.remove('existing.txt')
    expect(f.summary()).toMatchObject({ added: 0, removed: 2, files: [{ path: 'existing.txt', added: 0, removed: 2 }, { path: 'nested/new.txt', added: 0, removed: 0 }] })
  })

  it('retains no-op coverage so later writes do not get mistaken for unknown legacy edits', async () => {
    const f = fixture()
    writeFileSync(join(f.projectDirectory, 'same.txt'), 'original\n')
    await f.write('same.txt', 'original\n')
    const noOp = f.summary()
    expect(noOp?.incomplete ?? false).toBe(false)
    expect(noOp?.added ?? 0).toBe(0); expect(noOp?.removed ?? 0).toBe(0)
    await f.write('same.txt', 'changed\n')
    expect(f.summary()).toMatchObject({ added: 1, removed: 1, incomplete: false })
  })

  it('never manufactures baselines for old successful operations, and counts their operation history', async () => {
    const f = fixture()
    for (const id of ['legacy-1', 'legacy-2']) f.database.harness.recordTool(f.session.id, { id, tool: 'edit', target: 'legacy.txt', status: 'ok', createdAt: 1 })
    f.database.harness.recordTool(f.session.id, { id: 'failed', tool: 'write', target: 'failed.txt', status: 'failed', createdAt: 2 })
    expect(f.summary()).toMatchObject({ added: 0, removed: 0, incomplete: true, files: [{ path: 'legacy.txt', writes: 2, unavailable: true }] })
    writeFileSync(join(f.projectDirectory, 'legacy.txt'), 'already changed\n')
    await f.write('legacy.txt', 'new version\n')
    expect(f.summary()).toMatchObject({ added: 0, removed: 0, incomplete: true, files: [{ path: 'legacy.txt', writes: 3, unavailable: true }] })
    expect(f.summary()!.files[0]!.diff).toBeUndefined()
  })

  it('keeps an unreadable initial baseline unknown after later readable writes and a restart', async () => {
    const f = fixture()
    writeFileSync(join(f.projectDirectory, 'binary.txt'), Buffer.from([65, 0, 66]))
    await f.write('binary.txt', 'readable now\n')
    expect(f.summary()).toMatchObject({ incomplete: true, added: 0, removed: 0, files: [{ path: 'binary.txt', writes: 1, unavailable: true }] })
    f.reopen()
    await f.write('binary.txt', 'second readable version\nextra\n')
    expect(f.summary()).toMatchObject({ incomplete: true, added: 0, removed: 0, files: [{ writes: 2, unavailable: true }] })
    expect(f.summary()!.files[0]!.diff).toBeUndefined()
  })

  it('keeps separate task baselines even when both tasks edit the same physical file', async () => {
    const f = fixture()
    writeFileSync(join(f.projectDirectory, 'shared.txt'), 'first baseline\n')
    await f.write('shared.txt', 'first result\n')
    const other = f.database.harness.createSession(f.session.projectId)
    f.database.harness.recordTool(other.id, { id: 'other-write', tool: 'write', target: 'shared.txt', status: 'running', createdAt: 2 })
    f.database.harness.recordTaskFileChange(other.id, 'other-write', { path: 'shared.txt', before: 'first result\n', after: 'other result\nnew line\n' })
    f.database.harness.updateTool(other.id, 'other-write', { status: 'ok' })
    expect(f.database.harness.getTaskChangeSummary(other.id)).toMatchObject({ added: 2, removed: 1, files: [{ writes: 1 }] })
    expect(f.summary()).toMatchObject({ added: 1, removed: 1, files: [{ writes: 1 }] })
    f.database.harness.deleteSession(other.id)
    expect(f.summary()).toMatchObject({ added: 1, removed: 1, files: [{ writes: 1 }] })
  })

  it('preserves captured file identity when a task moves to another project with the same relative filename', async () => {
    const f = fixture()
    writeFileSync(join(f.projectDirectory, 'shared.txt'), 'project A baseline\n')
    await f.write('shared.txt', 'project A result\n')
    const directoryB = join(f.root, 'project-b'); mkdirSync(directoryB)
    writeFileSync(join(directoryB, 'shared.txt'), 'project B baseline\n')
    const projectB = f.database.harness.createProject(directoryB)
    f.database.harness.moveSession(f.session.id, projectB.id)
    expect(f.summary()).toMatchObject({ added: 1, removed: 1, incomplete: false })
    expect(f.summary()!.files).toHaveLength(1)
    const envB = createSandboxedEnv(directoryB)
    try {
      const before = await readMiraTaskFile(envB, 'shared.txt')
      f.database.harness.recordTool(f.session.id, { id: 'project-b-write', tool: 'write', target: 'shared.txt', status: 'running', createdAt: 2 })
      await createWriteTool().execute('project-b-write', { path: 'shared.txt', content: 'project B result\nextra\n' }, undefined, undefined, { env: envB })
      f.database.harness.recordTaskFileChange(f.session.id, 'project-b-write', { path: 'shared.txt', before, after: await readMiraTaskFile(envB, 'shared.txt') })
      f.database.harness.updateTool(f.session.id, 'project-b-write', { status: 'ok' })
    } finally { await envB.cleanup() }
    const summary = f.summary()!
    expect(summary).toMatchObject({ added: 3, removed: 2, incomplete: false })
    expect(summary.files).toHaveLength(2)
    expect(new Set(summary.files.map(file => file.path)).size).toBe(2)
    expect(new Set(summary.files.map(file => file.key)).size).toBe(2)
    expect(summary.files.every(file => file.writes === 1)).toBe(true)
    expect(summary.files.find(file => file.path === 'shared.txt')).toMatchObject({ added: 2, removed: 1 })
    f.reopen()
    expect(f.summary()).toEqual(summary)
  })

  it('captures a completed disk mutation even when cancellation rejects the tool before its successful return', async () => {
    const f = fixture(), controller = new AbortController(), upstream = createWriteTool()
    writeFileSync(join(f.projectDirectory, 'cancelled.txt'), 'before cancellation\n')
    const tool = f.wrap({ ...upstream, execute: async (...args: Parameters<typeof upstream.execute>) => {
      await upstream.execute(...args)
      controller.abort()
      throw new Error('Operation aborted after disk mutation')
    } })
    await expect(tool.execute('cancelled', { path: 'cancelled.txt', content: 'persisted despite cancellation\nextra\n' }, controller.signal)).rejects.toThrow('Operation aborted')
    expect(readFileSync(join(f.projectDirectory, 'cancelled.txt'), 'utf8')).toBe('persisted despite cancellation\nextra\n')
    expect(f.database.harness.getSession(f.session.id).toolCalls).toMatchObject([{ status: 'failed' }])
    expect(f.summary()).toMatchObject({ added: 2, removed: 1, incomplete: false, files: [{ path: 'cancelled.txt', writes: 1 }] })
  })

  it('keeps public filenames unambiguous after moving a task through three projects', async () => {
    const f = fixture()
    writeFileSync(join(f.projectDirectory, 'shared.txt'), 'A baseline\n')
    await f.write('shared.txt', 'A result\n')
    for (const name of ['B', 'C']) {
      const directory = join(f.root, `project-${name}`); mkdirSync(directory)
      writeFileSync(join(directory, 'shared.txt'), `${name} baseline\n`)
      const project = f.database.harness.createProject(directory)
      f.database.harness.moveSession(f.session.id, project.id)
      const env = createSandboxedEnv(directory)
      try {
        const id = `write-${name}`, before = await readMiraTaskFile(env, 'shared.txt')
        f.database.harness.recordTool(f.session.id, { id, tool: 'write', target: 'shared.txt', status: 'running', createdAt: 2 })
        await createWriteTool().execute(id, { path: 'shared.txt', content: `${name} result\n` }, undefined, undefined, { env })
        f.database.harness.recordTaskFileChange(f.session.id, id, { path: 'shared.txt', before, after: await readMiraTaskFile(env, 'shared.txt') })
        f.database.harness.updateTool(f.session.id, id, { status: 'ok' })
      } finally { await env.cleanup() }
    }
    const summary = f.summary()!
    expect(summary).toMatchObject({ added: 3, removed: 3, incomplete: false })
    expect(summary.files).toHaveLength(3)
    expect(new Set(summary.files.map(file => file.key)).size).toBe(3)
    expect(new Set(summary.files.map(file => file.path)).size).toBe(3)
    expect(summary.files.filter(file => file.path === 'shared.txt')).toHaveLength(1)
    f.reopen()
    expect(f.summary()).toEqual(summary)
  })

  it('does not count a rejected edit or a filesystem escape as a successful change', async () => {
    const f = fixture()
    writeFileSync(join(f.projectDirectory, 'note.txt'), 'untouched\n')
    await expect(f.edit('note.txt', 'missing region', 'replacement')).rejects.toThrow()
    await expect(f.write('../outside.txt', 'escape')).rejects.toThrow()
    expect(f.summary()).toBeUndefined()
    expect(readFileSync(join(f.projectDirectory, 'note.txt'), 'utf8')).toBe('untouched\n')
    expect(f.database.harness.getSession(f.session.id).toolCalls.every(tool => tool.status === 'failed')).toBe(true)
  })

  it('isolates inherited fork history while new branch operations acquire their own baseline', async () => {
    const f = fixture()
    writeFileSync(join(f.projectDirectory, 'branch.txt'), 'parent baseline\n')
    await f.write('branch.txt', 'parent result\n')
    const source = f.database.harness.getSession(f.session.id)
    source.messages.push({ id: 'reply', role: 'assistant', content: 'Finished', createdAt: 10, parts: [{ id: 'tool-part', type: 'tool', toolCallId: 'operation-1' }] })
    f.database.harness.updateSession(source)
    const fork = f.database.harness.forkConversation(source.id, 'reply', '12345678-1234-4234-8234-123456789abc')
    expect(fork.toolCalls).toMatchObject([{ id: 'operation-1', inherited: true }])
    expect(f.database.harness.getTaskChangeSummary(fork.id)).toBeUndefined()
    f.database.harness.recordTool(fork.id, { id: 'branch-write', tool: 'write', target: 'branch.txt', status: 'running', createdAt: 11 })
    f.database.harness.recordTaskFileChange(fork.id, 'branch-write', { path: 'branch.txt', before: 'parent result\n', after: 'branch result\nextra\n' })
    f.database.harness.updateTool(fork.id, 'branch-write', { status: 'ok' })
    expect(f.database.harness.getTaskChangeSummary(fork.id)).toMatchObject({ added: 2, removed: 1, incomplete: false, files: [{ writes: 1 }] })
    expect(f.summary()).toMatchObject({ added: 1, removed: 1, files: [{ writes: 1 }] })
  })

  it('persists a private baseline across restart without exposing it in public records and removes it on task deletion', async () => {
    const f = fixture(), secret = f.secrets[0]!
    writeFileSync(join(f.projectDirectory, 'private.txt'), `baseline-private-marker\n${secret}\n`)
    await f.write('private.txt', `public result\n${secret}\n`)
    const inspect = new Database(f.paths.stateDatabase(), { readonly: true })
    try { expect(inspect.prepare('SELECT first_content FROM harness_task_files WHERE session_id = ?').get(f.session.id)).toMatchObject({ first_content: `baseline-private-marker\n${secret}\n` }) }
    finally { inspect.close() }
    const publicData = JSON.stringify({ summary: f.summary(), session: f.database.harness.getSession(f.session.id), list: f.database.harness.listSessions() })
    expect(publicData).not.toContain(secret); expect(publicData).not.toContain('first_content')
    const list = f.database.harness.listSessions().find(row => row.id === f.session.id)!
    expect(list.changeSummary!.files[0]!.diff).toBeUndefined()
    expect(list.changeSummary).toMatchObject({ added: 1, removed: 1, incomplete: false })
    const beforeRestart = f.summary()
    f.reopen()
    expect(f.summary()).toEqual(beforeRestart)
    await f.write('private.txt', `next result\n${secret}\n`)
    expect(f.summary()).toMatchObject({ added: 1, removed: 1, files: [{ writes: 2 }] })
    f.database.harness.deleteSession(f.session.id)
    const deleted = new Database(f.paths.stateDatabase(), { readonly: true })
    try { expect(deleted.prepare('SELECT COUNT(*) AS count FROM harness_task_files WHERE session_id = ?').get(f.session.id)).toEqual({ count: 0 }) }
    finally { deleted.close() }
  })

  it('retains honest timeout metadata when the diff algorithm cannot return a result', async () => {
    const f = fixture()
    f.database.harness.recordTool(f.session.id, { id: 'timeout', tool: 'write', target: 'timeout.txt', status: 'running', createdAt: 1 })
    vi.mocked(diff.createTwoFilesPatch).mockReturnValueOnce(undefined as never)
    f.database.harness.recordTaskFileChange(f.session.id, 'timeout', { path: 'timeout.txt', before: 'old\n', after: 'new\n' })
    f.database.harness.updateTool(f.session.id, 'timeout', { status: 'ok' })
    expect(f.summary()).toMatchObject({ added: 1, removed: 1, files: [{ diffTruncated: true }] })
    expect(f.summary()!.files[0]!.diff).toBeUndefined()
  })

  it('caps total public diff transfer at 64 KiB without losing file counts or individual truncation flags', async () => {
    const f = fixture()
    for (let index = 0; index < 4; index++) await f.write(`${index}.txt`, `${'汉'.repeat(20_000)}\n`)
    const summary = f.summary()!
    expect(summary).toMatchObject({ added: 4, removed: 0, incomplete: false })
    expect(summary.files).toHaveLength(4)
    expect(summary.files.reduce((bytes, file) => bytes + Buffer.byteLength(file.diff || ''), 0)).toBeLessThanOrEqual(64 * 1024)
    expect(summary.files.some(file => !file.diff && file.diffTruncated)).toBe(true)
    expect(summary.files.flatMap(file => file.diff ? [file.diff] : []).join('')).not.toContain('\uFFFD')
  })
})

describe('safe host snapshot boundaries', () => {
  it('distinguishes missing, binary, too-large, directory and denied paths', async () => {
    const f = fixture()
    writeFileSync(join(f.projectDirectory, 'binary.dat'), Buffer.from([65, 0, 66]))
    writeFileSync(join(f.projectDirectory, 'large.txt'), 'x'.repeat(1024 * 1024 + 1))
    mkdirSync(join(f.projectDirectory, 'directory'))
    writeFileSync(join(f.root, 'outside.txt'), 'private outside project')
    symlinkSync(join(f.root, 'outside.txt'), join(f.projectDirectory, 'escape.txt'))
    expect(await readMiraTaskFile(f.env, 'missing.txt')).toBeNull()
    for (const path of ['binary.dat', 'large.txt', 'directory', '../outside.txt', 'escape.txt']) expect(await readMiraTaskFile(f.env, path)).toBeUndefined()
    expect(buildMiraTaskFileChange('file', 'binary.dat', 'write', 1, undefined, 'result', [])).toEqual({ key: 'file', path: 'binary.dat', tool: 'write', writes: 1, unavailable: true })
  })
})
