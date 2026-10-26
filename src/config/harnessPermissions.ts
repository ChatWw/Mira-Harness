import type { PermissionConfig, PermissionMode } from './harness'

// 设置页与输入框使用同一套名称和说明；执行规则由宿主审批策略决定。
export const HARNESS_PERMISSION_OPTIONS: Array<{ value: PermissionMode; label: string; description: string }> = [
  { value: 'default', label: '逐次确认', description: '每次执行需要向我确认' },
  { value: 'auto-approve', label: '自动审核', description: '有风险时询问' },
  { value: 'full', label: '完全访问', description: '减少确认次数' },
]

export function resolveAvailablePermission(mode: PermissionMode, config: Pick<PermissionConfig, 'autoApproveEnabled' | 'fullAccessEnabled'>): PermissionMode {
  if (mode === 'full' && !config.fullAccessEnabled) mode = 'auto-approve'
  if (mode === 'auto-approve' && !config.autoApproveEnabled) mode = 'default'
  return mode
}
