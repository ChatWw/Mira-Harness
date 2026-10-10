/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode grouped task header selection and floating header slot.
 * Upstream license: third-party-licenses/zcode/.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight, Hash, LoaderCircle, MessageCirclePlus, Ungroup } from 'lucide-react'
import { SidebarActionHint } from './SidebarCollectionSection'
import { SIDEBAR_GROUP_COLORS, type SidebarGroupColor } from './sidebar-preferences'

export interface MiraSidebarStickyGroup {
  id: string
  name: string
  color: SidebarGroupColor
  count: number
  collapsed: boolean
  renaming?: boolean
}

interface StickyHeaderProps {
  scrollElement: HTMLElement | null
  groups: readonly MiraSidebarStickyGroup[]
  active: boolean
  dragging: boolean
  onToggle: (id: string) => void
  onNewTask: (id: string) => void | Promise<void>
  onColor: (id: string, color: SidebarGroupColor) => void
  onUngroup: (id: string) => void
  onError?: (error: unknown) => void
}

const colorLabels: Record<SidebarGroupColor, string> = { gray: '灰色', red: '红色', orange: '橙色', yellow: '黄色', green: '绿色', blue: '蓝色', purple: '紫色' }
const EXIT_DURATION = 150

/** Same geometry as ZCode: the original head is above the viewport, while its group still covers it. */
export function resolveMiraSidebarStickyGroup(scrollElement: HTMLElement, groups: readonly MiraSidebarStickyGroup[]) {
  if (scrollElement.scrollHeight <= scrollElement.clientHeight || !scrollElement.getBoundingClientRect().height) return null
  const available = new Set(groups.filter(group => !group.collapsed && !group.renaming).map(group => group.id))
  const top = scrollElement.getBoundingClientRect().top
  let selected: string | null = null
  for (const element of scrollElement.querySelectorAll<HTMLElement>('[data-collection-id]')) {
    const collectionId = element.getAttribute('data-collection-id') || ''
    if (!collectionId.startsWith('sidebar-group:')) continue
    const id = collectionId.slice('sidebar-group:'.length)
    if (!available.has(id) || element.getAttribute('data-collection-expanded') !== 'true' || element.getAttribute('data-collection-renaming') === 'true') continue
    const header = element.querySelector<HTMLElement>('[data-collection-header]')
    if (!header) continue
    const rect = header.getBoundingClientRect()
    if (rect.top < top - .5 && element.getBoundingClientRect().bottom > top + (rect.height || 32) + .5) selected = id
  }
  return selected
}

function useStickyGroup({ scrollElement, groups, active, dragging }: StickyHeaderProps) {
  const [id, setId] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!active || dragging || !scrollElement) { setId(null); return }
    let frame: number | undefined
    const update = () => { frame = undefined; setId(resolveMiraSidebarStickyGroup(scrollElement, groups)) }
    const schedule = () => { if (frame === undefined) frame = window.requestAnimationFrame(update) }
    update()
    scrollElement.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
    observer?.observe(scrollElement)
    const observed = new Set<Element>()
    const syncGroups = () => {
      const mounted = new Set(scrollElement.querySelectorAll('[data-collection-id]'))
      for (const element of observed) if (!mounted.has(element)) { observer?.unobserve(element); observed.delete(element) }
      for (const element of mounted) if (!observed.has(element)) { observer?.observe(element); observed.add(element) }
    }
    syncGroups()
    const mutations = new MutationObserver(() => { syncGroups(); schedule() })
    mutations.observe(scrollElement, { childList: true, subtree: true })
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame); scrollElement.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); observer?.disconnect(); mutations.disconnect() }
  }, [scrollElement, groups, active, dragging])
  return active && !dragging ? groups.find(group => group.id === id && !group.collapsed && !group.renaming) : undefined
}

/** Mount beside the scroll element in a relative wrapper; this overlay never registers with DndContext. */
export function MiraSidebarStickyHeader(props: StickyHeaderProps) {
  const current = useStickyGroup(props)
  const [previous, setPrevious] = useState<MiraSidebarStickyGroup>()
  const latest = useRef({ ...props, current })
  latest.current = { ...props, current }
  useLayoutEffect(() => {
    if (current) { setPrevious(current); return }
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_DURATION
    const timer = window.setTimeout(() => setPrevious(undefined), delay)
    return () => window.clearTimeout(timer)
  }, [current])
  const group = current || previous
  if (!group) return null
  const interactive = Boolean(current)
  const invoke = (id: string, action: (value: StickyHeaderProps) => void | Promise<void>) => {
    const value = latest.current
    if (!value.active || value.dragging || value.current?.id !== id) return
    return action(value)
  }
  return <div className={`mira-sidebar-sticky-slot${interactive ? ' is-visible' : ''}`} hidden={!props.active || props.dragging} aria-hidden={!interactive || undefined} inert={!interactive} data-sticky-group-id={group.id}>
    <FloatingGroupHeader key={`${group.id}:${interactive}`} group={group} interactive={interactive} invoke={invoke} />
  </div>
}

