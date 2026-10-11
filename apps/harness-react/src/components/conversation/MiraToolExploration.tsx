// Adapted from ZCode ToolCallBlocks/renderers/explore.tsx (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Uses Mira's ordered public message parts.
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronRight, Search } from 'lucide-react'
import type { MiraAssistantWorkItem } from '../../lib/tool-exploration'
import { miraExplorationLabel, miraExplorationSummary } from '../../lib/tool-exploration'
import { miraRecordedCommand } from '../../lib/mira-command-presentation'
import { useMiraConversationDetail, useMiraToolFilePath } from './MiraConversationDetails'
import { ToolRecord } from './run-progress'
import { MiraToolFileChip } from './MiraToolFileChip'

export function MiraToolExploration({ item, onOpenFile }: { item: Extract<MiraAssistantWorkItem, { kind: 'exploration' }>; onOpenFile?: (path: string) => void }) {
  const first = item.entries[0]!.tool
  const [expanded, setExpanded] = useMiraConversationDetail(JSON.stringify(['exploration', first.runId, first.subtaskId, item.firstId]))
  const tools = item.entries.map(entry => entry.tool)
  const failed = tools.filter(tool => tool.status === 'failed').length
  const cancelled = tools.filter(tool => tool.status === 'cancelled').length
  const latest = [...tools].reverse().find(tool => tool.status === 'running') ?? [...tools].reverse().find(tool => tool.tool !== 'read' || Boolean(tool.target?.trim()))
  const latestLabel = latest && (latest.tool === 'web_fetch' ? '抓取网页' : miraExplorationLabel(latest))
  const latestTarget = latest?.tool === 'bash' ? miraRecordedCommand(latest) : latest?.target
  const latestPath = useMiraToolFilePath(latest?.target)
  const showLatest = item.live && !expanded && latest
  const summary = miraExplorationSummary(tools)
  return <Collapsible.Root className="mira-tool-record mira-tool-exploration" open={expanded} onOpenChange={setExpanded} data-tool-group-id={item.firstId} data-tool-group-live={item.live}>
    <Collapsible.Trigger asChild><div role="button" tabIndex={0} className="mira-tool-summary" aria-label={`${expanded ? '收起' : '展开'}查阅过程`} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click() } }}>
      <Search size={16} aria-hidden="true" /><strong>查阅</strong>
      {showLatest ? <span className="mira-tool-current"><span>{latestLabel}</span>{latest.tool === 'read' && latest.target ? <MiraToolFileChip path={latestPath ?? latest.target} onOpen={latestPath && onOpenFile ? () => onOpenFile(latestPath) : undefined} /> : <span title={latestTarget}>{latestTarget}</span>}</span> : <span title={summary}>{summary}</span>}
      {failed > 0 && <small className="mira-tool-error">{failed} 项失败</small>}
      {cancelled > 0 && <small>{cancelled} 项已取消</small>}
      {item.live && <small>进行中</small>}<ChevronRight size={16} className="mira-tool-chevron" aria-hidden="true" />
    </div></Collapsible.Trigger>
    {expanded && <Collapsible.Content className="mira-exploration-content">{item.entries.map(({ part, tool }) => <div key={part.id} className="mira-assistant-part" data-message-part-id={part.id} data-message-part-type="tool"><ToolRecord tool={tool} onOpenFile={onOpenFile} hideIcon /></div>)}</Collapsible.Content>}
  </Collapsible.Root>
}
