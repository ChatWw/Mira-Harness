import { ipcRenderer } from 'electron'

export const novelApi = {
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
}
