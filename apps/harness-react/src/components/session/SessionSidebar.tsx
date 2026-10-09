import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Archive, ArrowDownWideNarrow, Blocks, CalendarClock, Check, ChevronRight, CircleAlert, Copy, Folder, FolderOpen, GripVertical, Hash, LoaderCircle, MessageCirclePlus, MoreHorizontal, Pencil, Pin, PinOff, Search, TerminalSquare, Trash2, X } from 'lucide-react'
import type { HarnessProject, HarnessSessionOrderScope, HarnessSessionSummary } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { groupSessions, sessionBadge, sessionMarkdown, splitSessionQueues } from './session-groups'

const PROJECT_LIMIT = 6
const SESSION_LIMIT = 12
const PROJECT_SESSION_LIMIT = 5
const EXPANDED_PROJECTS_KEY = 'session-drawer'
type DrawerPreference = { expandedProjectIds?: string[]; view?: 'group' | 'project' }
type GroupId = 'pinned' | 'recent' | `project:${string}`

export interface SessionDrawerProps {
  state: ReturnType<PilotController['getSnapshot']>
  controller: PilotController
  width: number
  modal?: boolean
  newTaskOpen?: boolean
  onToggleNewTask?: () => void
  onNewConversation?: () => void
  searchRequest?: number
  onClose: () => void
}

/** Keep app shortcuts mounted with the workbench, including when its sidebar is closed. */
export function useHarnessSessionShortcuts(onNewConversation: () => void, onSearch: () => void) {
  const actions = useRef({ onNewConversation, onSearch })
  actions.current = { onNewConversation, onSearch }
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing) return
      const key = event.key.toLowerCase()
      if (key !== 'n' && key !== 'k') return
      event.preventDefault()
      if (key === 'n') actions.current.onNewConversation()
      else actions.current.onSearch()
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])
}

