/* Tab interaction adapted from ZCode workspaceSidePane / useAppPanels.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: session-owned state and host resource lifecycle.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { miraBrowserFavicon } from '../../../../src/platform/miraBrowserMetadata'
import { miraInitialTaskLayout, miraTaskPaneIds, readMiraTaskLayout, removeMiraTaskPane, splitMiraTaskLayout, type MiraTaskLayout, type MiraTaskSplitSide } from './mira-task-layout'
export type WorkspaceResourceId = 'overview' | 'files' | 'git' | 'changes' | 'terminal' | 'browser' | 'side-chat'
export type WorkspaceTabId = Exclude<WorkspaceResourceId, 'files' | 'side-chat' | 'terminal' | 'browser'> | `new-tab:${string}` | `browser:${string}` | `terminal:${string}` | `side-chat:${string}` | `task:${string}` | `file:${string}` | `file-manager:${string}` | `subtask:${string}` | `workflow:${string}` | `plan:${string}` | `command:${string}` | `command-output:${string}` | `trace:${string}`
export type WorkspaceHtmlSource = { path: string } & ({ projectId: string; rootPath?: string } | { sessionId: string })
export type WorkspaceWorkflowDetail = { kind: 'actor'; siteId: string; ordinal: number } | { kind: 'operations'; phaseId: string; participantId?: string } | { kind: 'artifact'; artifactId: string; version: number }
export type WorkspaceTab = { id: WorkspaceTabId; label: string; path?: string; projectId?: string; rootPath?: string; fileManager?: { directory: string; sessionId?: string }; planToolId?: string; commandToolId?: string; fullCommandOutput?: true; runId?: string; workflowSessionId?: string; workflowDetail?: WorkspaceWorkflowDetail; subtaskId?: string; childSessionId?: string; taskSessionId?: string; traceSessionId?: string; url?: string; htmlSource?: WorkspaceHtmlSource; faviconUrl?: string | null; openedAt?: number; closedAt?: number }
export type WorkspaceSessionState = {
  tabs: WorkspaceTab[]
  activeTab: WorkspaceTabId
  fileTreeOpen: boolean
  selectedFilePath?: string
  expandedFilePaths: string[]
  selectedChangeId?: string
  recentClosedTabs: WorkspaceTab[]
  taskLayout?: MiraTaskLayout
}

const RECENT_WORKSPACE_LIMIT = 8

export function workspaceTabLabel(id: WorkspaceResourceId | WorkspaceTabId) {
  if (id.startsWith('new-tab:')) return '新标签页'
  if (isWorkspaceTerminalTab(id)) return '终端'
  if (isWorkspaceBrowserTab(id)) return '浏览器'
  if (id.startsWith('file:')) return id.slice(5).split('/').pop() || '文件'
  if (id.startsWith('side-chat:')) return '侧边栏对话'
  if (id.startsWith('task:')) return '任务'
  if (id.startsWith('trace:')) return '模型轨迹'
  if (id.startsWith('subtask:')) return '智能体'
  if (id.startsWith('workflow:')) return '工作流'
  if (id.startsWith('plan:')) return '方案'
  if (id.startsWith('command:')) return '命令输出'
  if (id.startsWith('command-output:')) return '完整输出.log'
  return { overview: '调用轨迹', git: 'Git 更改', files: '文件', changes: '变更', terminal: '终端', browser: '浏览器', 'side-chat': '侧边栏对话' }[id as WorkspaceResourceId]
}

export function isWorkspaceTerminalTab(id: string): boolean { return id.startsWith('terminal:') }
export function isWorkspaceBrowserTab(id: string): boolean { return id.startsWith('browser:') }
export function createWorkspaceNewTab(): WorkspaceTab {
  return { id: `new-tab:${crypto.randomUUID()}`, label: '新标签页' }
}

export function createWorkspaceBrowserTab(url = ''): WorkspaceTab {
  let label = '浏览器'
  try { label = new URL(url).hostname || label } catch { /* empty browser tab */ }
  return { id: `browser:${crypto.randomUUID()}`, label, url }
}

export function createWorkspaceTerminalTab(directory: string, tabs: WorkspaceTab[]): WorkspaceTab {
  const base = directory.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '终端'
  const used = new Set(tabs.filter(tab => isWorkspaceTerminalTab(tab.id)).map(tab => tab.label))
  let label = base, suffix = 2
  while (used.has(label)) label = `${base} ${suffix++}`
  return { id: `terminal:${crypto.randomUUID()}`, label }
}

