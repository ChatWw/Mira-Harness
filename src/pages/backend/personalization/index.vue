<template>
  <SettingsPageShell title="指令与记忆">
    <p v-if="loadError" class="settings-error" role="alert">{{ loadError }} <el-button text @click="load">重试</el-button></p>
    <section class="personalization-section" aria-labelledby="memory-heading">
      <div class="section-heading"><div class="section-heading__title"><h2 id="memory-heading">记忆</h2><SettingsTooltip content="配置 Mira 如何收集、保留和整合你的全局偏好与长期上下文。" placement="right" :trigger="['hover', 'focus']" :show-after="200" :popper-style="{ maxWidth: '320px' }"><button type="button" class="section-info" aria-label="查看记忆说明"><AppIcon name="lucide:info" /></button></SettingsTooltip></div></div>
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy"><span class="settings-row__label">启用记忆</span><span class="settings-row__hint">自动提炼长期事实，并在每次对话时从本地记忆文件载入相关内容</span></div>
          <el-switch v-model="memoryEnabled" :disabled="loading || Boolean(loadError) || memoryResetting" :loading="memorySaving" aria-label="启用记忆" @change="setMemoryEnabled" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy"><span class="settings-row__label">删除 Mira 记忆</span><span class="settings-row__hint">删除本地保存的全部全局记忆</span></div>
          <el-button class="delete-memory-action" type="danger" plain :disabled="loading || Boolean(loadError) || memorySaving" :loading="memoryResetting" @click="deleteMiraMemory">删除</el-button>
        </div>
      </div>
      <details v-if="memoryPath" class="storage-detail"><summary><AppIcon name="lucide:folder" />存储位置<AppIcon name="lucide:chevron-right" /></summary><p><button type="button" class="storage-path" aria-label="在文件管理器中显示全局记忆文件" @click="revealMemoryFile">{{ memoryPath }}</button></p></details>
    </section>

    <section class="personalization-section" aria-labelledby="instructions-heading">
      <div class="section-heading"><div class="section-heading__title"><h2 id="instructions-heading">自定义指令</h2><SettingsTooltip content="为所有 Mira 对话提供持续有效的行为和语气说明。当前用户消息可以针对单次任务提出明确例外。" placement="right" :trigger="['hover', 'focus']" :show-after="200" :popper-style="{ maxWidth: '320px' }"><button type="button" class="section-info" aria-label="查看自定义指令说明"><AppIcon name="lucide:info" /></button></SettingsTooltip></div></div>
      <button type="button" class="instructions-entry" @click="openInstructions">
        <span class="settings-row__copy"><span class="settings-row__label">Mira 指令</span><span class="settings-row__hint">编辑全局 AGENTS.md 文件</span></span>
        <AppIcon name="lucide:chevron-right" />
      </button>
    </section>

    <section class="personalization-section" aria-labelledby="identity-heading">
      <div class="section-heading"><div class="section-heading__title"><h2 id="identity-heading">身份设定</h2><SettingsTooltip content="设置你与 Mira 的默认称呼；未填写时分别使用“你”和“Mira”。" placement="right" :trigger="['hover', 'focus']" :show-after="200" :popper-style="{ maxWidth: '320px' }"><button type="button" class="section-info" aria-label="查看身份设定说明"><AppIcon name="lucide:info" /></button></SettingsTooltip></div></div>
      <div class="settings-list identity-settings">
        <div class="settings-row identity-row">
          <label class="settings-row__label" for="mira-user-name">Mira 对你的称呼</label>
          <div class="identity-control">
            <template v-if="editingMiraUserName">
              <el-input id="mira-user-name" v-model="miraUserName" :disabled="Boolean(preferenceSaving)" clearable maxlength="32" placeholder="默认：你" aria-label="Mira 对你的称呼" />
              <el-button text :disabled="Boolean(preferenceSaving)" @click="cancelMiraUserName">取消</el-button><el-button class="save-action" type="primary" :disabled="Boolean(preferenceSaving) || miraUserName === savedMiraUserName" @click="saveMiraUserName">保存</el-button>
            </template>
            <template v-else><span class="identity-value">{{ miraUserName || '你' }}<small v-if="!miraUserName">默认</small></span><el-button text aria-label="编辑 Mira 对你的称呼" @click="editMiraUserName"><AppIcon name="lucide:pencil" />编辑</el-button></template>
          </div>
        </div>
        <div class="settings-row identity-row">
          <label class="settings-row__label" for="mira-assistant-name">你对 Mira 的称呼</label>
          <div class="identity-control">
            <template v-if="editingMiraAssistantName">
              <el-input id="mira-assistant-name" v-model="miraAssistantName" :disabled="Boolean(preferenceSaving)" clearable maxlength="32" placeholder="默认：Mira" aria-label="你对 Mira 的称呼" />
              <el-button text :disabled="Boolean(preferenceSaving)" @click="cancelMiraAssistantName">取消</el-button><el-button class="save-action" type="primary" :disabled="Boolean(preferenceSaving) || miraAssistantName === savedMiraAssistantName" @click="saveMiraAssistantName">保存</el-button>
            </template>
            <template v-else><span class="identity-value">{{ miraAssistantName || 'Mira' }}<small v-if="!miraAssistantName">默认</small></span><el-button text aria-label="编辑你对 Mira 的称呼" @click="editMiraAssistantName"><AppIcon name="lucide:pencil" />编辑</el-button></template>
          </div>
        </div>
      </div>
    </section>

    <section class="personalization-section" aria-labelledby="tone-heading">
      <div class="section-heading"><div class="section-heading__title"><h2 id="tone-heading">回复语气</h2><SettingsTooltip content="选择 Mira 回复的默认语气。" placement="right" :trigger="['hover', 'focus']" :show-after="200" :popper-style="{ maxWidth: '320px' }"><button type="button" class="section-info" aria-label="查看回复语气说明"><AppIcon name="lucide:info" /></button></SettingsTooltip></div></div>
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy"><span class="settings-row__label">Mira 回复语气</span><span class="settings-row__hint">轻松模式更自然亲切；专业模式更清晰、克制、结构化。</span></div>
          <div class="assistant-tone-picker" role="group" aria-label="Mira 回复语气"><button type="button" :aria-pressed="assistantTone === 'casual'" :disabled="Boolean(preferenceSaving)" @click="setAssistantTone('casual')">轻松</button><button type="button" :aria-pressed="assistantTone === 'professional'" :disabled="Boolean(preferenceSaving)" @click="setAssistantTone('professional')">专业</button></div>
        </div>
      </div>
      <p class="tone-note"><AppIcon name="lucide:info" />并非所有模型都支持个性设置。可在自定义指令中调整 Mira 的行为和语气。</p>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DEFAULT_ASSISTANT_TONE, normalizeAssistantTone, normalizeMiraIdentityName, type AssistantTone } from '@/config/harness'
