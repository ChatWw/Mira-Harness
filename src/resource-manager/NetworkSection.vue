<!-- Ported from ZCode NetworkSection.tsx (Apache-2.0). -->
<template>
  <section class="network-section">
    <p class="small subtle">窗口打开期间记录本机应用请求，最多保留最近 1,000 条。</p>
    <div class="network-filter"><input v-model="filter" aria-label="筛选 URL、进程、PID 或方法" placeholder="筛选 URL、进程、PID 或方法" @input="page = 0"><button class="action" :disabled="clearing" @click="clear">清空</button></div>
    <p v-if="error" class="small error" role="alert">网络请求记录暂不可用</p>
    <div class="network-pagination small subtle"><span>{{ records.length }} 条 · 已淘汰或丢弃 {{ snapshot?.dropped ?? 0 }} 条</span><div><button :disabled="currentPage === 0" @click="page = currentPage - 1">上一页</button><span>{{ currentPage + 1 }} / {{ pageCount }}</span><button :disabled="currentPage + 1 === pageCount" @click="page = currentPage + 1">下一页</button></div></div>
    <div class="card network-list"><table class="small"><thead class="subtle"><tr><th>时间</th><th>进程 / PID</th><th>方法</th><th>URL</th></tr></thead><tbody><tr v-for="record in records.slice(currentPage * 50, (currentPage + 1) * 50)" :key="record.id"><td>{{ new Date(record.timestamp).toLocaleTimeString() }}</td><td>{{ record.processType }}<div class="subtle">{{ record.pid }}</div></td><td class="mono">{{ record.method }}</td><td :title="record.url">{{ record.url }}</td></tr></tbody></table><p v-if="!records.length" class="small subtle">{{ filter ? '没有匹配的请求' : '等待新的网络请求…' }}</p></div>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { MiraNetworkSnapshot, MiraResourceBridge } from '../config/resourceManager'
const props = defineProps<{ bridge: MiraResourceBridge['network'] }>()
const snapshot = ref<MiraNetworkSnapshot>(), filter = ref(''), page = ref(0), clearing = ref(false), error = ref(false)
const records = computed(() => { const query = filter.value.trim().toLowerCase(); return [...(snapshot.value?.records ?? [])].filter(row => !query || `${row.processType} ${row.pid} ${row.method} ${row.url}`.toLowerCase().includes(query)).sort((a, b) => b.timestamp - a.timestamp || b.id - a.id) })
const pageCount = computed(() => Math.max(1, Math.ceil(records.value.length / 50)))
const currentPage = computed(() => Math.min(page.value, pageCount.value - 1))
let disposed = false, generation = 0, timer: ReturnType<typeof setTimeout> | undefined
async function refresh() {
  const started = generation
  if (!clearing.value) try { const next = await props.bridge.getSnapshot(); if (!disposed && started === generation) { snapshot.value = next; error.value = false } } catch { if (!disposed && started === generation) error.value = true }
  if (!disposed) timer = setTimeout(refresh, 500)
}
async function clear() {
  if (clearing.value) return
  generation++; clearing.value = true
  try { await props.bridge.clear(); snapshot.value = undefined; page.value = 0; error.value = false } catch { error.value = true }
  finally { clearing.value = false }
}
onMounted(refresh)
onUnmounted(() => { disposed = true; clearTimeout(timer) })
</script>
<style>
.network-section { display: flex; flex-direction: column; gap: 12px; }
.network-filter { display: flex; gap: 8px; }
.network-filter input { min-width: 160px; flex: 1; border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; background: var(--card); font-size: 12px; }
.network-pagination { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.network-pagination > div { display: flex; gap: 8px; align-items: center; }
.network-pagination button { padding: 6px 8px; border-radius: 6px; }
.network-pagination button:hover:not(:disabled) { background: var(--hover); }
.network-list { overflow-x: auto; }
.network-list table { width: 100%; table-layout: fixed; border-collapse: collapse; text-align: left; }
.network-list th { font-weight: 500; }
.network-list th, .network-list td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
.network-list th:nth-child(1) { width: 96px; }
.network-list th:nth-child(2) { width: 112px; }
.network-list th:nth-child(3) { width: 80px; }
.network-list td:first-child { white-space: nowrap; font-variant-numeric: tabular-nums; }
.network-list td:last-child { overflow-wrap: anywhere; user-select: text; }
.network-list tr:last-child td { border-bottom: 0; }
.network-list tbody tr:hover { background: var(--hover); }
.network-list > p { text-align: center; padding: 24px; }
</style>