export function isWorkspaceRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !/^[a-z]:/i.test(value)
    && !/[\\\0]/.test(value) && value.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..')
}

export function createWorkspaceFileManagerTab(directory: string, projectId?: string, sessionId?: string): WorkspaceTab {
  return { id: `file-manager:${crypto.randomUUID()}`, label: '文件', ...(projectId ? { projectId, rootPath: directory } : {}), fileManager: { directory, sessionId } }
}

export function createWorkspaceFileTab(path: string, projectId?: string): WorkspaceTab {
  if (!isWorkspaceRelativePath(path)) throw new Error('文件路径无效')
  return { id: projectId ? `file:${JSON.stringify([projectId, path])}` : `file:${path}`, label: path.split('/').pop()!, path, ...(projectId ? { projectId } : {}) }
}

export function createWorkspaceRunTab(runId?: string): WorkspaceTab {
  return { id: 'overview', label: '调用轨迹', runId }
}

export function createWorkspacePlanTab(planToolId: string, title: string): WorkspaceTab {
  return { id: `plan:${planToolId}`, label: title, planToolId }
}

export function createWorkspaceCommandTab(runId: string, commandToolId: string, label: string): WorkspaceTab {
  return { id: `command:${JSON.stringify([runId, commandToolId])}`, label, runId, commandToolId }
}

export function createWorkspaceCommandOutputTab(runId: string, commandToolId: string): WorkspaceTab {
  return { id: `command-output:${JSON.stringify([runId, commandToolId])}`, label: '完整输出.log', runId, commandToolId, fullCommandOutput: true }
}

export function createWorkspaceWorkflowTab(sessionId: string, runId: string): WorkspaceTab {
  return { id: `workflow:${JSON.stringify([sessionId, runId])}`, label: '工作流', workflowSessionId: sessionId, runId }
}

export function createWorkspaceWorkflowDetailTab(sessionId: string, runId: string, detail: WorkspaceWorkflowDetail, label: string): WorkspaceTab {
  const key = detail.kind === 'artifact' ? ['artifact', detail.artifactId, detail.version] : detail.kind === 'actor' ? ['actor', detail.siteId, detail.ordinal] : ['operations', detail.phaseId, detail.participantId ?? null]
  return { id: `workflow:${JSON.stringify([sessionId, runId, ...key])}`, label, workflowSessionId: sessionId, runId, workflowDetail: detail }
}

export function createWorkspaceSubtaskTab(runId: string, subtaskId: string, label: string): WorkspaceTab {
  return { id: `subtask:${JSON.stringify([runId, subtaskId])}`, label, runId, subtaskId }
}

export function createWorkspaceSideConversationTab(childSessionId: string): WorkspaceTab {
  return { id: `side-chat:${childSessionId}`, label: '侧边栏对话', childSessionId }
}

export function createWorkspaceTaskTab(sessionId: string, title: string): WorkspaceTab {
  return { id: `task:${sessionId}`, label: title || '新任务', taskSessionId: sessionId }
}

export function createWorkspaceTraceTab(sessionId: string, title: string): WorkspaceTab {
  return { id: `trace:${sessionId}`, label: title ? `${title} · 模型轨迹` : '模型轨迹', traceSessionId: sessionId }
}

export function placeWorkspaceTask(state: WorkspaceSessionState, tab: WorkspaceTab, anchor: string, side: MiraTaskSplitSide): WorkspaceSessionState {
  if (!tab.taskSessionId) return state
  const layout = readMiraTaskLayout(state.taskLayout, state.tabs.flatMap(item => item.taskSessionId ? [item.taskSessionId] : []))
  const next = splitMiraTaskLayout(layout, anchor, tab.taskSessionId, side)
  if (next === layout && !state.tabs.some(item => item.id === tab.id)) return state
  return { ...openWorkspaceTab(state, tab), taskLayout: next }
}

