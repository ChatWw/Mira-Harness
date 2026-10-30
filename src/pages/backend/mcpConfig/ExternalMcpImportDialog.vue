<template>
  <el-dialog :model-value="open" title="导入外部 Agent MCP 服务器" class="mcp-import-dialog" width="672px" align-center append-to-body :show-close="false" :close-on-click-modal="!importing" :close-on-press-escape="!importing" @update:model-value="!importing && emit('update:open', $event)">
    <template #header>
      <div class="mcp-import-heading"><h2>导入外部 Agent MCP 服务器</h2><div class="mcp-import-heading__actions"><button type="button" class="mcp-import-icon" :disabled="loading || importing" aria-label="刷新外部 MCP 来源" title="刷新" @click="discover"><AppIcon name="lucide:refresh-cw" :class="{ 'is-spinning': loading }" /></button><button type="button" class="mcp-import-icon" :disabled="importing" aria-label="关闭 MCP 导入" title="关闭" @click="emit('update:open', false)"><AppIcon name="lucide:x" /></button></div></div>
    </template>
    <div class="mcp-import-content" :aria-busy="loading || importing">
      <p v-if="error" class="mcp-import-error" role="alert">{{ error }}</p>
      <div class="mcp-import-list">
        <div v-if="loading" class="mcp-import-state" role="status"><AppIcon name="lucide:loader-circle" class="is-spinning" />正在查找外部 MCP 配置…</div>
        <template v-else-if="results">
          <div class="mcp-import-summary" role="status">导入完成：{{ results.filter(item => item.status === 'imported').length }} 个已导入，{{ results.filter(item => item.status === 'skipped').length }} 个已跳过，{{ results.filter(item => item.status === 'failed').length }} 个失败</div>
          <div v-for="result in results" :key="result.id" class="mcp-import-result" :data-import-status="result.status"><AppIcon :name="result.status === 'imported' ? 'lucide:check' : result.status === 'skipped' ? 'lucide:minus' : 'lucide:circle-alert'" /><div><strong>{{ result.name }}</strong><p>{{ result.message || '已导入到全局配置' }}</p></div></div>
        </template>
        <template v-else-if="sources.length">
          <div class="mcp-import-select-all"><label><input type="checkbox" aria-label="全选外部 MCP 服务器" :checked="allSelected" :indeterminate="selected.length > 0 && !allSelected" :disabled="!available.length || importing" @change="select(available, ($event.target as HTMLInputElement).checked)" />全选</label><span>已选 {{ selected.length }}/{{ available.length }}</span></div>
          <section v-for="source in sources" :key="source.id" class="mcp-import-source">
            <div class="mcp-import-source__heading"><input type="checkbox" :aria-label="`选择 ${source.name} 的 MCP 服务器`" :checked="isSelected(source)" :indeterminate="isPartial(source)" :disabled="!source.servers.some(server => server.importable) || importing" @change="select(source.servers.filter(server => server.importable).map(server => server.id), ($event.target as HTMLInputElement).checked)" /><button type="button" :aria-label="`展开 ${source.name}`" :aria-expanded="expanded.includes(source.id)" :aria-controls="`mcp-import-${source.id}`" @click="toggle(source.id)"><strong>{{ source.name }}</strong><code :title="source.path">{{ source.path }}</code><span>{{ source.servers.length }} 个 MCP 服务器</span><AppIcon :name="expanded.includes(source.id) ? 'lucide:chevron-down' : 'lucide:chevron-right'" /></button></div>
            <p v-if="source.error" class="mcp-import-source__error">{{ source.error }}</p>
            <div v-if="expanded.includes(source.id)" :id="`mcp-import-${source.id}`" class="mcp-import-servers"><label v-for="server in source.servers" :key="server.id" class="mcp-import-server"><input type="checkbox" :aria-label="`导入 ${source.name} / ${server.name}`" :checked="selected.includes(server.id)" :disabled="!server.importable || importing" @change="select([server.id], ($event.target as HTMLInputElement).checked)" /><span><strong>{{ server.name }}</strong><small v-if="server.reason">{{ server.reason }}</small></span><small>{{ server.type === 'streamableHttp' ? 'HTTP' : server.type }}</small></label></div>
          </section>
        </template>
        <div v-else-if="!error" class="mcp-import-state"><strong>未发现可导入的 MCP 服务器</strong><p>在外部 Agent 中配置 MCP 服务器后，点击右上角刷新。</p></div>
      </div>
    </div>
    <template #footer><div class="mcp-import-footer"><span>{{ importing ? `正在导入 ${selected.length} 个 MCP 服务器…` : results ? '现有同名配置已保留' : `发现 ${available.length} 个可导入 MCP 服务器` }}</span><button v-if="results" type="button" class="mcp-import-primary" @click="emit('update:open', false)">完成</button><button v-else type="button" class="mcp-import-primary" aria-label="导入到全局" :disabled="loading || importing || !selected.length" @click="startImport"><AppIcon v-if="importing" name="lucide:loader-circle" class="is-spinning" />导入到全局</button></div></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { getPlatformApi } from '@/platform'
