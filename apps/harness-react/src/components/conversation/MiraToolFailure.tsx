// Adapted from ZCode ToolCallBlocks/ToolLayout.tsx (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira retains its own recorded errors and clipboard boundary.
import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, Copy } from 'lucide-react'

export function MiraToolFailure({ error }: { error: string }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const copyButton = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const hovered = useRef(false)
  const restoreFocus = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef(false)
  const mounted = useRef(false)
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; clearTimeout(reset.current); clearTimeout(closeTimer.current) }
  }, [])
  function scheduleClose() {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      if (!hovered.current && document.activeElement !== trigger.current && !content.current?.contains(document.activeElement)) setOpen(false)
    }, 120)
  }
  async function copy() {
    if (pending.current) return
    pending.current = true
    try {
      await navigator.clipboard.writeText(error)
      if (!mounted.current) return
      setCopied(true); setCopyError(''); clearTimeout(reset.current)
      reset.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      if (mounted.current) setCopyError('复制失败，请重试。')
    } finally { pending.current = false }
  }
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><button ref={trigger} type="button" className="mira-tool-failure" aria-label="查看工具错误" onPointerEnter={() => { hovered.current = true; clearTimeout(closeTimer.current); setOpen(true) }} onPointerLeave={() => { hovered.current = false; scheduleClose() }} onFocus={() => { clearTimeout(closeTimer.current); if (!restoreFocus.current) setOpen(true) }} onBlur={scheduleClose} onKeyDown={event => {
      if (open && copyButton.current && event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
        event.preventDefault(); event.stopPropagation(); copyButton.current.focus({ preventScroll: true })
      }
    }} onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(true) }}>执行失败</button></Popover.Trigger>
    <Popover.Portal><Popover.Content ref={content} side="top" align="start" sideOffset={5} className="mira-tool-failure-popover" aria-label="工具错误" onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus.current) { trigger.current?.focus(); restoreFocus.current = false } }} onEscapeKeyDown={event => { event.stopPropagation(); restoreFocus.current = true }} onPointerEnter={() => { hovered.current = true; clearTimeout(closeTimer.current) }} onPointerLeave={() => { hovered.current = false; scheduleClose() }} onFocusCapture={() => clearTimeout(closeTimer.current)} onBlurCapture={scheduleClose} onKeyDownCapture={event => {
      if (trigger.current && event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
        event.stopPropagation(); trigger.current.focus({ preventScroll: true })
        if (event.shiftKey) event.preventDefault()
        // Continue forward Tab from the trigger's DOM position, outside Radix's portal focus loop.
        else setOpen(false)
      }
    }} onClick={event => event.stopPropagation()}>
      <p>{error}</p><button ref={copyButton} type="button" className="mira-message-action" aria-label={copied ? '已复制错误' : '复制错误'} title={copied ? '已复制错误' : '复制错误'} onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
      {copyError && <small role="alert">{copyError}</small>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>
}
