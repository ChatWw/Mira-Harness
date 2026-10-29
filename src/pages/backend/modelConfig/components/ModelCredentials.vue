<template>
  <el-drawer v-model="managerOpen" title="API 密钥管理" size="400px" class="credential-manager">
    <div class="key-manager">
      <p class="key-manager__hint">储存常用密钥，复制后可在主页面替换使用。</p>
      <div v-loading="managerLoading" class="key-manager__list">
        <div v-for="key in storedKeys" :key="key.id" class="key-manager__entry">
          <template v-if="editingKeyId !== key.id">
            <span class="key-manager__identity"><span v-if="key.label">{{ key.label }}</span><small>{{ maskKey(key.value) }}</small></span>
            <SettingsTooltip content="复制密钥" placement="top"><el-button text circle :aria-label="`复制 ${key.label || '密钥'}`" @click="copyStoredKey(key.value)"><AppIcon name="CopyDocument" /></el-button></SettingsTooltip>
            <SettingsTooltip content="编辑密钥" placement="top"><el-button text circle :disabled="managerBusy" :aria-label="`编辑 ${key.label || '密钥'}`" @click="editStoredKey(key)"><AppIcon name="EditPen" /></el-button></SettingsTooltip>
            <SettingsTooltip content="删除密钥" placement="top"><el-button text circle type="danger" :disabled="managerBusy" :aria-label="`删除 ${key.label || '密钥'}`" @click="deleteStoredKey(key)"><AppIcon name="Delete" /></el-button></SettingsTooltip>
          </template>
          <KeyEditor v-else :label="storedLabel" :value="storedValue" :busy="managerBusy" @update:label="storedLabel = $event" @update:value="storedValue = $event" @save="saveStoredKey" @cancel="editingKeyId = ''" />
        </div>
        <div v-if="editingKeyId === 'new'" class="key-manager__entry"><KeyEditor :label="storedLabel" :value="storedValue" :busy="managerBusy" @update:label="storedLabel = $event" @update:value="storedValue = $event" @save="saveStoredKey" @cancel="editingKeyId = ''" /></div>
        <p v-else-if="!storedKeys.length && !managerLoading" class="key-manager__empty">尚未储存 API 密钥</p>
      </div>
      <el-button class="key-manager__add" :disabled="Boolean(editingKeyId) || managerBusy || managerLoading" @click="addStoredKey"><AppIcon name="Plus" />添加 API 密钥</el-button>
      <p v-if="managerError" class="credential-error" role="alert">{{ managerError }}</p>
    </div>
  </el-drawer>

  <el-dialog v-model="dialogOpen" :title="dialogTitle" width="560px" align-center class="credential-dialog"
    :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" @closed="resetDialog">
    <div class="credential-body">
      <template v-if="step === 'key'">
        <el-input ref="keyInput" v-model="draftKey" aria-label="输入 API 密钥" type="password" show-password autocomplete="off" placeholder="输入 API 密钥" @keyup.enter="nextFromKey" />
      </template>
      <template v-else-if="step === 'models'">
        <div class="credential-search">
          <el-input v-model="search" aria-label="搜索可选模型" placeholder="搜索模型…"><template #prefix><AppIcon name="Search" /></template></el-input>
          <el-button :disabled="!available.length" @click="toggleAll">{{ allPicked ? '取消全选' : '全选' }}</el-button>
        </div>
        <div v-loading="busy" class="credential-models">
          <label v-for="id in filteredModels" :key="id" class="credential-model">
            <span class="credential-model__identity"><span class="credential-model__name" :title="id">{{ id }}</span><ModelCapabilities :model="{ ...availableMetadata[id], ...provider.models.find(model => model.id === id) }" /></span>
            <input v-model="picked" type="checkbox" :value="id" :aria-label="`选择 ${id}`">
          </label>
          <p v-if="!busy && !filteredModels.length" class="credential-empty">{{ available.length ? '没有匹配的模型' : '未获取到模型，可重试或跳过' }}</p>
        </div>
      </template>
      <template v-else-if="step === 'test'">
        <div class="credential-field">
          <label>选择模型</label>
          <el-select v-model="testModelId" aria-label="选择检测模型">
            <template #label="{ label }"><span class="credential-option"><span class="credential-model__name">{{ label }}</span><ModelCapabilities :model="selectedTestModel" /></span></template>
            <el-option v-for="model in provider.models" :key="model.id" :label="model.name || model.id" :value="model.id">
              <span class="credential-option"><span class="credential-model__name" :title="model.id">{{ model.name || model.id }}</span><ModelCapabilities :model="model" /></span>
            </el-option>
          </el-select>
        </div>
        <div v-if="provider.authMode !== 'none'" class="credential-field">
          <label>API 密钥</label><div class="credential-key-preview">{{ maskedKey }}</div>
        </div>
        <div v-if="results.length" class="credential-results" aria-live="polite">
          <div v-for="result in results" :key="result.id" class="credential-result" :class="{ 'is-error': !result.ok }">
            <AppIcon :name="result.ok ? 'CircleCheck' : 'CircleClose'" /><span>{{ result.id }}</span><ModelCapabilities :model="provider.models.find(model => model.id === result.id)" /><small>{{ result.text }}</small>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="credential-progress" aria-live="polite">
          <div><AppIcon name="CircleCheck" /><span>添加所选模型</span></div>
          <div :class="{ 'is-error': !busy && !verified }"><AppIcon :name="verified ? 'CircleCheck' : busy ? 'Loading' : 'CircleClose'" :class="{ 'is-loading': busy }" /><span>验证 {{ verificationModel }}</span><ModelCapabilities :model="provider.models.find(model => model.id === verificationModel)" /></div>
          <div :class="{ 'is-pending': !verified }"><AppIcon :name="verified ? 'CircleCheck' : 'More'" /><span>启用服务商</span></div>
        </div>
      </template>
      <p v-if="error" class="credential-error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <div class="credential-footer">
        <template v-if="step === 'key'">
          <el-button :disabled="!draftKey.trim()" :loading="busy" @click="saveKeyOnly">保存并关闭</el-button>
          <span class="spacer" /><el-button type="primary" :disabled="!draftKey.trim()" :loading="busy" @click="nextFromKey">下一步</el-button>
        </template>
        <template v-else-if="step === 'models'">
          <el-button v-if="provider.authMode !== 'none'" text :disabled="busy" @click="step = 'key'; error = ''">修改密钥</el-button>
          <span class="spacer" /><el-button v-if="error" :loading="busy" @click="fetchModels">重试</el-button>
          <el-button :disabled="busy" @click="dialogOpen = false">跳过</el-button>
          <el-button type="primary" :disabled="!picked.length || busy" @click="addAndVerify">添加所选模型</el-button>
        </template>
        <template v-else-if="step === 'test'">
          <el-button :disabled="busy || !provider.models.length" @click="runTests(true)">检测所有模型</el-button>
          <span class="spacer" /><el-button :disabled="busy" @click="dialogOpen = false">{{ results.length ? '关闭' : '取消' }}</el-button>
          <el-button type="primary" :disabled="!testModelId" :loading="busy" @click="runTests(false)">{{ results.length ? '重新检测' : '开始' }}</el-button>
        </template>
        <template v-else>
          <el-button v-if="provider.authMode !== 'none'" :disabled="busy" @click="step = 'key'; error = ''">修改密钥</el-button><span class="spacer" />
          <el-button :disabled="busy" @click="dialogOpen = false">关闭</el-button>
          <el-button type="primary" :loading="busy" @click="verifyAndEnable">{{ busy ? '检测并启用' : '重新检测' }}</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import SettingsTooltip from '../../settings/components/SettingsTooltip.vue'
