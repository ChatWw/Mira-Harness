import { MarketIconHint } from './MarketIconHint'
/* Installed-plugin menu interaction follows ZCode PluginStoreCard.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal, Power, Trash2 } from 'lucide-react'

export function MiraPluginMenu({ name, enabled, disabled, onToggle, onRemove }: {
  name: string; enabled: boolean; disabled: boolean; onToggle?: () => void; onRemove?: () => void
}) {
  if (!onToggle && !onRemove) return null
  return <DropdownMenu.Root><MarketIconHint label={`管理插件 ${name}`}><DropdownMenu.Trigger asChild>
    <button className="mira-market-icon" type="button" aria-label={`管理插件 ${name}`} disabled={disabled}><MoreHorizontal size={16} /></button>
  </DropdownMenu.Trigger></MarketIconHint><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" align="end" sideOffset={6}>
    {onToggle && <DropdownMenu.Item className="mira-session-menu__item" disabled={disabled} onSelect={onToggle}><Power size={14} />{enabled ? '停用插件' : '启用插件'}</DropdownMenu.Item>}
    {onToggle && onRemove && <DropdownMenu.Separator className="mira-session-menu__separator" />}
    {onRemove && <DropdownMenu.Item className="mira-session-menu__item" disabled={disabled} onSelect={onRemove}><Trash2 size={14} /><span>移除登记<small className="mira-plugin-menu-note">保留已下载文件</small></span></DropdownMenu.Item>}
  </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
}
