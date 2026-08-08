import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('platform', {
  windowChrome: process.platform === 'darwin' ? 'macos-overlay' : (process.platform === 'win32' ? 'windows-overlay' : 'standard'),
  getSnapshot: () => ipcRenderer.invoke('platform:get-snapshot'),
  savePreference: (key: string, value: unknown) => ipcRenderer.invoke('platform:save-preference', key, value),
  updateMenus: (menus: unknown) => ipcRenderer.invoke('platform:update-menus', menus),
  updateMicroApps: (apps: unknown) => ipcRenderer.invoke('platform:update-microapps', apps),
  selectMicroAppDirectory: () => ipcRenderer.invoke('platform:select-microapp-directory'),
  resolveLocalMicroAppUrl: (appId: string) => ipcRenderer.invoke('platform:resolve-local-microapp-url', appId),
  exportSnapshot: () => ipcRenderer.invoke('platform:export-snapshot'),
  importSnapshot: (snapshot: string) => ipcRenderer.invoke('platform:import-snapshot', snapshot),
  restoreDefaults: () => ipcRenderer.invoke('platform:restore-defaults'),
  setTitleBarChrome: (chrome: { color: string; symbolColor: string; height?: number }) => ipcRenderer.invoke('window:set-titlebar-chrome', chrome),
  windowCommand: (action: string) => ipcRenderer.invoke('window:command', action),
})
