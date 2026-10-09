import { execFile, type ExecException } from 'node:child_process'
import { lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'

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
async function runGit(root: Root, args: string[], input?: Buffer): Promise<CommandResult> {
  await acquireCommand()
  try {
    await verifyRoot(root)
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
      const child = execFile('git', ['--no-optional-locks', ...(args[0] === 'status' ? ['--literal-pathspecs'] : []), '-c', 'core.fsmonitor=false', '-C', root.path, ...args], {
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
