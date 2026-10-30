<template>
  <SettingsPageShell title="事件钩子（Hooks）" :show-title="false">
    <template v-if="draft" #titlebar><nav class="mira-hooks__breadcrumb" aria-label="页面位置"><button type="button" :disabled="locked" aria-label="返回钩子列表" @click="close">事件钩子</button><AppIcon name="lucide:chevron-right" /><span>{{ draft.id ? items.find(item => item.id === draft?.id)?.name || '编辑钩子' : '新建钩子' }}</span></nav></template>
    <section class="mira-hooks" :aria-busy="loading">
      <template v-if="!draft">
      <h1 class="mira-hooks__title">事件钩子（Hooks）</h1>
      <div ref="directoryHeading" class="mira-hooks__toolbar" tabindex="-1">
        <SettingsScopeSelect :model-value="workspace" :workspaces="projects" :extra-scopes="[{ id: 'plugins', name: '插件', icon: 'lucide:blocks' }]" :disabled="locked" aria-label="Hook 作用范围" @update:model-value="selectWorkspace" />
        <span class="mira-hooks__divider" aria-hidden="true" /><span class="mira-hooks__count">钩子 <small>{{ filtered.length }}</small></span>
        <label class="mira-hooks__search"><AppIcon name="lucide:search" /><input :value="query" @input="query = ($event.target as HTMLInputElement).value" type="search" aria-label="搜索 Hook" placeholder="搜索钩子…" /></label>
      </div>
      <div class="mira-hooks__group-heading"><h2>{{ workspace === 'plugins' ? '插件提供' : '已安装' }} <small>{{ filtered.length }}</small></h2><div class="mira-hooks__actions"><el-button :loading="loading" :disabled="locked" aria-label="刷新 Hooks" title="刷新 Hooks" @click="refresh"><AppIcon name="lucide:refresh-cw" /></el-button><el-button type="primary" :disabled="locked || !api?.hooks || workspace === 'plugins'" aria-label="新建 Hook" @click="create"><AppIcon name="lucide:plus" />新建</el-button></div></div>
      <p v-if="workspace === 'plugins' && pluginFilter" class="mira-hooks__help">当前插件：{{ pluginFilter }} <el-button text :disabled="locked" aria-label="查看全部插件 Hooks" @click="pluginFilter = ''">查看全部插件 Hooks</el-button></p>
      <p v-if="loadError" class="mira-hooks__error" role="alert">{{ loadError }} <el-button text :disabled="locked" aria-label="重试加载 Hooks" @click="refresh">重试</el-button></p>
      <p v-if="feedback" class="mira-hooks__feedback" role="status">{{ feedback }}</p>
      </template>
      <header v-if="draft" class="mira-hooks__editor-heading"><h1 ref="editorHeading" tabindex="-1">{{ draft.id ? '编辑钩子' : '新建钩子' }}</h1></header>
      <section v-if="draft" class="mira-hooks__editor" aria-label="Hook 编辑器">
        <el-form label-position="top" :disabled="locked" @submit.prevent="save">
          <div class="mira-hooks__form-top"><el-form-item label="名称"><el-input v-model="draft.name" maxlength="120" aria-label="Hook 名称" placeholder="例如：检查文件写入" /></el-form-item><div class="mira-hooks__scope"><span>作用域</span><SettingsScopeSelect :model-value="draft.projectId || 'global'" :workspaces="projects" :disabled="locked || Boolean(draft.id)" aria-label="Hook 作用范围" @update:model-value="selectDraftWorkspace" /></div></div>
          <div class="mira-hooks__fields">
            <el-form-item label="事件"><el-select v-model="draft.event" aria-label="Hook 事件"><el-option v-for="event in MIRA_HOOK_EVENTS" :key="event" :label="event" :value="event" /></el-select></el-form-item>
            <el-form-item label="执行方式"><el-select v-model="draft.type" aria-label="Hook 执行方式"><el-option label="直接启动进程" value="process" /><el-option label="Shell 命令" value="command" /></el-select></el-form-item>
          </div>
          <el-form-item><template #label>匹配条件（可选）<SettingsTooltip content="工具事件按工具名称匹配，留空匹配全部；会话事件不需要匹配条件。" placement="top"><button type="button" class="mira-hooks__help-button" aria-label="匹配条件说明"><AppIcon name="lucide:circle-help" /></button></SettingsTooltip></template><el-input v-model="draft.matcher" aria-label="Hook 匹配条件" placeholder="例如 write|edit" /></el-form-item>
          <el-form-item :label="draft.type === 'process' ? '启动命令' : 'Shell 命令'"><el-input v-model="draft.command" aria-label="Hook 命令" :placeholder="draft.type === 'process' ? '例如 node 或 /usr/bin/python3' : '例如 ./scripts/check.sh'" /></el-form-item>
          <el-form-item v-if="draft.type === 'process'" label="参数（每行一个）"><el-input v-model="draft.argsText" type="textarea" :rows="3" aria-label="Hook 参数" placeholder="scripts/check.mjs&#10;--strict" /></el-form-item>
          <template v-else>
            <el-form-item label="Shell（可选）"><el-input v-model="draft.shell" aria-label="Hook Shell" placeholder="留空使用系统默认 Shell" /></el-form-item>
            <div class="mira-hooks__switch-row"><span>异步执行<SettingsTooltip content="异步命令不会阻塞当前任务；返回结果不能阻止操作或更改权限决定。" placement="top"><button type="button" class="mira-hooks__help-button" aria-label="异步执行说明"><AppIcon name="lucide:circle-help" /></button></SettingsTooltip></span><el-switch v-model="draft.async" aria-label="异步执行 Hook" /></div>
          </template>
          <details class="mira-hooks__advanced">
            <summary><AppIcon name="lucide:chevron-right" />高级配置</summary>
            <div class="mira-hooks__fields">
              <el-form-item label="超时（秒）"><el-input v-model="draft.timeoutText" type="number" min="1" max="600" aria-label="Hook 超时秒数" placeholder="60" /></el-form-item>
              <el-form-item label="运行状态说明（可选）"><el-input v-model="draft.statusMessage" aria-label="Hook 运行状态说明" placeholder="例如：正在检查文件…" /></el-form-item>
            </div>
            <el-form-item label="自定义数据（可选，JSON 对象）"><el-input v-model="draft.customText" type="textarea" :rows="4" aria-label="Hook 自定义 JSON" spellcheck="false" placeholder='{"team": "writing"}' /></el-form-item>
          </details>
          <div class="mira-hooks__switch-row"><span>启用<SettingsTooltip content="事件发生时自动执行；新建或修改脚本后仍需审阅并信任。" placement="top"><button type="button" class="mira-hooks__help-button" aria-label="启用钩子说明"><AppIcon name="lucide:circle-help" /></button></SettingsTooltip></span><el-switch v-model="draft.enabled" aria-label="启用 Hook" /></div>
        </el-form>
        <p v-if="editorError" class="mira-hooks__error" role="alert">{{ editorError }}</p>
        <div class="mira-hooks__actions mira-hooks__editor-actions"><span v-if="dirty" class="mira-hooks__unsaved" role="status">未保存</span><el-button type="primary" :loading="saving" :disabled="locked || !dirty || !draft.name.trim() || !draft.command.trim()" aria-label="保存 Hook" @click="save">保存</el-button><el-button text :disabled="locked" aria-label="取消 Hook 编辑" @click="close">取消</el-button></div>
      </section>

      <template v-if="!draft">
      <div v-if="loading && !items.length" class="mira-hooks__loading" aria-label="正在加载 Hooks"><el-skeleton :rows="3" animated /></div>
      <div v-else-if="filtered.length" class="mira-hooks__list">
        <article v-for="item in filtered" :key="item.id" class="mira-hooks__row" :data-hook-id="item.id" :data-hook-event="item.event" :data-hook-status="status(item)" :data-hook-scope="item.scope">
          <span class="mira-hooks__mark" aria-hidden="true"><AppIcon name="lucide:anchor" /></span>
          <div class="mira-hooks__identity"><h2>{{ item.name }} <el-tag size="small" effect="plain">{{ item.scope === 'plugin' ? `插件 · ${item.pluginName || item.pluginId}` : item.scope === 'project' ? '当前项目' : '全局' }}</el-tag><span>{{ statusLabel(item) }}</span></h2><p>{{ item.event }} · {{ item.type === 'process' ? '直接启动进程' : 'Shell 命令' }}<template v-if="item.matcher"> · {{ item.matcher }}</template></p><p class="mira-hooks__command" :title="item.command">{{ item.command }}</p><template v-if="item.scope === 'plugin'"><p class="mira-hooks__command">参数：{{ JSON.stringify(item.args) }}</p><p>来源：{{ item.sourcePath }}</p><p class="mira-hooks__help">由插件提供，修改配置请前往插件源文件；授权仅适用于当前内容。</p></template><p v-if="item.unavailableReason" class="mira-hooks__error">{{ safeError(item.unavailableReason) }}</p><p v-if="rowErrors[item.id]" class="mira-hooks__error" role="alert">{{ rowErrors[item.id] }}</p></div>
          <div class="mira-hooks__actions">
            <template v-if="item.scope === 'plugin'">
              <el-button v-if="!item.trusted" :loading="rowPending[item.id] === 'trust'" :disabled="locked || !canReviewPlugin(item)" :aria-label="`审阅并授权 ${item.name}`" @click="trust(item)">审阅并授权</el-button>
              <el-button v-else :loading="rowPending[item.id] === 'revoke'" :disabled="locked" :aria-label="`撤销授权 ${item.name}`" @click="mutate(item, 'revoke')">撤销授权</el-button>
            </template>
            <template v-else>
            <el-button v-if="!item.trusted" :loading="rowPending[item.id] === 'trust'" :disabled="locked" :aria-label="`信任并启用 ${item.name}`" @click="trust(item)">信任并启用</el-button>
            <el-switch :model-value="item.enabled && item.trusted && !item.unavailableReason" :disabled="locked || !item.trusted || !!item.unavailableReason" :aria-label="`启用 ${item.name}`" @change="toggle(item, $event)" />
            <el-button text circle :disabled="locked" :aria-label="`编辑 ${item.name}`" :title="`编辑 ${item.name}`" @click="edit(item)"><AppIcon name="EditPen" /></el-button>
            <el-button text circle type="danger" :loading="rowPending[item.id] === 'delete'" :disabled="locked" :aria-label="`删除 ${item.name}`" :title="`删除 ${item.name}`" @click="remove(item)"><AppIcon name="Delete" /></el-button>
            </template>
          </div>
        </article>
      </div>
      <div v-else-if="!loadError" class="mira-hooks__empty"><h3>{{ query.trim() ? '没有匹配的 Hook' : workspace === 'plugins' ? '尚无插件钩子' : '尚未安装钩子' }}</h3><p>{{ query.trim() ? '尝试其他名称、事件或命令。' : workspace === 'plugins' ? '在插件市场添加含钩子的插件后，可在这里审阅并授权。' : '新建钩子，以在任务生命周期事件中运行命令。' }}</p><el-button v-if="!query.trim() && workspace !== 'plugins'" type="primary" :disabled="!api?.hooks" aria-label="新建 Hook" @click="create"><AppIcon name="lucide:plus" />新建钩子</el-button></div>
      </template>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import type { HarnessProject } from '@/config/harness'
