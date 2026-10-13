import { createWriteTool, createEditTool } from '@earendil-works/pi-agent-core'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraPaths } from '../electron/storage/miraPaths'
import { createSandboxedEnv, wrapHarnessTool } from '../electron/services/agentTools'
import { readMiraTaskFile } from '../electron/services/miraTaskChanges'
import { applyMiraFileRewind, buildMiraFileRewindPlan, compensateMiraFileRewind, previewMiraFileRewind, readMiraCheckpointFile, type MiraFileRewindJournal } from '../electron/services/miraFileRewind'
import { HarnessRuntime } from '../electron/services/harnessRuntime'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0)) await cleanup() })
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-file-rewind-'))), directory = join(root, 'project')
  mkdirSync(directory)
  const paths = new MiraPaths(root)
  let database = new PlatformDatabase(paths)
  const project = database.harness.createProject(directory), session = database.harness.createSession(project.id)
  const first = database.harness.addMessage(session.id, 'user', '第一轮').messages[0]!
  const env = createSandboxedEnv(directory)
  let sequence = 0
  const wrap = (tool: any, overrides: Record<string, any> = {}) => wrapHarnessTool(tool, { env }, {
    record: (tool, target) => { const id = `operation-${++sequence}`; database.harness.recordTool(session.id, { id, tool, target, status: 'running', createdAt: Date.now() }); return id },
    finish: (id, status) => database.harness.updateTool(session.id, id, { status }),
    readSnapshot: path => readMiraCheckpointFile(env, path),
    beforeSnapshot: (id, path, before) => database.harness.beginFileCheckpoint(session.id, id, path, before),
    afterSnapshot: (id, after) => database.harness.finishFileCheckpoint(session.id, id, after),
    snapshot: (id, path, before, after) => database.harness.recordTaskFileChange(session.id, id, { path, before, after }),
    target: params => params.path, ...overrides,
  })
  cleanups.push(async () => { await env.cleanup(); database.close(); rmSync(root, { recursive: true, force: true }) })
  const plan = (messageId = first.id) => buildMiraFileRewindPlan(database.harness.getSession(session.id), messageId, database.harness.fileRewindHistory(session.id, messageId))
  const hooks = {
    begin: (value: Awaited<ReturnType<typeof plan>>, messageId = first.id) => database.harness.beginFileRewind(session.id, messageId, value.directory!, value.operations),
    advance: (journal: MiraFileRewindJournal, cursor: number) => database.harness.advanceFileRewind(journal, cursor),
    commit: (journal: MiraFileRewindJournal) => database.harness.commitFileRewind(journal),
    rollback: (id: string) => database.harness.rollbackFileRewind(id),
  }
  return {
    root, paths, directory, project, session, first, env, wrap,
    get database() { return database },
    write: (path: string, content: string) => wrap(createWriteTool()).execute('write', { path, content }),
    edit: (path: string, oldText: string, newText: string) => wrap(createEditTool()).execute('edit', { path, edits: [{ oldText, newText }] }),
    addInput: (content: string) => database.harness.addMessage(session.id, 'user', content).messages.at(-1)!,
    preview: (messageId = first.id) => previewMiraFileRewind(database.harness.getSession(session.id), messageId, database.harness.fileRewindHistory(session.id, messageId)),
    plan, hooks,
    apply: async (messageId = first.id) => { const value = await plan(messageId); return applyMiraFileRewind(value, value.preview.snapshotToken!, { ...hooks, begin: () => hooks.begin(value, messageId) }) },
    reopen: () => { database.close(); database = new PlatformDatabase(paths) },
  }
}

