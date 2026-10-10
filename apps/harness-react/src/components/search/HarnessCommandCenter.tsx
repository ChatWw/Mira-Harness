/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation: first-party commands, message-content search and session-scoped file search.
 * Structural reference: ZCode CommandCenterDialog; license: third-party-licenses/zcode/.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, ChevronDown, Command, File, ListFilter, LoaderCircle, MessageSquare, RefreshCw, Search, Trash2, X } from 'lucide-react'
import type { HarnessConversationSearchResult, HarnessSession, HarnessWorkspaceFileSearchResult } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { harnessSearchHighlight, matchesHarnessCommand, parseHarnessSearch, setHarnessSearchScope, type HarnessSearchScope } from './command-center-query'
import { HarnessSearchHistoryStore } from './command-center-history'
import './command-center.css'

export interface HarnessSearchCommand {
  id: string
  label: string
  description?: string
  keywords?: string
  shortcut?: string
  icon?: ReactNode
  action: () => void | boolean | Promise<void | boolean>
}

export interface HarnessCommandCenterProps {
  open: boolean
  focusRequest?: number
  onOpenChange: (open: boolean) => void
  onDismiss?: () => boolean
  controller: Pick<PilotController, 'searchConversations' | 'searchFilesFor' | 'getPreference' | 'setPreference'>
  session?: Pick<HarnessSession, 'id' | 'workingDirectory' | 'projectId'>
  commands: HarnessSearchCommand[]
  onOpenSession: (result: HarnessConversationSearchResult) => void | boolean | Promise<void | boolean>
  onOpenFile: (sessionId: string, path: string) => void | boolean | Promise<void | boolean>
}

type SearchStatus<T> = { items: T[]; loading: boolean; error: string; truncated?: boolean }
type SearchData = {
  key: string
  conversations: SearchStatus<HarnessConversationSearchResult>
  files: SearchStatus<HarnessWorkspaceFileSearchResult['entries'][number]>
}
type Result = { id: string; label: string; description?: string; shortcut?: string; icon: ReactNode; scope: HarnessSearchScope; action: () => void | boolean | Promise<void | boolean> }
const SCOPES: Array<{ id: HarnessSearchScope; label: string; icon: typeof Search }> = [
  { id: 'all', label: '全部', icon: Search }, { id: 'commands', label: '命令', icon: Command },
  { id: 'conversations', label: '对话', icon: MessageSquare }, { id: 'files', label: '文件', icon: File },
]

