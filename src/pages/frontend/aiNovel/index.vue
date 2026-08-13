<template>
  <PageContainer v-if="desktopAvailable" class="novel-page" fill-content :show-header="false">
    <section v-if="loading || initialWorkspace" class="novel-home" :class="{ 'novel-home--loading': loading }" aria-live="polite">
      <div class="novel-home__background" aria-hidden="true"></div>
      <div class="novel-home__content">
        <div class="novel-illustration" aria-hidden="true">
          <div class="blob blob-1"></div><div class="blob blob-2"></div>
          <div class="book"><div class="book-cover"></div><div class="book-inner"></div><div class="book-spine"></div><div class="page-lines left"><i style="width:50px"></i><i style="width:46px"></i><i style="width:42px"></i><i style="width:48px"></i><i style="width:38px"></i><i style="width:50px"></i></div><div class="page-lines right"><i style="width:50px"></i><i style="width:46px"></i><i style="width:42px"></i><i style="width:48px"></i><i style="width:38px"></i></div></div>
          <div class="quill"><div class="quill-feather-2"></div><div class="quill-feather-1"></div><div class="quill-feather-inner"></div><div class="quill-stick"></div><div class="quill-stick-shadow"></div><div class="quill-tip"></div></div>
          <div class="sparkles sparkles-1"><b style="left:40px;top:0;color:#ffb800;font-size:14px">★</b><b style="left:90px;top:20px;color:#5d8bff;font-size:10px">★</b><b style="left:10px;top:50px;color:#ff6b9d;font-size:8px">★</b><b style="left:60px;top:60px;color:var(--cp-text);font-size:12px">★</b><b style="left:100px;top:70px;color:#34d399;font-size:9px">★</b><i style="left:0;top:30px;width:6px;height:6px;background:#5d8bff"></i><i style="left:105px;top:0;width:4px;height:4px;background:#ffb800"></i><i style="left:20px;top:90px;width:5px;height:5px;background:#ff6b9d"></i></div>
          <div class="sparkles sparkles-2"><b style="left:30px;top:0;color:#5d8bff;font-size:10px">★</b><b style="left:90px;top:30px;color:#ffb800;font-size:14px">★</b><b style="left:10px;top:60px;color:var(--cp-text);font-size:9px">★</b><i style="left:0;top:30px;width:5px;height:5px;background:#ff6b9d"></i><i style="left:60px;top:80px;width:6px;height:6px;background:#34d399"></i></div>
          <div class="ai-badge">AI</div>
        </div>
        <div class="novel-home__eyebrow">AI · 小说 · 创作</div>
        <h1>AI 小说创作工作台</h1>
        <p class="novel-home__subtitle">让 AI 成为你的创作伙伴 · 从灵感到完稿一气呵成</p>
        <div class="novel-home__status">
          <template v-if="loading">
            <div v-if="!loadingReady" class="novel-loading-state"><span class="novel-loading-dots"><i></i><i></i><i></i></span><span>{{ loadingMessage }}</span></div>
            <div v-if="!loadingReady" class="novel-progress" aria-hidden="true"><span :style="{ width: `${loadingProgress}%` }"></span></div>
            <div v-else class="novel-ready-state"><span><AppIcon name="Check" /></span> {{ readyMessage }}</div>
          </template>
          <template v-else>
            <div class="novel-ready-state"><span><AppIcon name="Check" /></span> 创作环境已就绪</div>
            <div class="novel-home__actions">
              <el-button type="primary" class="novel-home__primary" :loading="creatingProject" @click="createProject"><AppIcon name="MagicStick" />新建空白作品</el-button>
              <el-button class="novel-home__secondary" :disabled="creatingProject" @click="openTemplates"><AppIcon name="Files" />从模板开始</el-button>
            </div>
            <div class="novel-hotkey">{{ shortcutModifier }} + N 快速创建空白作品</div>
          </template>
        </div>
        <div class="novel-features">
          <article><span class="novel-feature-icon novel-feature-icon--gold"><AppIcon name="MagicStick" /></span><strong>作品设定</strong><p>世界观、人物、风格 · 一次设定全篇一致</p></article>
          <article><span class="novel-feature-icon novel-feature-icon--blue"><AppIcon name="Share" /></span><strong>故事总纲</strong><p>主线、暗线与节奏 · AI 帮你把握全篇走向</p></article>
          <article><span class="novel-feature-icon novel-feature-icon--pink"><AppIcon name="Document" /></span><strong>章节细纲</strong><p>场景、对话与冲突 · 一键展开到成稿</p></article>
        </div>
      </div>
    </section>
    <el-result v-else-if="!project" icon="warning" title="无法打开小说工作台" sub-title="请稍后重试。"><template #extra><el-button type="primary" @click="bootstrap">重新加载</el-button></template></el-result>
    <div v-else class="novel-workspace">
      <ProjectSidebar :project="project" :projects="projects" :stages="stages" :active-stage="activeStage" :active-chapter-id="activeChapterId" @create-project="createProject" @open-project="openProject" @remove-project="removeProject" @stage-change="activeStage = $event" @add-chapter="addChapter" @select-chapter="selectChapter" />
      <EditorWorkspace :project="project" :active-stage="activeStage" :stages="stages" :setup-fields="setupFields" :selected-chapter="selectedChapter" :chapter-index="chapterIndex" :saving="saving" :generating-chapter-title="generatingChapterTitle" :workspace-settings="workspaceSettings" :current-stage-label="currentStageLabel" @open-tool="openTool" @export="handleExport" @editor-mode="setEditorMode" @stage-change="activeStage = $event" @context-menu="openContextMenu" @run-outline="runOutline" @generate-chapter-title="generateChapterTitle" @move-chapter="moveChapter" @remove-chapter="removeChapter" @run-chapter-outline="runChapterOutline" @run-content="runContent" @continue-content="runContent(true)" @add-chapter="addChapter" />
      <AiPanel :assistant-role="assistantRole" :quick-actions="quickActions" :assistant-output="assistantOutput" :assistant-output-title="assistantOutputTitle" :pending-selection="pendingSelection" :assistant-prompt="assistantPrompt" :generating="generating" @role-change="assistantRole = $event" @quick-action="runQuickAction" @copy="copyText" @apply-selection="applySelectionResult" @prompt-change="assistantPrompt = $event" @send-message="sendAssistantMessage" @open-tool="openTool" />
    </div>

    <template v-if="project">
    <div v-if="contextMenu.visible" class="context-menu" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"><button type="button" @click="runSelectionAction('润色')">润色选中段落</button><button type="button" @click="runSelectionAction('扩写')">扩写选中段落</button><button type="button" @click="runSelectionAction('去除 AI 味')">去除 AI 味</button></div>

    <el-drawer v-model="toolVisible" :title="toolTitle" size="min(520px, 92vw)" destroy-on-close>
      <section v-if="activeTool === 'knowledge'" class="tool-pane"><div class="tool-toolbar"><el-button type="primary" @click="addKnowledge">新增条目</el-button></div><el-empty v-if="!project.knowledge.length" description="知识库会进入创作提示上下文" /><div v-for="entry in project.knowledge" :key="entry.id" class="tool-entry"><div class="tool-entry__heading"><el-input v-model="entry.title" placeholder="条目标题" /><el-button text type="danger" aria-label="删除知识库条目" @click="project.knowledge.splice(project.knowledge.indexOf(entry), 1)"><AppIcon name="Delete" /></el-button></div><el-input v-model="entry.category" placeholder="分类，例如人物、地点、设定" /><el-input v-model="entry.content" type="textarea" :rows="4" placeholder="事实、关系、规则或素材" /><el-input-tag v-model="entry.tags" placeholder="标签" /></div></section>
      <section v-else-if="activeTool === 'prompts'" class="tool-pane"><div class="tool-toolbar"><el-button type="primary" @click="addPrompt">新增模板</el-button><el-button @click="exportPrompts">导出模板</el-button><el-button @click="promptImport?.click()">导入模板</el-button><input ref="promptImport" class="file-input" type="file" accept="application/json,.json" @change="importPrompts" /></div><div v-for="prompt in project.prompts" :key="prompt.id" class="tool-entry"><div class="tool-entry__heading"><el-input v-model="prompt.name" placeholder="模板名称" /><el-button text type="danger" aria-label="删除提示词模板" @click="project.prompts.splice(project.prompts.indexOf(prompt), 1)"><AppIcon name="Delete" /></el-button></div><el-select v-model="prompt.scope"><el-option label="总纲" value="outline" /><el-option label="章节" value="chapter" /><el-option label="正文" value="content" /><el-option label="选中文本" value="selection" /></el-select><el-input v-model="prompt.content" type="textarea" :rows="5" placeholder="可引用作品设定、总纲、章节和知识库" /></div></section>
      <section v-else-if="activeTool === 'mindMap'" class="tool-pane"><p class="tool-description">以总纲为根节点，按主题建立可编辑的创作思维导图。</p><el-input v-model="project.mindMap.title" placeholder="根节点" /><div class="mind-nodes"><div v-for="node in project.mindMap.children" :key="node.id" class="mind-node"><el-input v-model="node.title" /><el-button circle text type="danger" aria-label="删除节点" @click="project.mindMap.children.splice(project.mindMap.children.indexOf(node), 1)"><AppIcon name="Delete" /></el-button></div></div><div class="tool-toolbar"><el-button @click="addMindNode">新增节点</el-button><el-button type="primary" :loading="generating" @click="generateMindMap">根据总纲生成节点</el-button></div></section>
      <section v-else-if="activeTool === 'ideas'" class="tool-pane"><p class="tool-description">根据作品设定生成书名和简介，结果会保存到当前作品。</p><el-button type="primary" :loading="generating" @click="generateIdea">生成书名与简介</el-button><div v-for="idea in project.generatedIdeas" :key="idea.id" class="idea-entry"><strong>{{ idea.title }}</strong><p>{{ idea.summary }}</p><el-button text @click="project.title = idea.title">用作作品标题</el-button></div></section>
      <section v-else-if="activeTool === 'splitter'" class="tool-pane"><p class="tool-description">粘贴长文本后，自动处理模型会按故事阶段拆成章节细纲。</p><el-input v-model="project.splitterSource" type="textarea" :rows="12" placeholder="粘贴需要拆分的文本" /><div class="tool-toolbar"><el-button type="primary" :loading="generating" @click="splitBook">开始拆书</el-button></div><el-input v-if="splitterResult" v-model="splitterResult" type="textarea" :rows="10" /><el-button v-if="splitterResult" @click="applySplitResult">导入章节</el-button></section>
      <section v-else-if="activeTool === 'optimizer'" class="tool-pane"><p class="tool-description">自动处理模型会对当前正文做一轮整体优化，保留原文直到你确认应用结果。</p><el-radio-group v-model="project.optimizer.mode"><el-radio-button value="paragraph">按段落</el-radio-button><el-radio-button value="sentence">按句子</el-radio-button></el-radio-group><el-input-number v-model="project.optimizer.iterations" :min="1" :max="3" /><div class="tool-toolbar"><el-button type="primary" :loading="generating" :disabled="!selectedChapter?.content" @click="optimizeContent">开始优化</el-button></div><el-input v-if="optimizerResult" v-model="optimizerResult" type="textarea" :rows="14" /><el-button v-if="optimizerResult" type="primary" @click="applyOptimizedContent">应用优化结果</el-button></section>
      <section v-else-if="activeTool === 'shortcuts'" class="tool-pane"><p class="tool-description">编辑器聚焦时按 Shift+L 可插入快捷词条。</p><div v-for="(shortcut, index) in workspaceSettings.shortcuts" :key="`${shortcut}-${index}`" class="shortcut-row"><el-input v-model="workspaceSettings.shortcuts[index]" /><el-button text type="danger" aria-label="删除快捷词条" @click="workspaceSettings.shortcuts.splice(index, 1)"><AppIcon name="Delete" /></el-button></div><div class="tool-toolbar"><el-button @click="workspaceSettings.shortcuts.push('')">新增词条</el-button><el-button type="primary" @click="saveWorkspaceSettings">保存词条</el-button></div></section>
    </el-drawer>
    <input ref="projectImport" class="file-input" type="file" accept="application/json,.json" @change="importProject" />
    </template>
  </PageContainer>
  <PageContainer v-else class="novel-page" fill-content :show-header="false">
    <section class="desktop-only-state" aria-labelledby="desktop-only-title">
      <div class="desktop-only-state__content">
        <span class="desktop-only-state__icon" aria-hidden="true"><AppIcon name="Monitor" :size="28" /></span>
        <h1 id="desktop-only-title">请在 Mira 桌面端继续创作</h1>
        <p>AI 小说需要在 Mira 桌面端访问本机作品库和创作模型。</p>
        <p class="desktop-only-state__hint">打开桌面端后，你可以继续编辑、保存和生成作品内容。</p>
      </div>
    </section>
  </PageContainer>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageContainer from '@/components/PageContainer/index.vue'
