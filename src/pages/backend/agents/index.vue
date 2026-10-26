<template>
  <!-- Agent form layout adapted from ZCode (Apache-2.0); see third-party-licenses/zcode. -->
  <SettingsPageShell title="子智能体" :show-title="false">
    <template v-if="draft" #titlebar><nav class="user-agents__breadcrumb" aria-label="页面位置"><button type="button" :disabled="busy" @click="close">子智能体</button><AppIcon name="lucide:chevron-right" /><span>{{ creating ? '新建子智能体' : draft.name }}</span></nav></template>
    <section class="user-agents" :aria-busy="busy">
      <template v-if="!draft">
      <h1 class="user-agents__title">子智能体</h1>
      <div ref="directoryHeading" class="user-agents__toolbar" tabindex="-1">
        <SettingsScopeSelect :model-value="workspace" :workspaces="projects" :disabled="busy" @update:model-value="selectWorkspace" />
        <span class="user-agents__divider" aria-hidden="true" />
        <span class="user-agents__count">子智能体 <small>{{ filteredItems.length + filteredOverrideGroups.reduce((count, group) => count + group.rows.length, 0) }}</small></span>
        <label class="user-agents__search"><AppIcon name="lucide:search" /><input :value="query" @input="query = ($event.target as HTMLInputElement).value" type="search" placeholder="搜索子智能体…" aria-label="搜索子智能体" /></label>
      </div>
      <div class="user-agents__group-heading"><h2>自定义 <small>{{ filteredItems.length }} 项</small></h2><div class="user-agents__actions">
        <el-button :disabled="busy" :loading="busy" aria-label="重新加载子智能体" title="重新加载子智能体" @click="refresh"><AppIcon name="lucide:refresh-cw" /></el-button>
        <el-button type="primary" :disabled="busy || !api?.userAgents" aria-label="新建子智能体" @click="create"><AppIcon name="lucide:plus" />新建</el-button>
      </div></div>
      <p v-if="error" class="user-agents__error" role="alert">{{ error }}</p><p v-if="feedback" role="status">{{ feedback }}</p>
      <p v-if="busy && !items.length" role="status">正在加载子智能体…</p>
      <div v-else class="user-agents__list">
        <article v-for="item in filteredItems" :key="item.id" class="user-agents__row">
          <div class="user-agents__avatar" aria-hidden="true"><AppIcon name="lucide:bot" /><span v-if="item.color" class="user-agents__color-dot" :data-mira-agent-color="item.color" :title="`标识颜色：${colorLabels[item.color]}`" /></div>
          <div class="user-agents__identity"><h2>@{{ item.name }} <span v-if="!item.enabled" class="user-agents__status">已停用</span></h2><p>{{ item.description || '未填写说明' }}</p><p v-if="item.modelSelection">模型：{{ item.modelSelection.providerId }} / {{ item.modelSelection.modelId }}</p><p v-if="item.tools">工具：{{ item.tools.length ? item.tools.join('、') : '不使用工具' }}</p><p v-if="item.unavailableReason || item.shadowed" class="user-agents__error">{{ item.unavailableReason || '被同名项目子智能体覆盖；全局版本仍可编辑' }}</p></div>
          <div class="user-agents__actions"><el-switch :model-value="item.enabled" :disabled="busy" :aria-label="`${item.enabled ? '停用' : '启用'} ${item.name}`" @change="toggle(item)" /><el-button text :disabled="busy" :aria-label="`编辑 ${item.name}`" @click="edit(item)"><AppIcon name="EditPen" />编辑</el-button><el-button text type="danger" :disabled="busy" :aria-label="`删除 ${item.name}`" @click="remove(item)"><AppIcon name="Delete" />删除</el-button></div>
        </article>
        <div v-if="!busy && !filteredItems.length && !error" class="user-agents__empty"><h3>{{ query.trim() ? '没有找到匹配的自定义子智能体' : '还没有自定义子智能体' }}</h3><p>{{ query.trim() ? '尝试其他名称或用途说明。' : '创建专用子智能体，保存后可在工作台通过 @、/ 或 + 引用。' }}</p><el-button v-if="!query.trim()" type="primary" :disabled="!api?.userAgents" @click="create"><AppIcon name="lucide:plus" />新建</el-button></div>
      </div>
      </template>
      <header v-if="draft" class="user-agents__editor-heading"><h1 ref="editorHeading" tabindex="-1">{{ creating ? '新建子智能体' : '编辑子智能体' }}</h1></header>
      <section v-if="draft" class="user-agents__editor" aria-label="子智能体编辑器">
        <div class="user-agents__editor-scope"><span>作用域</span><SettingsScopeSelect :model-value="draft.projectId || 'global'" :workspaces="projects" :disabled="busy || !creating" @update:model-value="selectDraftWorkspace" /><span v-if="dirty" role="status">未保存</span><el-button v-if="!creating" text :disabled="busy" @click="changeEditorMode(editorMode === 'structured' ? 'advanced' : 'structured')">{{ editorMode === 'structured' ? '编辑 Markdown' : '返回表单' }}</el-button></div>
        <p v-if="advancedReason" class="user-agents__description" role="status">{{ advancedReason }} 原始 Markdown 已保留，可在高级编辑中修正后切回表单。</p>
        <el-form label-position="top" @submit.prevent="save">
          <div :class="{ 'user-agents__form-top': editorMode === 'structured' }">
          <el-form-item label="名称" :error="touched.name ? fieldErrors.name : ''"><el-input v-model="draft.name" :disabled="busy || Boolean(draft.revision)" maxlength="50" placeholder="例如 security-reviewer" aria-label="子智能体名称" @blur="touched.name = true" /></el-form-item>
          <template v-if="editorMode === 'structured' && form">
            <el-form-item><template #label>标识颜色<SettingsTooltip content="用于列表标记和对话中的子智能体名称。" placement="top"><button type="button" class="user-agents__help" aria-label="标识颜色说明"><AppIcon name="lucide:circle-help" /></button></SettingsTooltip></template><div role="radiogroup" aria-label="子智能体颜色" class="user-agents__colors"><button v-for="color in MIRA_USER_AGENT_COLORS" :key="color" type="button" role="radio" :aria-checked="form.color === color" :tabindex="(form.color || 'blue') === color ? 0 : -1" :disabled="busy" :aria-label="`子智能体颜色：${colorLabels[color]}`" @click="form.color = color" @keydown="changeColor($event, color)"><span class="user-agents__color" :data-color="color" aria-hidden="true" /></button></div></el-form-item>
            <el-form-item label="模型"><div class="user-agents__model"><AgentModelSelect :model-value="modelValue" :providers="models" placement="bottom-end" :unavailable-label="form.modelSelection?.modelId" :disabled="busy || modelsBusy" label-for-control="子智能体模型" @change="selectModel" /><el-select v-if="form.modelSelection" :model-value="form.modelSelection.thinkingLevel || 'inherit'" :disabled="busy || modelUnavailable" aria-label="子智能体推理强度" @change="selectReasoning"><el-option label="默认推理" value="inherit" /><el-option label="关闭" value="off" /><el-option v-for="level in reasoningLevels" :key="level.value" :label="level.label" :value="level.value" :disabled="!selectedModel?.reasoning" /></el-select><el-button text :disabled="busy || modelsBusy" :loading="modelsBusy" aria-label="重新加载子智能体模型" @click="loadModels"><AppIcon name="lucide:refresh-cw" /></el-button></div></el-form-item>
          </template>
          </div>
          <template v-if="editorMode === 'structured' && form">
            <p v-if="modelsError" class="user-agents__error" role="alert">{{ modelsError }}</p>
            <p v-if="modelUnavailable" class="user-agents__error" role="alert">配置的模型当前不可用，已保留原值。请选择可用模型或继承父任务模型。</p>
            <p v-if="reasoningUnavailable" class="user-agents__error" role="alert">此模型不支持所选推理强度，请改为关闭或沿用模型默认。</p>
            <el-form-item label="用途说明" :error="touched.description ? fieldErrors.description : ''"><el-input v-model="form.description" :disabled="busy" maxlength="1024" placeholder="主智能体在什么情况下使用这个子智能体" aria-label="子智能体用途说明" @blur="touched.description = true" /></el-form-item>
            <el-form-item label="可用工具"><div class="user-agents__tool-mode"><el-select :model-value="form.tools === undefined ? 'inherit' : 'custom'" :disabled="busy" aria-label="子智能体工具模式" @change="selectToolsMode"><el-option label="继承角色工具" value="inherit" /><el-option label="自选工具" value="custom" /></el-select><SettingsTooltip content="工具选择只能缩小角色权限；自选为空表示不使用工具。MCP 沿用当前任务的授权。" placement="top"><button type="button" class="user-agents__help" aria-label="工具权限说明"><AppIcon name="lucide:circle-help" /></button></SettingsTooltip></div><el-checkbox-group v-if="form.tools !== undefined" v-model="form.tools" :disabled="busy" aria-label="子智能体可用工具" class="user-agents__tools"><el-checkbox v-for="tool in agentToolOptions" :key="tool.value" :value="tool.value" :aria-label="`可用工具：${tool.label}`">{{ tool.label }}</el-checkbox></el-checkbox-group><span v-if="form.disallowedTools?.length" class="user-agents__restriction">已保留原配置的工具排除规则，可通过编辑 Markdown 调整。</span></el-form-item>
            <el-form-item label="系统指令" :error="touched.systemPrompt ? fieldErrors.systemPrompt : ''"><el-input v-model="form.systemPrompt" type="textarea" :rows="3" :disabled="busy" resize="vertical" placeholder="描述任务处理方法、约束及输出要求" aria-label="子智能体系统指令" @blur="touched.systemPrompt = true" /></el-form-item>
            <div class="user-agents__inject"><label for="mira-agent-inject">读取项目 AGENTS.md 指令</label><el-switch id="mira-agent-inject" v-model="form.injectAgentsMd" :disabled="busy" aria-label="读取项目 AGENTS.md 指令" /></div>
          </template>
          <template v-else>
          <el-form-item label="Markdown 指令与配置"><el-input v-model="draft.source" type="textarea" :rows="16" :disabled="busy" maxlength="262144" spellcheck="false" resize="vertical" aria-label="子智能体 Markdown 指令" /></el-form-item>
          <p class="user-agents__description">description 为用途说明，正文为子智能体指令。可配置 tools、disallowedTools、color、injectAgentsMd；不填写 tools 时沿用所选角色的工具范围。指定模型使用 modelSelection: { providerId: 供应商ID, modelId: 模型ID }，不填写则继承父任务模型。模型和权限由宿主校验。</p>
          </template>
          <p v-if="editorError" class="user-agents__error" role="alert">{{ editorError }}</p>
          <div class="user-agents__actions"><el-button type="primary" aria-label="保存子智能体" :disabled="busy || !dirty || !draft.source.trim() || Boolean(fieldErrors.name) || editorMode === 'structured' && (Boolean(fieldErrors.description || fieldErrors.systemPrompt) || modelUnavailable || reasoningUnavailable)" :loading="busy" @click="save">保存</el-button><el-button text :disabled="busy" @click="close">取消</el-button></div>
        </el-form>
      </section>
      <section v-if="!draft" class="user-agents__readonly" aria-label="内置与插件子智能体">
        <p v-if="overrideError" class="user-agents__error" role="alert">{{ overrideError }}</p>
        <p v-if="modelsError && !(draft && editorMode === 'structured')" class="user-agents__error" role="alert">{{ modelsError }} 仍可选择继承父任务模型。</p>
        <p v-if="overrideBusy" role="status">正在加载内置与插件子智能体模型…</p>
        <template v-for="group in filteredOverrideGroups" :key="group.kind">
          <h2 v-if="!query.trim() || group.rows.length">{{ group.title }} <small>{{ group.rows.length }} 项</small><SettingsTooltip :content="group.description" placement="top"><button type="button" class="user-agents__help" :aria-label="`${group.title}说明`"><AppIcon name="lucide:circle-help" /></button></SettingsTooltip></h2>
          <article v-for="row in group.rows" :key="row.key" class="user-agents__row" :data-agent-model-kind="row.target.kind" :data-agent-model-name="row.target.name" :data-agent-model-plugin="row.target.kind === 'plugin' ? row.target.pluginId : undefined" :aria-busy="overrideState[row.key]?.pending || false">
            <div class="user-agents__avatar" aria-hidden="true"><AppIcon name="lucide:bot" /><span v-if="row.target.kind === 'builtin'" class="user-agents__color-dot" data-mira-agent-color="blue" title="标识颜色：蓝色" /></div>
            <div class="user-agents__identity"><h3>@{{ row.target.name }}{{ row.label ? ` · ${row.label}` : '' }}</h3><p>{{ row.description }}</p></div>
            <div class="user-agents__override">
              <div class="user-agents__override-controls">
                <AgentModelSelect :model-value="overrideModelValue(row)" :providers="models" :unavailable-label="row.setting?.modelSelection?.modelId" :disabled="Boolean(overrideBusy || modelsBusy || !row.setting || overrideState[row.key]?.pending)" :label-for-control="`${row.target.name} 模型`" @change="(value: string) => changeOverrideModel(row, value)" />
                <el-select v-if="row.setting?.modelSelection" :model-value="row.setting.modelSelection.thinkingLevel || 'inherit'" :disabled="overrideBusy || overrideUnavailable(row) || overrideState[row.key]?.pending" :aria-label="`${row.target.name} 推理强度`" @change="(value: string) => changeOverrideReasoning(row, value)"><el-option label="模型默认推理" value="inherit" /><el-option label="关闭" value="off" /><el-option v-for="level in reasoningLevels" :key="level.value" :label="level.label" :value="level.value" :disabled="!overrideSelectedModel(row)?.reasoning" /></el-select>
              </div>
              <p v-if="overrideUnavailable(row)" class="user-agents__error" role="alert">配置的模型当前不可用，已保留原值；可选择继承父任务模型。</p>
              <p v-else-if="overrideReasoningUnavailable(row)" class="user-agents__error" role="alert">此模型不支持所选推理强度，请改为关闭或模型默认。</p>
              <p v-if="row.setting?.unavailableReason" class="user-agents__error" role="alert">{{ row.setting.unavailableReason }}</p>
              <p v-if="overrideState[row.key]?.error" class="user-agents__error" role="alert">{{ overrideState[row.key].error }}</p>
              <p v-if="overrideState[row.key]?.pending" role="status">正在保存…</p><p v-else-if="overrideState[row.key]?.saved" role="status">模型设置已保存</p>
            </div>
          </article>
          <p v-if="group.kind === 'plugin' && !group.rows.length && !query.trim()" class="user-agents__description">暂无可配置的插件子智能体，可在工作台插件市场添加插件后重新加载。</p>
        </template>
      </section>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { isModelProviderAvailable, type HarnessProject, type HarnessSubtaskRole, type ModelProviderSummary, type ModelSelection, type ThinkingLevel } from '@/config/harness'
