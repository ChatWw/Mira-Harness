<template>
  <SettingsPageShell title="指令与记忆">
    <p v-if="loadError" class="settings-error" role="alert">{{ loadError }} <el-button text @click="load">重试</el-button></p>
    <section class="personalization-section" aria-labelledby="memory-heading">
      <div class="section-heading"><div class="section-heading__title"><h2 id="memory-heading">记忆</h2><SettingsTooltip content="配置 Mira 如何收集、保留和整合你的全局偏好与长期上下文。" placement="right" :trigger="['hover', 'focus']" :show-after="200" :popper-style="{ maxWidth: '320px' }"><button type="button" class="section-info" aria-label="查看记忆说明"><AppIcon name="lucide:info" /></button></SettingsTooltip></div></div>
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy"><span class="settings-row__label">启用记忆</span><span class="settings-row__hint">自动提炼长期事实，并在每次对话时从本地记忆文件载入相关内容</span></div>
          <el-switch v-model="memoryEnabled" :disabled="loading || Boolean(loadError)" :loading="memorySaving" aria-label="启用记忆" @change="setMemoryEnabled" />
        </div>
      </div>
      <div class="memory-manager">
        <div class="memory-manager__header"><h3>全局记忆<span v-if="memoryEntries.length" class="memory-count">{{ memoryEntries.length }}</span></h3><el-button class="quiet-action" :disabled="loading || Boolean(loadError) || memoryManaging || memoryResetting" @click="addMemory"><AppIcon name="lucide:plus" />新增记忆</el-button></div>
        <p v-if="loading" class="memory-empty" role="status">正在读取记忆…</p>
        <div v-else-if="!memoryEntries.length" class="memory-empty"><AppIcon name="lucide:brain" /><span>还没有全局记忆</span></div>
        <div v-for="entry in memoryEntries" :key="entry.id" class="memory-entry">
          <div class="memory-entry__content"><p>{{ entry.content }}</p><small>{{ memorySourceLabel(entry.source) }} · {{ formatMemoryTime(entry.updatedAt) }}<template v-if="entry.sourceSessionId"> · 会话 {{ entry.sourceSessionId.slice(0, 8) }}</template></small></div>
          <div class="memory-entry__actions"><el-button text size="small" :disabled="memoryManaging || memoryResetting" @click="editMemory(entry)">编辑</el-button><el-button text size="small" class="delete-action" :disabled="memoryManaging || memoryResetting" @click="deleteMemory(entry)">删除</el-button></div>
        </div>
      </div>
      <div v-if="pendingMemory.length" class="memory-manager">
        <div class="memory-manager__header"><h3>待处理记忆<span class="memory-count">{{ pendingMemory.length }}</span></h3></div>
        <div v-for="candidate in pendingMemory" :key="candidate.id" class="memory-entry">
          <div class="memory-entry__content"><p>{{ candidate.redactedContent || '需要回到来源会话重新提炼' }}</p><small>{{ candidate.error || '保存未完成' }}</small></div>
          <div class="memory-entry__actions"><el-button text size="small" :disabled="memoryManaging || memoryResetting" @click="retryMemory(candidate.id)">重试</el-button><el-button text size="small" class="delete-action" :disabled="memoryManaging || memoryResetting" @click="discardMemory(candidate.id)">放弃</el-button></div>
        </div>
      </div>
      <div class="memory-footer">
        <details class="storage-detail"><summary><AppIcon name="lucide:info" />记忆与存储<AppIcon class="storage-detail__chevron" name="lucide:chevron-right" /></summary><p>关闭记忆不会删除本地数据，只会暂停对话中的读取和自动写入。</p><p v-if="memoryPath">全局记忆文件：<button type="button" class="storage-path" aria-label="在文件管理器中显示全局记忆文件" @click="revealSettingsFile('memory')">{{ memoryPath }}</button></p></details>
        <el-button class="reset-action" text :disabled="loading || Boolean(loadError) || memoryManaging || !memoryEntries.length" :loading="memoryResetting" @click="resetMemory">重置记忆</el-button>
      </div>
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
import { DEFAULT_ASSISTANT_TONE, normalizeAssistantTone, normalizeMiraIdentityName, type AssistantTone, type HarnessMemoryEntry, type MemoryCandidate, type MemorySource } from '@/config/harness'
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
const memoryEntries = ref<HarnessMemoryEntry[]>([])
const pendingMemory = ref<MemoryCandidate[]>([])
const memoryManaging = ref(false)
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
    const [enabled, savedMemoryPath, entries, pending] = await Promise.all([
      api.getHarnessMemoryEnabled(), api.getHarnessMemoryPath(),
      api.listHarnessMemory('global'), api.listPendingHarnessMemory(),
    ])
    memoryEnabled.value = enabled
    memoryPath.value = savedMemoryPath
    memoryEntries.value = entries
    pendingMemory.value = pending
  } catch (error) { loadError.value = error instanceof Error ? error.message : '读取失败，请重试' }
  finally { loading.value = false }
}

