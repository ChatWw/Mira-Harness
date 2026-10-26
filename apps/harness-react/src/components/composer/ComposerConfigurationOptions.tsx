import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Folder, Hand, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { HarnessProject, PermissionMode } from '../../../../../src/config/harness'
import { HARNESS_PERMISSION_OPTIONS } from '../../../../../src/config/harnessPermissions'
import { COMPOSER_REASONING_CHOICES } from '../../lib/model-reasoning'

export const COMPOSER_PERMISSIONS = HARNESS_PERMISSION_OPTIONS
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