import AiPanel from './aiPanel/AiPanel.vue'
import EditorWorkspace from './editorWorkspace/EditorWorkspace.vue'
import ProjectSidebar from './projectSidebar/ProjectSidebar.vue'
import { DEFAULT_NOVEL_PROMPTS, DEFAULT_NOVEL_WORKSPACE_SETTINGS, type NovelChapter, type NovelModelRole, type NovelProjectDocument, type NovelProjectSummary, type NovelWorkspaceSettings } from '@/config/novel'
import { getPlatformApi } from '@/platform'
import type { EditorTarget, QuickAction, SetupField, Stage, StageDefinition, Tool } from './types'

const api = getPlatformApi()
const desktopAvailable = Boolean(api)
const loading = ref(true)
const initialWorkspace = ref(false)
const loadingMessage = ref('正在加载创作空间')
const loadingProgress = ref(0)
const loadingReady = ref(false)
const readyMessage = ref('创作环境已就绪')
const creatingProject = ref(false)
const saving = ref(false)
const generating = ref(false)
const projects = ref<NovelProjectSummary[]>([])
const project = ref<NovelProjectDocument>()
const activeStage = ref<Stage>('setup')
const activeChapterId = ref('')
const assistantRole = ref<NovelModelRole>('authoring')
const assistantPrompt = ref('')
const assistantOutput = ref('')
const assistantOutputTitle = ref('')
const toolVisible = ref(false)
const activeTool = ref<Tool>('knowledge')
const apiBaseUrl = ref('')
const splitterResult = ref('')
const optimizerResult = ref('')
const generatingChapterTitle = ref(false)
const workspaceSettings = reactive<NovelWorkspaceSettings>({ ...DEFAULT_NOVEL_WORKSPACE_SETTINGS })
const projectImport = ref<HTMLInputElement>()
const promptImport = ref<HTMLInputElement>()
const contextMenu = reactive({ visible: false, x: 0, y: 0, target: '' as EditorTarget, start: 0, end: 0, text: '' })
const pendingSelection = ref(false)
const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const shortcutModifier = isMac ? '⌘' : 'Ctrl'
let saveTimer: number | undefined

