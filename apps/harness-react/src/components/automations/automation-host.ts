import type { AutomationOverview, AutomationRun, AutomationRunStatus, AutomationTask, AutomationTaskInput, PermissionConfig } from '../../../../../src/config/harness'

export interface AutomationsHost {
  listAutomationTasks(): Promise<AutomationTask[]>
  getAutomationOverview(): Promise<AutomationOverview>
  getAutomationNextRuns(expression: string): Promise<number[]>
  saveAutomationTask(input: AutomationTaskInput): Promise<AutomationTask>
  setAutomationTaskEnabled(id: string, enabled: boolean): Promise<AutomationTask>
  deleteAutomationTask(id: string): Promise<void>
  listAutomationRuns(taskId: string, status?: AutomationRunStatus): Promise<AutomationRun[]>
  runAutomationNow(taskId: string): Promise<AutomationRun>
  retryAutomationRun(runId: string): Promise<AutomationRun>
  abortAutomationRun(taskId: string): Promise<void>
  getHarnessPermissionConfig(): Promise<PermissionConfig>
  getPreference(key: string): Promise<unknown>
  setPreference(key: string, value: unknown, reportFailure?: boolean): Promise<void>
  registerBeforeNavigation(callback: () => Promise<void> | void): () => void
}
