import { execFile, type ExecException } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import type { HarnessGitContext } from '../../src/config/harness'

type GitStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
type Root = { original: string; path: string; identity: string }
type Metadata = { path: string; identity: string }
type Repository = { root: Root; repository: Root; metadata: Metadata; prefix: string }
type CommandResult = { stdout: Buffer; stderr: Buffer; code: number }

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const MAX_WAITING_COMMANDS = 16
let runningCommands = 0
const waitingCommands: Array<() => void> = []
const statusPriority: Record<GitStatus, number> = { modified: 1, renamed: 2, deleted: 3, added: 4, untracked: 5 }

function inside(root: string, path: string) { const value = relative(root, path); return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value) }
async function rootIdentity(original: string): Promise<Root> {
  const path = await realpath(original)
  const stat = await lstat(path, { bigint: true })
  if (!stat.isDirectory()) throw new Error('工作目录不是文件夹')
  return { original, path, identity: `${stat.dev}:${stat.ino}` }
}
async function metadataIdentity(path: string): Promise<Metadata | undefined> {
  try {
    const stat = await lstat(path, { bigint: true })
    if (stat.isSymbolicLink()) throw new Error('Git 元数据不能使用符号链接')
    if (!stat.isDirectory() && !stat.isFile()) throw new Error('Git 状态读取失败，请重试')
    return { path, identity: `${stat.dev}:${stat.ino}${stat.isFile() ? `:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}` : ''}` }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}
async function nearestMetadata(path: string) {
  let directory = path
  while (true) {
    const metadata = await metadataIdentity(join(directory, '.git'))
    if (metadata || dirname(directory) === directory) return metadata
    directory = dirname(directory)
  }
}
async function verifyRoot(root: Root) {
  try {
    const current = await rootIdentity(root.original)
    if (current.path === root.path && current.identity === root.identity) return
  } catch { /* A removed or replaced root must not publish an old snapshot. */ }
  throw new Error('工作目录已变化，请重新打开文件工作区。')
}
async function verifyRepository(repository: Repository) {
  await verifyRoot(repository.root)
  await verifyRoot(repository.repository)
  const metadata = await nearestMetadata(repository.root.path)
  if (metadata?.path !== repository.metadata.path || metadata?.identity !== repository.metadata.identity) throw new Error('工作目录已变化，请重新打开文件工作区。')
}

function gitEnvironment() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|CONFIG|CONFIG_COUNT|CONFIG_PARAMETERS|CONFIG_KEY_\d+|CONFIG_VALUE_\d+|ALTERNATE_OBJECT_DIRECTORIES|GRAFT_FILE|IMPLICIT_WORK_TREE|INTERNAL_SUPER_PREFIX|NAMESPACE|OBJECT_DIRECTORY|PREFIX|REPLACE_REF_BASE|SHALLOW_FILE|LITERAL_PATHSPECS|GLOB_PATHSPECS|NOGLOB_PATHSPECS|ICASE_PATHSPECS|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM)$/.test(key)) delete env[key]
  }
  return { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat', LC_ALL: 'C', LANG: 'C' }
}
async function acquireCommand() {
  if (runningCommands < 2) { runningCommands++; return }
  if (waitingCommands.length >= MAX_WAITING_COMMANDS) throw new Error('Git 状态读取繁忙，请稍后重试')
  await new Promise<void>(resolve => waitingCommands.push(resolve))
}
function releaseCommand() { const next = waitingCommands.shift(); if (next) next(); else runningCommands-- }
async function runGit(root: Root, args: string[], input?: Buffer, beforeSpawn?: () => void | Promise<void>, disableHooks = false): Promise<CommandResult> {
  await acquireCommand()
  try {
    await verifyRoot(root)
    await beforeSpawn?.()
    return await new Promise<CommandResult>((resolve, reject) => {
      let closed = false
      let completed: { error: ExecException | null; stdout: Buffer; stderr: Buffer } | undefined
      const finish = () => {
        if (!closed || !completed) return
        const { error, stdout, stderr } = completed
        if (error?.code === 'ENOENT') { reject(new Error('Git 未安装或不可用')); return }
        if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') { reject(new Error('Git 输出超过 8 MiB 限制，请缩小工作目录')); return }
        if (error && 'killed' in error && error.killed) { reject(new Error('Git 状态读取超时，请重试')); return }
        if (error && typeof error.code !== 'number') { reject(new Error('Git 状态读取失败，请重试')); return }
        resolve({ stdout, stderr, code: error ? Number(error.code) : 0 })
      }
      const child = execFile('git', ['--no-optional-locks', ...(args[0] === 'status' ? ['--literal-pathspecs'] : []), '-c', 'core.fsmonitor=false', ...(disableHooks ? ['-c', 'core.hooksPath=/dev/null'] : []), '-C', root.path, ...args], {
        encoding: 'buffer', env: gitEnvironment(), timeout: 10_000, maxBuffer: MAX_OUTPUT_BYTES, killSignal: 'SIGKILL', windowsHide: true,
      }, (error, stdout, stderr) => { completed = { error, stdout, stderr }; finish() })
      // execFile may report failure before stdio closes; retain the slot until the process is drained.
      child.once('close', () => { closed = true; finish() })
      child.stdin?.on('error', () => undefined)
      child.stdin?.end(input)
    })
  } finally { releaseCommand() }
}

