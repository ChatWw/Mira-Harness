/* Office preview follows ZCode previewPaneOfficeContent.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira uses bounded, owner-authorized binary reads and lazy isolated readers. */
import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { FileText, LoaderCircle, RotateCw } from 'lucide-react'
import { MIRA_OFFICE_PREVIEW_LIMIT, miraMediaFormat, type MiraMediaPreview } from '../../../../../src/config/miraMedia'
import type { PilotController } from '../../state/pilot-state'

const MiraWordReader = lazy(() => import('./MiraWordReader'))
const MiraSheetReader = lazy(() => import('./MiraSheetReader'))
const MiraLegacyWordReader = lazy(() => import('./MiraLegacyWordReader'))
const MiraPresentationReader = lazy(() => import('./MiraPresentationReader'))
class MiraOfficeBoundary extends Component<{ children: ReactNode; onError(message: string): void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError('文档阅读器加载失败，请重新加载 Mira 后重试。') }
  render() { return this.state.failed ? null : this.props.children }
}

export function MiraOfficePreview({ controller, sessionId, path, active, refresh, onRetry, onOpenLink }: {
  controller: Pick<PilotController, 'openMediaFor' | 'closeMedia'>; sessionId: string; path: string; active: boolean; refresh: number
  onRetry(): void; onOpenLink?(url: string): void
}) {
  const identity = JSON.stringify([sessionId, path, refresh])
  const [source, setSource] = useState<{ identity: string; buffer: ArrayBuffer }>()
  const [error, setError] = useState('')
  const failed = useCallback((message: string) => { setError(message); setSource(undefined) }, [])
  const format = miraMediaFormat(path)
  useEffect(() => {
    setSource(undefined); setError('')
    if (!active) return
    const cancellation = new AbortController()
    let preview: MiraMediaPreview | undefined
    const release = () => {
      if (preview) { const id = preview.id; preview = undefined; void controller.closeMedia(id).catch(() => undefined) }
    }
    void (async () => {
      try {
        preview = await controller.openMediaFor(sessionId, path)
        if (cancellation.signal.aborted) return
        const url = new URL(preview.url)
        if (preview.path !== path || !format || !['word', 'sheet', 'presentation'].includes(format.kind) || preview.kind !== format.kind || preview.mediaType !== format.mediaType
          || !/^[a-f0-9]{64}$/.test(preview.id) || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== `/mira-media/${preview.id}`) throw new Error('文档预览响应不匹配，请重试。')
        if (!Number.isSafeInteger(preview.byteLength) || preview.byteLength <= 0 || preview.byteLength > MIRA_OFFICE_PREVIEW_LIMIT) throw new Error('Office 文件为空或超过 25 MiB 预览上限，请使用桌面文档应用打开。')
        const length = preview.byteLength
        const response = await fetch(preview.url, { signal: cancellation.signal, credentials: 'omit', redirect: 'error' })
        if (response.status !== 200 || response.headers.get('content-type') !== format.mediaType || response.headers.get('content-length') !== String(length) || !response.body) throw new Error('文档读取失败或文件已变化，请刷新重试。')
        const reader = response.body.getReader(), buffer = new Uint8Array(length)
        let offset = 0
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (offset + value.byteLength > length) throw new Error('文档响应大小不匹配，请刷新重试。')
            buffer.set(value, offset); offset += value.byteLength
          }
          if (offset !== length) throw new Error('文档读取中断，请刷新重试。')
        } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
        if (!cancellation.signal.aborted) setSource({ identity, buffer: buffer.buffer })
      } catch (cause) {
        if (!cancellation.signal.aborted) failed(cause instanceof Error ? cause.message : '文档读取失败，请刷新重试。')
      } finally { release() }
    })()
    return () => { cancellation.abort(); release() }
  }, [controller, sessionId, path, active, refresh, identity, format, failed])
  if (!active) return null
  if (error) return <div className="mira-file-preview__notice" role="alert"><FileText size={22} /><p>{error}</p><button type="button" className="pilot-inline-button" onClick={onRetry}><RotateCw size={14} />重试</button></div>
  const loading = <div className="mira-file-preview__notice" role="status"><LoaderCircle size={18} className="pilot-spin" /><span>正在加载{format?.kind === 'word' ? ' Word 文档' : format?.kind === 'presentation' ? '演示文稿' : '工作簿'}…</span></div>
  const buffer = source?.identity === identity ? source.buffer : undefined
  const Reader = format?.kind === 'presentation' ? MiraPresentationReader : format?.kind === 'word' ? /\.doc$/i.test(path) ? MiraLegacyWordReader : MiraWordReader : MiraSheetReader
  return buffer ? <MiraOfficeBoundary key={identity} onError={failed}><Suspense fallback={loading}><Reader buffer={buffer} path={path} onOpenLink={onOpenLink} onError={failed} /></Suspense></MiraOfficeBoundary> : loading
}