import { getPlatformApi, getPreference } from '@/platform'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useSettingsPreference } from '../settings/useSettingsPreference'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import SettingsTooltip from '../settings/components/SettingsTooltip.vue'

const route = useRoute(), router = useRouter()
function openInstructions() { void router.push({ path: '/settings/personalization/instructions', query: route.query }) }
const loading = ref(true), loadError = ref('')
const { saving: preferenceSaving, save: savePreference } = useSettingsPreference()
const memoryEnabled = ref(false)
const memoryPath = ref('')
const memorySaving = ref(false)
const memoryResetting = ref(false)
const assistantTone = computed<AssistantTone>(() => normalizeAssistantTone(getPreference<unknown>('assistantTone', DEFAULT_ASSISTANT_TONE)))
const savedMiraUserName = ref(normalizeMiraIdentityName(getPreference<unknown>('miraUserName', '')))
const miraUserName = ref(savedMiraUserName.value)
const editingMiraUserName = ref(false)
const savedMiraAssistantName = ref(normalizeMiraIdentityName(getPreference<unknown>('miraAssistantName', '')))
const miraAssistantName = ref(savedMiraAssistantName.value)
const editingMiraAssistantName = ref(false)

async function load() {
  const api = getPlatformApi()
  loading.value = true
  loadError.value = ''
  try {
    if (!api) throw new Error('指令与记忆仅在桌面端中可用')
    const [enabled, path] = await Promise.all([api.getHarnessMemoryEnabled(), api.getHarnessMemoryPath()])
    memoryEnabled.value = enabled
    memoryPath.value = path
  } catch (error) { loadError.value = error instanceof Error ? error.message : '读取失败，请重试' }
  finally { loading.value = false }
}

