import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { HarnessFileChange } from '../../../../../src/config/harness'
import { miraReplyChangedFiles } from '../../lib/mira-reply-changes'
import { miraFileTreeIcon } from '../../lib/mira-file-tree-icon'
import { parseDiff } from '../../lib/diff'
import { MiraFileOpenButton } from './MiraFileOpenButton'
import type { PilotController } from '../../state/pilot-state'

export function MiraReplyChanges({ changes, onOpen, onOpenFile, directory = '', controller, sessionId, active = true, undo, onDesktopOnly }: {
  changes: HarnessFileChange[]; onOpen: () => void; onOpenFile?: (path: string) => void
  onDesktopOnly?: () => void; directory?: string; controller?: PilotController; sessionId?: string; active?: boolean; undo?: ReactNode
}) {
  const [expanded, setExpanded] = useState(false), [review, setReview] = useState<string>()
  const id = useId(), files = miraReplyChangedFiles(changes)
  if (!files.length) return null
  const known = files.every(file => !file.unavailable), estimated = files.some(file => file.estimated)
  return <section className="mira-reply-changes" aria-label="本轮文件变更">
    <div className="mira-reply-changes__header">
      <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}><ChevronRight size={14} className={expanded ? 'is-expanded' : undefined} /><strong>{files.length} 个文件已更改</strong>{known && <span className="mira-change-stats">{estimated && '约 '}<b>+{files.reduce((total, file) => total + (file.added ?? 0), 0)}</b> <i>-{files.reduce((total, file) => total + (file.removed ?? 0), 0)}</i></span>}</button>
      {undo}
    </div>
    {expanded && <div id={id} className="mira-reply-changes__files">{files.map(file => <div key={file.key}>
      <div className="mira-reply-change">
        <img src={miraFileTreeIcon(file.path)} width={16} height={16} alt="" />
        <div className="mira-reply-change__name" title={file.path}><strong>{file.path.split('/').pop()}</strong><span>{file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : ''}</span></div>
        {file.unavailable ? <span className="mira-change-status">{file.tool === 'delete' ? '已删除' : '已修改'}</span> : <span className="mira-change-stats"><b>+{file.added}</b> <i>-{file.removed}</i></span>}
        <div className="mira-reply-change__actions"><button type="button" aria-label={`审查 ${file.path}`} disabled={!file.diff} aria-expanded={review === file.key} onClick={() => setReview(previous => previous === file.key ? undefined : file.key)}>审查</button>{onOpenFile && file.tool !== 'delete' && <MiraFileOpenButton onDesktopOnly={onDesktopOnly} path={file.path} directory={directory} controller={controller} sessionId={sessionId} active={active} onOpen={onOpenFile} />}</div>
      </div>
      {review === file.key && file.diff && <div className="pilot-diff" role="region" aria-label={`${file.path} 的本轮差异`}><div className="pilot-diff__lines">{parseDiff(file.diff).lines.map((line, index) => <div key={index} className={`pilot-diff__line pilot-diff__line--${line.kind}`}><span>{line.oldLine ?? ''}</span><span>{line.newLine ?? ''}</span><code>{line.text || ' '}</code></div>)}</div>{file.diffTruncated && <p>差异预览已截断。</p>}</div>}
    </div>)}<button type="button" className="mira-reply-changes__all" disabled={!active} onClick={onOpen}>查看任务全部变更</button></div>}
  </section>
}