export function SessionSidebar({ state, controller, width, modal, onNewConversation, searchRequest, onClose }: SessionDrawerProps) {
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([])
  const [view, setView] = useState<'group' | 'project'>('group')
  const [sort, setSort] = useState<'manual' | 'updated'>('updated')
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [extendedGroups, setExtendedGroups] = useState<Record<string, boolean>>({})
  const [renamingId, setRenamingId] = useState('')
  const [preferenceLoaded, setPreferenceLoaded] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const activeProjectId = state.session?.projectId
  const commandKey = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl '
  const newTask = () => { if (onNewConversation) onNewConversation(); else controller.newConversation() }

  useEffect(() => {
    let cancelled = false
    void controller.getPreference(EXPANDED_PROJECTS_KEY).then(value => {
      if (cancelled) return
      const saved = value as DrawerPreference | null
      if (Array.isArray(saved?.expandedProjectIds)) setExpandedProjectIds(previous => [...new Set([...saved.expandedProjectIds!.filter(id => typeof id === 'string'), ...previous])])
      if (saved?.view === 'group' || saved?.view === 'project') setView(saved.view)
    }).catch(() => undefined).finally(() => { if (!cancelled) setPreferenceLoaded(true) })
    return () => { cancelled = true }
  }, [controller])
  useEffect(() => { if (preferenceLoaded) void controller.setPreference(EXPANDED_PROJECTS_KEY, { expandedProjectIds, view }) }, [controller, expandedProjectIds, view, preferenceLoaded])
  useEffect(() => { if (activeProjectId) setExpandedProjectIds(previous => previous.includes(activeProjectId) ? previous : [...previous, activeProjectId]) }, [activeProjectId])
  useEffect(() => {
    if (!searchRequest) return
    setSearchOpen(true)
    searchRef.current?.focus()
  }, [searchRequest])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const model = useMemo(() => groupSessions(state.sessions, state.projects), [state.sessions, state.projects])
  const queues = useMemo(() => splitSessionQueues(model, state.runningSessionIds, Object.keys(state.pendingPermissions)), [model, state.runningSessionIds, state.pendingPermissions])
  const query = search.trim().toLocaleLowerCase()
  const matches = (session: HarnessSessionSummary) => !query || `${session.title} ${session.projectName || ''}`.toLocaleLowerCase().includes(query)
  const ordered = (sessions: HarnessSessionSummary[]) => sort === 'updated' ? [...sessions].sort((left, right) => right.updatedAt - left.updatedAt) : sessions
  const pinned = ordered(model.pinned.filter(matches))
  const attention = ordered(queues.attention.filter(matches))
  const running = ordered(queues.running.filter(matches))
  const recent = ordered([...queues.projects.flatMap(entry => entry.sessions), ...queues.recent].filter(matches))
  const allProjects = queues.projects.map(entry => ({ ...entry, sessions: ordered(entry.sessions.filter(matches)) })).filter(entry => !query || entry.sessions.length > 0 || entry.project.name.toLocaleLowerCase().includes(query))
  const projects = query || showAllProjects ? allProjects : allProjects.slice(0, PROJECT_LIMIT)
  const sortable = sort === 'manual' && !query
  const groupOf = (id: string): GroupId | undefined => {
    if (model.pinned.some(item => item.id === id)) return 'pinned'
    if (model.recent.some(item => item.id === id)) return 'recent'
    const project = model.projects.find(entry => entry.sessions.some(item => item.id === id))
    return project ? `project:${project.project.id}` : undefined
  }
  const idsOf = (group: GroupId) => group === 'pinned' ? model.pinned.map(item => item.id) : group === 'recent' ? model.recent.map(item => item.id) : model.projects.find(entry => `project:${entry.project.id}` === group)?.sessions.map(item => item.id) || []
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!sortable || !over || active.id === over.id) return
    const group = groupOf(String(active.id))
    if (!group || group !== groupOf(String(over.id))) return
    const ids = idsOf(group)
    const scope: HarnessSessionOrderScope = group === 'pinned' ? { type: 'pinned' } : group === 'recent' ? { type: 'recent' } : { type: 'project', projectId: group.slice('project:'.length) }
    void controller.reorderSessions(scope, arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }
  const rowProps = (session: HarnessSessionSummary) => ({ session, state, controller, sortable, active: session.id === state.session?.id, renaming: renamingId === session.id, onBeginRename: () => setRenamingId(session.id), onRename: (title: string) => { setRenamingId(''); if (title.trim()) void controller.renameSession(session.id, title.trim().slice(0, 42)) }, onCancelRename: () => setRenamingId(''), onOpen: () => { void controller.open(session.id); if (modal) onClose() } })
  const renderRows = (sessions: HarnessSessionSummary[], limit = SESSION_LIMIT) => <SortableContext items={sessions.map(item => item.id)} strategy={verticalListSortingStrategy}>{sessions.slice(0, limit).map(session => <SessionRow key={session.id} {...rowProps(session)} />)}</SortableContext>

  return <aside id="pilot-sessions" className="pilot-nav" style={{ width }} role={modal ? 'dialog' : undefined} aria-modal={modal || undefined} aria-label="会话">
    {modal && <button type="button" className="pilot-drawer__close" aria-label="关闭会话" onClick={onClose}><X size={15} /></button>}
    <nav className="mira-session-actions" aria-label="任务导航">
      <button type="button" onClick={newTask} aria-label="新建任务"><MessageCirclePlus size={17} /><span>新建任务</span><kbd>{commandKey}N</kbd></button>
      <button type="button" onClick={() => { setSearchOpen(value => !value); if (searchOpen) setSearch('') }} aria-label="搜索会话" aria-expanded={searchOpen}><Search size={17} /><span>搜索</span><kbd>{commandKey}K</kbd></button>
      <button type="button" onClick={() => void controller.navigate('/workspace/automations')}><CalendarClock size={17} /><span>自动化</span></button>
      <button type="button" onClick={() => void controller.navigate('/settings/mcp')}><Blocks size={17} /><span>工具与技能</span></button>
    </nav>
    {searchOpen && <div className="mira-session-search"><Search size={14} /><input ref={searchRef} autoFocus value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setSearch(''); setSearchOpen(false) } }} placeholder="搜索任务或项目" aria-label="搜索任务或项目" /><button type="button" title="关闭搜索" aria-label="关闭搜索" onClick={() => { setSearch(''); setSearchOpen(false) }}><X size={13} /></button></div>}
    <div className="mira-session-toolbar">
      <div className="mira-session-view" role="group" aria-label="任务视图"><button type="button" aria-pressed={view === 'group'} onClick={() => setView('group')}><Hash size={13} />分组</button><button type="button" aria-pressed={view === 'project'} onClick={() => setView('project')}><Folder size={13} />项目</button></div>
      <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="mira-session-icon" title="任务排序" aria-label="任务排序"><ArrowDownWideNarrow size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content align="end" sideOffset={6} className="mira-session-menu">
        <DropdownMenu.Label className="mira-session-menu__label">任务排序</DropdownMenu.Label><DropdownMenu.RadioGroup value={sort} onValueChange={value => setSort(value as typeof sort)}>{[{ id: 'updated', label: '最近更新' }, { id: 'manual', label: '手动排序' }].map(option => <DropdownMenu.RadioItem key={option.id} value={option.id} className="mira-session-menu__item"><span className="mira-session-menu__indicator"><DropdownMenu.ItemIndicator><Check size={13} /></DropdownMenu.ItemIndicator></span>{option.label}</DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
      </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
      <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="mira-session-icon" title="归档当前任务" aria-label="归档当前任务"><Archive size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content align="end" sideOffset={6} className="mira-session-menu"><DropdownMenu.Item className="mira-session-menu__item" disabled={!state.session || state.running} onSelect={() => { if (state.session) void controller.archiveSession(state.session.id) }}><Archive size={14} />归档当前任务</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    </div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><div className="mira-session-list">
      {pinned.length > 0 && <GroupSection title="置顶" icon={<Pin size={12} />}>{renderRows(pinned, pinned.length)}</GroupSection>}
      {attention.length > 0 && <GroupSection title="需要处理">{renderRows(attention, attention.length)}</GroupSection>}
      {running.length > 0 && <GroupSection title="运行中">{renderRows(running, running.length)}</GroupSection>}
      {view === 'group' ? <div role="group" aria-label="最近任务">{renderRows(recent, showAllRecent || query ? recent.length : SESSION_LIMIT)}{recent.length > SESSION_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setShowAllRecent(value => !value)}>{showAllRecent ? '收起' : '显示更多'}</button>}</div> : <>
        {projects.map(({ project, sessions }) => {
          const expanded = Boolean(query) || expandedProjectIds.includes(project.id)
          const showAll = Boolean(extendedGroups[project.id])
          return <GroupSection key={project.id} title={project.name} expanded={expanded} onToggle={() => setExpandedProjectIds(previous => previous.includes(project.id) ? previous.filter(id => id !== project.id) : [...previous, project.id])}>{expanded && <>{renderRows(sessions, showAll || query ? sessions.length : PROJECT_SESSION_LIMIT)}{!sessions.length && <p className="mira-session-hint">暂无任务</p>}{sessions.length > PROJECT_SESSION_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setExtendedGroups(previous => ({ ...previous, [project.id]: !previous[project.id] }))}>{showAll ? '收起' : `显示全部 ${sessions.length} 个任务`}</button>}</>}</GroupSection>
        })}
        {allProjects.length > PROJECT_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setShowAllProjects(value => !value)}>{showAllProjects ? '收起项目' : '显示更多项目'}</button>}
        {queues.recent.filter(matches).length > 0 && <GroupSection title="个人工作区">{renderRows(ordered(queues.recent.filter(matches)), showAllRecent || query ? queues.recent.length : SESSION_LIMIT)}{queues.recent.length > SESSION_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setShowAllRecent(value => !value)}>{showAllRecent ? '收起' : '显示更多'}</button>}</GroupSection>}
      </>}
      {query && !pinned.length && !attention.length && !running.length && !recent.length && <p className="mira-session-hint">没有匹配的任务</p>}
      {!query && !state.sessions.length && <p className="mira-session-hint">新建任务后，对话会显示在这里。</p>}
    </div></DndContext>
  </aside>
}

