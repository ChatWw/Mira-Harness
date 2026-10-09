// Layout adapted from ZCode; see third-party-licenses/zcode/ADAPTATIONS.md.
import { Activity, FileCode2, GitCompare, Globe2, LoaderCircle, TerminalSquare } from 'lucide-react'
import { workspaceTabLabel, type WorkspaceResourceId } from '../../state/workspace-state'

const choices: Array<{ id: WorkspaceResourceId; icon: typeof Activity }> = [
  { id: 'files', icon: FileCode2 },
  { id: 'changes', icon: GitCompare },
  { id: 'terminal', icon: TerminalSquare },
  { id: 'browser', icon: Globe2 },
  { id: 'overview', icon: Activity },
]

export function WorkspaceLauncher({ busy = false, onOpen }: { busy?: boolean; onOpen: (id: WorkspaceResourceId) => void }) {
  return <div className="mira-workspace-launcher" aria-busy={busy}>
    <div className="mira-workspace-launcher__content">
      <div className="mira-workspace-launcher__intro">
        <h2>打开标签页</h2>
        <p>选择要在侧边面板中打开的标签。</p>
      </div>
      <div className="mira-workspace-launcher__list">
        {choices.map(({ id, icon: Icon }) => <button key={id} type="button" data-workspace-launcher-item={id} disabled={busy} onClick={() => onOpen(id)}><Icon size={16} aria-hidden="true" /><span>{workspaceTabLabel(id)}</span></button>)}
      </div>
      {busy && <div className="mira-workspace-launcher__status" role="status"><LoaderCircle size={14} aria-hidden="true" /><span>正在准备工作区…</span></div>}
    </div>
  </div>
}
