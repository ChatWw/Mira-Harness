import { useEffect, useId, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Presentation, Trash2, X } from 'lucide-react'
import type { MiraPresentationReference } from '../../../../../src/config/miraPresentation'
import { miraPresentationReferencePayload } from '../../lib/mira-presentation-reference'
import type { MiraPromptReference } from '../../lib/prompt-editor-document'

export function MiraPresentationContexts({ references, disabled = false, align = 'start', onOpen, onRemove, onRemoveAll, onReturnFocus }: {
  references: MiraPromptReference[]; disabled?: boolean; align?: 'start' | 'end'
  onOpen?(reference: MiraPresentationReference): void; onRemove?(id: string): void; onRemoveAll?(): void; onReturnFocus?(): void
}) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null), id = useId()
  const values = references.flatMap(reference => {
    const payload = miraPresentationReferencePayload(reference)
    return payload ? [{ reference, payload }] : []
  })
  useEffect(() => { if (disabled || !references.length) setOpen(false) }, [disabled, references.length])
  if (!values.length) return null
  const label = `${values.length} 个演示文稿元素`
  const remove = (referenceId?: string) => {
    if (disabled) return
    if (!referenceId || values.length === 1) { setOpen(false); onReturnFocus?.() }
    else trigger.current?.focus({ preventScroll: true })
    if (referenceId) onRemove?.(referenceId); else onRemoveAll?.()
  }
  return <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
    <div className="mira-browser-contexts" data-mira-presentation-context-count={values.length}>
      <Popover.Trigger asChild><button ref={trigger} type="button" className="mira-browser-contexts__trigger" disabled={disabled} aria-label={label} aria-controls={open ? id : undefined}><Presentation size={16} /><span>{label}</span></button></Popover.Trigger>
      {onRemoveAll && <button type="button" className="mira-browser-contexts__clear" aria-label="移除全部演示文稿元素" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => remove()}><X size={14} /></button>}
    </div>
    <Popover.Portal container={document.getElementById('root')}><Popover.Content id={id} className="mira-browser-contexts__content" aria-label="演示文稿元素详情" side="top" align={align} sideOffset={4} collisionPadding={8} onCloseAutoFocus={event => { event.preventDefault(); if (!disabled && document.contains(trigger.current)) trigger.current?.focus({ preventScroll: true }) }}>
      <div className="mira-browser-contexts__list">{values.map(({ reference, payload }) => {
        const title = payload.selectedText || payload.element.text || payload.element.nodeName || payload.element.nodeType
        const content = <><Presentation size={16} /><span className="mira-browser-contexts__text"><span className="mira-presentation-context__title" title={title}>{title}</span><span className="mira-presentation-context__source">{reference.label} · {payload.element.nodeId}</span>{payload.comment && <span className="mira-presentation-context__comment">{payload.comment}</span>}</span></>
        return <div key={reference.id} className="mira-browser-contexts__item" data-mira-presentation-context-id={reference.id}>
          {onOpen ? <button type="button" className="mira-presentation-context__open" aria-label={`定位 ${reference.label}`} disabled={disabled} onClick={() => { setOpen(false); onOpen(payload) }}>{content}</button> : <div className="mira-presentation-context__open">{content}</div>}
          {onRemove && <button type="button" className="mira-browser-contexts__remove" aria-label={`移除 ${reference.label}`} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => remove(reference.id)}><Trash2 size={14} /></button>}
        </div>
      })}</div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>
}
