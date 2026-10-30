import { Activity, FileDiff, FolderOpen, Globe, LoaderCircle, MessageSquareText, SquareTerminal } from 'lucide-react'
import { workspaceTabLabel, type WorkspaceResourceId } from '../../state/workspace-state'

const choices: Array<{ id: WorkspaceResourceId; icon: typeof Activity; description: string }> = [
  { id: 'files', icon: FolderOpen, description: '从目录中选择一个文件。' },
  { id: 'browser', icon: Globe, description: '浏览网页和预览应用。' },
  { id: 'terminal', icon: SquareTerminal, description: '运行命令和查看输出。' },
  { id: 'changes', icon: FileDiff, description: '查看代码变更与差异。' },
  { id: 'side-chat', icon: MessageSquareText, description: '在侧边面板中继续对话。' },
  { id: 'overview', icon: Activity, description: '查看任务执行过程与调用记录。' },
]

export function WorkspaceLauncher({ busy = false, onOpen }: { busy?: boolean; onOpen: (id: WorkspaceResourceId) => void }) {
  return <div className="mira-workspace-launcher" aria-busy={busy}>
    <div className="mira-workspace-launcher__content">
      <h2>新标签页</h2>
      <div className="mira-workspace-launcher__list">
        {choices.map(({ id, icon: Icon, description }) => <button key={id} type="button" data-workspace-launcher-item={id} disabled={busy} onClick={() => onOpen(id)}>
          <span className="mira-workspace-launcher__icon"><Icon size={24} aria-hidden="true" /></span>
          <span className="mira-workspace-launcher__text"><span className="mira-workspace-launcher__label">{workspaceTabLabel(id)}</span><span className="mira-workspace-launcher__description" title={description}>{description}</span></span>
          <span className="mira-workspace-launcher__action" aria-hidden="true">打开</span>
        </button>)}
      </div>
      {busy && <div className="mira-workspace-launcher__status" role="status"><LoaderCircle size={14} aria-hidden="true" /><span>正在准备工作区…</span></div>}
    </div>
  </div>
}
