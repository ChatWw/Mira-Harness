// Interaction structure references ZCode ModelTrajectoryPane (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd.; Mira uses its own local provider records and host bridge.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, Copy, FolderOpen, LoaderCircle, RefreshCw, Search, Settings2, X } from 'lucide-react'
import type { MiraModelTrace } from '../../../../../src/config/miraModelTrace'
import { miraCallSource, miraTraceCalls, miraTraceMessageRoles, miraTraceRole, miraTraceSummary, miraTraceTextMatches, type MiraTraceRole } from '../../lib/mira-model-trace'
import type { PilotController } from '../../state/pilot-state'

const initialRoles: Record<MiraTraceRole, boolean> = { system: true, user: true, reasoning: true, assistant: true, 'tool-call': true, 'tool-result': true, options: false, usage: false, error: true }
const statuses = { running: '响应未记录', completed: '完成', failed: '失败', aborted: '已停止' }
function Highlight({ text, offsets = [], activeStart }: { text: string; offsets?: Array<{ start: number; end: number }>; activeStart?: number }) {
  let cursor = 0
  const parts: ReactNode[] = []
  for (const { start, end } of offsets) { parts.push(text.slice(cursor, start), <mark key={start} data-trace-match-active={start === activeStart}>{text.slice(start, end)}</mark>); cursor = end }
  return <span>{parts}{text.slice(cursor)}</span>
}

