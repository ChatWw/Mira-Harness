import * as Tooltip from '@radix-ui/react-tooltip'
import { ShortcutKeys } from '../shared/ShortcutKeys'
import { useEffect, useId, useRef, useState, type Ref, type ReactElement } from 'react'
import { Check, CircleAlert, Copy, Folder, LoaderCircle, Plus, ArrowUp, Pencil, GitFork, X } from 'lucide-react'
import type { HarnessFileChange, HarnessFileReference, HarnessMessage } from '../../../../../src/config/harness'
import type { HarnessMessageAttachment } from '../../../../../src/config/harness'
import { isHarnessImageMediaType } from '../../../../../src/config/harness'
import { MiraAttachmentPreview } from '../composer/MiraAttachmentPreview'
import type { PilotController } from '../../state/pilot-state'
import type { MiraHistoryEditBlocked, MiraHistoryEditWorkspace } from '../../../../../src/config/miraFileRewind'
import { MiraHistoryFileReset } from './MiraHistoryFileReset'
import { MiraPromptEditor, type MiraPromptEditorHandle } from '../composer/MiraPromptEditor'
import { MiraHistoryPromptEditor, type MiraHistoryPromptEditorHandle } from '../composer/MiraHistoryPromptEditor'
import { MiraBrowserContexts } from '../composer/MiraBrowserContexts'
import { MiraPresentationContexts } from '../composer/MiraPresentationContexts'
import { miraPromptContexts, withMiraPromptContexts } from '../../lib/mira-presentation-reference'
import { serializeMiraPromptDocument } from '../../lib/prompt-editor-document'
import { miraUserPrompt } from '../../lib/mira-user-prompt'
import { MIRA_PASTED_TEXT_THRESHOLD, MIRA_TEXT_FILE_BYTES, readAttachmentFile, validateAttachmentFiles } from '../../lib/attachment-input'
import type { MiraPresentationReference } from '../../../../../src/config/miraPresentation'
import { miraFileTreeIcon } from '../../lib/mira-file-tree-icon'

export function EditIcon() { return <Pencil size={13} /> }

export function MessageActionHint({ label, children, editing = false, shortcut }: { label: string; children: ReactElement; editing?: boolean; shortcut?: string }) {
  return <Tooltip.Provider delayDuration={300}><Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal container={document.getElementById('root')}><Tooltip.Content className={`mira-composer-hint${editing ? ' mira-history-edit-hint' : ''}`} side={editing ? 'top' : 'bottom'} align="center" sideOffset={editing ? 2 : 6}>{label}{shortcut && <ShortcutKeys shortcut={shortcut} />}</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>
}

export function MessageCopyButton({ content, label = '复制回复', onError }: { content: string; label?: string; onError?: (error: unknown) => void }) {
  const [copied, setCopied] = useState(false)
  return <MessageActionHint label={copied ? '已复制' : label}><button type="button" className="mira-message-action" aria-label={copied ? '已复制' : label} onClick={() => {
    void navigator.clipboard.writeText(content).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600) }).catch(error => onError?.(error))
  }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></MessageActionHint>
}