describe('history edit with file restoration through the same host admission', () => {
  function editing(f: ReturnType<typeof fixture>) {
    const runtime = new HarnessRuntime(f.database, { getTools: () => [] } as any)
    const sender = { isDestroyed: () => false, send: vi.fn() } as any
    const provider = { id: 'provider' }, selection = { providerId: 'provider', modelId: 'model' }
    vi.spyOn(runtime as any, 'requireProvider').mockReturnValue({ provider, model: { id: 'model', multimodal: true }, apiKey: '' })
    vi.spyOn(runtime as any, 'assertImageModel').mockImplementation(() => {})
    vi.spyOn(runtime as any, 'assertPresentationInput').mockImplementation(() => {})
    vi.spyOn(runtime as any, 'resolvePromptCommand').mockReturnValue(undefined)
    const run = vi.spyOn(runtime as any, 'runAgent').mockImplementation(async (_sender: unknown, _id: unknown, updated: any) => {
      expect(f.database.harness.pendingFileRewinds()).toEqual([])
      return { content: updated.messages.at(-1).content }
    })
    return { runtime, run, sender, edit: (workspace?: { mode: 'preserve' } | { mode: 'rewind'; snapshotToken: string }, authorize = () => {}) => runtime.editAndRerun(sender, f.session.id, f.first.id, '修改后', selection, [], workspace, authorize) }
  }

  it('keeps current files for an ordinary edit and retains abandoned-branch checkpoints', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original'); await f.write('note.txt', 'first'); f.addInput('第二轮'); await f.write('note.txt', 'second')
    const v = editing(f); await v.edit({ mode: 'preserve' })
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('second')
    expect(f.database.harness.getSession(f.session.id).messages).toMatchObject([{ id: f.first.id, content: '修改后' }])
    expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id).records).toHaveLength(2)
    expect(v.run).toHaveBeenCalledOnce()
  })

  it('restores files and commits message truncation/retirement before starting one model run', async () => {
    const f = fixture(), original = '\ufefforiginal\r\n'; writeFileSync(join(f.directory, 'note.txt'), original); await f.write('note.txt', 'first'); f.addInput('第二轮'); await f.write('new.txt', 'second')
    const v = editing(f), token = (await f.preview()).snapshotToken!
    await v.edit({ mode: 'rewind', snapshotToken: token })
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe(original); expect(existsSync(join(f.directory, 'new.txt'))).toBe(false)
    expect(v.run).toHaveBeenCalledOnce(); expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id).records).toEqual([])
    expect(f.database.harness.getTaskChangeSummary(f.session.id)!.files.every(file => file.unchanged)).toBe(true)
    f.reopen(); expect(f.database.harness.getSession(f.session.id).messages).toMatchObject([{ id: f.first.id, content: '修改后', attachments: [] }])
  })

  it('returns conflict details without truncating, then allows explicit preserve-file fallback', async () => {
    const f = fixture(); await f.write('note.txt', 'agent'); f.addInput('后续要求')
    const history = f.database.harness.getSession(f.session.id), token = (await f.preview()).snapshotToken!, v = editing(f)
    writeFileSync(join(f.directory, 'note.txt'), 'outside')
    expect(await v.edit({ mode: 'rewind', snapshotToken: token })).toMatchObject({ disposition: 'blocked', preview: { canApply: false, unsafeFiles: [{ path: 'note.txt', reason: 'external_modified' }] } })
    expect(f.database.harness.getSession(f.session.id)).toEqual(history); expect(v.run).not.toHaveBeenCalled(); expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('outside')
    await v.edit({ mode: 'preserve' }); expect(v.run).toHaveBeenCalledOnce(); expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('outside')
  })

  it('rejects an old confirmation and revalidates the model after async planning', async () => {
    const f = fixture(); await f.write('note.txt', 'agent'); const v = editing(f), history = f.database.harness.getSession(f.session.id)
    expect(await v.edit({ mode: 'rewind', snapshotToken: '0'.repeat(64) })).toMatchObject({ disposition: 'blocked' })
    const token = (await f.preview()).snapshotToken!
    vi.mocked((v.runtime as any).requireProvider).mockImplementationOnce(() => ({ provider: {}, model: {}, apiKey: '' })).mockImplementationOnce(() => { throw new Error('model disabled') })
    await expect(v.edit({ mode: 'rewind', snapshotToken: token })).rejects.toThrow('model disabled')
    expect(f.database.harness.getSession(f.session.id)).toEqual(history); expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('agent'); expect(v.run).not.toHaveBeenCalled()
  })

  it('keeps the authoritative committed edit if writing its JSON backup fails', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original'); await f.write('note.txt', 'agent')
    const v = editing(f), token = (await f.preview()).snapshotToken!
    vi.spyOn(f.database.harness as any, 'writeSessionSnapshot').mockImplementation(() => { throw new Error('backup failed') })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await v.edit({ mode: 'rewind', snapshotToken: token })
    expect(v.run).toHaveBeenCalledOnce(); expect(warning).toHaveBeenCalledOnce(); expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('original')
    f.reopen(); expect(f.database.harness.getSession(f.session.id).messages[0].content).toBe('修改后'); expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id).records).toEqual([])
  })

  it('retains the accepted edit and restored files when the later model run fails', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original'); await f.write('note.txt', 'agent')
    const v = editing(f), token = (await f.preview()).snapshotToken!
    v.run.mockRejectedValueOnce(new Error('provider timeout'))
    await expect(v.edit({ mode: 'rewind', snapshotToken: token })).rejects.toThrow('provider timeout')
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('original'); expect(f.database.harness.getSession(f.session.id).messages[0].content).toBe('修改后')
    expect(f.database.harness.pendingFileRewinds()).toEqual([]); expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id).records).toEqual([])
  })

  it('rejects revoked grants and another active task before restoring or truncating', async () => {
    const f = fixture(); await f.write('note.txt', 'agent'); const v = editing(f), token = (await f.preview()).snapshotToken!, history = f.database.harness.getSession(f.session.id)
    let calls = 0
    await expect(v.edit({ mode: 'rewind', snapshotToken: token }, () => { if (++calls === 3) throw new Error('revoked') })).rejects.toThrow('revoked')
    const other = f.database.harness.createSession(f.project.id)
    vi.spyOn((v.runtime as any).runCoordinator, 'activeSessionIds').mockReturnValue([other.id])
    await expect(v.edit({ mode: 'rewind', snapshotToken: token })).rejects.toThrow('工作目录内的任务')
    expect(f.database.harness.getSession(f.session.id)).toEqual(history); expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('agent'); expect(v.run).not.toHaveBeenCalled()
  })

  it('compensates actual files and rolls back the whole SQLite edit if final journal commit fails', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original'); await f.write('note.txt', 'agent'); f.addInput('后续要求')
    const v = editing(f), token = (await f.preview()).snapshotToken!, history = f.database.harness.getSession(f.session.id)
    const path = (f.database as any).database.prepare('SELECT path FROM harness_sessions WHERE id = ?').get(f.session.id).path
    const backup = readFileSync(path, 'utf8')
    ;(f.database as any).database.exec("CREATE TRIGGER fail_edit_rewind BEFORE UPDATE OF status ON harness_file_rewinds WHEN NEW.status = 'committed' BEGIN SELECT RAISE(ABORT, 'disk commit failed'); END")
    expect(await v.edit({ mode: 'rewind', snapshotToken: token })).toMatchObject({ disposition: 'blocked' })
    expect(f.database.harness.getSession(f.session.id)).toEqual(history); expect(readFileSync(path, 'utf8')).toBe(backup)
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('agent'); expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id).records).toHaveLength(1)
    expect(f.database.harness.pendingFileRewinds()).toEqual([]); expect(v.run).not.toHaveBeenCalled()
    f.reopen(); expect(f.database.harness.getSession(f.session.id)).toEqual(history)
  })
})

