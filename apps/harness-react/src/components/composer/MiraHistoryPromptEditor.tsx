import { MiraPluginAvatar, pluginLabel } from '../extensions/MiraPluginAvatar'
import { miraFileTreeIcon } from '../../lib/mira-file-tree-icon'
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Blocks, Bot, MessageSquare, Paperclip, WandSparkles, Wrench } from 'lucide-react'
import type { HarnessFileReference, HarnessSubtaskRole } from '../../../../../src/config/harness'
import { MIRA_SUBTASK_AGENTS } from '../../../../../src/config/miraAgents'
import type { PilotController } from '../../state/pilot-state'
import { bestMiraSuggestionIndex, filterMiraSuggestions, findMiraPromptToken, formatMiraConversationReference, insertMiraPromptTrigger, miraPromptReplacementRange, nextMiraSuggestionIndex, type MiraPromptRange, type MiraPromptToken, type MiraPromptTrigger } from '../../lib/prompt-input-triggers'
import { miraAgentReference, miraPluginAgentReference, miraUserAgentReference } from '../../lib/mira-agent-reference'
import { miraSkillReference } from '../../lib/mira-skill-reference'
import { miraPluginCommandReference, miraPluginReference } from '../../lib/mira-plugin-reference'
import type { MiraPromptPart, MiraPromptReference } from '../../lib/prompt-editor-document'
import { ComposerSuggestionPanel, type ComposerSuggestion, type ComposerSuggestionSection } from './ComposerSuggestionPanel'
import { useComposerCatalogs } from './useComposerCatalogs'
import { MiraPromptEditor, type MiraPromptEditorHandle, type MiraPromptEditorProps } from './MiraPromptEditor'

export interface MiraHistoryPromptEditorHandle extends MiraPromptEditorHandle { openTrigger(trigger: MiraPromptTrigger): void; openActionMenu(): void }
type Props = MiraPromptEditorProps & { controller: PilotController; sessionId: string; onAddFile(path: string, name: string): Promise<HarnessFileReference | undefined>; onAttachFiles?: () => void; onActionMenuChange?: (open: boolean) => void }

