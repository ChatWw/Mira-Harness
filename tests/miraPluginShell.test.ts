import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExecutionError, err, ok, type ExecutionEnv, type ShellExecOptions } from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeMiraPluginShell } from '../electron/services/miraPluginShell'

const limit = 128 * 1024
const roots: string[] = []
const environments: NodeExecutionEnv[] = []
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const nodeCommand = (script: string) => `${shellQuote(process.execPath)} -e ${shellQuote(script)}`
function environment() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-plugin-shell-')))
  roots.push(root)
  const env = new NodeExecutionEnv({ cwd: root })
  environments.push(env)
  return { root, env }
}
function mockEnvironment(exec: (command: string, options?: ShellExecOptions) => ReturnType<ExecutionEnv['exec']>) {
  return { exec: vi.fn(exec) } as unknown as ExecutionEnv
}
afterEach(async () => {
  for (const env of environments.splice(0)) await env.cleanup()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('bounded Mira plugin shell context', () => {
  it('uses the granted environment, fixed timeout and original signal with cumulative updates', async () => {
    const signal = new AbortController().signal, updates = vi.fn()
    const env = mockEnvironment(async (_command, options) => {
      expect(options?.timeout).toBe(30); expect(options?.abortSignal).toBe(signal)
      options?.onStdout?.('first\n'); options?.onStderr?.('warning'); options?.onStdout?.('last\n')
      return ok({ stdout: 'first\nlast\n', stderr: 'warning', exitCode: 0 })
    })
    const result = await executeMiraPluginShell(env, 'exact command', signal, updates)
    expect(env.exec).toHaveBeenCalledOnce()
    expect(result).toEqual({ content: [{ type: 'text', text: 'first\nlast\n' }], details: { stderr: 'warning' } })
    expect(updates.mock.calls.map(([update]) => update)).toEqual([
      { content: [{ type: 'text', text: 'first\n' }], details: { stderr: '' } },
      { content: [{ type: 'text', text: 'first\n' }], details: { stderr: 'warning' } },
      result,
    ])
  })
  it('retains empty stdout, whitespace and literal dynamic markers without recursive execution or redaction', async () => {
    for (const stdout of ['', '  \n', 'token=plain !`printf nested`\n']) {
      const env = mockEnvironment(async () => ok({ stdout, stderr: 'diagnostic', exitCode: 0 }))
      expect((await executeMiraPluginShell(env, 'one command', new AbortController().signal)).content).toEqual([{ type: 'text', text: stdout }])
      expect(env.exec).toHaveBeenCalledOnce()
    }
  })
  it('accepts exactly 128 KiB across both streams', async () => {
    const env = mockEnvironment(async (_command, options) => {
      options?.onStdout?.('a'.repeat(limit - 3)); options?.onStderr?.('汉')
      return ok({ stdout: 'a'.repeat(limit - 3), stderr: '汉', exitCode: 0 })
    })
    const result = await executeMiraPluginShell(env, 'boundary', new AbortController().signal)
    expect(Buffer.byteLength(result.content[0]!.text) + Buffer.byteLength(result.details.stderr)).toBe(limit)
  })
  it('throws within the chunk callback before publishing output over the combined UTF-8 byte limit', async () => {
    const updates = vi.fn()
    const env = mockEnvironment(async (_command, options) => {
      options?.onStdout?.('a'.repeat(limit - 2)); options?.onStderr?.('汉')
      return ok({ stdout: '', stderr: '', exitCode: 0 })
    })
    await expect(executeMiraPluginShell(env, 'overflow', new AbortController().signal, updates)).rejects.toThrow('128 KiB')
    expect(updates).toHaveBeenCalledOnce()
  })
  it('also rejects oversized final output when an environment did not stream chunks', async () => {
    const env = mockEnvironment(async () => ok({ stdout: 'a'.repeat(limit), stderr: 'x', exitCode: 0 }))
    await expect(executeMiraPluginShell(env, 'final overflow', new AbortController().signal)).rejects.toThrow('128 KiB')
  })
  it.each([['aborted', '已取消'], ['timeout', '超时'], ['spawn_error', '执行失败']] as const)('reports %s with a concise Chinese cause', async (code, message) => {
    const env = mockEnvironment(async () => err(new ExecutionError(code, 'transport detail')))
    await expect(executeMiraPluginShell(env, 'failed', new AbortController().signal)).rejects.toThrow(message)
  })
  it('reports a nonzero exit with stderr and does not return successful context', async () => {
    const env = mockEnvironment(async () => ok({ stdout: 'incomplete', stderr: 'exact failure', exitCode: 7 }))
    await expect(executeMiraPluginShell(env, 'failed', new AbortController().signal)).rejects.toThrow('退出码 7：exact failure')
  })
  it('executes a real command in the supplied cwd, preserving stdout and stderr independently', async () => {
    const { root, env } = environment()
    const result = await executeMiraPluginShell(env, nodeCommand('process.stdout.write(process.cwd()+"\\n");process.stderr.write("diagnostic")'), new AbortController().signal)
    expect(result).toEqual({ content: [{ type: 'text', text: root + '\n' }], details: { stderr: 'diagnostic' } })
    await expect(executeMiraPluginShell(env, nodeCommand('process.stderr.write("real failure");process.exit(9)'), new AbortController().signal)).rejects.toThrow('退出码 9：real failure')
  })
  it('cancels a real live process through the SDK signal without a second process launcher', async () => {
    const { env } = environment(), controller = new AbortController()
    let pid = 0
    const command = nodeCommand('process.stdout.write(String(process.pid)+"\\n");setInterval(()=>{},1000)')
    await expect(executeMiraPluginShell(env, command, controller.signal, update => {
      pid = Number(update.content[0].text.trim()); controller.abort()
    })).rejects.toThrow('已取消')
    expect(pid).toBeGreaterThan(0)
    expect(() => process.kill(pid, 0)).toThrow()
  })
  it('kills a real producer when combined output exceeds the cap instead of merely clipping context', async () => {
    const { env } = environment()
    let pid = 0, largest = 0
    const command = nodeCommand('process.stdout.write(String(process.pid)+"\\n");setInterval(()=>process.stderr.write("x".repeat(16384)),10)')
    await expect(executeMiraPluginShell(env, command, new AbortController().signal, update => {
      pid = Number(update.content[0].text.trim())
      largest = Math.max(largest, Buffer.byteLength(update.content[0].text) + Buffer.byteLength(update.details.stderr))
    })).rejects.toThrow('128 KiB')
    expect(largest).toBeLessThanOrEqual(limit); expect(pid).toBeGreaterThan(0)
    expect(() => process.kill(pid, 0)).toThrow()
  })
})
