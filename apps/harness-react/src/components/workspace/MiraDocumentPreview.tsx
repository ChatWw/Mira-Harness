import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { FileText, LoaderCircle, RotateCw } from 'lucide-react'
import type { MiraMediaPreview } from '../../../../../src/config/miraMedia'
import type { PilotController } from '../../state/pilot-state'

const MiraPdfReader = lazy(() => import('./MiraPdfReader'))
class MiraPdfBoundary extends Component<{ children: ReactNode; onError(message: string): void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError('PDF 阅读器加载失败，请重新加载 Mira 后重试。') }
  render() { return this.state.failed ? null : this.props.children }
}
export function MiraDocumentPreview({ controller, sessionId, path, active, refresh, onRetry }: {
  controller: Pick<PilotController, 'openMediaFor' | 'closeMedia'>; sessionId: string; path: string; active: boolean; refresh: number; onRetry(): void
}) {
  const [source, setSource] = useState<{ preview: MiraMediaPreview; refresh: number }>()
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    setSource(undefined)
    if (!active) return
    let disposed = false, preview: MiraMediaPreview | undefined
    setSource(undefined); setError('')
    void controller.openMediaFor(sessionId, path).then(value => {
      preview = value
      if (disposed) { void controller.closeMedia(value.id).catch(() => undefined); return }
      const url = new URL(value.url)
      if (value.path !== path || value.kind !== 'pdf' || value.mediaType !== 'application/pdf' || !/^[a-f0-9]{64}$/.test(value.id)
        || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== `/mira-media/${value.id}`) throw new Error('PDF 预览响应不匹配，请重试。')
      setSource({ preview: value, refresh })
    }).catch(cause => {
      if (preview) { void controller.closeMedia(preview.id).catch(() => undefined); preview = undefined }
      if (!disposed) setError(cause instanceof Error ? cause.message : 'PDF 读取失败，请刷新文件后重试。')
    })
    return () => { disposed = true; if (preview) void controller.closeMedia(preview.id).catch(() => undefined) }
  }, [controller, sessionId, path, active, refresh])
  if (!active) return null
  if (error) return <div className="mira-file-preview__notice" role="alert"><FileText size={22} /><p>{error}</p><button type="button" className="pilot-inline-button" onClick={onRetry}><RotateCw size={14} />重试</button></div>
  const loading = <div className="mira-file-preview__notice" role="status"><LoaderCircle size={18} className="pilot-spin" /><span>正在加载 PDF…</span></div>
  const preview = source?.refresh === refresh ? source.preview : undefined
  const failed = (message: string) => { setError(message); if (preview) void controller.closeMedia(preview.id).catch(() => undefined) }
  return preview ? <MiraPdfBoundary key={preview.id} onError={failed}><Suspense fallback={loading}><MiraPdfReader url={preview.url} page={page} scale={scale} onPage={setPage} onScale={setScale} onError={failed} /></Suspense></MiraPdfBoundary> : loading
}
