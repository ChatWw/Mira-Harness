/** Interaction reference: ZCode chat-input-toolbar/contextUsage.tsx.
 * Apache-2.0 provenance: third-party-licenses/zcode; Mira data and Radix integration. */
import { useEffect, useId, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Minimize2 } from 'lucide-react'
import type { HarnessContextUsage } from '../../../../../src/config/harness'

const tokenNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const fullNumber = new Intl.NumberFormat('en')

export function MiraContextUsage({ usage, contextWindow, disabled, compactDisabled, compactReason, compactQueued, compactPending, onCompact }: {
  usage?: HarnessContextUsage; contextWindow?: number; disabled: boolean; compactDisabled: boolean; compactReason?: string; compactQueued: boolean; compactPending: boolean; onCompact: () => Promise<void>
}) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), pinned = useRef(false)
  const id = useId()
  const capacity = usage?.contextWindow || contextWindow
  const percent = usage && capacity ? Math.min(100, Math.max(0, Math.round(usage.usedTokens / capacity * 100))) : undefined
  const clearClose = () => { clearTimeout(closeTimer.current); closeTimer.current = undefined }
  useEffect(() => () => clearClose(), [])
  useEffect(() => { if (disabled) { pinned.current = false; setOpen(false) } }, [disabled])
  const reveal = () => { clearClose(); if (!disabled) setOpen(true) }
  const deferClose = () => {
    clearClose()
    closeTimer.current = setTimeout(() => {
      if (!pinned.current && !panel.current?.contains(document.activeElement) && document.activeElement !== trigger.current) setOpen(false)
    }, 120)
  }
  const compactLabel = compactPending ? '正在压缩上下文' : compactQueued ? '压缩已加入待发送' : '压缩上下文'
  return <Popover.Root open={open && !disabled} onOpenChange={value => { clearClose(); pinned.current = value; setOpen(value) }}>
    <Popover.Trigger asChild><button ref={trigger} type="button" className="harness-composer__usage" disabled={disabled} aria-label={`上下文用量${percent === undefined ? '' : ` ${percent}%`}`} aria-controls={open ? id : undefined} onPointerEnter={reveal} onPointerLeave={deferClose} onFocus={reveal} onBlur={deferClose} onClick={event => { event.preventDefault(); clearClose(); pinned.current = true; setOpen(true) }} onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); pinned.current = true; reveal(); requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()) }
    }}>
      <svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" /><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" pathLength="100" strokeDasharray={`${percent ?? 0} 100`} transform="rotate(-90 8 8)" /></svg>
      <span>{percent === undefined ? '上下文' : `${percent}%`}</span>
    </button></Popover.Trigger>
    <Popover.Portal container={document.getElementById('root')}><Popover.Content ref={panel} id={id} className="mira-context-usage" aria-label="上下文详情" side="top" align="end" sideOffset={6} collisionPadding={8} onPointerEnter={clearClose} onPointerLeave={deferClose} onFocusCapture={clearClose} onBlurCapture={deferClose} onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()} onEscapeKeyDown={event => {
      if (event.isComposing || event.keyCode === 229) { event.preventDefault(); return }
      event.preventDefault(); event.stopPropagation(); pinned.current = false; trigger.current?.focus({ preventScroll: true }); setOpen(false)
    }}>
      <div className="mira-context-usage__heading"><span>上下文窗口</span><span title={usage && capacity ? `${fullNumber.format(usage.usedTokens)} / ${fullNumber.format(capacity)} tokens` : undefined}>{usage && capacity ? `${tokenNumber.format(usage.usedTokens)} / ${tokenNumber.format(capacity)}` : capacity ? `${tokenNumber.format(capacity)} tokens` : '容量未知'}</span></div>
      {percent !== undefined && <div className="mira-context-usage__progress" role="progressbar" aria-label="上下文使用比例" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>}
      <p>{usage ? `${usage.source === 'reported' ? '模型实测' : '本地估算'} · 已使用 ${fullNumber.format(usage.usedTokens)} tokens` : '发送任务后显示上下文用量'}</p>
      <div className="mira-context-usage__footer"><span>{compactReason || '压缩较早内容，保留最近对话与完整历史'}</span><button type="button" disabled={compactDisabled || compactQueued || compactPending} onClick={() => { pinned.current = false; setOpen(false); void onCompact() }}><Minimize2 size={14} />{compactLabel}</button></div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>
}
