export type ThemeMode = 'light' | 'dark'
export type ThemePreference = ThemeMode | 'system'

export type IframeProfile = 'strict' | 'compatible' | 'external'

export interface IframePolicy {
  profile?: IframeProfile
  referrerPolicy?: ReferrerPolicy
  timeout?: number
}

export type MenuTarget =
  | { type: 'component'; componentKey: string }
  | { type: 'iframe'; url: string; iframePolicy?: IframePolicy }
  | { type: 'microapp'; childPath: string }

export interface MenuItem {
  id: string
  title: string
  description?: string
  showPageHeader?: boolean
  keepAlive?: boolean
  icon?: string
  path?: string
  children?: MenuItem[]
  target?: MenuTarget
  name?: string
  type?: 'dir' | 'menu' | 'button' | 'microapp'
  appCode?: string | null
  sort?: number
  status?: number
  visible?: boolean
}

export type MicroAppIntegrationMode = 'wujie' | 'iframe'

export interface PlatformContext {
  version: 1
  theme: ThemeMode
  language: string
  tenantId?: string
  user: {
    id: string
    name: string
  }
}

export type MicroAppEventName = 'platform:navigate' | 'platform:route-change' | 'platform:refresh'

export interface MicroAppEvent {
  name: MicroAppEventName
  payload?: Record<string, unknown>
}

export interface PlatformNavigatePayload {
  appCode: string
  path: string
}

export interface WujieRuntimeConfig {
  kind: 'wujie'
  alive: boolean
  routeMode: 'platform' | 'none'
  prefix: Record<string, string>
  preload: boolean
}

export interface IframeRuntimeConfig {
  kind: 'iframe'
  iframe: IframePolicy
}

export type MicroAppRuntimeConfig = WujieRuntimeConfig | IframeRuntimeConfig

export type MicroAppEntry =
  | { type: 'local-directory'; directory: string }
  | { type: 'builtin'; package: string }
  | { type: 'url'; url: string }

export interface MicroApp {
  id: string
  name: string
  code: string
  entry: MicroAppEntry
  icon?: string
  sort: number
  enabled: boolean
  integrationMode: MicroAppIntegrationMode
  description?: string
  menus?: MenuItem[]
  runtimeConfig: MicroAppRuntimeConfig
}

export interface ApplicationOption {
  code: string
  name: string
  icon?: string
  type: 'main' | 'microapp'
}

export interface PlatformSnapshot {
  mainMenus: MenuItem[]
  microApps: MicroApp[]
  preferences: Record<string, unknown>
}

