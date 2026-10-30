<template>
  <SettingsPageShell title="用量统计" :show-title="false">
    <div class="app-usage">
      <header class="app-usage-heading"><h1>用量统计</h1><span>应用用量</span></header>
      <section class="usage-lifetime" aria-label="累计用量统计"><div v-for="item in summary" :key="item.label"><strong>{{ item.value }}</strong><span>{{ item.label }}</span></div></section>
      <p v-if="error" class="usage-error" role="alert">{{ error }}<button type="button" @click="load">重试</button></p>
      <template v-if="snapshot">
        <section class="usage-card usage-heatmap"><header><h2>Token 活动</h2><div class="usage-tabs" role="tablist" aria-label="Token 活动方式"><button v-for="mode in modes" :key="mode.value" type="button" role="tab" :aria-selected="activity === mode.value" @click="activity = mode.value">{{ mode.label }}</button></div></header>
          <div class="heatmap-grid"><div v-for="(week, index) in heatmap" :key="index" class="heatmap-column"><SettingsTooltip v-for="cell in week.cells" :key="cell.date" :content="heatmapHint(cell, week)" placement="top" :show-after="250" :disabled="cell.future && activity === 'daily'" popper-class="usage-tooltip"><button type="button" :class="`heatmap-cell level-${cell.level}`" :aria-label="heatmapHint(cell, week)" :disabled="cell.future && activity === 'daily'" /></SettingsTooltip></div></div>
          <div class="heatmap-months"><span v-for="(month, i) in months" :key="i">{{ month }}月</span></div>
        </section>
        <div class="usage-range"><h2>时间范围</h2><div class="usage-tabs" role="tablist" aria-label="统计时间范围"><button v-for="value in [7, 30]" :key="value" type="button" role="tab" :aria-selected="range === value" @click="range = value; hoveredDay = null">近 {{ value }} 日</button></div></div>
        <section class="usage-card"><h2>每日 Token 趋势图</h2><template v-if="ranged.total"><div class="usage-legend"><span v-for="model in ranged.models.slice(0, 6)" :key="model.label"><i :style="{ background: model.color }" />{{ model.label }}</span></div>
          <div class="usage-trend" @mouseleave="hoveredDay = null"><svg viewBox="0 0 800 260" role="img" aria-label="按模型统计的每日 Token 趋势图"><line v-for="i in 5" :key="i" x1="24" x2="776" :y1="16 + (i - 1) * 52" :y2="16 + (i - 1) * 52" class="usage-grid-line" /><path v-for="model in ranged.models.slice(0, 6)" :key="model.label" :d="usageLine(ranged.days.map(day => day.models.find(item => item.modelId === model.label)?.totalTokens || 0), chartMax)" :stroke="model.color" fill="none" stroke-width="2" />
            <template v-for="(day, i) in ranged.days" :key="day.date"><text v-if="range === 7 || i % 5 === 0 || i === ranged.days.length - 1" :x="24 + i * 752 / (ranged.days.length - 1)" y="249" text-anchor="middle">{{ shortDate(day.date) }}</text><rect :x="Math.max(0, 24 + i * 752 / (ranged.days.length - 1) - 376 / (ranged.days.length - 1))" y="0" :width="752 / (ranged.days.length - 1)" height="230" fill="transparent" tabindex="0" :aria-label="`${day.date}：${day.totalTokens} Token`" @mouseenter="hoveredDay = i" @focus="hoveredDay = i" @blur="hoveredDay = null" /></template>
          </svg><div v-if="hoveredDay !== null" class="usage-chart-tooltip" :style="{ left: `${Math.min(75, Math.max(5, hoveredDay / (ranged.days.length - 1) * 100))}%` }"><strong>{{ ranged.days[hoveredDay].date }}</strong><div v-for="model in ranged.days[hoveredDay].models.filter(model => model.totalTokens > 0)" :key="model.modelId"><span>{{ model.modelId }}</span><b>{{ compactTokens(model.totalTokens) }} Token</b></div><span v-if="!ranged.days[hoveredDay].totalTokens">暂无用量</span></div></div>
        </template><div v-else class="usage-empty"><strong>暂无使用数据</strong><span>所选时间范围内暂无模型用量记录。</span></div></section>
        <section class="usage-card"><h2>模型用量</h2><div v-if="ranged.total" class="usage-models"><div class="usage-donut"><svg viewBox="0 0 240 240" role="img" aria-label="各模型 Token 用量占比"><SettingsTooltip v-for="slice in slices" :key="slice.label" :content="`${slice.label}：${compactTokens(slice.totalTokens)} Token（${percent(slice.totalTokens / ranged.total)}）`" popper-class="usage-tooltip"><circle cx="120" cy="120" r="86" fill="none" :stroke="slice.color" stroke-width="38" :stroke-dasharray="`${slice.length} ${540.354 - slice.length}`" :stroke-dashoffset="-slice.offset" transform="rotate(-90 120 120)" tabindex="0" :aria-label="`${slice.label} ${percent(slice.totalTokens / ranged.total)}`" /></SettingsTooltip></svg><div><strong>{{ compactTokens(ranged.total) }}</strong><span>Token</span></div></div><div class="usage-model-list" role="list"><div v-for="model in pieModels" :key="model.label" role="listitem"><i :style="{ background: model.color }" /><span>{{ model.label }}<small>{{ compactTokens(model.totalTokens) }} Token</small></span><b>{{ percent(model.totalTokens / ranged.total) }}</b></div></div></div><div v-else class="usage-empty"><strong>暂无使用数据</strong><span>所选时间范围内暂无模型用量记录。</span></div></section>
      </template>
      <div v-else-if="loading" class="usage-empty" role="status">正在读取本地使用记录…</div>
      <footer><button type="button" class="usage-refresh" :disabled="loading" @click="load"><AppIcon name="lucide:refresh-ccw" />{{ loading ? '正在刷新…' : '刷新' }}</button></footer>
    </div>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getPlatformApi } from '@/platform'
