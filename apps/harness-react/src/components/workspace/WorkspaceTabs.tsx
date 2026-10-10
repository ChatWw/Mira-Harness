/* Tab strip interaction adapted from ZCode's side-pane tab components.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: local resource types, Radix primitives and session handlers.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { useEffect, useRef } from 'react'
import { closestCenter, DndContext, KeyboardCode, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { horizontalListSortingStrategy, sortableKeyboardCoordinates, SortableContext, useSortable } from '@dnd-kit/sortable'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Activity, Check, ChevronsDown, FileCode2, GitCompare, Globe2, Plus, TerminalSquare, Users, X } from 'lucide-react'
import { workspaceTabLabel, type WorkspaceResourceId, type WorkspaceTab, type WorkspaceTabId } from '../../state/workspace-state'

type WorkspaceTabsProps = {
  tabs: WorkspaceTab[]
  active: WorkspaceTabId
  changes: number
  recentClosedTabs: WorkspaceTab[]
  onOpen: (id: WorkspaceResourceId) => void
  onActivate: (id: WorkspaceTabId) => void
  onClose: (id: WorkspaceTabId) => void
  onCloseOthers: (id: WorkspaceTabId) => void
  onCloseAll: () => void
  onReopen: (id: WorkspaceTabId) => void
  onReorder: (dragged: WorkspaceTabId, target: WorkspaceTabId) => void
  onDismiss: () => void
}

const resourceIcons = { overview: Activity, files: FileCode2, changes: GitCompare, terminal: TerminalSquare, browser: Globe2 }
const resourceIcon = (tab: WorkspaceTab) => tab.path ? FileCode2 : tab.subtaskId ? Users : resourceIcons[tab.id as Exclude<WorkspaceResourceId, 'files'>]

export function WorkspaceTabs({ tabs, active, changes, recentClosedTabs, onOpen, onActivate, onClose, onCloseOthers, onCloseAll, onReopen, onReorder, onDismiss }: WorkspaceTabsProps) {
  const rootRef = useRef<HTMLElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: [KeyboardCode.Space], cancel: [KeyboardCode.Esc], end: [KeyboardCode.Space, KeyboardCode.Enter, KeyboardCode.Tab] } }))
  const portal = document.getElementById('root')
  useEffect(() => { rootRef.current?.querySelector('.pilot-side-tab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [active, tabs])
  const restoreFocus = (event: Event) => {
    event.preventDefault()
    // 标签可能在菜单关闭时已卸载，焦点回到相邻的选中标签或标签列表入口。
    requestAnimationFrame(() => (rootRef.current?.querySelector<HTMLButtonElement>('.pilot-side-tab.is-active .pilot-side-tab__select') || rootRef.current?.querySelector<HTMLButtonElement>('.mira-workspace-overview'))?.focus())
  }
  function finishReorder({ active: dragged, over }: DragEndEvent) {
    if (over && dragged.id !== over.id) onReorder(dragged.id as WorkspaceTabId, over.id as WorkspaceTabId)
  }
  const choices: Array<{ id: WorkspaceResourceId; icon: typeof Activity }> = [
    { id: 'overview', icon: Activity }, { id: 'files', icon: FileCode2 }, { id: 'changes', icon: GitCompare },
    { id: 'terminal', icon: TerminalSquare }, { id: 'browser', icon: Globe2 },
  ]
  return <nav ref={rootRef} className="pilot-side-tabs" aria-label="已打开的工作内容">
    <DropdownMenu.Root><DropdownMenu.Trigger type="button" className="mira-workspace-overview" title="标签页" aria-label="标签页"><ChevronsDown size={16} /></DropdownMenu.Trigger><DropdownMenu.Portal container={portal}><DropdownMenu.Content align="start" sideOffset={5} className="mira-session-menu mira-workspace-tab-menu" onCloseAutoFocus={restoreFocus}>
      <DropdownMenu.Label className="mira-session-menu__label">已打开的标签页</DropdownMenu.Label>
      {tabs.length ? tabs.map(tab => { const Icon = resourceIcon(tab); return <DropdownMenu.Item key={tab.id} className="mira-session-menu__item" title={tab.path || tab.label} onSelect={() => onActivate(tab.id)}><Icon size={14} /><span className="mira-workspace-tab-menu__title">{tab.path || tab.label}</span>{tab.id === active && <Check size={13} />}</DropdownMenu.Item> }) : <DropdownMenu.Item className="mira-session-menu__item" disabled>暂无已打开的标签页</DropdownMenu.Item>}
      <DropdownMenu.Separator className="mira-session-menu__separator" /><DropdownMenu.Label className="mira-session-menu__label">最近关闭的标签页</DropdownMenu.Label>
      {recentClosedTabs.length ? recentClosedTabs.map(tab => { const Icon = resourceIcon(tab); return <DropdownMenu.Item key={tab.id} className="mira-session-menu__item" title={tab.path || tab.label} onSelect={() => onReopen(tab.id)}><Icon size={14} /><span className="mira-workspace-tab-menu__title">{tab.path || tab.label}</span></DropdownMenu.Item> }) : <DropdownMenu.Item className="mira-session-menu__item" disabled>暂无最近关闭的标签页</DropdownMenu.Item>}
    </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishReorder} accessibility={{ screenReaderInstructions: { draggable: '按空格开始拖动标签，左右方向键调整位置，再按空格确认，Escape 取消。' } }}>
      <div className="pilot-side-tabs__list"><SortableContext items={tabs.map(tab => tab.id)} strategy={horizontalListSortingStrategy}>{tabs.map(tab => <WorkspaceResourceTab key={tab.id} tab={tab} selected={active === tab.id} changes={changes} canCloseOthers={tabs.length > 1} onActivate={onActivate} onClose={onClose} onCloseOthers={onCloseOthers} onCloseAll={onCloseAll} onRestoreFocus={restoreFocus} />)}</SortableContext></div>
    </DndContext>
    <DropdownMenu.Root><DropdownMenu.Trigger type="button" className="mira-workspace-add" title="打开工作内容" aria-label="打开工作内容"><Plus size={16} /></DropdownMenu.Trigger><DropdownMenu.Portal container={portal}><DropdownMenu.Content align="end" sideOffset={5} className="mira-session-menu">{choices.map(({ id, icon: Icon }) => <DropdownMenu.Item key={id} className="mira-session-menu__item" onSelect={() => onOpen(id)}><Icon size={15} />{workspaceTabLabel(id)}</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    <button type="button" className="pilot-side-tabs__dismiss" title="关闭工作区" aria-label="关闭工作区" onClick={onDismiss}><X size={16} /></button>
  </nav>
}

function WorkspaceResourceTab({ tab, selected, changes, canCloseOthers, onActivate, onClose, onCloseOthers, onCloseAll, onRestoreFocus }: { tab: WorkspaceTab; selected: boolean; changes: number; canCloseOthers: boolean; onActivate: WorkspaceTabsProps['onActivate']; onClose: WorkspaceTabsProps['onClose']; onCloseOthers: WorkspaceTabsProps['onCloseOthers']; onCloseAll: WorkspaceTabsProps['onCloseAll']; onRestoreFocus: (event: Event) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id })
  const Icon = resourceIcon(tab)
  return <ContextMenu.Root><ContextMenu.Trigger asChild><div ref={setNodeRef} data-workspace-tab-id={tab.id} className={`pilot-side-tab${selected ? ' is-active' : ''}${isDragging ? ' is-dragging' : ''}`} style={{ transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined, transition }} onAuxClick={event => { if (event.button === 1) { event.preventDefault(); event.stopPropagation(); onClose(tab.id) } }}>
    <button type="button" {...attributes} {...listeners} className="pilot-side-tab__select" aria-current={selected ? 'page' : undefined} title={tab.path || tab.label} onClick={event => { if (event.button === 1) { event.preventDefault(); return } onActivate(tab.id) }}><Icon size={14} /><span>{tab.label}</span>{tab.id === 'changes' && changes > 0 && <em>{changes}</em>}</button>
    <button type="button" className="pilot-side-tab__close" title={`关闭${tab.label}`} aria-label={`关闭${tab.label}`} onPointerDown={event => event.stopPropagation()} onClick={() => onClose(tab.id)}><X size={12} /></button>
  </div></ContextMenu.Trigger><ContextMenu.Portal container={document.getElementById('root')}><ContextMenu.Content className="mira-session-menu" onCloseAutoFocus={onRestoreFocus}>
    <ContextMenu.Item className="mira-session-menu__item" onSelect={() => onClose(tab.id)}>关闭当前标签</ContextMenu.Item>
    <ContextMenu.Item className="mira-session-menu__item" disabled={!canCloseOthers} onSelect={() => onCloseOthers(tab.id)}>关闭其他标签</ContextMenu.Item>
    <ContextMenu.Item className="mira-session-menu__item" onSelect={onCloseAll}>关闭所有标签</ContextMenu.Item>
  </ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>
}
