import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { validateMiraGoalBudget, validateMiraGoalObjective, type HarnessGoal, type HarnessGoalSetInput, type HarnessGoalVerification, type HarnessGoalPlanItem } from '../../src/config/miraGoals'

const elapsedSeconds = (start: number, end: number) => Math.max(0, Math.ceil((end - start) / 1000))
const safeCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const textId = (value: unknown): value is string => typeof value === 'string' && Boolean(value) && value.length <= 256 && !value.includes('\0')
const validVerification = (value: HarnessGoalVerification): boolean => Boolean(value && textId(value.id) && safeCount(value.iteration) && safeCount(value.updatedAt) && ['running', 'passed', 'failed', 'error', 'stopped'].includes(value.status) && [value.reason, value.nextAction, value.anchorMessageId].every(item => item === undefined || typeof item === 'string' && item.length <= 4000 && !item.includes('\0')))
const validPlanItems = (items: HarnessGoalPlanItem[]): boolean => Array.isArray(items) && items.every(item => Boolean(item && textId(item.id) && typeof item.label === 'string' && item.label.trim() && !item.label.includes('\0') && ['pending', 'running', 'completed', 'failed', 'stopped'].includes(item.status) && (item.detail === undefined || typeof item.detail === 'string' && !item.detail.includes('\0')))) && new Set(items.map(item => item.id)).size === items.length

export class HarnessGoalStore {
  constructor(private readonly database: Database.Database) {}

