import { ipcRenderer } from 'electron'

export const modelApi = {
  listModelProviders: () => ipcRenderer.invoke('harness:list-model-providers'),
  getModelConfigPath: () => ipcRenderer.invoke('harness:get-model-config-path'),
  getModelProviderApiKey: (id: string) => ipcRenderer.invoke('harness:get-model-provider-api-key', id),
  openModelConfigFile: () => ipcRenderer.invoke('harness:open-model-config-file'),
  listModelProviderModels: (provider: unknown) => ipcRenderer.invoke('harness:list-model-provider-models', provider),
  saveModelProvider: (provider: unknown) => ipcRenderer.invoke('harness:save-model-provider', provider),
  deleteModelProvider: (id: string) => ipcRenderer.invoke('harness:delete-model-provider', id),
  getModelRoleBindings: () => ipcRenderer.invoke('harness:get-model-role-bindings'),
  saveModelRoleBindings: (bindings: unknown) => ipcRenderer.invoke('harness:save-model-role-bindings', bindings),
  testModelProvider: (provider: unknown, modelId: string) => ipcRenderer.invoke('harness:test-model-provider', provider, modelId),
}
