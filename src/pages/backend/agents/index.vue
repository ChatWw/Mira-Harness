<template>
  <!-- Agent form layout adapted from ZCode (Apache-2.0); see third-party-licenses/zcode. -->
  <SettingsPageShell title="智能体" wide>
    <section class="user-agents" :aria-busy="busy">
      <p class="user-agents__description">创建专用智能体，在工作台通过 @、/ 或 + 引用。选择只填入请求，由主 Agent 按需委派；同名智能体优先使用项目版本。</p>
      <div class="user-agents__toolbar">
        <el-select :model-value="workspace" :disabled="busy" aria-label="智能体作用范围" @change="selectWorkspace"><el-option label="全局 · 所有项目" value="global" /><el-option v-for="project in projects" :key="project.id" :label="`项目 · ${project.name}`" :value="project.id" /></el-select>
        <el-button :disabled="busy" aria-label="重新加载智能体" @click="refresh"><AppIcon name="lucide:refresh-cw" /></el-button>
        <el-button type="primary" :disabled="busy || !api?.userAgents" @click="create"><AppIcon name="Plus" />新建智能体</el-button>
      </div>
      <p v-if="error" class="user-agents__error" role="alert">{{ error }}</p><p v-if="feedback" role="status">{{ feedback }}</p>
      <p v-if="busy && !items.length" role="status">正在加载智能体…</p>
      <div v-else class="user-agents__list">
        <article v-for="item in items" :key="item.id" class="user-agents__row">
          <div class="user-agents__identity"><h2>@{{ item.name }} <el-tag size="small" effect="plain">{{ item.scope === 'project' ? '当前项目' : '全局' }}</el-tag><el-tag v-if="!item.enabled" size="small" effect="plain">已停用</el-tag></h2><p>{{ item.description || '未填写说明' }}</p><p v-if="item.modelSelection">模型：{{ item.modelSelection.providerId }} / {{ item.modelSelection.modelId }}</p><p v-if="item.tools">工具：{{ item.tools.length ? item.tools.join('、') : '不使用工具' }}</p><p v-if="item.unavailableReason || item.shadowed" class="user-agents__error">{{ item.unavailableReason || '被同名项目智能体覆盖；全局版本仍可编辑' }}</p></div>
          <div class="user-agents__actions"><el-switch :model-value="item.enabled" :disabled="busy" :aria-label="`${item.enabled ? '停用' : '启用'} ${item.name}`" @change="toggle(item)" /><el-button text :disabled="busy" :aria-label="`编辑 ${item.name}`" @click="edit(item)"><AppIcon name="EditPen" />编辑</el-button><el-button text type="danger" :disabled="busy" :aria-label="`删除 ${item.name}`" @click="remove(item)"><AppIcon name="Delete" />删除</el-button></div>
        </article>
        <p v-if="!busy && !items.length && !error" class="user-agents__description">还没有自定义智能体。新建后，可回到工作台通过 @ 引用。</p>
      </div>
      <section v-if="draft" class="user-agents__editor" aria-label="智能体编辑器">
        <div class="user-agents__editor-heading"><h2>{{ draft.revision ? '编辑智能体' : '新建智能体' }} · {{ draft.scope === 'project' ? '当前项目' : '全局' }}</h2><span v-if="dirty" role="status">未保存</span></div>
        <div class="user-agents__editor-mode"><el-button text :disabled="busy" :aria-pressed="editorMode === 'structured'" @click="changeEditorMode('structured')">表单编辑</el-button><el-button text :disabled="busy" :aria-pressed="editorMode === 'advanced'" @click="changeEditorMode('advanced')">高级 Markdown</el-button></div>
        <p v-if="advancedReason" class="user-agents__description" role="status">{{ advancedReason }} 原始 Markdown 已保留，可在高级编辑中修正后切回表单。</p>
        <el-form label-position="top" @submit.prevent="save">
          <div :class="{ 'user-agents__form-top': editorMode === 'structured' }">
          <el-form-item label="名称"><el-input v-model="draft.name" :disabled="busy || Boolean(draft.revision)" maxlength="50" placeholder="例如 security-reviewer" aria-label="智能体名称" /></el-form-item>
          <template v-if="editorMode === 'structured' && form">
            <el-form-item label="颜色"><el-radio-group v-model="form.color" :disabled="busy" aria-label="智能体颜色" class="user-agents__colors"><el-radio-button v-for="color in MIRA_USER_AGENT_COLORS" :key="color" :value="color" :aria-label="`智能体颜色：${colorLabels[color]}`"><span class="user-agents__color" :data-color="color" aria-hidden="true" /><span class="user-agents__sr-only">{{ colorLabels[color] }}</span></el-radio-button></el-radio-group></el-form-item>
            <el-form-item label="模型"><div class="user-agents__model"><el-select :model-value="modelValue" :disabled="busy || modelsBusy" aria-label="智能体模型" @change="selectModel"><el-option label="继承父任务模型" value="inherit" /><el-option v-if="modelUnavailable" :label="`不可用 · ${form.modelSelection?.providerId} / ${form.modelSelection?.modelId}`" :value="modelValue" disabled /><el-option v-for="model in modelOptions" :key="model.key" :label="model.label" :value="model.key" /></el-select><el-button text :disabled="busy || modelsBusy" :loading="modelsBusy" aria-label="重新加载智能体模型" @click="loadModels"><AppIcon name="lucide:refresh-cw" /></el-button></div></el-form-item>
          </template>
          </div>
          <p class="user-agents__description user-agents__hint">3 至 50 位小写字母、数字或横线。已有智能体名称与作用范围固定；内置角色名称不能覆盖。</p>
          <template v-if="editorMode === 'structured' && form">
            <p v-if="modelsError" class="user-agents__error" role="alert">{{ modelsError }}</p>
            <p v-if="modelUnavailable" class="user-agents__error" role="alert">配置的模型当前不可用，已保留原值。请选择可用模型或继承父任务模型。</p>
            <el-form-item v-if="form.modelSelection" label="推理强度"><el-select :model-value="form.modelSelection.thinkingLevel || 'inherit'" :disabled="busy || modelUnavailable" aria-label="智能体推理强度" @change="selectReasoning"><el-option label="沿用模型默认" value="inherit" /><el-option label="关闭" value="off" /><el-option v-for="level in reasoningLevels" :key="level.value" :label="level.label" :value="level.value" :disabled="!selectedModel?.reasoning" /></el-select></el-form-item>
            <p v-if="reasoningUnavailable" class="user-agents__error" role="alert">此模型不支持所选推理强度，请改为关闭或沿用模型默认。</p>
            <el-form-item label="用途说明"><el-input v-model="form.description" :disabled="busy" placeholder="主 Agent 在什么情况下使用这个智能体" aria-label="智能体用途说明" /></el-form-item>
            <el-form-item label="可用工具"><el-select :model-value="form.tools === undefined ? 'inherit' : 'custom'" :disabled="busy" aria-label="智能体工具模式" @change="selectToolsMode"><el-option label="继承所选角色工具" value="inherit" /><el-option label="自选工具" value="custom" /></el-select></el-form-item>
            <el-form-item v-if="form.tools !== undefined" label="选择工具"><el-checkbox-group v-model="form.tools" :disabled="busy" aria-label="智能体可用工具" class="user-agents__tools"><el-checkbox v-for="tool in agentToolOptions" :key="tool.value" :value="tool.value" :aria-label="`可用工具：${tool.label}`">{{ tool.label }}</el-checkbox></el-checkbox-group></el-form-item>
            <p class="user-agents__description user-agents__hint">自选为空表示不使用工具。声明只能缩小实际委派角色的权限范围；MCP 仅供测试与实现角色使用，并沿当前任务权限确认。</p>
            <el-form-item label="禁止工具"><el-select v-model="form.disallowedTools" multiple :disabled="busy" placeholder="可选，进一步排除工具" aria-label="智能体禁止工具"><el-option v-for="tool in agentToolOptions" :key="tool.value" :label="tool.label" :value="tool.value" /></el-select></el-form-item>
            <el-form-item label="系统指令"><el-input v-model="form.systemPrompt" type="textarea" :rows="5" :disabled="busy" resize="vertical" placeholder="描述任务处理方法、约束及输出要求" aria-label="智能体系统指令" /></el-form-item>
            <div class="user-agents__inject"><label for="mira-agent-inject">读取项目 AGENTS.md 指令</label><el-switch id="mira-agent-inject" v-model="form.injectAgentsMd" :disabled="busy" aria-label="读取项目 AGENTS.md 指令" /></div>
          </template>
          <template v-else>
          <el-form-item label="Markdown 指令与配置"><el-input v-model="draft.source" type="textarea" :rows="16" :disabled="busy" maxlength="262144" spellcheck="false" resize="vertical" aria-label="智能体 Markdown 指令" /></el-form-item>
          <p class="user-agents__description">description 为用途说明，正文为智能体指令。可配置 tools、disallowedTools、color、injectAgentsMd；不填写 tools 时沿用所选角色的工具范围。指定模型使用 modelSelection: { providerId: 供应商ID, modelId: 模型ID }，不填写则继承父任务模型。模型和权限由宿主校验。</p>
          </template>
          <p v-if="editorError" class="user-agents__error" role="alert">{{ editorError }}</p>
          <div class="user-agents__actions"><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" aria-label="保存智能体" :disabled="busy || !dirty || !draft.name.trim() || !draft.source.trim() || editorMode === 'structured' && (modelUnavailable || reasoningUnavailable)" :loading="busy" @click="save">保存智能体</el-button></div>
        </el-form>
      </section>
      <section class="user-agents__readonly" aria-label="内置与插件智能体">
        <p v-if="overrideError" class="user-agents__error" role="alert">{{ overrideError }}</p>
        <p v-if="modelsError && !(draft && editorMode === 'structured')" class="user-agents__error" role="alert">{{ modelsError }} 仍可选择继承父任务模型。</p>
        <p v-if="overrideBusy" role="status">正在加载内置与插件智能体模型…</p>
        <template v-for="group in overrideGroups" :key="group.kind">
          <h2>{{ group.title }}</h2><p class="user-agents__description">{{ group.description }}</p>
          <article v-for="row in group.rows" :key="row.key" class="user-agents__row" :data-agent-model-kind="row.target.kind" :data-agent-model-name="row.target.name" :data-agent-model-plugin="row.target.kind === 'plugin' ? row.target.pluginId : undefined" :aria-busy="overrideState[row.key]?.pending || false">
            <div class="user-agents__identity"><h3>@{{ row.target.name }}{{ row.label ? ` · ${row.label}` : '' }}</h3><p>{{ row.description }}</p><el-tag size="small" effect="plain">{{ row.target.kind === 'builtin' ? '内置' : '插件' }} · 指令与工具只读</el-tag></div>
            <div class="user-agents__override">
              <div class="user-agents__override-controls">
                <el-select :model-value="overrideModelValue(row)" :disabled="overrideBusy || modelsBusy || !row.setting || overrideState[row.key]?.pending" :aria-label="`${row.target.name} 模型`" @change="(value: string) => changeOverrideModel(row, value)"><el-option label="继承父任务模型" value="inherit" /><el-option v-if="overrideUnavailable(row)" :label="`不可用 · ${row.setting?.modelSelection?.providerId} / ${row.setting?.modelSelection?.modelId}`" :value="overrideModelValue(row)" disabled /><el-option v-for="model in modelOptions" :key="model.key" :label="model.label" :value="model.key" /></el-select>
                <el-select v-if="row.setting?.modelSelection" :model-value="row.setting.modelSelection.thinkingLevel || 'inherit'" :disabled="overrideBusy || overrideUnavailable(row) || overrideState[row.key]?.pending" :aria-label="`${row.target.name} 推理强度`" @change="(value: string) => changeOverrideReasoning(row, value)"><el-option label="模型默认推理" value="inherit" /><el-option label="关闭" value="off" /><el-option v-for="level in reasoningLevels" :key="level.value" :label="level.label" :value="level.value" :disabled="!overrideSelectedModel(row)?.reasoning" /></el-select>
              </div>
              <p v-if="overrideUnavailable(row)" class="user-agents__error" role="alert">配置的模型当前不可用，已保留原值；可选择继承父任务模型。</p>
              <p v-else-if="overrideReasoningUnavailable(row)" class="user-agents__error" role="alert">此模型不支持所选推理强度，请改为关闭或模型默认。</p>
              <p v-if="row.setting?.unavailableReason" class="user-agents__error" role="alert">{{ row.setting.unavailableReason }}</p>
              <p v-if="overrideState[row.key]?.error" class="user-agents__error" role="alert">{{ overrideState[row.key].error }}</p>
              <p v-if="overrideState[row.key]?.pending" role="status">正在保存…</p><p v-else-if="overrideState[row.key]?.saved" role="status">模型设置已保存</p>
            </div>
          </article>
          <p v-if="group.kind === 'plugin' && !group.rows.length" class="user-agents__description">暂无可配置的插件智能体，可在工作台插件市场添加插件后重新加载。</p>
        </template>
      </section>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { parseDocument } from 'yaml'
