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
  windowChrome: 'macos-overlay' | 'standard'
  getSnapshot(): Promise<PlatformSnapshot>
  savePreference(key: string, value: unknown): Promise<void>
  updateMenus(menus: MenuItem[]): Promise<PlatformSnapshot>
  updateMicroApps(apps: MicroApp[]): Promise<PlatformSnapshot>
  selectMicroAppDirectory(): Promise<string | null>
  resolveLocalMicroAppUrl(appId: string): Promise<string>
  exportSnapshot(): Promise<string>
  importSnapshot(snapshot: string): Promise<PlatformSnapshot>
  restoreDefaults(): Promise<PlatformSnapshot>
}


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
