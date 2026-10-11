/* Search and presentation adapted from ZCode sidePaneTabSearch / sidePaneTabPresentation.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: local resource metadata and identity, Chinese labels, optional real times.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { Activity, FileCode2, GitCompare, Globe2, MessageSquare, TerminalSquare, Users } from 'lucide-react'
import { isWorkspaceBrowserTab, isWorkspaceTerminalTab, type WorkspaceTab } from '../state/workspace-state'

export function miraWorkspaceTabPresentation(tab: WorkspaceTab) {
  if (isWorkspaceBrowserTab(tab.id)) return { Icon: Globe2, type: '浏览器', hint: tab.url || '', aliases: 'browser web' }
  if (isWorkspaceTerminalTab(tab.id)) return { Icon: TerminalSquare, type: '终端', hint: '', aliases: 'terminal shell command' }
  if (tab.path) return { Icon: FileCode2, type: '文件', hint: tab.path, aliases: 'file code' }
  if (tab.childSessionId) return { Icon: MessageSquare, type: '旁路对话', hint: '', aliases: `side chat ${tab.childSessionId}` }
  if (tab.taskSessionId) return { Icon: MessageSquare, type: '任务', hint: '', aliases: `task conversation ${tab.taskSessionId}` }
  if (tab.subtaskId) return { Icon: Users, type: '智能体', hint: '', aliases: `agent ${tab.subtaskId} ${tab.runId || ''}` }
  if (tab.id === 'changes') return { Icon: GitCompare, type: '变更', hint: '', aliases: 'git diff changes' }
  return { Icon: Activity, type: '任务活动', hint: '', aliases: `activity ${tab.runId || ''}` }
}

export function miraSearchWorkspaceTabs(tabs: WorkspaceTab[], query: string) {
  const parts = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!parts.length) return tabs
  return tabs.map((tab, index) => {
    const presentation = miraWorkspaceTabPresentation(tab)
    const title = tab.label.toLocaleLowerCase(), hint = presentation.hint.toLocaleLowerCase()
    const type = `${presentation.type} ${presentation.aliases}`.toLocaleLowerCase()
    const all = `${title} ${hint} ${type}`
    const score = parts.every(part => all.includes(part)) ? parts.reduce((total, part) => total + (
      title.startsWith(part) ? 120 : title.split(/[\s/_.:-]+/).some(word => word.startsWith(part)) ? 90 : title.includes(part) ? 70 : hint.includes(part) ? 40 : 20
    ), 0) : 0
    return { tab, index, score }
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.tab)
}

export function miraWorkspaceTabTime(timestamp: number | undefined, now: number) {
  if (!timestamp) return ''
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000))
  if (minutes === 0) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`
  return `${Math.floor(minutes / 1440)}天前`
}
