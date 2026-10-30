import { Bot, TerminalSquare } from 'lucide-react'
import type { HarnessSubtask, ToolCallRecord } from '../../../../../src/config/harness'
import { ComposerControlHint } from './ComposerControlHint'

export function MiraBackgroundTasksTrigger({ subtasks, commands = [], disabled = false, onOpen, onOpenCommand, onOpenSummary }: {
  subtasks: readonly HarnessSubtask[]
  commands?: readonly ToolCallRecord[]
  onOpenCommand?: (runId: string, toolId: string) => void
  onOpenSummary?: () => void
  disabled?: boolean
  onOpen: (subtaskId?: string) => void
}) {
  const active = subtasks.filter(task => task.status === 'queued' || task.status === 'running' || task.status === 'stopping')
  const shell = commands.filter(tool => !tool.inherited && tool.runId && tool.commandJob?.mode === 'background' && tool.commandJob.status === 'running')
  const count = active.length + shell.length
  if (!count) return null
  const hint = shell.length ? `${shell.length} 条后台命令${active.length ? `，${active.length} 个智能体任务` : ''}` : active.length === 1 ? '打开进行中的智能体' : '查看进行中的智能体任务'
  return <ComposerControlHint title={hint}>
    <button type="button" className="mira-background-tasks-trigger" aria-label={shell.length ? `查看 ${count} 个后台任务` : `查看 ${active.length} 个进行中的智能体任务`} disabled={disabled} onClick={() => { if (shell.length === 1 && !active.length && onOpenCommand) onOpenCommand(shell[0].runId!, shell[0].id); else if (shell.length) onOpenSummary?.(); else onOpen(active.length === 1 ? active[0].id : undefined) }}>
      {active.length > 0 && <Bot size={14} aria-hidden="true" />}{shell.length > 0 && <TerminalSquare size={14} aria-hidden="true" />}<span aria-hidden="true">{count}</span>
    </button>
  </ComposerControlHint>
}