async function refreshMemory() {
  const api = getPlatformApi(); if (!api) return
  const [entries, pending] = await Promise.all([api.listHarnessMemory('global'), api.listPendingHarnessMemory()])
  memoryEntries.value = entries; pendingMemory.value = pending
}

function memorySourceLabel(source: MemorySource) {
  return ({ auto: '自动提炼', explicit: '用户请求', manual: '手动新增', legacy: '已有记忆' } as Record<MemorySource, string>)[source]
}

function formatMemoryTime(value: number) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value) }

async function revealSettingsFile(kind: 'memory') {
  try {
    const api = getPlatformApi()
    if (!api) throw new Error('文件位置仅在桌面端中可用')
    await api.revealHarnessSettingsFile(kind)
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '打开文件位置失败') }
}

async function addMemory() {
  const api = getPlatformApi(); if (!api || memoryManaging.value) return
  try {
    const { value } = await ElMessageBox.prompt('输入长期有效的偏好或事实。高风险秘密不会保存。', '新增全局记忆', { inputPattern: /\S+/, inputErrorMessage: '记忆内容不能为空', confirmButtonText: '保存', cancelButtonText: '取消' })
    memoryManaging.value = true; await api.rememberHarnessMemory(value); await refreshMemory(); ElMessage.success('已保存记忆')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '保存记忆失败') } finally { memoryManaging.value = false }
}

async function editMemory(entry: HarnessMemoryEntry) {
  const api = getPlatformApi(); if (!api || memoryManaging.value) return
  try {
    const { value } = await ElMessageBox.prompt('编辑后的内容会立即用于后续对话。', '编辑全局记忆', { inputValue: entry.content, inputPattern: /\S+/, inputErrorMessage: '记忆内容不能为空', confirmButtonText: '保存', cancelButtonText: '取消' })
    memoryManaging.value = true; await api.updateHarnessMemory('global', entry.id, value); await refreshMemory(); ElMessage.success('记忆已更新')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '更新记忆失败') } finally { memoryManaging.value = false }
}

async function deleteMemory(entry: HarnessMemoryEntry) {
  const api = getPlatformApi(); if (!api || memoryManaging.value) return
  try { await ElMessageBox.confirm('删除后不会再注入未来对话，且无法恢复。', '删除记忆', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }) } catch { return }
  memoryManaging.value = true
  try { await api.deleteHarnessMemory('global', entry.id); await refreshMemory(); ElMessage.success('记忆已删除') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '删除记忆失败') } finally { memoryManaging.value = false }
}

async function retryMemory(id: string) {
  const api = getPlatformApi(); if (!api || memoryManaging.value) return
  memoryManaging.value = true
  try { await api.retryHarnessMemory(id); await refreshMemory(); ElMessage.success('记忆已保存') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '重试保存失败') } finally { memoryManaging.value = false }
}

