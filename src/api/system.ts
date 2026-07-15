import request from './request'
import type { PageParams, PageResult } from './types'

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
  getList(params?: any) {
    return request.get('/menu/list', { params })
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
