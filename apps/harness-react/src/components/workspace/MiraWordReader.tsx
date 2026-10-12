/* Adapted from ZCode packages/ui/src/previewPaneOfficeDocxContent.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira isolates document styles in a ShadowRoot and discards late render results. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderAsync, type Options } from 'docx-preview'
import { installMiraDocumentLinks } from '../../lib/mira-document-links'

const wordOptions = {
  className: 'mira-word-page', inWrapper: true, breakPages: true,
  ignoreWidth: false, ignoreHeight: false, ignoreFonts: false,
  // Preserve section boundaries and margins, matching docx-preview's default.
  ignoreLastRenderedPageBreak: true, experimental: true, debug: false,
  renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
  renderChanges: false, renderComments: false, renderAltChunks: false, useBase64URL: true,
} satisfies Partial<Options>

type WordFit = { scale: number; width: number; height: number }
export default function MiraWordReader({ buffer, path, onOpenLink, onError }: {
  buffer: ArrayBuffer; path: string; onOpenLink?(url: string): void; onError(message: string): void
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onOpenLink, onError })
  callbacks.current = { onOpenLink, onError }
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [fit, setFit] = useState<WordFit>()

  useEffect(() => {
    const visible = mount.current
    if (!visible) return
    let active = true
    let disposeLinks: (() => void) | undefined
    const host = document.createElement('div')
    host.dataset.miraWordDocument = ''
    const shadow = host.attachShadow({ mode: 'open' })
    const styles = document.createElement('div')
    const body = document.createElement('div')
    shadow.append(styles, body)
    setState('loading'); setFit(undefined); visible.replaceChildren()
    void renderAsync(buffer, body, styles, wordOptions).then(() => {
      if (!active) { shadow.replaceChildren(); return }
      const wrapper = body.querySelector<HTMLElement>('.mira-word-page-wrapper')
      if (wrapper) {
        wrapper.style.background = 'transparent'
        wrapper.style.padding = '0'
        wrapper.style.width = 'max-content'
      }
      const surface = document.createElement('style')
      surface.textContent = `:host { display: block; width: max-content; color-scheme: light; color: #111; font-family: inherit; }
        .mira-word-page-wrapper > section.mira-word-page { box-shadow: 0 2px 10px rgb(15 23 42 / .08), 0 1px 2px rgb(15 23 42 / .05); }
        ::selection { background: #b9d7ff; color: #111; }
        a:focus-visible { outline: 2px solid #1859b3; outline-offset: 2px; }`
      styles.append(surface)
      disposeLinks = installMiraDocumentLinks(body, url => callbacks.current.onOpenLink?.(url))
      visible.replaceChildren(host)
      setState('ready')
    }).catch(() => {
      shadow.replaceChildren()
      if (!active) return
      visible.replaceChildren(); setState('error')
      callbacks.current.onError('Word 文档无法解析，文件可能已损坏或受密码保护。请刷新重试，或使用外部应用打开。')
    })
    return () => {
      active = false; disposeLinks?.(); host.remove(); shadow.replaceChildren(); visible.replaceChildren()
    }
  }, [buffer, path])

  useLayoutEffect(() => {
    if (state !== 'ready') return
    const updateFit = () => {
      const available = viewport.current?.clientWidth ?? 0
      const width = content.current?.offsetWidth ?? 0
      const height = content.current?.offsetHeight ?? 0
      if (available <= 0 || width <= 0 || height <= 0) return
      const scale = Math.min(1, available / width)
      const next = { scale, width: width * scale, height: height * scale }
      setFit(current => current && Math.abs(current.scale - scale) < .001 && Math.abs(current.width - next.width) < .5 && Math.abs(current.height - next.height) < .5 ? current : next)
    }
    updateFit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateFit)
    if (viewport.current) observer.observe(viewport.current)
    if (content.current) observer.observe(content.current)
    return () => observer.disconnect()
  }, [state])

  return <div className="mira-word-reader" aria-busy={state === 'loading'} data-word-state={state}>
    {state === 'loading' && <div className="mira-word-reader__loading" role="status"><span>正在加载 Word 文档…</span><div className="mira-word-reader__skeleton" aria-hidden="true" /></div>}
    <div className="mira-word-reader__scroll" hidden={state !== 'ready'} role="region" tabIndex={0} aria-label="Word 文档，使用方向键滚动">
      <div ref={viewport} className="mira-word-reader__viewport">
        <div className="mira-word-reader__frame" style={fit ? { width: fit.width, height: fit.height } : undefined}>
          <div ref={content} className="mira-word-reader__content" style={fit ? { position: 'absolute', transform: `scale(${fit.scale})` } : undefined}>
            <div ref={mount} />
          </div>
        </div>
      </div>
    </div>
  </div>
}
