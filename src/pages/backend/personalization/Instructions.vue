<template>
  <SettingsPageShell title="Mira 指令">
    <template #titlebar>
      <div class="instructions-toolbar">
        <button type="button" class="instructions-back" :disabled="saving" @click="back"><AppIcon name="lucide:arrow-left" />返回</button>
        <div class="instructions-actions"><el-button :disabled="loading || saving" @click="cancel">取消</el-button><el-button type="primary" :disabled="loading || Boolean(loadError) || !dirty" :loading="saving" @click="save">保存</el-button></div>
      </div>
    </template>
    <div class="instructions-page">
      <p class="instructions-description">编辑全局 AGENTS.md 文件，为所有 Mira 对话设置行为和语气。</p>
      <p v-if="loadError" class="instructions-error" role="alert">{{ loadError }} <el-button text @click="load">重试</el-button></p>
      <el-input v-model="instructions" class="instructions-input" :disabled="loading || Boolean(loadError) || saving" type="textarea" :rows="14" resize="vertical" placeholder="输入适用于所有对话的自定义指令…" aria-label="自定义指令" />
      <div class="instructions-meta"><span role="status">{{ loading ? '正在读取…' : dirty ? '有未保存的修改' : '' }}</span></div>
      <details v-if="path" class="storage-detail"><summary><AppIcon name="lucide:folder" />存储位置<AppIcon name="lucide:chevron-right" /></summary><p><button type="button" class="storage-path" aria-label="在文件管理器中显示自定义指令文件" @click="reveal">{{ path }}</button></p></details>
    </div>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const route = useRoute(), router = useRouter()
const instructions = ref(''), saved = ref(''), path = ref('')
const loading = ref(true), loadError = ref(''), saving = ref(false)
const dirty = computed(() => instructions.value !== saved.value)

async function load() {
  loading.value = true; loadError.value = ''
  try {
    const api = getPlatformApi()
    if (!api) throw new Error('自定义指令仅在桌面端中可用')
    const [content, location] = await Promise.all([api.getGlobalInstructions(), api.getGlobalInstructionsPath()])
    instructions.value = content; saved.value = content; path.value = location
  } catch (error) { loadError.value = error instanceof Error ? error.message : '读取失败，请重试' }
  finally { loading.value = false }
}

function back() { return router.push({ path: '/settings/personalization', query: route.query }) }
function cancel() { if (saving.value) return; instructions.value = saved.value; return back() }

async function save() {
  if (loading.value || loadError.value || saving.value || !dirty.value) return
  saving.value = true
  let success = false
  try {
    const api = getPlatformApi()
    if (!api) throw new Error('自定义指令仅在桌面端中可用')
    const content = instructions.value
    await api.saveGlobalInstructions(content)
    saved.value = content; success = true
    ElMessage.success('自定义指令已保存')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '自定义指令保存失败') }
  finally { saving.value = false }
  if (success) await back()
}

async function reveal() {
  try {
    const api = getPlatformApi()
    if (!api) throw new Error('文件位置仅在桌面端中可用')
    await api.revealHarnessSettingsFile('instructions')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '打开文件位置失败') }
}

onBeforeRouteLeave(async () => {
  if (saving.value) return false
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('当前修改尚未保存，离开后将丢失。', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
})
onMounted(() => { void load() })
</script>

<style scoped lang="scss">
.instructions-toolbar { display: flex; width: 100%; min-width: 0; align-items: center; justify-content: space-between; gap: 16px; }
.instructions-actions { display: flex; align-items: center; gap: 8px; }
.instructions-actions :deep(.el-button) { height: 28px; margin-left: 0; padding: 4px 12px; font-size: var(--settings-text-small); }
.instructions-back { display: inline-flex; height: 28px; align-items: center; gap: 6px; padding: 4px 8px; border: 0; border-radius: var(--cp-radius-sm); background: transparent; color: var(--cp-text-secondary); font: inherit; font-size: var(--settings-text-small); cursor: pointer; }
.instructions-back:hover { background: var(--cp-bg-hover); color: var(--cp-text); }
.instructions-back:disabled { opacity: .5; cursor: default; }
.instructions-back:focus-visible, .storage-path:focus-visible, .storage-detail summary:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.instructions-toolbar :deep(.app-icon), .storage-detail :deep(.app-icon) { flex: none; width: 14px; height: 14px; }
.instructions-description { margin: -12px 0 28px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.6; }
.instructions-error { color: var(--cp-danger); }
.instructions-input :deep(.el-textarea__inner) { padding: 12px 14px; background: var(--cp-bg); color: var(--cp-text); font-size: var(--settings-text-base); line-height: 1.7; }
.instructions-input :deep(.el-textarea__inner::placeholder) { color: var(--cp-text-secondary); }
.instructions-meta { min-height: 24px; padding-top: 6px; color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.storage-detail { min-width: 0; margin-top: 8px; color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.storage-detail summary { display: flex; width: fit-content; min-height: 28px; align-items: center; gap: 6px; border-radius: var(--cp-radius-sm); list-style: none; cursor: pointer; }
.storage-detail summary::-webkit-details-marker { display: none; }
.storage-detail summary:hover { color: var(--cp-text); }
.storage-detail[open] summary :deep(.app-icon:last-child) { transform: rotate(90deg); }
.storage-detail p { margin: 4px 0 8px; line-height: 1.6; overflow-wrap: anywhere; }
.storage-path { max-width: 100%; padding: 0; border: 0; border-radius: var(--cp-radius-sm); background: transparent; color: inherit; font: inherit; text-align: left; overflow-wrap: anywhere; cursor: pointer; user-select: text; }
.storage-path:hover, .storage-path:focus-visible { color: var(--cp-text); text-decoration: underline; text-underline-offset: 3px; }
</style>
