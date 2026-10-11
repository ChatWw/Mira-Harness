import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export function useMiraComposerMenuFocus({ open, ownerKey, active, ready, onReturnFocus }: {
  open: boolean
  ownerKey: string
  active: boolean
  ready: boolean
  onReturnFocus: () => void
}) {
  const owner = useRef<string | undefined>(undefined)
  const live = useRef({ ownerKey, active, ready, onReturnFocus })
  live.current = { ownerKey, active, ready, onReturnFocus }
  const [pending, setPending] = useState<{ ownerKey: string; target: Element | null }>()
  useEffect(() => { owner.current = undefined; setPending(undefined) }, [ownerKey, active])
  useEffect(() => { if (open && active) { owner.current = ownerKey; setPending(undefined) } }, [open])
  useEffect(() => {
    if (!pending) return
    const removedTarget = pending.target && !pending.target.isConnected && document.activeElement === document.body
    if (!active || pending.ownerKey !== ownerKey || document.activeElement !== pending.target && !removedTarget) { setPending(undefined); return }
    // Lexical publishes its editable DOM through a child update after readiness changes.
    const frame = ready ? requestAnimationFrame(() => {
      setPending(undefined)
      const current = live.current
      const removed = pending.target && !pending.target.isConnected && document.activeElement === document.body
      if (current.active && current.ready && current.ownerKey === pending.ownerKey && (document.activeElement === pending.target || removed)) current.onReturnFocus()
    }) : undefined
    const cancel = () => setPending(undefined)
    window.addEventListener('pointerdown', cancel, true)
    window.addEventListener('focusin', cancel, true)
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); window.removeEventListener('pointerdown', cancel, true); window.removeEventListener('focusin', cancel, true) }
  }, [pending, ready, active, ownerKey])
  const cancelReturnFocus = () => { owner.current = undefined; setPending(undefined) }
  return {
    cancelReturnFocus,
    contentProps: {
      onKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) event.stopPropagation()
      },
      onEscapeKeyDown(event: globalThis.KeyboardEvent) {
        if (event.isComposing || event.keyCode === 229) event.preventDefault()
      },
      onInteractOutside: cancelReturnFocus,
      onCloseAutoFocus(event: Event) {
        event.preventDefault()
        const current = live.current
        if (!current.active || owner.current !== current.ownerKey) return
        owner.current = undefined
        const target = document.activeElement
        if (target !== document.body && !(event.target instanceof Element && event.target.contains(target))) return
        if (current.ready) current.onReturnFocus()
        else setPending({ ownerKey: current.ownerKey, target })
      },
    },
  }
}
