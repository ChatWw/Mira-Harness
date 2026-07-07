export interface UserInfo {
  id: string
  name: string
  email: string
  avatar?: string
  roles?: string[]
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
}

// 布局模式
export type LayoutMode = 'sidebar-header' | 'header-only' | 'sidebar-only'

// 页面切换动画
export type PageTransition = 'fade' | 'fade-slide' | 'slide-up' | 'slide-right' | 'zoom' | 'none'

// 布局配置
export interface LayoutConfig {
  mode: LayoutMode
  showLogo: boolean
  fixedHeader: boolean
  dynamicTitle: string
  pageTransition: PageTransition
}
