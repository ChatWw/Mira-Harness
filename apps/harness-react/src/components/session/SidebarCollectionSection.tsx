/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode GroupItem / WorkspaceSidebarItem interaction structure.
 * Upstream license: third-party-licenses/zcode/.
 */
import { useEffect, useState, type ReactNode } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useSortable } from '@dnd-kit/sortable'
import { Check, ChevronRight, EyeOff, Folder, FolderOpen, GripVertical, Hash, ListTree, LoaderCircle, MessageCirclePlus, MoreHorizontal, Pencil, TerminalSquare, Ungroup, X } from 'lucide-react'
import { SIDEBAR_GROUP_COLORS, type SidebarGroupColor } from './sidebar-preferences'

const colorLabels: Record<SidebarGroupColor, string> = { gray: '灰色', red: '红色', orange: '橙色', yellow: '黄色', green: '绿色', blue: '蓝色', purple: '紫色' }

export function SidebarActionHint({ title, children }: { title: string; children: React.ReactElement }) {
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal container={document.getElementById('root')}><Tooltip.Content className="mira-sidebar-tooltip" side="right" sideOffset={6}>{title}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
}

export interface SidebarCollectionProps {
  id: string
  name: string
  directory?: string
  color?: SidebarGroupColor
  count: number
  expanded: boolean
  sortable: boolean
  renaming: boolean
  disabled?: boolean
  onToggle: () => void
  onBeginRename: () => void
  onCancelRename: () => void
  onRename: (name: string) => void | Promise<void>
  onNewTask: () => void | Promise<void>
  onOpenFiles?: () => void
  onOpenDirectory?: (target: 'file-manager' | 'terminal') => Promise<void>
  onColor?: (color: SidebarGroupColor) => void
  onHide?: () => void
  onUngroup?: () => void
  headerDropRef?: (node: HTMLDivElement | null) => void
  footerDropRef?: (node: HTMLDivElement | null) => void
  headerDropId?: string
  footerDropId?: string
  children: ReactNode
}

export function SidebarCollectionSection(props: SidebarCollectionProps) {
  const { id, name, directory, color, count, expanded, sortable, renaming, disabled, children, onToggle, onBeginRename, onCancelRename, onRename, onNewTask, onOpenFiles, onOpenDirectory, onColor, onHide, onUngroup } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !sortable || renaming })
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  useEffect(() => { if (!renaming) setDraft(name) }, [name, renaming])
  const run = (action: () => void | Promise<void>) => {
    setError('')
    void Promise.resolve().then(action).catch(cause => setError(cause instanceof Error ? cause.message : '操作失败，请重试'))
  }
  const create = () => {
    if (creating || disabled) return
    setCreating(true); setError('')
    void Promise.resolve().then(onNewTask).catch(cause => setError(cause instanceof Error ? cause.message : '新建任务失败')).finally(() => setCreating(false))
  }
  const commit = async () => {
    const next = draft.trim().slice(0, 64)
    if (!next || saving) return
    setSaving(true); setError('')
    try { await onRename(next); onCancelRename() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '重命名失败，请重试') }
    finally { setSaving(false) }
  }
  const menu = (kind: 'context' | 'dropdown') => <SidebarCollectionMenu kind={kind} name={name} color={color} disabled={disabled || creating} onNewTask={create} onBeginRename={onBeginRename} onOpenFiles={onOpenFiles} onOpenDirectory={onOpenDirectory ? target => run(() => onOpenDirectory(target)) : undefined} onColor={onColor} onHide={onHide} onUngroup={onUngroup} />
  const portal = document.getElementById('root')
  return <section ref={setNodeRef} className={`mira-session-group mira-sidebar-collection${isDragging ? ' is-dragging' : ''}`} data-collection-id={id} data-collection-expanded={expanded} data-collection-renaming={renaming} data-group-color={color} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}>
    <ContextMenu.Root><ContextMenu.Trigger asChild disabled={renaming}><div ref={props.headerDropRef} data-sidebar-drop-id={props.headerDropId} data-collection-header className="mira-collection-head">
      {sortable && <button type="button" className="mira-collection-grip" aria-label={`拖拽排序 ${name}`} {...attributes} {...listeners}><GripVertical size={12} /></button>}
      {color && onColor ? <DropdownMenu.Root><SidebarActionHint title="分组颜色"><DropdownMenu.Trigger asChild><button type="button" className="mira-collection-color" aria-label={`${name} 的颜色`}><Hash size={12} /></button></DropdownMenu.Trigger></SidebarActionHint><DropdownMenu.Portal container={portal}><DropdownMenu.Content className="mira-session-menu" sideOffset={4}><DropdownMenu.Label className="mira-session-menu__label">分组颜色</DropdownMenu.Label><DropdownMenu.RadioGroup value={color} onValueChange={value => onColor(value as SidebarGroupColor)}>{SIDEBAR_GROUP_COLORS.map(value => <DropdownMenu.RadioItem key={value} value={value} className="mira-session-menu__item"><span className="mira-collection-swatch" data-group-color={value} />{colorLabels[value]}<DropdownMenu.ItemIndicator className="mira-session-menu__arrow"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root> : <Folder size={13} className="mira-collection-folder" />}
      {renaming ? <form className="mira-session-rename" onSubmit={event => { event.preventDefault(); void commit() }}><input autoFocus aria-label={`重命名${color ? '分组' : '项目'}`} maxLength={64} value={draft} disabled={saving} onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); if (!saving) onCancelRename() } }} /><button type="submit" aria-label="保存名称" disabled={saving || !draft.trim()}>{saving ? <LoaderCircle size={13} className="pilot-spin" /> : <Check size={13} />}</button><button type="button" aria-label="取消重命名" disabled={saving} onClick={onCancelRename}><X size={13} /></button></form> : <>
        <SidebarActionHint title={directory ? `${name}\n${directory}` : name}><button type="button" className="mira-collection-title" aria-expanded={expanded} onClick={onToggle}><span>{name}</span><ChevronRight size={12} className={expanded ? 'is-open' : ''} /></button></SidebarActionHint>
        <span className="mira-collection-count">{count}</span>
        <div className="mira-collection-actions"><SidebarActionHint title="新建任务"><button type="button" className="mira-session-icon" aria-label={`在 ${name} 新建任务`} disabled={disabled || creating} onClick={create}>{creating ? <LoaderCircle size={14} className="pilot-spin" /> : <MessageCirclePlus size={14} />}</button></SidebarActionHint>{onOpenFiles && <SidebarActionHint title="显示文件树"><button type="button" className="mira-session-icon" aria-label={`显示 ${name} 的文件树`} disabled={disabled} onClick={onOpenFiles}><ListTree size={14} /></button></SidebarActionHint>}<DropdownMenu.Root><SidebarActionHint title="更多"><DropdownMenu.Trigger asChild><button type="button" className="mira-session-icon" aria-label={`${name} 的菜单`}><MoreHorizontal size={15} /></button></DropdownMenu.Trigger></SidebarActionHint><DropdownMenu.Portal container={portal}><DropdownMenu.Content className="mira-session-menu" sideOffset={4} align="end" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}>{menu('dropdown')}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div>
      </>}
    </div></ContextMenu.Trigger><ContextMenu.Portal container={portal}><ContextMenu.Content className="mira-session-menu" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}>{menu('context')}</ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>
    {error && <p className="mira-session-feedback" role="alert">{error}</p>}
    {expanded && <div className={color ? 'mira-collection-content' : undefined}>{children}</div>}
    {expanded && props.footerDropRef && <div ref={props.footerDropRef} data-sidebar-drop-id={props.footerDropId} className="mira-sidebar-drop-edge" aria-hidden="true" />}
  </section>
}

