import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('platform', {
  getSnapshot: () => ipcRenderer.invoke('platform:get-snapshot'),
  savePreference: (key: string, value: unknown) => ipcRenderer.invoke('platform:save-preference', key, value),
  updateMenus: (menus: unknown) => ipcRenderer.invoke('platform:update-menus', menus),
  updateMicroApps: (apps: unknown) => ipcRenderer.invoke('platform:update-microapps', apps),
  exportSnapshot: () => ipcRenderer.invoke('platform:export-snapshot'),
  importSnapshot: (snapshot: string) => ipcRenderer.invoke('platform:import-snapshot', snapshot),
  restoreDefaults: () => ipcRenderer.invoke('platform:restore-defaults'),
})
