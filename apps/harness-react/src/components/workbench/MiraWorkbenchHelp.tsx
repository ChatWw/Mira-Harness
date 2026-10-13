// Help entry adapted from ZCode WorkspaceHelpMenuButton (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode.
import { useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { CircleHelp, Info, Keyboard, LoaderCircle, Settings } from 'lucide-react'
import { SidebarActionHint } from '../session/SidebarCollectionSection'

export function MiraWorkbenchHelp({ onNavigate }: { onNavigate: (path: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  async function navigate(path: string) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { await onNavigate(path); setOpen(false) }
    catch { setError('未能打开页面，当前输入已保留，请重试。') }
    finally { pending.current = false; setBusy(false) }
  }
  return <DropdownMenu.Root open={open} onOpenChange={value => { setOpen(value); if (value) setError('') }}>
    <Tooltip.Provider delayDuration={350}><SidebarActionHint title="帮助"><DropdownMenu.Trigger asChild><button type="button" className="mira-header-tool" aria-label="帮助"><CircleHelp size={16} aria-hidden="true" /></button></DropdownMenu.Trigger></SidebarActionHint></Tooltip.Provider>
    <DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" align="end" sideOffset={6}>
      <DropdownMenu.Item className="mira-session-menu__item" disabled={busy} onSelect={event => { event.preventDefault(); void navigate('/settings/keyboard-shortcuts') }}><Keyboard size={14} />键盘快捷键</DropdownMenu.Item>
      <DropdownMenu.Item className="mira-session-menu__item" disabled={busy} onSelect={event => { event.preventDefault(); void navigate('/settings/general') }}><Settings size={14} />设置</DropdownMenu.Item>
      <DropdownMenu.Separator className="mira-session-menu__separator" />
      <DropdownMenu.Item className="mira-session-menu__item" disabled={busy} onSelect={event => { event.preventDefault(); void navigate('/settings/about') }}><Info size={14} />问题反馈与关于</DropdownMenu.Item>
      {busy && <div className="mira-workbench-help-feedback" role="status"><LoaderCircle size={14} className="animate-spin" />正在保存并打开…</div>}
      {error && <div className="mira-workbench-help-feedback" role="alert">{error}</div>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>
}