import { MIRA_HOOK_EVENTS, type MiraHookItem, type MiraHookWrite, type MiraHookEvent, type MiraHookScope, type MiraHookEditableScope } from '@/config/miraHooks'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import SettingsScopeSelect from '../settings/components/SettingsScopeSelect.vue'
import SettingsTooltip from '../settings/components/SettingsTooltip.vue'

const api = getPlatformApi(), route = useRoute()
const projects = shallowRef<HarnessProject[]>([]), items = shallowRef<MiraHookItem[]>([])
const pluginFilter = ref(typeof route.query.plugin === 'string' ? route.query.plugin : '')
const workspace = ref(pluginFilter.value ? 'plugins' : typeof route.query.project === 'string' ? route.query.project : 'global'), query = ref('')
const loading = ref(false), saving = ref(false), loadError = ref(''), editorError = ref(''), feedback = ref('')
const rowPending = ref<Record<string, 'delete' | 'toggle' | 'trust' | 'revoke'>>({}), rowErrors = ref<Record<string, string>>({})
type Draft = { id?: string; scope: MiraHookEditableScope; projectId?: string; revision?: string; name: string; event: MiraHookEvent; type: 'command' | 'process'; matcher: string; command: string; argsText: string; shell: string; async: boolean; timeoutText: string; statusMessage: string; customText: string; enabled: boolean }
const draft = ref<Draft>()
const editorHeading = ref<HTMLHeadingElement>(), directoryHeading = ref<HTMLDivElement>()
let original = '', disposed = false, sequence = 0
const locked = computed(() => loading.value || saving.value || Object.keys(rowPending.value).length > 0)
const dirty = computed(() => Boolean(draft.value && JSON.stringify(draft.value) !== original))
const filtered = computed(() => { const value = query.value.trim().toLocaleLowerCase(); return items.value.filter(item => item.scope === (workspace.value === 'plugins' ? 'plugin' : workspace.value === 'global' ? 'global' : 'project') && (workspace.value !== 'plugins' || !pluginFilter.value || item.pluginId === pluginFilter.value) && [item.name, item.event, item.command, item.matcher || '', item.pluginName || '', item.sourcePath].some(text => text.toLocaleLowerCase().includes(value))) })
const errorMessages = new Set(['请填写 Hook 名称', '请填写 Hook 命令', '超时必须是 1–600 的整数秒', '自定义数据必须是有效的 JSON 对象', '自定义数据必须是 JSON 对象', '桌面 Hook 服务不可用，请重启最新版本后重试', '项目不可用，请选择有效项目或全局范围。', '请先选择有效项目目录', 'Mira 用户目录不可用', '每个 Hook 范围最多支持 128 项', 'Hook 配置文件损坏或无效，请修复后重试；原文件未被覆盖', 'Hook 信任记录损坏，请修复后重试；原文件未被覆盖', 'Hook 已移除或已被修改，请刷新后重试', 'Hook 已禁用、来源或信任状态已变化，请重新读取后重试', '此 Hook 尚未确认信任或内容已变化，请在设置中检查并确认后启用'])
const pluginErrors = new Set(['Hook 插件已停用或声明不可用，请刷新后重试', '插件 Hook 名称冲突，请停用重名插件', '插件 Hook 已停用或已移除', '插件 Hook 内容已变化，请新建会话后重新启用', '插件 Hook 声明已停用', '插件 Hook 已停用、已移除或不属于当前会话'])
function safeError(failure: unknown) {
  const message = (failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
  // Configuration can contain secrets in command arguments or custom JSON; host errors are allowlisted.
  return errorMessages.has(message) || pluginErrors.has(message) || /^Hook (?:名称|事件或执行类型|启用或异步状态|Shell|范围|配置|标识|命令|匹配条件|状态说明)无效$/.test(message) || /^Hook (?:已被修改，请刷新后重试|配置文件无效或超过大小限制|配置文件超过大小限制|参数无效或超过 128 项|参数超过大小限制|超时需要 1 至 600 秒的整数|自定义参数需要 JSON 对象|自定义参数需要有效 JSON|自定义参数层级超过限制|自定义参数超过 8KB|信任记录超过限制|配置超过大小限制|路径超出所属目录|路径不能经过符号链接|启用状态无效)$/.test(message) ? message : '操作失败，请刷新后重试；编辑内容已保留。'
}
function canReviewPlugin(item: MiraHookItem) { return item.enabled && (!item.unavailableReason || item.unavailableReason === '此 Hook 尚未确认信任或内容已变化，请在设置中检查并确认后启用') }
function status(item: MiraHookItem) { return item.scope === 'plugin' && !item.enabled ? 'disabled' : item.scope === 'plugin' && !canReviewPlugin(item) ? 'unavailable' : !item.trusted ? 'untrusted' : item.unavailableReason ? 'unavailable' : item.enabled ? 'enabled' : 'disabled' }
function statusLabel(item: MiraHookItem) { return { untrusted: '等待信任', unavailable: '暂不可用', enabled: '已启用', disabled: '已停用' }[status(item)] }
function setDraft(value?: Draft) { draft.value = value; original = value ? JSON.stringify(value) : ''; editorError.value = '' }
function request(scope?: MiraHookScope) { return !['global', 'plugins'].includes(workspace.value) && scope !== 'global' && scope !== 'plugin' ? { projectId: workspace.value } : {} }
function hooksApi() { if (!api?.hooks) throw new Error('桌面 Hook 服务不可用，请重启最新版本后重试'); return api.hooks }
async function mayDiscard() {
  if (locked.value) return false
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('Hook 尚未保存，放弃本次修改？', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return !disposed }
  catch { return false }
}
async function load() {
  const own = ++sequence; loading.value = true; loadError.value = ''
  try {
    const service = hooksApi(); const registered = await api!.listHarnessProjects()
    if (disposed || own !== sequence) return
    projects.value = registered
    if (!['global', 'plugins'].includes(workspace.value) && !registered.some(project => project.id === workspace.value)) throw new Error('项目不可用，请选择有效项目或全局范围。')
    const result = await service.list(request()); if (!disposed && own === sequence) items.value = result
  }
  catch (failure) { if (!disposed && own === sequence) loadError.value = safeError(failure) }
  finally { if (!disposed && own === sequence) loading.value = false }
}
async function refresh() { if (!await mayDiscard()) return; setDraft(); feedback.value = ''; await load() }
async function selectWorkspace(value: string) {
  if (value === workspace.value || !await mayDiscard()) return
  if (!['global', 'plugins'].includes(value) && !projects.value.some(project => project.id === value)) return
  workspace.value = value; setDraft(); items.value = []; rowErrors.value = {}; feedback.value = ''; await load()
}
async function create() {
  if (workspace.value === 'plugins') return
  if (!await mayDiscard()) return
  setDraft({ scope: workspace.value === 'global' ? 'global' : 'project', ...(workspace.value !== 'global' ? { projectId: workspace.value } : {}), name: '', event: 'PreToolUse', type: 'process', matcher: '', command: '', argsText: '', shell: '', async: false, timeoutText: '60', statusMessage: '', customText: '', enabled: true }); feedback.value = ''
  await nextTick(); editorHeading.value?.focus?.()
}
function selectDraftWorkspace(value: string) {
  if (!draft.value || draft.value.id || locked.value || value !== 'global' && !projects.value.some(project => project.id === value)) return
  draft.value.scope = value === 'global' ? 'global' : 'project'; draft.value.projectId = value === 'global' ? undefined : value
}
async function edit(item: MiraHookItem) {
  if (item.scope === 'plugin') return
  if (!await mayDiscard()) return
  setDraft({ id: item.id, revision: item.revision, scope: item.scope, ...(item.scope === 'project' ? { projectId: workspace.value } : {}), name: item.name, event: item.event, type: item.type, matcher: item.matcher || '', command: item.command, argsText: (item.args || []).join('\n'), shell: typeof item.shell === 'string' ? item.shell : '', async: item.async || false, timeoutText: String(item.timeout ?? 60), statusMessage: item.statusMessage || '', customText: item.custom && Object.keys(item.custom).length ? JSON.stringify(item.custom, null, 2) : '', enabled: item.enabled }); feedback.value = ''
  await nextTick(); editorHeading.value?.focus?.()
}
async function close() { if (await mayDiscard()) { setDraft(); await nextTick(); directoryHeading.value?.focus?.() } }
function replace(item: MiraHookItem) { sequence++; const exists = items.value.some(value => value.id === item.id); items.value = exists ? items.value.map(value => value.id === item.id ? item : value) : [...items.value, item] }
function payload(value: Draft): MiraHookWrite {
  if (!value.name.trim()) throw new Error('请填写 Hook 名称')
  if (!value.command.trim()) throw new Error('请填写 Hook 命令')
  const timeout = Number(value.timeoutText)
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600) throw new Error('超时必须是 1–600 的整数秒')
  let custom: Record<string, unknown> = {}
  if (value.customText.trim()) {
    let parsed: unknown
    try { parsed = JSON.parse(value.customText) } catch { throw new Error('自定义数据必须是有效的 JSON 对象') }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('自定义数据必须是 JSON 对象')
    custom = parsed as Record<string, unknown>
  }
  return { ...(value.id ? { id: value.id, expectedRevision: value.revision } : {}), scope: value.scope, name: value.name.trim(), event: value.event, type: value.type, matcher: value.matcher.trim(), command: value.command.trim(), ...(value.type === 'process' ? { args: value.argsText.split('\n').map(arg => arg.trim()).filter(Boolean) } : { shell: value.shell.trim() || true, async: value.async }), timeout, statusMessage: value.statusMessage.trim(), custom, enabled: value.enabled }
}
async function save() {
  if (locked.value || !draft.value) return
  editorError.value = ''; feedback.value = ''
  try {
    const value = payload(draft.value); saving.value = true
    const targetWorkspace = draft.value.projectId || 'global'
    const result = await hooksApi().save({ ...value, ...(value.scope === 'project' ? { projectId: draft.value.projectId } : {}) })
    if (disposed) return
    replace(result); setDraft(); feedback.value = result.trusted ? 'Hook 已保存。' : 'Hook 已保存，信任并启用后才会运行。'
    if (workspace.value !== targetWorkspace) { workspace.value = targetWorkspace; await load() }
    await nextTick(); directoryHeading.value?.focus?.()
  } catch (failure) { if (!disposed) editorError.value = `未保存：${safeError(failure)} 编辑内容已保留，可重试。` }
  finally { if (!disposed) saving.value = false }
}
function editableTarget(item: MiraHookItem) {
  if (item.scope === 'plugin') throw new Error('插件 Hook 不支持编辑')
  return { scope: item.scope, id: item.id, expectedRevision: item.revision, ...request(item.scope) }
}
async function mutate(item: MiraHookItem, action: 'delete' | 'toggle' | 'trust' | 'revoke', enabled = false) {
  if (locked.value) return
  rowPending.value[item.id] = action; delete rowErrors.value[item.id]; feedback.value = ''
  try {
    const service = hooksApi()
    if (item.scope === 'plugin') {
      if (!item.pluginId || !['trust', 'revoke'].includes(action)) return
      const pluginTarget = { scope: 'plugin' as const, pluginId: item.pluginId, id: item.id, expectedRevision: item.revision }
      const result = action === 'revoke' ? await service.revokeTrust(pluginTarget) : await service.trust(pluginTarget)
      if (!disposed) { replace(result); feedback.value = action === 'revoke' ? '插件 Hook 已撤销授权，后续事件不会运行。' : result.trusted ? '插件 Hook 已授权。' : 'Hook 状态尚未更新，请刷新后重试。' }
    }
    else if (action === 'delete') { await service.delete(editableTarget(item)); if (!disposed) { sequence++; items.value = items.value.filter(value => value.id !== item.id); if (draft.value?.id === item.id) setDraft(); feedback.value = 'Hook 已删除。' } }
    else {
      const result = await (action === 'trust' && item.enabled ? service.trust(editableTarget(item)) : service.setEnabled({ ...editableTarget(item), enabled: action === 'trust' || enabled }))
      if (!disposed) { replace(result); if (draft.value?.id === item.id) setDraft(); feedback.value = action === 'trust' ? result.trusted && result.enabled ? 'Hook 已信任并启用。' : 'Hook 状态尚未更新，请刷新后重试。' : enabled ? 'Hook 已启用。' : 'Hook 已停用。' }
    }
  } catch (failure) { if (!disposed) rowErrors.value[item.id] = safeError(failure) }
  finally { if (!disposed) delete rowPending.value[item.id] }
}
async function remove(item: MiraHookItem) {
  if (draft.value?.id === item.id && !await mayDiscard() || locked.value) return
  try { await ElMessageBox.confirm(`确定删除 Hook“${item.name}”？`, '删除 Hook', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  if (!disposed) await mutate(item, 'delete')
}
async function toggle(item: MiraHookItem, enabled: unknown) { if (!item.trusted || item.unavailableReason || draft.value?.id === item.id && !await mayDiscard()) return; await mutate(item, 'toggle', enabled === true) }
async function trust(item: MiraHookItem) {
  if (item.trusted || locked.value || item.scope === 'plugin' && !canReviewPlugin(item) || draft.value?.id === item.id && !await mayDiscard()) return
  const fields = [
    ['事件', item.event], ['匹配', item.matcher || '全部'], ['命令', item.command],
    ...(item.type === 'process' ? [['参数', JSON.stringify(item.args || [])]] : [['Shell', typeof item.shell === 'string' ? item.shell : '系统默认'], ['异步', item.async ? '是' : '否']]),
    ['超时', `${item.timeout} 秒`], ['自定义数据', JSON.stringify(item.custom || {})],
    ...(item.scope === 'plugin' ? [['插件', item.pluginName || item.pluginId || ''], ['来源', item.sourcePath]] : []),
  ]
  const message = h('div', { class: 'mira-hook-review__content' }, [
    h('p', item.scope === 'plugin' ? `确认授权插件 Hook“${item.name}”？` : `确认信任并启用“${item.name}”？`),
    h('dl', fields.flatMap(([label, value]) => [
      h('dt', `${label}：`),
      h('dd', { class: ['命令', '参数', '自定义数据'].includes(label) ? 'mira-hook-review__code' : undefined }, value.split(/(?<=\/)/).flatMap((part, index) => index ? [h('wbr'), part] : [part])),
    ])),
    h('p', '该脚本将在本机运行。'),
  ])
  try { await ElMessageBox.confirm(message, item.scope === 'plugin' ? '审核插件 Hook' : item.scope === 'project' ? '审核项目 Hook' : '审核全局 Hook', { confirmButtonText: item.scope === 'plugin' ? '授权当前内容' : '信任并启用', cancelButtonText: '取消', type: 'warning', customClass: 'mira-hook-review' }) } catch { return }
  if (!disposed) await mutate(item, 'trust')
}
onBeforeRouteLeave(mayDiscard)
onUnmounted(() => { disposed = true; sequence++ })
onMounted(load)
</script>

<style scoped lang="scss">
.mira-hooks__help { color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.6; }
.mira-hooks__title { margin: 0 0 32px; font-size: var(--settings-text-title); font-weight: 550; letter-spacing: -0.02em; line-height: 1.333333; }
.mira-hooks__toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.mira-hooks__toolbar:focus, .mira-hooks__editor-heading h1:focus { outline: none; }
.mira-hooks__divider { width: 1px; height: 16px; background: var(--cp-border-light); }
.mira-hooks__count, .mira-hooks__group-heading h2 { font-size: var(--settings-text-base); font-weight: 500; }
.mira-hooks small { margin-left: 6px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); font-weight: 400; }
.mira-hooks__search { display: flex; align-items: center; gap: 8px; width: 256px; box-sizing: border-box; margin-left: auto; padding: 8px 11px; border: 1px solid var(--cp-border-light); border-radius: 12px; color: var(--cp-text-secondary); }
.mira-hooks__search:focus-within { border-color: var(--cp-border); }
.mira-hooks__search input { width: 100%; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--cp-text); font: inherit; font-size: 12px; }
.mira-hooks__search :deep(.app-icon) { flex: none; width: 12px; height: 12px; }
.mira-hooks__group-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.mira-hooks__group-heading h2 { margin: 0; }
.mira-hooks__toolbar :deep(.el-button + .el-button), .mira-hooks__actions :deep(.el-button + .el-button) { margin-left: 0; }
.mira-hooks__group-heading :deep(.el-button--primary .app-icon), .mira-hooks__empty :deep(.app-icon) { margin-right: 4px; }
.mira-hooks__editor { padding: 16px; border: 1px solid var(--cp-border-light); border-radius: 12px; }
.mira-hooks__editor-heading { margin-bottom: 16px; }
.mira-hooks__editor-heading h1 { margin: 0; font-size: 18px; line-height: 26px; font-weight: 600; }
.mira-hooks__form-top { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.mira-hooks__form-top > :deep(.el-form-item) { width: 224px; }
.mira-hooks__scope { display: flex; align-items: center; gap: 8px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.mira-hooks__fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.mira-hooks__fields :deep(.el-select) { width: 100%; }
.mira-hooks__editor :deep(.el-form-item) { margin-bottom: 12px; }
.mira-hooks__editor :deep(.el-form-item__label) { margin-bottom: 6px; line-height: 20px; font-size: var(--settings-text-base); }
.mira-hooks__editor :deep(input::placeholder), .mira-hooks__editor :deep(textarea::placeholder), .mira-hooks__search input::placeholder { color: var(--cp-text-secondary); opacity: 1; }
.mira-hooks__switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding: 10px 12px; border-radius: 8px; background: var(--cp-bg-elevated); font-size: var(--settings-text-base); }
.mira-hooks__help-button { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; width: 20px; height: 20px; margin-left: 4px; padding: 3px; border: 0; border-radius: 6px; background: transparent; color: var(--cp-text-tertiary); cursor: help; }
.mira-hooks__help-button:hover { background: var(--cp-bg-hover); color: var(--cp-text); }
.mira-hooks__help-button :deep(.app-icon) { width: 14px; height: 14px; }
.mira-hooks__help-button:focus-visible { outline: 2px solid var(--cp-text-secondary); outline-offset: 2px; }
.mira-hooks__help { margin: 6px 0 0; width: 100%; }
.mira-hooks__advanced { margin-bottom: 12px; padding-top: 12px; border-top: 1px solid var(--cp-border-light); }
.mira-hooks__advanced summary { display: flex; align-items: center; gap: 6px; list-style: none; cursor: pointer; font-size: var(--settings-text-base); margin-bottom: 12px; }
.mira-hooks__advanced summary::-webkit-details-marker { display: none; }
.mira-hooks__advanced summary :deep(.app-icon) { width: 14px; height: 14px; color: var(--cp-text-secondary); }
.mira-hooks__advanced[open] summary :deep(.app-icon) { transform: rotate(90deg); }
.mira-hooks__advanced summary:focus-visible { outline: 2px solid var(--cp-text-secondary); outline-offset: 3px; }
.mira-hooks__editor :deep(textarea), .mira-hooks__command { font: 12px/20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; caret-color: var(--cp-text); }
.mira-hooks__list { overflow: hidden; border-radius: $radius-md; background: var(--cp-bg-elevated); }
.mira-hooks__row { display: flex; align-items: center; gap: 16px; padding: 16px; }
.mira-hooks__row + .mira-hooks__row { border-top: 1px solid var(--cp-border-light); }
.mira-hooks__mark { display: grid; place-items: center; flex: 0 0 36px; width: 36px; height: 36px; border-radius: $radius-sm; background: var(--cp-bg); color: var(--cp-text-secondary); }
.mira-hooks__identity { flex: 1; min-width: 0; }
.mira-hooks__identity h2 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0; font-size: var(--settings-text-base); font-weight: 450; overflow-wrap: anywhere; }
.mira-hooks__identity h2 span { font-weight: 400; }
.mira-hooks__identity h2 span, .mira-hooks__identity p { color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.mira-hooks__identity p { margin: 4px 0 0; overflow-wrap: anywhere; }
.mira-hooks__identity .mira-hooks__command { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mira-hooks__row[data-hook-scope='plugin'] .mira-hooks__command { white-space: pre-wrap; overflow-wrap: anywhere; }
.mira-hooks__actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.mira-hooks__editor-actions { justify-content: flex-end; }
.mira-hooks__unsaved { color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.mira-hooks__empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 168px; box-sizing: border-box; gap: 10px; padding: 24px; border: 1px dashed var(--cp-border); border-radius: 12px; text-align: center; }
.mira-hooks__empty h3 { margin: 0; font-size: var(--settings-text-base); font-weight: 500; }
.mira-hooks__empty p { margin: 0 0 4px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.6; }
.mira-hooks__breadcrumb { display: flex; align-items: center; gap: 10px; color: var(--cp-text); font-size: var(--settings-text-base); }
.mira-hooks__breadcrumb button { padding: 0; border: 0; background: transparent; color: var(--cp-text-secondary); font: inherit; cursor: pointer; }
.mira-hooks__breadcrumb button:hover { color: var(--cp-text); }
.mira-hooks__breadcrumb :deep(.app-icon) { width: 14px; color: var(--cp-text-tertiary); }
.mira-hooks__error, .mira-hooks__identity .mira-hooks__error { color: color-mix(in srgb, var(--cp-danger) 75%, var(--cp-text)); font-size: var(--settings-text-base); line-height: 1.6; overflow-wrap: anywhere; }
.mira-hooks__feedback { font-size: var(--settings-text-base); }
.mira-hooks__loading { padding: 20px; min-height: 120px; }
@media (max-width: 900px) {
  .mira-hooks__search { width: 100%; margin-left: 0; }
  .mira-hooks__row { flex-wrap: wrap; }
  .mira-hooks__fields { grid-template-columns: minmax(0, 1fr); }
  .mira-hooks__form-top > :deep(.el-form-item) { width: 100%; }
}
:global(.mira-hook-review) { width: min(640px, calc(100vw - 32px)); }
:global(.mira-hook-review .el-message-box__message) { max-height: 50vh; overflow: auto; }
:global(.mira-hook-review__content p) { margin: 0; overflow-wrap: anywhere; }
:global(.mira-hook-review__content dl) { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 12px; margin: 16px 0; }
:global(.mira-hook-review__content dt) { white-space: nowrap; }
:global(.mira-hook-review__content dd) { min-width: 0; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; word-break: normal; }
:global(.mira-hook-review__code) { font: 12px/20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
</style>
