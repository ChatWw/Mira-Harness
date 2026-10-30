import { MiraRemoteControl } from './MiraRemoteControl'
import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChartNoAxesColumn, Check, ChevronRight, Maximize, Palette, Settings, ZoomIn, ZoomOut } from 'lucide-react'
import type { PilotController } from '../../state/pilot-state'
import { miraShortcutLabel } from '../../../../../src/platform/workbenchShortcuts'
import miraLogo from '../../../../../src/asset/mira-mark.png'

export function SidebarFooter({ controller }: { controller: PilotController }) {
  const [appearance, setAppearance] = useState<{ theme: string; zoomFactor: number }>()
  const [busy, setBusy] = useState(false)
  const container = document.getElementById('root')
  const run = (operation: () => Promise<{ theme: string; zoomFactor: number }>) => {
    setBusy(true)
    void operation().then(setAppearance).catch(error => controller.reportError(error)).finally(() => setBusy(false))
  }
  return <footer className="mira-session-footer" aria-label="Mira"><DropdownMenu.Root modal={false} onOpenChange={open => { if (open) run(controller.getAppearance) }}><DropdownMenu.Trigger type="button" className="mira-session-footer__profile" aria-label="Mira 菜单"><img src={miraLogo} alt="" className="mira-session-footer__logo" /><span>Mira</span></DropdownMenu.Trigger><DropdownMenu.Portal container={container}><DropdownMenu.Content className="harness-composer__menu mira-profile-menu" side="top" align="start" sideOffset={8} collisionPadding={12}>
    <DropdownMenu.Sub><DropdownMenu.SubTrigger className="harness-composer__menu-item"><Palette size={16} /><span>界面主题</span><ChevronRight size={14} /></DropdownMenu.SubTrigger><DropdownMenu.Portal container={container}><DropdownMenu.SubContent className="harness-composer__menu mira-profile-submenu" sideOffset={4} collisionPadding={12}><DropdownMenu.RadioGroup value={appearance?.theme} onValueChange={value => run(() => controller.setTheme(value as 'system' | 'light' | 'dark'))}>{[['system', '跟随系统'], ['dark', '深色'], ['light', '浅色']].map(([value, label]) => <DropdownMenu.RadioItem key={value} value={value} disabled={busy || !appearance} className="harness-composer__menu-item"><span>{label}</span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.SubContent></DropdownMenu.Portal></DropdownMenu.Sub>
    <DropdownMenu.Sub><DropdownMenu.SubTrigger className="harness-composer__menu-item"><ZoomIn size={16} /><span>界面缩放</span><ChevronRight size={14} /></DropdownMenu.SubTrigger><DropdownMenu.Portal container={container}><DropdownMenu.SubContent className="harness-composer__menu mira-profile-submenu" sideOffset={4} collisionPadding={12}>{([{ action: 'zoomIn', label: '放大', Icon: ZoomIn, shortcut: '+', disabled: (appearance?.zoomFactor ?? 1) >= 1.1 ** 5 - .001 }, { action: 'zoomOut', label: '缩小', Icon: ZoomOut, shortcut: '-', disabled: (appearance?.zoomFactor ?? 1) <= 1.1 ** -3 + .001 }, { action: 'resetZoom', label: '实际大小', Icon: Maximize, shortcut: '0', disabled: Math.abs((appearance?.zoomFactor ?? 1) - 1) < .001 }] as const).map(({ action, label, Icon, shortcut, disabled }) => <DropdownMenu.Item key={action} disabled={busy || !appearance || disabled} className="harness-composer__menu-item" onSelect={() => run(() => controller.zoom(action))}><Icon size={16} /><span>{label}</span><span className="mira-profile-shortcut">{miraShortcutLabel(shortcut)}</span></DropdownMenu.Item>)}</DropdownMenu.SubContent></DropdownMenu.Portal></DropdownMenu.Sub>
    <DropdownMenu.Separator className="harness-composer__menu-separator" />
    <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => { void controller.navigate('/settings/usage') }}><ChartNoAxesColumn size={16} /><span>使用统计</span></DropdownMenu.Item>
    <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => { void controller.navigate('/settings') }}><Settings size={16} /><span>设置</span></DropdownMenu.Item>
  </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root><MiraRemoteControl controller={controller} /></footer>
}
