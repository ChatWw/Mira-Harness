<template>
  <main class="dashboard-page">
    <div class="dashboard-content">
      <DashboardOverviewHeader
        :time="timeLabel"
        :date="dateLabel"
        :application-count="applications.length"
        @open-search="commandPaletteStore.open"
      />
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { applications } from '@/config/menus'
import { useCommandPaletteStore } from '@/stores/commandPalette'
import DashboardOverviewHeader from './components/DashboardOverviewHeader.vue'

const commandPaletteStore = useCommandPaletteStore()
const now = ref(new Date())
const formatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
const updateClock = window.setInterval(() => { now.value = new Date() }, 60_000)

const timeLabel = computed(() => now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }))
const dateLabel = computed(() => formatter.format(now.value).replace(/\s/g, ''))

onBeforeUnmount(() => window.clearInterval(updateClock))
</script>

<style scoped lang="scss">
.dashboard-page { display: flex; min-height: 100%; align-items: center; padding: $spacing-lg; background: var(--cp-bg); }
.dashboard-content { width: min(100%, 640px); margin: 0 auto; }

@include media-max($breakpoint-md) {
  .dashboard-page { padding: $spacing-md; }
}
</style>
