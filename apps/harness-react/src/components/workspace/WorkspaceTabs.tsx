import { useEffect, useRef } from 'react'
import { Activity, FileCode2, GitCompare, Globe2, Plus, TerminalSquare, X } from 'lucide-react'
import { workspaceTabLabel, type WorkspaceTab, type WorkspaceTabId } from '../../state/workspace-state'

export function WorkspaceTabs({ tabs, active, changes, onOpen, onActivate, onClose }: { tabs: WorkspaceTab[]; active: WorkspaceTabId; changes: number; onOpen: (id: WorkspaceTabId) => void; onActivate: (id: WorkspaceTabId) => void; onClose: (id: WorkspaceTabId) => void }) {
  const menuRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (event instanceof PointerEvent && menuRef.current?.contains(event.target as Node)) return
      if (menuRef.current?.open) menuRef.current.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [])
  const choices: Array<{ id: WorkspaceTabId; icon: typeof Activity }> = [
    { id: 'files', icon: FileCode2 }, { id: 'changes', icon: GitCompare },
    { id: 'terminal', icon: TerminalSquare }, { id: 'browser', icon: Globe2 },
  ]
  const icons = { overview: Activity, files: FileCode2, changes: GitCompare, terminal: TerminalSquare, browser: Globe2 }
  return <nav className="pilot-side-tabs" aria-label="已打开的工作内容">
    <div className="pilot-side-tabs__list">{tabs.map(tab => {
      const Icon = icons[tab.id]
      return <div key={tab.id} className={`pilot-side-tab${active === tab.id ? ' is-active' : ''}`}>
        <button type="button" className="pilot-side-tab__select" aria-current={active === tab.id ? 'page' : undefined} title={tab.label} onClick={() => onActivate(tab.id)}><Icon size={14} /><span>{tab.label}</span>{tab.id === 'changes' && changes > 0 && <em>{changes}</em>}</button>
        {tab.id !== 'overview' && <button type="button" className="pilot-side-tab__close" title={`关闭${tab.label}`} aria-label={`关闭${tab.label}`} onClick={() => onClose(tab.id)}><X size={12} /></button>}
      </div>
    })}</div>
    <details ref={menuRef} className="pilot-side-tabs__menu"><summary title="打开工作内容" aria-label="打开工作内容"><Plus size={16} /></summary><div className="pilot-side-tabs__options">{choices.map(({ id, icon: Icon }) => <button key={id} type="button" onClick={() => { onOpen(id); if (menuRef.current) menuRef.current.open = false }}><Icon size={15} />{workspaceTabLabel(id)}</button>)}</div></details>
  </nav>
}
