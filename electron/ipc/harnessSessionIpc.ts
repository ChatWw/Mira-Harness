import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import type { HarnessFileReference } from '../../src/config/harness'
import type { PlatformDatabase } from '../storage/database'
import type { HarnessRuntime } from '../services/harnessRuntime'
import type { McpConfigStore } from '../storage/mcpConfigStore'
import type { PythonEnvironment } from '../adapters/pythonEnv'

export interface HarnessSessionIpcDependencies {
  database: PlatformDatabase
  harnessRuntime: HarnessRuntime
  mcpConfigStore: McpConfigStore
  pythonEnvironment: PythonEnvironment
}

export function registerHarnessSessionIpcHandlers({ database, harnessRuntime, mcpConfigStore, pythonEnvironment }: HarnessSessionIpcDependencies) {
  ipcMain.handle('harness:list-sessions', (_event, query?: string) => database.harness.listSessions(query))
  ipcMain.handle('harness:query-history', (_event, query) => database.queryHarnessHistory(query))
  ipcMain.handle('harness:query-usage', () => database.queryHarnessUsage())
  ipcMain.handle('harness:create-session', (_event, projectId?: string) => database.harness.createSession(projectId))
  ipcMain.handle('harness:get-session', (_event, id: string) => database.harness.getSession(id))
  ipcMain.handle('harness:set-permission', (_event, id: string, permissionMode) => database.harness.setPermission(id, permissionMode))
  ipcMain.handle('harness:set-active-skills', (_event, id: string, skillIds: string[]) => {
    const requested = Array.isArray(skillIds) ? skillIds : []
    const selected = database.skills.resolve(requested)
    if (selected.length !== new Set(requested).size) throw new Error('只能选择已启用且有效的 Skill')
    return database.harness.setActiveSkills(id, selected.map(skill => skill.id))
  })
  ipcMain.handle('harness:set-active-mcp-servers', (_event, id: string, serverIds: string[]) => {
    const requested = Array.isArray(serverIds) ? [...new Set(serverIds.filter((value): value is string => typeof value === 'string'))] : []
    const enabledIds = new Set(mcpConfigStore.list().filter(server => server.enabled).map(server => server.id))
    if (requested.some(serverId => !enabledIds.has(serverId))) throw new Error('只能选择已启用的 MCP 服务')
    return database.harness.setActiveMcpServers(id, requested)
  })
  ipcMain.handle('harness:set-delegation-enabled', (_event, id: string, enabled: boolean) => database.harness.setDelegationEnabled(id, Boolean(enabled)))
  ipcMain.handle('harness:save-project-memory', (event, id: string, selection) => harnessRuntime.saveProjectMemory(event.sender, id, selection))
  ipcMain.handle('harness:set-pinned', (_event, id: string, pinned: boolean) => database.harness.setPinned(id, pinned))
  ipcMain.handle('harness:reorder-projects', (_event, ids: string[]) => database.harness.reorderProjects(ids))
  ipcMain.handle('harness:reorder-sessions', (_event, scope, ids: string[]) => database.harness.reorderSessions(scope, ids))
  ipcMain.handle('harness:set-unread', (_event, id: string, unread: boolean) => database.harness.setUnread(id, unread))
  ipcMain.handle('harness:move-session', (_event, id: string, projectId: string) => database.harness.moveSession(id, projectId))
  ipcMain.handle('harness:rename-session', (_event, id: string, title: string) => database.harness.renameSession(id, title))
  ipcMain.handle('harness:archive-sessions', (_event, ids: string[]) => database.harness.archiveSessions(ids))
  ipcMain.handle('harness:restore-sessions', (_event, ids: string[]) => database.harness.restoreSessions(ids))
  ipcMain.handle('harness:delete-session', (_event, id: string) => database.harness.deleteSession(id))
  ipcMain.handle('harness:delete-sessions', (_event, ids: string[]) => database.harness.deleteSessions(ids))
  ipcMain.handle('harness:open-session-project', (_event, id: string, target: 'file-manager' | 'terminal') => {
    const session = database.harness.getSession(id)
    const directory = session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
    if (!directory) throw new Error('该会话没有可用工作目录')
    if (target === 'file-manager') return shell.openPath(directory)
    if (process.platform === 'darwin') {
      const terminal = spawn('open', ['-a', 'Terminal', directory], { detached: true, stdio: 'ignore' })
      terminal.unref()
      return ''
    }
    if (process.platform === 'win32') {
      const command = `cd /d "${directory.replace(/"/g, '""')}"`
      const terminal = spawn('cmd.exe', ['/d', '/c', 'start', '', 'cmd.exe', '/K', command], { detached: true, stdio: 'ignore', windowsHide: true })
      terminal.unref()
      return ''
    }
    throw new Error('当前系统不支持从 Mira 打开终端')
  })
  ipcMain.handle('harness:list-project-files', (_event, projectId: string, query?: string) => database.harness.listProjectFiles(projectId, query))
  ipcMain.handle('harness:select-files', async (event, projectId: string) => {
    const project = database.harness.getProject(projectId)
    const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const options = { defaultPath: project.directory, properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>, title: '选择引用文件' }
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : database.harness.selectFileReferences(projectId, result.filePaths)
  })
  ipcMain.handle('harness:attach-directory', async (event, sessionId: string) => {
    const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const result = owner ? await dialog.showOpenDialog(owner, { properties: ['openDirectory'], title: '选择工作目录' }) : await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择工作目录' })
    return result.canceled ? null : database.harness.attachDirectory(sessionId, result.filePaths[0])
  })
  ipcMain.handle('harness:run-message', (event, sessionId: string, message: string, references: HarnessFileReference[] = [], selection, planning = false) => harnessRuntime.runMessage(event.sender, sessionId, message, references, selection, Boolean(planning)))
  ipcMain.handle('harness:confirm-plan', (event, sessionId: string, planId: string, selection) => harnessRuntime.confirmPlan(event.sender, sessionId, planId, selection))
  ipcMain.handle('harness:answer-interaction', (event, sessionId: string, interactionId: string, answers, selection) => harnessRuntime.answerInteraction(event.sender, sessionId, interactionId, answers, selection))
  ipcMain.handle('harness:continue-plan', (event, sessionId: string, planId: string, message: string, references: HarnessFileReference[] = [], selection) => harnessRuntime.continuePlan(event.sender, sessionId, planId, message, references, selection))
  ipcMain.handle('harness:cancel-plan', (event, sessionId: string, planId: string) => harnessRuntime.cancelPlan(event.sender, sessionId, planId))
  ipcMain.handle('harness:rerun', (event, sessionId: string, selection) => harnessRuntime.rerun(event.sender, sessionId, selection))
  ipcMain.handle('harness:edit-and-rerun', (event, sessionId: string, messageId: string, content: string, selection) => harnessRuntime.editAndRerun(event.sender, sessionId, messageId, content, selection))
  ipcMain.handle('harness:abort-run', (_event, sessionId: string) => harnessRuntime.abort(sessionId))
  ipcMain.handle('harness:stop-subtasks', (_event, sessionId: string, ids?: string[]) => harnessRuntime.stopSubtasks(sessionId, ids))
  ipcMain.handle('harness:respond-permission', (_event, requestId: string, allowed: boolean) => harnessRuntime.resolvePermission(requestId, Boolean(allowed)))
  ipcMain.handle('harness:list-trash', (_event, projectId?: string) => database.harness.listTrash(projectId))
  ipcMain.handle('harness:restore-trash', (_event, projectId: string, token: string) => database.harness.restoreTrash(projectId, token))
  ipcMain.handle('harness:python-status', () => pythonEnvironment.status())
  ipcMain.handle('harness:python-exec', (_event, script: string, args: string[]) => pythonEnvironment.run(script, args))
  ipcMain.handle('harness:python-install-package', (_event, packageName: string) => pythonEnvironment.install(packageName))
}