const stages: StageDefinition[] = [
  { key: 'setup' as const, title: '作品设定', icon: 'Setting' },
  { key: 'outline' as const, title: '故事总纲', icon: 'Share' },
  { key: 'chapter' as const, title: '章节细纲', icon: 'Document' },
]
const setupFields: SetupField[] = [
  { key: 'background' as const, label: '故事背景', placeholder: '世界、时代、地点和独特规则' },
  { key: 'characters' as const, label: '人物设定', placeholder: '主角、配角、动机、目标与弱点' },
  { key: 'relationships' as const, label: '角色关系', placeholder: '人物间的利益、情感和冲突' },
  { key: 'plot' as const, label: '核心剧情', placeholder: '起点、核心矛盾、转折和结局方向' },
  { key: 'writingStyle' as const, label: '写作风格', placeholder: '叙事视角、节奏、语言与参考方向' },
]
const quickActions: QuickAction[] = [
  { key: 'continue', title: '继续创作', icon: 'EditPen' },
  { key: 'scene', title: '扩写场景', icon: 'Picture' },
  { key: 'dialogue', title: '强化对白', icon: 'ChatLineRound' },
  { key: 'foreshadow', title: '补充伏笔', icon: 'Connection' },
]

const selectedChapter = computed(() => project.value?.chapters.find(item => item.id === activeChapterId.value))
const chapterIndex = computed(() => project.value?.chapters.findIndex(item => item.id === activeChapterId.value) ?? -1)
const currentStageLabel = computed(() => activeStage.value === 'content' ? '正文' : stages.find(item => item.key === activeStage.value)?.title || '')
const toolTitle = computed(() => ({ knowledge: '知识库', prompts: '提示词模板', mindMap: '思维导图', ideas: '书名与简介', splitter: '拆书', optimizer: '批量优化', shortcuts: '快捷词条' })[activeTool.value])

function newId() { return crypto.randomUUID() }
function formatChapterLabel(index: number) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  const number = Math.max(1, index)
  if (number < 10) return `第${digits[number]}章`
  if (number < 20) return `第十${number === 10 ? '' : digits[number % 10]}章`
  if (number < 100) return `第${digits[Math.floor(number / 10)]}十${number % 10 ? digits[number % 10] : ''}章`
  return `第${number}章`
}

async function bootstrap() {
  if (!api) return
  loading.value = true; initialWorkspace.value = false; loadingReady.value = false; loadingMessage.value = '正在加载创作空间'; loadingProgress.value = 0
  try {
    const [loadedProjects, baseUrl, settings] = await Promise.all([api.listNovelProjects(), api.getNovelApiBaseUrl(), api.getNovelWorkspaceSettings()])
    projects.value = loadedProjects
    apiBaseUrl.value = baseUrl
    workspaceSettings.shortcuts.splice(0, workspaceSettings.shortcuts.length, ...settings.shortcuts)
    workspaceSettings.editorMode = settings.editorMode === 'rich' ? 'rich' : 'markdown'
    if (!projects.value.length) {
      readyMessage.value = '创作环境已就绪'
      await showLoadingSteps(['正在准备创作环境', '正在初始化工作台', '马上就全部搞定了'], 4000, 100)
      loadingReady.value = true
      await new Promise(resolve => window.setTimeout(resolve, 800))
      initialWorkspace.value = true
    } else {
      readyMessage.value = '作品已经加载完成'
      await Promise.all([
        openProject(projects.value[0].id),
        showLoadingSteps(['正在加载作品', '正在读取上次创作内容', '马上就好了'], 2000, 90),
      ])
      loadingProgress.value = 100
      await new Promise(resolve => window.setTimeout(resolve, 180))
      loadingReady.value = true
      await new Promise(resolve => window.setTimeout(resolve, 800))
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '小说工作台初始化失败')
  } finally { loading.value = false; loadingReady.value = false }
}

async function showLoadingSteps(messages: string[], duration: number, targetProgress: number) {
  loadingMessage.value = messages[0]
  await nextTick()
  const startedAt = performance.now()
  const interval = duration / messages.length
  let messageIndex = 0
  await new Promise<void>(resolve => {
    function update(now: number) {
      const elapsed = Math.min(now - startedAt, duration)
      loadingProgress.value = Math.round((elapsed / duration) * targetProgress)
      const nextIndex = Math.min(messages.length - 1, Math.floor(elapsed / interval))
      if (nextIndex !== messageIndex) { messageIndex = nextIndex; loadingMessage.value = messages[messageIndex] }
      if (elapsed >= duration) { resolve(); return }
      window.requestAnimationFrame(update)
    }
    window.requestAnimationFrame(update)
  })
}

