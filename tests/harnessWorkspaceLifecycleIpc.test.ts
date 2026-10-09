import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerHarnessSessionIpcHandlers } from '../electron/ipc/harnessSessionIpc'
import { registerHarnessProjectIpcHandlers } from '../electron/ipc/harnessProjectIpc'

const electron = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), dialog: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { handle: (name: string, callback: (...args: any[]) => any) => electron.handlers.set(name, callback) },
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  dialog: { showOpenDialog: electron.dialog }, shell: {},
}))

function setup() {
  const result = { id: 'session' }
  const harness = {
    moveSession: vi.fn(() => result), deleteSession: vi.fn(() => result), deleteSessions: vi.fn(() => result),
    archiveSessions: vi.fn(() => result), attachDirectory: vi.fn(() => result), deleteProject: vi.fn(),
  }
  const database = { harness, automations: { listTasks: vi.fn(() => []), deleteTask: vi.fn() } }
  const workspaceWatch = { closeForSession: vi.fn(), closeInvalid: vi.fn() }
  const automationScheduler = { reschedule: vi.fn() }
  registerHarnessSessionIpcHandlers({ database, workspaceWatch } as any)
  registerHarnessProjectIpcHandlers({ database, workspaceWatch, automationScheduler } as any)
  const invoke = (channel: string, ...params: unknown[]) => electron.handlers.get(channel)!({ sender: {} }, ...params)
  return { invoke, harness, workspaceWatch, result, automationScheduler }
}

beforeEach(() => { electron.handlers.clear(); vi.clearAllMocks() })

describe('workspace watcher legacy lifecycle', () => {
  it.each(['move-session', 'delete-session'])('closes listeners after a successful %s', action => {
    const { invoke, result, workspaceWatch } = setup()
    expect(invoke(`harness:${action}`, 'session', 'project')).toBe(result)
    expect(workspaceWatch.closeForSession).toHaveBeenCalledExactlyOnceWith('session')
  })
  it.each(['delete-sessions', 'archive-sessions'])('releases each session after %s', action => {
    const { invoke, workspaceWatch } = setup()
    invoke(`harness:${action}`, ['one', 'two'])
    expect(workspaceWatch.closeForSession.mock.calls).toEqual([['one'], ['two']])
  })
  it('keeps listeners when a move fails', () => {
    const { invoke, workspaceWatch, harness } = setup()
    harness.moveSession.mockImplementation(() => { throw new Error('项目不存在') })
    expect(() => invoke('harness:move-session', 'session', 'missing')).toThrow('项目不存在')
    expect(workspaceWatch.closeForSession).not.toHaveBeenCalled()
  })
  it('preserves a canceled directory choice and releases after attachment', async () => {
    const { invoke, workspaceWatch, result } = setup()
    electron.dialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    await expect(invoke('harness:attach-directory', 'session')).resolves.toBeNull()
    expect(workspaceWatch.closeForSession).not.toHaveBeenCalled()
    electron.dialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/tmp/mira-workspace'] })
    await expect(invoke('harness:attach-directory', 'session')).resolves.toBe(result)
    expect(workspaceWatch.closeForSession).toHaveBeenCalledExactlyOnceWith('session')
  })
  it('prunes invalid watches after deleting a project, including archived sessions', () => {
    const { invoke, workspaceWatch, harness, automationScheduler } = setup()
    invoke('harness:delete-project', 'project')
    expect(harness.deleteProject).toHaveBeenCalledWith('project')
    expect(workspaceWatch.closeInvalid).toHaveBeenCalledOnce()
    expect(automationScheduler.reschedule).toHaveBeenCalledOnce()
  })
})
