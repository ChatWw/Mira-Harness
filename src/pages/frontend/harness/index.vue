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

      <div class="conversation__messages">
        <div ref="streamRef" class="message-stream" @scroll="handleStreamScroll">
        <div v-if="!store.activeSession?.messages.length" class="empty-state">
          <div class="empty-state__icon"><AppIcon name="ChatDotRound" /></div>
          <strong>从这里开始</strong>
          <span>描述你想完成的工作</span>
        </div>
        <article v-for="message in store.activeSession?.messages" :key="message.id" class="message" :class="message.role">
          <span class="message__role"><AppIcon :name="message.role === 'user' ? 'User' : 'ChatDotRound'" />{{ message.role === 'user' ? '你' : 'Mira' }}</span>
          <p v-if="message.role === 'user'">{{ message.content }}</p>
          <template v-else>
            <details v-if="message.run" class="message__run">
              <summary><span>已完成 · {{ formatDuration(message.run.durationMs) }}</span><span>{{ message.run.activities.length }} 个步骤</span></summary>
              <ol><li v-for="activity in message.run.activities" :key="activity.id" :class="activity.status"><details v-if="activity.detail" class="run-activity"><summary><span />{{ activity.label }}<time>{{ formatDuration((activity.completedAt || message.run.completedAt) - activity.startedAt) }}</time></summary><p>{{ activity.detail }}</p></details><template v-else><span />{{ activity.label }}<time>{{ formatDuration((activity.completedAt || message.run.completedAt) - activity.startedAt) }}</time></template></li></ol>
            </details>
            <div class="message__markdown" v-html="renderAssistantMessage(message.content)" />
          </template>
          <div v-if="message.attachments?.length" class="message__attachments">
            <span v-for="file in message.attachments" :key="file.path" class="file-chip"><AppIcon name="Document" />{{ file.name }}</span>
          </div>
        </article>
        <details v-if="store.activeRun" open class="run-progress">
          <summary><span class="run-progress__spinner" />{{ activeRunLabel }} · {{ formatDuration(activeRunElapsed) }}</summary>
          <ol><li v-for="activity in store.activeRun.activities" :key="activity.id" :class="activity.status"><details v-if="activity.detail" class="run-activity"><summary><span />{{ activity.label }}<time v-if="activity.completedAt">{{ formatDuration(activity.completedAt - activity.startedAt) }}</time></summary><p>{{ activity.detail }}</p></details><template v-else><span />{{ activity.label }}<time v-if="activity.completedAt">{{ formatDuration(activity.completedAt - activity.startedAt) }}</time></template></li></ol>
        </details>
        </div>
        <span v-if="showLoadingIndicator" class="loading-dots loading-dots--floating" aria-label="Mira 正在处理"><i></i><i></i><i></i></span>
        <el-tooltip v-if="showScrollToBottom" content="回到底部" placement="top">
          <button type="button" class="scroll-bottom" aria-label="回到底部" @click="scrollToBottom">
            <AppIcon name="ArrowDown" />
          </button>
        </el-tooltip>
      </div>

      <footer class="composer-shell">
        <div class="composer">
          <div v-if="selectedProject || composerDraft.attachments.length" class="composer__context">
            <span v-if="selectedProject" class="composer-chip is-selected"><AppIcon :name="selectedProject.icon" /><span>{{ selectedProject.name }}</span><button v-if="!isPersistedSession" type="button" class="composer-chip__remove" :aria-label="`移除项目 ${selectedProject.name}`" @click="selectProject()"><AppIcon name="Close" /></button></span>
            <span v-for="file in composerDraft.attachments" :key="file.path" class="composer-chip is-selected"><AppIcon name="Document" /><span>{{ file.name }}</span><button type="button" class="composer-chip__remove" :aria-label="`移除 ${file.name}`" @click="removeAttachment(file.path)"><AppIcon name="Close" /></button></span>
          </div>
          <el-input :model-value="composerDraft.text" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" resize="none" placeholder="今天帮你做些什么?" :disabled="store.running" @update:model-value="setDraftText" @keydown.meta.enter.prevent="send" @keydown.ctrl.enter.prevent="send" />
          <div class="composer__actions">
            <div class="composer__status">
              <el-popover v-model:visible="addMenuVisible" trigger="click" placement="top-start" :width="350" popper-class="harness-selector-popper" @show="addMenuView = 'menu'">
                <template #reference><el-tooltip content="添加项目或文件" placement="top"><button type="button" class="composer-icon-button" aria-label="添加项目或文件"><AppIcon name="Plus" /></button></el-tooltip></template>
                <div v-if="addMenuView === 'menu'" class="add-menu">
                  <p class="add-menu__title">添加内容</p>
                  <button v-if="!isPersistedSession" type="button" class="add-menu__item" @click="addMenuView = 'project'"><AppIcon name="FolderOpened" /><span><strong>项目目录</strong><small>{{ selectedProject ? selectedProject.name : '选择本次对话的工作目录' }}</small></span><AppIcon name="ArrowRight" /></button>
                  <button v-else-if="!selectedProject" type="button" class="add-menu__item" disabled><AppIcon name="FolderOpened" /><span><strong>项目目录</strong><small>已有对话未关联项目，不能再更换</small></span></button>
                  <button type="button" class="add-menu__item" :disabled="!selectedProject" @click="openFilePicker"><AppIcon name="Paperclip" /><span><strong>引用文件</strong><small>{{ selectedProject ? '从项目中添加文本文件' : '请先选择项目目录' }}</small></span><AppIcon name="ArrowRight" /></button>
                </div>
                <div v-else-if="addMenuView === 'project'" class="selector-panel">
                  <div class="selector-panel__header"><button type="button" class="composer-icon-button" aria-label="返回添加菜单" @click="addMenuView = 'menu'"><AppIcon name="ArrowLeft" /></button><strong>选择项目目录</strong></div>
                  <el-input v-model="projectQuery" size="small" clearable placeholder="搜索项目"><template #prefix><AppIcon name="Search" /></template></el-input>
                  <div class="selector-panel__list">
                    <button v-for="project in filteredProjects" :key="project.id" type="button" class="selector-option" :class="{ active: project.id === selectedProject?.id }" @click="selectProject(project.id)"><AppIcon :name="project.icon" /><span>{{ project.name }}</span><AppIcon v-if="project.id === selectedProject?.id" name="Check" /></button>
                    <p v-if="!filteredProjects.length" class="selector-empty">没有匹配的项目</p>
                  </div>
                  <button type="button" class="selector-option selector-option--new" :disabled="creatingProject" @click="createProjectFromPicker"><AppIcon :name="creatingProject ? 'Loading' : 'Plus'" :class="{ 'is-loading': creatingProject }" /><span>新建项目</span></button>
                </div>
                <div v-else class="selector-panel">
                  <div class="selector-panel__header"><button type="button" class="composer-icon-button" aria-label="返回添加菜单" @click="addMenuView = 'menu'"><AppIcon name="ArrowLeft" /></button><strong>引用文件</strong></div>
                  <el-input v-model="fileQuery" size="small" clearable placeholder="搜索项目文件"><template #prefix><AppIcon name="Search" /></template></el-input>
                  <div class="selector-panel__list selector-panel__list--files" v-loading="filesLoading">
                    <button v-for="file in availableFiles" :key="file.path" type="button" class="selector-option" :class="{ active: isAttached(file.path) }" @click="toggleAttachment(file)"><AppIcon name="Document" /><span :title="file.path">{{ file.path }}</span><AppIcon v-if="isAttached(file.path)" name="Check" /></button>
                    <p v-if="!filesLoading && !availableFiles.length" class="selector-empty">没有可引用的文本文件</p>
                  </div>
                </div>
              </el-popover>
              <span class="composer-permission" :class="`is-${store.activeSession?.permissionMode || 'auto-approve'}`"><AppIcon name="Lock" />{{ permissionLabel }}</span>
              <span v-if="store.running" class="composer-running"><i></i>正在生成</span>
              <span v-else class="composer-shortcut">Ctrl / ⌘ + Enter 发送</span>
            </div>
            <div class="composer__submit">
              <el-popover v-model:visible="modelPickerVisible" trigger="click" placement="top-end" :width="272" popper-class="harness-selector-popper" @show="modelMenuView = 'menu'">
                <template #reference><button type="button" class="composer-model" :class="{ 'is-empty': !composerDraft.modelSelection }" :aria-label="selectedModelOption ? `模型：${selectedModelOption.label}` : '选择模型'"><span>{{ selectedModelOption?.label || '选择模型' }}</span><small v-if="selectedModelOption?.reasoning">{{ selectedThinkingLabel }}</small><AppIcon name="ArrowDown" /></button></template>
                <div v-if="modelMenuView === 'menu'" class="model-menu">
                  <button type="button" class="model-menu__item" @click="modelMenuView = 'models'"><span>模型</span><em>{{ selectedModelOption?.label || '选择模型' }}</em><AppIcon name="ArrowRight" /></button>
                  <button v-if="selectedModelOption?.reasoning" type="button" class="model-menu__item" @click="modelMenuView = 'effort'"><span>推理强度</span><em>{{ selectedThinkingLabel }}</em><AppIcon name="ArrowRight" /></button>
                  <p v-if="!modelOptions.length" class="selector-empty">没有可用模型，请先完成模型配置</p>
                </div>
                <div v-else-if="modelMenuView === 'models'" class="selector-panel model-menu__panel">
                  <div class="selector-panel__header"><button type="button" class="composer-icon-button" aria-label="返回模型设置" @click="modelMenuView = 'menu'"><AppIcon name="ArrowLeft" /></button><strong>模型</strong></div>
                  <div class="selector-panel__list">
                    <button v-for="option in modelOptions" :key="option.value" type="button" class="selector-option" :class="{ active: option.value === selectedModelOption?.value }" @click="setModelSelection(option.value)"><span>{{ option.label }}</span><AppIcon v-if="option.value === selectedModelOption?.value" name="Check" /></button>
                    <p v-if="!modelOptions.length" class="selector-empty">没有可用模型，请先完成模型配置</p>
                  </div>
                </div>
                <div v-else class="selector-panel model-menu__panel">
                  <div class="selector-panel__header"><button type="button" class="composer-icon-button" aria-label="返回模型设置" @click="modelMenuView = 'menu'"><AppIcon name="ArrowLeft" /></button><strong>推理强度</strong></div>
                  <div class="selector-panel__list">
                    <button v-for="option in thinkingOptions" :key="option.value" type="button" class="selector-option" :class="{ active: selectedThinkingLevel === option.value }" @click="setThinkingLevel(option.value)"><span>{{ option.label }}</span><AppIcon v-if="selectedThinkingLevel === option.value" name="Check" /></button>
                  </div>
                </div>
              </el-popover>
              <el-tooltip v-if="store.running" content="停止生成" placement="top"><button type="button" class="composer__send is-stop" aria-label="停止生成" @click="abort"><AppIcon name="VideoPause" /></button></el-tooltip>
              <el-tooltip v-else :content="composerDraft.modelSelection ? '发送消息' : '请先选择模型'" placement="top"><button type="button" class="composer__send" aria-label="发送消息" :disabled="!composerDraft.text.trim() || !composerDraft.modelSelection" @click="send"><AppIcon name="ArrowUp" /></button></el-tooltip>
            </div>
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
import MarkdownIt from 'markdown-it'
import { getPlatformApi } from '@/platform'
import type { HarnessFileReference, ModelProviderSummary, ThinkingLevel } from '@/config/harness'
import { useHarnessStore } from '@/stores/harness'

