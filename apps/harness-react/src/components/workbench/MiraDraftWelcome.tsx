import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const boundaries = [5, 9, 12, 14, 18, 23]

export function MiraDraftWelcome({ active, sidebarOpen = true }: { active: boolean; sidebarOpen?: boolean }) {
  const [now, setNow] = useState(() => new Date())
  const welcomeRef = useRef<HTMLDivElement>(null)
  const alignment = useRef(sidebarOpen)
  alignment.current = sidebarOpen
  const wakeMotion = useRef<() => void>(() => undefined)
  useLayoutEffect(() => {
    const root = welcomeRef.current!
    const lines = [...root.querySelectorAll<HTMLElement>('[data-welcome-line]')].map((element, index) => ({
      element, stiffness: index === 0 ? 340 : 190, damping: index === 0 ? 28 : 22,
      x: undefined as number | undefined, velocity: 0,
    }))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, previousTime = 0
    function tick(time: number) {
      frame = 0
      const dt = Math.min((time - previousTime) / 1000 || 1 / 60, 1 / 30)
      previousTime = time
      let moving = false
      for (const line of lines) {
        const box = line.element.parentElement!.getBoundingClientRect()
        if (!box.width) continue
        const target = box.left + (alignment.current ? 0 : Math.max(0, (box.width - line.element.offsetWidth) / 2))
        if (line.x === undefined || reduced.matches || !active || document.hidden) {
          line.x = target; line.velocity = 0
        } else {
          // Both panels retarget the same viewport spring without resetting velocity.
          line.velocity += ((target - line.x) * line.stiffness - line.velocity * line.damping) * dt
          line.x += line.velocity * dt
          if (Math.abs(target - line.x) < .1 && Math.abs(line.velocity) < .5) { line.x = target; line.velocity = 0 }
          else moving = true
        }
        line.element.style.transform = `translateX(${line.x - box.left}px)`
      }
      if (moving) frame = requestAnimationFrame(tick)
    }
    function wake() {
      if (!frame) { previousTime = performance.now(); frame = requestAnimationFrame(tick) }
    }
    tick(performance.now())
    wakeMotion.current = wake
    // ResizeObserver runs before paint: update the layout-relative transform now,
    // so a new panel width cannot paint with the previous frame's offset.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame); frame = 0
      tick(performance.now())
    })
    observer.observe(root)
    const conversation = root.closest('.mira-conversation-panel')
    if (conversation) observer.observe(conversation)
    for (const line of lines) observer.observe(line.element)
    reduced.addEventListener('change', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      cancelAnimationFrame(frame); observer.disconnect()
      reduced.removeEventListener('change', wake); document.removeEventListener('visibilitychange', wake)
      wakeMotion.current = () => undefined
    }
  }, [active])
  useLayoutEffect(() => { wakeMotion.current() }, [sidebarOpen])
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

  return <div ref={welcomeRef} className="mira-task-start">
    <h2><span data-welcome-line>今天，从什么开始？</span></h2>
    <p data-mira-welcome-text><span data-welcome-line>{greeting}。把想做的事交给 Mira，我们一起推进。</span></p>
  </div>
}
