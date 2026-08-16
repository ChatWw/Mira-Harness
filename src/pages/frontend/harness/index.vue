<template>
  <main class="harness-page">
    <section class="conversation">
      <header class="conversation__header">
        <div class="conversation__identity">
          <span class="conversation__eyebrow"><AppIcon name="FolderOpened" />{{ selectedProject?.name || '最近对话' }}</span>
          <strong>{{ store.activeSession?.title || '新对话' }}</strong>
          <span class="conversation__directory">{{ selectedProject?.directory || '未关联项目' }}</span>
        </div>
        <div class="conversation__actions"><el-tag effect="plain" size="small">{{ permissionLabel }}</el-tag></div>
      </header>

      <div ref="streamRef" class="message-stream">
        <div v-if="!store.activeSession?.messages.length" class="empty-state">
          <div class="empty-state__icon"><AppIcon name="ChatDotRound" /></div>
          <strong>从这里开始</strong>
          <span>描述你想完成的工作</span>
        </div>
        <article v-for="message in store.activeSession?.messages" :key="message.id" class="message" :class="message.role">
          <span class="message__role"><AppIcon :name="message.role === 'user' ? 'User' : 'ChatDotRound'" />{{ message.role === 'user' ? '你' : 'Mira' }}</span>
          <p>{{ message.content }}</p>
          <div v-if="message.attachments?.length" class="message__attachments">
            <span v-for="file in message.attachments" :key="file.path" class="file-chip"><AppIcon name="Document" />{{ file.name }}</span>
          </div>
        </article>
      </div>

      <footer class="composer-shell">
        <div class="composer">
          <div class="composer__context">
            <el-popover v-if="!isPersistedSession" v-model:visible="projectPickerVisible" trigger="click" placement="top-start" :width="310" popper-class="harness-selector-popper">
              <template #reference>
                <button type="button" class="composer-chip" :class="{ 'is-selected': selectedProject }" :aria-label="selectedProject ? `已选择项目：${selectedProject.name}` : '选择项目'">
                  <AppIcon name="FolderOpened" /><span>{{ selectedProject?.name || '选择项目' }}</span><AppIcon v-if="selectedProject" name="Close" class="composer-chip__remove" @click.stop="selectProject()" />
                </button>
              </template>
              <div class="selector-panel">
                <el-input v-model="projectQuery" size="small" clearable placeholder="搜索项目"><template #prefix><AppIcon name="Search" /></template></el-input>
                <div class="selector-panel__list">
                  <button v-for="project in filteredProjects" :key="project.id" type="button" class="selector-option" :class="{ active: project.id === selectedProject?.id }" @click="selectProject(project.id)"><AppIcon :name="project.icon" /><span>{{ project.name }}</span><AppIcon v-if="project.id === selectedProject?.id" name="Check" /></button>
                  <p v-if="!filteredProjects.length" class="selector-empty">没有匹配的项目</p>
                </div>
                <button type="button" class="selector-option selector-option--new" :disabled="creatingProject" @click="createProjectFromPicker"><AppIcon :name="creatingProject ? 'Loading' : 'Plus'" :class="{ 'is-loading': creatingProject }" /><span>新建项目</span></button>
              </div>
            </el-popover>
            <span v-else-if="selectedProject" class="composer-chip is-selected"><AppIcon name="FolderOpened" />{{ selectedProject.name }}</span>

            <el-popover v-model:visible="filePickerVisible" trigger="click" placement="top-start" :width="350" popper-class="harness-selector-popper" :disabled="!selectedProject">
              <template #reference>
                <span class="file-picker-reference"><el-tooltip :disabled="Boolean(selectedProject)" content="请先选择项目" placement="top"><button type="button" class="composer-chip" :disabled="!selectedProject"><AppIcon name="Paperclip" /><span>引用文件</span></button></el-tooltip></span>
              </template>
              <div class="selector-panel">
                <el-input v-model="fileQuery" size="small" clearable placeholder="搜索项目文件"><template #prefix><AppIcon name="Search" /></template></el-input>
                <div class="selector-panel__list selector-panel__list--files" v-loading="filesLoading">
                  <button v-for="file in availableFiles" :key="file.path" type="button" class="selector-option" :class="{ active: isAttached(file.path) }" @click="toggleAttachment(file)"><AppIcon name="Document" /><span :title="file.path">{{ file.path }}</span><AppIcon v-if="isAttached(file.path)" name="Check" /></button>
                  <p v-if="!filesLoading && !availableFiles.length" class="selector-empty">没有可引用的文本文件</p>
                </div>
              </div>
            </el-popover>

            <span v-for="file in composerDraft.attachments" :key="file.path" class="composer-chip is-selected"><AppIcon name="Document" /><span>{{ file.name }}</span><button type="button" class="composer-chip__remove" :aria-label="`移除 ${file.name}`" @click="removeAttachment(file.path)"><AppIcon name="Close" /></button></span>
          </div>
          <el-input :model-value="composerDraft.text" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" resize="none" placeholder="输入任务..." :disabled="store.running" @update:model-value="setDraftText" @keydown.meta.enter.prevent="send" @keydown.ctrl.enter.prevent="send" />
          <div class="composer__actions">
            <span>⌘ Enter 发送</span>
            <el-select :model-value="composerDraft.modelSelection?.providerId && composerDraft.modelSelection.modelId ? `${composerDraft.modelSelection.providerId}:${composerDraft.modelSelection.modelId}` : ''" size="small" class="composer-model" placeholder="选择模型" @update:model-value="setModelSelection">
              <el-option v-for="option in modelOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
            <el-tooltip v-if="store.running" content="停止生成" placement="top"><el-button class="composer__send" circle type="danger" plain aria-label="停止生成" @click="abort"><AppIcon name="VideoPause" /></el-button></el-tooltip>
            <el-tooltip v-else :content="composerDraft.modelSelection ? '发送消息' : '请先选择模型'" placement="top"><el-button class="composer__send" circle type="primary" aria-label="发送消息" :disabled="!composerDraft.text.trim() || !composerDraft.modelSelection" @click="send"><AppIcon name="Promotion" /></el-button></el-tooltip>
          </div>
        </div>
      </footer>
    </section>

    <aside class="session-panel"><section><h2>会话信息</h2><dl><div><dt>模型</dt><dd>{{ store.activeSession?.modelId || '使用默认模型' }}</dd></div><div><dt>权限</dt><dd>{{ permissionLabel }}</dd></div><div><dt>工作目录</dt><dd>{{ selectedProject?.directory || '尚未选择' }}</dd></div></dl></section><section><h2>工具调用</h2><el-empty v-if="!store.activeSession?.toolCalls.length" description="调用工具后显示记录" :image-size="56" /><div v-for="tool in store.activeSession?.toolCalls" :key="tool.id" class="tool-row"><span :class="tool.status" />{{ tool.tool }}<small>{{ tool.target }}</small></div></section></aside>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getPlatformApi } from '@/platform'