async function revealMemoryFile() {
  try {
    const api = getPlatformApi()
    if (!api) throw new Error('文件位置仅在桌面端中可用')
    await api.revealHarnessSettingsFile('memory')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '打开文件位置失败') }
}

async function setMemoryEnabled(value: boolean) {
  const api = getPlatformApi()
  if (!api || loading.value || loadError.value || memorySaving.value || memoryResetting.value) return
  memorySaving.value = true
  try {
    memoryEnabled.value = await api.setHarnessMemoryEnabled(value)
  } catch (error) {
    memoryEnabled.value = !value
    ElMessage.error(error instanceof Error ? error.message : '记忆设置保存失败')
  } finally {
    memorySaving.value = false
  }
}

async function deleteMiraMemory() {
  const api = getPlatformApi()
  if (!api || loading.value || loadError.value || memorySaving.value || memoryResetting.value) return
  try {
    await ElMessageBox.confirm('将删除本地保存的全部全局记忆，且无法恢复。', '删除 Mira 记忆', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch {
    return
  }
  memoryResetting.value = true
  try {
    await api.resetHarnessMemory()
    ElMessage.success('Mira 记忆已删除')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除记忆失败')
  } finally {
    memoryResetting.value = false
  }
}

function setAssistantTone(value: string) {
  savePreference('assistantTone', normalizeAssistantTone(value))
}

async function saveMiraUserName() {
  const value = normalizeMiraIdentityName(miraUserName.value)
  if (!await savePreference('miraUserName', value)) return
  miraUserName.value = value
  savedMiraUserName.value = value
  editingMiraUserName.value = false
}

function editMiraUserName() {
  miraUserName.value = savedMiraUserName.value
  editingMiraUserName.value = true
}

function cancelMiraUserName() {
  miraUserName.value = savedMiraUserName.value
  editingMiraUserName.value = false
}

async function saveMiraAssistantName() {
  const value = normalizeMiraIdentityName(miraAssistantName.value)
  if (!await savePreference('miraAssistantName', value)) return
  miraAssistantName.value = value
  savedMiraAssistantName.value = value
  editingMiraAssistantName.value = false
}

function editMiraAssistantName() {
  miraAssistantName.value = savedMiraAssistantName.value
  editingMiraAssistantName.value = true
}

function cancelMiraAssistantName() {
  miraAssistantName.value = savedMiraAssistantName.value
  editingMiraAssistantName.value = false
}

onBeforeRouteLeave(async () => {
  if (preferenceSaving.value || memorySaving.value || memoryResetting.value) return false
  if ((!editingMiraUserName.value || miraUserName.value === savedMiraUserName.value) && (!editingMiraAssistantName.value || miraAssistantName.value === savedMiraAssistantName.value)) return true
  try { await ElMessageBox.confirm('当前修改尚未保存，离开后将丢失。', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false }
})
onMounted(() => { void load() })
</script>

<style scoped lang="scss">
.personalization-section { min-width: 0; margin-bottom: 32px; }
.personalization-section:last-child { margin-bottom: 0; }
.section-heading { margin-bottom: 12px; }
.section-heading__title { display: inline-flex; align-items: center; gap: 6px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: var(--settings-text-section); font-weight: 550; }
.section-info { display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--cp-text-tertiary); cursor: help; }
.section-info:hover { color: var(--cp-text-secondary); background: var(--cp-bg-hover); }
.section-info :deep(.app-icon) { width: 15px; height: 15px; }
.section-info:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.settings-error { color: var(--cp-danger); }
.instructions-entry { display: flex; width: 100%; min-height: 68px; align-items: center; justify-content: space-between; gap: 24px; padding: 12px 16px; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); background: transparent; color: var(--cp-text); font: inherit; text-align: left; cursor: pointer; }
.instructions-entry:hover { background: var(--cp-bg-hover); }
.instructions-entry:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.instructions-entry :deep(.app-icon) { color: var(--cp-text-secondary); }
.settings-list { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.settings-row { display: flex; min-width: 0; min-height: 64px; align-items: center; justify-content: space-between; gap: 24px; padding: 12px 16px; }
.settings-row + .settings-row { border-top: 1px solid var(--cp-border-light); }
.settings-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.settings-row__label { flex: none; color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 500; }
.settings-row__hint { color: var(--cp-text-secondary); font-size: var(--settings-text-small); line-height: 1.5; }
.personalization-section :deep(.el-button) { min-height: 28px; height: 28px; margin-left: 0; padding: 4px 10px; font-size: var(--settings-text-small); }
.personalization-section :deep(.el-button > span) { gap: 6px; }
.personalization-section :deep(.el-button.is-text) { color: var(--cp-text-secondary); }
.personalization-section :deep(.el-button.is-text:not(:disabled):hover) { color: var(--cp-text); background: var(--cp-bg-hover); }
.personalization-section :deep(.save-action) { min-width: 56px; }
.personalization-section :deep(.delete-memory-action) { flex: none; }
.personalization-section :deep(.app-icon) { flex: none; width: 14px; height: 14px; }
.storage-detail { min-width: 0; margin-top: 8px; color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.storage-detail summary { display: flex; width: fit-content; min-height: 28px; align-items: center; gap: 6px; border-radius: var(--cp-radius-sm); list-style: none; cursor: pointer; }
.storage-detail summary::-webkit-details-marker { display: none; }
.storage-detail summary:hover { color: var(--cp-text); }
.storage-detail[open] summary :deep(.app-icon:last-child) { transform: rotate(90deg); }
.storage-detail p { margin: 4px 0 8px; line-height: 1.6; overflow-wrap: anywhere; }
.storage-path { max-width: 100%; padding: 0; border: 0; border-radius: var(--cp-radius-sm); background: transparent; color: inherit; font: inherit; text-align: left; overflow-wrap: anywhere; cursor: pointer; user-select: text; }
.storage-path:hover, .storage-path:focus-visible { color: var(--cp-text); text-decoration: underline; text-underline-offset: 3px; }
.storage-path:focus-visible, .storage-detail summary:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.assistant-tone-picker button:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.identity-row { min-height: 64px; }
.identity-control { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 8px; }
.identity-control :deep(.el-input) { width: 192px; }
.identity-control :deep(.el-input__wrapper) { min-height: 30px; background: var(--cp-bg); font-size: var(--settings-text-base); }
.identity-value { display: flex; min-width: 0; align-items: baseline; gap: 8px; color: var(--cp-text); overflow-wrap: anywhere; }
.identity-value small { flex: none; color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.assistant-tone-picker { display: inline-flex; flex: none; gap: 2px; padding: 3px; border-radius: var(--cp-radius-md); background: var(--cp-bg-elevated); }
.assistant-tone-picker button { min-height: 28px; padding: 4px 14px; border: 1px solid transparent; border-radius: var(--cp-radius-sm); background: transparent; color: var(--cp-text-secondary); font: inherit; font-size: var(--settings-text-small); cursor: pointer; transition: color 120ms ease-out, background-color 120ms ease-out; }
.assistant-tone-picker button[aria-pressed='true'] { border-color: var(--cp-border-light); background: var(--cp-bg); color: var(--cp-text); font-weight: 500; }
.assistant-tone-picker button:not(:disabled):hover { color: var(--cp-text); }
.assistant-tone-picker button:disabled { cursor: default; opacity: .5; }
.tone-note { display: flex; align-items: flex-start; gap: 6px; margin: 10px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-small); line-height: 1.6; }
.tone-note :deep(.app-icon) { margin-top: 2px; }
@media (prefers-reduced-motion: reduce) { .assistant-tone-picker button { transition: none; } }
</style>
