import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { PlatformDatabase } from '../storage/database'
import type { LocalMicroAppServer } from '../adapters/localMicroAppServer'
import type { McpConfigStore } from '../storage/mcpConfigStore'
import type { MicroApp } from '../../src/types'
import { firstPartyAppManifests, validateFirstPartyAppManifest, type FirstPartyAppManifest } from '../../src/config/firstPartyApps'
import type { ModelSelection } from '../../src/config/harness'
import { assertComposerFollowupMode, resolveComposerFollowupMode } from '../../src/config/composerPreferences'
import type { NovelProjectDocument } from '../../src/config/novel'
import { FirstPartyGrantStore } from '../security/firstPartyGrant'
import { parseFirstPartyHarnessCall, type HarnessAttachmentSaveResult } from '../../src/platform/firstPartyHarness'
import type { HarnessRuntime } from '../services/harnessRuntime'
import { listHarnessWorkspaceFiles, readHarnessWorkspaceFile, readHarnessWorkspaceImage, searchHarnessWorkspaceFiles } from '../services/harnessWorkspaceFiles'
import type { HarnessTerminalSessions } from '../services/harnessTerminalSessions'
import type { HarnessWorkspaceWatch } from '../services/harnessWorkspaceWatch'
import { getInstalledHarnessEditors, openHarnessWorkspaceInEditor } from '../services/harnessWorkspaceEditors'
import { readHarnessWorkspaceGit, readHarnessWorkspaceIgnored } from '../services/harnessWorkspaceGit'
import type { SkillMarketplaceService } from '../services/skillMarketplace'
import type { AutomationScheduler } from '../services/automationScheduler'
import { automationRunWithSessionState, saveAutomationTask } from './automationIpc'

