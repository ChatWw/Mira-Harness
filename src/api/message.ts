import request from './request'
import type { PageParams } from './types'

// 消息中心相关接口
export const messageApi = {
  // 获取消息列表
  getList(params: PageParams) {
    return request.get('/message/list', { params })
  },
  // 获取未读消息数量
  getUnreadCount() {
    return request.get('/message/unread-count')
  },
  // 标记消息为已读
  markAsRead(id: string) {
    return request.put(`/message/${id}/read`)
  },
  // 标记全部消息为已读
  markAllAsRead() {
    return request.put('/message/read-all')
  },
  // 删除消息
  delete(id: string) {
    return request.delete(`/message/${id}`)
  },
}
