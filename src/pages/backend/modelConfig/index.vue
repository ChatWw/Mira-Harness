<template>
  <SettingsPageShell title="模型" wide>
    <div class="model-page">
      <h2 class="model-page__title">自定义模型</h2>

      <section class="config-file-card">
        <div>
          <h3>本地配置文件</h3>
          <p>管理写入 <a v-if="configPath" class="config-file-link" href="#" @click.prevent="openConfigFile">{{ configPath }}</a><code v-else>models.json</code> 的本地自定义模型配置。</p>
        </div>
        <el-button type="primary" plain @click="openCreate"><AppIcon name="Plus" />添加模型</el-button>
      </section>

      <section class="saved-models">
        <h2>已保存模型</h2>
        <div v-if="loading" v-loading="loading" class="saved-models__loading" />
        <div v-else-if="providers.length" class="model-list">
          <article v-for="provider in providers" :key="provider.id" class="model-row">
            <div class="model-row__identity">
              <span class="provider-mark">
                <img v-if="providerIconUrl(provider.providerKey)" :src="providerIconUrl(provider.providerKey)" alt="">
                <AppIcon v-else :name="providerIcon(provider.providerKey)" />
              </span>
              <div>
                <h3>{{ provider.models[0] }} <el-tag v-if="provider.reasoning" size="small" effect="plain">支持推理</el-tag></h3>
                <p>{{ provider.name }} · {{ formatContextWindow(provider.contextWindow) }} 上下文</p>
              </div>
            </div>
            <div class="model-row__actions">
              <el-tooltip content="编辑模型" placement="top">
                <el-button text circle aria-label="编辑模型" @click="edit(provider)"><AppIcon name="EditPen" /></el-button>
              </el-tooltip>
              <el-tooltip content="删除模型" placement="top">
                <el-button text circle type="danger" aria-label="删除模型" @click="remove(provider.id)"><AppIcon name="Delete" /></el-button>
              </el-tooltip>
            </div>
          </article>
        </div>
        <div v-else class="model-empty">
          <strong>还没有配置自定义模型</strong>
          <p>添加后会自动写入本地 models.json，并出现在聊天和 AI 小说页面的模型选择中。</p>
        </div>
      </section>
    </div>

    <el-dialog v-model="visible" :title="form.id ? '编辑模型' : '添加模型'" width="min(560px, calc(100vw - 32px))" destroy-on-close>
      <p class="dialog-note">仅支持 OpenAI 兼容协议 API</p>
      <el-form label-position="top">
        <el-form-item label="供应商">
          <el-select v-model="form.providerKey" @change="applyPreset">
            <template #label="{ label, value }">
              <span class="provider-option">
                <img v-if="providerIconUrl(value)" :src="providerIconUrl(value)" class="provider-option__icon" alt="">
                <AppIcon v-else :name="providerIcon(value)" />
                <span>{{ label }}</span>
              </span>
            </template>
            <el-option v-for="preset in MODEL_PROVIDER_PRESETS" :key="preset.key" :label="preset.name" :value="preset.key">
              <span class="provider-option">
                <img v-if="providerIconUrl(preset.key)" :src="providerIconUrl(preset.key)" class="provider-option__icon" alt="">
                <AppIcon v-else :name="providerIcon(preset.key)" />
                <span>{{ preset.name }}</span>
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="form.apiKey" type="password" show-password :placeholder="form.id ? '留空则保持现有密钥' : '输入 API Key'" />
        </el-form-item>
        <el-form-item label="模型名称">
          <el-select v-model="selectedModel" filterable allow-create :loading="loadingModels" placeholder="选择或输入模型名称" @focus="loadModelNames" @change="form.reasoning = inferModelReasoning(selectedModel)">
            <el-option v-for="model in modelOptions" :key="model" :label="model" :value="model" />
          </el-select>
        </el-form-item>
        <el-form-item label="推理能力">
          <el-switch v-model="form.reasoning" active-text="支持推理" inactive-text="标准回复" />
          <p class="form-tip">模型列表接口通常不返回此能力；已知推理模型会自动识别，其他模型请按供应商文档确认。</p>
        </el-form-item>
        <el-form-item label="上下文长度">
          <el-input-number v-model="form.contextWindow" class="context-window-input" :min="16384" :step="16000" :precision="0" controls-position="right" :formatter="formatContextWindow" :parser="parseContextWindow" />
          <div class="context-window-presets" aria-label="常用上下文长度">
            <button v-for="value in CONTEXT_WINDOW_PRESETS" :key="value" type="button" :class="{ active: form.contextWindow === value }" @click="form.contextWindow = value">{{ formatContextWindow(String(value)) }}</button>
          </div>
          <p class="form-tip">单位为 token。请按模型供应商的上下文窗口填写，Mira 会据此显示使用情况并提前压缩历史。</p>
        </el-form-item>
        <el-form-item label="Endpoint">
          <el-input v-model="form.endpoint" :disabled="endpointLocked" placeholder="https://api.example.com/v1" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRaw } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import { DEFAULT_CONTEXT_WINDOW, inferModelReasoning, MODEL_PROVIDER_PRESETS, type ModelProviderInput, type ModelProviderKey, type ModelProviderSummary } from '@/config/harness'
