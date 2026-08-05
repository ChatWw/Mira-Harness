# Core Platform

基于 Vue 3、TypeScript 和 Vite 的个人工具应用壳。项目不依赖登录、用户体系或后端菜单服务；打开应用会直接进入“通用”区域的概览页，本地页面、网页菜单与微应用均从 TypeScript 清单加载。

## 当前能力

- 本地资源清单：应用切换器、侧边栏、标签页、面包屑和全局搜索共享 [`src/config/navigation.ts`](./src/config/navigation.ts) 的导航解析结果。
- 直达概览：根路径重定向到 `/dashboard`；未注册路径会落到 404。
- 两种布局：`侧边栏+顶栏` 与 `仅侧边栏`，可在全局配置中切换并持久化。
- 主题与外观：亮/暗模式、主题色、圆角、动画、标签页、面包屑、底栏和水印等全局配置。
- 通用网页：`mainMenus` 同时支持本地 Vue 页面和稳定平台路径对应的 iframe 网页。
- 微应用宿主：支持 Wujie 和 iframe；是否显示二级菜单只由应用是否配置可见 `menus` 决定。
- iframe 策略：统一支持 `strict`、`compatible` 和 `external`，其中 `compatible` 为默认值，`external` 直接在新窗口打开。

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

默认地址为 [http://localhost:9000](http://localhost:9000)，会直接跳转到概览。

### 生产构建

```bash
npm run build
```

构建命令会依次执行 `vue-tsc` 和 Vite 构建，并将构建时间、耗时、分支、提交和工作区状态写入 `dist/build-log.txt`。

### 预览构建产物

```bash
npm run preview
```

## 工具、路由与应用

### 通用菜单

编辑 [`src/config/menus.ts`](./src/config/menus.ts) 中的 `mainMenus`：

本地 Vue 页面通过页面白名单注册，`component` 必须指向 `src/pages` 下已有的 Vue 页面：

```ts
{
  id: 'example',
  title: '示例页面',
  icon: 'Document',
  type: 'menu',
  path: '/example',
  target: {
    type: 'component',
    component: '/src/pages/example/ExamplePage.vue',
  },
}
```

iframe 网页使用同样稳定的平台路径：

```ts
{
  id: 'docs',
  title: '文档',
  type: 'menu',
  path: '/docs',
  target: {
    type: 'iframe',
    url: 'https://example.com/docs',
    iframePolicy: { profile: 'compatible' },
  },
}
```

iframe 权限由 [`src/config/iframe.ts`](./src/config/iframe.ts) 集中映射，业务配置不直接拼接 `sandbox` 字符串：

- `strict`：保持严格隔离，不授予 `allow-same-origin`。
- `compatible`：增加同源语义、下载、弹窗逃逸和全屏等站点兼容能力，为默认策略。
- `external`：不创建平台页面，由导航入口直接新窗口打开。

### 微应用

编辑 [`src/config/microApps.ts`](./src/config/microApps.ts)。`microApps` 是微应用入口、集成模式、运行参数和可选子菜单的唯一来源；`microMenus` 与 `applications` 由其派生。

微应用菜单同时声明平台路径和子应用真实路径：

```ts
{
  id: 'order-users',
  title: '用户管理',
  type: 'microapp',
  path: '/micro/order/users',
  target: { type: 'microapp', childPath: '/users' },
}
```

- 无可见菜单时，应用入口为 `/micro/:code`，二级菜单自动隐藏。
- 有可见菜单时，应用切换器进入第一个可见菜单。
- Wujie 关闭内置查询参数同步，由平台路径 `/micro/:code/*` 统一表示当前子页。
- iframe 可根据 `childPath` 单向生成目标 URL；跨域 iframe 内部跳转不保证反向同步平台地址。

#### Wujie 路由桥

平台通过 props 向可改造的子应用提供 `platformRoute` 和 `navigate(path)`，并通过 Wujie bus 发送：

- `platform:route-change`：平台路由变化，payload 为 `{ appCode, path }`。
- `platform:route-change:<appCode>`：应用级定向事件，payload 相同。

子应用可调用 `navigate(path)`，或发送 `platform:navigate` 及 `{ appCode, path }`，由平台更新 `/micro/:code/*`。该双向契约只适用于可改造的 Wujie 子应用，不对任意第三方网站承诺路由同步。

### 路由规则

| 路径 | 行为 |
| --- | --- |
| `/` | 重定向到 `/dashboard` |
| 通用菜单路径 | 由 `mainMenus` 自动注册本地页或网页宿主页 |
| `/micro/:code/:pathMatch(.*)*` | 微应用宿主页 |
| `/404` | 404 页面 |
| 其他路径 | 重定向到 `/404` |

## 布局说明

### 侧边栏+顶栏（默认）

- 顶栏左侧：品牌、侧边栏折叠按钮、面包屑。
- 顶栏右侧：应用切换器、搜索、全屏、主题、全局配置。
- 工作区：标签栏、页面内容和可选底栏；不再额外渲染工作区工具栏。

### 仅侧边栏

- 最左侧窄应用栏始终存在；当前应用有可见菜单时，再在其右侧显示二级菜单。
- 窄应用栏不显示头像或账户入口。
- 工作区工具栏保留折叠、面包屑和常用工具按钮。

`侧边栏+顶栏` 的内嵌样式在无二级菜单时会为主工作区保留对称的左右间距。

布局配置由 [`src/stores/layout.ts`](./src/stores/layout.ts) 管理，并通过 Pinia 持久化插件保存在浏览器本地。

## 目录结构

```text
src/
├── app/                         # 应用根组件
├── asset/                       # 品牌与静态资源
├── components/                  # 通用组件（面包屑、搜索、通知等）
├── config/
│   ├── iframe.ts                # iframe 策略与 URL 解析
│   ├── microApps.ts             # 本地微应用清单与运行参数
│   ├── menus.ts                 # 壳导航与从清单派生的应用导航
│   ├── navigation.ts            # 统一导航、入口与路由映射
│   └── theme.ts                 # 主题预设
├── layouts/
│   ├── index.vue                # 两种布局的装配入口
│   └── components/              # 顶栏、侧栏、标签栏、设置面板等
├── pages/                       # 页面组件
│   ├── dashboard/               # 概览
│   ├── system/                  # 网页与微应用宿主页
│   └── exception/               # 异常页面
├── router/
│   ├── index.ts                 # 路由创建与本地菜单注册
│   └── pageRegistry.ts          # 页面组件白名单注册器
├── stores/                      # 应用、布局、主题状态
├── styles/                      # 全局样式与 Element Plus 覆盖
└── main.ts                      # 应用入口
```

## 开发约定

- 新增通用页面或网页时，在 `src/config/menus.ts` 中定义对应 `target`；新增微应用时，修改 `src/config/microApps.ts`。
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