import type { MiraExternalMcpSource, MiraMcpImportResult } from '@/config/miraMcp'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; imported: [] }>()
const sources = ref<MiraExternalMcpSource[]>([]), selected = ref<string[]>([]), expanded = ref<string[]>([])
const loading = ref(false), importing = ref(false), error = ref(''), results = ref<MiraMcpImportResult[]>()
const available = computed(() => sources.value.flatMap(source => source.servers.filter(server => server.importable).map(server => server.id)))
const allSelected = computed(() => available.value.length > 0 && selected.value.length === available.value.length)
let sequence = 0
function select(ids: string[], checked: boolean) {
  if (importing.value) return
  selected.value = checked ? [...new Set([...selected.value, ...ids])] : selected.value.filter(id => !ids.includes(id))
}
function isSelected(source: MiraExternalMcpSource) { const ids = source.servers.filter(server => server.importable); return ids.length > 0 && ids.every(server => selected.value.includes(server.id)) }
function isPartial(source: MiraExternalMcpSource) { return !isSelected(source) && source.servers.some(server => selected.value.includes(server.id)) }
function toggle(id: string) { expanded.value = expanded.value.includes(id) ? expanded.value.filter(value => value !== id) : [...expanded.value, id] }
async function discover() {
  if (loading.value || importing.value) return
  const request = ++sequence
  loading.value = true; error.value = ''; results.value = undefined; sources.value = []; selected.value = []; expanded.value = []
  try {
    const api = getPlatformApi()
    if (!api) throw new Error()
    const value = await api.discoverExternalMcpServers()
    if (request === sequence) sources.value = value
  } catch { if (request === sequence) error.value = '读取外部 MCP 配置失败，请点击右上角刷新重试。' }
  finally { if (request === sequence) loading.value = false }
}
async function startImport() {
  if (!selected.value.length || loading.value || importing.value) return
  importing.value = true; error.value = ''
  const request = sequence
  try {
    const api = getPlatformApi()
    if (!api) throw new Error()
    const value = await api.importExternalMcpServers([...selected.value])
    if (request === sequence) { results.value = value; emit('imported') }
  } catch { if (request === sequence) error.value = '导入失败，选择已保留，请重试。' }
  finally { if (request === sequence) importing.value = false }
}
watch(() => props.open, open => { if (open) void discover(); else { sequence++; loading.value = false } }, { immediate: true })
onUnmounted(() => { sequence++ })
</script>

