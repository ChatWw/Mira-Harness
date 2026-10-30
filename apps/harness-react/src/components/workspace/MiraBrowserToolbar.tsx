import type { FormEvent } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Bug, ChevronLeft, ChevronRight, Ellipsis, ExternalLink, MonitorSmartphone, MousePointerClick, RefreshCw } from 'lucide-react'
import { ComposerControlHint } from '../composer/ComposerControlHint'

export function MiraBrowserToolbar({ address, loading, ready, canGoBack, canGoForward, canOpenExternal, onAddressChange, onSubmit, onControl, onOpenExternal, freeSize, viewportReady, onToggleFreeSize, picking, canPick, onTogglePicker }: {
  address: string; loading: boolean; ready: boolean; canGoBack: boolean; canGoForward: boolean; canOpenExternal: boolean
  onAddressChange: (value: string) => void; onSubmit: (event: FormEvent) => void
  onControl: (action: 'back' | 'forward' | 'reload' | 'devtools') => void; onOpenExternal: () => void
  freeSize: boolean; viewportReady: boolean; onToggleFreeSize: () => void
  picking: boolean; canPick: boolean; onTogglePicker: () => void
}) {
  return <Tooltip.Provider delayDuration={400} disableHoverableContent><form className="pilot-browser__toolbar" aria-label="浏览器导航" aria-busy={loading} onSubmit={onSubmit}>
    <ComposerControlHint title="后退"><button type="button" onClick={() => onControl('back')} disabled={!canGoBack} aria-label="后退"><ChevronLeft size={16} /></button></ComposerControlHint>
    <ComposerControlHint title="前进"><button type="button" onClick={() => onControl('forward')} disabled={!canGoForward} aria-label="前进"><ChevronRight size={16} /></button></ComposerControlHint>
    <ComposerControlHint title="刷新"><button type="button" onClick={() => onControl('reload')} disabled={!ready} aria-label="刷新"><RefreshCw size={16} className={loading ? 'pilot-spin' : undefined} /></button></ComposerControlHint>
    <ComposerControlHint title={picking ? '取消元素选择 · Esc' : '选择网页元素'}><button type="button" aria-label={picking ? '取消元素选择' : '选择网页元素'} aria-pressed={picking} disabled={!canPick && !picking} onClick={onTogglePicker}><MousePointerClick size={16} /></button></ComposerControlHint>
    <input type="text" value={address} onChange={event => onAddressChange(event.target.value)} onFocus={event => event.currentTarget.select()} placeholder="输入网址或本机地址" aria-label="浏览器地址" spellCheck={false} autoComplete="off" />
    <ComposerControlHint title={freeSize ? '退出自由尺寸' : '自由尺寸'}><button type="button" aria-label={freeSize ? '退出自由尺寸' : '自由尺寸'} aria-pressed={freeSize} disabled={!viewportReady} onClick={onToggleFreeSize}><MonitorSmartphone size={16} /></button></ComposerControlHint>
    <DropdownMenu.Root><ComposerControlHint title="浏览器更多选项"><DropdownMenu.Trigger asChild><button type="button" aria-label="浏览器更多选项"><Ellipsis size={16} /></button></DropdownMenu.Trigger></ComposerControlHint><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" align="end" sideOffset={5}>
      <DropdownMenu.Item className="mira-session-menu__item" disabled={!canOpenExternal} onSelect={onOpenExternal}><ExternalLink size={16} /><span>在默认浏览器中打开</span></DropdownMenu.Item>
      <DropdownMenu.Item className="mira-session-menu__item" disabled={!ready} onSelect={() => onControl('devtools')}><Bug size={16} /><span>开发者工具</span></DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
  </form></Tooltip.Provider>
}
