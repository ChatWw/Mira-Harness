import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationTurnRail } from '../apps/harness-react/src/components/conversation/ConversationTurnRail'
import { AssistantToolbar, MessageCopyButton, UserMessageAttachments } from '../apps/harness-react/src/components/conversation/message-parts'
import { TaskSummary } from '../apps/harness-react/src/components/conversation/TaskSummary'
import { TaskInteraction } from '../apps/harness-react/src/components/interactions/TaskInteraction'
import type { HarnessPendingInteraction, HarnessPlan } from '../src/config/harness'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => value !== slot.deps![index])) { slot.value = factory(); slot.deps = deps }
    return slot.value
  },
  useCallback: (callback: unknown, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => value !== slot.deps![index])) { slot.value = callback; slot.deps = deps }
    return slot.value
  },
  useLayoutEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => value !== slot.deps![index])) {
      slot.deps = deps
      hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
    }
  },
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => value !== slot.deps![index])) {
      slot.deps = deps
      hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
    }
  },
}))
// Callback-only fixture; real scrolling and virtual mounting are covered by the DOM rail suite.
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (index: number) => string }) => ({
  getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: getItemKey(index), start: index * 10 })),
  getTotalSize: () => count * 10,
  scrollToIndex: () => undefined,
}) }))

function mount(renderComponent: () => React.ReactNode) {
  let tree: React.ReactNode
  const visit = (node: React.ReactNode, callback: (props: Record<string, unknown>) => void) => {
    if (Array.isArray(node)) return node.forEach(child => visit(child, callback))
    if (!React.isValidElement<Record<string, unknown>>(node)) return
    callback(node.props)
    visit(node.props.children as React.ReactNode, callback)
  }
  const render = () => { hooks.cursor = 0; tree = renderComponent(); hooks.effects.splice(0).forEach(effect => effect()) }
  const find = (match: (props: Record<string, unknown>) => boolean) => {
    let found: Record<string, unknown> | undefined
    visit(tree, props => { if (!found && match(props)) found = props })
    if (!found) throw new Error('Conversation control not found')
    return found
  }
  render()
  return { render, find, getTree: () => tree }
}