export function MiraModelTracePane({ controller, sessionId, title, active }: { controller: PilotController; sessionId: string; title?: string; active: boolean }) {
  const [data, setData] = useState<MiraModelTrace>(), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [roles, setRoles] = useState(initialRoles), [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [fullRequests, setFullRequests] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ sectionId: string; message: string; error: boolean }>()
  const copyVersion = useRef(0)
  const [searchOpen, setSearchOpen] = useState(false), [query, setQuery] = useState(''), [match, setMatch] = useState(0)
  const revision = useRef(0), mounted = useRef(true), root = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const deferredQuery = useDeferredValue(query.trim())
  const needle = searchOpen ? deferredQuery : ''
  const calls = useMemo(() => miraTraceCalls(data?.records || [], fullRequests), [data, fullRequests])
  const summary = useMemo(() => miraTraceSummary(data?.records || []), [data])
  const searchSections = useMemo(() => new Map(calls.flatMap((call, callIndex) => call.sections.map(section => [section.id, { callIndex, title: miraTraceTextMatches(section.title, needle), text: miraTraceTextMatches(section.text, needle) }] as const))), [calls, needle])
  const matches = useMemo(() => Array.from(searchSections).flatMap(([sectionId, fields]) => (['title', 'text'] as const).flatMap(field => fields[field].map(offset => ({ sectionId, callIndex: fields.callIndex, field, ...offset })))), [searchSections])
  const currentMatch = matches.length ? Math.min(match, matches.length - 1) : -1
  const selectedMatch = matches[currentMatch]
  const getItemKey = useCallback((index: number) => calls[index].record.id, [calls])
  const virtualizer = useVirtualizer({ count: calls.length, getScrollElement: () => body.current, getItemKey, estimateSize: () => 240, overscan: 3, enabled: active })
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = needle ? () => false : undefined
  const rows = virtualizer.getVirtualItems()
  const mountedRows = rows.map(row => row.key).join('|')
  async function refresh() {
    const token = ++revision.current
    setLoading(true); setError('')
    try {
      const next = await controller.readModelTraceFor(sessionId)
      if (mounted.current && token === revision.current) { setData(next); setMatch(0) }
    } catch (cause) { if (mounted.current && token === revision.current) setError(cause instanceof Error ? cause.message : '模型轨迹读取失败，请刷新重试') }
    finally { if (mounted.current && token === revision.current) setLoading(false) }
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++ } }, [])
  useEffect(() => { if (active) void refresh(); else { revision.current++; setLoading(false) } }, [controller, sessionId, active])
  useEffect(() => { setFeedback(undefined); setCategoriesOpen(false); return () => { copyVersion.current++ } }, [sessionId, active])
  useEffect(() => {
    if (!feedback || feedback.error) return
    const timer = window.setTimeout(() => setFeedback(previous => previous === feedback ? undefined : previous), 1800)
    return () => window.clearTimeout(timer)
  }, [feedback])
  useEffect(() => { if (searchOpen && active) search.current?.focus() }, [searchOpen, active])
  useEffect(() => {
    if (active && selectedMatch && !root.current?.querySelector('mark[data-trace-match-active="true"]')) virtualizer.scrollToIndex(selectedMatch.callIndex, { align: 'center' })
  }, [selectedMatch, active, virtualizer])
  useEffect(() => {
    if (!active || !selectedMatch) return
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      root.current?.querySelectorAll<HTMLElement>('[data-trace-call]').forEach(element => virtualizer.measureElement(element))
      secondFrame = requestAnimationFrame(() => {
        const mark = root.current?.querySelector<HTMLElement>('mark[data-trace-match-active="true"]'), view = body.current
        if (mark && view) { const target = mark.getBoundingClientRect(), viewport = view.getBoundingClientRect(); virtualizer.scrollToOffset(Math.max(0, view.scrollTop + target.top + target.height / 2 - viewport.top - viewport.height / 2)) }
      })
    })
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame) }
  }, [selectedMatch, mountedRows, active, virtualizer])
  useEffect(() => { virtualizer.measure() }, [fullRequests, virtualizer])
  const allExpanded = miraTraceMessageRoles.every(role => roles[role])
  async function copySection(sectionId: string, text: string) {
    const version = ++copyVersion.current
    try {
      if (!navigator.clipboard?.writeText) throw new Error('剪贴板暂不可用')
      await navigator.clipboard.writeText(text)
      if (mounted.current && version === copyVersion.current) setFeedback({ sectionId, message: '已复制', error: false })
    } catch {
      if (mounted.current && version === copyVersion.current) setFeedback({ sectionId, message: '复制失败，请重试。', error: true })
    }
  }
  const moveMatch = (step: number) => { if (matches.length) setMatch((Math.max(0, currentMatch) + step + matches.length) % matches.length) }
  return <div className="mira-model-trace" ref={root} aria-label="模型轨迹" aria-busy={loading}>
    <div className="mira-model-trace__toolbar">
      <strong title={title || '模型轨迹'}>{title?.trim() || '模型轨迹'}</strong>
      <div className="mira-model-trace__actions">
        {calls.length > 0 && <><button type="button" aria-label="搜索模型轨迹" title="搜索模型轨迹" aria-pressed={searchOpen} disabled={!active} onClick={() => { setSearchOpen(true); search.current?.focus(); search.current?.select() }}><Search size={15} /></button>
        <DropdownMenu.Root open={active && categoriesOpen} onOpenChange={open => setCategoriesOpen(active && open)}><DropdownMenu.Trigger asChild><button type="button" aria-label="按内容类型展开或折叠" title="按内容类型展开或折叠" disabled={!active}><Settings2 size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="mira-session-menu mira-model-trace__menu" align="end" sideOffset={5}>
          <DropdownMenu.CheckboxItem className="mira-session-menu__item" checked={fullRequests} onSelect={event => event.preventDefault()} onCheckedChange={checked => { setFullRequests(checked); setMatch(0) }}>显示完整请求上下文<DropdownMenu.ItemIndicator><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator className="mira-session-menu__separator" />
          {(Object.keys(miraTraceRole) as MiraTraceRole[]).map(role => <DropdownMenu.CheckboxItem key={role} className="mira-session-menu__item" checked={roles[role]} onSelect={event => event.preventDefault()} onCheckedChange={checked => { setRoles(value => ({ ...value, [role]: checked })); setOverrides(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !calls.some(call => call.sections.some(section => section.id === id && section.role === role))))) }}>{miraTraceRole[role]}<span aria-hidden="true" className="mira-model-trace__category-switch" data-checked={roles[role]} /></DropdownMenu.CheckboxItem>)}
        </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
        <button type="button" aria-label={allExpanded ? '全部折叠' : '全部展开'} title={allExpanded ? '全部折叠' : '全部展开'} disabled={!active} onClick={() => { setRoles(Object.fromEntries(Object.keys(roles).map(role => [role, !allExpanded])) as typeof roles); setOverrides({}) }}>{allExpanded ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}</button></>}
        <button type="button" aria-label="打开模型轨迹目录" title="打开本地记录目录" disabled={!active} onClick={() => { void controller.openModelTraceDirectoryFor(sessionId).catch(cause => { if (mounted.current) setError(cause instanceof Error ? cause.message : '目录打开失败，请重试') }) }}><FolderOpen size={15} /></button>
        <button type="button" aria-label="刷新模型轨迹" title="刷新模型轨迹" disabled={!active || loading} onClick={() => void refresh()}>{loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}</button>
      </div>
      {calls.length > 0 && <div className="mira-model-trace__summary"><span>{calls.length} 次调用</span>{summary.tokens > 0 && <span title="已记录调用的实际总用量">· {summary.tokens.toLocaleString()} tok</span>}{summary.models.length > 0 && <span title={summary.models.join(', ')}>· {summary.models.join(', ')}</span>}</div>}
    </div>
    {searchOpen && <div className="mira-model-trace__search"><Search size={14} /><input ref={search} aria-label="查找模型请求与响应" placeholder="查找请求、响应或工具" value={query} disabled={!active} onChange={event => { setQuery(event.target.value); setMatch(0) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1) }; if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setSearchOpen(false); setQuery('') } }} /><span role="status">{needle ? `${currentMatch + 1}/${matches.length}` : ''}</span><button type="button" aria-label="上一个轨迹匹配" disabled={!matches.length} onClick={() => moveMatch(-1)}><ChevronUp size={14} /></button><button type="button" aria-label="下一个轨迹匹配" disabled={!matches.length} onClick={() => moveMatch(1)}><ChevronDown size={14} /></button><button type="button" aria-label="关闭轨迹查找" onClick={() => { setSearchOpen(false); setQuery('') }}><X size={14} /></button></div>}
    {error && <div className="mira-model-trace__notice" role="alert">{error}<button type="button" disabled={loading} onClick={() => void refresh()}>重试</button></div>}
    {data?.warning && <div className="mira-model-trace__notice" role="status">{data.warning}</div>}
    {data?.truncated && <div className="mira-model-trace__notice">仅显示最近记录，最多 200 次调用；完整记录可在本地目录查看。</div>}
    <div className="mira-model-trace__body" ref={body}>
      {!calls.length && <div className="mira-model-trace__empty"><strong>{loading ? '正在读取模型轨迹' : error ? '模型轨迹暂不可用' : '尚无模型调用记录'}</strong><p>{loading ? '正在读取这个任务的本地记录。' : '发送新任务后会记录实际请求与响应；旧对话不会补造轨迹。'}</p></div>}
      {rows[0]?.start > 0 && <div aria-hidden="true" style={{ height: rows[0].start }} />}
      {rows.map(row => { const { record, sections, omittedInputs } = calls[row.index]; return <article key={record.id} ref={virtualizer.measureElement} data-index={row.index} className="mira-model-trace__call" data-trace-call={record.id}>
        <header><strong>{row.index + 1} · {miraCallSource[record.source] || '模型调用'}</strong><span data-state={record.status}>{statuses[record.status] || '未知状态'}</span></header>
        <div className="mira-model-trace__metadata"><span title={`${record.providerName} / ${record.modelId}`}>{record.providerName} / {record.modelId}</span><time dateTime={new Date(record.startedAt).toISOString()}>{new Date(record.startedAt).toLocaleTimeString('zh-CN', { hour12: false })}</time>{record.completedAt && <span>{Math.max(0, record.completedAt - record.startedAt).toLocaleString()} ms</span>}</div>
        {!record.request && <div className="mira-model-trace__notice">请求未记录或已超出读取范围。</div>}
        {omittedInputs > 0 && <div className="mira-model-trace__notice">已省略 {omittedInputs} 条前序消息；菜单中可查看完整请求上下文。</div>}
        {sections.map(section => { const selected = selectedMatch?.sectionId === section.id, expanded = selected || (overrides[section.id] ?? roles[section.role]); return <details key={section.id} data-trace-section={section.id} data-role={section.role} data-search-active={selected} open={expanded} onToggle={event => { const open = event.currentTarget.open; if (selected && !open) { event.currentTarget.open = true; return }; if (open !== expanded) setOverrides(previous => ({ ...previous, [section.id]: open })) }}>
          <summary><ChevronDown size={13} /><Highlight text={section.title} offsets={searchSections.get(section.id)?.title} activeStart={selectedMatch?.sectionId === section.id && selectedMatch.field === 'title' ? selectedMatch.start : undefined} /><small>{section.text.length.toLocaleString()} 字符</small></summary>
          {expanded && <><pre><Highlight text={section.text} offsets={searchSections.get(section.id)?.text} activeStart={selectedMatch?.sectionId === section.id && selectedMatch.field === 'text' ? selectedMatch.start : undefined} /></pre><div className="mira-model-trace__section-actions">{feedback?.sectionId === section.id && <span className="mira-model-trace__feedback" role={feedback.error ? 'alert' : 'status'}>{feedback.message}</span>}<button type="button" aria-label={`复制${section.title}`} title={feedback?.sectionId === section.id && !feedback.error ? '已复制' : '复制内容'} disabled={!active || !section.text} onClick={() => void copySection(section.id, section.text)}>{feedback?.sectionId === section.id && !feedback.error ? <Check size={14} /> : <Copy size={14} />}</button></div></>}
        </details>})}
      </article>})}
      {rows.length > 0 && <div aria-hidden="true" style={{ height: Math.max(0, virtualizer.getTotalSize() - rows[rows.length - 1].end) }} />}
    </div>
  </div>
}
