import type { RefObject } from 'react'
import { FileText, GitCompare } from 'lucide-react'
import type { HarnessFileChange } from '../../../../../src/config/harness'
import type { MiraTaskChangeSummary } from '../../../../../src/config/miraTaskChanges'
import { parseDiff } from '../../lib/diff'
import { taskFindTargetKey } from '../../lib/conversation-find'

export function MiraTaskChangesPanel({ changes, summary, selectedChangeId, onSelect, rootRef }: {
  changes: Array<HarnessFileChange & { key: string }>; selectedChangeId?: string
  summary?: MiraTaskChangeSummary
  onSelect: (id: string | undefined) => void; rootRef?: RefObject<HTMLDivElement | null>
}) {
  return <div ref={rootRef} className="pilot-panel-stack">
    <section className="pilot-panel-section"><h2>本次任务变更 · {summary?.files.filter(file => !file.unchanged).length ?? new Set(changes.map(change => change.path)).size} 个文件</h2>
      {summary && <>
        <div className="pilot-diff-stats" aria-label="任务净变化"><span>+{summary.added} 行</span><span>-{summary.removed} 行</span></div>
        <p className="mira-task-change-note">{summary.incomplete ? '仅统计已知快照；部分文件无法计算净变化。' : summary.estimated ? '大型替换使用有界估算，逐次操作记录仍可查看。' : '从任务首次修改前到最新记录的文件状态，包含文件恢复；重复编辑不重复计数。'}</p>
        {summary.files.map(file => <div key={file.key}>
          <button type="button" className={`pilot-change ${selectedChangeId === file.key ? 'is-selected' : ''}`} aria-label={`查看 ${file.path} 的任务净变化`} onClick={() => onSelect(selectedChangeId === file.key ? undefined : file.key)}><FileText size={15} /><span>{file.path}</span><small>{file.unchanged ? '无净变化' : file.unavailable ? '无法统计' : `${file.estimated ? '约 ' : ''}+${file.added} -${file.removed}`}</small></button>
          {selectedChangeId === file.key && <div className="pilot-diff" role="region" aria-label={`${file.path} 的任务净变化`}>
            <strong>{file.tool === 'delete' ? '删除' : '修改'} · {file.path} · {file.writes} 次操作</strong>
            {file.diff ? <div className="pilot-diff__lines">{parseDiff(file.diff).lines.map((line, index) => <div key={index} className={`pilot-diff__line pilot-diff__line--${line.kind}`}><span>{line.oldLine ?? ''}</span><span>{line.newLine ?? ''}</span><code>{line.text || ' '}</code></div>)}</div> : <p>{file.unavailable ? '未保存完整首末快照，可查看逐次操作记录。' : '没有可显示的净差异。'}</p>}
            {file.diffTruncated && <p>差异预览已截断，行数来自完整快照；大型替换可能为估算。</p>}
          </div>}
        </div>)}
      </>}
      {summary && changes.length > 0 && <h3>逐次操作记录 · {changes.length} 次</h3>}
      {changes.length ? <>
        {!summary && <p className="mira-task-change-note">历史未保存完整首末快照，以下为逐次操作差异，不汇总为任务净变化。</p>}
        {changes.map(change => {
          const diff = parseDiff(change.diff || '')
          return <div key={change.key}>
            <button type="button" className={`pilot-change ${selectedChangeId === change.key ? 'is-selected' : ''}`} title={`查看 ${change.path} 的变更`} onClick={() => onSelect(selectedChangeId === change.key ? undefined : change.key)}><FileText size={15} /><span>{change.path}</span><small>+{diff.added} -{diff.removed}</small></button>
            {selectedChangeId === change.key && <div className="pilot-diff" aria-label="文件变更预览">
              <strong>{change.tool === 'delete' ? '删除' : change.tool === 'write' ? '写入' : '编辑'} · {change.path}</strong>
              {change.diff ? <div className="pilot-diff__lines" role="region" aria-label={`${change.path} 的差异`}>{diff.lines.map((line, index) => <div key={index} className={`pilot-diff__line pilot-diff__line--${line.kind}`}><span>{line.oldLine ?? ''}</span><span>{line.newLine ?? ''}</span><code data-mira-find-target={taskFindTargetKey(change.key, String(index))}>{line.text || ' '}</code></div>)}</div> : <p>此变更没有可显示的 diff。</p>}
            </div>}
          </div>
        })}
      </> : !summary && <div className="pilot-empty-panel"><GitCompare size={20} /><span>暂无文件变更</span></div>}
    </section>
  </div>
}
