import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

export interface MiraComputerFeedback {
  execute<T>(name: string, args: Record<string, unknown>, signal: AbortSignal | undefined, call: (signal: AbortSignal) => Promise<T>): Promise<T>
  close(): Promise<void>
}
export interface MiraComputerConnection { transport: Transport; feedback: MiraComputerFeedback }
export interface MiraComputerOptions { resourceRoot: string; platform?: NodeJS.Platform; executable?: string }

export function miraComputerLaunch(options: MiraComputerOptions) {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32' && platform !== 'darwin') throw new Error('Mira 电脑控制目前支持 Windows 和 macOS')
  const root = join(options.resourceRoot, platform === 'win32' ? 'windows' : 'macos')
  const script = join(root, platform === 'win32' ? 'mcp/server.mjs' : 'server.mjs')
  if (!existsSync(script) || (platform === 'darwin' && ['dsh-cu', 'dsh-cursor-overlay'].some(name => !existsSync(join(root, 'plugin/bin', name))))) throw new Error('Mira 电脑控制组件缺失，请修复安装；开发环境请运行 npm run tools:build')
  return { command: options.executable ?? process.execPath, args: [script], cwd: root,
    env: { ...getDefaultEnvironment(), ELECTRON_RUN_AS_NODE: '1', ...(platform === 'win32' ? { PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD', WCU_SETTINGS_JSON: JSON.stringify({ indicatorText: 'Mira 正在控制电脑', browserFirst: false }) } : {}) }, stderr: 'ignore' as const }
}

/** Let native helpers release held input and remove overlays before the stdio parent exits. */
class ComputerTransport extends StdioClientTransport {
  private closing?: Promise<void>
  close() {
    return this.closing ??= (async () => {
      const pid = this.pid
      if (pid) {
        await this.send({ jsonrpc: '2.0', method: 'mira/shutdown' }).catch(() => undefined)
        const deadline = Date.now() + 1800
        const alive = () => { try { process.kill(pid, 0); return true } catch { return false } }
        while (alive() && Date.now() < deadline) await delay(25)
        if (alive() && process.platform === 'win32') await new Promise<void>(resolve => execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve()))
      }
      await super.close()
    })()
  }
}

let desktopOwner: MiraComputerSession | undefined

/** The selected backend owns its visual feedback. This lease scopes input and cancellation to one Mira run. */
export class MiraComputerSession implements MiraComputerFeedback {
  private stopped = false
  constructor(private readonly stop: () => Promise<void>) {}

  async execute<T>(_name: string, _args: Record<string, unknown>, signal: AbortSignal | undefined, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    signal?.throwIfAborted()
    if (this.stopped) throw new DOMException('电脑控制已停止，请发送新消息后继续', 'AbortError')
    if (desktopOwner && desktopOwner !== this) throw new Error('另一个任务正在使用电脑，请等待该任务结束或停止后重试')
    desktopOwner = this
    const abort = () => { void this.close() }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const result = await call(signal ?? new AbortController().signal)
      const response = result as { isError?: boolean; content?: Array<{ text?: string }> }
      if (response.isError && response.content?.some(item => /COMPUTER_USE_STOPPED_BY_USER/.test(item.text ?? ''))) {
        await this.close()
        throw new DOMException('用户按 Esc 停止了电脑控制，请发送新消息后继续', 'AbortError')
      }
      return result
    } finally { signal?.removeEventListener('abort', abort) }
  }

  private closing?: Promise<void>
  close() {
    return this.closing ??= (async () => {
      this.stopped = true
      await this.stop()
      if (desktopOwner === this) desktopOwner = undefined
    })()
  }
}

export function createMiraComputerConnection(options: MiraComputerOptions): MiraComputerConnection {
  const transport = new ComputerTransport(miraComputerLaunch(options))
  return { transport, feedback: new MiraComputerSession(() => transport.close()) }
}