/** 消息附件使用实际保存的文件引用，不把附件正文再次写入气泡。 */
export function UserMessageAttachments({ message, onOpen, sessionId, controller, active = true, onRemove }: { message?: HarnessMessage; onOpen: (path: string) => void; sessionId?: string; controller?: Pick<PilotController, 'getAttachment'> & Partial<Pick<PilotController, 'saveAttachment' | 'supportsAttachmentSave'>>; active?: boolean; onRemove?: (path: string) => void }) {
  const [loaded, setLoaded] = useState<Record<string, { attachment?: HarnessMessageAttachment; error?: string }>>({})
  const [retry, setRetry] = useState(0)
  const [preview, setPreview] = useState<{ scope: string; controller?: Pick<PilotController, 'getAttachment'>; attachment: HarnessMessageAttachment }>()
  const requests = useRef(new Map<string, Promise<HarnessMessageAttachment>>())
  const currentLoaded = useRef(loaded)
  currentLoaded.current = loaded
  const attachments = message?.attachments ?? []
  const scope = JSON.stringify([sessionId, message?.id])
  const key = (path: string) => JSON.stringify([scope, path])
  const paths = JSON.stringify(attachments.map(file => file.path))
  const current = useRef({ scope, active, controller, keys: new Set<string>() })
  current.current = { scope, active, controller, keys: new Set(attachments.map(file => key(file.path))) }
  const isCurrent = (fileKey: string) => current.current.active && current.current.scope === scope && current.current.controller === controller && current.current.keys.has(fileKey)
  useEffect(() => {
    current.current.active = active
    requests.current.clear()
    currentLoaded.current = {}
    setLoaded({})
    return () => { current.current.active = false; requests.current.clear() }
  }, [scope, controller, active])
  useEffect(() => {
    const retained = active ? current.current.keys : new Set<string>()
    setLoaded(previous => Object.fromEntries(Object.entries(previous).filter(([fileKey]) => retained.has(fileKey))))
    for (const fileKey of requests.current.keys()) if (!retained.has(fileKey)) requests.current.delete(fileKey)
    if (!active || !sessionId || !controller) return
    for (const file of attachments) {
      const fileKey = key(file.path)
      if (!file.mediaType || file.content || currentLoaded.current[fileKey] || requests.current.has(fileKey)) continue
      const request = Promise.resolve().then(() => controller.getAttachment(sessionId, file.path))
      requests.current.set(fileKey, request)
      void request.then(attachment => {
        if (isCurrent(fileKey) && requests.current.get(fileKey) === request) setLoaded(previous => ({ ...previous, [fileKey]: { attachment } }))
      }, error => {
        if (isCurrent(fileKey) && requests.current.get(fileKey) === request) setLoaded(previous => ({ ...previous, [fileKey]: { error: error instanceof Error ? error.message : '附件读取失败' } }))
      }).finally(() => { if (requests.current.get(fileKey) === request) requests.current.delete(fileKey) })
    }
  }, [scope, paths, active, controller, retry])
  useEffect(() => { setPreview(undefined) }, [scope, paths, active, controller])
  const retryAttachment = (path: string) => {
    const next = { ...currentLoaded.current }; delete next[key(path)]; currentLoaded.current = next; setLoaded(next); setRetry(value => value + 1)
  }
  if (!attachments.length) return null
  return <><div className="mira-message-attachments" aria-label="消息附件">{attachments.map((attachment, index) => {
    // 工作区预览不接受外部绝对路径；不把已授权的附件读权扩展为任意文件读权。
    const external = attachment.path.startsWith('/') || attachment.path.includes('\\') || /^[a-z]:/i.test(attachment.path)
    const frozenPreview = Boolean(attachment.mediaType || attachment.path.startsWith('mira-attachment:'))
    const fileKey = key(attachment.path), state = active ? loaded[fileKey] : undefined
    const ready = state?.error ? undefined : attachment.content || !attachment.mediaType ? attachment : state?.attachment
    const loading = Boolean(attachment.mediaType && !ready && !state?.error)
    const image = isHarnessImageMediaType(attachment.mediaType)
    const previewButton = <button key={`${attachment.path}:${index}`} type="button" className={image ? 'mira-message-attachment--image' : undefined} title={state?.error ? `${state.error}\n点击重试` : external && !frozenPreview ? `${attachment.path}\n外部附件，不在当前工作区中` : frozenPreview ? attachment.name : attachment.path} aria-label={`${state?.error ? '重试附件' : loading ? '正在读取附件' : '预览附件'} ${attachment.name || attachment.path}`} aria-busy={loading || undefined} disabled={!active || external && !frozenPreview || loading} onClick={() => {
      if (!isCurrent(fileKey)) return
      if (state?.error) retryAttachment(attachment.path)
      else if (frozenPreview && ready) setPreview({ scope, controller, attachment: ready })
      else if (!external) onOpen(attachment.path)
    }}>{state?.error ? <><CircleAlert size={18} className="mx-auto" /><span>重试</span><span className="sr-only" role="alert">{state.error}</span></> : image ? ready ? <img src={`data:${ready.mediaType};base64,${ready.content}`} alt={attachment.name} onError={() => {
      if (isCurrent(fileKey)) setLoaded(previous => ({ ...previous, [fileKey]: { error: '图片无法解码，请重试。' } }))
    }} /> : <LoaderCircle size={18} className="mx-auto animate-spin" /> : <>{attachment.kind === 'directory' ? <Folder size={15} strokeWidth={1.5} aria-hidden="true" /> : <img src={miraFileTreeIcon(attachment.name || attachment.path)} width={15} height={15} alt="" aria-hidden="true" draggable={false} />}<span>{attachment.name || attachment.path}</span></>}</button>
    return onRemove ? <div key={`${attachment.path}:${index}`} className="mira-history-attachment">{previewButton}<button type="button" className="mira-history-attachment__remove" aria-label={`移除附件 ${attachment.name || attachment.path}`} title="仅从这条消息移除，保留本地文件" disabled={!active} onMouseDown={event => event.preventDefault()} onClick={() => onRemove(attachment.path)}><X size={12} /></button></div> : previewButton
  })}</div><MiraAttachmentPreview attachment={active && preview?.scope === scope && preview.controller === controller && attachments.some(file => file.path === preview.attachment.path) ? preview.attachment : undefined} gallery={attachments.filter(file => isHarnessImageMediaType(file.mediaType)).map(file => {
    const state = active ? loaded[key(file.path)] : undefined
    return { path: file.path, name: file.name, attachment: state?.error ? undefined : file.content ? file : state?.attachment, error: state?.error, onRetry: () => retryAttachment(file.path) }
  })} onSave={sessionId && controller?.supportsAttachmentSave && controller.saveAttachment ? attachment => controller.saveAttachment!(sessionId, attachment.path) : undefined} onClose={() => setPreview(undefined)} /></>
}

