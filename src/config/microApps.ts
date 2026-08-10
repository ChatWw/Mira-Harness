import type { MicroApp } from '@/types'

// 内置微应用编码：入口锁定，只允许停用/启用，不可删除。
export const BUILT_IN_MICRO_APP_CODES = ['ai-novel'] as const

export function isBuiltInMicroApp(code: string) {
  return (BUILT_IN_MICRO_APP_CODES as readonly string[]).includes(code)
}

// 内置微应用资源包：随安装包分发的静态目录，由 LocalMicroAppServer 解析。
export const BUILT_IN_MICRO_APP_PACKAGES = ['novel-generator'] as const

export function isBuiltInMicroAppPackage(pkg: string) {
  return (BUILT_IN_MICRO_APP_PACKAGES as readonly string[]).includes(pkg)
}

// The local manifest is the single source of truth for embedded applications.
export const microApps: MicroApp[] = [
  {
    id: 'micro-ai-novel',
    name: 'AI 小说创作',
    code: 'ai-novel',
    entry: { type: 'builtin', package: 'novel-generator' },
    icon: 'lucide:book-open',
    sort: 10,
    enabled: true,
    // 该上游项目是 legacy 页面，使用 iframe 做完整 CSS/DOM/事件隔离。
    integrationMode: 'iframe',
    description: '基于提示词的智能小说创作生产力工具',
    runtimeConfig: { kind: 'iframe', iframe: { profile: 'compatible', timeout: 5 } },
    menus: [
      {
        id: 'ai_novel_home',
        title: '小说创作',
        type: 'menu',
        path: '/micro/ai-novel',
        target: { type: 'microapp', childPath: '' },
        appCode: 'ai-novel',
        sort: 0,
        status: 1,
        visible: true,
        showPageHeader: false,
      },
    ],
  },
]

export function findMicroApp(code: string) {
  return microApps.find(app => app.code === code)
}
