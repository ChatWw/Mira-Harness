import { useEffect, useRef } from 'react'
import { miraWorkbenchShortcut } from '../../../../src/platform/workbenchShortcuts'

export function useMiraWorkbenchShortcuts(action: (command: 'theme' | 'project') => boolean) {
  const current = useRef(action)
  current.current = action
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const command = miraWorkbenchShortcut(event)
      if (!command || document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"][data-state="open"], dialog[open]')) return
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (target?.closest('[role="dialog"]:not(.mira-conversation-find), .xterm')) return
      if (!target?.closest('.mira-prompt-editor') && target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return
      if (!current.current(command)) return
      event.preventDefault(); event.stopPropagation()
    }
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [])
}
