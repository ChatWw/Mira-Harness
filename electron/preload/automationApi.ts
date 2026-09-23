import { ipcRenderer } from 'electron'

export const automationApi = {
  listAutomationTasks: () => ipcRenderer.invoke('automation:list-tasks'),
  getAutomationOverview: () => ipcRenderer.invoke('automation:overview'),
  getAutomationNextRuns: (expression: string) => ipcRenderer.invoke('automation:next-runs', expression),
  saveAutomationTask: (task: unknown) => ipcRenderer.invoke('automation:save-task', task),
  setAutomationTaskEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('automation:set-enabled', id, enabled),
  deleteAutomationTask: (id: string) => ipcRenderer.invoke('automation:delete-task', id),
  listAutomationRuns: (taskId: string, status?: string) => ipcRenderer.invoke('automation:list-runs', taskId, status),
  runAutomationNow: (taskId: string) => ipcRenderer.invoke('automation:run-now', taskId),
  retryAutomationRun: (runId: string) => ipcRenderer.invoke('automation:retry-run', runId),
  abortAutomationRun: (taskId: string) => ipcRenderer.invoke('automation:abort', taskId),
}
