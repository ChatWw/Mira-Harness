import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessMessageQueue, type HarnessMessageQueueProps } from '../apps/harness-react/src/components/composer/HarnessMessageQueue'
import type { HarnessQueuedMessage } from '../src/config/harness'
import { DndContext } from '@dnd-kit/core'

const hooks = vi.hoisted(() => ({ expanded: false }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: () => [hooks.expanded, (value: boolean | ((value: boolean) => boolean)) => { hooks.expanded = typeof value === 'function' ? value(hooks.expanded) : value }] }))
vi.mock('@dnd-kit/core', async original => ({ ...await original<typeof import('@dnd-kit/core')>(), useSensor: (sensor: unknown, options: unknown) => ({ sensor, options }), useSensors: (...sensors: unknown[]) => sensors }))
vi.mock('@dnd-kit/sortable', async original => ({ ...await original<typeof import('@dnd-kit/sortable')>(), useSortable: () => ({ attributes: {}, listeners: {}, setActivatorNodeRef: vi.fn(), setNodeRef: vi.fn(), transform: null, transition: undefined, isDragging: false }) }))
beforeEach(() => { hooks.expanded = false; vi.stubGlobal('React', React) })
afterEach(() => vi.unstubAllGlobals())
const item = (index: number): HarnessQueuedMessage => ({ id: `item-${index}`, submissionId: `submission-${index}`, sessionId: 'session', text: `等待处理 ${index}`, references: [], selection: { providerId: 'provider', modelId: 'model' }, planning: false, permissionMode: 'default', createdAt: index })

function mount(count = 7) {
  const props: HarnessMessageQueueProps = { queue: { sessionId: 'session', revision: 1, items: Array.from({ length: count }, (_, index) => item(index)) }, recoveries: [], pendingItems: [], resumePending: false, editDisabled: false, disabled: false, recoveryBlocked: false, confirmationPending: false, onEdit: vi.fn(async () => undefined), onDelete: vi.fn(async () => undefined), onRestore: vi.fn(), onResume: vi.fn(async () => undefined), onConfirmation: vi.fn() }
  let tree: React.ReactNode
  const visit = (node: React.ReactNode, callback: (element: React.ReactElement<Record<string, unknown>>) => void) => {
    if (Array.isArray(node)) return node.forEach(child => visit(child, callback))
    if (!React.isValidElement<Record<string, unknown>>(node)) return
    if (typeof node.type === 'function' && node.type.name === 'MiraQueueRow') return visit((node.type as (props: unknown) => React.ReactNode)(node.props), callback)
    callback(node); visit(node.props.children as React.ReactNode, callback)
  }
  const nodes = (match: (props: Record<string, unknown>, type: unknown) => boolean) => { const found: Record<string, unknown>[] = []; visit(tree, element => { if (match(element.props, element.type)) found.push(element.props) }); return found }
  const button = (label: string) => nodes(props => props['aria-label'] === label)[0]
  const render = () => { tree = HarnessMessageQueue(props) }
  render()
  return { props, render, button, nodes, tree: () => tree }
}

