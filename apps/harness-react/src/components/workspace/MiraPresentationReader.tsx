/* Reading interactions adapted from ZCode components/ui/pptx-preview-viewer.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira: authorized local input, lazy engine, owned DOM and desktop-only controls. */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ChevronLeft, ChevronRight, MousePointer2, Sparkles, ZoomIn, ZoomOut } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { installMiraDocumentLinks, miraDocumentHref } from '../../lib/mira-document-links'
import { clampMiraPresentationPage, clampMiraPresentationZoom, MIRA_PRESENTATION_MIN_ZOOM, MIRA_PRESENTATION_MAX_ZOOM, MIRA_PRESENTATION_ZOOM_STEP } from '../../lib/presentation/mira-presentation-controls'
import { hitTestMiraPresentationElement } from '../../lib/presentation/mira-presentation-elements'
import { getMiraPresentationSelectedText } from '../../lib/presentation/mira-presentation-selection'
import type { MiraPresentationDocument, MiraPresentationElement, MiraPresentationRenderHandle } from '../../lib/presentation/mira-presentation-types'

function elementKey(element: MiraPresentationElement): string {
  return [element.slideIndex, element.slidePart, element.nodeId, element.nodePath ?? '', element.nodeType, element.rowIndex ?? '', element.cellIndex ?? ''].join(':')
}
function clearSlideTextSelection(surface: HTMLElement | null) {
  const selection = surface?.ownerDocument.getSelection()
  if (selection && (surface?.contains(selection.anchorNode) || surface?.contains(selection.focusNode))) selection.removeAllRanges()
}

function MiraSlide({ presentation, index, scale, onNavigate, onOpenLink, onError, selectionMode = false, elements = [], selectedElement, onSelectElement, renderSurfaceRef }: {
  presentation: MiraPresentationDocument; index: number; scale: number
  onNavigate?(index: number): void; onOpenLink?(url: string): void; onError?(message: string): void
  selectionMode?: boolean; elements?: readonly MiraPresentationElement[]; selectedElement?: MiraPresentationElement
  onSelectElement?(element?: MiraPresentationElement): void; renderSurfaceRef?: RefObject<HTMLDivElement | null>
}) {
  const internalMount = useRef<HTMLDivElement>(null), mount = renderSurfaceRef ?? internalMount
  const textSelectionEnabled = selectionMode && Boolean(selectedElement?.text?.trim())
  const callbacks = useRef({ onNavigate, onOpenLink, onError, selectionMode })
  callbacks.current = { onNavigate, onOpenLink, onError, selectionMode }
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
        if (callbacks.current.selectionMode) return
        if (target.pageIndex !== undefined) callbacks.current.onNavigate?.(target.pageIndex)
        else { const href = miraDocumentHref(target.url); if (href && !href.startsWith('#')) callbacks.current.onOpenLink?.(href) }
      } })
      releaseLinks = installMiraDocumentLinks(node, url => { if (!callbacks.current.selectionMode) callbacks.current.onOpenLink?.(url) })
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
  return <div className="mira-presentation__page" style={{ width: presentation.pageSize.width * scale, height: presentation.pageSize.height * scale }} onClickCapture={event => {
    if (selectionMode && mount.current?.contains(event.target as Node)) { event.preventDefault(); event.stopPropagation() }
  }}>
    <div ref={mount} data-mira-slide-index={index} className="mira-presentation__mount" style={{ width: presentation.pageSize.width, height: presentation.pageSize.height, transform: `scale(${scale})`, pointerEvents: selectionMode && !textSelectionEnabled ? 'none' : undefined }} onPointerDownCapture={event => {
      if (!textSelectionEnabled) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const hit = hitTestMiraPresentationElement(elements, { x: (event.clientX - rect.left) / rect.width * presentation.pageSize.width, y: (event.clientY - rect.top) / rect.height * presentation.pageSize.height })
      if (hit && selectedElement && elementKey(hit) === elementKey(selectedElement)) return
      event.preventDefault(); event.stopPropagation(); onSelectElement?.(hit ?? undefined)
    }} />
    {selectionMode && <div className="mira-presentation__selection-layer" data-mira-presentation-selection style={{ width: presentation.pageSize.width, height: presentation.pageSize.height, transform: `scale(${scale})` }}>
      {elements.map(element => {
        const key = elementKey(element), selected = selectedElement && key === elementKey(selectedElement)
        const button = <button type="button" className="mira-presentation__element" aria-label={element.text?.trim() || element.nodeName || element.nodeType} aria-pressed={Boolean(selected)} style={{ left: element.bounds.x, top: element.bounds.y, width: element.bounds.width, height: element.bounds.height, zIndex: (element.nodeType === 'table-cell' ? 1000000 : 0) + element.zIndex, pointerEvents: textSelectionEnabled ? 'none' : 'auto' }} onClick={() => onSelectElement?.(element)} />
        return <span key={key} className="mira-presentation__element-holder">{button}</span>
      })}
      {selectedElement && <Popover.Anchor asChild><span className="mira-presentation__element-anchor" style={{ left: selectedElement.bounds.x, top: selectedElement.bounds.y, width: selectedElement.bounds.width, height: selectedElement.bounds.height }} /></Popover.Anchor>}
    </div>}
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

