import request from './request'
import type { PageParams, PageResult, LoginResult } from './types'
import type { UserInfo } from '@/types'

export const userApi = {
  login(data: { username: string; password: string }): Promise<LoginResult> {
    return request.post('/auth/login', data)
  },
  getInfo() {
    return request.get('/auth/info')
  },
  logout() {
    return request.post('/auth/logout')
  },
  getList(params: PageParams) {
    return request.get<PageResult<UserInfo>>('/user/list', { params })
  },
  create(data: Partial<UserInfo>) {
    return request.post('/user', data)
  },
  update(id: string, data: Partial<UserInfo>) {
    return request.put(`/user/${id}`, data)
  },
  delete(id: string) {
    return request.delete(`/user/${id}`)
  },
  resetPassword(id: string) {
    return request.put(`/user/${id}/reset-password`)
  },
}