import type { HarnessFileReference, ModelProviderSummary } from '@/config/harness'
import { useHarnessStore } from '@/stores/harness'

const route = useRoute()
const router = useRouter()
const store = useHarnessStore()
const streamRef = ref<HTMLElement>()
const projectPickerVisible = ref(false)
const filePickerVisible = ref(false)
const projectQuery = ref('')
const fileQuery = ref('')
const availableFiles = ref<HarnessFileReference[]>([])
const filesLoading = ref(false)
const creatingProject = ref(false)
const providers = ref<ModelProviderSummary[]>([])
let dispose: (() => void) | undefined

const sessionId = computed(() => typeof route.params.id === 'string' ? route.params.id : undefined)
const draftToken = computed(() => typeof route.query.draft === 'string' ? route.query.draft : undefined)
const draftKey = computed(() => sessionId.value ? `session:${sessionId.value}` : (draftToken.value ? `draft:${draftToken.value}` : ''))
const isPersistedSession = computed(() => Boolean(sessionId.value))
const composerDraft = computed(() => draftKey.value ? store.drafts[draftKey.value] || { text: '', attachments: [], updatedAt: 0 } : { text: '', attachments: [], updatedAt: 0 })
const projectId = computed(() => store.activeSession?.projectId || composerDraft.value.projectId)
const selectedProject = computed(() => store.projects.find(project => project.id === projectId.value))
const filteredProjects = computed(() => {
  const query = projectQuery.value.trim().toLocaleLowerCase()
  return query ? store.projects.filter(project => project.name.toLocaleLowerCase().includes(query) || project.directory.toLocaleLowerCase().includes(query)) : store.projects
})
const permissionLabel = computed(() => ({ default: '默认权限', 'auto-approve': '自动审核', full: '完全访问' }[store.activeSession?.permissionMode || 'auto-approve']))
const modelOptions = computed(() => providers.value.filter(provider => provider.enabled && provider.hasApiKey).flatMap(provider => provider.models.map(modelId => ({ value: `${provider.id}:${modelId}`, label: `${provider.name} · ${modelId}` }))))

