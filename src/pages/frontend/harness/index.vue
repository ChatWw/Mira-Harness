<template>
  <main class="harness-page" :class="{ 'is-empty-session': !store.activeSession?.messages.length }">
    <section class="conversation">
      <header v-if="store.activeSession?.messages.length" class="conversation__header">
        <div class="conversation__identity">
          <span class="conversation__eyebrow"><AppIcon name="FolderOpened" />{{ selectedProject?.name || '最近对话' }}</span>
          <strong>{{ store.activeSession?.title || '新对话' }}</strong>
          <span class="conversation__directory">{{ selectedProject?.directory || '未关联项目' }}</span>
        </div>
        <div class="conversation__actions"><el-tag effect="plain" size="small">{{ permissionLabel }}</el-tag></div>
      </header>

      <div class="conversation__messages">
        <div ref="streamRef" class="message-stream" @scroll="handleStreamScroll" @wheel.passive="handleUserWheel">
        <article v-for="message in store.activeSession?.messages" :key="message.id" class="message" :class="[message.role, { 'is-entering': message.id === enteringMessageId }]" :data-message-id="message.id" @animationend="clearMessageEntrance(message.id)">
          <span class="message__role"><AppIcon :name="message.role === 'user' ? 'User' : 'ChatDotRound'" />{{ message.role === 'user' ? '我' : 'Mira' }}</span>
          <p v-if="message.role === 'user'">{{ message.content }}</p>
          <template v-else>
            <details v-if="message.run" class="message__run">
              <summary><span class="run-summary__label">已完成 · {{ formatDuration(message.run.durationMs) }}</span><span class="run-summary__meta">{{ message.run.activities.length }} 个步骤</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></summary>
              <ol>
                <li v-for="activity in message.run.activities" :key="activity.id" :class="activity.status">
                  <details v-if="activity.detail" class="run-activity">
                    <summary><span class="run-activity__summary-label"><span class="run-activity__label">{{ activity.label }}</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></span><time>{{ formatDuration((activity.completedAt || message.run.completedAt) - activity.startedAt) }}</time></summary>
                    <pre><code>{{ activity.detail }}</code></pre>
                  </details>
                  <template v-else><span class="run-activity__label">{{ activity.label }}</span><time>{{ formatDuration((activity.completedAt || message.run.completedAt) - activity.startedAt) }}</time></template>
                </li>
              </ol>
            </details>
            <details v-else-if="isStreamingAssistantMessage(message)" class="run-progress">
              <summary><span class="run-progress__label">{{ activeRunLabel }} · {{ formatDuration(activeRunElapsed) }}</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></summary>
              <ol>
                <li v-for="activity in store.activeRun?.activities" :key="activity.id" :class="activity.status">
                  <details v-if="activity.detail" class="run-activity">
                    <summary><span class="run-activity__summary-label"><span class="run-activity__label">{{ activity.label }}</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></span><time v-if="activity.completedAt">{{ formatDuration(activity.completedAt - activity.startedAt) }}</time></summary>
                    <pre><code>{{ activity.detail }}</code></pre>
                  </details>
                  <template v-else><span class="run-activity__label">{{ activity.label }}</span><time v-if="activity.completedAt">{{ formatDuration(activity.completedAt - activity.startedAt) }}</time></template>
                </li>
              </ol>
            </details>
            <div class="message__markdown" v-html="renderAssistantMessage(message.content)" />
          </template>
          <div v-if="message.attachments?.length" class="message__attachments">
            <span v-for="file in message.attachments" :key="file.path" class="file-chip"><AppIcon name="Document" />{{ file.name }}</span>
          </div>
        </article>
        <details v-if="store.activeRun && !hasStreamingAssistantMessage" class="run-progress run-progress--pending">
          <summary><span class="run-progress__label">{{ activeRunLabel }} · {{ formatDuration(activeRunElapsed) }}</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></summary>
          <ol>
            <li v-for="activity in store.activeRun.activities" :key="activity.id" :class="activity.status">
              <details v-if="activity.detail" class="run-activity">
                <summary><span class="run-activity__summary-label"><span class="run-activity__label">{{ activity.label }}</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></span><time v-if="activity.completedAt">{{ formatDuration(activity.completedAt - activity.startedAt) }}</time></summary>
                <pre><code>{{ activity.detail }}</code></pre>
              </details>
              <template v-else><span class="run-activity__label">{{ activity.label }}</span><time v-if="activity.completedAt">{{ formatDuration(activity.completedAt - activity.startedAt) }}</time></template>
            </li>
          </ol>
        </details>
        </div>
        <div
          v-if="showQuickNavigation"
          ref="quickNavigationRef"
          class="quick-navigation"
          role="slider"
          tabindex="0"
          aria-label="对话快速导航"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="quickNavigationPercent"
          :aria-valuetext="`阅读位置 ${quickNavigationPercent}%`"
          @keydown="handleQuickNavigationKeydown"
          @pointerenter="updateQuickNavigationHover"
          @pointerdown="beginQuickNavigation"
          @pointermove="moveQuickNavigation"
          @pointerup="endQuickNavigation"
          @pointercancel="endQuickNavigation"
          @pointerleave="clearQuickNavigationHover"
        >
          <span
            v-for="segment in quickNavigationSegments"
            :key="segment.id"
            class="quick-navigation__segment"
            :class="{ 'is-active': segment.active, 'is-hovered': segment.id === hoveredQuickNavigationId }"
            :style="{ top: `${segment.top}%`, width: `${segment.width}px`, left: `${segment.left}px`, '--quick-navigation-scale-x': segment.scaleX, '--quick-navigation-scale-y': segment.scaleY }"
            aria-hidden="true"
          />
          <div v-if="hoveredQuickNavigationSegment" class="quick-navigation__preview" :style="quickNavigationPreviewStyle" aria-hidden="true">
            <strong>{{ hoveredQuickNavigationSegment.title }}</strong>
            <p>{{ hoveredQuickNavigationSegment.reply }}</p>
          </div>
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
          <el-input :model-value="composerDraft.text" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" resize="none" placeholder="今天帮你做些什么?" :disabled="isComposerBusy" @update:model-value="setDraftText" @keydown="handleComposerKeydown" />
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
              <el-popover v-model:visible="permissionPickerVisible" trigger="click" placement="top-start" :width="292" :show-arrow="false" popper-class="harness-selector-popper">
                <template #reference><button type="button" class="composer-permission" :class="`is-${selectedPermissionMode}`" :disabled="isComposerBusy" :aria-label="`权限：${permissionLabel}`"><AppIcon name="Lock" /><span>{{ permissionLabel }}</span><AppIcon name="ArrowDown" /></button></template>
                <div class="permission-menu">
                  <button v-for="option in availablePermissionOptions" :key="option.mode" type="button" class="permission-menu__item" :class="{ active: selectedPermissionMode === option.mode }" @click="setPermissionMode(option.mode)">
                    <span><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
                    <AppIcon v-if="selectedPermissionMode === option.mode" name="Check" />
                  </button>
                </div>
              </el-popover>
              <span v-if="store.running" class="composer-running"><i></i>正在生成</span>
              <span v-else-if="store.rendering" class="composer-rendering">正在呈现回复</span>
              <span v-else class="composer-shortcut">{{ sendShortcut === 'enter' ? 'Enter 发送 · Shift + Enter 换行' : 'Ctrl / ⌘ + Enter 发送' }}</span>
            </div>
            <div class="composer__submit">
              <el-tooltip v-if="showContextUsage && composerDraft.modelSelection" placement="top" :show-arrow="false">
                <template #content>
                  <div class="context-usage-tooltip">
                    <strong>上下文使用情况</strong>
                    <span>{{ formatTokenCount(contextUsage.usedTokens) }} / {{ formatTokenCount(contextUsage.contextWindow) }} · {{ contextUsagePercent }}%</span>
                    <small>剩余 {{ formatTokenCount(contextUsageRemaining) }} · {{ contextUsage.source === 'reported' ? '模型实际返回' : '本地估算' }}</small>
                  </div>
                </template>
                <span class="context-usage" :class="contextUsageState" role="img" :aria-label="`上下文已使用 ${contextUsagePercent}%`">
                  <span class="context-usage__ring" :style="{ '--context-progress': `${contextUsagePercent * 3.6}deg` }"></span>
                </span>
              </el-tooltip>
              <el-popover v-model:visible="modelPickerVisible" trigger="click" placement="top-end" :width="272" :show-arrow="false" popper-class="harness-selector-popper">
                <template #reference><button type="button" class="composer-model" :class="{ 'is-empty': !composerDraft.modelSelection }" :aria-label="selectedModelOption ? `模型：${selectedModelOption.modelName}` : '选择模型'"><span>{{ selectedModelOption?.modelName || '选择模型' }}</span><small v-if="selectedModelOption?.reasoning">{{ selectedThinkingLabel }}</small><AppIcon name="ArrowDown" /></button></template>
                <div v-if="modelMenuView === 'menu'" class="model-menu">
                  <button type="button" class="model-menu__item" @click="modelMenuView = 'models'"><span>模型</span><em>{{ selectedModelOption?.modelName || '选择模型' }}</em><AppIcon name="ArrowRight" /></button>
                  <button v-if="selectedModelOption?.reasoning" type="button" class="model-menu__item" @click="modelMenuView = 'effort'"><span>推理强度</span><em>{{ selectedThinkingLabel }}</em><AppIcon name="ArrowRight" /></button>
                  <p v-if="!modelOptions.length" class="selector-empty">没有可用模型，请先完成模型配置</p>
                </div>
                <div v-else-if="modelMenuView === 'models'" class="selector-panel model-menu__panel">
                  <div class="selector-panel__header"><button type="button" class="composer-icon-button" aria-label="返回模型设置" @click="modelMenuView = 'menu'"><AppIcon name="ArrowLeft" /></button><strong>模型</strong></div>
                  <div class="selector-panel__list">
                    <button v-for="option in modelOptions" :key="option.value" type="button" class="selector-option" :class="{ active: option.value === selectedModelOption?.value }" @click="setModelSelection(option.value)"><span>{{ option.modelName }}</span><AppIcon v-if="option.value === selectedModelOption?.value" name="Check" /></button>
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
              <el-tooltip v-else :content="store.rendering ? '正在呈现回复' : (composerDraft.modelSelection ? '发送消息' : '请先选择模型')" placement="top"><button type="button" class="composer__send" aria-label="发送消息" :disabled="isComposerBusy || !composerDraft.text.trim() || !composerDraft.modelSelection" @click="send"><AppIcon name="Top" /></button></el-tooltip>
            </div>
          </div>
        </div>
      </footer>
    </section>

    <div v-if="!store.activeSession?.messages.length" class="empty-state" aria-hidden="false">
      <div class="empty-state__hero">
        <h1 class="empty-state__title">Mira</h1>
        <p class="empty-state__subtitle">今天想做什么？从一个想法开始，我陪你把它落地。</p>
      </div>
      <div class="empty-state__cards">
        <button v-for="prompt in starterPrompts" :key="prompt.title" type="button" class="starter-card" :disabled="isComposerBusy" @click="setDraftText(prompt.text)">
          <span class="starter-card__icon"><AppIcon :name="prompt.icon" /></span>
          <span class="starter-card__body">
            <strong>{{ prompt.title }}</strong>
            <small>{{ prompt.hint }}</small>
          </span>
        </button>
      </div>
    </div>

    <aside v-if="store.activeSession?.messages.length" class="session-panel"><section><h2>会话信息</h2><dl><div><dt>模型</dt><dd>{{ store.activeSession?.modelId || '使用默认模型' }}</dd></div><div><dt>权限</dt><dd>{{ permissionLabel }}</dd></div><div><dt>工作目录</dt><dd>{{ selectedProject?.directory || '尚未选择' }}</dd></div></dl></section><section><h2>工具调用</h2><el-empty v-if="!store.activeSession?.toolCalls.length" description="调用工具后显示记录" :image-size="56" /><div v-for="tool in store.activeSession?.toolCalls" :key="tool.id" class="tool-row"><span :class="tool.status" />{{ tool.tool }}<small>{{ tool.target }}</small></div></section></aside>

    <el-dialog v-model="fullAccessConfirmVisible" class="full-access-dialog" width="min(460px, calc(100vw - 32px))" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" align-center>
      <template #header><div class="full-access-dialog__header"><AppIcon name="WarningFilled" /><h2>确认允许完全访问?</h2></div></template>
      <p class="full-access-dialog__copy">开启允许完全访问后，AI 将减少确认步骤，并可直接执行更多操作，包括敏感操作、文件修改或外部执行。<br>仅建议在您信任当前任务时使用。</p>
      <el-checkbox v-model="fullAccessAcknowledged" class="full-access-dialog__ack">我已了解风险，并愿意继续</el-checkbox>
      <template #footer><div class="full-access-dialog__footer"><el-button @click="fullAccessConfirmVisible = false">取消</el-button><el-button type="danger" :disabled="!fullAccessAcknowledged" @click="confirmFullAccess">允许完全访问</el-button></div></template>
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MarkdownIt from 'markdown-it'
import { getPlatformApi, getPreference } from '@/platform'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_PERMISSION_CONFIG, shouldSendWithShortcut, type HarnessContextUsage, type HarnessFileReference, type HarnessMessage, type ModelProviderSummary, type PermissionConfig, type PermissionMode, type SendShortcut, type ThinkingLevel } from '@/config/harness'
import { useHarnessStore } from '@/stores/harness'