export function SidebarCollectionMenu({ kind, name, color, disabled, onNewTask, onBeginRename, onOpenFiles, onOpenDirectory, onColor, onHide, onUngroup }: Pick<SidebarCollectionProps, 'name' | 'color' | 'disabled' | 'onNewTask' | 'onBeginRename' | 'onOpenFiles' | 'onColor' | 'onHide' | 'onUngroup'> & { kind: 'context' | 'dropdown'; onOpenDirectory?: (target: 'file-manager' | 'terminal') => void }) {
  const Menu = kind === 'context' ? ContextMenu : DropdownMenu
  return <>
    <Menu.Item className="mira-session-menu__item" disabled={disabled} onSelect={onNewTask}><MessageCirclePlus size={14} />新建任务</Menu.Item>
    {onOpenFiles && <Menu.Item className="mira-session-menu__item" disabled={disabled} onSelect={onOpenFiles}><ListTree size={14} />显示文件树</Menu.Item>}
    <Menu.Item className="mira-session-menu__item" onSelect={onBeginRename}><Pencil size={14} />重命名</Menu.Item>
    {color && onColor && <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><Hash size={14} />更改颜色<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={document.getElementById('root')}><Menu.SubContent className="mira-session-menu">{SIDEBAR_GROUP_COLORS.map(value => <Menu.Item key={value} className="mira-session-menu__item" onSelect={() => onColor(value)}><span className="mira-collection-swatch" data-group-color={value} />{colorLabels[value]}{value === color && <Check size={13} className="mira-session-menu__arrow" />}</Menu.Item>)}</Menu.SubContent></Menu.Portal></Menu.Sub>}
    {onOpenDirectory && <><Menu.Separator className="mira-session-menu__separator" /><Menu.Item className="mira-session-menu__item" disabled={disabled} onSelect={() => onOpenDirectory('file-manager')}><FolderOpen size={14} />在文件管理器中打开</Menu.Item><Menu.Item className="mira-session-menu__item" disabled={disabled} onSelect={() => onOpenDirectory('terminal')}><TerminalSquare size={14} />在终端中打开</Menu.Item></>}
    {onHide && <><Menu.Separator className="mira-session-menu__separator" /><Menu.Item className="mira-session-menu__item" onSelect={onHide}><EyeOff size={14} />从侧栏隐藏</Menu.Item><Menu.Label className="mira-session-menu__label">项目与历史任务会保留</Menu.Label></>}
    {onUngroup && <><Menu.Separator className="mira-session-menu__separator" /><Menu.Item className="mira-session-menu__item" onSelect={onUngroup}><Ungroup size={14} />解散「{name}」</Menu.Item><Menu.Label className="mira-session-menu__label">任务保留并回到未分组</Menu.Label></>}
  </>
}
