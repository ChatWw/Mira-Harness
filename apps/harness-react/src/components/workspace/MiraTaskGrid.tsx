/* Task pane placement/resize adapted from ZCode V4WorkspaceChatArea/workbenchDragDrop.
 * Copyright 2026 Z.AI Co., Ltd. SPDX-License-Identifier: Apache-2.0
 * Mira retains original session Controllers, task DOM and preference ownership.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { Children, isValidElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { miraTaskDropSide, miraTaskLayoutGeometry, resizeMiraTaskSplit, type MiraTaskLayout, type MiraTaskRect, type MiraTaskSplitSide } from '../../state/mira-task-layout'

export const MIRA_TASK_DRAG_MIME = 'application/x-mira-task'
let draggingTask: string | undefined
export function beginMiraTaskDrag(id: string, transfer: DataTransfer) { draggingTask = id; transfer.effectAllowed = 'copy'; transfer.setData(MIRA_TASK_DRAG_MIME, id) }
const POINTER_TASK_DRAG = 'mira-task-pointer-drag'
type PointerTaskDrag = { id: string; x: number; y: number; drop: boolean; accepted: boolean }
export function miraTaskPointerDrag(id: string, x: number, y: number, drop: boolean) {
  const detail: PointerTaskDrag = { id, x, y, drop, accepted: false }
  window.dispatchEvent(new CustomEvent(POINTER_TASK_DRAG, { detail }))
  return detail.accepted
}
export function endMiraTaskDrag() { draggingTask = undefined; window.dispatchEvent(new CustomEvent(POINTER_TASK_DRAG)) }
const rectStyle = (rect: MiraTaskRect): CSSProperties => ({ left: `${rect.left * 100}%`, top: `${rect.top * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` })
const dividerStyle = (divider: ReturnType<typeof miraTaskLayoutGeometry>['dividers'][number]): CSSProperties => divider.axis === 'horizontal' ? { ...rectStyle(divider.rect), left: `${(divider.rect.left + divider.rect.width * divider.ratio) * 100}%`, width: '6px' } : { ...rectStyle(divider.rect), top: `${(divider.rect.top + divider.rect.height * divider.ratio) * 100}%`, height: '6px' }

export function MiraTaskGrid({ layout, active, children, canPlace, onPlace, onResize }: {
  layout: MiraTaskLayout; active: boolean; children: ReactNode
  canPlace: (id: string) => boolean; onPlace: (id: string, anchor: string, side: MiraTaskSplitSide) => Promise<unknown>
  onResize: (layout: MiraTaskLayout) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<{ anchor: string; side: MiraTaskSplitSide }>()
  const [error, setError] = useState('')
  const pending = useRef(false), cancelResize = useRef<(() => void) | undefined>(undefined), live = useRef(true)
  const current = useRef({ layout, active, onResize }); current.current = { layout, active, onResize }
  const geometry = miraTaskLayoutGeometry(layout)
  const surfaces = Children.toArray(children).filter(isValidElement<{ 'data-mira-task-leaf': string }> )
  useEffect(() => { live.current = true; return () => { live.current = false; cancelResize.current?.() } }, [])
  useEffect(() => { if (!active) { setPreview(undefined); cancelResize.current?.() } }, [active])
  useEffect(() => () => cancelResize.current?.(), [layout])
  useEffect(() => {
    const drag = (event: Event) => {
      const detail = (event as CustomEvent<PointerTaskDrag>).detail
      if (!detail || !active || pending.current || !canPlace(detail.id)) { setPreview(undefined); return }
      const pane = [...ref.current?.querySelectorAll<HTMLElement>('[data-task-leaf]') ?? []].find(element => {
        const rect = element.getBoundingClientRect()
        return detail.x >= rect.left && detail.x <= rect.right && detail.y >= rect.top && detail.y <= rect.bottom
      })
      const side = pane && miraTaskDropSide(pane.getBoundingClientRect(), detail.x, detail.y)
      if (!pane || !side) { setPreview(undefined); return }
      const anchor = pane.dataset.taskLeaf!
      detail.accepted = true
      if (!detail.drop) { setPreview(previous => previous?.anchor === anchor && previous.side === side ? previous : { anchor, side }); return }
      setPreview(undefined); pending.current = true; setError('')
      void onPlace(detail.id, anchor, side).catch(cause => { if (live.current) setError(cause instanceof Error ? cause.message : '任务未放入窗格，请重试。') }).finally(() => { pending.current = false })
    }
    window.addEventListener(POINTER_TASK_DRAG, drag)
    return () => window.removeEventListener(POINTER_TASK_DRAG, drag)
  }, [active, canPlace, onPlace])
  function paint(layout: MiraTaskLayout) {
    if (!ref.current) return
    const geometry = miraTaskLayoutGeometry(layout), elements = [...ref.current.children] as HTMLElement[]
    for (const pane of geometry.panes) { const element = elements.find(element => element.dataset.taskLeaf === pane.id); if (element) Object.assign(element.style, rectStyle(pane.rect)) }
    for (const divider of geometry.dividers) { const element = elements.find(element => element.dataset.taskDivider === divider.id); if (element) { Object.assign(element.style, dividerStyle(divider)); element.setAttribute('aria-valuenow', String(Math.round(divider.ratio * 100))) } }
  }
  function dropTarget(event: React.DragEvent<HTMLDivElement>, anchor: string) {
    if (!active || pending.current || !Array.from(event.dataTransfer.types).includes(MIRA_TASK_DRAG_MIME)) return
    const id = event.dataTransfer.getData(MIRA_TASK_DRAG_MIME) || draggingTask
    if (!id || !canPlace(id)) return
    const side = miraTaskDropSide(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY)
    if (!side) return
    return { id, anchor, side }
  }
  function startResize(event: React.PointerEvent<HTMLDivElement>, divider: typeof geometry.dividers[number]) {
    if (event.button !== 0 || !active) return
    event.preventDefault(); cancelResize.current?.()
    const container = ref.current!.getBoundingClientRect(), horizontal = divider.axis === 'horizontal'
    const extent = (horizontal ? container.width * divider.rect.width : container.height * divider.rect.height)
    if (extent <= 0) return
    const origin = (horizontal ? container.left + container.width * divider.rect.left : container.top + container.height * divider.rect.top)
    const original = current.current.layout
    let next = original
    // Dragging only updates the bounded geometry; task/controller React state commits once on pointerup.
    const move = (move: PointerEvent) => { if (move.pointerId !== event.pointerId) return; next = resizeMiraTaskSplit(original, divider.id, ((horizontal ? move.clientX : move.clientY) - origin) / extent); paint(next) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); event.stopPropagation(); cancel() } }
    const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', escape, true); cancelResize.current = undefined; ref.current?.classList.remove('is-resizing'); if (live.current) paint(current.current.layout) }
    const finish = () => { cleanup(); if (live.current && current.current.active && current.current.layout === original) current.current.onResize(next) }
    const cancel = () => cleanup()
    cancelResize.current = cancel
    ref.current!.classList.add('is-resizing')
    window.addEventListener('keydown', escape, true)
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish, { once: true }); window.addEventListener('pointercancel', cancel, { once: true }); window.addEventListener('blur', cancel, { once: true })
  }
  return <div ref={ref} className="mira-task-grid" data-task-pane-count={geometry.panes.length}>
    {surfaces.map(surface => {
      const id = surface.props['data-mira-task-leaf'], pane = geometry.panes.find(pane => pane.id === id)
      if (!pane) return null
      return <div key={id} className="mira-task-grid__pane" data-task-leaf={id} style={rectStyle(pane.rect)} onDragOver={event => {
        const target = dropTarget(event, id); if (!target) { setPreview(undefined); return }; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setPreview(previous => previous?.anchor === id && previous.side === target.side ? previous : { anchor: id, side: target.side })
      }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreview(undefined) }} onDrop={event => {
        const target = dropTarget(event, id); setPreview(undefined); endMiraTaskDrag(); if (!target) return
        event.preventDefault(); event.stopPropagation(); pending.current = true; setError('')
        void onPlace(target.id, id, target.side).catch(cause => { if (live.current) setError(cause instanceof Error ? cause.message : '任务未放入窗格，请重试。') }).finally(() => { pending.current = false })
      }}>{surface}{preview?.anchor === id && <div className={`mira-task-grid__drop mira-task-grid__drop--${preview.side}`} aria-hidden="true" />}</div>
    })}
    {geometry.dividers.map(divider => <div key={divider.id} data-task-divider={divider.id} className={`mira-task-grid__divider mira-task-grid__divider--${divider.axis}`} role="separator" tabIndex={active ? 0 : -1} aria-label={divider.axis === 'horizontal' ? '调整任务窗格宽度' : '调整任务窗格高度'} aria-orientation={divider.axis === 'horizontal' ? 'vertical' : 'horizontal'} aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(divider.ratio * 100)} style={dividerStyle(divider)} onPointerDown={event => startResize(event, divider)} onKeyDown={event => {
      if (!active || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.metaKey || event.ctrlKey || event.altKey) return
      const decrease = divider.axis === 'horizontal' ? 'ArrowLeft' : 'ArrowUp', increase = divider.axis === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
      if (![decrease, increase, 'Home', 'End'].includes(event.key)) return
      event.preventDefault(); event.stopPropagation(); onResize(resizeMiraTaskSplit(layout, divider.id, event.key === 'Home' ? .25 : event.key === 'End' ? .75 : divider.ratio + (event.key === decrease ? -.05 : .05)))
    }} />)}
    {error && <div className="mira-task-grid__error" role="alert">{error}<button type="button" aria-label="关闭分屏错误提示" onClick={() => setError('')}>关闭</button></div>}
  </div>
}
