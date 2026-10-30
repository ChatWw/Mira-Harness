<template>
  <main class="resource-manager" data-testid="resource-manager">
    <header class="resource-header">
      <div class="resource-heading"><h1>资源管理器</h1><div v-if="usageActive" class="subtle tiny">{{ snapshot ? `${snapshot.processes.length} 个进程` : '正在读取资源占用...' }}</div></div>
      <div role="tablist" aria-label="资源类型" class="resource-tabs">
        <button v-for="item in tabs" :id="`tab-${item.id}`" :key="item.id" role="tab" :aria-selected="tab === item.id" :tabindex="tab === item.id ? 0 : -1" aria-controls="resource-content" @click="tab = item.id" @keydown="moveTab($event, item.id)">{{ item.label }}</button>
      </div>
    </header>
    <div id="resource-content" role="tabpanel" :aria-labelledby="`tab-${tab}`" class="resource-content">
      <template v-if="usageActive">
        <p v-if="error" role="alert" class="error card">{{ error }}</p>
        <div class="usage-layout">
          <aside>
            <div class="card usage-meter" :data-testid="`resource-manager-${tab}`">
              <div class="subtle small medium">{{ tab === 'cpu' ? 'CPU' : '内存' }}</div>
              <div class="meter-value"><span class="mono">{{ snapshot ? (tab === 'cpu' ? formatPercent(appCpu) : formatBytes(appMemory)) : '—' }}</span><span class="tiny muted">Mira</span></div>
              <div class="meter-bar" role="img" :aria-label="`Mira ${appValue}，整机 ${systemValue}`"><div class="meter-system" :style="{ width: `${systemUsage}%` }" /><div class="meter-app" :style="{ width: `${appUsage}%` }" /></div>
              <div class="meter-legend tiny subtle"><span><i class="app-dot" />Mira</span><span><i class="system-dot" />整机 <b class="mono">{{ systemValue }}</b></span></div>
            </div>
          </aside>
          <section class="usage-groups">
            <div v-for="group in groups" :key="group.id" class="card usage-group" :data-testid="`resource-manager-group-${group.id}`">
              <button class="group-heading" :aria-expanded="expanded[group.id]" @click="expanded[group.id] = !expanded[group.id]"><ChevronRight :size="16" class="subtle chevron" :class="{ expanded: expanded[group.id] }" /><span class="group-title">{{ group.title }}</span><span class="group-count tiny subtle">{{ group.processes.length }}</span><span class="group-total mono small subtle">{{ tab === 'cpu' ? formatPercent(group.cpuPercent) : formatBytes(group.memoryBytes) }}</span></button>
              <div v-if="expanded[group.id]" class="group-body">
                <div v-if="!group.processes.length" class="empty small muted">暂无进程</div>
                <template v-else><div class="process-grid process-heading tiny subtle"><div>进程</div><div>PID</div><div>{{ tab === 'cpu' ? 'CPU' : '内存' }}</div></div>
                  <div v-for="row in group.processes" :key="row.pid" class="process-grid process-row small" data-testid="resource-manager-process-row"><div class="process-name medium" :title="row.name">{{ row.name }}</div><div class="mono subtle">{{ row.pid }}</div><div class="mono subtle">{{ tab === 'cpu' ? formatPercent(row.cpuPercent) : formatBytes(row.memoryBytes) }}</div></div>
                </template>
              </div>
            </div>
          </section>
        </div>
      </template>
      <StorageSection v-else-if="tab === 'storage'" :bridge="bridge.storage" />
      <NetworkSection v-else :bridge="bridge.network" />
    </div>
  </main>
</template>
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import type { MiraResourceBridge, MiraResourceSnapshot } from '../config/resourceManager'
import { clampPercent, formatBytes, formatPercent, groupResourceUsage } from './resourceUsageView'
import StorageSection from './StorageSection.vue'
import NetworkSection from './NetworkSection.vue'
import './resource-manager.css'
const bridge = (window as unknown as { resourceManager: MiraResourceBridge }).resourceManager
const tabs = [{ id: 'cpu', label: 'CPU' }, { id: 'memory', label: '内存' }, { id: 'storage', label: '存储' }, { id: 'network', label: '网络' }] as const
type Tab = typeof tabs[number]['id']
const tab = ref<Tab>('cpu')
const snapshot = ref<MiraResourceSnapshot>()
const error = ref('')
const expanded = ref({ base: true, 'builtin-plugin': true, 'community-plugin': true })
const usageActive = computed(() => tab.value === 'cpu' || tab.value === 'memory')
const groups = computed(() => groupResourceUsage(snapshot.value?.processes ?? []))
const appCpu = computed(() => groups.value.reduce((sum, group) => sum + group.cpuPercent, 0))
const appMemory = computed(() => groups.value.reduce((sum, group) => sum + group.memoryBytes, 0))
const appValue = computed(() => tab.value === 'cpu' ? formatPercent(snapshot.value ? appCpu.value : undefined) : formatBytes(snapshot.value ? appMemory.value : undefined))
const systemValue = computed(() => tab.value === 'cpu' ? formatPercent(snapshot.value?.system.cpuPercent) : snapshot.value ? `${formatBytes(snapshot.value.system.memoryUsedBytes)} / ${formatBytes(snapshot.value.system.memoryTotalBytes)}` : '—')
const systemUsage = computed(() => { const system = snapshot.value?.system; return system ? clampPercent(tab.value === 'cpu' ? system.cpuPercent ?? 0 : system.memoryUsedBytes / system.memoryTotalBytes * 100) : 0 })
const appUsage = computed(() => snapshot.value ? clampPercent(tab.value === 'cpu' ? appCpu.value : appMemory.value / snapshot.value.system.memoryTotalBytes * 100) : 0)
let stopPolling = () => {}
watch(usageActive, active => {
  stopPolling()
  if (!active) return
  let disposed = false, timer: ReturnType<typeof setTimeout> | undefined
  stopPolling = () => { disposed = true; clearTimeout(timer) }
  async function refresh() {
    try { const next = await bridge.getSnapshot(); if (!disposed) { snapshot.value = next; error.value = '' } }
    catch { if (!disposed) error.value = '资源管理器接口不可用' }
    if (!disposed) timer = setTimeout(refresh, 1000)
  }
  void refresh()
}, { immediate: true })
onUnmounted(() => stopPolling())
function moveTab(event: KeyboardEvent, current: Tab) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const index = tabs.findIndex(item => item.id === current)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  tab.value = tabs[next].id
  document.getElementById(`tab-${tab.value}`)?.focus()
}
</script>
