import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { runtimeNavigation } from '@/config/runtime'
import { APP_NAME, useLayoutStore } from '@/stores/layout'
import type { MenuItem } from '@/types'
import { createBusinessRoute } from './pageRegistry'
import { HARNESS_WORKBENCH_PATH } from '@/platform/firstPartyNavigation'

const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/settings/conversation',
    name: 'SettingsConversation',
    component: () => import('@/pages/backend/conversation/index.vue'),
    meta: { title: '对话设置' },
  },
  {
    path: '/settings/file-trash',
    name: 'SettingsFileTrash',
    component: () => import('@/pages/backend/fileTrash/index.vue'),
    meta: { title: '文件回收站' },
  },
  {
    path: '/settings/app-extensions',
    name: 'SettingsAppExtensions',
    component: () => import('@/pages/backend/appExtensions/index.vue'),
    meta: { title: '应用扩展' },
  },
  {
    path: '/settings/plugins',
    name: 'SettingsPlugins',
    component: () => import('@/pages/backend/plugins/index.vue'),
    meta: { title: '工具与扩展' },
  },
  {
    path: '/settings/model-config',
    name: 'SettingsModelConfig',
    component: () => import('@/pages/backend/modelConfig/index.vue'),
    meta: { title: '模型服务' },
  },
  {
    path: '/settings/mcp',
    name: 'SettingsMcp',
    component: () => import('@/pages/backend/mcpConfig/index.vue'),
    meta: { title: 'MCP 服务' },
  },
  {
    path: '/settings/python-environment',
    name: 'SettingsPythonEnvironment',
    redirect: to => ({ path: '/settings/general', query: to.query }),
  },
  {
    path: '/settings/git',
    name: 'SettingsGit',
    redirect: to => ({ path: '/settings/general', query: to.query }),
  },
  {
    path: '/settings/file-search',
    name: 'SettingsFileSearch',
    component: () => import('@/pages/backend/fileSearch/index.vue'),
    meta: { title: '文件搜索' },
  },
  {
    path: '/settings/hooks',
    name: 'SettingsHooks',
    component: () => import('@/pages/backend/hooks/index.vue'),
    meta: { title: '事件钩子（Hooks）' },
  },
  {
    path: '/settings/commands',
    name: 'SettingsPromptCommands',
    component: () => import('@/pages/backend/promptCommands/index.vue'),
    meta: { title: '自定义命令' },
  },
  {
    path: '/settings/agents',
    name: 'SettingsUserAgents',
    component: () => import('@/pages/backend/agents/index.vue'),
    meta: { title: '子智能体' },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/pages/backend/settings/index.vue'),
    meta: { title: '设置' },
  },
  {
    path: '/settings/general',
    name: 'SettingsGeneral',
    component: () => import('@/pages/backend/general/index.vue'),
    meta: { title: '常规' },
  },
  {
    path: '/settings/permissions',
    name: 'SettingsPermissions',
    redirect: to => ({ path: '/settings/conversation', query: to.query }),
  },
  {
    path: '/settings/appearance',
    name: 'SettingsAppearance',
    redirect: to => ({ path: '/settings/general', query: to.query }),
  },
  {
    path: '/settings/personalization/instructions',
    name: 'settings-personalization-instructions',
    component: () => import('@/pages/backend/personalization/Instructions.vue'),
    meta: { title: 'Mira 指令' },
  },
  {
    path: '/settings/personalization',
    name: 'SettingsPersonalization',
    component: () => import('@/pages/backend/personalization/index.vue'),
    meta: { title: '指令与记忆' },
  },
  {
    path: '/settings/keyboard-shortcuts',
    name: 'SettingsShortcuts',
    component: () => import('@/pages/backend/keyboardShortcuts/index.vue'),
    meta: { title: '键盘快捷键' },
  },
  {
    path: '/settings/archives',
    name: 'SettingsArchives',
    component: () => import('@/pages/backend/archives/index.vue'),
    meta: { title: '会话归档' },
  },
  {
    path: '/settings/usage',
    name: 'SettingsUsage',
    component: () => import('@/pages/backend/usage/index.vue'),
    meta: { title: '用量统计' },
  },
  {
    path: '/settings/about',
    name: 'SettingsAbout',
    component: () => import('@/pages/backend/about/index.vue'),
    meta: { title: '关于Mira' },
  },
  {
    path: '/settings/ai-novel',
    name: 'SettingsAiNovel',
    redirect: '/settings/model-config',
    meta: { title: '模型服务' },
  },
  {
    path: '/system/components/loading',
    redirect: '/settings/general',
  },
  {
    path: '/system/components/icon-selector',
    redirect: '/settings/general',
  },
  {
    path: '/system/menus',
    redirect: '/settings/general',
  },
  {
    path: '/system/micro-apps',
    redirect: '/settings/general',
  },
  {
    path: '/system/backup-preferences',
    redirect: '/settings/general',
  },
  {
    // 未知设置项回退到默认设置页，兼容旧链接
    path: '/settings/:pathMatch(.*)*',
    redirect: to => ({ path: '/settings/general', query: to.query }),
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/pages/exception/index.vue'),
    meta: { title: '页面不存在' },
  },
]

