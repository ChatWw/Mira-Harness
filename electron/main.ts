import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { PlatformDatabase } from './database'
import { LocalMicroAppServer } from './localMicroAppServer'
import { createNovelApiHandler } from './novelApi'
import { HarnessRuntime } from './harnessRuntime'
import { McpConfigStore } from './mcpConfigStore'
import { McpManager } from './mcpManager'
import { PythonEnvironment } from './pythonEnv'
import { AutomationScheduler } from './automationScheduler'
import { MiraPaths } from './miraPaths'
import { completeMiraDataMigration, prepareMiraDataMigration, removeLegacyUserDataFiles } from './miraDataMigration'
import type { NovelProjectDocument, NovelWorkspaceSettings } from '../src/config/novel'
import type { MicroApp } from '../src/types'
import type { AutomationRun, AutomationTaskInput, HarnessEvent, HarnessFileReference, HarnessProjectCreateInput, HarnessSkillSettings, MemoryScope, ModelProviderInput } from '../src/config/harness'

let database: PlatformDatabase
let localMicroAppServer: LocalMicroAppServer
let isQuitting = false
let tray: Tray | null = null
let harnessRuntime: HarnessRuntime
let pythonEnvironment: PythonEnvironment
let mcpConfigStore: McpConfigStore
let mcpManager: McpManager
let automationScheduler: AutomationScheduler
const legacyUserDataPath = app.getPath('userData')
const miraPaths = new MiraPaths(app.getPath('home')).ensure()
const TRASH_CLEANUP_INTERVAL_MS = 60 * 60 * 1000

// Keep Mira's data portable and inspectable under the user's home directory on every desktop OS.
app.setPath('userData', miraPaths.root)

function getCloseWindowBehavior(): 'background' | 'quit' {
  const value = database?.getSnapshot().preferences.closeWindowBehavior
  return value === 'quit' ? 'quit' : 'background'
}

function cleanupExpiredTrash() {
  try {
    database.harness.cleanupExpiredTrash()
  } catch (error) {
    console.warn('[Mira] 回收站过期清理失败', error)
  }
}

function publishHarnessEvent(event: HarnessEvent) {
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) window.webContents.send('harness:event', event)
  })
}

function automationRunWithSessionState(run: AutomationRun) {
  if (!run.sessionId) return run
  try {
    database.harness.getSession(run.sessionId)
    return { ...run, sessionAvailable: true }
  } catch {
    return { ...run, sessionAvailable: false }
  }
}

function navigateToAbout(window?: BrowserWindow | null) {
  const target = window ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send('window:navigate', '/settings/about')
}

function showMainWindow() {
  const window = BrowserWindow.getAllWindows()[0]
  if (window) {
    if (!window.isVisible()) window.show()
    window.focus()
  } else {
    createWindow()
  }
}

function setupWindowsTray() {
  if (process.platform !== 'win32') return
  const trayIcon = nativeImage.createFromPath(join(__dirname, '../../src/asset/mira.ico'))
  if (trayIcon.isEmpty()) return
  tray = new Tray(trayIcon)
  tray.setToolTip('Mira')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 Mira', click: () => showMainWindow() },
    { type: 'separator' },
    { label: '退出 Mira', click: () => app.quit() },
  ]))
  tray.on('click', () => showMainWindow())
}

