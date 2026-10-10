import { useState } from 'react'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowUpFromLine, ChevronDown, ChevronUp, CircleAlert, GripVertical, LoaderCircle, Paperclip, Pencil, Play, RotateCw, Trash2, Undo2 } from 'lucide-react'
import type { HarnessGuideFallbackReason, HarnessMessageQueueSnapshot, HarnessQueuedMessage } from '../../../../../src/config/harness'
import { ComposerControlHint } from './ComposerControlHint'

export interface HarnessMessageQueueProps {
  queue?: HarnessMessageQueueSnapshot
  recoveries: HarnessQueuedMessage[]
  pendingItems: string[]
  resumePending: boolean
  editDisabled: boolean
  disabled: boolean
  confirmationPending: boolean
  recoveryBlocked: boolean
  error?: string
  onEdit(id: string): Promise<void>
  onDelete(id: string): Promise<void>
  onRestore(id: string): void
  onResume(): Promise<void>
  onConfirmation(): void
  onRetrySave?(): Promise<void>
  onMove?(id: string, beforeItemId: string | null): Promise<void>
  onSendNow?(id: string): Promise<void>
  reorderPending?: boolean
  sendNowPendingItems?: string[]
}

const keepQueueDragInPanel: Modifier = ({ transform, draggingNodeRect, activeNodeRect, containerNodeRect, windowRect }) => {
  const row = draggingNodeRect ?? activeNodeRect, panel = containerNodeRect ?? windowRect
  return { ...transform, x: 0, y: row && panel ? Math.min(Math.max(transform.y, panel.top - row.top), panel.bottom - row.bottom) : transform.y }
}

const guideFallbackLabels: Record<HarnessGuideFallbackReason, string> = {
  attachments: '附件消息已排队',
  planning: '计划模式已排队',
  'model-mismatch': '不同模型已排队',
  'permission-mismatch': '权限设置已变化，已加入待发送',
  'run-unavailable': '当前任务不可引导，已排队',
  confirmation: '等待确认，已排队',
  'run-ended': '任务已结束，指导已保留',
}

function MiraQueueRow({ item, index, sortable, pending, promoting, sendNowDisabled, disabled, editDisabled, onEdit, onDelete, onSendNow }: { item: HarnessQueuedMessage; index: number; sortable?: boolean; pending: boolean; promoting: boolean; sendNowDisabled: boolean; disabled: boolean; editDisabled: boolean; onEdit: HarnessMessageQueueProps['onEdit']; onDelete: HarnessMessageQueueProps['onDelete']; onSendNow?: HarnessMessageQueueProps['onSendNow'] }) {
  const locked = disabled || pending || promoting
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !sortable || locked })
  return <li ref={setNodeRef} className={`mira-message-queue__row${isDragging ? ' mira-message-queue__row--dragging' : ''}`} data-queue-item={item.id} data-queue-promoting={promoting || undefined} style={{ transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null), transition, zIndex: isDragging ? 10 : undefined }}>
    {sortable !== undefined && <ComposerControlHint title="拖动排序"><button ref={setActivatorNodeRef} type="button" className="mira-message-queue__drag" disabled={!sortable || locked} {...attributes} {...listeners} aria-label={`排序待发送消息 ${index + 1}`}><GripVertical size={14} /></button></ComposerControlHint>}
    <span className="mira-message-queue__number">{index + 1}</span><span className="mira-message-queue__text" title={item.text}>{item.text}</span>
    {item.requestedDelivery === 'guide' && item.fallbackReason && <span className="mira-message-queue__fallback" title={guideFallbackLabels[item.fallbackReason]}>{guideFallbackLabels[item.fallbackReason]}</span>}
    {item.references.length > 0 && <span className="mira-message-queue__references" title={`${item.references.length} 个文件`}><Paperclip size={12} />{item.references.length}</span>}
    {onSendNow && <ComposerControlHint title={promoting ? '正在立即发送' : '立即发送'}><button type="button" aria-label={`立即发送待发送消息 ${index + 1}`} aria-busy={promoting || undefined} disabled={locked || sendNowDisabled} onClick={() => void onSendNow(item.id)}>{promoting ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowUpFromLine size={14} />}</button></ComposerControlHint>}
    <ComposerControlHint title={editDisabled ? '输入为空时可撤回编辑' : '撤回到输入框'}><button type="button" aria-label={`编辑待发送消息 ${index + 1}`} disabled={locked || editDisabled} onClick={() => void onEdit(item.id)}>{pending ? <LoaderCircle size={14} className="animate-spin" /> : <Pencil size={14} />}</button></ComposerControlHint>
    <ComposerControlHint title="删除待发送消息"><button type="button" aria-label={`删除待发送消息 ${index + 1}`} disabled={locked} onClick={() => void onDelete(item.id)}><Trash2 size={14} /></button></ComposerControlHint>
  </li>
}

