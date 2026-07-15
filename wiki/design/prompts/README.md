# Claude 分阶段实施提示词

> 每个 Phase 都是独立文件，包含完整的上下文和约束，可直接丢给 Claude 执行。
> 
> **使用方式**：
> 1. 在 Claude Code 中 `@Phase1_基础设施.md` 引用文件
> 2. 或在 Claude 网页版中上传对应文件
> 3. 执行完成后按验收标准检查
> 4. 确认无误后再进入下一个 Phase
>
> **依赖关系是线性的，必须按顺序执行：**
> 
> Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

## 文件清单

| 顺序 | 文件 | 内容 | 核心产出 |
|------|------|------|---------|
| 1 | `Phase1_基础设施.md` | 清理技术债务 + API层 + Mock + Store + 指令 | axios封装、vite-plugin-mock、permission/tabs store |
| 2 | `Phase2_布局重构.md` | Layout分层 + 配置面板 + 动态路由 + 顶栏增强 | 5种布局模式、28+项配置面板、面包屑/搜索/通知/多标签页 |
| 3 | `Phase3_核心组件.md` | ProTable + ProForm + hooks | schema驱动的表格和表单组件 |
| 4 | `Phase4_业务页面.md` | 6个系统管理页面 | 用户/角色/菜单/日志/设置/部门管理 |
| 5 | `Phase5_扩展页面.md` | 个人中心 + 消息中心 + 组件演示 | 资料/密码/消息列表/通知设置/组件demo |
| 6 | `Phase6_打磨.md` | ECharts + 视觉统一 + 暗色检查 + 响应式 | Dashboard增强、图表主题、响应式适配 |

## 每个提示词的通用约束

- 所有样式必须使用 CSS 变量 `var(--cp-*)` 或 SCSS 变量 `$*`，严禁写死颜色值
- 不要修改登录页和注册页（`src/pages/login/` 和 `src/pages/register/`）
- 不要修改主题系统（`src/stores/theme.ts`、`src/config/theme.ts`、`src/styles/variables.scss`、`src/styles/mixins.scss`）
- TypeScript 严格模式，不能有 any 滥用
- 每个 Phase 完成后 `npm run dev` 必须能正常启动

## 设计文档

完整产品设计文档见：`../PRODUCT_DESIGN_V2.md`
