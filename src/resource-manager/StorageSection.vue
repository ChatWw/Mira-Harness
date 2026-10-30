<template>
  <section>
    <div class="storage-summary"><div><div class="caption subtle">Mira 总占用</div><strong class="storage-total">{{ formatBytes(snapshot?.totalBytes) }}</strong></div><span class="caption subtle">{{ scanning ? '正在计算…' : snapshot ? `上次计算 ${new Date(snapshot.finishedAt).toLocaleString()}` : '尚未计算' }}</span><button class="action" :disabled="scanning" @click="scan"><RefreshCw :size="14" />重新计算</button></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="snapshot?.errors" class="caption subtle">{{ snapshot.errors }} 个目录无法读取，结果可能偏小。</p>
    <div class="storage-layout">
      <aside><div class="card disk-card"><div class="disk-title"><HardDrive :size="16" /><span :title="snapshot?.root">{{ snapshot?.root ?? '数据目录' }}</span></div><div class="disk-bar"><i v-for="(category, index) in legend" :key="category.id" :style="{ width: `${snapshot?.totalBytes ? category.bytes / snapshot.totalBytes * 100 : 0}%`, background: colors[index % colors.length] }" /></div><p class="caption subtle">Mira 占用 {{ formatBytes(snapshot?.totalBytes) }} · {{ snapshot?.volume ? `剩余 ${formatBytes(snapshot.volume.freeBytes)} / 共 ${formatBytes(snapshot.volume.totalBytes)}` : '无法读取磁盘容量' }}</p><ul class="disk-legend"><li v-for="(category, index) in legend" :key="category.id"><i :style="{ background: colors[index % colors.length] }" /><span class="subtle">{{ category.title }}</span><span>{{ formatBytes(category.bytes) }}</span></li></ul><div class="disk-roots caption subtle">数据目录<div class="mono" :title="snapshot?.root">{{ snapshot?.root ?? '—' }}</div></div></div><p class="storage-estimate caption muted">大小为估算值，硬链接与克隆文件可能重复计算。</p></aside>
      <div class="card storage-categories">
        <template v-if="detail"><div class="category-detail-heading"><button class="action" @click="selected = null"><ArrowLeft :size="14" />返回</button><span>{{ detail.title }}</span><span class="subtle">{{ formatBytes(detail.bytes) }}</span></div><div v-for="entry in detail.entries" :key="entry.path" class="storage-category"><Folder :size="16" class="subtle" /><div class="category-label"><span>{{ entry.name }}</span><span class="caption subtle">{{ formatBytes(entry.bytes) }} · {{ entry.files }} 个文件</span></div><button class="action" @click="reveal(entry.path)">在{{ isMac ? 'Finder' : '文件资源管理器' }}中显示</button></div></template>
        <template v-else><button v-for="category in categories" :key="category.id" class="storage-category" @click="selected = category.id"><span class="category-icon"><component :is="icons[category.id] ?? Folder" :size="16" /></span><span class="category-label"><span>{{ category.title }}</span><span class="caption subtle">{{ formatBytes(category.bytes) }}</span></span><ChevronRight :size="16" class="muted" /></button></template>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowLeft, Blocks, ChevronRight, Database, FileOutput, FileText, Folder, HardDrive, KeyRound, RefreshCw } from 'lucide-vue-next'
import type { MiraResourceBridge, MiraStorageSnapshot } from '../config/resourceManager'
import { formatBytes } from './resourceUsageView'
const props = defineProps<{ bridge: MiraResourceBridge['storage'] }>()
const snapshot = ref<MiraStorageSnapshot>(), scanning = ref(false), error = ref(''), selected = ref<string | null>(null)
const detail = computed(() => snapshot.value?.categories.find(category => category.id === selected.value))
const categories = computed(() => [...(snapshot.value?.categories ?? [])].sort((a, b) => b.bytes - a.bytes))
const legend = computed(() => categories.value.filter(category => category.bytes > 0))
const icons: Record<string, typeof Folder> = { sessions: Database, artifacts: FileOutput, logs: FileText, runtimes: Blocks, config: KeyRound, cache: HardDrive }
const isMac = /Mac/.test(navigator.platform)
// Storage usage chart palette.
const colors = ['#0b7fff', '#1e8a3e', '#9e77ed', '#e03131', '#e07b00', '#0aa7a7', 'var(--muted)']
let disposed = false
async function scan() {
  if (scanning.value) return
  scanning.value = true; error.value = ''
  try { const next = await props.bridge.scan(); if (!disposed) snapshot.value = next }
  catch { if (!disposed) error.value = '计算失败，请重新计算。' }
  finally { if (!disposed) scanning.value = false }
}
async function reveal(path: string) { try { await props.bridge.reveal(path) } catch { error.value = '未能打开数据目录，请重试。' } }
onMounted(scan)
onUnmounted(() => { disposed = true; void props.bridge.cancel().catch(() => {}) })
</script>
<style>
.storage-summary { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.storage-total { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.storage-summary .action { margin-left: auto; }
.storage-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.disk-card { padding: 16px; }
.disk-title { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.disk-title svg { flex-shrink: 0; }
.disk-title span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.disk-bar { display: flex; height: 8px; margin-top: 16px; border-radius: 999px; overflow: hidden; background: var(--surface); }
.disk-card > p { margin-top: 8px; }
.disk-legend { padding: 0; margin: 12px 0 0; list-style: none; }
.disk-legend li { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
.disk-legend li i { height: 8px; width: 8px; border-radius: 999px; }
.disk-legend li span:nth-child(2) { flex: 1; }
.disk-roots { border-top: 1px solid var(--border); margin-top: 12px; padding-top: 12px; }
.disk-roots div { margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.storage-estimate { margin-top: 12px; padding: 0 4px; }
.storage-categories { overflow: hidden; height: fit-content; }
.storage-category { display: flex; width: 100%; gap: 12px; align-items: center; text-align: left; padding: 12px 16px; border-top: 1px solid var(--border); }
.storage-category:first-child { border: 0; }
button.storage-category:hover { background: var(--hover); }
.category-icon { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; background: var(--surface); color: var(--subtle); }
.category-label { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
.category-label > span:first-child { font-weight: 500; }
.category-detail-heading { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
</style>
