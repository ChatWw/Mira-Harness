// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskSummary, type MiraTaskSummaryMode } from '../apps/harness-react/src/components/conversation/TaskSummary'
import type { HarnessSubtask } from '../src/config/harness'

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
