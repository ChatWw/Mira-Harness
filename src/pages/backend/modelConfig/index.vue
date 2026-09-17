<template>
  <SettingsPageShell title="模型" wide workspace :show-title="false">
    <div class="provider-page">
      <aside class="provider-rail">
        <header class="provider-rail__header">
          <h1>模型服务</h1>
          <p>配置供应商连接与可用模型</p>
        </header>

        <nav class="provider-list" aria-label="模型供应商">
          <button
            v-for="provider in providerEntries"
            :key="provider.id"
            type="button"
            class="provider-item"
            :class="{ active: provider.id === selectedId }"
            @click="selectProvider(provider)"
          >
            <span class="provider-mark"><img :src="providerIconUrl(provider.providerKey)" alt=""></span>
            <span class="provider-item__copy">
              <strong>{{ provider.name }}</strong>
              <small>{{ isDraftProvider(provider) ? '未配置' : `${enabledModelCount(provider)} 个模型` }}</small>
            </span>
            <span class="provider-status" :class="{ available: isModelProviderAvailable(provider) }" :aria-label="isModelProviderAvailable(provider) ? '可用' : '未就绪'" />
          </button>
        </nav>

        <footer class="provider-rail__footer">
          <button type="button" class="config-link" @click="openConfigFile">
            <AppIcon name="Document" />
            <span>打开本地配置</span>
            <AppIcon name="ArrowRight" />
          </button>
        </footer>
      </aside>

      <main class="provider-panel" v-loading="loading">
        <template v-if="activePreset">
          <header class="provider-panel__header">
            <div class="provider-identity">
              <span class="provider-logo"><img :src="providerIconUrl(activePreset.key)" alt=""></span>
              <div>
                <h2>{{ activePreset.name }}</h2>
                <p>{{ form.authMode === 'none' ? '本地 OpenAI 兼容服务' : 'OpenAI 兼容 API' }}</p>
              </div>
            </div>
            <div class="provider-enable">
              <span>{{ form.enabled ? '已启用' : '已停用' }}</span>
              <el-switch v-model="form.enabled" aria-label="启用供应商" />
            </div>
          </header>

          <div class="provider-panel__body">
            <section class="settings-section">
              <div class="section-heading">
                <div>
                  <h3>连接设置</h3>
                  <p>用于访问 {{ activePreset.name }} 的服务地址和凭据。</p>
                </div>
                <span class="readiness" :class="{ ready: previewAvailable }"><i />{{ previewAvailable ? '可用' : '未就绪' }}</span>
              </div>

              <el-form label-position="top" class="connection-form">
                <el-form-item v-if="form.authMode === 'api-key'" label="API Key">
                  <el-input v-model="form.apiKey" type="password" show-password autocomplete="off" placeholder="输入 API Key" />
                  <p class="field-tip">密钥仅保存在本机配置文件中。</p>
                </el-form-item>
                <div v-else class="no-auth-row">
                  <span class="no-auth-row__icon"><AppIcon name="Monitor" /></span>
                  <div><strong>无需 API Key</strong><p>Ollama 默认通过本机地址访问。</p></div>
                </div>
                <el-form-item label="Endpoint">
                  <el-input v-model="form.endpoint" :disabled="endpointLocked" placeholder="https://api.example.com/v1" />
                  <p v-if="endpointLocked" class="field-tip">内置供应商使用官方兼容地址。</p>
                </el-form-item>
              </el-form>

              <div class="connection-actions">
                <el-button :loading="testing" :disabled="!form.models.length" @click="testConnection"><AppIcon name="Connection" />测试连接</el-button>
                <span v-if="connectionMessage" class="connection-result" :class="connectionState"><AppIcon :name="connectionState === 'success' ? 'CircleCheck' : 'Warning'" />{{ connectionMessage }}</span>
              </div>
            </section>

            <section class="settings-section model-section">
              <div class="section-heading">
                <div>
                  <h3>模型</h3>
                  <p>启用的模型会按“供应商 → 模型名称”出现在选择器中。</p>
                </div>
                <div class="model-actions">
                  <el-tooltip content="从供应商获取模型列表" placement="top">
                    <el-button circle :loading="loadingModels" aria-label="同步模型列表" @click="syncModels"><AppIcon name="Refresh" /></el-button>
                  </el-tooltip>
                  <el-button type="primary" plain @click="openModelDialog"><AppIcon name="Plus" />添加模型</el-button>
                </div>
              </div>

              <div v-if="form.models.length" class="model-list">
                <article v-for="(model, index) in form.models" :key="model.id" class="model-row">
                  <el-switch v-model="model.enabled" :aria-label="`${model.enabled ? '停用' : '启用'} ${model.id}`" />
                  <div class="model-row__identity">
                    <strong>{{ model.id }}</strong>
                    <span v-if="model.reasoning" class="model-badge">推理</span>
                    <span v-if="isMultimodal(model.id)" class="model-badge">多模态</span>
                  </div>
                  <span class="model-meta">{{ formatContextWindow(model.contextWindow) }} 上下文</span>
                  <span class="model-meta model-meta--pricing">{{ model.pricing ? `${model.pricing.currency} 已计价` : '未计价' }}</span>
                  <div class="model-row__actions">
                    <el-tooltip content="编辑模型" placement="top"><el-button text circle aria-label="编辑模型" @click="editModel(index)"><AppIcon name="EditPen" /></el-button></el-tooltip>
                    <el-tooltip content="移除模型" placement="top"><el-button text circle type="danger" aria-label="移除模型" @click="removeModel(index)"><AppIcon name="Delete" /></el-button></el-tooltip>
                  </div>
                </article>
              </div>
              <button v-else type="button" class="model-empty" @click="openModelDialog">
                <span><AppIcon name="Plus" /></span>
                <strong>添加第一个模型</strong>
                <small>模型保存并启用后即可在前台选择</small>
              </button>
            </section>
          </div>

          <footer class="provider-panel__footer">
            <span>{{ saveHint }}</span>
            <el-button type="primary" :loading="saving" @click="saveProvider">保存配置</el-button>
          </footer>
        </template>
      </main>
    </div>

    <el-dialog v-model="modelDialogVisible" :title="editingModelIndex === -1 ? '添加模型' : '编辑模型'" width="600px" destroy-on-close align-center>
      <el-form label-position="top" class="model-dialog-form">
        <el-form-item label="模型名称" required>
          <el-select v-model="modelDraft.id" filterable allow-create default-first-option placeholder="选择或输入模型名称" @change="applyModelKnowledge">
            <el-option v-for="name in modelCandidates" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>
        <div class="model-dialog-grid">
          <el-form-item label="模型状态"><el-switch v-model="modelDraft.enabled" active-text="启用" inactive-text="停用" /></el-form-item>
          <el-form-item label="推理能力"><el-switch v-model="modelDraft.reasoning" active-text="支持推理" inactive-text="标准回复" /></el-form-item>
        </div>
        <el-form-item label="上下文长度">
          <el-input-number v-model="modelDraft.contextWindow" :min="16384" :step="16000" :precision="0" controls-position="right" />
          <span class="input-suffix">token</span>
        </el-form-item>
        <div class="pricing-heading">
          <div><strong>用量估算</strong><p>每 100 万 token 的供应商单价。</p></div>
          <el-switch v-model="pricingEnabled" />
        </div>
        <div v-if="pricingEnabled" class="pricing-grid">
          <el-form-item label="币种"><el-input v-model="modelDraft.pricing!.currency" maxlength="8" placeholder="USD" /></el-form-item>
          <el-form-item label="输入"><el-input-number v-model="modelDraft.pricing!.input" :min="0" :precision="6" controls-position="right" /></el-form-item>
          <el-form-item label="输出"><el-input-number v-model="modelDraft.pricing!.output" :min="0" :precision="6" controls-position="right" /></el-form-item>
          <el-form-item label="缓存读取"><el-input-number v-model="modelDraft.pricing!.cacheRead" :min="0" :precision="6" controls-position="right" /></el-form-item>
          <el-form-item label="缓存写入"><el-input-number v-model="modelDraft.pricing!.cacheWrite" :min="0" :precision="6" controls-position="right" /></el-form-item>
        </div>
      </el-form>
      <template #footer><el-button @click="modelDialogVisible = false">取消</el-button><el-button type="primary" @click="confirmModel">确定</el-button></template>
    </el-dialog>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRaw } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MODEL_PRICING, inferModelReasoning, isModelProviderAvailable, MODEL_PROVIDER_PRESETS, type ModelProviderInput, type ModelProviderKey, type ModelProviderSummary, type ProviderModelConfig } from '@/config/harness'
