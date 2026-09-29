import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { spawn } from 'node:child_process'
import type { PlatformDatabase } from '../storage/database'
import type { LocalMicroAppServer } from '../adapters/localMicroAppServer'
import type { McpConfigStore } from '../storage/mcpConfigStore'
import type { MicroApp } from '../../src/types'
import { firstPartyAppManifests, validateFirstPartyAppManifest, type FirstPartyAppManifest } from '../../src/config/firstPartyApps'
import type { ModelSelection } from '../../src/config/harness'
import type { NovelProjectDocument } from '../../src/config/novel'
import { FirstPartyGrantStore } from '../security/firstPartyGrant'
import { parseFirstPartyHarnessCall } from '../../src/platform/firstPartyHarness'
import type { HarnessRuntime } from '../services/harnessRuntime'
import { listHarnessWorkspaceFiles, readHarnessWorkspaceFile } from '../services/harnessWorkspaceFiles'
import type { HarnessTerminalSessions } from '../services/harnessTerminalSessions'

export interface PlatformIpcDependencies {
  database: PlatformDatabase
  harnessRuntime?: HarnessRuntime
  localMicroAppServer: LocalMicroAppServer
  legacyNovelApiToken?: string
  firstPartyManifests?: readonly FirstPartyAppManifest[]
  firstPartyGrantStore?: FirstPartyGrantStore
  fetchImpl?: typeof fetch
  terminalSessions?: HarnessTerminalSessions
  mcpConfigStore?: McpConfigStore
}

function boundedString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new Error(`${field} 无效`)
  return value
}

function requireMainFrame(event: { senderFrame?: { parent: unknown } }) {
  if (event.senderFrame?.parent) throw new Error('第一方授权只能由宿主主页面申请')
}

function resolveFirstPartyGrant(event: { sender: { id: number }; senderFrame?: { parent: unknown } }, grantId: unknown, firstPartyGrantStore: FirstPartyGrantStore, firstPartyManifests: readonly FirstPartyAppManifest[], capability: FirstPartyAppManifest['capabilities'][number], appId = 'mira-novel-studio') {
  requireMainFrame(event)
  const grant = firstPartyGrantStore.resolve(boundedString(grantId, '授权句柄', 128), event.sender.id)
  const manifest = grant && firstPartyManifests.find(item => item.enabled && item.appId === grant.appId)
  if (!grant || !manifest || manifest.appId !== appId) throw new Error('第一方授权无效或应用已停用')
  validateFirstPartyAppManifest(manifest)
  if (!manifest.capabilities.includes(capability) || !grant.capabilities.has(capability)) {
    throw new Error(capability === 'models:text.generate' ? '应用没有模型生成能力' : '应用没有所需能力')
  }
  return { grant, manifest }
}

