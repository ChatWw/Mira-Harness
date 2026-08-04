import type { MicroApp } from '@/types'

// The local manifest is the single source of truth for embedded applications.
export const microApps: MicroApp[] = [
  {
    id: 'micro-data-board',
    name: '数据看板',
    code: 'data-board',
    url: '/apps/data-board/index.html',
    icon: 'DataAnalysis',
    sort: 0,
    status: 'published',
    integrationMode: 'wujie',
    healthStatus: 'healthy',
    embedAllowed: true,
    version: 'v1.2.0',
    description: '业务数据可视化看板',
    menus: [
      { id: 'data-board-home', title: '数据总览', icon: 'DataAnalysis', type: 'microapp', path: '/micro/data-board', appCode: 'data-board', sort: 0, status: 1 },
      { id: 'data-board-report', title: '趋势分析', icon: 'TrendCharts', type: 'microapp', path: '/micro/data-board/trends', appCode: 'data-board', sort: 1, status: 1 },
    ],
    runtimeConfig: {
      alive: true,
      sync: true,
      fiber: false,
      prefix: {},
      props: { theme: 'light' },
      preload: false,
      exec: false,
      iframe: { sandbox: 'allow-scripts allow-forms allow-popups', referrerPolicy: 'strict-origin-when-cross-origin', timeout: 15 },
    },
  },
  {
    id: 'micro-workflow',
    name: '流程审批',
    code: 'workflow',
    url: '/apps/workflow/index.html',
    icon: 'Connection',
    sort: 1,
    status: 'published',
    integrationMode: 'iframe',
    healthStatus: 'healthy',
    embedAllowed: true,
    version: 'v2.0.1',
    description: '流程审批工具',
    runtimeConfig: {
      alive: false,
      sync: false,
      fiber: false,
      prefix: {},
      props: {},
      preload: false,
      exec: false,
      iframe: { sandbox: 'allow-scripts allow-forms allow-popups', referrerPolicy: 'strict-origin-when-cross-origin', timeout: 15 },
    },
  },
]

export function findMicroApp(code: string) {
  return microApps.find(app => app.code === code)
}
