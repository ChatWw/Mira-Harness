// Adapted from ZCode ToolCallBlocks/renderers/execute-group.tsx (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Uses only Mira's ordered public command snapshots.
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronRight, TerminalSquare } from 'lucide-react'
import type { MiraAssistantWorkItem } from '../../lib/tool-exploration'
import { miraCommandExecutionStatus, miraRecordedCommand } from '../../lib/mira-command-presentation'
import { useMiraConversationDetail } from './MiraConversationDetails'
import { ToolRecord } from './run-progress'

export function MiraToolCommandGroup({ item, onOpenCommand }: { item: Extract<MiraAssistantWorkItem, { kind: 'commands' }>; onOpenCommand?: (runId: string, toolId: string) => void }) {
  const first = item.entries[0]!.tool
  const [expanded, setExpanded] = useMiraConversationDetail(JSON.stringify(['commands', first.runId, first.subtaskId, item.firstId]))
  const tools = item.entries.map(entry => entry.tool)
  const current = [...tools].reverse().find(tool => miraCommandExecutionStatus(tool) === 'running' && (item.live || tool.commandJob?.mode === 'background'))
  const live = Boolean(current)
  const command = current && miraRecordedCommand(current)
  const failed = tools.filter(tool => miraCommandExecutionStatus(tool) === 'failed').length
  const cancelled = tools.filter(tool => miraCommandExecutionStatus(tool) === 'cancelled').length
  return <Collapsible.Root className="mira-tool-record mira-tool-exploration" open={expanded} onOpenChange={setExpanded} data-tool-group-id={item.firstId} data-tool-group-kind="commands" data-tool-group-live={live}>
    <Collapsible.Trigger asChild><div role="button" tabIndex={0} className="mira-tool-summary" aria-label={`${expanded ? '收起' : '展开'}执行过程`} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click() } }}>
      <TerminalSquare size={16} aria-hidden="true" /><strong>执行</strong>
      {live && !expanded ? <span className="mira-tool-current"><span>正在执行</span><span title={command}>{command}</span></span> : <span>{tools.length} 条命令</span>}
      {failed > 0 && <small className="mira-tool-error">{failed} 项失败</small>}{cancelled > 0 && <small>{cancelled} 项已取消</small>}
      {live && <small>进行中</small>}<ChevronRight size={16} className="mira-tool-chevron" aria-hidden="true" />
    </div></Collapsible.Trigger>
    {expanded && <Collapsible.Content className="mira-exploration-content">{item.entries.map(({ part, tool }) => <div key={part.id} className="mira-assistant-part" data-message-part-id={part.id} data-message-part-type="tool"><ToolRecord tool={tool} onOpenCommand={onOpenCommand} hideIcon /></div>)}</Collapsible.Content>}
  </Collapsible.Root>
}
