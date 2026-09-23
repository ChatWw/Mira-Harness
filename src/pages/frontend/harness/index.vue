<template>
    <main class="harness-page" :class="{ 'is-empty-session': !store.activeSession?.messages.length }" @pointerdown="markActiveSessionRead">
    <section class="conversation">
      <div v-if="!store.activeSession?.messages.length" class="conversation__empty-drag-region" aria-hidden="true" />
      <header v-if="store.activeSession?.messages.length" class="conversation__header">
        <div class="conversation__identity">
          <el-popover v-if="selectedProject" v-model:visible="projectSummaryVisible" trigger="click" placement="bottom-start" :width="320" :show-arrow="false" popper-class="conversation-project-popper">
            <template #reference>
              <span class="conversation__project-trigger"><button type="button" class="conversation__project" :class="{ 'is-open': projectSummaryVisible }" :data-tooltip="selectedProject.name" :aria-label="`查看项目 ${selectedProject.name}`" :aria-expanded="projectSummaryVisible" @click.stop="toggleProjectSummary"><AppIcon name="FolderOpened" /></button></span>
            </template>
            <section class="conversation-project-card" :aria-label="`${selectedProject.name} 项目概览`">
              <div class="conversation-project-card__title"><AppIcon name="FolderOpened" /><strong>{{ selectedProject.name }}</strong></div>
              <div class="conversation-project-card__meta"><AppIcon name="ChatDotRound" /><span>{{ selectedProject.sessionCount }} 个对话</span></div>
              <div v-if="selectedProject.isGitRepository && selectedProject.gitBranch" class="conversation-project-card__meta"><AppIcon name="tabler:git-branch" /><span>{{ selectedProject.gitBranch }}</span></div>
              <div class="conversation-project-card__meta conversation-project-card__directory"><AppIcon name="FolderOpened" /><span :title="selectedProject.directory">{{ selectedProject.directory }}</span></div>
              <button type="button" class="conversation-project-card__edit" @click="openProjectSettings"><AppIcon name="tabler:settings" /><span>编辑项目</span></button>
            </section>
          </el-popover>
          <input v-if="titleEditing" ref="titleInputRef" v-model="titleDraft" class="conversation__title-input" :disabled="titleSaving" aria-label="会话名称" @blur="saveSessionTitle" @keydown.enter.prevent="saveSessionTitle" @keydown.esc.prevent="cancelSessionTitleEdit" />
          <button v-else type="button" class="conversation__title-button" :title="store.activeSession?.title || '新对话'" @click="beginSessionTitleEdit">{{ store.activeSession?.title || '新对话' }}</button>
        </div>
        <div class="conversation__header-drag" aria-hidden="true" />
        <div class="conversation__actions">
          <!-- <el-tag effect="plain" size="small">{{ permissionLabel }}</el-tag> -->
          <el-tooltip :content="workPanelVisible ? '关闭工作面板' : '打开工作面板'" placement="bottom"><button type="button" class="conversation__action-button" :aria-label="workPanelVisible ? '关闭工作面板' : '打开工作面板'" :aria-expanded="workPanelVisible" @click="toggleWorkPanel"><AppIcon :name="workPanelVisible ? 'tabler:layout-sidebar-right-filled' : 'tabler:layout-sidebar-right'" /></button></el-tooltip>
        </div>
      </header>

      <HarnessMessageList ref="messageListRef" :messages="conversationMessages" :active-run="store.activeRun" :running="store.running" :rendering="store.rendering" :entering-message-id="enteringMessageId" @entrance-end="clearMessageEntrance" @edit-and-rerun="saveMessageEdit" @rerun="rerun" @open-file-change="openFileChange" @open-work-panel="openWorkPanel" @continue="focusComposer" @stop-subtask="stopSubtask" />

      <section v-if="permissionRequest" class="permission-request-card" aria-live="polite">
        <div class="permission-request-card__icon"><AppIcon name="WarningFilled" /></div>
        <div class="permission-request-card__content"><strong>{{ permissionRequest.title }}</strong><p>{{ permissionRequest.detail }}</p></div>
        <div class="permission-request-card__actions"><el-button :disabled="permissionResponding" @click="respondPermission(false)">拒绝</el-button><el-button type="primary" :loading="permissionResponding" @click="respondPermission(true)">允许</el-button></div>
      </section>
      <section v-if="store.lastRunError?.sessionId === store.activeSession?.id && store.lastRunError && conversationMessages[conversationMessages.length - 1]?.run?.status !== 'failed'" class="run-error-card" role="alert"><AppIcon name="WarningFilled" /><div><strong>本次运行未完成</strong><p>{{ store.lastRunError.message }}</p></div><el-button size="small" :disabled="isComposerBusy" @click="rerun">重试</el-button></section>

      <HarnessComposer ref="composerRef" v-model:plan-mode="planMode" :draft-key="draftKey" :is-persisted-session="isPersistedSession" :providers="providers" :skills="skills" :mcp-servers="mcpServers" :memory-enabled="memoryEnabled" :permission-config="permissionConfig" :interaction-submitting="interactionSubmitting" :dispatch="pageFacade.dispatchComposerAction" />
    </section>

    <div v-if="!store.activeSession?.messages.length" class="empty-state" aria-hidden="false">
      <div class="empty-state__hero">
        <h1 class="empty-state__title">Mira</h1>
        <p class="empty-state__subtitle">{{ hasConfiguredModels ? '今天想做什么？从一个想法开始，我陪你把它落地。' : '先在右下角选择模型，或前往模型设置完成配置。' }}</p>
      </div>
      <div class="empty-state__cards">
        <button v-for="prompt in starterPrompts" :key="prompt.title" type="button" :class="['starter-card', `starter-card--${prompt.tone}`]" :disabled="isComposerBusy" @click="setStarterPrompt(prompt.text)">
          <span class="starter-card__icon"><AppIcon :name="prompt.icon" /></span>
          <span class="starter-card__body">
            <strong>{{ prompt.title }}</strong>
            <small>{{ prompt.hint }}</small>
          </span>
        </button>
      </div>
    </div>

    <aside v-if="store.activeSession?.messages.length" class="work-panel-host" :class="{ 'is-open': workPanelVisible }" aria-label="工作面板容器">
      <Transition name="work-panel">
        <HarnessSessionPanel v-if="workPanelVisible" :model-id="store.activeSession?.modelId" :permission-label="permissionLabel" :project-directory="selectedProject?.directory" :tool-calls="store.activeSession?.toolCalls || []" :active-run="workPanelRun" :running="store.running" :file-changes="latestFileChanges" @close="closeWorkPanel" @open-file-change="openFileChange" />
      </Transition>
    </aside>

    <HarnessFileChangeDrawer v-model="fileChangeVisible" :change="activeFileChange" />
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import { DEFAULT_PERMISSION_CONFIG, isModelProviderAvailable, OPEN_HARNESS_PROJECT_DIALOG_EVENT, type HarnessFileChange, type HarnessSkill, type ModelProviderSummary, type PermissionConfig } from '@/config/harness'
import { useHarnessStore } from '@/stores/harness'
import HarnessMessageList from './components/HarnessMessageList.vue'
import HarnessComposer from './components/HarnessComposer.vue'
import HarnessSessionPanel from './components/HarnessSessionPanel.vue'
import HarnessFileChangeDrawer from './components/HarnessFileChangeDrawer.vue'
import { useHarnessPageFacade } from './useHarnessPageFacade'