function FloatingGroupHeader({ group, interactive, invoke }: { group: MiraSidebarStickyGroup; interactive: boolean; invoke: (id: string, action: (value: StickyHeaderProps) => void | Promise<void>) => void | Promise<void> }) {
  const [creating, setCreating] = useState(false), [error, setError] = useState('')
  const busy = useRef(false)
  const live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const create = () => {
    if (!interactive || busy.current) return
    busy.current = true; setCreating(true); setError('')
    void Promise.resolve().then(() => invoke(group.id, value => value.onNewTask(group.id))).catch(cause => {
      if (!live.current) return
      invoke(group.id, value => { setError(cause instanceof Error ? cause.message : '新建任务失败，请重试'); value.onError?.(cause) })
    }).finally(() => { busy.current = false; if (live.current) setCreating(false) })
  }
  const toggle = () => { invoke(group.id, value => value.onToggle(group.id)) }
  const color = (value: string) => { invoke(group.id, props => props.onColor(group.id, value as SidebarGroupColor)) }
  const portal = document.getElementById('root')
  const colorButton = <button type="button" className="mira-collection-color" aria-label={`${group.name} 的颜色`} disabled={!interactive}><Hash size={12} aria-hidden="true" /></button>
  const content = <div className="mira-sidebar-sticky-card" data-group-color={group.color}>
    {interactive ? <DropdownMenu.Root modal={false}><DropdownMenu.Trigger asChild>{colorButton}</DropdownMenu.Trigger><DropdownMenu.Portal container={portal}><DropdownMenu.Content className="mira-session-menu" sideOffset={4} align="start"><DropdownMenu.Label className="mira-session-menu__label">分组颜色</DropdownMenu.Label><DropdownMenu.RadioGroup value={group.color} onValueChange={color}>{SIDEBAR_GROUP_COLORS.map(value => <DropdownMenu.RadioItem key={value} value={value} className="mira-session-menu__item"><span className="mira-collection-swatch" data-group-color={value} />{colorLabels[value]}<DropdownMenu.ItemIndicator className="mira-session-menu__arrow"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root> : colorButton}
    <button type="button" className="mira-collection-title" aria-label={`折叠 ${group.name}`} aria-expanded={!group.collapsed} disabled={!interactive} onClick={toggle}><span title={group.name}>{group.name}</span><ChevronRight size={12} className="is-open" aria-hidden="true" /></button>
    <span className="mira-sidebar-sticky-count">{group.count}</span>
    <SidebarActionHint title="新建任务"><button type="button" className="mira-session-icon" aria-label={`在 ${group.name} 新建任务`} disabled={!interactive || creating} onClick={create}>{creating ? <LoaderCircle size={14} className="pilot-spin" /> : <MessageCirclePlus size={14} />}</button></SidebarActionHint>
    {error && <span className="mira-sidebar-sticky-error" role="alert">{error}</span>}
  </div>
  if (!interactive) return content
  return <ContextMenu.Root><ContextMenu.Trigger asChild>{content}</ContextMenu.Trigger><ContextMenu.Portal container={portal}><ContextMenu.Content className="mira-session-menu"><ContextMenu.Item className="mira-session-menu__item" disabled={creating} onSelect={create}><MessageCirclePlus size={14} />新建任务</ContextMenu.Item><ContextMenu.Separator className="mira-session-menu__separator" /><ContextMenu.Sub><ContextMenu.SubTrigger className="mira-session-menu__item"><Hash size={14} />更改颜色<ChevronRight size={13} className="mira-session-menu__arrow" /></ContextMenu.SubTrigger><ContextMenu.Portal container={portal}><ContextMenu.SubContent className="mira-session-menu">{SIDEBAR_GROUP_COLORS.map(value => <ContextMenu.Item key={value} className="mira-session-menu__item" onSelect={() => color(value)}><span className="mira-collection-swatch" data-group-color={value} />{colorLabels[value]}{value === group.color && <Check size={13} className="mira-session-menu__arrow" />}</ContextMenu.Item>)}</ContextMenu.SubContent></ContextMenu.Portal></ContextMenu.Sub><ContextMenu.Separator className="mira-session-menu__separator" /><ContextMenu.Item className="mira-session-menu__item" onSelect={() => invoke(group.id, value => value.onUngroup(group.id))}><Ungroup size={14} />解散「{group.name}」</ContextMenu.Item><ContextMenu.Label className="mira-session-menu__label">任务保留并回到未分组</ContextMenu.Label></ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>
}
