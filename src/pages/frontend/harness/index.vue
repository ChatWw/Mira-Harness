<template>
  <main class="harness-page" :class="{ 'is-empty-session': !store.activeSession?.messages.length }">
    <section class="conversation">
      <div v-if="!store.activeSession?.messages.length" class="conversation__empty-drag-region" aria-hidden="true" />
      <header v-if="store.activeSession?.messages.length" class="conversation__header">
        <div class="conversation__identity">
          <span class="conversation__eyebrow"><AppIcon name="FolderOpened" />{{ selectedProject?.name || '最近对话' }}</span>
          <strong>{{ store.activeSession?.title || '新对话' }}</strong>
          <span class="conversation__directory">{{ selectedProject?.directory || '未关联项目' }}</span>
        </div>
        <div class="conversation__actions"><el-tag effect="plain" size="small">{{ permissionLabel }}</el-tag></div>
      </header>

      <HarnessMessageList ref="messageListRef" :messages="conversationMessages" :active-run="store.activeRun" :running="store.running" :rendering="store.rendering" :entering-message-id="enteringMessageId" @entrance-end="clearMessageEntrance" @edit-and-rerun="saveMessageEdit" @rerun="rerun" @open-file-change="openFileChange" @stop-subtask="stopSubtask" />

      <section v-if="permissionRequest" class="permission-request-card" aria-live="polite">
        <div class="permission-request-card__icon"><AppIcon name="WarningFilled" /></div>
        <div class="permission-request-card__content"><strong>{{ permissionRequest.title }}</strong><p>{{ permissionRequest.detail }}</p></div>
        <div class="permission-request-card__actions"><el-button :disabled="permissionResponding" @click="respondPermission(false)">拒绝</el-button><el-button type="primary" :loading="permissionResponding" @click="respondPermission(true)">允许</el-button></div>
      </section>
      <section v-if="store.lastRunError" class="run-error-card" role="alert"><AppIcon name="WarningFilled" /><div><strong>本次运行未完成</strong><p>{{ store.lastRunError.message }}</p></div><el-button size="small" :disabled="isComposerBusy" @click="rerun">重试</el-button></section>

      <HarnessComposer v-model:plan-mode="planMode" :draft-key="draftKey" :is-persisted-session="isPersistedSession" :providers="providers" :skills="skills" :mcp-servers="mcpServers" :memory-enabled="memoryEnabled" :permission-config="permissionConfig" :interaction-submitting="interactionSubmitting" :dispatch="pageFacade.dispatchComposerAction" />
    </section>

    <div v-if="!store.activeSession?.messages.length" class="empty-state" aria-hidden="false">
      <div class="empty-state__hero">
        <h1 class="empty-state__title">Mira</h1>
        <p class="empty-state__subtitle">{{ hasConfiguredModels ? '今天想做什么？从一个想法开始，我陪你把它落地。' : '先在右下角选择模型，或前往模型设置完成配置。' }}</p>
      </div>
      <div class="empty-state__cards">
        <button v-for="prompt in starterPrompts" :key="prompt.title" type="button" class="starter-card" :disabled="isComposerBusy" @click="setStarterPrompt(prompt.text)">
          <span class="starter-card__icon"><AppIcon :name="prompt.icon" /></span>
          <span class="starter-card__body">
            <strong>{{ prompt.title }}</strong>
            <small>{{ prompt.hint }}</small>
          </span>
        </button>
      </div>
    </div>

    <HarnessSessionPanel v-if="store.activeSession?.messages.length" :model-id="store.activeSession?.modelId" :permission-label="permissionLabel" :project-directory="selectedProject?.directory" :tool-calls="store.activeSession?.toolCalls || []" />

    <HarnessFileChangeDrawer v-model="fileChangeVisible" :change="activeFileChange" />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import { DEFAULT_PERMISSION_CONFIG, type HarnessFileChange, type HarnessSkill, type ModelProviderSummary, type PermissionConfig } from '@/config/harness'
import { useHarnessStore } from '@/stores/harness'
import HarnessMessageList from './components/HarnessMessageList.vue'
import HarnessComposer from './components/HarnessComposer.vue'
import HarnessSessionPanel from './components/HarnessSessionPanel.vue'
import HarnessFileChangeDrawer from './components/HarnessFileChangeDrawer.vue'
import { useHarnessPageFacade } from './useHarnessPageFacade'