const route = useRoute()
const store = useHarnessStore()
const messageListRef = ref<InstanceType<typeof HarnessMessageList>>()
const composerRef = ref<InstanceType<typeof HarnessComposer>>()
const fileChangeVisible = ref(false)
const activeFileChange = ref<HarnessFileChange>()
const planMode = ref(false)
const interactionSubmitting = ref(false)
const workPanelVisible = ref(false)
const projectSummaryVisible = ref(false)
const titleEditing = ref(false)
const titleDraft = ref('')
const titleEditingSessionId = ref<string>()
const titleSaving = ref(false)
const titleInputRef = ref<HTMLInputElement>()
/** 对话中展示的消息（过滤掉内部上下文消息，如澄清问题回填的答案）。 */
const conversationMessages = computed(() => (store.activeSession?.messages || []).filter(message => !message.internal))
const latestCompletedMessage = computed(() => [...conversationMessages.value].reverse().find(message => message.run))
const latestFileChanges = computed(() => latestCompletedMessage.value?.fileChanges || [])
const workPanelRun = computed(() => store.activeRun || latestCompletedMessage.value?.run)
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
  permissionConfig,
  loadEnvironment,
  scrollLatestMessageToTop: messageId => { void messageListRef.value?.scrollLatestMessageToTop(messageId) },
})
const { draftKey, isPersistedSession, composerDraft, enteringMessageId, reload, respondPermission, rerun, editAndRerun: saveMessageEdit, stopSubtask, clearMessageEntrance } = pageFacade
const permissionRequest = computed(() => store.activeSession ? store.pendingPermissionRequests[store.activeSession.id] : undefined)
const projectId = computed(() => store.activeSession?.projectId || composerDraft.value.projectId)
const selectedProject = computed(() => store.projects.find(project => project.id === projectId.value))
const permissionLabel = computed(() => ({ default: '逐次确认', 'auto-approve': '项目内自动批准', full: '完全访问' }[store.activeSession?.permissionMode || composerDraft.value.permissionMode || permissionConfig.value.globalDefaultMode]))
const hasConfiguredModels = computed(() => providers.value.some(isModelProviderAvailable))
const starterPrompts: Array<{ icon: string, title: string, hint: string, text: string, tone: 'info' | 'purple' | 'warning' }> = [
  { icon: 'EditPen', title: '写一段文案', hint: '产品介绍、朋友圈、公告……', text: '帮我写一段产品介绍', tone: 'info' },
  { icon: 'Document', title: '总结一篇文章', hint: '粘贴链接或长文本，我来提炼要点', text: '帮我总结这篇文章的要点：', tone: 'purple' },
  { icon: 'Cpu', title: '写一段代码', hint: 'SQL、脚本、组件，描述需求即可', text: '帮我写一段代码：', tone: 'warning' },
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
function openWorkPanel() { workPanelVisible.value = true }
function closeWorkPanel() { workPanelVisible.value = false }
function toggleWorkPanel() { if (workPanelVisible.value) closeWorkPanel(); else openWorkPanel() }
function toggleProjectSummary() { projectSummaryVisible.value = !projectSummaryVisible.value }
async function beginSessionTitleEdit() {
  const session = store.activeSession
  if (!session) return
  titleEditingSessionId.value = session.id
  titleDraft.value = session.title
  titleEditing.value = true
  await nextTick()
  titleInputRef.value?.select()
}
function cancelSessionTitleEdit() { titleEditing.value = false; titleDraft.value = ''; titleEditingSessionId.value = undefined }
async function saveSessionTitle() {
  const sessionId = titleEditingSessionId.value
  const title = titleDraft.value.trim()
  if (titleSaving.value || !sessionId) return
  if (!title) { ElMessage.warning('会话名称不能为空'); titleInputRef.value?.focus(); return }
  if (store.activeSession?.id === sessionId && store.activeSession.title === title) { cancelSessionTitleEdit(); return }
  titleSaving.value = true
  try {
    await store.renameSession(sessionId, title)
    cancelSessionTitleEdit()
    ElMessage.success('会话已重命名')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重命名会话失败')
    titleInputRef.value?.focus()
  } finally { titleSaving.value = false }
}
function openProjectSettings() {
  const project = selectedProject.value
  if (!project) return
  projectSummaryVisible.value = false
  window.dispatchEvent(new CustomEvent(OPEN_HARNESS_PROJECT_DIALOG_EVENT, { detail: { project, onUpdated: () => { void store.refreshProjects() } } }))
}
function focusComposer() { setStarterPrompt('请接着上次中止的位置继续回答。'); composerRef.value?.focus() }
function setStarterPrompt(text: string) { void pageFacade.dispatchComposerAction({ type: "update-draft", patch: { text } }) }
function markActiveSessionRead() {
  const id = store.activeSession?.id
  if (id) void store.markSessionRead(id).catch(() => undefined)
}
watch(() => [route.params.id, route.query.draft], () => {
  messageListRef.value?.reset()
  void reload()
})
watch(() => store.activeSession?.id, () => {
  projectSummaryVisible.value = false
  cancelSessionTitleEdit()
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
.harness-page { height: 100%; min-height: 0; min-width: 0; display: flex; overflow: hidden; background: var(--cp-bg); position: relative; }
.harness-page.is-empty-session { display: flex; flex-direction: column; }
.harness-page.is-empty-session .conversation { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; height: 100%; }
.harness-page.is-empty-session .conversation { background: radial-gradient(ellipse 36% 25% at 50% 49%, rgb(226 218 245 / 42%) 0%, transparent 100%); }
[data-theme='dark'] .harness-page.is-empty-session .conversation { background: radial-gradient(ellipse 36% 25% at 50% 49%, rgb(129 115 167 / 26%) 0%, transparent 100%); }
.harness-page.is-empty-session .conversation__messages { flex: 1 1 auto; min-height: 0; }
.harness-page.is-empty-session .composer-shell { flex: 0 0 auto; }
.conversation { display: grid; min-width: 0; min-height: 0; flex: 1 1 0; overflow: hidden; grid-template-rows: auto minmax(0, 1fr) auto auto; position: relative; }
.conversation__messages { position: relative; min-height: 0; overflow: hidden; }
.conversation__header { position: relative; z-index: 101; display: flex; min-height: 52px; align-items: center; gap: $spacing-md; padding: 0 4px 0 8px; border-bottom: 1px solid color-mix(in srgb, var(--cp-border-light) 42%, transparent); -webkit-app-region: no-drag; }
.conversation__empty-drag-region { position: absolute; z-index: 3; top: 0; right: var(--cp-window-controls-inset); left: var(--cp-mac-collapsed-safe-inset); height: 48px; -webkit-app-region: drag; }
.permission-request-card { display: grid; width: min(calc(100% - 28px), 760px); box-sizing: border-box; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 12px; margin: 0 auto 10px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--cp-warning) 34%, var(--cp-border)); border-radius: $radius-md; background: color-mix(in srgb, var(--cp-warning) 8%, var(--cp-bg-elevated)); box-shadow: 0 8px 20px rgb(24 24 27 / 8%); }
.permission-request-card__icon { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; color: var(--cp-warning); background: color-mix(in srgb, var(--cp-warning) 14%, transparent); font-size: 15px; }.permission-request-card__content { min-width: 0; }.permission-request-card__content strong { display: block; color: var(--cp-text); font-size: 13px; font-weight: 600; }.permission-request-card__content p { max-height: 54px; margin: 3px 0 0; overflow: auto; color: var(--cp-text-secondary); font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }.permission-request-card__actions { display: flex; flex: 0 0 auto; gap: 8px; }.permission-request-card__actions .el-button { min-width: 68px; margin: 0; }
.conversation__identity { display: flex; min-width: 0; flex: 0 1 auto; align-items: center; gap: 8px; }.conversation__title-button { max-width: min(360px, 40vw); overflow: hidden; padding: 4px 6px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; font-size: 14px; font-weight: 600; line-height: 1.4; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: text; }.conversation__title-button:hover, .conversation__title-button:focus-visible { background: var(--cp-bg-hover); outline: none; }.conversation__title-input { width: min(180px, 40vw); height: 28px; box-sizing: border-box; padding: 0 6px; border: 1px solid color-mix(in srgb, var(--cp-primary) 48%, var(--cp-border)); border-radius: $radius-sm; color: var(--cp-text); background: var(--cp-bg-elevated); font: inherit; font-size: 14px; font-weight: 600; line-height: 1.4; outline: none; }.conversation__title-input:focus { border-color: var(--cp-primary); box-shadow: 0 0 0 2px var(--cp-primary-lighter); }.conversation__project-trigger { display: inline-flex; flex: 0 0 auto; }.conversation__project { position: relative; display: inline-grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; padding: 0; border: 0; border-radius: $radius-sm; color: var(--cp-text-secondary); background: transparent; cursor: pointer; }.conversation__project::after { position: absolute; z-index: 2; top: calc(100% + 8px); left: 0; padding: 6px 10px; border-radius: 8px; color: var(--cp-bg); background: var(--cp-text); box-shadow: 0 8px 20px rgb(0 0 0 / 16%); content: attr(data-tooltip); font-size: 12px; line-height: 1.35; opacity: 0; pointer-events: none; transform: translateY(-2px); transition: opacity $transition-fast, transform $transition-fast; white-space: nowrap; }.conversation__project:hover, .conversation__project:focus-visible { color: var(--cp-text); background: var(--cp-bg-hover); outline: none; }.conversation__project:hover:not(.is-open)::after, .conversation__project:focus-visible:not(.is-open)::after { opacity: 1; transform: translateY(0); }.conversation__project .app-icon { font-size: 16px; }.conversation__header-drag { min-width: 24px; align-self: stretch; flex: 1 1 auto; -webkit-app-region: drag; }.conversation__actions { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; }.conversation__actions :deep(.el-tag) { max-width: 148px; overflow: hidden; color: var(--cp-text-secondary); text-overflow: ellipsis; white-space: nowrap; }.conversation__action-button { display: grid; width: 30px; height: 30px; place-items: center; padding: 0; border: 0; border-radius: $radius-sm; color: var(--cp-text-secondary); background: transparent; cursor: pointer; }.conversation__action-button:hover, .conversation__action-button:focus-visible { color: var(--cp-text); background: var(--cp-bg-hover); outline: none; }
.conversation-project-card { display: grid; gap: 8px; padding: 12px; }.conversation-project-card__title, .conversation-project-card__meta, .conversation-project-card__edit { display: flex; min-width: 0; align-items: center; gap: 9px; }.conversation-project-card__title { min-height: 28px; color: var(--cp-text); font-size: 14px; }.conversation-project-card__title .app-icon { flex: 0 0 auto; color: var(--cp-text-secondary); font-size: 18px; }.conversation-project-card__title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.conversation-project-card__meta { color: var(--cp-text-secondary); font-size: 12px; line-height: 1.45; }.conversation-project-card__meta .app-icon { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 16px; }.conversation-project-card__directory { padding-bottom: 10px; border-bottom: 1px solid var(--cp-border-light); }.conversation-project-card__directory span { min-width: 0; overflow-wrap: anywhere; }.conversation-project-card__edit { min-height: 32px; padding: 0 6px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }.conversation-project-card__edit:hover, .conversation-project-card__edit:focus-visible { background: var(--cp-bg-hover); outline: none; }.conversation-project-card__edit .app-icon { color: var(--cp-text-secondary); font-size: 16px; }
:global(.conversation-project-popper.el-popover.el-popper) { max-width: calc(100vw - 32px); padding: 0; overflow: hidden; border: 1px solid var(--cp-border); border-radius: 12px; background: var(--cp-bg-overlay); box-shadow: 0 14px 30px rgb(0 0 0 / 12%); }
.empty-state { position: absolute; inset: 0; z-index: 1; display: flex; width: min(100%, 760px); margin-right: auto; margin-left: auto; align-items: center; justify-content: center; flex-direction: column; gap: 28px; padding: 24px; color: var(--cp-text-tertiary); text-align: center; pointer-events: none; }
.empty-state__hero { display: flex; flex-direction: column; align-items: center; gap: 12px; pointer-events: auto; }
.empty-state__title { margin: 0; color: var(--cp-text); font-size: 40px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.empty-state__subtitle { margin: 0; max-width: 420px; color: var(--cp-text-secondary); font-size: 14px; line-height: 1.7; }
.empty-state__cards { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; max-width: 672px; pointer-events: auto; }
.starter-card { --starter-icon-bg: var(--cp-stat-icon-info-bg); --starter-icon-color: var(--cp-stat-icon-info-color); display: flex; width: 200px; min-height: 132px; flex-direction: column; align-items: flex-start; padding: 15px 15px 14px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 80%, transparent); border-radius: $radius-md; background: var(--cp-bg-elevated); text-align: left; cursor: pointer; transition: border-color $transition-fast, transform $transition-fast, box-shadow $transition-fast; }
.starter-card:hover:not(:disabled) { border-color: color-mix(in srgb, var(--cp-primary) 40%, var(--cp-border)); transform: translateY(-2px); box-shadow: 0 8px 20px rgb(24 24 27 / 6%); }
.starter-card:disabled { cursor: default; opacity: .6; }
.starter-card--purple { --starter-icon-bg: var(--cp-stat-icon-purple-bg); --starter-icon-color: var(--cp-stat-icon-purple-color); }.starter-card--warning { --starter-icon-bg: var(--cp-stat-icon-warning-bg); --starter-icon-color: var(--cp-stat-icon-warning-color); }
.starter-card__icon { display: grid; width: 36px; height: 36px; flex: 0 0 auto; margin-bottom: 11px; place-items: center; border-radius: 10px; color: var(--starter-icon-color); background: var(--starter-icon-bg); font-size: 18px; }
.starter-card__body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }.starter-card__body strong { color: var(--cp-text); font-size: 14px; font-weight: 600; line-height: 1.45; }.starter-card__body small { color: var(--cp-text-secondary); font-size: 12px; line-height: 1.5; }
.work-panel-host { width: 0; height: 100%; flex: 0 0 0; overflow: hidden; transition: width var(--cp-animation-duration) cubic-bezier(0.16, 1, 0.3, 1), flex-basis var(--cp-animation-duration) cubic-bezier(0.16, 1, 0.3, 1); }.work-panel-host.is-open { width: 320px; flex-basis: 320px; }.work-panel-host :deep(.session-panel) { width: 320px; }.work-panel-enter-active, .work-panel-leave-active { transition: opacity 180ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1); }.work-panel-enter-from, .work-panel-leave-to { opacity: 0; transform: translateX(100%); }
.run-error-card { display: flex; align-items: center; gap: 10px; margin: 0 auto 8px; width: min(100% - 32px, 760px); padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--cp-danger) 38%, var(--cp-border)); border-radius: $radius-sm; color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 6%, var(--cp-bg)); }.run-error-card > div { min-width: 0; flex: 1; }.run-error-card strong { color: var(--cp-text); font-size: 12px; }.run-error-card p { margin: 2px 0 0; color: var(--cp-text-secondary); font-size: 12px; }.run-error-card :deep(.el-button) { flex: 0 0 auto; }
</style>