describe('durable file checkpoints through actual tools and SQLite', () => {
  it('preserves UTF-8 BOM and CRLF bytes but refuses lossy binary decoding', async () => {
    const f = fixture(), original = '\ufeff首行\r\n末行\r\n'
    writeFileSync(join(f.directory, 'bom.txt'), original)
    await f.write('bom.txt', 'new')
    expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id).records[0].before).toBe(original)
    writeFileSync(join(f.directory, 'invalid.txt'), Buffer.from([0xff, 0x61]))
    await f.write('invalid.txt', 'new')
    expect((await f.preview()).unsafeFiles).toMatchObject([{ path: 'invalid.txt', reason: 'checkpoint_unavailable' }])
  })

  it('does not treat internal symlink aliases or later retargeting as restorable files', async () => {
    const f = fixture()
    writeFileSync(join(f.directory, 'first.txt'), 'same'); writeFileSync(join(f.directory, 'second.txt'), 'updated')
    symlinkSync('first.txt', join(f.directory, 'alias.txt'))
    await f.write('alias.txt', 'updated')
    rmSync(join(f.directory, 'alias.txt')); symlinkSync('second.txt', join(f.directory, 'alias.txt'))
    expect((await f.preview()).unsafeFiles).toMatchObject([{ path: 'alias.txt', reason: 'checkpoint_unavailable' }])
    expect(readFileSync(join(f.directory, 'second.txt'), 'utf8')).toBe('updated')
  })

  it('uses canonical input ownership even if the system clock moves backwards', async () => {
    const f = fixture(); f.database.harness.recordTool(f.session.id, { id: 'legacy', tool: 'write', target: 'legacy.txt', status: 'ok', createdAt: f.first.createdAt - 1000 })
    expect((await f.preview()).unsafeFiles).toMatchObject([{ path: 'legacy.txt', reason: 'checkpoint_missing' }])
  })
  it('captures bytes before execution and keeps per-input boundaries when timestamps are equal', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const f = fixture()
    writeFileSync(join(f.directory, 'note.txt'), 'original')
    const probe = f.wrap({ ...createWriteTool(), execute: async (...args: any[]) => {
      const history = f.database.harness.fileRewindHistory(f.session.id, f.first.id)
      expect(history.records).toMatchObject([{ messageId: f.first.id, before: 'original', settled: 0 }])
      return (createWriteTool().execute as any)(...args)
    } })
    await probe.execute('write', { path: 'note.txt', content: 'first result' })
    const second = f.addInput('第二轮'); await f.write('note.txt', 'second result')
    expect((await f.preview()).safeFiles).toEqual([{ path: 'note.txt', operationCount: 2, action: 'restore' }])
    expect((await f.preview(second.id)).safeFiles).toEqual([{ path: 'note.txt', operationCount: 1, action: 'restore' }])
    expect(f.database.harness.fileRewindHistory(f.session.id, second.id).records[0].before).toBe('first result')
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('second result')
  })

  it('freezes the input owner before another guided input is persisted during the file read', async () => {
    const f = fixture(); let secondId = ''
    await f.wrap(createWriteTool(), { readSnapshot: async (path: string) => { secondId ||= f.addInput('迟到指导').id; return readMiraTaskFile(f.env, path) } }).execute('write', { path: 'new.txt', content: 'new' })
    expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id).records[0].messageId).toBe(f.first.id)
    expect(f.database.harness.fileRewindHistory(f.session.id, secondId).records).toEqual([])
  })

  it('retains preserved descendant effects after history edit truncation and database restart', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original')
    await f.write('note.txt', 'first result'); f.addInput('后续轮'); await f.write('note.txt', 'later result')
    f.database.harness.editUserMessageAndTruncate(f.session.id, f.first.id, '改后的要求')
    f.reopen()
    expect((await f.preview()).safeFiles[0].operationCount).toBe(2)
    expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id).records[0].before).toBe('original')
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('later result')
  })

  it('returns only file metadata, distinguishes new files/deletions, and leaves all bytes untouched', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'old.txt'), 'private original credential')
    await f.write('new.txt', 'private new bytes')
    f.database.harness.recordTool(f.session.id, { id: 'delete', tool: 'delete', target: 'old.txt', status: 'running', createdAt: Date.now() })
    f.database.harness.beginFileCheckpoint(f.session.id, 'delete', 'old.txt', 'private original credential')
    f.database.harness.moveToTrash(f.session.id, 'old.txt')
    f.database.harness.recordTaskFileChange(f.session.id, 'delete', { path: 'old.txt', before: 'private original credential', after: null })
    f.database.harness.updateTool(f.session.id, 'delete', { status: 'ok' })
    const preview = await f.preview()
    expect(preview.safeFiles).toEqual([{ path: 'new.txt', operationCount: 1, action: 'delete' }, { path: 'old.txt', operationCount: 1, action: 'restore' }])
    expect(preview.canApply).toBe(true)
    expect(JSON.stringify(preview)).not.toMatch(/private|credential|before|after/)
    expect(readFileSync(join(f.directory, 'new.txt'), 'utf8')).toBe('private new bytes')
    expect(existsSync(join(f.directory, 'old.txt'))).toBe(false)
  })

  it('reports external modifications both after the last tool and between two tools', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original')
    await f.write('note.txt', 'first result'); writeFileSync(join(f.directory, 'note.txt'), 'outside edit')
    expect((await f.preview()).unsafeFiles).toMatchObject([{ reason: 'external_modified' }])
    await f.write('note.txt', 'second result')
    expect((await f.preview()).unsafeFiles).toMatchObject([{ reason: 'external_modified' }])
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('second result')
  })

  it('keeps a completed snapshot for a write that reports cancellation after changing disk', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original')
    const cancelled = f.wrap({ ...createWriteTool(), execute: async (...args: any[]) => { await (createWriteTool().execute as any)(...args); throw new Error('cancelled after write') } })
    await expect(cancelled.execute('write', { path: 'note.txt', content: 'written' })).rejects.toThrow('cancelled')
    expect((await f.preview()).safeFiles).toMatchObject([{ path: 'note.txt', action: 'restore' }])
    expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id).records[0]).toMatchObject({ before: 'original', after: 'written', settled: 1 })
  })

  it('marks interrupted capture after a real disk write and reopens without claiming safe recovery', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original')
    await expect(f.wrap(createWriteTool(), { afterSnapshot: () => { throw new Error('simulated persistence failure') } }).execute('write', { path: 'note.txt', content: 'written' })).rejects.toThrow('persistence')
    f.reopen()
    expect((await f.preview()).unsafeFiles).toMatchObject([{ reason: 'operation_interrupted' }])
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('written')
  })

  it('does not write if durable before-capture fails', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original')
    await expect(f.wrap(createWriteTool(), { beforeSnapshot: () => { throw new Error('snapshot storage unavailable') } }).execute('write', { path: 'note.txt', content: 'must not land' })).rejects.toThrow('storage unavailable')
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('original')
    expect((await f.preview()).unsafeFiles).toMatchObject([{ reason: 'checkpoint_missing' }])
  })

  it('marks unknown/large snapshots and legacy writes without inventing before bytes', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'large.txt'), 'x'.repeat(1024 * 1024 + 1))
    await f.write('large.txt', 'small final')
    f.database.harness.recordTool(f.session.id, { id: 'legacy', tool: 'write', target: 'legacy.txt', status: 'ok', createdAt: Date.now() })
    const preview = await f.preview()
    expect(preview.unsafeFiles).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'large.txt', reason: 'checkpoint_unavailable' }), expect.objectContaining({ path: 'legacy.txt', reason: 'checkpoint_missing' })]))
    expect(preview.canApply).toBe(false)
  })

  it('rejects another project and an outside symlink, while keeping the outside file unchanged', async () => {
    const f = fixture(); await f.write('note.txt', 'inside')
    writeFileSync(join(f.root, 'outside.txt'), 'outside')
    rmSync(join(f.directory, 'note.txt')); symlinkSync(join(f.root, 'outside.txt'), join(f.directory, 'note.txt'))
    expect((await f.preview()).unsafeFiles).toMatchObject([{ reason: 'file_read_failed' }])
    expect(readFileSync(join(f.root, 'outside.txt'), 'utf8')).toBe('outside')
    const other = join(f.root, 'other'); mkdirSync(other)
    const project = f.database.harness.createProject(other); f.database.harness.moveSession(f.session.id, project.id)
    expect((await f.preview()).unsafeFiles).toMatchObject([{ reason: 'workspace_changed' }])
  })

  it('reports terminal calls separately and does not inherit another task journal when forking', async () => {
    const f = fixture(); await f.write('new.txt', 'new')
    f.database.harness.recordTool(f.session.id, { id: 'shell', tool: 'bash', target: 'private shell args', status: 'ok', createdAt: Date.now() })
    expect((await f.preview()).ignoredTools).toEqual([{ name: '终端命令', count: 1 }])
    const reply = f.database.harness.appendAssistantText(f.session.id, '回复').messages.at(-1)!
    const fork = f.database.harness.forkConversation(f.session.id, reply.id, '12345678-1234-4123-8123-123456789abc')
    const user = fork.messages.find(message => message.role === 'user')!
    expect(f.database.harness.fileRewindHistory(fork.id, user.id).records).toEqual([])
    expect((await previewMiraFileRewind(fork, user.id, { records: [], limited: false })).safeFiles).toEqual([])
  })

  it('limits private snapshot materialization and deletes the journal with its owner', async () => {
    const f = fixture()
    for (let index = 0; index < 129; index++) {
      const id = `many-${index}`
      f.database.harness.recordTool(f.session.id, { id, tool: 'write', target: 'note.txt', status: 'ok', createdAt: Date.now() })
      f.database.harness.beginFileCheckpoint(f.session.id, id, 'note.txt', null); f.database.harness.finishFileCheckpoint(f.session.id, id, 'new')
    }
    expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id)).toEqual({ records: [], limited: true })
    expect((await f.preview()).unsafeFiles).toMatchObject([{ reason: 'history_limit' }])
    f.database.harness.deleteSession(f.session.id)
    const raw = new (await import('better-sqlite3')).default(f.paths.stateDatabase(), { readonly: true })
    try { expect(raw.prepare('SELECT count(*) AS count FROM harness_file_checkpoints WHERE session_id = ?').get(f.session.id)).toEqual({ count: 0 }) }
    finally { raw.close() }
  })
})

