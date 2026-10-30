import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export const MIRA_REVEAL_USER_BODY = 'mira-reveal-user-body'
const FOLDED_HEIGHT = 120

export function MiraUserMessageBody({ children, content }: { children: ReactNode; content: string }) {
  const root = useRef<HTMLDivElement>(null), text = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0), [expanded, setExpanded] = useState(false)
  const id = useId(), expandable = height > FOLDED_HEIGHT + 1
  useEffect(() => { setExpanded(false) }, [content])
  useEffect(() => {
    const element = text.current
    if (!element) return
    let frame: number | undefined
    const measure = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        // Hidden task panes must not replace their last usable geometry with zero.
        if (element.clientWidth > 0) setHeight(element.scrollHeight)
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element); measure()
    return () => { observer.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame) }
  }, [content])
  useEffect(() => {
    const element = root.current
    const reveal = () => setExpanded(true)
    element?.addEventListener(MIRA_REVEAL_USER_BODY, reveal)
    return () => element?.removeEventListener(MIRA_REVEAL_USER_BODY, reveal)
  }, [])
  const label = expanded ? '收起消息' : '展开消息'
  return <div ref={root} className="mira-user-body" data-mira-user-body data-expanded={expanded} data-expandable={expandable}>
    <div id={id} className="mira-user-body__content" data-mira-user-body-content style={{ '--mira-folded-height': `${Math.min(height, FOLDED_HEIGHT)}px` } as CSSProperties}>
      <div className="mira-user-body__clip"><div ref={text} className="mira-user-body__text">{children}</div></div>
    </div>
    {expandable && <div className="mira-user-body__toggle"><button type="button" aria-label={label} title={label} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}</button></div>}
  </div>
}
