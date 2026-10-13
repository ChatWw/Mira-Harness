import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { LoaderCircle, RotateCw } from 'lucide-react'
import type { HarnessMessageAttachment } from '../../../../../src/config/harness'

const MiraPdfReader = lazy(() => import('../workspace/MiraPdfReader'))
class MiraAttachmentReaderBoundary extends Component<{ children: ReactNode; onError(): void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

/** Preview the frozen attachment bytes, never a subsequently changed workspace file. */
export function MiraBinaryAttachmentPreview({ attachment }: { attachment: HarnessMessageAttachment }) {
  const [source, setSource] = useState<{ attachment: HarnessMessageAttachment; url: string }>()
  const [readyVideo, setReadyVideo] = useState<string>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    setSource(undefined); setError(''); setPage(1); setScale(1)
    let url: string | undefined
    try {
      const bytes = Uint8Array.from(atob(attachment.content), character => character.charCodeAt(0))
      url = URL.createObjectURL(new Blob([bytes], { type: attachment.mediaType }))
      setSource({ attachment, url })
    } catch { setError('附件无法读取，请关闭预览后重新添加文件。') }
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [attachment, attempt])
  if (error) return <div className="mira-attachment-preview__notice" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}><RotateCw size={14} />重试</button></div>
  const loading = <LoaderCircle size={24} className="animate-spin" aria-label="正在读取附件" />
  const url = source?.attachment === attachment ? source.url : undefined
  if (!url) return loading
  return attachment.mediaType === 'application/pdf' ? <MiraAttachmentReaderBoundary key={url} onError={() => setError('PDF 阅读器加载失败，请重试。')}><Suspense fallback={loading}><MiraPdfReader key={url} url={url} page={page} scale={scale} onPage={setPage} onScale={setScale} onError={setError} /></Suspense></MiraAttachmentReaderBoundary>
    : <>{readyVideo !== url && <LoaderCircle size={24} className="animate-spin" aria-label="正在加载视频" />}<video key={url} src={url} controls playsInline preload="metadata" style={readyVideo === url ? undefined : { position: 'absolute', visibility: 'hidden' }} aria-label={`预览视频 ${attachment.name}`} onLoadedMetadata={() => setReadyVideo(url)} onError={() => setError('当前播放器无法解码此视频，可保存后使用本地播放器打开。')} /></>
}
