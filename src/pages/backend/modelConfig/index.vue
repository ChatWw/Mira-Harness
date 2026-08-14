<template>
  <SettingsPageShell title="模型配置" wide>
    <p class="page-description">统一管理 Agent 与 AI 小说使用的 OpenAI 兼容模型。密钥仅保存在主进程加密存储中。</p>
    <div class="config-toolbar"><el-button type="primary" @click="openCreate"><AppIcon name="Plus" />添加 Provider</el-button></div>
    <el-table :data="providers" v-loading="loading" empty-text="还没有配置模型 Provider">
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column prop="endpoint" label="Endpoint" min-width="260" show-overflow-tooltip />
      <el-table-column label="模型" min-width="180"><template #default="{ row }">{{ row.models.join('、') }}</template></el-table-column>
      <el-table-column label="密钥" width="90"><template #default="{ row }"><el-tag size="small" :type="row.hasApiKey ? 'success' : 'info'">{{ row.hasApiKey ? '已配置' : '未配置' }}</el-tag></template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag size="small" :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="180"><template #default="{ row }"><el-button link type="primary" @click="test(row)">测试</el-button><el-button link type="primary" @click="edit(row)">编辑</el-button><el-button link type="danger" @click="remove(row.id)">删除</el-button></template></el-table-column>
    </el-table>
    <section class="bindings">
      <h2>角色绑定</h2><p>选择各功能默认使用的 Provider 和模型。</p>
      <el-form label-position="top" class="binding-form">
        <el-form-item label="Agent 工作台"><el-select v-model="bindings.agentDefault" placeholder="选择默认模型"><el-option v-for="option in modelOptions" :key="option.key" :label="option.label" :value="option.value" /></el-select></el-form-item>
        <el-form-item label="AI 小说 · 创作模型"><el-select v-model="bindings.novelAuthoring" clearable placeholder="选择模型"><el-option v-for="option in modelOptions" :key="option.key" :label="option.label" :value="option.value" /></el-select></el-form-item>
        <el-form-item label="AI 小说 · 自动处理"><el-select v-model="bindings.novelAutomation" clearable placeholder="选择模型"><el-option v-for="option in modelOptions" :key="option.key" :label="option.label" :value="option.value" /></el-select></el-form-item>
      </el-form>
      <el-button type="primary" @click="saveBindings">保存角色绑定</el-button>
    </section>
    <el-drawer v-model="visible" :title="form.id ? '编辑 Provider' : '添加 Provider'" size="min(560px,100%)" append-to-body>
      <el-form label-position="top">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="OpenAI 兼容 Endpoint"><el-input v-model="form.endpoint" placeholder="https://api.example.com/v1" /></el-form-item>
        <el-form-item label="API Key"><el-input v-model="form.apiKey" type="password" show-password :placeholder="form.id ? '留空则保持现有密钥' : 'sk-'" /></el-form-item>
        <el-form-item label="模型 ID"><el-input v-model="modelsText" placeholder="多个模型使用英文逗号分隔" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-drawer>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import { MODEL_PROVIDER_PRESETS, type ModelProviderInput, type ModelProviderSummary, type ModelRoleBinding } from '@/config/harness'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const providers = ref<ModelProviderSummary[]>([])
const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const modelsText = ref('')
const form = reactive<ModelProviderInput>({ name: '', endpoint: '', apiKey: '', models: [], enabled: true })
const bindings = reactive<ModelRoleBinding>({})
const modelOptions = computed(() => providers.value.filter(provider => provider.enabled).flatMap(provider => provider.models.map(modelId => ({ key: `${provider.id}:${modelId}`, label: `${provider.name} · ${modelId}`, value: { providerId: provider.id, modelId } }))))

async function load() {
  loading.value = true
  try {
    const api = getPlatformApi()
    providers.value = await api?.listModelProviders() || []
    Object.assign(bindings, await api?.getModelRoleBindings() || {})
  } finally {
    loading.value = false
  }
}

function openCreate() {
  Object.assign(form, { id: undefined, name: MODEL_PROVIDER_PRESETS[0].name, endpoint: MODEL_PROVIDER_PRESETS[0].endpoint, apiKey: '', models: MODEL_PROVIDER_PRESETS[0].models, enabled: true })
  modelsText.value = form.models.join(', ')
  visible.value = true
}

function edit(row: ModelProviderSummary) {
  Object.assign(form, { ...row, apiKey: '' })
  modelsText.value = row.models.join(', ')
  visible.value = true
}

async function save() {
  const api = getPlatformApi()
  if (!api) {
    ElMessage.error('模型配置仅支持在 Mira 桌面端保存')
    return
  }
  form.models = modelsText.value.split(',').map(value => value.trim()).filter(Boolean)
  saving.value = true
  try {
    await api.saveModelProvider({ id: form.id, name: form.name, endpoint: form.endpoint, apiKey: form.apiKey?.trim() || undefined, models: [...form.models], enabled: form.enabled })
    visible.value = false
    ElMessage.success('Provider 已保存')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Provider 保存失败')
  } finally {
    saving.value = false
  }
}

async function test(row: ModelProviderSummary) {
  const result = await getPlatformApi()?.testModelProvider({ ...row, apiKey: '' }, row.models[0])
  ElMessage[result?.ok ? 'success' : 'error'](result?.text || '测试失败')
}

async function remove(id: string) {
  await ElMessageBox.confirm('删除后会移除关联角色绑定。', '删除 Provider', { type: 'warning' })
  await getPlatformApi()?.deleteModelProvider(id)
  await load()
}

async function saveBindings() {
  const api = getPlatformApi()
  if (!api) {
    ElMessage.error('模型配置仅支持在 Mira 桌面端保存')
    return
  }
  await api.saveModelRoleBindings(toRaw(bindings))
  ElMessage.success('角色绑定已保存')
}

onMounted(load)
</script>

<style scoped lang="scss">
.page-description{margin:0 0 $spacing-lg;color:var(--cp-text-secondary);font-size:$font-sm}.config-toolbar{margin-bottom:$spacing-md}.bindings{margin-top:$spacing-xl;padding-top:$spacing-xl;border-top:1px solid var(--cp-border-light)}.bindings h2{margin:0;font-size:$font-lg}.bindings p{color:var(--cp-text-secondary);font-size:$font-sm}.binding-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:$spacing-md}@include media-max($breakpoint-md){.binding-form{grid-template-columns:1fr}}
</style>
