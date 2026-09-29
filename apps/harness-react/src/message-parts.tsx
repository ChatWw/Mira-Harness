import { useState } from 'react'
import { Check, Copy, FileText, GitCompare, Pencil, RotateCw } from 'lucide-react'
import type { HarnessFileChange, HarnessMessage } from '../../../src/config/harness'

const CHANGE_LABELS: Record<HarnessFileChange['tool'], string> = { edit: '编辑', write: '写入', delete: '删除' }

/** 消息内文件变更卡：点击打开工作区的变更标签。 */
export function FileChangesCard({ changes, onOpen }: { changes: HarnessFileChange[]; onOpen: () => void }) {
  return <button type="button" className="pilot-changes-card" onClick={onOpen}>
    <GitCompare size={15} />
    <span>本次修改 {changes.length} 个文件</span>
    <small>{changes.map(change => change.path.split(/[\\/]/).pop()).filter(Boolean).slice(0, 3).join('、')}{changes.length > 3 ? ' 等' : ''}</small>
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

/** 助手消息工具栏：时间 / 用量 / 复制 / 重新生成。 */
export function AssistantToolbar({ message, onRerun }: { message?: HarnessMessage; onRerun?: () => Promise<void> }) {
  const [copied, setCopied] = useState(false)
  if (!message) return null
  const usage = formatUsage(message)
  return <div className="pilot-message__toolbar">
    {message.createdAt ? <span>{formatTime(message.createdAt)}</span> : null}
    {usage && <span>{usage}</span>}
    <button type="button" aria-label="复制回复" title="复制" onClick={() => { void navigator.clipboard.writeText(message.content).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600) }).catch(() => undefined) }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
    {onRerun && <button type="button" aria-label="重新生成" title="重新生成" onClick={() => void onRerun()}><RotateCw size={13} /></button>}
  </div>
}

/** 用户消息行内编辑：确认后截断后续并重跑。 */
export function UserMessageEditor({ original, content, onCancel, onConfirm }: { original?: HarnessMessage; content: string; onCancel: () => void; onConfirm: (next: string) => Promise<void> }) {
  const [value, setValue] = useState(content)
  const [submitting, setSubmitting] = useState(false)
  return <div className="pilot-message-editor">
    <textarea autoFocus value={value} onChange={event => setValue(event.target.value)} aria-label="编辑消息" rows={Math.min(8, value.split('\n').length + 1)} />
    <div className="pilot-message-editor__actions">
      <button type="button" onClick={onCancel} disabled={submitting}>取消</button>
      <button type="button" disabled={!value.trim() || !original || submitting} onClick={() => { setSubmitting(true); void onConfirm(value.trim()).finally(() => setSubmitting(false)) }}>{submitting ? '重新发送中…' : '保存并重跑'}</button>
    </div>
  </div>
}

export function EditIcon() { return <Pencil size={13} /> }
export function FileIcon() { return <FileText size={13} /> }
