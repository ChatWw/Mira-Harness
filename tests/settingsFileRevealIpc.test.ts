import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { MiraPaths } from '../electron/storage/miraPaths'
import { registerHarnessProjectIpcHandlers } from '../electron/ipc/harnessProjectIpc'

const electron = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), reveal: vi.fn(), open: vi.fn(async () => '') }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => electron.handlers.set(name, handler) }, BrowserWindow: {}, dialog: {}, shell: { showItemInFolder: electron.reveal, openPath: electron.open } }))

let home: string
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'mira-settings-reveal-')); vi.clearAllMocks(); electron.open.mockResolvedValue('') })
afterEach(() => { electron.handlers.clear(); rmSync(home, { recursive: true, force: true }) })
function setup() {
  const paths = new MiraPaths(home).ensure()
  registerHarnessProjectIpcHandlers({ miraPaths: paths, database: { memories: { path: () => paths.globalMemory() } } } as any)
  return { paths, reveal: (kind: unknown) => electron.handlers.get('harness:reveal-settings-file')!({}, kind) }
}

describe('settings file locations', () => {
  it('reveals the authoritative instruction and memory files', async () => {
    const { paths, reveal } = setup()
    writeFileSync(paths.globalMemory(), 'memory')
    await reveal('instructions'); await reveal('memory')
    expect(electron.reveal.mock.calls).toEqual([[paths.globalAgents()], [paths.globalMemory()]])
    expect(electron.open).not.toHaveBeenCalled()
  })
  it('opens the containing folder for a memory file that has not been created', async () => {
    const { paths, reveal } = setup()
    await reveal('memory')
    expect(electron.reveal).not.toHaveBeenCalled()
    expect(electron.open).toHaveBeenCalledExactlyOnceWith(dirname(paths.globalMemory()))
  })
  it('propagates folder opening failures', async () => {
    const { reveal } = setup()
    electron.open.mockResolvedValueOnce('file manager unavailable')
    await expect(reveal('memory')).rejects.toThrow('file manager unavailable')
  })
  it.each(['/tmp/other-file', '../secrets', undefined])('rejects arbitrary renderer input %s', async kind => {
    const { reveal } = setup()
    await expect(reveal(kind)).rejects.toThrow('设置文件类型无效')
    expect(electron.reveal).not.toHaveBeenCalled(); expect(electron.open).not.toHaveBeenCalled()
  })
})