describe('real file restore, retirement and durable failure compensation', () => {
  it('does not mutate a file replaced with a hardlink after preview, or write outside a removed parent', async () => {
    const f = fixture(); await f.write('note.txt', 'agent')
    const plan = await f.plan(); writeFileSync(join(f.root, 'outside.txt'), 'agent')
    rmSync(join(f.directory, 'note.txt')); linkSync(join(f.root, 'outside.txt'), join(f.directory, 'note.txt'))
    expect(applyMiraFileRewind(plan, plan.preview.snapshotToken!, { ...f.hooks, begin: () => f.hooks.begin(plan) }).applied).toBe(false)
    expect(readFileSync(join(f.root, 'outside.txt'), 'utf8')).toBe('agent')
    mkdirSync(join(f.directory, 'child')); writeFileSync(join(f.directory, 'child/deleted.txt'), 'original')
    f.database.harness.recordTool(f.session.id, { id: 'delete', tool: 'delete', target: 'child/deleted.txt', status: 'ok', createdAt: Date.now() })
    f.database.harness.beginFileCheckpoint(f.session.id, 'delete', 'child/deleted.txt', 'original')
    rmSync(join(f.directory, 'child/deleted.txt')); f.database.harness.finishFileCheckpoint(f.session.id, 'delete', null)
    rmdirSync(join(f.directory, 'child'))
    expect((await f.preview()).unsafeFiles).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'child/deleted.txt', reason: 'file_read_failed' })]))
    expect(f.database.harness.pendingFileRewinds()).toEqual([])
  })

  it('rolls back checkpoint retirement and net statistics in an actual failing SQLite commit', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original'); await f.write('note.txt', 'agent')
    const raw = new (await import('better-sqlite3')).default(f.paths.stateDatabase())
    raw.exec("CREATE TRIGGER fail_rewind_summary BEFORE UPDATE ON harness_task_files BEGIN SELECT RAISE(ABORT, 'simulated summary persistence failure'); END")
    try {
      const result = await f.apply()
      expect(result.applied).toBe(false); expect(result.preview.recoveryId).toBeUndefined()
      expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('agent')
      expect(f.database.harness.fileRewindHistory(f.session.id, f.first.id).records).toHaveLength(1)
      expect((await f.preview()).canApply).toBe(true); expect(f.database.harness.pendingFileRewinds()).toEqual([])
    } finally { raw.exec('DROP TRIGGER fail_rewind_summary'); raw.close() }
  })
  it('restores exact original bytes, removes new files, retires checkpoints and refreshes net changes without touching history', async () => {
    const f = fixture(), original = '\ufeff原文\r\n末行\r\n'
    writeFileSync(join(f.directory, 'note.txt'), original)
    await f.write('note.txt', 'Model result'); await f.write('created.txt', 'New file')
    const before = f.database.harness.getSession(f.session.id)
    const result = await f.apply()
    expect(result.applied).toBe(true)
    expect(readFileSync(join(f.directory, 'note.txt'))).toEqual(Buffer.from(original))
    expect(existsSync(join(f.directory, 'created.txt'))).toBe(false)
    expect(f.database.harness.getSession(f.session.id)).toEqual(before)
    expect((await f.preview()).safeFiles).toEqual([]); expect((await f.preview()).unsafeFiles).toEqual([])
    expect(f.database.harness.getTaskChangeSummary(f.session.id, true)?.files.every(file => file.added === 0 && file.removed === 0)).toBe(true)
    expect(f.database.harness.pendingFileRewinds()).toEqual([])
    f.reopen(); expect((await f.preview()).canApply).toBe(false)
  })

  it('restores only the selected round, then an earlier round, and keeps future checkpoints coherent', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original')
    await f.write('note.txt', 'first'); await f.write('first-only.txt', 'first file')
    const second = f.addInput('第二轮'); await f.write('note.txt', 'second')
    expect((await f.apply(second.id)).applied).toBe(true)
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('first')
    expect(existsSync(join(f.directory, 'first-only.txt'))).toBe(true)
    f.addInput('第三轮'); await f.write('note.txt', 'third')
    expect((await f.apply()).applied).toBe(true)
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('original')
    expect(existsSync(join(f.directory, 'first-only.txt'))).toBe(false)
  })

  it('rejects a stale preview token after another tool without starting a journal or changing bytes', async () => {
    const f = fixture(); await f.write('note.txt', 'first')
    const token = (await f.plan()).preview.snapshotToken!
    await f.write('note.txt', 'second'); const latest = await f.plan()
    const result = applyMiraFileRewind(latest, token, { ...f.hooks, begin: () => f.hooks.begin(latest) })
    expect(result.applied).toBe(false); expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('second')
    expect(f.database.harness.pendingFileRewinds()).toEqual([])
  })

  it('revalidates every file before modifying the first, preserving an outside edit after preview', async () => {
    const f = fixture(); await f.write('first.txt', 'first'); await f.write('second.txt', 'second')
    const plan = await f.plan(); writeFileSync(join(f.directory, 'second.txt'), 'Outside user edit')
    const result = applyMiraFileRewind(plan, plan.preview.snapshotToken!, { ...f.hooks, begin: () => f.hooks.begin(plan) })
    expect(result.applied).toBe(false)
    expect(readFileSync(join(f.directory, 'first.txt'), 'utf8')).toBe('first')
    expect(readFileSync(join(f.directory, 'second.txt'), 'utf8')).toBe('Outside user edit')
    expect(f.database.harness.pendingFileRewinds()).toEqual([])
  })

  it('compensates all completed writes when durable commit fails, retaining active checkpoints', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'original')
    await f.write('note.txt', 'agent'); await f.write('created.txt', 'new')
    const plan = await f.plan()
    const result = applyMiraFileRewind(plan, plan.preview.snapshotToken!, { ...f.hooks, begin: () => f.hooks.begin(plan), commit: () => { throw new Error('SQLite commit unavailable') } })
    expect(result.applied).toBe(false); expect(result.preview.recoveryId).toBeUndefined()
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('agent')
    expect(readFileSync(join(f.directory, 'created.txt'), 'utf8')).toBe('new')
    expect((await f.preview()).canApply).toBe(true); expect(f.database.harness.pendingFileRewinds()).toEqual([])
  })

  it('preserves an outside edit during apply, journals incomplete compensation across restart, and permits explicit retry', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'first.txt'), 'first original'); writeFileSync(join(f.directory, 'second.txt'), 'second original')
    await f.write('first.txt', 'first agent'); await f.write('second.txt', 'second agent')
    const plan = await f.plan()
    const result = applyMiraFileRewind(plan, plan.preview.snapshotToken!, { ...f.hooks, begin: () => f.hooks.begin(plan), advance: (journal, cursor) => { f.hooks.advance(journal, cursor); if (cursor === 2) writeFileSync(join(f.directory, 'second.txt'), 'outside edit') } })
    expect(result.applied).toBe(false); expect(result.preview.recoveryId).toBeTruthy()
    expect(readFileSync(join(f.directory, 'first.txt'), 'utf8')).toBe('first agent')
    expect(readFileSync(join(f.directory, 'second.txt'), 'utf8')).toBe('outside edit')
    f.reopen()
    const runtime = new HarnessRuntime(f.database, { getTools: () => [] } as any), sender = { isDestroyed: () => false, send: () => {} } as any
    expect(() => runtime.assertSessionMutable(f.session.id)).toThrow('未完成的文件恢复')
    const preview = await runtime.previewFileRewind(f.session.id, f.first.id)
    expect(preview.recoveryId).toBe(result.preview.recoveryId)
    expect(runtime.recoverFileRewind(sender, f.session.id, preview.recoveryId!, () => {}).preview.recoveryId).toBeTruthy()
    expect(readFileSync(join(f.directory, 'second.txt'), 'utf8')).toBe('outside edit')
    writeFileSync(join(f.directory, 'second.txt'), 'second agent')
    expect(runtime.recoverFileRewind(sender, f.session.id, preview.recoveryId!, () => {}).preview.recoveryId).toBeUndefined()
    expect(() => runtime.assertSessionMutable(f.session.id)).not.toThrow()
    expect((await f.preview()).canApply).toBe(true)
  })

  it('reopens a crash journal and compensates only attempted operations, never later untouched files', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'first.txt'), 'original'); await f.write('first.txt', 'agent'); await f.write('later.txt', 'later agent')
    const plan = await f.plan(), journal = f.hooks.begin(plan)
    f.hooks.advance(journal, 1); writeFileSync(join(f.directory, 'first.txt'), 'original')
    writeFileSync(join(f.directory, 'later.txt'), 'outside later edit')
    f.reopen()
    const pending = f.database.harness.getPendingFileRewind(f.session.id, journal.id)
    expect(pending.cursor).toBe(1); expect(compensateMiraFileRewind(pending)).toEqual([])
    f.database.harness.rollbackFileRewind(journal.id)
    expect(readFileSync(join(f.directory, 'first.txt'), 'utf8')).toBe('agent')
    expect(readFileSync(join(f.directory, 'later.txt'), 'utf8')).toBe('outside later edit')
  })

  it('checks the grant after asynchronous planning and rejects another active task in the same directory', async () => {
    const f = fixture(); await f.write('note.txt', 'agent')
    const runtime = new HarnessRuntime(f.database, { getTools: () => [] } as any), sender = { isDestroyed: () => false, send: () => {} } as any
    const token = (await f.preview()).snapshotToken!
    let calls = 0
    await expect(runtime.applyFileRewind(sender, f.session.id, f.first.id, token, () => { if (++calls === 2) throw new Error('grant revoked') })).rejects.toThrow('grant revoked')
    const other = f.database.harness.createSession(f.project.id)
    vi.spyOn((runtime as any).runCoordinator, 'activeSessionIds').mockReturnValue([other.id])
    await expect(runtime.applyFileRewind(sender, f.session.id, f.first.id, token, () => {})).rejects.toThrow('工作目录内的任务')
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('agent'); expect(f.database.harness.pendingFileRewinds()).toEqual([])
  })

  it('rejects checkpoint changes during async planning even if the message history stayed identical', async () => {
    const f = fixture(); await f.write('note.txt', 'agent')
    const runtime = new HarnessRuntime(f.database, { getTools: () => [] } as any), sender = { isDestroyed: () => false, send: () => {} } as any
    const token = (await f.preview()).snapshotToken!
    let calls = 0
    await expect(runtime.applyFileRewind(sender, f.session.id, f.first.id, token, () => {
      if (++calls !== 2) return
      f.database.harness.recordTool(f.session.id, { id: 'later', tool: 'write', target: 'other.txt', status: 'ok', createdAt: Date.now() })
      f.database.harness.beginFileCheckpoint(f.session.id, 'later', 'other.txt', null); f.database.harness.finishFileCheckpoint(f.session.id, 'later', 'later')
    })).rejects.toThrow('任务已变化')
    expect(readFileSync(join(f.directory, 'note.txt'), 'utf8')).toBe('agent'); expect(f.database.harness.pendingFileRewinds()).toEqual([])
  })
})
