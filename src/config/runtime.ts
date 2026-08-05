import { computed, reactive } from 'vue'
import { microApps as defaultMicroApps } from './microApps'
import { mainMenus as defaultMainMenus } from './menus'
import type { ApplicationOption, MenuItem, MicroApp, PlatformSnapshot } from '@/types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const runtimeNavigation = reactive({
  mainMenus: clone(defaultMainMenus),
  microApps: clone(defaultMicroApps),
})
export const platformPreferences = reactive<Record<string, unknown>>({})

export const microMenus = computed<Record<string, MenuItem[]>>(() => Object.fromEntries(
  runtimeNavigation.microApps.filter(app => app.menus?.length).map(app => [app.code, app.menus!]),
))

export const applications = computed<ApplicationOption[]>(() => [
  { code: 'main', name: '通用', icon: 'HomeFilled', type: 'main' },
  ...runtimeNavigation.microApps
    .filter(app => app.status === 'published' && app.embedAllowed)
    .sort((a, b) => a.sort - b.sort)
    .map(app => ({ code: app.code, name: app.name, icon: app.icon, type: 'microapp' as const })),
])

export function applyPlatformSnapshot(snapshot: PlatformSnapshot) {
  runtimeNavigation.mainMenus.splice(0, runtimeNavigation.mainMenus.length, ...clone(snapshot.mainMenus))
  runtimeNavigation.microApps.splice(0, runtimeNavigation.microApps.length, ...clone(snapshot.microApps))
  Object.keys(platformPreferences).forEach(key => delete platformPreferences[key])
  Object.assign(platformPreferences, clone(snapshot.preferences || {}))
}

export function findRuntimeMicroApp(code: string): MicroApp | undefined {
  return runtimeNavigation.microApps.find(app => app.code === code)
}
