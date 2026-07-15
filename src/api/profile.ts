import request from './request'

// 个人中心相关接口
export const profileApi = {
  // 获取个人信息
  getInfo() {
    return request.get('/profile/info')
  },
  // 更新个人信息
  updateInfo(data: any) {
    return request.put('/profile/info', data)
  },
  // 修改密码
  changePassword(data: { oldPassword: string; newPassword: string }) {
    return request.put('/profile/password', data)
  },
  // 上传头像
  uploadAvatar(file: File) {
    const formData = new FormData()
    formData.append('avatar', file)
    return request.post('/profile/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
}
