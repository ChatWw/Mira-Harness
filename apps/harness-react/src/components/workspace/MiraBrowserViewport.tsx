/* Adapted from ZCode BrowserViewportToolbar / ResponsiveBrowserViewport (Apache-2.0).
 * Copyright 2026 Z.AI Co., Ltd. Mira: separate Shell-owned guest and scoped geometry.
 * See third-party-licenses/zcode/ADAPTATIONS.md. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type PointerEvent, type KeyboardEvent } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, GripHorizontal, GripVertical } from 'lucide-react'
import { MIRA_BROWSER_LIMITS, MIRA_BROWSER_ZOOMS, isMiraBrowserDimension, miraBrowserScale, type MiraBrowserPreference, type MiraBrowserSize } from '../../../../../src/config/miraBrowserViewport'
import type { HarnessBrowserPresentation } from '../../../../../src/platform/firstPartyHarness'

export function MiraBrowserViewportToolbar({ preference, onChange }: { preference: MiraBrowserPreference; onChange: (value: MiraBrowserPreference) => void }) {
  const [draft, setDraft] = useState({ width: String(preference.size.width), height: String(preference.size.height) })
  const [invalid, setInvalid] = useState({ width: false, height: false })
  const escaped = useRef<keyof MiraBrowserSize | null>(null)
  useEffect(() => { setDraft(current => ({ ...current, width: String(preference.size.width) })); setInvalid(current => ({ ...current, width: false })) }, [preference.size.width])
  useEffect(() => { setDraft(current => ({ ...current, height: String(preference.size.height) })); setInvalid(current => ({ ...current, height: false })) }, [preference.size.height])
  const commit = (key: keyof MiraBrowserSize) => {
    if (escaped.current === key) { escaped.current = null; return }
    const value = Number(draft[key].trim()), valid = isMiraBrowserDimension(key, value)
    setInvalid(current => ({ ...current, [key]: !valid }))
    if (valid && value !== preference.size[key]) onChange({ ...preference, size: { ...preference.size, [key]: value } })
  }
  return <div className="mira-browser-viewport-toolbar" aria-label="浏览器尺寸和缩放">
    {(['width', 'height'] as const).map((key, index) => <span className="mira-browser-dimension" key={key}>
      {index === 1 && <span aria-hidden="true">×</span>}
      <input aria-label={key === 'width' ? '网页宽度' : '网页高度'} inputMode="numeric" spellCheck={false} value={draft[key]} aria-invalid={invalid[key] || undefined}
        onChange={event => { setDraft(current => ({ ...current, [key]: event.target.value })); if (invalid[key]) setInvalid(current => ({ ...current, [key]: !isMiraBrowserDimension(key, Number(event.target.value.trim())) })) }}
        onBlur={() => commit(key)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(key) } if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); escaped.current = key; setDraft(current => ({ ...current, [key]: String(preference.size[key]) })); setInvalid(current => ({ ...current, [key]: false })); event.currentTarget.blur() } }} />
      {invalid[key] && <span className="mira-browser-dimension-error" role="alert">{key === 'width' ? '宽度' : '高度'}需为 {MIRA_BROWSER_LIMITS[key][0]}–{MIRA_BROWSER_LIMITS[key][1]} 的整数</span>}
    </span>)}
    <DropdownMenu.Root><DropdownMenu.Trigger className="mira-browser-zoom" aria-label="网页预览缩放">{preference.zoom === 'fit' ? '适应' : `${preference.zoom}%`}<ChevronDown size={12} /></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" sideOffset={4} align="end"><DropdownMenu.RadioGroup value={preference.zoom} onValueChange={zoom => onChange({ ...preference, zoom: zoom as MiraBrowserPreference['zoom'] })}>{MIRA_BROWSER_ZOOMS.map(zoom => <DropdownMenu.RadioItem key={zoom} className="mira-session-menu__item" value={zoom}>{zoom === 'fit' ? '适应画布' : `${zoom}%`}</DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
  </div>
}

const edges = [{ key: 'left', x: -1, y: 0 }, { key: 'right', x: 1, y: 0 }, { key: 'top', x: 0, y: -1 }, { key: 'bottom', x: 0, y: 1 }, { key: 'top-left', x: -1, y: -1 }, { key: 'top-right', x: 1, y: -1 }, { key: 'bottom-left', x: -1, y: 1 }, { key: 'bottom-right', x: 1, y: 1 }] as const
export function MiraBrowserViewport({ preference, desktopZoom, active, viewportRef, onChange, onGeometry, children }: {
  preference: MiraBrowserPreference; desktopZoom: number; active: boolean; viewportRef: RefObject<HTMLDivElement | null>
  onChange: (value: MiraBrowserPreference) => void; onGeometry: (value: HarnessBrowserPresentation) => void; children: ReactNode
}) {
  const canvasRef = useRef<HTMLDivElement>(null), [canvas, setCanvas] = useState({ width: 0, height: 0 })
  const free = preference.mode === 'free', scale = free ? miraBrowserScale(canvas, preference.size, preference.zoom, desktopZoom) : 1
  const rendererScale = scale / desktopZoom
  const live = useRef({ preference, onChange, onGeometry, rendererScale }); live.current = { preference, onChange, onGeometry, rendererScale }
  const drag = useRef<{ target: HTMLElement; id: number; x: number; y: number; size: MiraBrowserSize; dx: number; dy: number; scale: number } | null>(null)
  const resizeFrame = useRef<number | undefined>(undefined), pendingSize = useRef<MiraBrowserSize | null>(null)
  const clamp = (size: MiraBrowserSize) => ({ width: Math.min(3840, Math.max(320, Math.round(size.width))), height: Math.min(2160, Math.max(320, Math.round(size.height))) })
  const apply = () => { resizeFrame.current = undefined; const size = pendingSize.current; pendingSize.current = null; if (size) live.current.onChange({ ...live.current.preference, size }) }
  const end = (commit = true) => {
    const previous = drag.current; drag.current = null
    if (resizeFrame.current !== undefined) cancelAnimationFrame(resizeFrame.current)
    resizeFrame.current = undefined
    if (commit) apply(); else pendingSize.current = null
    if (previous?.target.hasPointerCapture(previous.id)) previous.target.releasePointerCapture(previous.id)
  }
  useEffect(() => { if (!active || !free) end(false); const blur = () => end(); window.addEventListener('blur', blur); return () => { window.removeEventListener('blur', blur); end(false) } }, [active, free])
  useLayoutEffect(() => {
    if (!active || !canvasRef.current || !viewportRef.current) return
    const canvasElement = canvasRef.current, frame = viewportRef.current
    let scheduled: number | undefined
    const update = () => {
      scheduled = undefined
      const area = canvasElement.getBoundingClientRect(), rect = frame.getBoundingClientRect()
      if (area.width <= 0 || area.height <= 0) return
      setCanvas(current => current.width === area.width && current.height === area.height ? current : { width: area.width, height: area.height })
      const bounds = { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.max(16, Math.round(rect.width)), height: Math.max(16, Math.round(rect.height)) }
      live.current.onGeometry({ bounds, clip: { x: Math.max(0, Math.round(area.left)), y: Math.max(0, Math.round(area.top)), width: Math.max(16, Math.round(area.width)), height: Math.max(16, Math.round(area.height)) }, viewport: free ? live.current.preference.size : null, scale })
    }
    const schedule = () => { if (scheduled === undefined) scheduled = requestAnimationFrame(update) }
    update()
    const observer = new ResizeObserver(schedule); observer.observe(canvasElement); observer.observe(frame)
    canvasElement.addEventListener('scroll', schedule); window.addEventListener('resize', schedule)
    return () => { observer.disconnect(); canvasElement.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); if (scheduled !== undefined) cancelAnimationFrame(scheduled) }
  }, [active, free, scale, desktopZoom, preference.size.width, preference.size.height])
  const begin = (edge: typeof edges[number], event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault(); end(); event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { target: event.currentTarget, id: event.pointerId, x: event.clientX, y: event.clientY, size: { ...preference.size }, dx: edge.x, dy: edge.y, scale: rendererScale }
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current; if (!current || current.id !== event.pointerId) return
    pendingSize.current = clamp({ width: current.size.width + (event.clientX - current.x) / current.scale * current.dx, height: current.size.height + (event.clientY - current.y) / current.scale * current.dy })
    if (resizeFrame.current === undefined) resizeFrame.current = requestAnimationFrame(apply)
  }
  const keyboard = (edge: typeof edges[number], event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1, direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    if (edge.x && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); onChange({ ...preference, size: clamp({ ...preference.size, width: preference.size.width + edge.x * direction * step }) }) }
    if (edge.y && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); onChange({ ...preference, size: clamp({ ...preference.size, height: preference.size.height + edge.y * direction * step }) }) }
  }
  return <div ref={canvasRef} className={`mira-browser-canvas${free ? ' is-free' : ''}`}><div className="mira-browser-canvas__content"><div ref={viewportRef} className="pilot-browser__view" data-viewport-mode={preference.mode} data-viewport-scale={scale} style={free ? { width: preference.size.width * rendererScale, height: preference.size.height * rendererScale } : undefined}>
    {children}
    {free && edges.map(edge => <div key={edge.key} className={`mira-browser-resize mira-browser-resize--${edge.key}`} data-resize-edge={edge.key} role={edge.x && edge.y ? undefined : 'separator'} tabIndex={edge.x && edge.y ? undefined : 0} aria-hidden={edge.x && edge.y ? true : undefined} aria-label={edge.x ? '调整网页宽度' : '调整网页高度'} aria-orientation={edge.x ? 'vertical' : 'horizontal'} aria-valuemin={320} aria-valuemax={edge.x ? 3840 : 2160} aria-valuenow={edge.x ? preference.size.width : preference.size.height} onPointerDown={event => begin(edge, event)} onPointerMove={move} onPointerUp={() => end()} onPointerCancel={() => end()} onLostPointerCapture={() => end()} onKeyDown={event => keyboard(edge, event)}>{!(edge.x && edge.y) && (edge.x ? <GripVertical size={16} /> : <GripHorizontal size={16} />)}</div>)}
  </div></div></div>
}
