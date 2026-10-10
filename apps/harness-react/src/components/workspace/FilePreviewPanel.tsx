/* File preview interaction adapted from ZCode PreviewPane.tsx / components/ui/code-viewer.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: captured-session reads, existing Shiki renderer and virtual source rows.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, ChevronRight, Copy, Ellipsis, ExternalLink, FileCode2, FileText, Image as ImageIcon, LoaderCircle, MessageSquarePlus, RotateCw, WrapText, X } from 'lucide-react'
import type { TokensResult } from 'shiki/core'
import type { PilotController } from '../../state/pilot-state'
import { renderMiraHighlightedCode } from '../../lib/code-highlighter'
import { highlightFilePreview } from '../../lib/file-preview-highlighter'
import { createFileImagePreviewReader, createFilePreviewReader, filePreviewAbsolutePath, filePreviewBreadcrumbs, filePreviewImageSource, filePreviewKey, filePreviewKind, filePreviewLanguage, type FilePreviewSnapshot } from '../../lib/file-preview'
import { miraSvgImageSource } from '../../lib/image-preview'
import { attachmentImageType } from '../../lib/attachment-input'
import { MiraImagePreview } from './MiraImagePreview'
import { MessageMarkdown } from '../conversation/markdown'
import { getEmptyWorkspaceWatch, subscribeWithoutWorkspaceWatch, workspaceFileParent, type WorkspaceWatchDataSource } from '../../lib/workspace-watch'
import type { WorkspaceEditorInfo } from '../../lib/workspace-editors'

type FilePreviewPanelProps = {
  controller: PilotController
  sessionId: string
  path: string
  directory?: string
  active: boolean
  onAddFile(path: string): void
  workspaceWatch?: WorkspaceWatchDataSource
  selectedEditor?: WorkspaceEditorInfo
  onOpenEditor?: (path: string, editorId: string) => Promise<void>
}

export function FilePreviewPanel({ controller, sessionId, path, directory, active, onAddFile, workspaceWatch, selectedEditor, onOpenEditor }: FilePreviewPanelProps) {
  const key = filePreviewKey({ sessionId, path, directory })
  const [snapshot, setSnapshot] = useState<FilePreviewSnapshot>()
  const [refresh, setRefresh] = useState(0)
  const [watchRefresh, setWatchRefresh] = useState(0)
  const watch = useSyncExternalStore(workspaceWatch?.subscribe || subscribeWithoutWorkspaceWatch, workspaceWatch?.getSnapshot || getEmptyWorkspaceWatch, getEmptyWorkspaceWatch)
  const [wrap, setWrap] = useState(false)
  const [previewMode, setPreviewMode] = useState('preview')
  const [imageDecode, setImageDecode] = useState<{ key: string; failed: boolean }>()
  const [highlighted, setHighlighted] = useState<{ key: string; content: string; result: TokensResult }>()
  const [feedback, setFeedback] = useState<{ key: string; message: string; error: boolean }>()
  const [openingEditor, setOpeningEditor] = useState(false)
  const copyVersion = useRef(0)
  const language = filePreviewLanguage(path)
  const kind = filePreviewKind(path)
  const current = snapshot && filePreviewKey(snapshot) === key ? snapshot : undefined
  const ready = current?.status === 'ready'
  const content = ready ? current.content : ''
  const imageKey = JSON.stringify([key, refresh, watchRefresh])
  const imageSource = useMemo(() => current?.status === 'image' ? filePreviewImageSource(current.image) : kind === 'svg' && current?.status === 'ready' ? miraSvgImageSource(current.content) : '', [current, kind])
  const imageFailed = imageDecode?.key === imageKey && imageDecode.failed
  const unsupportedImageAttachment = kind === 'bitmap' && !attachmentImageType(path)
  const canAddFile = active && !unsupportedImageAttachment && (kind === 'bitmap' ? current?.status === 'image' && !imageFailed : ready && !(previewMode === 'preview' && imageFailed))
  const breadcrumbs = filePreviewBreadcrumbs(directory, path)
  const absolutePath = filePreviewAbsolutePath(directory, path)

  const reader = useMemo(() => kind === 'bitmap'
    ? createFileImagePreviewReader((id, file) => controller.readImageFor(id, file), { sessionId, path, directory }, setSnapshot)
    : createFilePreviewReader((id, file) => controller.readFileFor(id, file), { sessionId, path, directory }, setSnapshot), [controller, sessionId, path, directory, kind])
  useEffect(() => {
    if (watch.revision && watch.paths.includes(workspaceFileParent(path))) setWatchRefresh(value => value + 1)
  }, [workspaceWatch, path, watch.revision])
  useEffect(() => { reader.read(active, refresh + watchRefresh) }, [reader, active, refresh, watchRefresh])
  useEffect(() => () => reader.dispose(), [reader])
  useEffect(() => { setPreviewMode('preview'); copyVersion.current += 1 }, [key])
  useEffect(() => {
    if (!active || !ready || ((language === 'markdown' || kind === 'svg') && previewMode === 'preview')) return
    if (highlighted?.key === key && highlighted.content === content) return
    const cancellation = new AbortController()
    void highlightFilePreview(content, language, cancellation.signal).then(result => {
      if (!cancellation.signal.aborted) setHighlighted({ key, content, result })
    }).catch(() => {
      if (!cancellation.signal.aborted) setFeedback({ key, message: '语法高亮失败，请刷新文件重试。', error: true })
    })
    return () => cancellation.abort()
  }, [active, ready, content, key, language, kind, previewMode, highlighted])
  useEffect(() => {
    if (!feedback || feedback.error) return
    const timer = window.setTimeout(() => setFeedback(previous => previous === feedback ? undefined : previous), 1800)
    return () => window.clearTimeout(timer)
  }, [feedback])

  async function copyText(text: string) {
    const version = ++copyVersion.current
    try {
      if (!navigator.clipboard?.writeText) throw new Error('剪贴板暂不可用')
      await navigator.clipboard.writeText(text)
      if (version === copyVersion.current) setFeedback({ key, message: '已复制', error: false })
    } catch {
      if (version === copyVersion.current) setFeedback({ key, message: '复制失败，请重试。', error: true })
    }
  }
  function copyMarkdownBlock(event: MouseEvent<HTMLElement>) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.markdown-code-copy')
    if (!button?.dataset.code) return
    event.stopPropagation()
    void copyText(decodeURIComponent(button.dataset.code))
  }
  async function openInEditor() {
    if (!selectedEditor || !onOpenEditor || openingEditor) return
    const version = copyVersion.current
    setOpeningEditor(true)
    try { await onOpenEditor(path, selectedEditor.id) }
    catch (cause) {
      if (version === copyVersion.current) setFeedback({ key, message: cause instanceof Error ? cause.message : '编辑器打开失败，请重试', error: true })
    } finally { setOpeningEditor(false) }
  }

  return <section className="mira-file-preview" aria-label={`文件预览 ${path}`} onClickCapture={copyMarkdownBlock}>
    <header className="mira-file-preview__toolbar">
      <div className="mira-file-preview__breadcrumb" title={absolutePath || path} aria-label={path}>
        {breadcrumbs.map((segment, index) => <span key={index}>{index > 0 && <ChevronRight size={13} aria-hidden="true" />}{index === breadcrumbs.length - 1 && (kind === 'text' ? <FileCode2 size={14} aria-hidden="true" /> : <ImageIcon size={14} aria-hidden="true" />)}<span className={index === breadcrumbs.length - 1 ? 'is-current' : undefined}>{segment}</span></span>)}
      </div>
      <div className="mira-file-preview__actions">
        <button type="button" title="刷新文件" aria-label="刷新文件" disabled={!active || current?.status === 'loading'} onClick={() => setRefresh(value => value + 1)}><RotateCw size={14} /></button>
        <button type="button" title={unsupportedImageAttachment ? '图片附件支持 PNG、JPEG、GIF 或 WebP，请先转换格式' : '加入对话'} aria-label="将当前文件加入对话" disabled={!canAddFile} onClick={() => { if (canAddFile) onAddFile(path) }}><MessageSquarePlus size={14} /></button>
        <DropdownMenu.Root><DropdownMenu.Trigger type="button" title="文件预览选项" aria-label="文件预览选项"><Ellipsis size={15} /></DropdownMenu.Trigger><DropdownMenu.Portal container={typeof document === 'undefined' ? undefined : document.getElementById('root')}><DropdownMenu.Content align="end" sideOffset={5} className="mira-session-menu mira-file-preview__menu">
          {(language === 'markdown' || kind === 'svg') && <><DropdownMenu.Label className="mira-session-menu__label">{kind === 'svg' ? 'SVG' : 'Markdown'}</DropdownMenu.Label><DropdownMenu.RadioGroup value={previewMode} onValueChange={setPreviewMode}>
            <DropdownMenu.RadioItem value="preview" className="mira-session-menu__item">{kind === 'svg' ? <ImageIcon size={14} /> : <FileText size={14} />}预览<DropdownMenu.ItemIndicator className="mira-file-preview__indicator"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="source" className="mira-session-menu__item"><FileCode2 size={14} />源码<DropdownMenu.ItemIndicator className="mira-file-preview__indicator"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup><DropdownMenu.Separator className="mira-session-menu__separator" /></>}
          {kind !== 'bitmap' && <><DropdownMenu.CheckboxItem checked={wrap} onCheckedChange={checked => setWrap(checked === true)} className="mira-session-menu__item"><WrapText size={14} />自动换行<DropdownMenu.ItemIndicator className="mira-file-preview__indicator"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.CheckboxItem><DropdownMenu.Separator className="mira-session-menu__separator" /></>}
          <DropdownMenu.Item className="mira-session-menu__item" onSelect={() => void copyText(path)}><Copy size={14} />复制相对路径</DropdownMenu.Item>
          <DropdownMenu.Item className="mira-session-menu__item" disabled={!absolutePath} onSelect={() => { if (absolutePath) void copyText(absolutePath) }}><Copy size={14} />复制绝对路径</DropdownMenu.Item>
          {kind !== 'bitmap' && <DropdownMenu.Item className="mira-session-menu__item" disabled={!ready} onSelect={() => void copyText(content)}><Copy size={14} />复制文件内容</DropdownMenu.Item>}
        </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
        <button type="button" title={selectedEditor ? `在 ${selectedEditor.name} 中打开` : '在编辑器中打开'} aria-label={selectedEditor ? `在 ${selectedEditor.name} 中打开` : '在编辑器中打开'} disabled={!active || !selectedEditor || !onOpenEditor || openingEditor} onClick={() => void openInEditor()}>{openingEditor ? <LoaderCircle size={14} className="pilot-spin" /> : <ExternalLink size={14} />}</button>
      </div>
    </header>
    {watch.error && <div className="mira-file-drawer__error" role="alert"><span>{watch.error}</span><button type="button" title="重试文件自动刷新" aria-label="重试文件自动刷新" onClick={workspaceWatch?.retry}><RotateCw size={14} /></button></div>}
    <div className="mira-file-preview__body">
      {!current || current.status === 'loading' ? <div className="mira-file-preview__notice" role="status"><LoaderCircle size={18} className="pilot-spin" /><span>正在读取文件…</span></div>
        : current.status === 'error' ? <div className="mira-file-preview__notice" role="alert"><FileText size={20} /><p>{current.error}</p><button type="button" className="pilot-inline-button" onClick={() => setRefresh(value => value + 1)}><RotateCw size={14} />重试</button></div>
          : imageSource && (kind === 'bitmap' || previewMode === 'preview') ? <MiraImagePreview key={imageKey} title={path.split('/').pop()!} source={imageSource} sourcePath={path} fit={kind === 'svg'} active={active} onRetry={() => setRefresh(value => value + 1)} onDecodeChange={failed => setImageDecode({ key: imageKey, failed })} />
            : content.length === 0 ? <div className="mira-file-preview__notice"><FileText size={20} /><span>文件为空</span></div>
              : language === 'markdown' && previewMode === 'preview' ? <div className="mira-file-preview__markdown"><MessageMarkdown content={content} /></div>
              : <FilePreviewSource key={key} content={content} language={language} wrap={wrap} active={active} highlighted={highlighted?.key === key && highlighted.content === content ? highlighted.result : undefined} />}
    </div>
    {feedback?.key === key && <div className={`mira-file-preview__feedback${feedback.error ? ' is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}><span>{feedback.message}</span><button type="button" title="关闭提示" aria-label="关闭提示" onClick={() => setFeedback(undefined)}><X size={12} /></button></div>}
  </section>
}

export function FilePreviewSource({ content, language, highlighted, wrap, active }: { content: string; language: string; highlighted?: TokensResult; wrap: boolean; active: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => content.split(/\r?\n/), [content])
  const virtualizer = useVirtualizer({ count: lines.length, getScrollElement: () => scrollRef.current, estimateSize: () => 20, overscan: 10, initialRect: { width: 420, height: 600 }, enabled: active })
  useEffect(() => { virtualizer.measure() }, [virtualizer, content, wrap, active])
  return <div ref={scrollRef} className={`mira-file-source${wrap ? ' is-wrapped' : ''}`} role="region" aria-label={`文件源码，共 ${lines.length} 行`} tabIndex={0} style={{ '--mira-file-gutter-width': `${String(lines.length).length * 8 + 20}px` } as CSSProperties}>
    <div className="mira-file-source__rows" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(item => <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} className="mira-file-source__row" style={{ transform: `translateY(${item.start}px)` }}><span className="mira-file-source__number" aria-hidden="true">{item.index + 1}</span><div className="mira-file-source__code" dangerouslySetInnerHTML={{ __html: renderMiraHighlightedCode({ tokens: [highlighted?.tokens[item.index] || [{ content: lines[item.index], offset: 0 }]] }, language) }} /></div>)}
    </div>
  </div>
}
