import type { RefObject } from 'react'
import { FileText, GitCompare } from 'lucide-react'
import type { HarnessFileChange } from '../../../../../src/config/harness'
import { parseDiff } from '../../lib/diff'
import { taskFindTargetKey } from '../../lib/conversation-find'

export function MiraTaskChangesPanel({ changes, selectedChangeId, onSelect, rootRef }: {
  changes: Array<HarnessFileChange & { key: string }>; selectedChangeId?: string
  onSelect: (id: string | undefined) => void; rootRef?: RefObject<HTMLDivElement | null>
}) {
  const totals = changes.reduce((count, change) => { const diff = parseDiff(change.diff || ''); return { added: count.added + diff.added, removed: count.removed + diff.removed } }, { added: 0, removed: 0 })
  return <div ref={rootRef} className="pilot-panel-stack">
    <section className="pilot-panel-section"><h2>本次任务变更 · {changes.length} 个文件</h2>
      {changes.length ? <>
        <div className="pilot-diff-stats"><span>+{totals.added} 行</span><span>-{totals.removed} 行</span></div>
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
      </> : <div className="pilot-empty-panel"><GitCompare size={20} /><span>暂无文件变更</span></div>}
    </section>
  </div>
}
