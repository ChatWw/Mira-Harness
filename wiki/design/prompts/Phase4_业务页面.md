你是一个 Vue 3 + TypeScript 专家。请帮我实现中后台系统的业务页面。

## 项目背景

技术栈：Vue 3.5 + TypeScript 5.7 + Element Plus 2.14 + Pinia 3.0 + SCSS + axios + Mock
路径别名：@ → src/
已有组件：ProTable（@/components/ProTable）、ProForm（@/components/ProForm）、PageContainer（@/components/PageContainer）
已有 hooks：useTable（@/hooks/useTable）、useDialog（@/hooks/useDialog）、usePermission（@/hooks/usePermission）
已有 API：userApi（@/api/user）、systemApi（@/api/system）
已有 Mock：src/mock/user.mock.ts、src/mock/system.mock.ts
已有指令：v-permission
权限标识规范：模块:资源:操作（如 system:user:create）

## 全局样式约束

**所有样式必须使用 CSS 变量 `var(--cp-*)` 或 SCSS 变量 `$*`，严禁写死颜色值。**
可用 CSS 变量：--cp-primary / --cp-primary-hover / --cp-primary-light / --cp-bg / --cp-bg-elevated / --cp-bg-overlay / --cp-bg-hover / --cp-text / --cp-text-secondary / --cp-text-tertiary / --cp-border / --cp-border-light / --cp-success / --cp-warning / --cp-danger / --cp-info
可用 SCSS 变量：$spacing-xs/sm/md/lg/xl/2xl / $font-xs/sm/base/lg/xl/2xl / $radius-sm/md/lg/xl / $shadow-sm/md/lg/xl / $transition-fast/base/slow / $breakpoint-xs/sm/md/lg/xl

## 任务清单

### 4.1 用户管理（src/pages/system/UserPage.vue）

使用 ProTable + ProForm 实现：

**表格列**：
| 列 | 字段 | 宽度 | 渲染 |
|----|------|------|------|
| 头像 | avatar | 60px | el-avatar |
| 用户名 | username | 120px | — |
| 昵称 | nickname | 120px | — |
| 手机号 | phone | 140px | — |
| 邮箱 | email | 180px | — |
| 角色 | roleName | 100px | el-tag type=primary |
| 部门 | deptName | 120px | — |
| 状态 | status | 80px | el-tag (1=success启用 / 0=danger禁用) |
| 创建时间 | createdAt | 160px | — |
| 操作 | — | 200px, fixed right | 编辑/重置密码/删除 |

**搜索栏**：用户名(input) + 手机号(input) + 状态(select: 启用/禁用) + 部门(tree-select)

**工具栏**：新增(v-permission="system:user:create") + 批量删除(confirm) + 批量启用 + 批量禁用 + 导出

**操作列**：编辑(v-permission="system:user:update") + 重置密码(confirm, v-permission="system:user:reset") + 删除(confirm, v-permission="system:user:delete")

**新增/编辑弹窗**（ProForm）：
- 用户名(input, 必填, 编辑时禁用)
- 昵称(input, 必填)
- 手机号(input, 必填, 手机号校验)
- 邮箱(input, 邮箱校验)
- 密码(input password, 新增必填, 密码强度校验)
- 部门(tree-select)
- 角色(select multiple, 必填)
- 状态(switch, 默认启用)

用 PageContainer 包裹，页头标题"用户管理"。

### 4.2 角色管理（src/pages/system/RolePage.vue）

**ProTable 列表**：
| 列 | 字段 |
|----|------|
| 角色名称 | roleName |
| 角色标识 | roleKey |
| 排序 | sort |
| 状态 | status (el-tag) |
| 创建时间 | createdAt |
| 操作 | 编辑 / 权限分配 / 删除 |

**搜索栏**：角色名称(input) + 状态(select)

**操作列**：编辑(v-permission="system:role:update") + 权限分配(v-permission="system:role:permission") + 删除(confirm, v-permission="system:role:delete")

**权限分配弹窗**（el-drawer 抽屉式）：
- 左侧：菜单权限树（el-tree），树结构：目录 > 菜单 > 按钮
  - 勾选节点代表该角色可访问的菜单
  - 父子联动：勾选父节点自动勾选所有子节点
  - 半选状态：部分子节点选中时父节点显示半选
  - 数据从 Mock 获取菜单树
- 右侧：数据权限范围选择
  - 全部数据(radio)
  - 本部门数据(radio)
  - 本部门及以下部门数据(radio)
  - 自定义部门(tree-select 多选, 选择"自定义部门"时显示)
- 底部：保存 / 取消

### 4.3 菜单管理（src/pages/system/MenuPage.vue）

