import type { RouteRecordRaw } from 'vue-router'
import type { RouteDefinition } from '@/types'

// Vite 在构建时枚举可加载页面；接口只能引用这份白名单中的 component 路径。
// 这样路径与菜单数据可配置，同时不会把任意字符串交给动态 import 执行。
const pageModules = import.meta.glob('/src/pages/**/*.vue')

export function createBusinessRoute(definition: RouteDefinition): RouteRecordRaw | null {
  const component = pageModules[definition.component]
  if (!component) {
    console.warn(`菜单组件不存在或不在允许目录内: ${definition.component}`)
    return null
  }
  return {
    path: definition.path,
    name: definition.name,
    component,
    meta: { title: definition.title, permission: definition.permission },
  }
}
