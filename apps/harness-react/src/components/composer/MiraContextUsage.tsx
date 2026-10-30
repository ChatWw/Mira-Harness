import { useEffect, useId, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import type { HarnessContextUsage } from '../../../../../src/config/harness'

const tokenNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })
const fullNumber = new Intl.NumberFormat('en')

export function MiraContextUsage({ usage, contextWindow, disabled }: {
  usage?: HarnessContextUsage; contextWindow?: number; disabled: boolean
}) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), pinned = useRef(false)
  const id = useId()
  const capacity = usage?.contextWindow || contextWindow
  const percentage = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })
  const sources = { messages: '消息', system_prompt: '系统提示词', system_tool_schemas: '系统工具', skills: '技能', mcp_tool_schemas: 'MCP 工具' }
  const breakdown = (usage?.breakdown ?? []).filter(item => Number.isFinite(item.chars) && item.chars > 0).sort((a, b) => b.chars - a.chars)
  const totalChars = breakdown.reduce((total, item) => total + item.chars, 0)
  const tone = (index: number) => `color-mix(in oklab, var(--color-usage-chart-1) ${[100, 78, 58, 42, 28][Math.min(index, 4)]}%, var(--color-surface))`
  const cacheHitRate = usage?.cacheHitRate
  const percent = usage && capacity ? Math.min(100, Math.max(0, usage.usedTokens / capacity * 100)) : undefined
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
  return <Popover.Root open={open && !disabled} onOpenChange={value => { clearClose(); pinned.current = value; setOpen(value) }}>
    <Popover.Trigger asChild><button ref={trigger} type="button" className="harness-composer__usage" disabled={disabled} aria-label={`上下文用量${percent === undefined ? '' : ` ${percentage.format(percent / 100)}`}`} aria-controls={open ? id : undefined} onPointerEnter={reveal} onPointerLeave={deferClose} onFocus={reveal} onBlur={deferClose} onClick={event => { event.preventDefault(); clearClose(); pinned.current = true; setOpen(true) }} onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); pinned.current = true; reveal(); requestAnimationFrame(() => panel.current?.focus({ preventScroll: true })) }
    }}>
      <svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" /><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" pathLength="100" strokeDasharray={`${percent ?? 0} 100`} transform="rotate(-90 8 8)" /></svg>
      <span>{percent === undefined ? '上下文' : `${percentage.format(percent / 100)}`}</span>
    </button></Popover.Trigger>
    <Popover.Portal container={document.getElementById('root')}><Popover.Content ref={panel} tabIndex={-1} id={id} className="mira-context-usage" aria-label="上下文详情" side="top" align="end" sideOffset={2} collisionPadding={8} onPointerEnter={clearClose} onPointerLeave={deferClose} onFocusCapture={clearClose} onBlurCapture={deferClose} onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()} onEscapeKeyDown={event => {
      if (event.isComposing || event.keyCode === 229) { event.preventDefault(); return }
      event.preventDefault(); event.stopPropagation(); pinned.current = false; trigger.current?.focus({ preventScroll: true }); setOpen(false)
    }}>
      <div className="mira-context-usage__heading"><span>上下文容量</span><span title={usage && capacity ? `${fullNumber.format(usage.usedTokens)} / ${fullNumber.format(capacity)} tokens` : undefined}>{usage && capacity ? `${tokenNumber.format(usage.usedTokens)}/${tokenNumber.format(capacity)} (${percentage.format(percent! / 100)})` : capacity ? `${tokenNumber.format(capacity)} tokens` : '容量未知'}</span></div>
      {percent !== undefined && <div className="mira-context-usage__progress" role="progressbar" aria-label="上下文使用比例" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${percent}%` }}>{breakdown.length ? breakdown.map((item, index) => <span key={item.source} style={{ width: `${item.chars / totalChars * 100}%`, background: tone(index) }} />) : <span style={{ width: '100%' }} />}</div></div>}
      {breakdown.length > 0 && <div className="mira-context-usage__breakdown" aria-label="上下文来源占比">{breakdown.map((item, index) => <div key={item.source}><i aria-hidden="true" style={{ background: tone(index) }} /><span>{sources[item.source]}</span><strong>{percentage.format(item.chars / totalChars)}</strong></div>)}</div>}
      {cacheHitRate !== undefined && Number.isFinite(cacheHitRate) && cacheHitRate >= 0.78 && <div className="mira-context-usage__cache"><span>平均缓存命中率</span><strong>{percentage.format(Math.min(1, cacheHitRate))}</strong></div>}
      {!usage && <p>发送任务后显示上下文用量</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>
}
