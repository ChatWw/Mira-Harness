import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { LoaderCircle, X } from 'lucide-react'
import type { HarnessSessionSummary } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'

export function SessionDeleteDialog({ session, controller, onClose }: { session: HarnessSessionSummary; controller: PilotController; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const remove = async () => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { await controller.deleteSession(session.id); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '删除失败，请重试。') }
    finally { pending.current = false; setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !pending.current) onClose() }}><Dialog.Portal container={document.getElementById('root')}>
    <Dialog.Overlay className="mira-confirm-overlay" />
    <Dialog.Content className="mira-confirm" onEscapeKeyDown={event => { if (pending.current) event.preventDefault() }} onPointerDownOutside={event => { if (pending.current) event.preventDefault() }}>
      <Dialog.Title>{`删除会话「${session.title || '新任务'}」？`}</Dialog.Title>
      <Dialog.Description>该会话及相关对话记录将被永久删除，无法恢复；磁盘文件不受影响。</Dialog.Description>
      {error && <p className="mira-confirm-error" role="alert">{error}</p>}
      <div className="mira-confirm-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="button" className="mira-confirm-danger" aria-label="确认删除会话" disabled={busy} onClick={() => void remove()}>{busy ? <><LoaderCircle size={14} className="pilot-spin" />正在删除…</> : '删除会话'}</button></div>
      <Dialog.Close asChild><button type="button" className="mira-confirm-close mira-session-icon" aria-label="关闭删除确认" disabled={busy}><X size={16} /></button></Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