const route = useRoute()
const router = useRouter()
const store = useHarnessStore()
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true })
const streamRef = ref<HTMLElement>()
const addMenuVisible = ref(false)
const addMenuView = ref<'menu' | 'project' | 'file'>('menu')
const modelPickerVisible = ref(false)
const modelMenuView = ref<'menu' | 'models' | 'effort'>('menu')
const projectQuery = ref('')
const fileQuery = ref('')
const availableFiles = ref<HarnessFileReference[]>([])
const filesLoading = ref(false)
const creatingProject = ref(false)
const providers = ref<ModelProviderSummary[]>([])
const showScrollToBottom = ref(false)
const stickToBottom = ref(true)
const clock = ref(Date.now())
let dispose: (() => void) | undefined
let elapsedTimer: number | undefined
let bottomScrollRequest = 0

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
const modelOptions = computed(() => providers.value.filter(provider => provider.enabled && provider.hasApiKey).flatMap(provider => provider.models.map(modelId => ({ value: `${provider.id}:${modelId}`, label: `${provider.name} · ${modelId}`, reasoning: provider.reasoning }))))
const selectedModelOption = computed(() => modelOptions.value.find(option => option.value === `${composerDraft.value.modelSelection?.providerId}:${composerDraft.value.modelSelection?.modelId}`))
const thinkingOptions: Array<{ value: ThinkingLevel, label: string }> = [
  { value: 'off', label: '关闭' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]
const selectedThinkingLevel = computed<ThinkingLevel>(() => composerDraft.value.modelSelection?.thinkingLevel || 'medium')
const selectedThinkingLabel = computed(() => thinkingOptions.find(option => option.value === selectedThinkingLevel.value)?.label || '中')
const activeRunLabel = computed(() => store.activeRun?.activities.find(activity => activity.status === 'running')?.label || '正在处理')
const activeRunElapsed = computed(() => store.activeRun ? Math.max(0, clock.value - store.activeRun.startedAt) : 0)

const showLoadingIndicator = computed(() => {
  const messages = store.activeSession?.messages
  return stickToBottom.value && store.running && messages?.[messages.length - 1]?.role !== 'assistant'
})

async function load() {
  const api = getPlatformApi()
  const [,, configured] = await Promise.all([store.refreshSessions(), store.refreshProjects(), api?.listModelProviders() || []])
  providers.value = configured
  if (sessionId.value) {
    if (store.activeSession?.id !== sessionId.value) await store.openSession(sessionId.value)
    const sessionKey = `session:${sessionId.value}`
    store.ensureComposerDraft(sessionKey)
    const session = store.activeSession
    if (session?.modelProviderId && session.modelId && !store.drafts[sessionKey]?.modelSelection) {
      const savedSelection = store.lastModelSelection
      store.updateComposerDraft(sessionKey, {
        modelSelection: {
          providerId: session.modelProviderId,
          modelId: session.modelId,
          thinkingLevel: savedSelection?.providerId === session.modelProviderId && savedSelection.modelId === session.modelId
            ? savedSelection.thinkingLevel
            : undefined,
        },
      })
    }
    void snapSessionToBottom()
    return
  }
  store.clearActiveSession()
  if (!draftToken.value) {
    const token = store.startDraft()
    await router.replace({ path: '/workspace/chat', query: { ...route.query, draft: token } })
    return
  }
  const draftKey = `draft:${draftToken.value}`
  store.ensureComposerDraft(draftKey)
  if (!store.drafts[draftKey]?.modelSelection && store.lastModelSelection) {
    store.updateComposerDraft(draftKey, { modelSelection: { ...store.lastModelSelection } })
  }
}

function setDraftText(value: string) {
  if (draftKey.value) store.updateComposerDraft(draftKey.value, { text: value })
}
function renderAssistantMessage(content: string) { return markdown.render(content) }
function setModelSelection(value: string) {
  const [providerId, ...parts] = value.split(':')
  const modelId = parts.join(':')
  if (!providerId || !modelId) return
  const option = modelOptions.value.find(item => item.value === value)
  const selection = { providerId, modelId, thinkingLevel: option?.reasoning ? 'medium' as ThinkingLevel : undefined }
  store.setLastModelSelection(selection)
  if (draftKey.value) store.updateComposerDraft(draftKey.value, { modelSelection: selection })
  modelMenuView.value = 'menu'
}

function setThinkingLevel(thinkingLevel: ThinkingLevel) {
  const current = composerDraft.value.modelSelection
  if (!current || !selectedModelOption.value?.reasoning) return
  const selection = { ...current, thinkingLevel }
  store.setLastModelSelection(selection)
  if (draftKey.value) store.updateComposerDraft(draftKey.value, { modelSelection: selection })
  modelPickerVisible.value = false
}

function formatDuration(value: number) {
  const milliseconds = Math.max(0, value)
  return milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)}s`
}

function selectProject(id?: string) {
  if (!draftKey.value || isPersistedSession.value) return
  store.updateComposerDraft(draftKey.value, { projectId: id, attachments: [] })
  addMenuVisible.value = false
  addMenuView.value = 'menu'
  availableFiles.value = []
}

function openFilePicker() {
  if (!selectedProject.value) return
  addMenuView.value = 'file'
  void loadFiles()
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
  const draft = composerDraft.value
  const payload = {
    text: draft.text.trim(),
    attachments: draft.attachments.map(file => ({ path: file.path, name: file.name })),
    projectId: draft.projectId,
    modelSelection: draft.modelSelection ? { ...draft.modelSelection } : undefined,
  }
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

function handleStreamScroll() {
  const element = streamRef.value
  if (!element) return
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight
  stickToBottom.value = distance <= 72
  showScrollToBottom.value = distance > 72
}

async function scrollToBottom() {
  stickToBottom.value = true
  await nextTick()
  streamRef.value?.scrollTo({ top: streamRef.value.scrollHeight, behavior: 'smooth' })
  showScrollToBottom.value = false
}

async function snapSessionToBottom() {
  const request = ++bottomScrollRequest
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if (request !== bottomScrollRequest) return
  const element = streamRef.value
  if (!element) return
  element.scrollTop = element.scrollHeight
  requestAnimationFrame(() => {
    if (request !== bottomScrollRequest || !streamRef.value) return
    streamRef.value.scrollTop = streamRef.value.scrollHeight
    handleStreamScroll()
  })
}

watch(() => [route.params.id, route.query.draft], () => {
  stickToBottom.value = true
  showScrollToBottom.value = false
  void load()
})
watch(() => store.activeSession?.id, () => {
  stickToBottom.value = true
  showScrollToBottom.value = false
  void snapSessionToBottom()
})
watch(() => projectId.value, () => { fileQuery.value = ''; void loadFiles() })
watch(fileQuery, () => { void loadFiles() })
watch(() => {
  const messages = store.activeSession?.messages
  return [messages?.length, messages?.[messages.length - 1]?.content]
}, async () => {
  await nextTick()
  if (stickToBottom.value) streamRef.value?.scrollTo({ top: streamRef.value.scrollHeight })
  handleStreamScroll()
})
onMounted(() => {
  dispose = getPlatformApi()?.onHarnessEvent(store.applyEvent)
  elapsedTimer = window.setInterval(() => { if (store.activeRun) clock.value = Date.now() }, 250)
  void load()
})
onBeforeUnmount(() => {
  dispose?.()
  if (elapsedTimer) window.clearInterval(elapsedTimer)
  bottomScrollRequest += 1
})
</script>

<style scoped lang="scss">
.harness-page { height: 100%; min-height: 0; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 248px; overflow: hidden; background: var(--cp-bg); }
.session-panel { min-width: 0; padding: 22px 18px; overflow-y: auto; background: color-mix(in srgb, var(--cp-bg-elevated) 88%, var(--cp-bg)); border-left: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }
.conversation { display: grid; min-width: 0; min-height: 0; overflow: hidden; grid-template-rows: auto minmax(0, 1fr) auto; }
.conversation__messages { position: relative; min-height: 0; overflow: hidden; }
.conversation__header { display: flex; justify-content: space-between; align-items: center; gap: $spacing-md; min-height: 66px; padding: 10px clamp(20px, 4vw, 56px); border-bottom: 1px solid color-mix(in srgb, var(--cp-border-light) 72%, transparent); }
.conversation__identity { min-width: 0; }
.conversation__identity strong, .conversation__identity span { display: block; }
.conversation__identity strong { overflow: hidden; color: var(--cp-text); font-size: 14px; font-weight: 600; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.conversation__eyebrow { display: inline-flex !important; align-items: center; gap: 5px; margin-bottom: 2px; color: var(--cp-text-secondary); font-size: 11px; line-height: 1.4; }
.conversation__directory { max-width: 44vw; margin-top: 2px; overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.conversation__actions { display: flex; align-items: center; }
.message-stream { height: 100%; min-height: 0; padding: 34px clamp(20px, 5vw, 96px) 24px; overflow-y: auto; }
.message, .empty-state { width: min(100%, 760px); margin-right: auto; margin-left: auto; }
.message { margin-bottom: 28px; }
.message.user { margin-left: auto; }
.message__role { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; color: var(--cp-text-tertiary); font-size: 12px; }
.message.user .message__role { text-align: right; }
.message.user .message__role { justify-content: flex-end; }
.message p { max-width: 72ch; margin: 0; color: var(--cp-text); font-size: 14px; white-space: pre-wrap; line-height: 1.82; }
.message__markdown { max-width: min(100%, 760px); overflow-wrap: anywhere; color: var(--cp-text); font-size: 14px; line-height: 1.82; }
.message__run, .run-progress { width: min(100%, 760px); margin: 0 0 12px; color: var(--cp-text-secondary); font-size: 12px; }
.message__run summary, .run-progress summary { display: flex; align-items: center; gap: 8px; width: fit-content; color: var(--cp-text-secondary); cursor: pointer; list-style: none; }
.message__run summary::-webkit-details-marker, .run-progress summary::-webkit-details-marker { display: none; }
.message__run summary::before, .run-progress summary::before { width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 5px solid currentColor; content: ''; transition: transform $transition-fast; }
.message__run[open] summary::before, .run-progress[open] summary::before { transform: rotate(90deg); }
.message__run summary > span:last-child { color: var(--cp-text-tertiary); }
.message__run ol, .run-progress ol { display: grid; gap: 6px; margin: 9px 0 0; padding: 9px 0 0 12px; border-left: 1px solid var(--cp-border-light); list-style: none; }
.message__run li, .run-progress li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 7px; min-height: 18px; color: var(--cp-text-secondary); }
.message__run li > span, .run-progress li > span { width: 6px; height: 6px; border-radius: 50%; background: var(--cp-text-tertiary); }
.message__run li.running > span, .run-progress li.running > span { background: var(--cp-primary); animation: run-activity-pulse 1s ease-in-out infinite; }
.message__run li.completed > span, .run-progress li.completed > span { background: var(--cp-success); }.message__run li.failed > span, .run-progress li.failed > span { background: var(--cp-danger); }
.message__run time, .run-progress time { color: var(--cp-text-tertiary); font-size: 11px; }
.run-activity { width: 100%; }.run-activity summary { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 7px; width: 100%; }.run-activity summary::before { display: none; }.run-activity summary > span { width: 6px; height: 6px; border-radius: 50%; background: var(--cp-text-tertiary); }.message__run li.running .run-activity summary > span, .run-progress li.running .run-activity summary > span { background: var(--cp-primary); animation: run-activity-pulse 1s ease-in-out infinite; }.message__run li.completed .run-activity summary > span, .run-progress li.completed .run-activity summary > span { background: var(--cp-success); }.message__run li.failed .run-activity summary > span, .run-progress li.failed .run-activity summary > span { background: var(--cp-danger); }.run-activity p { margin: 5px 0 0 15px; color: var(--cp-text-tertiary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.run-progress { margin: 0 auto 18px; }.run-progress summary { color: var(--cp-primary); }.run-progress__spinner { width: 11px; height: 11px; border: 1.5px solid color-mix(in srgb, var(--cp-primary) 28%, transparent); border-top-color: var(--cp-primary); border-radius: 50%; animation: composer-spin .8s linear infinite; }
.message__markdown :deep(> :first-child) { margin-top: 0; }.message__markdown :deep(> :last-child) { margin-bottom: 0; }.message__markdown :deep(h1), .message__markdown :deep(h2), .message__markdown :deep(h3), .message__markdown :deep(h4) { margin: 1.3em 0 .55em; color: var(--cp-text); font-weight: 600; line-height: 1.4; }.message__markdown :deep(h1) { font-size: 1.35em; }.message__markdown :deep(h2) { font-size: 1.2em; }.message__markdown :deep(h3), .message__markdown :deep(h4) { font-size: 1.05em; }.message__markdown :deep(p) { max-width: none; margin: 0 0 1em; white-space: normal; }.message__markdown :deep(ul), .message__markdown :deep(ol) { margin: 0 0 1em; padding-left: 1.55em; }.message__markdown :deep(li + li) { margin-top: .25em; }.message__markdown :deep(blockquote) { margin: 1em 0; padding: .2em 0 .2em 1em; border-left: 3px solid var(--cp-border); color: var(--cp-text-secondary); }.message__markdown :deep(a) { color: var(--cp-primary); text-decoration: underline; text-underline-offset: 2px; }.message__markdown :deep(code) { padding: .12em .35em; border-radius: $radius-sm; color: var(--cp-text); background: var(--cp-bg-hover); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .9em; }.message__markdown :deep(pre) { max-width: 100%; margin: 1em 0; padding: 12px 14px; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-hover); }.message__markdown :deep(pre code) { padding: 0; background: transparent; font-size: 12px; line-height: 1.65; }.message__markdown :deep(table) { display: block; max-width: 100%; margin: 1em 0; overflow-x: auto; border-spacing: 0; border-collapse: separate; border: 1px solid var(--cp-border-light); border-radius: $radius-md; }.message__markdown :deep(th), .message__markdown :deep(td) { min-width: 90px; padding: 7px 10px; border-right: 1px solid var(--cp-border-light); border-bottom: 1px solid var(--cp-border-light); text-align: left; }.message__markdown :deep(th) { color: var(--cp-text-secondary); background: var(--cp-bg-hover); font-weight: 600; }.message__markdown :deep(tr > :last-child) { border-right: 0; }.message__markdown :deep(tbody tr:last-child td) { border-bottom: 0; }.message__markdown :deep(hr) { margin: 1.25em 0; border: 0; border-top: 1px solid var(--cp-border-light); }
.message.user p { width: fit-content; max-width: min(78%, 72ch); margin-left: auto; padding: 10px 13px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); border-radius: $radius-md; background: var(--cp-bg-hover); line-height: 1.7; }
.message__attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.message.user .message__attachments { justify-content: flex-end; }
.loading-dots { display: inline-flex; align-items: center; gap: 5px; width: fit-content; padding: 10px 13px; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-elevated); }
.loading-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--cp-text-tertiary); animation: harness-loading-dot 1.1s ease-in-out infinite; }
.loading-dots i:nth-child(2) { animation-delay: .14s; }.loading-dots i:nth-child(3) { animation-delay: .28s; }
.loading-dots--floating { position: absolute; z-index: 1; bottom: 16px; left: 50%; width: 34px; height: 34px; justify-content: center; padding: 0; border-radius: 50%; box-shadow: 0 4px 12px rgb(24 24 27 / 12%); transform: translateX(-50%); }
.scroll-bottom { position: absolute; z-index: 1; bottom: 16px; left: 50%; display: grid; width: 32px; height: 32px; place-items: center; padding: 0; border: 1px solid var(--cp-border-light); border-radius: 50%; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); box-shadow: 0 4px 12px rgb(24 24 27 / 12%); cursor: pointer; transform: translateX(-50%); }
.scroll-bottom:hover { color: var(--cp-text); border-color: var(--cp-border); background: var(--cp-bg-hover); }
.file-chip, .composer-chip { display: inline-flex; align-items: center; min-width: 0; gap: 5px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 88%, transparent); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); font-size: 12px; line-height: 26px; }
.file-chip { padding: 0 8px; }
.empty-state { display: flex; align-items: center; justify-content: center; min-height: 100%; flex-direction: column; padding-bottom: 56px; color: var(--cp-text-tertiary); text-align: center; }
.empty-state__icon { display: grid; width: 36px; height: 36px; margin-bottom: 12px; place-items: center; border: 1px solid var(--cp-border-light); border-radius: 50%; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); }
.empty-state strong { color: var(--cp-text); font-size: 14px; font-weight: 600; }
.empty-state span { margin-top: 4px; font-size: 12px; }
.composer-shell { padding: 0 clamp(14px, 4vw, 48px) 20px; background: var(--cp-bg); }
.composer { width: min(100%, 800px); min-height: 122px; margin: 0 auto; padding: 12px 14px 10px; border: 1px solid color-mix(in srgb, var(--cp-border) 88%, transparent); border-radius: $radius-lg; background: var(--cp-bg-elevated); box-shadow: 0 8px 22px rgb(24 24 27 / 7%); transition: border-color $transition-fast, box-shadow $transition-fast; }
.composer:focus-within { border-color: color-mix(in srgb, var(--cp-primary) 48%, var(--cp-border)); box-shadow: 0 10px 25px rgb(24 24 27 / 10%); }
.composer__context { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 0; margin-bottom: 8px; }
.composer-chip { display: inline-flex; align-items: center; min-width: 0; max-width: 220px; gap: 5px; padding: 3px 7px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 84%, transparent); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-hover); font-size: 12px; line-height: 20px; }
.composer-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer-chip.is-selected { color: var(--cp-text); }
.composer-chip__remove { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 18px; height: 18px; margin-left: 1px; padding: 0; border: 0; border-radius: $radius-sm; color: inherit; background: transparent; cursor: pointer; }
.composer-chip__remove:hover { background: var(--cp-hover-bg); }
.composer :deep(.el-textarea__inner) { min-height: 62px !important; padding: 4px 0; border: 0; border-radius: 0; box-shadow: none !important; color: var(--cp-text); background: transparent; font-size: 14px; line-height: 1.65; }
.composer :deep(.el-textarea__inner::placeholder) { color: var(--cp-text-tertiary); }
.composer__actions, .composer__status, .composer__submit { display: flex; align-items: center; }
.composer__actions { justify-content: space-between; min-height: 32px; margin-top: 6px; gap: 10px; }
.composer__status, .composer__submit { min-width: 0; gap: 9px; }
.composer__submit { margin-left: auto; }
.composer-icon-button, .composer__send { display: grid; flex: 0 0 auto; width: 30px; height: 30px; place-items: center; padding: 0; border: 0; border-radius: 50%; color: var(--cp-text-secondary); background: transparent; cursor: pointer; transition: color $transition-fast, background $transition-fast, transform $transition-fast; }
.composer-icon-button:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
.composer-permission, .composer-running, .composer-shortcut { display: inline-flex; align-items: center; gap: 5px; min-width: 0; color: var(--cp-text-tertiary); font-size: 11px; white-space: nowrap; }
.composer-permission { color: var(--cp-text-secondary); }.composer-permission.is-auto-approve { color: var(--cp-primary); }.composer-permission.is-full { color: var(--cp-danger); }
.composer-running { color: var(--cp-primary); }.composer-running i { width: 10px; height: 10px; border: 1.5px solid color-mix(in srgb, var(--cp-primary) 30%, transparent); border-top-color: var(--cp-primary); border-radius: 50%; animation: composer-spin .8s linear infinite; }
.composer-model { display: inline-flex; align-items: center; min-width: 0; max-width: min(290px, 38vw); gap: 5px; padding: 4px 6px 4px 9px; border: 0; border-radius: $radius-sm; color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }
.composer-model span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.composer-model small { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 11px; }.composer-model .app-icon { flex: 0 0 auto; font-size: 12px; }.composer-model:hover { color: var(--cp-text); background: var(--cp-bg-hover); }.composer-model.is-empty { color: var(--cp-danger); }
.composer__send { color: var(--cp-bg-elevated); background: var(--cp-text); }.composer__send:hover:not(:disabled) { transform: translateY(-1px); }.composer__send:disabled { color: var(--cp-text-tertiary); background: var(--cp-bg-hover); cursor: not-allowed; }.composer__send.is-stop { color: var(--cp-danger); border: 1px solid color-mix(in srgb, var(--cp-danger) 48%, var(--cp-border)); background: transparent; }
.session-panel h2 { margin: 0 0 13px; color: var(--cp-text-secondary); font-size: 12px; font-weight: 600; }.session-panel section + section { margin-top: 32px; padding-top: 24px; border-top: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }.session-panel dl { margin: 0; }.session-panel dl div { margin-bottom: 14px; }.session-panel dt { color: var(--cp-text-tertiary); font-size: 11px; }.session-panel dd { margin: 4px 0 0; overflow-wrap: anywhere; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.55; }.tool-row { display: grid; grid-template-columns: 8px minmax(0, 1fr); gap: 6px; align-items: start; margin: 11px 0; color: var(--cp-text-secondary); font-size: 12px; }.tool-row > span { width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: var(--cp-text-tertiary); }.tool-row > span.running { background: var(--cp-primary); }.tool-row > span.ok { background: var(--cp-success); }.tool-row > span.failed { background: var(--cp-danger); }.tool-row small { grid-column: 2; overflow: hidden; color: var(--cp-text-tertiary); text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 1024px) { .harness-page { grid-template-columns: 1fr; }.session-panel { display: none; } }
@media (max-width: 768px) { .conversation__header { min-height: 60px; padding: 9px 14px; }.conversation__directory { max-width: 58vw; }.message-stream { padding: 24px 16px 16px; }.message { margin-bottom: 23px; }.message p { font-size: 14px; }.message.user p { max-width: 88%; }.composer-shell { padding: 0 10px 12px; }.composer { min-height: 114px; padding: 9px 10px; }.composer-chip { max-width: 150px; }.composer-shortcut { display: none; }.composer-model { max-width: 150px; }.empty-state { padding-bottom: 28px; } }
@keyframes harness-loading-dot { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
@keyframes composer-spin { to { transform: rotate(360deg); } }
@keyframes run-activity-pulse { 50% { opacity: .35; transform: scale(.72); } }
@media (prefers-reduced-motion: reduce) { .loading-dots i, .message__run li.running > span, .run-progress li.running > span, .run-progress__spinner { animation: none; opacity: .7; } }
</style>

<style lang="scss">
.harness-selector-popper.el-popover.el-popper { padding: 8px; border: 1px solid var(--cp-border); border-radius: $radius-md; background: var(--cp-bg-overlay); box-shadow: 0 12px 24px rgb(0 0 0 / 12%); }
.add-menu, .model-menu, .selector-panel { display: flex; flex-direction: column; gap: 4px; }.add-menu__title { margin: 3px 8px 5px; color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.4; }.add-menu__item { display: grid; grid-template-columns: 18px minmax(0, 1fr) 16px; align-items: center; min-height: 48px; gap: 8px; padding: 5px 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }.add-menu__item > span { display: grid; min-width: 0; gap: 1px; }.add-menu__item strong { font-size: 12px; font-weight: 500; }.add-menu__item small { overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.add-menu__item > .app-icon:last-child { color: var(--cp-text-tertiary); font-size: 12px; }.add-menu__item:hover:not(:disabled) { background: var(--cp-bg-hover); }.add-menu__item:disabled { color: var(--cp-text-tertiary); cursor: not-allowed; opacity: .64; }
.selector-panel { gap: 8px; }.selector-panel__header { display: flex; align-items: center; min-height: 30px; gap: 6px; }.selector-panel__header strong { color: var(--cp-text); font-size: 13px; font-weight: 600; }.selector-panel__list { display: flex; max-height: 220px; flex-direction: column; gap: 2px; overflow-y: auto; }.selector-panel__list--files { min-height: 76px; }.selector-option { display: flex; align-items: center; min-height: 32px; gap: 8px; padding: 0 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }.selector-option > span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.selector-option:hover, .selector-option.active { background: var(--cp-bg-hover); }.selector-option > .app-icon:last-child { flex: 0 0 auto; color: var(--cp-primary); }.selector-option--new { margin-top: 2px; border-top: 1px solid var(--cp-border-light); color: var(--cp-text-secondary); }.selector-option--new:hover { color: var(--cp-text); }.selector-empty { margin: 10px 8px; color: var(--cp-text-tertiary); font-size: 12px; }
.model-menu__item { display: grid; grid-template-columns: minmax(48px, auto) minmax(0, 1fr) 14px; align-items: center; min-height: 36px; gap: 8px; padding: 0 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }.model-menu__item:hover { background: var(--cp-bg-hover); }.model-menu__item > em { min-width: 0; overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; font-style: normal; text-align: right; text-overflow: ellipsis; white-space: nowrap; }.model-menu__item > .app-icon { color: var(--cp-text-tertiary); font-size: 12px; }.model-menu__panel { min-height: 112px; }
</style>
