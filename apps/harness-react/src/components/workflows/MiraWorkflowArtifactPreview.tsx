/* Content-type dispatch adapted from ZCode workflow-artifacts/WorkflowArtifactBody.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Eye, RefreshCw, X } from 'lucide-react'
import type { ArtifactVersionRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowArtifactContent, MiraFlowArtifactSaveResult, MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import { renderCompletedMarkdown } from '../conversation/markdown'
import { workflowError, type MiraWorkflowHost } from './workflow-model'

const images = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'image/x-icon'])
/** Preserve the incumbent Markdown renderer, but published bytes cannot fetch or navigate inherited URLs. */
function artifactMarkdown(text: string) {
  const document = new DOMParser().parseFromString(renderCompletedMarkdown(text), 'text/html')
  document.querySelectorAll('a').forEach(link => link.replaceWith(...link.childNodes))
  document.querySelectorAll('img').forEach(image => image.replaceWith(document.createTextNode(image.alt)))
  return document.body.innerHTML
}
export function MiraWorkflowArtifactPreview({ host, identity, artifact, active }: { host: MiraWorkflowHost; identity: MiraFlowRunIdentity; artifact: ArtifactVersionRecord; active: boolean }) {
  const [content, setContent] = useState<MiraFlowArtifactContent>(), [opened, setOpened] = useState(false)
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  const [decodeError, setDecodeError] = useState(false), [copied, setCopied] = useState(false)
  const lifetime = useRef(0), reading = useRef(false), writing = useRef(false)
  useEffect(() => { lifetime.current++; setContent(undefined); setOpened(false); setLoading(false); setSaving(false); setError(''); setSaved(false); setDecodeError(false); setCopied(false); return () => { lifetime.current++ } }, [identity.sessionId, identity.runId, artifact.id, artifact.version, active])
  const type = artifact.contentType ?? 'application/octet-stream'
  const textual = type.startsWith('text/') || type === 'application/json' || type === 'image/svg+xml'
  const supported = textual || images.has(type)
  const previewable = supported && (artifact.bytes ?? 0) <= (textual ? 1024 * 1024 : 4 * 1024 * 1024)
  const request = { ...identity, artifactId: artifact.id, version: artifact.version }
  async function preview() {
    if (reading.current || !active) return
    setOpened(true)
    if (content) return
    reading.current = true; setLoading(true); setError(''); setDecodeError(false)
    const version = lifetime.current
    try {
      const value = await host.requestWorkflow<MiraFlowArtifactContent>({ action: 'artifacts.read', ...request })
      if (lifetime.current === version) setContent(value)
    } catch (cause) { if (lifetime.current === version) setError(workflowError(cause)) }
    finally { reading.current = false; if (lifetime.current === version) setLoading(false) }
  }
  async function save() {
    if (writing.current || !active) return
    writing.current = true; setSaving(true); setError(''); setSaved(false)
    const version = lifetime.current
    try {
      const result = await host.requestWorkflow<MiraFlowArtifactSaveResult>({ action: 'artifacts.save', ...request })
      if (version === lifetime.current && result.saved) setSaved(true)
    } catch (cause) { if (version === lifetime.current) setError(workflowError(cause)) }
    finally { writing.current = false; if (version === lifetime.current) setSaving(false) }
  }
  const { text, html } = useMemo<{ text?: string; html?: string }>(() => {
    if (!content || !textual) return {}
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(content.dataBase64), character => character.charCodeAt(0)))
      return { text, ...(type === 'text/markdown' ? { html: artifactMarkdown(text) } : {}) }
    } catch { return {} }
  }, [content, textual, type])
  return <div className="mira-workflow-artifact" data-artifact-id={artifact.id} data-artifact-version={artifact.version}>
    <div className="mira-workflow-artifact__header"><div><strong>{artifact.title || artifact.id}</strong><small>版本 {artifact.version} · {type} · {((artifact.bytes ?? 0) / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB</small></div>
      {previewable && <button type="button" className="mira-automation-icon" aria-label={`预览产物 ${artifact.id} 版本 ${artifact.version}`} title="预览已发布版本" disabled={loading || !active} onClick={() => void preview()}><Eye size={15} /></button>}
      <button type="button" className="mira-automation-icon" aria-label={`保存产物 ${artifact.id} 版本 ${artifact.version}`} title="保存已发布版本" disabled={saving || !active} onClick={() => void save()}><Download size={15} /></button>
    </div>
    {artifact.description && <p className="mira-workflow-muted">{artifact.description}</p>}
    {!previewable && <p className="mira-workflow-muted">{supported ? '文件较大，请保存后查看。文本预览上限 1 MB，图片预览上限 4 MB。' : '此类型暂不支持内嵌预览，可保存这份已发布文件。'}</p>}
    {saving && <p role="status">等待选择保存位置…</p>}{saved && <p className="mira-workflow-feedback" role="status">已保存这份发布版本</p>}
    {opened && <div className="mira-workflow-artifact__preview"><div className="mira-workflow-artifact__toolbar"><span>{type === 'text/html' || type === 'image/svg+xml' ? '源码预览' : '已发布内容'}</span><button type="button" className="mira-automation-icon" aria-label="关闭产物预览" title="关闭产物预览" onClick={() => setOpened(false)}><X size={14} /></button></div>
      {loading && <p role="status">正在读取发布版本…</p>}
      {content && textual && (text === undefined ? <p role="alert">文件不是有效的 UTF-8 文本，请保存后查看。</p> : html !== undefined ? <div className="pilot-markdown mira-workflow-artifact__markdown" dangerouslySetInnerHTML={{ __html: html }} onClick={event => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.markdown-code-copy')
        if (!button?.dataset.code) return
        void navigator.clipboard.writeText(decodeURIComponent(button.dataset.code)).then(() => setCopied(true)).catch(() => setError('复制失败，请重试'))
      }} /> : <pre>{text || '（空文件）'}</pre>)}
      {content && images.has(type) && (decodeError ? <p role="alert">图片无法解码，请保存文件检查。</p> : <img src={`data:${type};base64,${content.dataBase64}`} alt={artifact.title || artifact.id} onError={() => setDecodeError(true)} />)}
      {copied && <p role="status">代码已复制</p>}
    </div>}
    {error && <div className="mira-automation-error" role="alert">{error}{opened && !content && <button type="button" className="mira-automation-secondary" onClick={() => void preview()} disabled={loading}><RefreshCw size={13} />重试读取</button>}</div>}
  </div>
}
