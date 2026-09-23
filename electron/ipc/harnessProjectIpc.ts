import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { HarnessProjectCreateInput, HarnessSkillSettings, MemoryScope } from '../../src/config/harness'
import type { PlatformDatabase } from '../storage/database'
import type { HarnessRuntime } from '../services/harnessRuntime'
import type { AutomationScheduler } from '../services/automationScheduler'
import type { MiraPaths } from '../storage/miraPaths'

export interface HarnessProjectIpcDependencies {
  database: PlatformDatabase
  harnessRuntime: HarnessRuntime
  automationScheduler: AutomationScheduler
  miraPaths: MiraPaths
}

export function registerHarnessProjectIpcHandlers({ database, harnessRuntime, automationScheduler, miraPaths }: HarnessProjectIpcDependencies) {
  ipcMain.handle('harness:list-skills', () => database.skills.list())
  ipcMain.handle('harness:get-skill-settings', () => database.skills.settings())
  ipcMain.handle('harness:save-skill-settings', (_event, settings: HarnessSkillSettings) => database.skills.saveSettings(settings))
  ipcMain.handle('harness:set-skill-enabled', (_event, id: string, enabled: boolean) => database.skills.setEnabled(id, Boolean(enabled)))
  ipcMain.handle('harness:list-projects', () => database.harness.listProjects())
  ipcMain.handle('harness:open-project-directory', (_event, id: string) => shell.openPath(database.harness.getProject(id).directory))
  ipcMain.handle('harness:select-project-directory', async event => {
    const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const result = owner ? await dialog.showOpenDialog(owner, { properties: ['openDirectory'], title: '选择项目源文件夹' }) : await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择项目源文件夹' })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('harness:create-project', async (event, input: HarnessProjectCreateInput = {}) => {
    let target = input.directory
    if (!target) {
      const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
      const result = owner ? await dialog.showOpenDialog(owner, { properties: ['openDirectory'], title: '选择 Agent 项目目录' }) : await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择 Agent 项目目录' })
      if (result.canceled) return null
      target = result.filePaths[0]
    }
    return database.harness.createProject(target, input.name, input.icon)
  })
  ipcMain.handle('harness:rename-project', (_event, id: string, name: string, icon?: string) => database.harness.renameProject(id, name, icon))
  ipcMain.handle('harness:delete-project', (_event, id: string) => {
    database.automations.listTasks().filter(task => task.projectId === id).forEach(task => database.automations.deleteTask(task.id))
    database.harness.deleteProject(id)
    automationScheduler.reschedule()
  })
  ipcMain.handle('harness:get-global-instructions', () => database.instructions.readGlobal())
  ipcMain.handle('harness:save-global-instructions', (_event, content: string) => database.instructions.saveGlobal(content))
  ipcMain.handle('harness:get-global-instructions-path', () => miraPaths.globalAgents())
  ipcMain.handle('harness:get-memory-enabled', () => database.memories.enabled())
  ipcMain.handle('harness:set-memory-enabled', (_event, enabled: boolean) => database.memories.setEnabled(enabled))
  ipcMain.handle('harness:get-memory-path', () => database.memories.path('global'))
  ipcMain.handle('harness:reset-memory', () => database.memories.resetGlobal())
  ipcMain.handle('harness:list-memory', (_event, scope: MemoryScope, projectId?: string) => harnessRuntime.listMemory(scope, projectId))
  ipcMain.handle('harness:remember-memory', (_event, content: string) => harnessRuntime.rememberMemory(content))
  ipcMain.handle('harness:update-memory', (_event, scope: MemoryScope, id: string, content: string, projectId?: string) => harnessRuntime.updateMemory(scope, id, content, projectId))
  ipcMain.handle('harness:delete-memory', (_event, scope: MemoryScope, id: string, content: string, projectId?: string) => harnessRuntime.deleteMemory(scope, id, projectId))
  ipcMain.handle('harness:list-pending-memory', () => harnessRuntime.listPendingMemory())
  ipcMain.handle('harness:discard-pending-memory', (_event, candidateId: string) => harnessRuntime.discardPendingMemory(candidateId))
  ipcMain.handle('harness:retry-memory', (_event, candidateId: string) => harnessRuntime.retryMemory(candidateId))
  ipcMain.handle('harness:respond-memory-confirmation', (_event, requestId: string, approved: boolean) => harnessRuntime.respondMemoryConfirmation(requestId, approved))
  ipcMain.handle('harness:list-git-branches', (_event, projectId: string) => database.harness.listGitBranches(projectId))
  ipcMain.handle('harness:checkout-git-branch', (_event, projectId: string, branchName: string) => database.harness.checkoutGitBranch(projectId, branchName))
  ipcMain.handle('harness:create-and-checkout-git-branch', (_event, projectId: string, branchName: string) => database.harness.createAndCheckoutGitBranch(projectId, branchName))
  ipcMain.handle('harness:get-permission-config', () => database.harness.getPermissionConfig())
  ipcMain.handle('harness:get-git-config', () => database.harness.getGitConfig())
  ipcMain.handle('harness:save-git-config', (_event, config) => database.harness.saveGitConfig(config))
}
