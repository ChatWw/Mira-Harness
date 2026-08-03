import { defineStore } from 'pinia'
import { ref } from 'vue'

const RECENT_STORAGE_KEY = 'cp-command-palette-recent'
const MAX_RECENT_ITEMS = 12

export interface RecentCommandItem {
  id: string
  visitedAt: number
}

function loadRecentItems(): RecentCommandItem[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]')
    if (!Array.isArray(stored)) return []

    return stored
      .filter((item): item is RecentCommandItem => typeof item?.id === 'string' && typeof item?.visitedAt === 'number')
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, MAX_RECENT_ITEMS)
  } catch {
    return []
  }
}

export const useCommandPaletteStore = defineStore('commandPalette', () => {
  const visible = ref(false)
  const recentItems = ref<RecentCommandItem[]>(loadRecentItems())

  function open() {
    visible.value = true
  }

  function close() {
    visible.value = false
  }

  function recordVisit(id: string) {
    recentItems.value = [
      { id, visitedAt: Date.now() },
      ...recentItems.value.filter(item => item.id !== id),
    ].slice(0, MAX_RECENT_ITEMS)
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentItems.value))
  }

  return { visible, recentItems, open, close, recordVisit }
})