async function resolveRepository(root: Root): Promise<Repository | undefined> {
  const metadata = await nearestMetadata(root.path)
  await verifyRoot(root)
  const result = await runGit(root, ['rev-parse', '--show-toplevel'])
  await verifyRoot(root)
  if (result.code !== 0) {
    if (result.code === 128 && /not a git repository|must be run in a work tree/.test(result.stderr.toString('utf8'))) {
      const current = await nearestMetadata(root.path)
      if (current?.path !== metadata?.path || current?.identity !== metadata?.identity) throw new Error('工作目录已变化，请重新打开文件工作区。')
      await verifyRoot(root)
      return undefined
    }
    throw new Error('Git 状态读取失败，请重试')
  }
  const output = result.stdout.toString('utf8')
  const repositoryPath = output.endsWith('\n') ? output.slice(0, -1) : output
  if (!repositoryPath || !isAbsolute(repositoryPath) || !metadata) throw new Error('Git 状态读取失败，请重试')
  const repository = await rootIdentity(repositoryPath)
  if (!inside(repository.path, root.path) || metadata.path !== join(repository.path, '.git')) throw new Error('Git 状态读取失败，请重试')
  const resolved = { root, repository, metadata, prefix: relative(repository.path, root.path).split(sep).join('/') }
  await verifyRepository(resolved)
  return resolved
}

function relativeGitPath(repository: Repository, path: string): string | undefined {
  if (path.startsWith('/') || path.includes('\0') || path.split('/').some(segment => segment === '..')) throw new Error('Git 状态读取失败，请重试')
  const prefix = repository.prefix ? `${repository.prefix}/` : ''
  if (prefix && !path.startsWith(prefix)) return undefined
  const value = path.slice(prefix.length).replace(/\/$/, '')
  return value && value !== '.' ? value : undefined
}
function parseStatus(repository: Repository, stdout: Buffer) {
  const records = stdout.toString('utf8').split('\0')
  if (records.pop() !== '') throw new Error('Git 状态读取失败，请重试')
  const entries = new Map<string, GitStatus>()
  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    if (record.length < 4 || record[2] !== ' ') throw new Error('Git 状态读取失败，请重试')
    const xy = record.slice(0, 2)
    const path = relativeGitPath(repository, record.slice(3))
    const renamed = /[RC]/.test(xy)
    const original = renamed ? relativeGitPath(repository, records[++index] ?? '') : undefined
    if (renamed && !records[index]) throw new Error('Git 状态读取失败，请重试')
    const status: GitStatus = xy === '??' ? 'untracked' : xy.includes('U') || xy === 'AA' || xy === 'DD' ? 'modified'
      : xy.includes('A') ? 'added' : xy.includes('D') ? 'deleted' : renamed ? 'renamed' : 'modified'
    const scopedPath = path ?? (renamed ? original : undefined)
    if (!scopedPath) continue
    const scopedStatus = !path && renamed ? 'deleted' : status
    const previous = entries.get(scopedPath)
    if (!previous || statusPriority[scopedStatus] > statusPriority[previous]) entries.set(scopedPath, scopedStatus)
  }
  return [...entries].map(([path, status]) => ({ path, status })).sort((left, right) => left.path.localeCompare(right.path))
}

