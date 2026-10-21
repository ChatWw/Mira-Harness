import { BrowserWindow, clipboard, dialog, ipcMain, shell, webContents, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { MiraWorkspaceHtml } from '../services/miraWorkspaceHtml'
import type { MiraWorkspaceMedia } from '../services/miraWorkspaceMedia'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { basename } from 'node:path'
import type { PlatformDatabase } from '../storage/database'
import type { LocalMicroAppServer } from '../adapters/localMicroAppServer'
import type { McpConfigStore } from '../storage/mcpConfigStore'
import type { MicroApp } from '../../src/types'
import { invokeMiraFlowRequest, type MiraFlowRequestPort } from './miraFlowIpc'
import { firstPartyAppManifests, validateFirstPartyAppManifest, type FirstPartyAppManifest } from '../../src/config/firstPartyApps'
import type { ModelSelection } from '../../src/config/harness'
import { assertComposerFollowupMode, resolveComposerFollowupMode } from '../../src/config/composerPreferences'
import type { NovelProjectDocument } from '../../src/config/novel'
import { FirstPartyGrantStore } from '../security/firstPartyGrant'
import { parseFirstPartyHarnessCall, type HarnessAttachmentSaveResult } from '../../src/platform/firstPartyHarness'
import type { HarnessRuntime } from '../services/harnessRuntime'
import { removeHarnessProject } from './harnessProjectIpc'
import { listHarnessWorkspaceFiles, resolveHarnessWorkspacePath, readHarnessWorkspaceFile, readHarnessWorkspaceImage, searchHarnessWorkspaceFiles } from '../services/harnessWorkspaceFiles'
import type { HarnessTerminalSessions } from '../services/harnessTerminalSessions'
import type { HarnessWorkspaceWatch } from '../services/harnessWorkspaceWatch'
import { getInstalledHarnessEditors, openHarnessWorkspaceInEditor } from '../services/harnessWorkspaceEditors'
import { readHarnessWorkspaceGit, readHarnessWorkspaceIgnored } from '../services/harnessWorkspaceGit'
import type { SkillMarketplaceService } from '../services/skillMarketplace'
import type { AutomationScheduler } from '../services/automationScheduler'
import { automationRunWithSessionState, saveAutomationTask } from './automationIpc'
import { MiraBrowserViewports } from '../services/miraBrowserViewports'
import { MiraBrowserProtection } from '../services/miraBrowserProtection'
import type { McpManager } from '../adapters/mcpManager'
import { harnessPluginMcpCatalog, harnessProjectMcpCatalog } from '../services/harnessMcpCatalog'
import type { MiraHookDelete, MiraHookEnabled, MiraHookWrite } from '../../src/config/miraHooks'
import { HarnessHookCatalog } from '../services/harnessHookCatalog'
import { isMiraPluginId } from '../../src/config/miraPlugins'

export interface PlatformIpcDependencies {
  remoteControl?: (sender: import('electron').WebContents, action: import('../../src/config/miraRemote').MiraRemoteAction, id?: string) => Promise<import('../../src/config/miraRemote').MiraRemoteStatus>
  workspaceHtml?: MiraWorkspaceHtml
  workspaceMedia?: MiraWorkspaceMedia
  flows?: MiraFlowRequestPort
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
  mcpManager?: Pick<McpManager, 'getStatus'> & Partial<Pick<McpManager, 'reconnect'>>
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

export function registerPlatformIpcHandlers({ remoteControl, database, harnessRuntime, flows, localMicroAppServer, workspaceMedia, workspaceHtml, legacyNovelApiToken, terminalSessions, workspaceWatch, mcpConfigStore, mcpManager, skillMarketplace, automationScheduler, firstPartyManifests = firstPartyAppManifests, firstPartyGrantStore = new FirstPartyGrantStore(), fetchImpl = fetch }: PlatformIpcDependencies) {
  const userAgents = (call: ReturnType<typeof parseFirstPartyHarnessCall>) => {
    if (!['agents.list', 'agents.read', 'agents.save', 'agents.delete', 'agents.setEnabled'].includes(call.method)) throw new Error('智能体请求无效')
    let directory: string | undefined
    if ('sessionId' in call && call.sessionId) {
      const session = database.harness.getSession(call.sessionId)
      if (session.projectId) directory = realpathSync(session.workingDirectory || database.harness.getProject(session.projectId).directory)
    } else if ('projectId' in call && call.projectId) directory = realpathSync(database.harness.getProject(call.projectId).directory)
    switch (call.method) {
      case 'agents.list': return database.userAgents.list(directory)
      case 'agents.read': return database.userAgents.read(call.scope, call.name, directory)
      case 'agents.save': return database.userAgents.save(call, directory)
      case 'agents.delete': return database.userAgents.delete(call, directory)
      case 'agents.setEnabled': return database.userAgents.setEnabled(call, directory)
    }
  }
  const promptCommands = (call: ReturnType<typeof parseFirstPartyHarnessCall>) => {
    if (!['commands.list', 'commands.read', 'commands.save', 'commands.delete'].includes(call.method)) throw new Error('命令请求无效')
    let directory: string | undefined
    if ('sessionId' in call && call.sessionId) {
      const session = database.harness.getSession(call.sessionId)
      if (session.projectId) directory = realpathSync(session.workingDirectory || database.harness.getProject(session.projectId).directory)
    } else if ('projectId' in call && call.projectId) directory = realpathSync(database.harness.getProject(call.projectId).directory)
    switch (call.method) {
      case 'commands.list': return database.promptCommands.list(directory)
      case 'commands.read': return database.promptCommands.read(call.scope, call.name, directory)
      case 'commands.save': return database.promptCommands.save(call, directory)
      case 'commands.delete': return database.promptCommands.delete(call, directory)
    }
  }
  const firstPartyGrantOwners = new WeakSet<object>()
  const browserViewports = new MiraBrowserViewports()
  const browserProtection = new MiraBrowserProtection()
  const archivedSelections = new Map<string, { snapshotId: string; ids: readonly string[]; webContentsId: number }>()
  ipcMain.handle('platform:get-snapshot', () => database.getSnapshot())
  ipcMain.handle('platform:agent-models', (event, method: string, params?: unknown) => {
    requireMainFrame(event)
    const call = parseFirstPartyHarnessCall(method, params)
    if (call.method === 'agent-models.list') return database.agentModels.list()
    if (call.method === 'agent-models.set') return database.agentModels.set(call.target, call.modelSelection)
    throw new Error('智能体模型请求无效')
  })
  ipcMain.handle('platform:user-agents', (event, method: string, params?: unknown) => {
    requireMainFrame(event)
    return userAgents(parseFirstPartyHarnessCall(method, params))
  })
  ipcMain.handle('platform:prompt-commands', (event, method: string, params?: unknown) => {
    requireMainFrame(event)
    return promptCommands(parseFirstPartyHarnessCall(method, params))
  })
  ipcMain.handle('platform:hooks', (event, method: unknown, params: unknown = {}) => {
    if (!event.senderFrame || event.senderFrame.parent !== null || event.senderFrame !== event.sender.mainFrame
      || event.sender.isDestroyed() || !BrowserWindow.fromWebContents(event.sender)) throw new Error('Hook 配置仅可在平台设置中管理')
    if (typeof method !== 'string' || !['hooks.list', 'hooks.save', 'hooks.delete', 'hooks.setEnabled', 'hooks.trust', 'hooks.revokeTrust'].includes(method)
      || !params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Hook 请求无效')
    const input = params as Record<string, unknown>
    const keys = method === 'hooks.list' ? ['projectId'] : method === 'hooks.save'
      ? ['projectId', 'scope', 'id', 'expectedRevision', 'name', 'event', 'type', 'command', 'args', 'async', 'shell', 'statusMessage', 'timeout', 'custom', 'matcher', 'enabled']
      : ['projectId', 'scope', 'id', 'expectedRevision', ...(input.scope === 'plugin' && ['hooks.trust', 'hooks.revokeTrust'].includes(method) ? ['pluginId'] : []), ...(method === 'hooks.setEnabled' ? ['enabled'] : [])]
    if (Object.keys(input).some(key => !keys.includes(key))) throw new Error('Hook 请求不能指定宿主路径或未知字段')
    const pluginApproval = input.scope === 'plugin' && ['hooks.trust', 'hooks.revokeTrust'].includes(method)
    if (method !== 'hooks.list' && input.scope !== 'global' && input.scope !== 'project' && !pluginApproval || method === 'hooks.revokeTrust' && !pluginApproval) throw new Error('Hook 范围无效')
    if (pluginApproval && (typeof input.pluginId !== 'string' || !isMiraPluginId(input.pluginId) || input.projectId !== undefined)) throw new Error('Hook 插件标识无效')
    if (method !== 'hooks.list' && method !== 'hooks.save' && (typeof input.id !== 'string' || !input.id.trim() || input.id.length > 128
      || typeof input.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedRevision))) throw new Error('Hook 标识或版本无效')
    try {
      let directory: string | undefined
      if (input.projectId !== undefined) directory = realpathSync(database.harness.getProject(boundedString(input.projectId, '项目 ID', 128)).directory)
      if (input.scope === 'project' && !directory) throw new Error('请先选择有效项目目录')
      if (pluginApproval) {
        const snapshot = database.plugins.snapshots().find(plugin => plugin.id === input.pluginId)
        const declared = snapshot?.hooks?.find(hook => hook.id === input.id)
        if (!snapshot || !declared) throw new Error('Hook 已移除或已被修改，请刷新后重试')
        const hook = method === 'hooks.trust' ? database.plugins.assertHook([snapshot], declared.id)
          : { ...declared, pluginId: snapshot.id, pluginName: snapshot.name, sourceRoot: snapshot.root, enabled: snapshot.enabled && declared.enabled }
        return database.hooks.trustPlugin(hook, input.expectedRevision as string, method === 'hooks.trust')
      }
      switch (method) {
        case 'hooks.list': return new HarnessHookCatalog(database.hooks, database.plugins).list(directory)
        case 'hooks.save': return database.hooks.save(input as unknown as MiraHookWrite, directory)
        case 'hooks.delete': return database.hooks.delete(input as unknown as MiraHookDelete, directory)
        case 'hooks.setEnabled': return database.hooks.setEnabled(input as unknown as MiraHookEnabled, directory)
        case 'hooks.trust': return database.hooks.trust(input as unknown as MiraHookDelete, directory)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/^(?:Hook |每个 Hook |此 Hook |请先选择有效项目目录|Mira 用户目录不可用|项目 ID 无效|未找到项目)/.test(message)) throw new Error(message)
      throw new Error('Hook 配置操作失败，请检查配置文件权限后重试')
    }
  })
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
        workspaceMedia?.closeForWebContents(event.sender.id)
        workspaceHtml?.closeForWebContents(event.sender.id)
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
      workspaceMedia?.closeForGrant(grantId, event.sender.id)
      workspaceHtml?.closeForGrant(grantId, event.sender.id)
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
    if (method === 'workflows.request') {
      const call = parseFirstPartyHarnessCall(method, params)
      if (call.method !== 'workflows.request') throw new Error('工作流请求无效')
      return invokeMiraFlowRequest(flows, event, call.request, () => {
        resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
      })
    }
    if (!harnessRuntime) throw new Error('Harness 服务不可用')
    const call = parseFirstPartyHarnessCall(method, params)
    const assertMarketAuthorized = () => {
      if (event.sender.isDestroyed()) throw new Error('Harness 连接已关闭')
      resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
    }
    const fileWorkspace = (scope: { projectId: string; rootPath?: string } | { sessionId: string }) => {
      const session = 'sessionId' in scope ? database.harness.getSession(scope.sessionId) : undefined
      const projectId = 'projectId' in scope ? scope.projectId : session?.projectId
      const project = projectId ? database.harness.getProject(projectId) : undefined
      const rootPath = 'rootPath' in scope ? scope.rootPath : undefined
      if (rootPath && !project?.roots?.some(root => root.rootPath === rootPath) && project?.directory !== rootPath) throw new Error('所选源文件夹已不在项目中，请重新打开文件工作区。')
      const directory = 'projectId' in scope ? rootPath || project?.directory : session?.workingDirectory || project?.directory
      if (!directory) throw new Error('该会话没有可用工作目录')
      return { directory, identity: JSON.stringify([projectId, directory]), owner: 'projectId' in scope ? JSON.stringify(['project', projectId, directory]) : scope.sessionId }
    }
    const assertFileWorkspace = (scope: { projectId: string; rootPath?: string } | { sessionId: string }, expected: ReturnType<typeof fileWorkspace>) => {
      if (event.sender.isDestroyed?.()) throw new Error('Harness 连接已关闭')
      resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
      if (fileWorkspace(scope).identity !== expected.identity) throw new Error('工作目录已变化，请重新打开文件工作区。')
    }
    switch (call.method) {
      case 'input-history.list': {
        const session = call.sessionId ? database.harness.getSession(call.sessionId) : undefined
        const projectId = session?.projectId ?? call.projectId
        const directory = session?.workingDirectory || (projectId ? database.harness.getProject(projectId).directory : undefined)
        return database.promptHistory.list(directory)
      }
      case 'remote.control': { if (!remoteControl) throw new Error('远程控制不可用'); return remoteControl(event.sender, call.action, call.id) }
      case 'permissions.config': return database.harness.getPermissionConfig()
      case 'automations.list': {
        if (!automationScheduler) throw new Error('自动化服务不可用')
        return database.automations.listTasks().map(task => ({ ...task, nextRunAt: automationScheduler.taskNextRun(task) }))
      }
      case 'automations.overview': return database.automations.overview()
      case 'automations.next-runs': {
        if (!automationScheduler) throw new Error('自动化服务不可用')
        return automationScheduler.nextRuns(call.expression, call.rule)
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
      case 'automations.delete-run': return database.automations.deleteRun(call.id)
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
      case 'plugin-marketplace.sources': return skillMarketplace?.pluginMarkets.sources() ?? []
      case 'plugin-marketplace.add-source': {
        if (!skillMarketplace) throw new Error('插件市场服务不可用')
        return skillMarketplace.pluginMarkets.add(call.source, assertMarketAuthorized)
      }
      case 'plugin-marketplace.remove-source': {
        if (!skillMarketplace) throw new Error('插件市场服务不可用')
        return skillMarketplace.pluginMarkets.remove(call.id)
      }
      case 'plugin-marketplace.browse': {
        if (!skillMarketplace) throw new Error('插件市场服务不可用')
        return skillMarketplace.browsePlugins(call.refresh).then(result => { assertMarketAuthorized(); return result })
      }
      case 'plugin-marketplace.detail': {
        if (!skillMarketplace) throw new Error('插件市场服务不可用')
        return skillMarketplace.pluginDetail(call.id).then(result => { assertMarketAuthorized(); return result })
      }
      case 'plugin-marketplace.install': {
        if (!skillMarketplace) throw new Error('插件市场服务不可用')
        return skillMarketplace.installPlugin(call.id, assertMarketAuthorized)
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
      case 'projects.update': {
        if (harnessRuntime.isProjectRunning(call.id)) throw new Error('请先停止项目任务并处理待发送消息')
        const project = database.harness.updateProject(call.id, call.input)
        workspaceWatch?.closeInvalid()
        return project
      }
      case 'projects.create': return database.harness.createProjectWithRoots(call.input)
      case 'projects.select-directories': {
        const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
        const options: OpenDialogOptions = { properties: ['openDirectory', 'multiSelections'], title: '选择项目源文件夹' }
        return (async () => {
          const selected = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
          assertMarketAuthorized()
          return selected.canceled ? [] : selected.filePaths
        })()
      }
      case 'projects.rename': return database.harness.renameProject(call.id, call.name)
      case 'projects.remove': return removeHarnessProject({ database, harnessRuntime, automationScheduler, workspaceWatch }, call.id)
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
      case 'session.create-side': {
        if (!call.input) return database.harness.createSideConversation(call.parentId)
        const { input } = call
        const previous = database.harness.getSideConversationForInput(call.parentId, input)
        if (!previous) {
          harnessRuntime.assertMessageSelection(input.selection)
          const config = database.harness.getPermissionConfig()
          if (input.permissionMode === 'auto-approve' && !config.autoApproveEnabled || input.permissionMode === 'full' && !config.fullAccessEnabled) throw new Error('所选权限档位已停用，请重新选择')
        }
        const child = previous || database.harness.createSideConversation(call.parentId, input)
        return Promise.resolve(harnessRuntime.submitMessage(event.sender, child.id, input.submissionId, input.text, [], input.selection, false, input.permissionMode === undefined ? {} : { permissionMode: input.permissionMode })).then(receipt => {
          assertMarketAuthorized()
          if (!('submissionId' in receipt)) throw new Error('reason' in receipt && receipt.reason === 'permission-mode-disabled' ? '所选权限档位已停用，请重新选择' : '旁路问题未被接收，请重试')
          return harnessRuntime.getSession(child.id)
        })
      }
      case 'session.fork': {
        harnessRuntime.assertSessionMutable(call.id)
        return database.harness.forkConversation(call.id, call.messageId, call.requestId)
      }
      case 'session.get': return harnessRuntime.getSession(call.id)
      case 'session.paths': return database.harnessDiagnosticPaths(call.id)
      case 'session.trace': {
        database.harness.getSession(call.id)
        return database.modelTrace.read(call.id).then(trace => { assertMarketAuthorized(); database.harness.getSession(call.id); return trace })
      }
      case 'session.trace.open': {
        database.harness.getSession(call.id)
        return mkdir(database.modelTrace.directory, { recursive: true }).then(async () => {
          assertMarketAuthorized()
          database.harness.getSession(call.id)
          const error = await shell.openPath(database.modelTrace.directory)
          if (error) throw new Error('模型轨迹目录打开失败，请重试')
          assertMarketAuthorized()
        })
      }
      case 'files.rewind-preview': return harnessRuntime.previewFileRewind(call.sessionId, call.messageId).then(preview => { assertMarketAuthorized(); return preview })
      case 'files.rewind-apply': return harnessRuntime.applyFileRewind(event.sender, call.sessionId, call.messageId, call.snapshotToken, assertMarketAuthorized)
      case 'files.rewind-recover': return harnessRuntime.recoverFileRewind(event.sender, call.sessionId, call.recoveryId, assertMarketAuthorized)
      case 'goal.pause': return harnessRuntime.pauseGoal(event.sender, call.sessionId, call.expectedRevision, call.expectedGoalId)
      case 'goal.resume': return harnessRuntime.resumeGoal(event.sender, call.sessionId, call.expectedRevision, call.selection, call.permissionMode, call.expectedGoalId)
      case 'goal.budget': return harnessRuntime.updateGoalBudget(event.sender, call.sessionId, call.tokenBudget, call.expectedRevision, call.expectedGoalId)
      case 'goal.clear': return harnessRuntime.clearGoal(event.sender, call.sessionId, call.expectedRevision, call.expectedGoalId)
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
        const owners = [call.id, ...database.harness.sideConversationIds(call.id)]
        const result = database.harness.deleteSession(call.id)
        database.removeHarnessDraftOwners(owners)
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
        const enabledIds = new Set([...mcpConfigStore.list(), ...harnessProjectMcpCatalog(database, mcpConfigStore, call.id), ...harnessPluginMcpCatalog(database, call.id)].filter(server => server.enabled).map(server => server.id))
        if (call.serverIds.some(serverId => !enabledIds.has(serverId))) throw new Error('只能选择已启用的 MCP 服务')
        return database.harness.setActiveMcpServers(call.id, call.serverIds)
      }
      case 'session.set-delegation': return database.harness.setDelegationEnabled(call.id, call.enabled)
      case 'projects.reorder': return database.harness.reorderProjects(call.ids)
      case 'plugins.list': return database.plugins.list()
      case 'agent-models.list': return database.agentModels.list()
      case 'agent-models.set': return database.agentModels.set(call.target, call.modelSelection)
      case 'agents.list':
      case 'agents.read':
      case 'agents.save':
      case 'agents.delete':
      case 'agents.setEnabled': return userAgents(call)
      case 'commands.list':
      case 'commands.read':
      case 'commands.save':
      case 'commands.delete': return promptCommands(call)
      case 'plugins.catalog': {
        const frozen = call.sessionId ? database.harness.getSession(call.sessionId).pluginCatalog : undefined
        return database.plugins.catalog(frozen)
      }
      case 'plugins.set-enabled': return database.plugins.setEnabled(call.id, call.enabled)
      case 'plugins.remove': return database.plugins.remove(call.id)
      case 'plugins.import': {
        const options: OpenDialogOptions = { title: '添加本地插件包', properties: ['openDirectory'] }
        const owner = BrowserWindow.fromWebContents(event.sender)
        return (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options)).then(selected => {
          assertMarketAuthorized()
          return selected.canceled || !selected.filePaths[0] ? null : database.plugins.register(selected.filePaths[0])
        })
      }
      case 'skills.list': return database.skills.list()
      case 'mcp.list': {
        if (!mcpConfigStore) throw new Error('MCP 服务不可用')
        // Status inspection never connects a server or exposes launch commands/arguments.
        return [...mcpConfigStore.list().map(server => ({ id: server.id, name: server.name, enabled: server.enabled, ...(server.type ? { type: server.type } : {}), ...(mcpManager && server.enabled ? { connection: mcpManager.getStatus(server.id) } : {}) })), ...harnessProjectMcpCatalog(database, mcpConfigStore, call.sessionId, call.projectId).map(server => ({ ...server, ...(call.sessionId ? { connection: harnessRuntime.projectMcpStatus?.(call.sessionId, server.id) } : {}) })), ...harnessPluginMcpCatalog(database, call.sessionId).map(server => ({ ...server, ...(call.sessionId ? { connection: harnessRuntime.pluginMcpStatus?.(call.sessionId, server.id) } : {}) }))]
      }
      case 'mcp.reconnect': {
        if (!mcpConfigStore || !mcpManager?.reconnect) throw new Error('MCP 重连不可用')
        const server = mcpConfigStore.list().find(server => server.id === call.id)
        if (!server?.enabled) throw new Error('只能重连已配置且启用的 MCP 服务')
        return mcpManager.reconnect(server).then(() => {
          assertMarketAuthorized()
          return mcpManager.getStatus(server.id)
        })
      }
      case 'files.select': {
        const session = database.harness.getSession(call.sessionId)
        if (!session.projectId) throw new Error('请先选择项目，再引用项目文件')
        const directory = session.workingDirectory || (session.projectId ? database.harness.getProject(session.projectId).directory : undefined)
        if (!directory) throw new Error('该会话没有可用工作目录')
        const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
        const options = { defaultPath: directory, properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>, title: '选择引用文件' }
        return (async () => {
          const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
          if (result.canceled) return []
          return database.harness.selectFileReferences(session.projectId, result.filePaths, directory)
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
        if (call.paths) return database.harness.selectMessageAttachments(call.sessionId, call.paths)
        const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
        return (async () => {
          const options: OpenDialogOptions = { ...(session.workingDirectory ? { defaultPath: session.workingDirectory } : {}), properties: ['openFile', 'openDirectory', 'multiSelections'], title: '选择引用文件或文件夹' }
          // Windows/Linux treat combined file+directory flags as directory-only.
          if (process.platform !== 'darwin') {
            const choice = { message: '添加文件或文件夹', buttons: ['选择文件', '选择文件夹', '取消'], defaultId: 0, cancelId: 2 }
            const { response } = owner ? await dialog.showMessageBox(owner, choice) : await dialog.showMessageBox(choice)
            if (response === 2) return []
            if (event.sender.isDestroyed?.()) throw new Error('Harness 连接已关闭')
            resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
            database.harness.assertAttachmentSessionWritable(call.sessionId)
            options.properties = [response === 1 ? 'openDirectory' : 'openFile', 'multiSelections']
          }
          const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
          // 原生窗口等待期间授权、会话归档/删除都可能变化；不得用旧授权发布附件。
          if (event.sender.isDestroyed?.()) throw new Error('Harness 连接已关闭')
          resolveFirstPartyGrant(event, grantId, firstPartyGrantStore, firstPartyManifests, 'harness:workbench', 'mira-harness')
          database.harness.assertAttachmentSessionWritable(call.sessionId)
          return result.canceled ? [] : database.harness.selectMessageAttachments(call.sessionId, result.filePaths)
        })()
      }
      case 'git.generate-message': return harnessRuntime.generateGitMessage(call.projectId, call.token, call.includeUnstaged, call.selection, assertMarketAuthorized)
      case 'git.tools': return harnessRuntime.getGitTools(call.projectId, assertMarketAuthorized)
      case 'git.graph': return harnessRuntime.getGitGraph(call.projectId, call.skip, assertMarketAuthorized)
      case 'git.action': return harnessRuntime.gitAction(call.projectId, call.action, call.token, call.message, call.includeUnstaged, assertMarketAuthorized)
      case 'git.context': return harnessRuntime.getGitContext(call.projectId, assertMarketAuthorized)
      case 'git.branches': return harnessRuntime.getGitContext(call.projectId, assertMarketAuthorized).then(context => context.branches)
      case 'git.checkout': return harnessRuntime.checkoutGitBranch(call.projectId, call.branch, call.snapshotToken, assertMarketAuthorized)
      case 'git.create-branch': return harnessRuntime.createGitBranch(call.projectId, call.branch, call.snapshotToken, assertMarketAuthorized)
      case 'permissions.pending': return harnessRuntime.listPendingPermissions(call.sessionId)
      case 'permission.respond': return harnessRuntime.resolvePermission(call.requestId, call.allowed)
      case 'memory.respond': return harnessRuntime.respondMemoryConfirmation(call.requestId, call.approved)
      case 'context.compact': return harnessRuntime.compactConversation(event.sender, call.sessionId, call.selection, assertMarketAuthorized, call.submissionId)
      case 'memory.save': return harnessRuntime.saveProjectMemory(event.sender, call.sessionId, call.selection)
      case 'subtask.stop': return harnessRuntime.stopSubtasks(call.sessionId, call.subtaskId ? [call.subtaskId] : undefined)
      case 'command.background': return harnessRuntime.backgroundCommand(call.sessionId, call.runId, call.toolId)
      case 'command.stop': return harnessRuntime.stopCommand(call.sessionId, call.runId, call.toolId)
      case 'command.output': return harnessRuntime.readCommandOutput(call.sessionId, call.runId, call.toolId, assertMarketAuthorized)
      case 'run.abort': return harnessRuntime.abort(call.sessionId, call.expectedRunId)
      case 'run.rerun': return harnessRuntime.rerun(event.sender, call.sessionId, call.selection)
      case 'run.edit-rerun': return harnessRuntime.editAndRerun(event.sender, call.sessionId, call.messageId, call.content, call.selection, call.references, call.workspace, assertMarketAuthorized)
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
        const workspace = fileWorkspace(call)
        return openHarnessWorkspaceInEditor(workspace.directory, call.path, call.editorId, () => assertFileWorkspace(call, workspace))
      }
      case 'files.browser-url': {
        if (!workspaceHtml) throw new Error('HTML 预览服务不可用')
        const workspace = fileWorkspace(call)
        return workspaceHtml.open(workspace.directory, call.path, { grantId, webContentsId: event.sender.id }, () => assertFileWorkspace(call, workspace))
      }
      case 'files.reveal': {
        const workspace = fileWorkspace(call)
        return resolveHarnessWorkspacePath(workspace.directory, call.path).then(async file => {
          const info = await stat(file.target)
          assertFileWorkspace(call, workspace)
          if (info.isDirectory()) { const error = await shell.openPath(file.target); if (error) throw new Error(error) }
          else if (info.isFile()) shell.showItemInFolder(file.target)
          else throw new Error('只能打开文件或文件夹')
        })
      }
      case 'files.media-open': {
        if (!workspaceMedia) throw new Error('媒体预览服务不可用')
        const workspace = fileWorkspace(call)
        const authorize = () => assertFileWorkspace(call, workspace)
        return workspaceMedia.open(workspace.directory, call.path, { grantId, webContentsId: event.sender.id }, authorize).then(preview => {
          try { authorize(); return { ...preview, url: localMicroAppServer.getMediaUrl(preview.id) } }
          catch (error) { workspaceMedia.release(preview.id, { grantId, webContentsId: event.sender.id }); throw error }
        })
      }
      case 'files.media-close':
        workspaceMedia?.release(call.id, { grantId, webContentsId: event.sender.id })
        return
      case 'files.read':
      case 'files.read-image': {
        const workspace = fileWorkspace(call)
        const reading = call.method === 'files.read-image' ? readHarnessWorkspaceImage(workspace.directory, call.path) : readHarnessWorkspaceFile(workspace.directory, call.path)
        return reading.then(result => { assertFileWorkspace(call, workspace); return result })
      }
      case 'files.watch': {
        if (!workspaceWatch) throw new Error('文件变化监听不可用，请使用手动刷新。')
        const workspace = fileWorkspace(call)
        const resolveWorkspace = () => { assertFileWorkspace(call, workspace); return workspace.directory }
        const isAuthorized = () => { try { assertFileWorkspace(call, workspace); return true } catch { return false } }
        return workspaceWatch.start(event.sender, grantId, workspace.owner, call.paths, resolveWorkspace, isAuthorized)
      }
      case 'files.unwatch': {
        const owner = 'sessionId' in call ? call.sessionId : JSON.stringify(['project', call.projectId, call.rootPath || database.harness.getProject(call.projectId).directory])
        workspaceWatch?.stop(event.sender.id, grantId, owner, call.watchId)
        return undefined
      }
      case 'terminal.open': {
        if (!terminalSessions) throw new Error('终端服务不可用')
        const session = database.harness.getSession(call.sessionId)
        const directory = session.workingDirectory || (session.projectId ? database.harness.getProject(session.projectId).directory : undefined)
        if (!directory) throw new Error('该会话没有可用工作目录')
        return terminalSessions.open(event.sender, call.sessionId, directory)
      }
      case 'terminal.write': {
        if (!terminalSessions) throw new Error('终端服务不可用')
        terminalSessions.write(event.sender, call.sessionId, call.terminalId, call.data)
        return undefined
      }
      case 'terminal.paste': {
        if (!terminalSessions) throw new Error('终端服务不可用')
        database.harness.getSession(call.sessionId)
        terminalSessions.paste(event.sender, call.sessionId, call.terminalId, () => clipboard.readText(), call.bracketed)
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
        browserProtection.start()
        return { sessionId: call.sessionId, url: call.url, bounds: call.bounds, ...('browserId' in call ? { browserId: call.browserId } : {}), ...('visible' in call ? { visible: call.visible } : {}) }
      }
      case 'browser.bounds': {
        database.harness.getSession(call.sessionId)
        return call
      }
      case 'browser.viewport': {
        database.harness.getSession(call.sessionId)
        return browserViewports.update(event.sender, call.guestId, call.viewport)
      }
      case 'browser.protection': {
        database.harness.getSession(call.sessionId)
        return browserProtection.read(event.sender, call.guestId)
      }
      case 'browser.pick': {
        if (call.action === 'start') database.harness.getSession(call.sessionId)
        const guest = call.guestId === undefined ? undefined : webContents.fromId(call.guestId)
        if (!guest || guest.isDestroyed() || guest.getType() !== 'webview' || guest.hostWebContents !== event.sender) throw new Error('浏览器目标不属于当前窗口')
        // The Vue resource registry injects only Mira's fixed picker; React cannot submit JavaScript.
        return null
      }
      case 'browser.external': {
        database.harness.getSession(call.sessionId)
        return shell.openExternal(call.url)
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