async function refreshProjects() { if (api) projects.value = await api.listNovelProjects() }
async function openProject(id: string) {
  if (!api) return
  try { project.value = await api.getNovelProject(id); activeChapterId.value = project.value.chapters[0]?.id || ''; activeStage.value = project.value.chapters.length ? 'content' : 'setup'; assistantOutput.value = '' } catch (error) { ElMessage.error(error instanceof Error ? error.message : '打开作品失败') }
}
async function createProject() {
  if (!api || creatingProject.value) return
  creatingProject.value = true
  try { project.value = await api.createNovelProject(); initialWorkspace.value = false; await refreshProjects(); activeChapterId.value = ''; activeStage.value = 'setup'; ElMessage.success('已新建作品') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '新建作品失败') } finally { creatingProject.value = false }
}
async function removeProject(id: string) {
  if (!api) return
  const item = projects.value.find(projectItem => projectItem.id === id)
  try { await ElMessageBox.confirm(`确定删除“${item?.title || '此作品'}”吗？删除后无法恢复。`, '删除作品', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }) } catch { return }
  try {
    await api.deleteNovelProject(id)
    await refreshProjects()
    if (project.value?.id === id) {
      const next = projects.value[0]
      if (next) await openProject(next.id)
      else { project.value = undefined; initialWorkspace.value = true; activeChapterId.value = ''; activeStage.value = 'setup' }
    }
    ElMessage.success('作品已删除')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '删除作品失败') }
}
function selectChapter(id: string) { activeChapterId.value = id; activeStage.value = 'chapter' }
function addChapter() {
  if (!project.value) return
  const index = project.value.chapters.length + 1
  const chapter: NovelChapter = { id: newId(), title: `第${index}章`, outline: '', content: '' }
  project.value.chapters.push(chapter); activeChapterId.value = chapter.id; activeStage.value = 'chapter'
}
async function removeChapter() {
  if (!project.value || !selectedChapter.value) return
  try { await ElMessageBox.confirm(`确定删除“${selectedChapter.value.title}”吗？`, '删除章节', { type: 'warning' }) } catch { return }
  project.value.chapters.splice(chapterIndex.value, 1); activeChapterId.value = project.value.chapters[0]?.id || ''; activeStage.value = project.value.chapters.length ? 'chapter' : 'setup'
}
function moveChapter(direction: number) {
  if (!project.value || chapterIndex.value < 0) return
  const nextIndex = chapterIndex.value + direction
  if (nextIndex < 0 || nextIndex >= project.value.chapters.length) return
  const chapters = project.value.chapters; [chapters[chapterIndex.value], chapters[nextIndex]] = [chapters[nextIndex], chapters[chapterIndex.value]]
}
function scheduleSave() { if (!api || !project.value) return; window.clearTimeout(saveTimer); saveTimer = window.setTimeout(saveProject, 600) }
async function saveProject() { if (!api || !project.value) return; saving.value = true; try { const payload = JSON.parse(JSON.stringify(project.value)) as NovelProjectDocument; await api.saveNovelProject(payload); await refreshProjects() } catch (error) { ElMessage.error(error instanceof Error ? error.message : '自动保存失败') } finally { saving.value = false } }
watch(project, scheduleSave, { deep: true })

