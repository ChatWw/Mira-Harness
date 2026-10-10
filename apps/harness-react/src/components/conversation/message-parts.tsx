import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, Copy, FileText, GitCompare, LoaderCircle, Pencil, RotateCw } from 'lucide-react'
import type { HarnessFileChange, HarnessMessage } from '../../../../../src/config/harness'
import type { HarnessMessageAttachment } from '../../../../../src/config/harness'
import { MiraAttachmentPreview } from '../composer/MiraAttachmentPreview'
import type { PilotController } from '../../state/pilot-state'

export function EditIcon() { return <Pencil size={13} /> }

export function MessageCopyButton({ content, label = '复制回复', onError }: { content: string; label?: string; onError?: (error: unknown) => void }) {
  const [copied, setCopied] = useState(false)
  return <button type="button" className="mira-message-action" aria-label={copied ? '已复制' : label} title={copied ? '已复制' : label} onClick={() => {
    void navigator.clipboard.writeText(content).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600) }).catch(error => onError?.(error))
  }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
}

/** 消息附件使用实际保存的文件引用，不把附件正文再次写入气泡。 */
export function UserMessageAttachments({ message, onOpen, sessionId, controller, active = true }: { message?: HarnessMessage; onOpen: (path: string) => void; sessionId?: string; controller?: Pick<PilotController, 'getAttachment'> & Partial<Pick<PilotController, 'saveAttachment' | 'supportsAttachmentSave'>>; active?: boolean }) {
  const [loaded, setLoaded] = useState<Record<string, { attachment?: HarnessMessageAttachment; error?: string }>>({})
  const [retry, setRetry] = useState(0)
  const [preview, setPreview] = useState<{ scope: string; controller?: Pick<PilotController, 'getAttachment'>; attachment: HarnessMessageAttachment }>()
  const requests = useRef(new Map<string, Promise<HarnessMessageAttachment>>())
  const currentLoaded = useRef(loaded)
  currentLoaded.current = loaded
  const attachments = message?.attachments ?? []
  const scope = JSON.stringify([sessionId, message?.id])
  const key = (path: string) => JSON.stringify([scope, path])
  const paths = JSON.stringify(attachments.map(file => file.path))
  const current = useRef({ scope, active, controller, keys: new Set<string>() })
  current.current = { scope, active, controller, keys: new Set(attachments.map(file => key(file.path))) }
  const isCurrent = (fileKey: string) => current.current.active && current.current.scope === scope && current.current.controller === controller && current.current.keys.has(fileKey)
  useEffect(() => {
    current.current.active = active
    requests.current.clear()
    currentLoaded.current = {}
    setLoaded({})
    return () => { current.current.active = false; requests.current.clear() }
  }, [scope, controller, active])
  useEffect(() => {
    const retained = active ? current.current.keys : new Set<string>()
    setLoaded(previous => Object.fromEntries(Object.entries(previous).filter(([fileKey]) => retained.has(fileKey))))
    for (const fileKey of requests.current.keys()) if (!retained.has(fileKey)) requests.current.delete(fileKey)
    if (!active || !sessionId || !controller) return
    for (const file of attachments) {
      const fileKey = key(file.path)
      if (!file.mediaType || file.content || currentLoaded.current[fileKey] || requests.current.has(fileKey)) continue
      const request = Promise.resolve().then(() => controller.getAttachment(sessionId, file.path))
      requests.current.set(fileKey, request)
      void request.then(attachment => {
        if (isCurrent(fileKey) && requests.current.get(fileKey) === request) setLoaded(previous => ({ ...previous, [fileKey]: { attachment } }))
      }, error => {
        if (isCurrent(fileKey) && requests.current.get(fileKey) === request) setLoaded(previous => ({ ...previous, [fileKey]: { error: error instanceof Error ? error.message : '附件读取失败' } }))
      }).finally(() => { if (requests.current.get(fileKey) === request) requests.current.delete(fileKey) })
    }
  }, [scope, paths, active, controller, retry])
  useEffect(() => { setPreview(undefined) }, [scope, paths, active, controller])
  const retryAttachment = (path: string) => {
    const next = { ...currentLoaded.current }; delete next[key(path)]; currentLoaded.current = next; setLoaded(next); setRetry(value => value + 1)
  }
  if (!attachments.length) return null
  return <><div className="mira-message-attachments" aria-label="消息附件">{attachments.map((attachment, index) => {
    // 工作区预览不接受外部绝对路径；不把已授权的附件读权扩展为任意文件读权。
    const external = attachment.path.startsWith('/') || attachment.path.includes('\\') || /^[a-z]:/i.test(attachment.path)
    const frozenPreview = Boolean(attachment.mediaType || attachment.path.startsWith('mira-attachment:'))
    const fileKey = key(attachment.path), state = active ? loaded[fileKey] : undefined
    const ready = state?.error ? undefined : attachment.content || !attachment.mediaType ? attachment : state?.attachment
    const loading = Boolean(attachment.mediaType && !ready && !state?.error)
    return <button key={`${attachment.path}:${index}`} type="button" className={attachment.mediaType ? 'mira-message-attachment--image' : undefined} title={state?.error ? `${state.error}\n点击重试` : external && !frozenPreview ? `${attachment.path}\n外部附件，不在当前工作区中` : frozenPreview ? attachment.name : attachment.path} aria-label={`${state?.error ? '重试附件' : loading ? '正在读取附件' : '预览附件'} ${attachment.name || attachment.path}`} aria-busy={loading || undefined} disabled={!active || external && !frozenPreview || loading} onClick={() => {
      if (!isCurrent(fileKey)) return
      if (state?.error) retryAttachment(attachment.path)
      else if (frozenPreview && ready) setPreview({ scope, controller, attachment: ready })
      else if (!external) onOpen(attachment.path)
    }}>{state?.error ? <><CircleAlert size={18} className="mx-auto" /><span>重试</span><span className="sr-only" role="alert">{state.error}</span></> : attachment.mediaType ? ready ? <img src={`data:${ready.mediaType};base64,${ready.content}`} alt={attachment.name} onError={() => {
      if (isCurrent(fileKey)) setLoaded(previous => ({ ...previous, [fileKey]: { error: '图片无法解码，请重试。' } }))
    }} /> : <LoaderCircle size={18} className="mx-auto animate-spin" /> : <><FileText size={15} /><span>{attachment.name || attachment.path}</span></>}</button>
  })}</div><MiraAttachmentPreview attachment={active && preview?.scope === scope && preview.controller === controller && attachments.some(file => file.path === preview.attachment.path) ? preview.attachment : undefined} gallery={attachments.filter(file => file.mediaType).map(file => {
    const state = active ? loaded[key(file.path)] : undefined
    return { path: file.path, name: file.name, attachment: state?.error ? undefined : file.content ? file : state?.attachment, error: state?.error, onRetry: () => retryAttachment(file.path) }
  })} onSave={sessionId && controller?.supportsAttachmentSave && controller.saveAttachment ? attachment => controller.saveAttachment!(sessionId, attachment.path) : undefined} onClose={() => setPreview(undefined)} /></>
}

