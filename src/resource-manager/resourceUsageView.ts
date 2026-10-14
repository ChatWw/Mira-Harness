// Adapted from ZCode resourceUsageView.ts (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode.
import type { MiraResourceSnapshot } from '../config/resourceManager'
export const resourceGroups = [{ id: 'base', title: '基础服务' }, { id: 'builtin-plugin', title: '内置插件' }, { id: 'community-plugin', title: '社区插件' }] as const
export function groupResourceUsage(processes: MiraResourceSnapshot['processes']) {
  return resourceGroups.map(group => {
    const members = processes.filter(row => (row.category ?? 'base') === group.id).sort((a, b) => b.cpuPercent - a.cpuPercent || b.memoryBytes - a.memoryBytes || a.pid - b.pid)
    return { ...group, processes: members, cpuPercent: members.reduce((sum, row) => sum + row.cpuPercent, 0), memoryBytes: members.reduce((sum, row) => sum + row.memoryBytes, 0) }
  })
}
export function clampPercent(value: number) { return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)) }
export function formatPercent(value?: number | null) { return value == null ? '—' : `${(Number.isFinite(value) ? Math.round(value * 10) / 10 : 0).toFixed(1)}%` }
export function formatBytes(bytes?: number) {
  if (bytes == null) return '—'
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes, index = 0
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++ }
  return `${value.toFixed(index === 0 || value >= 100 ? 0 : 1)} ${units[index]}`
}
