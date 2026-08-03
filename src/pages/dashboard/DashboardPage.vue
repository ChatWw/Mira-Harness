<template>
  <main class="dashboard-page">
    <div class="dashboard-content">
      <DashboardGreeting :greeting="greeting" @open-search="commandPaletteStore.open" />

      <DashboardNavigationSection
        v-if="recentLinks.length"
        title="最近使用"
        :items="displayedRecentLinks"
        :expandable="recentLinks.length > 3"
        :expanded="showAllRecent"
        @select="navigate"
        @toggle="showAllRecent = !showAllRecent"
      />

      <DashboardNavigationSection title="常用功能" :items="commonLinks" layout="grid" @select="navigate" />

      <DashboardSystemStatus :app-count="applications.length" />
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { applications } from '@/config/menus'
import { commonCommandIds, findCommandNavigation } from '@/config/commandPalette'
import { useCommandPaletteStore } from '@/stores/commandPalette'
import DashboardGreeting from './components/DashboardGreeting.vue'
import DashboardNavigationSection from './components/DashboardNavigationSection.vue'
import type { DashboardNavigationItem } from './components/DashboardNavigationSection.vue'
import DashboardSystemStatus from './components/DashboardSystemStatus.vue'

const router = useRouter()
const commandPaletteStore = useCommandPaletteStore()
const showAllRecent = ref(false)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 11) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 19) return '下午好'
  return '晚上好'
})

const fallbackRecentIds = ['data-board-home', 'system-users', 'system-microapps']
const recentLinks = computed(() => {
  const ids = commandPaletteStore.recentItems.length
    ? commandPaletteStore.recentItems.map(item => item.id)
    : fallbackRecentIds
  return resolveLinks(ids)
})
const displayedRecentLinks = computed(() => showAllRecent.value ? recentLinks.value : recentLinks.value.slice(0, 3))
const commonLinks = computed(() => resolveLinks(commonCommandIds))

function resolveLinks(ids: string[]): DashboardNavigationItem[] {
  return ids
    .map(id => findCommandNavigation(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map(({ id, title, icon, path }) => ({ id, title, icon, path }))
}

function navigate(item: DashboardNavigationItem) {
  router.push(item.path)
}
</script>

<style scoped lang="scss">
.dashboard-page { min-height: 100%; padding: 0 $spacing-lg; background: var(--cp-bg); }
.dashboard-content { width: min(100%, 820px); margin: 0 auto; }

@include media-max($breakpoint-md) {
  .dashboard-page { padding: 0 $spacing-md; }
}
</style>
