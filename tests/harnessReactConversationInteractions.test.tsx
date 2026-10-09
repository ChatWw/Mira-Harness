import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationTurnRail } from '../apps/harness-react/src/components/conversation/ConversationTurnRail'
import { AssistantToolbar, MessageCopyButton, UserMessageAttachments } from '../apps/harness-react/src/components/conversation/message-parts'
import { TaskSummary } from '../apps/harness-react/src/components/conversation/TaskSummary'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
  },
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => value !== slot.deps![index])) { slot.value = factory(); slot.deps = deps }
    return slot.value
  },
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => value !== slot.deps![index])) {
      slot.deps = deps
      hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
    }
  },
}))

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

describe('Mira conversation real component callbacks', () => {
  it('previews actual turn text on hover and scrolls to the selected user anchor, not the latest message', () => {
    const rows = [{ dataset: { userMessageId: 'u1' }, getBoundingClientRect: () => ({ top: -200 }), scrollIntoView: vi.fn() }, { dataset: { userMessageId: 'u2' }, getBoundingClientRect: () => ({ top: 400 }), scrollIntoView: vi.fn() }]
    const listeners = new Map<string, () => void>()
    const viewport = { getBoundingClientRect: () => ({ top: 0 }), querySelectorAll: () => rows, addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), removeEventListener: vi.fn() }
    const messages = [{ id: 'u1', role: 'user' as const, content: '第一个问题', createdAt: 1 }, { id: 'a1', role: 'assistant' as const, content: '第一轮回复', createdAt: 2 }, { id: 'u2', role: 'user' as const, content: '第二个问题', createdAt: 3 }]
    const view = mount(() => ConversationTurnRail({ messages, viewportRef: { current: viewport as unknown as HTMLDivElement } }))
    view.render()
    expect(view.find(props => props['data-turn-id'] === 'u1')['aria-current']).toBe('location')
    ;(view.find(props => props['data-turn-id'] === 'u1').onMouseEnter as () => void)()
    view.render()
    expect(view.find(props => props.children === '第一个问题')).toBeDefined()
    expect(view.find(props => props.children === '第一轮回复')).toBeDefined()
    ;(view.find(props => props['data-turn-id'] === 'u2').onClick as () => void)()
    expect(rows[1].scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })
    expect(rows[0].scrollIntoView).not.toHaveBeenCalled()
    rows[1].getBoundingClientRect = () => ({ top: 20 })
    listeners.get('scroll')!(); view.render()
    expect(view.find(props => props['data-turn-id'] === 'u2')['aria-current']).toBe('location')
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
    expect(view.find(props => props['data-status'] === 'running')).toBeDefined()
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
