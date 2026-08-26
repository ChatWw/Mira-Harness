import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { AutomationOverview, AutomationRun, AutomationRunSnapshot, AutomationRunSource, AutomationRunStatus, AutomationTarget, AutomationTask, AutomationTaskInput, AutomationTrigger, ModelSelection, PermissionMode } from '../src/config/harness'

type TaskRow = {
  id: string
  name: string
  trigger_type: string
  cron_expression: string | null
  trigger_scheduled_at: number | null
  trigger_human_label: string | null
  project_id: string
  target_type: string
  target_session_id: string | null
  prompt: string
  provider_id: string
  model_id: string
  thinking_level: string | null
  permission_mode: string
  enabled: number
  template_id: string | null
  valid_from: number | null
  valid_until: number | null
  ended_at: number | null
  last_run_at: number | null
  created_at: number
  updated_at: number
}

type RunRow = {
  id: string
  task_id: string
  source: string
  status: string
  scheduled_at: number | null
  started_at: number | null
  completed_at: number | null
  session_id: string | null
  snapshot: string
  result_summary: string | null
  error: string | null
  retried_from: string | null
}

function trigger(row: TaskRow): AutomationTrigger {
  if (row.trigger_type === 'once') return { type: 'once', scheduledAt: row.trigger_scheduled_at || 0 }
  if (row.trigger_type === 'session-completed') return { type: 'session-completed' }
  return { type: 'cron', expression: row.cron_expression || '', ...(row.trigger_human_label ? { humanLabel: row.trigger_human_label } : {}) }
}

function target(row: TaskRow): AutomationTarget {
  return row.target_type === 'existing-session' && row.target_session_id ? { type: 'existing-session', sessionId: row.target_session_id } : { type: 'new-session' }
}

function model(row: TaskRow): ModelSelection {
  return { providerId: row.provider_id, modelId: row.model_id, ...(row.thinking_level ? { thinkingLevel: row.thinking_level as ModelSelection['thinkingLevel'] } : {}) }
}

function taskFromRow(row: TaskRow): AutomationTask {
  return {
    id: row.id, name: row.name, projectId: row.project_id, trigger: trigger(row), target: target(row), prompt: row.prompt,
    model: model(row), permissionMode: row.permission_mode as PermissionMode, enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at,
    ...(row.template_id ? { templateId: row.template_id } : {}), ...(row.valid_from ? { validFrom: row.valid_from } : {}),
    ...(row.valid_until ? { validUntil: row.valid_until } : {}), ...(row.ended_at ? { endedAt: row.ended_at } : {}),
    ...(row.last_run_at ? { lastRunAt: row.last_run_at } : {}),
  }
}

function runFromRow(row: RunRow): AutomationRun {
  return {
    id: row.id, taskId: row.task_id, source: row.source as AutomationRunSource, status: row.status as AutomationRunStatus,
    ...(row.scheduled_at ? { scheduledAt: row.scheduled_at } : {}), ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}), ...(row.session_id ? { sessionId: row.session_id } : {}),
    snapshot: JSON.parse(row.snapshot) as AutomationRunSnapshot, ...(row.result_summary ? { resultSummary: row.result_summary } : {}),
    ...(row.error ? { error: row.error } : {}), ...(row.retried_from ? { retriedFrom: row.retried_from } : {}),
  }
}

export class AutomationStore {
  constructor(private readonly database: Database.Database) {}

  listTasks() { return (this.database.prepare('SELECT * FROM automation_tasks ORDER BY updated_at DESC').all() as TaskRow[]).map(taskFromRow) }

  getTask(id: string) {
    const row = this.database.prepare('SELECT * FROM automation_tasks WHERE id = ?').get(id) as TaskRow | undefined
    if (!row) throw new Error('未找到自动化任务')
    return taskFromRow(row)
  }