import { lookupModelKnowledge } from '@/config/modelKnowledge'
import glmIcon from '@/asset/modules_icon/glm.svg'
import kimiIcon from '@/asset/modules_icon/Kimi.svg'
import minimaxIcon from '@/asset/modules_icon/MiniMax.svg'
import deepseekIcon from '@/asset/modules_icon/deepseek.svg'
import ollamaIcon from '@/asset/modules_icon/Ollama.svg'
import qwenIcon from '@/asset/modules_icon/qwen.svg'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const FIXED_PRESETS = MODEL_PROVIDER_PRESETS.filter(preset => preset.key !== 'custom')
const providers = ref<ModelProviderSummary[]>([])
const selectedId = ref('')
const configPath = ref('')
const loading = ref(false)
const saving = ref(false)
const loadingModels = ref(false)
const testing = ref(false)
const remoteModels = ref<string[]>([])
const connectionState = ref<'idle' | 'success' | 'error'>('idle')
const connectionMessage = ref('')
const secretRequestId = ref(0)
const cleanSnapshot = ref('')
const form = reactive<ModelProviderInput>({ providerKey: 'glm', name: '', endpoint: '', authMode: 'api-key', apiKey: '', models: [], enabled: false })

const modelDialogVisible = ref(false)
const editingModelIndex = ref(-1)
const pricingEnabled = ref(false)
const modelDraft = reactive<ProviderModelConfig>({ id: '', enabled: true, reasoning: false, contextWindow: DEFAULT_CONTEXT_WINDOW, pricing: { ...DEFAULT_MODEL_PRICING } })