const CHANGE_LABELS: Record<HarnessFileChange['tool'], string> = { edit: '编辑', write: '写入', delete: '删除' }

/** 消息内文件变更卡：点击打开工作区的变更标签。 */
export function FileChangesCard({ changes, onOpen }: { changes: HarnessFileChange[]; onOpen: () => void }) {
  return <button type="button" className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-background-alt px-2.5 py-1.5 text-ui-sm text-foreground-subtle hover:text-brand" onClick={onOpen}>
    <GitCompare size={14} />
    <span className="shrink-0 font-medium">本次修改 {changes.length} 个文件</span>
    <small className="truncate">{changes.map(change => change.path.split(/[\\/]/).pop()).filter(Boolean).slice(0, 3).join('、')}{changes.length > 3 ? ' 等' : ''}</small>
  </button>
}

function formatTime(createdAt: number) {
  try { return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

function formatUsage(message: HarnessMessage) {
  const usage = message.usage
  if (!usage?.totalTokens) return ''
  const cost = usage.cost?.priced ? ` · ${usage.cost.total.toFixed(4)} ${usage.cost.currency}` : ''
  return `token ${usage.totalTokens}${cost}`
}

/** 消息工具栏（ZCode 模式：hover 才显现）。 */
export function AssistantToolbar({ message, latestAssistantId, canRerun = true, onRerun, onError }: { message?: HarnessMessage; latestAssistantId?: string; canRerun?: boolean; onRerun?: () => Promise<void>; onError?: (error: unknown) => void }) {
  if (!message) return null
  const usage = formatUsage(message)
  return <div className="mt-1 flex items-center gap-1 text-foreground-subtlest">
    {message.createdAt ? <span className="text-ui-xs">{formatTime(message.createdAt)}</span> : null}
    {usage && <span className="text-ui-xs">{usage}</span>}
    <MessageCopyButton content={message.content} onError={onError} />
    {onRerun && message.id === latestAssistantId && <button type="button" className="mira-message-action" disabled={!canRerun} aria-label="重新生成最新回复" title="重新生成最新回复" onClick={() => { if (canRerun) void onRerun().catch(error => onError?.(error)) }}><RotateCw size={13} /></button>}
  </div>
}

/** 用户消息行内编辑：确认后截断后续并重跑。 */
export function UserMessageEditor({ original, content, onCancel, onConfirm, disabled = false }: { original?: HarnessMessage; content: string; onCancel: () => void; onConfirm: (next: string) => Promise<boolean>; disabled?: boolean }) {
  const [value, setValue] = useState(content)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const composing = useRef(false)
  const submit = async () => {
    if (disabled || pending.current || !original || !value.trim()) return
    pending.current = true; setSubmitting(true); setError('')
    try { if (!await onConfirm(value.trim())) setError('消息未能重新发送，请检查任务状态或模型后重试。') }
    catch (cause) { setError(cause instanceof Error ? cause.message : '重新发送失败，请重试。') }
    finally { pending.current = false; setSubmitting(false) }
  }
  return <div className="grid w-full gap-2" aria-busy={submitting || undefined}>
    <textarea autoFocus value={value} disabled={submitting} onChange={event => setValue(event.target.value)} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onKeyDown={event => { if (event.key !== 'Escape') return; event.stopPropagation(); if (!composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !pending.current) { event.preventDefault(); onCancel() } }} aria-label="编辑消息" aria-invalid={Boolean(error)} rows={Math.min(8, value.split('\n').length + 1)} className="w-full rounded-xl border border-brand bg-card px-2.5 py-2 text-ui-base text-foreground" />
    {error && <p role="alert" className="text-ui-sm text-destructive wrap-anywhere">{error}</p>}
    <div className="flex justify-end gap-2">
      <button type="button" className="rounded-lg border border-border bg-card px-3 py-1.5 text-ui-sm text-foreground" onClick={onCancel} disabled={submitting}>取消</button>
      <button type="button" className="rounded-lg border border-brand bg-brand px-3 py-1.5 text-ui-sm text-on-accent disabled:opacity-50" disabled={disabled || !value.trim() || !original || submitting} onClick={() => void submit()}>{submitting ? '重新发送中…' : '保存并重跑'}</button>
    </div>
  </div>
}