export const MiraHistoryPromptEditor = forwardRef<MiraHistoryPromptEditorHandle, Props>(function MiraHistoryPromptEditor({ controller, sessionId, onAddFile, onAttachFiles, onActionMenuChange, ...props }, ref) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const session = state.session?.id === sessionId ? state.session : undefined
  const editor = useRef<MiraPromptEditorHandle>(null)
  const [caret, setCaret] = useState<MiraPromptRange>({ start: 0, end: 0 })
  const [tokenSnapshot, setTokenSnapshot] = useState<{ owner: string; text: string; token: MiraPromptToken | null } | null>(null)
  const [actionOpen, setActionOpen] = useState(false)
  const actionRange = useRef<MiraPromptRange>({ start: 0, end: 0 })
  const panel = useRef<HTMLDivElement>(null)
  const anchor = useRef({ getBoundingClientRect: () => editor.current?.getElement()?.closest('.mira-history-edit-shell')?.getBoundingClientRect() ?? new DOMRect() })
  useEffect(() => { onActionMenuChange?.(actionOpen); return () => onActionMenuChange?.(false) }, [actionOpen, onActionMenuChange])
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState('')
  const [highlighted, setHighlighted] = useState<string>()
  const [reading, setReading] = useState(false)
  const request = useRef(false), mounted = useRef(true), revision = useRef(0)
  const currentText = useRef(props.text); currentText.current = props.text
  const listId = useId()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const snapshot = tokenSnapshot?.owner === sessionId && tokenSnapshot.text === props.text ? tokenSnapshot : null
  let token = snapshot ? snapshot.token : findMiraPromptToken(props.text, caret.start, caret.end)
  if (token && props.document) {
    let offset = 0
    for (const part of props.document.parts) {
      const end = offset + (part.type === 'text' ? part.text.length : part.reference.text.length)
      if (part.type === 'reference' && token.start < end && token.end > offset) { token = null; break }
      offset = end
    }
  }
  const signature = token ? JSON.stringify(token) : ''
  const open = Boolean(session && (actionOpen || focused && token && signature !== dismissed) && !props.disabled && !reading)
  const query = actionOpen ? '' : token?.query || '', kind = actionOpen ? '@' : token?.trigger
  const catalogs = useComposerCatalogs(controller, { sessionId, directory: session?.workingDirectory ?? state.projects.find(project => project.id === session?.projectId)?.directory }, query, open && kind !== '#', kind === '@', kind === '/' ? 'commands' : kind === '$' ? 'skills' : 'plugins')
  const sections: ComposerSuggestionSection[] = []
  const filter = (items: ComposerSuggestion[]) => filterMiraSuggestions(items, query)
  const atStart = token && !props.text.slice(0, token.start).trim()
  if (actionOpen && onAttachFiles) sections.push({ id: 'add', title: '添加', items: [{ id: 'attach-files', label: '添加文件', icon: <Paperclip size={16} />, action: { type: 'command', value: 'attach-files' } }] })
  if (kind === '@') {
    sections.push({ id: 'files', title: '文件', items: catalogs.files.items.map(file => ({ id: `file-${file.path}`, label: file.name, description: file.path, icon: <img src={miraFileTreeIcon(file.path)} width={16} height={16} alt="" aria-hidden="true" draggable={false} />, action: { type: 'file', value: file.path } })), loading: catalogs.files.status === 'loading', error: catalogs.files.error, onRetry: catalogs.reload, empty: '没有匹配的工作区文件' })
    sections.push({ id: 'plugins', title: '插件', items: filter(catalogs.plugins.items.map(plugin => ({ id: `plugin-${plugin.id}`, label: pluginLabel(plugin), keywords: plugin.id, description: plugin.error || plugin.description, disabled: Boolean(plugin.error || plugin.conflicts.length || !plugin.skills.length), icon: <MiraPluginAvatar item={plugin} />, action: { type: 'plugin', value: plugin.id } }))), loading: catalogs.plugins.status === 'loading', error: catalogs.plugins.error, onRetry: catalogs.reload })
  }
  if (kind === '/' || kind === '$') sections.push({ id: 'skills', title: '技能', items: filter(catalogs.skills.items.map(skill => ({ id: `skill-${skill.id}`, label: kind === '/' ? `$${skill.name}` : skill.name, keywords: skill.name, description: skill.description, icon: <WandSparkles size={14} className="mira-composer-skill-icon" />, action: { type: 'skill', value: skill.id } }))), loading: catalogs.skills.status === 'loading', error: catalogs.skills.error, onRetry: catalogs.reload })
  if (kind === '/') {
    sections.push({ id: 'custom-commands', title: '自定义命令', items: atStart ? filter(catalogs.commands.items.map(command => ({ id: `custom-${command.id}`, label: `/${command.name}`, description: command.unavailableReason || command.description, disabled: Boolean(command.shadowed || command.unavailableReason), icon: <Wrench size={16} />, action: { type: 'prompt-command', value: command.name } }))) : [], loading: catalogs.commands.status === 'loading', error: catalogs.commands.error, onRetry: catalogs.reload, empty: atStart ? '没有匹配的自定义命令' : '命令需放在消息开头' })
    sections.push({ id: 'plugin-commands', title: '插件命令', items: atStart ? filter(catalogs.plugins.items.flatMap(plugin => (plugin.commands || []).map(command => ({ id: `command-${plugin.id}-${command.name}`, label: `/${plugin.name}:${command.name}`, description: plugin.error || command.unavailableReason || command.description, disabled: Boolean(plugin.error || plugin.conflicts.length || command.unavailableReason || catalogs.commands.items.some(item => item.name === `${plugin.name}:${command.name}` && !item.shadowed)), icon: <Blocks size={16} />, action: { type: 'plugin-command', value: `${plugin.name}:${command.name}` } })))) : [], loading: catalogs.plugins.status === 'loading', error: catalogs.plugins.error, onRetry: catalogs.reload, empty: atStart ? '没有匹配的插件命令' : '命令需放在消息开头' })
  }
  if (!actionOpen && (kind === '@' || kind === '/')) {
    const unavailable = !session?.workingDirectory && !session?.projectId || session?.delegationEnabled === false
    sections.push({ id: 'agents', title: '智能体 · 引用后由主 Agent 按需委派', items: filter([
      ...Object.entries(MIRA_SUBTASK_AGENTS).map(([role, agent]): ComposerSuggestion => ({ id: `agent-${role}`, label: agent.label, keywords: role, description: `内置 · ${agent.description}`, disabled: unavailable, icon: <Bot size={16} />, action: { type: 'agent', value: role } })),
      ...catalogs.plugins.items.flatMap(plugin => (plugin.agents || []).map((agent): ComposerSuggestion => ({ id: `agent-${plugin.id}-${agent.name}`, label: agent.name, description: plugin.error || agent.unavailableReason || agent.description, disabled: Boolean(unavailable || plugin.error || plugin.conflicts.length || agent.unavailableReason), icon: <Bot size={16} />, action: { type: 'agent', value: agent.name } }))),
      ...catalogs.userAgents.items.map((agent): ComposerSuggestion => ({ id: `custom-agent-${agent.id}`, label: agent.name, description: agent.unavailableReason || agent.description, disabled: Boolean(unavailable || !agent.enabled || agent.shadowed || agent.unavailableReason), icon: <Bot size={16} />, action: { type: 'agent', value: agent.name } })),
    ]), loading: catalogs.plugins.status === 'loading' || catalogs.userAgents.status === 'loading', error: catalogs.plugins.error || catalogs.userAgents.error, onRetry: catalogs.reload })
  }
  if (kind === '@' || kind === '#') sections.push({ id: 'sessions', title: '对话', items: filter(state.sessions.filter(item => item.id !== sessionId && (kind === '#' || item.projectId === session?.projectId)).map(item => ({ id: `session-${item.id}`, label: item.title, description: '引用本地对话正文', icon: <MessageSquare size={16} />, action: { type: 'session', value: item.id } }))).slice(0, 40) })
  if (actionOpen) sections.sort((a, b) => ['add', 'plugins', 'files', 'sessions'].indexOf(a.id) - ['add', 'plugins', 'files', 'sessions'].indexOf(b.id))
  const visibleSections: ComposerSuggestionSection[] = kind === '/' ? [
    { id: 'commands', title: '命令', sources: ['custom-commands', 'plugin-commands'], empty: atStart ? '没有匹配的命令' : '命令需放在消息开头' },
    { id: 'skills', title: '技能', sources: ['skills'], empty: '没有匹配的已启用技能' },
    { id: 'agents', title: '子智能体 · 引用后由主 Agent 按需委派', sources: ['agents'], empty: '没有匹配的子智能体' },
  ].map(group => {
    const sources = group.sources.flatMap(id => sections.filter(section => section.id === id))
    return { id: group.id, title: group.title, items: sources.flatMap(section => section.items), loading: sources.some(section => section.loading),
      error: sources.filter(section => section.error).map(section => `${section.title}：${section.error}`).join('；') || undefined,
      empty: group.empty, onRetry: catalogs.reload }
  }) : sections.filter(section => section.loading || section.error || section.items.length)
  const items = visibleSections.flatMap(section => section.items)
  const index = highlighted ? items.findIndex(item => item.id === highlighted && !item.disabled) : -1
  const selectedIndex = index < 0 ? bestMiraSuggestionIndex(items, query) : index
  const close = () => { setActionOpen(false); setDismissed(signature); setHighlighted(undefined) }
  const replace = (range: MiraPromptRange, parts: MiraPromptPart[]) => { editor.current?.focus(); editor.current?.replaceRange(range, parts); setHighlighted(undefined); setDismissed('') }
  const openTrigger = (trigger: MiraPromptTrigger) => {
    if (props.disabled || request.current) return
    setActionOpen(false)
    const range = editor.current?.getSelectionRange() ?? caret
    const insertion = insertMiraPromptTrigger(props.text, range, trigger)
    replace(range, [{ type: 'text', text: insertion.text.slice(range.start, insertion.caret) }])
  }
  useImperativeHandle(ref, () => ({ getElement: () => editor.current?.getElement() ?? null, focus: options => editor.current?.focus(options), getSelectionRange: () => editor.current?.getSelectionRange() ?? caret, setSelectionRange: (start, end) => editor.current?.setSelectionRange(start, end), replaceRange: (range, parts) => editor.current?.replaceRange(range, parts), openTrigger, openActionMenu: () => { if (props.disabled || request.current) return; actionRange.current = editor.current?.getSelectionRange() ?? caret; setHighlighted(undefined); setActionOpen(value => !value) } }))
  const select = async (item: ComposerSuggestion) => {
    if ((!token && !actionOpen) || props.disabled || request.current || item.disabled) return
    if (item.id === 'attach-files') { close(); onAttachFiles?.(); return }
    const range = actionOpen ? actionRange.current : miraPromptReplacementRange(props.text, token!, [item.label, item.action.value])
    let reference: MiraPromptReference | undefined
    if (item.action.type === 'skill') {
      const skill = catalogs.skills.items.find(skill => skill.id === item.action.value)
      if (!skill) return
      reference = miraSkillReference(skill.id, skill.name)
    }
    if (item.action.type === 'plugin') {
      const ids = new Set(props.document?.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'plugin' ? [part.reference.value] : []))
      if (!ids.has(item.action.value) && ids.size >= 8) { props.onError?.(new Error('每条消息最多引用 8 个插件，请先移除已有引用')); return }
      reference = miraPluginReference(item.action.value, item.label, catalogs.plugins.items.find(plugin => plugin.id === item.action.value)?.listing?.icon)
    }
    if (item.action.type === 'agent') reference = Object.prototype.hasOwnProperty.call(MIRA_SUBTASK_AGENTS, item.action.value) ? miraAgentReference(item.action.value as HarnessSubtaskRole) : catalogs.userAgents.items.some(agent => agent.name === item.action.value) ? miraUserAgentReference(item.action.value) : miraPluginAgentReference(item.action.value)
    if (item.action.type === 'plugin-command') reference = miraPluginCommandReference(item.action.value)
    if (item.action.type === 'prompt-command') reference = { id: crypto.randomUUID(), kind: 'command', label: item.label, value: item.action.value, text: `/${item.action.value}` }
    if (item.action.type === 'file' || item.action.type === 'session') {
      request.current = true; setReading(true)
      const version = revision.current, text = props.text
      const current = () => mounted.current && controller.getSnapshot().session?.id === sessionId
      try {
        if (item.action.type === 'file') {
          const file = await onAddFile(item.action.value, item.label)
          if (!file || !current()) return
          reference = { id: crypto.randomUUID(), kind: 'file', label: item.label, value: file.path, text: `@${item.action.value}` }
        } else {
          const referenced = await controller.getSession(item.action.value)
          reference = { id: crypto.randomUUID(), kind: 'session', label: item.label, value: item.action.value, text: formatMiraConversationReference(referenced) }
        }
        if (!current()) return
        if (version !== revision.current || currentText.current !== text) { props.onError?.(new Error('读取引用期间正文已修改，请重新选择；已有附件保留。')); return }
      } catch (cause) { if (current()) props.onError?.(cause instanceof Error ? cause : new Error('引用读取失败，请重试。')); return }
      finally { request.current = false; if (mounted.current) setReading(false) }
    }
    if (reference) { replace(range, [{ type: 'reference', reference }, { type: 'text', text: ' ' }]); close() }
  }
  const key = (event: KeyboardEvent) => {
    // Radix consumes Escape in document capture before Lexical receives it.
    if (event.defaultPrevented) return
    if (event.isComposing || event.keyCode === 229 || event.key === 'Enter' && event.shiftKey) return
    if (open && ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { const next = nextMiraSuggestionIndex(selectedIndex, event.key === 'ArrowDown' ? 1 : -1, items, kind !== '/'); setHighlighted(items[next]?.id) }
      else if (event.key === 'Escape') close()
      else if (items[selectedIndex]) void select(items[selectedIndex]); else { props.onKeyDown?.(event); return }
      event.preventDefault(); event.stopPropagation(); return
    }
    props.onKeyDown?.(event)
  }
  return <Popover.Root open={open} onOpenChange={next => { if (!next) close() }}>
    <Popover.Anchor virtualRef={anchor} /><div><MiraPromptEditor {...props} ref={editor} onFocusChange={value => { setFocused(value); if (!value) { setTokenSnapshot(null); setDismissed('') } props.onFocusChange?.(value) }} onSelectionChange={range => {
      // Preserve the discovered query while reconciling queued selection-only movements.
      setTokenSnapshot(current => {
        const previous = current?.owner === sessionId && current.text === props.text ? current.token : token
        const next = previous ? range.start === range.end && range.start > previous.start && range.start <= previous.end ? previous : null : findMiraPromptToken(props.text, range.start, range.end)
        return { owner: sessionId, text: props.text, token: next }
      })
      setCaret(range); props.onSelectionChange?.(range)
    }} onChange={(document, range) => { revision.current++; setActionOpen(false); setTokenSnapshot(null); setCaret(range); setDismissed(''); props.onChange(document, range) }} onKeyDown={key} aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && items[selectedIndex] ? `${listId}-${items[selectedIndex].id}` : undefined} /></div>
    <Popover.Portal container={document.getElementById('root')}><Popover.Content ref={panel} className="mira-composer-panel-popover" side="top" align="start" sideOffset={4} collisionPadding={12} onOpenAutoFocus={event => { event.preventDefault(); if (actionOpen) panel.current?.focus() }} tabIndex={-1} onKeyDown={event => { if (actionOpen) key(event.nativeEvent) }} onCloseAutoFocus={event => event.preventDefault()} onInteractOutside={event => { if (editor.current?.getElement()?.contains(event.target as Node) || (event.target as HTMLElement).closest?.('[aria-label="添加"]')) event.preventDefault() }} onEscapeKeyDown={event => { event.preventDefault(); if (!event.isComposing && event.keyCode !== 229) close() }}>
      <ComposerSuggestionPanel actionMenu={actionOpen} listId={listId} hasQuery={Boolean(query)} sections={visibleSections} selectedIndex={selectedIndex} onHighlight={index => setHighlighted(items[index]?.id)} onSelect={item => void select(item)} onTrigger={openTrigger} />
    </Popover.Content></Popover.Portal>
  </Popover.Root>
})
