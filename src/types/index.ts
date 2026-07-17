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
}

export type MicroAppStatus = 'developing' | 'published' | 'offline'

export interface MicroAppRuntimeConfig {
  alive: boolean
  sync: boolean
  fiber: boolean
  degrade: boolean
  prefix: Record<string, string>
  props: Record<string, unknown>
  preload: boolean
  exec: boolean
}

export interface MicroApp {
  id: string
  name: string
  code: string
  url: string
  icon?: string
  sort: number
  status: MicroAppStatus
  version?: string
  description?: string
  runtimeConfig: MicroAppRuntimeConfig
}

export interface BootstrapData {
  permissions: string[]
  menus: MenuItem[]
  routes: RouteDefinition[]
  microApps: Pick<MicroApp, 'id' | 'name' | 'code' | 'icon' | 'status'>[]
}

export interface RouteDefinition {
  path: string
  name: string
  title: string
  permission?: string
  component: string
}

// 布局模式
export type LayoutMode = 'sidebar-header' | 'header-only' | 'sidebar-only' | 'mixed' | 'top-menu'

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
export type TabStyle = 'card' | 'chrome' | 'plain'

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
  fixedSidebar: boolean
  showLogo: boolean
  showFooter: boolean
  fixedHeader: boolean
  headerHeight: number
  showBreadcrumb: boolean
  breadcrumbIcon: boolean
  enableTabs: boolean
  tabStyle: TabStyle
  maxTabs: number
  tabPersist: boolean
  contentMaxWidth: ContentWidth
  contentPadding: ContentPadding
  pageTransition: PageTransition
  animationSpeed: AnimationSpeed
  sidebarCollapseAnimation: boolean
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
  dynamicTitle: string
}
