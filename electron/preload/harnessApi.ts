import { ipcRenderer } from 'electron'

export const harnessApi = {
  listHarnessSkills: () => ipcRenderer.invoke('harness:list-skills'),
  getHarnessSkillSettings: () => ipcRenderer.invoke('harness:get-skill-settings'),
  saveHarnessSkillSettings: (settings: unknown) => ipcRenderer.invoke('harness:save-skill-settings', settings),
  setHarnessSkillEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('harness:set-skill-enabled', id, enabled),
  getHarnessPluginSkill: (id: string, name: string) => ipcRenderer.invoke('harness:get-plugin-skill', id, name),
  revealHarnessSkill: (id: string, name?: string) => ipcRenderer.invoke('harness:reveal-skill', id, name),
  deleteHarnessSkill: (id: string) => ipcRenderer.invoke('harness:delete-skill', id),
  importHarnessSkill: () => ipcRenderer.invoke('harness:import-skill'),
  listHarnessProjects: () => ipcRenderer.invoke('harness:list-projects'),
  getGlobalInstructions: () => ipcRenderer.invoke('harness:get-global-instructions'),
  saveGlobalInstructions: (content: string) => ipcRenderer.invoke('harness:save-global-instructions', content),
  getGlobalInstructionsPath: () => ipcRenderer.invoke('harness:get-global-instructions-path'),
  revealHarnessSettingsFile: (kind: 'instructions' | 'memory') => ipcRenderer.invoke('harness:reveal-settings-file', kind),
  getHarnessMemoryEnabled: () => ipcRenderer.invoke('harness:get-memory-enabled'),
  setHarnessMemoryEnabled: (enabled: boolean) => ipcRenderer.invoke('harness:set-memory-enabled', enabled),
  getHarnessMemoryPath: () => ipcRenderer.invoke('harness:get-memory-path'),
  resetHarnessMemory: () => ipcRenderer.invoke('harness:reset-memory'),
  listHarnessSessions: (query?: string) => ipcRenderer.invoke('harness:list-sessions', query),
  queryHarnessHistory: (query: unknown) => ipcRenderer.invoke('harness:query-history', query),
  queryHarnessUsage: () => ipcRenderer.invoke('harness:query-usage'),
  getHarnessSession: (id: string) => ipcRenderer.invoke('harness:get-session', id),
  readHarnessWorkspaceSearchIgnore: (target: unknown) => ipcRenderer.invoke('harness:read-search-ignore', target),
  transformHarnessWorkspaceSearchIgnore: (target: unknown, content: string, transform: unknown) => ipcRenderer.invoke('harness:transform-search-ignore', target, content, transform),
  writeHarnessWorkspaceSearchIgnore: (target: unknown, content: string, revision: string) => ipcRenderer.invoke('harness:write-search-ignore', target, content, revision),
  restoreHarnessSessions: (ids: string[]) => ipcRenderer.invoke('harness:restore-sessions', ids),
  deleteHarnessSession: (id: string) => ipcRenderer.invoke('harness:delete-session', id),
  getHarnessPermissionConfig: () => ipcRenderer.invoke('harness:get-permission-config'),
  saveHarnessPermissionConfig: (config: unknown) => ipcRenderer.invoke('harness:save-permission-config', config),
  listHarnessTrash: (projectId?: string) => ipcRenderer.invoke('harness:list-trash', projectId),
  restoreHarnessTrash: (projectId: string, token: string) => ipcRenderer.invoke('harness:restore-trash', projectId, token),
  onHarnessEvent: (listener: (event: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, event: unknown) => listener(event)
    ipcRenderer.on('harness:event', handler)
    return () => ipcRenderer.removeListener('harness:event', handler)
  },
}
