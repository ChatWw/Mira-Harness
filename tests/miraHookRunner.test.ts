import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeMiraHook, MIRA_HOOK_OUTPUT_LIMIT, type MiraHookInput } from '../electron/services/miraHookRunner'
import type { MiraHookConfig, MiraHookEvent } from '../src/config/miraHooks'

const directories: string[] = []
const ownedPids: number[] = []
async function workspace() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'mira-hook-runner-test-')))
  directories.push(directory); return directory
}
function input(event: MiraHookEvent = 'UserPromptSubmit', cwd = tmpdir()): MiraHookInput {
  return { hookEventName: event, sessionId: 'session-test', cwd, mode: 'default', prompt: '用户问题', timestamp: new Date().toISOString() }
}
function hook(script: string, fields: Partial<MiraHookConfig> = {}): MiraHookConfig {
  return { name: 'Fixture', event: 'UserPromptSubmit', type: 'process', command: process.execPath, args: ['-e', script], ...fields }
}
function alive(pid: number) { try { process.kill(pid, 0); return true } catch { return false } }
async function waitUntil(check: () => boolean, milliseconds = 2000) {
  const limit = Date.now() + milliseconds
  while (!check() && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 10))
  expect(check()).toBe(true)
}
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs()
  for (const pid of ownedPids.splice(0)) { try { process.kill(pid, 'SIGKILL') } catch { /* Test process already reaped. */ } }
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('Mira real Hook process runner', () => {
  it('expands plugin process argv literally and supplies compatible plugin data/session environment', async () => {
    const cwd = await workspace(), root = join(await workspace(), "plugin '$() with spaces"), data = join(await workspace(), 'data')
    await mkdir(root)
    await writeFile(join(root, 'hook.cjs'), `const fs=require('fs');fs.writeFileSync(process.env.CLAUDE_PLUGIN_DATA+'/marker','actual');console.log(JSON.stringify({additionalContext:JSON.stringify({cwd:process.cwd(),root:process.env.MIRA_PLUGIN_ROOT,claude:process.env.CLAUDE_PLUGIN_ROOT,zcode:process.env.ZCODE_PLUGIN_ROOT,id:process.env.ZCODE_PLUGIN_ID,name:process.env.ZCODE_PLUGIN_NAME,session:process.env.CLAUDE_CODE_SESSION_ID,arg:process.argv[2]})}))`)
    const outcome = await executeMiraHook(hook('', { args: ['${CLAUDE_PLUGIN_ROOT}/hook.cjs', '${MIRA_PLUGIN_ROOT}'] }), input(), { cwd, plugin: { id: 'fixture@local', name: 'Fixture', root, data } })
    expect(outcome.status).toBe('ok')
    expect(JSON.parse(outcome.output!.additionalContext!)).toEqual({ cwd, root, claude: root, zcode: root, id: 'fixture@local', name: 'Fixture', session: 'session-test', arg: root })
    expect(await readFile(join(data, 'marker'), 'utf8')).toBe('actual')
  })

  it.skipIf(process.platform === 'win32')('expands plugin shell environment without reinterpreting characters in the package path', async () => {
    const cwd = await workspace(), root = join(await workspace(), 'plugin $(touch injected) with spaces'), data = join(await workspace(), 'data')
    await mkdir(root)
    const outcome = await executeMiraHook(hook('', { type: 'command', command: 'printf "%s" "${CLAUDE_PLUGIN_ROOT}"', shell: '/bin/sh' }), input(), { cwd, plugin: { id: 'fixture@local', name: 'Fixture', root, data } })
    expect(outcome).toMatchObject({ status: 'ok', stdout: root })
    await expect(readFile(join(cwd, 'injected'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects unsupported skill context and absent plugin context before spawning a process', async () => {
    const cwd = await workspace()
    for (const value of ['${CLAUDE_PLUGIN_ROOT}', '${MIRA_SKILL_DIR}', '${CLAUDE_SKILL_DIR}']) {
      const outcome = await executeMiraHook(hook('', { args: ['-e', 'console.log("ran")', value] }), input(), { cwd })
      expect(outcome.status).toBe('failed'); expect(outcome.stdout).toBe(''); expect(outcome.error).toContain('上下文')
    }
  })

  it('passes actual JSON stdin, compatible aliases, owner cwd, Mira environment and a temporary transcript', async () => {
    const cwd = await workspace(); const outside = await workspace()
    const outcome = await executeMiraHook(hook(`let text='';process.stdin.on('data',part=>text+=part);process.stdin.on('end',()=>{const value=JSON.parse(text);const fs=require('fs');console.log(JSON.stringify({additionalContext:JSON.stringify({value,cwd:process.cwd(),session:process.env.MIRA_SESSION_ID,project:process.env.MIRA_PROJECT_DIR,transcript:fs.readFileSync(value.transcript_path,'utf8')})}))})`), input('UserPromptSubmit', outside), { cwd })
    expect(outcome.status).toBe('ok'); expect(outcome.exitCode).toBe(0)
    const received = JSON.parse(outcome.output!.additionalContext!)
    expect(received).toMatchObject({ cwd, session: 'session-test', project: cwd, value: { cwd, session_id: 'session-test', hook_event_name: 'UserPromptSubmit', permission_mode: 'default', prompt: '用户问题' } })
    expect(JSON.parse(received.transcript)).toEqual({ message: { role: 'user', content: [{ type: 'text', text: '用户问题' }] } })
    await expect(readFile(received.value.transcript_path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves literal argv rather than executing argument text', async () => {
    const cwd = await workspace(); const marker = join(cwd, 'must-not-exist')
    const argument = `$(touch '${marker}') ; "空 格"`
    const outcome = await executeMiraHook(hook('console.log(process.argv[1])', { args: ['-e', 'console.log(process.argv[1])', argument] }), input(), { cwd })
    expect(outcome).toMatchObject({ status: 'ok', stdout: `${argument}\n`, output: { additionalContext: argument } })
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('provides custom configuration without overriding execution identity and maps actual tool-use IDs', async () => {
    const cwd = await workspace()
    const custom = { cwd: 'untrusted-directory', sessionId: 'other-session', hookEventName: 'Stop', nested: { value: '真实配置' } }
    const outcome = await executeMiraHook(hook(`let text='';process.stdin.on('data',part=>text+=part);process.stdin.on('end',()=>console.log(JSON.stringify({additionalContext:text})))`, { custom }), { ...input('PreToolUse'), toolName: 'read', toolUseId: 'actual-tool-use', toolCallId: 'legacy-call', toolInput: {} }, { cwd })
    const received = JSON.parse(outcome.output!.additionalContext!)
    expect(received).toMatchObject({ cwd, sessionId: 'session-test', hookEventName: 'PreToolUse', custom, tool_use_id: 'actual-tool-use', toolUseId: 'actual-tool-use', toolCallId: 'legacy-call' })
  })

  it.skipIf(process.platform === 'win32')('runs shell commands through the selected shell with Mira variables', async () => {
    const cwd = await workspace()
    const outcome = await executeMiraHook(hook('unused', { type: 'command', command: 'printf "%s" "$MIRA_SESSION_ID"', shell: '/bin/sh', args: ['ignored'] }), input(), { cwd })
    expect(outcome).toMatchObject({ status: 'ok', stdout: 'session-test', output: { additionalContext: 'session-test' } })
  })

  it.each(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'Stop'] as const)('uses plain output only as context for %s when appropriate and keeps stderr diagnostic', async event => {
    const outcome = await executeMiraHook(hook('console.log("context");console.error("diagnostic")'), input(event), { cwd: await workspace() })
    expect(outcome).toMatchObject({ status: 'ok', stdout: 'context\n', stderr: 'diagnostic\n' })
    expect(outcome.output).toEqual(event === 'SessionStart' || event === 'UserPromptSubmit' ? { additionalContext: 'context' } : undefined)
  })

  it.each(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'Stop'] as const)('preserves event-specific JSON output and compatibility fields for %s', async event => {
    const specific = event === 'PreToolUse' ? { hookEventName: event, permissionDecision: 'ask', permissionDecisionReason: '确认', updatedInput: { value: 2 }, additionalContext: 'specific' }
      : event === 'PermissionRequest' ? { hookEventName: event, decision: { behavior: 'allow', updatedInput: { value: 2 }, updatedPermissions: [{ type: 'addRules', behavior: 'ask', rules: [{ toolName: 'mira_read', ruleContent: 'src/**' }] }] } }
      : { hookEventName: event, additionalContext: 'specific' }
    const output = { continue: false, stopReason: '理由', decision: 'block', additionalContext: 'camel', additional_context: 'snake', suppressOutput: true, systemMessage: 'note', hookSpecificOutput: specific }
    const outcome = await executeMiraHook(hook(`console.log(${JSON.stringify(JSON.stringify(output))})`), input(event), { cwd: await workspace() })
    expect(outcome.status).toBe('ok'); expect(outcome.output).toEqual(output)
  })

  it.each(['PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'Stop'] as const)('supplies event aliases for %s without losing rich error details', async event => {
    const value = { ...input(event), toolName: 'mira_tool', toolInput: { text: '内容' }, toolCallId: 'call', permissionSuggestions: [], toolResponse: { value: 1 }, error: { message: 'failed', type: 'Error' }, isInterrupt: true, responsePreview: 'answer', stopHookActive: false }
    const outcome = await executeMiraHook(hook(`let text='';process.stdin.on('data',part=>text+=part);process.stdin.on('end',()=>console.log(JSON.stringify({additionalContext:text})))`), value, { cwd: await workspace() })
    const received = JSON.parse(outcome.output!.additionalContext!)
    expect(received).toMatchObject({ tool_name: 'mira_tool', tool_input: { text: '内容' }, tool_use_id: 'call' })
    if (event === 'PostToolUse') expect(received.tool_response).toEqual({ value: 1 })
    if (event === 'PermissionRequest') expect(received.permission_suggestions).toEqual([])
    if (event === 'PostToolUseFailure') expect(received).toMatchObject({ error: 'failed', error_details: { message: 'failed', type: 'Error' }, is_interrupt: true })
    if (event === 'Stop') expect(received).toMatchObject({ last_assistant_message: 'answer', stop_hook_active: false })
  })

  it('rejects mismatched event and malformed typed JSON without applying a decision', async () => {
    const cwd = await workspace()
    for (const output of [{ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: 'private' } }, { continue: 'false' }, { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'unknown' } }, { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: ['allow'] } }, { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: ['allow'] } } }, { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedPermissions: [{ type: 'unexpected' }] } } }]) {
      const event = 'hookSpecificOutput' in output && output.hookSpecificOutput?.hookEventName === 'PermissionRequest' ? 'PermissionRequest' : 'PreToolUse'
      const outcome = await executeMiraHook(hook(`console.log(${JSON.stringify(JSON.stringify(output))})`), input(event), { cwd })
      expect(outcome.status).toBe('failed'); expect(outcome.output).toBeUndefined(); expect(outcome.error).not.toContain('private')
    }
  })

  it('treats malformed JSON as diagnostic output and drops unknown execution-like keys', async () => {
    const cwd = await workspace()
    expect(await executeMiraHook(hook('console.log("{bad JSON")'), input(), { cwd })).toMatchObject({ status: 'ok', output: undefined })
    const outcome = await executeMiraHook(hook('console.log(JSON.stringify({command:"must not execute",additionalContext:"safe"}))'), input(), { cwd })
    expect(outcome.output).toEqual({ additionalContext: 'safe' })
  })

  it.each(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'Stop'] as const)('interprets exit 2 as blocking output for %s', async event => {
    const outcome = await executeMiraHook(hook('console.error("blocked reason");process.exit(2)'), input(event), { cwd: await workspace() })
    expect(outcome).toMatchObject({ status: 'ok', exitCode: 2, output: { reason: 'blocked reason' } })
    expect(outcome.output).toMatchObject(event === 'Stop' ? { decision: 'block' } : { continue: false })
    if (event === 'PreToolUse') expect(outcome.output!.hookSpecificOutput).toMatchObject({ permissionDecision: 'deny' })
    if (event === 'PermissionRequest') expect(outcome.output!.hookSpecificOutput).toMatchObject({ decision: { behavior: 'deny' } })
  })

  it('returns stable failure diagnostics for nonzero exit and nonexistent executables/cwd', async () => {
    const cwd = await workspace()
    const failed = await executeMiraHook(hook('console.error("secret-diagnostic");process.exit(1)'), input(), { cwd })
    expect(failed).toMatchObject({ status: 'failed', exitCode: 1, stderr: 'secret-diagnostic\n' }); expect(failed.error).not.toContain('secret')
    expect(await executeMiraHook(hook('', { command: join(cwd, 'secret-executable') }), input(), { cwd })).toMatchObject({ status: 'failed', error: 'Hook 进程启动失败' })
    expect(await executeMiraHook(hook(''), input(), { cwd: join(cwd, 'secret-directory') })).toMatchObject({ status: 'failed', error: 'Hook 进程启动失败' })
  })

  it('does not spawn a pre-cancelled Hook or create its side effects', async () => {
    const cwd = await workspace(); const marker = join(cwd, 'marker')
    const controller = new AbortController(); controller.abort(new Error('private abort'))
    expect(await executeMiraHook(hook(`require('fs').writeFileSync(${JSON.stringify(marker)},'spawned')`), input(), { cwd, signal: controller.signal })).toEqual({ stdout: '', stderr: '', exitCode: null, status: 'cancelled', error: 'Hook 已停止' })
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('cancels a running process, awaits shutdown and then supports a fresh invocation', async () => {
    const cwd = await workspace(); const controller = new AbortController()
    let pid = 0
    const running = executeMiraHook(hook('console.log(process.pid);process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'), input(), { cwd, signal: controller.signal, onUpdate: output => { pid = Number(output.stdout.trim()) } })
    await waitUntil(() => pid > 0); ownedPids.push(pid); controller.abort(new Error('private abort'))
    expect(await running).toMatchObject({ status: 'cancelled', error: 'Hook 已停止' })
    expect(alive(pid)).toBe(false)
    expect(await executeMiraHook(hook('console.log("next")'), input(), { cwd })).toMatchObject({ status: 'ok', stdout: 'next\n' })
  })

  it.skipIf(process.platform === 'win32')('terminates a real detached descendant as well as the root before returning', async () => {
    const cwd = await workspace(); const controller = new AbortController()
    let pids: number[] = []
    const running = executeMiraHook(hook(`const child=require('child_process').spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});console.log(JSON.stringify([process.pid,child.pid]));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`), input(), { cwd, signal: controller.signal, onUpdate: output => { try { pids = JSON.parse(output.stdout) } catch { /* Wait for complete line. */ } } })
    await waitUntil(() => pids.length === 2); ownedPids.push(...pids); controller.abort()
    expect(await running).toMatchObject({ status: 'cancelled' })
    await waitUntil(() => pids.every(pid => !alive(pid)))
  })

  it('bounds the actual combined stdout and stderr, terminates overflow and identifies the limit', async () => {
    const outcome = await executeMiraHook(hook(`process.stdout.write('a'.repeat(20000));process.stderr.write('b'.repeat(20000));setInterval(()=>{},1000)`), input(), { cwd: await workspace() })
    expect(outcome).toMatchObject({ status: 'failed', error: 'Hook 输出超过 32 KiB 限制，已停止进程' })
    expect(Buffer.byteLength(outcome.stdout) + Buffer.byteLength(outcome.stderr)).toBe(MIRA_HOOK_OUTPUT_LIMIT)
    expect(outcome.output).toBeUndefined()
  })

  it('accepts exactly the output limit without truncation', async () => {
    const outcome = await executeMiraHook(hook(`process.stdout.write('a'.repeat(${MIRA_HOOK_OUTPUT_LIMIT}))`), input('PostToolUse'), { cwd: await workspace() })
    expect(outcome.status).toBe('ok'); expect(outcome.stdout).toHaveLength(MIRA_HOOK_OUTPUT_LIMIT)
  })

  it('keeps malformed UTF-8 and a clipped Unicode character within the combined byte budget', async () => {
    for (const script of [`process.stdout.write(Buffer.alloc(40000,255));setInterval(()=>{},1000)`, `process.stdout.write('a'.repeat(32767)+'😀');setInterval(()=>{},1000)`]) {
      const outcome = await executeMiraHook(hook(script), input(), { cwd: await workspace() })
      expect(outcome.status).toBe('failed')
      expect(Buffer.byteLength(outcome.stdout) + Buffer.byteLength(outcome.stderr)).toBeLessThanOrEqual(MIRA_HOOK_OUTPUT_LIMIT)
    }
  })

  it('uses the configured timeout and shuts down before reporting a recoverable failure', async () => {
    let pid = 0
    const outcome = await executeMiraHook(hook('console.log(process.pid);setInterval(()=>{},1000)', { timeout: 0.3 }), input(), { cwd: await workspace(), onUpdate: output => { pid = Number(output.stdout.trim()) } })
    expect(pid).toBeGreaterThan(0); ownedPids.push(pid)
    expect(outcome).toMatchObject({ status: 'failed', error: 'Hook 执行超时，请检查命令或调整超时设置' }); expect(alive(pid)).toBe(false)
  })

  it('defaults to 60 seconds and retains ownership even for async Hooks', async () => {
    const schedule = globalThis.setTimeout
    const timers = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: Parameters<typeof schedule>[0], ms?: number, ...args: unknown[]) => schedule(callback, ms === 60_000 ? 300 : ms, ...args)) as typeof setTimeout)
    const outcome = await executeMiraHook(hook('setInterval(()=>{},1000)', { async: true }), input(), { cwd: await workspace() })
    expect(timers.mock.calls.some(([, milliseconds]) => milliseconds === 60_000)).toBe(true)
    expect(outcome.status).toBe('failed'); expect(outcome.error).toContain('超时')
  })

  it('stops and reports a stable error if its output consumer throws', async () => {
    const outcome = await executeMiraHook(hook('console.log("start");setInterval(()=>{},1000)'), input(), { cwd: await workspace(), onUpdate: () => { throw new Error('private-ui-error') } })
    expect(outcome).toMatchObject({ status: 'failed', error: 'Hook 输出处理失败' })
  })
})
