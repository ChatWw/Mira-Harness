import { useState } from 'react'
import { Check, Copy, FileText, GitCompare, Pencil, RotateCw } from 'lucide-react'
import type { HarnessFileChange, HarnessMessage } from '../../../../../src/config/harness'

export function EditIcon() { return <Pencil size={13} /> }

export function MessageCopyButton({ content, label = '复制回复', onError }: { content: string; label?: string; onError?: (error: unknown) => void }) {
  const [copied, setCopied] = useState(false)
  return <button type="button" className="mira-message-action" aria-label={copied ? '已复制' : label} title={copied ? '已复制' : label} onClick={() => {
    void navigator.clipboard.writeText(content).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600) }).catch(error => onError?.(error))
  }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
}

/** 消息附件使用实际保存的文件引用，不把附件正文再次写入气泡。 */
export function UserMessageAttachments({ message, onOpen }: { message?: HarnessMessage; onOpen: (path: string) => void }) {
  if (!message?.attachments?.length) return null
  return <div className="mira-message-attachments" aria-label="消息附件">{message.attachments.map((attachment, index) => {
    // 工作区预览不接受外部绝对路径；不把已授权的附件读权扩展为任意文件读权。
    const external = attachment.path.startsWith('/') || attachment.path.includes('\\') || /^[a-z]:/i.test(attachment.path)
    return <button key={`${attachment.path}:${index}`} type="button" title={external ? `${attachment.path}\n外部附件，不在当前工作区中` : attachment.path} disabled={external} onClick={() => { if (!external) onOpen(attachment.path) }}><FileText size={15} /><span>{attachment.name || attachment.path}</span></button>
  })}</div>
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
export function UserMessageEditor({ original, content, onCancel, onConfirm }: { original?: HarnessMessage; content: string; onCancel: () => void; onConfirm: (next: string) => Promise<void> }) {
  const [value, setValue] = useState(content)
  const [submitting, setSubmitting] = useState(false)
  return <div className="grid w-full gap-2">
    <textarea autoFocus value={value} onChange={event => setValue(event.target.value)} aria-label="编辑消息" rows={Math.min(8, value.split('\n').length + 1)} className="w-full rounded-xl border border-brand bg-card px-2.5 py-2 text-ui-base text-foreground" />
    <div className="flex justify-end gap-2">
      <button type="button" className="rounded-lg border border-border bg-card px-3 py-1.5 text-ui-sm text-foreground" onClick={onCancel} disabled={submitting}>取消</button>
      <button type="button" className="rounded-lg border border-brand bg-brand px-3 py-1.5 text-ui-sm text-on-accent disabled:opacity-50" disabled={!value.trim() || !original || submitting} onClick={() => { setSubmitting(true); void onConfirm(value.trim()).finally(() => setSubmitting(false)) }}>{submitting ? '重新发送中…' : '保存并重跑'}</button>
    </div>
  </div>
}
