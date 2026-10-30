import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Copy, ExternalLink, FolderOpen, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PilotController } from '../../state/pilot-state'
import { workspaceEditorIcon, type WorkspaceEditorInfo } from '../../lib/workspace-editors'

export function MiraFileOpenButton({ path, directory, controller, sessionId, active = true, onOpen, onDesktopOnly }: {
  onDesktopOnly?: () => void; path: string; directory: string; controller?: PilotController; sessionId?: string; active?: boolean; onOpen: (path: string) => void
}) {
  const [editors, setEditors] = useState<WorkspaceEditorInfo[]>([])
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const owner = JSON.stringify([sessionId, directory, path, active])
  const current = useRef(owner), version = useRef(0)
  current.current = owner
  useEffect(() => { setEditors([]); setError(''); setBusy(false); setLoading(false); version.current++; return () => { version.current++ } }, [owner, controller])
  async function load() {
    if (!controller || !active) return
    const request = ++version.current
    setLoading(true); setError('')
    try { const items = await controller.listEditors(); if (current.current === owner && version.current === request) setEditors(items) }
    catch { if (current.current === owner && version.current === request) setError('无法读取打开方式，请重试') }
    finally { if (current.current === owner && version.current === request) setLoading(false) }
  }
  async function action(run: () => Promise<unknown>) {
    if (busy || !active || sessionId && controller && controller.getSnapshot().session?.id !== sessionId) return
    const request = ++version.current
    setBusy(true); setError('')
    try { await run() } catch (cause) { if (current.current === owner && version.current === request) setError(cause instanceof Error ? cause.message : '操作失败，请重试') }
    finally { if (current.current === owner && version.current === request) setBusy(false) }
  }
  return <div className="mira-file-open-actions">
    <div className="mira-file-open-button">
      <button type="button" disabled={!active || busy} aria-label={`打开 ${path.split('/').pop()}`} onClick={() => onOpen(path)}>打开</button>
      {onDesktopOnly ? <button type="button" aria-label="打开方式" onClick={onDesktopOnly}><ChevronDown size={13} /></button> : <DropdownMenu.Root onOpenChange={open => { if (open) void load() }}><DropdownMenu.Trigger disabled={!active || busy} aria-label={`${path.split('/').pop()} 的打开方式`}><ChevronDown size={13} /></DropdownMenu.Trigger>
        <DropdownMenu.Portal container={typeof document === 'undefined' ? undefined : document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu mira-editor-menu" align="end" sideOffset={5}>
          {loading && <DropdownMenu.Label className="mira-session-menu__label">正在检测应用…</DropdownMenu.Label>}
          {editors.map(editor => <DropdownMenu.Item key={editor.id} className="mira-session-menu__item" disabled={busy || !sessionId} onSelect={() => void action(() => controller!.openFileInEditorFor(sessionId!, path, editor.id))}>{workspaceEditorIcon(editor.icon) ? <img width={16} height={16} src={workspaceEditorIcon(editor.icon)} alt="" /> : <ExternalLink size={14} />}{editor.name}</DropdownMenu.Item>)}
          {error && <DropdownMenu.Item className="mira-session-menu__item" onSelect={() => void load()}><RotateCw size={14} />重试检测应用</DropdownMenu.Item>}
          {controller && sessionId && <DropdownMenu.Item className="mira-session-menu__item" disabled={busy} onSelect={() => void action(() => controller.revealWorkspaceFile({ sessionId }, path))}><FolderOpen size={14} />在文件管理器中显示</DropdownMenu.Item>}
          <DropdownMenu.Separator className="mira-session-menu__separator" />
          <DropdownMenu.Item className="mira-session-menu__item" disabled={busy || !directory} onSelect={() => void action(() => navigator.clipboard.writeText(`${directory.replace(/[\\/]$/, '')}/${path}`))}><Copy size={14} />复制绝对路径</DropdownMenu.Item>
          <DropdownMenu.Item className="mira-session-menu__item" disabled={busy} onSelect={() => void action(() => navigator.clipboard.writeText(path))}><Copy size={14} />复制相对路径</DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>}
    </div>
    {error && <span className="mira-file-action-error" role="alert">{error}</span>}
  </div>
}