import type { HarnessAppUsage } from '@/config/harnessUsage'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import SettingsTooltip from '../settings/components/SettingsTooltip.vue'
import { compactTokens, usageDuration, usageHeatmap, usageLine, usageRange } from './usage-view'
const snapshot = ref<HarnessAppUsage>(), loading = ref(false), error = ref(''), range = ref(7), activity = ref('daily'), hoveredDay = ref<number | null>(null)
const modes = [{ value: 'daily', label: '每日' }, { value: 'weekly', label: '每周' }, { value: 'cumulative', label: '累计' }]
const summary = computed(() => { const s = snapshot.value?.summary; return [{ label: '累计 Token 数', value: s ? compactTokens(s.totalTokens) : '--' }, { label: '峰值 Token 数', value: s ? compactTokens(s.peakDayTokens) : '--' }, { label: '最长聊天时长', value: s ? usageDuration(s.longestSessionMs) : '--' }, { label: '当前连续天数', value: s ? `${s.currentStreakDays} 天` : '--' }, { label: '最长连续天数', value: s ? `${s.longestStreakDays} 天` : '--' }] })
const heatmap = computed(() => snapshot.value ? usageHeatmap(snapshot.value, activity.value) : [])
const months = computed(() => Array.from({ length: 12 }, (_, i) => { const date = new Date(snapshot.value?.generatedAt || Date.now()); date.setMonth(date.getMonth() - 11 + i, 1); return date.getMonth() + 1 }))
const ranged = computed(() => snapshot.value ? usageRange(snapshot.value, range.value) : { days: [], models: [], total: 0 })
const chartMax = computed(() => Math.max(1, ...ranged.value.days.flatMap(day => day.models.map(model => model.totalTokens))))
const pieModels = computed(() => { const models = ranged.value.models; return models.length > 6 ? [...models.slice(0, 6), { label: '其他', color: '#8b8b8b', totalTokens: models.slice(6).reduce((sum, model) => sum + model.totalTokens, 0) }] : models })
const slices = computed(() => { let offset = 0; return pieModels.value.map(model => { const length = model.totalTokens / ranged.value.total * 540.354; const slice = { ...model, length: Math.max(0, length - (pieModels.value.length > 1 ? 3 : 0)), offset }; offset += length; return slice }) })
const percent = (value: number) => new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 }).format(value)
const shortDate = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`
function heatmapHint(cell: ReturnType<typeof usageHeatmap>[number]['cells'][number], week: ReturnType<typeof usageHeatmap>[number]) { return `${activity.value === 'daily' ? cell.date : `${week.days[0].date} 至 ${week.days[6].date}${activity.value === 'cumulative' ? ' 累计' : ''}`}：${compactTokens(cell.value)} Token，${cell.count} 次模型响应` }
async function load() {
  if (loading.value) return
  loading.value = true; error.value = ''
  try { const api = getPlatformApi(); if (!api) throw new Error('用量统计仅支持 Mira 桌面端'); const result = await api.queryHarnessUsage(); if (!result.appUsage) throw new Error('统计服务尚未更新，请重启 Mira 后重试'); snapshot.value = result.appUsage }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '读取用量统计失败' }
  finally { loading.value = false }
}
onMounted(load)
</script>

<style scoped>
.app-usage { --usage-surface: color-mix(in srgb, var(--cp-text) 3%, var(--cp-bg)); display: flex; flex-direction: column; gap: 20px; color: var(--cp-text); }
.app-usage-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.app-usage-heading h1 { margin: 0; font-size: var(--settings-text-title); line-height: 1.35; font-weight: 550; }
.app-usage-heading > span { padding: 4px 12px; border-radius: 20px; background: var(--usage-surface); font-size: var(--settings-text-base); font-weight: 500; }
.usage-lifetime { display: flex; overflow: hidden; border-radius: 12px; background: var(--usage-surface); }
.usage-lifetime > div { flex: 1; min-width: 0; padding: 12px 8px; text-align: center; position: relative; }
.usage-lifetime > div + div::before { position: absolute; left: 0; top: 22px; height: 28px; width: 1px; background: var(--cp-border); content: ''; }
.usage-lifetime strong, .usage-lifetime span { display: block; white-space: nowrap; }
.usage-lifetime strong { font-size: 16px; line-height: 24px; font-weight: 500; }
.usage-lifetime span { margin-top: 4px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 20px; }
.usage-card { border-radius: 12px; padding: 16px; background: var(--usage-surface); }
.app-usage h2 { margin: 0; font-size: var(--settings-text-base); line-height: 20px; font-weight: 500; }
.usage-card header, .usage-range { display: flex; align-items: center; justify-content: space-between; }
.usage-tabs { display: inline-flex; gap: 2px; padding: 2px; border-radius: 20px; background: color-mix(in srgb, var(--cp-text) 2%, transparent); }
.usage-tabs button { padding: 3px 10px; border: 0; border-radius: 16px; background: transparent; color: var(--cp-text-secondary); font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; white-space: nowrap; }
.usage-tabs button[aria-selected='true'] { background: var(--cp-bg); color: var(--cp-text); box-shadow: 0 1px 3px rgb(0 0 0 / 4%); }
.heatmap-grid { display: grid; grid-template-columns: repeat(52, minmax(0, 1fr)); gap: 4px; margin-top: 12px; }
.heatmap-column { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.heatmap-cell { width: 100%; aspect-ratio: 1; padding: 0; border: 1px solid transparent; border-radius: 4px; background: color-mix(in srgb, var(--cp-text) 2%, var(--usage-surface)); }
.heatmap-cell:not(:disabled):hover { transform: scale(1.1); border-color: var(--cp-border); }
.level-1 { background: color-mix(in srgb, #0b7fff 18%, var(--usage-surface)); }.level-2 { background: color-mix(in srgb, #0b7fff 36%, var(--usage-surface)); }.level-3 { background: color-mix(in srgb, #0b7fff 58%, var(--usage-surface)); }.level-4 { background: color-mix(in srgb, #0b7fff 80%, var(--usage-surface)); }
.heatmap-months { display: flex; justify-content: space-between; margin-top: 12px; color: var(--cp-text-secondary); font-size: 12px; }
.usage-legend { display: flex; flex-wrap: wrap; gap: 16px; margin: 24px 12px 8px; color: var(--cp-text-secondary); font-size: 12px; }
.usage-legend > span { display: inline-flex; gap: 8px; align-items: center; }
.usage-legend i, .usage-model-list i { width: 10px; height: 10px; border-radius: 4px; flex: none; }
.usage-trend { position: relative; margin: 0 12px 12px; }.usage-trend svg { width: 100%; display: block; overflow: visible; }
.usage-trend text { fill: var(--cp-text-secondary); font-size: 12px; }.usage-grid-line { stroke: var(--cp-border-light); stroke-dasharray: 3 3; }
.usage-chart-tooltip { position: absolute; top: 20px; max-width: 300px; padding: 10px 12px; border: 1px solid var(--cp-border-light); border-radius: 8px; background: var(--cp-bg); box-shadow: 0 4px 12px rgb(0 0 0 / 10%); pointer-events: none; font-size: 12px; }
.usage-chart-tooltip > div { display: flex; gap: 16px; justify-content: space-between; margin-top: 6px; }.usage-chart-tooltip b { font-weight: 500; white-space: nowrap; }.usage-chart-tooltip span { color: var(--cp-text-secondary); }
.usage-models { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 12px; }.usage-donut { position: relative; width: 100%; max-width: 288px; height: 256px; justify-self: center; }.usage-donut svg { width: 100%; height: 100%; }.usage-donut > div { pointer-events: none; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; font-size: 12px; gap: 4px; }.usage-donut > div span { color: var(--cp-text-secondary); }
.usage-model-list { align-self: center; min-width: 0; }.usage-model-list > div { display: flex; align-items: baseline; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--cp-border-light); font-size: 12px; }.usage-model-list > div:last-child { border: 0; }.usage-model-list > div > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }.usage-model-list small { display: block; margin-top: 4px; color: var(--cp-text-secondary); font-size: 12px; }.usage-model-list b { font-weight: 400; color: var(--cp-text-secondary); }
.usage-empty { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: var(--settings-text-base); color: var(--cp-text-secondary); }.usage-empty strong { font-weight: 500; color: var(--cp-text); }
.app-usage footer { display: flex; justify-content: flex-end; }.usage-refresh, .usage-error button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--cp-border); border-radius: 6px; color: inherit; background: var(--cp-bg); cursor: pointer; font: inherit; font-size: 12px; }.usage-refresh:disabled { opacity: .5; }.usage-error { color: var(--cp-danger); font-size: var(--settings-text-base); }.usage-error button { margin-left: 12px; }
</style>
<style>
.usage-tooltip.el-popper { max-width: 360px; padding: 8px 10px; color: var(--cp-text); background: var(--cp-bg); border: 1px solid var(--cp-border-light); border-radius: 6px; box-shadow: 0 4px 16px rgb(0 0 0 / 12%); font-size: 12px; }
.usage-tooltip.el-popper .el-popper__arrow::before { background: var(--cp-bg); border-color: var(--cp-border-light); }
</style>