async function load() {
  const api = getPlatformApi()
  const [,, configured] = await Promise.all([store.refreshSessions(), store.refreshProjects(), api?.listModelProviders() || []])
  providers.value = configured
  if (sessionId.value) {
    if (store.activeSession?.id !== sessionId.value) await store.openSession(sessionId.value)
    store.ensureComposerDraft(`session:${sessionId.value}`)
    return
  }
  store.clearActiveSession()
  if (!draftToken.value) {
    const token = store.startDraft()
    await router.replace({ path: '/workspace/chat', query: { ...route.query, draft: token } })
    return
  }
  store.ensureComposerDraft(`draft:${draftToken.value}`)
}

function setDraftText(value: string) {
  if (draftKey.value) store.updateComposerDraft(draftKey.value, { text: value })
}
function setModelSelection(value: string) { const [providerId, ...parts] = value.split(':'); const modelId = parts.join(':'); if (draftKey.value && providerId && modelId) store.updateComposerDraft(draftKey.value, { modelSelection: { providerId, modelId } }) }

function selectProject(id?: string) {
  if (!draftKey.value || isPersistedSession.value) return
  store.updateComposerDraft(draftKey.value, { projectId: id, attachments: [] })
  projectPickerVisible.value = false
  filePickerVisible.value = false
  availableFiles.value = []
}

