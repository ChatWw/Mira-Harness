import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowUp, Bot, Check, ChevronDown, CircleAlert, FolderOpen, Paperclip, Plus, Settings2, Shield, Square, Wrench, X } from 'lucide-react'
import { isModelProviderAvailable, type HarnessContextUsage, type HarnessFileReference, type ModelSelection, type PermissionMode } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { cn } from '../../lib/utils'

const PERMISSION_LABELS: Record<PermissionMode, string> = { default: '逐次确认', 'auto-approve': '自动审核', full: '完全访问' }
const STARTERS = [
  { title: '写文案', prompt: '帮我为下面的主题写一段介绍文案：' },
  { title: '总结文章', prompt: '帮我总结这篇文章的要点：' },
  { title: '写代码', prompt: '帮我写一个脚本，实现以下功能：' },
]
type ComposerPanel = 'none' | 'skills' | 'mcp' | 'perm-confirm' | 'auto-confirm'
interface SlashCommand { id: string; label: string; hint: string }

export function HarnessComposer({ state, controller, planning, setPlanning }: {
  state: ReturnType<PilotController['getSnapshot']>
  controller: PilotController
  planning: boolean
  setPlanning: (value: boolean) => void
}) {
  const sessionId = state.session?.id
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [references, setReferences] = useState<HarnessFileReference[]>([])
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([])
  const [activeMcpIds, setActiveMcpIds] = useState<string[]>([])
  const [panel, setPanel] = useState<ComposerPanel>('none')
  const [skills, setSkills] = useState<Array<{ id: string; name: string }>>([])
  const [mcpServers, setMcpServers] = useState<Array<{ id: string; name: string; enabled: boolean }>>([])
  const [slashIndex, setSlashIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const draft = sessionId ? drafts[sessionId] ?? '' : ''
  const slashActive = draft.startsWith('/') && !draft.includes(' ')
  const slashQuery = slashActive ? draft.slice(1).toLowerCase() : ''
  const slashCommands: SlashCommand[] = [
    { id: 'files', label: '/files 引用文件', hint: '从项目目录选择要引用的文件' },
    { id: 'skills', label: '/skills Skill', hint: `选择当前会话启用的 Skill（已选 ${activeSkillIds.length}）` },
    { id: 'mcp', label: '/mcp MCP 服务', hint: `开关当前会话的 MCP 服务（已选 ${activeMcpIds.length}）` },
    { id: 'delegation', label: '/delegation 子任务委派', hint: state.session?.delegationEnabled ? '关闭子任务委派' : '开启子任务委派' },
    { id: 'memory', label: '/memory 保存项目记忆', hint: '把当前会话要点保存到项目记忆' },
    { id: 'perm', label: '/perm 权限档位', hint: `当前：${PERMISSION_LABELS[state.session?.permissionMode || 'default']}` },
  ].filter(command => !slashQuery || command.label.toLowerCase().includes(slashQuery) || command.id.includes(slashQuery))
  useEffect(() => { setReferences([]); setActiveSkillIds([]); setActiveMcpIds([]); setPanel('none') }, [sessionId])
  useEffect(() => { setSlashIndex(0) }, [slashQuery])
  useEffect(() => {
    if (panel === 'skills' && !skills.length) void controller.listSkills().then(list => setSkills((list as Array<{ id: string; name: string; enabled?: boolean }>).filter(skill => skill.enabled !== false).map(({ id, name }) => ({ id, name })))).catch(() => setSkills([]))
    if (panel === 'mcp' && !mcpServers.length) void controller.listMcp().then(list => setMcpServers(list.filter(server => server.enabled))).catch(() => setMcpServers([]))
  }, [controller, panel, skills.length, mcpServers.length])
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(200, element.scrollHeight)}px`
  }, [draft])

  const usage: HarnessContextUsage | undefined = state.session?.context?.usage
  const availableModels = choices(state)
  const selectedModel = availableModels.find(choice => choice.providerId === state.selection?.providerId && choice.modelId === state.selection?.modelId)
  const selectedProject = state.projects.find(project => project.id === state.session?.projectId)
  const scopeLabel = selectedProject?.name || '个人工作区'
  const usageRatio = usage && usage.contextWindow ? Math.min(1, usage.usedTokens / usage.contextWindow) : 0
  const sendingBlocked = !state.session || !state.selection || state.running || Boolean(state.permission) || state.session?.pendingInteraction?.status === 'waiting'

  function setDraft(value: string) {
    if (!sessionId) return
    setDrafts(previous => ({ ...previous, [sessionId]: value }))
  }
  async function runSlash(commandId: string) {
    setDraft('')
    if (commandId === 'files') await selectFiles()
    if (commandId === 'skills') setPanel(panel === 'skills' ? 'none' : 'skills')
    if (commandId === 'mcp') setPanel(panel === 'mcp' ? 'none' : 'mcp')
    if (commandId === 'delegation' && state.session) await controller.setSessionDelegation(state.session.id, !state.session.delegationEnabled)
    if (commandId === 'memory') await controller.saveMemory()
    if (commandId === 'perm') setPanel(panel === 'perm-confirm' ? 'none' : 'perm-confirm')
  }
  async function selectFiles() {
    try {
      const selected = await controller.selectFiles()
      setReferences(previous => [...previous, ...selected.filter(item => !previous.some(existing => existing.path === item.path))])
    } catch { /* 取消选择或宿主不支持时忽略 */ }
  }
  function onSlashKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setSlashIndex(index => Math.min(index + 1, slashCommands.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setSlashIndex(index => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter' && slashCommands[slashIndex]) { event.preventDefault(); void runSlash(slashCommands[slashIndex].id) }
    else if (event.key === 'Escape') setDraft('')
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || sendingBlocked) return
    setDraft('')
    await controller.send(text, planning, references)
    const result = controller.getSnapshot()
    if (result.session?.id === sessionId && result.error) setDrafts(previous => ({ ...previous, [sessionId!]: previous[sessionId!] || text }))
    else setReferences([])
  }

  return <div className="w-full">
    {panel === 'auto-confirm' && <div className="mb-2 grid gap-2 rounded-xl border border-border bg-background-alt px-3.5 py-2.5 text-ui-sm" role="alert">
      <p className="m-0 flex items-center gap-1.5 text-foreground-subtle"><CircleAlert size={14} /> 自动审核会跳过常规工具确认。仅对当前会话生效。</p>
      <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border border-border bg-card px-3 py-1 text-ui-sm" onClick={() => setPanel('none')}>取消</button><button type="button" className="rounded-lg border border-brand bg-brand px-3 py-1 text-ui-sm text-on-accent" onClick={() => { if (state.session) void controller.setSessionPermission(state.session.id, 'auto-approve'); setPanel('none') }}>确认自动审核</button></div>
    </div>}
    {panel === 'perm-confirm' && <div className="mb-2 grid gap-2 rounded-xl border border-border bg-background-alt px-3.5 py-2.5 text-ui-sm" role="alert">
      <p className="m-0 flex items-center gap-1.5 text-foreground-subtle"><CircleAlert size={14} /> 完全访问将跳过所有工具确认（危险命令仍被拦截）。仅对当前会话生效。</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded-lg border border-border bg-card px-3 py-1 text-ui-sm text-foreground hover:bg-hover" onClick={() => setPanel('none')}>取消</button>
        <button type="button" className="rounded-lg border border-brand bg-brand px-3 py-1 text-ui-sm text-on-accent" onClick={() => { if (state.session) void controller.setSessionPermission(state.session.id, 'full'); setPanel('none') }}>确认完全访问</button>
      </div>
    </div>}
    {panel === 'skills' && <div className="mb-2 grid gap-2 rounded-xl border border-border bg-background-alt px-3.5 py-2.5 text-ui-sm">
      <strong className="text-ui-sm">Skill（当前会话）</strong>
      <div className="flex flex-wrap gap-1.5">{skills.map(skill => <label key={skill.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-ui-sm">
        <input type="checkbox" checked={activeSkillIds.includes(skill.id)} onChange={() => {
          const next = activeSkillIds.includes(skill.id) ? activeSkillIds.filter(id => id !== skill.id) : [...activeSkillIds, skill.id]
          setActiveSkillIds(next)
          if (state.session) void controller.setSessionSkills(state.session.id, next)
        }} />{skill.name}
      </label>)}{!skills.length && <p className="m-0 text-ui-xs text-foreground-subtle">暂无可用 Skill</p>}</div>
    </div>}
    {panel === 'mcp' && <div className="mb-2 grid gap-2 rounded-xl border border-border bg-background-alt px-3.5 py-2.5 text-ui-sm">
      <strong className="text-ui-sm">MCP 服务（当前会话）</strong>
      <div className="flex flex-wrap gap-1.5">{mcpServers.map(server => <label key={server.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-ui-sm">
        <input type="checkbox" checked={activeMcpIds.includes(server.id)} onChange={() => {
          const next = activeMcpIds.includes(server.id) ? activeMcpIds.filter(id => id !== server.id) : [...activeMcpIds, server.id]
          setActiveMcpIds(next)
          if (state.session) void controller.setSessionMcpServers(state.session.id, next)
        }} />{server.name}
      </label>)}{!mcpServers.length && <p className="m-0 text-ui-xs text-foreground-subtle">暂无已启用的 MCP 服务</p>}</div>
    </div>}
    {slashActive && slashCommands.length > 0 && <div className="mb-2 grid gap-0.5 rounded-xl border border-border bg-card p-1.5 shadow-soft" role="listbox" aria-label="斜杠命令">
      {slashCommands.map((command, index) => <button key={command.id} type="button" role="option" aria-selected={index === slashIndex} className={cn('grid gap-0.5 rounded-lg px-2.5 py-1.5 text-left', index === slashIndex ? 'bg-hover' : '')} onMouseEnter={() => setSlashIndex(index)} onClick={() => void runSlash(command.id)}>
        <strong className="text-ui-sm font-medium">{command.label}</strong><small className="text-ui-xs text-foreground-subtle">{command.hint}</small>
      </button>)}
    </div>}
    <form className="harness-composer relative block rounded-2xl border border-input-border bg-input p-3 transition-colors hover:border-input-border-hover focus-within:border-input-border-focused focus-within:bg-input-focused" onSubmit={event => void submit(event)}>
      <div className="harness-composer__scope" title={selectedProject?.directory || '个人工作区'}><FolderOpen size={13} /><span>任务范围</span><strong>{scopeLabel}</strong>{selectedProject?.directory && <small>{selectedProject.directory}</small>}</div>
      <textarea ref={textareaRef} rows={1} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.nativeEvent.isComposing || event.keyCode === 229) return; if (slashActive && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) { onSlashKeyDown(event); return } if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }} placeholder={state.session ? '描述你的任务…（输入 / 使用命令）' : '先从左侧创建任务'} aria-label="任务内容" className="block max-h-40 min-h-10 w-full resize-none overflow-y-auto bg-transparent px-1 text-ui-base leading-5 text-foreground outline-none placeholder:text-foreground-subtlest" />
      {references.length > 0 && <div className="flex flex-wrap gap-1.5 px-1 pt-1.5">{references.map(reference => <span key={reference.path} className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-background-alt px-2 py-0.5 text-ui-xs" title={reference.path}><Paperclip size={11} /><span className="truncate">{reference.name}</span><button type="button" aria-label={`移除 ${reference.name}`} title={`移除 ${reference.name}`} className="grid size-3.5 place-items-center rounded-full text-foreground-subtle hover:bg-hover hover:text-red-400" onClick={() => setReferences(previous => previous.filter(item => item.path !== reference.path))}><X size={10} /></button></span>)}</div>}
      {state.session && !draft.trim() && !state.running && <div className="flex flex-wrap gap-1.5 px-1 pt-2">{STARTERS.map(starter => <button key={starter.title} type="button" className="rounded-full bg-background-alt px-3 py-1 text-ui-xs text-foreground-subtle hover:text-brand" onClick={() => setDraft(starter.prompt)}>{starter.title}</button>)}</div>}
      <div className="harness-composer__footer mt-1 flex items-end gap-3">
        <div className="harness-composer__controls flex min-w-0 flex-1 items-center gap-0.5">
          <button type="button" className="flex size-7 items-center justify-center rounded-lg text-foreground-subtle hover:bg-hover hover:text-brand" title="引用文件" aria-label="引用文件" disabled={!state.session} onClick={() => void selectFiles()}><Plus size={16} /></button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger type="button" className="harness-composer__menu-trigger" aria-label="模型" title={selectedModel?.label || '选择模型'}><Bot size={15} /><span>{selectedModel?.label || (availableModels.length ? '选择模型' : '请先配置模型')}</span><ChevronDown size={12} /></DropdownMenu.Trigger>
            <DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content align="start" sideOffset={7} className="harness-composer__menu" aria-label="选择模型">
              {availableModels.length ? <DropdownMenu.RadioGroup value={selectedModel ? `${selectedModel.providerId}:${selectedModel.modelId}` : ''} onValueChange={value => { const choice = availableModels.find(item => `${item.providerId}:${item.modelId}` === value); if (choice) controller.select({ providerId: choice.providerId, modelId: choice.modelId } satisfies ModelSelection) }}>
                {availableModels.map(choice => <DropdownMenu.RadioItem key={`${choice.providerId}:${choice.modelId}`} value={`${choice.providerId}:${choice.modelId}`} className="harness-composer__menu-item"><span className="harness-composer__menu-indicator"><DropdownMenu.ItemIndicator><Check size={13} /></DropdownMenu.ItemIndicator></span><span>{choice.label}</span></DropdownMenu.RadioItem>)}
              </DropdownMenu.RadioGroup> : <span className="harness-composer__menu-empty">请先在设置中配置模型</span>}
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger type="button" className="harness-composer__menu-trigger harness-composer__menu-trigger--advanced" aria-label="高级设置" title="高级设置" disabled={!state.session}><Settings2 size={14} /><span>高级设置</span><ChevronDown size={12} /></DropdownMenu.Trigger>
            <DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content align="start" sideOffset={7} className="harness-composer__menu harness-composer__advanced-menu" aria-label="高级设置">
              <DropdownMenu.Label className="harness-composer__menu-label">执行与工具</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={state.session?.permissionMode || 'default'} onValueChange={value => {
                const mode = value as PermissionMode
                if (mode === 'full') setPanel('perm-confirm')
                else if (mode === 'auto-approve') setPanel('auto-confirm')
                else { setPanel('none'); if (state.session) void controller.setSessionPermission(state.session.id, mode) }
              }}>
                {(Object.keys(PERMISSION_LABELS) as PermissionMode[]).map(mode => <DropdownMenu.RadioItem key={mode} value={mode} className="harness-composer__menu-item"><span className="harness-composer__menu-indicator"><DropdownMenu.ItemIndicator><Check size={13} /></DropdownMenu.ItemIndicator></span><Shield size={13} /><span><strong>{PERMISSION_LABELS[mode]}</strong><small>{mode === 'default' ? '每次工具调用前确认' : mode === 'auto-approve' ? '跳过常规确认，危险命令仍拦截' : '跳过工具确认，仅限当前会话'}</small></span></DropdownMenu.RadioItem>)}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="harness-composer__menu-separator" />
              <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => setPanel(panel === 'skills' ? 'none' : 'skills')}><Wrench size={14} /><span><strong>Skill</strong><small>{activeSkillIds.length ? `已启用 ${activeSkillIds.length} 项` : '选择当前会话使用的能力'}</small></span></DropdownMenu.Item>
              <DropdownMenu.Item className="harness-composer__menu-item" onSelect={() => setPanel(panel === 'mcp' ? 'none' : 'mcp')}><span className="harness-composer__mcp-icon">M</span><span><strong>MCP 服务</strong><small>{activeMcpIds.length ? `已连接 ${activeMcpIds.length} 项` : '连接当前会话可用服务'}</small></span></DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
          {usage && usageRatio > 0 && <span className={cn('mx-0.5 inline-flex', usageRatio >= .95 ? 'text-red-400' : usageRatio >= .8 ? 'text-amber-400' : 'text-emerald-400')} title={`上下文 ${Math.round(usageRatio * 100)}%（${usage.usedTokens} / ${usage.contextWindow} tokens，${usage.source === 'reported' ? '实测' : '估算'}）`}>
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" opacity=".2" strokeWidth="2.4" /><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray={`${usageRatio * 50.3} 50.3`} transform="rotate(-90 10 10)" strokeLinecap="round" /></svg>
          </span>}
          <div className="harness-composer__mode ml-1 flex gap-px rounded-lg bg-hover p-0.5" role="group" aria-label="执行模式">
            <button type="button" className={cn('rounded-md px-2.5 py-0.5 text-ui-xs', !planning ? 'bg-card text-foreground shadow-sm' : 'text-foreground-subtle')} aria-pressed={!planning} onClick={() => setPlanning(false)}>直接执行</button>
            <button type="button" className={cn('rounded-md px-2.5 py-0.5 text-ui-xs', planning ? 'bg-card text-foreground shadow-sm' : 'text-foreground-subtle')} aria-pressed={planning} onClick={() => setPlanning(true)}>先出计划</button>
          </div>
        </div>
        {state.running
          ? <button type="button" className="harness-composer__send flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-foreground-inverse transition-transform hover:-translate-y-px" title="停止任务" aria-label="停止任务" onClick={() => void controller.stop()}><Square size={14} /></button>
          : <button type="submit" className="harness-composer__send flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-foreground-inverse transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-35" title="发送任务" aria-label="发送任务" disabled={sendingBlocked || !draft.trim()}><ArrowUp size={16} /></button>}
      </div>
    </form>
  </div>
}

function choices(state: ReturnType<PilotController['getSnapshot']>) {
  return state.providers.flatMap(provider => isModelProviderAvailable(provider)
    ? provider.models.filter(model => model.enabled).map(model => ({ providerId: provider.id, modelId: model.id, label: `${provider.name} / ${model.id}` })) : [])
}
