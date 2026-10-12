import { execFile, spawn } from 'node:child_process'
import { miraFlowChildEnvironment } from '../../../packages/mira-flow-runtime/src/mira-environment'
import type { MiraFlowCommandRequest, MiraFlowCommandResult } from './miraFlowWorld'
import { MiraFlowError } from '../../../packages/mira-flow-kit/src/engine/mira-errors'

/** Execute the already-approved argv; never reinterpret workflow arguments as shell source. */
export function executeMiraFlowCommand(request: MiraFlowCommandRequest): Promise<MiraFlowCommandResult> {
  request.signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(request.command, [...request.args], {
      cwd: request.cwd, env: miraFlowChildEnvironment(process.env), shell: false,
      windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = [], stderr: Buffer[] = []
    let outBytes = 0, errBytes = 0, failure: Error | undefined
    const fail = (error: Error) => {
      if (failure) return
      failure = error
      if (!child.pid) return
      if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => { child.kill('SIGKILL') })
      } else {
        try { process.kill(-child.pid, 'SIGKILL') }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL') }
      }
    }
    const abort = () => fail(new Error('工作流命令已停止'))
    const started = Date.now()
    let timer: ReturnType<typeof setTimeout>
    const armTimeout = () => {
      const remaining = request.timeoutMs - (Date.now() - started)
      if (remaining <= 0) { fail(new Error('工作流命令超时')); return }
      timer = setTimeout(armTimeout, Math.min(remaining, 2_147_483_647))
    }
    armTimeout()
    child.stdout.on('data', (chunk: Buffer) => {
      outBytes += chunk.length
      if (outBytes > request.stdoutMaxBytes) fail(new MiraFlowError('WorldReadCapExceeded', '工作流命令输出超出限制'))
      else stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      errBytes += chunk.length
      if (errBytes > request.stderrMaxBytes) fail(new MiraFlowError('WorldReadCapExceeded', '工作流命令错误输出超出限制'))
      else stderr.push(chunk)
    })
    child.once('error', error => { failure ??= error })
    child.once('close', (code, signal) => {
      clearTimeout(timer); request.signal.removeEventListener('abort', abort)
      if (failure) reject(failure)
      else if (signal) reject(new Error('工作流命令被终止'))
      else resolve({ exitCode: code ?? 1, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') })
    })
    request.signal.addEventListener('abort', abort, { once: true })
    if (request.signal.aborted) abort()
  })
}