function createModel(id: string): ProviderModelConfig {
  const knowledge = lookupModelKnowledge(id)
  return { id, enabled: true, reasoning: knowledge?.reasoning ?? inferModelReasoning(id), contextWindow: knowledge?.contextWindow ?? DEFAULT_CONTEXT_WINDOW, ...(knowledge?.pricing ? { pricing: { ...knowledge.pricing } } : {}) }
}

function syntheticProvider(preset: typeof FIXED_PRESETS[number]): ModelProviderSummary {
  return { id: `draft:${preset.key}`, providerKey: preset.key, name: preset.name, endpoint: preset.endpoint, authMode: preset.authMode, models: preset.models.map(createModel), enabled: false, hasApiKey: false, createdAt: 0, updatedAt: 0 }
}

const providerEntries = computed(() => FIXED_PRESETS.flatMap(preset => {
  const configured = providers.value.filter(provider => provider.providerKey === preset.key)
  return configured.length ? configured : [syntheticProvider(preset)]
}))
const activePreset = computed(() => FIXED_PRESETS.find(preset => preset.key === form.providerKey))
const endpointLocked = computed(() => form.providerKey !== 'ollama')
const previewAvailable = computed(() => isModelProviderAvailable({ ...form, id: form.id || 'draft', providerKey: form.providerKey || 'glm', authMode: form.authMode || 'api-key', hasApiKey: Boolean(form.apiKey?.trim()), createdAt: 0, updatedAt: 0 } as ModelProviderSummary))
const modelCandidates = computed(() => [...new Set([...(activePreset.value?.models || []), ...remoteModels.value, ...form.models.map(model => model.id)])])
const saveHint = computed(() => !form.enabled ? '供应商当前为停用状态' : previewAvailable.value ? '保存后可在聊天、小说和自动化中使用' : '完成凭据并至少启用一个模型后可用')
const hasUnsavedChanges = computed(() => Boolean(cleanSnapshot.value && cleanSnapshot.value !== formSnapshot()))

