import type { MiraFullView } from '../../lib/side-pane-full-view'
import { miraFileTreeIcon } from '../../lib/mira-file-tree-icon'
import { useEffect, useRef, useState } from 'react'
import { miraBrowserFavicon } from '../../../../../src/platform/miraBrowserMetadata'
import { closestCenter, DndContext, KeyboardCode, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { horizontalListSortingStrategy, sortableKeyboardCoordinates, SortableContext, useSortable } from '@dnd-kit/sortable'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Maximize2, Minimize2, MessageSquare, PanelRightClose, Plus, X } from 'lucide-react'
import { miraPrimaryKeyShortcuts, miraShortcutLabel } from '../../../../../src/platform/workbenchShortcuts'
import { SidebarActionHint } from '../session/SidebarCollectionSection'
import { miraWorkspaceTabPresentation } from '../../lib/mira-workspace-tab-presentation'
import { MiraWorkspaceOverview } from './MiraWorkspaceOverview'
import { isWorkspaceBrowserTab, isWorkspaceTerminalTab, type WorkspaceResourceId, type WorkspaceTab, type WorkspaceTabId } from '../../state/workspace-state'

type WorkspaceTabsProps = {
  fullView?: MiraFullView
  conversationTitle?: string
  onFullView?: () => void
  onConversation?: () => void
  tabs: WorkspaceTab[]
  active: WorkspaceTabId
  changes: number
  recentClosedTabs: WorkspaceTab[]
  onOpen: (id: WorkspaceResourceId) => void
  onNewTab?: () => void
  onActivate: (id: WorkspaceTabId) => void
  onClose: (id: WorkspaceTabId) => void
  onCloseOthers: (id: WorkspaceTabId) => void
  onCloseAll: () => void
  onReopen: (id: WorkspaceTabId) => void
  onReorder: (dragged: WorkspaceTabId, target: WorkspaceTabId) => void
  onDismiss: () => void
  onRestartTerminal?: (id: WorkspaceTabId) => void
}

export function WorkspaceTabs({ fullView, conversationTitle, onFullView, onConversation, tabs, active, changes, recentClosedTabs, onNewTab, onActivate, onClose, onCloseOthers, onCloseAll, onReopen, onReorder, onDismiss, onRestartTerminal }: WorkspaceTabsProps) {
  const rootRef = useRef<HTMLElement>(null)
  const focusedControl = useRef<HTMLElement | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: [KeyboardCode.Space], cancel: [KeyboardCode.Esc], end: [KeyboardCode.Space, KeyboardCode.Enter, KeyboardCode.Tab] } }))
  useEffect(() => {
    rootRef.current?.querySelector('.pilot-side-tab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    if (focusedControl.current && !focusedControl.current.isConnected && document.activeElement === document.body) {
      focusedControl.current = null
      ;(rootRef.current?.querySelector<HTMLButtonElement>('.pilot-side-tab.is-active .pilot-side-tab__select') || rootRef.current?.querySelector<HTMLButtonElement>('.mira-workspace-overview'))?.focus()
    }
  }, [active, tabs])
  const restoreFocus = (event: Event) => {
    event.preventDefault()
    // 标签可能在菜单关闭时已卸载，焦点回到相邻的选中标签或标签列表入口。
    requestAnimationFrame(() => (rootRef.current?.querySelector<HTMLButtonElement>('.pilot-side-tab.is-active .pilot-side-tab__select') || rootRef.current?.querySelector<HTMLButtonElement>('.mira-workspace-overview'))?.focus())
  }
  function finishReorder({ active: dragged, over }: DragEndEvent) {
    if (over && dragged.id !== over.id) onReorder(dragged.id as WorkspaceTabId, over.id as WorkspaceTabId)
  }
  return <Tooltip.Provider delayDuration={350}><nav ref={rootRef} className="pilot-side-tabs" aria-label="已打开的工作内容" onFocusCapture={event => { focusedControl.current = rootRef.current?.contains(event.target as Node) ? event.target as HTMLElement : null }}>
    <MiraWorkspaceOverview tabs={tabs} active={active} recentClosedTabs={recentClosedTabs} onActivate={onActivate} onClose={onClose} onReopen={onReopen} />
    {fullView && <div className={`pilot-side-tab mira-conversation-tab${fullView.surface === 'conversation' ? ' is-active' : ''}`}><button type="button" className="pilot-side-tab__select" aria-current={fullView.surface === 'conversation' ? 'page' : undefined} onClick={onConversation}><MessageSquare size={14} /><span>{conversationTitle}</span></button></div>}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishReorder} accessibility={{ screenReaderInstructions: { draggable: '按空格开始拖动标签，左右方向键调整位置，再按空格确认，Escape 取消。' } }}>
      <div className="pilot-side-tabs__list"><SortableContext items={tabs.map(tab => tab.id)} strategy={horizontalListSortingStrategy}>{tabs.map(tab => <WorkspaceResourceTab key={tab.id} tab={tab} selected={fullView?.surface !== 'conversation' && active === tab.id} changes={changes} canCloseOthers={tabs.length > 1} onActivate={onActivate} onClose={onClose} onCloseOthers={onCloseOthers} onCloseAll={onCloseAll} onRestoreFocus={restoreFocus} onRestartTerminal={onRestartTerminal} />)}</SortableContext><button type="button" className="mira-workspace-add" aria-label="新建标签页" onClick={onNewTab}><Plus size={16} /></button></div>
    </DndContext>
    <div className="pilot-side-tabs__actions">
    {onFullView && <SidebarActionHint side="bottom" title={fullView ? '退出完整视图' : '进入完整视图'} shortcut={miraShortcutLabel('Shift+F')}><button type="button" className="pilot-side-tabs__dismiss" aria-label={fullView ? '退出完整视图' : '进入完整视图'} aria-keyshortcuts={miraPrimaryKeyShortcuts('Shift+F')} aria-pressed={Boolean(fullView)} onClick={onFullView}>{fullView ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></SidebarActionHint>}
    <SidebarActionHint hoverOnly side="bottom" title="切换面板" shortcut={miraShortcutLabel('Alt+B')}><button type="button" className="pilot-side-tabs__dismiss" aria-label="切换面板" aria-keyshortcuts={miraPrimaryKeyShortcuts('Alt+B')} aria-controls="pilot-workspace" aria-expanded={true} onClick={onDismiss}><PanelRightClose size={16} /></button></SidebarActionHint>
    </div>
  </nav></Tooltip.Provider>
}

