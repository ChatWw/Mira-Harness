import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const rightFade = 'linear-gradient(to right, black 0, black calc(100% - 1.5rem), transparent 100%)'
const edgeFade = 'linear-gradient(to right, transparent 0, black 1.5rem, black calc(100% - 1.5rem), transparent 100%)'
const maskFrame = (mask: string, offset: number): Keyframe => ({ maskImage: mask, webkitMaskImage: mask, offset })

export function MiraSidebarTaskTitle({ title, suspended }: { title: string; suspended: boolean }) {
  const container = useRef<HTMLSpanElement>(null)
  const original = useRef<HTMLSpanElement>(null)
  const track = useRef<HTMLSpanElement>(null)
  const [distance, setDistance] = useState(0)
  useLayoutEffect(() => {
    const node = container.current, text = original.current
    if (!node || !text) return
    const measure = () => setDistance(node.clientWidth > 0 && text.scrollWidth > node.clientWidth ? text.scrollWidth + 24 : 0)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(node); observer?.observe(text)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [title])

  useEffect(() => {
    const node = container.current, content = track.current
    if (!distance || suspended || !node || !content || typeof content.animate !== 'function') return
    const row = node.closest<HTMLElement>('[data-sidebar-session-id]') ?? node
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer: number | undefined, animations: Animation[] = []
    const stop = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
      animations.forEach(animation => animation.cancel()); animations = []
    }
    const schedule = () => {
      stop()
      if (motion.matches || document.hidden) return
      timer = window.setTimeout(() => {
        timer = undefined
        if (motion.matches || document.hidden) return
        const seconds = Math.max(6, distance / 40), total = seconds + 2, end = seconds / total
        const options = { duration: total * 1000, easing: 'linear', iterations: Infinity }
        animations = [
          content.animate([{ offset: 0, transform: 'translate3d(0, 0, 0)' }, { offset: end, transform: `translate3d(-${distance}px, 0, 0)` }, { offset: 1, transform: `translate3d(-${distance}px, 0, 0)` }], options),
          node.animate([maskFrame(rightFade, 0), maskFrame(edgeFade, .15 / total), maskFrame(edgeFade, seconds * (distance - 24) / distance / total), maskFrame(rightFade, seconds * (distance - 24) / distance / total), maskFrame(rightFade, 1)], options),
        ]
      }, 1000)
    }
    const enter = () => schedule()
    const leave = () => { if (!row.contains(document.activeElement)) stop() }
    const blur = (event: FocusEvent) => { if (!row.contains(event.relatedTarget as Node | null)) stop() }
    const changed = () => { stop(); if (!motion.matches && !document.hidden && (row.matches(':hover') || row.contains(document.activeElement))) schedule() }
    row.addEventListener('mouseenter', enter); row.addEventListener('mouseleave', leave)
    row.addEventListener('focusin', enter); row.addEventListener('focusout', blur)
    motion.addEventListener('change', changed); document.addEventListener('visibilitychange', changed)
    if (row.matches(':hover') || row.contains(document.activeElement)) schedule()
    return () => {
      stop(); row.removeEventListener('mouseenter', enter); row.removeEventListener('mouseleave', leave)
      row.removeEventListener('focusin', enter); row.removeEventListener('focusout', blur)
      motion.removeEventListener('change', changed); document.removeEventListener('visibilitychange', changed)
    }
  }, [distance, suspended])

  return <span ref={container} className="mira-task-title" data-mira-task-title data-overflow={distance > 0 || undefined}>
    <span ref={track} className="mira-task-title__track"><span ref={original} data-mira-title-copy="original">{title}</span>{distance > 0 && <span data-mira-title-copy="duplicate" aria-hidden="true">{title}</span>}</span>
  </span>
}