import KeyEditor from './KeyEditor.vue'
import ModelCapabilities from './ModelCapabilities.vue'
import { computed, nextTick, ref } from 'vue'
import { ElMessage, ElMessageBox, type InputInstance } from 'element-plus'
import { getPlatformApi } from '@/platform'
import { DEFAULT_CONTEXT_WINDOW, type ModelApiKey, type ModelMetadata, type ModelProviderInput, type ModelProviderSummary } from '@/config/harness'

const props = defineProps<{ provider: ModelProviderInput; savedKey: string }>()
const emit = defineEmits<{ saved: [provider: ModelProviderSummary, key?: string] }>()
const api = getPlatformApi()
const managerOpen = ref(false), dialogOpen = ref(false), busy = ref(false)
const storedKeys = ref<ModelApiKey[]>([]), managerLoading = ref(false), managerBusy = ref(false)
const editingKeyId = ref(''), storedLabel = ref(''), storedValue = ref('')
const step = ref<'key' | 'models' | 'verify' | 'test'>('key')
const draftKey = ref(''), search = ref(''), available = ref<string[]>([]), picked = ref<string[]>([])
const availableMetadata = ref<Record<string, ModelMetadata>>({})
const error = ref(''), managerError = ref(''), testModelId = ref(''), verificationModel = ref(''), verified = ref(false)
const keyInput = ref<InputInstance>()
const results = ref<Array<{ id: string; ok: boolean; text: string }>>([])
const hasKey = computed(() => Boolean(props.savedKey))
const maskKey = (value: string) => value.length > 8 ? `${value.slice(0, 2)}••••${value.slice(-4)}` : value ? '••••••••' : '未配置'
const maskedKey = computed(() => maskKey(props.savedKey))
const dialogTitle = computed(() => step.value === 'test' ? '请选择要检测的模型' : `${props.provider.name} · ${step.value === 'key' ? hasKey.value ? '更换 API 密钥' : '添加 API 密钥' : step.value === 'models' ? '选择模型' : '检测并启用'}`)
const filteredModels = computed(() => available.value.filter(id => id.toLowerCase().includes(search.value.trim().toLowerCase())))
const allPicked = computed(() => available.value.length > 0 && available.value.every(id => picked.value.includes(id)))
const selectedTestModel = computed(() => props.provider.models.find(model => model.id === testModelId.value))
let configured: ModelProviderInput | undefined

