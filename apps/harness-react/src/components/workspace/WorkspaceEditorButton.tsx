/* Editor affordance adapted from ZCode WorkspaceEditorButtonGroup.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: shared host preference and visible failure reporting.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { Check, ChevronDown, ExternalLink, LoaderCircle, RotateCw } from 'lucide-react'
import { workspaceEditorIcon, type WorkspaceEditorInfo } from '../../lib/workspace-editors'

type WorkspaceEditorButtonProps = {
  editors: WorkspaceEditorInfo[]
  selectedEditor?: WorkspaceEditorInfo
  disabled: boolean
  loading: boolean
  error?: string
  onRetry(): void
  onOpen(editorId: string, remember: boolean): Promise<void>
}

export function WorkspaceEditorButton({ editors, selectedEditor, disabled, loading, error, onRetry, onOpen }: WorkspaceEditorButtonProps) {
  const [opening, setOpening] = useState(false)
  async function open(editorId: string, remember: boolean) {
    if (opening) return
    setOpening(true)
    try { await onOpen(editorId, remember) } finally { setOpening(false) }
  }
  const directoryEditors = editors.filter(editor => !editor.fileOnly)
  const directoryEditor = selectedEditor?.fileOnly ? directoryEditors[0] : selectedEditor
  const label = directoryEditor ? `在 ${directoryEditor.name} 中打开` : '在编辑器中打开'
  const icon = workspaceEditorIcon(directoryEditor?.icon)
  return <div className="mira-editor-button" aria-label="工作目录打开方式">
    <button type="button" className="mira-editor-button__open" disabled={disabled || loading || opening || !directoryEditor} title={label} aria-label={label} onClick={() => { if (directoryEditor) void open(directoryEditor.id, false) }}>
      {loading || opening ? <LoaderCircle size={15} className="pilot-spin" /> : icon ? <img src={icon} alt="" /> : <ExternalLink size={16} />}
    </button>
    <DropdownMenu.Root><DropdownMenu.Trigger type="button" className="mira-editor-button__select" aria-label="选择打开方式" title="选择打开方式"><ChevronDown size={12} /></DropdownMenu.Trigger>
      <DropdownMenu.Portal container={typeof document === 'undefined' ? undefined : document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu mira-editor-menu" align="end" sideOffset={4}>
        {error && <DropdownMenu.Label className="mira-editor-menu__error" role="alert">{error}</DropdownMenu.Label>}
        {loading ? <DropdownMenu.Label className="mira-session-menu__label">正在检测应用…</DropdownMenu.Label> : <DropdownMenu.RadioGroup value={directoryEditor?.id}>
          {directoryEditors.map(editor => <DropdownMenu.RadioItem key={editor.id} value={editor.id} disabled={disabled || opening} onSelect={() => void open(editor.id, true)} className="mira-session-menu__item mira-editor-menu__item">
            {workspaceEditorIcon(editor.icon) ? <img src={workspaceEditorIcon(editor.icon)} alt="" /> : <ExternalLink size={16} />}<span>{editor.name}</span><DropdownMenu.ItemIndicator><Check size={14} /></DropdownMenu.ItemIndicator>
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>}
        {!loading && !directoryEditors.length && !error && <DropdownMenu.Label className="mira-session-menu__label">未检测到可用编辑器</DropdownMenu.Label>}
        <DropdownMenu.Separator className="mira-session-menu__separator" /><DropdownMenu.Item className="mira-session-menu__item" disabled={loading} onSelect={onRetry}><RotateCw size={14} />重新检测应用</DropdownMenu.Item>
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>
}
