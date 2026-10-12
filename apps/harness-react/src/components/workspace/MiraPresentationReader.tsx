/* Reading interactions adapted from ZCode components/ui/pptx-preview-viewer.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira: authorized local input, lazy engine, owned DOM and desktop-only controls. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { installMiraDocumentLinks, miraDocumentHref } from '../../lib/mira-document-links'
import { clampMiraPresentationPage, clampMiraPresentationZoom, MIRA_PRESENTATION_MIN_ZOOM, MIRA_PRESENTATION_MAX_ZOOM, MIRA_PRESENTATION_ZOOM_STEP } from '../../lib/presentation/mira-presentation-controls'
import type { MiraPresentationDocument, MiraPresentationRenderHandle } from '../../lib/presentation/mira-presentation-types'

function MiraSlide({ presentation, index, scale, onNavigate, onOpenLink, onError }: {
  presentation: MiraPresentationDocument; index: number; scale: number
  onNavigate?(index: number): void; onOpenLink?(url: string): void; onError?(message: string): void
}) {
  const mount = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onNavigate, onOpenLink, onError })
  callbacks.current = { onNavigate, onOpenLink, onError }
  useEffect(() => {
    const node = mount.current!
    let cancelled = false, handle: MiraPresentationRenderHandle | undefined, releaseLinks: (() => void) | undefined
    const fail = () => { if (!cancelled) callbacks.current.onError?.('幻灯片渲染失败，请刷新重试。') }
    const resetScroll = (event: Event) => {
      if (event.target instanceof HTMLElement) { event.target.scrollTop = 0; event.target.scrollLeft = 0 }
    }
    node.addEventListener('scroll', resetScroll, true)
    try {
      handle = presentation.renderPage(index, node, { onNavigate: target => {
        if (target.pageIndex !== undefined) callbacks.current.onNavigate?.(target.pageIndex)
        else { const href = miraDocumentHref(target.url); if (href && !href.startsWith('#')) callbacks.current.onOpenLink?.(href) }
      } })
      releaseLinks = installMiraDocumentLinks(node, url => callbacks.current.onOpenLink?.(url))
      void handle.ready.catch(fail)
    } catch { fail() }
    return () => {
      cancelled = true; releaseLinks?.(); node.removeEventListener('scroll', resetScroll, true); handle?.dispose()
      // Only this leaf belongs to the renderer; never remove React overlays.
      node.replaceChildren()
    }
  // Focus updates parent callbacks during pointerdown. Keep this exact DOM until
  // its page changes, otherwise the browser loses the eventual click target.
  }, [presentation, index])
  return <div className="mira-presentation__page" style={{ width: presentation.pageSize.width * scale, height: presentation.pageSize.height * scale }}>
    <div ref={mount} data-mira-slide-index={index} className="mira-presentation__mount" style={{ width: presentation.pageSize.width, height: presentation.pageSize.height, transform: `scale(${scale})` }} />
  </div>
}

function MiraSlideThumbnail({ presentation, index, selected, scrollRoot, onSelect }: {
  presentation: MiraPresentationDocument; index: number; selected: boolean; scrollRoot: HTMLElement | null; onSelect(): void
}) {
  const button = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false), [width, setWidth] = useState(0)
  useEffect(() => {
    const node = button.current!
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { root: scrollRoot, rootMargin: '200px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [scrollRoot])
  useEffect(() => {
    const node = button.current!, update = () => setWidth(Math.max(0, node.clientWidth - 16))
    update(); const observer = new ResizeObserver(update); observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { if (selected) button.current?.scrollIntoView({ block: 'nearest' }) }, [selected])
  return <button ref={button} type="button" className="mira-presentation__thumbnail" aria-current={selected ? 'page' : undefined} aria-label={`第 ${index + 1} 张幻灯片`} onClick={onSelect}>
    <div className="mira-presentation__thumbnail-paper" style={{ aspectRatio: `${presentation.pageSize.width} / ${presentation.pageSize.height}` }} aria-hidden="true">
      {visible && width > 0 && <MiraSlide presentation={presentation} index={index} scale={width / presentation.pageSize.width} />}
    </div><span>{index + 1}</span>
  </button>
}

export default function MiraPresentationReader({ buffer, path, onOpenLink, onError }: {
  buffer: ArrayBuffer; path: string; onOpenLink?(url: string): void; onError(message: string): void
}) {
  const [opened, setOpened] = useState<{ buffer: ArrayBuffer; presentation: MiraPresentationDocument }>()
  const [page, setPage] = useState(1), [input, setInput] = useState('1'), [zoom, setZoom] = useState(100)
  const [rail, setRail] = useState<HTMLElement | null>(null), [viewport, setViewport] = useState<HTMLElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const failed = useRef(onError); failed.current = onError
  useEffect(() => {
    let cancelled = false, presentation: MiraPresentationDocument | undefined
    setOpened(undefined); setPage(1); setInput('1'); setZoom(100)
    void import('../../lib/presentation/mira-presentation-engine').then(module => module.miraPresentationEngine.open(buffer)).then(result => {
      presentation = result
      if (cancelled) { result.dispose(); return }
      if (result.pageCount && (!Number.isFinite(result.pageSize.width) || !Number.isFinite(result.pageSize.height) || result.pageSize.width <= 0 || result.pageSize.height <= 0)) throw new Error('Invalid slide size')
      setOpened({ buffer, presentation: result })
    }).catch(() => { if (!cancelled) failed.current('演示文稿无法解析，文件可能损坏或格式不受支持。请刷新重试。') })
    return () => { cancelled = true; presentation?.dispose() }
  }, [buffer])
  useEffect(() => {
    if (!viewport) return
    const update = () => setSize({ width: viewport.clientWidth, height: viewport.clientHeight })
    update(); const observer = new ResizeObserver(update); observer.observe(viewport)
    return () => observer.disconnect()
  }, [viewport])
  const presentation = opened?.buffer === buffer ? opened.presentation : undefined
  const go = useCallback((target: number) => {
    if (!presentation?.pageCount) return
    const next = clampMiraPresentationPage(target, presentation.pageCount); setPage(next); setInput(String(next))
  }, [presentation])
  const navigate = useCallback((index: number) => go(index + 1), [go])
  const renderFailed = useCallback((message: string) => failed.current(message), [])
  const commit = () => { const number = /^\d+$/.test(input.trim()) ? Number(input) : page; go(number) }
  if (!presentation) return <div className="mira-file-preview__notice" role="status" aria-busy="true">正在读取演示文稿…</div>
  if (!presentation.pageCount) return <div className="mira-file-preview__notice">演示文稿没有幻灯片</div>
  const scale = (size.width && size.height ? Math.max(.01, Math.min((size.width - 32) / presentation.pageSize.width, (size.height - 32) / presentation.pageSize.height)) : 1) * zoom / 100
  return <div className="mira-presentation" role="region" aria-label={`演示文稿 ${path}`} tabIndex={0} onKeyDown={event => {
    const target = event.target as HTMLElement
    if (target.closest('input,textarea,[contenteditable="true"]') || event.nativeEvent.isComposing || event.altKey || event.metaKey || event.ctrlKey) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); go(page + (event.key === 'ArrowLeft' ? -1 : 1)) }
  }}>
    <aside ref={setRail} className="mira-presentation__thumbnails" aria-label="幻灯片缩略图">
      {Array.from({ length: presentation.pageCount }, (_, index) => <MiraSlideThumbnail key={index} presentation={presentation} index={index} selected={page === index + 1} scrollRoot={rail} onSelect={() => go(index + 1)} />)}
    </aside>
    <div className="mira-presentation__main">
      <div ref={setViewport} className="mira-presentation__viewport"><div className="mira-presentation__stage"><MiraSlide presentation={presentation} index={page - 1} scale={scale} onNavigate={navigate} onOpenLink={onOpenLink} onError={renderFailed} /></div></div>
      <footer className="mira-presentation__controls" aria-label="演示文稿阅读控制">
        <button type="button" aria-label="上一张幻灯片" title="上一张幻灯片" disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={16} /></button>
        <input aria-label="幻灯片页码" inputMode="numeric" value={input} onChange={event => setInput(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { commit(); event.currentTarget.blur() } }} />
        <span>/ {presentation.pageCount}</span>
        <button type="button" aria-label="下一张幻灯片" title="下一张幻灯片" disabled={page >= presentation.pageCount} onClick={() => go(page + 1)}><ChevronRight size={16} /></button>
        <i aria-hidden="true" />
        <button type="button" aria-label="缩小幻灯片" title="缩小幻灯片" disabled={zoom <= MIRA_PRESENTATION_MIN_ZOOM} onClick={() => setZoom(value => clampMiraPresentationZoom(value - MIRA_PRESENTATION_ZOOM_STEP))}><ZoomOut size={16} /></button>
        <button type="button" className="mira-presentation__fit" aria-label="幻灯片适合窗口" title="适合窗口" onClick={() => setZoom(100)}>{zoom}%</button>
        <button type="button" aria-label="放大幻灯片" title="放大幻灯片" disabled={zoom >= MIRA_PRESENTATION_MAX_ZOOM} onClick={() => setZoom(value => clampMiraPresentationZoom(value + MIRA_PRESENTATION_ZOOM_STEP))}><ZoomIn size={16} /></button>
      </footer>
    </div>
  </div>
}
