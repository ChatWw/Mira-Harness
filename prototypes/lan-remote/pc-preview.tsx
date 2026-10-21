// UI review fixture only. No Electron bridge, LAN listener, real model or file upload.
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createRoot } from 'react-dom/client'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tooltip from '@radix-ui/react-tooltip'
import { ArrowUp, Brain, ChevronDown, FileText, Folder, Image, Menu, Moon, Plus, ShieldCheck, Sun, X } from 'lucide-react'
import type { HarnessMessage, HarnessSession, PermissionMode, ThinkingLevel } from '../../src/config/harness'
import { PilotController, type PilotHost } from '../../apps/harness-react/src/state/pilot-state'
import { AssistantMessage, MiraConversationContext, UserMessage } from '../../apps/harness-react/src/components/conversation/MiraConversationMessages'
import { MiraModelMenu } from '../../apps/harness-react/src/components/composer/MiraModelMenu'
import { COMPOSER_PERMISSIONS, ComposerPermissionOptions, ComposerReasoningOptions } from '../../apps/harness-react/src/components/composer/ComposerConfigurationOptions'
import { MiraPromptEditor } from '../../apps/harness-react/src/components/composer/MiraPromptEditor'
import { serializeMiraPromptDocument } from '../../apps/harness-react/src/lib/prompt-editor-document'
import { COMPOSER_REASONING_CHOICES } from '../../apps/harness-react/src/lib/model-reasoning'

const desktopOnly = '此功能需要在电脑上使用'
const projects = [{ id: 'mira', name: 'Mira', tasks: ['移动端连接', '关于页面调整'] }, { id: 'website', name: '个人网站', tasks: ['整理首页内容'] }]
const models = [
  { providerId: 'demo', providerName: '演示供应商', modelId: 'GLM-4.6', reasoning: true, multimodal: true },
  { providerId: 'demo', providerName: '演示供应商', modelId: 'GLM-4.5-Air', reasoning: true },
]
const initialMessages: Record<string, HarnessMessage[]> = {
  '移动端连接': [
    { id: 'u1', role: 'user', content: '整理一下移动端连接需要做的改动，先给我看方案。', createdAt: 1792583400000 },
    { id: 'a1', role: 'assistant', content: '可以沿用电脑端的对话界面，手机只保留项目、任务和输入框。\n\n需要调整三处：\n\n- **连接**：电脑开启局域网服务，扫码后由电脑确认。\n- **对话**：复用消息、代码块、审批和问答组件。\n- **操作**：模型、思考和权限可切换，电脑专属操作统一拦截。\n\n方案已整理到 [移动端连接方案.md](file:///D:/Mira/docs/mobile.md)，也可以查看 [交互参考](https://example.com)。', createdAt: 1792583405000 },
  ],
  '关于页面调整': [
    { id: 'u2', role: 'user', content: '描述文案再简洁一点。', createdAt: 1792583400000 },
    { id: 'a2', role: 'assistant', content: '保留产品介绍、版本和反馈入口，详细能力改成短句。\n\n```tsx\n<About product="Mira" />\n```\n\n修改结果可以在电脑上查看。', createdAt: 1792583405000 },
  ],
  '整理首页内容': [],
}

// Existing message components accept a controller. The fixture deliberately denies
// every host capability, so a preview can never reach desktop files or tools.
const denied = async (): Promise<never> => { throw new Error(desktopOnly) }
const previewHost: PilotHost = {
  listSessions: async () => [], listProjects: async () => [], listProviders: async () => [],
  getSession: denied, createSession: denied, runMessage: denied,
  onEvent: () => () => undefined, onBrowserEvent: () => () => undefined,
  listPendingPermissions: async () => [], respondPermission: denied,
  openSessionProject: denied, abortRun: denied, confirmPlan: denied, answerInteraction: denied,
  listFiles: denied, readFile: denied, openTerminal: denied, writeTerminal: denied,
  resizeTerminal: denied, closeTerminal: denied, navigateBrowser: denied,
  setBrowserBounds: denied, controlBrowser: denied,
}
const controller = new PilotController(previewHost)

type Draft = { text: string; files: File[]; model: number; thinking: ThinkingLevel; permission: PermissionMode }
const emptyDraft = (): Draft => ({ text: '', files: [], model: 0, thinking: 'medium', permission: 'default' })

