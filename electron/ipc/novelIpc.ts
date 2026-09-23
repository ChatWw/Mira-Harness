import { ipcMain } from 'electron'
import type { NovelProjectDocument, NovelWorkspaceSettings } from '../../src/config/novel'
import type { PlatformDatabase } from '../storage/database'

export interface NovelIpcDependencies {
  database: PlatformDatabase
}

export function registerNovelIpcHandlers({ database }: NovelIpcDependencies) {
  ipcMain.handle('platform:list-novel-projects', () => database.novels.listProjects())
  ipcMain.handle('platform:get-novel-project', (_event, id: string) => database.novels.getProject(id))
  ipcMain.handle('platform:create-novel-project', (_event, title?: string) => database.novels.createProject(title))
  ipcMain.handle('platform:save-novel-project', (_event, project: NovelProjectDocument) => database.novels.saveProject(project))
  ipcMain.handle('platform:delete-novel-project', (_event, id: string) => database.novels.deleteProject(id))
  ipcMain.handle('platform:export-novel-project', (_event, id: string) => database.novels.exportProject(id))
  ipcMain.handle('platform:import-novel-project', (_event, raw: string) => database.novels.importProject(raw))
  ipcMain.handle('platform:get-novel-workspace-settings', () => database.novels.getSettings())
  ipcMain.handle('platform:save-novel-workspace-settings', (_event, settings: NovelWorkspaceSettings) => database.novels.saveSettings(settings))
}
