/* Hook input/output semantics adapted from ZCode hooks.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MiraHookConfig, MiraHookEvent } from '../../src/config/miraHooks'

export interface MiraHookInput {
  hookEventName: MiraHookEvent
  sessionId: string
  cwd: string
  [key: string]: unknown
}
export interface MiraHookOutput {
  continue?: boolean
  decision?: 'approve' | 'block'
  reason?: string
  stopReason?: string
  systemMessage?: string
  suppressOutput?: boolean
  additionalContext?: string
  additional_context?: string
  hookSpecificOutput?: {
    hookEventName: MiraHookEvent
    additionalContext?: string
    permissionDecision?: 'allow' | 'ask' | 'deny'
    permissionDecisionReason?: string
    updatedInput?: unknown
    decision?: {
      behavior: 'allow' | 'deny'
      message?: string
      interrupt?: boolean
      updatedInput?: unknown
      permissionUpdates?: unknown[]
      updatedPermissions?: unknown[]
    }
  }
}
export interface MiraHookExecutionResult {
  stdout: string
  stderr: string
  exitCode: number | null
  status: 'ok' | 'failed' | 'cancelled'
  error?: string
  output?: MiraHookOutput
}
export const MIRA_HOOK_OUTPUT_LIMIT = 32 * 1024
const failure = (error: string): MiraHookExecutionResult => ({ stdout: '', stderr: '', exitCode: null, status: 'failed', error })
const cancelled = (): MiraHookExecutionResult => ({ stdout: '', stderr: '', exitCode: null, status: 'cancelled', error: 'Hook 已停止' })
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function outputText(chunks: Buffer[]): string {
  const buffer = Buffer.concat(chunks)
  const text = buffer.toString('utf8')
  if (Buffer.byteLength(text) <= buffer.length) return text
  // Invalid UTF-8 replacement characters must not expand the retained byte budget.
  let bytes = 0; let retained = ''
  for (const character of text) {
    const size = Buffer.byteLength(character)
    if (bytes + size > buffer.length) break
    retained += character; bytes += size
  }
  return retained
}

function parseOutput(stdout: string, event: MiraHookEvent): MiraHookOutput | undefined {
  const text = stdout.trim()
  if (!text) return
  if (!text.startsWith('{')) return event === 'SessionStart' || event === 'UserPromptSubmit' ? { additionalContext: text } : undefined
  let value: unknown
  try { value = JSON.parse(text) } catch { return }
  if (!record(value)) throw new Error('Hook JSON 输出格式无效')
  const output: MiraHookOutput = {}
  for (const key of ['reason', 'stopReason', 'systemMessage', 'additionalContext', 'additional_context'] as const) {
    if (value[key] === undefined) continue
    if (typeof value[key] !== 'string') throw new Error('Hook JSON 输出格式无效')
    output[key] = value[key]
  }
  for (const key of ['continue', 'suppressOutput'] as const) {
    if (value[key] === undefined) continue
    if (typeof value[key] !== 'boolean') throw new Error('Hook JSON 输出格式无效')
    output[key] = value[key]
  }
  if (value.decision !== undefined) {
    if (value.decision !== 'approve' && value.decision !== 'block') throw new Error('Hook JSON 输出格式无效')
    output.decision = value.decision
  }
  if (value.hookSpecificOutput !== undefined) {
    const specific = value.hookSpecificOutput
    if (!record(specific)) throw new Error('Hook JSON 输出格式无效')
    if (specific.hookEventName !== event) throw new Error('Hook 返回了不匹配的事件')
    const parsed: NonNullable<MiraHookOutput['hookSpecificOutput']> = { hookEventName: event }
    if (event !== 'PermissionRequest' && specific.additionalContext !== undefined) {
      if (typeof specific.additionalContext !== 'string') throw new Error('Hook JSON 输出格式无效')
      parsed.additionalContext = specific.additionalContext
    }
    if (event === 'PreToolUse') {
      if (specific.permissionDecision !== undefined) {
        if (typeof specific.permissionDecision !== 'string' || !['allow', 'ask', 'deny'].includes(specific.permissionDecision)) throw new Error('Hook JSON 输出格式无效')
        parsed.permissionDecision = specific.permissionDecision as 'allow' | 'ask' | 'deny'
      }
      if (specific.permissionDecisionReason !== undefined) {
        if (typeof specific.permissionDecisionReason !== 'string') throw new Error('Hook JSON 输出格式无效')
        parsed.permissionDecisionReason = specific.permissionDecisionReason
      }
      if ('updatedInput' in specific) parsed.updatedInput = specific.updatedInput
    }
    if (event === 'PermissionRequest' && specific.decision !== undefined) {
      const decision = specific.decision
      if (!record(decision) || typeof decision.behavior !== 'string' || !['allow', 'deny'].includes(decision.behavior)) throw new Error('Hook JSON 输出格式无效')
      parsed.decision = { behavior: decision.behavior as 'allow' | 'deny' }
      if (decision.behavior === 'deny') {
        if (decision.message !== undefined && typeof decision.message !== 'string' || decision.interrupt !== undefined && typeof decision.interrupt !== 'boolean') throw new Error('Hook JSON 输出格式无效')
        if (typeof decision.message === 'string') parsed.decision.message = decision.message
        if (typeof decision.interrupt === 'boolean') parsed.decision.interrupt = decision.interrupt
      } else {
        if ('updatedInput' in decision) parsed.decision.updatedInput = decision.updatedInput
        for (const key of ['permissionUpdates', 'updatedPermissions'] as const) {
          if (decision[key] === undefined) continue
          if (!Array.isArray(decision[key]) || decision[key].some(update => !record(update) || update.type !== 'addRules' || typeof update.behavior !== 'string' || !['allow', 'deny', 'ask'].includes(update.behavior) || !Array.isArray(update.rules) || update.rules.some(rule => !record(rule) || typeof rule.toolName !== 'string' || !rule.toolName || rule.ruleContent !== undefined && typeof rule.ruleContent !== 'string'))) throw new Error('Hook JSON 输出格式无效')
          parsed.decision[key] = decision[key]
        }
      }
    }
    output.hookSpecificOutput = parsed
  }
  return output
}

function blockedOutput(input: MiraHookInput, stdout: string, stderr: string): MiraHookOutput {
  const reason = (stderr.trim() || stdout.trim()).slice(0, 4000) || 'Hook 阻止了当前操作'
  if (input.hookEventName === 'PreToolUse') return { continue: false, reason, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
  if (input.hookEventName === 'PermissionRequest') return { continue: false, reason, hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: reason } } }
  return input.hookEventName === 'Stop' ? { decision: 'block', reason } : { continue: false, reason }
}

async function stopProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid) return
  const pid = child.pid
  if (process.platform === 'win32') {
    await new Promise<void>(resolve => execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 2000 }, () => { child.kill('SIGKILL'); resolve() }))
    return
  }
  // A shell job can create its own process group. Capture descendants before stopping the root.
  const snapshot = () => new Promise<Map<number, { parent: number; started: string }>>(resolve => {
    execFile('ps', ['-axo', 'pid=,ppid=,lstart='], { timeout: 1000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
      const processes = new Map<number, { parent: number; started: string }>()
      if (!error) for (const line of stdout.split('\n')) {
        const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)
        if (match) processes.set(Number(match[1]), { parent: Number(match[2]), started: match[3] })
      }
      resolve(processes)
    })
  })
  const processes = await snapshot()
  const descendants = new Set<number>([pid])
  let changed = true
  while (changed) {
    changed = false
    for (const [candidate, details] of processes) if (!descendants.has(candidate) && descendants.has(details.parent)) { descendants.add(candidate); changed = true }
  }
  const sendDescendants = (signal: NodeJS.Signals, current = processes) => {
    for (const candidate of descendants) {
      if (candidate === pid || current.get(candidate)?.started !== processes.get(candidate)?.started) continue
      try { process.kill(candidate, signal) } catch { /* Descendant already reaped. */ }
    }
  }
  // Hooks own their POSIX process group; the promise retains ownership until all pipes close.
  const send = (signal: NodeJS.Signals) => { try { process.kill(-pid, signal) } catch { if (child.exitCode === null && child.signalCode === null) child.kill(signal) } }
  sendDescendants('SIGTERM')
  send('SIGTERM')
  let alive = false
  try { process.kill(-pid, 0); alive = true } catch { /* Group already reaped. */ }
  if (alive || descendants.size > 1) {
    await new Promise(resolve => setTimeout(resolve, 150))
    send('SIGKILL')
    sendDescendants('SIGKILL', await snapshot())
  }
}

