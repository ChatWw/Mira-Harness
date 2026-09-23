import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import type { PlatformDatabase } from '../storage/database'
import type { LocalMicroAppServer } from '../adapters/localMicroAppServer'
import type { MicroApp } from '../../src/types'
import { firstPartyAppManifests, validateFirstPartyAppManifest, type FirstPartyAppManifest } from '../../src/config/firstPartyApps'
import type { ModelSelection } from '../../src/config/harness'

export interface PlatformIpcDependencies {
  database: PlatformDatabase
  localMicroAppServer: LocalMicroAppServer
  legacyNovelApiToken?: string
  firstPartyManifests?: readonly FirstPartyAppManifest[]
  fetchImpl?: typeof fetch
}

function boundedString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new Error(`${field} 无效`)
  return value
}

export function registerPlatformIpcHandlers({ database, localMicroAppServer, legacyNovelApiToken, firstPartyManifests = firstPartyAppManifests, fetchImpl = fetch }: PlatformIpcDependencies) {
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
  ipcMain.handle('platform:generate-first-party-text', async (_event, appId: string, role: 'authoring' | 'automation', prompt: string, selection: ModelSelection) => {
    const manifest = firstPartyManifests.find(item => item.enabled && item.appId === appId)
    if (!manifest) throw new Error('第一方应用未登记或已停用')
    validateFirstPartyAppManifest(manifest)
    if (!manifest.capabilities.includes('models:text.generate')) throw new Error('应用没有模型生成能力')
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
