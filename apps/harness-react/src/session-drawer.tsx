import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Archive, ChevronRight, Copy, FolderOpen, GripVertical, LoaderCircle, MoreVertical, Pencil, Pin, PinOff, Plus, TerminalSquare, Trash2, X } from 'lucide-react'
import type { HarnessProject, HarnessSession, HarnessSessionOrderScope, HarnessSessionSummary } from '../../../src/config/harness'
import type { PilotController } from './pilot-state'
import { groupSessions, sessionBadge, sessionMarkdown } from './session-groups'

const PROJECT_LIMIT = 6
const PROJECT_SESSION_LIMIT = 5
const RECENT_LIMIT = 12
const EXPANDED_PROJECTS_KEY = 'session-drawer'

type DrawerPreference = { expandedProjectIds?: string[] }
type GroupId = 'pinned' | 'recent' | `project:${string}`

export interface SessionDrawerProps {
  state: ReturnType<PilotController['getSnapshot']>
  controller: PilotController
  width: number
  newTaskOpen: boolean
  onToggleNewTask: () => void
  onClose: () => void
}

export function SessionDrawer({ state, controller, width, newTaskOpen, onToggleNewTask, onClose }: SessionDrawerProps) {
  const [newTarget, setNewTarget] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([])
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [extendedGroups, setExtendedGroups] = useState<Record<string, boolean>>({})
  const [renamingId, setRenamingId] = useState('')
  const [menu, setMenu] = useState<{ sessionId: string; x: number; y: number }>()
  const loadedPreference = useRef(false)

  useEffect(() => {
    if (loadedPreference.current) return
    loadedPreference.current = true
    void controller.getPreference(EXPANDED_PROJECTS_KEY).then(value => {
      const ids = (value as DrawerPreference | null)?.expandedProjectIds
      if (Array.isArray(ids)) setExpandedProjectIds(ids.filter(id => typeof id === 'string'))
    })
  }, [controller])
  useEffect(() => {
    void controller.setPreference(EXPANDED_PROJECTS_KEY, { expandedProjectIds })
  }, [controller, expandedProjectIds])
  // 活动会话所在的项目组自动展开，避免切项目后找不到当前会话。
  const activeProjectId = state.session?.projectId
  useEffect(() => {
    if (!activeProjectId) return
    setExpandedProjectIds(previous => previous.includes(activeProjectId) ? previous : [...previous, activeProjectId])
  }, [activeProjectId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const model = useMemo(() => groupSessions(state.sessions, state.projects), [state.sessions, state.projects])
  const groupOf = (id: string): GroupId | undefined => {
    if (model.pinned.some(item => item.id === id)) return 'pinned'
    if (model.recent.some(item => item.id === id)) return 'recent'
    const project = model.projects.find(entry => entry.sessions.some(item => item.id === id))
    return project ? `project:${project.project.id}` : undefined
  }
  const idsOf = (group: GroupId) => {
    if (group === 'pinned') return model.pinned.map(item => item.id)
    if (group === 'recent') return model.recent.map(item => item.id)
    return model.projects.find(entry => `project:${entry.project.id}` === group)?.sessions.map(item => item.id) || []
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const group = groupOf(String(active.id))
    if (!group || group !== groupOf(String(over.id))) return
    const ids = idsOf(group)
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    const scope: HarnessSessionOrderScope = group === 'pinned' ? { type: 'pinned' } : group === 'recent' ? { type: 'recent' } : { type: 'project', projectId: group.slice('project:'.length) }
    void controller.reorderSessions(scope, next)
  }

  const toggleProject = (projectId: string) => {
    setExpandedProjectIds(previous => previous.includes(projectId) ? previous.filter(id => id !== projectId) : [...previous, projectId])
  }
  const newProject = state.projects.find(item => newTarget === `project:${item.id}`)
  async function createTask() {
    if (!newTarget || creating) return
    setCreating(true)
    const created = await controller.create(newTarget === 'personal' ? undefined : newTarget.slice('project:'.length))
    setCreating(false)
    if (created) { onToggleNewTask(); setNewTarget('') }
  }
  async function renameSession(id: string, title: string) {
    setRenamingId('')
    if (!title.trim()) return
    await controller.renameSession(id, title.trim().slice(0, 42))
  }
  const rowProps = (session: HarnessSessionSummary) => ({
    session,
    state,
    controller,
    active: session.id === state.session?.id,
    renaming: renamingId === session.id,
    onRename: (title: string) => void renameSession(session.id, title),
    onCancelRename: () => setRenamingId(''),
    onOpen: () => { void controller.open(session.id) },
    onMenu: (event: React.MouseEvent) => { event.preventDefault(); setMenu({ sessionId: session.id, x: event.clientX, y: event.clientY }) },
  })
  const visibleProjects = showAllProjects ? model.projects : model.projects.slice(0, PROJECT_LIMIT)
  const noSessions = model.pinned.length === 0 && model.recent.length === 0 && model.projects.every(entry => entry.sessions.length === 0)

  return <aside id="pilot-sessions" className="pilot-nav" style={{ width }} aria-label="会话">
    <div className="pilot-nav__head"><strong>会话</strong><button type="button" title="新任务" aria-label="新任务" aria-expanded={newTaskOpen} onClick={onToggleNewTask}><Plus size={17} /></button></div>
    <button type="button" className="pilot-drawer__close" aria-label="关闭会话" onClick={onClose}><X size={15} /></button>
    {newTaskOpen && <div className="pilot-new-task"><label htmlFor="pilot-task-target">任务工作区</label><select id="pilot-task-target" value={newTarget} onChange={event => setNewTarget(event.target.value)}><option value="">选择工作区</option><option value="personal">个人工作区</option>{state.projects.map(item => <option key={item.id} value={`project:${item.id}`} disabled={!item.directoryExists}>{item.name}{item.directoryExists ? '' : '（目录不可用）'}</option>)}</select>{newProject && <p title={newProject.directory}>{newProject.directory}</p>}{newTarget === 'personal' && <p>创建后请核对实际工作目录再发送任务。</p>}<button type="button" disabled={!newTarget || creating} onClick={() => void createTask()}>{creating ? '创建中…' : '创建任务'}</button></div>}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="pilot-nav__list">
        {model.pinned.length > 0 && <GroupSection title="置顶" count={model.pinned.length}>
          <SortableGroup ids={model.pinned.map(item => item.id)}>
            {model.pinned.map(session => <SessionRow key={session.id} {...rowProps(session)} />)}
          </SortableGroup>
        </GroupSection>}
        {model.projects.length > 0 && <GroupSection title={`项目 · ${state.projects.length}`} count={undefined}>
          {visibleProjects.map(({ project, sessions }) => {
            const collapsed = !expandedProjectIds.includes(project.id)
            const showAll = Boolean(extendedGroups[project.id])
            return <GroupSection key={project.id} title={project.name} count={sessions.length} collapsed={collapsed} onToggle={() => toggleProject(project.id)} nested>
              {!collapsed && <SortableGroup ids={sessions.map(item => item.id)}>
                {(showAll ? sessions : sessions.slice(0, PROJECT_SESSION_LIMIT)).map(session => <SessionRow key={session.id} nested {...rowProps(session)} />)}
              </SortableGroup>}
              {!collapsed && sessions.length > PROJECT_SESSION_LIMIT && <button type="button" className="pilot-nav__more" onClick={() => setExtendedGroups(previous => ({ ...previous, [project.id]: !previous[project.id] }))}>{showAll ? '收起会话' : `显示全部 ${sessions.length} 个会话`}</button>}
            </GroupSection>
          })}
          {model.projects.length > PROJECT_LIMIT && <button type="button" className="pilot-nav__more" onClick={() => setShowAllProjects(!showAllProjects)}>{showAllProjects ? '收起项目' : `显示全部 ${state.projects.length} 个项目`}</button>}
        </GroupSection>}
        {model.recent.length > 0 && <GroupSection title="最近对话" count={model.recent.length}>
          <SortableGroup ids={model.recent.map(item => item.id)}>
            {(showAllRecent ? model.recent : model.recent.slice(0, RECENT_LIMIT)).map(session => <SessionRow key={session.id} {...rowProps(session)} />)}
          </SortableGroup>
          {model.recent.length > RECENT_LIMIT && <button type="button" className="pilot-nav__more" onClick={() => setShowAllRecent(!showAllRecent)}>{showAllRecent ? '收起' : '显示更多'}</button>}
        </GroupSection>}
        {noSessions && <p className="pilot-nav__hint">还没有会话，点击右上角 + 创建</p>}
      </div>
    </DndContext>
    {menu && state.sessions.some(item => item.id === menu.sessionId) && <SessionContextMenu
      session={state.sessions.find(item => item.id === menu.sessionId)!}
      projects={state.projects}
      controller={controller}
      onRename={() => { setRenamingId(menu.sessionId); setMenu(undefined) }}
      onClose={() => setMenu(undefined)}
      onCopy={value => void copyText(value)}
      fileManagerLabel="Finder"
      position={menu}
    />}
  </aside>
}

async function copyText(value: string) {
  try { await navigator.clipboard.writeText(value) }
  catch {
    const area = document.createElement('textarea')
    area.value = value
    document.body.appendChild(area)
    area.select()
    try { document.execCommand('copy') } finally { area.remove() }
  }
}

function GroupSection({ title, count, collapsed, onToggle, nested, children }: { title: string; count?: number; collapsed?: boolean; onToggle?: () => void; nested?: boolean; children: ReactNode }) {
  return <section className={`pilot-nav__group${nested ? ' pilot-nav__group--nested' : ''}`}>
    <button type="button" className="pilot-nav__group-head" aria-expanded={collapsed === undefined ? undefined : !collapsed} onClick={onToggle}>
      {onToggle && <ChevronRight size={13} className={`pilot-nav__chevron${collapsed ? '' : ' is-open'}`} />}
      <span>{title}</span>{count !== undefined && <small>{count}</small>}
    </button>
    {children}
  </section>
}

function SortableGroup({ ids, children }: { ids: string[]; children: ReactNode }) {
  return <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
}

function SessionRow({ session, state, controller, active, nested, renaming, onRename, onCancelRename, onOpen, onMenu }: {
  session: HarnessSessionSummary
  state: ReturnType<PilotController['getSnapshot']>
  controller: PilotController
  active: boolean
  nested?: boolean
  renaming: boolean
  onRename: (title: string) => void
  onCancelRename: () => void
  onOpen: () => void
  onMenu: (event: React.MouseEvent) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id, disabled: renaming })
  const [title, setTitle] = useState(session.title)
  useEffect(() => { if (!renaming) setTitle(session.title) }, [renaming, session.title])
  const badge = sessionBadge(session, {
    running: state.runningSessionIds.includes(session.id),
    unread: state.unreadSessionIds.includes(session.id),
    pending: Boolean(state.pendingPermissions[session.id]),
  })
  return <div ref={setNodeRef} className={`pilot-session-row${nested ? ' pilot-session-row--nested' : ''}${isDragging ? ' is-dragging' : ''}`} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}>
    {renaming ? <form className="pilot-session-row__rename" onSubmit={event => { event.preventDefault(); onRename(title) }}>
      <input autoFocus value={title} maxLength={42} aria-label="会话标题" onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') onCancelRename() }} />
      <button type="submit" aria-label="保存标题">保存</button>
    </form> : <div className={`pilot-session-row__main${active ? ' is-active' : ''}`}>
      <button type="button" className="pilot-session-row__grip" aria-label={`拖拽排序 ${session.title}`} {...attributes} {...listeners}><GripVertical size={13} /></button>
      <button type="button" className="pilot-session-row__open" onClick={onOpen} onContextMenu={onMenu} title={session.title}>
        <span>{session.title || '新任务'}</span>
        <small>{session.projectName || '个人工作区'}</small>
      </button>
      {badge && <span className={`pilot-session-badge pilot-session-badge--${badge.kind}`} title={badge.label}>{badge.kind === 'unread' ? null : badge.kind === 'running' ? <LoaderCircle size={12} className="pilot-spin" /> : badge.label}</span>}
      <span className="pilot-session-row__tools">
        <button type="button" aria-label={session.pinned ? `取消置顶 ${session.title}` : `置顶 ${session.title}`} title={session.pinned ? '取消置顶' : '置顶'} onClick={() => void controller.setSessionPinned(session.id, !session.pinned)}>{session.pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>
        <button type="button" aria-label={`归档 ${session.title}`} title="归档" onClick={() => void controller.archiveSession(session.id)}><Archive size={13} /></button>
      </span>
    </div>}
  </div>
}

function SessionContextMenu({ session, projects, controller, position, onRename, onClose, onCopy, fileManagerLabel }: {
  session: HarnessSessionSummary
  projects: HarnessProject[]
  controller: PilotController
  position: { x: number; y: number }
  onRename: () => void
  onClose: () => void
  onCopy: (value: string) => void
  fileManagerLabel: string
}) {
  const [submenu, setSubmenu] = useState<'move' | 'copy' | 'open' | 'confirm-delete'>()
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose() }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true); document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])
  const run = (action: () => Promise<unknown>) => {
    void (async () => {
      const value = await action()
      if (typeof value === 'string' && value) throw new Error(value)
    })().then(onClose).catch(cause => setError(cause instanceof Error ? cause.message : '操作失败'))
  }
  const width = 208
  const left = Math.max(8, Math.min(position.x, window.innerWidth - width - 8))
  const top = Math.max(8, Math.min(position.y, window.innerHeight - 360))
  const toggle = (next: typeof submenu) => setSubmenu(previous => previous === next ? undefined : next)
  return <div ref={ref} className="pilot-context-menu" role="menu" style={{ left, top, width }}>
    <MenuButton icon={<Pencil size={14} />} label="重命名" onClick={onRename} />
    <MenuButton icon={session.pinned ? <PinOff size={14} /> : <Pin size={14} />} label={session.pinned ? '取消置顶' : '置顶'} onClick={() => run(() => controller.setSessionPinned(session.id, !session.pinned))} />
    <MenuButton icon={null} label={session.unread ? '标记为已读' : '标记为未读'} onClick={() => run(() => controller.setSessionUnread(session.id, !session.unread))} />
    <MenuButton icon={<FolderOpen size={14} />} label="移动到项目" submenu onClick={() => toggle('move')} />
    {submenu === 'move' && <div className="pilot-context-menu__sub">{projects.map(project => <button key={project.id} type="button" role="menuitem" disabled={project.id === session.projectId} onClick={() => run(() => controller.moveSession(session.id, project.id))}>{project.name}</button>)}{projects.length === 0 && <p className="pilot-nav__hint">还没有项目</p>}</div>}
    <MenuButton icon={<Archive size={14} />} label="归档" onClick={() => run(() => controller.archiveSession(session.id))} />
    <MenuButton icon={<Copy size={14} />} label="复制" submenu onClick={() => toggle('copy')} />
    {submenu === 'copy' && <div className="pilot-context-menu__sub">
      <button type="button" role="menuitem" disabled={!session.workingDirectory} onClick={() => { onCopy(session.workingDirectory || ''); onClose() }}>工作目录</button>
      <button type="button" role="menuitem" onClick={() => { onCopy(session.id); onClose() }}>会话 ID</button>
      <button type="button" role="menuitem" onClick={() => run(async () => { await copyText(sessionMarkdown(await controller.getSession(session.id))) })}>复制为 Markdown</button>
    </div>}
    <MenuButton icon={<TerminalSquare size={14} />} label="打开方式" submenu onClick={() => toggle('open')} />
    {submenu === 'open' && <div className="pilot-context-menu__sub">
      <button type="button" role="menuitem" onClick={() => run(() => controller.openSessionProject(session.id, 'file-manager'))}>{fileManagerLabel}</button>
      <button type="button" role="menuitem" onClick={() => run(() => controller.openSessionProject(session.id, 'terminal'))}>终端</button>
    </div>}
    <MenuButton icon={<Trash2 size={14} />} label="删除会话" danger submenu onClick={() => toggle('confirm-delete')} />
    {submenu === 'confirm-delete' && <div className="pilot-context-menu__sub pilot-context-menu__sub--danger">
      <p>删除「{session.title || '新任务'}」后无法恢复。</p>
      <button type="button" role="menuitem" onClick={() => run(() => controller.deleteSession(session.id))}>确认删除</button>
    </div>}
    {error && <p className="pilot-context-menu__error" role="alert">{error}</p>}
  </div>
}

function MenuButton({ icon, label, onClick, submenu, danger }: { icon: ReactNode; label: string; onClick: () => void; submenu?: boolean; danger?: boolean }) {
  return <button type="button" role="menuitem" className={danger ? 'pilot-context-menu__danger' : ''} onClick={onClick}>
    {icon}{label}{submenu && <ChevronRight size={13} className="pilot-context-menu__chevron" />}
  </button>
}
