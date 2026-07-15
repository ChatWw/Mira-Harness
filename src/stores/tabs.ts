import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TabItem {
  path: string
  title: string
  name: string
  icon?: string
  closable: boolean
  lastAccess: number
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>([])
  const activeTab = ref<string>('')

  function addTab(tab: TabItem) {
    const existing = tabs.value.find(t => t.path === tab.path)
    if (existing) {
      existing.lastAccess = Date.now()
      activeTab.value = tab.path
      return
    }
    tabs.value.push(tab)
    activeTab.value = tab.path
  }

  function closeTab(path: string) {
    const index = tabs.value.findIndex(t => t.path === path)
    if (index === -1) return
    tabs.value.splice(index, 1)
    if (activeTab.value === path) {
      const next = tabs.value[index] || tabs.value[index - 1]
      activeTab.value = next ? next.path : '/dashboard'
    }
  }

  function closeOthers(path: string) {
    tabs.value = tabs.value.filter(t => !t.closable || t.path === path)
    activeTab.value = path
  }

  function closeLeft(path: string) {
    const index = tabs.value.findIndex(t => t.path === path)
    tabs.value = tabs.value.filter((t, i) => i >= index || !t.closable)
  }

  function closeRight(path: string) {
    const index = tabs.value.findIndex(t => t.path === path)
    tabs.value = tabs.value.filter((t, i) => i <= index || !t.closable)
  }

  function closeAll() {
    tabs.value = tabs.value.filter(t => !t.closable)
    activeTab.value = '/dashboard'
  }

  return { tabs, activeTab, addTab, closeTab, closeOthers, closeLeft, closeRight, closeAll }
}, {
  persist: {
    key: 'cp-tabs',
    storage: sessionStorage,
  }
})