import glmIcon from '@/asset/modules_icon/glm.svg'
import kimiIcon from '@/asset/modules_icon/Kimi.svg'
import minimaxIcon from '@/asset/modules_icon/MiniMax.svg'
import deepseekIcon from '@/asset/modules_icon/deepseek.svg'
import ollamaIcon from '@/asset/modules_icon/Ollama.svg'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const providers = ref<ModelProviderSummary[]>([])
const configPath = ref('')
const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const selectedModel = ref('')
const modelOptions = ref<string[]>([])
const loadingModels = ref(false)
const modelRequestId = ref(0)
const form = reactive<ModelProviderInput>({ providerKey: 'glm', name: '', endpoint: '', apiKey: '', models: [], reasoning: false, contextWindow: DEFAULT_CONTEXT_WINDOW, enabled: true })
const endpointLocked = computed(() => form.providerKey !== 'ollama' && form.providerKey !== 'custom')
const CONTEXT_WINDOW_PRESETS = [32000, 64000, 128000, 256000, 512000, 1000000]

function providerIcon(key: ModelProviderKey | string) {
  return ({ glm: 'Connection', kimi: 'ChatDotRound', minimax: 'MagicStick', deepseek: 'Search', ollama: 'Monitor', custom: 'Operation' } as Record<ModelProviderKey, string>)[key as ModelProviderKey] || 'Operation'
}

function providerIconUrl(key: ModelProviderKey | string) {
  return ({ glm: glmIcon, kimi: kimiIcon, minimax: minimaxIcon, deepseek: deepseekIcon, ollama: ollamaIcon } as Partial<Record<ModelProviderKey, string>>)[key as ModelProviderKey]
}

function formatContextWindow(value: string | number) {
  const tokens = Number(value)
  if (!Number.isFinite(tokens)) return ''
  if (tokens >= 1000000 && tokens % 1000000 === 0) return `${tokens / 1000000}M`
  if (tokens >= 1000 && tokens % 1000 === 0) return `${tokens / 1000}K`
  return `${tokens}`
}

function parseContextWindow(value: string) {
  const match = value.trim().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([kKmM])?$/)
  if (!match) return ''
  const multiplier = match[2]?.toLowerCase() === 'm' ? 1000000 : match[2] ? 1000 : 1
  return `${Math.round(Number(match[1]) * multiplier)}`
}

async function load() {
  const api = getPlatformApi()
  loading.value = true
  try {
    const [loadedProviders, path] = await Promise.all([api?.listModelProviders() || [], api?.getModelConfigPath() || ''])
    providers.value = loadedProviders
    configPath.value = path
  } finally { loading.value = false }
}

function refreshWhenVisible() {
  if (document.visibilityState === 'visible') void load()
}

async function openConfigFile() {
  const error = await getPlatformApi()?.openModelConfigFile()
  if (error) ElMessage.error(error)
}

function setModelOptions(models: string[]) { modelOptions.value = [...new Set(models.map(item => item.trim()).filter(Boolean))] }

async function loadModelNames() {
  const requestId = ++modelRequestId.value
  const preset = MODEL_PROVIDER_PRESETS.find(item => item.key === form.providerKey)
  setModelOptions([selectedModel.value, ...(preset?.models || [])])
  const api = getPlatformApi()
  if (!api || !form.endpoint.trim()) { loadingModels.value = false; return }
  loadingModels.value = true
  try {
    const models = await api.listModelProviderModels({ ...toRaw(form), models: selectedModel.value ? [selectedModel.value] : [], apiKey: form.apiKey?.trim() || undefined })
    if (requestId === modelRequestId.value && models.length) setModelOptions([selectedModel.value, ...models])
  } finally {
    if (requestId === modelRequestId.value) loadingModels.value = false
  }
}

function applyPreset() {
  const preset = MODEL_PROVIDER_PRESETS.find(item => item.key === form.providerKey)
  if (!preset) return
  form.name = preset.name
  form.endpoint = preset.endpoint
  selectedModel.value = preset.models.find(Boolean) || ''
  form.models = selectedModel.value ? [selectedModel.value] : []
  form.reasoning = inferModelReasoning(selectedModel.value)
  setModelOptions(preset.models)
  void loadModelNames()
}

function openCreate() {
  Object.assign(form, { id: undefined, providerKey: 'glm', apiKey: '', reasoning: false, contextWindow: DEFAULT_CONTEXT_WINDOW, enabled: true })
  selectedModel.value = ''
  applyPreset()
  visible.value = true
}