async function discardMemory(id: string) {
  const api = getPlatformApi(); if (!api || memoryManaging.value) return
  memoryManaging.value = true
  try { await api.discardHarnessMemory(id); await refreshMemory() } catch (error) { ElMessage.error(error instanceof Error ? error.message : '放弃记忆失败') } finally { memoryManaging.value = false }
}

async function setMemoryEnabled(value: boolean) {
  const api = getPlatformApi()
  if (!api || memorySaving.value) return
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

async function resetMemory() {
  const api = getPlatformApi()
  if (!api || memoryResetting.value) return
  try {
    await ElMessageBox.confirm('将清空全局记忆文件中的所有内容，且无法恢复。', '重置记忆', { type: 'warning', confirmButtonText: '重置', cancelButtonText: '取消' })
  } catch {
    return
  }
  memoryResetting.value = true
  try {
    await api.resetHarnessMemory()
    await refreshMemory()
    ElMessage.success('记忆已重置')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '记忆重置失败')
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
  if (preferenceSaving.value || memorySaving.value || memoryResetting.value || memoryManaging.value) return false
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
.personalization-section :deep(.quiet-action) { background: transparent; border-color: var(--cp-border); color: var(--cp-text); }
.personalization-section :deep(.quiet-action:not(:disabled):hover) { background: var(--cp-bg-hover); border-color: var(--cp-border); }
.personalization-section :deep(.delete-action:not(:disabled):hover), .personalization-section :deep(.reset-action:not(:disabled):hover) { color: var(--cp-danger); }
.personalization-section :deep(.app-icon) { flex: none; width: 14px; height: 14px; }
.storage-detail { min-width: 0; margin-top: 8px; color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.storage-detail summary { display: flex; width: fit-content; min-height: 28px; align-items: center; gap: 6px; border-radius: var(--cp-radius-sm); list-style: none; cursor: pointer; }
.storage-detail summary::-webkit-details-marker { display: none; }
.storage-detail summary:hover { color: var(--cp-text); }
.storage-detail summary:focus-visible, .assistant-tone-picker button:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.storage-detail__chevron { transition: transform 150ms ease-out; }
.storage-detail[open] .storage-detail__chevron { transform: rotate(90deg); }
.storage-detail p { margin: 4px 0 8px; line-height: 1.6; overflow-wrap: anywhere; user-select: text; }
.storage-path { max-width: 100%; padding: 0; border: 0; border-radius: var(--cp-radius-sm); background: transparent; color: inherit; font: inherit; text-align: left; overflow-wrap: anywhere; cursor: pointer; user-select: text; }
.storage-path:hover, .storage-path:focus-visible { color: var(--cp-text); text-decoration: underline; text-underline-offset: 3px; }
.storage-path:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.memory-manager { margin-top: 16px; }
.memory-manager__header { display: flex; min-height: 36px; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--cp-border-light); }
.memory-manager__header h3 { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 500; }
.memory-count { color: var(--cp-text-secondary); font-size: var(--settings-text-small); font-weight: 400; font-variant-numeric: tabular-nums; }
.memory-empty { display: flex; min-height: 76px; align-items: center; gap: 10px; margin: 0; padding: 16px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.memory-empty :deep(.app-icon) { width: 18px; height: 18px; }
.memory-entry { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--cp-border-light); }
.memory-entry:last-child { border-bottom: 0; }
.memory-entry__content { min-width: 0; flex: 1; }
.memory-entry__content p { margin: 0; color: var(--cp-text); font-size: var(--settings-text-base); line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
.memory-entry__content small { display: block; margin-top: 4px; color: var(--cp-text-secondary); font-size: var(--settings-text-small); line-height: 1.5; overflow-wrap: anywhere; }
.memory-entry__actions { display: flex; flex: none; gap: 2px; }
.memory-footer { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-top: 8px; border-top: 1px solid var(--cp-border-light); }
.memory-footer .storage-detail { flex: 1; margin-top: 0; }
.memory-footer :deep(.reset-action) { flex: none; }
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
@media (prefers-reduced-motion: reduce) { .storage-detail__chevron, .assistant-tone-picker button { transition: none; } }
</style>