function snapshot(): ModelProviderInput { return JSON.parse(JSON.stringify(props.provider)) }
function resetDialog() { draftKey.value = ''; error.value = ''; configured = undefined }
async function openManager() {
  if (!api || !props.provider.id) return
  managerError.value = ''; editingKeyId.value = ''; storedKeys.value = []; managerLoading.value = true; managerOpen.value = true
  try { storedKeys.value = await api.getModelProviderApiKeys(props.provider.id) } catch (cause) { managerError.value = message(cause) } finally { managerLoading.value = false }
}
function addStoredKey() { editingKeyId.value = 'new'; storedLabel.value = ''; storedValue.value = ''; managerError.value = '' }
function editStoredKey(key: ModelApiKey) { editingKeyId.value = key.id; storedLabel.value = key.label; storedValue.value = key.value; managerError.value = '' }
async function copyStoredKey(value: string) {
  try { await navigator.clipboard.writeText(value); ElMessage.success('已复制密钥') } catch { managerError.value = '复制失败，请重试' }
}
async function persistStoredKeys(keys: ModelApiKey[]) {
  if (!api) return
  managerBusy.value = true; managerError.value = ''
  try {
    const saved = await api.saveModelProvider({ ...snapshot(), apiKeys: keys.map(key => ({ ...key })) })
    storedKeys.value = keys; editingKeyId.value = ''; emit('saved', saved)
  } catch (cause) { managerError.value = message(cause) } finally { managerBusy.value = false }
}
async function saveStoredKey() {
  const value = storedValue.value.trim()
  if (!value || managerBusy.value) return
  if (storedKeys.value.some(key => key.id !== editingKeyId.value && key.value === value)) { managerError.value = '这把密钥已存在'; return }
  const key = { id: editingKeyId.value === 'new' ? crypto.randomUUID() : editingKeyId.value, label: storedLabel.value.trim(), value }
  await persistStoredKeys(editingKeyId.value === 'new' ? [...storedKeys.value, key] : storedKeys.value.map(item => item.id === key.id ? key : item))
}
async function deleteStoredKey(key: ModelApiKey) {
  try { await ElMessageBox.confirm('从储存列表删除这把密钥？当前使用的密钥不受影响。', '删除储存的密钥', { confirmButtonText: '删除', cancelButtonText: '取消' }) } catch { return }
  await persistStoredKeys(storedKeys.value.filter(item => item.id !== key.id))
}
async function openKey() {
  managerOpen.value = false
  step.value = 'key'; draftKey.value = ''; error.value = ''; picked.value = []; search.value = ''; verified.value = false
  dialogOpen.value = true
  await nextTick(); keyInput.value?.focus()
}
async function openTest() {
  if (props.provider.authMode !== 'none' && !hasKey.value) { void openKey(); return }
  if (!props.provider.models.length) {
    configured = snapshot(); step.value = 'models'; available.value = []; picked.value = []; search.value = ''
    dialogOpen.value = true; await fetchModels(); return
  }
  step.value = 'test'; testModelId.value = props.provider.models.find(model => model.enabled)?.id || props.provider.models[0]?.id || ''
  error.value = ''; results.value = []; dialogOpen.value = true
}
async function saveKey() {
  if (!api || !draftKey.value.trim()) return false
  const input = { ...snapshot(), apiKey: draftKey.value.trim(), enabled: draftKey.value.trim() === props.savedKey ? props.provider.enabled : false }
  const saved = await api.saveModelProvider(input)
  configured = { ...input, id: saved.id }
  emit('saved', saved, input.apiKey)
  return true
}
async function saveKeyOnly() {
  busy.value = true; error.value = ''
  try { if (await saveKey()) dialogOpen.value = false } catch (cause) { error.value = message(cause) } finally { busy.value = false }
}
async function nextFromKey() {
  if (busy.value || !draftKey.value.trim()) return
  busy.value = true; error.value = ''
  try {
    if (!await saveKey()) return
    step.value = 'models'; available.value = []; picked.value = []; search.value = ''
    await fetchModels()
  } catch (cause) { error.value = message(cause) } finally { busy.value = false }
}
async function fetchModels() {
  if (!api) return
  busy.value = true; error.value = ''
  try {
    const result = await api.listModelProviderModels(configured || snapshot())
    available.value = result.models || []
    availableMetadata.value = result.metadata || {}
    if (result.error) error.value = result.error
  } catch (cause) { error.value = message(cause) } finally { busy.value = false }
}
function toggleAll() { picked.value = allPicked.value ? [] : [...available.value] }
async function addAndVerify() {
  if (!api || !picked.value.length) return
  busy.value = true; error.value = ''
  try {
    const input = configured || snapshot()
    input.models = input.models.map(model => picked.value.includes(model.id) ? { ...availableMetadata.value[model.id], ...model, enabled: true } : model)
    for (const id of picked.value) if (!input.models.some(model => model.id === id)) input.models.push({ id, enabled: true, reasoning: false, contextWindow: DEFAULT_CONTEXT_WINDOW, ...availableMetadata.value[id] })
    const saved = await api.saveModelProvider(input)
    configured = input; emit('saved', saved, input.apiKey)
    verificationModel.value = picked.value[0]
    step.value = 'verify'
    await verifyAndEnable()
  } catch (cause) { error.value = message(cause) } finally { busy.value = false }
}
async function verifyAndEnable() {
  if (!api || !configured) return
  busy.value = true; error.value = ''; verified.value = false
  try {
    const result = await api.testModelProvider(configured, verificationModel.value)
    if (!result.ok) { error.value = result.text; return }
    const saved = await api.saveModelProvider({ ...configured, enabled: true })
    configured.enabled = true; verified.value = true
    emit('saved', saved, configured.apiKey)
    dialogOpen.value = false
  } catch (cause) { error.value = message(cause) } finally { busy.value = false }
}
async function runTests(all: boolean) {
  if (!api || busy.value) return
  busy.value = true; error.value = ''; results.value = []
  const input = snapshot()
  try {
    for (const model of all ? input.models : input.models.filter(model => model.id === testModelId.value)) {
      const result = await api.testModelProvider(input, model.id)
      results.value.push({ id: model.id, ...result })
    }
  } catch (cause) { error.value = message(cause) } finally { busy.value = false }
}
async function removeKey() {
  if (!api) return
  try { await ElMessageBox.confirm('删除当前实例的 API 密钥？', '删除密钥', { confirmButtonText: '删除', cancelButtonText: '取消' }) } catch { return }
  busy.value = true; managerError.value = ''
  try { emit('saved', await api.saveModelProvider({ ...snapshot(), clearApiKey: true, enabled: false }), '') } catch (cause) { managerError.value = message(cause) } finally { busy.value = false }
}
function message(cause: unknown) { return cause instanceof Error ? cause.message : '操作失败，请重试' }
defineExpose({ openKey, openManager, openTest, removeKey })
</script>