export interface PlatformApi {
  windowChrome: 'macos-overlay' | 'windows-overlay' | 'standard'
  getSnapshot(): Promise<PlatformSnapshot>
  savePreference(key: string, value: unknown): Promise<void>
  updateMenus(menus: MenuItem[]): Promise<PlatformSnapshot>
  updateMicroApps(apps: MicroApp[]): Promise<PlatformSnapshot>
  selectMicroAppDirectory(): Promise<string | null>
  resolveLocalMicroAppUrl(appId: string): Promise<string>
  getNovelApiBaseUrl(): Promise<string>
  testNovelModelConnection(role: import('@/config/novel').NovelModelRole, prompt?: string): Promise<{ ok: boolean; text: string }>
  listNovelProjects(): Promise<import('@/config/novel').NovelProjectSummary[]>
  getNovelProject(id: string): Promise<import('@/config/novel').NovelProjectDocument>
  createNovelProject(title?: string): Promise<import('@/config/novel').NovelProjectDocument>
  saveNovelProject(project: import('@/config/novel').NovelProjectDocument): Promise<import('@/config/novel').NovelProjectDocument>
  deleteNovelProject(id: string): Promise<void>
  exportNovelProject(id: string): Promise<string>
  importNovelProject(raw: string): Promise<import('@/config/novel').NovelProjectDocument>
  getNovelWorkspaceSettings(): Promise<import('@/config/novel').NovelWorkspaceSettings>
  saveNovelWorkspaceSettings(settings: import('@/config/novel').NovelWorkspaceSettings): Promise<import('@/config/novel').NovelWorkspaceSettings>
  exportSnapshot(): Promise<string>
  importSnapshot(snapshot: string): Promise<PlatformSnapshot>
  restoreDefaults(): Promise<PlatformSnapshot>
  setTitleBarChrome(chrome: { color: string; symbolColor: string; height?: number }): Promise<void>
  windowCommand(action: string): Promise<void>
  onWindowNavigate(listener: (path: string) => void): () => void
  listModelProviders(): Promise<import('@/config/harness').ModelProviderSummary[]>
  getModelConfigPath(): Promise<string>
  getModelProviderApiKey(id: string): Promise<string>
  openModelConfigFile(): Promise<string>
  listModelProviderModels(provider: import('@/config/harness').ModelProviderInput): Promise<import('@/config/harness').ModelListResult>
  saveModelProvider(provider: import('@/config/harness').ModelProviderInput): Promise<import('@/config/harness').ModelProviderSummary>
  deleteModelProvider(id: string): Promise<void>
  getModelRoleBindings(): Promise<import('@/config/harness').ModelRoleBinding>
  saveModelRoleBindings(bindings: import('@/config/harness').ModelRoleBinding): Promise<import('@/config/harness').ModelRoleBinding>
  listHarnessSkills(): Promise<import('@/config/harness').HarnessSkill[]>
  getHarnessSkillSettings(): Promise<import('@/config/harness').HarnessSkillSettings>
  saveHarnessSkillSettings(settings: import('@/config/harness').HarnessSkillSettings): Promise<import('@/config/harness').HarnessSkillSettings>
  setHarnessSkillEnabled(id: string, enabled: boolean): Promise<import('@/config/harness').HarnessSkill[]>
  testModelProvider(provider: import('@/config/harness').ModelProviderInput, modelId: string): Promise<{ ok: boolean, text: string }>
  listHarnessProjects(): Promise<import('@/config/harness').HarnessProject[]>
  openHarnessProjectDirectory(id: string): Promise<string>
  selectHarnessProjectDirectory(): Promise<string | null>
  createHarnessProject(input?: import('@/config/harness').HarnessProjectCreateInput): Promise<import('@/config/harness').HarnessProject | null>
  renameHarnessProject(id: string, name: string, icon?: string): Promise<import('@/config/harness').HarnessProject>
  deleteHarnessProject(id: string): Promise<void>
  getGlobalInstructions(): Promise<string>
  saveGlobalInstructions(content: string): Promise<string>
  getGlobalInstructionsPath(): Promise<string>
  getHarnessMemoryEnabled(): Promise<boolean>
  setHarnessMemoryEnabled(enabled: boolean): Promise<boolean>
  getHarnessMemoryPath(): Promise<string>
  resetHarnessMemory(): Promise<number>
  listHarnessGitBranches(projectId: string): Promise<import('@/config/harness').HarnessGitBranch[]>
  checkoutHarnessGitBranch(projectId: string, branchName: string): Promise<import('@/config/harness').HarnessGitBranch[]>
  createAndCheckoutHarnessGitBranch(projectId: string, branchName: string): Promise<import('@/config/harness').HarnessGitBranch[]>
  listHarnessSessions(query?: string): Promise<import('@/config/harness').HarnessSessionSummary[]>
  queryHarnessHistory(query: import('@/config/harness').HarnessHistoryQuery): Promise<import('@/config/harness').HarnessHistoryPage>
  queryHarnessUsage(): Promise<import('@/config/harness').HarnessUsageStats>
  listAutomationTasks(): Promise<import('@/config/harness').AutomationTask[]>
  getAutomationOverview(): Promise<import('@/config/harness').AutomationOverview>
  getAutomationNextRuns(expression: string): Promise<number[]>
  saveAutomationTask(task: import('@/config/harness').AutomationTaskInput): Promise<import('@/config/harness').AutomationTask>
  setAutomationTaskEnabled(id: string, enabled: boolean): Promise<import('@/config/harness').AutomationTask>
  deleteAutomationTask(id: string): Promise<void>
  listAutomationRuns(taskId: string, status?: import('@/config/harness').AutomationRunStatus): Promise<import('@/config/harness').AutomationRun[]>
  runAutomationNow(taskId: string): Promise<import('@/config/harness').AutomationRun>
  retryAutomationRun(runId: string): Promise<import('@/config/harness').AutomationRun>
  abortAutomationRun(taskId: string): Promise<void>
  createHarnessSession(projectId?: string): Promise<import('@/config/harness').HarnessSession>
  getHarnessSession(id: string): Promise<import('@/config/harness').HarnessSession>
  setHarnessSessionPermission(id: string, permissionMode: import('@/config/harness').PermissionMode): Promise<import('@/config/harness').HarnessSession>
  setHarnessActiveSkills(id: string, skillIds: string[]): Promise<import('@/config/harness').HarnessSession>
  setHarnessSessionPinned(id: string, pinned: boolean): Promise<import('@/config/harness').HarnessSession>
  renameHarnessSession(id: string, title: string): Promise<import('@/config/harness').HarnessSession>
  archiveHarnessSessions(ids: string[]): Promise<import('@/config/harness').HarnessSession[]>
  restoreHarnessSessions(ids: string[]): Promise<import('@/config/harness').HarnessSession[]>
  deleteHarnessSession(id: string): Promise<void>
  deleteHarnessSessions(ids: string[]): Promise<void>
  listHarnessProjectFiles(projectId: string, query?: string): Promise<import('@/config/harness').HarnessFileReference[]>
  attachHarnessDirectory(sessionId: string): Promise<import('@/config/harness').HarnessSession | null>
  runHarnessMessage(sessionId: string, message: string, references?: import('@/config/harness').HarnessFileReference[], selection?: import('@/config/harness').ModelSelection): Promise<void>
  rerunHarness(sessionId: string, selection?: import('@/config/harness').ModelSelection): Promise<void>
  editAndRerunHarnessMessage(sessionId: string, messageId: string, content: string, selection?: import('@/config/harness').ModelSelection): Promise<void>
  listMcpServers(): Promise<Array<{ id: string, name: string, command: string, args: string[], enabled: boolean }>>
  saveMcpServer(config: { id?: string, name: string, command: string, args?: string[], enabled?: boolean }): Promise<{ id: string, name: string, command: string, args: string[], enabled: boolean }>
  deleteMcpServer(id: string): Promise<void>
  abortHarnessRun(sessionId: string): Promise<void>
  getHarnessPermissionConfig(): Promise<import('@/config/harness').PermissionConfig>
  saveHarnessPermissionConfig(config: import('@/config/harness').PermissionConfig): Promise<import('@/config/harness').PermissionConfig>
  getHarnessGitConfig(): Promise<import('@/config/harness').HarnessGitConfig>
  saveHarnessGitConfig(config: import('@/config/harness').HarnessGitConfig): Promise<import('@/config/harness').HarnessGitConfig>
  listHarnessTrash(projectId?: string): Promise<import('@/config/harness').HarnessTrashEntry[]>
  restoreHarnessTrash(projectId: string, token: string): Promise<void>
  onHarnessEvent(listener: (event: import('@/config/harness').HarnessEvent) => void): () => void
  respondHarnessPermission(requestId: string, allowed: boolean): Promise<void>
  getPythonStatus(): Promise<{ ready: boolean, path: string, version: string, bundled: boolean }>
  pythonExec(script: string, args?: string[]): Promise<{ stdout: string, stderr: string, code: number }>
  pythonInstallPackage(packageName: string): Promise<{ stdout: string, stderr: string, code: number }>
}

