// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskSummary, type MiraTaskSummaryMode } from '../apps/harness-react/src/components/conversation/TaskSummary'
import type { HarnessSubtask } from '../src/config/harness'
import type { RunRecord } from '../packages/mira-flow-kit/src/engine/mira-types'
import { MiraPlanDetail } from '../apps/harness-react/src/components/workspace/MiraPlanDetail'
import { miraSessionPlans } from '../src/config/miraSessionPlans'
import type { HarnessSession } from '../src/config/harness'
import { TaskInteraction } from '../apps/harness-react/src/components/interactions/TaskInteraction'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers() })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

type Props = React.ComponentProps<typeof TaskSummary>
const agent = (status: HarnessSubtask['status'] = 'running'): HarnessSubtask => ({ id: 'child', parentToolCallId: 'tool', role: 'explorer', task: '核对文件', status, createdAt: 1, activities: [] })

async function mount(overrides: Partial<Props> = {}) {
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container)
  // Happy DOM cannot measure container queries. This tests only explicit modes and
  // the hidden-panel focus path; responsive layout still needs Chromium acceptance.
  const style = document.createElement('style')
  style.textContent = '.mira-task-summary__panel { display: none } .mira-task-summary[data-mode="panel"] .mira-task-summary__panel { display: block }'
  document.body.append(style)
  const props: Props = { taskState: '执行中', taskTone: 'running', running: true, activities: [], subtasks: [], changes: 1, onOpenChanges: vi.fn(), onOpenProgress: vi.fn(), onReviewPlan: vi.fn(), onStopSubtask: vi.fn(async () => undefined), onError: vi.fn(), ...overrides }
  let session = 'A', updateMode!: (mode: MiraTaskSummaryMode) => void
  const changed = vi.fn()
  function Host() {
    const [mode, setMode] = useState<MiraTaskSummaryMode>('auto')
    updateMode = setMode
    return <><button aria-label="其他目的地">目的地</button><TaskSummary key={session} {...props} mode={mode} onModeChange={next => { changed(next); setMode(next) }} /></>
  }
  root = createRoot(container)
  const render = async () => { await act(async () => root!.render(<React.StrictMode><Host /></React.StrictMode>)) }
  await render()
  const button = (label: string) => { const element = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); if (!element) throw new Error(`Missing ${label}`); return element }
  const click = async (label: string, focus = true) => { await act(async () => { const element = button(label); if (focus) element.focus(); element.click() }) }
  const openMenu = async () => { await act(async () => { const trigger = button('摘要显示方式'); trigger.focus(); trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }); await settle() }
  const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(30) }) }
  const mode = () => document.querySelector('[aria-label="任务摘要"]')?.getAttribute('data-mode')
  return { props, button, click, openMenu, settle, mode, changed, render, switchSession: async (id: string) => { session = id; await render() }, externalMode: async (next: MiraTaskSummaryMode) => { await act(async () => updateMode(next)) } }
}

