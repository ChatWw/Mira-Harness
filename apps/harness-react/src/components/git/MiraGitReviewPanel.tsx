/* Repository review with source selection and per-file disclosure. */
import { useState } from 'react'
import { ChevronDown, RotateCw } from 'lucide-react'
import type { HarnessProject } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { miraFileTreeIcon } from '../../lib/mira-file-tree-icon'
import { parseDiff } from '../../lib/diff'
import { useMiraGitTools } from './useMiraGitTools'
import { MiraGitTotals } from './MiraGitTools'

export function MiraGitReviewPanel({ controller, project, active }: { controller: PilotController; project?: HarnessProject; active: boolean }) {
  const { snapshot, error, refresh } = useMiraGitTools({ controller, project, active, blocked: false, onReview: () => {} })
  const [source, setSource] = useState<'unstaged' | 'staged'>('unstaged')
  const files = source === 'staged' ? snapshot?.stagedFiles : snapshot?.unstagedFiles
  const patch = source === 'staged' ? snapshot?.stagedPatch : snapshot?.unstagedPatch
  return <section className="mira-git-review" aria-label="Git 仓库变更">
    <header><strong>Git 更改</strong>{snapshot && <MiraGitTotals snapshot={snapshot} />}<button type="button" aria-label="刷新 Git 更改" onClick={() => void refresh()}><RotateCw size={15} /></button></header>
    <p title={snapshot?.repository}>{snapshot?.repository || project?.directory}</p>
    <div className="mira-git-review__sources" role="group" aria-label="变更来源"><button type="button" aria-pressed={source === 'unstaged'} onClick={() => setSource('unstaged')}>未暂存（{snapshot?.files.filter(file => file.unstaged).length ?? 0}）</button><button type="button" aria-pressed={source === 'staged'} onClick={() => setSource('staged')}>已暂存（{snapshot?.files.filter(file => file.staged).length ?? 0}）</button></div>
    {error ? <p role="alert">{error}</p> : !snapshot ? <p role="status">正在读取 Git 更改…</p> : !patch ? <p>没有{source === 'staged' ? '已暂存' : '未暂存'}更改</p> : files ? <div className="mira-git-review__files">{files.map(file => {
      const icon = miraFileTreeIcon(file.path)
      return <details key={source + ':' + file.path}><summary><img src={icon} alt="" /><span title={file.path}>{file.path}</span><MiraGitTotals snapshot={file} /><ChevronDown size={13} /></summary>{file.binary ? <p>二进制文件已更改</p> : <div className="pilot-diff__lines">{parseDiff(file.patch).lines.map((line, index) => <div key={index} className={'pilot-diff__line pilot-diff__line--' + line.kind}><span>{line.oldLine ?? ''}</span><span>{line.newLine ?? ''}</span><code>{line.text || ' '}</code></div>)}</div>}</details>
    })}</div> : <pre aria-label="Git 差异">{patch}</pre>}
  </section>
}
