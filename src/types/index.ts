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
  /** 当前主题预设主色（随浅色/深色模式解析），供子应用对齐强调色。 */
  primaryColor?: string
  /** 主色之上的前景对比色（按钮文字等）。 */
  onPrimary?: string
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
  requestMiraWorkflow(request: import('@/config/miraFlowWorkbench').MiraFlowWorkbenchRequest): Promise<unknown>
  hooks: {
    list(params?: { projectId?: string }): Promise<import('@/config/miraHooks').MiraHookItem[]>
    save(params: import('@/config/miraHooks').MiraHookWrite & { projectId?: string }): Promise<import('@/config/miraHooks').MiraHookItem>
    delete(params: import('@/config/miraHooks').MiraHookDelete & { projectId?: string }): Promise<void>
    setEnabled(params: import('@/config/miraHooks').MiraHookEnabled & { projectId?: string }): Promise<import('@/config/miraHooks').MiraHookItem>
    trust(params: import('@/config/miraHooks').MiraHookTrust & { projectId?: string }): Promise<import('@/config/miraHooks').MiraHookItem>
    revokeTrust(params: import('@/config/miraHooks').MiraPluginHookTrust): Promise<import('@/config/miraHooks').MiraHookItem>
  }
  agentModels: {
    list(): Promise<import('@/config/miraAgentModels').MiraAgentModelSetting[]>
    set(params: { target: import('@/config/miraAgentModels').MiraAgentModelTarget; modelSelection?: import('@/config/harness').ModelSelection }): Promise<import('@/config/miraAgentModels').MiraAgentModelSetting>
  }
  userAgents: {
    list(params?: { projectId?: string; sessionId?: string }): Promise<import('@/config/miraUserAgents').MiraUserAgentItem[]>
    read(params: { scope: import('@/config/miraUserAgents').MiraUserAgentScope; name: string; projectId?: string }): Promise<import('@/config/miraUserAgents').MiraUserAgentDocument>
    save(params: import('@/config/miraUserAgents').MiraUserAgentWrite & { projectId?: string }): Promise<import('@/config/miraUserAgents').MiraUserAgentItem>
    delete(params: import('@/config/miraUserAgents').MiraUserAgentDelete & { projectId?: string }): Promise<void>
    setEnabled(params: import('@/config/miraUserAgents').MiraUserAgentEnabled & { projectId?: string }): Promise<import('@/config/miraUserAgents').MiraUserAgentItem>
  }
  promptCommands: {
    list(params?: { projectId?: string; sessionId?: string }): Promise<import('@/config/miraPromptCommands').MiraPromptCommandItem[]>
    read(params: { scope: import('@/config/miraPromptCommands').MiraPromptCommandScope; name: string; projectId?: string }): Promise<import('@/config/miraPromptCommands').MiraPromptCommandDocument>
    save(params: import('@/config/miraPromptCommands').MiraPromptCommandWrite & { projectId?: string }): Promise<import('@/config/miraPromptCommands').MiraPromptCommandItem>
    delete(params: import('@/config/miraPromptCommands').MiraPromptCommandDelete & { projectId?: string }): Promise<void>
  }
  windowChrome: 'macos-overlay' | 'windows-overlay' | 'standard'
  getPathForFile(file: File): string
  getSnapshot(): Promise<PlatformSnapshot>
  savePreference(key: string, value: unknown): Promise<void>
  getNotificationStatus(): Promise<import('@/config/desktopNotifications').DesktopNotificationStatus>
  openNotificationSettings(): Promise<void>
  onNotificationSession(listener: (sessionId: string) => void): () => void
  updateMenus(menus: MenuItem[]): Promise<PlatformSnapshot>
  updateMicroApps(apps: MicroApp[]): Promise<PlatformSnapshot>
  selectMicroAppDirectory(): Promise<string | null>
  resolveLocalMicroAppUrl(appId: string): Promise<string>
  getNovelApiBaseUrl(): Promise<string>
  createFirstPartyGrant(appId: string): Promise<string>
  revokeFirstPartyGrant(grantId: string): Promise<void>
  generateFirstPartyText(grantId: string, role: import('@/config/novel').NovelModelRole, prompt: string, selection: import('@/config/harness').ModelSelection): Promise<string>
  listFirstPartyNovelProjects(grantId: string): Promise<import('@/config/novel').NovelProjectSummary[]>
  getFirstPartyNovelProject(grantId: string, id: string): Promise<import('@/config/novel').NovelProjectDocument>
  saveFirstPartyNovelProject(grantId: string, project: import('@/config/novel').NovelProjectDocument): Promise<import('@/config/novel').NovelProjectDocument>
  invokeFirstPartyHarness(grantId: string, method: string, params?: unknown): Promise<unknown>
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
  openResourceManager(): Promise<void>
  windowCommand(action: string): Promise<void>
  getDesktopZoomFactor?(): number
  onDesktopZoomChanged?(listener: (factor: number) => void): () => void
  onWindowNavigate(listener: (path: string) => void): () => void
  onWindowCloseContext?(listener: () => void): () => void
  listModelProviders(): Promise<import('@/config/harness').ModelProviderSummary[]>
  listModelServices(): Promise<import('@/config/harness').ModelServiceSummary[]>
  getModelConfigPath(): Promise<string>
  getModelProviderApiKey(id: string): Promise<string>
  getModelProviderApiKeys(id: string): Promise<import('../config/harness').ModelApiKey[]>
  openModelConfigFile(): Promise<string>
  listModelProviderModels(provider: import('@/config/harness').ModelProviderInput): Promise<import('@/config/harness').ModelListResult>
  lookupModelMetadata(modelId: string): Promise<import('@/config/harness').ModelMetadataResult>
  saveModelProvider(provider: import('@/config/harness').ModelProviderInput): Promise<import('@/config/harness').ModelProviderSummary>
  deleteModelProvider(id: string): Promise<void>
  deleteModelService(id: string): Promise<void>
  getModelRoleBindings(): Promise<import('@/config/harness').ModelRoleBinding>
  saveModelRoleBindings(bindings: import('@/config/harness').ModelRoleBinding): Promise<import('@/config/harness').ModelRoleBinding>
  listHarnessSkills(): Promise<import('@/config/harness').HarnessSkill[]>
  getHarnessSkillSettings(): Promise<import('@/config/harness').HarnessSkillSettings>
  saveHarnessSkillSettings(settings: import('@/config/harness').HarnessSkillSettings): Promise<import('@/config/harness').HarnessSkillSettings>
  setHarnessSkillEnabled(id: string, enabled: boolean): Promise<import('@/config/harness').HarnessSkill[]>
  getHarnessPluginSkill(id: string, name: string): Promise<import('@/config/harness').HarnessSkill>
  revealHarnessSkill(id: string, name?: string): Promise<void>
  deleteHarnessSkill(id: string): Promise<import('@/config/harness').HarnessSkill[]>
  importHarnessSkill(): Promise<import('@/config/harness').HarnessSkill[]>
  testModelProvider(provider: import('@/config/harness').ModelProviderInput, modelId: string): Promise<{ ok: boolean, text: string }>
  listHarnessProjects(): Promise<import('@/config/harness').HarnessProject[]>
  getGlobalInstructions(): Promise<string>
  saveGlobalInstructions(content: string): Promise<string>
  getGlobalInstructionsPath(): Promise<string>
  revealHarnessSettingsFile(kind: 'instructions' | 'memory'): Promise<void>
  getHarnessMemoryEnabled(): Promise<boolean>
  setHarnessMemoryEnabled(enabled: boolean): Promise<boolean>
  getHarnessMemoryPath(): Promise<string>
  resetHarnessMemory(): Promise<number>
  listHarnessSessions(query?: string): Promise<import('@/config/harness').HarnessSessionSummary[]>
  queryHarnessHistory(query: import('@/config/harness').HarnessHistoryQuery): Promise<import('@/config/harness').HarnessHistoryPage>
  queryHarnessUsage(): Promise<import('@/config/harness').HarnessUsageStats>
  listAutomationTasks(): Promise<import('@/config/harness').AutomationTask[]>
  getAutomationOverview(): Promise<import('@/config/harness').AutomationOverview>
  getAutomationNextRuns(expression: string, rule?: import('../config/automationRepeat').AutomationScheduleRule): Promise<number[]>
  saveAutomationTask(task: import('@/config/harness').AutomationTaskInput): Promise<import('@/config/harness').AutomationTask>
  setAutomationTaskEnabled(id: string, enabled: boolean): Promise<import('@/config/harness').AutomationTask>
  deleteAutomationTask(id: string): Promise<void>
  deleteAutomationRun(id: string): Promise<void>
  listAutomationRuns(taskId: string, status?: import('@/config/harness').AutomationRunStatus): Promise<import('@/config/harness').AutomationRun[]>
  runAutomationNow(taskId: string): Promise<import('@/config/harness').AutomationRun>
  retryAutomationRun(runId: string): Promise<import('@/config/harness').AutomationRun>
  abortAutomationRun(taskId: string): Promise<void>
  getHarnessSession(id: string): Promise<import('@/config/harness').HarnessSession>
  readHarnessWorkspaceSearchIgnore(target: import('@/config/harness').HarnessWorkspaceSearchIgnoreTarget): Promise<import('@/config/harness').HarnessWorkspaceSearchIgnoreDocument>
  transformHarnessWorkspaceSearchIgnore(target: import('@/config/harness').HarnessWorkspaceSearchIgnoreTarget, content: string, transform: import('@/config/harness').HarnessWorkspaceSearchIgnoreTransform): Promise<{ content: string }>
  writeHarnessWorkspaceSearchIgnore(target: import('@/config/harness').HarnessWorkspaceSearchIgnoreTarget, content: string, revision: string): Promise<import('@/config/harness').HarnessWorkspaceSearchIgnoreDocument>
  restoreHarnessSessions(ids: string[]): Promise<import('@/config/harness').HarnessSession[]>
  deleteHarnessSession(id: string): Promise<void>
  listMcpServers(scope?: import('@/config/miraMcp').MiraMcpScope): Promise<import('@/config/miraMcp').MiraMcpServerRecord[]>
  discoverExternalMcpServers(): Promise<import('@/config/miraMcp').MiraExternalMcpSource[]>
  importExternalMcpServers(ids: string[]): Promise<import('@/config/miraMcp').MiraMcpImportResult[]>
  saveMcpServer(config: Partial<import('@/config/miraMcp').MiraMcpServerConfig>, scope?: import('@/config/miraMcp').MiraMcpScope): Promise<import('@/config/miraMcp').MiraMcpServerRecord>
  deleteMcpServer(id: string, scope?: import('@/config/miraMcp').MiraMcpScope): Promise<void>
  reconnectMcpServer(id: string, scope?: import('@/config/miraMcp').MiraMcpScope): Promise<import('@/config/miraMcp').MiraMcpConnection>
  authorizeMcpServer(id: string, scope?: import('@/config/miraMcp').MiraMcpScope): Promise<import('@/config/miraMcp').MiraMcpConnection | undefined>
  getHarnessPermissionConfig(): Promise<import('@/config/harness').PermissionConfig>
  saveHarnessPermissionConfig(config: import('@/config/harness').PermissionConfig): Promise<import('@/config/harness').PermissionConfig>
  listHarnessTrash(projectId?: string): Promise<import('@/config/harness').HarnessTrashEntry[]>
  restoreHarnessTrash(projectId: string, token: string): Promise<void>
  bindHostedBrowser?(sessionId: string, browserId: string, guestId: number): Promise<void>
  onHarnessEvent(listener: (event: import('@/config/harness').HarnessEvent) => void): () => void
}

// 关闭窗口时的行为
export type CloseWindowBehavior = 'background' | 'quit'


// 页面切换动画
export type PageTransition = 'fade' | 'fade-slide' | 'slide-up' | 'slide-right' | 'zoom' | 'none'

// 新增类型
export type ContentWidth = 'full' | '1200' | '1400' | '1600'
export type ContentPadding = 'compact' | 'normal' | 'comfortable'
export type CornerRadius = 'sharp' | 'medium' | 'rounded'
export type ComponentSize = 'large' | 'default' | 'small'
export type AnimationSpeed = 'fast' | 'normal' | 'slow'

// 布局配置
export interface LayoutConfig {
  contentMaxWidth: ContentWidth
  contentPadding: ContentPadding
  pageTransition: PageTransition
  animationSpeed: AnimationSpeed
  themeTransitionAnimation: boolean
  cornerRadius: CornerRadius
  componentSize: ComponentSize
  dynamicTitle: boolean
}
