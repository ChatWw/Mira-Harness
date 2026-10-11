/* Overview interaction adapted from ZCode SidePaneTabOverview.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: local resource lifecycle, unique Command values, focus and metadata.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { Check, ChevronsDown, Search, X } from 'lucide-react'
import { miraSearchWorkspaceTabs, miraWorkspaceTabPresentation, miraWorkspaceTabTime } from '../../lib/mira-workspace-tab-presentation'
import type { WorkspaceTab, WorkspaceTabId } from '../../state/workspace-state'

export function MiraWorkspaceOverview({ tabs, active, recentClosedTabs, onActivate, onClose, onReopen }: {
  tabs: WorkspaceTab[]; active: WorkspaceTabId; recentClosedTabs: WorkspaceTab[]
  onActivate: (id: WorkspaceTabId) => void; onClose: (id: WorkspaceTabId) => void; onReopen: (id: WorkspaceTabId) => void
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [now, setNow] = useState(Date.now)
  const input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), closedControl = useRef<HTMLButtonElement | null>(null)
  const returnFocus = useRef(true)
  const filteredOpen = useMemo(() => miraSearchWorkspaceTabs(tabs, query), [tabs, query])
  const filteredClosed = useMemo(() => miraSearchWorkspaceTabs(recentClosedTabs, query), [recentClosedTabs, query])
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [open])
  useEffect(() => {
    if (closedControl.current && !closedControl.current.isConnected) {
      closedControl.current = null
      // A delayed close must not take focus from a newly selected draft or control.
      if (open && document.activeElement === document.body) input.current?.focus()
    }
  }, [tabs, open])
  function choose(tab: WorkspaceTab, closed: boolean) {
    if (closed) onReopen(tab.id); else onActivate(tab.id)
    setOpen(false); setQuery('')
  }
  function row(tab: WorkspaceTab, closed: boolean) {
    const { Icon, type, hint } = miraWorkspaceTabPresentation(tab)
    const time = miraWorkspaceTabTime(closed ? tab.closedAt : tab.openedAt, now)
    return <Command.Item key={tab.id} value={`${closed ? 'closed' : 'open'}:${tab.id}`} className={`mira-workspace-overview__item${!closed && tab.id === active ? ' is-active' : ''}`} onSelect={() => choose(tab, closed)} aria-label={`${closed ? '重新打开' : '切换到'}${tab.label}${hint ? `，${hint}` : ''}`} title={hint || tab.label}>
      <Icon size={15} aria-hidden="true" /><span className="mira-workspace-overview__text"><span>{tab.label}</span><small>{type}{hint ? ` · ${hint}` : ''}</small></span>
      {!closed && tab.id === active && <Check size={13} aria-label="当前标签" />}
      {time && <time className="mira-workspace-overview__time" dateTime={new Date((closed ? tab.closedAt : tab.openedAt)!).toISOString()} title={`${closed ? '关闭' : '打开'}时间：${new Date((closed ? tab.closedAt : tab.openedAt)!).toLocaleString()}`}>{time}</time>}
      {!closed && <button type="button" className="mira-workspace-overview__close" aria-label={`关闭${tab.label}`} title={`关闭${tab.label}`} onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }} onClick={event => {
        event.preventDefault(); event.stopPropagation()
        closedControl.current = document.activeElement === event.currentTarget ? event.currentTarget : null
        onClose(tab.id)
      }}><X size={13} /></button>}
    </Command.Item>
  }
  return <Popover.Root open={open} onOpenChange={value => { if (value) returnFocus.current = true; setOpen(value); if (!value) setQuery('') }}>
    <Popover.Trigger ref={trigger} type="button" className="mira-workspace-overview" title="标签页" aria-label="标签页"><ChevronsDown size={16} /></Popover.Trigger>
    <Popover.Portal container={document.getElementById('root')}><Popover.Content align="start" sideOffset={5} className="mira-workspace-tab-menu" aria-label="工作区标签概览" onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus() }} onInteractOutside={() => { returnFocus.current = false }} onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current) trigger.current?.focus() }}>
      <Command shouldFilter={false} label="搜索标签页" onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }}>
        <div className="mira-workspace-overview__search"><Search size={15} aria-hidden="true" /><Command.Input ref={input} value={query} onValueChange={setQuery} placeholder="搜索标签页…" aria-label="搜索标签页" /></div>
        <Command.List className="mira-workspace-overview__list">
          {!filteredOpen.length && !filteredClosed.length && <Command.Empty>{query.trim() ? '没有匹配的标签页' : '暂无标签页'}</Command.Empty>}
          {!!filteredOpen.length && <Command.Group heading="已打开的标签页">{filteredOpen.map(tab => row(tab, false))}</Command.Group>}
          {!!filteredClosed.length && <Command.Group heading="最近关闭的标签页">{filteredClosed.map(tab => row(tab, true))}</Command.Group>}
        </Command.List>
      </Command>
    </Popover.Content></Popover.Portal>
  </Popover.Root>
}
