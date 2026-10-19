/* Time boundaries reference ZCode ConversationDraftEmptyState.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira uses its own brand mark and welcome composition. */
import { useEffect, useState } from 'react'

const boundaries = [5, 9, 12, 14, 18, 23]

export function MiraDraftWelcome({ active }: { active: boolean }) {
  const [now, setNow] = useState(() => new Date())
  const hour = now.getHours()
  const greeting = hour < 5 || hour >= 23 ? '夜深了' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

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

  return <div className="mira-task-start">
    <h2>今天，从什么开始？</h2>
    <p data-mira-welcome-text>{greeting}。把想做的事交给 Mira，我们一起推进。</p>
  </div>
}
