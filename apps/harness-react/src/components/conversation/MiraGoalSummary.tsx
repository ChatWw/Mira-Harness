import { useEffect, useMemo, useState } from 'react'
import { Check, LoaderCircle, Pause, Play, Target } from 'lucide-react'
import type { HarnessGoal, HarnessGoalVerification } from '../../../../../src/config/miraGoals'
import { getMiraGoalStatusLabel, validateMiraGoalBudget } from '../../../../../src/config/miraGoals'
import type { PilotController } from '../../state/pilot-state'

function iterationRows(goal: HarnessGoal) {
  const verifications = new Map<number, HarnessGoalVerification>()
  for (const entry of [...(goal.verificationHistory || []), ...(goal.verification ? [goal.verification] : [])]) {
    if (!Number.isSafeInteger(entry.iteration) || entry.iteration < 1) continue
    const previous = verifications.get(entry.iteration)
    if (!previous || entry.updatedAt >= previous.updatedAt) verifications.set(entry.iteration, entry)
  }
  const current = Math.max(1, goal.iteration)
  const plans = new Map((goal.iterationPlans || []).map(plan => [plan.iteration, plan.items]))
  // Older snapshots can lack history. Display observed rounds, never reconstruct missing work.
  return [...new Set([1, current, ...verifications.keys(), ...plans.keys()])].sort((a, b) => a - b).map(iteration => {
    const verification = verifications.get(iteration), isCurrent = iteration === current
    const title = iteration === 1 ? goal.objective : verifications.get(iteration - 1)?.nextAction?.trim() || `第 ${iteration} 轮`
    const status = isCurrent && (goal.status === 'paused' || goal.status === 'budget_limited') ? goal.status
      : verification?.status || (isCurrent ? goal.iteration === 0 ? 'pending' : goal.status === 'complete' ? 'complete' : 'active' : 'missing')
    const label = status === 'paused' || status === 'budget_limited' ? getMiraGoalStatusLabel(goal)
      : status === 'passed' ? '核验通过' : status === 'failed' ? '目标未完成' : status === 'error' ? '核验异常'
        : status === 'stopped' ? '核验已停止' : status === 'running' ? isCurrent ? '核验中' : '核验记录未收口'
          : status === 'active' ? '执行中' : status === 'complete' ? '已完成' : status === 'pending' ? '尚未开始' : '轮次记录不可用'
    const items = plans.get(iteration) || []
    return { iteration, title, status, label, reason: verification?.reason, running: isCurrent && (status === 'running' || status === 'active'), total: items.length, completed: items.filter(item => item.status === 'completed').length }
  })
}