beforeEach(() => {
  hooks.cursor = 0; hooks.slots = []; hooks.effects = []
  vi.stubGlobal('React', React)
  vi.stubGlobal('document', { getElementById: () => null })
  vi.stubGlobal('window', { setTimeout, matchMedia: () => ({ matches: true }) })
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => undefined) } })
})
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Mira clarification card', () => {
  const questions: Extract<HarnessPendingInteraction, { kind: 'question' }> = { id: 'mira-question', kind: 'question', status: 'waiting', createdAt: 1, questions: [
    { id: 'scope', question: '选择范围', options: [{ label: '资料' }, { label: '代码' }], multiSelect: true },
    { id: 'detail', question: '补充说明', allowCustom: true },
  ] }
  function fixture(onAnswer = vi.fn(async () => undefined), interaction = questions) {
    let selectionReady = true
    const view = mount(() => {
      const element = TaskInteraction({ interaction, selectionReady, onAnswer, onConfirm: async () => undefined, onRevise: async () => undefined })
      return (element.type as (props: any) => React.ReactNode)(element.props)
    })
    const click = (name: string) => { (view.find(props => props.children === name).onClick as () => void)(); view.render() }
    const text = (question: string, value: string) => { (view.find(props => props['aria-label'] === `${question}的自定义回答`).onChange as (event: any) => void)({ target: { value } }); view.render() }
    const key = (key: string, target: object, extra = {}) => {
      const event = { key, target, nativeEvent: {}, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra }
      ;(view.find(props => props['aria-label'] === '澄清问题').onKeyDown as (event: any) => void)(event); view.render(); return event
    }
    return { view, click, text, key, onAnswer, unavailable: () => { selectionReady = false; view.render() } }
  }
  it('preserves multi-select and custom drafts when advancing, returning and retrying a rejected submission', async () => {
    const onAnswer = vi.fn(async () => undefined).mockRejectedValueOnce(new Error('连接失败'))
    const card = fixture(onAnswer)
    const option = card.view.find(props => props.type === 'checkbox' && !props.checked)
    ;(option.onChange as () => void)(); card.view.render()
    card.text('选择范围', '保留补充'); card.click('下一题'); card.text('补充说明', '第二题回答')
    card.click('上一题')
    expect(card.view.find(props => props.type === 'checkbox' && props.checked).name).toBe('mira-question:scope')
    expect(card.view.find(props => props['aria-label'] === '选择范围的自定义回答').value).toBe('保留补充')
    card.click('下一题'); card.click('提交回答'); await Promise.resolve(); await Promise.resolve(); card.view.render()
    expect(card.view.find(props => props.role === 'alert').children).toContain('回答已保留，请重试')
    expect(card.view.find(props => props['aria-label'] === '补充说明的自定义回答').value).toBe('第二题回答')
    card.click('重试提交'); await Promise.resolve(); card.view.render()
    expect(onAnswer).toHaveBeenCalledTimes(2)
    expect(onAnswer).toHaveBeenLastCalledWith([{ id: 'scope', selected: ['资料'], custom: '保留补充' }, { id: 'detail', selected: [], custom: '第二题回答' }])
  })
  it('locks answers and guards two immediate submit events until the request settles', async () => {
    let finish!: () => void
    const onAnswer = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const card = fixture(onAnswer)
    card.text('选择范围', '范围'); card.click('下一题'); card.text('补充说明', '说明')
    const submit = card.view.find(props => props.children === '提交回答').onClick as () => void
    submit(); submit(); card.view.render()
    expect(onAnswer).toHaveBeenCalledOnce()
    expect(card.view.find(props => props['aria-label'] === '澄清问题')['aria-busy']).toBe(true)
    expect(card.view.find(props => props.className === 'pilot-question').disabled).toBe(true)
    card.text('补充说明', '迟到编辑')
    expect(card.view.find(props => props['aria-label'] === '补充说明的自定义回答').value).toBe('说明')
    finish(); await Promise.resolve(); card.view.render()
    expect(card.view.find(props => props['aria-label'] === '澄清问题')['aria-busy']).toBe(false)
  })
  it('uses Enter to advance and Escape to return without dropping drafts or submitting', () => {
    const card = fixture()
    card.text('选择范围', '保留范围')
    const enter = card.key('Enter', { tagName: 'TEXTAREA' })
    expect(enter.preventDefault).toHaveBeenCalledOnce()
    card.text('补充说明', '保留说明')
    const escape = card.key('Escape', { tagName: 'TEXTAREA' })
    expect(escape.stopPropagation).toHaveBeenCalledOnce()
    expect(card.view.find(props => props['aria-label'] === '选择范围的自定义回答').value).toBe('保留范围')
    card.click('下一题')
    expect(card.view.find(props => props['aria-label'] === '补充说明的自定义回答').value).toBe('保留说明')
    expect(card.onAnswer).not.toHaveBeenCalled()
  })
  it.each([{ nativeEvent: { isComposing: true } }, { keyCode: 229 }, { shiftKey: true }, { altKey: true }])('preserves composition or newline/modifier keys: %j', extra => {
    const card = fixture(); card.text('选择范围', '范围')
    const event = card.key('Enter', { tagName: 'TEXTAREA' }, extra)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(card.view.find(props => props['aria-label'] === '选择范围的自定义回答')).toBeDefined()
    expect(card.onAnswer).not.toHaveBeenCalled()
  })
  it('selects a focused radio with Enter but does not submit or auto-select on arrow navigation', () => {
    const card = fixture(undefined, { ...questions, questions: [{ id: 'scope', question: '选择范围', options: [{ label: '资料' }] }] })
    const radio = { tagName: 'INPUT', type: 'radio', click: vi.fn(), focus: vi.fn() }, other = { focus: vi.fn() }
    const ref = card.view.find(props => props['aria-label'] === '澄清问题').ref as { current: unknown }
    ref.current = { querySelectorAll: () => [radio, other] }
    card.key('Enter', radio); expect(radio.click).toHaveBeenCalledOnce()
    card.key('ArrowDown', radio); expect(other.focus).toHaveBeenCalledWith()
    expect(card.onAnswer).not.toHaveBeenCalled()
  })
  it('keeps navigation buttons native and prevents submission when model selection is unavailable', () => {
    const card = fixture(); card.text('选择范围', '范围'); card.click('下一题'); card.text('补充说明', '说明')
    expect(card.key('Enter', { tagName: 'BUTTON' }).preventDefault).not.toHaveBeenCalled()
    card.unavailable(); card.key('Enter', { tagName: 'TEXTAREA' }, { metaKey: true })
    expect(card.view.find(props => props.children === '提交回答').disabled).toBe(true)
    expect(card.onAnswer).not.toHaveBeenCalled()
  })

  it('resets only the question body on navigation and lets focus reveal the next question input', () => {
    const card = fixture(), body = { scrollTop: 240 }, focus = vi.fn()
    const bodyRef = card.view.find(props => props['aria-label'] === '问题内容').ref as { current: unknown }
    const cardRef = card.view.find(props => props['aria-label'] === '澄清问题').ref as { current: unknown }
    bodyRef.current = body; cardRef.current = { querySelector: () => ({ focus }) }
    card.click('下一题')
    expect(body.scrollTop).toBe(0)
    expect(focus).toHaveBeenCalledExactlyOnceWith()
    expect(card.onAnswer).not.toHaveBeenCalled()
  })
})

