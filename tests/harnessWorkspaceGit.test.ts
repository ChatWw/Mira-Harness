import { afterEach, describe, expect, it, vi } from 'vitest'
import * as childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readHarnessWorkspaceGit, readHarnessWorkspaceIgnored } from '../electron/services/harnessWorkspaceGit'

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFile: vi.fn(actual.execFile) }
})

const roots: string[] = []
async function workspace() { const root = await realpath(await mkdtemp(join(tmpdir(), 'mira-workspace-git-'))); roots.push(root); return root }
async function git(root: string, ...args: string[]) {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return new Promise<string>((resolve, reject) => actual.execFile('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000 }, (error, stdout) => error ? reject(error) : resolve(stdout)))
}
async function repository() {
  const root = await workspace()
  await git(root, 'init', '--initial-branch=main')
  await git(root, 'config', 'user.name', 'Mira Test')
  await git(root, 'config', 'user.email', 'mira@example.test')
  return root
}
async function commit(root: string) { await git(root, 'add', '--all'); await git(root, 'commit', '--allow-empty', '-m', 'fixture') }
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('controlled workspace Git snapshots', () => {
  it('reads modified, staged added, renamed, deleted, empty and binary untracked files without changing the index', async () => {
    const root = await repository()
    for (const path of ['modified.txt', 'rename.txt', 'deleted.txt']) await writeFile(join(root, path), `${path}\n`)
    await commit(root)
    await writeFile(join(root, 'modified.txt'), 'changed\n')
    await writeFile(join(root, 'added.txt'), 'added\n')
    await git(root, 'add', '--', 'added.txt')
    await git(root, 'mv', '--', 'rename.txt', 'renamed.txt')
    await rm(join(root, 'deleted.txt'))
    await writeFile(join(root, 'empty.txt'), '')
    await writeFile(join(root, 'binary.dat'), Buffer.from([0, 1, 2]))
    const before = await readFile(join(root, '.git/index'))
    expect(await readHarnessWorkspaceGit(root)).toEqual({ available: true, entries: [
      { path: 'added.txt', status: 'added' }, { path: 'binary.dat', status: 'untracked' }, { path: 'deleted.txt', status: 'deleted' },
      { path: 'empty.txt', status: 'untracked' }, { path: 'modified.txt', status: 'modified' }, { path: 'renamed.txt', status: 'renamed' },
    ] })
    expect(await readFile(join(root, '.git/index'))).toEqual(before)
  })

  it('preserves Unicode, spaces, newlines and option-like names including both rename records', async () => {
    const root = await repository()
    await writeFile(join(root, 'old\n名字.txt'), 'rename fixture\n')
    await commit(root)
    await git(root, 'mv', '--', 'old\n名字.txt', 'new\n名字.txt')
    for (const path of ['-flag.txt', '含 空格.txt', 'tab\tfile.txt', ':glob[*].txt']) await writeFile(join(root, path), 'new')
    const snapshot = await readHarnessWorkspaceGit(root)
    expect(snapshot.entries).toEqual(expect.arrayContaining([
      { path: 'new\n名字.txt', status: 'renamed' }, { path: '-flag.txt', status: 'untracked' },
      { path: '含 空格.txt', status: 'untracked' }, { path: 'tab\tfile.txt', status: 'untracked' }, { path: ':glob[*].txt', status: 'untracked' },
    ]))
    expect(snapshot.entries).toHaveLength(5)
  })

  it('keeps only the selected subtree when the repository root is its parent', async () => {
    const root = await repository()
    await mkdir(join(root, 'app'))
    await writeFile(join(root, 'app/inside.txt'), 'inside\n')
    await writeFile(join(root, 'outside.txt'), 'outside\n')
    await commit(root)
    await writeFile(join(root, 'app/inside.txt'), 'change inside\n')
    await writeFile(join(root, 'outside.txt'), 'change outside\n')
    await writeFile(join(root, 'app/untracked.txt'), '')
    expect(await readHarnessWorkspaceGit(join(root, 'app'))).toEqual({ available: true, entries: [
      { path: 'inside.txt', status: 'modified' }, { path: 'untracked.txt', status: 'untracked' },
    ] })
  })

  it('does not leak the destination of a rename out of the workspace', async () => {
    const root = await repository()
    await mkdir(join(root, 'app'))
    await writeFile(join(root, 'app/old.txt'), 'rename fixture\n')
    await commit(root)
    await git(root, 'mv', '--', 'app/old.txt', 'outside.txt')
    expect(await readHarnessWorkspaceGit(join(root, 'app'))).toEqual({ available: true, entries: [{ path: 'old.txt', status: 'deleted' }] })
  })

  it('maps a real unresolved merge conflict to modified instead of untracked', async () => {
    const root = await repository()
    await writeFile(join(root, 'conflict.txt'), 'base\n')
    await commit(root)
    await git(root, 'switch', '-c', 'topic')
    await writeFile(join(root, 'conflict.txt'), 'topic\n')
    await commit(root)
    await git(root, 'switch', 'main')
    await writeFile(join(root, 'conflict.txt'), 'main\n')
    await commit(root)
    await git(root, 'merge', 'topic').catch(() => undefined)
    expect(await readHarnessWorkspaceGit(root)).toEqual({ available: true, entries: [{ path: 'conflict.txt', status: 'modified' }] })
  })

  it('keeps staged added over unstaged modified when one file has both states', async () => {
    const root = await repository()
    await writeFile(join(root, 'added.txt'), 'staged\n')
    await git(root, 'add', '--', 'added.txt')
    await writeFile(join(root, 'added.txt'), 'unstaged\n')
    expect(await readHarnessWorkspaceGit(root)).toEqual({ available: true, entries: [{ path: 'added.txt', status: 'added' }] })
  })

  it('returns unavailable for a real non-repository instead of showing a clean Git tree', async () => {
    expect(await readHarnessWorkspaceGit(await workspace())).toEqual({ available: false, entries: [] })
  })

  it('supports a linked worktree with a regular .git file but rejects a .git symlink', async () => {
    const root = await repository()
    await commit(root)
    const holder = await workspace()
    const linked = join(holder, 'linked')
    await git(root, 'worktree', 'add', '-b', 'linked', linked)
    await writeFile(join(linked, 'new.txt'), '')
    expect(await readHarnessWorkspaceGit(linked)).toEqual({ available: true, entries: [{ path: 'new.txt', status: 'untracked' }] })
    const alias = await workspace()
    await symlink(join(root, '.git'), join(alias, '.git'))
    await expect(readHarnessWorkspaceGit(alias)).rejects.toThrow('Git 元数据不能使用符号链接')
  })

  it('isolates Git from inherited repository environment overrides', async () => {
    const root = await repository()
    const outside = await repository()
    await writeFile(join(root, 'ours.txt'), '')
    await writeFile(join(outside, 'secret.txt'), '')
    vi.stubEnv('GIT_DIR', join(outside, '.git'))
    vi.stubEnv('GIT_WORK_TREE', outside)
    vi.stubEnv('GIT_INDEX_FILE', join(outside, '.git/index'))
    vi.stubEnv('GIT_CONFIG_COUNT', '1')
    vi.stubEnv('GIT_CONFIG_KEY_0', 'core.worktree')
    vi.stubEnv('GIT_CONFIG_VALUE_0', outside)
    expect(await readHarnessWorkspaceGit(root)).toEqual({ available: true, entries: [{ path: 'ours.txt', status: 'untracked' }] })
    const calls = vi.mocked(childProcess.execFile).mock.calls
    expect(calls.every(call => (call[2] as { env: NodeJS.ProcessEnv }).env.GIT_DIR === undefined)).toBe(true)
    expect(calls.every(call => (call[2] as { env: NodeJS.ProcessEnv }).env.GIT_CONFIG_VALUE_0 === undefined)).toBe(true)
    expect(calls.every(call => call[1].includes('--no-optional-locks') && call[1].includes('core.fsmonitor=false'))).toBe(true)
  })

  it('discovers a parent repository from a child workspace despite inherited discovery overrides', async () => {
    const root = await repository()
    const child = join(root, 'app/deep')
    await mkdir(child, { recursive: true })
    await writeFile(join(child, 'ours.txt'), '')
    vi.stubEnv('GIT_CEILING_DIRECTORIES', join(root, 'app'))
    vi.stubEnv('GIT_DISCOVERY_ACROSS_FILESYSTEM', '1')
    expect(await readHarnessWorkspaceGit(child)).toEqual({ available: true, entries: [{ path: 'ours.txt', status: 'untracked' }] })
    const calls = vi.mocked(childProcess.execFile).mock.calls
    expect(calls.every(call => (call[2] as { env: NodeJS.ProcessEnv }).env.GIT_CEILING_DIRECTORIES === undefined)).toBe(true)
    expect(calls.every(call => (call[2] as { env: NodeJS.ProcessEnv }).env.GIT_DISCOVERY_ACROSS_FILESYSTEM === undefined)).toBe(true)
  })
})

describe('exact workspace Git ignored paths', () => {
  it('uses real Git rules, negation and tracked-file behavior without treating names as options', async () => {
    const root = await repository()
    await writeFile(join(root, 'tracked.log'), 'tracked\n')
    await commit(root)
    await writeFile(join(root, '.gitignore'), '*.log\n!keep.log\ncache/\n-flag.txt\n含 空格.txt\n')
    await mkdir(join(root, 'cache'))
    for (const path of ['tracked.log', 'ignored.log', 'keep.log', '-flag.txt', '含 空格.txt', 'cache/a.txt']) await writeFile(join(root, path), 'new')
    expect(await readHarnessWorkspaceIgnored(root, ['tracked.log', 'ignored.log', 'keep.log', '-flag.txt', '含 空格.txt', 'cache', 'cache/a.txt', 'ignored.log'])).toEqual([
      'ignored.log', '-flag.txt', '含 空格.txt', 'cache', 'cache/a.txt',
    ])
    expect(await readHarnessWorkspaceIgnored(root, ['keep.log', 'tracked.log'])).toEqual([])
  })

  it('preserves tabs and newlines through NUL-delimited stdin and output', async () => {
    const root = await repository()
    await writeFile(join(root, '.gitignore'), '*.txt\n')
    for (const path of ['new\n名字.txt', 'tab\tname.txt', ':glob[*].txt']) await writeFile(join(root, path), '')
    expect(await readHarnessWorkspaceIgnored(root, ['new\n名字.txt', 'tab\tname.txt', ':glob[*].txt'])).toEqual(['new\n名字.txt', 'tab\tname.txt', ':glob[*].txt'])
  })

  it('uses ancestor ignore rules for a subtree without exposing its parent paths', async () => {
    const root = await repository()
    await writeFile(join(root, '.gitignore'), '*.log\n')
    await mkdir(join(root, 'app'))
    await writeFile(join(root, 'app/a.log'), '')
    expect(await readHarnessWorkspaceIgnored(join(root, 'app'), ['a.log'])).toEqual(['a.log'])
  })

  it('does not apply an outer repository ignore rule to nested repository files', async () => {
    const root = await repository()
    await writeFile(join(root, '.gitignore'), '*.log\n')
    await mkdir(join(root, 'nested'))
    await git(join(root, 'nested'), 'init', '--initial-branch=main')
    await writeFile(join(root, 'nested/a.log'), '')
    expect(await readHarnessWorkspaceIgnored(root, ['nested/a.log'])).toEqual([])
    expect((await readHarnessWorkspaceGit(root)).entries).not.toContainEqual({ path: 'nested/a.log', status: 'untracked' })
    expect((await readHarnessWorkspaceGit(join(root, 'nested'))).entries).toContainEqual({ path: 'a.log', status: 'untracked' })
  })

  it('rejects traversal, absolute, schemes, symlinks outside root and excessive input before running a command', async () => {
    const root = await repository()
    const outside = await workspace()
    await writeFile(join(outside, 'secret.txt'), '')
    await symlink(outside, join(root, 'external'))
    for (const paths of [['../secret'], ['/tmp'], ['C:/secret'], ['file:secret'], ['a\\b'], ['a\0b'], ['a'.repeat(2049)], Array.from({ length: 513 }, () => 'a')]) {
      await expect(readHarnessWorkspaceIgnored(root, paths)).rejects.toThrow('路径无效')
    }
    await expect(readHarnessWorkspaceIgnored(root, ['external/secret.txt'])).rejects.toThrow('工作目录')
    expect(childProcess.execFile).not.toHaveBeenCalled()
  })
})

function fakeGit() {
  type Failure = Error & { code?: number | string; killed?: boolean }
  const pending: Array<{ child: ReturnType<typeof childProcess.execFile>; callback: (error: Failure | null, stdout: Buffer, stderr: Buffer) => void }> = []
  vi.mocked(childProcess.execFile).mockImplementation(((...args: unknown[]) => {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true) }) as unknown as ReturnType<typeof childProcess.execFile>
    pending.push({ child, callback: args[3] as typeof pending[number]['callback'] })
    return child
  }) as typeof childProcess.execFile)
  const finish = (index: number, stdout = '', error: Failure | null = null, stderr = '') => {
    pending[index].callback(error, Buffer.from(stdout), Buffer.from(stderr))
    pending[index].child.emit('close', error ? 1 : 0, null)
  }
  return { pending, finish }
}