  saveTask(input: AutomationTaskInput) {
    const name = input.name.trim()
    const prompt = input.prompt.trim()
    if (!name) throw new Error('请填写任务名称')
    if (!input.projectId) throw new Error('请选择项目')
    if (!prompt) throw new Error('请填写任务 Prompt')
    if (!input.model?.providerId || !input.model.modelId) throw new Error('请选择模型')
    if (!['default', 'auto-approve', 'full'].includes(input.permissionMode)) throw new Error('任务权限无效')
    if (input.trigger.type === 'cron' && !input.trigger.expression.trim()) throw new Error('请填写 Cron 表达式')
    if (input.trigger.type === 'once' && input.trigger.scheduledAt <= Date.now()) throw new Error('一次性任务的执行时间必须晚于当前时间')
    if (input.validUntil && input.validFrom && input.validUntil <= input.validFrom) throw new Error('失效时间必须晚于生效时间')
    if (input.target.type === 'existing-session' && !input.target.sessionId) throw new Error('请选择现有聊天')
    const existing = input.id ? this.getTask(input.id) : undefined
    if (existing?.endedAt) throw new Error('已结束任务不可编辑')
    const now = Date.now()
    const id = existing?.id || randomUUID()
    const enabled = input.enabled ?? existing?.enabled ?? true
    this.database.prepare(`INSERT INTO automation_tasks(
      id, name, trigger_type, cron_expression, trigger_scheduled_at, trigger_human_label, project_id, target_type, target_session_id,
      prompt, provider_id, model_id, thinking_level, permission_mode, enabled, template_id, valid_from, valid_until, ended_at, last_run_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, trigger_type = excluded.trigger_type, cron_expression = excluded.cron_expression, trigger_scheduled_at = excluded.trigger_scheduled_at,
      trigger_human_label = excluded.trigger_human_label, project_id = excluded.project_id, target_type = excluded.target_type,
      target_session_id = excluded.target_session_id, prompt = excluded.prompt, provider_id = excluded.provider_id, model_id = excluded.model_id,
      thinking_level = excluded.thinking_level, permission_mode = excluded.permission_mode, enabled = excluded.enabled, template_id = excluded.template_id,
      valid_from = excluded.valid_from, valid_until = excluded.valid_until, updated_at = excluded.updated_at`)
      .run(
        id, name, input.trigger.type, input.trigger.type === 'cron' ? input.trigger.expression.trim() : null,
        input.trigger.type === 'once' ? input.trigger.scheduledAt : null, input.trigger.type === 'cron' ? input.trigger.humanLabel || null : null,
        input.projectId, input.target.type, input.target.type === 'existing-session' ? input.target.sessionId : null, prompt,
        input.model.providerId, input.model.modelId, input.model.thinkingLevel || null, input.permissionMode, Number(enabled), input.templateId || null,
        input.validFrom || null, input.validUntil || null, null, existing?.lastRunAt || null, existing?.createdAt || now, now,
      )
    return this.getTask(id)
  }

  setEnabled(id: string, enabled: boolean) {
    const task = this.getTask(id)
    if (task.endedAt && enabled) throw new Error('已结束任务不可重新启用')
    this.database.prepare('UPDATE automation_tasks SET enabled = ?, updated_at = ? WHERE id = ?').run(Number(enabled), Date.now(), id)
    return this.getTask(id)
  }

  markEnded(id: string, endedAt = Date.now()) {
    this.database.prepare('UPDATE automation_tasks SET enabled = 0, ended_at = ?, updated_at = ? WHERE id = ? AND ended_at IS NULL').run(endedAt, endedAt, id)
    return this.getTask(id)
  }

  endExpiredTasks(now = Date.now()) {
    return this.database.prepare('UPDATE automation_tasks SET enabled = 0, ended_at = ?, updated_at = ? WHERE ended_at IS NULL AND valid_until IS NOT NULL AND valid_until <= ?')
      .run(now, now, now).changes
  }

  deleteTask(id: string) {
    const running = this.database.prepare("SELECT 1 FROM automation_runs WHERE task_id = ? AND status = 'running'").get(id)
    if (running) throw new Error('任务正在运行，停止后才能删除')
    const remove = this.database.transaction(() => {
      this.database.prepare('DELETE FROM automation_runs WHERE task_id = ?').run(id)
      this.database.prepare('DELETE FROM automation_tasks WHERE id = ?').run(id)
    })
    remove()
  }

