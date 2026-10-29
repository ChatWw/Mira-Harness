<template>
  <el-dialog :model-value="true" :title="model ? '编辑模型' : '添加模型'" width="600px" align-center class="model-editor" @update:model-value="emit('close')">
    <div class="model-editor__body">
      <div class="model-editor__field">
        <label for="manual-model-id">模型 ID <span class="model-editor__required">*</span></label>
        <div class="model-editor__identity">
          <el-input id="manual-model-id" v-model="form.id" aria-label="模型 ID" :disabled="Boolean(model)" placeholder="例如 deepseek-v4-pro" spellcheck="false" autofocus @blur="lookup" />
        </div>
      </div>
      <p v-if="lookupMessage" class="model-editor__lookup" role="status" aria-live="polite">{{ lookupMessage }}</p>
      <div class="model-editor__field">
        <label for="manual-model-name">模型名称</label>
        <el-input id="manual-model-name" :model-value="form.name" aria-label="模型名称" placeholder="留空则使用模型 ID" @update:model-value="update('name', $event)" />
      </div>
      <div v-if="!model && form.id.trim()" class="model-editor__preview"><ModelCapabilities :model="form" /></div>
      <button type="button" class="model-editor__more" :aria-expanded="more" aria-controls="manual-model-settings" @click="more = !more">
        更多设置<AppIcon :name="more ? 'lucide:chevron-up' : 'lucide:chevron-down'" :size="16" />
      </button>
      <div v-if="more" id="manual-model-settings" class="model-editor__settings">
        <div class="model-editor__section">
          <span class="model-editor__label">模型类型</span>
          <div class="model-editor__choices" role="group" aria-label="模型类型">
            <button v-for="type in MODEL_TYPES" :key="type.value" type="button" class="model-editor__choice" :class="{ 'is-selected': (form.modelType || 'chat') === type.value }" :aria-pressed="(form.modelType || 'chat') === type.value" @click="update('modelType', type.value)"><AppIcon :name="type.icon" :size="16" />{{ type.label }}</button>
          </div>
          <template v-for="group in capabilityGroups" :key="group.label">
            <span class="model-editor__label model-editor__label--next">{{ group.label }}</span>
            <div class="model-editor__choices" role="group" :aria-label="group.label">
              <button v-for="capability in group.items" :key="capability.key" type="button" class="model-editor__choice" :class="{ 'is-selected': form[capability.key] }" :aria-pressed="Boolean(form[capability.key])" @click="update(capability.key, !form[capability.key])"><AppIcon :name="capability.icon" :size="16" />{{ capability.label }}</button>
            </div>
          </template>
        </div>
        <div class="model-editor__section model-editor__limits">
          <div v-for="limit in limits" :key="limit.key" class="model-editor__limit">
            <label :for="`manual-model-${limit.key}`">{{ limit.label }}</label>
            <div class="model-editor__choices" role="group" :aria-label="`${limit.label}快捷输入`">
              <button v-for="preset in limit.presets" :key="preset.label" type="button" class="model-editor__preset" :class="{ 'is-selected': Number(form[limit.key]) === preset.value }" :aria-pressed="Number(form[limit.key]) === preset.value" :title="`${preset.value.toLocaleString()} Token`" @click="update(limit.key, String(preset.value))">{{ preset.label }}</button>
            </div>
            <el-input :id="`manual-model-${limit.key}`" :model-value="form[limit.key]" :aria-label="limit.label" inputmode="numeric" :placeholder="limit.placeholder" @update:model-value="update(limit.key, $event)" />
          </div>
        </div>
      </div>
      <p v-if="error" class="model-editor__error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" @click="save">{{ model ? '保存模型' : '添加模型' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { DEFAULT_CONTEXT_WINDOW, type ProviderModelConfig } from '@/config/harness'
import { MODEL_ABILITIES, MODEL_INPUTS, MODEL_TYPES } from '@/config/modelCapabilities'
import { getPlatformApi } from '@/platform'
import ModelCapabilities from './ModelCapabilities.vue'

const props = defineProps<{ model?: ProviderModelConfig }>()
const emit = defineEmits<{ close: [], save: [model: ProviderModelConfig] }>()
const api = getPlatformApi()
const more = ref(false)
const error = ref('')
const lookupMessage = ref('')
const form = reactive({
  id: props.model?.id || '', name: props.model?.name || '',
  modelType: props.model?.modelType,
  multimodal: props.model?.multimodal ?? false, reasoning: props.model?.reasoning ?? false,
  toolCall: props.model?.toolCall, audioInput: props.model?.audioInput, videoInput: props.model?.videoInput,
  contextWindow: String(props.model?.contextWindow || DEFAULT_CONTEXT_WINDOW),
  maxTokens: props.model?.maxTokens ? String(props.model.maxTokens) : '',
})
type Field = Exclude<keyof typeof form, 'id'>
const defaults = { ...form }
const capabilityGroups = [{ label: '模型能力', items: MODEL_ABILITIES }, { label: '输入模态', items: MODEL_INPUTS }]
const edited = new Set<Field>()
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
let queriedId = ''
function update<K extends Field>(key: K, value: typeof form[K]) { edited.add(key); form[key] = value; error.value = '' }

const presets = (values: number[]) => values.map(value => ({ label: value === 1024 ? '1M' : `${value}K`, value: value * 1024 }))
const limits = [
  { key: 'contextWindow' as const, label: '上下文窗口', presets: presets([128, 200, 256, 400, 512, 1024]), placeholder: '例如 128000' },
  { key: 'maxTokens' as const, label: '最大输出 Token', presets: presets([16, 32, 64, 128, 256]), placeholder: '例如 65536' },
]

watch(() => form.id, () => {
  revision += 1
  clearTimeout(timer)
  queriedId = ''
  lookupMessage.value = ''
  error.value = ''
  for (const key of Object.keys(defaults) as Array<keyof typeof form>) {
    if (key !== 'id' && !edited.has(key)) Object.assign(form, { [key]: defaults[key] })
  }
  if (form.id.trim()) timer = setTimeout(lookup, 600)
}, { flush: 'sync' })

async function lookup() {
  clearTimeout(timer)
  const id = form.id.trim()
  if (props.model || !id || queriedId === id) return
  queriedId = id
  const current = ++revision
  lookupMessage.value = '正在从 Models.dev 匹配模型信息…'
  try {
    const result = await api?.lookupModelMetadata(id)
    if (current !== revision) return
    if (!result || result.error) { queriedId = ''; lookupMessage.value = result?.error || '暂时无法查询 Models.dev，可手动填写'; return }
    if (!result.model || !Object.keys(result.model).length) { lookupMessage.value = '未找到匹配信息，可手动填写'; return }
    for (const [key, value] of Object.entries(result.model)) {
      if (!edited.has(key as Field) && value !== undefined) Object.assign(form, { [key]: typeof value === 'number' ? String(value) : value })
    }
    lookupMessage.value = '已从 Models.dev 匹配，可继续调整'
  } catch {
    if (current === revision) { queriedId = ''; lookupMessage.value = '暂时无法查询 Models.dev，可手动填写' }
  }
}

function save() {
  const id = form.id.trim()
  if (!id) { error.value = '请填写模型 ID'; return }
  for (const limit of limits) {
    const value = form[limit.key].trim()
    if (value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)) {
      more.value = true
      error.value = `${limit.label}请填写正整数`
      return
    }
  }
  const { name: _name, maxTokens: _output, ...original } = props.model || {}
  emit('save', {
    ...original, id, enabled: props.model?.enabled ?? true,
    ...(form.name.trim() ? { name: form.name.trim() } : {}),
    ...(form.modelType ? { modelType: form.modelType } : {}),
    reasoning: form.reasoning, multimodal: form.multimodal,
    ...(typeof form.toolCall === 'boolean' ? { toolCall: form.toolCall } : {}),
    ...(typeof form.audioInput === 'boolean' ? { audioInput: form.audioInput } : {}),
    ...(typeof form.videoInput === 'boolean' ? { videoInput: form.videoInput } : {}),
    contextWindow: Number(form.contextWindow) || DEFAULT_CONTEXT_WINDOW,
    ...(form.maxTokens.trim() ? { maxTokens: Number(form.maxTokens) } : {}),
  })
}
onBeforeUnmount(() => { revision += 1; clearTimeout(timer) })
</script>

<style scoped lang="scss">
:global(.model-editor.el-dialog) { display: flex; flex-direction: column; max-height: calc(100vh - 64px); padding: 24px; border-radius: 16px; background: var(--cp-bg); }
:global(.model-editor .el-dialog__header) { flex-shrink: 0; padding: 0 32px 24px 0; }
:global(.model-editor .el-dialog__headerbtn) { top: 14px; right: 14px; }
:global(.model-editor .el-dialog__body) { min-height: 0; padding: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--cp-border) transparent; }
:global(.model-editor .el-dialog__footer) { flex-shrink: 0; padding: 20px 0 0; }
.model-editor__body { padding: 0 4px 2px; color: var(--cp-text); font-size: var(--settings-text-base, 14px); }
.model-editor__field { display: grid; grid-template-columns: 116px minmax(0, 1fr); align-items: center; gap: 16px; margin-bottom: 18px; }
.model-editor__identity { display: flex; align-items: center; gap: 12px; min-width: 0; .el-input { flex: 1; min-width: 0; } }
.model-editor__field > label, .model-editor__label, .model-editor__limit > label { color: var(--cp-text-secondary); }
.model-editor__required { color: var(--cp-danger); }
.model-editor__lookup { margin: -10px 0 18px 132px; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.5; }
.model-editor__more { display: inline-flex; align-items: center; gap: 6px; padding: 8px 0; margin: 0 0 4px; border: 0; background: transparent; color: var(--cp-text-secondary); font: inherit; cursor: pointer; &:hover { color: var(--cp-text); } }
.model-editor__settings { display: grid; gap: 16px; padding-top: 12px; }
.model-editor__section { padding: 16px; border: 1px solid var(--cp-border); border-radius: 12px; }
.model-editor__label { display: block; margin-bottom: 10px; }
.model-editor__label--next { margin-top: 18px; }
.model-editor__preview { display: flex; justify-content: flex-end; margin: -6px 0 12px; }
.model-editor__choices { display: flex; flex-wrap: wrap; gap: 8px; }
.model-editor__choice, .model-editor__preset { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 4px 12px; border: 1px solid var(--cp-border); background: var(--cp-bg); color: var(--cp-text); font: inherit; cursor: pointer; &:hover { background: var(--cp-bg-hover); } &.is-selected { border-color: var(--cp-text-secondary); background: var(--cp-bg-hover); } }
.model-editor__choice { border-radius: 8px; &[aria-disabled="true"] { cursor: default; } }
.model-editor__preset { border-radius: 999px; font-size: 12px; font-variant-numeric: tabular-nums; }
.model-editor__limits { display: grid; gap: 20px; }
.model-editor__limit { display: grid; gap: 8px; }
.model-editor__error { margin: 12px 0 0; color: var(--cp-danger); font-size: 13px; }
.model-editor__more, .model-editor__choice, .model-editor__preset { &:focus-visible { outline: 2px solid var(--cp-text-secondary); outline-offset: 3px; } }
:deep(.el-input__wrapper) { min-height: 36px; border-radius: 8px; }
</style>
