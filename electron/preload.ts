import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('platform', {
  windowChrome: process.platform === 'darwin' ? 'macos-overlay' : (process.platform === 'win32' ? 'windows-overlay' : 'standard'),
  getSnapshot: () => ipcRenderer.invoke('platform:get-snapshot'),
  savePreference: (key: string, value: unknown) => ipcRenderer.invoke('platform:save-preference', key, value),
  updateMenus: (menus: unknown) => ipcRenderer.invoke('platform:update-menus', menus),
  updateMicroApps: (apps: unknown) => ipcRenderer.invoke('platform:update-microapps', apps),
  selectMicroAppDirectory: () => ipcRenderer.invoke('platform:select-microapp-directory'),
  resolveLocalMicroAppUrl: (appId: string) => ipcRenderer.invoke('platform:resolve-local-microapp-url', appId),
  getNovelApiBaseUrl: () => ipcRenderer.invoke('platform:get-novel-api-base-url'),
  testNovelModelConnection: (role: 'authoring' | 'automation', prompt?: string) => ipcRenderer.invoke('platform:test-novel-model-connection', role, prompt),
  listNovelProjects: () => ipcRenderer.invoke('platform:list-novel-projects'),
  getNovelProject: (id: string) => ipcRenderer.invoke('platform:get-novel-project', id),
  createNovelProject: (title?: string) => ipcRenderer.invoke('platform:create-novel-project', title),
  saveNovelProject: (project: unknown) => ipcRenderer.invoke('platform:save-novel-project', project),
  deleteNovelProject: (id: string) => ipcRenderer.invoke('platform:delete-novel-project', id),
  exportNovelProject: (id: string) => ipcRenderer.invoke('platform:export-novel-project', id),
  importNovelProject: (raw: string) => ipcRenderer.invoke('platform:import-novel-project', raw),
  getNovelWorkspaceSettings: () => ipcRenderer.invoke('platform:get-novel-workspace-settings'),
  saveNovelWorkspaceSettings: (settings: unknown) => ipcRenderer.invoke('platform:save-novel-workspace-settings', settings),
  exportSnapshot: () => ipcRenderer.invoke('platform:export-snapshot'),
  importSnapshot: (snapshot: string) => ipcRenderer.invoke('platform:import-snapshot', snapshot),
  restoreDefaults: () => ipcRenderer.invoke('platform:restore-defaults'),
  setTitleBarChrome: (chrome: { color: string; symbolColor: string; height?: number }) => ipcRenderer.invoke('window:set-titlebar-chrome', chrome),
  windowCommand: (action: string) => ipcRenderer.invoke('window:command', action),
  onWindowNavigate: (listener: (path: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string) => listener(path)
    ipcRenderer.on('window:navigate', handler)
    return () => ipcRenderer.removeListener('window:navigate', handler)
  },
})
