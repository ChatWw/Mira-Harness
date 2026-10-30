import { MiraQueuedSummary } from './MiraStreamMotion'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronRight, Search } from 'lucide-react'
import type { MiraAssistantWorkItem } from '../../lib/tool-exploration'
import { miraExplorationLabel, miraExplorationSummary } from '../../lib/tool-exploration'
import { miraCommandExecutionStatus, miraRecordedCommand } from '../../lib/mira-command-presentation'
import { useMiraConversationDetail, useMiraToolFilePath } from './MiraConversationDetails'
import { ToolRecord } from './run-progress'
import { MiraToolFileChip } from './MiraToolFileChip'

export function MiraToolExploration({ item, onOpenFile, onOpenCommand }: { item: Extract<MiraAssistantWorkItem, { kind: 'exploration' }>; onOpenFile?: (path: string) => void; onOpenCommand?: (runId: string, toolId: string) => void }) {
  const first = item.entries[0]!.tool
  const [expanded, setExpanded] = useMiraConversationDetail(JSON.stringify(['exploration', first.runId, first.subtaskId, item.firstId]))
  const tools = item.entries.map(entry => entry.tool)
  const current = [...tools].reverse().find(tool => miraCommandExecutionStatus(tool) === 'running' && (item.live || tool.commandJob?.mode === 'background'))
  const live = Boolean(current)
  const failed = tools.filter(tool => miraCommandExecutionStatus(tool) === 'failed').length
  const cancelled = tools.filter(tool => miraCommandExecutionStatus(tool) === 'cancelled').length
  const latest = current
  const latestLabel = latest && (latest.tool === 'web_fetch' ? '抓取网页' : miraExplorationLabel(latest))
  const latestTarget = latest?.tool === 'bash' ? miraRecordedCommand(latest) : latest?.target
  const latestPath = useMiraToolFilePath(latest?.target)
  const showLatest = live && !expanded && latest
  const summary = miraExplorationSummary(tools)
  return <Collapsible.Root className="mira-tool-record mira-tool-exploration" open={expanded} onOpenChange={setExpanded} data-tool-group-id={item.firstId} data-tool-group-live={live}>
    <Collapsible.Trigger asChild><div role="button" tabIndex={0} className="mira-tool-summary" aria-label={`${expanded ? '收起' : '展开'}查阅过程`} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click() } }}>
      <Search size={16} aria-hidden="true" /><strong>查阅</strong>
      {showLatest ? <span className="mira-tool-current"><MiraQueuedSummary contentKey={latest.id} version={latestTarget} enabled={Boolean(showLatest)}><span>{latestLabel}</span>{latest.tool === 'read' && latest.target ? <MiraToolFileChip path={latestPath ?? latest.target} onOpen={latestPath && onOpenFile ? () => onOpenFile(latestPath) : undefined} /> : <span title={latestTarget}>{latestTarget}</span>}</MiraQueuedSummary></span> : <span title={summary}>{summary}</span>}
      {failed > 0 && <small className="mira-tool-error">{failed} 项失败</small>}
      {cancelled > 0 && <small>{cancelled} 项已取消</small>}
      {live && <small>进行中</small>}<ChevronRight size={16} className="mira-tool-chevron" aria-hidden="true" />
    </div></Collapsible.Trigger>
    {expanded && <Collapsible.Content className="mira-exploration-content">{item.entries.map(({ part, tool }) => <div key={part.id} className="mira-assistant-part" data-message-part-id={part.id} data-message-part-type="tool"><ToolRecord tool={tool} onOpenFile={onOpenFile} onOpenCommand={onOpenCommand} hideIcon /></div>)}</Collapsible.Content>}
  </Collapsible.Root>
}