async function compatibleInput(input: MiraHookInput, cwd: string) {
  const directory = await mkdtemp(join(tmpdir(), 'mira-hook-'))
  try {
    const transcript = join(directory, 'transcript.jsonl')
    const message = input.hookEventName === 'Stop' ? { role: 'assistant', text: input.responseText ?? input.responsePreview }
      : input.hookEventName === 'UserPromptSubmit' ? { role: 'user', text: input.prompt } : undefined
    await writeFile(transcript, message ? `${JSON.stringify({ message: { role: message.role, content: [{ type: 'text', text: message.text }] } })}\n` : '', 'utf8')
    const value: Record<string, unknown> = { ...input, cwd, agent_type: input.agentName, hook_event_name: input.hookEventName, permission_mode: input.mode, session_id: input.sessionId, transcript_path: transcript, transcriptPath: transcript }
    if ('toolName' in input) Object.assign(value, { tool_name: input.toolName, tool_input: input.toolInput, tool_use_id: input.toolUseId ?? input.toolCallId })
    if (input.hookEventName === 'PermissionRequest') value.permission_suggestions = input.permissionSuggestions
    if (input.hookEventName === 'PostToolUse') value.tool_response = input.toolResponse
    if (input.hookEventName === 'PostToolUseFailure') Object.assign(value, { error_details: input.error, error: record(input.error) ? input.error.message : input.error, is_interrupt: input.isInterrupt })
    if (input.hookEventName === 'Stop') Object.assign(value, { last_assistant_message: input.responseText ?? input.responsePreview, stop_hook_active: input.stopHookActive })
    return { directory, value: `${JSON.stringify(value)}\n` }
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
}

interface MiraHookPluginContext { id: string; name: string; root: string; data: string }
function hookEnvironment(input: MiraHookInput, cwd: string, plugin?: MiraHookPluginContext): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const prefix of ['MIRA', 'CLAUDE', 'ZCODE']) {
    env[`${prefix}_SESSION_ID`] = input.sessionId
    env[`${prefix}_PROJECT_DIR`] = cwd
    for (const suffix of ['ROOT', 'DATA', 'ID', 'NAME']) env[`${prefix}_PLUGIN_${suffix}`] = undefined
    if (plugin) Object.assign(env, { [`${prefix}_PLUGIN_ROOT`]: plugin.root, [`${prefix}_PLUGIN_DATA`]: plugin.data, [`${prefix}_PLUGIN_ID`]: plugin.id, [`${prefix}_PLUGIN_NAME`]: plugin.name })
  }
  env.CLAUDE_CODE_SESSION_ID = input.sessionId
  return env
}
function expandHookVariables(value: string, env: NodeJS.ProcessEnv, shell: boolean): string {
  return value.replace(/\$\{((?:MIRA|CLAUDE|ZCODE)_(?:(?:CODE_)?SESSION_ID|PROJECT_DIR|PLUGIN_(?:ROOT|DATA|ID|NAME)|SKILL_DIR))\}/g, (match, key: string) => {
    if (key.endsWith('SKILL_DIR') || env[key] === undefined) throw new Error('Hook 变量缺少插件或 Skill 上下文')
    // Shell variables expand once, so characters in a package path never become shell code.
    if (shell) return process.platform === 'win32' ? `%${key}%` : match
    return env[key]!
  })
}