export function replaceWorkspaceTask(state: WorkspaceSessionState, previousId: string, tab: WorkspaceTab): WorkspaceSessionState {
  const previous = state.tabs.find(item => item.taskSessionId === previousId)
  if (!previous || !tab.taskSessionId || state.tabs.some(item => item.taskSessionId === tab.taskSessionId)) return state
  const replace = (node: MiraTaskLayout): MiraTaskLayout => node.kind === 'task'
    ? node.id === previousId ? { ...node, id: tab.taskSessionId! } : node
    : { ...node, first: replace(node.first), second: replace(node.second) }
  return {
    ...state,
    tabs: state.tabs.map(item => item === previous ? { ...tab, openedAt: Date.now() } : item),
    activeTab: state.activeTab === previous.id ? tab.id : state.activeTab,
    taskLayout: replace(readMiraTaskLayout(state.taskLayout, state.tabs.flatMap(item => item.taskSessionId ? [item.taskSessionId] : []))),
    recentClosedTabs: rememberClosedTabs(state, [previous]).filter(item => item.id !== tab.id),
  }
}

export function createWorkspaceSession(): WorkspaceSessionState {
  return { tabs: [], activeTab: 'overview', fileTreeOpen: false, expandedFilePaths: [], recentClosedTabs: [] }
}

export function withoutWorkspaceTaskOwners(sessions: Record<string, WorkspaceSessionState>, removed: ReadonlySet<string>): Record<string, WorkspaceSessionState> {
  return Object.fromEntries(Object.entries(sessions).filter(([owner]) => !removed.has(owner)).map(([owner, state]) => {
    const keep = (tab: WorkspaceTab) => !removed.has(tab.taskSessionId || tab.childSessionId || tab.workflowSessionId || tab.traceSessionId || '')
    const tabs = state.tabs.filter(keep), recentClosedTabs = state.recentClosedTabs.filter(keep)
    if (tabs.length === state.tabs.length && recentClosedTabs.length === state.recentClosedTabs.length) return [owner, state]
    const index = state.tabs.findIndex(tab => tab.id === state.activeTab)
    return [owner, { ...state, tabs, recentClosedTabs, ...(state.taskLayout ? { taskLayout: [...removed].reduce(removeMiraTaskPane, state.taskLayout) } : {}), activeTab: tabs.some(tab => tab.id === state.activeTab) ? state.activeTab : tabs[Math.min(Math.max(index, 0), tabs.length - 1)]?.id || 'overview' }]
  }))
}

export function openWorkspaceTab(state: WorkspaceSessionState, tab: WorkspaceTab): WorkspaceSessionState {
  const { closedAt: _closedAt, ...opening } = tab
  const launcher = state.tabs.find(item => item.id === state.activeTab && item.id.startsWith('new-tab:'))
  if (launcher && !tab.id.startsWith('new-tab:')) {
    const existing = state.tabs.some(item => item.id === tab.id)
    state = { ...state, tabs: existing ? state.tabs.filter(item => item !== launcher) : state.tabs.map(item => item === launcher ? { ...opening, openedAt: Date.now() } : item) }
  }
  return {
    ...state,
    // An explicit run opening replaces the overview owner; restoring a child keeps
    // its original run metadata instead of following whichever run is latest.
    tabs: state.tabs.some(item => item.id === tab.id) ? state.tabs.map(item => item.id === tab.id && tab.runId ? { ...item, ...opening, openedAt: item.openedAt } : item) : [...state.tabs, { ...opening, openedAt: Date.now() }],
    activeTab: tab.id,
    recentClosedTabs: state.recentClosedTabs.filter(item => item.id !== tab.id),
  }
}

export function closeWorkspaceTab(state: WorkspaceSessionState, id: WorkspaceTabId): WorkspaceSessionState {
  const index = state.tabs.findIndex(tab => tab.id === id)
  if (index < 0) return state
  const tabs = state.tabs.filter(tab => tab.id !== id)
  // 关闭选中标签后沿原索引选择右邻，末尾才回退左邻，避免跳到不相邻资源。
  return { ...state, tabs, ...(state.taskLayout && state.tabs[index].taskSessionId ? { taskLayout: removeMiraTaskPane(state.taskLayout, state.tabs[index].taskSessionId!) } : {}), activeTab: state.activeTab === id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? 'overview' : state.activeTab, recentClosedTabs: rememberClosedTabs(state, [state.tabs[index]]) }
}

