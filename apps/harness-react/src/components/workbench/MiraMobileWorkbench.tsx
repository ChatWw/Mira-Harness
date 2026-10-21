import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tooltip from '@radix-ui/react-tooltip'
import { ArrowUp, Brain, ChevronDown, FileText, Folder, Image, Menu, Moon, Plus, ShieldCheck, Square, Sun, X } from 'lucide-react'
import type { HarnessFileReference, PermissionMode, ThinkingLevel } from '../../../../../src/config/harness'
import { PilotController } from '../../state/pilot-state'
import { AssistantMessage, MiraConversationContext, UserMessage } from '../conversation/MiraConversationMessages'
import { MiraModelMenu } from '../composer/MiraModelMenu'
import { COMPOSER_PERMISSIONS, ComposerPermissionOptions, ComposerReasoningOptions } from '../composer/ComposerConfigurationOptions'
import { MiraPromptEditor } from '../composer/MiraPromptEditor'
import { serializeMiraPromptDocument } from '../../lib/prompt-editor-document'
import { projectTimelineMessages, projectTimelineRenderMessages } from '../conversation/conversation-model'
import { COMPOSER_REASONING_CHOICES } from '../../lib/model-reasoning'
import { readAttachmentFile, validateAttachmentFiles } from '../../lib/attachment-input'
import { TaskInteraction } from '../interactions/TaskInteraction'
import { remoteCall } from '../../platform/mobile-host'

