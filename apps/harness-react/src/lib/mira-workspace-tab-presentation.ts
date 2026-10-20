/* Search and presentation adapted from ZCode sidePaneTabSearch / sidePaneTabPresentation.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: local resource metadata and identity, Chinese labels, optional real times.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { Activity, AudioLines, FileCode2, FileSpreadsheet, FileText, Workflow, Bot, GitCompare, Globe2, ListChecks, MessageSquare, Presentation, TerminalSquare, Users, Video } from 'lucide-react'
import { miraMediaFormat } from '../../../../src/config/miraMedia'
import { isWorkspaceBrowserTab, isWorkspaceTerminalTab, type WorkspaceTab } from '../state/workspace-state'

export function miraWorkspaceTabPresentation(tab: WorkspaceTab) {
  if (tab.traceSessionId) return { Icon: Activity, type: '模型轨迹', hint: '', aliases: `model trace trajectory 请求 响应 ${tab.traceSessionId}` }
  if (tab.fullCommandOutput) return { Icon: FileText, type: '完整命令输出', hint: '', aliases: `command output log 完整输出 ${tab.runId || ''}` }
  if (tab.commandToolId) return { Icon: TerminalSquare, type: '命令输出', hint: '', aliases: `command output bash 执行输出 ${tab.runId || ''}` }
  if (tab.planToolId) return { Icon: ListChecks, type: '方案', hint: '', aliases: 'plan proposal 会话计划 历史方案' }
  if (isWorkspaceBrowserTab(tab.id)) return { Icon: Globe2, type: '浏览器', hint: tab.url || '', aliases: 'browser web' }
  if (isWorkspaceTerminalTab(tab.id)) return { Icon: TerminalSquare, type: '终端', hint: '', aliases: 'terminal shell command' }
  if (tab.fileManager && !tab.path) return { Icon: FileCode2, type: '文件', hint: tab.fileManager.directory, aliases: 'files folder directory 文件目录' }
  if (tab.path) {
    const media = miraMediaFormat(tab.path)
    if (media?.kind === 'pdf') return { Icon: FileText, type: 'PDF', hint: tab.path, aliases: 'file document pdf 文档' }
    if (media?.kind === 'word') return { Icon: FileText, type: 'Word', hint: tab.path, aliases: 'file document doc docx 文档' }
    if (media?.kind === 'presentation') return { Icon: Presentation, type: 'PowerPoint', hint: tab.path, aliases: 'file presentation pptx 幻灯片 演示文稿' }
    if (media?.kind === 'sheet') return { Icon: FileSpreadsheet, type: 'Excel', hint: tab.path, aliases: 'file spreadsheet xlsx xlsm xls 工作簿 表格' }
    return media ? { Icon: media.kind === 'video' ? Video : AudioLines, type: media.kind === 'video' ? '视频' : '音频', hint: tab.path, aliases: 'file media audio video' } : { Icon: FileCode2, type: '文件', hint: tab.path, aliases: 'file code' }
  }
  if (tab.childSessionId) return { Icon: MessageSquare, type: '侧边栏对话', hint: '', aliases: `side chat ${tab.childSessionId}` }
  if (tab.taskSessionId) return { Icon: MessageSquare, type: '任务', hint: '', aliases: `task conversation ${tab.taskSessionId}` }
  if (tab.subtaskId) return { Icon: Users, type: '智能体', hint: '', aliases: `agent ${tab.subtaskId} ${tab.runId || ''}` }
  if (tab.workflowSessionId) return { Icon: tab.workflowDetail?.kind === 'artifact' ? FileText : tab.workflowDetail?.kind === 'actor' ? Bot : Workflow, type: tab.workflowDetail?.kind === 'artifact' ? '产物' : '工作流', hint: '', aliases: `workflow ${tab.workflowSessionId} ${tab.runId || ''}` }
  if (tab.id === 'git') return { Icon: GitCompare, type: 'Git 更改', hint: '', aliases: 'git repository staged unstaged diff 仓库 暂存' }
  if (tab.id === 'changes') return { Icon: GitCompare, type: '变更', hint: '', aliases: 'git diff changes' }
  return { Icon: Activity, type: '调用轨迹', hint: '', aliases: `activity ${tab.runId || ''}` }
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
