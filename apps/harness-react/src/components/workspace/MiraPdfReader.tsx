/* Reading controls follow ZCode components/ui/pdf-viewer.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira: one visible page, local worker/font assets, range streaming, password form. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).href
const options = {
  cMapUrl: new URL('pdfjs/cmaps/', document.baseURI).href, cMapPacked: true,
  standardFontDataUrl: new URL('pdfjs/standard_fonts/', document.baseURI).href,
  wasmUrl: new URL('pdfjs/wasm/', document.baseURI).href,
  disableAutoFetch: true, disableStream: true, rangeChunkSize: 256 * 1024,
  isEvalSupported: false,
}
export default function MiraPdfReader({ url, page, scale, onPage, onScale, onError }: {
  url: string; page: number; scale: number; onPage(page: number): void; onScale(scale: number): void; onError(message: string): void
}) {
  const [pages, setPages] = useState(0)
  const [input, setInput] = useState(String(page))
  const [width, setWidth] = useState(0)
  const [passwordRequest, setPasswordRequest] = useState<{ submit(value: string): void; wrong: boolean }>()
  const [password, setPassword] = useState('')
  const [worker, setWorker] = useState<InstanceType<typeof pdfjs.PDFWorker>>()
  const viewport = useRef<HTMLDivElement>(null)
  const file = useMemo(() => ({ url }), [url])
  const documentOptions = useMemo(() => ({ ...options, worker }), [worker])
  useEffect(() => {
    // The first-party iframe has an opaque sandbox origin. A local blob worker imports
    // the shipped module over CORS; direct HTTP Worker URLs would fall back to the UI thread.
    const blob = URL.createObjectURL(new Blob([`import(${JSON.stringify(pdfjs.GlobalWorkerOptions.workerSrc)}).then(()=>postMessage({type:'mira-pdf-ready'})).catch(()=>postMessage({type:'mira-pdf-error'}))`], { type: 'text/javascript' }))
    let port: Worker | undefined, reader: InstanceType<typeof pdfjs.PDFWorker> | undefined
    const failed = () => onError('PDF 阅读器无法启动，请刷新文件后重试。')
    const timer = window.setTimeout(failed, 10_000)
    try {
      port = new Worker(blob, { name: 'Mira PDF reader' })
      port.onmessage = event => {
        if (event.data?.type !== 'mira-pdf-ready' && event.data?.type !== 'mira-pdf-error') return
        clearTimeout(timer)
        if (event.data?.type !== 'mira-pdf-ready') { failed(); return }
        port!.onmessage = null
        reader = pdfjs.PDFWorker.create({ port: port! }); setWorker(reader)
      }
      port.onerror = event => { event.preventDefault(); clearTimeout(timer); failed() }
      port.onmessageerror = failed
    } catch { clearTimeout(timer); failed() }
    return () => { clearTimeout(timer); reader?.destroy(); port?.terminate(); URL.revokeObjectURL(blob) }
  }, [])
  useEffect(() => {
    const element = viewport.current!
    const observer = new ResizeObserver(entries => setWidth(Math.max(1, entries[0].contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { setInput(String(page)); viewport.current?.scrollTo({ top: 0 }) }, [page])
  const go = (next: number) => { if (pages && Number.isInteger(next) && next >= 1 && next <= pages) onPage(next); else setInput(String(page)) }
  const failed = (error: Error) => onError(error.name === 'InvalidPDFException' ? 'PDF 文件损坏或格式不受支持，请确认文件后重试。' : 'PDF 读取或渲染失败，文件可能已变化，请刷新后重试。')
  return <div className="mira-pdf-reader" aria-label="PDF 阅读器">
    <div className="mira-pdf-reader__controls" role="toolbar" aria-label="PDF 阅读控制">
      <button type="button" aria-label="PDF 上一页" title="上一页" disabled={!pages || page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={15} /></button>
      <label><span className="sr-only">PDF 页码</span><input aria-label="PDF 页码" inputMode="numeric" value={input} disabled={!pages} onChange={event => setInput(event.target.value)} onBlur={() => go(Number(input))} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); go(Number(input)) } else if (event.key === 'Escape') setInput(String(page)) }} /><span aria-label={`共 ${pages} 页`}>/ {pages || '—'}</span></label>
      <button type="button" aria-label="PDF 下一页" title="下一页" disabled={!pages || page >= pages} onClick={() => go(page + 1)}><ChevronRight size={15} /></button>
      <span className="mira-pdf-reader__divider" />
      <button type="button" aria-label="缩小 PDF" title="缩小" disabled={!pages || scale <= .5} onClick={() => onScale(Math.max(.5, Math.round((scale - .25) * 100) / 100))}><ZoomOut size={15} /></button>
      <span className="mira-pdf-reader__scale">{Math.round(scale * 100)}%</span>
      <button type="button" aria-label="放大 PDF" title="放大" disabled={!pages || scale >= 3} onClick={() => onScale(Math.min(3, Math.round((scale + .25) * 100) / 100))}><ZoomIn size={15} /></button>
      <button type="button" aria-label="PDF 适合宽度" title="适合宽度" disabled={!pages} onClick={() => onScale(1)}><Maximize2 size={14} /></button>
    </div>
    <div ref={viewport} className="mira-pdf-reader__viewport" tabIndex={0} aria-label="PDF 页面" onKeyDown={event => {
      if ((event.target as HTMLElement).closest('input,button') || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); go(page + (event.key === 'ArrowRight' ? 1 : -1)) }
    }}>
      {passwordRequest && <form className="mira-pdf-reader__password" onSubmit={event => { event.preventDefault(); passwordRequest.submit(password); setPassword(''); setPasswordRequest(undefined) }}><label>此 PDF 需要密码<input type="password" aria-label="PDF 密码" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} autoFocus /></label>{passwordRequest.wrong && <p role="alert">密码不正确，请重试。</p>}<button type="submit" className="pilot-inline-button" disabled={!password}>打开 PDF</button></form>}
      {worker && <Document file={file} options={documentOptions} loading={passwordRequest ? null : <div className="mira-file-preview__notice" role="status">正在读取 PDF…</div>} onLoadSuccess={document => { setPages(document.numPages); if (page > document.numPages) onPage(document.numPages) }} onLoadError={failed} onSourceError={failed} onPassword={(submit, reason) => { setPassword(''); setPasswordRequest({ submit, wrong: reason === 2 }) }}>
        {pages > 0 && width > 0 && <Page pageNumber={page} width={Math.min(width, 1200)} scale={scale} renderAnnotationLayer={false} renderTextLayer onLoadError={failed} onRenderError={failed} onGetTextError={failed} onRenderTextLayerError={failed} loading={<div className="mira-file-preview__notice" role="status">正在渲染第 {page} 页…</div>} />}
      </Document>}
    </div>
  </div>
}