function setupApplicationMenu() {
  const viewMenu: MenuItemConstructorOptions[] = [
    { label: '切换全屏', role: 'togglefullscreen' },
  ]
  if (!app.isPackaged) {
    viewMenu.unshift(
      { label: '重新加载', role: 'reload' },
      { label: '开发者工具', role: 'toggleDevTools' },
      { type: 'separator' },
    )
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Mira',
      submenu: [
        { label: '关于 Mira', click: (_item, window) => navigateToAbout(window) },
        { type: 'separator' },
        { label: '隐藏 Mira', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出 Mira', role: 'quit' },
      ],
    },
    { label: '编辑', submenu: [
      { label: '撤销', role: 'undo' },
      { label: '重做', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', role: 'cut' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' },
    ] },
    { label: '视图', submenu: viewMenu },
    { label: '窗口', submenu: [
      { label: '最小化', role: 'minimize' },
      { label: '缩放', role: 'zoom' },
      { label: '关闭窗口', role: 'close' },
    ] },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680,
    show: false,
    backgroundColor: '#f7f7f8',
    titleBarStyle: isMac ? 'hiddenInset' : (isWindows ? 'hidden' : 'default'),
    ...(isWindows ? {
      titleBarOverlay: { color: '#fafafa', symbolColor: '#18181b', height: 48 },
    } : {}),
    webPreferences: { preload: join(__dirname, '../preload/preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  window.on('close', event => {
    if (isQuitting || getCloseWindowBehavior() === 'quit') return
    event.preventDefault()
    window.hide()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.once('ready-to-show', () => window.show())
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  prepareMiraDataMigration(miraPaths, legacyUserDataPath)
  database = new PlatformDatabase(miraPaths)
  database.harness.migrateLegacyStorage()
  completeMiraDataMigration(miraPaths, legacyUserDataPath)
  if (legacyUserDataPath !== miraPaths.root) removeLegacyUserDataFiles(legacyUserDataPath)
  cleanupExpiredTrash()
  setInterval(cleanupExpiredTrash, TRASH_CLEANUP_INTERVAL_MS)
  mcpConfigStore = new McpConfigStore(miraPaths)
  database.harness.recoverInterruptedSubtasks()
  mcpManager = new McpManager()
  harnessRuntime = new HarnessRuntime(database, mcpManager, publishHarnessEvent)
  automationScheduler = new AutomationScheduler(database, harnessRuntime)
  await mcpManager.refresh(mcpConfigStore.list())
  automationScheduler.start()
  pythonEnvironment = new PythonEnvironment()
  localMicroAppServer = new LocalMicroAppServer({
    apiHandlers: new Map([['novel', createNovelApiHandler(database)]]),
  })
  const preferences = database.getSnapshot().preferences
  const preferredPort = typeof preferences.localMicroAppPort === 'number' ? preferences.localMicroAppPort : undefined
  await localMicroAppServer.start(database.getSnapshot().microApps, preferredPort)
  if (localMicroAppServer.port && preferences.localMicroAppPort !== localMicroAppServer.port) {
    database.savePreference('localMicroAppPort', localMicroAppServer.port)
  }
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
    const options = {
      properties: ['openDirectory'],
      title: '选择微应用构建目录',
    } as const
    const owner = BrowserWindow.fromWebContents(windowEvent.sender) || BrowserWindow.getFocusedWindow()
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return null
    return localMicroAppServer.validateDirectory(result.filePaths[0])
  })
  ipcMain.handle('platform:resolve-local-microapp-url', (_event, appId: string) => localMicroAppServer.getEntryUrl(appId))
  ipcMain.handle('platform:get-novel-api-base-url', () => localMicroAppServer.getApiBaseUrl('novel'))
  ipcMain.handle('harness:list-model-providers', () => database.models.list())
  ipcMain.handle('harness:get-model-config-path', () => database.models.path())
  ipcMain.handle('harness:get-model-provider-api-key', (_event, id: string) => database.models.getSecret(id))
  ipcMain.handle('harness:open-model-config-file', () => shell.openPath(database.models.path()))
  ipcMain.handle('harness:list-model-provider-models', async (_event, provider: ModelProviderInput) => {
    const endpoint = provider.endpoint.trim().replace(/\/+$/, '')
    if (!endpoint) return { models: [], error: '未填写 Endpoint' }
    const url = /\/models$/i.test(endpoint) ? endpoint : `${endpoint}/models`
    const apiKey = provider.apiKey?.trim() || database.models.getSecret(provider.id || '')
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(url, { headers, signal: controller.signal })
      if (!response.ok) return { models: [], error: `请求失败（HTTP ${response.status}）${!apiKey ? '，请确认已填写 API Key' : ''}` }
      const payload = await response.json() as { data?: Array<Record<string, unknown>>, models?: Array<Record<string, unknown>> }
      const ids = (payload.data || payload.models || []).map(item => {
        const value = item.id ?? item.model ?? item.name
        return typeof value === 'string' ? value.trim() : ''
      })
      const models = [...new Set(ids.filter(Boolean))]
      if (!models.length) return { models: [], error: '接口已响应，但未返回模型列表' }
      return { models }
    } catch (error) {
      return { models: [], error: error instanceof Error && error.name === 'AbortError' ? '查询超时（8 秒）' : `查询失败：${error instanceof Error ? error.message : String(error)}` }
    } finally {
      clearTimeout(timeout)
    }
  })
  ipcMain.handle('harness:save-model-provider', (_event, provider: ModelProviderInput) => database.models.save(provider))
  ipcMain.handle('harness:delete-model-provider', (_event, id: string) => database.models.delete(id))
  ipcMain.handle('harness:get-model-role-bindings', () => database.models.bindings())
  ipcMain.handle('harness:save-model-role-bindings', (_event, bindings) => database.models.saveBindings(bindings))
  ipcMain.handle('harness:list-skills', () => database.skills.list())
  ipcMain.handle('harness:get-skill-settings', () => database.skills.settings())
  ipcMain.handle('harness:save-skill-settings', (_event, settings: HarnessSkillSettings) => database.skills.saveSettings(settings))
  ipcMain.handle('harness:set-skill-enabled', (_event, id: string, enabled: boolean) => database.skills.setEnabled(id, Boolean(enabled)))
  ipcMain.handle('harness:test-model-provider', async (_event, provider: ModelProviderInput, modelId: string) => {
    try {
      const endpoint = provider.endpoint.trim().replace(/\/+$/, '')
      const url = /\/chat\/completions$/i.test(endpoint) ? endpoint : `${endpoint}/chat/completions`
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey || database.models.getSecret(provider.id || '')}` }, body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: '请用一个词回复“已连接”。' }], stream: false }) })
      if (!response.ok) return { ok: false, text: `请求失败：${response.status} ${(await response.text()).slice(0, 240)}` }
      return { ok: true, text: '连接成功' }
    } catch (error) { return { ok: false, text: error instanceof Error ? error.message : String(error) } }
  })
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
  ipcMain.handle('harness:delete-memory', (_event, scope: MemoryScope, id: string, projectId?: string) => harnessRuntime.deleteMemory(scope, id, projectId))
  ipcMain.handle('harness:list-pending-memory', () => harnessRuntime.listPendingMemory())
  ipcMain.handle('harness:discard-pending-memory', (_event, candidateId: string) => harnessRuntime.discardPendingMemory(candidateId))
  ipcMain.handle('harness:retry-memory', (_event, candidateId: string) => harnessRuntime.retryMemory(candidateId))
  ipcMain.handle('harness:respond-memory-confirmation', (_event, requestId: string, approved: boolean) => harnessRuntime.respondMemoryConfirmation(requestId, approved))
  ipcMain.handle('harness:list-git-branches', (_event, projectId: string) => database.harness.listGitBranches(projectId))
  ipcMain.handle('harness:checkout-git-branch', (_event, projectId: string, branchName: string) => database.harness.checkoutGitBranch(projectId, branchName))
  ipcMain.handle('harness:create-and-checkout-git-branch', (_event, projectId: string, branchName: string) => database.harness.createAndCheckoutGitBranch(projectId, branchName))
  ipcMain.handle('harness:list-sessions', (_event, query?: string) => database.harness.listSessions(query))
  ipcMain.handle('harness:query-history', (_event, query) => database.queryHarnessHistory(query))
  ipcMain.handle('harness:query-usage', () => database.queryHarnessUsage())
  ipcMain.handle('automation:list-tasks', () => database.automations.listTasks().map(task => {
    const nextRunAt = automationScheduler.taskNextRun(task)
    return { ...task, ...(nextRunAt ? { nextRunAt } : {}) }
  }))
  ipcMain.handle('automation:overview', () => database.automations.overview())
  ipcMain.handle('automation:next-runs', (_event, expression: string) => automationScheduler.nextRuns(expression))
  ipcMain.handle('automation:save-task', (_event, input: AutomationTaskInput) => {
    const project = database.harness.getProject(input.projectId)
    if (!project.directoryExists) throw new Error('项目目录不存在')
    const provider = database.models.get(input.model?.providerId)
    if (!provider?.enabled || !provider.models.includes(input.model.modelId) || !database.models.getSecret(provider.id)) throw new Error('所选模型不可用')
    const permission = database.harness.getPermissionConfig()
    if (input.permissionMode === 'auto-approve' && !permission.autoApproveEnabled) throw new Error('自动审核权限未启用')
    if (input.permissionMode === 'full' && !permission.fullAccessEnabled) throw new Error('完全访问权限未启用')
    if (input.trigger.type === 'cron') automationScheduler.nextRuns(input.trigger.expression)
    if (input.trigger.type === 'once' && input.trigger.scheduledAt <= Date.now()) throw new Error('一次性任务的执行时间必须晚于当前时间')
    if (input.target.type === 'existing-session') {
      const session = database.harness.getSession(input.target.sessionId)
      if (session.projectId !== input.projectId || session.archivedAt) throw new Error('现有聊天必须属于所选项目且未归档')
    }
    const task = database.automations.saveTask(input)
    automationScheduler.reschedule()
    return task
  })
  ipcMain.handle('automation:set-enabled', (_event, id: string, enabled: boolean) => {
    const task = database.automations.setEnabled(id, enabled)
    automationScheduler.reschedule()
    return task
  })
  ipcMain.handle('automation:delete-task', (_event, id: string) => { database.automations.deleteTask(id); automationScheduler.reschedule() })
  ipcMain.handle('automation:list-runs', (_event, taskId: string, status?) => database.automations.listRuns(taskId, status ? { status } : {}).map(automationRunWithSessionState))
  ipcMain.handle('automation:run-now', (_event, taskId: string) => automationScheduler.launch(taskId, 'manual').then(automationRunWithSessionState))
  ipcMain.handle('automation:retry-run', (_event, runId: string) => {
    const run = database.automations.getRun(runId)
    if (run.status !== 'failed') throw new Error('只能重试失败的运行记录')
    return automationScheduler.launch(run.taskId, 'manual-retry', run.id).then(automationRunWithSessionState)
  })
  ipcMain.handle('automation:abort', (_event, taskId: string) => automationScheduler.abort(taskId))
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
    if (requested.some(id => !enabledIds.has(id))) throw new Error('只能选择已启用的 MCP 服务')
    return database.harness.setActiveMcpServers(id, requested)
  })
  ipcMain.handle('harness:set-delegation-enabled', (_event, id: string, enabled: boolean) => database.harness.setDelegationEnabled(id, Boolean(enabled)))
  ipcMain.handle('harness:save-project-memory', (event, id: string, selection) => harnessRuntime.saveProjectMemory(event.sender, id, selection))
  ipcMain.handle('harness:set-pinned', (_event, id: string, pinned: boolean) => database.harness.setPinned(id, pinned))
  ipcMain.handle('harness:rename-session', (_event, id: string, title: string) => database.harness.renameSession(id, title))
  ipcMain.handle('harness:archive-sessions', (_event, ids: string[]) => database.harness.archiveSessions(ids))
  ipcMain.handle('harness:restore-sessions', (_event, ids: string[]) => database.harness.restoreSessions(ids))
  ipcMain.handle('harness:delete-session', (_event, id: string) => database.harness.deleteSession(id))
  ipcMain.handle('harness:delete-sessions', (_event, ids: string[]) => database.harness.deleteSessions(ids))
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
  ipcMain.handle('mcp:list-servers', () => mcpConfigStore.list())
  ipcMain.handle('mcp:save-server', (_event, config) => {
    const saved = mcpConfigStore.save(config)
    void mcpManager.refresh(mcpConfigStore.list())
    return saved
  })
  ipcMain.handle('mcp:delete-server', (_event, id: string) => {
    mcpConfigStore.delete(id)
    void mcpManager.refresh(mcpConfigStore.list())
  })
  ipcMain.handle('harness:get-permission-config', () => database.harness.getPermissionConfig())
  ipcMain.handle('harness:save-permission-config', (_event, config) => {
    const saved = database.harness.savePermissionConfig(config)
    cleanupExpiredTrash()
    return saved
  })
  ipcMain.handle('harness:get-git-config', () => database.harness.getGitConfig())
  ipcMain.handle('harness:save-git-config', (_event, config) => database.harness.saveGitConfig(config))
  ipcMain.handle('harness:list-trash', (_event, projectId?: string) => database.harness.listTrash(projectId))
  ipcMain.handle('harness:restore-trash', (_event, projectId: string, token: string) => database.harness.restoreTrash(projectId, token))
  ipcMain.handle('harness:python-status', () => pythonEnvironment.status())
  ipcMain.handle('harness:python-exec', (_event, script: string, args: string[]) => pythonEnvironment.run(script, args))
  ipcMain.handle('harness:python-install-package', (_event, packageName: string) => pythonEnvironment.install(packageName))
  ipcMain.handle('platform:list-novel-projects', () => database.novels.listProjects())
  ipcMain.handle('platform:get-novel-project', (_event, id: string) => database.novels.getProject(id))
  ipcMain.handle('platform:create-novel-project', (_event, title?: string) => database.novels.createProject(title))
  ipcMain.handle('platform:save-novel-project', (_event, project: NovelProjectDocument) => database.novels.saveProject(project))
  ipcMain.handle('platform:delete-novel-project', (_event, id: string) => database.novels.deleteProject(id))
  ipcMain.handle('platform:export-novel-project', (_event, id: string) => database.novels.exportProject(id))
  ipcMain.handle('platform:import-novel-project', (_event, raw: string) => database.novels.importProject(raw))
  ipcMain.handle('platform:get-novel-workspace-settings', () => database.novels.getSettings())
  ipcMain.handle('platform:save-novel-workspace-settings', (_event, settings: NovelWorkspaceSettings) => database.novels.saveSettings(settings))
  ipcMain.handle('platform:export-snapshot', () => database.exportSnapshot())
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
  ipcMain.handle('window:set-titlebar-chrome', (event, chrome: { color: string; symbolColor: string; height?: number }) => {
    if (process.platform !== 'win32') return
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0]
    win?.setTitleBarOverlay({ color: chrome.color, symbolColor: chrome.symbolColor, height: chrome.height })
  })
  ipcMain.handle('window:command', (event, action: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0]
    if (!win) return
    switch (action) {
      case 'about': navigateToAbout(win); break
      case 'quit': app.quit(); break
      case 'undo': win.webContents.undo(); break
      case 'redo': win.webContents.redo(); break
      case 'cut': win.webContents.cut(); break
      case 'copy': win.webContents.copy(); break
      case 'paste': win.webContents.paste(); break
      case 'selectAll': win.webContents.selectAll(); break
      case 'reload': win.webContents.reload(); break
      case 'toggleDevTools': win.webContents.toggleDevTools(); break
      case 'toggleFullscreen': win.setFullScreen(!win.isFullScreen()); break
      case 'minimize': win.minimize(); break
      case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break
      case 'close': win.close(); break
    }
  })
  setupApplicationMenu()
  createWindow()
  setupWindowsTray()
  app.on('activate', showMainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || getCloseWindowBehavior() === 'quit') app.quit()
})
app.on('before-quit', () => {
  isQuitting = true
  tray?.destroy()
  tray = null
  automationScheduler?.stop()
  void localMicroAppServer?.stop()
})