const layoutRoute: RouteRecordRaw = {
  path: '/',
  redirect: HARNESS_WORKBENCH_PATH,
  component: () => import('@/layouts/index.vue'),
  children: [
    { path: HARNESS_WORKBENCH_PATH, name: 'HarnessReact', component: () => import('@/pages/frontend/harness/react/index.vue'), meta: { title: 'Mira Harness', showPageHeader: false, noPageTransition: true } },
    {
      path: '/workspace',
      redirect: HARNESS_WORKBENCH_PATH,
      component: () => import('@/pages/frontend/harness/LegacyHarnessLayout.vue'),
      meta: { noPageTransition: true },
      children: [
        { path: 'chat', name: 'HarnessChat', component: () => import('@/pages/frontend/harness/index.vue'), meta: { title: '新对话', showPageHeader: false, noPageTransition: true } },
        { path: 'chat/:id', name: 'HarnessSession', component: () => import('@/pages/frontend/harness/index.vue'), meta: { title: 'Agent 工作台', showPageHeader: false, noPageTransition: true } },
        { path: 'projects', name: 'HarnessProjects', component: () => import('@/pages/frontend/harness/projects/index.vue'), meta: { title: '项目', noPageTransition: true } },
        { path: 'history', name: 'HarnessHistory', component: () => import('@/pages/frontend/harness/history/index.vue'), meta: { title: '查看全部对话', noPageTransition: true } },
        { path: 'usage', name: 'HarnessUsage', component: () => import('@/pages/frontend/harness/usage/index.vue'), meta: { title: '用量与成本', noPageTransition: true } },
        { path: 'automations', name: 'HarnessAutomations', component: () => import('@/pages/frontend/harness/automations/index.vue'), meta: { title: '自动化', noPageTransition: true } },
      ],
    },
    ...(import.meta.env.DEV ? [{ path: '/workspace/harness-prototype', name: 'HarnessReactPrototype', component: () => import('@/pages/frontend/harness/prototype/index.vue'), meta: { title: 'Harness React 原型', showPageHeader: false, noPageTransition: true } }] : []),
    ...(import.meta.env.DEV ? [{ path: '/workspace/harness-pilot', name: 'HarnessReactPilot', component: () => import('@/pages/frontend/harness/pilot/index.vue'), meta: { title: 'Harness React 接入试验', showPageHeader: false, noPageTransition: true } }] : []),
    {
      path: '/micro/:code/:pathMatch(.*)*',
      name: 'MicroAppHost',
      component: () => import('@/pages/frontend/microAppHost/index.vue'),
      meta: { title: '微应用' },
    },
  ],
}

const router = createRouter({
  history: window.location.protocol === 'file:'
    ? createWebHashHistory()
    : createWebHistory(),
  routes: [...staticRoutes, { ...layoutRoute, name: 'Layout' }],
})

export function updateDocumentTitle(menuTitle?: unknown) {
  const title = typeof menuTitle === 'string' ? menuTitle : ''
  document.title = useLayoutStore().config.dynamicTitle && title
    ? `${title} - ${APP_NAME}`
    : APP_NAME
}

function flattenMenus(menus: MenuItem[]): MenuItem[] {
  return menus.flatMap(menu => [menu, ...(menu.children ? flattenMenus(menu.children) : [])])
}

let removeBusinessRoutes: Array<() => void> = []

export function syncBusinessRoutes() {
  removeBusinessRoutes.forEach(removeRoute => removeRoute())
  removeBusinessRoutes = []
  flattenMenus(runtimeNavigation.mainMenus)
    .filter(menu => menu.type === 'menu' && menu.path && menu.target)
    .map(createBusinessRoute)
    .filter((route): route is RouteRecordRaw => route !== null)
    .forEach(route => removeBusinessRoutes.push(router.addRoute('Layout', route)))
}

syncBusinessRoutes()

router.addRoute({ path: '/:pathMatch(.*)*', redirect: '/404' })

export default router