export async function readHarnessWorkspaceGit(workspacePath: string): Promise<{ available: boolean; entries: Array<{ path: string; status: GitStatus }> }> {
  try {
    const root = await rootIdentity(workspacePath)
    const repository = await resolveRepository(root)
    if (!repository) return { available: false, entries: [] }
    const result = await runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])
    await verifyRepository(repository)
    if (result.code !== 0) throw new Error('Git 状态读取失败，请重试')
    return { available: true, entries: parseStatus(repository, result.stdout) }
  } catch (error) { throw safeGitFailure(error) }
}

type GitContext = Omit<HarnessGitContext, 'projectId' | 'mutationBlocked'>
type BranchRepository = Repository & { gitDirectory: Root }
const STALE_GIT_CONTEXT = 'Git 工作区或分支已变化，请刷新后重试'
const GIT_ACTION_FAILURE = 'Git 分支操作失败，请检查工作区状态后重试'

async function branchRepository(root: Root, assertCurrent: () => void): Promise<BranchRepository | undefined> {
  assertCurrent()
  const repository = await resolveRepository(root)
  assertCurrent()
  if (!repository) return
  const result = await runGit(root, ['rev-parse', '--absolute-git-dir'], undefined, async () => { await verifyRepository(repository); assertCurrent() })
  if (result.code !== 0) throw new Error(GIT_ACTION_FAILURE)
  const gitDirectory = await rootIdentity(result.stdout.toString('utf8').replace(/\n$/, ''))
  await verifyRepository(repository); assertCurrent()
  return { ...repository, gitDirectory }
}

async function branchCommand(repository: BranchRepository, args: string[], assertCurrent: () => void, mutation = false) {
  return runGit(repository.root, args, undefined, async () => {
    await verifyRepository(repository)
    await verifyRoot(repository.gitDirectory)
    assertCurrent()
  }, mutation)
}

async function branchHead(repository: BranchRepository, assertCurrent: () => void) {
  const symbolic = await branchCommand(repository, ['symbolic-ref', '--quiet', 'HEAD'], assertCurrent)
  if (symbolic.code !== 0 && symbolic.code !== 1) throw new Error(GIT_ACTION_FAILURE)
  const ref = symbolic.code === 0 ? symbolic.stdout.toString('utf8').trim() : undefined
  if (ref && !ref.startsWith('refs/heads/')) throw new Error(GIT_ACTION_FAILURE)
  const result = await branchCommand(repository, ['rev-parse', '--verify', 'HEAD'], assertCurrent)
  const commit = result.code === 0 ? result.stdout.toString('utf8').trim() : undefined
  if ((commit && !/^[a-f0-9]{40,64}$/.test(commit)) || (result.code !== 0 && (!ref || result.code !== 128))) throw new Error(GIT_ACTION_FAILURE)
  return { headType: (ref ? commit ? 'branch' : 'unborn' : 'detached') as HarnessGitContext['headType'], ...(ref ? { branchName: ref.slice(11) } : {}), ...(commit ? { commit } : {}) }
}

function gitSnapshotToken(root: Root, repository?: BranchRepository, head?: Awaited<ReturnType<typeof branchHead>>) {
  return createHash('sha256').update(JSON.stringify([root.original, root.path, root.identity, repository?.repository, repository?.metadata, repository?.gitDirectory, head])).digest('hex')
}