const route = useRoute()
const store = useHarnessStore()
const messageListRef = ref<InstanceType<typeof HarnessMessageList>>()
const fileChangeVisible = ref(false)
const activeFileChange = ref<HarnessFileChange>()
const planMode = ref(false)
const interactionSubmitting = ref(false)
/** 对话中展示的消息（过滤掉内部上下文消息，如澄清问题回填的答案）。 */
const conversationMessages = computed(() => (store.activeSession?.messages || []).filter(message => !message.internal))
const providers = ref<ModelProviderSummary[]>([])
const skills = ref<HarnessSkill[]>([])
const mcpServers = ref<Array<{ id: string, name: string, command: string, args: string[], enabled: boolean }>>([])
const memoryEnabled = ref(false)
const permissionConfig = ref<PermissionConfig>({ ...DEFAULT_PERMISSION_CONFIG })
const permissionResponding = ref(false)

const pageFacade = useHarnessPageFacade({
  planMode,
  interactionSubmitting,
  permissionResponding,
  loadEnvironment,
  scrollLatestMessageToTop: messageId => { void messageListRef.value?.scrollLatestMessageToTop(messageId) },
})
const { draftKey, isPersistedSession, composerDraft, enteringMessageId, reload, respondPermission, rerun, editAndRerun: saveMessageEdit, stopSubtask, clearMessageEntrance } = pageFacade
const permissionRequest = computed(() => store.activeSession ? store.pendingPermissionRequests[store.activeSession.id] : undefined)
const projectId = computed(() => store.activeSession?.projectId || composerDraft.value.projectId)
const selectedProject = computed(() => store.projects.find(project => project.id === projectId.value))
const permissionLabel = computed(() => ({ default: '默认权限', 'auto-approve': '自动审核', full: '完全访问' }[store.activeSession?.permissionMode || composerDraft.value.permissionMode || permissionConfig.value.globalDefaultMode]))
const hasConfiguredModels = computed(() => providers.value.some(provider => provider.enabled && provider.hasApiKey && provider.models.length))
const starterPrompts: Array<{ icon: string, title: string, hint: string, text: string }> = [
  { icon: 'EditPen', title: '写一段文案', hint: '产品介绍、朋友圈、公告……', text: '帮我写一段产品介绍' },
  { icon: 'Document', title: '总结一篇文章', hint: '粘贴链接或长文本，我来提炼要点', text: '帮我总结这篇文章的要点：' },
  { icon: 'Cpu', title: '写一段代码', hint: 'SQL、脚本、组件，描述需求即可', text: '帮我写一段代码：' },
]
const isComposerBusy = computed(() => store.running || store.rendering)
async function loadEnvironment() {
  const api = getPlatformApi()
  const [,, configured, permissions, configuredSkills, configuredMcpServers, savedMemoryEnabled] = await Promise.all([store.refreshSessions(), store.refreshProjects(), api?.listModelProviders() || [], api?.getHarnessPermissionConfig(), api?.listHarnessSkills() || [], api?.listMcpServers() || [], api?.getHarnessMemoryEnabled() || false])
  providers.value = configured
  skills.value = configuredSkills
  mcpServers.value = configuredMcpServers
  memoryEnabled.value = savedMemoryEnabled
  if (permissions) permissionConfig.value = permissions
}

function openFileChange(change: HarnessFileChange) { activeFileChange.value = change; fileChangeVisible.value = true }
function setStarterPrompt(text: string) { void pageFacade.dispatchComposerAction({ type: "update-draft", patch: { text } }) }
watch(() => [route.params.id, route.query.draft], () => {
  messageListRef.value?.reset()
  void reload()
})
watch(() => store.activeSession?.id, () => {
  messageListRef.value?.reset()
  void messageListRef.value?.snapSessionToBottom()
})
watch(() => store.pendingMemoryConfirmations[store.activeSession?.id || ''], async request => {
  const sessionId = store.activeSession?.id
  if (!request || !sessionId) return
  try {
    await ElMessageBox.confirm(`以下脱敏后的内容将保存到长期记忆：\n\n${request.content}`, '确认保存敏感个人信息', { type: 'warning', confirmButtonText: '确认保存', cancelButtonText: '不保存', distinguishCancelAndClose: true })
    await store.respondMemoryConfirmation(sessionId, true)
  } catch {
    await store.respondMemoryConfirmation(sessionId, false)
  }
})
onMounted(() => { void reload() })
</script>