export function registerPlatformIpcHandlers({ database, harnessRuntime, localMicroAppServer, legacyNovelApiToken, terminalSessions, mcpConfigStore, firstPartyManifests = firstPartyAppManifests, firstPartyGrantStore = new FirstPartyGrantStore(), fetchImpl = fetch }: PlatformIpcDependencies) {
  ipcMain.handle('platform:get-snapshot', () => database.getSnapshot())
  ipcMain.handle('platform:save-preference', (_event, key: string, value: unknown) => database.savePreference(key, value))
  ipcMain.handle('platform:update-menus', (_event, menus) => database.saveMenus(menus))
  ipcMain.handle('platform:update-microapps', (_event, apps: MicroApp[]) => {
    localMicroAppServer.validateApps(apps)
    const snapshot = database.saveMicroApps(apps)
    localMicroAppServer.setApps(snapshot.microApps)
    return snapshot
  })
  ipcMain.handle('platform:select-microapp-directory', async windowEvent => {
    const options: OpenDialogOptions = {
      properties: ['openDirectory'],
      title: '选择微应用构建目录',
    }
    const owner = BrowserWindow.fromWebContents(windowEvent.sender) || BrowserWindow.getFocusedWindow()
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return null
    return localMicroAppServer.validateDirectory(result.filePaths[0])
  })
  ipcMain.handle('platform:resolve-local-microapp-url', (_event, appId: string) => localMicroAppServer.getEntryUrl(appId))
  ipcMain.handle('platform:get-novel-api-base-url', () => localMicroAppServer.getApiBaseUrl('novel'))
  ipcMain.handle('platform:create-first-party-grant', (event, appId: string) => {
    requireMainFrame(event)
    appId = boundedString(appId, '应用 ID', 128)
    const manifest = firstPartyManifests.find(item => item.enabled && item.appId === appId)
    if (!manifest) throw new Error('第一方应用未登记或已停用')
    validateFirstPartyAppManifest(manifest)
    const grantId = firstPartyGrantStore.issue(manifest.appId, event.sender.id, manifest.capabilities)
    if (typeof event.sender.once === 'function') event.sender.once('destroyed', () => firstPartyGrantStore.revokeForWebContents(event.sender.id))
    return grantId
  })
  ipcMain.handle('platform:revoke-first-party-grant', (event, grantId: string) => {
    requireMainFrame(event)
    firstPartyGrantStore.revoke(boundedString(grantId, '授权句柄', 128), event.sender.id)
    terminalSessions?.closeForWebContents(event.sender.id)
  })
  ipcMain.handle('platform:generate-first-party-text', async (event, grantId: string, role: 'authoring' | 'automation', prompt: string, selection: ModelSelection) => {
    const { grant, manifest } = resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'models:text.generate')
    if (role !== 'authoring' && role !== 'automation') throw new Error('模型职责无效')
    boundedString(prompt, '模型请求内容', 100_000)
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) throw new Error('模型选择无效')
    const providerId = boundedString(selection.providerId, '供应商 ID', 128)
    const modelId = boundedString(selection.modelId, '模型 ID', 128)
    if (!legacyNovelApiToken) throw new Error('第一方模型通道尚未配置')
    const baseUrl = localMicroAppServer.getApiBaseUrl('novel').replace(/\/?$/, '/')
    const response = await fetchImpl(`${baseUrl}${role}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${legacyNovelApiToken}` },
      body: JSON.stringify({ prompt, selection: { providerId, modelId } }),
    })
    if (!response.ok) throw new Error(`模型请求失败：${response.status}`)
    return response.text()
  })
  ipcMain.handle('platform:first-party-list-novel-projects', (event, grantId: string) => {
    resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'storage:novel-projects')
    return database.novels.listProjects()
  })
  ipcMain.handle('platform:first-party-get-novel-project', (event, grantId: string, id: string) => {
    resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'storage:novel-projects')
    return database.novels.getProject(boundedString(id, '作品 ID', 256))
  })
  ipcMain.handle('platform:first-party-save-novel-project', (event, grantId: string, project: NovelProjectDocument) => {
    resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'storage:novel-projects')
    return database.novels.saveProject(project)
  })
  ipcMain.handle('platform:first-party-harness', (event, grantId: string, method: string, params: unknown) => {
    resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
    if (!harnessRuntime) throw new Error('Harness 服务不可用')
    const call = parseFirstPartyHarnessCall(method, params)
    switch (call.method) {
      case 'sessions.list': return database.harness.listSessions()
      case 'projects.list': return database.harness.listProjects()
      case 'providers.list': return database.models.list()
      case 'session.get': return database.harness.getSession(call.id)
      case 'session.create': return database.harness.createSession(call.projectId)
      case 'session.rename': return database.harness.renameSession(call.id, call.title)
      case 'session.set-pinned': return database.harness.setPinned(call.id, call.pinned)
      case 'session.set-unread': return database.harness.setUnread(call.id, call.unread)
      case 'session.archive': return database.harness.archiveSessions([call.id])
      case 'session.delete': return database.harness.deleteSession(call.id)
      case 'session.move': return database.harness.moveSession(call.id, call.projectId)
      case 'session.reorder': return database.harness.reorderSessions(call.scope, call.ids)
      case 'session.set-permission': return database.harness.setPermission(call.id, call.mode)
      case 'session.set-skills': {
        const selected = database.skills.resolve(call.skillIds)
        if (selected.length !== new Set(call.skillIds).size) throw new Error('只能选择已启用且有效的 Skill')
        return database.harness.setActiveSkills(call.id, selected.map(skill => skill.id))
      }
      case 'session.set-mcp-servers': {
        if (!mcpConfigStore) throw new Error('MCP 服务不可用')
        const enabledIds = new Set(mcpConfigStore.list().filter(server => server.enabled).map(server => server.id))
        if (call.serverIds.some(serverId => !enabledIds.has(serverId))) throw new Error('只能选择已启用的 MCP 服务')
        return database.harness.setActiveMcpServers(call.id, call.serverIds)
      }
      case 'session.set-delegation': return database.harness.setDelegationEnabled(call.id, call.enabled)
      case 'projects.reorder': return database.harness.reorderProjects(call.ids)
      case 'skills.list': return database.skills.list()
      case 'git.branches': return database.harness.listGitBranches(call.projectId)
      case 'git.checkout': return database.harness.checkoutGitBranch(call.projectId, call.branch)
      case 'git.create-branch': return database.harness.createAndCheckoutGitBranch(call.projectId, call.branch)
      case 'permissions.pending': return harnessRuntime.listPendingPermissions(call.sessionId)
      case 'permission.respond': return harnessRuntime.resolvePermission(call.requestId, call.allowed)
      case 'memory.respond': return harnessRuntime.respondMemoryConfirmation(call.requestId, call.approved)
      case 'memory.save': return harnessRuntime.saveProjectMemory(event.sender, call.sessionId, call.selection)
      case 'subtask.stop': return harnessRuntime.stopSubtasks(call.sessionId, call.subtaskId ? [call.subtaskId] : undefined)
      case 'run.abort': return harnessRuntime.abort(call.sessionId)
      case 'run.rerun': return harnessRuntime.rerun(event.sender, call.sessionId, call.selection)
      case 'run.edit-rerun': return harnessRuntime.editAndRerun(event.sender, call.sessionId, call.messageId, call.content, call.selection)
      case 'message.run': return harnessRuntime.runMessage(event.sender, call.sessionId, call.text, call.references, call.selection, call.planning)
      case 'plan.confirm': return harnessRuntime.confirmPlan(event.sender, call.sessionId, call.planId, call.selection)
      case 'plan.cancel': return harnessRuntime.cancelPlan(event.sender, call.sessionId, call.planId)
      case 'plan.continue': return harnessRuntime.continuePlan(event.sender, call.sessionId, call.planId, call.message, call.references, call.selection)
      case 'interaction.answer': return harnessRuntime.answerInteraction(event.sender, call.sessionId, call.interactionId, call.answers, call.selection)
      case 'files.list': {
        const session = database.harness.getSession(call.sessionId)
        const directory = session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
        if (!directory) throw new Error('该会话没有可用工作目录')
        return listHarnessWorkspaceFiles(directory, call.path)
      }
      case 'files.read': {
        const session = database.harness.getSession(call.sessionId)
        const directory = session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
        if (!directory) throw new Error('该会话没有可用工作目录')
        return readHarnessWorkspaceFile(directory, call.path)
      }
      case 'terminal.open': {
        if (!terminalSessions) throw new Error('终端服务不可用')
        const session = database.harness.getSession(call.sessionId)
        const directory = session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
        if (!directory) throw new Error('该会话没有可用工作目录')
        if (typeof event.sender.once === 'function') event.sender.once('destroyed', () => terminalSessions.closeForWebContents(event.sender.id))
        return terminalSessions.open(event.sender, call.sessionId, directory)
      }
      case 'terminal.write': {
        if (!terminalSessions) throw new Error('终端服务不可用')
        terminalSessions.write(event.sender, call.sessionId, call.terminalId, call.data)
        return undefined
      }
      case 'terminal.resize': {
        if (!terminalSessions) throw new Error('终端服务不可用')
        terminalSessions.resize(event.sender, call.sessionId, call.terminalId, call.columns, call.rows)
        return undefined
      }
      case 'terminal.close': {
        if (!terminalSessions) throw new Error('终端服务不可用')
        terminalSessions.close(event.sender, call.sessionId, call.terminalId)
        return undefined
      }
      case 'browser.navigate': {
        database.harness.getSession(call.sessionId)
        return { sessionId: call.sessionId, url: call.url, bounds: call.bounds }
      }
      case 'browser.bounds':
      case 'browser.control': {
        database.harness.getSession(call.sessionId)
        return call
      }
      case 'project.open': {
        const session = database.harness.getSession(call.sessionId)
        const directory = session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
        if (!directory) throw new Error('该会话没有可用工作目录')
        if (call.target === 'file-manager') return shell.openPath(directory)
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
      }
    }
  })
  ipcMain.handle('platform:import-snapshot', (_event, snapshot: string) => {
    const next = database.importSnapshot(snapshot)
    localMicroAppServer.setApps(next.microApps)
    return next
  })
  ipcMain.handle('platform:restore-defaults', () => {
    const next = database.restoreDefaults()
    localMicroAppServer.setApps(next.microApps)
    return next
  })
  ipcMain.handle('platform:export-snapshot', () => database.exportSnapshot())
}
