import { ipcRenderer } from 'electron'

export const platformApi = {
  getSnapshot: () => ipcRenderer.invoke('platform:get-snapshot'),
  savePreference: (key: string, value: unknown) => ipcRenderer.invoke('platform:save-preference', key, value),
  updateMenus: (menus: unknown) => ipcRenderer.invoke('platform:update-menus', menus),
  updateMicroApps: (apps: unknown) => ipcRenderer.invoke('platform:update-microapps', apps),
  selectMicroAppDirectory: () => ipcRenderer.invoke('platform:select-microapp-directory'),
  resolveLocalMicroAppUrl: (appId: string) => ipcRenderer.invoke('platform:resolve-local-microapp-url', appId),
  createFirstPartyGrant: (appId: string) => ipcRenderer.invoke('platform:create-first-party-grant', appId),
  revokeFirstPartyGrant: (grantId: string) => ipcRenderer.invoke('platform:revoke-first-party-grant', grantId),
  generateFirstPartyText: (grantId: string, role: 'authoring' | 'automation', prompt: string, selection: unknown) => ipcRenderer.invoke('platform:generate-first-party-text', grantId, role, prompt, selection),
  exportSnapshot: () => ipcRenderer.invoke('platform:export-snapshot'),
  importSnapshot: (snapshot: string) => ipcRenderer.invoke('platform:import-snapshot', snapshot),
  restoreDefaults: () => ipcRenderer.invoke('platform:restore-defaults'),
}