function buildContext() {
  if (!project.value) return ''
  const chapter = selectedChapter.value
  return `作品：${project.value.title}\n背景：${project.value.story.background}\n人物：${project.value.story.characters}\n关系：${project.value.story.relationships}\n剧情：${project.value.story.plot}\n风格：${project.value.story.writingStyle}\n总纲：${project.value.outline}\n当前章节：${chapter?.title || '无'}\n章节细纲：${chapter?.outline || ''}\n知识库：${project.value.knowledge.map(item => `${item.title}:${item.content}`).join('\n')}`
}
async function stream(role: NovelModelRole, prompt: string, title: string) {
  if (!apiBaseUrl.value) throw new Error('小说模型服务尚未启动')
  generating.value = true; assistantOutput.value = ''; assistantOutputTitle.value = title
  try {
    const response = await fetch(`${apiBaseUrl.value}${role}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) })
    if (!response.ok || !response.body) throw new Error(await response.text() || '模型没有返回内容')
    const reader = response.body.getReader(); const decoder = new TextDecoder()
    while (true) { const { done, value } = await reader.read(); if (done) break; assistantOutput.value += decoder.decode(value, { stream: true }) }
    return assistantOutput.value.trim()
  } finally { generating.value = false }
}
async function runOutline() { if (!project.value) return; const prompt = project.value.prompts.find(item => item.id === 'outline')?.content || DEFAULT_NOVEL_PROMPTS[0].content; const output = await stream('authoring', `${prompt}\n\n${buildContext()}\n\n只返回可直接使用的故事总纲。`, '故事总纲'); if (output) project.value.outline = output }
async function generateChapterTitle() {
  const chapter = selectedChapter.value
  if (!chapter || generatingChapterTitle.value) return
  const chapterId = chapter.id
  const chapterLabel = formatChapterLabel(chapterIndex.value + 1)
  const currentTitle = chapter.title.trim() || chapterLabel
  generatingChapterTitle.value = true
  try {
    const output = await stream('authoring', `基于以下小说上下文，为当前章节生成一个简洁、有吸引力的中文副标题。章节序号由系统固定为“${chapterLabel}”，当前输入框标题是“${currentTitle}”。只返回副标题，例如“废柴替身？这个局我接了”；绝对不要返回章节序号、编号、“第几章”、解释、引号、Markdown 或“章节名称：”前缀。\n\n${buildContext()}\n\n当前章节细纲：${chapter.outline || '尚未编写'}`, '生成章节名称')
    const subtitle = output.replace(/^(?:章节名称|标题)\s*[：:]\s*/, '').replace(/^#+\s*/, '').replace(/^(?:第[一二三四五六七八九十百千0-9]+章)\s*[：:：、.\-\s]*/, '').replace(/[“”"']/g, '').split('\n')[0]?.trim()
    const target = project.value?.chapters.find(item => item.id === chapterId)
    if (subtitle && target) target.title = `${chapterLabel} ${subtitle}`
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '章节名称生成失败')
  } finally {
    generatingChapterTitle.value = false
  }
}
async function runChapterOutline() { const chapter = selectedChapter.value; const currentProject = project.value; if (!chapter || !currentProject) return; const prompt = currentProject.prompts.find(item => item.id === 'chapter')?.content || DEFAULT_NOVEL_PROMPTS[1].content; const output = await stream('authoring', `${prompt}\n\n${buildContext()}\n\n当前章节标题：${chapter.title}\n只返回章节细纲。`, '章节细纲'); if (output && selectedChapter.value?.id === chapter.id) selectedChapter.value.outline = output }
async function runContent(continueWriting = false) { if (!selectedChapter.value) return; const prompt = project.value?.prompts.find(item => item.id === 'content')?.content || DEFAULT_NOVEL_PROMPTS[2].content; const output = await stream('authoring', `${prompt}\n\n${buildContext()}\n\n当前正文：${selectedChapter.value.content}\n${continueWriting ? '从正文结尾继续创作，只返回新增内容。' : '生成本章正文，只返回正文内容。'}`, continueWriting ? '继续创作' : '生成正文'); if (output) selectedChapter.value.content = continueWriting && selectedChapter.value.content ? `${selectedChapter.value.content}\n\n${output}` : output }
async function runQuickAction(key: string) {
  if (!selectedChapter.value && key !== 'foreshadow') { ElMessage.warning('请先选择一个章节'); return }
  const instruction = { continue: '续写当前正文，推进事件。', scene: '扩写当前正文中的场景感官细节。', dialogue: '为当前场景补充自然、推动冲突的对白。', foreshadow: '为当前总纲补充自然且可回收的伏笔。' }[key] || ''
  const output = await stream(assistantRole.value, `${instruction}\n\n${buildContext()}\n\n当前正文：${selectedChapter.value?.content || ''}`, quickActions.find(item => item.key === key)?.title || '创作建议')
  if (output && selectedChapter.value && key !== 'foreshadow') selectedChapter.value.content = `${selectedChapter.value.content}\n\n${output}`.trim()
  if (output && key === 'foreshadow' && project.value) project.value.outline = `${project.value.outline}\n\n${output}`.trim()
}
async function sendAssistantMessage() { if (!assistantPrompt.value.trim() || !project.value) return; const message = assistantPrompt.value.trim(); assistantPrompt.value = ''; project.value.assistantMessages.push({ id: newId(), role: 'user', content: message, createdAt: Date.now() }); const output = await stream(assistantRole.value, `${buildContext()}\n\n用户问题：${message}`, '创作助手'); if (output) project.value.assistantMessages.push({ id: newId(), role: 'assistant', content: output, createdAt: Date.now() }) }

function openContextMenu(event: MouseEvent, target: EditorTarget) {
  const element = event.target as HTMLTextAreaElement; const text = element.value.slice(element.selectionStart, element.selectionEnd)
  if (!text) return
  event.preventDefault(); Object.assign(contextMenu, { visible: true, x: event.clientX, y: event.clientY, target, start: element.selectionStart, end: element.selectionEnd, text }); pendingSelection.value = false
}
function getTargetText(target: EditorTarget) { return target === 'outline' ? project.value?.outline || '' : target === 'chapter' ? selectedChapter.value?.outline || '' : selectedChapter.value?.content || '' }
function setTargetText(target: EditorTarget, value: string) { if (!project.value) return; if (target === 'outline') project.value.outline = value; else if (target === 'chapter' && selectedChapter.value) selectedChapter.value.outline = value; else if (target === 'content' && selectedChapter.value) selectedChapter.value.content = value }
async function runSelectionAction(action: string) { const template = project.value?.prompts.find(item => item.scope === 'selection')?.content || DEFAULT_NOVEL_PROMPTS[3].content; contextMenu.visible = false; pendingSelection.value = true; await stream('authoring', `${template}\n\n操作：${action}\n\n${buildContext()}\n\n选中文本：${contextMenu.text}`, `${action}选中文本`) }
function applySelectionResult() { if (!assistantOutput.value) return; const current = getTargetText(contextMenu.target); setTargetText(contextMenu.target, `${current.slice(0, contextMenu.start)}${assistantOutput.value}${current.slice(contextMenu.end)}`); pendingSelection.value = false; ElMessage.success('已应用到编辑内容') }
function openTool(tool: Tool) { activeTool.value = tool; toolVisible.value = true; splitterResult.value = ''; optimizerResult.value = '' }
function openTemplates() { ElMessage.info('模板功能暂未开放') }
function addKnowledge() { project.value?.knowledge.push({ id: newId(), category: '', title: '', content: '', tags: [] }) }
function addPrompt() { project.value?.prompts.push({ id: newId(), name: '未命名模板', scope: 'content', content: '' }) }
function addMindNode() { project.value?.mindMap.children.push({ id: newId(), title: '新节点', children: [] }) }
async function generateMindMap() { if (!project.value?.outline) { ElMessage.warning('请先完成故事总纲'); return }; const output = await stream('authoring', `根据以下故事总纲，列出 4 到 8 个思维导图一级节点，每行一个节点标题，不要编号或解释。\n\n${project.value.outline}`, '思维导图节点'); if (output && project.value) project.value.mindMap.children = output.split('\n').map(title => title.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).map(title => ({ id: newId(), title, children: [] })) }
async function generateIdea() { if (!project.value) return; const output = await stream('authoring', `基于以下创作信息生成一个小说书名和简介。第一行必须是“书名：”，后续为简介。\n\n${buildContext()}`, '书名与简介'); if (output) { const [first, ...rest] = output.split('\n'); project.value.generatedIdeas.unshift({ id: newId(), title: first.replace(/^书名[：:]/, '').trim() || '未命名书名', summary: rest.join('\n').trim(), createdAt: Date.now() }) } }
async function splitBook() { if (!project.value?.splitterSource.trim()) { ElMessage.warning('请先粘贴需要拆分的文本'); return }; splitterResult.value = await stream('automation', `将以下文本拆分为章节细纲。每章以“## 章节标题”开头，后续给出简洁细纲。\n\n${project.value.splitterSource}`, '拆书结果') }
function applySplitResult() { if (!project.value || !splitterResult.value) return; const sections = splitterResult.value.split(/^##\s+/m).filter(Boolean); sections.forEach((section, index) => { const [title, ...outline] = section.split('\n'); project.value?.chapters.push({ id: newId(), title: title.trim() || `第${project.value!.chapters.length + index + 1}章`, outline: outline.join('\n').trim(), content: '' }) }); const chapters = project.value.chapters; activeChapterId.value = chapters.length ? chapters[chapters.length - 1].id : ''; toolVisible.value = false; activeStage.value = 'chapter'; ElMessage.success('已导入拆分章节') }
async function optimizeContent() { if (!selectedChapter.value) return; optimizerResult.value = await stream('automation', `按${project.value?.optimizer.mode === 'sentence' ? '句子' : '段落'}优化以下小说正文，保持事实、视角和剧情推进。只返回优化后的正文。\n\n${selectedChapter.value.content}`, '批量优化') }
function applyOptimizedContent() { if (!selectedChapter.value || !optimizerResult.value) return; selectedChapter.value.content = optimizerResult.value; toolVisible.value = false; ElMessage.success('已应用优化结果') }
async function saveWorkspaceSettings(showMessage = true) {
  if (!api) return
  const result = await api.saveNovelWorkspaceSettings({ shortcuts: [...workspaceSettings.shortcuts], editorMode: workspaceSettings.editorMode })
  workspaceSettings.shortcuts.splice(0, workspaceSettings.shortcuts.length, ...result.shortcuts)
  workspaceSettings.editorMode = result.editorMode
  if (showMessage) ElMessage.success('工作区设置已保存')
}
function setEditorMode(mode: 'markdown' | 'rich') {
  if (workspaceSettings.editorMode === mode) return
  workspaceSettings.editorMode = mode
  void saveWorkspaceSettings(false)
}
function download(text: string, filename: string, type = 'text/plain;charset=utf-8') { const url = URL.createObjectURL(new Blob([text], { type })); const link = Object.assign(document.createElement('a'), { href: url, download: filename }); link.click(); URL.revokeObjectURL(url) }
function toManuscript() { if (!project.value) return ''; return `# ${project.value.title}\n\n${project.value.outline ? `## 故事总纲\n${project.value.outline}\n\n` : ''}${project.value.chapters.map(chapter => `## ${chapter.title}\n\n${chapter.content || chapter.outline}`).join('\n\n')}` }
async function handleExport(command: string) { if (!project.value || !api) return; if (command === 'import') { projectImport.value?.click(); return }; if (command === 'json') download(await api.exportNovelProject(project.value.id), `${project.value.title}.json`, 'application/json'); else download(toManuscript(), `${project.value.title}.${command === 'markdown' ? 'md' : 'txt'}`) }
async function importProject(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file || !api) return; try { project.value = await api.importNovelProject(await file.text()); await refreshProjects(); activeStage.value = 'setup'; ElMessage.success('项目已导入') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '项目导入失败') } finally { input.value = '' } }
function exportPrompts() { if (!project.value) return; download(JSON.stringify(project.value.prompts, null, 2), `${project.value.title}-prompts.json`, 'application/json') }
async function importPrompts(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file || !project.value) return; try { const parsed = JSON.parse(await file.text()); if (!Array.isArray(parsed)) throw new Error('文件必须是提示词模板数组'); project.value.prompts = parsed.filter(item => item && typeof item.name === 'string' && typeof item.content === 'string').map(item => ({ id: newId(), name: item.name, content: item.content, scope: ['outline', 'chapter', 'content', 'selection'].includes(item.scope) ? item.scope : 'content' })); ElMessage.success('提示词模板已导入') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '模板导入失败') } finally { input.value = '' } }
async function copyText(value: string) { try { await navigator.clipboard.writeText(value); ElMessage.success('已复制') } catch { ElMessage.error('复制失败') } }
function handleKeydown(event: KeyboardEvent) {
  if (initialWorkspace.value && event.key.toLowerCase() === 'n' && (isMac ? event.metaKey : event.ctrlKey) && !event.shiftKey && !event.altKey) {
    event.preventDefault(); void createProject(); return
  }
  if (!event.shiftKey || event.key.toLowerCase() !== 'l' || event.isComposing || !workspaceSettings.shortcuts.length) return
  const target = event.target as HTMLTextAreaElement; if (!(target instanceof HTMLTextAreaElement)) return
  event.preventDefault(); const phrase = workspaceSettings.shortcuts[0]; target.setRangeText(phrase, target.selectionStart, target.selectionEnd, 'end'); target.dispatchEvent(new Event('input', { bubbles: true })); ElMessage.info(`已插入快捷词条：${phrase}`)
}
onMounted(() => { void bootstrap(); window.addEventListener('keydown', handleKeydown); window.addEventListener('click', () => { contextMenu.visible = false }) })
onBeforeUnmount(() => { window.clearTimeout(saveTimer); window.removeEventListener('keydown', handleKeydown) })
</script>

<style scoped lang="scss">
.novel-page { flex: 1; min-height: 0; :deep(.page-container), :deep(.page-content) { height: 100%; min-height: 0; padding: 0; } }
.novel-home { position: relative; display: grid; flex: 1; min-height: 640px; place-items: center; overflow: hidden; background: var(--cp-bg); isolation: isolate; }.novel-home__background { position: absolute; z-index: -1; inset: 0; overflow: hidden; background: radial-gradient(circle at 28% 18%, rgb(255 179 51 / 13%), transparent 28%), radial-gradient(circle at 76% 70%, rgb(102 128 255 / 10%), transparent 30%), var(--cp-bg); }.novel-home__background::before, .novel-home__background::after { position: absolute; width: 45vmin; max-width: 560px; aspect-ratio: 1; content: ''; border-radius: 50%; filter: blur(38px); }.novel-home__background::before { top: -20%; left: 8%; background: rgb(255 107 157 / 7%); }.novel-home__background::after { right: 4%; bottom: -26%; background: rgb(52 211 153 / 6%); }.novel-home__content { display: flex; width: min(100%, 900px); align-items: center; flex-direction: column; padding: 32px 24px; text-align: center; }.novel-illustration { position: relative; width: 272px; height: 178px; margin-bottom: 2px; }.novel-book { position: absolute; bottom: 18px; left: 56px; width: 140px; height: 104px; border: 8px solid var(--cp-text); border-radius: 5px; background: var(--cp-bg-elevated); box-shadow: 0 16px 28px rgb(0 0 0 / 13%); transform: perspective(300px) rotateX(6deg) rotateZ(-2deg); }.novel-book::after { position: absolute; top: 0; bottom: 0; left: calc(50% - 2px); width: 4px; content: ''; background: var(--cp-border); }.novel-book__page { position: absolute; top: 15px; width: 43%; height: 64px; background: repeating-linear-gradient(to bottom, transparent 0 8px, var(--cp-text-tertiary) 8px 10px, transparent 10px 16px); opacity: .65; }.novel-book__page--left { left: 12px; }.novel-book__page--right { right: 12px; }.novel-quill { position: absolute; z-index: 1; top: 12px; left: 144px; width: 74px; height: 150px; padding: 10px; color: #ffb833; background: color-mix(in srgb, #ffb833 18%, var(--cp-bg-elevated)); border-radius: 42px 42px 8px 42px; transform: rotate(28deg); }.novel-ai-badge { position: absolute; top: 19px; right: 11px; display: grid; width: 48px; height: 48px; place-items: center; color: var(--cp-bg); background: var(--cp-text); border-radius: 50%; font-size: 14px; font-weight: $font-bold; }.novel-star { position: absolute; color: #ffb833; }.novel-star--one { top: 21px; left: 46px; font-size: 16px; }.novel-star--two { top: 68px; right: 5px; color: #6680ff; font-size: 12px; }.novel-star--three { bottom: 35px; left: 29px; color: #ff6b9d; font-size: 9px; }.novel-home__eyebrow { margin-top: 2px; color: #dc9410; font-size: $font-xs; font-weight: $font-semibold; letter-spacing: .04em; }.novel-home h1 { margin: 10px 0 0; color: var(--cp-text); font-size: 42px; font-weight: $font-bold; line-height: 1.2; letter-spacing: 0; }.novel-home__subtitle { margin: 10px 0 0; color: var(--cp-text-secondary); font-size: $font-base; line-height: $line-height-relaxed; }.novel-loading-state, .novel-ready-state { display: flex; min-height: 42px; align-items: center; justify-content: center; gap: 10px; margin-top: 18px; color: var(--cp-text-secondary); font-size: $font-sm; font-weight: $font-medium; }.novel-loading-dots { display: inline-flex; gap: 5px; }.novel-loading-dots i { width: 7px; height: 7px; background: var(--cp-text); border-radius: 50%; animation: novel-dot-pulse 1.2s ease-in-out infinite; }.novel-loading-dots i:nth-child(2) { animation-delay: .15s; }.novel-loading-dots i:nth-child(3) { animation-delay: .3s; }.novel-ready-state { color: #168447; }.novel-ready-state > span { display: grid; width: 20px; height: 20px; place-items: center; color: #fff; background: #168447; border-radius: 50%; font-size: 12px; }.novel-progress { width: min(320px, 76vw); height: 6px; margin-top: 1px; overflow: hidden; background: var(--cp-bg-hover); border-radius: 999px; }.novel-progress span { display: block; width: 45%; height: 100%; background: linear-gradient(90deg, #ffb833, #ff6b9d, #6680ff); border-radius: inherit; animation: novel-progress 1.3s ease-in-out infinite; }.novel-home__actions { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; }.novel-home__actions :deep(.el-button) { height: 42px; margin: 0; padding: 0 17px; border-radius: $radius-md; font-weight: $font-semibold; }.novel-home__primary :deep(.app-icon) { color: #ffcf5c; }.novel-home__secondary { color: var(--cp-text) !important; background: var(--cp-bg-elevated) !important; border-color: var(--cp-border) !important; }.novel-hotkey { margin-top: 9px; color: var(--cp-text-tertiary); font-size: $font-xs; }.novel-features { display: grid; width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 22px; }.novel-features article { min-height: 140px; padding: 18px; text-align: left; background: color-mix(in srgb, var(--cp-bg-elevated) 86%, transparent); border: 1px solid var(--cp-border-light); border-radius: $radius-md; box-shadow: $shadow-sm; }.novel-features strong { display: block; margin-top: 12px; color: var(--cp-text); font-size: $font-base; }.novel-features p { margin: 7px 0 0; color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.65; }.novel-feature-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: $radius-md; font-size: 19px; }.novel-feature-icon--gold { color: #d98c00; background: #fff4dc; }.novel-feature-icon--blue { color: #527be0; background: #e8efff; }.novel-feature-icon--pink { color: #df5d8a; background: #ffe8f0; } @include dark-mode { .novel-home__background { background: radial-gradient(circle at 28% 18%, rgb(255 179 51 / 16%), transparent 28%), radial-gradient(circle at 76% 70%, rgb(102 128 255 / 18%), transparent 30%), var(--cp-bg); }.novel-book { box-shadow: 0 16px 28px rgb(0 0 0 / 32%); }.novel-book__page { opacity: .45; }.novel-quill { color: #ffd274; background: rgb(255 184 51 / 17%); }.novel-ai-badge { color: var(--cp-text); background: var(--cp-bg-elevated); }.novel-home__eyebrow { color: #ffc857; }.novel-loading-dots i { background: #ffc857; }.novel-features article { background: color-mix(in srgb, var(--cp-bg-elevated) 92%, transparent); border-color: var(--cp-border); box-shadow: $dark-shadow-sm; }.novel-feature-icon--gold { color: #ffc857; background: rgb(255 184 51 / 15%); }.novel-feature-icon--blue { color: #88a5ff; background: rgb(102 128 255 / 16%); }.novel-feature-icon--pink { color: #ff8eb2; background: rgb(255 107 157 / 16%); } } @keyframes novel-dot-pulse { 0%, 80%, 100% { opacity: .35; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } } @keyframes novel-progress { 0% { transform: translateX(-100%); } 55% { transform: translateX(165%); } 100% { transform: translateX(240%); } } @media (prefers-reduced-motion: reduce) { .novel-loading-dots i, .novel-progress span { animation: none; }.novel-progress span { transform: translateX(70%); } }
.desktop-only-state { display: flex; flex: 1; align-items: center; justify-content: center; min-height: 0; padding: $spacing-3xl $spacing-lg; text-align: center; }.desktop-only-state__content { max-width: 440px; }.desktop-only-state__icon { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; margin-bottom: $spacing-lg; color: var(--cp-primary); background: var(--cp-primary-lighter); border-radius: $radius-lg; }.desktop-only-state h1 { margin: 0; color: var(--cp-text); font-size: $font-xl; font-weight: $font-semibold; line-height: $line-height-tight; }.desktop-only-state p { margin: $spacing-sm 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: $line-height-relaxed; }.desktop-only-state__hint { color: var(--cp-text-tertiary) !important; }
.novel-workspace { position: relative; display: grid; grid-template-columns: 224px minmax(0, 1fr) 280px; height: 100%; min-height: 640px; background: var(--cp-bg); }
.context-menu { position: fixed; z-index: $z-popover; display: flex; flex-direction: column; min-width: 150px; padding: $spacing-xs; background: var(--cp-bg-overlay); border: 1px solid var(--cp-border); border-radius: $radius-md; box-shadow: $shadow-md; }.context-menu button { padding: 7px 8px; color: var(--cp-text); text-align: left; cursor: pointer; background: transparent; border: 0; border-radius: $radius-sm; font: inherit; font-size: $font-xs; }.context-menu button:hover { background: var(--cp-bg-hover); }
.tool-pane { display: flex; flex-direction: column; gap: $spacing-md; }.tool-description { margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.65; }.tool-entry, .idea-entry { display: flex; flex-direction: column; gap: $spacing-sm; padding: $spacing-md 0; border-bottom: 1px solid var(--cp-border-light); }.tool-entry__heading :deep(.el-input) { flex: 1; }.tool-entry :deep(.el-select) { width: 130px; }.mind-nodes { display: flex; flex-direction: column; gap: $spacing-sm; }.mind-node, .shortcut-row { display: flex; align-items: center; gap: $spacing-sm; }.mind-node :deep(.el-input), .shortcut-row :deep(.el-input) { flex: 1; }.idea-entry strong { color: var(--cp-text); font-size: $font-base; }.idea-entry p { margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.7; white-space: pre-wrap; }.file-input { display: none; }
@include media-max($breakpoint-lg) { .novel-workspace { grid-template-columns: 190px minmax(0, 1fr); } }
@include media-max($breakpoint-md) { .novel-workspace { display: block; min-height: 0; }.novel-home { min-height: 0; overflow-y: auto; }.novel-home__content { padding: 28px 16px; }.novel-illustration { transform: scale(.88); transform-origin: center bottom; margin-bottom: -10px; }.novel-features { grid-template-columns: 1fr; max-width: 360px; gap: 10px; }.novel-features article { display: grid; min-height: 0; grid-template-columns: 38px 1fr; column-gap: 12px; padding: 14px; }.novel-features strong { align-self: end; margin: 0; }.novel-features p { grid-column: 2; margin-top: 3px; }.novel-feature-icon { grid-row: span 2; } }
.novel-illustration { width: 560px; height: 280px; position: relative; margin-bottom: 0; }.book { position: absolute; left: 200px; top: 80px; width: 160px; height: 130px; }.book-cover { position: absolute; inset: 0; background: var(--cp-text); border-radius: 4px; }.book-inner { position: absolute; left: 10px; top: 10px; width: 140px; height: 110px; background: var(--cp-bg-elevated); border-radius: 2px; }.book-spine { position: absolute; left: 78px; top: 10px; width: 4px; height: 110px; background: var(--cp-border); }.page-lines { position: absolute; display: flex; flex-direction: column; gap: 6px; padding: 8px 6px; }.page-lines.left { left: 10px; top: 10px; width: 68px; height: 110px; }.page-lines.right { left: 82px; top: 10px; width: 68px; height: 110px; }.page-lines i { display: block; height: 2px; border-radius: 1px; background: var(--cp-text-tertiary); }.page-lines.right i:first-child { background: var(--cp-text); }.quill { position: absolute; left: 340px; top: 30px; width: 80px; height: 200px; transform: rotate(-20deg); transform-origin: center; }.quill-stick { position: absolute; left: 36px; top: 0; width: 8px; height: 200px; background: #ffb800; border-radius: 2px; }.quill-stick-shadow { position: absolute; left: 42px; top: 0; width: 3px; height: 200px; background: #e5a300; border-radius: 2px; }.quill-feather-1 { position: absolute; left: 0; top: 10px; width: 40px; height: 60px; background: var(--cp-bg-elevated); border-radius: 20px 0 0 20px; transform: rotate(-30deg); }.quill-feather-2 { position: absolute; left: 0; top: 0; width: 48px; height: 80px; background: var(--cp-bg-elevated); border-radius: 24px 0 0 24px; transform: rotate(-15deg); }.quill-feather-inner { position: absolute; left: 10px; top: 5px; width: 30px; height: 70px; background: #ffe5b8; border-radius: 15px 0 0 15px; transform: rotate(-15deg); }.quill-tip { position: absolute; left: 36px; top: 200px; width: 14px; height: 6px; background: var(--cp-text); border-radius: 0 0 4px 4px; }.sparkles { position: absolute; }.sparkles-1 { left: 80px; top: 60px; width: 120px; height: 100px; }.sparkles-2 { left: 400px; top: 140px; width: 120px; height: 100px; }.sparkles b { position: absolute; line-height: 1; font-weight: 400; }.sparkles i { position: absolute; display: block; border-radius: 50%; }.ai-badge { position: absolute; left: 430px; top: 50px; display: flex; width: 60px; height: 60px; align-items: center; justify-content: center; color: var(--cp-bg); background: var(--cp-text); border-radius: 50%; font-size: 18px; font-weight: 700; }.blob { position: absolute; border-radius: 50%; filter: blur(20px); pointer-events: none; }.blob-1 { left: 60px; top: 20px; width: 440px; height: 240px; background: radial-gradient(ellipse, rgb(255 179 51 / 8%) 0%, transparent 70%); }.blob-2 { left: 120px; top: 40px; width: 340px; height: 200px; background: radial-gradient(ellipse, rgb(102 128 255 / 6%) 0%, transparent 70%); } @include dark-mode { .page-lines i { background: #4a4a4e; }.page-lines i:first-child, .page-lines.right i:first-child { background: #8e8e99; }.book-inner, .quill-feather-1, .quill-feather-2 { background: #f5f5f7; }.ai-badge { color: #1f1f23; background: #f5f5f7; }.blob-1 { background: radial-gradient(ellipse, rgb(255 179 51 / 18%) 0%, transparent 70%); }.blob-2 { background: radial-gradient(ellipse, rgb(102 128 255 / 20%) 0%, transparent 70%); } }
@include media-max($breakpoint-md) { .novel-illustration { transform: scale(.7); transform-origin: center top; margin-bottom: -52px; } }
.novel-progress { width: min(320px, 76vw); height: 6px; margin-top: 0; border-radius: 3px; }.novel-progress span { width: 62%; border-radius: 3px; }
.novel-home__status { display: flex; min-height: 100px; align-items: center; flex-direction: column; justify-content: flex-start; }.novel-home--loading .novel-home__status { min-height: 100px; }
.novel-progress span { animation: none; transition: width 80ms linear; }
</style>
