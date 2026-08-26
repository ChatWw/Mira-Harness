import type { AutomationRunSource, AutomationTask } from '../src/config/harness'
import type { PlatformDatabase } from './database'
import type { HarnessRuntime } from './harnessRuntime'
import { nextCronOccurrences, validateCronExpression } from './cronSchedule'

export class AutomationScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private stopped = false

  constructor(private readonly database: PlatformDatabase, private readonly runtime: HarnessRuntime) {
    this.runtime.onRunComplete(event => {
      if (event.origin !== 'manual' || event.status !== 'completed' || !event.session.projectId) return
      void this.runSessionCompleted(event.session.projectId, event.session.id)
    })
  }

  start() {
    this.stopped = false
    this.database.automations.markInterruptedRuns()
    this.reschedule()
  }

  stop() {
    this.stopped = true
    this.timers.forEach(timer => clearTimeout(timer))
    this.timers.clear()
  }

  reschedule() {
    this.timers.forEach(timer => clearTimeout(timer))
    this.timers.clear()
    if (this.stopped) return
    this.database.automations.endExpiredTasks()
    this.database.automations.listTasks().forEach(task => this.scheduleTask(task))
  }

  nextRuns(expression: string) { return validateCronExpression(expression) }

  taskNextRun(task: AutomationTask, now = Date.now()) {
    if (!task.enabled || task.endedAt || task.trigger.type === 'session-completed') return undefined
    if (task.validUntil && task.validUntil <= now) {
      this.database.automations.markEnded(task.id, task.validUntil)
      return undefined
    }
    if (task.trigger.type === 'once') {
      if (task.trigger.scheduledAt <= now) {
        this.database.automations.markEnded(task.id, task.trigger.scheduledAt)
        return undefined
      }
      if (task.validUntil && task.trigger.scheduledAt > task.validUntil) return undefined
      return task.trigger.scheduledAt
    }
    const next = nextCronOccurrences(task.trigger.expression, 1, Math.max(now, task.validFrom || 0))[0]
    if (task.validUntil && next > task.validUntil) {
      this.database.automations.markEnded(task.id, task.validUntil)
      return undefined
    }
    return next
  }

  private scheduleTask(task: AutomationTask) {
    const next = this.taskNextRun(task)
    if (this.stopped || !next) return
    const timer = setTimeout(() => {
      this.timers.delete(task.id)
      void this.run(task.id, 'scheduled', next).finally(() => {
        const current = this.database.automations.getTask(task.id)
        if (current.trigger.type === 'once') this.database.automations.markEnded(current.id)
        if (!this.stopped) this.scheduleTask(this.database.automations.getTask(task.id))
      })
    }, Math.max(0, next - Date.now()))
    this.timers.set(task.id, timer)
  }

  private async runSessionCompleted(projectId: string, sessionId: string) {
    const tasks = this.database.automations.listTasks().filter(task => task.enabled && !task.endedAt && task.projectId === projectId && task.trigger.type === 'session-completed')
    for (const task of tasks) await this.run(task.id, 'event', undefined, sessionId)
  }

  async launch(taskId: string, source: AutomationRunSource, retriedFrom?: string) {
    this.database.automations.getTask(taskId)
    const previousRunId = this.database.automations.listRuns(taskId, { limit: 1 })[0]?.id
    const execution = this.run(taskId, source, undefined, undefined, retriedFrom)
    const run = this.database.automations.listRuns(taskId, { limit: 1 })[0]
    if (!run || run.id === previousRunId) return execution
    void execution.catch(error => console.warn('[Mira] 自动化任务运行失败', error))
    return run
  }

  async run(taskId: string, source: AutomationRunSource, scheduledAt?: number, eventSessionId?: string, retriedFrom?: string) {
    const task = this.database.automations.getTask(taskId)
    if (!task.enabled && source !== 'manual' && source !== 'manual-retry') return this.database.automations.createSkippedRun(task, source, '任务已停用', scheduledAt)
    if (task.endedAt) return this.database.automations.createSkippedRun(task, source, '任务已结束', scheduledAt)
    if (task.validFrom && task.validFrom > Date.now() && source === 'scheduled') return this.database.automations.createSkippedRun(task, source, '任务尚未生效', scheduledAt)
    if (task.validUntil && task.validUntil <= Date.now() && source === 'scheduled') {
      this.database.automations.markEnded(task.id, task.validUntil)
      return this.database.automations.createSkippedRun(task, source, '任务已到期', scheduledAt)
    }
    if (this.runtime.isProjectRunning(task.projectId)) return this.database.automations.createSkippedRun(task, source, '项目已有 Agent 正在运行', scheduledAt)
    const sessionId = task.trigger.type === 'session-completed' && eventSessionId
      ? eventSessionId
      : task.target.type === 'existing-session' ? task.target.sessionId : this.database.harness.createSession(task.projectId, task.permissionMode).id
    if (!sessionId) return this.database.automations.createSkippedRun(task, source, '未找到目标会话', scheduledAt)
    try {
      const session = this.database.harness.getSession(sessionId)
      if (session.projectId !== task.projectId || session.archivedAt) return this.database.automations.createSkippedRun(task, source, '目标会话不可用', scheduledAt)
    } catch { return this.database.automations.createSkippedRun(task, source, '目标会话不可用', scheduledAt) }
    const run = this.database.automations.createRun(task, source, { scheduledAt, sessionId, retriedFrom })
    try {
      this.database.automations.startRun(run.id, sessionId)
      const result = await this.runtime.runAutomation(sessionId, task.prompt, task.model, task.permissionMode)
      return this.database.automations.finishRun(run.id, result?.interrupted ? 'interrupted' : 'completed', { resultSummary: result?.content })
    } catch (error) {
      return this.database.automations.finishRun(run.id, 'failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  abort(taskId: string) {
    const running = this.database.automations.listRuns(taskId, { limit: 1 }).find(run => run.status === 'running')
    if (!running?.sessionId) return
    this.runtime.abort(running.sessionId)
  }
}
