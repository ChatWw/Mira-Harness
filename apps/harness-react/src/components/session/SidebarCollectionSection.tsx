import { ShortcutKeys } from '../shared/ShortcutKeys'
import { fileManagerLabel } from '../../lib/file-manager-label'
/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode GroupItem / WorkspaceSidebarItem interaction structure.
 * Upstream license: third-party-licenses/zcode/.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useSortable } from '@dnd-kit/sortable'
import { Check, ChevronRight, CircleAlert, Folder, FolderOpen, Hash, ListTree, LoaderCircle, MessageCirclePlus, MoreHorizontal, Pencil, TerminalSquare, Trash2, Ungroup, X } from 'lucide-react'
import { SIDEBAR_GROUP_COLORS, type SidebarGroupColor } from './sidebar-preferences'

const colorLabels: Record<SidebarGroupColor, string> = { gray: '灰色', red: '红色', orange: '橙色', yellow: '黄色', green: '绿色', blue: '蓝色', purple: '紫色' }

export function SidebarActionHint({ title, shortcut, children, suspended = false, side = 'top' }: { title: string; shortcut?: string; children: React.ReactElement; suspended?: boolean; side?: 'top' | 'bottom' }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (suspended) setOpen(false) }, [suspended])
  return <Tooltip.Root open={open && !suspended} onOpenChange={setOpen}><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal container={document.getElementById('root')}><Tooltip.Content className={shortcut ? "mira-composer-hint" : "mira-sidebar-tooltip"} side={side} sideOffset={6}>{title}{shortcut && <ShortcutKeys shortcut={shortcut} />}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
}

export interface SidebarCollectionProps {
  id: string
  name: string
  directory?: string
  color?: SidebarGroupColor
  count: number
  hasUnread?: boolean
  runningCount?: number
  waitingCount?: number
  expanded: boolean
  sortable: boolean
  renaming: boolean
  disabled?: boolean
  unavailableReason?: string
  onToggle: () => void
  onBeginRename: () => void
  onCancelRename: () => void
  onRename: (name: string) => void | Promise<void>
  onNewTask: () => void | Promise<void>
  onOpenFiles?: () => void
  onOpenDirectory?: (target: 'file-manager' | 'terminal') => Promise<void>
  onColor?: (color: SidebarGroupColor) => void
  onRemove?: () => void
  onUngroup?: () => void
  headerDropRef?: (node: HTMLDivElement | null) => void
  footerDropRef?: (node: HTMLDivElement | null) => void
  headerDropId?: string
  footerDropId?: string
  children: ReactNode
}