function Preview() {
  const [task, setTask] = useState('移动端连接')
  const [history, setHistory] = useState(initialMessages)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [sidebar, setSidebar] = useState(false)
  const [dark, setDark] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [toast, setToast] = useState({ text: '', revision: 0 })
  const filePicker = useRef<HTMLInputElement>(null)
  const photoPicker = useRef<HTMLInputElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const draft = drafts[task] ?? emptyDraft()
  const messages = history[task] ?? []
  const project = projects.find(item => item.tasks.includes(task))!
  const model = models[draft.model]
  const notify = (text: string) => setToast(previous => ({ text, revision: previous.revision + 1 }))
  const blocked = () => notify(desktopOnly)
  const updateDraft = (patch: Partial<Draft>) => setDrafts(previous => ({ ...previous, [task]: { ...(previous[task] ?? emptyDraft()), ...patch } }))
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(() => {
    const timer = window.setTimeout(() => setToast(previous => previous.revision === toast.revision ? { ...previous, text: '' } : previous), 2600)
    return () => clearTimeout(timer)
  }, [toast.revision])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [task, messages.length])
  const session: HarnessSession = { version: 1, id: task, title: task, projectId: project.id, workingDirectory: 'D:/Mira', messages, toolCalls: [], permissionMode: draft.permission, createdAt: 1, updatedAt: 2, status: 'completed', pinned: false }
  const interceptLink = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest('a[href]')) return
    event.preventDefault(); event.stopPropagation(); blocked()
  }
  const send = () => {
    if (!draft.text.trim() && !draft.files.length) return
    const id = crypto.randomUUID()
    const content = [draft.text.trim(), ...draft.files.map(file => `[演示附件：${file.name}]`)].filter(Boolean).join('\n')
    setHistory(previous => ({ ...previous, [task]: [...(previous[task] ?? []), { id, role: 'user', content, createdAt: Date.now() }, { id: `${id}:reply`, role: 'assistant', content: '这是一条界面演示回复。输入已留在当前预览中；尚未连接电脑、调用模型或上传附件。', createdAt: Date.now() }] }))
    updateDraft({ text: '', files: [] })
  }
  function taskList() {
    return <>
      <div className="mobile-sidebar-heading"><strong>Mira</strong><span>项目空间</span></div>
      <nav aria-label="项目任务">{projects.map(item => <section className="mobile-project" key={item.id}><h2><Folder size={16} />{item.name}</h2>{item.tasks.map(name => <button type="button" key={name} aria-current={task === name ? 'page' : undefined} onClick={() => { setTask(name); setSidebar(false); setModelOpen(false) }}><span>{name}</span></button>)}</section>)}</nav>
      <div className="mobile-sidebar-footer"><span>仅显示项目空间内的任务</span><span>UI 演示 · 未连接电脑</span></div>
    </>
  }
  function pickFiles(files: FileList | null) {
    const picked = Array.from(files ?? [])
    if (picked.some(file => file.size > 20 * 1024 * 1024)) { notify('请选择小于 20 MB 的文件'); return }
    if (draft.files.length + picked.length > 5) { notify('一次最多选择 5 个附件'); return }
    updateDraft({ files: [...draft.files, ...picked] })
  }
  return <Tooltip.Provider delayDuration={400}><div className="mobile-preview">
    <aside className="mobile-sidebar">{taskList()}</aside>
    <main className="mobile-main">
      <header className="mobile-header">
        <Dialog.Root open={sidebar} onOpenChange={setSidebar}><Dialog.Trigger asChild><button type="button" className="mobile-icon mobile-menu-trigger" aria-label="打开项目侧边栏"><Menu size={20} /></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="mobile-drawer-overlay" /><Dialog.Content className="mobile-drawer"><Dialog.Title className="sr-only">项目空间</Dialog.Title><Dialog.Description className="sr-only">选择项目内的任务</Dialog.Description><Dialog.Close asChild><button type="button" className="mobile-icon mobile-drawer-close" aria-label="关闭项目侧边栏"><X size={18} /></button></Dialog.Close>{taskList()}</Dialog.Content></Dialog.Portal></Dialog.Root>
        <div className="mobile-heading"><span>{project.name}</span><h1>{task}</h1></div>
        <span className="mobile-demo-label">UI 演示</span><button type="button" className="mobile-icon" aria-label={dark ? '切换浅色' : '切换深色'} onClick={() => setDark(value => !value)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
      </header>
      <MiraConversationContext.Provider value={{ controller, sessionId: task, session, active: true, openChangesTab: blocked, openFile: blocked, openLink: blocked, openPresentation: blocked, openRunProgress: blocked, openCommand: blocked, openSubtask: blocked, stopSubtask: denied, running: false, waiting: false, canRerun: false, tools: [], toolsById: new Map() }}>
        <div ref={viewport} className="mira-message-viewport mobile-messages" role="region" aria-label="对话内容" onClickCapture={interceptLink} onAuxClickCapture={interceptLink}>
          <div className="mira-message-column mobile-message-column @container/conversation">
            {messages.length ? messages.map(message => message.role === 'user' ? <UserMessage key={message.id} original={message} rendererId={message.id} /> : <AssistantMessage key={message.id} original={message} rendererId={message.id} streaming={false} />) : <div className="mobile-empty"><h2>开始这个项目的对话</h2><p>发送消息，继续在电脑上处理工作。</p></div>}
            <div ref={bottom} />
          </div>
        </div>
      </MiraConversationContext.Provider>
      <div className="mobile-composer-region">
        <div className="harness-composer mobile-composer">
          {draft.files.length > 0 && <div className="mobile-attachments">{draft.files.map((file, index) => <div key={`${file.name}:${index}`}><FileText size={16} /><span>{file.name}</span><button type="button" className="mobile-icon" aria-label={`移除 ${file.name}`} onClick={() => updateDraft({ files: draft.files.filter((_, i) => i !== index) })}><X size={14} /></button></div>)}</div>}
          <MiraPromptEditor key={task} text={draft.text} onChange={document => updateDraft({ text: serializeMiraPromptDocument(document) })} placeholder="继续这个任务…" aria-label="任务内容" onError={error => notify(error.message)} />
          <div className="mobile-composer-footer">
            <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="harness-composer__icon-button" aria-label="添加手机附件"><Plus size={18} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content side="top" align="start" sideOffset={8} className="harness-composer__menu mobile-control-menu"><DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => filePicker.current?.click()}><FileText size={17} />手机文件</DropdownMenu.Item><DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => photoPicker.current?.click()}><Image size={17} />照片</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
            <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="harness-composer__config-button mobile-permission" aria-label={`权限：${COMPOSER_PERMISSIONS.find(item => item.value === draft.permission)?.label}`}><ShieldCheck size={16} /><span>{COMPOSER_PERMISSIONS.find(item => item.value === draft.permission)?.label}</span><ChevronDown size={12} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content side="top" align="start" className="harness-composer__menu mobile-control-menu"><DropdownMenu.RadioGroup value={draft.permission} onValueChange={value => updateDraft({ permission: value as PermissionMode })}><ComposerPermissionOptions /></DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
            <button type="button" className="mobile-send" aria-label="发送消息（演示）" disabled={!draft.text.trim() && !draft.files.length} onClick={send}><ArrowUp size={18} /></button>
          </div>
          <div className="mobile-model-row">
            <DropdownMenu.Root open={modelOpen} onOpenChange={setModelOpen}><DropdownMenu.Trigger asChild><button type="button" className="harness-composer__config-button" aria-label={`模型：${model.modelId}`}><span>{model.modelId}</span><ChevronDown size={12} /></button></DropdownMenu.Trigger><MiraModelMenu open={modelOpen} ownerKey={task} models={models} selected={model} disabled={false} onSelect={value => { updateDraft({ model: models.indexOf(value) }); setModelOpen(false) }} onReturnFocus={() => undefined} /></DropdownMenu.Root>
            <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="harness-composer__config-button" aria-label="选择思考强度"><Brain size={15} /><span>{COMPOSER_REASONING_CHOICES.find(item => item.value === draft.thinking)?.label}</span><ChevronDown size={12} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content side="top" align="end" className="harness-composer__menu mobile-control-menu"><DropdownMenu.RadioGroup value={draft.thinking} onValueChange={value => updateDraft({ thinking: value as ThinkingLevel })}><ComposerReasoningOptions /></DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
          </div>
        </div>
        <p className="mobile-preview-note">界面预览 · 消息与附件仅保留在本页，刷新后清除</p>
      </div>
      <input ref={filePicker} type="file" multiple hidden onChange={event => { pickFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
      <input ref={photoPicker} type="file" accept="image/*" multiple hidden onChange={event => { pickFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
      {toast.text && <div key={toast.revision} className="mobile-toast" role="status">{toast.text}</div>}
    </main>
  </div></Tooltip.Provider>
}

createRoot(document.getElementById('root')!).render(<Preview />)