describe('Mira plan review card', () => {
  const interaction: HarnessPendingInteraction = { id: 'mira-review', kind: 'plan-review', status: 'waiting', planId: 'mira-plan', createdAt: 1 }
  const plan: HarnessPlan = { id: 'mira-plan', status: 'awaiting_confirmation', request: '整理资料', understanding: '先审阅范围', steps: [{ label: '核对资料' }], risks: [], createdAt: 1, updatedAt: 1 }
  function fixture(options: Partial<Parameters<typeof TaskInteraction>[0]> = {}) {
    const props = { interaction, plan, selectionReady: true, onConfirm: vi.fn(async () => undefined), onRevise: vi.fn(async () => undefined), onAnswer: vi.fn(async () => undefined), onCancel: vi.fn(async () => undefined), ...options }
    const view = mount(() => TaskInteraction(props))
    const click = (name: string) => { (view.find(item => item.children === name).onClick as () => void)(); view.render() }
    const text = (value: string) => { (view.find(item => item['aria-label'] === '计划修改要求').onChange as (event: any) => void)({ target: { value } }); view.render() }
    return { view, click, text, props }
  }
  it('keeps the review and error local when confirmation fails, and allows explicit retry', async () => {
    const onConfirm = vi.fn(async () => undefined).mockRejectedValueOnce(new Error('确认失败'))
    const card = fixture({ onConfirm })
    card.click('确认并执行'); await Promise.resolve(); await Promise.resolve(); card.view.render()
    expect(card.view.find(props => props.role === 'alert').children).toContain('确认失败')
    card.click('确认并执行'); await Promise.resolve(); card.view.render()
    expect(onConfirm).toHaveBeenCalledTimes(2)
    expect(card.props.onRevise).not.toHaveBeenCalled()
  })
  it('locks an in-flight revision, rejects immediate duplicate actions and retains text for retry', async () => {
    let fail!: (error: Error) => void
    const onRevise = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = reject }))
    const card = fixture({ onRevise }); card.click('要求修改'); card.text('  保留范围  ')
    const submit = card.view.find(props => props.children === '提交修改要求').onClick as () => void
    submit(); submit(); card.view.render()
    expect(onRevise).toHaveBeenCalledExactlyOnceWith('保留范围')
    expect(card.view.find(props => props['aria-label'] === '计划修改要求').disabled).toBe(true)
    expect(card.view.find(props => props['aria-label'] === '计划确认')['aria-busy']).toBe(true)
    card.text('迟到输入'); expect(card.view.find(props => props['aria-label'] === '计划修改要求').value).toBe('  保留范围  ')
    fail(new Error('修改未接纳')); await Promise.resolve(); await Promise.resolve(); card.view.render()
    expect(card.view.find(props => props.role === 'alert').children).toContain('修改未接纳')
    expect(card.view.find(props => props['aria-label'] === '计划修改要求').value).toBe('  保留范围  ')
    expect(card.view.find(props => props.children === '提交修改要求').disabled).toBe(false)
    expect(card.props.onConfirm).not.toHaveBeenCalled()
  })
  it('never confirms a missing or mismatched plan, or pretends an unavailable cancel handler works', () => {
    const card = fixture({ plan: { ...plan, id: 'other-plan' }, onCancel: undefined })
    expect(card.view.find(props => props.children === '确认并执行').disabled).toBe(true)
    expect(card.view.find(props => props.children === '取消方案').disabled).toBe(true)
    card.click('确认并执行'); expect(card.props.onConfirm).not.toHaveBeenCalled()
  })
  it('focuses a newly opened revision editor and preserves its draft across collapse', () => {
    const card = fixture(); card.click('要求修改')
    const textarea = card.view.find(props => props['aria-label'] === '计划修改要求')
    const ref = textarea.ref as { current: unknown }, focus = vi.fn(); ref.current = { focus }
    card.text('保留修改'); card.click('收起修改'); card.click('要求修改')
    expect(focus).toHaveBeenCalledWith()
    expect(card.view.find(props => props['aria-label'] === '计划修改要求').value).toBe('保留修改')
    expect(card.props.onRevise).not.toHaveBeenCalled(); expect(card.props.onConfirm).not.toHaveBeenCalled()
  })
})