const route = useRoute()
const router = useRouter()
const store = useHarnessStore()
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true })
markdown.renderer.rules.table_open = () => '<div class="markdown-table"><table>\n'
markdown.renderer.rules.table_close = () => '</table></div>\n'
const streamRef = ref<HTMLElement>()
const quickNavigationRef = ref<HTMLElement>()
const enteringMessageId = ref<string>()
const addMenuVisible = ref(false)
const addMenuView = ref<'menu' | 'project' | 'file'>('menu')
const modelPickerVisible = ref(false)
const permissionPickerVisible = ref(false)
const fullAccessConfirmVisible = ref(false)
const fullAccessAcknowledged = ref(false)
const modelMenuView = ref<'menu' | 'models' | 'effort'>('menu')
watch(modelPickerVisible, visible => {
  if (!visible) modelMenuView.value = 'menu'
})
const projectQuery = ref('')
const fileQuery = ref('')
const availableFiles = ref<HarnessFileReference[]>([])
const filesLoading = ref(false)
const creatingProject = ref(false)
const providers = ref<ModelProviderSummary[]>([])
const permissionConfig = ref<PermissionConfig>({ ...DEFAULT_PERMISSION_CONFIG })
const showScrollToBottom = ref(false)
const stickToBottom = ref(true)
const clock = ref(Date.now())
interface QuickNavigationSegment {
  id: string
  top: number
  scrollTop: number
  width: number
  left: number
  scaleX: number
  scaleY: number
  active: boolean
  title: string
  reply: string
}
const quickNavigationSegments = ref<QuickNavigationSegment[]>([])
const quickNavigationScrollTop = ref(0)
const quickNavigationMaxScrollTop = ref(0)
const hoveredQuickNavigationId = ref<string>()
let dispose: (() => void) | undefined
let elapsedTimer: number | undefined
let bottomScrollRequest = 0
let autoScrollTimer: number | undefined
let quickNavigationFrame: number | undefined
let quickNavigationResizeObserver: ResizeObserver | undefined
let quickNavigationPointerId: number | undefined
let positioningLatestMessage = false
let latestMessageIdToPosition: string | undefined
let scrollFollowLocked = false

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
const permissionOptions: Array<{ mode: PermissionMode, label: string, description: string }> = [
  { mode: 'default', label: '默认权限', description: '敏感操作逐次确认' },
  { mode: 'auto-approve', label: '自动审核', description: '项目内操作自动批准' },
  { mode: 'full', label: '完全访问', description: '不再显示操作确认' },
]
const starterPrompts: Array<{ icon: string, title: string, hint: string, text: string }> = [
  { icon: 'EditPen', title: '写一段文案', hint: '产品介绍、朋友圈、公告……', text: '帮我写一段产品介绍' },
  { icon: 'Document', title: '总结一篇文章', hint: '粘贴链接或长文本，我来提炼要点', text: '帮我总结这篇文章的要点：' },
  { icon: 'Cpu', title: '写一段代码', hint: 'SQL、脚本、组件，描述需求即可', text: '帮我写一段代码：' },
]
const selectedPermissionMode = computed<PermissionMode>(() => store.activeSession?.permissionMode || composerDraft.value.permissionMode || permissionConfig.value.globalDefaultMode)
const permissionLabel = computed(() => permissionOptions.find(option => option.mode === selectedPermissionMode.value)?.label || '默认权限')
const availablePermissionOptions = computed(() => permissionOptions.filter(option => option.mode === 'default'
  || (option.mode === 'auto-approve' && permissionConfig.value.autoApproveEnabled)
  || (option.mode === 'full' && permissionConfig.value.fullAccessEnabled)))
