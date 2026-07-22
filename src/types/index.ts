export interface UserInfo {
  id: string
  name: string
  email: string
  avatar?: string
  roles?: string[]
  username?: string
  nickname?: string
  phone?: string
  deptId?: string
  deptName?: string
  status?: number
  createdAt?: string
}

export interface LoginPayload {
  account: string
  password: string
  remember: boolean
}

export type ThemeMode = 'light' | 'dark'

export interface MenuItem {
  id: string
  title: string
  icon?: string
  path?: string
  children?: MenuItem[]
  permission?: string
  component?: string
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

export type MicroAppEventName = 'platform:navigate' | 'platform:refresh'

export interface MicroAppEvent {
  name: MicroAppEventName
  payload?: Record<string, unknown>
}

export interface MicroAppRuntimeConfig {
  alive: boolean
  sync: boolean
  fiber: boolean
  prefix: Record<string, string>
  props: MicroAppContextOverrides
  preload: boolean
  exec: boolean
  iframe: {
    sandbox: string
    referrerPolicy: ReferrerPolicy
    timeout: number
  }
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
