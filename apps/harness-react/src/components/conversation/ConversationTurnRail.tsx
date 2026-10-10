// Adapted from ZCode ConversationTurnNavigator (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira retains its query/message identities.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as HoverCard from '@radix-ui/react-hover-card'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { HarnessMessage } from '../../../../../src/config/harness'
import { buildConversationQueries } from './conversation-model'

export function ConversationTurnRail({ messages, activeId, onNavigate }: { messages: HarnessMessage[]; activeId: string; onNavigate: (id: string) => void }) {
  const turns = useMemo(() => buildConversationQueries(messages), [messages])
  const [interactionIndex, setInteractionIndex] = useState<number | undefined>()
  const [focusedId, setFocusedId] = useState('')
  const [previewId, setPreviewId] = useState('')
  const railRef = useRef<HTMLDivElement | null>(null)
  const pendingFocus = useRef<{ id: string; origin: HTMLButtonElement } | null>(null)
  const getScrollElement = useCallback(() => railRef.current, [])
  const getItemKey = useCallback((index: number) => turns[index].id, [turns])
  const rail = useVirtualizer({ count: turns.length, getScrollElement, getItemKey, estimateSize: () => 10, overscan: 6 })
  const rows = rail.getVirtualItems()
  const mountedKey = rows.map(row => row.key).join('|')
  const activeIndex = turns.findIndex(turn => turn.id === activeId)

  useEffect(() => {
    if (activeIndex < 0 || turns.length < 2) return
    rail.scrollToIndex(activeIndex, { align: 'auto' })
    const element = railRef.current
    // Initial measurement and scrolling can share a commit; notify the observer after it settles.
    queueMicrotask(() => { if (railRef.current === element) element?.dispatchEvent(new Event('scroll')) })
  }, [activeIndex, turns.length, rail])

  useLayoutEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    if (document.activeElement !== pending.origin && document.activeElement !== document.body) { pendingFocus.current = null; return }
    const button = [...(railRef.current?.querySelectorAll<HTMLButtonElement>('button[data-turn-id]') ?? [])].find(button => button.dataset.turnId === pending.id)
    if (button) { pendingFocus.current = null; button.focus({ preventScroll: true }) }
  }, [mountedKey, focusedId, interactionIndex])

  if (turns.length < 2) return null
  const focusedIndex = turns.findIndex(turn => turn.id === focusedId)
  const visualIndex = interactionIndex ?? (focusedIndex < 0 ? undefined : focusedIndex)
  const candidateIndex = focusedIndex < 0 ? Math.max(0, activeIndex) : focusedIndex
  const tabIndex = rows.some(row => row.index === candidateIndex) ? candidateIndex : rows[0]?.index
  return <nav className="mira-turn-rail" aria-label="对话轮次" data-item-count={turns.length} data-rendered-item-count={rows.length}>
    <div className="mira-turn-rail__items" ref={railRef} onPointerLeave={() => setInteractionIndex(undefined)} onScroll={() => { setInteractionIndex(undefined); if (!railRef.current?.contains(document.activeElement)) setPreviewId('') }}>
      <div className="mira-turn-rail__spacer" style={{ height: rail.getTotalSize() }}>
        {rows.map(row => {
          const index = row.index, turn = turns[index]
          const distance = visualIndex === undefined ? -1 : Math.abs(index - visualIndex)
          const scale = distance === 0 ? 2.6 : distance === 1 ? 1.7 : distance === 2 ? 1.25 : 1
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.86 : distance === 2 ? 0.72 : activeId === turn.id ? 0.9 : turn.running ? 0.72 : 0.58
          return <div key={turn.id} className="mira-turn-rail__row" style={{ transform: `translateY(${row.start}px)` }}>
            <HoverCard.Root openDelay={120} closeDelay={80} open={previewId === turn.id} onOpenChange={open => setPreviewId(current => open ? interactionIndex === index || focusedId === turn.id ? turn.id : current : current === turn.id ? '' : current)}>
              <HoverCard.Trigger asChild>
                <button type="button" aria-label={`跳转到第 ${index + 1} 轮`} aria-current={activeId === turn.id ? 'location' : undefined} aria-posinset={index + 1} aria-setsize={turns.length} tabIndex={index === tabIndex ? 0 : -1} data-turn-id={turn.id} data-running={turn.running} data-visual-focus={distance === 0 || undefined}
                  onClick={() => onNavigate(turn.id)} onPointerEnter={() => setInteractionIndex(index)} onFocus={() => { setFocusedId(turn.id); setPreviewId(turn.id) }} onBlur={() => { pendingFocus.current = null; setFocusedId(current => current === turn.id ? '' : current); setInteractionIndex(undefined); setPreviewId(current => current === turn.id ? '' : current) }}
                  onKeyDown={event => {
                    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
                    const pageSize = Math.max(1, Math.floor((railRef.current?.clientHeight ?? 0) / 10))
                    const target = event.key === 'Home' ? 0 : event.key === 'End' ? turns.length - 1 : event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : event.key === 'PageUp' ? index - pageSize : event.key === 'PageDown' ? index + pageSize : undefined
                    if (target === undefined) return
                    event.preventDefault(); event.stopPropagation()
                    const next = Math.max(0, Math.min(turns.length - 1, target))
                    if (next === index) return
                    pendingFocus.current = { id: turns[next].id, origin: event.currentTarget }; rail.scrollToIndex(next, { align: 'auto' }); setFocusedId(turns[next].id)
                  }}><span style={{ opacity, transform: `scaleX(${scale})` }} /></button>
              </HoverCard.Trigger>
              <HoverCard.Portal container={document.getElementById('root')}>
                <HoverCard.Content className="mira-turn-rail__preview" side="right" align="start" sideOffset={8} collisionPadding={16} aria-label={`第 ${index + 1} 轮预览`} onEscapeKeyDown={() => setPreviewId('')}>
                  <strong>{turn.prompt}</strong><p>{turn.response || (turn.running ? 'Mira 正在处理这一轮…' : '尚无回复')}</p>
                </HoverCard.Content>
              </HoverCard.Portal>
            </HoverCard.Root>
          </div>
        })}
      </div>
    </div>
  </nav>
}