export default function MiraPresentationReader({ buffer, path, onOpenLink, onError, onAddElement, sourceFingerprint, navigation }: {
  buffer: ArrayBuffer; path: string; onOpenLink?(url: string): void; onError(message: string): void
  onAddElement?(element: MiraPresentationElement, comment: string, selectedText?: string): Promise<void>
  sourceFingerprint?: string
  navigation?: { requestId: string; reference: { sourceFingerprint: string; element: MiraPresentationElement } }
}) {
  const [opened, setOpened] = useState<{ buffer: ArrayBuffer; presentation: MiraPresentationDocument }>()
  const [page, setPage] = useState(1), [input, setInput] = useState('1'), [zoom, setZoom] = useState(100)
  const [rail, setRail] = useState<HTMLElement | null>(null), [viewport, setViewport] = useState<HTMLElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [selection, setSelection] = useState<{ mode: boolean; element?: MiraPresentationElement; draft?: { comment: string; selectedText?: string }; adding?: boolean; error?: string }>({ mode: false })
  const [navigationNotice, setNavigationNotice] = useState<string>()
  const surface = useRef<HTMLDivElement>(null), composing = useRef(false), generation = useRef(0), addingGeneration = useRef<number>(undefined)
  const identity = useRef({ buffer, path, sourceFingerprint })
  if (identity.current.buffer !== buffer || identity.current.path !== path || identity.current.sourceFingerprint !== sourceFingerprint) {
    identity.current = { buffer, path, sourceFingerprint }; generation.current++
  }
  const requests = useRef(new Set<string>())
  const live = useRef({ buffer, path, sourceFingerprint, onAddElement }); live.current = { buffer, path, sourceFingerprint, onAddElement }
  const failed = useRef(onError); failed.current = onError
  const clearSelection = useCallback((mode = false) => {
    generation.current++; composing.current = false
    clearSlideTextSelection(surface.current)
    setSelection({ mode })
  }, [])
  useEffect(() => { clearSelection(); setNavigationNotice(undefined) }, [buffer, path, sourceFingerprint, clearSelection])
  useEffect(() => { if (!onAddElement) clearSelection() }, [Boolean(onAddElement), clearSelection])
  useEffect(() => () => { generation.current++ }, [])
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
    const next = clampMiraPresentationPage(target, presentation.pageCount)
    if (next !== page) clearSelection(selection.mode)
    setPage(next); setInput(String(next))
  }, [presentation, page, selection.mode, clearSelection])
  const navigate = useCallback((index: number) => go(index + 1), [go])
  const renderFailed = useCallback((message: string) => failed.current(message), [])
  const elements = useMemo(() => presentation && selection.mode && onAddElement ? presentation.getPageElements(page - 1) : [], [presentation, selection.mode, page, Boolean(onAddElement)])
  useEffect(() => {
    if (!presentation || !navigation || requests.current.has(navigation.requestId)) return
    requests.current.add(navigation.requestId); clearSelection()
    if (!sourceFingerprint || navigation.reference.sourceFingerprint !== sourceFingerprint) {
      setNavigationNotice('文件已变更，无法定位旧的元素引用。请重新选择元素。'); return
    }
    const index = navigation.reference.element.slideIndex
    if (!Number.isInteger(index) || index < 0 || index >= presentation.pageCount) {
      setNavigationNotice('引用的幻灯片不存在。请重新选择元素。'); return
    }
    setNavigationNotice(undefined); setPage(index + 1); setInput(String(index + 1))
  }, [presentation, navigation, sourceFingerprint, clearSelection])
  const selectElement = (element?: MiraPresentationElement) => {
    generation.current++; composing.current = false
    clearSlideTextSelection(surface.current)
    setSelection({ mode: true, element })
  }
  const editElement = () => {
    if (!presentation || !selection.element || selection.adding) return
    const selectedText = getMiraPresentationSelectedText({ selection: surface.current?.ownerDocument.getSelection() ?? null, renderSurface: surface.current, pageSize: presentation.pageSize, elementBounds: selection.element.bounds, elementText: selection.element.text })
    setSelection(value => ({ ...value, error: undefined, draft: { comment: '', ...(selectedText ? { selectedText } : {}) } }))
  }
  const cancelEdit = () => {
    generation.current++; composing.current = false
    setSelection(value => ({ mode: value.mode, element: value.element }))
  }
  const addElement = async () => {
    const callback = live.current.onAddElement, element = selection.element, draft = selection.draft
    if (!callback || !element || !draft || selection.adding) return
    const token = generation.current, owner = identity.current
    if (addingGeneration.current === token) return
    addingGeneration.current = token
    setSelection(value => ({ ...value, adding: true, error: undefined }))
    try {
      await callback(element, draft.comment.trim(), draft.selectedText)
      if (token !== generation.current || owner !== identity.current || !live.current.onAddElement) return
      setSelection(value => ({ mode: value.mode, element: value.element }))
      clearSlideTextSelection(surface.current)
    } catch {
      if (token !== generation.current || owner !== identity.current || !live.current.onAddElement) return
      setSelection(value => ({ ...value, adding: false, error: '元素引用添加失败，请重试；评论已保留。' }))
    } finally {
      if (addingGeneration.current === token) addingGeneration.current = undefined
    }
  }
  const commit = () => { const number = /^\d+$/.test(input.trim()) ? Number(input) : page; go(number) }
  if (!presentation) return <div className="mira-file-preview__notice" role="status" aria-busy="true">正在读取演示文稿…</div>
  if (!presentation.pageCount) return <div className="mira-file-preview__notice">演示文稿没有幻灯片</div>
  const scale = (size.width && size.height ? Math.max(.01, Math.min((size.width - 32) / presentation.pageSize.width, (size.height - 32) / presentation.pageSize.height)) : 1) * zoom / 100
  return <div className="mira-presentation" role="region" aria-label={`演示文稿 ${path}`} tabIndex={0} onKeyDown={event => {
    const target = event.target as HTMLElement
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composing.current || event.altKey || event.metaKey || event.ctrlKey) return
    if (event.key === 'Escape' && selection.mode) { event.preventDefault(); if (selection.draft) cancelEdit(); else clearSelection(); return }
    if (target.closest('input,textarea,[contenteditable="true"]')) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); go(page + (event.key === 'ArrowLeft' ? -1 : 1)) }
  }}>
    <aside ref={setRail} className="mira-presentation__thumbnails" aria-label="幻灯片缩略图">
      {Array.from({ length: presentation.pageCount }, (_, index) => <MiraSlideThumbnail key={index} presentation={presentation} index={index} selected={page === index + 1} scrollRoot={rail} onSelect={() => go(index + 1)} />)}
    </aside>
    <div className="mira-presentation__main">
      {navigationNotice && <div className="mira-presentation__notice" role="status">{navigationNotice}</div>}
      <div ref={setViewport} className="mira-presentation__viewport"><div className="mira-presentation__stage">
        <Popover.Root open={Boolean(onAddElement && selection.mode && selection.element)} modal={false}>
          <MiraSlide presentation={presentation} index={page - 1} scale={scale} onNavigate={navigate} onOpenLink={onOpenLink} onError={renderFailed} selectionMode={Boolean(onAddElement && selection.mode)} elements={elements} selectedElement={selection.element} onSelectElement={selectElement} renderSurfaceRef={surface} />
          <Popover.Portal><Popover.Content role="toolbar" aria-label="幻灯片元素 AI 编辑" className={`mira-presentation__actions${selection.draft ? ' mira-presentation__actions--editing' : ''}`} side="top" align="center" sideOffset={8} collisionBoundary={viewport} collisionPadding={8} sticky="partial" hideWhenDetached updatePositionStrategy="always" onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => {
            event.preventDefault()
            if (event.isComposing || event.keyCode === 229 || composing.current) return
            if (selection.draft) cancelEdit(); else clearSelection()
          }}>
            {selection.draft ? <><textarea autoFocus aria-label="元素修改说明" placeholder="描述你希望如何修改这个元素…" rows={3} value={selection.draft.comment} disabled={selection.adding} onChange={event => { const comment = event.target.value; setSelection(value => ({ ...value, draft: { ...value.draft!, comment } })) }} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} />
              {selection.error && <p role="alert">{selection.error}</p>}
              <div className="mira-presentation__action-buttons"><button type="button" onClick={cancelEdit}>取消</button><button type="button" className="mira-presentation__add" disabled={selection.adding} onClick={() => void addElement()}>{selection.adding ? '正在添加…' : '添加到对话'}</button></div>
            </> : <button type="button" onMouseDown={event => event.preventDefault()} onClick={editElement}><Sparkles size={16} aria-hidden="true" />AI 编辑</button>}
          </Popover.Content></Popover.Portal>
        </Popover.Root>
      </div></div>
      <footer className="mira-presentation__controls" aria-label="演示文稿阅读控制">
        {onAddElement && <button type="button" className="mira-presentation__select" aria-label={selection.mode ? '退出元素选择' : '选择幻灯片元素'} title={selection.mode ? '退出元素选择' : '选择元素'} aria-pressed={selection.mode} onClick={() => clearSelection(!selection.mode)}><MousePointer2 size={16} aria-hidden="true" />{selection.mode ? '退出选择' : '选择元素'}</button>}
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
