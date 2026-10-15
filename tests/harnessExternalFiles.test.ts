import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraPaths } from '../electron/storage/miraPaths'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import { previewMiraFileRewind } from '../electron/services/miraFileRewind'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
function fixture(role?: 'explorer') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-external-'))), directory = join(root, 'project')
  mkdirSync(directory)
  const database = new PlatformDatabase(new MiraPaths(join(root, 'home')))
  const project = database.harness.createProject(directory), session = database.harness.createSession(project.id)
  const message = database.harness.addMessage(session.id, 'user', '访问指定的外部资料').messages.at(-1)!
  const sender = { isDestroyed: () => false, send: vi.fn() }
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any)
  const tools = (runtime as any).tools(sender, session.id, { runId: 'external-test', ...(role ? { role, subtaskId: 'child' } : {}) })
  cleanups.push(() => { database.close(); rmSync(root, { recursive: true, force: true }) })
  let call = 0
  const signal = new AbortController().signal
  const prepare = (name: string, args: any, mode = 'default', automation = false) => {
    const id = `call-${++call}`
    const pending = tools.preflight(id, name, args, automation, mode, signal)
    return { pending, execute: () => tools.tools.find((tool: any) => tool.name === name).execute(id, args, signal) }
  }
  const approve = async (allowed: boolean) => {
    await vi.waitFor(() => expect(sender.send.mock.calls.some(call => call[1]?.type === 'permission-request')).toBe(true))
    const event = sender.send.mock.calls.filter(call => call[1]?.type === 'permission-request').at(-1)![1]
    ;(runtime as any).resolvePermission(event.payload.requestId, allowed)
    return event.payload
  }
  return { root, directory, database, session, message, sender, prepare, approve }
}
describe('Harness external file access', () => {
  it('requires default-mode approval, grants exactly the requested read, and does not remember it for the next call', async () => {
    const f = fixture(), path = join(f.root, 'outside.txt'); writeFileSync(path, 'external content')
    const first = f.prepare('read', { path })
    expect((await f.approve(true)).detail).toContain(path)
    expect(await first.pending).toBeUndefined()
    expect(JSON.stringify(await first.execute())).toContain('external content')
    f.sender.send.mockClear()
    const second = f.prepare('read', { path }); await f.approve(false)
    expect(await second.pending).toMatchObject({ block: true })
    await expect(second.execute()).rejects.toThrow('工具只能访问项目目录内的文件')
  })
  it('allows full-mode external read and listing without prompts', async () => {
    const f = fixture(), path = join(f.root, 'outside.txt'); writeFileSync(path, 'external content')
    for (const [name, target] of [['read', path], ['list_files', f.root]]) {
      const call = f.prepare(name, { path: target }, 'full')
      expect(await call.pending).toBeUndefined()
      expect(JSON.stringify(await call.execute())).toContain(name === 'read' ? 'external content' : 'outside.txt')
    }
    expect(f.sender.send.mock.calls.some(call => call[1]?.type === 'permission-request')).toBe(false)
  })
  it('edits an external file in full mode and does not grant its sibling', async () => {
    const f = fixture(), path = join(f.root, 'outside.txt'), sibling = join(f.root, 'sibling.txt')
    writeFileSync(path, 'old content'); writeFileSync(sibling, 'private sibling')
    const call = f.prepare('edit', { path, edits: [{ oldText: 'old', newText: 'new' }] }, 'full')
    expect(await call.pending).toBeUndefined(); await call.execute()
    expect(readFileSync(path, 'utf8')).toBe('new content')
    const denied = f.prepare('read', { path: sibling }); await f.approve(false)
    expect(await denied.pending).toMatchObject({ block: true })
    await expect(denied.execute()).rejects.toThrow('工具只能访问项目目录内的文件')
  })
  it('writes a new external file after approval, records changes, and reports that automatic rewind is unavailable', async () => {
    const f = fixture(), path = join(f.root, 'new', 'output.txt')
    const call = f.prepare('write', { path, content: 'created externally' })
    await f.approve(true); expect(await call.pending).toBeUndefined()
    await call.execute(); expect(readFileSync(path, 'utf8')).toBe('created externally')
    const summary = f.database.harness.getTaskChangeSummary(f.session.id, true)!
    expect(summary.files[0]).toMatchObject({ path, added: 1 })
    expect(summary.files[0].diff).toContain('created externally')
    const preview = await previewMiraFileRewind(f.database.harness.getSession(f.session.id), f.message.id, f.database.harness.fileRewindHistory(f.session.id, f.message.id))
    expect(preview.canApply).toBe(false)
    expect(preview.unsafeFiles[0]?.reason).toBe('external_path')
  })
  it('keeps in-project reads prompt-free and blocks unattended external reads in default mode', async () => {
    const f = fixture(); writeFileSync(join(f.directory, 'note.txt'), 'inside')
    const inside = f.prepare('read', { path: 'note.txt' }); expect(await inside.pending).toBeUndefined()
    expect(JSON.stringify(await inside.execute())).toContain('inside')
    const outside = f.prepare('read', { path: f.root }, 'default', true)
    expect(await outside.pending).toMatchObject({ block: true })
  })
  it('treats a new file through a project junction as external and rejects retargeting after approval', async () => {
    const f = fixture(), outside = join(f.root, 'outside'), other = join(f.root, 'other'), link = join(f.directory, 'linked')
    mkdirSync(outside); mkdirSync(other)
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    const path = join(link, 'new.txt'), call = f.prepare('write', { path, content: 'allowed' })
    const request = await f.approve(true)
    expect(request.detail).toContain('工作目录外文件')
    expect(await call.pending).toBeUndefined()
    rmSync(link); symlinkSync(other, link, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(call.execute()).rejects.toThrow('符号链接')
    expect(() => readFileSync(join(other, 'new.txt'))).toThrow()
  })
  it('applies the same external-read approval to explorer subtasks', async () => {
    const f = fixture('explorer'), path = join(f.root, 'outside.txt'); writeFileSync(path, 'child content')
    const call = f.prepare('read', { path }); await f.approve(true)
    expect(await call.pending).toBeUndefined()
    expect(JSON.stringify(await call.execute())).toContain('child content')
  })
  it('rejects a changed path during approval and requires a new request after a hook rewrites the target', async () => {
    const f = fixture(), path = join(f.root, 'outside.txt'), other = join(f.root, 'other.txt')
    writeFileSync(path, 'first'); writeFileSync(other, 'second')
    const args = { path }, call = f.prepare('read', args)
    await f.approve(true); args.path = other
    expect(await call.pending).toMatchObject({ block: true })
  })
})
