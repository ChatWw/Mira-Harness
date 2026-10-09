/* Tab interaction adapted from ZCode workspaceSidePane / useAppPanels.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: session-owned state and host resource lifecycle.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
export type WorkspaceResourceId = 'overview' | 'files' | 'changes' | 'terminal' | 'browser'
export type WorkspaceTabId = Exclude<WorkspaceResourceId, 'files'> | `file:${string}`
export type WorkspaceTab = { id: WorkspaceTabId; label: string; path?: string }
export type WorkspaceSessionState = {
  tabs: WorkspaceTab[]
  activeTab: WorkspaceTabId
  fileTreeOpen: boolean
  selectedFilePath?: string
  expandedFilePaths: string[]
  selectedChangeId?: string
  browserUrl: string
  recentClosedTabs: WorkspaceTab[]
}

const RECENT_WORKSPACE_LIMIT = 8

export function workspaceTabLabel(id: WorkspaceResourceId | WorkspaceTabId) {
  if (id.startsWith('file:')) return id.slice(5).split('/').pop() || '文件'
  return { overview: '任务活动', files: '文件', changes: '变更', terminal: '终端', browser: '浏览器' }[id as WorkspaceResourceId]
}

export function isWorkspaceRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !/^[a-z]:/i.test(value)
    && !/[\\\0]/.test(value) && value.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..')
}

export function createWorkspaceFileTab(path: string): WorkspaceTab {
  if (!isWorkspaceRelativePath(path)) throw new Error('文件路径无效')
  return { id: `file:${path}`, label: path.split('/').pop()!, path }
}

export function createWorkspaceSession(): WorkspaceSessionState {
  return { tabs: [], activeTab: 'overview', fileTreeOpen: false, expandedFilePaths: [], browserUrl: '', recentClosedTabs: [] }
}

export function openWorkspaceTab(state: WorkspaceSessionState, tab: WorkspaceTab): WorkspaceSessionState {
  return {
    ...state,
    tabs: state.tabs.some(item => item.id === tab.id) ? state.tabs : [...state.tabs, tab],
    activeTab: tab.id,
    recentClosedTabs: state.recentClosedTabs.filter(item => item.id !== tab.id),
  }
}

export function closeWorkspaceTab(state: WorkspaceSessionState, id: WorkspaceTabId): WorkspaceSessionState {
  const index = state.tabs.findIndex(tab => tab.id === id)
  if (index < 0) return state
  const tabs = state.tabs.filter(tab => tab.id !== id)
  // 关闭选中标签后沿原索引选择右邻，末尾才回退左邻，避免跳到不相邻资源。
  return { ...state, tabs, activeTab: state.activeTab === id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? 'overview' : state.activeTab, recentClosedTabs: rememberClosedTabs(state, [state.tabs[index]]) }
}

function rememberClosedTabs(state: WorkspaceSessionState, closing: WorkspaceTab[]) {
  const ids = new Set(closing.map(tab => tab.id))
  return [...closing, ...state.recentClosedTabs.filter(tab => !ids.has(tab.id))].slice(0, RECENT_WORKSPACE_LIMIT)
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
  return tab ? openWorkspaceTab(state, tab) : state
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
  const validIds = new Set<WorkspaceTabId>(['overview', 'changes', 'terminal', 'browser'])
  return Object.fromEntries(Object.entries(value).flatMap(([sessionId, raw]) => {
    if (!sessionId || !raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const data = raw as Partial<WorkspaceSessionState>
    const readTabs = (value: unknown) => {
      const tabs: WorkspaceTab[] = []
      if (Array.isArray(value)) for (const tab of value) {
        if (!tab || typeof tab !== 'object' || typeof tab.id !== 'string' || typeof tab.label !== 'string' || tabs.some(item => item.id === tab.id)) continue
        if (tab.id.startsWith('file:')) {
          if (isWorkspaceRelativePath(tab.path) && tab.id === `file:${tab.path}`) tabs.push({ id: tab.id, label: tab.label, path: tab.path })
        } else if (validIds.has(tab.id)) tabs.push({ id: tab.id, label: tab.label })
      }
      return tabs
    }
    const tabs = readTabs(data.tabs)
    const state: WorkspaceSessionState = {
      tabs,
      activeTab: tabs.some(tab => tab.id === data.activeTab) ? data.activeTab! : tabs[tabs.length - 1]?.id ?? 'overview',
      // The old files tab becomes a drawer entry; it must not revive the nested tree/preview pane.
      fileTreeOpen: data.fileTreeOpen === true || (Array.isArray(data.tabs) && data.tabs.some(tab => tab && typeof tab === 'object' && (tab.id as string) === 'files' && typeof tab.label === 'string')),
      selectedFilePath: isWorkspaceRelativePath(data.selectedFilePath) ? data.selectedFilePath : undefined,
      expandedFilePaths: Array.isArray(data.expandedFilePaths) ? [...new Set(data.expandedFilePaths.filter(isWorkspaceRelativePath))] : [],
      selectedChangeId: typeof data.selectedChangeId === 'string' ? data.selectedChangeId : undefined,
      browserUrl: typeof data.browserUrl === 'string' && /^https?:\/\//i.test(data.browserUrl) ? data.browserUrl : '',
      recentClosedTabs: readTabs(data.recentClosedTabs).filter(tab => !tabs.some(open => open.id === tab.id)).slice(0, RECENT_WORKSPACE_LIMIT),
    }
    return [[sessionId, state]]
  }))
}
