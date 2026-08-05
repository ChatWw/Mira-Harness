export type ThemeMode = 'light' | 'dark'

export type IframeProfile = 'strict' | 'compatible' | 'external'

export interface IframePolicy {
  profile?: IframeProfile
  referrerPolicy?: ReferrerPolicy
  timeout?: number
}

export type MenuTarget =
  | { type: 'component'; component: string }
  | { type: 'iframe'; url: string; iframePolicy?: IframePolicy }
  | { type: 'microapp'; childPath: string }

export interface MenuItem {
  id: string
  title: string
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

export type MicroAppStatus = 'developing' | 'published' | 'offline'
export type MicroAppIntegrationMode = 'wujie' | 'iframe'
export type MicroAppHealthStatus = 'healthy' | 'degraded' | 'unavailable'

export interface MicroAppContextOverrides {
  theme?: ThemeMode
  language?: string
  tenantId?: string
}

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

export interface MicroAppRuntimeConfig {
  alive: boolean
  routeMode: 'platform' | 'none'
  fiber: boolean
  prefix: Record<string, string>
  props: MicroAppContextOverrides
  preload: boolean
  exec: boolean
  iframe: IframePolicy
}

export interface MicroApp {
  id: string
  name: string
  code: string
  url: string
  icon?: string
  sort: number
  status: MicroAppStatus
  integrationMode: MicroAppIntegrationMode
  healthStatus: MicroAppHealthStatus
  embedAllowed: boolean
  version?: string
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