async function edit(row: ModelProviderSummary) {
  const api = getPlatformApi()
  Object.assign(form, { id: row.id, providerKey: row.providerKey, name: row.name, endpoint: row.endpoint, apiKey: '', models: [...row.models], reasoning: row.reasoning, contextWindow: row.contextWindow, enabled: row.enabled })
  selectedModel.value = row.models[0] || ''
  setModelOptions([selectedModel.value])
  visible.value = true
  if (api) form.apiKey = await api.getModelProviderApiKey(row.id)
  void loadModelNames()
}

async function save() {
  const api = getPlatformApi()
  if (!api) return ElMessage.error('模型仅支持在 Mira 桌面端保存')
  const model = selectedModel.value.trim()
  if (!model) return ElMessage.error('请选择或输入模型名称')
  saving.value = true
  try {
    await api.saveModelProvider({ ...toRaw(form), models: [model], apiKey: form.apiKey?.trim() || undefined })
    visible.value = false
    ElMessage.success('模型已保存')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '模型保存失败')
  } finally { saving.value = false }
}

async function remove(id: string) {
  try {
    await ElMessageBox.confirm('删除模型后不能恢复。', '删除模型', { type: 'warning' })
    await getPlatformApi()?.deleteModelProvider(id)
    await load()
  } catch {}
}

onMounted(() => {
  void load()
  window.addEventListener('focus', refreshWhenVisible)
  document.addEventListener('visibilitychange', refreshWhenVisible)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshWhenVisible)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
})
</script>

<style scoped lang="scss">
.model-page { max-width: 920px; }
.model-page__title { margin: 0 0 $spacing-lg; color: var(--cp-text); font-size: $font-lg; }
.config-file-card { display: flex; align-items: center; justify-content: space-between; gap: $spacing-lg; padding: 18px 20px; background: var(--cp-bg-hover); border-radius: $radius-sm; }
.config-file-card h3 { margin: 0; color: var(--cp-text); font-size: $font-sm; }
.config-file-card p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-xs; }
.config-file-card code, .config-file-link { color: var(--cp-primary); font-family: inherit; word-break: break-all; }
.config-file-link { text-decoration: none; cursor: pointer; }
.config-file-link:hover { text-decoration: underline; }
.saved-models { margin-top: 32px; }
.saved-models > h2 { margin: 0 0 $spacing-md; color: var(--cp-text); font-size: $font-base; }
.saved-models__loading { min-height: 96px; }
.model-list { display: grid; gap: 8px; }
.model-row { display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: $spacing-md; padding: 10px 16px; background: var(--cp-bg-hover); border-radius: $radius-sm; }
.model-row__identity { display: flex; min-width: 0; align-items: center; gap: 12px; }
.model-row__identity > div { min-width: 0; }
.model-row h3 { overflow: hidden; margin: 0; color: var(--cp-text); font-size: $font-sm; text-overflow: ellipsis; white-space: nowrap; }
.model-row p { margin: 4px 0 0; color: var(--cp-text-secondary); font-size: $font-xs; }
.provider-mark { display: grid; width: 24px; height: 24px; flex: 0 0 24px; place-items: center; color: var(--cp-text-secondary); font-size: 16px; }
.provider-mark img { width: 22px; height: 22px; object-fit: contain; }
.model-row__actions { display: flex; flex: 0 0 auto; gap: 2px; }
.model-row__actions :deep(.el-button) { margin: 0; }
.model-empty { display: grid; min-height: 118px; place-items: center; padding: 22px; text-align: center; border: 1px dashed var(--cp-border); border-radius: $radius-sm; }
.model-empty strong { color: var(--cp-text); font-size: $font-sm; }
.model-empty p { margin: 8px 0 0; color: var(--cp-text-secondary); font-size: $font-xs; }
.dialog-note { margin: 4px 0; padding: $spacing-sm $spacing-md; color: var(--cp-text-secondary); background: var(--cp-bg-hover); border-radius: 16px; font-size: $font-xs; }
.form-tip { width: 100%; margin: 6px 0 0; color: var(--cp-text-tertiary); font-size: $font-xs; line-height: 1.55; }
.context-window-input { width: 208px; }
.context-window-presets { display: flex; width: 100%; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.context-window-presets button { height: 28px; padding: 0 12px; color: var(--cp-text-secondary); background: transparent; border: 0; border-radius: 14px; font: inherit; font-size: $font-sm; cursor: pointer; }
.context-window-presets button:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
.context-window-presets button.active { color: var(--cp-text); background: var(--cp-border); }
.provider-option { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.provider-option__icon { width: 18px; height: 18px; flex: 0 0 18px; object-fit: contain; }
@include media-max($breakpoint-md) {
  .config-file-card { align-items: stretch; flex-direction: column; }
  .config-file-card :deep(.el-button) { align-self: flex-start; }
}
</style>
