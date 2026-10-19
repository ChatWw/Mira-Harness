import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Folder, Hand, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { HarnessProject, PermissionMode } from '../../../../../src/config/harness'
import { COMPOSER_REASONING_CHOICES } from '../../lib/model-reasoning'

export const COMPOSER_PERMISSIONS: Array<{ value: PermissionMode; label: string; description: string }> = [
  { value: 'default', label: '逐次确认', description: '工具执行前由你确认' },
  { value: 'auto-approve', label: '自动审核', description: '常规自动审核，危险操作拦截' },
  { value: 'full', label: '完全访问', description: '免确认，危险命令仍拦截' },
]
export const composerPermissionIcon = (value: PermissionMode) => value === 'default' ? Hand : value === 'auto-approve' ? ShieldCheck : ShieldAlert

export function ComposerPermissionOptions({ disabled = [] }: { disabled?: PermissionMode[] }) {
  return <>{COMPOSER_PERMISSIONS.map(item => { const Icon = composerPermissionIcon(item.value); return <DropdownMenu.RadioItem key={item.value} value={item.value} disabled={disabled.includes(item.value)} className="harness-composer__menu-item harness-composer__mode-option"><Icon size={16} /><span><strong>{item.label}</strong><small>{item.description}</small></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem> })}</>
}
export function ComposerReasoningOptions() {
  return <>{COMPOSER_REASONING_CHOICES.map(choice => <DropdownMenu.RadioItem key={choice.value} value={choice.value} className="harness-composer__menu-item"><span>{choice.label}</span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</>
}
export function ComposerProjectOptions({ projects }: { projects: HarnessProject[] }) {
  return <>{projects.map(project => <DropdownMenu.RadioItem key={project.id} value={project.id} disabled={!project.directoryExists} className="harness-composer__menu-item"><Folder size={16} /><span><strong>{project.name}</strong></span><DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>)}</>
}