function providerIconUrl(key: ModelProviderKey) {
  return ({ glm: glmIcon, kimi: kimiIcon, minimax: minimaxIcon, deepseek: deepseekIcon, ollama: ollamaIcon, qwen: qwenIcon } as Partial<Record<ModelProviderKey, string>>)[key] || ''
}

function isDraftProvider(provider: ModelProviderSummary) { return provider.id.startsWith('draft:') }
function enabledModelCount(provider: ModelProviderSummary) { return provider.models.filter(model => model.enabled).length }
function isMultimodal(modelId: string) { return lookupModelKnowledge(modelId)?.multimodal === true }
function formatContextWindow(tokens: number) { return tokens >= 1000000 && tokens % 1000000 === 0 ? `${tokens / 1000000}M` : tokens >= 1000 && tokens % 1000 === 0 ? `${tokens / 1000}K` : String(tokens) }
function formSnapshot() { return JSON.stringify({ id: form.id, providerKey: form.providerKey, endpoint: form.endpoint, authMode: form.authMode, apiKey: form.apiKey, enabled: form.enabled, models: form.models }) }
function markFormClean() { cleanSnapshot.value = formSnapshot() }

function assignProvider(provider: ModelProviderSummary) {
  Object.assign(form, { id: isDraftProvider(provider) ? undefined : provider.id, providerKey: provider.providerKey, name: provider.name, endpoint: provider.endpoint, authMode: provider.authMode, apiKey: '', models: provider.models.map(model => ({ ...model, ...(model.pricing ? { pricing: { ...model.pricing } } : {}) })), enabled: provider.enabled })
  remoteModels.value = []
  connectionState.value = 'idle'
  connectionMessage.value = ''
}

async function selectProvider(provider: ModelProviderSummary, skipConfirm = false) {
  if (!skipConfirm && provider.id === selectedId.value) return
  if (!skipConfirm && hasUnsavedChanges.value) {
    try { await ElMessageBox.confirm('当前供应商的修改尚未保存，切换后将丢失这些修改。', '切换供应商', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }) }
    catch { return }
  }
  selectedId.value = provider.id
  assignProvider(provider)
  markFormClean()
  const requestId = ++secretRequestId.value
  if (!isDraftProvider(provider) && provider.authMode === 'api-key') {
    const secret = await getPlatformApi()?.getModelProviderApiKey(provider.id)
    if (requestId === secretRequestId.value && selectedId.value === provider.id) { form.apiKey = secret || ''; markFormClean() }
  }
}

async function load(preferredId?: string) {
  const api = getPlatformApi()
  loading.value = true
  try {
    const [loadedProviders, path] = await Promise.all([api?.listModelProviders() || [], api?.getModelConfigPath() || ''])
    providers.value = loadedProviders
    configPath.value = path
    const entries = providerEntries.value
    const selected = entries.find(provider => provider.id === (preferredId || selectedId.value)) || entries.find(isModelProviderAvailable) || entries.find(provider => !isDraftProvider(provider)) || entries[0]
    if (selected) await selectProvider(selected, true)
  } finally { loading.value = false }
}

function plainInput(): ModelProviderInput {
  return { ...(form.id ? { id: form.id } : {}), providerKey: form.providerKey, name: form.name, endpoint: form.endpoint, authMode: form.authMode, ...(form.apiKey?.trim() ? { apiKey: form.apiKey.trim() } : {}), enabled: form.enabled, models: form.models.map(model => ({ ...toRaw(model), ...(model.pricing ? { pricing: { ...toRaw(model.pricing) } } : {}) })) }
}

async function saveProvider() {
  const api = getPlatformApi()
  if (!api) return ElMessage.error('模型仅支持在 Mira 桌面端保存')
  if (!form.endpoint.trim()) return ElMessage.error('请填写 Endpoint')
  if (form.enabled && form.authMode === 'api-key' && !form.apiKey?.trim()) return ElMessage.error('启用供应商前请填写 API Key')
  if (form.enabled && !form.models.some(model => model.enabled)) return ElMessage.error('启用供应商前请至少启用一个模型')
  saving.value = true
  try {
    const saved = await api.saveModelProvider(plainInput())
    ElMessage.success('供应商配置已保存')
    await load(saved.id)
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '供应商配置保存失败') }
  finally { saving.value = false }
}