function rememberClosedTabs(state: WorkspaceSessionState, closing: WorkspaceTab[]) {
  const ids = new Set(closing.map(tab => tab.id))
  const closedAt = Date.now()
  return [...closing.map(tab => ({ ...tab, closedAt })), ...state.recentClosedTabs.filter(tab => !ids.has(tab.id))].slice(0, RECENT_WORKSPACE_LIMIT)
}

export function closeOtherWorkspaceTabs(state: WorkspaceSessionState, id: WorkspaceTabId): WorkspaceSessionState {
  const kept = state.tabs.find(tab => tab.id === id)
  if (!kept) return state
  const closing = state.tabs.filter(tab => tab.id !== id)
  return { ...state, tabs: [kept], activeTab: id, recentClosedTabs: rememberClosedTabs(state, closing) }
}

export function closeAllWorkspaceTabs(state: WorkspaceSessionState): WorkspaceSessionState {
  if (!state.tabs.length) return state
  return { ...state, tabs: [], activeTab: 'overview', recentClosedTabs: rememberClosedTabs(state, state.tabs) }
}

export function restoreWorkspaceTab(state: WorkspaceSessionState, id: WorkspaceTabId): WorkspaceSessionState {
  const tab = state.recentClosedTabs.find(item => item.id === id)
  if (!tab) return state
  if (tab.taskSessionId) return placeWorkspaceTask(state, tab, '$primary', 'right')
  if (isWorkspaceBrowserTab(tab.id)) {
    const reopened = { ...createWorkspaceBrowserTab(tab.url || ''), label: tab.label, ...(tab.htmlSource ? { htmlSource: tab.htmlSource } : {}), ...(tab.faviconUrl === undefined ? {} : { faviconUrl: tab.faviconUrl }) }
    return openWorkspaceTab({ ...state, recentClosedTabs: state.recentClosedTabs.filter(item => item.id !== id) }, reopened)
  }
  return openWorkspaceTab(state, tab)
}

export function reorderWorkspaceTabs(state: WorkspaceSessionState, dragged: WorkspaceTabId, target: WorkspaceTabId): WorkspaceSessionState {
  const sourceIndex = state.tabs.findIndex(tab => tab.id === dragged)
  const targetIndex = state.tabs.findIndex(tab => tab.id === target)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state
  const tabs = [...state.tabs]
  const [moving] = tabs.splice(sourceIndex, 1)
  tabs.splice(targetIndex, 0, moving)
  return { ...state, tabs }
}

export function labelWorkspaceTab(state: WorkspaceSessionState, id: WorkspaceTabId, label: string): WorkspaceSessionState {
  return { ...state, tabs: state.tabs.map(tab => tab.id === id ? { ...tab, label } : tab) }
}