  listRuns(taskId: string, options: { status?: AutomationRunStatus, limit?: number } = {}) {
    const limit = Math.min(100, Math.max(1, options.limit || 100))
    const rows = options.status
      ? this.database.prepare('SELECT * FROM automation_runs WHERE task_id = ? AND status = ? ORDER BY COALESCE(started_at, scheduled_at, completed_at) DESC LIMIT ?').all(taskId, options.status, limit)
      : this.database.prepare('SELECT * FROM automation_runs WHERE task_id = ? ORDER BY COALESCE(started_at, scheduled_at, completed_at) DESC LIMIT ?').all(taskId, limit)
    return (rows as RunRow[]).map(runFromRow)
  }

  createRun(task: AutomationTask, source: AutomationRunSource, options: { scheduledAt?: number, sessionId?: string, retriedFrom?: string } = {}) {
    const id = randomUUID()
    const snapshot: AutomationRunSnapshot = { prompt: task.prompt, model: task.model, permissionMode: task.permissionMode }
    this.database.prepare('INSERT INTO automation_runs(id, task_id, source, status, scheduled_at, session_id, snapshot, retried_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, task.id, source, 'running', options.scheduledAt || null, options.sessionId || null, JSON.stringify(snapshot), options.retriedFrom || null)
    this.database.prepare('UPDATE automation_tasks SET last_run_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), task.id)
    return this.getRun(id)
  }

  createSkippedRun(task: AutomationTask, source: AutomationRunSource, reason: string, scheduledAt?: number) {
    const id = randomUUID()
    const time = Date.now()
    const snapshot: AutomationRunSnapshot = { prompt: task.prompt, model: task.model, permissionMode: task.permissionMode }
    this.database.prepare('INSERT INTO automation_runs(id, task_id, source, status, scheduled_at, completed_at, snapshot, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, task.id, source, 'skipped', scheduledAt || null, time, JSON.stringify(snapshot), reason)
    this.database.prepare('UPDATE automation_tasks SET last_run_at = ?, updated_at = ? WHERE id = ?').run(time, time, task.id)
    return this.getRun(id)
  }

  getRun(id: string) {
    const row = this.database.prepare('SELECT * FROM automation_runs WHERE id = ?').get(id) as RunRow | undefined
    if (!row) throw new Error('未找到自动化运行记录')
    return runFromRow(row)
  }

  startRun(id: string, sessionId: string) {
    this.database.prepare('UPDATE automation_runs SET started_at = ?, session_id = ? WHERE id = ?').run(Date.now(), sessionId, id)
    return this.getRun(id)
  }

  finishRun(id: string, status: Exclude<AutomationRunStatus, 'running'>, options: { resultSummary?: string, error?: string } = {}) {
    this.database.prepare('UPDATE automation_runs SET status = ?, completed_at = ?, result_summary = ?, error = ? WHERE id = ?')
      .run(status, Date.now(), options.resultSummary?.slice(0, 500) || null, options.error || null, id)
    return this.getRun(id)
  }

  markInterruptedRuns() {
    return this.database.prepare("UPDATE automation_runs SET status = 'interrupted', completed_at = ? WHERE status = 'running'").run(Date.now()).changes
  }

  overview(): AutomationOverview {
    const enabledCount = (this.database.prepare('SELECT COUNT(*) AS count FROM automation_tasks WHERE enabled = 1 AND ended_at IS NULL').get() as { count: number }).count
    const runningCount = (this.database.prepare("SELECT COUNT(*) AS count FROM automation_runs WHERE status = 'running'").get() as { count: number }).count
    const failedLastDayCount = (this.database.prepare("SELECT COUNT(*) AS count FROM automation_runs WHERE status = 'failed' AND completed_at >= ?").get(Date.now() - 24 * 60 * 60 * 1000) as { count: number }).count
    return { enabledCount, runningCount, failedLastDayCount }
  }
}