describe('Mira queue panel controls', () => {
  it('keeps pending guides out of the future queue without deleting or reordering authoritative items', () => {
    const view = mount(2)
    const guide = { ...item(9), delivery: 'guide' as const, targetRunId: 'running' }
    view.props.queue!.items.splice(1, 0, guide); view.render()
    expect(view.nodes(props => Boolean(props['data-queue-item'])).map(props => props['data-queue-item'])).toEqual(['item-0', 'item-1'])
    expect(view.props.queue!.items.map(item => item.id)).toEqual(['item-0', 'item-9', 'item-1'])
    view.props.queue!.items = [guide]; view.render(); expect(view.tree()).toBeNull()
  })

  it.each(['stopped', 'failed'] as const)('shows the real guide fallback after %s with full input and ordinary recovery actions', pause => {
    const view = mount(1)
    view.props.queue!.items = [{ ...item(0), text: '未消费指导'.repeat(120), references: [{ path: 'notes.md', name: 'notes.md' }], planning: true, selection: { providerId: 'p', modelId: 'm', thinkingLevel: 'high' }, requestedDelivery: 'guide', fallbackReason: 'run-ended' }]
    view.props.queue!.paused = pause; view.props.onSendNow = vi.fn(async () => undefined); view.props.onMove = vi.fn(async () => undefined); view.render()
    expect(view.nodes(props => props.className === 'mira-message-queue__fallback')[0].children).toBe('任务已结束，指导已保留')
    expect(view.button('恢复待发送')).toBeDefined(); expect(view.button('立即发送待发送消息 1')).toBeDefined(); expect(view.button('编辑待发送消息 1')).toBeDefined()
    expect(view.props.queue!.items[0].references).toEqual([{ path: 'notes.md', name: 'notes.md' }]); expect(view.props.queue!.items[0].planning).toBe(true)
  })

  it('shows attachment fallback as an ordinary queued message, never as waiting guide', () => {
    const view = mount(1)
    view.props.queue!.items = [{ ...item(0), references: [{ path: '资料.md', name: '资料.md' }], requestedDelivery: 'guide', fallbackReason: 'attachments' }]; view.render()
    expect(view.nodes(props => props.className === 'mira-message-queue__fallback')[0].children).toBe('附件消息已排队')
    expect(view.nodes(props => props.title === '1 个文件')).toHaveLength(1)
    expect(view.props.queue!.items[0].references).toEqual([{ path: '资料.md', name: '资料.md' }])
  })

  it.each([
    ['planning', '计划模式已排队'],
    ['model-mismatch', '不同模型已排队'],
    ['permission-mismatch', '权限设置已变化，已加入待发送'],
    ['run-unavailable', '当前任务不可引导，已排队'],
    ['confirmation', '等待确认，已排队'],
  ] as const)('shows the actual %s fallback without projecting it as pending guidance', (fallbackReason, label) => {
    const view = mount(1)
    view.props.queue!.items = [{ ...item(0), requestedDelivery: 'guide', fallbackReason }]; view.render()
    expect(view.nodes(props => props.className === 'mira-message-queue__fallback')[0].children).toBe(label)
    expect(view.nodes(props => props['data-queue-item'] === 'item-0')).toHaveLength(1)
  })

  it('shows five stable rows before expanding and exposes no unimplemented reorder or send-now control', () => {
    const view = mount()
    expect(view.nodes(props => Boolean(props['data-queue-item']))).toHaveLength(5)
    const toggle = view.nodes(props => props['aria-expanded'] === false)[0]
    ;(toggle.onClick as () => void)(); view.render()
    expect(view.nodes(props => Boolean(props['data-queue-item']))).toHaveLength(7)
    ;(view.button('编辑待发送消息 7').onClick as () => void)()
    ;(view.button('删除待发送消息 7').onClick as () => void)()
    expect(view.props.onEdit).toHaveBeenCalledWith('item-6')
    expect(view.props.onDelete).toHaveBeenCalledWith('item-6')
    expect(view.nodes(props => /立即发送|排序|拖拽/.test(String(props['aria-label'])))).toEqual([])
  })

  it('locks only pending rows and keeps deletion available with an occupied draft', () => {
    const view = mount(2)
    view.props.pendingItems = ['item-0']; view.props.editDisabled = true; view.render()
    expect(view.button('编辑待发送消息 1').disabled).toBe(true)
    expect(view.button('删除待发送消息 1').disabled).toBe(true)
    expect(view.button('编辑待发送消息 2').disabled).toBe(true)
    expect(view.button('删除待发送消息 2').disabled).toBe(false)
  })

  it('guides real pending confirmation and permits authority resume once confirmation is resolved', () => {
    const view = mount(1)
    view.props.queue!.paused = 'confirmation'; view.props.confirmationPending = true; view.render()
    ;(view.button('查看任务确认').onClick as () => void)()
    expect(view.props.onConfirmation).toHaveBeenCalledOnce(); expect(view.props.onResume).not.toHaveBeenCalled()
    view.props.confirmationPending = false; view.render()
    ;(view.button('恢复待发送').onClick as () => void)()
    expect(view.props.onResume).toHaveBeenCalledOnce()
    view.props.resumePending = true; view.render()
    expect(view.button('恢复待发送').disabled).toBe(true)
  })

  it('shows recoveries even with an empty queue but does not restore until saving is confirmed', () => {
    const view = mount(0)
    expect(view.tree()).toBeNull()
    view.props.recoveries = [item(1)]; view.props.recoveryBlocked = true; view.props.error = '保存失败'; view.props.onRetrySave = vi.fn(async () => undefined); view.render()
    expect(view.button('恢复撤回的草稿').disabled).toBe(true)
    ;(view.button('重试保存恢复草稿').onClick as () => void)()
    expect(view.props.onRetrySave).toHaveBeenCalledOnce()
    view.props.recoveryBlocked = false; view.render()
    ;(view.button('恢复撤回的草稿').onClick as () => void)()
    expect(view.props.onRestore).toHaveBeenCalledWith('item-1')
  })

  it('exposes authority actions only when callbacks exist and computes stable before-item anchors', () => {
    const view = mount(4)
    view.props.onMove = vi.fn(async () => undefined); view.props.onSendNow = vi.fn(async () => undefined); view.render()
    expect(view.nodes(props => /^排序待发送消息/.test(String(props['aria-label'])))).toHaveLength(4)
    ;(view.button('立即发送待发送消息 2').onClick as () => void)(); expect(view.props.onSendNow).toHaveBeenCalledWith('item-1')
    const dragEnd = view.nodes((_, type) => type === DndContext)[0].onDragEnd as (event: unknown) => void
    dragEnd({ active: { id: 'item-0' }, over: { id: 'item-2' } }); expect(view.props.onMove).toHaveBeenLastCalledWith('item-0', 'item-3')
    dragEnd({ active: { id: 'item-0' }, over: { id: 'item-3' } }); expect(view.props.onMove).toHaveBeenLastCalledWith('item-0', null)
    dragEnd({ active: { id: 'item-3' }, over: { id: 'item-0' } }); expect(view.props.onMove).toHaveBeenLastCalledWith('item-3', 'item-0')
    dragEnd({ active: { id: 'item-0' }, over: { id: 'item-0' } }); dragEnd({ active: { id: 'missing' }, over: { id: 'item-0' } }); dragEnd({ active: { id: 'item-0' }, over: null })
    expect(view.props.onMove).toHaveBeenCalledTimes(3)
    expect(view.props.queue!.items.map(item => item.id)).toEqual(['item-0', 'item-1', 'item-2', 'item-3'])
  })

  it('locks promotion controls from the authoritative snapshot but leaves other rows editable', () => {
    const view = mount(2)
    view.props.onMove = vi.fn(async () => undefined); view.props.onSendNow = vi.fn(async () => undefined); view.props.queue!.promotingItemId = 'item-0'; view.props.queue!.paused = 'stopped'; view.render()
    expect(view.button('编辑待发送消息 1').disabled).toBe(true); expect(view.button('删除待发送消息 1').disabled).toBe(true)
    expect(view.button('编辑待发送消息 2').disabled).toBe(false); expect(view.button('删除待发送消息 2').disabled).toBe(false)
    expect(view.button('立即发送待发送消息 1')['aria-busy']).toBe(true); expect(view.button('立即发送待发送消息 2').disabled).toBe(true)
    expect(view.button('排序待发送消息 2').disabled).toBe(true)
    expect(view.button('恢复待发送').disabled).toBe(true)
    const dragEnd = view.nodes((_, type) => type === DndContext)[0].onDragEnd as (event: unknown) => void
    dragEnd({ active: { id: 'item-1' }, over: { id: 'item-0' } }); expect(view.props.onMove).not.toHaveBeenCalled()
  })
})
