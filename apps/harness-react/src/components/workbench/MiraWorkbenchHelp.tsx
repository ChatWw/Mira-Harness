import { useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Activity, CircleHelp, Info, Keyboard, MessageSquare, Settings } from 'lucide-react'
import { SidebarActionHint } from '../session/SidebarCollectionSection'

export function MiraWorkbenchHelp({ onNavigate, onOpenResources, onShowAbout }: { onNavigate: (path: string) => Promise<void>; onOpenResources: () => Promise<void>; onShowAbout: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  async function navigate(path?: string, about = false) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { await (about ? onShowAbout() : path ? onNavigate(path) : onOpenResources()); setOpen(false) }
    catch { setError(about ? '未能打开关于 Mira，请重试。' : path ? '未能打开页面，当前输入已保留，请重试。' : '未能打开资源管理器，请重试。') }
    finally { pending.current = false; setBusy(false) }
  }
  return <DropdownMenu.Root open={open} onOpenChange={value => { setOpen(value); if (value) setError('') }}>
    <SidebarActionHint side="bottom" title="帮助"><DropdownMenu.Trigger asChild><button type="button" className="mira-header-tool" aria-label="帮助"><CircleHelp size={16} aria-hidden="true" /></button></DropdownMenu.Trigger></SidebarActionHint>
    <DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" align="end" sideOffset={6}>
      <DropdownMenu.Item className="mira-session-menu__item" disabled={busy} onSelect={event => { event.preventDefault(); void navigate('/settings/keyboard-shortcuts') }}><Keyboard size={14} />键盘快捷键</DropdownMenu.Item>
      <DropdownMenu.Item className="mira-session-menu__item" disabled={busy} onSelect={event => { event.preventDefault(); void navigate('/settings/general') }}><Settings size={14} />设置</DropdownMenu.Item>
      <DropdownMenu.Item className="mira-session-menu__item" disabled={busy} onSelect={event => { event.preventDefault(); void navigate() }}><Activity size={14} />资源管理器</DropdownMenu.Item>
      <DropdownMenu.Separator className="mira-session-menu__separator" />
      <DropdownMenu.Item className="mira-session-menu__item" disabled={busy} onSelect={event => { event.preventDefault(); void navigate('/settings/about') }}><MessageSquare size={14} />问题反馈</DropdownMenu.Item>
      <DropdownMenu.Item className="mira-session-menu__item" disabled={busy} onSelect={event => { event.preventDefault(); void navigate(undefined, true) }}><Info size={14} />关于 Mira</DropdownMenu.Item>
      {error && <div className="mira-workbench-help-feedback" role="alert">{error}</div>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>
}
