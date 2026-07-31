# 中台基座

基于 Vue 3、TypeScript 和 Vite 的前端中台壳工程。项目以本地 TypeScript 菜单配置提供页面导航与路由注册，打开应用会直接进入工作台，无需登录。

## 当前能力

- 本地菜单与应用配置：菜单、应用切换器和业务页面路由都由 [`src/config/menus.ts`](./src/config/menus.ts) 提供。
- 免登录访问：根路径重定向到 `/dashboard`；`/login`、`/register` 不再注册为路由，访问会落到 404。
- 两种布局：`侧边栏+顶栏` 与 `仅侧边栏`，可在全局配置中切换并持久化。
- 顶栏工作区：在“侧边栏+顶栏”布局下，菜单折叠与面包屑在品牌标题后；搜索、通知、全屏、主题和全局配置在顶栏右侧。
- 菜单与页面：工作台、系统管理、个人中心，以及数据看板等微应用入口。
- 主题与外观：亮/暗模式、主题色、圆角、动画、标签页、面包屑、底栏和水印等全局配置。
- 微应用宿主：支持 Wujie 和受控 iframe 两种嵌入模式。

登录、注册以及 user/permission store 等历史代码仍保留在仓库中，方便后续按需恢复或对接；它们不参与当前应用启动和路由流程。

## 技术栈

- Vue 3 + Composition API
- TypeScript
- Vite
- Vue Router
- Pinia + pinia-plugin-persistedstate
- Element Plus
- SCSS + CSS Variables
- Wujie Vue 3

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发

```bash
npm run dev
```

默认地址为 [http://localhost:9000](http://localhost:9000)，会直接跳转到工作台。

### 生产构建

```bash
npm run build
```

构建命令会依次执行 `vue-tsc` 和 Vite 构建，并将构建时间、耗时、分支、提交和工作区状态写入 `dist/build-log.txt`。

### 预览构建产物

```bash
npm run preview
```

## 菜单、路由与应用

### 修改菜单

编辑 [`src/config/menus.ts`](./src/config/menus.ts)：

- `mainMenus`：主应用侧边栏和本地业务路由。
- `microMenus`：按微应用编码组织的侧边栏菜单。
- `applications`：顶栏或窄应用栏的应用切换器。

主应用中 `type: 'menu'` 且同时具备 `path`、`component` 的菜单项，会在应用初始化时由 [`src/router/index.ts`](./src/router/index.ts) 注册到布局路由中。`component` 必须指向 `src/pages` 下已有的 Vue 页面，例如：

```ts
{
  id: 'example',
  title: '示例页面',
  icon: 'Document',
  type: 'menu',
  path: '/example',
  component: '/src/pages/example/ExamplePage.vue',
}
```

菜单的 `permission` 字段仅为兼容既有数据结构保留，当前不参与过滤或路由守卫。

### 路由规则

| 路径 | 行为 |
| --- | --- |
| `/` | 重定向到 `/dashboard` |
| 主应用菜单路径 | 由 `mainMenus` 自动注册 |
| `/micro/:code/:pathMatch(.*)*` | 微应用宿主页 |
| `/404` | 404 页面 |
| 其他路径（含 `/login`、`/register`） | 重定向到 `/404` |

## 布局说明

### 侧边栏+顶栏（默认）

- 顶栏左侧：品牌、侧边栏折叠按钮、面包屑。
- 顶栏右侧：应用切换器、搜索、通知、全屏、主题、全局配置。
- 工作区：标签栏、页面内容和可选底栏；不再额外渲染工作区工具栏。

### 仅侧边栏

- 左侧为窄应用栏和菜单侧边栏，窄应用栏不显示头像或账户入口。
- 工作区工具栏保留折叠、面包屑和常用工具按钮。

布局配置由 [`src/stores/layout.ts`](./src/stores/layout.ts) 管理，并通过 Pinia 持久化插件保存在浏览器本地。

## 目录结构

```text
src/
├── app/                         # 应用根组件
├── asset/                       # 品牌与静态资源
├── components/                  # 通用组件（面包屑、搜索、通知等）
├── config/
│   ├── menus.ts                 # 当前菜单与应用配置
│   └── theme.ts                 # 主题预设
├── layouts/
│   ├── index.vue                # 两种布局的装配入口
│   └── components/              # 顶栏、侧栏、标签栏、设置面板等
├── pages/                       # 页面组件
│   ├── dashboard/               # 工作台
│   ├── system/                  # 系统与微应用页面
│   ├── profile/                 # 个人中心页面
│   ├── login/ and register/     # 保留但未注册的历史页面
│   └── exception/               # 异常页面
├── router/
│   ├── index.ts                 # 路由创建与本地菜单注册
│   └── pageRegistry.ts          # 页面组件白名单注册器
├── stores/                      # 应用、布局、主题状态
├── styles/                      # 全局样式与 Element Plus 覆盖
└── main.ts                      # 应用入口
```

## 开发约定

- 新增页面时，同时在 `src/config/menus.ts` 中定义菜单项；不要在路由守卫中请求菜单接口。
- 菜单对应的页面组件路径必须可被 `src/router/pageRegistry.ts` 的 `import.meta.glob('/src/pages/**/*.vue')` 找到。
- 保持现有 SCSS 设计令牌与 CSS 变量用法，避免无关格式化或重构。
- 提交前至少执行：

  ```bash
  npm run build
  git diff --check
  ```

- `npm run build` 是静态类型检查和生产构建，不替代浏览器中的交互验收。

## 相关文档

- [Wiki 首页](./wiki/README.md)
- [SCSS 迁移指南](./wiki/guides/SCSS_MIGRATION_GUIDE.md)
- [SCSS 快速参考](./wiki/references/SCSS_QUICK_REFERENCE.md)

## 许可证

MIT
