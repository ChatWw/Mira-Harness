/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode purpose-section collapse and hover actions.
 * Upstream license: third-party-licenses/zcode/.
 */
import type { ReactNode } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { useSortable } from '@dnd-kit/sortable'
import { ChevronRight, GripVertical } from 'lucide-react'

export function MiraSidebarSection({ id, title, open, disabled, sortable, onOpenChange, action, children }: {
  id: 'projects' | 'personal'
  title: string
  open: boolean
  disabled: boolean
  sortable?: boolean
  onOpenChange: (open: boolean) => void
  action: ReactNode
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: `sidebar-section:${id}`, disabled: !sortable })
  return <section ref={setNodeRef} className="mira-sidebar-section" data-sidebar-section={id} aria-label={title} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition, zIndex: isDragging ? 10 : undefined, opacity: isDragging ? .85 : undefined }}>
    <Collapsible.Root open={open} onOpenChange={onOpenChange} disabled={disabled}>
      <div className="mira-sidebar-section__head">
        <Collapsible.Trigger asChild><button type="button" className="mira-sidebar-section__title" aria-label={title}><span>{title}</span><ChevronRight size={14} aria-hidden="true" className={open ? 'is-open' : undefined} /></button></Collapsible.Trigger>
        <div className="mira-sidebar-section__actions">{sortable && <button ref={setActivatorNodeRef} type="button" className="mira-session-icon mira-sidebar-section__grip" aria-label={`拖拽排序 ${title}分区`} data-sidebar-section-drag-handle={id} {...attributes} {...listeners}><GripVertical size={14} aria-hidden="true" /></button>}{action}</div>
      </div>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  </section>
}