<style scoped lang="scss">
.credential-body { padding-top: 4px; }
.credential-search { display: flex; gap: 10px; margin-bottom: 16px; }
.credential-models { height: min(380px, calc(100vh - 270px)); min-height: 160px; overflow-y: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
.credential-model { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 8px; border-bottom: 1px solid var(--cp-border-light); cursor: pointer; span { overflow-wrap: anywhere; } input { flex: 0 0 auto; width: 16px; height: 16px; accent-color: var(--cp-text); cursor: pointer; } &:hover { background: var(--cp-bg-hover); } }
.credential-model__identity, .credential-option { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
.credential-model__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.credential-option .credential-model__name { flex: 1; }
.credential-footer { display: flex; align-items: center; gap: 8px; .el-button + .el-button { margin-left: 0; } }
.spacer { flex: 1; }
.credential-empty, .key-manager__empty { margin: 0; padding: 36px 12px; text-align: center; color: var(--cp-text-secondary); }
.credential-error { margin: 16px 0 0; color: var(--cp-danger); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.credential-field { margin-bottom: 20px; label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 500; } .el-select { width: 100%; } }
.credential-key-preview { padding: 10px 12px; border-radius: 8px; background: var(--cp-bg-elevated); color: var(--cp-text-secondary); }
.credential-progress { display: grid; gap: 24px; padding: 16px 0; > div { display: flex; align-items: center; gap: 12px; overflow-wrap: anywhere; } .app-icon { color: var(--cp-success); flex-shrink: 0; } .is-error .app-icon { color: var(--cp-danger); } .is-pending { color: var(--cp-text-secondary); .app-icon { color: inherit; } } }
.credential-results { max-height: 200px; overflow-y: auto; scrollbar-width: none; }
.credential-result { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 8px; padding: 10px 0; font-size: 13px; overflow-wrap: anywhere; .app-icon { color: var(--cp-success); } small { width: 100%; color: var(--cp-text-secondary); padding-left: 24px; } &.is-error .app-icon, &.is-error small { color: var(--cp-danger); } }
.key-manager__entry { display: flex; align-items: center; gap: 8px; padding: 16px 0; border-bottom: 1px solid var(--cp-border); > span { flex: 1; } }
.key-manager__entry .el-button + .el-button { margin-left: 0; }
.key-manager__identity { display: flex; flex-direction: column; gap: 4px; min-width: 0; overflow-wrap: anywhere; small { color: var(--cp-text-secondary); font-size: 12px; } }
.key-manager__hint { margin: 0 0 20px; font-size: 13px; color: var(--cp-text-secondary); line-height: 1.6; }
.key-manager__add { width: 100%; margin-top: 20px; }
.key-manager__empty { border: 1px solid var(--cp-border); border-radius: 10px; }
:global(.credential-dialog.el-dialog) { max-width: calc(100vw - 48px); }
:global(.credential-manager .el-drawer__body) { padding: 24px; }
:global(.credential-manager.el-drawer) { top: 12px; right: 12px; height: calc(100% - 24px); border-radius: 16px; background: var(--cp-bg); }
</style>
