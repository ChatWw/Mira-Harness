import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, X } from 'lucide-react'
import type { PilotController } from '../../state/pilot-state'

export function MiraTaskTitleEditor({ sessionId, title, controller, onClose }: { sessionId: string; title: string; controller: Pick<PilotController, 'getSnapshot' | 'renameSession'>; onClose: () => void }) {
  const [value, setValue] = useState(title)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const composing = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const current = () => mounted.current && controller.getSnapshot().session?.id === sessionId
  const submit = async () => {
    if (!current() || pending.current || composing.current || !value.trim()) return
    pending.current = true; setSubmitting(true); setError('')
    try {
      // 目标取进入重命名时的任务；保存失败保留输入，切换后的旧请求也不能关闭新任务编辑器。
      if (await controller.renameSession(sessionId, value.trim().slice(0, 42))) { if (current()) onClose() }
      else if (current()) setError(controller.getSnapshot().error || '任务名称未保存，请重试。')
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : '任务名称未保存，请重试。') }
    finally { pending.current = false; setSubmitting(false) }
  }
  if (!current()) return null
  return <form className="mira-thread-rename" aria-busy={submitting || undefined} onSubmit={event => { event.preventDefault(); void submit() }}>
    <input autoFocus aria-label="任务名称" value={value} disabled={submitting} title={error || undefined} aria-invalid={Boolean(error)} onChange={event => setValue(event.target.value)} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onKeyDown={event => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return
      // 中文输入法 Enter/Escape 只用于确认/取消候选，不提交或关闭重命名。
      const ime = composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
      if (ime) { event.stopPropagation(); if (event.key === 'Enter') event.preventDefault(); return }
      event.preventDefault(); event.stopPropagation()
      if (event.key === 'Enter') void submit()
      else if (!pending.current) onClose()
    }} />
    {error && <span className="shrink-0 text-destructive" title={error} role="alert"><CircleAlert size={14} /><span className="sr-only">{error}</span></span>}
    <button type="submit" aria-label="保存任务名称" disabled={submitting || !value.trim()}><Check size={14} /></button>
    <button type="button" aria-label="取消重命名" disabled={submitting} onClick={onClose}><X size={14} /></button>
  </form>
}