async function branchContext(repository: BranchRepository, assertCurrent: () => void): Promise<GitContext> {
  const head = await branchHead(repository, assertCurrent)
  const refs = await branchCommand(repository, ['for-each-ref', '--format=%(refname)', '--sort=refname', 'refs/heads'], assertCurrent)
  const status = await branchCommand(repository, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], assertCurrent)
  if (refs.code !== 0 || status.code !== 0) throw new Error(GIT_ACTION_FAILURE)
  const names = refs.stdout.toString('utf8').split('\n').filter(Boolean).map(ref => {
    if (!ref.startsWith('refs/heads/')) throw new Error(GIT_ACTION_FAILURE)
    return ref.slice(11)
  })
  const uncommittedFileCount = parseStatus({ ...repository, prefix: '' }, status.stdout).length
  const latest = await branchHead(repository, assertCurrent)
  if (JSON.stringify(head) !== JSON.stringify(latest)) throw new Error(STALE_GIT_CONTEXT)
  await verifyRepository(repository); await verifyRoot(repository.gitDirectory); assertCurrent()
  return { directory: repository.root.original, isRepository: true, ...head, uncommittedFileCount,
    branches: names.map(name => ({ name, current: name === head.branchName, ...(name === head.branchName && uncommittedFileCount ? { uncommittedFileCount } : {}) })),
    snapshotToken: gitSnapshotToken(repository.root, repository, head) }
}

export async function readHarnessGitContext(workspacePath: string, assertCurrent = () => {}, onRepository?: (directory: string) => void): Promise<GitContext> {
  try {
    const root = await rootIdentity(workspacePath)
    const repository = await branchRepository(root, assertCurrent)
    if (repository) { onRepository?.(repository.repository.path); return await branchContext(repository, assertCurrent) }
    await verifyRoot(root); assertCurrent()
    return { directory: workspacePath, isRepository: false, headType: 'none', uncommittedFileCount: 0, branches: [], snapshotToken: gitSnapshotToken(root) }
  } catch (error) { throw safeBranchFailure(error) }
}