describe('Git command budgets and stale roots', () => {
  it('reports missing Git and command failures with stable, redacted errors', async () => {
    const root = await repository()
    const fake = fakeGit()
    const missing = readHarnessWorkspaceGit(root)
    await vi.waitFor(() => expect(fake.pending).toHaveLength(1))
    fake.finish(0, '', Object.assign(new Error('ENOENT /private/secret/token'), { code: 'ENOENT' }))
    await expect(missing).rejects.toThrow('Git 未安装或不可用')
    const failed = readHarnessWorkspaceGit(root)
    await vi.waitFor(() => expect(fake.pending).toHaveLength(2))
    fake.finish(1, '', Object.assign(new Error('private secret failure'), { code: 128 }), 'fatal: dubious ownership /private/secret/token')
    await expect(failed).rejects.toThrow(/^Git 状态读取失败，请重试$/)
  })

  it('keeps at most two commands running and does not release their slots before close', async () => {
    const roots = await Promise.all(Array.from({ length: 3 }, repository))
    const fake = fakeGit()
    const requests = roots.map(root => readHarnessWorkspaceGit(root).catch(error => error))
    await vi.waitFor(() => expect(fake.pending).toHaveLength(2))
    fake.pending[0].callback(Object.assign(new Error('overflow'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }), Buffer.alloc(0), Buffer.alloc(0))
    await new Promise(resolve => setTimeout(resolve, 25))
    expect(fake.pending).toHaveLength(2)
    fake.pending[0].child.emit('close', 1, 'SIGKILL')
    await vi.waitFor(() => expect(fake.pending).toHaveLength(3))
    fake.finish(1, '', Object.assign(new Error('failure'), { code: 128 }))
    fake.finish(2, '', Object.assign(new Error('failure'), { code: 128 }))
    expect((await Promise.all(requests)).map(result => result.message)).toContain('Git 输出超过 8 MiB 限制，请缩小工作目录')
    expect((vi.mocked(childProcess.execFile).mock.calls[0][2] as { timeout: number; maxBuffer: number; killSignal: string })).toMatchObject({ timeout: 10_000, maxBuffer: 8 * 1024 * 1024, killSignal: 'SIGKILL' })
  })

  it('rejects a replaced root even when a stale command returns successfully', async () => {
    const root = await repository()
    const fake = fakeGit()
    const request = readHarnessWorkspaceGit(root)
    await vi.waitFor(() => expect(fake.pending).toHaveLength(1))
    const displaced = `${root}-old`
    roots.push(displaced)
    await rename(root, displaced)
    await mkdir(root)
    fake.finish(0, `${root}\n`)
    await expect(request).rejects.toThrow('工作目录已变化')
  })

  it('rejects a timed-out command only after its process closes', async () => {
    const root = await repository()
    const fake = fakeGit()
    let settled = false
    const request = readHarnessWorkspaceGit(root).catch(error => { settled = true; return error })
    await vi.waitFor(() => expect(fake.pending).toHaveLength(1))
    fake.pending[0].callback(Object.assign(new Error('private timeout'), { code: null, killed: true }), Buffer.alloc(0), Buffer.alloc(0))
    await new Promise(resolve => setTimeout(resolve, 25))
    expect(settled).toBe(false)
    fake.pending[0].child.emit('close', null, 'SIGKILL')
    expect((await request).message).toBe('Git 状态读取超时，请重试')
  })

  it('bounds the waiting queue instead of admitting unbounded parallel requests', async () => {
    const root = await repository()
    const fake = fakeGit()
    const failures: string[] = []
    const requests = Array.from({ length: 19 }, () => readHarnessWorkspaceGit(root).catch(error => { failures.push(error.message); return error }))
    await vi.waitFor(() => expect(failures).toContain('Git 状态读取繁忙，请稍后重试'))
    expect(fake.pending).toHaveLength(2)
    for (let index = 0; index < 18; index++) {
      await vi.waitFor(() => expect(fake.pending.length).toBeGreaterThan(index))
      fake.finish(index, '', Object.assign(new Error('private failure'), { code: 128 }))
    }
    await Promise.all(requests)
    expect(failures).toHaveLength(19)
    expect(fake.pending).toHaveLength(18)
  })

  it('rejects incomplete NUL status output instead of showing partial success', async () => {
    const root = await repository()
    const fake = fakeGit()
    const request = readHarnessWorkspaceGit(root)
    await vi.waitFor(() => expect(fake.pending).toHaveLength(1))
    fake.finish(0, `${root}\n`)
    await vi.waitFor(() => expect(fake.pending).toHaveLength(2))
    fake.finish(1, 'R  new.txt\0')
    await expect(request).rejects.toThrow('Git 状态读取失败，请重试')
  })

  it('does not publish outer ignored rules if a nested Git boundary appears during the request', async () => {
    const root = await repository()
    await mkdir(join(root, 'nested'))
    await writeFile(join(root, 'nested/a.log'), '')
    const fake = fakeGit()
    const request = readHarnessWorkspaceIgnored(root, ['nested/a.log'])
    await vi.waitFor(() => expect(fake.pending).toHaveLength(1))
    fake.finish(0, `${root}\n`)
    await vi.waitFor(() => expect(fake.pending).toHaveLength(2))
    await mkdir(join(root, 'nested/.git'))
    fake.finish(1, 'nested/a.log\0')
    expect(await request).toEqual([])
  })

  it('rejects a stale non-repository result when .git appears during discovery', async () => {
    const root = await workspace()
    const fake = fakeGit()
    const request = readHarnessWorkspaceGit(root)
    await vi.waitFor(() => expect(fake.pending).toHaveLength(1))
    await mkdir(join(root, '.git'))
    fake.finish(0, '', Object.assign(new Error('not repository'), { code: 128 }), 'fatal: not a git repository')
    await expect(request).rejects.toThrow('工作目录已变化')
  })

  it('rejects a stale non-repository result when .git disappears during discovery', async () => {
    const root = await repository()
    const fake = fakeGit()
    const request = readHarnessWorkspaceGit(root)
    await vi.waitFor(() => expect(fake.pending).toHaveLength(1))
    await rename(join(root, '.git'), join(root, '.moved-git'))
    fake.finish(0, '', Object.assign(new Error('not repository'), { code: 128 }), 'fatal: not a git repository')
    await expect(request).rejects.toThrow('工作目录已变化')
  })
})