const modelOptions = computed(() => providers.value.filter(provider => provider.enabled && provider.hasApiKey).flatMap(provider => provider.models.map(modelId => ({ value: `${provider.id}:${modelId}`, modelName: modelId, reasoning: provider.reasoning, contextWindow: provider.contextWindow }))))
const selectedModelOption = computed(() => modelOptions.value.find(option => option.value === `${composerDraft.value.modelSelection?.providerId}:${composerDraft.value.modelSelection?.modelId}`))
const showContextUsage = computed(() => getPreference('showContextUsage', true))
const sendShortcut = computed<SendShortcut>(() => getPreference<SendShortcut>('sendShortcut', 'mod-enter') === 'enter' ? 'enter' : 'mod-enter')
const contextUsage = computed<HarnessContextUsage>(() => {
  const stored = store.activeSession?.context?.usage
  const contextWindow = selectedModelOption.value?.contextWindow || stored?.contextWindow || DEFAULT_CONTEXT_WINDOW
  return stored ? { ...stored, contextWindow } : { usedTokens: 0, contextWindow, source: 'estimated', updatedAt: Date.now() }
})
const contextUsagePercent = computed(() => Math.min(100, Math.round(contextUsage.value.usedTokens / Math.max(1, contextUsage.value.contextWindow) * 100)))
const contextUsageRemaining = computed(() => Math.max(0, contextUsage.value.contextWindow - contextUsage.value.usedTokens))
const contextUsageState = computed(() => contextUsagePercent.value >= 95 ? 'is-critical' : contextUsagePercent.value >= 80 ? 'is-warning' : 'is-normal')
const thinkingOptions: Array<{ value: ThinkingLevel, label: string }> = [
  { value: 'off', label: '关闭' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]
const selectedThinkingLevel = computed<ThinkingLevel>(() => composerDraft.value.modelSelection?.thinkingLevel || 'medium')
const selectedThinkingLabel = computed(() => thinkingOptions.find(option => option.value === selectedThinkingLevel.value)?.label || '中')
const isComposerBusy = computed(() => store.running || store.rendering)
const activeRunLabel = computed(() => store.rendering && !store.running ? '正在呈现回复' : (store.activeRun?.activities.find(activity => activity.status === 'running')?.label || '正在处理'))
const activeRunElapsed = computed(() => store.activeRun ? Math.max(0, clock.value - store.activeRun.startedAt) : 0)
const activeLastMessage = computed(() => {
  const messages = store.activeSession?.messages
  return messages?.[messages.length - 1]
})
const hasStreamingAssistantMessage = computed(() => Boolean(store.activeRun && activeLastMessage.value?.role === 'assistant'))
const showQuickNavigation = computed(() => quickNavigationMaxScrollTop.value > 2 && quickNavigationSegments.value.length > 0)
const quickNavigationProgress = computed(() => quickNavigationMaxScrollTop.value > 0 ? quickNavigationScrollTop.value / quickNavigationMaxScrollTop.value : 0)
const quickNavigationPercent = computed(() => Math.round(quickNavigationProgress.value * 100))
const hoveredQuickNavigationSegment = computed(() => quickNavigationSegments.value.find(segment => segment.id === hoveredQuickNavigationId.value))
const quickNavigationPreviewStyle = computed(() => ({ top: `${Math.min(90, Math.max(7, hoveredQuickNavigationSegment.value?.top || 0))}%` }))

const showLoadingIndicator = computed(() => {
  const messages = store.activeSession?.messages
  return stickToBottom.value && store.running && messages?.[messages.length - 1]?.role !== 'assistant'
})

async function load() {
  const api = getPlatformApi()
  const [,, configured, permissions] = await Promise.all([store.refreshSessions(), store.refreshProjects(), api?.listModelProviders() || [], api?.getHarnessPermissionConfig()])
  providers.value = configured
  if (permissions) permissionConfig.value = permissions
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
function handleComposerKeydown(event: KeyboardEvent) {
  if (!shouldSendWithShortcut(sendShortcut.value, event)) return
  event.preventDefault()
  void send()
}
function formatTokenCount(value: number) {
  if (value < 1000) return `${value}`
  if (value >= 1000000 && value % 1000000 === 0) return `${value / 1000000}M`
  const compact = value >= 100000 ? Math.round(value / 1000) : Math.round(value / 100) / 10
  return `${compact}K`
}
function renderAssistantMessage(content: string) { return markdown.render(content) }
function isStreamingAssistantMessage(message: HarnessMessage) { return Boolean(store.activeRun && activeLastMessage.value?.id === message.id) }
async function setPermissionMode(permissionMode: PermissionMode, confirmed = false) {
  if (isComposerBusy.value || selectedPermissionMode.value === permissionMode) {
    permissionPickerVisible.value = false
    return
  }
  if (permissionMode === 'full' && !confirmed) {
    permissionPickerVisible.value = false
    fullAccessAcknowledged.value = false
    fullAccessConfirmVisible.value = true
    return
  }
  try {
    if (store.activeSession) await store.setSessionPermission(store.activeSession.id, permissionMode)
    if (draftKey.value) store.updateComposerDraft(draftKey.value, { permissionMode })
    permissionPickerVisible.value = false
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '权限切换失败')
  }
}
async function confirmFullAccess() {
  if (!fullAccessAcknowledged.value) return
  fullAccessConfirmVisible.value = false
  await setPermissionMode('full', true)
}
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
    permissionMode: selectedPermissionMode.value,
    modelSelection: draft.modelSelection ? { ...draft.modelSelection } : undefined,
  }
  if (!api || !originKey || !payload.text || !payload.modelSelection || isComposerBusy.value) return

  let activeId = sessionId.value
  try {
    if (!activeId) {
      const session = await store.createSession(payload.projectId)
      if (!session) return
      activeId = session.id
      const sessionKey = `session:${session.id}`
      store.ensureComposerDraft(sessionKey)
      store.updateComposerDraft(sessionKey, { text: payload.text, attachments: payload.attachments, modelSelection: payload.modelSelection, permissionMode: payload.permissionMode })
      store.removeComposerDraft(originKey)
      await router.replace(`/workspace/chat/${session.id}`)
    }
    if (store.activeSession?.permissionMode !== payload.permissionMode) await store.setSessionPermission(activeId, payload.permissionMode)
    const sessionKey = `session:${activeId}`
    store.updateComposerDraft(sessionKey, { text: '', attachments: [] })
    const messageId = `local-${Date.now()}`
    enteringMessageId.value = messageId
    store.activeSession?.messages.push({ id: messageId, role: 'user', content: payload.text, attachments: payload.attachments.map(file => ({ ...file, content: '' })), createdAt: Date.now() })
    void scrollLatestMessageToTop(messageId)
    store.running = true
    await api.runHarnessMessage(activeId, payload.text, payload.attachments, payload.modelSelection)
  } catch (error) {
    const sessionKey = activeId ? `session:${activeId}` : originKey
    const session = activeId ? await store.openSession(activeId).catch(() => undefined) : undefined
    const persisted = session?.messages.some(message => message.role === 'user' && message.content === payload.text)
    if (!persisted) store.updateComposerDraft(sessionKey, { text: payload.text, attachments: payload.attachments, modelSelection: payload.modelSelection, permissionMode: payload.permissionMode })
    ElMessage.error(error instanceof Error ? error.message : '消息发送失败')
  } finally {
    store.running = false
  }
}

