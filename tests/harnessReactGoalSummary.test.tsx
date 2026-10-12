// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessGoal } from '../src/config/miraGoals'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import { MiraGoalSummary } from '../apps/harness-react/src/components/conversation/MiraGoalSummary'
import { MiraGoalVerification } from '../apps/harness-react/src/components/conversation/MiraGoalVerification'
import { TaskSummary } from '../apps/harness-react/src/components/conversation/TaskSummary'
import { goalVerificationsByMessage } from '../apps/harness-react/src/components/conversation/conversation-model'

let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren() })
const initialGoal: HarnessGoal = { id: 'goal', objective: '完成实际需求', revision: 4, status: 'active', tokenBudget: null, tokensUsed: 230, timeUsedSeconds: 60, iteration: 2, createdAt: 1, updatedAt: 4 }
function fixture(goal = initialGoal) {
  const state = { session: { id: 'owner', goal, permissionMode: 'default' }, selection: { providerId: 'provider', modelId: 'model' } }
  const controller = { supportsGoals: true, getSnapshot: () => state, pauseGoal: vi.fn(async () => goal), resumeGoal: vi.fn(async () => goal), updateGoalBudget: vi.fn(async () => goal), clearGoal: vi.fn(async () => undefined) }
  const render = async (planning = false) => { await act(async () => root.render(<MiraGoalSummary goal={state.session.goal} controller={controller as unknown as PilotController} sessionId="owner" detailsRequest={1} planning={planning} />)) }
  return { state, controller, render }
}