export async function executeMiraHook(hook: MiraHookConfig, input: MiraHookInput, options: {
  cwd: string
  plugin?: MiraHookPluginContext
  signal?: AbortSignal
  assertCurrent?: () => void
  onUpdate?: (output: { stdout: string; stderr: string }) => void
}): Promise<MiraHookExecutionResult> {
  if (options.signal?.aborted) return cancelled()
  let stdin: Awaited<ReturnType<typeof compatibleInput>>
  try { stdin = await compatibleInput({ ...input, ...(hook.custom ? { custom: hook.custom } : {}) }, options.cwd) } catch { return failure('Hook 输入准备失败') }
  try {
    if (options.signal?.aborted) return cancelled()
    const env = hookEnvironment(input, options.cwd, options.plugin)
    let command: string, args: string[]
    try {
      command = expandHookVariables(hook.command, env, hook.type === 'command')
      args = hook.type === 'process' ? (hook.args ?? []).map(arg => expandHookVariables(arg, env, false)) : []
    } catch { return failure('Hook 变量缺少插件或 Skill 上下文') }
    try { options.assertCurrent?.() } catch { return failure('Hook 声明或信任状态已变化，请刷新后重试') }
    if (options.plugin) {
      try { await mkdir(options.plugin.data, { recursive: true }); options.assertCurrent?.() }
      catch { return failure('Hook 插件目录或信任状态已变化，请刷新后重试') }
    }
    if (options.signal?.aborted) return cancelled()
    const result = await new Promise<MiraHookExecutionResult>(resolve => {
      let child: ChildProcess
      try {
        child = spawn(command, args, {
          cwd: options.cwd, shell: hook.type === 'command' ? hook.shell ?? true : false,
          env,
          detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch { resolve(failure('Hook 进程启动失败')); return }
      const stdout: Buffer[] = []; const stderr: Buffer[] = []
      let bytes = 0; let closed = false; let exitCode: number | null = null
      let status: MiraHookExecutionResult['status'] = 'ok'; let error: string | undefined
      let stopping: Promise<void> | undefined
      const stop = () => stopping ??= stopProcessTree(child)
      const abort = () => { if (closed || status !== 'ok') return; status = 'cancelled'; error = 'Hook 已停止'; void stop() }
      const timeout = setTimeout(() => { if (status !== 'ok') return; status = 'failed'; error = 'Hook 执行超时，请检查命令或调整超时设置'; void stop() }, (hook.timeout ?? 60) * 1000)
      options.signal?.addEventListener('abort', abort, { once: true })
      const collect = (target: Buffer[], chunk: Buffer) => {
        const remaining = MIRA_HOOK_OUTPUT_LIMIT - bytes
        if (remaining > 0) { const retained = chunk.subarray(0, remaining); target.push(retained); bytes += retained.length }
        if (chunk.length > remaining && status === 'ok') { status = 'failed'; error = 'Hook 输出超过 32 KiB 限制，已停止进程'; void stop() }
        try { options.onUpdate?.({ stdout: outputText(stdout), stderr: outputText(stderr) }) }
        catch { if (status === 'ok') { status = 'failed'; error = 'Hook 输出处理失败'; void stop() } }
      }
      child.stdout!.on('data', (chunk: Buffer) => collect(stdout, chunk))
      child.stderr!.on('data', (chunk: Buffer) => collect(stderr, chunk))
      child.stdin!.on('error', () => undefined)
      child.once('error', () => { if (status === 'ok') { status = 'failed'; error = 'Hook 进程启动失败' } })
      child.once('exit', code => { exitCode = code; clearTimeout(timeout); void stop() })
      child.once('close', async code => {
        closed = true; clearTimeout(timeout); options.signal?.removeEventListener('abort', abort)
        await stop()
        resolve({ stdout: outputText(stdout), stderr: outputText(stderr), exitCode: code ?? exitCode, status, ...(error ? { error } : {}) })
      })
      if (options.signal?.aborted) abort()
      else child.stdin!.end(stdin.value)
    })
    if (result.status !== 'ok') return result
    if (result.exitCode === 2) return { ...result, output: blockedOutput(input, result.stdout, result.stderr) }
    if (result.exitCode !== 0) return { ...result, status: 'failed', error: 'Hook 执行失败，请检查命令和诊断输出' }
    try { return { ...result, output: parseOutput(result.stdout, input.hookEventName) } }
    catch (error) { return { ...result, status: 'failed', error: (error as Error).message } }
  } finally { await rm(stdin.directory, { recursive: true, force: true }) }
}