describe('task summary through real React DOM and Radix', () => {
  it('replaces the completed-model capsule with live or failed independent command state', async () => {
    const command = { id: 'job', runId: 'old-run', tool: 'bash', status: 'ok' as const, createdAt: 1, commandJob: { mode: 'background' as const, status: 'running' as const, revision: 1, startedAt: 1 } }
    const view = await mount({ changes: 0, running: false, taskTone: 'completed', taskState: '最近任务已完成', commands: [command] })
    expect(view.button('展开任务摘要').textContent).toContain('1 条命令运行中')
    expect(document.querySelector('[aria-label="任务摘要"]')?.getAttribute('data-task-tone')).toBe('running')
    view.props.commands = [{ ...command, commandJob: { ...command.commandJob, status: 'failed', revision: 2, error: 'exit 7' } }]; await view.render()
    expect(view.button('展开任务摘要').textContent).toContain('1 条后台命令异常')
    expect(document.querySelector('[aria-label="任务摘要"]')?.getAttribute('data-task-tone')).toBe('partial')
  })
  it('keeps command-only summaries visible and opens a captured execution without rerunning it', async () => {
    const onOpenCommand = vi.fn()
    const view = await mount({ changes: 0, activities: [], commands: [{ id: 'bash-one', runId: 'run-one', tool: 'bash', status: 'running', createdAt: 1, target: 'npm run build' }], onOpenCommand })
    expect(view.button('展开任务摘要').textContent).toContain('1 条命令进行中')
    await view.click('展开任务摘要')
    await view.click('在右侧查看命令 npm run build')
    expect(onOpenCommand).toHaveBeenCalledExactlyOnceWith('run-one', 'bash-one')
    expect(view.props.onOpenProgress).not.toHaveBeenCalled()
    view.props.commands = [{ ...view.props.commands![0], status: 'failed' }]; await view.render()
    expect(document.querySelector('[aria-label="命令摘要"]')?.textContent).toContain('失败')
  })
  it('uses a short readable current-plan title and renders the approval content as Markdown', async () => {
    const plan = { id: 'pending', status: 'awaiting_confirmation' as const, request: '制定方案', understanding: '# **待确认方案**\n\n第一段说明。\n\n- 可审阅内容', steps: [{ label: '核对范围', detail: '保留 **边界**。' }], risks: ['无需自动执行'], createdAt: 1, updatedAt: 1 }
    const view = await mount({ changes: 0, plan, running: false, taskTone: 'waiting', taskState: '等待确认' })
    await view.click('展开任务摘要')
    expect(document.querySelector('.mira-summary-plan')?.textContent).toBe('待确认方案')
    const onConfirm = vi.fn(async () => undefined), onRevise = vi.fn(async () => undefined), onCancel = vi.fn(async () => undefined)
    await act(async () => root!.render(<TaskInteraction interaction={{ id: 'review', kind: 'plan-review', status: 'waiting', planId: plan.id, createdAt: 1 }} plan={plan} selectionReady onConfirm={onConfirm} onRevise={onRevise} onCancel={onCancel} onAnswer={async () => undefined} />))
    const body = document.querySelector('[aria-label="方案内容"]')!
    expect(body.querySelector('h1')?.textContent).toBe('待确认方案')
    expect(body.querySelector('ol strong')?.textContent).toBe('边界')
    expect(body.textContent).not.toContain('**')
    expect(body.textContent).toContain('无需自动执行')
    expect(onConfirm).not.toHaveBeenCalled(); expect(onRevise).not.toHaveBeenCalled(); expect(onCancel).not.toHaveBeenCalled()
  })
  it('keeps submitted-plan history visible after cancellation and only opens the selected immutable snapshot', async () => {
    const session = { toolCalls: [
      { id: 'first', tool: 'present_plan', status: 'ok', createdAt: 1, input: { text: JSON.stringify({ understanding: '# 首版方案\n\n保留 **原始内容**。', steps: [{ label: '核对范围', detail: '不修改原方案' }], risks: ['查看不会执行'] }), truncated: false } },
      { id: 'revision', tool: 'present_plan', status: 'cancelled', createdAt: 2, input: { text: JSON.stringify({ understanding: '# 修订方案', steps: [{ label: '调整范围' }] }), truncated: false } },
      { id: 'legacy', tool: 'present_plan', status: 'failed', createdAt: 3 },
    ] } as HarnessSession
    const plans = miraSessionPlans(session), onOpenPlan = vi.fn()
    const view = await mount({ changes: 0, running: false, taskTone: 'idle', taskState: '就绪', plans, onOpenPlan })
    expect(view.button('展开任务摘要').textContent).toContain('历史方案')
    await view.click('展开任务摘要')
    expect([...document.querySelectorAll('[data-plan-directory-id]')].map(node => node.getAttribute('data-plan-directory-id'))).toEqual(['legacy', 'revision', 'first'])
    expect(document.querySelector('[data-plan-directory-id="legacy"] [aria-label="内容不完整"]')).not.toBeNull()
    await view.click('在右侧打开方案 首版方案')
    expect(onOpenPlan).toHaveBeenCalledExactlyOnceWith('first')
    expect(view.props.onReviewPlan).not.toHaveBeenCalled()
    expect(view.props.onOpenProgress).not.toHaveBeenCalled()
    await act(async () => root!.render(<MiraPlanDetail plan={plans[2]} />))
    expect(document.querySelector('article[data-plan-detail-id="first"] h1')?.textContent).toBe('首版方案')
    expect(document.querySelector('article strong')?.textContent).toBe('原始内容')
    expect(document.querySelector('article ol')?.textContent).toContain('不修改原方案')
    expect(document.querySelector('article ul')?.textContent).toContain('查看不会执行')
    expect(document.querySelector('article button')).toBeNull()
    await act(async () => root!.render(<MiraPlanDetail plan={plans[0]} />))
    expect(document.querySelector('[role="status"]')?.textContent).toContain('无法还原全部细节')
    await act(async () => root!.render(<MiraPlanDetail />))
    expect(document.querySelector('[role="status"]')?.textContent).toContain('方案已不可用')
  })
  it('keeps workflow-only tasks visible, exposes live and ended rows and opens the owned run', async () => {
    const runs = [{ runId: 'live', name: '资料核对', status: 'running', spentTokens: 12 }, { runId: 'done', name: '报告汇总', status: 'completed', spentTokens: 24 }] as RunRecord[]
    const onOpenWorkflow = vi.fn(async () => undefined)
    const view = await mount({ changes: 0, activities: [], running: false, taskTone: 'completed', taskState: '最近任务已完成', workflows: { sessionId: 'task-A', runs, error: '', loading: false, refresh: vi.fn() }, onOpenWorkflow })
    expect(view.button('展开任务摘要').textContent).toContain('1 个工作流运行中')
    expect(view.button('展开任务摘要').querySelector('[data-mira-workflow-summary-icon]')).not.toBeNull()
    await view.click('展开任务摘要')
    expect(document.querySelector('[aria-label="工作流摘要"]')?.textContent).toContain('报告汇总')
    await view.click('在右侧打开工作流 资料核对')
    expect(onOpenWorkflow).toHaveBeenCalledWith({ sessionId: 'task-A', runId: 'live' })
    view.props.workflows = { ...view.props.workflows!, runs: [runs[1]] }; await view.render()
    expect(view.button('展开任务摘要').textContent).toContain('1 个工作流已结束')
  })
  it('keeps current confirmation ahead of workflow activity and renders workflow errors with retry', async () => {
    const refresh = vi.fn()
    const view = await mount({ changes: 0, taskTone: 'waiting', taskState: '等待确认', workflows: { sessionId: 'task-A', runs: [{ runId: 'live', status: 'running', spentTokens: 0 } as RunRecord], error: '工作流读取失败', loading: false, refresh }, onOpenWorkflow: vi.fn(async () => undefined) })
    expect(view.button('展开任务摘要').textContent).toContain('等待确认')
    await view.click('展开任务摘要')
    expect(document.querySelector('[aria-label="工作流摘要"]')?.textContent).toContain('工作流读取失败')
    await view.click('重试工作流摘要'); expect(refresh).toHaveBeenCalledOnce()
  })
  it('does not let a completed parent turn mask a live workflow in its persistent summary', async () => {
    const view = await mount({ changes: 0, running: false, taskTone: 'completed', taskState: '最近任务已完成', activities: [{ id: 'tool', kind: 'tool', label: '已启动工作流', status: 'completed', startedAt: 1 }], workflows: { sessionId: 'task-A', runs: [{ runId: 'live', status: 'running', spentTokens: 0 } as RunRecord], error: '', loading: false, refresh: vi.fn() } })
    expect(view.button('展开任务摘要').textContent).toContain('1 个工作流运行中')
    expect(document.querySelector('.mira-task-summary__header > span')?.textContent).toBe('工作流运行中')
  })
  it('does not render a zero Goal request when only live agents need a summary', async () => {
    const view = await mount({ changes: 0, goalController: {} as NonNullable<Props['goalController']>, goalDetailsRequest: 0, subtasks: [agent()] })
    await view.click('展开任务摘要')
    const body = document.querySelector('.mira-task-summary__body')!
    expect([...body.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent)).not.toContain('0')
    expect(body.textContent).toContain('智能体')
    expect(body.querySelector('[aria-label="目标"]')).toBeNull()
  })
  it('does not render a numeric false environment from a non-Git project', async () => {
    const view = await mount({ changes: 0, environment: 0, subtasks: [agent()] })
    await view.click('展开任务摘要')
    const body = document.querySelector('.mira-task-summary__body')!
    expect([...body.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent)).not.toContain('0')
    expect(body.textContent).toContain('智能体')
    expect(body.textContent).not.toContain('环境')
  })
  it('keeps a three-step focus window for long todos and exposes all hidden steps by keyboard preview', async () => {
    const activities = Array.from({ length: 9 }, (_, index) => ({ id: `step-${index}`, kind: 'plan' as const, label: `步骤 ${index + 1}`, status: index < 3 ? 'completed' as const : index === 3 ? 'running' as const : 'pending' as const, startedAt: 1 }))
    const view = await mount({ activities })
    await view.click('展开任务摘要')
    const visible = () => [...document.querySelectorAll('.mira-summary-todos > li[data-status]')].map(item => item.textContent)
    expect(visible()).toEqual(['步骤 4', '步骤 5', '步骤 6'])
    const preview = (group: string) => document.querySelector<HTMLButtonElement>(`[data-mira-todo-preview-trigger="${group}"]`)!
    expect(preview('before').textContent).toContain('已完成 3 项')
    expect(preview('after').textContent).toContain('待完成 3 项')
    await act(async () => { preview('before').focus(); preview('before').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }); await view.settle()
    const content = document.querySelector('[data-mira-todo-preview="before"]')!
    expect(content.textContent).toContain('步骤 1'); expect(content.textContent).toContain('步骤 3')
    const scrollArea = content.querySelector('ol')!
    expect((content as HTMLElement).tabIndex).toBe(0)
    await act(async () => (content as HTMLElement).focus()); await view.settle()
    expect(document.querySelector('[data-mira-todo-preview="before"]')).toBe(content)
    Object.defineProperty(scrollArea, 'clientHeight', { value: 80 })
    Object.defineProperty(scrollArea, 'scrollHeight', { value: 240 })
    await act(async () => content.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true })))
    expect(scrollArea.scrollTop).toBe(80)
    await act(async () => content.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
    expect(scrollArea.scrollTop).toBe(240)
    await act(async () => content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await view.settle()
    expect(document.querySelector('[data-mira-todo-preview]')).toBeNull()
    expect(document.activeElement).toBe(preview('before'))
    activities.forEach((item, index) => { item.status = index < 8 ? 'completed' : 'running' })
    await view.render(); expect(visible()).toEqual(['步骤 7', '步骤 8', '步骤 9'])
    activities[8].status = 'completed'
    await view.render(); expect(visible()).toEqual(['步骤 7', '步骤 8', '步骤 9'])
  })

  it('shows all six short todos and closes an obsolete preview when progress changes', async () => {
    const activities = Array.from({ length: 7 }, (_, index) => ({ id: `step-${index}`, kind: 'plan' as const, label: `步骤 ${index + 1}`, status: 'pending' as const, startedAt: 1 }))
    const view = await mount({ activities }); await view.click('展开任务摘要')
    const trigger = document.querySelector<HTMLButtonElement>('[data-mira-todo-preview-trigger="after"]')!
    await act(async () => { trigger.focus(); trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }); await view.settle()
    expect(document.querySelector('[data-mira-todo-preview]')).not.toBeNull()
    view.props.activities = activities.slice(0, 6)
    await view.render()
    expect(document.querySelectorAll('.mira-summary-todos > li[data-status]')).toHaveLength(6)
    expect(document.querySelector('[data-mira-todo-preview-trigger]')).toBeNull()
    expect(document.querySelector('[data-mira-todo-preview]')).toBeNull()
  })

  it('starts automatic, expands explicitly, minimizes, and retains the mode across keyed session changes', async () => {
    const view = await mount()
    expect(view.mode()).toBe('auto')
    await view.click('展开任务摘要'); expect(view.mode()).toBe('panel')
    await view.switchSession('B'); expect(view.mode()).toBe('panel')
    await view.click('收起任务摘要'); expect(view.mode()).toBe('mini')
    await view.switchSession('A'); expect(view.mode()).toBe('mini')
    await view.externalMode('auto'); expect(view.mode()).toBe('auto')
    expect(view.changed.mock.calls.map(call => call[0])).toEqual(['panel', 'mini'])
  })

  it('resets the in-memory choice when the application host mounts again', async () => {
    const view = await mount(); await view.click('展开任务摘要')
    await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren()
    const reopened = await mount(); expect(reopened.mode()).toBe('auto')
  })

  it('moves keyboard focus between the capsule and minimize button without stealing external focus', async () => {
    const view = await mount()
    await view.click('展开任务摘要'); expect(document.activeElement).toBe(view.button('收起任务摘要'))
    await view.click('收起任务摘要'); expect(document.activeElement).toBe(view.button('展开任务摘要'))
    view.button('其他目的地').focus()
    await view.click('展开任务摘要', false); expect(document.activeElement).toBe(view.button('其他目的地'))
    await view.externalMode('mini'); expect(document.activeElement).toBe(view.button('其他目的地'))
  })

  it('makes the constrained summary body a keyboard destination without changing its mode or stealing Composer focus', async () => {
    const view = await mount()
    const outside = view.button('其他目的地'); outside.focus()
    await view.click('展开任务摘要', false)
    const body = document.querySelector<HTMLElement>('[role="region"][aria-label="任务摘要内容"]')!
    expect(body.tabIndex).toBe(0); expect(document.activeElement).toBe(outside)
    await act(async () => body.focus())
    expect(document.activeElement).toBe(body); expect(view.mode()).toBe('panel')
    await view.click('收起任务摘要'); expect(document.activeElement).toBe(view.button('展开任务摘要'))
  })

  it('returns hidden summary focus to its capsule on a space change, without changing mode or stealing an external destination', async () => {
    let callback!: ResizeObserverCallback
    const disconnect = vi.fn(), observe = vi.fn()
    vi.stubGlobal('ResizeObserver', class { constructor(next: ResizeObserverCallback) { callback = next }; observe = observe; disconnect = disconnect })
    const original = Element.prototype.closest
    vi.spyOn(Element.prototype, 'closest').mockImplementation(function (this: Element, selector: string) { return selector === '.mira-summary-positioner' ? document.body : original.call(this, selector) })
    try {
      const view = await mount(); await view.click('展开任务摘要')
      const body = document.querySelector<HTMLElement>('[aria-label="任务摘要内容"]')!
      const panel = document.querySelector<HTMLElement>('.mira-task-summary__panel')!
      body.focus(); panel.style.display = 'none'
      await act(async () => callback([], {} as ResizeObserver))
      expect(document.activeElement).toBe(view.button('展开任务摘要')); expect(view.mode()).toBe('panel')
      view.button('其他目的地').focus(); await act(async () => callback([], {} as ResizeObserver))
      expect(document.activeElement).toBe(view.button('其他目的地'))
      await act(async () => root!.unmount()); root = undefined
      expect(disconnect).toHaveBeenCalled()
    } finally { vi.restoreAllMocks() }
  })

  it('returns automatic display from the menu to the visible capsule when the panel is hidden', async () => {
    const view = await mount(); await view.click('展开任务摘要'); await view.openMenu()
    const choices = document.querySelectorAll('[role="menuitemradio"]')
    expect(choices).toHaveLength(1); expect(choices[0].textContent).toBe('自动')
    await act(async () => (choices[0] as HTMLElement).click()); await view.settle()
    expect(view.mode()).toBe('auto'); expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(view.button('展开任务摘要'))
  })

  it('keeps a new focus destination selected before automatic-mode menu cleanup', async () => {
    const view = await mount(); await view.click('展开任务摘要'); await view.openMenu()
    await act(async () => (document.querySelector('[role="menuitemradio"]') as HTMLElement).click())
    view.button('其他目的地').focus(); await view.settle()
    expect(view.mode()).toBe('auto'); expect(document.activeElement).toBe(view.button('其他目的地'))
  })

  it('closes only the nested mode menu on Escape and leaves the expanded summary available', async () => {
    const view = await mount(); await view.click('展开任务摘要'); await view.openMenu()
    await act(async () => document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await view.settle()
    expect(document.querySelector('[role="menu"]')).toBeNull(); expect(view.mode()).toBe('panel')
    expect(document.activeElement).toBe(view.button('摘要显示方式'))
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(view.mode()).toBe('panel')
  })

  it('dismisses the nested menu on an outside pointer without collapsing the persistent summary', async () => {
    const view = await mount(); await view.click('展开任务摘要'); await view.openMenu()
    await act(async () => view.button('其他目的地').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))); await view.settle()
    expect(document.querySelector('[role="menu"]')).toBeNull(); expect(view.mode()).toBe('panel')
  })

  it('keeps current and pending todos ahead of generic activity and changes, then preserves the last completed step', async () => {
    const view = await mount({ activities: [{ id: 'answering', label: '正在生成回复', status: 'running', startedAt: 1 }, { id: 'todo-1', kind: 'plan', label: '读取配置', status: 'completed', startedAt: 1 }, { id: 'todo-2', kind: 'plan', label: '验证修改', status: 'pending', startedAt: 2 }] })
    expect(view.button('展开任务摘要').textContent).toContain('验证修改')
    view.props.activities[2].status = 'completed'; view.props.activities[0].status = 'completed'; view.props.running = false
    await view.render(); expect(view.button('展开任务摘要').textContent).toContain('1 个文件有变更')
    view.props.changes = 0; await view.render(); expect(view.button('展开任务摘要').textContent).toContain('验证修改')
    expect(document.querySelector('li[data-status="completed"]')?.textContent).toBe('读取配置')
  })

  it('keeps ended agents discoverable and folds the live group when all agents end', async () => {
    const view = await mount({ changes: 0, subtasks: [agent()] })
    const agents = document.querySelector<HTMLDetailsElement>('details')!
    expect(agents.open).toBe(false); expect(view.button('展开任务摘要').textContent).toContain('1 个智能体运行中')
    agents.open = true
    view.props.subtasks = [agent('completed')]; view.props.running = false; await view.render()
    expect(agents.open).toBe(false); expect(view.button('展开任务摘要').textContent).toContain('1 个智能体已结束')
    expect(agents.textContent).toContain('核对文件'); expect(agents.querySelector('button')).toBeNull()
  })

  it('keeps environment and plan disclosure independent of the agent section', async () => {
    const view = await mount({ environment: <button>main</button>, activities: [{ id: 'todo', kind: 'plan', label: '验证修改', status: 'running', startedAt: 1 }], subtasks: [agent()] })
    const sections = document.querySelectorAll<HTMLDetailsElement>('details')
    expect([...sections].map(section => section.open)).toEqual([true, true, false])
    sections[0].open = false; sections[2].open = true
    await view.render()
    expect([...sections].map(section => section.open)).toEqual([false, true, true])
    await view.switchSession('B')
    expect([...document.querySelectorAll<HTMLDetailsElement>('details')].map(section => section.open)).toEqual([true, true, false])
  })

  it('uses the real change and progress callbacks and waits for a stop request before allowing another', async () => {
    let reject!: (error: Error) => void
    const pending = new Promise<void>((_resolve, fail) => { reject = fail })
    const stop = vi.fn(() => pending), view = await mount({ subtasks: [agent()], activities: [{ id: 'activity', label: '正在检查', status: 'running', startedAt: 1 }], onStopSubtask: stop })
    await view.click('展开任务摘要')
    const resources = [...document.querySelectorAll<HTMLButtonElement>('.mira-summary-resource')]
    await act(async () => resources[0].click()); expect(view.props.onOpenChanges).toHaveBeenCalledOnce()
    await act(async () => resources[1].click()); expect(view.props.onOpenProgress).toHaveBeenCalledOnce()
    await view.click('停止智能体 核对文件'); expect(view.button('停止智能体 核对文件').disabled).toBe(true)
    await view.click('停止智能体 核对文件'); expect(stop).toHaveBeenCalledExactlyOnceWith('child')
    const failure = new Error('停止请求失败'); await act(async () => reject(failure))
    expect(view.props.onError).toHaveBeenCalledExactlyOnceWith(failure); expect(view.button('停止智能体 核对文件').disabled).toBe(false)
  })

  it('does not publish a late stop failure into a different session after its owner unmounts', async () => {
    let reject!: (error: Error) => void
    const stop = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail }))
    const view = await mount({ subtasks: [agent()], onStopSubtask: stop })
    await view.click('停止智能体 核对文件'); await view.switchSession('B')
    await act(async () => reject(new Error('上一任务停止失败')))
    expect(view.props.onError).not.toHaveBeenCalled(); expect(view.button('停止智能体 核对文件').disabled).toBe(false)
  })

  it('does not show an empty shell, but preserves an environment-only summary', async () => {
    const view = await mount({ changes: 0, running: false })
    expect(view.mode()).toBeUndefined()
    view.props.environment = <span>main</span>; await view.render()
    expect(view.button('展开任务摘要').textContent).toContain('工作环境')
  })

  it('opens completed and ambiguous agents independently without needing a tool association', async () => {
    const open = vi.fn(), view = await mount({ changes: 0, activities: [], subtasks: [agent('completed')], running: false, onOpenSubtask: open })
    await view.click('在右侧打开智能体 核对文件')
    expect(open).toHaveBeenCalledExactlyOnceWith('child')
    expect(view.props.onStopSubtask).not.toHaveBeenCalled()
    const progress = document.querySelector<HTMLButtonElement>('.mira-summary-resource')!
    expect(progress.textContent).toContain('查看本轮执行过程')
    await act(async () => progress.click())
    expect(view.props.onOpenProgress).toHaveBeenCalledOnce()
  })
})
