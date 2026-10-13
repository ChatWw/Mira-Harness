/* File recovery preview adapted from ZCode ConversationFileRewindDialog.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FileClock, LoaderCircle, X } from 'lucide-react'
import { MIRA_FILE_REWIND_REASONS, type MiraFileRewindPreview, type MiraFileRewindFile, type MiraHistoryEditBlocked, type MiraHistoryEditWorkspace } from '../../../../../src/config/miraFileRewind'
import type { PilotController } from '../../state/pilot-state'

export function MiraFileRewindPreviewButton({ controller, sessionId, messageId, disabled, onEdit }: { controller: PilotController; sessionId: string; messageId: string; disabled?: boolean; onEdit?: (workspace: MiraHistoryEditWorkspace) => Promise<boolean | MiraHistoryEditBlocked> }) {
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<MiraFileRewindPreview>(), [error, setError] = useState('')
  const [applying, setApplying] = useState(false), [notice, setNotice] = useState('')
  const request = useRef(0), mounted = useRef(true), applyingRef = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++ } }, [])
  useEffect(() => { request.current++; setOpen(false); setPreview(undefined); setError(''); setNotice(''); setLoading(false) }, [sessionId, messageId])
  useEffect(() => { if (disabled && !applyingRef.current) { request.current++; setOpen(false); setPreview(undefined); setLoading(false) } }, [disabled])
  async function load() {
    if (disabled || applyingRef.current) return
    const version = ++request.current
    setOpen(true); setLoading(true); setError(''); setNotice(''); setPreview(undefined)
    const current = () => mounted.current && request.current === version && controller.getSnapshot().session?.id === sessionId
    try {
      const value = await controller.previewFileRewind(sessionId, messageId)
      if (current()) setPreview(value)
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : '预览加载失败，请重试。') }
    finally { if (current()) setLoading(false) }
  }
  async function apply(recover = false, preserve = false) {
    if (disabled || applyingRef.current || !preview || !controller.supportsFileRewindApply || (!recover && !preserve && (!preview.canApply || !preview.snapshotToken))) return
    const version = ++request.current, captured = preview
    applyingRef.current = true; setApplying(true); setError(''); setNotice('')
    const current = () => mounted.current && request.current === version && controller.getSnapshot().session?.id === sessionId
    try {
      if (onEdit && !recover) {
        const result = await onEdit(preserve ? { mode: 'preserve' } : { mode: 'rewind', snapshotToken: captured.snapshotToken! })
        if (current()) {
          if (result === true) { setOpen(false); setPreview(undefined) }
          else if (result === false) setError('消息未能重新发送，编辑内容已保留。请检查任务状态或模型后重试。')
          else { setNotice(result.message); setPreview(result.preview) }
        }
        return
      }
      const result = recover ? await controller.recoverFileRewind(sessionId, captured.recoveryId!) : await controller.applyFileRewind(sessionId, messageId, captured.snapshotToken!)
      if (current()) { setNotice(result.message); setPreview(result.applied || recover && !result.preview.recoveryId ? undefined : result.preview) }
    } catch (cause) { if (current()) { setError(cause instanceof Error ? cause.message : '文件恢复未完成，请刷新预览后重试。'); setPreview(undefined) } }
    finally { applyingRef.current = false; if (mounted.current) setApplying(false) }
  }
  const close = () => { if (applyingRef.current) return; request.current++; setOpen(false); setLoading(false) }
  function files(title: string, values: MiraFileRewindFile[], unsafe = false) {
    return values.length > 0 && <section className="mira-rewind-preview-section"><h3>{title} · {values.length}</h3><ul>{values.map((file, index) => <li key={`${file.path}:${index}`}><span title={file.path}>{file.path}</span><small>{unsafe && file.reason ? MIRA_FILE_REWIND_REASONS[file.reason] : file.action === 'delete' ? '移除本段新建文件' : '恢复修改前内容'}{file.operationCount > 0 && ` · ${file.operationCount} 次修改`}</small></li>)}</ul></section>
  }
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) close() }}>
    <Dialog.Trigger asChild><button type="button" className="mira-message-action" disabled={disabled} aria-label={onEdit ? '恢复文件并重跑' : '预览文件恢复'} title={onEdit ? '恢复从此消息开始的文件修改，再保存并重跑' : '预览从此消息开始的文件恢复'} onClick={() => void load()}><FileClock size={onEdit ? 16 : 14} /></button></Dialog.Trigger>
    <Dialog.Portal container={document.getElementById('root')}>
      <Dialog.Overlay className="mira-composer-confirm-overlay" />
      <Dialog.Content className="mira-model-error-dialog mira-rewind-preview-dialog" onEscapeKeyDown={event => { if (applyingRef.current) event.preventDefault() }} onPointerDownOutside={event => { if (applyingRef.current) event.preventDefault() }} onCloseAutoFocus={event => { if (!mounted.current || disabled || controller.getSnapshot().session?.id !== sessionId) event.preventDefault() }}>
        <div className="mira-model-error-dialog-heading"><Dialog.Title>{onEdit ? '恢复文件并重新发送' : '文件恢复预览'}</Dialog.Title><Dialog.Close asChild><button type="button" disabled={applying} aria-label="关闭文件恢复预览"><X size={16} /></button></Dialog.Close></div>
        <Dialog.Description>{onEdit ? '恢复此消息及后续操作的已记录文件修改，保存编辑内容并重新运行。也可以保留当前文件，只重新发送消息。' : '核对此消息及后续操作涉及的文件。确认后恢复已记录的文件改动，对话保持不变。'}</Dialog.Description>
        {loading && <p role="status" className="mira-rewind-preview-status"><LoaderCircle size={15} className="animate-spin" />正在核对文件快照…</p>}
        {error && <div role="alert" className="mira-rewind-preview-status"><span>{error}</span><button type="button" disabled={disabled || applying} onClick={() => void load()}>重试</button></div>}
        {(applying || notice) && <p role="status" className="mira-rewind-preview-status">{applying && <LoaderCircle size={15} className="animate-spin" />}{applying ? onEdit ? '正在核对文件并重新发送…' : '正在恢复文件，请稍候…' : notice}</p>}
        {preview && <div className="mira-rewind-preview-body">
          {files('可恢复', preview.safeFiles)}{files('需要处理', preview.unsafeFiles, true)}
          {preview.ignoredTools.length > 0 && <section className="mira-rewind-preview-section"><h3>未追踪的操作</h3><p>终端和外部工具产生的文件修改不包含在此预览中。</p><ul>{preview.ignoredTools.map(tool => <li key={tool.name}><span>{tool.name}</span><small>{tool.count} 次调用</small></li>)}</ul></section>}
          {!preview.safeFiles.length && !preview.unsafeFiles.length && <p role="status">这段对话没有已记录的文件修改。</p>}
        </div>}
        <div className="mira-model-error-dialog-footer"><span>{preview?.unsafeFiles.length ? '存在冲突或缺失快照，无法安全恢复整段。' : preview?.safeFiles.length ? '恢复前会再次核对文件；终端和外部工具修改不在恢复范围内。' : '对话保持不变。'}</span>
          <Dialog.Close asChild><button type="button" disabled={applying}>{onEdit ? '返回编辑' : '返回对话'}</button></Dialog.Close>
          {notice && preview && !preview.recoveryId && <button type="button" disabled={applying || disabled} onClick={() => void load()}>刷新预览</button>}
          {controller.supportsFileRewindApply && preview?.recoveryId && <button type="button" disabled={disabled || applying} onClick={() => void apply(true)}>重试撤销本次恢复</button>}
          {onEdit && preview && !preview.recoveryId && <button type="button" disabled={disabled || applying || loading} onClick={() => void apply(false, true)}>保留文件并重跑</button>}
          {controller.supportsFileRewindApply && preview?.safeFiles.length && !preview.recoveryId ? <button type="button" className="mira-rewind-apply" disabled={disabled || applying || !preview.canApply || !preview.snapshotToken} onClick={() => void apply()}>{onEdit ? '恢复文件并重跑' : `恢复 ${preview.safeFiles.length} 个文件`}</button> : null}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
