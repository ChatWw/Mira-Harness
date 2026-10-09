import { useEffect } from 'react'

export function useModalFocusTrap(active: boolean, elementId: string) {
  useEffect(() => {
    if (!active) return
    const modal = document.getElementById(elementId)
    if (!modal) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Tab') return
      // Radix owns keyboard navigation while a portaled menu is open.
      const openMenu = document.querySelector<HTMLElement>('[role="menu"][data-state="open"]')
      if (openMenu?.getClientRects().length || document.activeElement?.closest('[role="menu"]')) return
      const focusable = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true')
      if (!focusable.length) { event.preventDefault(); modal.focus(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!modal.contains(document.activeElement) || event.shiftKey && document.activeElement === first) {
        event.preventDefault(); (event.shiftKey ? last : first).focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active, elementId])
}