type Draft = { text: string; references: HarnessFileReference[]; submissionId: string }
const emptyDraft = (): Draft => ({ text: '', references: [], submissionId: crypto.randomUUID() })
export function MiraMobileWorkbench({ controller }: { controller: PilotController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [sidebar, setSidebar] = useState(false)
  const [dark, setDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches)
  const [modelOpen, setModelOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [toast, setToast] = useState({ text: '', revision: 0 })
  const [policy, setPolicy] = useState({ autoApproveEnabled: false, fullAccessEnabled: false })
  const filePicker = useRef<HTMLInputElement>(null)
  const photoPicker = useRef<HTMLInputElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const sessionId = state.session?.id
  const draft = sessionId ? drafts[sessionId] ?? emptyDraft() : emptyDraft()
  const notify = (text: string) => setToast(previous => ({ text, revision: previous.revision + 1 }))
  const blocked = () => notify('此功能需要在电脑上使用')
  const updateDraft = (id: string, patch: Partial<Draft>) => setDrafts(previous => ({ ...previous, [id]: { ...(previous[id] ?? emptyDraft()), ...patch } }))
  const models = state.providers.flatMap(provider => provider.models.filter(model => model.enabled).map(model => ({ providerId: provider.id, providerName: provider.name, modelId: model.id, reasoning: model.reasoning, multimodal: model.multimodal })))
  const selectedModel = models.find(model => model.providerId === state.selection?.providerId && model.modelId === state.selection.modelId)
  const messages = projectTimelineRenderMessages(projectTimelineMessages(state.messages, state.session?.activeRun), sessionId)
  const interaction = state.session?.pendingInteraction?.status === 'waiting' ? state.session.pendingInteraction : undefined
  const locked = busy || !sessionId || state.sessionLoading || !state.selection
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(() => { const timer = setTimeout(() => setToast(previous => previous.revision === toast.revision ? { ...previous, text: '' } : previous), 2800); return () => clearTimeout(timer) }, [toast.revision])
  useEffect(() => {
    let current = true; let refreshing = false
    const refresh = async () => {
      if (refreshing || busyRef.current || document.hidden) return
      refreshing = true
      try {
        const config = await remoteCall<typeof policy>('permissions.config'); if (current) setPolicy(config)
        await controller.refreshRemoteCatalog()
        // Periodic canonical snapshot recovers missed SSE boundaries without changing desktop selection.
        const id = controller.getSnapshot().session?.id
        if (current && id) await controller.refreshCurrent()
      } catch (cause) { if (current) notify(cause instanceof Error ? cause.message : '同步失败，正在重试') }
      finally { refreshing = false }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 5000)
    return () => { current = false; clearInterval(timer) }
  }, [controller])
  useEffect(() => { following.current = true }, [sessionId])
  useEffect(() => { if (following.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight }, [sessionId, state.messages, state.running])
  async function operate(action: () => Promise<unknown>) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true)
    try { await action() } catch (cause) { notify(cause instanceof Error ? cause.message : '操作失败，请重试') }
    finally { busyRef.current = false; setBusy(false) }
  }
  const send = () => {
    if (locked || !sessionId || !draft.text.trim() && !draft.references.length) return
    const id = sessionId; const captured = draft
    void operate(async () => {
      const result = await controller.send(captured.text, false, captured.references, captured.submissionId, state.selection)
      if (result === true) updateDraft(id, emptyDraft())
      else notify(controller.getSnapshot().error ?? '消息尚未提交，已保留输入，请重试')
    })
  }
  async function upload(files: File[]) {
    if (!sessionId || !files.length) return
    const id = sessionId; const captured = draft
    await operate(async () => {
      validateAttachmentFiles(files, captured.references.length, captured.references)
      const imported = await remoteCall<HarnessFileReference[]>('attachments.import', { sessionId: id, files: await Promise.all(files.map(readAttachmentFile)) })
      updateDraft(id, { references: [...captured.references, ...imported], submissionId: crypto.randomUUID() })
    })
  }
  const interceptLink = (event: MouseEvent) => { if (event.target instanceof Element && event.target.closest('a[href]')) { event.preventDefault(); event.stopPropagation(); blocked() } }
  const changeTask = (id: string) => { if (busyRef.current) return; setSidebar(false); setModelOpen(false); void controller.open(id) }
  function taskList() {
    return <><div className="mobile-sidebar-heading"><strong>Mira</strong><span>项目空间</span></div><nav aria-label="项目任务">{state.projects.map(project => <section className="mobile-project" key={project.id}><h2><Folder size={16} />{project.name}<button type="button" disabled={busy} aria-label={`在 ${project.name} 中新建对话`} onClick={() => void operate(async () => { const session = await remoteCall<{ id: string }>('session.create', { projectId: project.id }); await controller.refreshRemoteCatalog(); await controller.open(session.id); setSidebar(false) })}><Plus size={15} /></button></h2>{state.sessions.filter(session => session.projectId === project.id).map(session => <button type="button" key={session.id} disabled={busy} aria-current={sessionId === session.id ? 'page' : undefined} onClick={() => changeTask(session.id)}><span>{session.title}{session.isRunning ? ' · 执行中' : ''}</span></button>)}</section>)}</nav><div className="mobile-sidebar-footer"><span>局域网连接 · 仅项目空间</span></div></>
  }
  return <Tooltip.Provider><div className="mobile-preview"><aside className="mobile-sidebar">{taskList()}</aside><main className="mobile-main">
    <header className="mobile-header"><Dialog.Root open={sidebar} onOpenChange={setSidebar}><Dialog.Trigger asChild><button className="mobile-icon mobile-menu-trigger" aria-label="打开项目侧边栏"><Menu size={20} /></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="mobile-drawer-overlay" /><Dialog.Content className="mobile-drawer"><Dialog.Title className="sr-only">项目空间</Dialog.Title><Dialog.Description className="sr-only">选择项目内的对话</Dialog.Description><Dialog.Close asChild><button className="mobile-icon mobile-drawer-close" aria-label="关闭项目侧边栏"><X size={18} /></button></Dialog.Close>{taskList()}</Dialog.Content></Dialog.Portal></Dialog.Root><div className="mobile-heading"><span>{state.projects.find(project => project.id === state.session?.projectId)?.name ?? 'Mira'}</span><h1>{state.session?.title ?? '项目对话'}</h1></div><button className="mobile-icon" aria-label={dark ? '切换浅色' : '切换深色'} onClick={() => setDark(value => !value)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button></header>
    <MiraConversationContext.Provider value={{ desktopOnly: blocked, controller, sessionId, session: state.session, active: true, openChangesTab: blocked, openFile: blocked, openLink: blocked, openPresentation: blocked, openRunProgress: blocked, openCommand: blocked, openSubtask: blocked, stopSubtask: async () => blocked(), running: state.running, waiting: Boolean(state.permission), canRerun: false, tools: state.session?.toolCalls ?? [], toolsById: new Map(state.session?.toolCalls.map(tool => [tool.id, tool])) }}>
      <div ref={viewport} className="mira-message-viewport mobile-messages" role="region" aria-label="对话内容" onScroll={() => { const element = viewport.current!; following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70 }} onClickCapture={interceptLink} onAuxClickCapture={interceptLink}><div className="mira-message-column mobile-message-column @container/conversation">{state.sessionLoading ? <p role="status">正在加载对话…</p> : messages.length ? messages.map(message => message.original.role === 'user' ? <UserMessage key={message.rendererId} {...message} /> : <AssistantMessage key={message.rendererId} {...message} streaming={state.running && message.original.id.startsWith('stream-')} />) : <div className="mobile-empty"><h2>{state.initialized ? '开始项目对话' : '正在同步项目…'}</h2><p>从侧边栏选择项目或新建对话。</p></div>}
      {state.permission && <section className="pilot-action"><ShieldCheck size={18} /><div><strong>{state.permission.title}</strong><p>{state.permission.detail}</p><div className="pilot-action__buttons"><button disabled={busy} onClick={() => void operate(() => controller.permission(false, state.permission!.requestId))}>拒绝</button><button disabled={busy} onClick={() => void operate(() => controller.permission(true, state.permission!.requestId))}>允许</button></div></div></section>}
      {interaction && <TaskInteraction key={interaction.id} interaction={interaction} plan={state.session?.activePlan} selectionReady={Boolean(state.selection) && !busy} onConfirm={() => controller.confirmPlan(interaction.id)} onRevise={message => controller.continuePlan(interaction.kind === 'plan-review' ? interaction.planId : '', message)} onAnswer={answers => controller.answerQuestion(answers, interaction.id)} onCancel={interaction.kind === 'plan-review' ? () => controller.cancelPlan(interaction.planId) : undefined} />}
      </div></div>
    </MiraConversationContext.Provider>
    <div className="mobile-composer-region">{state.error && <p className="mobile-error" role="alert">{state.error}</p>}{state.queue && state.queue.items.length > 0 && <div className="mobile-queue"><span>待发送 {state.queue.items.length} 条</span>{state.queue.items.map(item => <div key={item.id}><span>{item.text}</span><button disabled={busy} onClick={() => void operate(() => controller.withdrawMessage(state.session!.id, item.id))}>撤回</button></div>)}<button disabled={busy} onClick={() => void operate(() => controller.resumeMessageQueue(state.session!.id))}>继续待发送</button></div>}
    <div className="harness-composer mobile-composer">{draft.references.length > 0 && <div className="mobile-attachments">{draft.references.map(file => <div key={file.path}><FileText size={16} /><span>{file.name}</span><button disabled={busy} className="mobile-icon" aria-label={`移除 ${file.name}`} onClick={() => sessionId && updateDraft(sessionId, { references: draft.references.filter(item => item.path !== file.path), submissionId: crypto.randomUUID() })}><X size={14} /></button></div>)}</div>}
    <MiraPromptEditor key={sessionId ?? 'empty'} text={draft.text} disabled={!sessionId || busy || state.sessionLoading} onChange={document => { if (sessionId) updateDraft(sessionId, { text: serializeMiraPromptDocument(document), submissionId: crypto.randomUUID() }) }} placeholder="继续这个任务…" aria-label="任务内容" onError={error => notify(error.message)} />
    <div className="mobile-composer-footer"><DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="harness-composer__icon-button" disabled={locked} aria-label="添加手机附件"><Plus size={18} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content side="top" align="start" className="harness-composer__menu mobile-control-menu"><DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => filePicker.current?.click()}><FileText size={17} />手机文件</DropdownMenu.Item><DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => photoPicker.current?.click()}><Image size={17} />照片</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="harness-composer__config-button" disabled={locked} aria-label="选择任务权限"><ShieldCheck size={16} /><span>{COMPOSER_PERMISSIONS.find(item => item.value === state.session?.permissionMode)?.label ?? '逐次确认'}</span><ChevronDown size={12} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content side="top" className="harness-composer__menu mobile-control-menu"><DropdownMenu.RadioGroup value={state.session?.permissionMode} onValueChange={value => sessionId && void operate(() => controller.setSessionPermission(sessionId, value as PermissionMode))}><ComposerPermissionOptions disabled={[...(!policy.autoApproveEnabled ? ['auto-approve' as const] : []), ...(!policy.fullAccessEnabled ? ['full' as const] : [])]} /></DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    {state.running && <button className="mobile-icon" disabled={busy} aria-label="停止任务" onClick={() => void operate(() => controller.stop())}><Square size={16} /></button>}<button className="mobile-send" disabled={locked || Boolean(interaction || state.permission) || !draft.text.trim() && !draft.references.length} aria-label="发送消息" onClick={send}><ArrowUp size={18} /></button></div>
    <div className="mobile-model-row"><DropdownMenu.Root open={modelOpen} onOpenChange={setModelOpen}><DropdownMenu.Trigger asChild><button disabled={busy} className="harness-composer__config-button" aria-label="选择模型"><span>{selectedModel?.modelId ?? '选择模型'}</span><ChevronDown size={12} /></button></DropdownMenu.Trigger><MiraModelMenu open={modelOpen} ownerKey={sessionId ?? ''} models={models} selected={selectedModel} disabled={busy} onSelect={model => { controller.select({ providerId: model.providerId, modelId: model.modelId, thinkingLevel: state.selection?.thinkingLevel }); setModelOpen(false) }} onReturnFocus={() => undefined} /></DropdownMenu.Root>
    {selectedModel?.reasoning && <DropdownMenu.Root><DropdownMenu.Trigger asChild><button disabled={busy} className="harness-composer__config-button" aria-label="选择思考强度"><Brain size={15} /><span>{COMPOSER_REASONING_CHOICES.find(item => item.value === (state.selection?.thinkingLevel ?? 'medium'))?.label}</span><ChevronDown size={12} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content side="top" className="harness-composer__menu mobile-control-menu"><DropdownMenu.RadioGroup value={state.selection?.thinkingLevel ?? 'medium'} onValueChange={value => { if (state.selection) controller.select({ ...state.selection, thinkingLevel: value as ThinkingLevel }) }}><ComposerReasoningOptions /></DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}</div></div>
    <p className="mobile-preview-note">{busy ? '正在提交，请稍候…' : state.running ? '电脑正在处理，断开连接后任务仍会继续' : '连接到电脑 · 文件与工具详情请在电脑上查看'}</p></div>
    <input ref={filePicker} type="file" multiple hidden onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void upload(files) }} /><input ref={photoPicker} type="file" accept="image/*" multiple hidden onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void upload(files) }} />
    {toast.text && <div key={toast.revision} className="mobile-toast" role="status">{toast.text}</div>}
  </main></div></Tooltip.Provider>
}

