/* Todo focus window and grouped previews adapted from ZCode ConversationStatusPanel.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira renders authoritative run activities and keeps previews scoped to their current snapshot. */
import { useId, useRef, useState } from 'react'
import * as HoverCard from '@radix-ui/react-hover-card'
import { Check, ChevronLeft, CircleAlert, LoaderCircle } from 'lucide-react'
import type { HarnessRunActivity } from '../../../../../src/config/harness'

type Group = 'before' | 'after'

export function MiraSummaryTodos({ items }: { items: HarnessRunActivity[] }) {
  const [preview, setPreview] = useState<Group>()
  const id = useId()
  const triggers = useRef<Partial<Record<Group, HTMLButtonElement | null>>>({})
  const contents = useRef<Partial<Record<Group, HTMLDivElement | null>>>({})
  const running = items.findIndex(item => item.status === 'running')
  const unfinished = items.findIndex(item => item.status !== 'completed')
  const focus = running >= 0 ? running : unfinished >= 0 ? unfinished : items.length - 3
  const start = items.length > 6 ? Math.max(0, Math.min(focus, items.length - 3)) : 0
  const end = items.length > 6 ? start + 3 : items.length
  function hidden(group: Group, steps: HarnessRunActivity[]) {
    if (!steps.length) return null
    const label = group === 'before' ? steps.every(item => item.status === 'completed') ? `已完成 ${steps.length} 项` : `前面 ${steps.length} 项`
      : steps.every(item => item.status === 'pending') ? `待完成 ${steps.length} 项` : `后面 ${steps.length} 项`
    const close = () => setPreview(current => current === group ? undefined : current)
    return <li><HoverCard.Root open={preview === group} openDelay={120} closeDelay={80} onOpenChange={open => open ? setPreview(group) : close()}>
      <HoverCard.Trigger asChild><button ref={element => { triggers.current[group] = element }} type="button" className="mira-summary-todo-trigger" data-mira-todo-preview-trigger={group} aria-expanded={preview === group} aria-controls={preview === group ? `${id}-${group}` : undefined} onFocus={() => setPreview(group)} onBlur={event => { if (!contents.current[group]?.contains(event.relatedTarget)) close() }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setPreview(group) }
      }}><ChevronLeft size={14} aria-hidden="true" /><span>{label}</span></button></HoverCard.Trigger>
      <HoverCard.Portal container={document.getElementById('root')}><HoverCard.Content ref={element => { contents.current[group] = element }} id={`${id}-${group}`} role="region" tabIndex={0} aria-label={label} data-mira-todo-preview={group} className="mira-summary-todo-preview" side="left" align="start" sideOffset={4} collisionPadding={16} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== triggers.current[group]) close() }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return
        const list = event.currentTarget.querySelector('ol')!
        const delta = { ArrowDown: 32, ArrowUp: -32, PageDown: list.clientHeight, PageUp: -list.clientHeight }[event.key]
        if (delta !== undefined || event.key === 'Home' || event.key === 'End') {
          event.preventDefault(); event.stopPropagation()
          list.scrollTop = event.key === 'Home' ? 0 : event.key === 'End' ? list.scrollHeight : list.scrollTop + delta!
        }
      }} onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); triggers.current[group]?.focus(); close() }}>
        <p>{label}</p><ol className="mira-summary-todos"><Rows items={steps} /></ol>
      </HoverCard.Content></HoverCard.Portal>
    </HoverCard.Root></li>
  }
  return <ol className="mira-summary-todos">{hidden('before', items.slice(0, start))}<Rows items={items.slice(start, end)} />{hidden('after', items.slice(end))}</ol>
}

function Rows({ items }: { items: HarnessRunActivity[] }) {
  return items.map(item => <li key={item.id} data-status={item.status}>
    {item.status === 'completed' ? <Check size={14} aria-hidden="true" /> : item.status === 'running' ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : item.status === 'failed' ? <CircleAlert size={14} aria-hidden="true" /> : <span className="mira-summary-dot" aria-hidden="true" />}
    <span className="mira-summary-todo-label" title={item.label}>{item.label}</span>
  </li>)
}