async function syncModels() {
  const api = getPlatformApi()
  if (!api || !form.endpoint.trim()) return ElMessage.warning('请先填写 Endpoint')
  if (form.authMode === 'api-key' && !form.apiKey?.trim()) return ElMessage.warning('请先填写 API Key')
  loadingModels.value = true
  try {
    const result = await api.listModelProviderModels(plainInput())
    remoteModels.value = result.models || []
    if (remoteModels.value.length) {
      ElMessage.success(`已获取 ${remoteModels.value.length} 个模型`)
      openModelDialog()
    } else ElMessage.warning(result.error || '供应商未返回模型列表')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '模型列表获取失败') }
  finally { loadingModels.value = false }
}

async function testConnection() {
  const api = getPlatformApi()
  const model = form.models.find(item => item.enabled) || form.models[0]
  if (!api || !model) return
  if (form.authMode === 'api-key' && !form.apiKey?.trim()) return ElMessage.warning('请先填写 API Key')
  testing.value = true
  connectionState.value = 'idle'
  connectionMessage.value = ''
  try {
    const result = await api.testModelProvider(plainInput(), model.id)
    connectionState.value = result.ok ? 'success' : 'error'
    connectionMessage.value = result.text
  } catch (error) {
    connectionState.value = 'error'
    connectionMessage.value = error instanceof Error ? error.message : '连接失败'
  } finally { testing.value = false }
}

function resetModelDraft(model?: ProviderModelConfig) {
  Object.assign(modelDraft, model ? { ...model, pricing: { ...model.pricing || DEFAULT_MODEL_PRICING } } : { id: '', enabled: true, reasoning: false, contextWindow: DEFAULT_CONTEXT_WINDOW, pricing: { ...DEFAULT_MODEL_PRICING } })
  pricingEnabled.value = Boolean(model?.pricing)
}

function openModelDialog() { editingModelIndex.value = -1; resetModelDraft(); modelDialogVisible.value = true }
function editModel(index: number) { editingModelIndex.value = index; resetModelDraft(form.models[index]); modelDialogVisible.value = true }
function applyModelKnowledge() {
  const knowledge = lookupModelKnowledge(modelDraft.id)
  modelDraft.reasoning = knowledge?.reasoning ?? inferModelReasoning(modelDraft.id)
  modelDraft.contextWindow = knowledge?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
  pricingEnabled.value = Boolean(knowledge?.pricing)
  modelDraft.pricing = { ...knowledge?.pricing || DEFAULT_MODEL_PRICING }
}
function confirmModel() {
  const id = modelDraft.id.trim()
  if (!id) return ElMessage.warning('请输入模型名称')
  if (form.models.some((model, index) => model.id === id && index !== editingModelIndex.value)) return ElMessage.warning('该模型已存在')
  const next = { id, enabled: modelDraft.enabled, reasoning: modelDraft.reasoning, contextWindow: modelDraft.contextWindow, ...(pricingEnabled.value ? { pricing: { ...modelDraft.pricing! } } : {}) }
  if (editingModelIndex.value === -1) form.models.push(next)
  else form.models.splice(editingModelIndex.value, 1, next)
  modelDialogVisible.value = false
}
async function removeModel(index: number) {
  try {
    await ElMessageBox.confirm(`从该供应商移除 ${form.models[index].id}？`, '移除模型', { type: 'warning' })
    form.models.splice(index, 1)
  } catch {}
}

async function openConfigFile() {
  const error = await getPlatformApi()?.openModelConfigFile()
  if (error) ElMessage.error(error)
}
function refreshWhenVisible() { if (document.visibilityState === 'visible' && !hasUnsavedChanges.value) void load() }

onMounted(() => { void load(); window.addEventListener('focus', refreshWhenVisible); document.addEventListener('visibilitychange', refreshWhenVisible) })
onBeforeUnmount(() => { window.removeEventListener('focus', refreshWhenVisible); document.removeEventListener('visibilitychange', refreshWhenVisible) })
</script>

