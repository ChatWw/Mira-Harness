/* Background task entry adapted from ZCode ConversationBackgroundWorkTrigger.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import { Bot } from 'lucide-react'
import type { HarnessSubtask } from '../../../../../src/config/harness'
import { ComposerControlHint } from './ComposerControlHint'

export function MiraBackgroundTasksTrigger({ subtasks, disabled = false, onOpen }: {
  subtasks: readonly HarnessSubtask[]
  disabled?: boolean
  onOpen: (subtaskId?: string) => void
}) {
  const active = subtasks.filter(task => task.status === 'queued' || task.status === 'running' || task.status === 'stopping')
  if (!active.length) return null
  return <ComposerControlHint title={active.length === 1 ? '打开进行中的智能体' : '查看进行中的智能体任务'}>
    <button type="button" className="mira-background-tasks-trigger" aria-label={`查看 ${active.length} 个进行中的智能体任务`} disabled={disabled} onClick={() => onOpen(active.length === 1 ? active[0].id : undefined)}>
      <Bot size={14} aria-hidden="true" /><span aria-hidden="true">{active.length}</span>
    </button>
  </ComposerControlHint>
}
