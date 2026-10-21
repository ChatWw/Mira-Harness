<template>
  <SettingsPageShell class="plugin-settings-shell" title="扩展" :show-title="false">
    <div class="plugin-settings">
      <nav v-if="selected" class="plugin-breadcrumb" aria-label="页面位置"><button type="button" @click="browse()">插件市场</button><AppIcon name="lucide:chevron-right" /><button type="button" @click="selectedId = undefined">插件</button><AppIcon name="lucide:chevron-right" /><span>{{ selected.listing?.displayName || selected.name }}</span></nav>
      <h1>{{ selected ? selected.listing?.displayName || selected.name : '工具与扩展' }}</h1>
      <div v-if="!selected" class="plugin-capabilities">
        <span class="plugin-user-scope"><AppIcon name="lucide:monitor" />用户</span><span class="plugin-divider" />
        <div class="plugin-tabs" role="tablist" aria-label="插件能力" @keydown="handleTabKey">
          <button v-for="entry in [{ id: 'plugins', label: '插件', count: items.length }, { id: 'mcp', label: 'MCP', count: mcpCount }, { id: 'skills', label: '技能', count: skillCount }]" :key="entry.id" type="button" role="tab" :aria-selected="tab === entry.id" :tabindex="tab === entry.id ? 0 : -1" :aria-controls="`plugin-panel-${entry.id}`" @click="selectTab(entry.id)"><span>{{ entry.label }}</span><small>{{ entry.count }}</small></button>
        </div>
        <label class="plugin-search"><AppIcon name="lucide:search" /><input v-model="queryForTab" type="search" :placeholder="tab === 'plugins' ? '搜索插件…' : tab === 'mcp' ? '搜索 MCP…' : '搜索技能…'" :aria-label="tab === 'plugins' ? '搜索插件' : tab === 'mcp' ? '搜索 MCP' : '搜索技能'" /></label>
      </div>
      <p v-if="error" class="plugin-error" role="alert">{{ error }}</p><p v-if="feedback" class="plugin-notice" role="status">{{ feedback }}</p>
      <section v-if="selected" class="plugin-detail" aria-label="插件详情">
        <div class="plugin-detail-actions"><button class="plugin-button" type="button" @click="selectedId = undefined"><AppIcon name="lucide:arrow-left" />返回插件列表</button><el-switch :model-value="selected.enabled" :disabled="busy || Boolean(selected.error && !selected.enabled)" :aria-label="`启用插件 ${selected.name}`" @change="toggle(selected, Boolean($event))" /><span>{{ selected.enabled ? '已启用' : '已停用' }}</span><button class="plugin-button" type="button" :disabled="busy" @click="remove(selected)">移除插件</button></div>
        <p>{{ selected.description }}</p><p v-if="selected.error || selected.unavailableReason || selected.conflicts.length" class="plugin-error">{{ selected.error || selected.unavailableReason || '插件名称冲突，请停用重名插件。' }}</p>
        <section v-for="group in [{ label: '技能', entries: selected.skills }, { label: '命令', entries: selected.commands || [] }, { label: '智能体', entries: selected.agents || [] }, { label: 'MCP', entries: selected.mcpServers || [] }]" :key="group.label" class="plugin-detail-section"><h2>{{ group.label }} <small>{{ group.entries.length }}</small></h2><p v-if="!group.entries.length">暂无{{ group.label }}</p><div v-for="entry in group.entries" :key="entry.name" class="plugin-component"><strong>{{ entry.name }}</strong><p>{{ 'unavailableReason' in entry && entry.unavailableReason || ('description' in entry ? entry.description : '在对话中选择后使用') }}</p></div></section>
        <section v-if="selected.hooks?.length || selected.hookDiagnostics?.length" class="plugin-detail-section"><h2>Hooks <small>{{ selected.hooks?.length || 0 }}</small></h2><p v-for="hook in selected.hooks" :key="hook.id">{{ hook.event }} · {{ hook.matcher || '匹配全部' }}</p><p v-for="diagnostic in selected.hookDiagnostics" :key="diagnostic" class="plugin-error">{{ diagnostic }}</p><button class="plugin-button" type="button" @click="reviewHooks(selected.id)">审阅与授权</button></section>
        <section class="plugin-detail-section"><h2>详细信息</h2><dl><dt>版本</dt><dd>{{ selected.version || '未声明' }}</dd><dt>来源</dt><dd>{{ selected.id.endsWith('@mira-builtin') ? '内置' : selected.id.endsWith('@local') ? '本地' : selected.id.split('@')[1] }}</dd><dt>插件标识</dt><dd>{{ selected.id }}</dd></dl><p v-if="selected.unsupported.length">尚未支持：{{ selected.unsupported.join('、') }}</p></section>
      </section>
      <section v-else-if="tab === 'plugins'" id="plugin-panel-plugins" role="tabpanel" :aria-busy="busy">
        <section v-for="group in groups" :key="group.key" class="plugin-group">
          <div v-if="group.key === 'installed' || group.items.length" class="plugin-group-heading"><h2>{{ group.label }} <small>{{ group.items.length }}</small></h2><div v-if="group.key === 'installed'" class="plugin-actions"><button class="plugin-button plugin-icon-button" type="button" :disabled="busy" aria-label="刷新插件" title="刷新插件" @click="load"><AppIcon name="lucide:refresh-cw" /></button><button class="plugin-button" type="button" @click="browse()">浏览插件</button><el-dropdown trigger="click" @command="addCommand"><button class="plugin-button plugin-button-primary" type="button" :disabled="busy">添加<AppIcon name="lucide:chevron-down" /></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="create"><AppIcon name="lucide:sparkles" />创建插件</el-dropdown-item><el-dropdown-item command="market"><AppIcon name="lucide:plus" />添加插件市场</el-dropdown-item><el-dropdown-item command="local"><AppIcon name="lucide:folder-plus" />添加本地插件</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></div>
          <p v-if="busy && !items.length && group.key === 'installed'" class="plugin-empty" role="status">正在读取插件…</p>
          <div v-else-if="!group.items.length && group.key === 'installed'" class="plugin-install-empty"><strong>{{ queries.plugins ? '没有匹配的已安装插件' : '尚未安装插件' }}</strong><p>浏览并安装插件，以添加 MCP、技能及更多能力。</p><button class="plugin-button plugin-button-primary" type="button" @click="browse()"><AppIcon name="lucide:plus" />浏览插件</button></div>
          <div v-else-if="group.items.length" class="plugin-row-group"><PluginRow v-for="item in group.items" :key="item.id" :item="item" :busy="busy" @open="selectedId = $event.id" @toggle="toggle" @remove="remove" /></div>
        </section>
      </section>
      <section v-show="!selected && tab === 'mcp'" id="plugin-panel-mcp" role="tabpanel"><McpSettings ref="mcpSettings" embedded :search-query="queries.mcp" @count-change="mcps = $event" /><section v-if="pluginMcps.length" class="plugin-group"><h2 class="plugin-provided-heading">插件提供 <small>{{ pluginMcps.length }}</small></h2><div class="plugin-row-group"><div v-for="entry in pluginMcps" :key="entry.server.id" class="plugin-provided-row"><button type="button" @click="selectedId = entry.plugin.id"><strong>{{ entry.server.name }}</strong><span>{{ entry.plugin.listing?.displayName || entry.plugin.name }} · {{ entry.server.unavailableReason || (entry.plugin.enabled && entry.server.enabled ? '已启用' : '已停用') }}</span></button><button class="plugin-button" type="button" @click="selectedId = entry.plugin.id">管理插件</button></div></div></section></section>
      <section v-if="!selected && tab === 'skills'" id="plugin-panel-skills" role="tabpanel"><SkillSettings :query="queries.skills" :plugins="items" @items-change="skills = $event" @open-plugin="selectedId = $event" /></section>
    </div>
  </SettingsPageShell>
