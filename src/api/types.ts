export interface ApiResponse<T = any> {
  code: number
  data: T
  message: string
}

export interface PageResult<T = any> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface PageParams {
  page: number
  pageSize: number
  [key: string]: any
}

export interface LoginResult {
  token: string
  userInfo: UserInfo
  permissions: string[]
  menus: MenuItem[]
}

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

export interface MenuItem {
  id: string
  title: string
  icon?: string
  path?: string
  children?: MenuItem[]
  permission?: string
  component?: string
  name?: string
}