function WorkspaceResourceTab({ tab, selected, changes, canCloseOthers, onActivate, onClose, onCloseOthers, onCloseAll, onRestoreFocus, onRestartTerminal }: { tab: WorkspaceTab; selected: boolean; changes: number; canCloseOthers: boolean; onActivate: WorkspaceTabsProps['onActivate']; onClose: WorkspaceTabsProps['onClose']; onCloseOthers: WorkspaceTabsProps['onCloseOthers']; onCloseAll: WorkspaceTabsProps['onCloseAll']; onRestoreFocus: (event: Event) => void; onRestartTerminal: WorkspaceTabsProps['onRestartTerminal'] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id })
  const releasedDrag = useRef(false)
  const [hintOpen, setHintOpen] = useState(false)
  if (isDragging) releasedDrag.current = true
  useEffect(() => { if (isDragging) setHintOpen(false) }, [isDragging])
  const { Icon } = miraWorkspaceTabPresentation(tab)
  const [failedIcon, setFailedIcon] = useState<string>()
  const favicon = isWorkspaceBrowserTab(tab.id) ? miraBrowserFavicon(tab.faviconUrl) : undefined
  return <ContextMenu.Root><ContextMenu.Trigger asChild><div ref={setNodeRef} data-workspace-tab-id={tab.id} className={`pilot-side-tab${selected ? ' is-active' : ''}${isDragging ? ' is-dragging' : ''}`} style={{ transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined, transition }} onAuxClick={event => { if (event.button === 1) { event.preventDefault(); event.stopPropagation(); onClose(tab.id) } }}>
    <Tooltip.Provider delayDuration={1500} skipDelayDuration={0}><Tooltip.Root open={hintOpen && !isDragging} onOpenChange={open => setHintOpen(!isDragging && open)}><Tooltip.Trigger asChild>
    <button type="button" {...attributes} {...listeners} className="pilot-side-tab__select" aria-current={selected ? 'page' : undefined} onPointerDown={event => { releasedDrag.current = false; listeners?.onPointerDown?.(event) }} onKeyDown={event => { if (!isDragging && (event.key === 'Enter' || event.key === ' ')) releasedDrag.current = false; listeners?.onKeyDown?.(event) }} onClick={event => { if (event.button === 1 || releasedDrag.current) { releasedDrag.current = false; event.preventDefault(); return } onActivate(tab.id) }}>{tab.path ? <img className="mira-workspace-file-icon" src={miraFileTreeIcon(tab.path)} width={16} height={16} alt="" aria-hidden="true" draggable={false} /> : favicon && favicon !== failedIcon ? <img className="mira-browser-tab-icon" src={favicon} width={14} height={14} alt="" referrerPolicy="no-referrer" onError={() => setFailedIcon(favicon)} /> : <Icon size={14} />}<span>{tab.label}</span>{tab.id === 'changes' && changes > 0 && <em>{changes}</em>}</button>
    </Tooltip.Trigger><Tooltip.Portal container={document.getElementById('root')}><Tooltip.Content className="mira-composer-hint" side="bottom" sideOffset={6}>{tab.path || tab.label}</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>
    <button type="button" className="pilot-side-tab__close" title={`关闭${tab.label}`} aria-label={`关闭${tab.label}`} onPointerDown={event => event.stopPropagation()} onClick={() => onClose(tab.id)}><X size={12} /></button>
  </div></ContextMenu.Trigger><ContextMenu.Portal container={document.getElementById('root')}><ContextMenu.Content className="mira-session-menu" onCloseAutoFocus={onRestoreFocus}>
    {isWorkspaceTerminalTab(tab.id) && onRestartTerminal && <ContextMenu.Item className="mira-session-menu__item" onSelect={() => onRestartTerminal(tab.id)}>重启终端</ContextMenu.Item>}
    <ContextMenu.Item className="mira-session-menu__item" onSelect={() => onClose(tab.id)}>关闭当前标签</ContextMenu.Item>
    <ContextMenu.Item className="mira-session-menu__item" disabled={!canCloseOthers} onSelect={() => onCloseOthers(tab.id)}>关闭其他标签</ContextMenu.Item>
    <ContextMenu.Item className="mira-session-menu__item" onSelect={onCloseAll}>关闭所有标签</ContextMenu.Item>
  </ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>
}