describe('Mira conversation real component callbacks', () => {
  it('previews actual turn text and requests the selected message through mounted-first navigation', () => {
    const navigate = vi.fn()
    let activeId = 'u1'
    const messages = [{ id: 'u1', role: 'user' as const, content: '第一个问题', createdAt: 1 }, { id: 'a1', role: 'assistant' as const, content: '第一轮回复', createdAt: 2 }, { id: 'u2', role: 'user' as const, content: '第二个问题', createdAt: 3 }]
    const view = mount(() => ConversationTurnRail({ messages, activeId, onNavigate: navigate }))
    view.render()
    expect(view.find(props => props['data-turn-id'] === 'u1')['aria-current']).toBe('location')
    ;(view.find(props => props['data-turn-id'] === 'u1').onPointerEnter as () => void)()
    view.render()
    expect(view.find(props => props.children === '第一个问题')).toBeDefined()
    expect(view.find(props => props.children === '第一轮回复')).toBeDefined()
    ;(view.find(props => props['data-turn-id'] === 'u2').onClick as () => void)()
    expect(navigate).toHaveBeenCalledExactlyOnceWith('u2')
    activeId = 'u2'; view.render()
    expect(view.find(props => props['data-turn-id'] === 'u2')['aria-current']).toBe('location')
  })

  it('exposes accepted guides as query anchors while their execution remains in the original turn', () => {
    const navigate = vi.fn()
    let activeId = 'u1'
    const messages = [
      { id: 'u1', role: 'user' as const, content: '原任务', createdAt: 1 },
      { id: 'a1', role: 'assistant' as const, content: '正在执行', runId: 'run', createdAt: 2 },
      { id: 'guide', role: 'user' as const, content: '补充要求', delivery: 'guide' as const, runId: 'run', createdAt: 3 },
      { id: 'a2', role: 'assistant' as const, content: '继续执行', runId: 'run', createdAt: 4 },
      { id: 'u2', role: 'user' as const, content: '下一轮', createdAt: 5 },
    ]
    const view = mount(() => ConversationTurnRail({ messages, activeId, onNavigate: navigate }))
    view.render()
    expect(view.find(props => props['data-turn-id'] === 'u1')['aria-current']).toBe('location')
    ;(view.find(props => props['data-turn-id'] === 'guide').onClick as () => void)()
    expect(navigate).toHaveBeenCalledExactlyOnceWith('guide')
    activeId = 'guide'; view.render()
    expect(view.find(props => props['data-turn-id'] === 'guide')['aria-current']).toBe('location')
    expect(view.find(props => props['data-turn-id'] === 'u2')['aria-current']).toBeUndefined()
    activeId = 'u2'; view.render()
    expect(view.find(props => props['data-turn-id'] === 'u2')['aria-current']).toBe('location')
    activeId = 'u1'; view.render()
    expect(view.find(props => props['data-turn-id'] === 'u1')['aria-current']).toBe('location')
  })

  it('copies the chosen text and exposes success feedback only after clipboard completion', async () => {
    let complete!: () => void
    vi.mocked(navigator.clipboard.writeText).mockImplementation(() => new Promise<void>(resolve => { complete = resolve }))
    const error = vi.fn()
    const view = mount(() => MessageCopyButton({ content: '当前回复', onError: error }))
    ;(view.find(props => props['aria-label'] === '复制回复').onClick as () => void)()
    view.render()
    expect(view.find(props => props['aria-label'] === '复制回复')).toBeDefined()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('当前回复')
    complete(); await Promise.resolve(); view.render()
    expect(view.find(props => props['aria-label'] === '已复制')).toBeDefined()
    expect(error).not.toHaveBeenCalled()
  })

  it('routes the actual saved attachment path into the file preview callback', () => {
    const open = vi.fn()
    const view = mount(() => UserMessageAttachments({ message: { id: 'u', role: 'user', content: '问题', createdAt: 1, attachments: [{ path: 'docs/报告.md', name: '报告.md', content: 'body' }] }, onOpen: open }))
    ;(view.find(props => props.title === 'docs/报告.md').onClick as () => void)()
    expect(open).toHaveBeenCalledWith('docs/报告.md')
  })

  it('does not send external attachment paths through the workspace-only preview bridge', () => {
    const open = vi.fn()
    const view = mount(() => UserMessageAttachments({ message: { id: 'u', role: 'user', content: '问题', createdAt: 1, attachments: [{ path: '/private/tmp/report.md', name: 'report.md', content: 'body' }] }, onOpen: open }))
    const item = view.find(props => props.disabled === true)
    ;(item.onClick as () => void)()
    expect(open).not.toHaveBeenCalled()
  })

  it('offers rerun only on the latest reply and does not admit a disabled pending-confirmation action', () => {
    const rerun = vi.fn(async () => undefined)
    let id = 'old', canRerun = true
    const view = mount(() => AssistantToolbar({ message: { id, role: 'assistant', content: '回复', createdAt: 1 }, latestAssistantId: 'latest', onRerun: rerun, canRerun }))
    expect(() => view.find(props => props['aria-label'] === '重新生成最新回复')).toThrow('control not found')
    id = 'latest'; canRerun = false; view.render()
    const disabled = view.find(props => props['aria-label'] === '重新生成最新回复')
    expect(disabled.disabled).toBe(true)
    ;(disabled.onClick as () => void)()
    expect(rerun).not.toHaveBeenCalled()
    canRerun = true; view.render()
    ;(view.find(props => props['aria-label'] === '重新生成最新回复').onClick as () => void)()
    expect(rerun).toHaveBeenCalledOnce()
  })

  it('does not render an empty summary merely because a conversation exists', () => {
    const view = mount(() => TaskSummary({ taskState: '等待下一步', taskTone: 'idle', running: false, activities: [], subtasks: [], changes: 0, onOpenChanges: vi.fn(), onOpenProgress: vi.fn(), onReviewPlan: vi.fn(), onStopSubtask: vi.fn(), onError: vi.fn() }))
    expect(view.getTree()).toBeNull()
  })

  it('expands the real capsule and opens changes through its existing action', () => {
    const open = vi.fn()
    const view = mount(() => TaskSummary({ taskState: '已完成', taskTone: 'completed', running: false, activities: [], subtasks: [], changes: 2, onOpenChanges: open, onOpenProgress: vi.fn(), onReviewPlan: vi.fn(), onStopSubtask: vi.fn(), onError: vi.fn() }))
    ;(view.find(props => props['aria-label'] === '展开任务摘要').onClick as () => void)(); view.render()
    expect(view.find(props => props['aria-label'] === '任务摘要')['data-mode']).toBe('panel')
    ;(view.find(props => props.className === 'mira-summary-resource').onClick as () => void)()
    expect(open).toHaveBeenCalledOnce()
  })

  it('renders actual execution todos even without a confirmation plan', () => {
    const review = vi.fn()
    const view = mount(() => TaskSummary({ taskState: '执行中', taskTone: 'running', running: true, activities: [{ id: 'todo-1', kind: 'plan', label: '读取配置', status: 'completed', startedAt: 1 }, { id: 'todo-2', kind: 'plan', label: '检查设置', status: 'running', startedAt: 2 }], subtasks: [], changes: 0, onOpenChanges: vi.fn(), onOpenProgress: vi.fn(), onReviewPlan: review, onStopSubtask: vi.fn(), onError: vi.fn() }))
    expect(view.find(props => props.children === '待办')).toBeDefined()
    expect(view.find(props => props.children === '1/2 已完成')).toBeDefined()
    // This callback fixture stops at component boundaries; actual todo rows and
    // keyboard previews are exercised by harnessReactTaskSummary's DOM fixture.
    expect(view.find(props => Array.isArray(props.items)).items).toEqual([
      expect.objectContaining({ id: 'todo-1', status: 'completed' }),
      expect.objectContaining({ id: 'todo-2', status: 'running' }),
    ])
    expect(() => view.find(props => props.className === 'mira-summary-plan')).toThrow('control not found')
    expect(review).not.toHaveBeenCalled()
  })

  it('prioritizes the current todo over a generic answering activity in the capsule', () => {
    const view = mount(() => TaskSummary({ taskState: '执行中', taskTone: 'running', running: true, activities: [{ id: 'answering', label: '正在生成回复', status: 'running', startedAt: 1 }, { id: 'todo', kind: 'plan', label: '验证修改', status: 'running', startedAt: 2 }], subtasks: [], changes: 0, onOpenChanges: vi.fn(), onOpenProgress: vi.fn(), onReviewPlan: vi.fn(), onStopSubtask: vi.fn(), onError: vi.fn() }))
    const mini = view.find(props => props['aria-label'] === '展开任务摘要')
    const children = React.Children.toArray(mini.children as React.ReactNode)
    expect(children.some(child => React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === 'strong' && child.props.children === '验证修改')).toBe(true)
  })
})
