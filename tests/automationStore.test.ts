import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { AutomationStore } from '../electron/automationStore'

function createStore() {
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE automation_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, trigger_type TEXT NOT NULL, cron_expression TEXT, trigger_scheduled_at INTEGER, trigger_human_label TEXT, project_id TEXT NOT NULL, target_type TEXT NOT NULL, target_session_id TEXT, prompt TEXT NOT NULL, provider_id TEXT NOT NULL, model_id TEXT NOT NULL, thinking_level TEXT, permission_mode TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, template_id TEXT, valid_from INTEGER, valid_until INTEGER, ended_at INTEGER, last_run_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE automation_runs (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL, scheduled_at INTEGER, started_at INTEGER, completed_at INTEGER, session_id TEXT, snapshot TEXT NOT NULL, result_summary TEXT, error TEXT, retried_from TEXT);
  `)
  return { database, store: new AutomationStore(database) }
}

describe('AutomationStore', () => {
  it('persists task configuration and immutable run snapshots', () => {
    const { database, store } = createStore()
    const task = store.saveTask({ name: '每日总结', projectId: 'project-1', trigger: { type: 'cron', expression: '0 9 * * 1-5' }, target: { type: 'new-session' }, prompt: '总结进展', model: { providerId: 'provider-1', modelId: 'model-1' }, permissionMode: 'default' })
    expect(store.listTasks()).toEqual([expect.objectContaining({ id: task.id, enabled: true, trigger: { type: 'cron', expression: '0 9 * * 1-5' } })])
    const run = store.createRun(task, 'manual', { sessionId: 'session-1' })
    store.startRun(run.id, 'session-1')
    const completed = store.finishRun(run.id, 'completed', { resultSummary: '已完成' })
    expect(completed).toMatchObject({ status: 'completed', sessionId: 'session-1', snapshot: { prompt: '总结进展', permissionMode: 'default' } })
    database.close()
  })

  it('marks unfinished runs interrupted and prevents deleting a running task', () => {
    const { database, store } = createStore()
    const task = store.saveTask({ name: '会话后处理', projectId: 'project-1', trigger: { type: 'session-completed' }, target: { type: 'new-session' }, prompt: '提炼待办', model: { providerId: 'provider-1', modelId: 'model-1' }, permissionMode: 'auto-approve' })
    const run = store.createRun(task, 'event')
    expect(() => store.deleteTask(task.id)).toThrow('正在运行')
    expect(store.markInterruptedRuns()).toBe(1)
    expect(store.getRun(run.id).status).toBe('interrupted')
    store.deleteTask(task.id)
    expect(store.listTasks()).toEqual([])
    expect(store.listRuns(task.id)).toEqual([])
    database.close()
  })

  it('persists once schedules, templates, and validity windows', () => {
    const { database, store } = createStore()
    const scheduledAt = Date.now() + 60_000
    const task = store.saveTask({ name: '一次性核对', projectId: 'project-1', trigger: { type: 'once', scheduledAt }, target: { type: 'new-session' }, prompt: '核对发布物料', model: { providerId: 'provider-1', modelId: 'model-1' }, permissionMode: 'default', templateId: 'release-check', validUntil: scheduledAt + 60_000 })
    expect(task).toMatchObject({ trigger: { type: 'once', scheduledAt }, templateId: 'release-check', validUntil: scheduledAt + 60_000 })
    store.markEnded(task.id)
    expect(store.getTask(task.id)).toMatchObject({ enabled: false, endedAt: expect.any(Number) })
    database.close()
  })
})
