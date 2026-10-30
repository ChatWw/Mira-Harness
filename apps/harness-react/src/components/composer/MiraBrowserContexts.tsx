import { useEffect, useId, useRef, useState } from 'react'
import * as HoverCard from '@radix-ui/react-hover-card'
import { Globe2, MousePointer2, Trash2, X } from 'lucide-react'
import { miraBrowserReferenceElement } from '../../lib/mira-browser-reference'
import type { MiraPromptReference } from '../../lib/prompt-editor-document'

export function MiraBrowserContexts({ references, disabled = false, align = 'start', onRemove, onRemoveAll, onReturnFocus }: {
  references: MiraPromptReference[]; disabled?: boolean; align?: 'start' | 'end'; onRemove?: (id: string) => void; onRemoveAll?: () => void; onReturnFocus?: () => void
}) {
  const [open, setOpen] = useState(false), triggerRef = useRef<HTMLButtonElement>(null)
  const contentId = useId()
  const ids = references.map(reference => reference.id).join('\0')
  useEffect(() => { if (!references.length || disabled) setOpen(false) }, [ids, disabled])
  useEffect(() => {
    if (!open || disabled) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
      event.preventDefault(); event.stopImmediatePropagation(); setOpen(false)
      if (document.getElementById(contentId)?.contains(document.activeElement)) triggerRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener('keydown', key, true)
    return () => document.removeEventListener('keydown', key, true)
  }, [open, disabled, contentId])
  if (!references.length) return null
  const label = `${references.length} 个网页元素`
  const remove = (id?: string) => {
    if (disabled) return
    const last = !id || references.length === 1
    if (last) setOpen(false)
    if (id) onRemove?.(id); else onRemoveAll?.()
    if (last) onReturnFocus?.()
    else triggerRef.current?.focus({ preventScroll: true })
  }
  return <HoverCard.Root open={open && !disabled} onOpenChange={setOpen} openDelay={0} closeDelay={0}>
    <div className="mira-browser-contexts" data-mira-browser-context-count={references.length}>
      <HoverCard.Trigger asChild><button ref={triggerRef} type="button" className="mira-browser-contexts__trigger" aria-label={label} aria-expanded={open && !disabled} aria-controls={open && !disabled ? contentId : undefined} disabled={disabled} onClick={() => setOpen(value => !value)} onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
        if (event.key === 'ArrowDown' && !disabled) { event.preventDefault(); setOpen(true) }
      }}><MousePointer2 size={16} /><span>{label}</span></button></HoverCard.Trigger>
      {onRemoveAll && <button type="button" className="mira-browser-contexts__clear" aria-label="移除全部网页元素上下文" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => remove()}><X size={14} /></button>}
    </div>
    <HoverCard.Portal container={document.getElementById('root')}><HoverCard.Content id={contentId} className="mira-browser-contexts__content" data-mira-browser-context-details role="region" aria-label="网页元素详情" side="top" align={align} sideOffset={4} collisionPadding={8} onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus({ preventScroll: true }) }}>
      <div className="mira-browser-contexts__list">{references.map(reference => {
        const element = miraBrowserReferenceElement(reference)
        const title = element?.accessibleName || element?.text || element?.selector || element?.tagName || reference.label
        return <div className="mira-browser-contexts__item" key={reference.id} data-mira-browser-context-id={reference.id}>
          <Globe2 size={16} />
          <div className="mira-browser-contexts__text"><div className="mira-browser-contexts__title" title={title}>{title}</div>
            <div className="mira-browser-contexts__meta">{element ? [element.tagName, element.role ? `role=${element.role}` : ''].filter(Boolean).join(' · ') : '网页元素'}</div>
            <div className="mira-browser-contexts__source" title={element?.pageUrl || reference.value}>{element?.pageTitle || element?.pageUrl || reference.value}</div>
          </div>
          {onRemove && <button type="button" className="mira-browser-contexts__remove" aria-label={`移除网页元素 ${title}`} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => remove(reference.id)}><Trash2 size={14} /></button>}
        </div>
      })}</div>
    </HoverCard.Content></HoverCard.Portal>
  </HoverCard.Root>
}