<style scoped lang="scss">
.provider-page { display: grid; height: 100%; min-width: 0; min-height: 560px; grid-template-columns: 260px minmax(0, 1fr); overflow: hidden; background: var(--cp-bg); }
.provider-rail { display: flex; min-height: 0; flex-direction: column; background: var(--cp-bg); border-right: 1px solid var(--cp-border); }
.provider-rail__header { padding: 24px 20px 18px; }
.provider-rail__header h1 { margin: 0; color: var(--cp-text); font-size: 20px; line-height: 1.3; }
.provider-rail__header p { margin: 5px 0 0; color: var(--cp-text-secondary); font-size: $font-xs; }
.provider-list { min-height: 0; flex: 1; overflow-y: auto; padding: 4px 10px 16px; }
.provider-item { display: flex; width: 100%; min-height: 58px; align-items: center; gap: 11px; padding: 8px 10px; color: var(--cp-text); background: transparent; border: 0; border-radius: $radius-sm; font: inherit; text-align: left; cursor: pointer; }
.provider-item:hover { background: var(--cp-border-light); }
.provider-item.active { background: var(--cp-bg-hover); }
.provider-mark, .provider-logo { display: grid; flex: 0 0 auto; place-items: center; background: #f5f5f4; border: 1px solid #e7e5e4; }
.provider-mark { width: 34px; height: 34px; border-radius: 7px; }
.provider-mark img { width: 23px; height: 23px; object-fit: contain; }
.provider-item__copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.provider-item__copy strong { overflow: hidden; font-size: $font-sm; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.provider-item__copy small { color: var(--cp-text-secondary); font-size: 11px; }
.provider-status { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: var(--cp-border); }
.provider-status.available { background: var(--cp-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cp-success) 16%, transparent); }
.provider-rail__footer, .provider-panel__footer { box-sizing: border-box; height: 64px; flex: 0 0 64px; border-top: 1px solid var(--cp-border); background: var(--cp-bg); }
.provider-rail__footer { display: flex; align-items: center; padding: 0 14px; }
.config-link { display: flex; width: 100%; height: 36px; align-items: center; gap: 8px; padding: 0 6px; color: var(--cp-text-secondary); background: transparent; border: 0; font: inherit; font-size: $font-xs; cursor: pointer; }
.config-link span { flex: 1; text-align: left; }.config-link:hover { color: var(--cp-text); }
.provider-panel { display: flex; min-width: 0; min-height: 0; flex-direction: column; }
.provider-panel__header { display: flex; min-height: 88px; align-items: center; justify-content: space-between; gap: 24px; padding: 16px 30px; border-bottom: 1px solid var(--cp-border); }
.provider-identity { display: flex; min-width: 0; align-items: center; gap: 14px; }
.provider-logo { width: 48px; height: 48px; border-radius: 8px; }.provider-logo img { width: 32px; height: 32px; object-fit: contain; }
.provider-identity h2 { margin: 0; color: var(--cp-text); font-size: 19px; line-height: 1.35; }.provider-identity p { margin: 4px 0 0; color: var(--cp-text-secondary); font-size: $font-xs; }
.provider-enable { display: flex; align-items: center; gap: 10px; color: var(--cp-text-secondary); font-size: $font-xs; }
.provider-panel__body { min-height: 0; flex: 1; overflow-y: auto; padding: 4px 30px 28px; }
.settings-section { padding: 26px 0 30px; border-bottom: 1px solid var(--cp-border-light); }.settings-section:last-child { border-bottom: 0; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.section-heading h3 { margin: 0; color: var(--cp-text); font-size: $font-base; }.section-heading p { margin: 5px 0 0; color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.5; }
.readiness { display: inline-flex; height: 26px; align-items: center; gap: 7px; padding: 0 10px; color: var(--cp-text-secondary); background: var(--cp-bg-hover); border-radius: 13px; font-size: 11px; }.readiness i { width: 7px; height: 7px; border-radius: 50%; background: var(--cp-border); }.readiness.ready { color: var(--cp-success); }.readiness.ready i { background: var(--cp-success); }
.connection-form { max-width: 700px; }.connection-form :deep(.el-form-item) { margin-bottom: 18px; }.connection-form :deep(.el-input__inner::placeholder), .model-dialog-form :deep(.el-input__inner::placeholder) { color: var(--cp-text-secondary); }.connection-form :deep(.el-input.is-disabled .el-input__inner) { -webkit-text-fill-color: var(--cp-text-secondary); }.field-tip { width: 100%; margin: 6px 0 0; color: var(--cp-text-secondary); font-size: 11px; }
.no-auth-row { display: flex; max-width: 700px; align-items: center; gap: 12px; margin-bottom: 18px; padding: 12px 14px; background: var(--cp-bg-hover); border-radius: $radius-sm; }.no-auth-row__icon { display: grid; width: 30px; height: 30px; place-items: center; color: var(--cp-success); }.no-auth-row strong { color: var(--cp-text); font-size: $font-sm; }.no-auth-row p { margin: 3px 0 0; color: var(--cp-text-secondary); font-size: 11px; }
.connection-actions, .model-actions { display: flex; align-items: center; gap: 10px; }.connection-result { display: inline-flex; align-items: center; gap: 5px; color: var(--cp-text-secondary); font-size: $font-xs; }.connection-result.success { color: var(--cp-success); }.connection-result.error { color: var(--cp-danger); }
.model-list { border-top: 1px solid var(--cp-border-light); }.model-row { display: grid; min-height: 62px; align-items: center; column-gap: 14px; grid-template-columns: auto minmax(180px, 1fr) 112px 92px auto; border-bottom: 1px solid var(--cp-border-light); }
.model-row__identity { display: flex; min-width: 0; align-items: center; gap: 7px; }.model-row__identity strong { overflow: hidden; color: var(--cp-text); font-size: $font-sm; text-overflow: ellipsis; white-space: nowrap; }
.model-badge { padding: 2px 6px; color: var(--cp-text-secondary); background: var(--cp-bg-hover); border-radius: 3px; font-size: 10px; white-space: nowrap; }.model-meta { color: var(--cp-text-secondary); font-size: 11px; white-space: nowrap; }.model-row__actions { display: flex; gap: 2px; }.model-row__actions :deep(.el-button) { margin: 0; }
.model-empty { display: grid; width: 100%; min-height: 150px; place-items: center; align-content: center; gap: 7px; color: var(--cp-text-secondary); background: transparent; border: 1px dashed var(--cp-border); border-radius: $radius-sm; font: inherit; cursor: pointer; }.model-empty:hover { border-color: var(--cp-primary); }.model-empty > span { display: grid; width: 32px; height: 32px; place-items: center; color: var(--cp-primary); background: var(--cp-primary-lighter); border-radius: 50%; }.model-empty strong { color: var(--cp-text); font-size: $font-sm; }.model-empty small { color: var(--cp-text-secondary); font-size: 11px; }
.provider-panel__footer { display: flex; align-items: center; justify-content: flex-end; gap: 18px; padding: 10px 30px; }.provider-panel__footer span { color: var(--cp-text-secondary); font-size: 11px; }
.model-dialog-form :deep(.el-select) { width: 100%; }.model-dialog-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }.input-suffix { margin-left: 8px; color: var(--cp-text-secondary); font-size: $font-xs; }.pricing-heading { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 14px; padding-top: 16px; border-top: 1px solid var(--cp-border-light); }.pricing-heading strong { color: var(--cp-text); font-size: $font-sm; }.pricing-heading p { margin: 4px 0 0; color: var(--cp-text-secondary); font-size: 11px; }.pricing-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 14px; }.pricing-grid :deep(.el-input-number), .pricing-grid :deep(.el-input) { width: 100%; }
@media (max-width: 1180px) {
  .provider-page { grid-template-columns: 220px minmax(0, 1fr); }
  .provider-panel__header, .provider-panel__footer { padding-right: 20px; padding-left: 20px; }
  .provider-panel__body { padding-right: 20px; padding-left: 20px; }
  .model-row { column-gap: 10px; grid-template-columns: auto minmax(120px, 1fr) 84px auto; }
  .model-meta--pricing { display: none; }
}
</style>
