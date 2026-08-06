import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useLayoutStore } from './layout'
import { getPreference, savePreference } from '@/platform'
import { activateRouteCache, evictRouteCache } from '@/router/routeCache'

export interface TabItem {
  path: string
  title: string
  name: string
  cacheName?: string
  icon?: string
  closable: boolean
  lastAccess: number
}

const DASHBOARD_TAB: Omit<TabItem, 'lastAccess'> = {
  path: '/dashboard',
  title: '概览',
  name: 'Dashboard',
  icon: 'Odometer',
  closable: false,
}

export const useTabsStore = defineStore('tabs', () => {
  const layoutStore = useLayoutStore()
  const persistenceEnabled = layoutStore.config.tabPersist
  const persistedState = persistenceEnabled ? loadPersistedState() : undefined
  const tabs = ref<TabItem[]>(persistedState?.tabs ?? [])
  const activeTab = ref<string>(persistedState?.activeTab ?? '')

  if (!tabs.value.some(tab => tab.path === DASHBOARD_TAB.path)) {
    tabs.value.unshift({ ...DASHBOARD_TAB, lastAccess: Date.now() })
  }

  if (!persistenceEnabled) {
    sessionStorage.removeItem('cp-tabs')
  }

  watch([tabs, activeTab], persistState, { deep: true })

  watch(
    () => layoutStore.config.tabPersist,
    (enabled) => {
      if (enabled) {
        persistState()
      } else {
        sessionStorage.removeItem('cp-tabs')
      }
    }
  )

  function addTab(tab: TabItem) {
    const existing = tabs.value.find(t => t.path === tab.path)
    if (existing) {
      existing.title = tab.title
      existing.name = tab.name
      existing.cacheName = tab.cacheName
      existing.icon = tab.icon
      existing.closable = tab.closable
      existing.lastAccess = Date.now()
      activeTab.value = tab.path
      activateRouteCache(tab.cacheName)
      return
    }
    tabs.value.push(tab)
    activeTab.value = tab.path
    activateRouteCache(tab.cacheName)
  }

  function closeTab(path: string) {
    const index = tabs.value.findIndex(t => t.path === path)
    if (index === -1) return
    evictRouteCache(tabs.value[index].cacheName)
    tabs.value.splice(index, 1)
    if (activeTab.value === path) {
      const next = tabs.value[index] || tabs.value[index - 1]
      activeTab.value = next ? next.path : '/dashboard'
    }
  }

  function closeOthers(path: string) {
    tabs.value.filter(tab => tab.closable && tab.path !== path).forEach(tab => evictRouteCache(tab.cacheName))
    tabs.value = tabs.value.filter(t => !t.closable || t.path === path)
    activeTab.value = path
  }

  function closeLeft(path: string) {
    const index = tabs.value.findIndex(t => t.path === path)
    tabs.value.filter((tab, i) => i < index && tab.closable).forEach(tab => evictRouteCache(tab.cacheName))
    tabs.value = tabs.value.filter((t, i) => i >= index || !t.closable)
  }

  function closeRight(path: string) {
    const index = tabs.value.findIndex(t => t.path === path)
    tabs.value.filter((tab, i) => i > index && tab.closable).forEach(tab => evictRouteCache(tab.cacheName))
    tabs.value = tabs.value.filter((t, i) => i <= index || !t.closable)
  }

  function closeAll() {
    tabs.value.filter(tab => tab.closable).forEach(tab => evictRouteCache(tab.cacheName))
    tabs.value = tabs.value.filter(t => !t.closable)
    activeTab.value = '/dashboard'
  }

  function reorderTabs() {
    const dashboard = tabs.value.find(tab => tab.path === '/dashboard')
    const otherTabs = tabs.value.filter(tab => tab.path !== '/dashboard')
    tabs.value = dashboard ? [dashboard, ...otherTabs] : otherTabs
  }

  function persistState() {
    if (!layoutStore.config.tabPersist) return
    sessionStorage.setItem('cp-tabs', JSON.stringify({ tabs: tabs.value, activeTab: activeTab.value }))
    savePreference('tabs', { tabs: tabs.value, activeTab: activeTab.value })
  }

  function loadPersistedState(): { tabs: TabItem[]; activeTab: string } | undefined {
    try {
      const stored = getPreference('tabs', sessionStorage.getItem('cp-tabs'))
      if (!stored) return

      const state = (typeof stored === 'string' ? JSON.parse(stored) : stored) as { tabs?: TabItem[]; activeTab?: string }
      if (!Array.isArray(state.tabs) || typeof state.activeTab !== 'string') return
      return { tabs: state.tabs, activeTab: state.activeTab }
    } catch {
      sessionStorage.removeItem('cp-tabs')
    }
  }

  return { tabs, activeTab, addTab, closeTab, closeOthers, closeLeft, closeRight, closeAll, reorderTabs }
})
