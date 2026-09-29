import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessTerminalSessions, type HarnessTerminalSpawner } from '../electron/services/harnessTerminalSessions'

class FakePty {
  pid = 101
  dataListener?: (data: string) => void
  exitListener?: (event: { exitCode: number; signal?: number }) => void
  writes: string[] = []
  sizes: Array<[number, number]> = []
  killed = false
  onData(listener: (data: string) => void) { this.dataListener = listener }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void) { this.exitListener = listener }
  write(data: string) { this.writes.push(data) }
  resize(columns: number, rows: number) { this.sizes.push([columns, rows]) }
  kill() { this.killed = true }
}

function sender(id: number) {
  return { id, isDestroyed: () => false, send: vi.fn() } as { id: number; isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> }
}

const roots: string[] = []
afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Harness terminal sessions', () => {
  it('spawns in the session workspace and forwards output only to its owner', async () => {
    const { mkdtemp } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const root = await mkdtemp(join(tmpdir(), 'mira-terminal-'))
    roots.push(root)
    const process = new FakePty()
    const spawner: HarnessTerminalSpawner = { spawn: vi.fn(() => process) }
    const manager = new HarnessTerminalSessions(spawner)
    const owner = sender(1)
    const opened = await manager.open(owner, 'session-1', root)
    expect(opened.cwd).toMatch(/mira-terminal-/)
    expect(spawner.spawn).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.objectContaining({ cwd: opened.cwd, cols: 100, rows: 30 }))
    process.dataListener?.('hello')
    expect(owner.send).toHaveBeenCalledWith('harness:event', expect.objectContaining({ type: 'terminal-output', sessionId: 'session-1', payload: { terminalId: opened.terminalId, data: 'hello' } }))
    await expect(manager.open(sender(2), 'session-1', root)).resolves.toBeTruthy()
    expect(() => manager.write(sender(2), 'session-1', opened.terminalId, 'bad')).toThrow('终端会话无效')
    manager.write(owner, 'session-1', opened.terminalId, 'ls\n')
    manager.resize(owner, 'session-1', opened.terminalId, 120, 40)
    expect(process.writes).toEqual(['ls\n'])
    expect(process.sizes).toEqual([[120, 40]])
    manager.close(owner, 'session-1', opened.terminalId)
    expect(process.killed).toBe(true)
  })

  it('closes sessions when the owning renderer or application exits', async () => {
    const { mkdtemp } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const root = await mkdtemp(join(tmpdir(), 'mira-terminal-'))
    roots.push(root)
    const processes = [new FakePty(), new FakePty()]
    let index = 0
    const manager = new HarnessTerminalSessions({ spawn: vi.fn(() => processes[index++]) })
    const owner = sender(1)
    await manager.open(owner, 'a', root)
    await manager.open(owner, 'b', root)
    manager.closeForWebContents(1)
    expect(processes.every(process => process.killed)).toBe(true)
  })
})
