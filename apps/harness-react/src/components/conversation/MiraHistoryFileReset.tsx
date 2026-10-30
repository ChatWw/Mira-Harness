import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tooltip from '@radix-ui/react-tooltip'
import { FileClock, LoaderCircle, X } from 'lucide-react'
import { MIRA_FILE_REWIND_REASONS, type MiraFileRewindPreview, type MiraHistoryEditBlocked, type MiraHistoryEditWorkspace } from '../../../../../src/config/miraFileRewind'
import type { PilotController } from '../../state/pilot-state'

type Props = { controller: PilotController; sessionId: string; messageId: string; disabled?: boolean; onEdit: (workspace: MiraHistoryEditWorkspace) => Promise<boolean | MiraHistoryEditBlocked> }

export function MiraHistoryFileReset({ controller, sessionId, messageId, disabled, onEdit }: Props) {
  const [availability, setAvailability] = useState<MiraFileRewindPreview>()
  const [conflict, setConflict] = useState<MiraFileRewindPreview>()
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const mounted = useRef(false), pending = useRef(false), revision = useRef(0)
  useEffect(() => {
    mounted.current = true
    revision.current++
    let active = true
    setAvailability(undefined); setConflict(undefined); setOpen(false); setError('')
    void controller.previewFileRewind(sessionId, messageId).then(value => {
      if (active) setAvailability(value)
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '文件状态加载失败，请重试。') })
    return () => { active = false; mounted.current = false; revision.current++ }
  }, [controller, sessionId, messageId])
  useEffect(() => { if (disabled && !pending.current) { revision.current++; setOpen(false) } }, [disabled])
  const noFiles = availability && !availability.safeFiles.length && !availability.unsafeFiles.length && !availability.ignoredTools.length
  const unavailable = disabled || busy || Boolean(noFiles) || !availability && !error
  async function reset(preserve = false) {
    if (disabled || pending.current) return
    pending.current = true; setBusy(true); setError('')
    const version = ++revision.current
    const current = () => mounted.current && revision.current === version && controller.getSnapshot().session?.id === sessionId
    try {
      let workspace: MiraHistoryEditWorkspace = { mode: 'preserve' }
      if (!preserve) {
        // The backend revalidates this token atomically before touching files or trimming history.
        const preview = await controller.previewFileRewind(sessionId, messageId)
        if (!current()) return
        setAvailability(preview)
        if (!preview.canApply || !preview.snapshotToken) {
          if (preview.safeFiles.length || preview.unsafeFiles.length || preview.ignoredTools.length) { setConflict(preview); setOpen(true) }
          return
        }
        workspace = { mode: 'rewind', snapshotToken: preview.snapshotToken }
      }
      const result = await onEdit(workspace)
      if (!current()) return
      if (result === true) setOpen(false)
      else if (result === false) setError('消息未能发送，编辑内容已保留。请重试。')
      else { setConflict(result.preview); setOpen(true) }
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : '文件重置失败，编辑内容已保留。') }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <>
    <Tooltip.Provider delayDuration={300}><Tooltip.Root><Tooltip.Trigger asChild><span className="inline-flex"><button type="button" className="mira-message-action mira-history-edit-rewind" aria-label="对话 + 文件重置" disabled={unavailable} onClick={() => void reset()}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <FileClock size={16} />}</button></span></Tooltip.Trigger><Tooltip.Portal container={document.getElementById('root')}><Tooltip.Content className="mira-composer-hint mira-history-edit-hint" side="top" sideOffset={2}>与文件一起重置{noFiles && <span>本轮没有可安全恢复的文件改动</span>}</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>
    {error && !open && <span role="alert" className="text-ui-xs text-destructive">{error}</span>}
    <Dialog.Root open={open} onOpenChange={value => { if (!pending.current) setOpen(value) }}><Dialog.Portal container={document.getElementById('root')}>
      <Dialog.Overlay className="mira-history-reset-overlay" />
      <Dialog.Content className="mira-history-reset-dialog" onEscapeKeyDown={event => { if (pending.current) event.preventDefault() }} onPointerDownOutside={event => { if (pending.current) event.preventDefault() }}>
        <div className="mira-history-reset-heading"><Dialog.Title>文件无法安全重置</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="关闭" disabled={busy}><X size={14} /></button></Dialog.Close></div>
        <Dialog.Description>对话尚未裁剪。请检查冲突或忽略的文件，然后仅重置对话并发送，或取消。</Dialog.Description>
        <div className="mira-history-reset-body">
          <section><h3>不能安全撤销 {conflict?.unsafeFiles.length ?? 0}</h3>{conflict?.unsafeFiles.map(file => <div className="mira-history-reset-file" key={file.path}><span title={file.path}>{file.path}</span><small>{file.reason === 'external_modified' ? '当前文件已被外部修改' : file.reason ? MIRA_FILE_REWIND_REASONS[file.reason] : '无法安全还原'}</small></div>)}</section>
          {!!conflict?.ignoredTools.length && <section><h3>已忽略的操作 {conflict.ignoredTools.length}</h3>{conflict.ignoredTools.map(tool => <div className="mira-history-reset-file" key={tool.name}><span>{tool.name}</span><small>{tool.count} 次调用，文件修改未追踪</small></div>)}</section>}
          {error && <p role="alert" className="text-destructive">{error}</p>}
        </div>
        <div className="mira-history-reset-footer"><Dialog.Close asChild><button type="button" disabled={busy}>取消</button></Dialog.Close><button type="button" className="mira-history-reset-confirm" disabled={disabled || busy} onClick={() => void reset(true)}>{busy && <LoaderCircle size={14} className="animate-spin" />}仅重置对话并发送</button></div>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </>
}