async function createProjectFromPicker() {
  const api = getPlatformApi()
  if (!api) return
  creatingProject.value = true
  try {
    const project = await api.createHarnessProject()
    if (!project) return
    await store.refreshProjects()
    selectProject(project.id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建项目失败')
  } finally {
    creatingProject.value = false
  }
}

async function loadFiles() {
  const api = getPlatformApi()
  if (!api || !projectId.value) { availableFiles.value = []; return }
  filesLoading.value = true
  try {
    availableFiles.value = await api.listHarnessProjectFiles(projectId.value, fileQuery.value)
  } catch (error) {
    availableFiles.value = []
    ElMessage.error(error instanceof Error ? error.message : '加载项目文件失败')
  } finally {
    filesLoading.value = false
  }
}

function isAttached(path: string) { return composerDraft.value.attachments.some(file => file.path === path) }
function toggleAttachment(file: HarnessFileReference) {
  if (!draftKey.value) return
  const attachments = isAttached(file.path)
    ? composerDraft.value.attachments.filter(item => item.path !== file.path)
    : [...composerDraft.value.attachments, file]
  store.updateComposerDraft(draftKey.value, { attachments })
}
function removeAttachment(path: string) {
  if (draftKey.value) store.updateComposerDraft(draftKey.value, { attachments: composerDraft.value.attachments.filter(file => file.path !== path) })
}

async function send() {
  const api = getPlatformApi()
  const originKey = draftKey.value
  const payload = { text: composerDraft.value.text.trim(), attachments: [...composerDraft.value.attachments], projectId: composerDraft.value.projectId, modelSelection: composerDraft.value.modelSelection }
  if (!api || !originKey || !payload.text || !payload.modelSelection || store.running) return

  let activeId = sessionId.value
  try {
    if (!activeId) {
      const session = await store.createSession(payload.projectId)
      if (!session) return
      activeId = session.id
      const sessionKey = `session:${session.id}`
      store.ensureComposerDraft(sessionKey)
      store.updateComposerDraft(sessionKey, { text: payload.text, attachments: payload.attachments, modelSelection: payload.modelSelection })
      store.removeComposerDraft(originKey)
      await router.replace(`/workspace/chat/${session.id}`)
    }
    const sessionKey = `session:${activeId}`
    store.updateComposerDraft(sessionKey, { text: '', attachments: [] })
    store.activeSession?.messages.push({ id: `local-${Date.now()}`, role: 'user', content: payload.text, attachments: payload.attachments.map(file => ({ ...file, content: '' })), createdAt: Date.now() })
    store.running = true
    await api.runHarnessMessage(activeId, payload.text, payload.attachments, payload.modelSelection)
    store.removeComposerDraft(sessionKey)
  } catch (error) {
    const sessionKey = activeId ? `session:${activeId}` : originKey
    const session = activeId ? await store.openSession(activeId).catch(() => undefined) : undefined
    const persisted = session?.messages.some(message => message.role === 'user' && message.content === payload.text)
    if (!persisted) store.updateComposerDraft(sessionKey, { text: payload.text, attachments: payload.attachments, modelSelection: payload.modelSelection })
    ElMessage.error(error instanceof Error ? error.message : '消息发送失败')
  } finally {
    store.running = false
  }
}

async function abort() { if (store.activeSession) await getPlatformApi()?.abortHarnessRun(store.activeSession.id) }

watch(() => [route.params.id, route.query.draft], () => { void load() })
watch(() => projectId.value, () => { fileQuery.value = ''; void loadFiles() })
watch(fileQuery, () => { void loadFiles() })
watch(() => store.activeSession?.messages.length, async () => { await nextTick(); streamRef.value?.scrollTo({ top: streamRef.value.scrollHeight }) })
onMounted(() => { dispose = getPlatformApi()?.onHarnessEvent(store.applyEvent); void load() })
onBeforeUnmount(() => dispose?.())
</script>

<style scoped lang="scss">
.harness-page { height: 100%; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 248px; background: var(--cp-bg); }
.session-panel { min-width: 0; padding: 22px 18px; overflow-y: auto; background: color-mix(in srgb, var(--cp-bg-elevated) 88%, var(--cp-bg)); border-left: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }
.conversation { display: grid; min-width: 0; grid-template-rows: auto minmax(0, 1fr) auto; }
.conversation__header { display: flex; justify-content: space-between; align-items: center; gap: $spacing-md; min-height: 66px; padding: 10px clamp(20px, 4vw, 56px); border-bottom: 1px solid color-mix(in srgb, var(--cp-border-light) 72%, transparent); }
.conversation__identity { min-width: 0; }
.conversation__identity strong, .conversation__identity span { display: block; }
.conversation__identity strong { overflow: hidden; color: var(--cp-text); font-size: 14px; font-weight: 600; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.conversation__eyebrow { display: inline-flex !important; align-items: center; gap: 5px; margin-bottom: 2px; color: var(--cp-text-secondary); font-size: 11px; line-height: 1.4; }
.conversation__directory { max-width: 44vw; margin-top: 2px; overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.conversation__actions { display: flex; align-items: center; }
.message-stream { padding: 34px clamp(20px, 5vw, 96px) 24px; overflow-y: auto; }
.message, .empty-state { width: min(100%, 760px); margin-right: auto; margin-left: auto; }
.message { margin-bottom: 28px; }
.message.user { margin-left: auto; }
.message__role { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; color: var(--cp-text-tertiary); font-size: 12px; }
.message.user .message__role { text-align: right; }
.message.user .message__role { justify-content: flex-end; }
.message p { max-width: 72ch; margin: 0; color: var(--cp-text); font-size: 14px; white-space: pre-wrap; line-height: 1.82; }
.message.user p { width: fit-content; max-width: min(78%, 72ch); margin-left: auto; padding: 10px 13px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); border-radius: $radius-md; background: var(--cp-bg-hover); line-height: 1.7; }
.message__attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.message.user .message__attachments { justify-content: flex-end; }
.file-chip, .composer-chip { display: inline-flex; align-items: center; min-width: 0; gap: 5px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 88%, transparent); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); font-size: 12px; line-height: 26px; }
.file-chip { padding: 0 8px; }
.empty-state { display: flex; align-items: center; justify-content: center; min-height: 100%; flex-direction: column; padding-bottom: 56px; color: var(--cp-text-tertiary); text-align: center; }
.empty-state__icon { display: grid; width: 36px; height: 36px; margin-bottom: 12px; place-items: center; border: 1px solid var(--cp-border-light); border-radius: 50%; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); }
.empty-state strong { color: var(--cp-text); font-size: 14px; font-weight: 600; }
.empty-state span { margin-top: 4px; font-size: 12px; }
.composer-shell { padding: 0 clamp(14px, 4vw, 48px) 20px; background: var(--cp-bg); }
.composer { width: min(100%, 800px); margin: 0 auto; padding: 10px 12px 9px; border: 1px solid color-mix(in srgb, var(--cp-border) 84%, transparent); border-radius: $radius-lg; background: var(--cp-bg-elevated); box-shadow: 0 8px 22px rgb(24 24 27 / 7%); transition: border-color $transition-fast, box-shadow $transition-fast; }
.composer:focus-within { border-color: color-mix(in srgb, var(--cp-primary) 48%, var(--cp-border)); box-shadow: 0 10px 25px rgb(24 24 27 / 10%); }
.composer__context { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 28px; margin-bottom: 8px; }
.composer-chip { max-width: 220px; padding: 0 8px; font: inherit; text-align: left; cursor: pointer; }
.file-picker-reference { display: inline-flex; }
.composer-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer-chip:hover:not(:disabled), .composer-chip.is-selected { color: var(--cp-text); border-color: var(--cp-border); background: var(--cp-bg-hover); }
.composer-chip:disabled { cursor: not-allowed; opacity: .55; }
.composer-chip__remove { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 18px; height: 18px; margin-left: 1px; padding: 0; border: 0; border-radius: $radius-sm; color: inherit; background: transparent; cursor: pointer; }
.composer-chip__remove:hover { background: var(--cp-hover-bg); }
.composer :deep(.el-textarea__inner) { min-height: 54px !important; padding: 5px 2px; border: 0; border-radius: 0; box-shadow: none !important; color: var(--cp-text); background: transparent; font-size: 14px; line-height: 1.65; }
.composer__actions { display: flex; align-items: center; justify-content: space-between; min-height: 30px; margin-top: 5px; gap:8px; }
.composer-model { width: min(230px, 38vw); margin-left:auto; }
.composer__actions > span { color: var(--cp-text-tertiary); font-size: 11px; }
.composer__send { width: 30px; height: 30px; padding: 0; }
.session-panel h2 { margin: 0 0 13px; color: var(--cp-text-secondary); font-size: 12px; font-weight: 600; }.session-panel section + section { margin-top: 32px; padding-top: 24px; border-top: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }.session-panel dl { margin: 0; }.session-panel dl div { margin-bottom: 14px; }.session-panel dt { color: var(--cp-text-tertiary); font-size: 11px; }.session-panel dd { margin: 4px 0 0; overflow-wrap: anywhere; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.55; }.tool-row { display: grid; grid-template-columns: 8px minmax(0, 1fr); gap: 6px; align-items: start; margin: 11px 0; color: var(--cp-text-secondary); font-size: 12px; }.tool-row > span { width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: var(--cp-text-tertiary); }.tool-row > span.running { background: var(--cp-primary); }.tool-row > span.ok { background: var(--cp-success); }.tool-row > span.failed { background: var(--cp-danger); }.tool-row small { grid-column: 2; overflow: hidden; color: var(--cp-text-tertiary); text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 1024px) { .harness-page { grid-template-columns: 1fr; }.session-panel { display: none; } }
@media (max-width: 768px) { .conversation__header { min-height: 60px; padding: 9px 14px; }.conversation__directory { max-width: 58vw; }.message-stream { padding: 24px 16px 16px; }.message { margin-bottom: 23px; }.message p { font-size: 14px; }.message.user p { max-width: 88%; }.composer-shell { padding: 0 10px 12px; }.composer { padding: 8px 10px; }.composer-chip { max-width: 150px; }.empty-state { padding-bottom: 28px; } }
</style>

<style lang="scss">
.harness-selector-popper.el-popover.el-popper { padding: 8px; border: 1px solid var(--cp-border); border-radius: $radius-md; background: var(--cp-bg-overlay); box-shadow: 0 12px 24px rgb(0 0 0 / 12%); }
.selector-panel { display: flex; flex-direction: column; gap: 8px; }.selector-panel__list { display: flex; max-height: 220px; flex-direction: column; gap: 2px; overflow-y: auto; }.selector-panel__list--files { min-height: 76px; }.selector-option { display: flex; align-items: center; min-height: 32px; gap: 8px; padding: 0 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }.selector-option > span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.selector-option:hover, .selector-option.active { background: var(--cp-bg-hover); }.selector-option > .app-icon:last-child { flex: 0 0 auto; color: var(--cp-primary); }.selector-option--new { margin-top: 2px; border-top: 1px solid var(--cp-border-light); color: var(--cp-text-secondary); }.selector-option--new:hover { color: var(--cp-text); }.selector-empty { margin: 10px 8px; color: var(--cp-text-tertiary); font-size: 12px; }
</style>