async function abort() { if (store.activeSession) await getPlatformApi()?.abortHarnessRun(store.activeSession.id) }

function handleStreamScroll() {
  scheduleQuickNavigationUpdate()
  if (positioningLatestMessage) return
  const element = streamRef.value
  if (!element) return
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight
  if (scrollFollowLocked) {
    showScrollToBottom.value = distance > 2
    return
  }
  if (distance <= 2) stickToBottom.value = true
  else if (distance > 72) stickToBottom.value = false
  showScrollToBottom.value = !stickToBottom.value && distance > 2
}

async function scrollLatestMessageToTop(messageId: string) {
  cancelAutoScroll()
  bottomScrollRequest += 1
  positioningLatestMessage = true
  scrollFollowLocked = true
  stickToBottom.value = false
  latestMessageIdToPosition = messageId
  await nextTick()
  if (positionLatestMessageToTop(messageId)) latestMessageIdToPosition = undefined
  positioningLatestMessage = false
}

function positionLatestMessageToTop(messageId: string) {
  const stream = streamRef.value
  const message = Array.from(stream?.querySelectorAll<HTMLElement>('.message') || []).find(element => element.dataset.messageId === messageId)
  if (!stream || !message) return false
  const targetTop = Math.max(0, message.offsetTop - 20)
  const maxScrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
  stream.scrollTop = Math.min(targetTop, maxScrollTop)
  showScrollToBottom.value = maxScrollTop - stream.scrollTop > 2
  scheduleQuickNavigationUpdate()
  return targetTop <= maxScrollTop
}

function clearMessageEntrance(messageId: string) {
  if (enteringMessageId.value === messageId) enteringMessageId.value = undefined
}

function scheduleQuickNavigationUpdate() {
  if (quickNavigationFrame !== undefined) return
  quickNavigationFrame = window.requestAnimationFrame(() => {
    quickNavigationFrame = undefined
    updateQuickNavigation()
  })
}

function updateQuickNavigation() {
  const stream = streamRef.value
  if (!stream) return

  const scrollHeight = Math.max(1, stream.scrollHeight)
  const maxScrollTop = Math.max(0, scrollHeight - stream.clientHeight)
  quickNavigationScrollTop.value = stream.scrollTop
  quickNavigationMaxScrollTop.value = maxScrollTop

  const viewportBottom = stream.scrollTop + stream.clientHeight
  const messages = new Map((store.activeSession?.messages || []).map(message => [message.id, message]))
  const elements = Array.from(stream.querySelectorAll<HTMLElement>('.message'))
  const turns = elements.flatMap((element, index) => {
    const message = messages.get(element.dataset.messageId || '')
    if (message?.role !== 'user') return []
    const replyElement = elements.slice(index + 1).find(candidate => messages.get(candidate.dataset.messageId || '')?.role === 'assistant')
    const reply = replyElement ? messages.get(replyElement.dataset.messageId || '') : undefined
    return [{ element, replyElement, message, reply }]
  })
  const railHeight = Math.max(1, stream.clientHeight - 48)
  const markerPitch = Math.min(10, railHeight / Math.max(1, turns.length))
  const markerStackOffset = Math.max(0, (railHeight - turns.length * markerPitch) / 2)
  const hoveredIndex = turns.findIndex(turn => turn.message.id === hoveredQuickNavigationId.value)
  quickNavigationSegments.value = maxScrollTop > 2
    ? turns.map((turn, index) => {
      const top = turn.element.offsetTop
      const end = turn.replyElement ? turn.replyElement.offsetTop + turn.replyElement.offsetHeight : turn.element.offsetTop + turn.element.offsetHeight
      const topPercent = (markerStackOffset + (index + .5) * markerPitch) / railHeight * 100
      const proximity = hoveredIndex < 0 ? 0 : Math.max(0, 4 - Math.abs(index - hoveredIndex))
      return {
        id: turn.message.id,
        top: topPercent,
        scrollTop: top,
        width: 8,
        left: 0,
        scaleX: 1 + proximity * .375,
        scaleY: 1 + proximity * .1,
        active: top < viewportBottom && end > stream.scrollTop,
        title: formatQuickNavigationPreview(turn.message.content, 88, '这条提问'),
        reply: formatQuickNavigationPreview(turn.reply?.content || '', 280, '正在生成回复…'),
      }
    })
    : []

  quickNavigationResizeObserver?.observe(stream)
  stream.querySelectorAll<HTMLElement>('.message, .run-progress').forEach(element => quickNavigationResizeObserver?.observe(element))
}

