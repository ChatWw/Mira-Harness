import request from './request'
import type { PageParams, PageResult } from './types'
import type { ApplicationOption, MenuItem, MicroApp, MicroAppRuntimeConfig } from '@/types'

// 角色相关接口
export const roleApi = {
  getList(params: PageParams) {
    return request.get('/role/list', { params })
  },
  create(data: any) {
    return request.post('/role', data)
  },
  update(id: string, data: any) {
    return request.put(`/role/${id}`, data)
  },
  delete(id: string) {
    return request.delete(`/role/${id}`)
  },
}

// 菜单相关接口
export const menuApi = {
  getMyMenus(params?: { app_code?: string }) {
    return request.get('/menus/my', { params }) as unknown as Promise<MenuItem[]>
  },
  getList(params?: { app_code?: string }) {
    return request.get('/menu/list', { params }) as unknown as Promise<MenuItem[]>
  },
  create(data: any) {
    return request.post('/menu', data)
  },
  update(id: string, data: any) {
    return request.put(`/menu/${id}`, data)
  },
  delete(id: string) {
    return request.delete(`/menu/${id}`)
  },
}

export const applicationApi = {
  getMyApps() {
    return request.get('/applications/my') as unknown as Promise<ApplicationOption[]>
  },
}

export const microAppApi = {
  getList(params: PageParams & { name?: string; code?: string; status?: string; integrationMode?: string }) {
    return request.get('/micro-apps', { params }) as unknown as Promise<PageResult<MicroApp>>
  },
  getAll() {
    return request.get('/micro-apps/all') as unknown as Promise<MicroApp[]>
  },
  getByCode(code: string) {
    return request.get(`/micro-apps/${code}`) as unknown as Promise<MicroApp>
  },
  getRuntime(code: string) {
    return request.get(`/micro-apps/${code}/runtime`) as unknown as Promise<MicroAppRuntimeConfig>
  },
  create(data: Partial<MicroApp>) {
    return request.post('/micro-apps', data) as unknown as Promise<MicroApp>
  },
  update(code: string, data: Partial<MicroApp>) {
    return request.put(`/micro-apps/${code}`, data) as unknown as Promise<MicroApp>
  },
  updateRuntime(code: string, data: MicroAppRuntimeConfig) {
    return request.put(`/micro-apps/${code}/runtime`, data) as unknown as Promise<MicroAppRuntimeConfig>
  },
}

// 部门相关接口
export const deptApi = {
  getList(params?: any) {
    return request.get('/dept/list', { params })
  },
  create(data: any) {
    return request.post('/dept', data)
  },
  update(id: string, data: any) {
    return request.put(`/dept/${id}`, data)
  },
  delete(id: string) {
    return request.delete(`/dept/${id}`)
  },
}

// 操作日志相关接口
export const logApi = {
  getList(params: PageParams) {
    return request.get('/log/list', { params })
  },
  delete(id: string) {
    return request.delete(`/log/${id}`)
  },
  clear() {
    return request.delete('/log/clear')
  },
}

// 系统设置相关接口
export const settingApi = {
  getAll() {
    return request.get('/setting')
  },
  update(data: any) {
    return request.put('/setting', data)
  },
}