**树形表格**（el-table with tree props）：
| 列 | 字段 |
|----|------|
| 菜单名称 | title (带缩进层级) |
| 图标 | icon (Element Plus 图标预览) |
| 排序 | sort |
| 权限标识 | permission |
| 类型 | type (el-tag: 目录=info / 菜单=primary / 按钮=warning) |
| 状态 | status (el-tag) |
| 操作 | 新增子菜单 / 编辑 / 删除 |

**拖拽排序**：同级拖拽，跨级不允许

**新增/编辑弹窗**（ProForm，根据 type 动态显隐字段）：
- 类型(radio: 目录/菜单/按钮)
- 名称(input, 必填)
- 图标(icon-picker, 目录和菜单显示)
- 排序(number)
- 路由路径(input, 菜单显示)
- 组件路径(input, 菜单显示)
- 权限标识(input, 菜单和按钮显示)
- 上级菜单(tree-select, 可选顶级)
- 状态(switch)

### 4.4 操作日志（src/pages/system/LogPage.vue）

**ProTable 列表**：
| 列 | 字段 |
|----|------|
| 操作人 | username |
| 操作类型 | type (el-tag: 新增=success / 修改=primary / 删除=danger / 其他=info) |
| 模块 | module |
| IP | ip |
| 操作时间 | createdAt |
| 操作内容 | content (截断显示, hover 展开 el-tooltip) |
| 操作 | 查看详情 |

**搜索栏**：时间范围(el-date-picker daterange) + 操作人(input) + 操作类型(select) + 模块(select)

**详情抽屉**（el-drawer）：
- 基本信息：操作人、操作类型、模块、IP、User-Agent、操作时间
- 请求参数：JSON 格式化展示（用 <pre> + JSON.stringify(json, null, 2)）
- 响应结果：JSON 格式化展示
- 耗时

**导出**：CSV 导出（前端生成，Blob 下载）

### 4.5 系统设置（src/pages/system/SettingsPage.vue）

**Tab 式布局**（el-tabs），3 个 Tab：

Tab 1 — 系统参数：
- 系统名称(input)
- Logo 地址(el-upload)
- 版权信息(input)
- 备案号(input)
- 默认首页(select: 工作台/用户管理 等)

Tab 2 — 通用配置：
- 默认分页大小(select: 10/20/50/100)
- Token 过期时间(number, 单位小时, 默认 24)
- 验证码开关(switch)
- 记住我默认(switch)

Tab 3 — 安全策略：
- 密码最小长度(number, 默认 8)
- 密码复杂度(checkbox-group: 大写/小写/数字/特殊字符)
- 登录失败锁定次数(number, 默认 5)
- 锁定时长(number, 单位分钟, 默认 30)
- 账号有效期(number, 单位天, 0=永久)

底部统一保存按钮（Tab 切换不丢失数据，用 reactive 对象统一管理）

### 4.6 部门管理（src/pages/system/DeptPage.vue）

**左树右表布局**（el-row + el-col）：
- 左侧 30%：部门组织架构树（el-tree）
  - 节点：部门名称 + 人数
  - 右键菜单(el-dropdown)：新增子部门 / 编辑 / 删除
  - 拖拽排序
  - 搜索过滤(el-input)
- 右侧 70%：选中部门下的成员列表（ProTable）
  - 列：头像、用户名、昵称、角色、状态
  - 操作：移出部门(confirm) / 修改角色(弹窗)

**部门 CRUD 弹窗**（ProForm）：
- 上级部门(tree-select, 可选顶级)
- 部门名称(input, 必填)
- 负责人(select, 用户列表)
- 排序(number)
- 状态(switch)

## Mock 数据要求

确保 src/mock/system.mock.ts 中有完整的 Mock 数据支持以上所有页面的操作：
- 用户列表 20+ 条（含分页搜索）
- 角色列表 5+ 条
- 菜单树完整（目录/菜单/按钮三级）
- 操作日志 30+ 条（含各种类型）
- 系统设置默认值
- 部门树 3 层以上（含人员关联）

## 不要修改的文件

- `src/pages/login/` 和 `src/pages/register/` 下所有文件
- 主题系统相关文件

## 验收标准

- [ ] 6 个系统管理页面全部可用
- [ ] ProTable 的搜索/分页/排序/选择正常
- [ ] ProForm 的校验/联动正常
- [ ] 权限分配树正常（父子联动/半选）
- [ ] 菜单管理拖拽排序正常
- [ ] 操作日志详情抽屉正常
- [ ] 系统设置 Tab 切换不丢数据
- [ ] 部门管理左树右表联动正常
- [ ] v-permission 指令在按钮上正常工作
- [ ] 所有样式使用 CSS 变量，明暗模式正常
- [ ] npm run dev 正常启动