export function readWorkspaceSessions(value: unknown): Record<string, WorkspaceSessionState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const validIds = new Set<WorkspaceTabId>(['overview', 'git', 'changes'])
  return Object.fromEntries(Object.entries(value).flatMap(([sessionId, raw]) => {
    if (!sessionId || !raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const data = raw as Partial<WorkspaceSessionState>
    const readTabs = (value: unknown) => {
      const tabs: WorkspaceTab[] = []
      if (Array.isArray(value)) for (const tab of value) {
        if (!tab || typeof tab !== 'object' || typeof tab.id !== 'string' || typeof tab.label !== 'string' || tabs.some(item => item.id === tab.id)) continue
        if (tab.id.startsWith('new-tab:') && tab.id.length > 8) {
          tabs.push({ id: tab.id, label: '新标签页' })
        } else if (tab.id.startsWith('file-manager:')) {
          const manager = tab.fileManager
          if (!manager || typeof manager.directory !== 'string' || !manager.directory || manager.directory.length > 4096) continue
          if (tab.path !== undefined && !isWorkspaceRelativePath(tab.path)) continue
          if (tab.projectId !== undefined && (typeof tab.projectId !== 'string' || !tab.projectId)) continue
          if (!tab.projectId && (typeof manager.sessionId !== 'string' || !manager.sessionId)) continue
          tabs.push({ id: tab.id, label: tab.label, path: tab.path, projectId: tab.projectId, rootPath: tab.projectId ? manager.directory : undefined, fileManager: { directory: manager.directory, sessionId: manager.sessionId } })
        } else if (tab.id.startsWith('file:')) {
          if (!isWorkspaceRelativePath(tab.path)) continue
          if (tab.projectId !== undefined && (typeof tab.projectId !== 'string' || !tab.projectId || tab.projectId.length > 256)) continue
          const file = createWorkspaceFileTab(tab.path, tab.projectId)
          if (tab.id === file.id) tabs.push({ ...file, label: tab.label })
        } else if (tab.id.startsWith('browser:')) {
          const source = tab.htmlSource
          const scope = source && typeof source === 'object' && (typeof source.projectId === 'string' && source.projectId.length > 0 && source.projectId.length <= 256 ? { projectId: source.projectId, ...(typeof source.rootPath === 'string' && source.rootPath.length <= 4096 ? { rootPath: source.rootPath } : {}) } : typeof source.sessionId === 'string' && source.sessionId.length > 0 && source.sessionId.length <= 256 ? { sessionId: source.sessionId } : undefined)
          const htmlSource = scope && isWorkspaceRelativePath(source.path) && /\.(html|htm)$/i.test(source.path) ? { ...scope, path: source.path } : undefined
          if (/^browser:[\w-]{1,128}$/.test(tab.id)) tabs.push({ id: tab.id, label: tab.label, url: typeof tab.url === 'string' && /^https?:\/\//i.test(tab.url) ? tab.url : '', ...(htmlSource ? { htmlSource } : {}), ...(tab.faviconUrl === undefined ? {} : { faviconUrl: miraBrowserFavicon(tab.faviconUrl) ?? null }) })
        } else if (tab.id.startsWith('terminal:')) {
          if (/^terminal:[\w-]{1,128}$/.test(tab.id)) tabs.push({ id: tab.id, label: tab.label })
        } else if (tab.id.startsWith('side-chat:')) {
          if (typeof tab.childSessionId === 'string' && /^[\w-]{1,128}$/.test(tab.childSessionId) && tab.id === `side-chat:${tab.childSessionId}`) tabs.push(createWorkspaceSideConversationTab(tab.childSessionId))
        } else if (tab.id.startsWith('trace:')) {
          if (typeof tab.traceSessionId === 'string' && /^[\w-]{1,128}$/.test(tab.traceSessionId) && tab.id === `trace:${tab.traceSessionId}`) tabs.push({ id: tab.id, label: tab.label, traceSessionId: tab.traceSessionId })
        } else if (tab.id.startsWith('task:')) {
          if (typeof tab.taskSessionId === 'string' && /^[\w-]{1,128}$/.test(tab.taskSessionId) && tab.taskSessionId !== sessionId && tab.id === `task:${tab.taskSessionId}`) tabs.push(createWorkspaceTaskTab(tab.taskSessionId, tab.label))
        } else if (tab.id.startsWith('workflow:')) {
          if (typeof tab.workflowSessionId === 'string' && typeof tab.runId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(tab.workflowSessionId) && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(tab.runId)) {
            const detail = tab.workflowDetail
            const validDetail = detail && (detail.kind === 'artifact' ? /^[A-Za-z0-9_.-]{1,64}$/.test(detail.artifactId) && Number.isSafeInteger(detail.version) && detail.version >= 1 && detail.version <= 16 : detail.kind === 'actor' ? typeof detail.siteId === 'string' && detail.siteId.length > 0 && detail.siteId.length <= 512 && Number.isSafeInteger(detail.ordinal) && detail.ordinal >= 0 : detail.kind === 'operations' && typeof detail.phaseId === 'string' && detail.phaseId.length > 0 && detail.phaseId.length <= 512 && (detail.participantId === undefined || typeof detail.participantId === 'string' && detail.participantId.length > 0 && detail.participantId.length <= 512))
            const restored = validDetail ? createWorkspaceWorkflowDetailTab(tab.workflowSessionId, tab.runId, detail, tab.label) : createWorkspaceWorkflowTab(tab.workflowSessionId, tab.runId)
            if (tab.id === restored.id) tabs.push(restored)
          }
        } else if (tab.id.startsWith('plan:')) {
          if (typeof tab.planToolId === 'string' && tab.planToolId.length > 0 && tab.planToolId.length <= 512 && !/[\u0000-\u001f]/.test(tab.planToolId) && tab.id === `plan:${tab.planToolId}`) tabs.push(createWorkspacePlanTab(tab.planToolId, tab.label))
        } else if (tab.id.startsWith('command-output:')) {
          if (typeof tab.runId === 'string' && tab.runId.length > 0 && tab.runId.length <= 512 && !/[\u0000-\u001f]/.test(tab.runId) && typeof tab.commandToolId === 'string' && tab.commandToolId.length > 0 && tab.commandToolId.length <= 512 && !/[\u0000-\u001f]/.test(tab.commandToolId) && tab.id === createWorkspaceCommandOutputTab(tab.runId, tab.commandToolId).id) tabs.push(createWorkspaceCommandOutputTab(tab.runId, tab.commandToolId))
        } else if (tab.id.startsWith('command:')) {
          if (typeof tab.runId === 'string' && tab.runId.length > 0 && tab.runId.length <= 512 && !/[\u0000-\u001f]/.test(tab.runId) && typeof tab.commandToolId === 'string' && tab.commandToolId.length > 0 && tab.commandToolId.length <= 512 && !/[\u0000-\u001f]/.test(tab.commandToolId) && tab.id === createWorkspaceCommandTab(tab.runId, tab.commandToolId, tab.label).id) tabs.push(createWorkspaceCommandTab(tab.runId, tab.commandToolId, tab.label))
        } else if (tab.id.startsWith('subtask:')) {
          if (typeof tab.runId === 'string' && tab.runId && typeof tab.subtaskId === 'string' && tab.subtaskId && tab.id === createWorkspaceSubtaskTab(tab.runId, tab.subtaskId, tab.label).id) tabs.push({ id: tab.id, label: tab.label, runId: tab.runId, subtaskId: tab.subtaskId })
        } else if (validIds.has(tab.id)) tabs.push({ id: tab.id, label: tab.label, ...(tab.id === 'git' && typeof tab.projectId === 'string' ? { projectId: tab.projectId } : {}), ...(tab.id === 'overview' && typeof tab.runId === 'string' && tab.runId ? { runId: tab.runId } : {}) })
        const accepted = tabs[tabs.length - 1]
        if (accepted?.id === tab.id) for (const field of ['openedAt', 'closedAt'] as const) {
          if (Number.isSafeInteger(tab[field]) && tab[field] > 0 && tab[field] <= 8_640_000_000_000_000) accepted[field] = tab[field]
        }
      }
      return tabs
    }
    const tabs = readTabs(data.tabs)
    const state: WorkspaceSessionState = {
      tabs,
      activeTab: tabs.some(tab => tab.id === data.activeTab) ? data.activeTab! : tabs[tabs.length - 1]?.id ?? 'overview',
      fileTreeOpen: data.fileTreeOpen === true,
      selectedFilePath: isWorkspaceRelativePath(data.selectedFilePath) ? data.selectedFilePath : undefined,
      expandedFilePaths: Array.isArray(data.expandedFilePaths) ? [...new Set(data.expandedFilePaths.filter(isWorkspaceRelativePath))] : [],
      selectedChangeId: typeof data.selectedChangeId === 'string' ? data.selectedChangeId : undefined,
      recentClosedTabs: readTabs(data.recentClosedTabs).filter(tab => !tabs.some(open => open.id === tab.id)).slice(0, RECENT_WORKSPACE_LIMIT),
      ...(tabs.some(tab => tab.taskSessionId) ? { taskLayout: readMiraTaskLayout(data.taskLayout, tabs.flatMap(tab => tab.taskSessionId ? [tab.taskSessionId] : [])) } : data.taskLayout ? { taskLayout: miraInitialTaskLayout() } : {}),
    }
    if (state.taskLayout) {
      const visible = new Set(miraTaskPaneIds(state.taskLayout))
      const overflow = tabs.filter(tab => tab.taskSessionId && !visible.has(tab.taskSessionId))
      if (overflow.length) {
        const ids = new Set(overflow.map(tab => tab.id))
        state.tabs = tabs.filter(tab => !ids.has(tab.id))
        state.recentClosedTabs = [...overflow, ...state.recentClosedTabs].slice(0, RECENT_WORKSPACE_LIMIT)
        if (ids.has(state.activeTab)) state.activeTab = state.tabs[state.tabs.length - 1]?.id || 'overview'
      }
    }
    return [[sessionId, state]]
  }))
}
