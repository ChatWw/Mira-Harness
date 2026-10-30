// Animate the real layout so conversation wrapping follows the panel, rather than
// committing the final width and translating already-reflowed text across it.
import { useLayoutEffect, useRef, type RefObject } from 'react'

export function useMiraSidebarMotion(open: boolean, shellRef: RefObject<HTMLDivElement | null>, _bodyRef: RefObject<HTMLDivElement | null>) {
  const previous = useRef(open)
  const remaining = useRef<number | undefined>(undefined)
  useLayoutEffect(() => {
    if (previous.current === open) return
    previous.current = open
    const shell = shellRef.current
    const sidebar = shell?.querySelector<HTMLElement>('.mira-sidebar-panel')
    const content = sidebar?.firstElementChild as HTMLElement | null
    if (!shell || !sidebar || !content) return
    const width = content.getBoundingClientRect().width
    const from = remaining.current ?? (open ? 0 : width)
    remaining.current = undefined
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (document.hidden || motion.matches) return
    const animation = sidebar.animate([{ width: `${from}px` }, { width: `${open ? width : 0}px` }], { duration: 200, easing: 'ease-out' })
    let settled = false
    const settle = () => { settled = true; animation.cancel(); remaining.current = undefined }
    const visibility = () => { if (document.hidden) settle() }
    const drag = (event: PointerEvent) => { if ((event.target as Element).closest('[role="separator"]')) settle() }
    animation.addEventListener('finish', settle, { once: true })
    window.addEventListener('resize', settle)
    motion.addEventListener('change', settle)
    document.addEventListener('visibilitychange', visibility)
    shell.addEventListener('pointerdown', drag)
    return () => {
      // Sample before cancelling: rapid reversals start at the visible width.
      remaining.current = settled ? undefined : sidebar.getBoundingClientRect().width
      window.removeEventListener('resize', settle); motion.removeEventListener('change', settle)
      document.removeEventListener('visibilitychange', visibility); shell.removeEventListener('pointerdown', drag)
      animation.cancel()
    }
  }, [open, shellRef])
}