export function SidebarCollectionSection(props: SidebarCollectionProps) {
  const { id, name, directory, color, count, hasUnread, runningCount = 0, waitingCount = 0, expanded, sortable, renaming, disabled, unavailableReason, children, onToggle, onBeginRename, onCancelRename, onRename, onNewTask, onOpenFiles, onOpenDirectory, onColor, onRemove, onUngroup } = props
  const directoryBlocked = Boolean(disabled || unavailableReason)
  const openFiles = () => { if (!directoryBlocked) onOpenFiles?.() }
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !sortable || renaming })
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const renameRequest = useRef<object | undefined>(undefined)
  const composingName = useRef(false)
  const [creating, setCreating] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuMounted, setMenuMounted] = useState(false)
  const menuRef = useRef((element: HTMLDivElement | null) => setMenuMounted(Boolean(element))).current
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const menuVisible = menuOpen || menuMounted || contextMenuOpen
  useEffect(() => { if (!renaming) setDraft(name) }, [name, renaming])
  useEffect(() => {
    renameRequest.current = undefined; composingName.current = false; setSaving(false)
    if (renaming) { setDraft(name); setError('') }
    return () => { renameRequest.current = undefined }
  }, [id, renaming])
  const run = (action: () => void | Promise<void>) => {
    setError('')
    void Promise.resolve().then(action).catch(cause => setError(cause instanceof Error ? cause.message : '操作失败，请重试'))
  }
  const create = () => {
    if (creating || directoryBlocked) return
    setCreating(true); setError('')
    void Promise.resolve().then(onNewTask).catch(cause => setError(cause instanceof Error ? cause.message : '新建任务失败')).finally(() => setCreating(false))
  }
  const commit = async () => {
    const next = draft.trim().slice(0, 64)
    if (!renaming || !next || renameRequest.current || composingName.current) return
    const request = {}
    renameRequest.current = request
    setSaving(true); setError('')
    try { await onRename(next); if (renameRequest.current === request) onCancelRename() }
    catch (cause) { if (renameRequest.current === request) setError(cause instanceof Error ? cause.message : '重命名失败，请重试') }
    finally { if (renameRequest.current === request) { renameRequest.current = undefined; setSaving(false) } }
  }
  const menu = (kind: 'context' | 'dropdown') => <SidebarCollectionMenu kind={kind} name={name} color={color} disabled={directoryBlocked || creating} unavailableReason={unavailableReason} onNewTask={create} onBeginRename={onBeginRename} onOpenFiles={onOpenFiles ? openFiles : undefined} onOpenDirectory={onOpenDirectory ? target => { if (!directoryBlocked) run(() => onOpenDirectory(target)) } : undefined} onColor={onColor} onRemove={onRemove} onUngroup={onUngroup} />
  const portal = document.getElementById('root')
  return <section ref={setNodeRef} className={`mira-session-group mira-sidebar-collection${isDragging ? ' is-dragging' : ''}`} data-collection-id={id} data-collection-expanded={expanded} data-collection-renaming={renaming} data-group-color={color} style={{ transform: isDragging ? undefined : transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}>
    <ContextMenu.Root onOpenChange={setContextMenuOpen}><ContextMenu.Trigger asChild disabled={renaming}><div ref={props.headerDropRef} data-sidebar-drop-id={props.headerDropId} data-collection-header data-menu-open={menuVisible || undefined} className="mira-collection-head">
      {color && onColor ? <DropdownMenu.Root><SidebarActionHint suspended={menuVisible} title="分组颜色"><DropdownMenu.Trigger asChild><button type="button" className="mira-collection-color" aria-label={`${name} 的颜色`}><Hash size={12} /></button></DropdownMenu.Trigger></SidebarActionHint><DropdownMenu.Portal container={portal}><DropdownMenu.Content className="mira-session-menu" sideOffset={4}><DropdownMenu.Label className="mira-session-menu__label">分组颜色</DropdownMenu.Label><DropdownMenu.RadioGroup value={color} onValueChange={value => onColor(value as SidebarGroupColor)}>{SIDEBAR_GROUP_COLORS.map(value => <DropdownMenu.RadioItem key={value} value={value} className="mira-session-menu__item"><span className="mira-collection-swatch" data-group-color={value} />{colorLabels[value]}<DropdownMenu.ItemIndicator className="mira-session-menu__arrow"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root> : expanded ? <FolderOpen size={13} className="mira-collection-folder" /> : <Folder size={13} className="mira-collection-folder" />}
      {renaming ? <form className="mira-session-rename" onSubmit={event => { event.preventDefault(); void commit() }}><input autoFocus aria-label={`重命名${color ? '分组' : '项目'}`} aria-invalid={Boolean(error)} maxLength={64} value={draft} disabled={saving} onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.target.value)} onCompositionStart={() => { composingName.current = true }} onCompositionEnd={() => { composingName.current = false }} onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return
        const ime = composingName.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
        event.stopPropagation()
        if (ime) { if (event.key === 'Enter') event.preventDefault(); return }
        event.preventDefault()
        if (event.key === 'Enter') void commit()
        else if (!renameRequest.current) onCancelRename()
      }} /><SidebarActionHint title="保存名称"><button type="submit" aria-label="保存名称" disabled={saving || !draft.trim()}>{saving ? <LoaderCircle size={13} className="pilot-spin" /> : <Check size={13} />}</button></SidebarActionHint><SidebarActionHint title="取消重命名"><button type="button" aria-label="取消重命名" disabled={saving} onClick={() => { if (!renameRequest.current) onCancelRename() }}><X size={13} /></button></SidebarActionHint></form> : <>
        <button type="button" className="mira-collection-title" data-sidebar-collection-drag-handle={sortable || undefined} {...(sortable ? attributes : {})} {...(sortable ? listeners : {})} aria-expanded={expanded} onClick={onToggle}><span>{name}</span><ChevronRight size={12} className={expanded ? 'is-open' : ''} /></button>
        {!expanded && <>
          {hasUnread && <SidebarActionHint suspended={menuVisible} title={`${name} 有未读回复`}><span role="img" tabIndex={0} aria-label={`${name} 有未读回复`} className="mira-collection-status mira-session-status--unread"><span /></span></SidebarActionHint>}
          {runningCount > 0 && <SidebarActionHint suspended={menuVisible} title={`${name} 有 ${runningCount} 个任务执行中`}><span role="img" tabIndex={0} aria-label={`${name} 有 ${runningCount} 个任务执行中`} className="mira-collection-status mira-session-status--running"><LoaderCircle size={12} className="pilot-spin" />{runningCount > 1 && runningCount}</span></SidebarActionHint>}
          {waitingCount > 0 && <SidebarActionHint suspended={menuVisible} title={`${name} 有 ${waitingCount} 个任务待确认`}><span role="img" tabIndex={0} aria-label={`${name} 有 ${waitingCount} 个任务待确认`} className="mira-collection-status mira-session-status--waiting"><CircleAlert size={12} />{waitingCount > 1 && waitingCount}</span></SidebarActionHint>}
        </>}
        {color && <span className="mira-collection-count">{count}</span>}
        {unavailableReason && <SidebarActionHint suspended={menuVisible} title={`${unavailableReason}\n${directory || name}`}><span role="img" tabIndex={0} aria-label={unavailableReason} className="mira-collection-status mira-collection-status--unavailable"><CircleAlert size={13} /></span></SidebarActionHint>}
        <div className="mira-collection-actions"><DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}><SidebarActionHint suspended={menuVisible} title="更多"><DropdownMenu.Trigger asChild><button type="button" className="mira-session-icon" aria-label={`${name} 的菜单`}><MoreHorizontal size={15} /></button></DropdownMenu.Trigger></SidebarActionHint><DropdownMenu.Portal container={portal}><DropdownMenu.Content ref={menuRef} className="mira-session-menu" sideOffset={4} align="end" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}>{menu('dropdown')}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>{onOpenFiles && <SidebarActionHint suspended={menuVisible} title="显示文件树"><button type="button" className="mira-session-icon" aria-label={`显示 ${name} 的文件树`} disabled={directoryBlocked} onClick={openFiles}><ListTree size={14} /></button></SidebarActionHint>}<SidebarActionHint suspended={menuVisible} title="新建任务"><button type="button" className="mira-session-icon" aria-label={`在 ${name} 新建任务`} disabled={directoryBlocked || creating} onClick={create}>{creating ? <LoaderCircle size={14} className="pilot-spin" /> : <MessageCirclePlus size={14} />}</button></SidebarActionHint></div>
      </>}
    </div></ContextMenu.Trigger><ContextMenu.Portal container={portal}><ContextMenu.Content className="mira-session-menu" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}>{menu('context')}</ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>
    {error && <p className="mira-session-feedback" role="alert">{error}</p>}
    {expanded && <div className={color ? 'mira-collection-content' : undefined}>{children}</div>}
    {expanded && props.footerDropRef && <div ref={props.footerDropRef} data-sidebar-drop-id={props.footerDropId} className="mira-sidebar-drop-edge" aria-hidden="true" />}
  </section>
}