<style scoped>
:global(.el-dialog.mcp-import-dialog) { display: flex; flex-direction: column; width: min(672px, calc(100vw - 32px)); height: min(640px, calc(100dvh - 32px)); max-width: none; padding: 20px; border-radius: 16px; background: var(--cp-bg); color: var(--cp-text); }
:global(.mcp-import-dialog .el-dialog__header) { padding: 0 0 16px; margin: 0; border: 0; }
:global(.mcp-import-dialog .el-dialog__body) { display: flex; flex: 1; min-height: 0; padding: 0; }
:global(.mcp-import-dialog .el-dialog__footer) { padding: 16px 0 0; }
.mcp-import-heading, .mcp-import-heading__actions, .mcp-import-footer, .mcp-import-select-all { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mcp-import-heading h2 { margin: 0; font-size: 14px; font-weight: 500; }
.mcp-import-icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--cp-text-secondary); cursor: pointer; }
.mcp-import-icon:hover { background: var(--cp-bg-hover); color: var(--cp-text); }
.mcp-import-content { display: flex; flex-direction: column; gap: 12px; flex: 1; min-width: 0; min-height: 0; }
.mcp-import-list { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: 12px; padding: 12px; font-size: 12px; }
.mcp-import-select-all { padding: 4px 8px 12px; color: var(--cp-text-secondary); }
.mcp-import-select-all > span { font-size: 11px; font-variant-numeric: tabular-nums; }
.mcp-import-select-all label, .mcp-import-source__heading, .mcp-import-server { display: flex; align-items: center; gap: 8px; }
input[type=checkbox] { flex-shrink: 0; width: 15px; height: 15px; margin: 0; accent-color: var(--cp-text); cursor: pointer; }
input:disabled { cursor: default; }
.mcp-import-source__heading { padding: 8px; border-radius: 6px; }
.mcp-import-source__heading:hover { background: var(--cp-bg-hover); }
.mcp-import-source__heading > button { display: flex; flex: 1; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; border: 0; padding: 0; background: none; color: var(--cp-text); font: inherit; text-align: left; cursor: pointer; }
strong { font-weight: 500; }
.mcp-import-source__heading strong { font-size: 14px; }
.mcp-import-source__heading code { flex: 0 1 auto; min-width: 0; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: var(--cp-text-secondary); }
.mcp-import-source__heading span, small { color: var(--cp-text-secondary); font-size: 10px; }
.mcp-import-source__heading .app-icon { margin-left: auto; flex-shrink: 0; }
.mcp-import-servers { margin: 0 8px 8px 31px; }
.mcp-import-server { padding: 8px; border-radius: 6px; cursor: pointer; }
.mcp-import-server:hover { background: var(--cp-bg-hover); }
.mcp-import-server > span { display: grid; flex: 1; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.mcp-import-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 100%; min-height: 120px; color: var(--cp-text-secondary); text-align: center; }
.mcp-import-state p { max-width: 36ch; margin: 0; line-height: 1.6; }
.mcp-import-state strong { color: var(--cp-text); font-size: 14px; }
.mcp-import-footer { font-size: 12px; color: var(--cp-text-secondary); }
.mcp-import-primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex-shrink: 0; min-height: 30px; padding: 6px 10px; border: 0; border-radius: 6px; background: var(--cp-text); color: var(--cp-bg); font: inherit; font-size: 12px; cursor: pointer; }
.mcp-import-primary:hover { opacity: .85; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--cp-text); outline-offset: 2px; }
.app-icon { width: 14px; height: 14px; }
.mcp-import-error, .mcp-import-source__error { margin: 0; font-size: 12px; color: var(--el-color-danger); line-height: 1.6; }
.mcp-import-source__error { padding: 0 8px 8px 31px; }
.mcp-import-summary { padding: 8px; line-height: 1.6; }
.mcp-import-result { display: flex; align-items: flex-start; gap: 10px; padding: 12px 8px; overflow-wrap: anywhere; }
.mcp-import-result > .app-icon { flex-shrink: 0; margin-top: 2px; }
.mcp-import-result[data-import-status=failed] > .app-icon { color: var(--el-color-danger); }
.mcp-import-result p { margin: 4px 0 0; color: var(--cp-text-secondary); line-height: 1.6; }
.is-spinning { animation: mcp-import-spin 1s linear infinite; }
@keyframes mcp-import-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .is-spinning { animation: none; } }
@media (max-width: 520px) { .mcp-import-source__heading code { max-width: 100%; flex-basis: 100%; order: 1; } .mcp-import-footer { align-items: flex-start; } }
</style>
