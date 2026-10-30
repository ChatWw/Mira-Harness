import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPreference, savePreference } from '@/platform'
import router from '@/router'
import { openHarnessCommandCenter } from '@/platform/harnessCommandCenter'

const MAX_RECENT_ITEMS = 12

export interface RecentCommandItem {
  id: string
  visitedAt: number
}

function loadRecentItems(): RecentCommandItem[] {
  try {
    const parsed = getPreference<unknown>('recentCommands', [])
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
    if (openHarnessCommandCenter(router.currentRoute.value.path, window)) {
      visible.value = false
      return
    }
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
    savePreference('recentCommands', recentItems.value)
  }

  return { visible, recentItems, open, close, recordVisit }
})