</template>
<script setup lang="ts">
// Follows ZCode PluginsSection's unified plugins / MCP / skills settings structure.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import type { MiraPluginItem } from '@/config/miraPlugins'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import McpSettings from '../mcpConfig/index.vue'
import SkillSettings from './SkillSettings.vue'
import PluginRow from './PluginRow.vue'
import { useAppNavigationStore } from '@/stores/appNavigation'
import { HARNESS_WORKBENCH_PATH } from '@/platform/firstPartyNavigation'
import type { HarnessSkill } from '@/config/harness'
import type { MiraMcpServerRecord } from '@/config/miraMcp'

const route = useRoute(), router = useRouter(), api = getPlatformApi()
const tab = ref('plugins'), items = ref<MiraPluginItem[]>([]), busy = ref(false), error = ref(''), feedback = ref('')
const selectedId = ref<string>()
const selected = computed(() => items.value.find(item => item.id === selectedId.value))
const skills = ref<HarnessSkill[]>([]), mcps = ref<MiraMcpServerRecord[]>([])
const mcpSettings = ref<InstanceType<typeof McpSettings>>()
async function handleTabKey(event: KeyboardEvent) {
  const tabs = ['plugins', 'mcp', 'skills']
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (tabs.indexOf(tab.value) + (event.key === 'ArrowRight' ? 1 : 2)) % 3
  const buttons = (event.currentTarget as HTMLElement | null)?.querySelectorAll<HTMLButtonElement>('[role=tab]')
  await selectTab(tabs[index]!)
  buttons?.[tabs.indexOf(tab.value)]?.focus()
}
async function selectTab(value: string) { if (tab.value === 'mcp' && value !== 'mcp' && !await mcpSettings.value?.canLeave()) return; tab.value = value }
const queries = ref({ plugins: '', mcp: '', skills: '' })
const queryForTab = computed({ get: () => queries.value[tab.value as keyof typeof queries.value], set: value => { queries.value[tab.value as keyof typeof queries.value] = value } })
const groups = computed(() => [{ key: 'installed', label: '已安装', items: visible.value.filter(item => !item.id.endsWith('@mira-builtin')) }, { key: 'builtin', label: '内置', items: visible.value.filter(item => item.id.endsWith('@mira-builtin')) }])
const skillCount = computed(() => skills.value.length + items.value.reduce((count, item) => count + item.skills.length, 0))
const pluginMcps = computed(() => items.value.flatMap(plugin => (plugin.mcpServers || []).filter(server => `${server.name} ${plugin.name}`.toLocaleLowerCase().includes(queries.value.mcp.trim().toLocaleLowerCase())).map(server => ({ plugin, server }))))
const mcpCount = computed(() => mcps.value.length + items.value.reduce((count, item) => count + (item.mcpServers?.length || 0), 0))
const visible = computed(() => { const term = queries.value.plugins.trim().toLocaleLowerCase(); return items.value.filter(item => `${item.name} ${item.listing?.displayName || ''} ${item.description}`.toLocaleLowerCase().includes(term)) })
let grant: Promise<string> | undefined, disposed = false
async function call(method: string, params?: unknown) {
  if (!api) throw new Error('桌面插件服务不可用')
  grant ??= api.createFirstPartyGrant('mira-harness').catch(cause => { grant = undefined; throw cause })
  return await api.invokeFirstPartyHarness(await grant, method, params) as MiraPluginItem[] | null
}
async function perform(operation: () => Promise<MiraPluginItem[] | null>, success = '') {
  if (busy.value) return
  busy.value = true; error.value = ''; feedback.value = ''
  try { const value = await operation(); if (!disposed && value) { items.value = value; if (selectedId.value && !value.some(item => item.id === selectedId.value)) selectedId.value = undefined; feedback.value = success } }
  catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : '插件操作失败，请重试' }
  finally { if (!disposed) busy.value = false }
}
async function load() {
  await Promise.all([perform(() => call('plugins.list')), loadCounts()])
}
async function loadCounts() {
  if (!api) return
  try { const [loadedSkills, loadedMcps] = await Promise.all([api.listHarnessSkills(), api.listMcpServers()]); if (!disposed) { skills.value = loadedSkills; mcps.value = loadedMcps } }
  catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : '能力数量读取失败' }
}
async function browse(intent?: 'create' | 'add-marketplace') {
  if (intent && api) await api.savePreference('first-party.mira-harness.mira.plugin-market-intent', intent)
  useAppNavigationStore().openExtensions()
  await router.push(HARNESS_WORKBENCH_PATH)
}
function addCommand(value: string) { if (value === 'local') void importPlugin(); else void browse(value === 'create' ? 'create' : 'add-marketplace') }
function importPlugin() { return perform(() => call('plugins.import'), '已添加本地插件。') }
function toggle(item: MiraPluginItem, enabled: boolean) { return perform(() => call('plugins.set-enabled', { id: item.id, enabled }), enabled ? '插件已启用，新任务可使用。' : '插件已停用。') }
async function remove(item: MiraPluginItem) {
  try { await ElMessageBox.confirm(`移除“${item.listing?.displayName || item.name}”的安装登记？原目录及文件将保留。`, '移除插件', { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  await perform(() => call('plugins.remove', { id: item.id }), '已移除插件登记，原目录及文件保留。')
}
function reviewHooks(id: string) { void router.push({ path: '/settings/hooks', query: { ...route.query, plugin: id } }) }
onMounted(() => { void load() })
onUnmounted(() => { disposed = true; if (grant && api) void grant.then(id => api.revokeFirstPartyGrant(id)).catch(() => undefined) })
</script>

<style scoped>
.plugin-settings { min-width: 0; --plugin-surface: color-mix(in srgb, var(--cp-text) 4%, var(--cp-bg)); }
.plugin-breadcrumb { display: flex; align-items: center; gap: 10px; color: var(--cp-text-secondary); font-size: 12px; margin: 0 0 22px; }
.plugin-breadcrumb button { padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
h1 { font-size: var(--settings-text-title); font-weight: 600; letter-spacing: -0.02em; line-height: 1.333333; margin: 0 0 32px; }
.plugin-capabilities { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 24px; }
.plugin-user-scope { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--cp-border-light); border-radius: 18px; padding: 5px 10px; white-space: nowrap; font-size: 12px; }
.plugin-divider { height: 16px; width: 1px; background: var(--cp-border-light); }
.plugin-tabs { display: flex; gap: 4px; }
.plugin-tabs button { display: flex; align-items: center; gap: 7px; padding: 6px 12px; border: 0; border-radius: 20px; background: none; color: var(--cp-text-secondary); cursor: pointer; font: inherit; font-size: var(--settings-text-base); }
.plugin-tabs button[aria-selected=true] { background: var(--plugin-surface); color: var(--cp-text); font-weight: 500; }
small { color: var(--cp-text-secondary); font-size: 12px; font-weight: 400; }
.plugin-search { display: flex; align-items: center; gap: 8px; width: 256px; margin-left: auto; padding: 8px 11px; border: 1px solid var(--cp-border-light); border-radius: 12px; background: var(--cp-bg); color: var(--cp-text-secondary); }
.plugin-search input { min-width: 0; width: 100%; border: 0; background: none; color: var(--cp-text); font: inherit; font-size: 12px; }
.plugin-group { margin-bottom: 28px; }
.plugin-group-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; min-height: 28px; }
h2 { display: flex; gap: 7px; align-items: center; font-size: 14px; font-weight: 500; margin: 0; }
.plugin-actions { display: flex; gap: 8px; }
.plugin-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; min-height: 28px; border: 1px solid var(--cp-border-light); border-radius: 6px; background: var(--cp-bg); color: var(--cp-text); cursor: pointer; font: inherit; font-size: 12px; }
.plugin-button:hover { background: var(--cp-bg-hover); }
.plugin-icon-button { width: 28px; padding: 5px; }
.plugin-button-primary { background: var(--cp-text); color: var(--cp-bg); border-color: var(--cp-text); }
.plugin-button-primary:hover { opacity: .85; background: var(--cp-text); }
.plugin-button:disabled { opacity: .5; cursor: default; }
.plugin-install-empty { display: grid; justify-items: center; align-content: center; min-height: 168px; border: 1px dashed var(--cp-border-light); border-radius: 12px; font-size: var(--settings-text-base); }
.plugin-install-empty p { margin: 8px 0 14px; color: var(--cp-text-secondary); font-size: 12px; }
.plugin-row-group { overflow: hidden; border-radius: 12px; background: var(--plugin-surface); }
.plugin-provided-heading { margin: 28px 0 16px; }
.plugin-provided-row { display: flex; align-items: center; padding: 14px 16px; gap: 12px; border-bottom: 1px solid var(--cp-border-light); }
.plugin-provided-row > button:first-child { display: grid; flex: 1; gap: 6px; border: 0; padding: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.plugin-provided-row strong { font-size: 14px; font-weight: 500; }
.plugin-provided-row span { color: var(--cp-text-secondary); font-size: 12px; }
.plugin-error { color: var(--el-color-danger); line-height: 1.6; }
.plugin-notice, .plugin-empty { color: var(--cp-text-secondary); font-size: 12px; }
.plugin-detail-actions { display: flex; gap: 12px; align-items: center; margin-bottom: 24px; }
.plugin-detail-actions .el-switch { margin-left: auto; }
.plugin-detail p, .plugin-detail dd { font-size: var(--settings-text-base); line-height: 1.7; color: var(--cp-text-secondary); overflow-wrap: anywhere; }
.plugin-detail-section { margin-top: 28px; border-top: 1px solid var(--cp-border-light); padding-top: 20px; }
.plugin-component { margin-top: 18px; font-size: var(--settings-text-base); }
.plugin-component p { margin: 5px 0; }
dl { display: grid; grid-template-columns: 80px 1fr; gap: 12px; font-size: var(--settings-text-base); }
dd { margin: 0; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--cp-text); outline-offset: 3px; }
</style>
