import { ipcMain } from 'electron'
import { isModelProviderAvailable, providerModel, type AutomationRun, type AutomationTaskInput } from '../../src/config/harness'
import type { PlatformDatabase } from '../storage/database'
import type { AutomationScheduler } from '../services/automationScheduler'

export interface AutomationIpcDependencies {
  database: PlatformDatabase
  automationScheduler: AutomationScheduler
  cleanupExpiredTrash: () => void
}

function automationRunWithSessionState(database: PlatformDatabase, run: AutomationRun) {
  if (!run.sessionId) return run
  try {
    database.harness.getSession(run.sessionId)
    return { ...run, sessionAvailable: true }
  } catch {
    return { ...run, sessionAvailable: false }
  }
}

export function registerAutomationIpcHandlers({ database, automationScheduler, cleanupExpiredTrash }: AutomationIpcDependencies) {
  ipcMain.handle('automation:list-tasks', () => database.automations.listTasks().map(task => {
    const nextRunAt = automationScheduler.taskNextRun(task)
    return { ...task, ...(nextRunAt ? { nextRunAt } : {}) }
  }))
  ipcMain.handle('automation:overview', () => database.automations.overview())
  ipcMain.handle('automation:next-runs', (_event, expression: string) => automationScheduler.nextRuns(expression))
  ipcMain.handle('automation:save-task', (_event, input: AutomationTaskInput) => {
    const project = database.harness.getProject(input.projectId)
    if (!project.directoryExists) throw new Error('项目目录不存在')
    const provider = database.models.get(input.model?.providerId)
    const model = provider && providerModel(provider, input.model.modelId)
    if (!provider || !isModelProviderAvailable(provider) || !model?.enabled || (provider.authMode === 'api-key' && !database.models.getSecret(provider.id))) throw new Error('所选模型不可用')
    const permission = database.harness.getPermissionConfig()
    if (input.permissionMode === 'auto-approve' && !permission.autoApproveEnabled) throw new Error('自动审核权限未启用')
    if (input.permissionMode === 'full' && !permission.fullAccessEnabled) throw new Error('完全访问权限未启用')
    if (input.trigger.type === 'cron') automationScheduler.nextRuns(input.trigger.expression)
    if (input.trigger.type === 'once' && input.trigger.scheduledAt <= Date.now()) throw new Error('一次性任务的执行时间必须晚于当前时间')
    if (input.target.type === 'existing-session') {
      const session = database.harness.getSession(input.target.sessionId)
      if (session.projectId !== input.projectId || session.archivedAt) throw new Error('现有聊天必须属于所选项目且未归档')
    }
    const task = database.automations.saveTask(input)
    automationScheduler.reschedule()
    return task
  })
  ipcMain.handle('automation:set-enabled', (_event, id: string, enabled: boolean) => {
    const task = database.automations.setEnabled(id, enabled)
    automationScheduler.reschedule()
    return task
  })
  ipcMain.handle('automation:delete-task', (_event, id: string) => { database.automations.deleteTask(id); automationScheduler.reschedule() })
  ipcMain.handle('automation:list-runs', (_event, taskId: string, status?: string) => database.automations.listRuns(taskId, status ? { status } : {}).map(run => automationRunWithSessionState(database, run)))
  ipcMain.handle('automation:run-now', (_event, taskId: string) => automationScheduler.launch(taskId, 'manual').then(run => automationRunWithSessionState(database, run)))
  ipcMain.handle('automation:retry-run', (_event, runId: string) => {
    const run = database.automations.getRun(runId)
    if (run.status !== 'failed') throw new Error('只能重试失败的运行记录')
    return automationScheduler.launch(run.taskId, 'manual-retry', run.id).then(nextRun => automationRunWithSessionState(database, nextRun))
  })
  ipcMain.handle('automation:abort', (_event, taskId: string) => automationScheduler.abort(taskId))
  ipcMain.handle('harness:save-permission-config', (_event, config) => {
    const saved = database.harness.savePermissionConfig(config)
    cleanupExpiredTrash()
    return saved
  })
}
