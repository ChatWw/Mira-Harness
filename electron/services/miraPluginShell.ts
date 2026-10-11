import type { ExecutionEnv } from '@earendil-works/pi-agent-core'

const OUTPUT_LIMIT = 128 * 1024
const OUTPUT_LIMIT_MESSAGE = '插件命令输出超过 128 KiB，已停止'
interface MiraPluginShellResult { content: [{ type: 'text'; text: string }]; details: { stderr: string } }

/** Execute once in the granted environment; shell output is context, never another command. */
export async function executeMiraPluginShell(env: ExecutionEnv, command: string, signal: AbortSignal, onUpdate?: (result: MiraPluginShellResult) => void): Promise<MiraPluginShellResult> {
  let stdout = '', stderr = '', bytes = 0
  const result = (out: string, error: string): MiraPluginShellResult => ({ content: [{ type: 'text', text: out }], details: { stderr: error } })
  const chunk = (stream: 'stdout' | 'stderr', value: string) => {
    bytes += Buffer.byteLength(value, 'utf8')
    // NodeExecutionEnv turns a callback error into process-tree termination.
    if (bytes > OUTPUT_LIMIT) throw new Error(OUTPUT_LIMIT_MESSAGE)
    if (stream === 'stdout') stdout += value
    else stderr += value
    onUpdate?.(result(stdout, stderr))
  }
  const execution = await env.exec(command, {
    timeout: 30,
    abortSignal: signal,
    onStdout: value => chunk('stdout', value),
    onStderr: value => chunk('stderr', value),
  })
  if (execution.ok === false) {
    if (execution.error.code === 'aborted') throw new Error('插件命令已取消')
    if (execution.error.code === 'timeout') throw new Error('插件命令执行超时（30 秒）')
    if (execution.error.code === 'callback_error' && execution.error.message === OUTPUT_LIMIT_MESSAGE) throw new Error(OUTPUT_LIMIT_MESSAGE)
    throw new Error(`插件命令执行失败：${execution.error.message}`)
  }
  if (signal.aborted) throw new Error('插件命令已取消')
  const output = execution.value
  if (Buffer.byteLength(output.stdout, 'utf8') + Buffer.byteLength(output.stderr, 'utf8') > OUTPUT_LIMIT) throw new Error(OUTPUT_LIMIT_MESSAGE)
  if (output.exitCode !== 0) throw new Error(`插件命令执行失败，退出码 ${output.exitCode}${output.stderr ? `：${output.stderr}` : ''}`)
  return result(output.stdout, output.stderr)
}
