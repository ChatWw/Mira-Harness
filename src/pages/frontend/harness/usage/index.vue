<template>
  <main class="usage-page">
    <header class="usage-page__header">
      <div><p>本地运行记录</p><h1>用量与成本</h1></div>
      <el-button :loading="loading" @click="load"><AppIcon name="Refresh" />刷新</el-button>
    </header>
    <p v-if="error" class="usage-page__error">{{ error }}</p>
    <template v-else-if="stats">
      <p class="usage-page__note">成本按模型设置中的单价和实际 token 用量估算，仅供本地参考，不代表供应商最终账单。</p>
      <section class="usage-summary" aria-label="用量汇总">
        <article><span>总 token</span><strong>{{ formatTokens(stats.total.totalTokens) }}</strong></article>
        <article><span>估算成本</span><strong>{{ formatCosts(stats.total.costs) }}</strong></article>
        <article><span>已定价运行</span><strong>{{ stats.total.pricedRuns }}</strong></article>
        <article><span>未定价运行</span><strong>{{ stats.total.unpricedRuns }}</strong></article>
      </section>
      <section v-for="section in sections" :key="section.title" class="usage-section">
        <h2>{{ section.title }}</h2>
        <el-table :data="section.rows" size="small" empty-text="暂无已完成的模型用量记录">
          <el-table-column prop="label" label="名称" min-width="220" show-overflow-tooltip />
          <el-table-column label="输入" width="112" align="right"><template #default="{ row }">{{ formatTokens(row.input) }}</template></el-table-column>
          <el-table-column label="输出" width="112" align="right"><template #default="{ row }">{{ formatTokens(row.output) }}</template></el-table-column>
          <el-table-column label="总 token" width="124" align="right"><template #default="{ row }">{{ formatTokens(row.totalTokens) }}</template></el-table-column>
          <el-table-column label="估算成本" width="132" align="right"><template #default="{ row }">{{ formatCosts(row.costs) }}</template></el-table-column>
          <el-table-column label="未定价" width="92" align="right"><template #default="{ row }">{{ row.unpricedRuns || '-' }}</template></el-table-column>
        </el-table>
      </section>
    </template>
    <div v-else-if="!loading" class="usage-page__empty">尚无可统计的模型用量。</div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getPlatformApi } from '@/platform'
import type { HarnessUsageStats } from '@/config/harness'

const stats = ref<HarnessUsageStats>()
const loading = ref(false)
const error = ref('')
const sections = computed(() => stats.value ? [
  { title: '按供应商与模型', rows: stats.value.providers },
  { title: '按项目', rows: stats.value.projects },
  { title: '按会话', rows: stats.value.sessions },
] : [])

function formatTokens(value: number) { return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value) }
function formatCosts(costs: Record<string, number>) { const values = Object.entries(costs); return values.length ? values.map(([currency, value]) => `${currency} ${value.toFixed(value >= 1 ? 2 : 4)}`).join(' / ') : '-' }
async function load() {
  const api = getPlatformApi()
  if (!api) { error.value = '用量统计仅支持 Mira 桌面端'; return }
  loading.value = true; error.value = ''
  try { stats.value = await api.queryHarnessUsage() } catch (cause) { error.value = cause instanceof Error ? cause.message : '读取用量统计失败' } finally { loading.value = false }
}
onMounted(() => { void load() })
</script>

<style scoped lang="scss">
.usage-page { max-width: 1240px; margin: 0 auto; padding: 28px 36px 48px; }.usage-page__header { display: flex; align-items: end; justify-content: space-between; gap: 20px; padding-bottom: 24px; border-bottom: 1px solid var(--cp-border-light); }.usage-page__header p { margin: 0 0 5px; color: var(--cp-text-tertiary); font-size: 12px; }.usage-page__header h1 { margin: 0; color: var(--cp-text); font-size: 24px; }.usage-page__note { margin: 18px 0 -10px; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.5; }.usage-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 24px 0 34px; }.usage-summary article { padding: 16px; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; background: var(--cp-bg); }.usage-summary span { display: block; color: var(--cp-text-secondary); font-size: 12px; }.usage-summary strong { display: block; margin-top: 8px; color: var(--cp-text); font-size: 20px; font-weight: 600; }.usage-section + .usage-section { margin-top: 32px; }.usage-section h2 { margin: 0 0 10px; color: var(--cp-text); font-size: 15px; }.usage-page__empty, .usage-page__error { padding: 28px 0; color: var(--cp-text-secondary); }.usage-page__error { color: var(--cp-danger); }
</style>