export const SessionDrawer = SessionSidebar

async function copyText(value: string) { try { await navigator.clipboard.writeText(value) } catch { const area = document.createElement('textarea'); area.value = value; document.body.appendChild(area); area.select(); try { document.execCommand('copy') } finally { area.remove() } } }
function GroupSection({ title, icon, expanded, onToggle, children }: { title: string; icon?: ReactNode; expanded?: boolean; onToggle?: () => void; children: ReactNode }) { return <section className="mira-session-group">{onToggle ? <button type="button" className="mira-session-group__head" aria-expanded={expanded} onClick={onToggle}><ChevronRight size={12} className={expanded ? 'is-open' : ''} /><Folder size={13} /><span>{title}</span></button> : <div className="mira-session-group__head">{icon}<span>{title}</span></div>}{children}</section> }
function relativeTime(value: number) { const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000)); return minutes < 1 ? '刚刚' : minutes < 60 ? `${minutes}分` : minutes < 1440 ? `${Math.floor(minutes / 60)}时` : `${Math.floor(minutes / 1440)}天` }

function SessionRow({ session, state, controller, active, sortable, renaming, onBeginRename, onRename, onCancelRename, onOpen }: { session: HarnessSessionSummary; state: ReturnType<PilotController['getSnapshot']>; controller: PilotController; active: boolean; sortable: boolean; renaming: boolean; onBeginRename: () => void; onRename: (title: string) => void; onCancelRename: () => void; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id, disabled: renaming || !sortable })
  const [title, setTitle] = useState(session.title)
  const [error, setError] = useState('')
  useEffect(() => { if (!renaming) setTitle(session.title) }, [renaming, session.title])
  const badge = sessionBadge(session, { running: state.runningSessionIds.includes(session.id), unread: state.unreadSessionIds.includes(session.id), pending: Boolean(state.pendingPermissions[session.id]) })
  const run = (action: () => Promise<unknown>) => {
    setError('')
    void action().then(value => { if (typeof value === 'string' && value) throw new Error(value) }).catch(cause => setError(cause instanceof Error ? cause.message : '操作失败，请重试'))
  }
  const menuProps = { session, projects: state.projects, controller, onRename: onBeginRename, run }
  return <ContextMenu.Root>
    <ContextMenu.Trigger asChild disabled={renaming}>
      <div ref={setNodeRef} className={`mira-session-row${active ? ' is-active' : ''}${isDragging ? ' is-dragging' : ''}`} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}>
        {renaming ? <form className="mira-session-rename" onSubmit={event => { event.preventDefault(); onRename(title) }}><input autoFocus value={title} maxLength={42} aria-label="会话标题" onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancelRename() } }} /><button type="submit" aria-label="保存标题"><Check size={14} /></button></form> : <>
          {sortable && <button type="button" className="mira-session-row__grip" aria-label={`拖拽排序 ${session.title}`} {...attributes} {...listeners}><GripVertical size={12} /></button>}
          <button type="button" className="mira-session-row__open" onClick={onOpen} aria-current={active ? 'page' : undefined} title={`${session.title}\n${session.workingDirectory || session.projectName || '个人工作区'}`}><span>{session.title || '新任务'}</span></button>
          {badge && <span className={`mira-session-status mira-session-status--${badge.kind}`} title={badge.label} aria-label={badge.label}>{badge.kind === 'unread' ? <span /> : badge.kind === 'running' || badge.kind === 'plan' && session.planStatus === 'executing' ? <LoaderCircle size={12} className="pilot-spin" /> : <CircleAlert size={12} />}</span>}
          {!badge && session.status === 'failed' && <CircleAlert size={12} className="mira-session-status--failed" aria-label="执行失败" />}
          <time className="mira-session-row__time" dateTime={new Date(session.updatedAt).toISOString()} title={new Date(session.updatedAt).toLocaleString()}>{relativeTime(session.updatedAt)}</time>
          <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="mira-session-row__more" title="任务操作" aria-label={`${session.title} 的操作`}><MoreHorizontal size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content align="start" sideOffset={4} className="mira-session-menu" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}><SessionMenuItems kind="dropdown" {...menuProps} /></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
        </>}
        {error && <span className="mira-session-row__error" role="alert">{error}</span>}
      </div>
    </ContextMenu.Trigger>
    <ContextMenu.Portal container={document.getElementById('root')}><ContextMenu.Content className="mira-session-menu" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}><SessionMenuItems kind="context" {...menuProps} /></ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>
}

