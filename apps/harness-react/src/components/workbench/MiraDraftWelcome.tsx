/* Draft title fitting and time boundaries reference ZCode ConversationDraftEmptyState.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira keeps its own mark, wording and existing 28px desktop type scale. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const boundaries = [5, 9, 12, 14, 18, 23]

export function MiraDraftWelcome({ active }: { active: boolean }) {
  const [now, setNow] = useState(() => new Date())
  const [fontSize, setFontSize] = useState(28)
  const heading = useRef<HTMLHeadingElement>(null), measurement = useRef<HTMLSpanElement>(null)
  const hour = now.getHours()
  const greeting = hour < 5 || hour >= 23 ? '夜深了' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
  const title = `${greeting}，有什么想让 Mira 帮忙的吗？`

  useEffect(() => {
    if (!active) return
    const refresh = () => setNow(new Date())
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [active])
  useEffect(() => {
    if (!active) return
    const next = new Date(now)
    const boundary = boundaries.find(value => value > now.getHours())
    if (boundary === undefined) next.setDate(next.getDate() + 1)
    next.setHours(boundary ?? boundaries[0], 0, 0, 0)
    const timer = window.setTimeout(() => setNow(new Date()), Math.max(1, next.getTime() - now.getTime()))
    return () => window.clearTimeout(timer)
  }, [now, active])

  useLayoutEffect(() => {
    const element = heading.current, sample = measurement.current
    if (!active || !element || !sample) return
    let frame = 0
    const measure = () => {
      frame = 0
      const style = getComputedStyle(element)
      const available = element.getBoundingClientRect().width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      const natural = sample.getBoundingClientRect().width
      if (available > 0 && natural > 0) setFontSize(Math.max(20, Math.min(28, Math.floor(28 * available / natural))))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(element); observer.observe(sample)
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame) }
  }, [active, title])

  return <div className="mira-task-start">
    <svg className="mira-task-start__mark" viewBox="0 0 400 240" aria-hidden="true" focusable="false">
      <path d="M20 80 100 25Q105 21 110 25L160 60 194 42Q200 38 206 42L240 65 295 25Q300 21 305 25L380 80V220H300V156L206 220H194L100 156V220H20Z" />
      <path d="m20 174 174-132v178m12-178v178l94-96q6-4 12 0l68 46M100 156l94 64" />
    </svg>
    <h2 ref={heading} style={{ fontSize }}><span className="mira-task-start__measurement" aria-hidden="true"><span className="mira-task-start__measure" ref={measurement}>{title}</span></span><span data-mira-welcome-text>{title}</span></h2>
  </div>
}