import type { MiraAgentModelSetting, MiraAgentModelTarget } from '@/config/miraAgentModels'
import type { MiraUserAgentColor, MiraUserAgentItem, MiraUserAgentScope } from '@/config/miraUserAgents'
import { isMiraUserAgentName, MIRA_RESERVED_USER_AGENTS } from '@/config/miraUserAgents'
import { MIRA_USER_AGENT_COLORS, MIRA_USER_AGENT_TOOL_OPTIONS, readMiraUserAgentForm, writeMiraUserAgentForm, type MiraUserAgentForm } from '@/config/miraUserAgentEditor'
import { MIRA_SUBTASK_AGENTS } from '@/config/miraAgents'
import { getPlatformApi } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import SettingsScopeSelect from '../settings/components/SettingsScopeSelect.vue'
import SettingsTooltip from '../settings/components/SettingsTooltip.vue'
import AgentModelSelect from './AgentModelSelect.vue'
import '@/styles/mira-agent-colors.css'

const api = getPlatformApi(), route = useRoute()
const projects = shallowRef<HarnessProject[]>([]), items = shallowRef<MiraUserAgentItem[]>([])
const workspace = ref(typeof route.query.project === 'string' ? route.query.project : 'global')
const busy = ref(false), error = ref(''), editorError = ref(''), feedback = ref('')
type Draft = { scope: MiraUserAgentScope; name: string; source: string; projectId?: string; revision?: string }
const draft = ref<Draft>()
const creating = computed(() => Boolean(draft.value && !draft.value.revision))
const editorHeading = ref<HTMLHeadingElement>(), directoryHeading = ref<HTMLDivElement>()
const form = ref<MiraUserAgentForm>(), editorMode = ref<'structured' | 'advanced'>('structured'), advancedReason = ref('')
const touched = ref({ name: false, description: false, systemPrompt: false })
const fieldErrors = computed(() => ({
  name: !draft.value?.name.trim() ? '请填写名称。' : !isMiraUserAgentName(draft.value.name.trim()) ? '名称需为 3 至 50 位小写字母、数字或横线。' : MIRA_RESERVED_USER_AGENTS.some(name => name === draft.value?.name.trim()) ? '不能使用内置子智能体名称。' : '',
  description: !form.value?.description.trim() ? '请填写用途说明。' : form.value.description.length > 1024 ? '用途说明最多 1024 个字符。' : '',
  systemPrompt: !form.value?.systemPrompt.trim() ? '请填写系统指令。' : '',
}))
const agentToolOptions = computed(() => [
  ...MIRA_USER_AGENT_TOOL_OPTIONS,
  ...[...new Set([...(form.value?.tools || []), ...(form.value?.disallowedTools || [])])]
    .filter(value => !MIRA_USER_AGENT_TOOL_OPTIONS.some(tool => tool.value === value))
    .map(value => ({ value, label: value })),
])
const models = shallowRef<ModelProviderSummary[]>([]), modelsBusy = ref(false), modelsError = ref('')
const colorLabels: Record<MiraUserAgentColor, string> = { red: '红色', blue: '蓝色', green: '绿色', yellow: '黄色', purple: '紫色', orange: '橙色', pink: '粉色', cyan: '青色' }
const reasoningLevels = [{ value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }]
const modelKey = (providerId: string, modelId: string) => JSON.stringify([providerId, modelId])
const modelOptions = computed(() => models.value.filter(isModelProviderAvailable).flatMap(provider => provider.models.filter(model => model.enabled && model.id.trim()).map(model => ({ ...model, providerId: provider.id, key: modelKey(provider.id, model.id), label: `${provider.name} / ${model.id}` }))))
const modelValue = computed(() => form.value?.modelSelection ? modelKey(form.value.modelSelection.providerId, form.value.modelSelection.modelId) : 'inherit')
const selectedModel = computed(() => modelOptions.value.find(model => model.key === modelValue.value))
const modelUnavailable = computed(() => Boolean(form.value?.modelSelection && !selectedModel.value))
const reasoningUnavailable = computed(() => Boolean(form.value?.modelSelection?.thinkingLevel && form.value.modelSelection.thinkingLevel !== 'off' && !selectedModel.value?.reasoning))
const overrides = shallowRef<MiraAgentModelSetting[]>([]), overrideBusy = ref(false), overrideError = ref('')
const overrideState = ref<Record<string, { pending?: boolean; error?: string; saved?: boolean }>>({})
type AgentModelRow = { key: string; target: MiraAgentModelTarget; label?: string; description: string; setting?: MiraAgentModelSetting }
const overrideKey = (target: MiraAgentModelTarget) => JSON.stringify(target.kind === 'builtin' ? ['builtin', target.name] : ['plugin', target.pluginId, target.name])
const overrideGroups = computed(() => [
  { kind: 'builtin', title: '内置子智能体', description: '指令与工具权限由内置角色维护；可独立指定模型，设置对所有项目生效，即改即存。', rows: Object.entries(MIRA_SUBTASK_AGENTS).map(([name, agent]): AgentModelRow => { const target: MiraAgentModelTarget = { kind: 'builtin', name: name as HarnessSubtaskRole }, key = overrideKey(target); return { key, target, label: agent.label, description: agent.description, setting: overrides.value.find(setting => overrideKey(setting.target) === key) } }) },
  { kind: 'plugin', title: '插件子智能体', description: '插件维护原指令与工具；可在这里覆盖模型。模型覆盖对所有项目生效，插件添加与启停仍在插件市场管理。', rows: overrides.value.filter(setting => setting.target.kind === 'plugin').map((setting): AgentModelRow => ({ key: overrideKey(setting.target), target: setting.target, description: setting.target.kind === 'plugin' ? `来源：${setting.target.pluginId}` : '', setting })) },
])
const query = ref('')
const matchesQuery = (...values: Array<string | undefined>) => values.some(value => value?.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()))
const filteredItems = computed(() => items.value.filter(item => matchesQuery(item.name, item.description)))
const filteredOverrideGroups = computed(() => overrideGroups.value.map(group => ({ ...group, rows: group.rows.filter(row => matchesQuery(row.target.name, row.label, row.description)) })))
const overrideModelValue = (row: AgentModelRow) => row.setting?.modelSelection ? modelKey(row.setting.modelSelection.providerId, row.setting.modelSelection.modelId) : 'inherit'
const overrideSelectedModel = (row: AgentModelRow) => modelOptions.value.find(model => model.key === overrideModelValue(row))
const overrideUnavailable = (row: AgentModelRow) => Boolean(row.setting?.modelSelection && !overrideSelectedModel(row))
const overrideReasoningUnavailable = (row: AgentModelRow) => Boolean(row.setting?.modelSelection?.thinkingLevel && row.setting.modelSelection.thinkingLevel !== 'off' && !overrideSelectedModel(row)?.reasoning)
let original = '', originalForm = '', mounted = true
const dirty = computed(() => Boolean(draft.value && (JSON.stringify([draft.value.name, draft.value.source, draft.value.scope, draft.value.projectId]) !== original || editorMode.value === 'structured' && JSON.stringify(form.value) !== originalForm)))
const projectId = computed(() => workspace.value === 'global' ? undefined : workspace.value)
const message = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method 'platform:user-agents': Error: /, '')
async function loadOverrides() {
  if (overrideBusy.value || Object.values(overrideState.value).some(state => state.pending)) return
  overrideError.value = ''
  if (!api?.agentModels) { overrideError.value = '内置与插件子智能体模型设置需要新版桌面宿主，请重启后重试。'; return }
  overrideBusy.value = true
  try { const value = await api.agentModels.list(); if (mounted) { overrides.value = value; overrideState.value = {} } }
  catch (failure) { if (mounted) overrideError.value = `无法加载子智能体模型设置：${message(failure).replace(/^Error invoking remote method 'platform:agent-models': Error: /, '')}` }
  finally { if (mounted) overrideBusy.value = false }
}
async function persistOverride(row: AgentModelRow, modelSelection?: ModelSelection) {
  if (!api?.agentModels || !row.setting || overrideBusy.value || overrideState.value[row.key]?.pending || JSON.stringify(row.setting.modelSelection) === JSON.stringify(modelSelection)) return
  const previous = row.setting
  overrideState.value[row.key] = { pending: true }
  overrides.value = overrides.value.map(setting => overrideKey(setting.target) === row.key ? { target: row.target, ...(modelSelection ? { modelSelection } : {}) } : setting)
  try {
    const value = await api.agentModels.set({ target: row.target, ...(modelSelection ? { modelSelection } : {}) })
    if (mounted) { overrides.value = overrides.value.map(setting => overrideKey(setting.target) === row.key ? value : setting); overrideState.value[row.key] = { saved: true } }
  } catch (failure) {
    if (mounted) { overrides.value = overrides.value.map(setting => overrideKey(setting.target) === row.key ? previous : setting); overrideState.value[row.key] = { error: `模型设置未保存：${message(failure).replace(/^Error invoking remote method 'platform:agent-models': Error: /, '')}` } }
  }
}
function changeOverrideModel(row: AgentModelRow, value: string) {
  if (value === 'inherit') return persistOverride(row)
  const model = modelOptions.value.find(model => model.key === value)
  if (model) return persistOverride(row, { providerId: model.providerId, modelId: model.id })
}
function changeOverrideReasoning(row: AgentModelRow, value: string) {
  const selection = row.setting?.modelSelection
  if (!selection || overrideUnavailable(row) || !['inherit', 'off', 'low', 'medium', 'high'].includes(value) || value !== 'inherit' && value !== 'off' && !overrideSelectedModel(row)?.reasoning) return
  return persistOverride(row, { providerId: selection.providerId, modelId: selection.modelId, ...(value === 'inherit' ? {} : { thinkingLevel: value as ThinkingLevel }) })
}
async function mayDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('子智能体尚未保存，放弃本次修改？', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true }
  catch { return false }
}
function setDraft(value?: Draft) {
  touched.value = { name: false, description: false, systemPrompt: false }
  if (value?.scope === 'project' && !value.projectId) value.projectId = projectId.value
  draft.value = value; original = value ? JSON.stringify([value.name, value.source, value.scope, value.projectId]) : ''; editorError.value = ''; advancedReason.value = ''; form.value = undefined; editorMode.value = 'structured'
  if (value) try { form.value = readMiraUserAgentForm(value.source); if (value.revision && form.value.name !== value.name) throw new Error('Markdown 的 name 与已有子智能体不同，请在高级编辑中恢复名称。') } catch (failure) { editorMode.value = 'advanced'; advancedReason.value = message(failure) }
  originalForm = JSON.stringify(form.value) || ''
}
function changeEditorMode(mode: 'structured' | 'advanced') {
  if (busy.value || !draft.value || creating.value || mode === editorMode.value) return
  editorError.value = ''
  try {
    if (mode === 'advanced' && form.value) draft.value.source = writeMiraUserAgentForm(draft.value.source, { ...form.value, name: draft.value.name.trim() || form.value.name })
    else { form.value = readMiraUserAgentForm(draft.value.source); if (draft.value.revision && form.value.name !== draft.value.name) throw new Error('已有子智能体不能更名，请恢复 Markdown 的 name 后重试。') }
    editorMode.value = mode; advancedReason.value = ''
  } catch (failure) { editorError.value = message(failure) }
}
function changeColor(event: KeyboardEvent, color: MiraUserAgentColor) {
  if (!form.value || busy.value || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const index = MIRA_USER_AGENT_COLORS.indexOf(color), count = MIRA_USER_AGENT_COLORS.length
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + count) % count
  form.value.color = MIRA_USER_AGENT_COLORS[next]
  ;((event.currentTarget as HTMLElement).parentElement?.children[next] as HTMLElement)?.focus()
}
function selectModel(value: string) {
  if (!form.value) return
  if (value === 'inherit') { form.value.modelSelection = undefined; return }
  const model = modelOptions.value.find(model => model.key === value)
  if (model) form.value.modelSelection = { providerId: model.providerId, modelId: model.id, ...(model.reasoning && form.value.modelSelection?.thinkingLevel ? { thinkingLevel: form.value.modelSelection.thinkingLevel } : {}) }
}
function selectToolsMode(value: string) { if (form.value) form.value.tools = value === 'inherit' ? undefined : form.value.tools || [] }
function selectReasoning(value: string) {
  if (!form.value?.modelSelection) return
  if (value === 'inherit') form.value.modelSelection.thinkingLevel = undefined
  else if (value === 'off' || selectedModel.value?.reasoning && ['low', 'medium', 'high'].includes(value)) form.value.modelSelection.thinkingLevel = value as ThinkingLevel
}
async function loadModels() {
  if (!api || modelsBusy.value) return
  modelsBusy.value = true; modelsError.value = ''
  try { const value = await api.listModelProviders(); if (mounted) models.value = value }
  catch (failure) { if (mounted) modelsError.value = `无法加载模型：${message(failure)}` }
  finally { if (mounted) modelsBusy.value = false }
}
async function load() {
  if (!api?.userAgents) throw new Error('子智能体管理需要桌面宿主，请重启到最新版本后重试。')
  const value = await api.userAgents.list({ ...(projectId.value ? { projectId: projectId.value } : {}) })
  if (mounted) items.value = value
}
async function refresh() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await Promise.all([load(), loadOverrides(), loadModels()]) } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function selectWorkspace(value: string) {
  if (value === workspace.value || !await mayDiscard() || !mounted) return
  workspace.value = value; items.value = []; setDraft(); feedback.value = ''; busy.value = true; error.value = ''
  try { await load() } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function create() {
  if (!await mayDiscard() || !mounted) return
  // The serializer patches a valid baseline; new fields stay empty until the user fills them.
  setDraft({ scope: projectId.value ? 'project' : 'global', name: '', source: '---\nname: my-agent\ndescription: draft\ncolor: blue\ninjectAgentsMd: true\n---\ndraft\n' })
  form.value!.description = ''; form.value!.systemPrompt = ''; originalForm = JSON.stringify(form.value)
  feedback.value = ''; await nextTick(); editorHeading.value?.focus?.()
}
function selectDraftWorkspace(value: string) {
  if (!creating.value || !draft.value || busy.value || value !== 'global' && !projects.value.some(project => project.id === value)) return
  draft.value.scope = value === 'global' ? 'global' : 'project'; draft.value.projectId = value === 'global' ? undefined : value
}
async function edit(item: MiraUserAgentItem) {
  if (!await mayDiscard() || !api?.userAgents || !mounted) return
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    const value = await api.userAgents.read({ scope: item.scope, name: item.name, ...(item.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (mounted) {
      setDraft({ scope: value.agent.scope, name: value.agent.name, source: value.source, revision: value.agent.revision })
      await nextTick(); editorHeading.value?.focus?.()
    }
  } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function save() {
  const value = draft.value
  if (busy.value || !value || !dirty.value || !api?.userAgents) return
  touched.value = { name: true, description: true, systemPrompt: true }
  if (fieldErrors.value.name || editorMode.value === 'structured' && (fieldErrors.value.description || fieldErrors.value.systemPrompt)) return
  busy.value = true; editorError.value = ''; feedback.value = ''
  try {
    const source = editorMode.value === 'structured' && form.value ? writeMiraUserAgentForm(value.source, { ...form.value, name: value.name.trim() }) : value.source
    if (editorMode.value === 'structured' && (modelUnavailable.value || reasoningUnavailable.value)) throw new Error('请修正不可用的模型或推理强度后保存。')
    await api.userAgents.save({ scope: value.scope, name: value.name.trim(), source, ...(value.revision ? { expectedRevision: value.revision } : {}), ...(value.scope === 'project' ? { projectId: value.projectId } : {}) })
    if (!mounted) return
    if (!value.revision) workspace.value = value.projectId || 'global'
    setDraft(); feedback.value = '子智能体已保存，回到工作台通过 @ 引用。'; await load(); await nextTick(); directoryHeading.value?.focus?.()
  } catch (failure) { if (mounted) { if (draft.value) editorError.value = message(failure); else error.value = message(failure) } }
  finally { if (mounted) busy.value = false }
}
async function toggle(item: MiraUserAgentItem) {
  if (!await mayDiscard() || !api?.userAgents || !mounted) return
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    await api.userAgents.setEnabled({ scope: item.scope, name: item.name, enabled: !item.enabled, expectedRevision: item.revision, ...(item.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (!mounted) return
    setDraft(); feedback.value = item.enabled ? '子智能体已停用。' : '子智能体已启用。'; await load()
  } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function remove(item: MiraUserAgentItem) {
  if (!await mayDiscard() || !api?.userAgents || !mounted) return
  try { await ElMessageBox.confirm(`删除${item.scope === 'project' ? '项目' : '全局'}子智能体 @${item.name}？`, '删除子智能体', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  if (!mounted || busy.value) return
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    await api.userAgents.delete({ scope: item.scope, name: item.name, expectedRevision: item.revision, ...(item.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (!mounted) return
    setDraft(); feedback.value = '子智能体已删除。'; await load()
  } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function close() { if (await mayDiscard() && mounted) { setDraft(); await nextTick(); directoryHeading.value?.focus?.() } }
onBeforeRouteLeave(mayDiscard)
onUnmounted(() => { mounted = false })
onMounted(async () => {
  busy.value = true
  try { if (!api) throw new Error('子智能体管理需要桌面宿主。'); const value = await api.listHarnessProjects(); if (!mounted) return; projects.value = value; await Promise.all([load(), loadModels(), loadOverrides()]) }
  catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
})
</script>

<style scoped lang="scss">
.user-agents__description { margin: 0 0 20px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.6; }
.user-agents__toolbar { display: flex; }
.user-agents__toolbar:focus { outline: none; }
.user-agents__title { margin: 0 0 32px; font-size: var(--settings-text-title); font-weight: 550; letter-spacing: -0.02em; line-height: 1.333333; }
.user-agents__toolbar { align-items: center; flex-wrap: wrap; margin-bottom: 20px; gap: 12px; }
.user-agents__divider { width: 1px; height: 16px; background: var(--cp-border-light); }
.user-agents__count { font-size: var(--settings-text-base); white-space: nowrap; }
.user-agents small { margin-left: 6px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); font-weight: 400; }
.user-agents__search { display: flex; align-items: center; gap: 8px; width: 256px; margin-left: auto; padding: 8px 11px; border: 1px solid var(--cp-border-light); border-radius: 12px; background: var(--cp-bg); color: var(--cp-text-secondary); }
.user-agents__search:focus-within { border-color: var(--cp-border); }
.user-agents__search input { min-width: 0; width: 100%; border: 0; outline: none; background: none; color: var(--cp-text); font: inherit; font-size: 12px; }
.user-agents__search :deep(.app-icon) { flex: none; width: 12px; height: 12px; margin: 0; }
.user-agents__group-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; min-height: 28px; }
.user-agents__group-heading h2 { margin: 0; font-size: var(--settings-text-base); font-weight: 500; }
.user-agents__empty { display: flex; min-height: 168px; box-sizing: border-box; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; border: 1px dashed var(--cp-border); border-radius: 12px; text-align: center; }
.user-agents__empty h3 { margin: 0; font-size: var(--settings-text-base); font-weight: 500; }
.user-agents__empty p { margin: 0 0 4px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.6; }
.user-agents__empty :deep(.app-icon) { margin-right: 6px; }
.user-agents__toolbar :deep(.el-button + .el-button), .user-agents__actions :deep(.el-button + .el-button) { margin-left: 0; }
.user-agents__toolbar :deep(.app-icon), .user-agents__actions :deep(.app-icon) { margin-right: 6px; }
.user-agents__row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px; margin-bottom: 8px; border-radius: 12px; background: var(--cp-bg-elevated); }
.user-agents__avatar { position: relative; display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 12px; background: var(--cp-bg); color: var(--cp-text-secondary); }
.user-agents__avatar :deep(.app-icon) { width: 16px; height: 16px; }
.user-agents__color-dot { position: absolute; right: -4px; bottom: -4px; box-sizing: border-box; width: 14px; height: 14px; border: 3px solid var(--cp-bg-elevated); border-radius: 50%; background: var(--mira-agent-mark); }
.user-agents__identity { min-width: 0; flex: 1; }
.user-agents__status { margin-left: 8px; color: var(--cp-text-secondary); font-weight: 400; }
.user-agents__row h2, .user-agents__row h3 { margin: 0; font-size: var(--settings-text-base); font-weight: 450; overflow-wrap: anywhere; }
.user-agents__row p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-base); overflow-wrap: anywhere; }
.user-agents__error, .user-agents__row .user-agents__error { color: color-mix(in srgb, var(--cp-danger) 75%, var(--cp-text)); font-size: var(--settings-text-base); line-height: 1.6; overflow-wrap: anywhere; }
.user-agents__actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.user-agents__editor { padding: 16px; border: 1px solid var(--cp-border-light); border-radius: 12px; }
.user-agents__readonly { margin-top: 28px; }
.user-agents__readonly > h2 { display: flex; align-items: center; margin: 0 0 16px; font-size: var(--settings-text-base); font-weight: 500; }
.user-agents__readonly > h2:not(:first-child) { margin-top: 24px; }
.user-agents__form-top { display: grid; grid-template-columns: minmax(192px, 224px) 224px minmax(0, 1fr); gap: 12px; }
.user-agents__form-top > :deep(.el-form-item) { min-width: 0; }
.user-agents__editor :deep(.el-form-item) { margin-bottom: 12px; }
.user-agents__editor :deep(.el-form-item__label) { margin-bottom: 6px; line-height: 20px; font-size: var(--settings-text-base); }
.user-agents__editor :deep(.el-form-item__label) .user-agents__help { width: 20px; height: 20px; padding: 3px; }
.user-agents__editor :deep(.el-form-item__error) { position: static; padding-top: 4px; }
.user-agents__model { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%; }
.user-agents__model :deep(.el-select) { width: 112px; }
.user-agents__model :deep(.el-button) { padding: 4px; }
.user-agents__model :deep(.el-dropdown), .user-agents__model :deep(.agent-model-trigger) { min-width: 0; max-width: 100%; }
.user-agents__colors { display: grid; grid-template-columns: repeat(8, 1fr); width: 224px; box-sizing: border-box; padding: 3px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-bg); }
.user-agents__colors button { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 1px solid transparent; border-radius: 50%; background: transparent; cursor: pointer; }
.user-agents__colors button[aria-checked="true"] { border-color: var(--cp-border); background: var(--cp-bg-elevated); box-shadow: 0 1px 2px #0000000d; }
.user-agents__colors button:hover { background: var(--cp-bg-hover); }
.user-agents__colors button:focus-visible, .user-agents__help:focus-visible { outline: 2px solid var(--cp-text-secondary); outline-offset: 2px; }
.user-agents__colors button:disabled { opacity: .5; cursor: default; }
.user-agents__color { display: block; width: 14px; height: 14px; border-radius: 50%; background: var(--cp-primary); }
.user-agents__color[data-color="red"] { background: #ef4444; }.user-agents__color[data-color="blue"] { background: #3b82f6; }.user-agents__color[data-color="green"] { background: #22c55e; }.user-agents__color[data-color="yellow"] { background: #eab308; }.user-agents__color[data-color="purple"] { background: #a855f7; }.user-agents__color[data-color="orange"] { background: #f97316; }.user-agents__color[data-color="pink"] { background: #ec4899; }.user-agents__color[data-color="cyan"] { background: #06b6d4; }
.user-agents__help { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 4px; margin-left: 4px; border: 0; border-radius: 6px; background: transparent; color: var(--cp-text-tertiary); cursor: help; }
.user-agents__help:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
.user-agents__help :deep(.app-icon) { width: 14px; height: 14px; }
.user-agents__tool-mode { display: flex; align-items: center; width: 100%; }
.user-agents__tool-mode :deep(.el-select) { width: 160px; }
.user-agents__restriction { color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.user-agents__tools { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 12px; width: 100%; box-sizing: border-box; margin-top: 8px; padding: 4px 12px; border: 1px solid var(--cp-border-light); border-radius: 8px; }
.user-agents__tools :deep(.el-checkbox) { margin-right: 0; }
.user-agents__inject { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; padding: 10px 12px; border: 1px solid var(--cp-border-light); border-radius: 8px; background: var(--cp-bg-elevated); font-size: var(--settings-text-base); }
.user-agents__override { width: min(280px, 40%); flex-shrink: 0; }
.user-agents__override-controls { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.user-agents__override-controls .el-select { width: auto; min-width: 140px; max-width: 180px; }
.user-agents__override p { margin: 6px 0 0; font-size: var(--settings-text-base); text-align: right; }
.user-agents__breadcrumb { display: flex; align-items: center; gap: 10px; color: var(--cp-text); font-size: var(--settings-text-base); }
.user-agents__breadcrumb button { padding: 0; border: 0; background: transparent; color: var(--cp-text-secondary); font: inherit; cursor: pointer; }
.user-agents__breadcrumb button:hover { color: var(--cp-text); }
.user-agents__breadcrumb :deep(.app-icon) { width: 14px; color: var(--cp-text-tertiary); }
.user-agents__editor-heading { margin-bottom: 16px; }
.user-agents__editor-heading h1 { margin: 0; font-size: 18px; line-height: 26px; font-weight: 600; }
.user-agents__editor-heading h1:focus { outline: none; }
.user-agents__editor-scope { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; font-size: var(--settings-text-base); color: var(--cp-text-secondary); }
.user-agents__editor :deep(textarea) { caret-color: var(--cp-text); }
.user-agents__editor :deep(textarea[aria-label="子智能体系统指令"]) { min-height: 64px; max-height: 224px; }
.user-agents__editor :deep(textarea[aria-label="子智能体 Markdown 指令"]) { font: 12px/20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
@media (max-width: 900px) {
  .user-agents__form-top { grid-template-columns: minmax(0, 1fr); }
  .user-agents__row { flex-wrap: wrap; gap: 12px; }
  .user-agents__override { width: 100%; }
  .user-agents__override p { text-align: left; }
  .user-agents__search { width: 100%; margin-left: 0; }
  .user-agents__tools { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
