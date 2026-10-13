import { useLayoutEffect, useRef, type RefObject } from 'react'

// Commit final layout once; animate only the sidebar paint and the body's position.
export function useMiraSidebarMotion(open: boolean, shellRef: RefObject<HTMLDivElement | null>, bodyRef: RefObject<HTMLDivElement | null>) {
  const previous = useRef(open)
  const remaining = useRef(0)
  useLayoutEffect(() => {
    if (previous.current === open) return
    previous.current = open
    const shell = shellRef.current, body = bodyRef.current
    const sidebar = shell?.querySelector<HTMLElement>('.mira-sidebar-panel')
    const content = sidebar?.firstElementChild as HTMLElement | null
    if (!shell || !body || !sidebar || !content || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const width = content.getBoundingClientRect().width + 4
    sidebar.style.overflow = 'visible'
    const timing = { duration: open ? 200 : 150, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    const animations = [
      content.animate(open ? [{ transform: 'translateX(-16px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }] : [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-16px)', opacity: 0 }], timing),
      body.animate([{ transform: `translateX(${(open ? -width : width) + remaining.current}px)` }, { transform: 'translateX(0)' }], timing),
    ]
    remaining.current = 0
    const settle = () => { sidebar.style.removeProperty('overflow'); animations.forEach(animation => animation.cancel()) }
    animations[0].addEventListener('finish', settle, { once: true })
    const cancel = () => settle()
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    window.addEventListener('resize', cancel)
    motion.addEventListener('change', cancel)
    const drag = (event: PointerEvent) => { if ((event.target as Element).closest('[role="separator"]')) settle() }
    shell.addEventListener('pointerdown', drag)
    return () => {
      remaining.current = new DOMMatrixReadOnly(getComputedStyle(body).transform).m41
      window.removeEventListener('resize', cancel); motion.removeEventListener('change', cancel); shell.removeEventListener('pointerdown', drag); settle()
    }
  }, [open, shellRef, bodyRef])
}
