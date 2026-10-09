/* Image canvas adapted from ZCode previewPaneImageContent.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: authorized inline source, native decode failure and retry states.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { useState, type SyntheticEvent } from 'react'
import { ImageOff, LoaderCircle, RotateCw } from 'lucide-react'
import { miraImageDisplaySize } from '../../lib/image-preview'

type MiraImagePreviewProps = {
  title: string
  source: string
  sourcePath: string
  fit?: boolean
  active: boolean
  onRetry(): void
  onDecodeChange?(failed: boolean): void
}

export function MiraImagePreview({ title, source, sourcePath, fit = false, active, onRetry, onDecodeChange }: MiraImagePreviewProps) {
  const [decoded, setDecoded] = useState<{ source: string; failed: boolean; width: number; height: number }>()
  const current = decoded?.source === source ? decoded : undefined
  const failed = current?.failed === true
  const loaded = Boolean(current && !failed)
  function imageLoaded(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    setDecoded({ source, failed: false, width: image.naturalWidth, height: image.naturalHeight })
    onDecodeChange?.(false)
  }
  function imageFailed() {
    setDecoded({ source, failed: true, width: 0, height: 0 })
    onDecodeChange?.(true)
  }
  return <div className={`mira-image-preview${fit ? ' is-fitted' : ''}`} aria-busy={!loaded && !failed}>
    {failed ? <div className="mira-file-preview__notice" role="alert"><ImageOff size={20} /><p>图片无法解码，请检查文件是否损坏或格式是否受支持。</p><button type="button" className="pilot-inline-button" disabled={!active} onClick={onRetry}><RotateCw size={14} />重试</button></div>
      : <><img key={source} alt={title} className={`mira-image-preview__image${loaded ? '' : ' is-loading'}`} src={source} onLoad={imageLoaded} onError={imageFailed} style={current ? miraImageDisplaySize(sourcePath, current.width, current.height, fit) : undefined} />{!loaded && <div className="mira-image-preview__loading" role="status"><LoaderCircle size={18} className="pilot-spin" /><span>正在加载图片…</span></div>}</>}
  </div>
}