// 关闭窗口时的行为
export type CloseWindowBehavior = 'background' | 'quit'

// 布局模式
export type LayoutMode = 'sidebar-header' | 'sidebar-only'
export type SidebarStyle = 'embedded' | 'floating' | 'docked'

// 页面切换动画
export type PageTransition = 'fade' | 'fade-slide' | 'slide-up' | 'slide-right' | 'zoom' | 'none'

// 新增类型
export type ContentWidth = 'full' | '1200' | '1400' | '1600'
export type ContentPadding = 'compact' | 'normal' | 'comfortable'
export type CornerRadius = 'sharp' | 'medium' | 'rounded'
export type ComponentSize = 'large' | 'default' | 'small'
export type AnimationSpeed = 'fast' | 'normal' | 'slow'
export type FooterStyle = 'simple' | 'split' | 'multi'
export type FooterYearMode = 'auto' | 'custom'
export type TabStyle = 'default' | 'personalized' | 'square' | 'card'
export type BreadcrumbStyle = 'normal' | 'card'

export interface FooterLink {
  text: string
  url: string
  target?: '_blank' | '_self'
}

// 布局配置
export interface LayoutConfig {
  mode: LayoutMode
  sidebarStyle: SidebarStyle
  sidebarWidth: number
  collapsedWidth: number
  uniqueOpened: boolean
  showLogo: boolean
  showFooter: boolean
  headerHeight: number
  showBreadcrumb: boolean
  breadcrumbIcon: boolean
  breadcrumbStyle: BreadcrumbStyle
  enableTabs: boolean
  tabStyle: TabStyle
  showTabIcon: boolean
  tabPersist: boolean
  enableContentLayoutSettings: boolean
  contentMaxWidth: ContentWidth
  contentPadding: ContentPadding
  pageTransition: PageTransition
  animationSpeed: AnimationSpeed
  themeTransitionAnimation: boolean
  titleShimmerAnimation: boolean
  cornerRadius: CornerRadius
  componentSize: ComponentSize
  watermark: boolean
  watermarkText: string
  footerStyle: FooterStyle
  footerHeight: number
  footerCopyright: string
  footerYearMode: FooterYearMode
  footerYearStart: number | null
  footerYearEnd: number | null
  footerIcp: string
  footerIcpLink: string
  footerLinks: FooterLink[]
  dynamicTitle: boolean
}
