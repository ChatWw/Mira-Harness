/* Playback presentation follows ZCode previewPaneMediaContent.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira uses owner-bound streaming URLs and stops playback when the panel hides. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, LoaderCircle, RotateCw, Video } from 'lucide-react'
import { miraMediaFormat, type MiraMediaPreview } from '../../../../../src/config/miraMedia'
import type { PilotController } from '../../state/pilot-state'

export function MiraMediaPreview({ controller, sessionId, path, active, refresh, onRetry }: {
  controller: Pick<PilotController, 'openMediaFor' | 'closeMedia'>; sessionId: string; path: string; active: boolean; refresh: number; onRetry(): void
}) {
  const format = miraMediaFormat(path)!
  const player = useRef<HTMLMediaElement | null>(null)
  const position = useRef(0)
  const [source, setSource] = useState<MiraMediaPreview>()
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const stopPlayback = useCallback(() => {
    const element = player.current
    if (element?.hasAttribute('src')) { position.current = element.currentTime; element.pause(); element.removeAttribute('src'); element.load() }
  }, [])
  const setPlayer = useCallback((element: HTMLMediaElement | null) => {
    if (player.current !== element) stopPlayback()
    player.current = element
  }, [stopPlayback])
  useEffect(() => {
    if (!active) return
    let disposed = false, preview: MiraMediaPreview | undefined
    setSource(undefined); setError(''); setReady(false)
    void controller.openMediaFor(sessionId, path).then(value => {
      preview = value
      if (disposed) { void controller.closeMedia(value.id).catch(() => undefined); return }
      const url = new URL(value.url)
      if (value.path !== path || value.kind !== format.kind || value.mediaType !== format.mediaType || !/^[a-f0-9]{64}$/.test(value.id)
        || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== `/mira-media/${value.id}`) throw new Error('媒体预览响应不匹配，请重试。')
      setSource(value)
    }).catch(cause => {
      if (preview) { void controller.closeMedia(preview.id).catch(() => undefined); preview = undefined }
      if (!disposed) setError(cause instanceof Error ? cause.message : '媒体读取失败，请刷新文件后重试。')
    })
    return () => {
      disposed = true
      stopPlayback()
      if (preview) void controller.closeMedia(preview.id).catch(() => undefined)
    }
  }, [controller, sessionId, path, active, refresh, format, stopPlayback])
  const failed = () => {
    const code = player.current?.error?.code
    setError(code === 3 || code === 4 ? '此媒体格式或编码无法在应用内播放，请使用外部应用打开。' : '媒体读取中断或文件已变化，请刷新文件后重试。')
  }
  const loaded = () => {
    const element = player.current
    if (element && Number.isFinite(element.duration) && position.current > 0) element.currentTime = Math.min(position.current, element.duration)
    setReady(true)
  }
  if (error) return <div className="mira-file-preview__notice" role="alert">{format.kind === 'audio' ? <AudioLines size={22} /> : <Video size={22} />}<p>{error}</p><button type="button" className="pilot-inline-button" onClick={onRetry}><RotateCw size={14} />重试</button></div>
  return <div className="mira-media-preview" aria-busy={!ready}>
    {source && (format.kind === 'video'
      ? <video ref={setPlayer} aria-label={`视频预览 ${path}`} controls playsInline preload="metadata" src={source.url} onLoadedMetadata={loaded} onError={failed} />
      : <audio ref={setPlayer} aria-label={`音频预览 ${path}`} controls preload="metadata" src={source.url} onLoadedMetadata={loaded} onError={failed} />)}
    {!ready && <div className="mira-media-preview__loading" role="status"><LoaderCircle size={18} className="pilot-spin" /><span>正在加载{format.kind === 'video' ? '视频' : '音频'}…</span></div>}
  </div>
}