  initialize(): void {
    this.database.exec('CREATE TABLE IF NOT EXISTS harness_goals (session_id TEXT PRIMARY KEY REFERENCES harness_sessions(id) ON DELETE CASCADE, payload TEXT NOT NULL)')
    this.database.transaction(() => {
      for (const { session_id: sessionId } of this.database.prepare('SELECT session_id FROM harness_goals').all() as Array<{ session_id: string }>) {
        const goal = this.require(sessionId)
        if (!goal.activeRun) continue
        goal.timeUsedSeconds += elapsedSeconds(goal.activeRun.startedAt, goal.activeRun.lastSeenAt)
        if (goal.status === 'active') { goal.status = 'paused'; goal.reason = '应用重启，目标已暂停' }
        if (goal.verification?.status === 'running') this.recordVerification(goal, { ...goal.verification, status: 'stopped', reason: '应用重启，核验已停止', updatedAt: Date.now() })
        for (const plan of goal.iterationPlans || []) for (const item of plan.items) if (item.status === 'running') item.status = 'stopped'
        delete goal.activeRun
        this.save(sessionId, goal)
      }
    })()
  }
  get(sessionId: string): HarnessGoal | undefined {
    const row = this.database.prepare('SELECT payload FROM harness_goals WHERE session_id = ?').get(sessionId) as { payload: string } | undefined
    if (!row) return undefined
    try {
      const goal = JSON.parse(row.payload) as HarnessGoal
      if (!goal || !textId(goal.id) || validateMiraGoalObjective(goal.objective) !== goal.objective || !['active', 'paused', 'budget_limited', 'complete'].includes(goal.status) || validateMiraGoalBudget(goal.tokenBudget) !== goal.tokenBudget || ![goal.tokensUsed, goal.timeUsedSeconds, goal.revision, goal.iteration, goal.createdAt, goal.updatedAt].every(safeCount)) throw new Error()
      if (goal.activeRun && (!textId(goal.activeRun.id) || ![goal.activeRun.startedAt, goal.activeRun.lastSeenAt, goal.activeRun.accountedTokens].every(safeCount))) throw new Error()
      if (goal.verification && (!validVerification(goal.verification) || goal.verification.iteration > goal.iteration)) throw new Error()
      if (goal.verificationHistory !== undefined && (!Array.isArray(goal.verificationHistory) || goal.verificationHistory.some(item => !validVerification(item) || item.iteration > goal.iteration) || new Set(goal.verificationHistory.map(item => item.id)).size !== goal.verificationHistory.length)) throw new Error()
      if (goal.iterationPlans !== undefined && (!Array.isArray(goal.iterationPlans) || goal.iterationPlans.some(plan => !plan || !safeCount(plan.iteration) || plan.iteration < 1 || plan.iteration > goal.iteration || !validPlanItems(plan.items)) || new Set(goal.iterationPlans.map(plan => plan.iteration)).size !== goal.iterationPlans.length)) throw new Error()
      return goal
    } catch { throw new Error('目标记录损坏，请检查 Mira 数据') }
  }
  private require(sessionId: string): HarnessGoal {
    const goal = this.get(sessionId)
    if (!goal) throw new Error('当前会话没有目标')
    return goal
  }
  private checked(sessionId: string, expectedRevision: number): HarnessGoal {
    const goal = this.require(sessionId)
    if (!safeCount(expectedRevision) || goal.revision !== expectedRevision) throw new Error('目标已变化，请刷新后重试')
    return goal
  }
  private idle(goal: HarnessGoal) { if (goal.activeRun) throw new Error('目标仍在运行，请先暂停并等待运行结束') }
  private recordVerification(goal: HarnessGoal, verification: HarnessGoalVerification) {
    const history = goal.verificationHistory || (goal.verification ? [goal.verification] : [])
    const index = history.findIndex(item => item.id === verification.id)
    const resolved = goal.verification?.id === verification.id ? { ...goal.verification, ...verification } : { ...verification }
    if (index < 0) history.push(resolved)
    else history[index] = resolved
    goal.verification = resolved; goal.verificationHistory = history
  }
  private save(sessionId: string, goal: HarnessGoal): HarnessGoal {
    goal.revision++; goal.updatedAt = Date.now()
    this.database.prepare('INSERT INTO harness_goals(session_id, payload) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET payload = excluded.payload').run(sessionId, JSON.stringify(goal))
    return JSON.parse(JSON.stringify(goal))
  }
  set(sessionId: string, input: HarnessGoalSetInput): HarnessGoal {
    const objective = validateMiraGoalObjective(input.objective), tokenBudget = validateMiraGoalBudget(input.tokenBudget)
    return this.database.transaction(() => {
      if (!this.database.prepare('SELECT id FROM harness_sessions WHERE id = ?').get(sessionId)) throw new Error('会话不存在')
      const current = this.get(sessionId)
      if (current) {
        this.idle(current)
        if (current.status !== 'complete' && !input.replace) throw new Error('已有目标，请明确替换现有目标')
        if ((current.status !== 'complete' || input.expectedRevision !== undefined) && current.revision !== input.expectedRevision) throw new Error('目标已变化，请刷新后重试')
      } else if (input.expectedRevision !== undefined) throw new Error('目标已变化，请刷新后重试')
      const now = Date.now()
      return this.save(sessionId, { id: randomUUID(), objective, status: 'active', tokenBudget, tokensUsed: 0, timeUsedSeconds: 0, revision: current?.revision || 0, iteration: 0, createdAt: now, updatedAt: now })
    })()
  }
  pause(sessionId: string, expectedRevision: number, reason?: string): HarnessGoal {
    return this.database.transaction(() => {
      const goal = this.checked(sessionId, expectedRevision)
      if (goal.status !== 'active') return goal
      goal.status = 'paused'
      if (reason) goal.reason = reason.slice(0, 4000)
      return this.save(sessionId, goal)
    })()
  }
  resume(sessionId: string, expectedRevision: number): HarnessGoal {
    return this.database.transaction(() => {
      const goal = this.checked(sessionId, expectedRevision); this.idle(goal)
      if (goal.status === 'complete') throw new Error('目标已经完成，请创建新目标')
      if (goal.tokenBudget !== null && goal.tokensUsed >= goal.tokenBudget) throw new Error('目标预算已用尽，请提高预算后继续')
      if (goal.status === 'active') return goal
      goal.status = 'active'; delete goal.reason
      return this.save(sessionId, goal)
    })()
  }
  clear(sessionId: string, expectedRevision: number): void {
    this.database.transaction(() => { this.idle(this.checked(sessionId, expectedRevision)); this.database.prepare('DELETE FROM harness_goals WHERE session_id = ?').run(sessionId) })()
  }
  updateBudget(sessionId: string, tokenBudget: number | null, expectedRevision: number): HarnessGoal {
    const budget = validateMiraGoalBudget(tokenBudget)
    return this.database.transaction(() => {
      const goal = this.checked(sessionId, expectedRevision); this.idle(goal)
      goal.tokenBudget = budget
      if (goal.status !== 'complete' && budget !== null && goal.tokensUsed >= budget) goal.status = 'budget_limited'
      return this.save(sessionId, goal)
    })()
  }
  begin(sessionId: string, id: string, runId: string): HarnessGoal {
    if (!textId(runId)) throw new Error('目标运行身份无效')
    return this.database.transaction(() => {
      const goal = this.require(sessionId)
      if (goal.id !== id || goal.status !== 'active') throw new Error('目标已变化或已暂停')
      if (goal.activeRun?.id === runId) return goal
      this.idle(goal)
      if (goal.tokenBudget !== null && goal.tokensUsed >= goal.tokenBudget) throw new Error('目标预算已用尽')
      const now = Date.now(); goal.activeRun = { id: runId, startedAt: now, lastSeenAt: now, accountedTokens: 0 }
      return this.save(sessionId, goal)
    })()
  }
  account(sessionId: string, id: string, runId: string, runTokensTotal: number): HarnessGoal {
    if (!safeCount(runTokensTotal)) throw new Error('目标 Token 使用量无效')
    return this.database.transaction(() => {
      const goal = this.require(sessionId)
      if (goal.id !== id || goal.activeRun?.id !== runId) return goal
      const delta = Math.max(0, runTokensTotal - goal.activeRun.accountedTokens)
      if (goal.tokensUsed > Number.MAX_SAFE_INTEGER - delta) throw new Error('目标 Token 使用量超过安全范围')
      const now = Date.now()
      if (!delta && now <= goal.activeRun.lastSeenAt) return goal
      goal.tokensUsed += delta; goal.activeRun.accountedTokens = Math.max(runTokensTotal, goal.activeRun.accountedTokens); goal.activeRun.lastSeenAt = Math.max(now, goal.activeRun.lastSeenAt)
      if (goal.status !== 'complete' && goal.tokenBudget !== null && goal.tokensUsed >= goal.tokenBudget) goal.status = 'budget_limited'
      return this.save(sessionId, goal)
    })()
  }
  finish(sessionId: string, id: string, runId: string): HarnessGoal {
    return this.database.transaction(() => {
      const goal = this.require(sessionId)
      if (goal.id !== id || goal.activeRun?.id !== runId) return goal
      if (goal.verification?.status === 'running' && (goal.status === 'paused' || goal.status === 'budget_limited')) this.recordVerification(goal, { ...goal.verification, status: 'stopped', reason: goal.status === 'budget_limited' ? '目标预算已用尽，核验已停止' : '用户暂停，核验已停止', updatedAt: Date.now() })
      goal.timeUsedSeconds += elapsedSeconds(goal.activeRun.startedAt, Date.now()); delete goal.activeRun
      return this.save(sessionId, goal)
    })()
  }
  nextIteration(sessionId: string, id: string, runId: string): HarnessGoal {
    return this.database.transaction(() => {
      const goal = this.require(sessionId)
      if (goal.id !== id || goal.activeRun?.id !== runId || goal.status !== 'active') return goal
      goal.iteration++
      return this.save(sessionId, goal)
    })()
  }
  recordIterationPlan(sessionId: string, id: string, runId: string, iteration: number, items: HarnessGoalPlanItem[]): HarnessGoal {
    if (!safeCount(iteration) || iteration < 1 || !validPlanItems(items)) throw new Error('目标计划记录无效')
    return this.database.transaction(() => {
      const goal = this.require(sessionId)
      if (goal.id !== id || goal.activeRun?.id !== runId || goal.iteration !== iteration || goal.status === 'complete') return goal
      const previous = goal.iterationPlans?.find(plan => plan.iteration === iteration)
      if (!items.length || JSON.stringify(previous?.items) === JSON.stringify(items)) return goal
      if (goal.status !== 'active') {
        if (!previous || previous.items.length !== items.length || items.some((item, index) => {
          const before = previous.items[index]
          return before.id !== item.id || before.label !== item.label || before.detail !== item.detail || before.status !== item.status && !(before.status === 'running' && ['completed', 'failed', 'stopped'].includes(item.status))
        })) return goal
      }
      const plan = { iteration, items: items.map(item => ({ ...item })) }
      goal.iterationPlans = [...(goal.iterationPlans || []).filter(plan => plan.iteration !== iteration), plan].sort((a, b) => a.iteration - b.iteration)
      return this.save(sessionId, goal)
    })()
  }
  verify(sessionId: string, id: string, runId: string, patch: HarnessGoalVerification): HarnessGoal {
    if (!validVerification(patch)) throw new Error('目标验收记录无效')
    return this.database.transaction(() => {
      const goal = this.require(sessionId)
      if (goal.id !== id || goal.activeRun?.id !== runId || !['active', 'budget_limited'].includes(goal.status) || patch.iteration !== goal.iteration) return goal
      if (goal.verification) {
        if (goal.verification.iteration === patch.iteration) {
          if (goal.verification.id !== patch.id || goal.verification.status !== 'running') return goal
        } else if (goal.verification.iteration > patch.iteration || goal.verification.status === 'running' || patch.status !== 'running') return goal
      }
      if (goal.verificationHistory?.some(item => item.id === patch.id && item.iteration !== patch.iteration)) return goal
      this.recordVerification(goal, patch)
      if (goal.tokenBudget !== null && goal.tokensUsed >= goal.tokenBudget) goal.status = 'budget_limited'
      else if (patch.status === 'passed') goal.status = 'complete'
      return this.save(sessionId, goal)
    })()
  }
}
