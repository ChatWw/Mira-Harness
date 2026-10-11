// Adapted from ZCode ToolCallBlocks/renderers/execute-group.tsx (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Uses only Mira's ordered public command snapshots.
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronRight, TerminalSquare } from 'lucide-react'
import type { MiraAssistantWorkItem } from '../../lib/tool-exploration'
import { miraRecordedCommand } from '../../lib/mira-command-presentation'
import { useMiraConversationDetail } from './MiraConversationDetails'
import { ToolRecord } from './run-progress'

export function MiraToolCommandGroup({ item }: { item: Extract<MiraAssistantWorkItem, { kind: 'commands' }> }) {
  const first = item.entries[0]!.tool
  const [expanded, setExpanded] = useMiraConversationDetail(JSON.stringify(['commands', first.runId, first.subtaskId, item.firstId]))
  const tools = item.entries.map(entry => entry.tool)
  const current = [...tools].reverse().find(tool => tool.status === 'running') ?? tools[tools.length - 1]
  const command = current && miraRecordedCommand(current)
  const failed = tools.filter(tool => tool.status === 'failed').length
  const cancelled = tools.filter(tool => tool.status === 'cancelled').length
  return <Collapsible.Root className="mira-tool-record mira-tool-exploration" open={expanded} onOpenChange={setExpanded} data-tool-group-id={item.firstId} data-tool-group-kind="commands" data-tool-group-live={item.live}>
    <Collapsible.Trigger asChild><div role="button" tabIndex={0} className="mira-tool-summary" aria-label={`${expanded ? '收起' : '展开'}执行过程`} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click() } }}>
      <TerminalSquare size={16} aria-hidden="true" /><strong>执行</strong>
      {item.live && !expanded ? <span className="mira-tool-current"><span>正在执行</span><span title={command}>{command}</span></span> : <span>{tools.length} 条命令</span>}
      {failed > 0 && <small className="mira-tool-error">{failed} 项失败</small>}{cancelled > 0 && <small>{cancelled} 项已取消</small>}
      {item.live && <small>进行中</small>}<ChevronRight size={16} className="mira-tool-chevron" aria-hidden="true" />
    </div></Collapsible.Trigger>
    {expanded && <Collapsible.Content className="mira-exploration-content">{item.entries.map(({ part, tool }) => <div key={part.id} className="mira-assistant-part" data-message-part-id={part.id} data-message-part-type="tool"><ToolRecord tool={tool} hideIcon /></div>)}</Collapsible.Content>}
  </Collapsible.Root>
}