function formatQuickNavigationPreview(content: string, limit: number, fallback: string) {
  const preview = content.replace(/\s+/g, ' ').trim()
  return preview.length > limit ? `${preview.slice(0, limit)}…` : preview || fallback
}

function useQuickNavigationPosition(progress: number) {
  const stream = streamRef.value
  if (!stream) return
  cancelAutoScroll()
  bottomScrollRequest += 1
  latestMessageIdToPosition = undefined
  scrollFollowLocked = true
  stickToBottom.value = false
  const maxScrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
  const target = Math.round(Math.min(1, Math.max(0, progress)) * maxScrollTop)
  stream.scrollTop = target
  showScrollToBottom.value = target < maxScrollTop - 2
  scheduleQuickNavigationUpdate()
}

function quickNavigationProgressFromPointer(event: PointerEvent, element: HTMLElement) {
  const bounds = element.getBoundingClientRect()
  if (!bounds.height) return
  useQuickNavigationPosition((event.clientY - bounds.top) / bounds.height)
}

function quickNavigationSegmentFromPointer(event: PointerEvent): QuickNavigationSegment | undefined {
  const element = event.currentTarget as HTMLElement
  const bounds = element.getBoundingClientRect()
  if (!bounds.height || !quickNavigationSegments.value.length) return
  const progress = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
  const nearest = quickNavigationSegments.value.reduce((candidate, segment) => Math.abs(segment.top / 100 - progress) < Math.abs(candidate.top / 100 - progress) ? segment : candidate)
  return Math.abs(nearest.top / 100 - progress) <= 6 / bounds.height ? nearest : undefined
}

function updateQuickNavigationHover(event: PointerEvent) {
  const target = quickNavigationSegmentFromPointer(event)
  if (!target) {
    if (hoveredQuickNavigationId.value) {
      hoveredQuickNavigationId.value = undefined
      scheduleQuickNavigationUpdate()
    }
    return
  }
  if (hoveredQuickNavigationId.value !== target.id) {
    hoveredQuickNavigationId.value = target.id
    scheduleQuickNavigationUpdate()
  }
  return target
}

function clearQuickNavigationHover() {
  if (quickNavigationPointerId !== undefined) return
  hoveredQuickNavigationId.value = undefined
  scheduleQuickNavigationUpdate()
}

function beginQuickNavigation(event: PointerEvent) {
  if (event.button !== 0) return
  const element = event.currentTarget as HTMLElement
  event.preventDefault()
  const target = updateQuickNavigationHover(event)
  quickNavigationPointerId = event.pointerId
  element.setPointerCapture(event.pointerId)
  if (target) useQuickNavigationPosition(target.scrollTop / Math.max(1, quickNavigationMaxScrollTop.value))
  else quickNavigationProgressFromPointer(event, element)
}

function moveQuickNavigation(event: PointerEvent) {
  updateQuickNavigationHover(event)
  if (quickNavigationPointerId === event.pointerId) quickNavigationProgressFromPointer(event, event.currentTarget as HTMLElement)
}

function endQuickNavigation(event: PointerEvent) {
  if (quickNavigationPointerId !== event.pointerId) return
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  quickNavigationPointerId = undefined
}

function handleQuickNavigationKeydown(event: KeyboardEvent) {
  const stream = streamRef.value
  if (!stream) return
  const maxScrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
  const step = Math.max(48, stream.clientHeight * .15)
  if (event.key === 'Home') useQuickNavigationPosition(0)
  else if (event.key === 'End') useQuickNavigationPosition(1)
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') useQuickNavigationPosition((stream.scrollTop - step) / Math.max(1, maxScrollTop))
  else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') useQuickNavigationPosition((stream.scrollTop + step) / Math.max(1, maxScrollTop))
  else if (event.key === 'PageUp') useQuickNavigationPosition((stream.scrollTop - stream.clientHeight) / Math.max(1, maxScrollTop))
  else if (event.key === 'PageDown') useQuickNavigationPosition((stream.scrollTop + stream.clientHeight) / Math.max(1, maxScrollTop))
  else return
  event.preventDefault()
}

function cancelAutoScroll() {
  if (autoScrollTimer !== undefined) window.clearTimeout(autoScrollTimer)
  autoScrollTimer = undefined
}

function handleUserWheel(event: WheelEvent) {
  if (event.deltaY >= 0) return
  cancelAutoScroll()
  scrollFollowLocked = true
  stickToBottom.value = false
  showScrollToBottom.value = true
}

function scheduleAutoScroll() {
  if (store.running || store.rendering || scrollFollowLocked || !stickToBottom.value || autoScrollTimer !== undefined) return
  autoScrollTimer = window.setTimeout(() => {
    autoScrollTimer = undefined
    const element = streamRef.value
    if (!element || store.running || store.rendering || scrollFollowLocked || !stickToBottom.value) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    if (distance > 0) element.scrollBy({ top: distance, behavior: 'smooth' })
  }, 72)
}

async function scrollToBottom() {
  cancelAutoScroll()
  scrollFollowLocked = false
  stickToBottom.value = true
  await nextTick()
  streamRef.value?.scrollTo({ top: streamRef.value.scrollHeight, behavior: 'smooth' })
  showScrollToBottom.value = false
  scheduleQuickNavigationUpdate()
}

async function snapSessionToBottom() {
  const request = ++bottomScrollRequest
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if (request !== bottomScrollRequest || store.running || store.rendering || scrollFollowLocked || !stickToBottom.value) return
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
  cancelAutoScroll()
  quickNavigationResizeObserver?.disconnect()
  hoveredQuickNavigationId.value = undefined
  latestMessageIdToPosition = undefined
  scrollFollowLocked = false
  stickToBottom.value = true
  showScrollToBottom.value = false
  void load()
})
watch(() => store.activeSession?.id, () => {
  cancelAutoScroll()
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
  scheduleQuickNavigationUpdate()
  if (latestMessageIdToPosition) {
    if (positionLatestMessageToTop(latestMessageIdToPosition)) latestMessageIdToPosition = undefined
    return
  }
  scheduleAutoScroll()
  handleStreamScroll()
})
onMounted(() => {
  dispose = getPlatformApi()?.onHarnessEvent(store.applyEvent)
  elapsedTimer = window.setInterval(() => { if (store.activeRun) clock.value = Date.now() }, 250)
  quickNavigationResizeObserver = new ResizeObserver(scheduleQuickNavigationUpdate)
  void nextTick().then(scheduleQuickNavigationUpdate)
  void load()
})
onBeforeUnmount(() => {
  dispose?.()
  if (elapsedTimer) window.clearInterval(elapsedTimer)
  cancelAutoScroll()
  if (quickNavigationFrame !== undefined) window.cancelAnimationFrame(quickNavigationFrame)
  quickNavigationResizeObserver?.disconnect()
  bottomScrollRequest += 1
})
</script>

