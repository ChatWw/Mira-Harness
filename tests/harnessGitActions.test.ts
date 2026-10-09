import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlatformDatabase } from '../electron/storage/database'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
import { FirstPartyGrantStore } from '../electron/security/firstPartyGrant'
import { firstPartyAppManifests } from '../src/config/firstPartyApps'
import * as workspaceGit from '../electron/services/harnessWorkspaceGit'
import * as childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'

const electron = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => unknown) => electron.handlers.set(name, handler) }, BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null }, dialog: {}, shell: {} }))
import { registerHarnessProjectIpcHandlers } from '../electron/ipc/harnessProjectIpc'
import { registerPlatformIpcHandlers } from '../electron/ipc/platformIpc'

vi.mock('node:child_process', async importOriginal => { const actual = await importOriginal<typeof import('node:child_process')>(); return { ...actual, execFile: vi.fn(actual.execFile) } })

const cleanup: Array<() => unknown> = []
afterEach(async () => { vi.restoreAllMocks(); vi.clearAllMocks(); electron.handlers.clear(); for (const close of cleanup.splice(0).reverse()) await close() })
function git(directory: string, ...args: string[]) { return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', timeout: 5000 }).trim() }
async function pauseGit() {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  let release!: () => void, ready!: () => void
  const paused = new Promise<void>(done => { ready = done })
  vi.mocked(childProcess.execFile).mockImplementationOnce(((file: string, args: string[], options: any, callback: any) => actual.execFile(file, args, options, (error, stdout, stderr) => {
    release = () => callback(error, stdout, stderr); ready()
  })) as typeof childProcess.execFile)
  return { paused, release: () => release() }
}
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'mira-git-action-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'project'); await mkdir(directory)
  git(directory, 'init', '--initial-branch=main'); git(directory, 'config', 'user.name', 'Mira Test'); git(directory, 'config', 'user.email', 'mira@example.test')
  await writeFile(join(directory, 'note.txt'), 'original\n'); git(directory, 'add', '.'); git(directory, 'commit', '-m', 'fixture'); git(directory, 'branch', 'topic')
  const database = new PlatformDatabase(join(root, 'state')); cleanup.push(() => database.close())
  const project = database.harness.createProject(directory), session = database.harness.createSession(project.id)
  const runtime = new HarnessRuntime(database, {} as never)
  registerHarnessProjectIpcHandlers({ database, harnessRuntime: runtime } as never)
  const invoke = (name: string, ...params: unknown[]) => Promise.resolve().then(() => electron.handlers.get(name)!({ sender: {} }, ...params))
  return { root, directory, database, runtime, project, session, invoke }
}