const CHANGE_LABELS: Record<HarnessFileChange['tool'], string> = { edit: '编辑', write: '写入', delete: '删除' }

export { MiraReplyChanges as FileChangesCard } from './MiraReplyChanges'

function formatTime(createdAt: number) {
  const date = new Date(createdAt), now = new Date()
  if (!Number.isFinite(createdAt) || Number.isNaN(date.getTime())) return ''
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const sameDay = (other: Date) => date.getFullYear() === other.getFullYear() && date.getMonth() === other.getMonth() && date.getDate() === other.getDate()
  if (sameDay(now)) return time
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(yesterday)) return `昨天 ${time}`
  return `${date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}年`}${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

/** 消息工具栏（ZCode 模式：hover 才显现）。 */
export function AssistantToolbar({ message, onFork, onError }: { message?: HarnessMessage; onFork?: (requestId: string) => Promise<boolean>; onError?: (error: unknown) => void }) {
  if (!message) return null
  return <div className="mira-assistant-toolbar mt-1">
    <MessageCopyButton content={message.content} onError={onError} />
    {onFork && <MiraForkAction onFork={onFork} />}
    {message.createdAt ? <span className="mira-assistant-toolbar__time">{formatTime(message.createdAt)}</span> : null}
  </div>
}

function MiraForkAction({ onFork }: { onFork: (requestId: string) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const request = useRef('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function fork() {
    if (pending.current) return
    pending.current = true
    request.current ||= crypto.randomUUID()
    setBusy(true); setError('')
    try { if (await onFork(request.current)) request.current = '' }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : '分支创建失败，请重试。') }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <><MessageActionHint label={busy ? '正在创建分支' : '分支'}><button type="button" className="mira-message-action" disabled={busy} aria-label={busy ? '正在创建分支' : '从这里分支'} onClick={() => void fork()}>{busy ? <LoaderCircle size={13} className="animate-spin" /> : <GitFork size={13} />}</button></MessageActionHint>{error && <span role="alert" className="text-ui-xs text-destructive">{error}</span>}</>
}

/** 用户消息行内编辑：确认后截断后续并重跑。 */
export function UserMessageEditor({ original, content, onCancel, onConfirm, onOpenPresentation, controller, sessionId, onOpenFile, disabled = false }: { original?: HarnessMessage; content: string; onCancel: () => void; onConfirm: (next: string, references?: HarnessFileReference[], workspace?: MiraHistoryEditWorkspace) => Promise<boolean | MiraHistoryEditBlocked>; onOpenPresentation?: (reference: MiraPresentationReference) => void; controller?: PilotController; sessionId?: string; onOpenFile?: (path: string) => void; disabled?: boolean }) {
  const [prompt, setPrompt] = useState(() => miraUserPrompt(content))
  const [contexts, setContexts] = useState(() => miraPromptContexts(prompt.document))
  const [attachments, setAttachments] = useState(() => original?.attachments ?? [])
  const attachmentsChanged = useRef(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [filesBusy, setFilesBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)
  const fileOperation = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const editor = useRef<MiraHistoryPromptEditorHandle | MiraPromptEditorHandle>(null)
  const value = serializeMiraPromptDocument(prompt.body)
  const nextContent = serializeMiraPromptDocument(withMiraPromptContexts(prompt.body, contexts)).trim()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const errorId = useId()
  const pending = useRef(false)
  useEffect(() => { editor.current?.focus() }, [])
  const submit = async (workspace?: MiraHistoryEditWorkspace): Promise<boolean | MiraHistoryEditBlocked> => {
    if (disabled || pending.current || fileOperation.current || !original || !nextContent && !attachments.length) return false
    pending.current = true; setSubmitting(true); setError('')
    try {
      const references = attachmentsChanged.current || !nextContent ? attachments.map(({ path, name, mediaType, size }) => ({ path, name: name || path.split(/[\\/]/).pop()!, mediaType, size })) : undefined
      const accepted = workspace ? await onConfirm(nextContent, references, workspace) : references === undefined ? await onConfirm(nextContent) : await onConfirm(nextContent, references)
      if (mounted.current && accepted === false) setError('消息未能重新发送，请检查任务状态或模型后重试。')
      return accepted
    }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : '重新发送失败，请重试。'); return false }
    finally { pending.current = false; if (mounted.current) setSubmitting(false) }
  }
  const addFiles = async (files?: File[]) => {
    if (!controller || !sessionId || disabled || pending.current || fileOperation.current) return
    fileOperation.current = true; setFilesBusy(true); setError('')
    const current = () => mounted.current && controller.getSnapshot().session?.id === sessionId
    try {
      let selected: HarnessFileReference[]
      if (files) {
        validateAttachmentFiles(files, attachments.length, attachments)
        const uploads = await Promise.all(files.map(readAttachmentFile))
        if (!current()) return
        selected = await controller.importAttachments(sessionId, uploads)
      } else selected = await controller.selectAttachments(sessionId)
      if (!current()) return
      const added = selected.filter((file, index) => !attachments.some(existing => existing.path === file.path) && selected.findIndex(value => value.path === file.path) === index)
      if (attachments.length + added.length > 12) throw new Error('一次最多引用 12 个文件，请先移除已有附件。')
      const values = await Promise.all(added.map(file => controller.getAttachment(sessionId, file.path)))
      if (current() && values.length) { attachmentsChanged.current = true; setAttachments(previous => [...previous, ...values]) }
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : '添加附件失败，请重试。') }
    finally { fileOperation.current = false; if (mounted.current) { setFilesBusy(false); if (current()) editor.current?.focus() } }
  }
  const addWorkspaceFile = async (path: string, name: string) => {
    if (!controller || !sessionId || disabled || pending.current || fileOperation.current) return
    if (attachments.length >= 12) throw new Error('一次最多引用 12 个文件，请先移除已有附件。')
    fileOperation.current = true; setFilesBusy(true)
    try {
      const reference = await controller.stageAttachment(sessionId, path)
      if (!mounted.current || controller.getSnapshot().session?.id !== sessionId) return
      const attachment = await controller.getAttachment(sessionId, reference.path)
      if (!mounted.current || controller.getSnapshot().session?.id !== sessionId) return
      attachmentsChanged.current = true
      setAttachments(values => [...values.filter(file => file.path !== reference.path), attachment])
      return { ...reference, name }
    } finally { fileOperation.current = false; if (mounted.current) setFilesBusy(false) }
  }
  const editorProps = {
    text: value, document: prompt.body, disabled: disabled || submitting,
    onChange: (body: typeof prompt.body) => setPrompt(previous => ({ ...previous, body })),
    onKeyDown: (event: globalThis.KeyboardEvent) => { if (event.key !== 'Escape') return; event.stopPropagation(); if (!event.isComposing && event.keyCode !== 229 && !pending.current) { event.preventDefault(); onCancel() } },
    onError: (cause: Error) => setError(cause.message),
    onPaste: (event: ClipboardEvent) => {
      if (!controller?.supportsAttachments || disabled || submitting || filesBusy || !event.clipboardData) return
      const text = event.clipboardData.getData('text/plain'), html = event.clipboardData.getData('text/html')
      const files = Array.from(event.clipboardData.files ?? [])
      if (files.length && !(text && /<table[\s>]/i.test(html))) { event.preventDefault(); void addFiles(files) }
      else if (text.length >= MIRA_PASTED_TEXT_THRESHOLD && new Blob([text]).size <= MIRA_TEXT_FILE_BYTES) { event.preventDefault(); void addFiles([new File([text], '粘贴的文本.txt', { type: 'text/plain' })]) }
    },
    'aria-label': '编辑消息', 'aria-describedby': error ? errorId : undefined, className: 'mira-history-editor',
  }
  const canAddFiles = controller?.supportsAttachments && !disabled && !submitting && !filesBusy
  return <div className={`mira-history-edit-shell${dragOver ? ' mira-history-editor--drag-over' : ''}`} aria-busy={submitting || filesBusy || undefined}
    onDragEnter={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); if (canAddFiles) { dragDepth.current++; setDragOver(true) } }}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = canAddFiles ? 'copy' : 'none' } }}
    onDragLeave={event => { if (event.dataTransfer.types.includes('Files')) { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragOver(false) } }}
    onDrop={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current = 0; setDragOver(false); if (canAddFiles) void addFiles(Array.from(event.dataTransfer.files)) }}>
    <UserMessageAttachments message={original && { ...original, attachments }} controller={controller} sessionId={sessionId} onOpen={onOpenFile ?? (() => undefined)} active={!disabled && !submitting && !filesBusy} onRemove={path => { attachmentsChanged.current = true; setAttachments(values => values.filter(file => file.path !== path)); editor.current?.focus() }} />
    {contexts.length > 0 && <div className="mira-message-contexts"><MiraBrowserContexts references={contexts.filter(reference => reference.kind === 'web')} disabled={submitting} onRemove={id => setContexts(values => values.filter(value => value.id !== id))} onRemoveAll={() => setContexts(values => values.filter(value => value.kind !== 'web'))} onReturnFocus={() => editor.current?.focus()} /><MiraPresentationContexts references={contexts.filter(reference => reference.kind === 'presentation')} disabled={submitting} onOpen={onOpenPresentation} onRemove={id => setContexts(values => values.filter(value => value.id !== id))} onRemoveAll={() => setContexts(values => values.filter(value => value.kind !== 'presentation'))} onReturnFocus={() => editor.current?.focus()} /></div>}
    <div className="mira-history-edit-input">{controller && sessionId ? <MiraHistoryPromptEditor {...editorProps} ref={editor as Ref<MiraHistoryPromptEditorHandle>} controller={controller} sessionId={sessionId} onAddFile={addWorkspaceFile} onAttachFiles={controller.supportsAttachments ? () => void addFiles() : undefined} onActionMenuChange={setActionMenuOpen} /> : <MiraPromptEditor {...editorProps} ref={editor} />}</div>
    {error && <p id={errorId} role="alert" className="text-ui-sm text-destructive wrap-anywhere">{error}</p>}
    <div className="mira-history-edit-toolbar">
      <MessageActionHint editing label="添加"><button type="button" className="mira-message-action" aria-label="添加" aria-expanded={actionMenuOpen} disabled={disabled || submitting || filesBusy || !controller || !sessionId} onMouseDown={event => event.preventDefault()} onClick={() => { if (editor.current && 'openActionMenu' in editor.current) editor.current.openActionMenu() }}><Plus size={16} /></button></MessageActionHint>
      <div className="mira-history-edit-toolbar__actions">
        <MessageActionHint editing label="取消" shortcut="Esc"><button type="button" className="mira-message-action mira-history-edit-cancel" aria-label="取消编辑" onClick={onCancel} disabled={submitting}><X size={16} /></button></MessageActionHint>
        {controller?.supportsFileRewindApply && sessionId && original && <MiraHistoryFileReset controller={controller} sessionId={sessionId} messageId={original.id} disabled={disabled || submitting || filesBusy || !nextContent && !attachments.length} onEdit={submit} />}
        <MessageActionHint editing label="发送" shortcut="Enter"><button type="button" className="mira-history-edit-send" aria-label="发送" disabled={disabled || !nextContent && !attachments.length || !original || submitting || filesBusy} onClick={() => void submit()}>{submitting ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowUp size={16} />}</button></MessageActionHint>
      </div>
    </div>
  </div>
}
