import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DocxEditorViewer, setWasmSource, useDocxEditor, useDocxModel, type DocModel } from '@extend-ai/react-docx'
import { installMiraDocumentLinks } from '../../lib/mira-document-links'

setWasmSource(new URL('office/docx_wasm_bg.wasm', document.baseURI).href)
type ReaderProps = { buffer: ArrayBuffer; path: string; onOpenLink?(url: string): void; onError(message: string): void }
const inputIds = new WeakMap<ArrayBuffer, number>()
let nextInputId = 0
function inputIdentity(buffer: ArrayBuffer) {
  if (!inputIds.has(buffer)) inputIds.set(buffer, ++nextInputId)
  return inputIds.get(buffer)!
}

function MiraLegacyWordPaper({ model, path, onOpenLink }: { model: DocModel; path: string; onOpenLink?(url: string): void }) {
  const editor = useDocxEditor({ starterModel: model, initialFileName: path, initialDocumentTheme: 'light' })
  const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null)
  const callbacks = useRef(onOpenLink)
  callbacks.current = onOpenLink
  const [fit, setFit] = useState<{ scale: number; width: number; height: number }>()
  const virtualization = useMemo(() => ({ zoomScale: fit?.scale ?? 1, scrollElement: scroll.current }), [fit?.scale])
  useLayoutEffect(() => {
    const update = () => {
      const width = content.current?.offsetWidth ?? 0, height = content.current?.offsetHeight ?? 0, available = viewport.current?.clientWidth ?? 0
      if (width <= 0 || height <= 0 || available <= 0) return
      const scale = Math.min(1, available / width), next = { scale, width: width * scale, height: height * scale }
      setFit(current => current && Math.abs(current.scale - scale) < .001 && Math.abs(current.width - next.width) < .5 && Math.abs(current.height - next.height) < .5 ? current : next)
    }
    const cleanupLinks = content.current ? installMiraDocumentLinks(content.current, url => callbacks.current?.(url), { delegateInternalAnchors: true }) : undefined
    update()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    if (viewport.current) observer?.observe(viewport.current)
    if (content.current) observer?.observe(content.current)
    return () => { observer?.disconnect(); cleanupLinks?.() }
  }, [])
  return <div ref={scroll} className="mira-legacy-word-reader" role="region" tabIndex={0} aria-label="Word 文档只读预览，使用方向键滚动">
    <div ref={viewport} className="mira-legacy-word-reader__viewport">
      <div className="mira-legacy-word-reader__frame" style={fit ? { width: fit.width, height: fit.height } : undefined}>
        <div ref={content} className="mira-legacy-word-reader__content" style={fit ? { position: 'absolute', transform: `scale(${fit.scale})` } : undefined}>
          <DocxEditorViewer editor={editor} className="mira-legacy-word-reader__paper" mode="read-only" pageGapBackgroundColor="transparent" pageVirtualization={virtualization} />
        </div>
      </div>
    </div>
  </div>
}

function MiraLegacyWordInput({ buffer, path, onOpenLink, onError }: ReaderProps) {
  const { model, isLoading, error } = useDocxModel(buffer)
  const errorCallback = useRef(onError)
  errorCallback.current = onError
  useEffect(() => {
    if (!isLoading && (error || !model)) errorCallback.current('Word 文档无法解析，文件可能损坏、受密码保护或格式不受支持。请刷新重试，或使用外部应用打开。')
  }, [isLoading, error, model])
  if (isLoading) return <div className="mira-legacy-word-reader__loading" role="status" aria-busy="true"><span>正在读取 Word 文档…</span><div aria-hidden="true" /></div>
  if (error || !model) return <div className="mira-file-preview__notice" role="alert">无法读取 Word 文档，请刷新重试或使用外部应用打开。</div>
  return <MiraLegacyWordPaper model={model} path={path} onOpenLink={onOpenLink} />
}

export default function MiraLegacyWordReader(props: ReaderProps) {
  // The library aborts its import worker on unmount; remount on new bytes so an old
  // parsed model is never exposed during the hook's next effect/loading transition.
  return <MiraLegacyWordInput key={`${inputIdentity(props.buffer)}:${props.path}`} {...props} />
}
