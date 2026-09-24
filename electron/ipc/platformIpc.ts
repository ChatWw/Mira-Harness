import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import type { PlatformDatabase } from '../storage/database'
import type { LocalMicroAppServer } from '../adapters/localMicroAppServer'
import type { MicroApp } from '../../src/types'
import { firstPartyAppManifests, validateFirstPartyAppManifest, type FirstPartyAppManifest } from '../../src/config/firstPartyApps'
import type { ModelSelection } from '../../src/config/harness'
import type { NovelProjectDocument } from '../../src/config/novel'
import { FirstPartyGrantStore } from '../security/firstPartyGrant'

export interface PlatformIpcDependencies {
  database: PlatformDatabase
  localMicroAppServer: LocalMicroAppServer
  legacyNovelApiToken?: string
  firstPartyManifests?: readonly FirstPartyAppManifest[]
  firstPartyGrantStore?: FirstPartyGrantStore
  fetchImpl?: typeof fetch
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

export function registerPlatformIpcHandlers({ database, localMicroAppServer, legacyNovelApiToken, firstPartyManifests = firstPartyAppManifests, firstPartyGrantStore = new FirstPartyGrantStore(), fetchImpl = fetch }: PlatformIpcDependencies) {
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