<style scoped lang="scss">
.harness-page { height: 100%; min-height: 0; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 248px; overflow: hidden; background: var(--cp-bg); position: relative; }
.harness-page.is-empty-session { display: flex; flex-direction: column; }
.harness-page.is-empty-session .conversation { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; height: 100%; }
.harness-page.is-empty-session .conversation__messages { flex: 1 1 auto; min-height: 0; }
.harness-page.is-empty-session .composer-shell { flex: 0 0 auto; }
.conversation { display: grid; min-width: 0; min-height: 0; overflow: hidden; grid-template-rows: auto minmax(0, 1fr) auto auto; position: relative; }
.conversation__messages { position: relative; min-height: 0; overflow: hidden; }
.conversation__header { display: flex; justify-content: space-between; align-items: center; gap: $spacing-md; min-height: 66px; padding: 10px calc(clamp(20px, 4vw, 56px) + var(--cp-window-controls-inset)) 10px calc(clamp(20px, 4vw, 56px) + var(--cp-mac-collapsed-safe-inset)); border-bottom: 1px solid color-mix(in srgb, var(--cp-border-light) 72%, transparent); -webkit-app-region: drag; }
.conversation__empty-drag-region { position: absolute; z-index: 3; top: 0; right: var(--cp-window-controls-inset); left: var(--cp-mac-collapsed-safe-inset); height: 48px; -webkit-app-region: drag; }
.permission-request-card { display: grid; width: min(calc(100% - 28px), 760px); box-sizing: border-box; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 12px; margin: 0 auto 10px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--cp-warning) 34%, var(--cp-border)); border-radius: $radius-md; background: color-mix(in srgb, var(--cp-warning) 8%, var(--cp-bg-elevated)); box-shadow: 0 8px 20px rgb(24 24 27 / 8%); }
.permission-request-card__icon { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; color: var(--cp-warning); background: color-mix(in srgb, var(--cp-warning) 14%, transparent); font-size: 15px; }.permission-request-card__content { min-width: 0; }.permission-request-card__content strong { display: block; color: var(--cp-text); font-size: 13px; font-weight: 600; }.permission-request-card__content p { max-height: 54px; margin: 3px 0 0; overflow: auto; color: var(--cp-text-secondary); font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }.permission-request-card__actions { display: flex; flex: 0 0 auto; gap: 8px; }.permission-request-card__actions .el-button { min-width: 68px; margin: 0; }
.conversation__identity { min-width: 0; }
.conversation__identity strong, .conversation__identity span { display: block; }
.conversation__identity strong { overflow: hidden; color: var(--cp-text); font-size: 14px; font-weight: 600; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.conversation__eyebrow { display: inline-flex !important; align-items: center; gap: 5px; margin-bottom: 2px; color: var(--cp-text-secondary); font-size: 11px; line-height: 1.4; }
.conversation__directory { max-width: 44vw; margin-top: 2px; overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.conversation__actions { display: flex; align-items: center; -webkit-app-region: no-drag; }
.empty-state { position: absolute; inset: 0; z-index: 1; display: flex; width: min(100%, 760px); margin-right: auto; margin-left: auto; align-items: center; justify-content: center; flex-direction: column; gap: 28px; padding: 24px; color: var(--cp-text-tertiary); text-align: center; pointer-events: none; }
.empty-state__hero { display: flex; flex-direction: column; align-items: center; gap: 12px; pointer-events: auto; }
.empty-state__title { margin: 0; color: var(--cp-text); font-size: 40px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.empty-state__subtitle { margin: 0; max-width: 420px; color: var(--cp-text-secondary); font-size: 14px; line-height: 1.7; }
.empty-state__cards { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; max-width: 680px; pointer-events: auto; }
.starter-card { display: flex; align-items: flex-start; gap: 10px; width: 208px; padding: 14px 14px 13px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 80%, transparent); border-radius: $radius-md; background: var(--cp-bg-elevated); text-align: left; cursor: pointer; transition: border-color $transition-fast, transform $transition-fast, box-shadow $transition-fast; }
.starter-card:hover:not(:disabled) { border-color: color-mix(in srgb, var(--cp-primary) 40%, var(--cp-border)); transform: translateY(-2px); box-shadow: 0 8px 20px rgb(24 24 27 / 6%); }
.starter-card:disabled { cursor: default; opacity: .6; }
.starter-card__icon { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border-radius: 8px; color: var(--cp-primary); background: color-mix(in srgb, var(--cp-primary) 12%, transparent); font-size: 16px; }
.starter-card__body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.starter-card__body strong { color: var(--cp-text); font-size: 13px; font-weight: 600; line-height: 1.4; }
.starter-card__body small { color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.45; }
@media (max-width: 1024px) { .harness-page { grid-template-columns: 1fr; } }
.run-error-card { display: flex; align-items: center; gap: 10px; margin: 0 auto 8px; width: min(100% - 32px, 760px); padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--cp-danger) 38%, var(--cp-border)); border-radius: $radius-sm; color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 6%, var(--cp-bg)); }.run-error-card > div { min-width: 0; flex: 1; }.run-error-card strong { color: var(--cp-text); font-size: 12px; }.run-error-card p { margin: 2px 0 0; color: var(--cp-text-secondary); font-size: 12px; }.run-error-card :deep(.el-button) { flex: 0 0 auto; }
</style>