export interface PlatformIpcDependencies {
  database: PlatformDatabase
  harnessRuntime?: HarnessRuntime
  localMicroAppServer: LocalMicroAppServer
  legacyNovelApiToken?: string
  firstPartyManifests?: readonly FirstPartyAppManifest[]
  firstPartyGrantStore?: FirstPartyGrantStore
  fetchImpl?: typeof fetch
  terminalSessions?: HarnessTerminalSessions
  workspaceWatch?: HarnessWorkspaceWatch
  mcpConfigStore?: McpConfigStore
  skillMarketplace?: SkillMarketplaceService
  automationScheduler?: AutomationScheduler
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

export function registerPlatformIpcHandlers({ database, harnessRuntime, localMicroAppServer, legacyNovelApiToken, terminalSessions, workspaceWatch, mcpConfigStore, skillMarketplace, automationScheduler, firstPartyManifests = firstPartyAppManifests, firstPartyGrantStore = new FirstPartyGrantStore(), fetchImpl = fetch }: PlatformIpcDependencies) {
  const firstPartyGrantOwners = new WeakSet<object>()
  const archivedSelections = new Map<string, { snapshotId: string; ids: readonly string[]; webContentsId: number }>()
  ipcMain.handle('platform:get-snapshot', () => database.getSnapshot())
  ipcMain.handle('platform:save-preference', (_event, key: string, value: unknown) => {
    if (key === 'followupMode') assertComposerFollowupMode(value)
    return database.savePreference(key, value)
  })
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
    // 主页面重载或崩溃仍会保留 WebContents；不能只等 destroyed 才回收旧授权和监听。
    if (typeof event.sender.once === 'function' && !firstPartyGrantOwners.has(event.sender)) {
      firstPartyGrantOwners.add(event.sender)
      const cleanupOwner = () => {
        firstPartyGrantStore.revokeForWebContents(event.sender.id)
        for (const [id, selection] of archivedSelections) if (selection.webContentsId === event.sender.id) archivedSelections.delete(id)
        terminalSessions?.closeForWebContents(event.sender.id)
        workspaceWatch?.closeForWebContents(event.sender.id)
      }
      const handleNavigation = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
        if (details.isMainFrame && !details.isSameDocument) cleanupOwner()
      }
      event.sender.on('did-start-navigation', handleNavigation)
      event.sender.on('render-process-gone', cleanupOwner)
      event.sender.once('destroyed', () => {
        event.sender.removeListener('did-start-navigation', handleNavigation)
        event.sender.removeListener('render-process-gone', cleanupOwner)
        cleanupOwner()
      })
    }
    return grantId
  })
  ipcMain.handle('platform:revoke-first-party-grant', (event, grantId: string) => {
    requireMainFrame(event)
    if (firstPartyGrantStore.revoke(boundedString(grantId, '授权句柄', 128), event.sender.id)) {
      archivedSelections.delete(grantId)
      workspaceWatch?.closeForGrant(grantId, event.sender.id)
    }
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
    const assertMarketAuthorized = () => {
      if (event.sender.isDestroyed()) throw new Error('Harness 连接已关闭')
      resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
    }
    const fileWorkspace = (scope: { projectId: string } | { sessionId: string }) => {
      const session = 'sessionId' in scope ? database.harness.getSession(scope.sessionId) : undefined
      const projectId = 'projectId' in scope ? scope.projectId : session?.projectId
      const directory = projectId ? database.harness.getProject(projectId).directory : session?.workingDirectory
      if (!directory) throw new Error('该会话没有可用工作目录')
      return { directory, identity: JSON.stringify([projectId, directory]) }
    }
    const assertFileWorkspace = (scope: { projectId: string } | { sessionId: string }, expected: ReturnType<typeof fileWorkspace>) => {
      if (event.sender.isDestroyed?.()) throw new Error('Harness 连接已关闭')
      resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
      if (fileWorkspace(scope).identity !== expected.identity) throw new Error('工作目录已变化，请重新打开文件工作区。')
    }
    switch (call.method) {
      case 'permissions.config': return database.harness.getPermissionConfig()
      case 'automations.list': {
        if (!automationScheduler) throw new Error('自动化服务不可用')
        return database.automations.listTasks().map(task => ({ ...task, nextRunAt: automationScheduler.taskNextRun(task) }))
      }
      case 'automations.overview': return database.automations.overview()
      case 'automations.next-runs': {
        if (!automationScheduler) throw new Error('自动化服务不可用')
        return automationScheduler.nextRuns(call.expression)
      }
      case 'automations.save': {
        if (!automationScheduler) throw new Error('自动化服务不可用')
        return saveAutomationTask(database, automationScheduler, call.input)
      }
      case 'automations.set-enabled': {
        if (!automationScheduler) throw new Error('自动化服务不可用')
        const task = database.automations.setEnabled(call.id, call.enabled)
        automationScheduler.reschedule()
        return task
      }
      case 'automations.delete': {
        if (!automationScheduler) throw new Error('自动化服务不可用')
        database.automations.deleteTask(call.id)
        automationScheduler.reschedule()
        return
      }
      case 'automations.runs': return database.automations.listRuns(call.id, call.status ? { status: call.status } : {}).map(run => automationRunWithSessionState(database, run))
      case 'automations.run-now':
      case 'automations.retry': {
        if (!automationScheduler) throw new Error('自动化服务不可用')
        const previous = call.method === 'automations.retry' ? database.automations.getRun(call.id) : undefined
        if (previous && previous.status !== 'failed') throw new Error('只能重试失败的运行记录')
        return automationScheduler.launch(previous?.taskId ?? call.id, previous ? 'manual-retry' : 'manual', previous?.id).then(run => { assertMarketAuthorized(); return automationRunWithSessionState(database, run) })
      }
      case 'automations.abort': {
        if (!automationScheduler) throw new Error('自动化服务不可用')
        return automationScheduler.abort(call.id)
      }
      case 'sessions.list': return harnessRuntime.listSessions()
      case 'marketplace.browse': {
        if (!skillMarketplace) throw new Error('插件市场服务不可用')
        return skillMarketplace.browse(call.refresh).then(result => { assertMarketAuthorized(); return result })
      }
      case 'marketplace.detail': {
        if (!skillMarketplace) throw new Error('插件市场服务不可用')
        return skillMarketplace.detail(call.id).then(result => { assertMarketAuthorized(); return result })
      }
      case 'marketplace.install': {
        if (!skillMarketplace) throw new Error('插件市场服务不可用')
        return skillMarketplace.install(call.id, assertMarketAuthorized)
      }
      case 'marketplace.installed': {
        if (!skillMarketplace) throw new Error('插件市场服务不可用')
        return skillMarketplace.installed()
      }
      case 'composer.preferences': {
        const { sendShortcut, showContextUsage, followupMode } = database.getSnapshot().preferences
        return { sendShortcut, showContextUsage, followupMode: resolveComposerFollowupMode(followupMode) }
      }
      case 'sessions.history': return database.harness.queryHistory(call.query)
      case 'sessions.archived-snapshot': {
        const snapshotId = randomUUID()
        const ids = Object.freeze(database.harness.archivedSessionIds())
        archivedSelections.set(grantId, { snapshotId, ids, webContentsId: event.sender.id })
        return { snapshotId, count: ids.length }
      }
      case 'sessions.delete-archived': {
        const selection = archivedSelections.get(grantId)
        if (!selection || selection.snapshotId !== call.snapshotId) throw new Error('归档快照已失效，请重新打开删除确认。')
        // Consume before the first await; duplicate confirmations cannot execute the same selection.
        archivedSelections.delete(grantId)
        return harnessRuntime.deleteArchivedSessions(selection.ids, assertMarketAuthorized).then(result => {
          for (const id of result.deletedIds) workspaceWatch?.closeForSession(id)
          return result
        })
      }
      case 'sessions.search': return database.harness.searchConversations(call.query).then(result => { assertMarketAuthorized(); return result })
      case 'projects.list': return database.harness.listProjects()
      case 'projects.rename': return database.harness.renameProject(call.id, call.name)
      case 'projects.select': {
        const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
        const options: OpenDialogOptions = { properties: ['openDirectory'], title: '添加项目' }
        return (async () => {
          const selected = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
          assertMarketAuthorized()
          return selected.canceled ? null : database.harness.createProject(selected.filePaths[0])
        })()
      }
      case 'providers.list': return database.models.list()
      case 'editors.list': return getInstalledHarnessEditors(call.refresh)
      case 'session.get': return harnessRuntime.getSession(call.id)
      case 'session.create': return call.prepared === undefined ? database.harness.createSession(call.projectId) : database.harness.createSession(call.projectId, undefined, call.prepared)
      case 'session.rename': return database.harness.renameSession(call.id, call.title)
      case 'session.set-pinned': return database.harness.setPinned(call.id, call.pinned)
      case 'session.set-unread': return database.harness.setUnread(call.id, call.unread)
      case 'session.archive': {
        harnessRuntime.assertSessionMutable(call.id)
        const sessions = database.harness.archiveSessions([call.id])
        workspaceWatch?.closeForSession(call.id)
        return sessions
      }
      case 'session.restore': return database.harness.restoreSessions([call.id])
      case 'session.delete': {
        harnessRuntime.assertSessionMutable(call.id)
        const result = database.harness.deleteSession(call.id)
        database.removeHarnessDraftOwners([call.id])
        workspaceWatch?.closeForSession(call.id)
        return result
      }
      case 'session.move': {
        harnessRuntime.assertSessionMutable(call.id)
        const result = database.harness.moveSession(call.id, call.projectId)
        workspaceWatch?.closeForSession(call.id)
        return result
      }
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
      case 'mcp.list': {
        if (!mcpConfigStore) throw new Error('MCP 服务不可用')
        // 仅暴露工作台需要的字段：名称、启用状态与工具数量，不透出启动命令等配置。
        return mcpConfigStore.list().map(server => ({ id: server.id, name: server.name, enabled: server.enabled }))
      }
      case 'files.select': {
        const session = database.harness.getSession(call.sessionId)
        if (!session.projectId) throw new Error('请先选择项目，再引用项目文件')
        const directory = session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
        if (!directory) throw new Error('该会话没有可用工作目录')
        const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
        const options = { defaultPath: directory, properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>, title: '选择引用文件' }
        return (async () => {
          const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
          if (result.canceled) return []
          return database.harness.selectFileReferences(session.projectId, result.filePaths)
        })()
      }
      case 'attachments.import': return database.harness.importMessageAttachments(call.sessionId, call.files)
      case 'attachments.get': return database.harness.getMessageAttachment(call.sessionId, call.path)
      case 'attachments.save': {
        const attachment = database.harness.getMessageAttachment(call.sessionId, call.path)
        const bytes = Buffer.from(attachment.content, attachment.mediaType ? 'base64' : 'utf8')
        const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
        const name = basename(attachment.name.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '')
        const options: SaveDialogOptions = { title: '保存附件', defaultPath: name && name !== '.' && name !== '..' ? name : '附件', buttonLabel: '保存' }
        return (async (): Promise<HarnessAttachmentSaveResult> => {
          let result
          try { result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options) }
          catch { throw new Error('附件保存失败，请重试。') }
          if (result.canceled) return { status: 'canceled' }
          if (!result.filePath) throw new Error('附件保存失败，请重试。')
          // 等待系统对话框时会话可能被删除、授权可能撤销；只写入用户刚选择的位置。
          if (event.sender.isDestroyed?.()) throw new Error('Harness 连接已关闭')
          resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
          database.harness.getMessageAttachment(call.sessionId, call.path)
          try { await writeFile(result.filePath, bytes) }
          catch { throw new Error('附件保存失败，请重试。') }
          return { status: 'saved' }
        })()
      }
      case 'attachments.stage': return database.harness.stageMessageAttachment(call.sessionId, call.path)
      case 'attachments.select': {
        const session = database.harness.assertAttachmentSessionWritable(call.sessionId)
        const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
        const options: OpenDialogOptions = { ...(session.workingDirectory ? { defaultPath: session.workingDirectory } : {}), properties: ['openFile', 'multiSelections'], title: '选择附件（文本或图片）' }
        return (async () => {
          const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
          // 原生窗口等待期间授权、会话归档/删除都可能变化；不得用旧授权发布附件。
          if (event.sender.isDestroyed?.()) throw new Error('Harness 连接已关闭')
          resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
          database.harness.assertAttachmentSessionWritable(call.sessionId)
          return result.canceled ? [] : database.harness.selectMessageAttachments(call.sessionId, result.filePaths)
        })()
      }
      case 'git.context': return harnessRuntime.getGitContext(call.projectId, assertMarketAuthorized)
      case 'git.branches': return harnessRuntime.getGitContext(call.projectId, assertMarketAuthorized).then(context => context.branches)
      case 'git.checkout': return harnessRuntime.checkoutGitBranch(call.projectId, call.branch, call.snapshotToken, assertMarketAuthorized)
      case 'git.create-branch': return harnessRuntime.createGitBranch(call.projectId, call.branch, call.snapshotToken, assertMarketAuthorized)
      case 'permissions.pending': return harnessRuntime.listPendingPermissions(call.sessionId)
      case 'permission.respond': return harnessRuntime.resolvePermission(call.requestId, call.allowed)
      case 'memory.respond': return harnessRuntime.respondMemoryConfirmation(call.requestId, call.approved)
      case 'memory.save': return harnessRuntime.saveProjectMemory(event.sender, call.sessionId, call.selection)
      case 'subtask.stop': return harnessRuntime.stopSubtasks(call.sessionId, call.subtaskId ? [call.subtaskId] : undefined)
      case 'run.abort': return harnessRuntime.abort(call.sessionId, call.expectedRunId)
      case 'run.rerun': return harnessRuntime.rerun(event.sender, call.sessionId, call.selection)
      case 'run.edit-rerun': return harnessRuntime.editAndRerun(event.sender, call.sessionId, call.messageId, call.content, call.selection)
      case 'message.run': return harnessRuntime.runMessage(event.sender, call.sessionId, call.text, call.references, call.selection, call.planning)
      case 'message.submit': return call.options === undefined
        ? harnessRuntime.submitMessage(event.sender, call.sessionId, call.submissionId, call.text, call.references, call.selection, call.planning)
        : harnessRuntime.submitMessage(event.sender, call.sessionId, call.submissionId, call.text, call.references, call.selection, call.planning, call.options)
      case 'queue.list': return harnessRuntime.getMessageQueue(call.sessionId)
      case 'queue.withdraw': return harnessRuntime.withdrawMessage(call.sessionId, call.itemId)
      case 'queue.resume': return harnessRuntime.resumeMessageQueue(call.sessionId)
      case 'queue.reorder': return harnessRuntime.reorderMessageQueue(call.sessionId, call.itemId, call.beforeItemId)
      case 'queue.send-now': return harnessRuntime.sendQueuedMessageNow(call.sessionId, call.itemId, call.expectedRunId)
      case 'plan.confirm': return harnessRuntime.confirmPlan(event.sender, call.sessionId, call.planId, call.selection)
      case 'plan.cancel': return harnessRuntime.cancelPlan(event.sender, call.sessionId, call.planId)
      case 'plan.continue': return harnessRuntime.continuePlan(event.sender, call.sessionId, call.planId, call.message, call.references, call.selection)
      case 'interaction.answer': return harnessRuntime.answerInteraction(event.sender, call.sessionId, call.interactionId, call.answers, call.selection)
      case 'files.list': {
        const workspace = fileWorkspace(call)
        return listHarnessWorkspaceFiles(workspace.directory, call.path).then(result => { assertFileWorkspace(call, workspace); return result })
      }
      case 'files.search': {
        const workspace = fileWorkspace(call)
        return searchHarnessWorkspaceFiles(workspace.directory, call.query, call.refresh, () => assertFileWorkspace(call, workspace)).then(result => { assertFileWorkspace(call, workspace); return result })
      }
      case 'files.git-status':
      case 'files.git-ignored': {
        const workspace = fileWorkspace(call)
        return (call.method === 'files.git-status' ? readHarnessWorkspaceGit(workspace.directory) : readHarnessWorkspaceIgnored(workspace.directory, call.paths)).then(result => { assertFileWorkspace(call, workspace); return result })
      }
      case 'files.open-editor': {
        const session = database.harness.getSession(call.sessionId)
        const directory = session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
        if (!directory) throw new Error('该会话没有可用工作目录')
        return openHarnessWorkspaceInEditor(directory, call.path, call.editorId)
      }
      case 'files.read':
      case 'files.read-image': {
        const session = database.harness.getSession(call.sessionId)
        const directory = session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
        if (!directory) throw new Error('该会话没有可用工作目录')
        return call.method === 'files.read-image' ? readHarnessWorkspaceImage(directory, call.path) : readHarnessWorkspaceFile(directory, call.path)
      }
      case 'files.watch': {
        if (!workspaceWatch) throw new Error('文件变化监听不可用，请使用手动刷新。')
        const resolveWorkspace = () => {
          const session = database.harness.getSession(call.sessionId)
          const directory = session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
          if (!directory) throw new Error('该会话没有可用工作目录')
          return directory
        }
        const originalDirectory = resolveWorkspace()
        const isAuthorized = () => {
          try {
            resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
            return resolveWorkspace() === originalDirectory
          } catch { return false }
        }
        return workspaceWatch.start(event.sender, grantId, call.sessionId, call.paths, resolveWorkspace, isAuthorized)
      }
      case 'files.unwatch': {
        workspaceWatch?.stop(event.sender.id, grantId, call.sessionId, call.watchId)
        return undefined
      }
      case 'terminal.open': {
        if (!terminalSessions) throw new Error('终端服务不可用')
        const session = database.harness.getSession(call.sessionId)
        const directory = session.projectId ? database.harness.getProject(session.projectId).directory : session.workingDirectory
        if (!directory) throw new Error('该会话没有可用工作目录')
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
      case 'browser.bounds': {
        database.harness.getSession(call.sessionId)
        return call
      }
      case 'browser.control': {
        // A removed task must still be able to release its own hosted view.
        if (call.action !== 'close' && call.action !== 'hide') database.harness.getSession(call.sessionId)
        return call
      }
      case 'projects.open':
      case 'project.open': {
        const session = call.method === 'project.open' ? database.harness.getSession(call.sessionId) : undefined
        const projectId = call.method === 'projects.open' ? call.projectId : session?.projectId
        const directory = projectId ? database.harness.getProject(projectId).directory : session?.workingDirectory
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
    workspaceWatch?.closeInvalid()
    localMicroAppServer.setApps(next.microApps)
    return next
  })
  ipcMain.handle('platform:restore-defaults', () => {
    const next = database.restoreDefaults()
    workspaceWatch?.closeInvalid()
    localMicroAppServer.setApps(next.microApps)
    return next
  })
  ipcMain.handle('platform:export-snapshot', () => database.exportSnapshot())
}
