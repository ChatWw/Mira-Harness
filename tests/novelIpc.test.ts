import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NovelIpcDependencies } from '../electron/ipc/novelIpc'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => electron.handlers.set(channel, handler)),
}))

vi.mock('electron', () => ({ ipcMain: { handle: electron.handle } }))

import { registerNovelIpcHandlers } from '../electron/ipc/novelIpc'

describe('novel IPC registration', () => {
  beforeEach(() => {
    electron.handlers.clear()
    vi.clearAllMocks()
  })

  it('keeps the existing novel channels and delegates their arguments', () => {
    const database = {
      novels: {
        listProjects: vi.fn(() => ['summary']),
        getProject: vi.fn((id: string) => ({ id })),
        createProject: vi.fn((title?: string) => ({ title })),
        saveProject: vi.fn((project: unknown) => project),
        deleteProject: vi.fn(),
        exportProject: vi.fn((id: string) => `export:${id}`),
        importProject: vi.fn((raw: string) => raw),
        getSettings: vi.fn(() => ({ theme: 'dark' })),
        saveSettings: vi.fn((settings: unknown) => settings),
      },
    }
    registerNovelIpcHandlers({ database } as unknown as NovelIpcDependencies)
    const invoke = (channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender: {} }, ...args)

    expect([...electron.handlers.keys()]).toEqual([
      'platform:list-novel-projects',
      'platform:get-novel-project',
      'platform:create-novel-project',
      'platform:save-novel-project',
      'platform:delete-novel-project',
      'platform:export-novel-project',
      'platform:import-novel-project',
      'platform:get-novel-workspace-settings',
      'platform:save-novel-workspace-settings',
    ])
    expect(invoke('platform:list-novel-projects')).toEqual(['summary'])
    expect(invoke('platform:get-novel-project', 'project-1')).toEqual({ id: 'project-1' })
    expect(invoke('platform:create-novel-project', 'Draft')).toEqual({ title: 'Draft' })
    expect(invoke('platform:save-novel-project', { id: 'project-1' })).toEqual({ id: 'project-1' })
    expect(invoke('platform:export-novel-project', 'project-1')).toBe('export:project-1')
    expect(invoke('platform:import-novel-project', '{"id":"project-1"}')).toBe('{"id":"project-1"}')
    expect(invoke('platform:get-novel-workspace-settings')).toEqual({ theme: 'dark' })
    expect(invoke('platform:save-novel-workspace-settings', { theme: 'light' })).toEqual({ theme: 'light' })
    invoke('platform:delete-novel-project', 'project-1')
    expect(database.novels.deleteProject).toHaveBeenCalledWith('project-1')
  })
})
