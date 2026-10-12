// Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
// Adapted for Mira from ZCode bootstrap workflow-world-read.ts / workflow-git-world-read.ts.
// See third-party-licenses/zcode/LICENSE and NOTICE.md.
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { glob, lstat, open, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { MiraFlowError } from '../../../packages/mira-flow-kit/src/engine/mira-errors'
import { WORLD_READ_CAPS } from '../../../packages/mira-flow-kit/src/facade/mira-world-read-caps'
import type { WorldReadOp } from '../../../packages/mira-flow-kit/src/facade/mira-registry'
import { createMiraFlowArtifacts } from './miraFlowArtifacts'

export interface MiraFlowCommandRequest {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly timeoutMs: number
  readonly signal: AbortSignal
  readonly stdoutMaxBytes: number
  readonly stderrMaxBytes: number
}
export interface MiraFlowCommandResult { exitCode: number; stdout: string; stderr: string }
export interface MiraFlowCommandPort {
  approve(request: MiraFlowCommandRequest): Promise<boolean>
  /** Must use argv (never shell), honor signal and stop the process on output cap overflow. */
  execute(request: MiraFlowCommandRequest): Promise<MiraFlowCommandResult>
}
export interface MiraFlowWorldOptions {
  workspacePath: string
  signal?: AbortSignal
  declaredRunCommands?: ReadonlySet<string>
  commandPort?: MiraFlowCommandPort
  /** Host-owned packaged/system executable; missing ripgrep is an explicit DriverError. */
  ripgrepPath?: string
  artifactRoot?: string
}
const fail = (message: string) => new MiraFlowError('DriverError', message)
const overflow = (message: string) => new MiraFlowError('WorldReadCapExceeded', message)
const cancelled = () => new MiraFlowError('Cancelled', 'Mira flow operation cancelled.')
const assertActive = (signal?: AbortSignal) => { if (signal?.aborted) throw cancelled() }

/** No URI, drive, pathspec magic, traversal, NUL or platform-dependent absolute paths. */
function workspaceRelative(value: string, pattern = false) {
  if (!value || value.includes('\0') || value.includes('\\') || isAbsolute(value)
    || /^[A-Za-z]:/.test(value) || value.startsWith(':') || value.split('/').includes('..')
    || (pattern && value.startsWith('!'))) throw fail('Expected a strict workspace-relative path or glob.')
  return value
}
function strings(op: string, args: unknown[], required: number, optional = 0): (string | undefined)[] {
  if (!Array.isArray(args) || args.length < required || args.length > required + optional
    || args.some((value, index) => typeof value !== 'string' && !(index >= required && value === undefined))) {
    throw fail(`${op}: invalid arguments.`)
  }
  return args as (string | undefined)[]
}

/** A canonical root plus identity, never silently following a replaced workspace. */
export async function createMiraFlowWorld(options: MiraFlowWorldOptions) {
  const cwd = await realpath(options.workspacePath)
  const identity = await lstat(cwd)
  if (!identity.isDirectory()) throw fail('Workspace is not a directory.')
  const assertWorkspace = async () => {
    assertActive(options.signal)
    const current = await lstat(cwd)
    if (await realpath(options.workspacePath) !== cwd || current.dev !== identity.dev || current.ino !== identity.ino) {
      throw fail('Workspace changed during this flow.')
    }
  }
  const resolveFile = async (path: string) => {
    workspaceRelative(path)
    await assertWorkspace()
    const target = resolve(cwd, path)
    const local = relative(cwd, target)
    if (!local || local === '..' || local.startsWith('..' + sep) || isAbsolute(local)) throw fail('Path leaves workspace.')
    let cursor = cwd
    for (const part of local.split(sep)) {
      cursor = join(cursor, part)
      if ((await lstat(cursor)).isSymbolicLink()) throw fail('Symbolic-link sources are not supported.')
    }
    if (await realpath(target) !== target) throw fail('Path leaves canonical workspace.')
    return target
  }
  const readWorkspaceFile = async (path: string, maxBytes: number) => {
    const target = await resolveFile(path)
    const before = await lstat(target, { bigint: true })
    if (!before.isFile()) throw fail('Source is not a regular file.')
    if (before.size > BigInt(maxBytes)) throw overflow(`File exceeds ${maxBytes} bytes.`)
    const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const opened = await file.stat({ bigint: true })
      if (opened.dev !== before.dev || opened.ino !== before.ino) throw fail('File changed before reading.')
      const buffer = Buffer.alloc(Number(before.size) + 1)
      let size = 0
      while (size < buffer.length) {
        assertActive(options.signal)
        const { bytesRead } = await file.read(buffer, size, buffer.length - size, size)
        if (!bytesRead) break
        size += bytesRead
      }
      if (size > maxBytes) throw overflow(`File exceeds ${maxBytes} bytes.`)
      const after = await file.stat({ bigint: true })
      if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw fail('File changed during reading.')
      await resolveFile(path)
      const final = await lstat(target, { bigint: true })
      if (final.ino !== before.ino || final.dev !== before.dev) throw fail('Source replaced during reading.')
      return buffer.subarray(0, size)
    } finally { await file.close() }
  }
  const artifacts = createMiraFlowArtifacts({ artifactRoot: options.artifactRoot, readWorkspaceFile, signal: options.signal })

  // Fixed read-only subprocesses use a scrubbed Git environment. User commands never come here.
  const readonlyCommand = async (command: string, args: string[], cap: number, consumeText?: (text: string, final: boolean) => void) => {
    await assertWorkspace()
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
    return await new Promise<MiraFlowCommandResult>((resolveResult, reject) => {
      const child = spawn(command, args, { cwd, env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      const out: Buffer[] = [], err: Buffer[] = []
      const decoder = new StringDecoder('utf8')
      let outBytes = 0, errBytes = 0, settled = false
      const finish = (error?: unknown, result?: MiraFlowCommandResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        if (error) { child.kill(); reject(error) } else resolveResult(result!)
      }
      const onAbort = () => finish(cancelled())
      const timer = setTimeout(() => finish(fail('Read-only command timed out.')), 30_000)
      options.signal?.addEventListener('abort', onAbort, { once: true })
      if (options.signal?.aborted) onAbort()
      child.stdout.on('data', (chunk: Buffer) => {
        if (settled) return
        outBytes += chunk.length
        if (outBytes > cap) { finish(overflow('Read-only output exceeds its byte cap.')); return }
        try {
          if (consumeText) consumeText(decoder.write(chunk), false)
          else out.push(chunk)
        } catch (error) { finish(error) }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        errBytes += chunk.length
        if (errBytes > WORLD_READ_CAPS.runStderrMaxBytes) finish(overflow('Read-only stderr exceeds its byte cap.'))
        else err.push(chunk)
      })
      child.on('error', error => finish(fail(`Unable to run ${command}: ${error.message}`)))
      child.on('close', code => {
        if (settled) return
        try { consumeText?.(decoder.end(), true) } catch (error) { finish(error); return }
        finish(undefined, { exitCode: code ?? -1, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') })
      })
    })
  }
  const runGit = async (args: string[], cap = 2 * 1024 * 1024) => {
    const result = await readonlyCommand('git', ['--no-pager', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', 'log.showSignature=false', ...args], cap)
    if (result.exitCode !== 0) throw fail(`Git query failed: ${result.stderr.split('\n')[0] || result.exitCode}`)
    return result.stdout
  }
  const gitPrefix = async () => (await runGit(['rev-parse', '--show-prefix'])).replace(/\r?\n$/, '')
  const localGitPath = (path: string, prefix: string) => {
    if (!path.startsWith(prefix)) throw fail('Git returned a path outside workspace.')
    return workspaceRelative(path.slice(prefix.length))
  }
  const gitRef = (value?: string) => {
    if (value === undefined) return 'HEAD'
    if (!/^[A-Za-z0-9][A-Za-z0-9._/@^~-]*$/.test(value) || value.includes('..')) throw fail('Expected a single Git ref.')
    return value
  }

  const runApproved = async (args: unknown[]) => {
    if (!Array.isArray(args) || args.length < 1 || args.length > 3 || typeof args[0] !== 'string' || !args[0] || args[0].includes('\0')) throw fail('run: expected command, argv and optional timeout.')
    const command = args[0], argv = args[1] === undefined ? [] : args[1], rawOpts = args[2]
    if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string' || value.includes('\0')) || (rawOpts !== undefined && (typeof rawOpts !== 'object' || rawOpts === null || Array.isArray(rawOpts)))) throw fail('run: invalid argv or options.')
    const timeoutMs = (rawOpts as { timeoutMs?: unknown } | undefined)?.timeoutMs ?? WORLD_READ_CAPS.runDefaultTimeoutMs
    if (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw fail('run: timeoutMs must be a positive integer.')
    if (!options.declaredRunCommands?.has(command) || !options.commandPort) throw fail(`run: ${command} was not declared and connected to an approval port.`)
    const port = options.commandPort
    await assertWorkspace()
    const controller = new AbortController()
    let rejectAbort!: (error: unknown) => void
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
    const onAbort = () => { rejectAbort(cancelled()); controller.abort() }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    const request: MiraFlowCommandRequest = Object.freeze({ command, args: Object.freeze([...argv] as string[]), cwd, timeoutMs, signal: controller.signal, stdoutMaxBytes: WORLD_READ_CAPS.runStdoutMaxBytes, stderrMaxBytes: WORLD_READ_CAPS.runStderrMaxBytes })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      if (options.signal?.aborted) onAbort()
      if (!await Promise.race([port.approve(request), aborted])) throw fail('run: command approval denied.')
      await assertWorkspace()
      // Approval time is not execution time. Wall clock begins once execution has approval.
      const started = Date.now()
      const armTimeout = () => {
        const remaining = timeoutMs - (Date.now() - started)
        if (remaining <= 0) { rejectAbort(fail('run: execution timed out.')); controller.abort(); return }
        timer = setTimeout(armTimeout, Math.min(remaining, 2_147_483_647))
      }
      armTimeout()
      const result = await Promise.race([port.execute(request), aborted])
      assertActive(options.signal)
      if (!Number.isInteger(result.exitCode) || typeof result.stdout !== 'string' || typeof result.stderr !== 'string') throw fail('run: invalid execution receipt.')
      if (Buffer.byteLength(result.stdout) > request.stdoutMaxBytes || Buffer.byteLength(result.stderr) > request.stderrMaxBytes) throw overflow('run: output exceeded its byte cap.')
      return result
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort) }
  }

  const executeWorldRead = async (op: WorldReadOp, args: unknown[]): Promise<unknown> => {
    await assertWorkspace()
    switch (op) {
      case 'read': {
        const [path] = strings(op, args, 1)
        const bytes = await readWorkspaceFile(path!, 1_000_000)
        if (bytes.includes(0)) throw fail('files.read: binary source; publish it as an artifact instead.')
        return bytes.toString('utf8')
      }
      case 'glob': {
        const [pattern] = strings(op, args, 1)
        workspaceRelative(pattern!, true)
        const files: string[] = []
        for await (const entry of glob(pattern!, { cwd, withFileTypes: true, exclude: entry => entry.isSymbolicLink() })) {
          assertActive(options.signal)
          if (!entry.isFile()) continue
          const path = relative(cwd, join(entry.parentPath, entry.name))
          await resolveFile(path)
          files.push(path.split(sep).join('/'))
          if (files.length > WORLD_READ_CAPS.globMaxFiles) throw overflow('files.glob: too many matches; narrow the pattern.')
        }
        return files.sort()
      }
      case 'grep': {
        const [pattern, fileGlob] = strings(op, args, 1, 1)
        if (pattern!.includes('\0')) throw fail('grep: pattern cannot contain NUL.')
        if (fileGlob !== undefined) workspaceRelative(fileGlob, true)
        const matches: { path: string; line: number; text: string }[] = []
        let bytes = 2, pending = '', path: string | undefined
        // NUL-delimited paths survive Unicode/newline filenames; one output record per matching line.
        // Unlike --json this does not materialize thousands of per-character submatch offsets.
        const result = await readonlyCommand(options.ripgrepPath ?? 'rg', ['--no-config', '--null', '--line-number', '--with-filename', '--no-heading', '--path-separator', '/', '--color', 'never', '--hidden', '--glob', '!.git/**', ...(fileGlob === undefined ? [] : ['--glob', fileGlob]), '--', pattern!, '.'], WORLD_READ_CAPS.grepMaxSerializedBytes, (chunk, final) => {
          pending += chunk
          while (pending) {
            if (path === undefined) {
              const end = pending.indexOf('\0')
              if (end < 0) break
              path = workspaceRelative(pending.slice(0, end).replace(/^\.\//, ''))
              pending = pending.slice(end + 1)
            }
            const end = pending.indexOf('\n')
            if (end < 0) break
            const record = /^(\d+):(.*)$/s.exec(pending.slice(0, end))
            if (!record) throw fail('grep: malformed output record.')
            const match = { path, line: Number(record[1]), text: record[2]!.replace(/\r$/, '') }
            pending = pending.slice(end + 1); path = undefined
            matches.push(match)
            bytes += Buffer.byteLength(JSON.stringify(match)) + (matches.length > 1 ? 1 : 0)
            if (matches.length > WORLD_READ_CAPS.grepMaxMatches || bytes > WORLD_READ_CAPS.grepMaxSerializedBytes) throw overflow('files.grep: matches exceed cap; narrow the pattern.')
          }
          if (final && (pending || path !== undefined)) throw fail('grep: incomplete output record.')
        })
        if (result.exitCode !== 0 && result.exitCode !== 1) throw fail(`grep failed: ${result.stderr.split('\n')[0]}`)
        for (const match of matches) await resolveFile(match.path)
        return matches.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line)
      }
      case 'git-changed-files': {
        const [base] = strings(op, args, 0, 1), ref = gitRef(base)
        const prefix = await gitPrefix()
        const tracked = await runGit(['diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z', ref, '--', '.'])
        const untracked = base === undefined ? await runGit(['ls-files', '--others', '--exclude-standard', '-z', '--full-name', '--', '.']) : ''
        return [...new Set((tracked + untracked).split('\0').filter(Boolean).map(path => localGitPath(path, prefix)))].sort()
      }
      case 'git-diff': {
        const [base, path] = strings(op, args, 0, 2), ref = gitRef(base)
        if (path !== undefined) workspaceRelative(path)
        return await runGit(['diff', '--no-ext-diff', '--no-textconv', '--relative', ref, '--', path ?? '.'], WORLD_READ_CAPS.gitDiffMaxBytes)
      }
      case 'git-status': {
        strings(op, args, 0)
        const prefix = await gitPrefix(), records = (await runGit(['status', '--porcelain=v2', '-z', '--branch', '--', '.'])).split('\0')
        const result: { branch?: string; clean: boolean; staged: string[]; unstaged: string[]; untracked: string[] } = { clean: true, staged: [], unstaged: [], untracked: [] }
        for (let i = 0; i < records.length; i++) {
          const record = records[i]!
          if (!record) continue
          if (record.startsWith('# branch.head ')) { const branch = record.slice(14); if (branch !== '(detached)') result.branch = branch; continue }
          if (record[0] === '#') continue
          const kind = record[0], fields = kind === '1' ? 8 : kind === '2' ? 9 : kind === 'u' ? 10 : kind === '?' ? 1 : 0
          if (!fields) throw fail('Unsupported Git status record.')
          let start = 0
          for (let j = 0; j < fields; j++) { const at = record.indexOf(' ', start); if (at < 0) throw fail('Malformed Git status.'); start = at + 1 }
          const path = localGitPath(record.slice(start), prefix)
          if (kind === '?') result.untracked.push(path)
          else if (kind === 'u') result.unstaged.push(path)
          else {
            if (record[2] !== '.') result.staged.push(path)
            if (record[3] !== '.') result.unstaged.push(path)
          }
          if (kind === '2') i++ // original rename path is a separate NUL record
        }
        result.staged.sort(); result.unstaged.sort(); result.untracked.sort()
        result.clean = result.staged.length + result.unstaged.length + result.untracked.length === 0
        return result
      }
      case 'git-log': {
        if (!Array.isArray(args) || args.length > 1) throw fail('git.log: expected optional count.')
        const count = args[0] ?? WORLD_READ_CAPS.gitLogDefaultCount
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) throw fail('git.log: count must be a positive integer.')
        if (count > WORLD_READ_CAPS.gitLogMaxCount) throw overflow('git.log: count exceeds cap.')
        const text = await runGit(['log', `-${count}`, '--pretty=format:%H%x00%s%x00%an%x00%aI'])
        return text ? text.split('\n').map(line => {
          const fields = line.split('\0')
          if (fields.length !== 4) throw fail('Malformed Git log record.')
          return { hash: fields[0]!, subject: fields[1]!, author: fields[2]!, date: fields[3]! }
        }) : []
      }
      case 'run': return await runApproved(args)
      default: throw fail(`Unsupported world operation: ${op}`)
    }
  }
  return { executeWorldRead, executeArtifactPublish: artifacts.executeArtifactPublish }
}