function SessionMenuItems({ kind = 'context', session, projects, controller, onRename, run }: { kind?: 'context' | 'dropdown'; session: HarnessSessionSummary; projects: HarnessProject[]; controller: PilotController; onRename: () => void; run: (action: () => Promise<unknown>) => void }) {
  const Menu = kind === 'context' ? ContextMenu : DropdownMenu
  const portal = document.getElementById('root')
  return <>
    <Menu.Item className="mira-session-menu__item" onSelect={onRename}><Pencil size={14} />重命名</Menu.Item>
    <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => controller.setSessionPinned(session.id, !session.pinned))}>{session.pinned ? <PinOff size={14} /> : <Pin size={14} />}{session.pinned ? '取消置顶' : '置顶'}</Menu.Item>
    <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => controller.setSessionUnread(session.id, !session.unread))}><Check size={14} />{session.unread ? '标记为已读' : '标记为未读'}</Menu.Item>
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><FolderOpen size={14} />移动到项目<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}>{projects.length ? projects.map(project => <Menu.Item key={project.id} className="mira-session-menu__item" disabled={project.id === session.projectId || !project.directoryExists} onSelect={() => run(() => controller.moveSession(session.id, project.id))}><Folder size={14} />{project.name}</Menu.Item>) : <Menu.Item className="mira-session-menu__item" disabled>暂无项目</Menu.Item>}</Menu.SubContent></Menu.Portal></Menu.Sub>
    <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => controller.archiveSession(session.id))}><Archive size={14} />归档</Menu.Item>
    <Menu.Separator className="mira-session-menu__separator" />
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><Copy size={14} />复制<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}>
      <Menu.Item className="mira-session-menu__item" disabled={!session.workingDirectory} onSelect={() => run(() => copyText(session.workingDirectory || ''))}>工作目录</Menu.Item>
      <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => copyText(session.id))}>会话 ID</Menu.Item>
      <Menu.Item className="mira-session-menu__item" onSelect={() => run(async () => copyText(sessionMarkdown(await controller.getSession(session.id))))}>复制为 Markdown</Menu.Item>
    </Menu.SubContent></Menu.Portal></Menu.Sub>
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><TerminalSquare size={14} />打开方式<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}>
      <Menu.Item className="mira-session-menu__item" disabled={!session.workingDirectory} onSelect={() => run(() => controller.openSessionProject(session.id, 'file-manager'))}>文件管理器</Menu.Item>
      <Menu.Item className="mira-session-menu__item" disabled={!session.workingDirectory} onSelect={() => run(() => controller.openSessionProject(session.id, 'terminal'))}>终端</Menu.Item>
    </Menu.SubContent></Menu.Portal></Menu.Sub>
    <Menu.Separator className="mira-session-menu__separator" />
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item mira-session-menu__item--danger"><Trash2 size={14} />删除会话<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}><Menu.Label className="mira-session-menu__label">删除后无法恢复</Menu.Label><Menu.Item className="mira-session-menu__item mira-session-menu__item--danger" onSelect={() => run(() => controller.deleteSession(session.id))}>确认删除「{session.title || '新任务'}」</Menu.Item></Menu.SubContent></Menu.Portal></Menu.Sub>
  </>
}
