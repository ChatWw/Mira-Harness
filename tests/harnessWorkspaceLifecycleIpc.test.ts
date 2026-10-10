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
    archiveSessions: vi.fn(() => result), attachDirectory: vi.fn(() => result), deleteProject: vi.fn(), listSessions: vi.fn(),
  }
  const database = { harness, automations: { listTasks: vi.fn(() => []), deleteTask: vi.fn() } }
  const workspaceWatch = { closeForSession: vi.fn(), closeInvalid: vi.fn() }
  const automationScheduler = { reschedule: vi.fn() }
  const harnessRuntime = { assertSessionMutable: vi.fn(), isProjectRunning: vi.fn(() => false), listSessions: vi.fn(() => [{ id: 'session', isRunning: true }]) }
  registerHarnessSessionIpcHandlers({ database, workspaceWatch, harnessRuntime } as any)
  registerHarnessProjectIpcHandlers({ database, workspaceWatch, automationScheduler, harnessRuntime } as any)
  const invoke = (channel: string, ...params: unknown[]) => electron.handlers.get(channel)!({ sender: {} }, ...params)
  return { invoke, harness, workspaceWatch, result, automationScheduler, harnessRuntime }
}

beforeEach(() => { electron.handlers.clear(); vi.clearAllMocks() })

describe('workspace watcher legacy lifecycle', () => {
  it('routes legacy session filtering through the runtime snapshot without reading persisted status directly', () => {
    const { invoke, harness, harnessRuntime } = setup()
    const result = [{ id: 'session', isRunning: true }]
    harnessRuntime.listSessions.mockReturnValue(result)
    expect(invoke('harness:list-sessions', 'project query')).toBe(result)
    expect(harnessRuntime.listSessions).toHaveBeenCalledExactlyOnceWith('project query')
    expect(harness.listSessions).not.toHaveBeenCalled()
  })

  it.each(['move-session', 'delete-session', 'archive-sessions', 'delete-sessions'])('checks all active or queued sessions before %s mutation', action => {
    const { invoke, harness, harnessRuntime, workspaceWatch } = setup()
    for (const message of ['该会话正在运行', '请先处理待发送消息']) {
      harnessRuntime.assertSessionMutable.mockImplementation(id => { if (id === 'session') throw new Error(message) })
      const ids = action.endsWith('sessions') ? ['idle', 'session'] : 'session'
      expect(() => invoke(`harness:${action}`, ids, 'project')).toThrow(message)
      expect(harness.moveSession).not.toHaveBeenCalled()
      expect(harness.archiveSessions).not.toHaveBeenCalled()
      expect(harness.deleteSession).not.toHaveBeenCalled()
      expect(harness.deleteSessions).not.toHaveBeenCalled()
      expect(workspaceWatch.closeForSession).not.toHaveBeenCalled()
    }
  })

  it('rechecks mutation admission after the directory dialog await', async () => {
    const { invoke, harness, harnessRuntime, workspaceWatch } = setup()
    electron.dialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/other'] })
    harnessRuntime.assertSessionMutable.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('该会话正在运行') })
    await expect(invoke('harness:attach-directory', 'session')).rejects.toThrow('该会话正在运行')
    expect(harness.attachDirectory).not.toHaveBeenCalled()
    expect(workspaceWatch.closeForSession).not.toHaveBeenCalled()
  })

  it('rejects project deletion before removing tasks, sessions or watches while execution or backlog exists', () => {
    const { invoke, harness, harnessRuntime, workspaceWatch, automationScheduler } = setup()
    harnessRuntime.isProjectRunning.mockReturnValue(true)
    expect(() => invoke('harness:delete-project', 'project')).toThrow('请先停止项目任务并处理待发送消息')
    expect(harness.deleteProject).not.toHaveBeenCalled()
    expect(workspaceWatch.closeInvalid).not.toHaveBeenCalled()
    expect(automationScheduler.reschedule).not.toHaveBeenCalled()
  })
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
