/* Gallery interaction adapted from ZCode image-preview-dialog.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: session-owned frozen attachments and native save callback.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ArrowLeft, ArrowRight, Download, ImageOff, LoaderCircle, Minus, Plus, RotateCw, X } from 'lucide-react'
import type { HarnessMessageAttachment } from '../../../../../src/config/harness'

export type MiraAttachmentGalleryItem = {
  path: string; name: string; attachment?: HarnessMessageAttachment; error?: string; onRetry?: () => void
}

export function MiraAttachmentPreview({ attachment, gallery, onSave, onClose }: {
  attachment?: HarnessMessageAttachment; gallery?: MiraAttachmentGalleryItem[]
  onSave?: (attachment: HarnessMessageAttachment) => Promise<unknown>; onClose: () => void
}) {
  const [selection, setSelection] = useState<{ origin?: string; path?: string }>({})
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [imageState, setImageState] = useState<{ attachment: HarnessMessageAttachment; attempt: number; failed: boolean }>()
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const viewport = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const lifetime = useRef(0)
  const currentItem = useRef(attachment?.path)
  const drag = useRef<{ id: number; x: number; y: number; offset: typeof offset } | null>(null)
  const imageMode = Boolean(attachment?.mediaType)
  const items = imageMode && gallery?.length ? gallery : attachment ? [{ path: attachment.path, name: attachment.name, attachment }] : []
  const selectedPath = selection.origin === attachment?.path ? selection.path : attachment?.path
  const index = Math.max(0, items.findIndex(item => item.path === selectedPath))
  const item = items[index]
  const value = item?.attachment
  const decoded = Boolean(value && imageState?.attachment === value && imageState.attempt === attempt && !imageState.failed)
  const decodeError = Boolean(value && imageState?.attachment === value && imageState.attempt === attempt && imageState.failed)
  currentItem.current = item?.path
  const releaseDrag = () => {
    const id = drag.current?.id, canvas = viewport.current
    drag.current = null
    if (id !== undefined && canvas?.hasPointerCapture(id)) canvas.releasePointerCapture(id)
  }
  const reset = () => { releaseDrag(); setScale(1); setOffset({ x: 0, y: 0 }) }
  useEffect(() => {
    lifetime.current++; setSelection({}); setSaving(false)
    return () => { lifetime.current++; releaseDrag() }
  }, [attachment?.path])
  useEffect(() => { reset(); setSaveError('') }, [attachment?.path, item?.path])
  const clamp = (position: typeof offset, zoom: number) => {
    const canvas = viewport.current, bitmap = image.current
    if (!canvas || !bitmap) return { x: 0, y: 0 }
    const x = Math.max(0, (bitmap.offsetWidth * zoom - canvas.clientWidth) / 2)
    const y = Math.max(0, (bitmap.offsetHeight * zoom - canvas.clientHeight) / 2)
    return { x: Math.min(x, Math.max(-x, position.x)), y: Math.min(y, Math.max(-y, position.y)) }
  }
  useEffect(() => {
    const canvas = viewport.current
    if (!attachment || !canvas || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setOffset(previous => clamp(previous, scale)))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [attachment?.path, item?.path, scale])
  const navigate = (direction: number) => {
    if (items.length < 2) return
    setSelection({ origin: attachment?.path, path: items[(index + direction + items.length) % items.length].path })
    reset()
  }
  const zoom = (delta: number) => {
    const next = Math.max(0.5, Math.min(3, scale + delta))
    setScale(next); setOffset(previous => clamp(previous, next))
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  if (!attachment) return null
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}>
    <Dialog.Portal container={document.getElementById('root')}>
      <Dialog.Overlay className="mira-attachment-preview__overlay" />
      <Dialog.Content className={`mira-attachment-preview${imageMode ? ' mira-attachment-preview--gallery' : ''}`} onOpenAutoFocus={() => { restoreFocus.current = document.activeElement as HTMLElement | null }} onCloseAutoFocus={event => {
        event.preventDefault(); if (restoreFocus.current?.isConnected) restoreFocus.current.focus()
      }} onKeyDown={event => {
        if (!imageMode || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); navigate(event.key === 'ArrowLeft' ? -1 : 1) }
      }}>
        <div className={imageMode ? 'mira-attachment-preview__actions' : 'mira-attachment-preview__header'}>
          <Dialog.Title className={imageMode ? 'sr-only' : undefined}>{item?.name || attachment.name}</Dialog.Title>
          {onSave && <button type="button" aria-label="保存附件" title="保存附件" disabled={!value || saving || decodeError} onClick={() => {
            if (!value || saving) return
            const version = lifetime.current, savedPath = item.path
            setSaving(true); setSaveError('')
            void onSave(value).catch(error => { if (lifetime.current === version && currentItem.current === savedPath) setSaveError(error instanceof Error ? error.message : '保存失败，请重试。') }).finally(() => { if (lifetime.current === version) setSaving(false) })
          }}>{saving ? <LoaderCircle size={18} className="animate-spin" /> : <Download size={18} />}</button>}
          <Dialog.Close type="button" aria-label="关闭附件预览" title="关闭附件预览"><X size={18} /></Dialog.Close>
        </div>
        <Dialog.Description className="sr-only">{imageMode ? '使用左右方向键切换图片，缩放后可拖动查看。' : '已添加文本附件的内容预览'}</Dialog.Description>
        {imageMode && items.length > 1 && <>
          <button type="button" className="mira-attachment-preview__previous" aria-label="上一张图片" title="上一张图片（←）" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <button type="button" className="mira-attachment-preview__next" aria-label="下一张图片" title="下一张图片（→）" onClick={() => navigate(1)}><ArrowRight size={18} /></button>
        </>}
        <div className="mira-attachment-preview__body" ref={viewport} onPointerDown={event => {
          if (!imageMode || !decoded || scale <= 1 || event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, offset }
        }} onPointerMove={event => {
          const start = drag.current
          if (start?.id === event.pointerId) setOffset(clamp({ x: start.offset.x + event.clientX - start.x, y: start.offset.y + event.clientY - start.y }, scale))
        }} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { drag.current = null }}>
          {imageMode ? item?.error || decodeError ? <div className="mira-attachment-preview__notice" role="alert"><ImageOff size={24} /><p>{item?.error || '图片无法解码，请重试或切换其他图片。'}</p><button type="button" onClick={() => { setImageState(undefined); setAttempt(previous => previous + 1); item?.onRetry?.() }}><RotateCw size={14} />重试</button></div>
            : value?.content ? <><img key={`${item.path}:${attempt}`} ref={image} src={`data:${value.mediaType};base64,${value.content}`} alt={item.name} draggable={false} onLoad={() => { reset(); setImageState({ attachment: value, attempt, failed: false }) }} onError={() => setImageState({ attachment: value, attempt, failed: true })} style={{ visibility: decoded ? 'visible' : 'hidden', transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }} />{!decoded && <LoaderCircle size={24} className="mira-attachment-preview__loading animate-spin" aria-label="正在加载图片" />}</>
              : <LoaderCircle size={24} className="animate-spin" aria-label="正在读取图片" />
            : <pre>{value?.content}</pre>}
        </div>
        {imageMode && <div className="mira-attachment-preview__zoom" aria-label="图片缩放">
          <button type="button" aria-label="缩小图片" title="缩小图片" disabled={!decoded || scale <= 0.5} onClick={() => zoom(-0.5)}><Minus size={16} /></button>
          <span aria-live="polite">{Math.round(scale * 100)}%</span>
          <button type="button" aria-label="放大图片" title="放大图片" disabled={!decoded || scale >= 3} onClick={() => zoom(0.5)}><Plus size={16} /></button>
          <span className="sr-only" role="status">第 {index + 1} 张，共 {items.length} 张图片</span>
        </div>}
        {saveError && <p className="mira-attachment-preview__save-error" role="alert">{saveError}</p>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