<style scoped lang="scss">
.harness-page { height: 100%; min-height: 0; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 248px; overflow: hidden; background: var(--cp-bg); position: relative; }
.harness-page.is-empty-session { display: flex; flex-direction: column; }
.harness-page.is-empty-session .conversation { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; height: 100%; }
.harness-page.is-empty-session .conversation__messages { flex: 1 1 auto; min-height: 0; }
.harness-page.is-empty-session .composer-shell { flex: 0 0 auto; }
.session-panel { min-width: 0; padding: 22px 18px; overflow-y: auto; background: color-mix(in srgb, var(--cp-bg-elevated) 88%, var(--cp-bg)); border-left: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }
.conversation { display: grid; min-width: 0; min-height: 0; overflow: hidden; grid-template-rows: auto minmax(0, 1fr) auto; position: relative; }
.conversation__messages { position: relative; min-height: 0; overflow: hidden; }
.conversation__header { display: flex; justify-content: space-between; align-items: center; gap: $spacing-md; min-height: 66px; padding: 10px clamp(20px, 4vw, 56px); border-bottom: 1px solid color-mix(in srgb, var(--cp-border-light) 72%, transparent); }
.conversation__identity { min-width: 0; }
.conversation__identity strong, .conversation__identity span { display: block; }
.conversation__identity strong { overflow: hidden; color: var(--cp-text); font-size: 14px; font-weight: 600; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.conversation__eyebrow { display: inline-flex !important; align-items: center; gap: 5px; margin-bottom: 2px; color: var(--cp-text-secondary); font-size: 11px; line-height: 1.4; }
.conversation__directory { max-width: 44vw; margin-top: 2px; overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.conversation__actions { display: flex; align-items: center; }
.message-stream { height: 100%; min-height: 0; padding: 34px clamp(20px, 5vw, 96px) 24px; overflow-y: auto; overscroll-behavior-y: contain; }
.message, .empty-state { width: min(100%, 760px); margin-right: auto; margin-left: auto; }
.message { margin-bottom: 28px; }
.message.user.is-entering { animation: user-message-enter 240ms cubic-bezier(.16, 1, .3, 1) both; }
.message.user { margin-left: auto; }
.message__role { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; color: var(--cp-text-tertiary); font-size: 12px; }
.message.user .message__role { text-align: right; }
.message.user .message__role { justify-content: flex-end; }
.message p { max-width: 72ch; margin: 0; color: var(--cp-text); font-size: 14px; white-space: pre-wrap; line-height: 1.82; }
.message__markdown { max-width: min(100%, 760px); overflow-wrap: anywhere; color: var(--cp-text); font-size: 14px; line-height: 1.82; }
.message__run, .run-progress { width: min(100%, 760px); margin: 0 0 12px; color: var(--cp-text-secondary); font-size: 12px; }
.message__run summary, .run-progress summary { display: flex; align-items: center; min-width: 0; gap: 8px; width: fit-content; color: var(--cp-text-secondary); cursor: pointer; list-style: none; }
.message__run summary::-webkit-details-marker, .run-progress summary::-webkit-details-marker { display: none; }
.run-summary__label, .run-progress__label, .run-activity__label { min-width: 0; }
.run-summary__meta, .message__run time, .run-progress time { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 11px; }
.run-summary__chevron { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 12px; opacity: 0; transform: rotate(0); transition: opacity $transition-fast, transform $transition-fast; }
.message__run summary:hover .run-summary__chevron, .run-progress summary:hover .run-summary__chevron, .message__run summary:focus-visible .run-summary__chevron, .run-progress summary:focus-visible .run-summary__chevron { opacity: 1; }
.message__run details[open] > summary .run-summary__chevron, .run-progress details[open] > summary .run-summary__chevron, .message__run[open] > summary .run-summary__chevron, .run-progress[open] > summary .run-summary__chevron { transform: rotate(180deg); }
.message__run ol, .run-progress ol { display: grid; gap: 6px; margin: 9px 0 0; padding: 9px 0 0 12px; border-left: 1px solid var(--cp-border-light); list-style: none; }
.message__run li, .run-progress li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; min-height: 18px; color: var(--cp-text-secondary); }
.message__run li > .run-activity, .run-progress li > .run-activity { grid-column: 1 / -1; min-width: 0; }
.run-activity { width: 100%; }
.run-activity summary { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; width: 100%; }
.run-activity__summary-label { display: inline-flex; min-width: 0; align-items: center; gap: 5px; width: fit-content; }
.run-activity pre { max-width: 100%; margin: 7px 0 0; padding: 8px 10px; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-hover); font: 11px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.run-activity code { font: inherit; }
.message__run li.failed .run-activity__label, .run-progress li.failed .run-activity__label, .message__run li.failed .run-activity pre, .run-progress li.failed .run-activity pre { color: var(--cp-danger); }
.run-progress { margin: 0 auto 18px; }
.run-progress__label, .message__run li.running .run-activity__label, .run-progress li.running .run-activity__label { --run-sweep-base: var(--cp-text-tertiary); --run-sweep-edge: color-mix(in srgb, var(--cp-text-tertiary) 34%, white); --run-sweep-highlight: var(--cp-bg); color: var(--run-sweep-base); }
:global([data-theme='dark']) .run-progress__label, :global([data-theme='dark']) .message__run li.running .run-activity__label, :global([data-theme='dark']) .run-progress li.running .run-activity__label { --run-sweep-base: var(--cp-text-secondary); --run-sweep-edge: color-mix(in srgb, var(--cp-text) 58%, var(--cp-text-secondary)); --run-sweep-highlight: var(--cp-text); }
@supports ((-webkit-background-clip: text) or (background-clip: text)) { .run-progress__label, .message__run li.running .run-activity__label, .run-progress li.running .run-activity__label { background: linear-gradient(100deg, var(--run-sweep-base) 0 24%, var(--run-sweep-edge) 38%, var(--run-sweep-highlight) 50%, var(--run-sweep-edge) 62%, var(--run-sweep-base) 76% 100%); background-size: 260% 100%; color: transparent; background-clip: text; -webkit-background-clip: text; animation: run-text-sweep 1.8s ease-in-out infinite; } }
.message__markdown :deep(> :first-child) { margin-top: 0; }.message__markdown :deep(> :last-child) { margin-bottom: 0; }.message__markdown :deep(h1), .message__markdown :deep(h2), .message__markdown :deep(h3), .message__markdown :deep(h4) { margin: 1.3em 0 .55em; color: var(--cp-text); font-weight: 600; line-height: 1.4; }.message__markdown :deep(h1) { font-size: 1.35em; }.message__markdown :deep(h2) { font-size: 1.2em; }.message__markdown :deep(h3), .message__markdown :deep(h4) { font-size: 1.05em; }.message__markdown :deep(p) { max-width: none; margin: 0 0 1em; white-space: normal; }.message__markdown :deep(ul), .message__markdown :deep(ol) { margin: 0 0 1em; padding-left: 1.55em; }.message__markdown :deep(li + li) { margin-top: .25em; }.message__markdown :deep(blockquote) { margin: 1em 0; padding: .2em 0 .2em 1em; border-left: 3px solid var(--cp-border); color: var(--cp-text-secondary); }.message__markdown :deep(a) { color: var(--cp-primary); text-decoration: underline; text-underline-offset: 2px; }.message__markdown :deep(code) { padding: .12em .35em; border-radius: $radius-sm; color: var(--cp-text); background: var(--cp-bg-hover); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .9em; }.message__markdown :deep(pre) { max-width: 100%; margin: 1em 0; padding: 12px 14px; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-hover); }.message__markdown :deep(pre code) { padding: 0; background: transparent; font-size: 12px; line-height: 1.65; }.message__markdown :deep(.markdown-table) { width: fit-content; max-width: 100%; margin: 1em 0; overflow-x: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-md; }.message__markdown :deep(table) { width: max-content; border-spacing: 0; border-collapse: separate; }.message__markdown :deep(th), .message__markdown :deep(td) { min-width: 90px; padding: 7px 10px; border-right: 1px solid var(--cp-border-light); border-bottom: 1px solid var(--cp-border-light); text-align: left; }.message__markdown :deep(th) { color: var(--cp-text-secondary); background: var(--cp-bg-hover); font-weight: 600; }.message__markdown :deep(tr > :last-child) { border-right: 0; }.message__markdown :deep(tbody tr:last-child td) { border-bottom: 0; }.message__markdown :deep(hr) { margin: 1.25em 0; border: 0; border-top: 1px solid var(--cp-border-light); }
.message.user p { width: fit-content; max-width: min(78%, 72ch); margin-left: auto; padding: 10px 13px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); border-radius: $radius-md; background: var(--cp-bg-hover); line-height: 1.7; }
.message__attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.message.user .message__attachments { justify-content: flex-end; }
.loading-dots { display: inline-flex; align-items: center; gap: 5px; width: fit-content; padding: 10px 13px; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-elevated); }
.loading-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--cp-text-tertiary); animation: harness-loading-dot 1.1s ease-in-out infinite; }
.loading-dots i:nth-child(2) { animation-delay: .14s; }.loading-dots i:nth-child(3) { animation-delay: .28s; }
.loading-dots--floating { position: absolute; z-index: 1; bottom: 16px; left: 50%; width: 34px; height: 34px; justify-content: center; padding: 0; border-radius: 50%; box-shadow: 0 4px 12px rgb(24 24 27 / 12%); transform: translateX(-50%); }
.scroll-bottom { position: absolute; z-index: 1; bottom: 16px; left: 50%; display: grid; width: 32px; height: 32px; place-items: center; padding: 0; border: 1px solid var(--cp-border-light); border-radius: 50%; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); box-shadow: 0 4px 12px rgb(24 24 27 / 12%); cursor: pointer; transform: translateX(-50%); }
.scroll-bottom:hover { color: var(--cp-text); border-color: var(--cp-border); background: var(--cp-bg-hover); }
.quick-navigation { position: absolute; z-index: 2; top: 24px; bottom: 24px; left: clamp(12px, 1vw, 30px); width: 42px; min-height: 64px; padding: 0; border: 0; outline: 0; background: transparent; cursor: pointer; touch-action: none; }
.quick-navigation:focus-visible::after { position: absolute; inset: -3px; border: 2px solid color-mix(in srgb, var(--cp-primary) 70%, transparent); border-radius: $radius-sm; content: ''; }
.quick-navigation__segment { position: absolute; display: block; height: 2px; min-width: 2px; border-radius: 2px; color: transparent; background: color-mix(in srgb, var(--cp-text-tertiary) 45%, transparent); pointer-events: none; transform: translateY(-50%) scaleX(var(--quick-navigation-scale-x)) scaleY(var(--quick-navigation-scale-y)); transform-origin: left center; transition: transform 140ms ease, background-color 140ms ease; }
.quick-navigation__segment.is-active { background: var(--cp-text); }
.quick-navigation__segment.is-hovered { background: var(--cp-text); }
.quick-navigation__preview { position: absolute; z-index: 1; left: 32px; width: min(360px, calc(100vw - 320px)); height: 124px; padding: 12px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--cp-border) 84%, transparent); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-overlay); box-shadow: 0 10px 22px rgb(24 24 27 / 11%); pointer-events: none; transform: translateY(-50%); }
.quick-navigation__preview strong { display: block; overflow: hidden; color: var(--cp-text); font-size: 14px; font-weight: 600; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.quick-navigation__preview p { display: -webkit-box; height: 56px; margin: 8px 0 0; overflow: hidden; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.file-chip, .composer-chip { display: inline-flex; align-items: center; min-width: 0; gap: 5px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 88%, transparent); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); font-size: 12px; line-height: 26px; }
.file-chip { padding: 0 8px; }
.empty-state { position: absolute; inset: 0; z-index: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 28px; padding: 24px; color: var(--cp-text-tertiary); text-align: center; pointer-events: none; }
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
.composer-shell { padding: 0 clamp(14px, 4vw, 48px) 20px; background: var(--cp-bg); }
.composer { width: min(100%, 800px); min-height: 122px; margin: 0 auto; padding: 12px 14px 10px; border: 1px solid color-mix(in srgb, var(--cp-border) 88%, transparent); border-radius: $radius-lg; box-shadow: 0 8px 22px rgb(24 24 27 / 7%); transition: border-color $transition-fast, box-shadow $transition-fast; }
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
.composer-permission, .composer-running, .composer-rendering, .composer-shortcut { display: inline-flex; align-items: center; gap: 5px; min-width: 0; color: var(--cp-text-tertiary); font-size: 11px; white-space: nowrap; }
.composer-permission { padding: 3px 5px; border: 0; border-radius: $radius-sm; color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 11px; cursor: pointer; }.composer-permission:hover:not(:disabled) { color: var(--cp-text); background: var(--cp-bg-hover); }.composer-permission:disabled { cursor: default; }.composer-permission > .app-icon:last-child { font-size: 10px; }.composer-permission.is-auto-approve { color: var(--cp-primary); }.composer-permission.is-full { color: var(--cp-danger); }
.composer-running { color: var(--cp-primary); }.composer-running i { width: 10px; height: 10px; border: 1.5px solid color-mix(in srgb, var(--cp-primary) 30%, transparent); border-top-color: var(--cp-primary); border-radius: 50%; animation: composer-spin .8s linear infinite; }
.composer-rendering { color: var(--cp-primary); }
.composer-model { display: inline-flex; align-items: center; min-width: 0; max-width: min(290px, 38vw); gap: 5px; padding: 4px 6px 4px 9px; border: 0; border-radius: $radius-sm; color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }
.composer-model span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.composer-model small { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 11px; }.composer-model .app-icon { flex: 0 0 auto; font-size: 12px; }.composer-model:hover { color: var(--cp-text); background: var(--cp-bg-hover); }.composer-model.is-empty { color: var(--cp-danger); }
.context-usage { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 24px; height: 24px; color: var(--cp-primary); }
.context-usage__ring { position: relative; display: grid; width: 18px; height: 18px; place-items: center; border-radius: 50%; background: conic-gradient(currentColor var(--context-progress), var(--cp-border-light) 0); }
.context-usage__ring::before { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: var(--cp-bg); content: ''; }
.context-usage.is-warning { color: var(--cp-warning); }.context-usage.is-critical { color: var(--cp-danger); }
.composer__send { color: var(--cp-bg-elevated); background: var(--cp-text); }.composer__send:hover:not(:disabled) { transform: translateY(-1px); }.composer__send:disabled { color: var(--cp-text-tertiary); background: var(--cp-bg-hover); cursor: not-allowed; }.composer__send.is-stop { color: var(--cp-danger); border: 1px solid color-mix(in srgb, var(--cp-danger) 48%, var(--cp-border)); background: transparent; }
.session-panel h2 { margin: 0 0 13px; color: var(--cp-text-secondary); font-size: 12px; font-weight: 600; }.session-panel section + section { margin-top: 32px; padding-top: 24px; border-top: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }.session-panel dl { margin: 0; }.session-panel dl div { margin-bottom: 14px; }.session-panel dt { color: var(--cp-text-tertiary); font-size: 11px; }.session-panel dd { margin: 4px 0 0; overflow-wrap: anywhere; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.55; }.tool-row { display: grid; grid-template-columns: 8px minmax(0, 1fr); gap: 6px; align-items: start; margin: 11px 0; color: var(--cp-text-secondary); font-size: 12px; }.tool-row > span { width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: var(--cp-text-tertiary); }.tool-row > span.running { background: var(--cp-primary); }.tool-row > span.ok { background: var(--cp-success); }.tool-row > span.failed { background: var(--cp-danger); }.tool-row small { grid-column: 2; overflow: hidden; color: var(--cp-text-tertiary); text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 1024px) { .harness-page { grid-template-columns: 1fr; }.session-panel { display: none; } }
@media (max-width: 768px) { .conversation__header { min-height: 60px; padding: 9px 14px; }.conversation__directory { max-width: 58vw; }.message-stream { padding: 24px 16px 16px; }.message { margin-bottom: 23px; }.message p { font-size: 14px; }.message.user p { max-width: 88%; }.composer-shell { padding: 0 10px 12px; }.composer { min-height: 114px; padding: 9px 10px; }.composer-chip { max-width: 150px; }.composer-shortcut { display: none; }.composer-model { max-width: 150px; }.empty-state { gap: 22px; padding-bottom: 28px; }.empty-state__title { font-size: 32px; }.empty-state__subtitle { max-width: 280px; font-size: 13px; }.starter-card { width: 100%; max-width: 320px; }.quick-navigation { display: none; } }
@keyframes harness-loading-dot { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
@keyframes composer-spin { to { transform: rotate(360deg); } }
@keyframes run-text-sweep { to { background-position: -220% 0; } }
@keyframes user-message-enter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .loading-dots i, .run-progress__label, .message__run li.running .run-activity__label, .run-progress li.running .run-activity__label, .message.user.is-entering { animation: none; } }
</style>