function branchName(value: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('分支名称不能为空')
  const name = value.trim()
  if (name.endsWith('/')) throw new Error('分支名不能以“/”结尾')
  if (name.length > 256 || name.startsWith('-') || /[\x00-\x20\x7f~^:?*[\\]/.test(name) || name === 'HEAD' || name === '@' || name.includes('..') || name.includes('@{')) throw new Error('分支名称无效')
  return name
}

export async function changeHarnessGitBranch(workspacePath: string, value: string, create: boolean, snapshotToken: string | undefined, assertCurrent = () => {}, beforeMutation?: (directory: string) => void): Promise<GitContext> {
  try {
    const name = branchName(value)
    const root = await rootIdentity(workspacePath)
    const repository = await branchRepository(root, assertCurrent)
    if (!repository) throw new Error('项目不是 Git 仓库')
    beforeMutation?.(repository.repository.path)
    const context = await branchContext(repository, assertCurrent)
    if (snapshotToken !== undefined && snapshotToken !== context.snapshotToken) throw new Error(STALE_GIT_CONTEXT)
    const validated = await branchCommand(repository, ['check-ref-format', '--branch', name], assertCurrent)
    if (validated.code !== 0 || validated.stdout.toString('utf8').trim() !== name) throw new Error('分支名称无效')
    if (create ? context.branches.some(branch => branch.name === name) : !context.branches.some(branch => branch.name === name)) throw new Error(create ? '分支已存在' : '未找到本地分支')
    if (create && context.headType === 'unborn') throw new Error('请先创建首次提交，再新建分支')
    const head = await branchHead(repository, assertCurrent)
    if (gitSnapshotToken(root, repository, head) !== context.snapshotToken) throw new Error(STALE_GIT_CONTEXT)
    const result = await branchCommand(repository, create ? ['switch', '--no-guess', '-c', name] : ['switch', '--no-guess', '--', name], assertCurrent, true)
    await verifyRepository(repository); await verifyRoot(repository.gitDirectory); assertCurrent()
    if (result.code !== 0) {
      const error = result.stderr.toString('utf8')
      if (/would be overwritten|Please commit your changes or stash them/.test(error)) throw new Error('本地更改阻止切换分支，请先自行处理更改')
      if (/already exists/.test(error)) throw new Error('分支已存在')
      throw new Error(GIT_ACTION_FAILURE)
    }
    return await branchContext(repository, assertCurrent)
  } catch (error) { throw safeBranchFailure(error) }
}

function safeBranchFailure(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const known = ['分支名称不能为空', '分支名不能以“/”结尾', '分支名称无效', '分支已存在', '未找到本地分支',
    '请先创建首次提交，再新建分支', '项目不是 Git 仓库', '本地更改阻止切换分支，请先自行处理更改',
    '请先停止项目任务并处理待发送消息', '项目正在切换分支，请稍后重试', '第一方授权无效或应用已停用', 'Harness 连接已关闭', STALE_GIT_CONTEXT]
  if (known.includes(message)) return new Error(message)
  const safe = safeGitFailure(error)
  return new Error(safe.message === 'Git 状态读取失败，请重试' ? GIT_ACTION_FAILURE : safe.message)
}

function normalizeIgnoredPaths(paths: string[]) {
  if (!Array.isArray(paths) || paths.length > 512) throw new Error('路径无效')
  return [...new Set(paths.map(path => {
    if (typeof path !== 'string' || !path || path.length > 2048 || path.includes('\0') || path.includes('\\') || isAbsolute(path)
      || /^[a-z][a-z\d+.-]*:/i.test(path) || path.split('/').includes('..')) throw new Error('路径无效')
    const normalized = posix.normalize(path).replace(/\/$/, '')
    if (!normalized || normalized === '.') throw new Error('路径无效')
    return normalized
  }))]
}
async function validateIgnoredPath(root: Root, path: string, boundaries: Map<string, Promise<boolean>>) {
  let target = resolve(root.path, path)
  while (true) {
    try {
      if (!inside(root.path, await realpath(target))) throw new Error('路径不能离开工作目录')
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      target = dirname(target)
    }
  }
  for (let parent = dirname(resolve(root.path, path)); parent !== root.path; parent = dirname(parent)) {
    if (!boundaries.has(parent)) boundaries.set(parent, (async () => {
      try { return (await lstat(parent)).isSymbolicLink() || Boolean(await lstat(join(parent, '.git'))) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
    })())
    // A nested repository or directory alias has its own Git boundary, not its parent's ignored decoration.
    if (await boundaries.get(parent)) return false
  }
  return true
}

export async function readHarnessWorkspaceIgnored(workspacePath: string, paths: string[]): Promise<string[]> {
  try {
    const normalized = normalizeIgnoredPaths(paths)
    if (!normalized.length) return []
    const root = await rootIdentity(workspacePath)
    const boundaries = new Map<string, Promise<boolean>>()
    const valid: string[] = []
    for (const path of normalized) if (await validateIgnoredPath(root, path, boundaries)) valid.push(path)
    const repository = await resolveRepository(root)
    if (!repository || !valid.length) return []
    const result = await runGit(root, ['check-ignore', '--stdin', '-z'], Buffer.from(`${valid.join('\0')}\0`))
    await verifyRepository(repository)
    if (result.code === 1) return []
    if (result.code !== 0) throw new Error('Git 状态读取失败，请重试')
    const ignored = new Set(result.stdout.toString('utf8').split('\0'))
    const currentBoundaries = new Map<string, Promise<boolean>>()
    const output: string[] = []
    for (const path of valid) if (ignored.has(path) && await validateIgnoredPath(root, path, currentBoundaries)) output.push(path)
    await verifyRepository(repository)
    return output
  } catch (error) { throw safeGitFailure(error) }
}

function safeGitFailure(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return new Error(['Git 未安装或不可用', 'Git 输出超过 8 MiB 限制，请缩小工作目录', 'Git 状态读取超时，请重试', 'Git 状态读取繁忙，请稍后重试',
    'Git 元数据不能使用符号链接', '工作目录已变化，请重新打开文件工作区。', '工作目录不是文件夹', '路径无效', '路径不能离开工作目录'].includes(message)
    ? message : 'Git 状态读取失败，请重试')
}
