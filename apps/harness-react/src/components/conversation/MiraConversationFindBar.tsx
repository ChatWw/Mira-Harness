// Find-bar presentation adapted from ZCode (Copyright 2026 Z.AI Co., Ltd), Apache-2.0.
// State, navigation and focus restoration are owned by Mira's workbench.
import { useEffect, useId, useRef, type ReactNode } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { ArrowDown, ArrowUp, FileDiff, MessageCircle, Search, X } from 'lucide-react'
import './conversation-find.css'

export interface MiraConversationFindBarProps {
  open: boolean
  focusRequestId: number
  query: string
  scope: 'conversation' | 'changes'
  count: number
  index: number
  onQueryChange: (query: string) => void
  onScopeChange: (scope: 'conversation' | 'changes') => void
  onNavigate: (direction: -1 | 1) => void
  onClose: () => void
}

export function MiraConversationFindBar({ open, focusRequestId, query, scope, count, index, onQueryChange, onScopeChange, onNavigate, onClose }: MiraConversationFindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const descriptionId = useId()
  const hasMatches = Boolean(query.trim()) && count > 0
  const currentIndex = index >= 0 && index < count ? index : 0
  const nextScope = scope === 'conversation' ? 'changes' : 'conversation'
  const nextScopeLabel = nextScope === 'changes' ? '文件变更' : '对话'

  useEffect(() => {
    if (!open) { composing.current = false; return }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open, focusRequestId])
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      // Radix layers consume Escape in document capture; let the active menu/dialog close first.
      if (event.defaultPrevented || event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || composing.current) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])

  if (!open) return null
  const navigate = (direction: -1 | 1) => { if (hasMatches) onNavigate(direction) }
  const control = (label: string, shortcut: string | undefined, onClick: () => void, icon: ReactNode, disabled = false) => <Tooltip.Root><Tooltip.Trigger asChild><span className="mira-conversation-find__control-wrap"><button type="button" className="mira-conversation-find__control" aria-label={label} disabled={disabled} onClick={onClick}>{icon}</button></span></Tooltip.Trigger><Tooltip.Portal container={document.getElementById('root')}><Tooltip.Content className="mira-conversation-find__hint" side="bottom" sideOffset={6}>{label}{shortcut && <kbd>{shortcut}</kbd>}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>

  return <Tooltip.Provider delayDuration={350}><div role="dialog" aria-modal="false" aria-label="任务内查找" aria-describedby={descriptionId} className="mira-conversation-find" data-find-scope={scope}>
    <p id={descriptionId} className="mira-conversation-find__sr-only">输入关键词查找{scope === 'conversation' ? '当前对话' : '当前任务的文件变更'}。Enter 或下方向键跳到下一处，Shift+Enter 或上方向键跳到上一处，Esc 关闭。</p>
    <Search size={14} aria-hidden="true" />
    <input ref={inputRef} type="text" value={query} aria-label={scope === 'conversation' ? '查找对话' : '查找文件变更'} aria-describedby={descriptionId} placeholder={scope === 'conversation' ? '在对话中查找' : '在文件变更中查找'} autoComplete="off" spellCheck={false} onChange={event => onQueryChange(event.target.value)} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onKeyDown={event => {
      if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composing.current) return
      const direction = event.key === 'ArrowUp' || event.key === 'Enter' && event.shiftKey ? -1 : event.key === 'ArrowDown' || event.key === 'Enter' ? 1 : undefined
      if (direction !== undefined) { event.preventDefault(); navigate(direction) }
    }} />
    <span className="mira-conversation-find__count" aria-hidden="true">{hasMatches ? `${currentIndex + 1}/${count}` : '0/0'}</span>
    <span className="mira-conversation-find__sr-only" role="status" aria-live="polite" aria-atomic="true">{query.trim() ? hasMatches ? `第 ${currentIndex + 1} 项，共 ${count} 项匹配` : '没有匹配结果' : '输入关键词开始查找'}</span>
    <div className="mira-conversation-find__controls">
      {control('上一处匹配', 'Shift+Enter / ↑', () => navigate(-1), <ArrowUp size={14} aria-hidden="true" />, !hasMatches)}
      {control('下一处匹配', 'Enter / ↓', () => navigate(1), <ArrowDown size={14} aria-hidden="true" />, !hasMatches)}
      {control(`切换到${nextScopeLabel}查找`, undefined, () => onScopeChange(nextScope), scope === 'conversation' ? <MessageCircle size={14} aria-hidden="true" /> : <FileDiff size={14} aria-hidden="true" />)}
    </div>
    <div className="mira-conversation-find__close">{control('关闭查找', 'Esc', onClose, <X size={14} aria-hidden="true" />)}</div>
  </div></Tooltip.Provider>
}
