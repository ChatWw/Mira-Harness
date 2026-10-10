import { useEffect, useRef, useState } from 'react'
import { CircleAlert, FileText, LoaderCircle, X } from 'lucide-react'
import type { HarnessFileReference, HarnessMessageAttachment } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { attachmentImageType } from '../../lib/attachment-input'
import { MiraAttachmentPreview } from './MiraAttachmentPreview'

type AttachmentLoad = { attachment?: HarnessMessageAttachment; error?: string }

export function MiraComposerAttachments({ references, ownerId, controller, disabled, active, onRemove, onBlocked }: {
  references: HarnessFileReference[]; ownerId?: string; controller: PilotController; disabled: boolean; active: boolean
  onRemove: (path: string) => void; onBlocked: (blocked: boolean) => void
}) {
  const [loaded, setLoaded] = useState<Record<string, AttachmentLoad>>({})
  const [retry, setRetry] = useState(0)
  const [preview, setPreview] = useState<{ ownerId?: string; controller: PilotController; attachment: HarnessMessageAttachment }>()
  const requests = useRef(new Map<string, Promise<HarnessMessageAttachment>>())
  const generation = useRef(0)
  const currentLoaded = useRef(loaded)
  currentLoaded.current = loaded
  const pending = controller.supportsAttachments ? references : []
  const paths = JSON.stringify(pending.map(file => file.path))
  const key = (path: string) => `${ownerId}:${path}`
  const retained = useRef(new Set<string>())
  retained.current = new Set(pending.map(file => key(file.path)))
  useEffect(() => {
    generation.current++
    requests.current.clear()
    currentLoaded.current = {}
    setLoaded({})
    return () => { generation.current++; requests.current.clear() }
  }, [ownerId, controller, active])
  useEffect(() => {
    if (!active || !ownerId || !controller.supportsAttachments) return
    const version = generation.current
    setLoaded(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => retained.current.has(key))))
    for (const path of requests.current.keys()) if (!retained.current.has(path)) requests.current.delete(path)
    for (const file of pending) {
      const path = key(file.path)
      if (currentLoaded.current[path] || requests.current.has(path)) continue
      const request = controller.getAttachment(ownerId, file.path)
      requests.current.set(path, request)
      const current = () => version === generation.current && retained.current.has(path) && requests.current.get(path) === request
      void request.then(attachment => {
        if (current()) setLoaded(previous => ({ ...previous, [path]: { attachment } }))
      }).catch(error => {
        if (current()) setLoaded(previous => ({ ...previous, [path]: { error: error instanceof Error ? error.message : '附件读取失败' } }))
      }).finally(() => { if (requests.current.get(path) === request) requests.current.delete(path) })
    }
  }, [ownerId, paths, controller, active, retry])
  useEffect(() => { onBlocked(active && pending.some(file => !loaded[key(file.path)]?.attachment)) }, [active, ownerId, paths, loaded, onBlocked])
  useEffect(() => { setPreview(undefined) }, [ownerId, active, paths])
  const retryAttachment = (path: string) => {
    const next = { ...currentLoaded.current }; delete next[key(path)]; currentLoaded.current = next; setLoaded(next); setRetry(value => value + 1)
  }
  if (!references.length) return null
  return <><div className="harness-composer__attachments" aria-label="待发送附件">
    {references.map(file => {
      const state = loaded[key(file.path)]
      const image = file.mediaType || attachmentImageType(file.path)
      const read = pending.some(item => item.path === file.path)
      return <div key={file.path} className={`mira-attachment-card${image ? ' mira-attachment-card--image' : ''}`}>
        <button type="button" className="mira-attachment-card__open" title={state?.error || file.name} aria-label={state?.error ? `重试附件 ${file.name}` : `预览附件 ${file.name}`} disabled={disabled || !read || !state} onClick={() => {
          if (state?.error) retryAttachment(file.path)
          else if (state?.attachment) setPreview({ ownerId, controller, attachment: state.attachment })
        }}>
          {image && state?.attachment?.mediaType ? <img src={`data:${state.attachment.mediaType};base64,${state.attachment.content}`} alt={file.name} onError={() => setLoaded(previous => ({ ...previous, [key(file.path)]: { error: '图片无法解码，请移除或重试。' } }))} /> : state?.error ? <CircleAlert size={18} /> : read && !state ? <LoaderCircle size={18} className="animate-spin" /> : <FileText size={16} />}
          {!image && <span className="mira-attachment-card__text"><span>{file.name}</span><small>文本文件</small></span>}
        </button>
        <button type="button" className="mira-attachment-card__remove" aria-label={`移除 ${file.name}`} title={`移除 ${file.name}`} disabled={disabled} onClick={() => onRemove(file.path)}><X size={10} /></button>
        {state?.error && <span className="mira-attachment-card__error" role="alert">{state.error}</span>}
      </div>
    })}
  </div><MiraAttachmentPreview attachment={active && preview?.ownerId === ownerId && preview?.controller === controller && references.some(file => file.path === preview.attachment.path) ? preview.attachment : undefined} gallery={references.filter(file => file.mediaType || attachmentImageType(file.path)).map(file => ({
    path: file.path, name: file.name, ...loaded[key(file.path)], onRetry: () => retryAttachment(file.path),
  }))} onSave={ownerId && controller.supportsAttachmentSave ? attachment => controller.saveAttachment(ownerId, attachment.path) : undefined} onClose={() => setPreview(undefined)} /></>
}