describe('controlled project Git actions', () => {
  it('rejects the legacy checkout before touching a repository while another project session is reserved', async () => {
    const view = await setup()
    const token = (view.runtime as any).runCoordinator.reserve(view.session.id)
    try {
      await expect(view.invoke('harness:checkout-git-branch', view.project.id, 'topic')).rejects.toThrow('请先停止项目任务并处理待发送消息')
      expect(git(view.directory, 'branch', '--show-current')).toBe('main')
      expect(await readFile(join(view.directory, 'note.txt'), 'utf8')).toBe('original\n')
    } finally { (view.runtime as any).runCoordinator.release(view.session.id, token) }
  })

  it('reads authoritative branches, switches cleanly and creates a new Mira branch without a model', async () => {
    const { directory, runtime, project } = await setup()
    const initial = await runtime.getGitContext(project.id)
    expect(initial).toMatchObject({ projectId: project.id, directory, isRepository: true, headType: 'branch', branchName: 'main', uncommittedFileCount: 0, mutationBlocked: false })
    expect(initial.snapshotToken).toMatch(/^[a-f0-9]{64}$/)
    expect(initial.branches).toEqual([{ name: 'main', current: true }, { name: 'topic', current: false }])
    const switched = await runtime.checkoutGitBranch(project.id, 'topic', initial.snapshotToken)
    expect(switched.branchName).toBe('topic'); expect(switched.snapshotToken).not.toBe(initial.snapshotToken)
    const created = await runtime.createGitBranch(project.id, 'mira/new-task', switched.snapshotToken)
    expect(created.branchName).toBe('mira/new-task'); expect(git(directory, 'branch', '--show-current')).toBe('mira/new-task')
  })

  it('preserves the old Vue branch-array response while using the guarded asynchronous service', async () => {
    const { directory, project, invoke } = await setup()
    const switched = await invoke('harness:checkout-git-branch', project.id, 'topic')
    expect(switched).toEqual([{ name: 'main', current: false }, { name: 'topic', current: true }])
    expect(await invoke('harness:create-and-checkout-git-branch', project.id, 'mira/vue')).toContainEqual({ name: 'mira/vue', current: true })
    expect(git(directory, 'branch', '--show-current')).toBe('mira/vue')
  })

  it('does not force, discard, stash or write files when a dirty conflict blocks checkout', async () => {
    const { directory, runtime, project } = await setup()
    git(directory, 'switch', 'topic'); await writeFile(join(directory, 'note.txt'), 'topic\n'); git(directory, 'add', '.'); git(directory, 'commit', '-m', 'topic'); git(directory, 'switch', 'main')
    await writeFile(join(directory, 'note.txt'), 'unsaved user change\n')
    const before = await readFile(join(directory, '.git/index')), context = await runtime.getGitContext(project.id)
    expect(context.uncommittedFileCount).toBe(1); expect(context.branches.find(branch => branch.current)?.uncommittedFileCount).toBe(1)
    await expect(runtime.checkoutGitBranch(project.id, 'topic', context.snapshotToken)).rejects.toThrow('本地更改阻止切换分支')
    expect(await readFile(join(directory, 'note.txt'), 'utf8')).toBe('unsaved user change\n')
    expect(await readFile(join(directory, '.git/index'))).toEqual(before)
    expect(git(directory, 'branch', '--show-current')).toBe('main'); expect(git(directory, 'stash', 'list')).toBe('')
    expect(runtime.isProjectRunning(project.id)).toBe(false)
  })

  it('reports detached HEAD without inventing a current branch and can create a branch from it', async () => {
    const { directory, runtime, project } = await setup()
    git(directory, 'switch', '--detach')
    const context = await runtime.getGitContext(project.id)
    expect(context.headType).toBe('detached'); expect(context.branchName).toBeUndefined(); expect(context.commit).toMatch(/^[a-f0-9]{40}$/)
    expect(context.branches.every(branch => !branch.current)).toBe(true)
    expect((await runtime.createGitBranch(project.id, 'mira/detached', context.snapshotToken)).headType).toBe('branch')
  })

  it('handles non-repositories and unborn branches explicitly', async () => {
    const { root, database, runtime } = await setup()
    const directory = join(root, 'unborn'); await mkdir(directory)
    const project = database.harness.createProject(directory)
    const empty = await runtime.getGitContext(project.id)
    expect(empty).toMatchObject({ isRepository: false, headType: 'none', branches: [], uncommittedFileCount: 0 })
    await expect(runtime.checkoutGitBranch(project.id, 'main', empty.snapshotToken)).rejects.toThrow('项目不是 Git 仓库')
    git(directory, 'init', '--initial-branch=mira/first')
    const unborn = await runtime.getGitContext(project.id)
    expect(unborn).toMatchObject({ isRepository: true, headType: 'unborn', branchName: 'mira/first', branches: [] })
    expect(unborn.commit).toBeUndefined()
    await expect(runtime.createGitBranch(project.id, 'mira/next', unborn.snapshotToken)).rejects.toThrow('请先创建首次提交')
  })

  it.each(['-f', '--detach', '@{-1}', 'main~1', 'HEAD', 'main:note.txt', 'mira/..', 'mira/'])('rejects unsafe branch input %s without changing HEAD', async branch => {
    const { directory, project, runtime } = await setup(), context = await runtime.getGitContext(project.id)
    await expect(runtime.createGitBranch(project.id, branch, context.snapshotToken)).rejects.toThrow('分支')
    expect(git(directory, 'branch', '--show-current')).toBe('main')
  })

  it('rejects duplicate and unavailable local branches without remote guessing', async () => {
    const { directory, project, runtime } = await setup(), context = await runtime.getGitContext(project.id)
    await expect(runtime.createGitBranch(project.id, 'main', context.snapshotToken)).rejects.toThrow('分支已存在')
    await expect(runtime.checkoutGitBranch(project.id, 'missing', context.snapshotToken)).rejects.toThrow('未找到本地分支')
    expect(git(directory, 'branch', '--show-current')).toBe('main')
  })

  it('rejects a stale HEAD token before performing a second branch change', async () => {
    const { directory, project, runtime } = await setup(), context = await runtime.getGitContext(project.id)
    git(directory, 'switch', 'topic')
    await expect(runtime.createGitBranch(project.id, 'mira/stale', context.snapshotToken)).rejects.toThrow('Git 工作区或分支已变化')
    expect(git(directory, 'branch', '--show-current')).toBe('topic'); expect(git(directory, 'branch', '--list', 'mira/stale')).toBe('')
  })

  it('rejects a replaced workspace even when it has the same branch and commit', async () => {
    const { root, directory, project, runtime } = await setup(), context = await runtime.getGitContext(project.id)
    const original = join(root, 'original'); await rename(directory, original)
    git(root, 'clone', original, directory)
    await expect(runtime.checkoutGitBranch(project.id, 'topic', context.snapshotToken)).rejects.toThrow('Git 工作区或分支已变化')
    expect(git(directory, 'branch', '--show-current')).toBe('main')
  })

  it('holds project admission across every awaited Git operation and releases it on failure', async () => {
    const { directory, project, session, runtime } = await setup(), context = await runtime.getGitContext(project.id)
    let unblock!: () => void
    const gate = new Promise<void>(done => { unblock = done })
    vi.spyOn(workspaceGit, 'changeHarnessGitBranch').mockImplementationOnce(async () => { await gate; throw new Error('authorization failed') })
    const mutation = runtime.createGitBranch(project.id, 'mira/guard', context.snapshotToken)
    const rejected = expect(mutation).rejects.toThrow('authorization failed')
    expect(runtime.isProjectRunning(project.id)).toBe(true)
    const add = vi.spyOn((runtime as any).database.harness, 'addMessage')
    expect(() => runtime.submitMessage({} as never, session.id, 'send', 'Message', [], { providerId: 'missing', modelId: 'missing' }, false)).toThrow('项目正在切换分支')
    await expect(runtime.runMessage({} as never, session.id, 'Message')).rejects.toThrow('项目正在切换分支')
    await expect(runtime.rerun({} as never, session.id)).rejects.toThrow('项目正在切换分支')
    await expect(runtime.editAndRerun({} as never, session.id, 'm', 'Edit')).rejects.toThrow('项目正在切换分支')
    await expect(runtime.runAutomation(session.id, 'Message', { providerId: 'missing', modelId: 'missing' }, 'default')).rejects.toThrow('项目正在切换分支')
    expect(() => (runtime as any).runCoordinator.reserve(session.id)).toThrow('项目正在切换分支')
    expect(() => runtime.assertSessionMutable(session.id)).toThrow('项目正在切换分支')
    expect(add).not.toHaveBeenCalled()
    unblock(); await rejected
    expect(runtime.isProjectRunning(project.id)).toBe(false); expect(git(directory, 'branch', '--show-current')).toBe('main')
    expect(() => (runtime as any).runCoordinator.reserve(session.id)).not.toThrow()
  })

  it('rejects paused backlog and atomic preparing promotion across all project sessions', async () => {
    const { directory, database, project, runtime } = await setup()
    const second = database.harness.createSession(project.id)
    const context = await runtime.getGitContext(project.id)
    for (const state of [{ items: [{}], paused: 'stopped' }, { items: [], promotion: { atomic: true } }]) {
      ;(runtime as any).messageQueue.sessions.set(second.id, state)
      expect((await runtime.getGitContext(project.id)).mutationBlocked).toBe(true)
      await expect(runtime.checkoutGitBranch(project.id, 'topic', context.snapshotToken)).rejects.toThrow('请先停止项目任务并处理待发送消息')
      await expect(runtime.createGitBranch(project.id, 'mira/busy', context.snapshotToken)).rejects.toThrow('请先停止项目任务并处理待发送消息')
    }
    expect(git(directory, 'branch', '--show-current')).toBe('main')
  })

  it('protects another project registered in the same repository subtree', async () => {
    const { directory, database, project, runtime } = await setup()
    const child = join(directory, 'nested'); await mkdir(child)
    const nested = database.harness.createProject(child), session = database.harness.createSession(nested.id)
    const token = (runtime as any).runCoordinator.reserve(session.id)
    const context = await runtime.getGitContext(project.id)
    expect(context.mutationBlocked).toBe(true)
    await expect(runtime.checkoutGitBranch(project.id, 'topic', context.snapshotToken)).rejects.toThrow('请先停止项目任务并处理待发送消息')
    expect(git(directory, 'branch', '--show-current')).toBe('main')
    ;(runtime as any).runCoordinator.release(session.id, token)
    expect((await runtime.getGitContext(project.id)).mutationBlocked).toBe(false)
  })

  it('blocks conservatively without leaking a missing active workspace path', async () => {
    const { root, database, project, runtime } = await setup()
    const directory = join(root, 'missing-active'); await mkdir(directory)
    const other = database.harness.createProject(directory), session = database.harness.createSession(other.id)
    const token = (runtime as any).runCoordinator.reserve(session.id)
    await rm(directory, { recursive: true })
    const context = await runtime.getGitContext(project.id)
    expect(context.mutationBlocked).toBe(true)
    await expect(runtime.checkoutGitBranch(project.id, 'topic', context.snapshotToken)).rejects.toThrow('请先停止项目任务并处理待发送消息')
    ;(runtime as any).runCoordinator.release(session.id, token)
  })

  it('keeps new work from entering a sibling project while a Git mutation occupies the shared repository', async () => {
    const { directory, database, project, runtime } = await setup()
    await mkdir(join(directory, 'first')); await mkdir(join(directory, 'second'))
    const first = database.harness.createProject(join(directory, 'first')), second = database.harness.createProject(join(directory, 'second'))
    const session = database.harness.createSession(second.id), context = await runtime.getGitContext(first.id)
    let entered!: () => void, release!: () => void
    const enteredRepository = new Promise<void>(done => { entered = done }), gate = new Promise<void>(done => { release = done })
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
    let held = false
    vi.mocked(childProcess.execFile).mockImplementation(((file: string, args: string[], options: any, callback: any) => actual.execFile(file, args, options, (error, stdout, stderr) => {
      if (args.includes('symbolic-ref') && !held) { held = true; entered(); void gate.then(() => callback(error, stdout, stderr)) }
      else callback(error, stdout, stderr)
    })) as typeof childProcess.execFile)
    const change = runtime.checkoutGitBranch(first.id, 'topic', context.snapshotToken)
    await enteredRepository
    expect(() => (runtime as any).runCoordinator.reserve(session.id)).toThrow('项目正在切换分支')
    expect(() => runtime.submitMessage({} as never, session.id, 'sibling', '/perm full', [], {} as never, false)).toThrow('项目正在切换分支')
    await expect(runtime.checkoutGitBranch(project.id, 'topic', (await runtime.getGitContext(project.id)).snapshotToken)).rejects.toThrow('请先停止项目任务并处理待发送消息')
    release(); await change
    expect(git(directory, 'branch', '--show-current')).toBe('topic')
    expect(() => (runtime as any).runCoordinator.reserve(session.id)).not.toThrow()
  })

  it('rejects a workspace replacement while Git I/O is awaiting and leaves both copies untouched', async () => {
    const { root, directory, runtime, project } = await setup(), context = await runtime.getGitContext(project.id), paused = await pauseGit()
    const pending = runtime.checkoutGitBranch(project.id, 'topic', context.snapshotToken), rejected = expect(pending).rejects.toThrow('工作目录已变化')
    await paused.paused
    const original = join(root, 'awaited-original'); await rename(directory, original); git(root, 'clone', original, directory)
    paused.release(); await rejected
    expect(git(original, 'branch', '--show-current')).toBe('main'); expect(git(directory, 'branch', '--show-current')).toBe('main')
  })

  it('rechecks the registered project directory after await, not a client supplied path', async () => {
    const { root, directory, database, runtime, project } = await setup(), context = await runtime.getGitContext(project.id), paused = await pauseGit()
    let registered = directory
    vi.spyOn(database.harness, 'getProjectDirectory').mockImplementation(() => registered)
    const pending = runtime.createGitBranch(project.id, 'mira/rebound', context.snapshotToken), rejected = expect(pending).rejects.toThrow('Git 工作区或分支已变化')
    await paused.paused; registered = join(root, 'other'); paused.release(); await rejected
    expect(git(directory, 'branch', '--show-current')).toBe('main'); expect(git(directory, 'branch', '--list', 'mira/rebound')).toBe('')
  })

  it('rejects symbolic .git metadata instead of following it for a mutation', async () => {
    const { root, directory, runtime, project } = await setup(), context = await runtime.getGitContext(project.id)
    const metadata = join(root, 'metadata'); await rename(join(directory, '.git'), metadata); await symlink(metadata, join(directory, '.git'), 'dir')
    await expect(runtime.checkoutGitBranch(project.id, 'topic', context.snapshotToken)).rejects.toThrow('Git 元数据不能使用符号链接')
    expect(git(directory, 'branch', '--show-current')).toBe('main')
  })

  it('does not run repository checkout hooks or expose raw Git stderr from a failed action', async () => {
    const { directory, runtime, project } = await setup()
    const hook = join(directory, '.git/hooks/post-checkout'), hookOutput = join(directory, 'hook-output')
    await writeFile(hook, '#!/bin/sh\nprintf unexpected > hook-output\n'); await chmod(hook, 0o755)
    const context = await runtime.getGitContext(project.id)
    await runtime.checkoutGitBranch(project.id, 'topic', context.snapshotToken)
    await expect(readFile(hookOutput)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(git(directory, 'branch', '--show-current')).toBe('topic')
    git(directory, 'switch', 'main'); git(directory, 'worktree', 'add', join(directory, 'other-worktree'), 'topic')
    const current = await runtime.getGitContext(project.id)
    await expect(runtime.checkoutGitBranch(project.id, 'topic', current.snapshotToken)).rejects.toThrow('Git 分支操作失败，请检查工作区状态后重试')
  })

  it('whitelists the new bridge DTO and rejects missing or malformed snapshot tokens', () => {
    expect(parseFirstPartyHarnessCall('git.context', { projectId: 'p', directory: '/injected' })).toEqual({ method: 'git.context', projectId: 'p' })
    const input = { projectId: 'p', branch: 'mira/topic', snapshotToken: 'a'.repeat(64) }
    expect(parseFirstPartyHarnessCall('git.checkout', { ...input, force: true, stash: true, directory: '/injected' })).toEqual({ method: 'git.checkout', ...input })
    expect(parseFirstPartyHarnessCall('git.checkout', parseFirstPartyHarnessCall('git.checkout', input))).toEqual({ method: 'git.checkout', ...input })
    for (const snapshotToken of [undefined, '', 'A'.repeat(64), 'a'.repeat(65)]) expect(() => parseFirstPartyHarnessCall('git.create-branch', { ...input, snapshotToken })).toThrow('Git 快照')
  })

  it('revalidates first-party authorization before the Git mutation and never exposes a legacy store write bypass', async () => {
    const { directory, database, runtime, project } = await setup()
    const context = await runtime.getGitContext(project.id), grants = new FirstPartyGrantStore()
    const sender = Object.assign(new EventEmitter(), { id: 7, isDestroyed: () => false })
    const grant = grants.issue('mira-harness', sender.id, ['harness:workbench'])
    registerPlatformIpcHandlers({ database, harnessRuntime: runtime, firstPartyGrantStore: grants, firstPartyManifests: firstPartyAppManifests } as never)
    const handler = electron.handlers.get('platform:first-party-harness')!, legacyWrite = vi.spyOn(database.harness, 'checkoutGitBranch')
    const pending = handler({ sender }, grant, 'git.checkout', { projectId: project.id, branch: 'topic', snapshotToken: context.snapshotToken })
    grants.revoke(grant, sender.id)
    await expect(pending).rejects.toThrow('授权无效')
    expect(git(directory, 'branch', '--show-current')).toBe('main'); expect(legacyWrite).not.toHaveBeenCalled()
  })
})