import { isModelProviderAvailable, type HarnessProject, type HarnessSubtaskRole, type ModelProviderSummary, type ModelSelection, type ThinkingLevel } from '@/config/harness'
import type { MiraAgentModelSetting, MiraAgentModelTarget } from '@/config/miraAgentModels'
import type { MiraUserAgentColor, MiraUserAgentItem, MiraUserAgentScope } from '@/config/miraUserAgents'
import { MIRA_USER_AGENT_COLORS, MIRA_USER_AGENT_TOOL_OPTIONS, readMiraUserAgentForm, writeMiraUserAgentForm, type MiraUserAgentForm } from '@/config/miraUserAgentEditor'
import { MIRA_SUBTASK_AGENTS } from '@/config/miraAgents'
import { getPlatformApi } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const api = getPlatformApi(), route = useRoute()
const projects = shallowRef<HarnessProject[]>([]), items = shallowRef<MiraUserAgentItem[]>([])
const workspace = ref(typeof route.query.project === 'string' ? route.query.project : 'global')
const busy = ref(false), error = ref(''), editorError = ref(''), feedback = ref('')
type Draft = { scope: MiraUserAgentScope; name: string; source: string; revision?: string }
const draft = ref<Draft>()
const form = ref<MiraUserAgentForm>(), editorMode = ref<'structured' | 'advanced'>('structured'), advancedReason = ref('')
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
  { kind: 'builtin', title: '内置智能体', description: '指令与工具权限由内置角色维护；可独立指定模型，设置对所有项目生效，即改即存。', rows: Object.entries(MIRA_SUBTASK_AGENTS).map(([name, agent]): AgentModelRow => { const target: MiraAgentModelTarget = { kind: 'builtin', name: name as HarnessSubtaskRole }, key = overrideKey(target); return { key, target, label: agent.label, description: agent.description, setting: overrides.value.find(setting => overrideKey(setting.target) === key) } }) },
  { kind: 'plugin', title: '插件智能体', description: '插件维护原指令与工具；可在这里覆盖模型。模型覆盖对所有项目生效，插件添加与启停仍在插件市场管理。', rows: overrides.value.filter(setting => setting.target.kind === 'plugin').map((setting): AgentModelRow => ({ key: overrideKey(setting.target), target: setting.target, description: setting.target.kind === 'plugin' ? `来源：${setting.target.pluginId}` : '', setting })) },
])
const overrideModelValue = (row: AgentModelRow) => row.setting?.modelSelection ? modelKey(row.setting.modelSelection.providerId, row.setting.modelSelection.modelId) : 'inherit'
const overrideSelectedModel = (row: AgentModelRow) => modelOptions.value.find(model => model.key === overrideModelValue(row))
const overrideUnavailable = (row: AgentModelRow) => Boolean(row.setting?.modelSelection && !overrideSelectedModel(row))
const overrideReasoningUnavailable = (row: AgentModelRow) => Boolean(row.setting?.modelSelection?.thinkingLevel && row.setting.modelSelection.thinkingLevel !== 'off' && !overrideSelectedModel(row)?.reasoning)
let original = '', originalForm = '', mounted = true
const dirty = computed(() => Boolean(draft.value && (JSON.stringify([draft.value.name, draft.value.source]) !== original || editorMode.value === 'structured' && JSON.stringify(form.value) !== originalForm)))
const projectId = computed(() => workspace.value === 'global' ? undefined : workspace.value)
const message = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method 'platform:user-agents': Error: /, '')
async function loadOverrides() {
  if (overrideBusy.value || Object.values(overrideState.value).some(state => state.pending)) return
  overrideError.value = ''
  if (!api?.agentModels) { overrideError.value = '内置与插件智能体模型设置需要新版桌面宿主，请重启后重试。'; return }
  overrideBusy.value = true
  try { const value = await api.agentModels.list(); if (mounted) { overrides.value = value; overrideState.value = {} } }
  catch (failure) { if (mounted) overrideError.value = `无法加载智能体模型设置：${message(failure).replace(/^Error invoking remote method 'platform:agent-models': Error: /, '')}` }
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
  try { await ElMessageBox.confirm('智能体尚未保存，放弃本次修改？', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true }
  catch { return false }
}
function setDraft(value?: Draft) {
  draft.value = value; original = value ? JSON.stringify([value.name, value.source]) : ''; editorError.value = ''; advancedReason.value = ''; form.value = undefined; editorMode.value = 'structured'
  if (value) try { form.value = readMiraUserAgentForm(value.source); if (value.revision && form.value.name !== value.name) throw new Error('Markdown 的 name 与已有智能体不同，请在高级编辑中恢复名称。') } catch (failure) { editorMode.value = 'advanced'; advancedReason.value = message(failure) }
  originalForm = JSON.stringify(form.value) || ''
}
function changeEditorMode(mode: 'structured' | 'advanced') {
  if (busy.value || !draft.value || mode === editorMode.value) return
  editorError.value = ''
  try {
    if (mode === 'advanced' && form.value) draft.value.source = writeMiraUserAgentForm(draft.value.source, { ...form.value, name: draft.value.name.trim() || form.value.name })
    else { form.value = readMiraUserAgentForm(draft.value.source); if (draft.value.revision && form.value.name !== draft.value.name) throw new Error('已有智能体不能更名，请恢复 Markdown 的 name 后重试。') }
    editorMode.value = mode; advancedReason.value = ''
  } catch (failure) { editorError.value = message(failure) }
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
  if (!api?.userAgents) throw new Error('智能体管理需要桌面宿主，请重启到最新版本后重试。')
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
  setDraft({ scope: projectId.value ? 'project' : 'global', name: '', source: '---\nname: my-agent\ndescription: 描述智能体的用途\ncolor: blue\ninjectAgentsMd: true\n---\n\n请根据项目上下文处理分配的任务，并报告结果。\n' }); feedback.value = ''
}
async function edit(item: MiraUserAgentItem) {
  if (!await mayDiscard() || !api?.userAgents || !mounted) return
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    const value = await api.userAgents.read({ scope: item.scope, name: item.name, ...(item.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (mounted) setDraft({ scope: value.agent.scope, name: value.agent.name, source: value.source, revision: value.agent.revision })
  } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function save() {
  const value = draft.value
  if (busy.value || !value || !dirty.value || !value.name.trim() || !api?.userAgents) return
  busy.value = true; editorError.value = ''; feedback.value = ''
  try {
    let source = editorMode.value === 'structured' && form.value ? writeMiraUserAgentForm(value.source, { ...form.value, name: value.name.trim() }) : value.source
    if (editorMode.value === 'structured' && (modelUnavailable.value || reasoningUnavailable.value)) throw new Error('请修正不可用的模型或推理强度后保存。')
    if (!value.revision && editorMode.value === 'advanced') {
      const header = /^---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
      if (!header) throw new Error('需要 YAML 元数据，请保留开头的 ---、description 和结束的 ---。')
      const metadata = parseDocument(header[1])
      if (metadata.errors.length) throw new Error('YAML 元数据格式无效，请修正后保存。')
      metadata.set('name', value.name.trim())
      source = `---\n${metadata.toString()}---\n${source.slice(header[0].length)}`
    }
    await api.userAgents.save({ scope: value.scope, name: value.name.trim(), source, ...(value.revision ? { expectedRevision: value.revision } : {}), ...(value.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (!mounted) return
    setDraft(); feedback.value = '智能体已保存，回到工作台通过 @ 引用。'; await load()
  } catch (failure) { if (mounted) { if (draft.value) editorError.value = message(failure); else error.value = message(failure) } }
  finally { if (mounted) busy.value = false }
}
async function toggle(item: MiraUserAgentItem) {
  if (!await mayDiscard() || !api?.userAgents || !mounted) return
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    await api.userAgents.setEnabled({ scope: item.scope, name: item.name, enabled: !item.enabled, expectedRevision: item.revision, ...(item.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (!mounted) return
    setDraft(); feedback.value = item.enabled ? '智能体已停用。' : '智能体已启用。'; await load()
  } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function remove(item: MiraUserAgentItem) {
  if (!await mayDiscard() || !api?.userAgents || !mounted) return
  try { await ElMessageBox.confirm(`删除${item.scope === 'project' ? '项目' : '全局'}智能体 @${item.name}？`, '删除智能体', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  if (!mounted || busy.value) return
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    await api.userAgents.delete({ scope: item.scope, name: item.name, expectedRevision: item.revision, ...(item.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (!mounted) return
    setDraft(); feedback.value = '智能体已删除。'; await load()
  } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function close() { if (await mayDiscard() && mounted) setDraft() }
onBeforeRouteLeave(mayDiscard)
onUnmounted(() => { mounted = false })
onMounted(async () => {
  busy.value = true
  try { if (!api) throw new Error('智能体管理需要桌面宿主。'); const value = await api.listHarnessProjects(); if (!mounted) return; projects.value = value; await Promise.all([load(), loadModels(), loadOverrides()]) }
  catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
})
</script>

<style scoped lang="scss">
.user-agents__description { margin: 0 0 20px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.6; }
.user-agents__toolbar { display: flex; gap: 8px; margin-bottom: 20px; }
.user-agents__toolbar .el-select { flex: 1; min-width: 0; }
.user-agents__toolbar :deep(.el-button + .el-button), .user-agents__actions :deep(.el-button + .el-button) { margin-left: 0; }
.user-agents__toolbar :deep(.app-icon), .user-agents__actions :deep(.app-icon) { margin-right: 6px; }
.user-agents__row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-bottom: 1px solid var(--cp-border-light); }
.user-agents__identity { min-width: 0; }
.user-agents__row h2, .user-agents__row h3 { margin: 0; font-size: var(--settings-text-base); font-weight: 450; overflow-wrap: anywhere; }
.user-agents__row p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-base); overflow-wrap: anywhere; }
.user-agents__error, .user-agents__row .user-agents__error { color: color-mix(in srgb, var(--cp-danger) 75%, var(--cp-text)); font-size: var(--settings-text-base); line-height: 1.6; overflow-wrap: anywhere; }
.user-agents__actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.user-agents__editor, .user-agents__readonly { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--cp-border-light); }
.user-agents__editor-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.user-agents__editor-heading h2, .user-agents__readonly > h2 { margin: 0 0 12px; font-size: var(--settings-text-section); font-weight: 550; }
.user-agents__readonly > h2:not(:first-child) { margin-top: 24px; }
.user-agents__editor-heading span { color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.user-agents__editor-mode { display: flex; gap: 8px; margin-bottom: 16px; }
.user-agents__editor-mode :deep(.el-button[aria-pressed="true"]) { color: var(--cp-primary); background: var(--cp-bg-hover); }
.user-agents__form-top { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 16px; }
.user-agents__form-top > :deep(.el-form-item) { min-width: 0; margin-bottom: 8px; }
.user-agents__model { display: flex; gap: 4px; width: 100%; }
.user-agents__model .el-select { min-width: 0; flex: 1; }
.user-agents__colors { display: flex; flex-wrap: nowrap; }
.user-agents__colors :deep(.el-radio-button__inner) { display: flex; align-items: center; justify-content: center; padding: 8px 7px; }
.user-agents__color { display: block; width: 14px; height: 14px; border-radius: 50%; background: var(--cp-primary); }
.user-agents__color[data-color="red"] { background: #ef4444; }.user-agents__color[data-color="blue"] { background: #3b82f6; }.user-agents__color[data-color="green"] { background: #22c55e; }.user-agents__color[data-color="yellow"] { background: #eab308; }.user-agents__color[data-color="purple"] { background: #a855f7; }.user-agents__color[data-color="orange"] { background: #f97316; }.user-agents__color[data-color="pink"] { background: #ec4899; }.user-agents__color[data-color="cyan"] { background: #06b6d4; }
.user-agents__sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.user-agents__hint { margin-bottom: 16px; }
.user-agents__tools { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 12px; width: 100%; padding: 8px 12px; border: 1px solid var(--cp-border-light); border-radius: 8px; }
.user-agents__tools :deep(.el-checkbox) { margin-right: 0; }
.user-agents__inject { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 12px 0; border-top: 1px solid var(--cp-border-light); }
.user-agents__override { width: min(420px, 50%); flex-shrink: 0; }
.user-agents__override-controls { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.user-agents__override-controls .el-select { flex: 1; min-width: 140px; }
.user-agents__override p { margin: 6px 0 0; font-size: var(--settings-text-base); text-align: right; }
.user-agents__editor :deep(textarea) { caret-color: var(--cp-text); }
.user-agents__editor :deep(textarea[aria-label="智能体 Markdown 指令"]) { font: 12px/20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
</style>
