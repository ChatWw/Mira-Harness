你是一个 Vue 3 + TypeScript 专家。请帮我实现中后台系统的扩展页面。

## 项目背景

技术栈：Vue 3.5 + TypeScript 5.7 + Element Plus 2.14 + Pinia 3.0 + SCSS + axios + Mock
路径别名：@ → src/
已有组件：ProTable、ProForm、PageContainer
已有 hooks：useTable、useDialog、usePermission
已有 API：profileApi（@/api/profile）、messageApi（@/api/message）
已有 Mock：src/mock/profile.mock.ts、src/mock/message.mock.ts

## 全局样式约束

**所有样式必须使用 CSS 变量 `var(--cp-*)` 或 SCSS 变量 `$*`，严禁写死颜色值。**

## 任务清单

### 5.1 个人中心

#### 个人资料（src/pages/profile/ProfileInfoPage.vue）

布局：左侧 Tab 导航 + 右侧内容区（或使用 PageContainer 包裹）

内容：
- 头像区域：
  - el-upload 上传 + 裁剪预览
  - 支持点击上传和拖拽上传
  - 圆形头像预览（80x80）
- 可编辑字段：
  - 昵称(input, 必填)
  - 邮箱(input, 邮箱校验)
  - 手机号(input, 手机号校验)
  - 性别(radio: 男/女/保密)
  - 个人简介(textarea, 最多 200 字)
- 只读字段：
  - 用户名(显示, 不可编辑)
  - 角色(显示 el-tag)
  - 部门(显示)
- 底部保存按钮

用 ProForm 或直接用 el-form 实现。

#### 安全设置（src/pages/profile/ProfileSecurityPage.vue）

**修改密码**：
- 旧密码(password, 必填)
- 新密码(password, 必填, 密码强度校验)
  - 强度提示：弱/中/强，分别用 var(--cp-danger) / var(--cp-warning) / var(--cp-success) 颜色
  - 强度条：进度条动画
- 确认密码(password, 必填, 与新密码一致)
- 修改成功后清空表单 + ElMessage.success

**登录记录**：
- ProTable（静态，无搜索，无工具栏）
- 列：登录时间、IP、位置、设备、浏览器、状态(el-tag: 成功=success / 失败=danger)
- 最多展示 20 条
- 数据从 Mock 获取

### 5.2 消息中心

#### 站内消息（src/pages/message/MessageListPage.vue）

列表式消息卡片（不是标准表格，用自定义列表）：

布局：
```
[全部] [通知] [公告]    [全部已读] [批量删除]
────────────────────────────────────
● 消息标题                    时间
  消息内容摘要...
────────────────────────────────────
○ 消息标题                    时间
  消息内容摘要...
────────────────────────────────────
```

- Tab 筛选：全部 / 通知(notification) / 公告(announcement)
- 操作按钮：全部已读、批量删除（多选模式下）
- 每条消息卡片：
  - 左侧未读圆点（未读=主色 var(--cp-primary)，已读=无圆点或灰色 var(--cp-border)）
  - 标题 + 消息类型标签(el-tag: 通知=info / 公告=warning)
  - 内容摘要（2 行截断）
  - 右侧时间
  - 单条操作：标记已读 / 删除
- 点击消息：弹窗展示详情（el-dialog），同时标记为已读
- 底部 el-pagination 分页

#### 通知设置（src/pages/message/MessageSettingsPage.vue）

矩阵布局：
| 消息类型 | 站内通知 | 邮件通知 |
|---------|---------|---------|
| 系统通知 | switch | switch |
| 任务通知 | switch | switch |
| 审批通知 | switch | switch |
| 安全通知 | switch | switch |

用 el-table 或 el-form 实现，底部保存按钮。

### 5.3 组件演示

#### ProTable 演示（src/pages/components/TableDemoPage.vue）

用 PageContainer 包裹，包含多个演示区块：

1. 基础用法：静态数据 + 列配置
2. 搜索表单：input/select/date/daterange 各种控件
3. 分页：request 模式 + 分页
4. 选择：多选 + 批量操作
5. 操作列：按钮 + 确认框
6. 自定义渲染：slot 插槽
7. 工具栏：密度切换 + 列设置

每个演示区块用 el-card 包裹，标题 + 代码说明 + 实际组件。

#### ProForm 演示（src/pages/components/FormDemoPage.vue）

用 PageContainer 包裹：

1. 基础表单：各种字段类型展示
2. 表单校验：必填/格式/自定义规则
3. 联动：显隐联动 + 选项联动 + 禁用联动
4. 分步表单：3 步表单演示

#### DetailLayout 演示（src/pages/components/DetailDemoPage.vue）

用 PageContainer 包裹：

1. 描述列表：el-descriptions 展示键值对
2. 时间线：el-timeline 展示操作记录
3. 状态流转：el-steps 步骤条

## Mock 数据要求

确保 src/mock/profile.mock.ts 中有：
- 个人资料 Mock（GET /api/profile/info, PUT /api/profile/info）
- 修改密码 Mock（PUT /api/profile/password）
- 登录记录 Mock（GET /api/profile/login-logs，20 条）

确保 src/mock/message.mock.ts 中有：
- 消息列表 Mock（GET /api/message/list，支持分页 + type 筛选，30 条）
- 标记已读 Mock（PUT /api/message/:id/read）
- 全部已读 Mock（PUT /api/message/read-all）
- 删除消息 Mock（DELETE /api/message/:id）
- 通知设置 Mock（GET/PUT /api/message/settings）

## 不要修改的文件

- `src/pages/login/` 和 `src/pages/register/` 下所有文件
- 主题系统相关文件

## 验收标准

- [ ] 个人资料页可编辑保存
- [ ] 修改密码功能正常（强度提示 + 颜色用 CSS 变量）
- [ ] 登录记录列表正常
- [ ] 消息列表 Tab 切换/已读/删除正常
- [ ] 消息详情弹窗正常
- [ ] 通知设置矩阵正常
- [ ] 组件演示页内容丰富
- [ ] 所有样式使用 CSS 变量，明暗模式正常
- [ ] npm run dev 正常启动
