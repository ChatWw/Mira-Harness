import { useEffect, useRef } from 'react'
import { miraTaskNavigationShortcut } from '../lib/mira-task-navigation'

export function useMiraTaskNavigationShortcut(select: (direction: 'previous' | 'next') => boolean) {
  const action = useRef(select)
  action.current = select
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const direction = miraTaskNavigationShortcut(event)
      if (!direction || document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"][data-state="open"], dialog[open]')) return
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (target?.closest('[role="dialog"]:not(.mira-conversation-find), .xterm')) return
      if (!target?.closest('.mira-prompt-editor') && target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return
      if (!action.current(direction)) return
      event.preventDefault(); event.stopPropagation()
    }
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [])
}