<style lang="scss">
.harness-selector-popper.el-popover.el-popper { padding: 8px; border: 1px solid var(--cp-border); border-radius: $radius-md; background: var(--cp-bg-overlay); box-shadow: 0 12px 24px rgb(0 0 0 / 12%); }
.add-menu, .model-menu, .selector-panel { display: flex; flex-direction: column; gap: 4px; }.add-menu__title { margin: 3px 8px 5px; color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.4; }.add-menu__item { display: grid; grid-template-columns: 18px minmax(0, 1fr) 16px; align-items: center; min-height: 48px; gap: 8px; padding: 5px 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }.add-menu__item > span { display: grid; min-width: 0; gap: 1px; }.add-menu__item strong { font-size: 12px; font-weight: 500; }.add-menu__item small { overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.add-menu__item > .app-icon:last-child { color: var(--cp-text-tertiary); font-size: 12px; }.add-menu__item:hover:not(:disabled) { background: var(--cp-bg-hover); }.add-menu__item:disabled { color: var(--cp-text-tertiary); cursor: not-allowed; opacity: .64; }
.selector-panel { gap: 8px; }.selector-panel__header { display: flex; align-items: center; min-height: 30px; gap: 6px; }.selector-panel__header strong { color: var(--cp-text); font-size: 13px; font-weight: 600; }.selector-panel__list { display: flex; max-height: 220px; flex-direction: column; gap: 2px; overflow-y: auto; }.selector-panel__list--files { min-height: 76px; }.selector-option { display: flex; align-items: center; min-height: 32px; gap: 8px; padding: 0 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }.selector-option > span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.selector-option:hover, .selector-option.active { background: var(--cp-bg-hover); }.selector-option > .app-icon:last-child { flex: 0 0 auto; color: var(--cp-primary); }.selector-option--new { margin-top: 2px; border-top: 1px solid var(--cp-border-light); color: var(--cp-text-secondary); }.selector-option--new:hover { color: var(--cp-text); }.selector-empty { margin: 10px 8px; color: var(--cp-text-tertiary); font-size: 12px; }
.model-menu__item { display: grid; grid-template-columns: minmax(48px, auto) minmax(0, 1fr) 14px; align-items: center; min-height: 36px; gap: 8px; padding: 0 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }.model-menu__item:hover { background: var(--cp-bg-hover); }.model-menu__item > em { min-width: 0; overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; font-style: normal; text-align: right; text-overflow: ellipsis; white-space: nowrap; }.model-menu__item > .app-icon { color: var(--cp-text-tertiary); font-size: 12px; }.model-menu__panel { min-height: 112px; }
.permission-menu { display: flex; flex-direction: column; gap: 2px; }.permission-menu__item { display: grid; grid-template-columns: minmax(0, 1fr) 16px; align-items: center; gap: 10px; min-height: 48px; padding: 6px 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }.permission-menu__item > span { display: flex; min-width: 0; flex-direction: column; gap: 2px; }.permission-menu__item strong { font-size: 12px; font-weight: 500; }.permission-menu__item small { color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.45; }.permission-menu__item:hover, .permission-menu__item.active { background: var(--cp-bg-hover); }.permission-menu__item > .app-icon { color: var(--cp-primary); font-size: 13px; }
.context-usage-tooltip { display: grid; min-width: 180px; gap: 4px; color: var(--cp-text); font-size: 12px; line-height: 1.45; }.context-usage-tooltip strong { font-size: 12px; font-weight: 600; }.context-usage-tooltip span, .context-usage-tooltip small { color: var(--cp-text-secondary); }.context-usage-tooltip small { font-size: 11px; }
.el-dialog.full-access-dialog { max-width: calc(100vw - 32px); border-radius: 18px; }.full-access-dialog .el-dialog__header { margin: 0; padding: 8px 0 0; border-bottom: 0 !important; }.full-access-dialog .el-dialog__body { padding: 12px 0 0; }.full-access-dialog .el-dialog__footer { padding: 12px 0 0; }.full-access-dialog__header { display: flex; align-items: center; gap: 9px; color: var(--cp-text); }.full-access-dialog__header .app-icon { color: var(--cp-danger); font-size: 22px; }.full-access-dialog__header h2 { margin: 0; font-size: 16px; font-weight: 600; }.full-access-dialog__copy { margin: 0; color: var(--cp-text-secondary); font-size: 14px; line-height: 1.65; }.full-access-dialog__ack { margin-top: 18px; color: var(--cp-text); font-size: 14px; }.full-access-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; }.full-access-dialog__footer .el-button { min-width: 92px; margin: 0; font-weight: 600; }
</style>
