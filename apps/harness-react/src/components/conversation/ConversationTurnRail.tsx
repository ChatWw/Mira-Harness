import { useEffect, useMemo, useState, type RefObject } from 'react'
import type { HarnessMessage } from '../../../../../src/config/harness'
import { buildConversationTurns } from './conversation-model'

export function ConversationTurnRail({ messages, viewportRef }: { messages: HarnessMessage[]; viewportRef: RefObject<HTMLDivElement | null> }) {
  const turns = useMemo(() => buildConversationTurns(messages), [messages])
  const [activeId, setActiveId] = useState('')
  const [hoveredId, setHoveredId] = useState('')
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const update = () => {
      const top = viewport.getBoundingClientRect().top + 48
      let active = turns[0]?.id || ''
      for (const row of viewport.querySelectorAll<HTMLElement>('[data-user-message-id]')) {
        if (row.getBoundingClientRect().top > top) break
        active = row.dataset.userMessageId || active
      }
      setActiveId(active)
    }
    update()
    viewport.addEventListener('scroll', update, { passive: true })
    return () => viewport.removeEventListener('scroll', update)
  }, [turns, viewportRef])
  if (turns.length < 2) return null
  const preview = turns.find(turn => turn.id === hoveredId)
  const jump = (id: string) => {
    const row = [...(viewportRef.current?.querySelectorAll<HTMLElement>('[data-user-message-id]') || [])].find(element => element.dataset.userMessageId === id)
    row?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  return <nav className="mira-turn-rail" aria-label="对话轮次" onMouseLeave={() => setHoveredId('')}>
    <div className="mira-turn-rail__items">{turns.map((turn, index) => <button key={turn.id} type="button" aria-label={`跳转到第 ${index + 1} 轮`} aria-current={activeId === turn.id ? 'location' : undefined} aria-describedby={hoveredId === turn.id ? 'mira-turn-preview' : undefined} data-turn-id={turn.id} data-running={turn.running} onClick={() => jump(turn.id)} onMouseEnter={() => setHoveredId(turn.id)} onFocus={() => setHoveredId(turn.id)} onBlur={() => setHoveredId('')}><span /></button>)}</div>
    {preview && <aside id="mira-turn-preview" className="mira-turn-rail__preview" role="tooltip"><strong>{preview.prompt}</strong><p>{preview.response || (preview.running ? 'Mira 正在处理这一轮…' : '尚无回复')}</p></aside>}
  </nav>
}