export function MiraGoalSummary({ goal, controller, sessionId, detailsRequest = 0, planning = false }: { goal?: HarnessGoal; controller: PilotController; sessionId?: string; detailsRequest?: number; planning?: boolean }) {
  const [now, setNow] = useState(Date.now())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [budget, setBudget] = useState(goal?.tokenBudget?.toString() ?? '')
  const [detailsOpen, setDetailsOpen] = useState(Boolean(detailsRequest))
  const rows = useMemo(() => goal ? iterationRows(goal) : [], [goal])
  useEffect(() => { if (detailsRequest) setDetailsOpen(true) }, [detailsRequest])
  useEffect(() => { setBudget(goal?.tokenBudget?.toString() ?? '') }, [goal?.id, goal?.tokenBudget])
  useEffect(() => {
    if (!goal?.activeRun || goal.status !== 'active') return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [goal?.activeRun?.startedAt, goal?.status])
  const act = async (operation: () => Promise<unknown>) => {
    if (pending) return
    setPending(true); setError('')
    try { await operation() } catch (failure) { setError(failure instanceof Error ? failure.message : '目标操作失败，请重试') } finally { setPending(false) }
  }
  if (!goal) return <section className="mira-goal-summary" aria-label="目标"><strong><Target size={15} />目标</strong><p>尚未设置目标。输入 /goal 后填写要完成的任务。</p></section>
  const state = controller.getSnapshot()
  const available = Boolean(sessionId && !state.sessionLoading && state.session?.id === sessionId && state.session.goal?.id === goal.id && controller.supportsGoals)
  const elapsed = Math.floor(goal.timeUsedSeconds + (goal.activeRun ? Math.max(0, (goal.status === 'active' ? now : goal.activeRun.lastSeenAt) - goal.activeRun.startedAt) / 1000 : 0))
  const time = elapsed < 60 ? `${elapsed} 秒` : elapsed < 3600 ? `${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒` : `${Math.floor(elapsed / 3600)} 时 ${Math.floor(elapsed % 3600 / 60)} 分`
  const status = getMiraGoalStatusLabel(goal)
  const resumeReason = planning ? '先关闭计划模式，再恢复目标' : goal.activeRun ? '等待本轮结束后恢复目标' : '恢复目标'
  return <section className="mira-goal-summary" aria-label="目标">
    <div className="mira-goal-summary__heading"><Target size={15} /><strong>目标</strong><small>{status}</small>{goal.status === 'complete' ? <Check size={14} /> : goal.status === 'active' ? <button type="button" aria-label="暂停目标" title="暂停目标" disabled={!available || pending} onClick={() => void act(() => controller.pauseGoal(sessionId!, goal.revision, goal.id))}>{pending ? <LoaderCircle size={14} className="animate-spin" /> : <Pause size={14} />}</button> : <button type="button" aria-label="恢复目标" title={resumeReason} disabled={!available || pending || planning || !state.selection || Boolean(goal.activeRun)} onClick={() => void act(() => controller.resumeGoal(sessionId!, goal.revision, goal.id, state.selection!, state.session?.permissionMode))}>{pending ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}</button>}</div>
    {planning && (goal.status === 'paused' || goal.status === 'budget_limited') && <p>{resumeReason}</p>}
    <ol className="mira-goal-summary__iterations" aria-label="目标逐轮进展">{rows.map(row => <li key={row.iteration} data-goal-iteration={row.iteration} data-goal-iteration-status={row.status}>
      <span className="mira-goal-summary__iteration-number" aria-label={`第 ${row.iteration} 轮`}>{row.status === 'passed' ? <Check size={14} aria-hidden="true" /> : row.running ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : row.iteration}</span>
      <div><p className="mira-goal-summary__iteration-title" title={row.title}>{row.title}</p><small>{row.label}</small>{row.reason && <p className="mira-goal-summary__iteration-reason" title={row.reason}>{row.reason}</p>}</div>
      {row.total > 0 && <small className="mira-goal-summary__iteration-count" aria-label={`第 ${row.iteration} 轮待办：已完成 ${row.completed} / ${row.total}`} title="待办执行进度，不代表目标核验通过">{row.completed}/{row.total}</small>}
    </li>)}</ol>
    <small className="mira-goal-summary__time">已用 {time} · 第 {goal.iteration} 次迭代</small>
    {goal.verification?.nextAction && goal.status !== 'complete' && <p className="mira-goal-summary__next-action" title={goal.verification.nextAction}>下一步：{goal.verification.nextAction}</p>}
    {goal.reason && goal.reason !== goal.verification?.reason && <p className="mira-goal-summary__status-reason" title={goal.reason}>{goal.reason}</p>}
    <details open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>目标详情</summary>
      <p>{goal.objective}</p>
      {goal.verification?.reason && <p>{goal.verification.reason}</p>}
      {goal.verification?.nextAction && goal.status !== 'complete' && <p>下一步：{goal.verification.nextAction}</p>}
      {goal.reason && goal.reason !== goal.verification?.reason && <p>{goal.reason}</p>}
      <p>已使用 {goal.tokensUsed.toLocaleString()} Token{goal.tokenBudget !== null ? ` / ${goal.tokenBudget.toLocaleString()}` : ' · 不限预算'}</p>
      <form className="mira-goal-summary__budget" onSubmit={event => { event.preventDefault(); void act(() => { const value = budget.trim(); if (value && !/^[0-9]+$/.test(value)) throw new Error('请输入正整数，或留空表示不限预算'); return controller.updateGoalBudget(sessionId!, validateMiraGoalBudget(value ? Number(value) : null), goal.revision, goal.id) }) }}>
        <label>Token 预算<input aria-label="目标 Token 预算" type="text" inputMode="numeric" placeholder="不限预算" value={budget} disabled={!available || pending || Boolean(goal.activeRun)} onChange={event => setBudget(event.target.value)} /></label>
        <button type="submit" disabled={!available || pending || Boolean(goal.activeRun) || budget === (goal.tokenBudget?.toString() ?? '')}>保存预算</button>
      </form>
      <small>留空为不限预算。修改后需手动恢复；单次请求可能超过预算。</small>
      {goal.activeRun && <p>先暂停目标并等待本轮结束，再修改预算或清除目标。</p>}
      <button type="button" className="mira-summary-resource" disabled={!available || pending || Boolean(goal.activeRun)} onClick={() => void act(() => controller.clearGoal(sessionId!, goal.revision, goal.id))}>清除目标</button>
    </details>
    {error && <p role="alert" className="mira-goal-summary__error">{error}</p>}
  </section>
}