describe('Goal summary uses authoritative lifecycle and statistics', () => {
  it.each(['paused', 'budget_limited'] as const)('blocks %s Goal resumption in Plan mode without changing its lifecycle', async status => {
    const view = fixture({ ...initialGoal, status, tokenBudget: 900 }); await view.render(true)
    const resume = container.querySelector<HTMLButtonElement>('[aria-label="恢复目标"]')!
    expect(resume.disabled).toBe(true)
    expect(resume.title).toBe('先关闭计划模式，再恢复目标')
    expect(container.textContent).toContain('先关闭计划模式，再恢复目标')
    await act(async () => resume.click())
    expect(view.controller.resumeGoal).not.toHaveBeenCalled()
    expect(view.state.session.goal.status).toBe(status)
    await view.render(false)
    expect(container.textContent).not.toContain('先关闭计划模式，再恢复目标')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="恢复目标"]')!.click())
    expect(view.controller.resumeGoal).toHaveBeenCalledExactlyOnceWith('owner', 4, 'goal', view.state.selection, 'default')
  })
  it('passes Plan mode from the task summary to the Goal resume control', async () => {
    const view = fixture({ ...initialGoal, status: 'paused' })
    await act(async () => root.render(<TaskSummary goal={view.state.session.goal} goalController={view.controller as unknown as PilotController} goalSessionId="owner" goalPlanning taskState="已暂停" taskTone="idle" running={false} activities={[]} subtasks={[]} changes={0} onOpenChanges={() => {}} onReviewPlan={() => {}} onStopSubtask={async () => {}} onError={() => {}} />))
    expect(container.querySelector<HTMLButtonElement>('[aria-label="恢复目标"]')!.disabled).toBe(true)
    expect(view.controller.resumeGoal).not.toHaveBeenCalled()
  })
  it('shows real per-round plan counts independently from failed Goal verification', async () => {
    const view = fixture({ ...initialGoal, iteration: 2, verificationHistory: [{ id: 'v1', iteration: 1, status: 'failed', nextAction: '补验第二轮', updatedAt: 1 }], iterationPlans: [
      { iteration: 1, items: [{ id: 'plan-0', label: '读取证据', status: 'completed' }, { id: 'plan-1', label: '写入结果', status: 'completed' }] },
      { iteration: 2, items: [{ id: 'plan-0', label: '重新读取', status: 'completed' }, { id: 'plan-1', label: '核对结果', status: 'running' }, { id: 'plan-2', label: '缺失验收', status: 'pending' }] },
    ] })
    await view.render()
    const first = container.querySelector('[data-goal-iteration="1"]')!, second = container.querySelector('[data-goal-iteration="2"]')!
    expect(first.querySelector('.mira-goal-summary__iteration-count')?.textContent).toBe('2/2')
    expect(first.getAttribute('data-goal-iteration-status')).toBe('failed')
    expect(first.textContent).toContain('目标未完成')
    expect(second.querySelector('.mira-goal-summary__iteration-count')?.textContent).toBe('1/3')
    expect(second.querySelector('.mira-goal-summary__iteration-count')?.getAttribute('aria-label')).toBe('第 2 轮待办：已完成 1 / 3')
    expect(container.querySelector('[data-goal-iteration-status="passed"]')).toBeNull()
  })
  it('keeps plan-only observed rounds and never derives counts from tools, missing plans or a passed verifier', async () => {
    const view = fixture({ ...initialGoal, iteration: 4, status: 'complete', verification: { id: 'passed', iteration: 4, status: 'passed', updatedAt: 4 }, iterationPlans: [
      { iteration: 2, items: [{ id: 'plan-0', label: '实际失败', status: 'failed' }, { id: 'plan-1', label: '实际停止', status: 'stopped' }] },
    ] })
    await view.render()
    expect([...container.querySelectorAll('[data-goal-iteration]')].map(row => row.getAttribute('data-goal-iteration'))).toEqual(['1', '2', '4'])
    expect(container.querySelector('[data-goal-iteration="2"] .mira-goal-summary__iteration-count')?.textContent).toBe('0/2')
    expect(container.querySelector('[data-goal-iteration="4"] .mira-goal-summary__iteration-count')).toBeNull()
    expect(container.querySelector('[data-goal-iteration="1"] .mira-goal-summary__iteration-count')).toBeNull()
  })
  it('bounds the next-action preview while preserving full evidence in Goal details', async () => {
    const nextAction = '逐条检查真实结果。'.repeat(200), reason = '缺少实际验收证据。'.repeat(100)
    const view = fixture({ ...initialGoal, verification: { id: 'v', iteration: 2, status: 'failed', reason, nextAction, updatedAt: 4 } })
    await view.render()
    const preview = container.querySelector('.mira-goal-summary__next-action')!
    expect(preview.textContent).toBe(`下一步：${nextAction}`)
    expect(preview.getAttribute('title')).toBe(nextAction)
    const details = container.querySelector('.mira-goal-summary details')!
    expect(details.textContent).toContain(reason)
    expect(details.textContent).toContain(`下一步：${nextAction}`)
  })
  it('shows authoritative iteration actions and verification outcomes without invented completion counts', async () => {
    const first = { id: 'first', iteration: 1, status: 'failed' as const, reason: '还缺集成验收', nextAction: '运行真实集成验收', updatedAt: 2 }
    const second = { id: 'second', iteration: 2, status: 'running' as const, updatedAt: 3 }
    const view = fixture({ ...initialGoal, verificationHistory: [first, second], verification: second })
    await view.render()
    const rows = [...container.querySelectorAll('[data-goal-iteration]')]
    expect(rows.map(row => row.getAttribute('data-goal-iteration'))).toEqual(['1', '2'])
    expect(rows[0].textContent).toContain('完成实际需求')
    expect(rows[0].textContent).toContain('目标未完成')
    expect(rows[0].textContent).toContain('还缺集成验收')
    expect(rows[1].textContent).toContain('运行真实集成验收')
    expect(rows[1].textContent).toContain('核验中')
    expect(rows[1].getAttribute('data-goal-iteration-status')).toBe('running')
    expect(container.querySelector('progress')).toBeNull()
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+.*完成|100%|50%/)
  })
  it('deduplicates each iteration by the newest authoritative verification and orders observed rounds', async () => {
    const view = fixture({ ...initialGoal, iteration: 3, status: 'complete', verificationHistory: [
      { id: 'old', iteration: 1, status: 'running', updatedAt: 1 },
      { id: 'current', iteration: 3, status: 'running', updatedAt: 3 },
      { id: 'first', iteration: 1, status: 'failed', nextAction: '补全工具调用', updatedAt: 2 },
      { id: 'second', iteration: 2, status: 'failed', nextAction: '最终验收', updatedAt: 3 },
    ], verification: { id: 'current', iteration: 3, status: 'passed', reason: '全部实际验收通过', updatedAt: 4 } })
    await view.render()
    const rows = [...container.querySelectorAll('[data-goal-iteration]')]
    expect(rows.map(row => row.getAttribute('data-goal-iteration'))).toEqual(['1', '2', '3'])
    expect(rows[1].textContent).toContain('补全工具调用')
    expect(rows[2].textContent).toContain('最终验收')
    expect(rows[2].textContent).toContain('核验通过')
    expect(rows[2].getAttribute('data-goal-iteration-status')).toBe('passed')
    expect(rows.filter(row => row.getAttribute('data-goal-iteration-status') === 'passed')).toHaveLength(1)
  })
  it('does not invent missing historical rounds or next actions from a current-only legacy snapshot', async () => {
    const view = fixture({ ...initialGoal, iteration: 5, status: 'paused', verification: { id: 'latest', iteration: 5, status: 'failed', nextAction: '未来尚未开始的行动', updatedAt: 4 } })
    await view.render()
    const rows = [...container.querySelectorAll('[data-goal-iteration]')]
    expect(rows.map(row => row.getAttribute('data-goal-iteration'))).toEqual(['1', '5'])
    expect(rows[1].textContent).toContain('第 5 轮')
    expect(rows[1].textContent).toContain('已暂停')
    expect(rows[1].textContent).not.toContain('未来尚未开始的行动')
    expect(rows[0].textContent).toContain('轮次记录不可用')
    expect(container.querySelector('[data-goal-iteration="6"]')).toBeNull()
  })
  it.each(['paused', 'budget_limited'] as const)('reflects current %s lifecycle instead of a stale running verifier', async status => {
    const view = fixture({ ...initialGoal, status, tokenBudget: 100, verificationHistory: [{ id: 'previous', iteration: 1, status: 'failed', nextAction: '继续检查', updatedAt: 2 }], verification: { id: 'current', iteration: 2, status: 'running', updatedAt: 3 } })
    await view.render()
    const row = container.querySelector('[data-goal-iteration="2"]')!
    expect(row.getAttribute('data-goal-iteration-status')).toBe(status)
    expect(row.textContent).toContain(status === 'paused' ? '已暂停' : '预算已用尽')
    expect(row.querySelector('.animate-spin')).toBeNull()
  })
  it('keeps many long iteration actions in the existing summary scroll body and preserves clear controls', async () => {
    const view = fixture({ ...initialGoal, iteration: 35, status: 'paused', verificationHistory: Array.from({ length: 34 }, (_, index) => ({ id: `v-${index}`, iteration: index + 1, status: 'failed' as const, nextAction: `验收 ${index + 2}：${'长行动说明'.repeat(60)}`, updatedAt: index + 1 })) })
    await view.render()
    expect(container.querySelectorAll('[data-goal-iteration]')).toHaveLength(35)
    const action = container.querySelector('[data-goal-iteration="35"] .mira-goal-summary__iteration-title')!
    expect(action.getAttribute('title')).toContain('验收 35')
    expect(action.textContent).toContain('长行动说明')
    expect(container.querySelector('ol[aria-label="目标逐轮进展"]')).not.toBeNull()
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '清除目标')!.click())
    expect(view.controller.clearGoal).toHaveBeenCalledExactlyOnceWith('owner', 4, 'goal')
  })
  it('labels an unstarted objective and ignores invalid iteration entries without fabricating execution', async () => {
    const view = fixture({ ...initialGoal, iteration: 0, verificationHistory: [{ id: 'invalid', iteration: 0, status: 'passed', updatedAt: 1 }] })
    await view.render()
    expect(container.querySelectorAll('[data-goal-iteration]')).toHaveLength(1)
    expect(container.querySelector('[data-goal-iteration="1"]')?.textContent).toContain('尚未开始')
    expect(container.querySelector('[data-goal-iteration="1"] .animate-spin')).toBeNull()
    expect(container.querySelector('[data-goal-iteration-status="passed"]')).toBeNull()
  })
  it.each(['error', 'stopped'] as const)('keeps previous %s verification factual while the later round is active', async status => {
    const view = fixture({ ...initialGoal, iteration: 2, verificationHistory: [{ id: 'first', iteration: 1, status, reason: '真实记录', nextAction: '继续实际工作', updatedAt: 1 }] })
    await view.render()
    expect(container.querySelector('[data-goal-iteration="1"]')?.textContent).toContain(status === 'error' ? '核验异常' : '核验已停止')
    expect(container.querySelector('[data-goal-iteration="1"] .animate-spin')).toBeNull()
    expect(container.querySelector('[data-goal-iteration="2"]')?.textContent).toContain('继续实际工作')
    expect(container.querySelector('[data-goal-iteration="2"]')?.textContent).toContain('执行中')
  })
  it('anchors every real iteration to its own reply, deduplicates latest, and never creates unanchored rows', () => {
    const first = { id: 'first', iteration: 1, status: 'failed' as const, reason: '尚缺验收', anchorMessageId: 'reply-1', updatedAt: 2 }
    const second = { id: 'second', iteration: 2, status: 'running' as const, anchorMessageId: 'reply-2', updatedAt: 3 }
    const latest = { ...second, status: 'passed' as const, reason: '实际验收通过', updatedAt: 4 }
    const entries = goalVerificationsByMessage({ ...initialGoal, verificationHistory: [first, second, { id: 'orphan', iteration: 0, status: 'error', updatedAt: 1 }], verification: latest })
    expect([...entries.keys()]).toEqual(['reply-1', 'reply-2'])
    expect(entries.get('reply-1')).toEqual([first]); expect(entries.get('reply-2')).toEqual([latest])
    expect(goalVerificationsByMessage({ ...initialGoal, verification: latest }).get('reply-2')).toEqual([latest])
  })
  it('ticks genuine accumulated elapsed time only while running, and sends an exact pause identity', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10_000)
    const view = fixture({ ...initialGoal, activeRun: { id: 'run', startedAt: 5_000, lastSeenAt: 5_000, accountedTokens: 0 } }); await view.render()
    expect(container.querySelector('.mira-goal-summary__time')?.textContent).toBe('已用 1 分 5 秒 · 第 2 次迭代')
    await act(async () => vi.advanceTimersByTime(2_000))
    expect(container.querySelector('.mira-goal-summary__time')?.textContent).toBe('已用 1 分 7 秒 · 第 2 次迭代')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="暂停目标"]')!.click())
    expect(view.controller.pauseGoal).toHaveBeenCalledExactlyOnceWith('owner', 4, 'goal')
    expect(container.textContent).toContain('执行中')
    view.state.session.goal = { ...initialGoal, status: 'paused', timeUsedSeconds: 67 }; await view.render()
    await act(async () => vi.advanceTimersByTime(2_000))
    expect(container.querySelector('.mira-goal-summary__time')?.textContent).toBe('已用 1 分 7 秒 · 第 2 次迭代')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps budget-limited state and quota-rejection reason visible without fabricated resumption', async () => {
    const view = fixture({ ...initialGoal, status: 'budget_limited', tokenBudget: 200 }); view.controller.resumeGoal.mockRejectedValueOnce(new Error('剩余额度不足，请增加预算后恢复')); await view.render()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="恢复目标"]')!.click())
    expect(view.controller.resumeGoal).toHaveBeenCalledExactlyOnceWith('owner', 4, 'goal', view.state.selection, 'default')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('剩余额度不足')
    expect(container.textContent).toContain('预算已用尽')
    expect(container.querySelector('progress')).toBeNull()
  })
  it('saves optional budget with existing usage identity and does not resume the Goal', async () => {
    const view = fixture({ ...initialGoal, status: 'paused' }); await view.render()
    const input = container.querySelector<HTMLInputElement>('[aria-label="目标 Token 预算"]')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '900'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(view.controller.updateGoalBudget).toHaveBeenCalledExactlyOnceWith('owner', 900, 4, 'goal')
    expect(view.controller.resumeGoal).not.toHaveBeenCalled(); expect(container.textContent).toContain('230 Token')
  })
  it.each([900, null])('shows waiting for explicit resume after increasing or removing an exhausted budget (%s)', async tokenBudget => {
    const view = fixture({ ...initialGoal, status: 'budget_limited', tokenBudget }); await view.render()
    expect(container.querySelector('.mira-goal-summary__heading')?.textContent).toContain('已暂停，待恢复')
    expect(container.querySelector('.mira-goal-summary__heading')?.textContent).not.toContain('预算已用尽')
    expect(view.controller.resumeGoal).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLButtonElement>('[aria-label="恢复目标"]')?.disabled).toBe(false)
  })
  it('keeps a Goal-only task summary visible and displays real verification evidence', async () => {
    const view = fixture({ ...initialGoal, verification: { id: 'verification', iteration: 2, status: 'failed', reason: '部署验证未完成', nextAction: '执行验收', updatedAt: 4 } })
    await act(async () => root.render(<TaskSummary goal={view.state.session.goal} goalController={view.controller as unknown as PilotController} goalSessionId="owner" taskState="等待下一步" taskTone="idle" running={false} activities={[]} subtasks={[]} changes={0} onOpenChanges={() => {}} onReviewPlan={() => {}} onStopSubtask={async () => {}} onError={() => {}} />))
    expect(container.querySelector('.mira-task-summary__mini strong')?.textContent).toBe('完成实际需求')
    expect(container.textContent).toContain('部署验证未完成'); expect(container.textContent).toContain('下一步：执行验收')
    await act(async () => root.render(<MiraGoalVerification verification={view.state.session.goal.verification!} />))
    expect(container.querySelector('[data-goal-verification-id="verification"]')?.textContent).toContain('第 2 次迭代 · 目标尚未完成')
    expect(container.textContent).toContain('部署验证未完成')
  })
  it('renders a persisted stopped verification neutrally without a running spinner', async () => {
    await act(async () => root.render(<MiraGoalVerification verification={{ id: 'stopped', iteration: 2, status: 'stopped', reason: '用户暂停目标，核验已停止', updatedAt: 4 }} />))
    expect(container.textContent).toContain('目标核验已停止')
    expect(container.querySelector('.animate-spin')).toBeNull(); expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