export function HarnessMessageQueue({ queue, recoveries, pendingItems, resumePending, editDisabled, disabled, recoveryBlocked, confirmationPending, error, onEdit, onDelete, onRestore, onResume, onConfirmation, onRetrySave, onMove, onSendNow, reorderPending, sendNowPendingItems = [] }: HarnessMessageQueueProps) {
  const [expanded, setExpanded] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const items = (queue?.items ?? []).filter(item => item.delivery !== 'guide')
  if (!items.length && !recoveries.length && !error) return null
  const rows = expanded ? items : items.slice(0, 5)
  const promotionPending = Boolean(queue?.promotingItemId || sendNowPendingItems.length)
  const reorderBlocked = disabled || reorderPending || promotionPending
  function moveItem({ active, over }: DragEndEvent) {
    if (!onMove || reorderBlocked || !over || active.id === over.id || pendingItems.includes(String(active.id)) || pendingItems.includes(String(over.id))) return
    const fromIndex = items.findIndex(item => item.id === active.id), overIndex = items.findIndex(item => item.id === over.id)
    if (fromIndex < 0 || overIndex < 0) return
    const afterRemoval = items.filter(item => item.id !== active.id)
    const beforeItemId = fromIndex < overIndex ? afterRemoval[overIndex]?.id ?? null : String(over.id)
    void onMove(String(active.id), beforeItemId)
  }
  return <section className="mira-message-queue" aria-label="待发送消息">
    {items.length > 0 && <div className="mira-message-queue__heading"><span>待发送 · {items.length}</span>{items.length > 5 && <button type="button" className="mira-message-queue__expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : `展开全部 ${items.length} 条`}{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>}</div>}
    {items.length > 0 && queue?.paused && <div className="mira-message-queue__paused"><span>{confirmationPending ? '等待任务确认' : queue.paused === 'stopped' ? '已停止自动发送' : queue.paused === 'failed' ? '发送失败，列表已暂停' : '待发送列表已暂停'}</span><button type="button" disabled={disabled || resumePending || promotionPending} onClick={() => confirmationPending ? onConfirmation() : void onResume()} aria-label={confirmationPending ? '查看任务确认' : '恢复待发送'}>{resumePending ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}{confirmationPending ? '查看确认' : '恢复发送'}</button></div>}
    {(error || queue?.error) && <div className="mira-message-queue__error" role="alert"><CircleAlert size={14} /><span>{error || queue?.error}</span>{onRetrySave && <ComposerControlHint title="重试保存恢复草稿"><button type="button" aria-label="重试保存恢复草稿" disabled={disabled} onClick={() => void onRetrySave()}><RotateCw size={14} /></button></ComposerControlHint>}</div>}
    {rows.length > 0 && <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[keepQueueDragInPanel]} onDragEnd={moveItem}><SortableContext items={rows.map(item => item.id)} strategy={verticalListSortingStrategy}><ol className="mira-message-queue__list">{rows.map((item, index) => <MiraQueueRow key={item.id} item={item} index={index} sortable={onMove ? !reorderBlocked : undefined} pending={pendingItems.includes(item.id)} promoting={queue?.promotingItemId === item.id || sendNowPendingItems.includes(item.id)} sendNowDisabled={promotionPending || Boolean(reorderPending)} disabled={disabled} editDisabled={editDisabled} onEdit={onEdit} onDelete={onDelete} onSendNow={onSendNow} />)}</ol></SortableContext></DndContext>}
    {recoveries.length > 0 && <><div className="mira-message-queue__heading">待恢复草稿 · {recoveries.length}</div><ul className="mira-message-queue__list">{recoveries.map(item => <li key={item.id} className="mira-message-queue__row"><Undo2 size={14} /><span className="mira-message-queue__text" title={item.text}>{item.text}</span><ComposerControlHint title={editDisabled ? '输入为空时可恢复' : '恢复到输入框'}><button type="button" aria-label="恢复撤回的草稿" disabled={disabled || editDisabled || recoveryBlocked} onClick={() => onRestore(item.id)}><Undo2 size={14} /></button></ComposerControlHint></li>)}</ul></>}
  </section>
}