export function SidebarCollectionMenu({ kind, name, color, disabled, unavailableReason, onNewTask, onBeginRename, onOpenFiles, onOpenDirectory, onColor, onRemove, onUngroup }: Pick<SidebarCollectionProps, 'name' | 'color' | 'disabled' | 'unavailableReason' | 'onNewTask' | 'onBeginRename' | 'onOpenFiles' | 'onColor' | 'onRemove' | 'onUngroup'> & { kind: 'context' | 'dropdown'; onOpenDirectory?: (target: 'file-manager' | 'terminal') => void }) {
  const Menu = kind === 'context' ? ContextMenu : DropdownMenu
  const directoryBlocked = Boolean(disabled || unavailableReason)
  return <>
    {unavailableReason && <Menu.Label className="mira-session-menu__label">{unavailableReason}</Menu.Label>}
    <Menu.Item className="mira-session-menu__item" disabled={directoryBlocked} onSelect={onNewTask}><MessageCirclePlus size={14} />新建任务</Menu.Item>
    {onOpenFiles && <Menu.Item className="mira-session-menu__item" disabled={directoryBlocked} onSelect={onOpenFiles}><ListTree size={14} />显示文件树</Menu.Item>}
    <Menu.Item className="mira-session-menu__item" onSelect={onBeginRename}><Pencil size={14} />重命名</Menu.Item>
    {color && onColor && <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><Hash size={14} />更改颜色<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={document.getElementById('root')}><Menu.SubContent className="mira-session-menu">{SIDEBAR_GROUP_COLORS.map(value => <Menu.Item key={value} className="mira-session-menu__item" onSelect={() => onColor(value)}><span className="mira-collection-swatch" data-group-color={value} />{colorLabels[value]}{value === color && <Check size={13} className="mira-session-menu__arrow" />}</Menu.Item>)}</Menu.SubContent></Menu.Portal></Menu.Sub>}
    {onOpenDirectory && <><Menu.Separator className="mira-session-menu__separator" /><Menu.Sub><Menu.SubTrigger className="mira-session-menu__item" disabled={directoryBlocked}><TerminalSquare size={14} />打开方式<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={document.getElementById('root')}><Menu.SubContent className="mira-session-menu" sideOffset={3}><Menu.Item className="mira-session-menu__item" disabled={directoryBlocked} onSelect={() => onOpenDirectory('file-manager')}><Folder size={14} />{fileManagerLabel()}</Menu.Item><Menu.Item className="mira-session-menu__item" disabled={directoryBlocked} onSelect={() => onOpenDirectory('terminal')}><TerminalSquare size={14} />终端</Menu.Item></Menu.SubContent></Menu.Portal></Menu.Sub></>}
    {onRemove && <><Menu.Separator className="mira-session-menu__separator" /><Menu.Item className="mira-session-menu__item mira-session-menu__item--danger" onSelect={onRemove}><Trash2 size={14} />移除项目</Menu.Item></>}
    {onUngroup && <><Menu.Separator className="mira-session-menu__separator" /><Menu.Item className="mira-session-menu__item" onSelect={onUngroup}><Ungroup size={14} />解散「{name}」</Menu.Item><Menu.Label className="mira-session-menu__label">任务保留并回到未分组</Menu.Label></>}
  </>
}
