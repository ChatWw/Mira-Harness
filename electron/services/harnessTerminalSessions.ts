import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { platform } from 'node:process'
import type { WebContents } from 'electron'
import * as pty from 'node-pty'

const MAX_WRITE_BYTES = 100_000

export interface HarnessTerminalSession {
  terminalId: string
  sessionId: string
  cwd: string
}

interface TerminalProcess {
  pid: number
  onData(listener: (data: string) => void): void
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void
  write(data: string): void
  resize(columns: number, rows: number): void
  kill(): void
}

export interface HarnessTerminalSpawner {
  spawn(file: string, args: string[], options: pty.IPtyForkOptions): TerminalProcess
}

function terminalEvent(sessionId: string, type: 'terminal-output' | 'terminal-exit', payload: Record<string, unknown>) {
  return { sessionId, eventId: randomUUID(), occurredAt: Date.now(), type, payload }
}

function boundedText(value: unknown) {
  if (typeof value !== 'string' || value.length > MAX_WRITE_BYTES) throw new Error('终端输入无效')
  return value
}

function boundedDimension(value: unknown, name: string) {
  if (!Number.isInteger(value) || (value as number) < 2 || (value as number) > 500) throw new Error(`${name}无效`)
  return value as number
}

export class HarnessTerminalSessions {
  private readonly sessions = new Map<string, { ownerId: number; sessionId: string; cwd: string; process: TerminalProcess; sender: WebContents }>()

  constructor(private readonly spawner: HarnessTerminalSpawner = pty) {}

  async open(sender: WebContents, sessionId: string, requestedCwd?: string): Promise<HarnessTerminalSession> {
    const cwd = await this.resolveCwd(requestedCwd)
    const shell = platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || '/bin/sh')
    const args = platform === 'win32' ? [] : ['-l']
    const child = this.spawner.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
    })
    const terminalId = randomUUID()
    const entry = { ownerId: sender.id, sessionId, cwd, process: child, sender }
    this.sessions.set(terminalId, entry)
    child.onData(data => {
      if (this.sessions.get(terminalId) !== entry || sender.isDestroyed()) return
      sender.send('harness:event', terminalEvent(sessionId, 'terminal-output', { terminalId, data }))
    })
    child.onExit(result => {
      if (this.sessions.get(terminalId) !== entry) return
      this.sessions.delete(terminalId)
      if (!sender.isDestroyed()) sender.send('harness:event', terminalEvent(sessionId, 'terminal-exit', { terminalId, exitCode: result.exitCode, signal: result.signal }))
    })
    return { terminalId, sessionId, cwd }
  }

  write(sender: WebContents, sessionId: string, terminalId: string, data: string) {
    const entry = this.authorize(sender, sessionId, terminalId)
    entry.process.write(boundedText(data))
  }

  resize(sender: WebContents, sessionId: string, terminalId: string, columns: number, rows: number) {
    const entry = this.authorize(sender, sessionId, terminalId)
    entry.process.resize(boundedDimension(columns, '终端列数'), boundedDimension(rows, '终端行数'))
  }

  close(sender: WebContents, sessionId: string, terminalId: string) {
    const entry = this.authorize(sender, sessionId, terminalId)
    this.sessions.delete(terminalId)
    entry.process.kill()
  }

  closeForWebContents(webContentsId: number) {
    for (const [terminalId, entry] of this.sessions) {
      if (entry.ownerId !== webContentsId) continue
      this.sessions.delete(terminalId)
      entry.process.kill()
    }
  }

  closeAll() {
    for (const [terminalId, entry] of this.sessions) {
      this.sessions.delete(terminalId)
      entry.process.kill()
    }
  }

  private authorize(sender: WebContents, sessionId: string, terminalId: string) {
    const entry = this.sessions.get(terminalId)
    if (!entry || entry.ownerId !== sender.id || entry.sessionId !== sessionId) throw new Error('终端会话无效')
    return entry
  }

  private async resolveCwd(requestedCwd?: string) {
    const cwd = requestedCwd?.trim() || homedir()
    const resolved = await realpath(cwd).catch(() => { throw new Error('终端工作目录不可用') })
    const directory = await stat(resolved).catch(() => undefined)
    if (!directory?.isDirectory()) throw new Error('终端工作目录不可用')
    return resolved
  }
}
