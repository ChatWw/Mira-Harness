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