export function HarnessCommandCenter({ open, focusRequest, onOpenChange, onDismiss, controller, session, commands, onOpenSession, onOpenFile }: HarnessCommandCenterProps) {
  const [rawQuery, setRawQuery] = useState('')
  const [search, setSearch] = useState<SearchData>()
  const [retry, setRetry] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const actionPending = useRef(false)
  const { query, scope } = parseHarnessSearch(rawQuery)
  const sessionId = session?.id
  const workingDirectory = session?.workingDirectory
  const workspaceKey = workingDirectory ? `directory:${workingDirectory}` : session?.projectId ? `project:${session.projectId}` : 'unscoped'
  const histories = useMemo(() => new Map<string, HarnessSearchHistoryStore>(), [controller])
  const history = histories.get(workspaceKey) ?? new HarnessSearchHistoryStore(controller, workspaceKey)
  histories.set(workspaceKey, history)
  const historyState = useSyncExternalStore(history.subscribe, history.getSnapshot)
  const key = JSON.stringify([open, query, scope, sessionId, workingDirectory, retry])
  const currentKey = useRef(key)
  currentKey.current = key
  const lifetime = useRef(0)
  const focusCycle = useRef<{ target?: HTMLElement; dismissed: boolean } | undefined>(undefined)
  const openRef = useRef(false)
  const mounted = useRef(false)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  if (open && !openRef.current) focusCycle.current = { dismissed: false }
  openRef.current = open
  const opening = focusCycle.current
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (open && focusRequest) input.current?.focus() }, [open, focusRequest])

  useEffect(() => {
    const generation = ++lifetime.current
    setRawQuery(''); setSelectedId(''); setActionError(''); setBusyId(''); setHistoryExpanded(false)
    return () => { if (lifetime.current === generation) lifetime.current++ }
  }, [open])

  useEffect(() => { if (open) void history.load().catch(() => undefined) }, [open, history])

  useEffect(() => {
    if (!open || !query) { setSearch(undefined); return }
    let active = true
    const includeConversations = scope === 'all' || scope === 'conversations'
    const includeFiles = (scope === 'all' || scope === 'files') && Boolean(sessionId && workingDirectory)
    setSearch({ key, conversations: { items: [], loading: includeConversations, error: '' }, files: { items: [], loading: includeFiles, error: '' } })
    const isCurrent = () => active && currentKey.current === key
    const timer = window.setTimeout(() => {
      if (includeConversations) void controller.searchConversations(query).then(items => {
        if (isCurrent()) setSearch(previous => previous?.key === key ? { ...previous, conversations: { items, loading: false, error: '' } } : previous)
      }, cause => {
        if (isCurrent()) setSearch(previous => previous?.key === key ? { ...previous, conversations: { items: [], loading: false, error: errorMessage(cause) } } : previous)
      })
      if (includeFiles) void controller.searchFilesFor(sessionId!, query).then(result => {
        if (isCurrent()) setSearch(previous => previous?.key === key ? { ...previous, files: { items: result.entries.filter(entry => entry.type === 'file'), loading: false, error: '', truncated: result.truncated } } : previous)
      }, cause => {
        if (isCurrent()) setSearch(previous => previous?.key === key ? { ...previous, files: { items: [], loading: false, error: errorMessage(cause) } } : previous)
      })
    }, 120)
    return () => { active = false; window.clearTimeout(timer) }
  }, [open, controller, key, query, scope, sessionId, workingDirectory])

  const currentSearch = search?.key === key ? search : undefined
  const sections: Array<{ id: string; title: string; items: Result[]; status?: SearchStatus<unknown>; empty?: string }> = []
  if (scope === 'all' || scope === 'commands') sections.push({ id: 'commands', title: '命令', items: commands.filter(command => matchesHarnessCommand(command, query)).map(command => ({ ...command, id: `command:${command.id}`, scope: 'commands', icon: command.icon ?? <Command size={16} /> })) })
  if (query && (scope === 'all' || scope === 'conversations')) sections.push({ id: 'conversations', title: '对话', status: currentSearch?.conversations, items: (currentSearch?.conversations.items ?? []).map(result => ({ id: `conversation:${result.id}:${result.messageId ?? ''}`, label: result.title || '未命名对话', description: result.snippet || result.projectName, icon: <MessageSquare size={16} />, scope: 'conversations', action: () => onOpenSession(result) })) })
  if (query && (scope === 'all' || scope === 'files')) sections.push({ id: 'files', title: '当前项目文件', status: currentSearch?.files, empty: sessionId && workingDirectory ? undefined : '当前会话未关联工作目录', items: (currentSearch?.files.items ?? []).map(entry => ({ id: `file:${entry.path}`, label: entry.name, description: entry.path, icon: <File size={16} />, scope: 'files', action: () => onOpenFile(sessionId!, entry.path) })) })
  const results = sections.flatMap(section => section.items)
  const selectedIndex = Math.max(0, results.findIndex(result => result.id === selectedId))
  const selected = results[selectedIndex]
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [selected?.id])

  async function select(result: Result) {
    if (actionPending.current || !open || currentKey.current !== key || !results.some(item => item.id === result.id)) return
    const generation = lifetime.current
    actionPending.current = true
    setBusyId(result.id); setActionError('')
    try {
      const performed = await result.action()
      if (performed === false) return
      history.remember(query, result.scope)
      if (lifetime.current === generation) onOpenChange(false)
    } catch (cause) { if (lifetime.current === generation) setActionError(errorMessage(cause)) }
    finally {
      actionPending.current = false
      if (lifetime.current === generation) setBusyId('')
    }
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') { event.stopPropagation(); return }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Enter') return
    event.preventDefault(); event.stopPropagation()
    if (!results.length || actionPending.current) return
    if (event.key === 'Enter') { void select(selected!); return }
    const next = (selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
    setSelectedId(results[next]!.id)
  }

  return <Dialog.Root open={open} onOpenChange={next => { if (!next && opening) opening.dismissed = true; onOpenChange(next) }}>
    <Dialog.Portal>
      <Dialog.Overlay className="mira-command-center-overlay" />
      <Dialog.Content className="mira-command-center" aria-describedby={undefined} onOpenAutoFocus={event => {
        event.preventDefault()
        if (opening && !opening.target) opening.target = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
        input.current?.focus()
      }} onCloseAutoFocus={event => {
        event.preventDefault()
        const target = opening?.target
        if (!mounted.current || openRef.current || focusCycle.current !== opening || !opening?.dismissed) return
        const doc = target?.ownerDocument ?? document
        if (doc.activeElement !== doc.body && doc.activeElement !== doc.documentElement && doc.activeElement !== target) return
        opening.dismissed = false
        if (dismiss.current?.()) return
        if (!target?.isConnected || target.closest('[hidden], [inert], [aria-hidden="true"]') || target.matches(':disabled, [aria-disabled="true"]')) return
        target.focus({ preventScroll: true })
      }} onEscapeKeyDown={event => event.stopPropagation()}>
        <Dialog.Title className="mira-command-center-sr-only">全局搜索</Dialog.Title>
        <div className="mira-command-center-input"><Search size={18} aria-hidden="true" /><input ref={input} value={rawQuery} onChange={event => { setRawQuery(event.target.value); setSelectedId(''); setActionError('') }} onKeyDown={handleKey} type="text" role="combobox" aria-label="搜索命令、对话和文件" aria-expanded="true" aria-controls="mira-command-results" aria-autocomplete="list" aria-activedescendant={selected ? `mira-command-option-${selectedIndex}` : undefined} placeholder="搜索命令、对话和文件" autoComplete="off" spellCheck={false} /><Dialog.Close className="mira-command-center-close" aria-label="关闭全局搜索" title="关闭全局搜索"><X size={16} /></Dialog.Close></div>
        <div className="mira-command-center-scopes" role="group" aria-label="搜索范围">{SCOPES.map(item => <button key={item.id} type="button" aria-pressed={scope === item.id} onClick={() => { setRawQuery(setHarnessSearchScope(rawQuery, item.id)); setSelectedId(''); input.current?.focus() }}><item.icon size={13} aria-hidden="true" />{item.label}</button>)}</div>
        <div ref={list} id="mira-command-results" className="mira-command-center-results" role="listbox" aria-label="搜索结果" aria-busy={Boolean(currentSearch?.conversations.loading || currentSearch?.files.loading || busyId)}>
          {!query && scope !== 'all' && scope !== 'commands' && <p className="mira-command-center-status">尚未输入关键词</p>}
          {sections.map(section => <div key={section.id} role="group" aria-label={section.title}>
            <div className="mira-command-center-section"><span>{section.title}</span>{section.id === 'files' && workingDirectory && <small title={workingDirectory}>{workingDirectory}</small>}</div>
            {section.status?.loading && <p className="mira-command-center-status" role="status"><LoaderCircle size={14} className="mira-command-center-spin" aria-hidden="true" />正在搜索…</p>}
            {section.status?.error && <div className="mira-command-center-error" role="alert"><span>{section.status.error}</span><button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={13} aria-hidden="true" />重试</button></div>}
            {!section.items.length && !section.status?.loading && !section.status?.error && <p className="mira-command-center-status">{section.empty ?? '没有匹配结果'}</p>}
            {section.items.map(result => {
              const index = results.indexOf(result)
              return <button type="button" key={result.id} id={`mira-command-option-${index}`} className="mira-command-center-result" role="option" aria-selected={index === selectedIndex} tabIndex={-1} disabled={Boolean(busyId)} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setSelectedId(result.id)} onClick={() => { void select(result) }} title={result.description ?? result.label}>
                <span className="mira-command-center-result-icon">{busyId === result.id ? <LoaderCircle size={16} className="mira-command-center-spin" /> : result.icon}</span><span className="mira-command-center-result-text"><span><HighlightedText text={result.label} query={query} /></span>{result.description && <small><HighlightedText text={result.description} query={query} /></small>}</span>{result.shortcut ? <kbd>{result.shortcut}</kbd> : <ArrowRight size={13} className="mira-command-center-result-arrow" aria-hidden="true" />}
              </button>
            })}
            {section.status?.truncated && <p className="mira-command-center-status"><ListFilter size={13} aria-hidden="true" />结果较多，请缩小搜索范围</p>}
          </div>)}
        </div>
        {!query && (historyState.entries.length > 0 || historyState.error) && <section className="mira-command-center-history" aria-label="搜索历史">
          <div className="mira-command-center-history-heading"><span>搜索历史</span><button type="button" aria-label="清空搜索历史" title="清空搜索历史" onClick={() => history.clear()}><Trash2 size={14} aria-hidden="true" /></button>{historyState.entries.length > 6 && <button type="button" aria-label={historyExpanded ? '收起搜索历史' : '展开搜索历史'} title={historyExpanded ? '收起搜索历史' : '展开搜索历史'} aria-expanded={historyExpanded} onClick={() => setHistoryExpanded(value => !value)}><ChevronDown size={14} aria-hidden="true" style={historyExpanded ? { transform: 'rotate(180deg)' } : undefined} /></button>}</div>
          <div className="mira-command-center-history-chips" data-expanded={historyExpanded}>{(historyExpanded ? historyState.entries : historyState.entries.slice(0, 6)).map(entry => <button type="button" key={entry.query.toLocaleLowerCase()} aria-label={`搜索历史：${setHarnessSearchScope(entry.query, entry.scope)}`} title={setHarnessSearchScope(entry.query, entry.scope)} onClick={() => { setRawQuery(setHarnessSearchScope(entry.query, entry.scope)); setSelectedId(''); setActionError(''); input.current?.focus() }}><span>{entry.scope === 'all' ? '' : setHarnessSearchScope('', entry.scope).trim()}</span><span>{entry.query}</span></button>)}</div>
          {historyState.error && <div className="mira-command-center-error" role="status"><span>{historyState.error}</span><button type="button" onClick={() => { void history.retry().catch(() => undefined) }}><RefreshCw size={13} aria-hidden="true" />重试历史记录</button></div>}
        </section>}
        {actionError && <div className="mira-command-center-error" role="alert"><span>{actionError}</span></div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  return <>{harnessSearchHighlight(text, query).map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : part.text)}</>
}
function errorMessage(cause: unknown) { return cause instanceof Error ? cause.message : '搜索操作失败，请重试' }
