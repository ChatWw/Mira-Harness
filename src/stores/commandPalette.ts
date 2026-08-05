import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPreference, savePreference } from '@/platform'

const RECENT_STORAGE_KEY = 'cp-command-palette-recent'
const MAX_RECENT_ITEMS = 12

export interface RecentCommandItem {
  id: string
  visitedAt: number
}

function loadRecentItems(): RecentCommandItem[] {
  try {
    const stored = getPreference('recentCommands', localStorage.getItem(RECENT_STORAGE_KEY) || '[]')
    const raw = typeof stored === 'string' ? stored : JSON.stringify(stored)
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
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
    savePreference('recentCommands', recentItems.value)
  }

  return { visible, recentItems, open, close, recordVisit }
})
