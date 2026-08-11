<template>
  <PageContainer v-if="desktopAvailable" class="novel-page" fill-content :show-header="false">
    <div v-if="loading" class="novel-loading"><el-skeleton :rows="8" animated /></div>
    <el-result v-else-if="!project" icon="warning" title="无法打开小说工作台" sub-title="请新建一个作品，或稍后重试。"><template #extra><el-button type="primary" @click="createProject">新建作品</el-button></template></el-result>
    <div v-else class="novel-workspace">
      <aside class="project-sidebar">
        <div class="sidebar-heading"><span>我的作品</span><el-tooltip content="新建作品"><el-button circle text aria-label="新建作品" @click="createProject"><AppIcon name="Plus" /></el-button></el-tooltip></div>
        <div class="project-list">
          <button v-for="item in projects" :key="item.id" type="button" class="project-item" :class="{ active: item.id === project.id }" @click="openProject(item.id)">
            <AppIcon name="lucide:book-marked" /><span><strong>{{ item.title }}</strong><small>{{ formatUpdatedAt(item.updatedAt) }}</small></span>
          </button>
        </div>
        <div class="sidebar-heading chapters-heading"><span>创作结构</span><el-tooltip content="新增章节"><el-button circle text aria-label="新增章节" @click="addChapter"><AppIcon name="Plus" /></el-button></el-tooltip></div>
        <nav class="chapter-list" aria-label="创作结构">
          <button v-for="item in stages" :key="item.key" type="button" class="chapter-item" :class="{ active: activeStage === item.key }" @click="activeStage = item.key"><AppIcon :name="item.icon" /><span>{{ item.title }}</span></button>
          <button v-for="chapter in project.chapters" :key="chapter.id" type="button" class="chapter-item" :class="{ active: activeChapterId === chapter.id && activeStage === 'chapter' }" @click="selectChapter(chapter.id)"><AppIcon name="Document" /><span>{{ chapter.title }}</span></button>
        </nav>
      </aside>

      <main class="editor-workspace">
        <header class="workspace-header">
          <div><h1>{{ currentHeading }}</h1><p>{{ project.title }} · {{ currentStageLabel }}</p></div>
          <div class="workspace-actions"><span class="save-state" :class="{ saving }"><i></i>{{ saving ? '正在保存' : '已保存' }}</span><el-button text aria-label="打开工具" @click="openTool('knowledge')"><AppIcon name="Collection" />知识库</el-button><el-dropdown @command="handleExport"><el-button text><AppIcon name="Download" />导出</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="json">完整项目 JSON</el-dropdown-item><el-dropdown-item command="markdown">Markdown 创作稿</el-dropdown-item><el-dropdown-item command="text">TXT 创作稿</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div>
        </header>
        <div class="stage-tabs" role="tablist"><button v-for="item in stages" :key="item.key" type="button" :class="{ active: activeStage === item.key }" @click="activeStage = item.key">{{ item.title }}</button></div>

        <section v-if="activeStage === 'setup'" class="stage-content setup-grid">
          <label v-for="field in setupFields" :key="field.key"><span>{{ field.label }}</span><el-input v-model="project.story[field.key]" type="textarea" :autosize="{ minRows: 5, maxRows: 9 }" :placeholder="field.placeholder" /></label>
        </section>

        <section v-else-if="activeStage === 'outline'" class="stage-content">
          <div class="editor-label"><strong>故事总纲</strong><span>{{ countWords(project.outline) }} 字</span></div>
          <textarea v-model="project.outline" class="writing-editor" placeholder="先写下故事的核心冲突、主线和转折，或让创作模型从作品设定中生成。" @contextmenu="openContextMenu($event, 'outline')"></textarea>
          <div class="editor-footer"><span>选中文本后可右键调用 AI 操作</span><div><el-button @click="runOutline">生成总纲</el-button><el-button type="primary" @click="openTool('mindMap')"><AppIcon name="Share" />从总纲构建思维导图</el-button></div></div>
        </section>

        <section v-else-if="activeStage === 'chapter'" class="stage-content">
          <template v-if="selectedChapter">
            <div class="chapter-title-row"><el-input v-model="selectedChapter.title" aria-label="章节标题" /><div><el-tooltip content="上移章节"><el-button circle text aria-label="上移章节" :disabled="chapterIndex === 0" @click="moveChapter(-1)"><AppIcon name="ArrowUp" /></el-button></el-tooltip><el-tooltip content="下移章节"><el-button circle text aria-label="下移章节" :disabled="chapterIndex === project.chapters.length - 1" @click="moveChapter(1)"><AppIcon name="ArrowDown" /></el-button></el-tooltip><el-tooltip content="删除章节"><el-button circle text type="danger" aria-label="删除章节" @click="removeChapter"><AppIcon name="Delete" /></el-button></el-tooltip></div></div>
            <div class="editor-label"><strong>章节细纲</strong><span>{{ countWords(selectedChapter.outline) }} 字</span></div>
            <textarea v-model="selectedChapter.outline" class="writing-editor chapter-outline" placeholder="描述本章的核心事件、人物动机、冲突、伏笔与结尾钩子。" @contextmenu="openContextMenu($event, 'chapter')"></textarea>
            <div class="editor-footer"><span>章节细纲会作为正文生成上下文</span><div><el-button @click="runChapterOutline">生成细纲</el-button><el-button type="primary" @click="activeStage = 'content'">开始写正文</el-button></div></div>
          </template>
          <el-empty v-else description="新建章节后开始编写细纲"><el-button type="primary" @click="addChapter">新建章节</el-button></el-empty>
        </section>

        <section v-else class="stage-content">
          <template v-if="selectedChapter">
            <div class="editor-label"><strong>{{ selectedChapter.title }} · 正文</strong><span>{{ countWords(selectedChapter.content) }} 字</span></div>
            <textarea v-model="selectedChapter.content" class="writing-editor content-editor" placeholder="在这里写作，或使用右侧 AI 工作台继续创作。" @contextmenu="openContextMenu($event, 'content')"></textarea>
            <div class="editor-footer"><span>自动保存到本机 SQLite 项目库</span><div><el-button @click="runContent">生成正文</el-button><el-button type="primary" @click="runContent(true)"><AppIcon name="EditPen" />继续创作</el-button></div></div>
          </template>
          <el-empty v-else description="请先新建并选择一个章节"><el-button type="primary" @click="addChapter">新建章节</el-button></el-empty>
        </section>
      </main>

      <aside class="ai-panel">
        <div class="ai-panel__header"><strong>AI 工作台</strong><el-select v-model="assistantRole" size="small" aria-label="选择模型职责"><el-option label="创作模型" value="authoring" /><el-option label="自动处理模型" value="automation" /></el-select></div>
        <div class="ai-actions"><button v-for="action in quickActions" :key="action.key" type="button" @click="runQuickAction(action.key)"><AppIcon :name="action.icon" />{{ action.title }}</button></div>
        <div class="assistant-output" :class="{ empty: !assistantOutput }"><template v-if="assistantOutput"><div class="assistant-output__title">{{ assistantOutputTitle }}</div><p>{{ assistantOutput }}</p><div class="assistant-output__actions"><el-button text @click="copyText(assistantOutput)">复制</el-button><el-button v-if="pendingSelection" text type="primary" @click="applySelectionResult">应用到选中内容</el-button></div></template><span v-else>选择一个创作动作，或直接向助手提问。</span></div>
        <div class="assistant-composer"><textarea v-model="assistantPrompt" placeholder="向助手提问…" @keydown.meta.enter.prevent="sendAssistantMessage" @keydown.ctrl.enter.prevent="sendAssistantMessage"></textarea><el-button circle type="primary" :loading="generating" aria-label="发送问题" @click="sendAssistantMessage"><AppIcon name="Top" /></el-button></div>
        <div class="tool-links"><button type="button" @click="openTool('ideas')"><AppIcon name="MagicStick" />书名与简介</button><button type="button" @click="openTool('optimizer')"><AppIcon name="RefreshRight" />批量优化</button><button type="button" @click="openTool('splitter')"><AppIcon name="Scissor" />拆书</button><button type="button" @click="openTool('prompts')"><AppIcon name="DocumentCopy" />提示词</button><button type="button" @click="openTool('shortcuts')"><AppIcon name="Key" />快捷词条</button></div>
      </aside>
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
  <PageContainer v-else class="novel-page"><el-result icon="warning" title="AI 小说仅在桌面端中可用" sub-title="作品保存在 Mira 本机项目库中，模型请求也由桌面端安全代理。" /></PageContainer>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageContainer from '@/components/PageContainer/index.vue'
import { DEFAULT_NOVEL_PROMPTS, DEFAULT_NOVEL_WORKSPACE_SETTINGS, type NovelChapter, type NovelModelRole, type NovelProjectDocument, type NovelProjectSummary, type NovelWorkspaceSettings } from '@/config/novel'
import { getPlatformApi } from '@/platform'

type Stage = 'setup' | 'outline' | 'chapter' | 'content'
type Tool = 'knowledge' | 'prompts' | 'mindMap' | 'ideas' | 'splitter' | 'optimizer' | 'shortcuts'
type EditorTarget = 'outline' | 'chapter' | 'content'

const api = getPlatformApi()
const desktopAvailable = Boolean(api)
const loading = ref(true)
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
const workspaceSettings = reactive<NovelWorkspaceSettings>({ ...DEFAULT_NOVEL_WORKSPACE_SETTINGS })
const projectImport = ref<HTMLInputElement>()
const promptImport = ref<HTMLInputElement>()
const contextMenu = reactive({ visible: false, x: 0, y: 0, target: '' as EditorTarget, start: 0, end: 0, text: '' })
const pendingSelection = ref(false)
let saveTimer: number | undefined

const stages = [
  { key: 'setup' as const, title: '作品设定', icon: 'Setting' },
  { key: 'outline' as const, title: '故事总纲', icon: 'Share' },
  { key: 'chapter' as const, title: '章节细纲', icon: 'Document' },
]
const setupFields = [
  { key: 'background' as const, label: '故事背景', placeholder: '世界、时代、地点和独特规则' },
  { key: 'characters' as const, label: '人物设定', placeholder: '主角、配角、动机、目标与弱点' },
  { key: 'relationships' as const, label: '角色关系', placeholder: '人物间的利益、情感和冲突' },
  { key: 'plot' as const, label: '核心剧情', placeholder: '起点、核心矛盾、转折和结局方向' },
  { key: 'writingStyle' as const, label: '写作风格', placeholder: '叙事视角、节奏、语言与参考方向' },
]
const quickActions = [
  { key: 'continue', title: '继续创作', icon: 'EditPen' },
  { key: 'scene', title: '扩写场景', icon: 'Picture' },
  { key: 'dialogue', title: '强化对白', icon: 'ChatLineRound' },
  { key: 'foreshadow', title: '补充伏笔', icon: 'Connection' },
]

const selectedChapter = computed(() => project.value?.chapters.find(item => item.id === activeChapterId.value))
const chapterIndex = computed(() => project.value?.chapters.findIndex(item => item.id === activeChapterId.value) ?? -1)
const currentStageLabel = computed(() => activeStage.value === 'content' ? '正文' : stages.find(item => item.key === activeStage.value)?.title || '')
const currentHeading = computed(() => activeStage.value === 'chapter' || activeStage.value === 'content' ? selectedChapter.value?.title || '新建章节' : stages.find(item => item.key === activeStage.value)?.title || '')
const toolTitle = computed(() => ({ knowledge: '知识库', prompts: '提示词模板', mindMap: '思维导图', ideas: '书名与简介', splitter: '拆书', optimizer: '批量优化', shortcuts: '快捷词条' })[activeTool.value])

function newId() { return crypto.randomUUID() }
function countWords(value: string) { return value.trim().length }
function formatUpdatedAt(time: number) { const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000)); return minutes < 1 ? '刚刚保存' : minutes < 60 ? `${minutes} 分钟前` : new Date(time).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) }

async function bootstrap() {
  if (!api) return
  try {
    ;[projects.value, apiBaseUrl.value] = await Promise.all([api.listNovelProjects(), api.getNovelApiBaseUrl()])
    const settings = await api.getNovelWorkspaceSettings()
    workspaceSettings.shortcuts.splice(0, workspaceSettings.shortcuts.length, ...settings.shortcuts)
    if (!projects.value.length) await createProject()
    else await openProject(projects.value[0].id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '小说工作台初始化失败')
  } finally { loading.value = false }
}

async function refreshProjects() { if (api) projects.value = await api.listNovelProjects() }
async function openProject(id: string) {
  if (!api) return
  try { project.value = await api.getNovelProject(id); activeChapterId.value = project.value.chapters[0]?.id || ''; activeStage.value = project.value.chapters.length ? 'content' : 'setup'; assistantOutput.value = '' } catch (error) { ElMessage.error(error instanceof Error ? error.message : '打开作品失败') }
}
async function createProject() {
  if (!api) return
  try { project.value = await api.createNovelProject(); await refreshProjects(); activeChapterId.value = ''; activeStage.value = 'setup'; ElMessage.success('已新建作品') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '新建作品失败') }
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
async function saveProject() { if (!api || !project.value) return; saving.value = true; try { const payload = JSON.parse(JSON.stringify(project.value)) as NovelProjectDocument; project.value = await api.saveNovelProject(payload); await refreshProjects() } catch (error) { ElMessage.error(error instanceof Error ? error.message : '自动保存失败') } finally { saving.value = false } }
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
function addKnowledge() { project.value?.knowledge.push({ id: newId(), category: '', title: '', content: '', tags: [] }) }
function addPrompt() { project.value?.prompts.push({ id: newId(), name: '未命名模板', scope: 'content', content: '' }) }
function addMindNode() { project.value?.mindMap.children.push({ id: newId(), title: '新节点', children: [] }) }
async function generateMindMap() { if (!project.value?.outline) { ElMessage.warning('请先完成故事总纲'); return }; const output = await stream('authoring', `根据以下故事总纲，列出 4 到 8 个思维导图一级节点，每行一个节点标题，不要编号或解释。\n\n${project.value.outline}`, '思维导图节点'); if (output && project.value) project.value.mindMap.children = output.split('\n').map(title => title.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).map(title => ({ id: newId(), title, children: [] })) }
async function generateIdea() { if (!project.value) return; const output = await stream('authoring', `基于以下创作信息生成一个小说书名和简介。第一行必须是“书名：”，后续为简介。\n\n${buildContext()}`, '书名与简介'); if (output) { const [first, ...rest] = output.split('\n'); project.value.generatedIdeas.unshift({ id: newId(), title: first.replace(/^书名[：:]/, '').trim() || '未命名书名', summary: rest.join('\n').trim(), createdAt: Date.now() }) } }
async function splitBook() { if (!project.value?.splitterSource.trim()) { ElMessage.warning('请先粘贴需要拆分的文本'); return }; splitterResult.value = await stream('automation', `将以下文本拆分为章节细纲。每章以“## 章节标题”开头，后续给出简洁细纲。\n\n${project.value.splitterSource}`, '拆书结果') }
function applySplitResult() { if (!project.value || !splitterResult.value) return; const sections = splitterResult.value.split(/^##\s+/m).filter(Boolean); sections.forEach((section, index) => { const [title, ...outline] = section.split('\n'); project.value?.chapters.push({ id: newId(), title: title.trim() || `第${project.value!.chapters.length + index + 1}章`, outline: outline.join('\n').trim(), content: '' }) }); const chapters = project.value.chapters; activeChapterId.value = chapters.length ? chapters[chapters.length - 1].id : ''; toolVisible.value = false; activeStage.value = 'chapter'; ElMessage.success('已导入拆分章节') }
async function optimizeContent() { if (!selectedChapter.value) return; optimizerResult.value = await stream('automation', `按${project.value?.optimizer.mode === 'sentence' ? '句子' : '段落'}优化以下小说正文，保持事实、视角和剧情推进。只返回优化后的正文。\n\n${selectedChapter.value.content}`, '批量优化') }
function applyOptimizedContent() { if (!selectedChapter.value || !optimizerResult.value) return; selectedChapter.value.content = optimizerResult.value; toolVisible.value = false; ElMessage.success('已应用优化结果') }
async function saveWorkspaceSettings() { if (!api) return; const result = await api.saveNovelWorkspaceSettings({ shortcuts: [...workspaceSettings.shortcuts] }); workspaceSettings.shortcuts.splice(0, workspaceSettings.shortcuts.length, ...result.shortcuts); ElMessage.success('快捷词条已保存') }
function download(text: string, filename: string, type = 'text/plain;charset=utf-8') { const url = URL.createObjectURL(new Blob([text], { type })); const link = Object.assign(document.createElement('a'), { href: url, download: filename }); link.click(); URL.revokeObjectURL(url) }
function toManuscript() { if (!project.value) return ''; return `# ${project.value.title}\n\n${project.value.outline ? `## 故事总纲\n${project.value.outline}\n\n` : ''}${project.value.chapters.map(chapter => `## ${chapter.title}\n\n${chapter.content || chapter.outline}`).join('\n\n')}` }
async function handleExport(command: string) { if (!project.value || !api) return; if (command === 'json') download(await api.exportNovelProject(project.value.id), `${project.value.title}.json`, 'application/json'); else download(toManuscript(), `${project.value.title}.${command === 'markdown' ? 'md' : 'txt'}`) }
async function importProject(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file || !api) return; try { project.value = await api.importNovelProject(await file.text()); await refreshProjects(); activeStage.value = 'setup'; ElMessage.success('项目已导入') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '项目导入失败') } finally { input.value = '' } }
function exportPrompts() { if (!project.value) return; download(JSON.stringify(project.value.prompts, null, 2), `${project.value.title}-prompts.json`, 'application/json') }
async function importPrompts(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file || !project.value) return; try { const parsed = JSON.parse(await file.text()); if (!Array.isArray(parsed)) throw new Error('文件必须是提示词模板数组'); project.value.prompts = parsed.filter(item => item && typeof item.name === 'string' && typeof item.content === 'string').map(item => ({ id: newId(), name: item.name, content: item.content, scope: ['outline', 'chapter', 'content', 'selection'].includes(item.scope) ? item.scope : 'content' })); ElMessage.success('提示词模板已导入') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '模板导入失败') } finally { input.value = '' } }
async function copyText(value: string) { try { await navigator.clipboard.writeText(value); ElMessage.success('已复制') } catch { ElMessage.error('复制失败') } }
function handleKeydown(event: KeyboardEvent) { if (!event.shiftKey || event.key.toLowerCase() !== 'l' || event.isComposing || !workspaceSettings.shortcuts.length) return; const target = event.target as HTMLTextAreaElement; if (!(target instanceof HTMLTextAreaElement)) return; event.preventDefault(); const phrase = workspaceSettings.shortcuts[0]; target.setRangeText(phrase, target.selectionStart, target.selectionEnd, 'end'); target.dispatchEvent(new Event('input', { bubbles: true })); ElMessage.info(`已插入快捷词条：${phrase}`) }
onMounted(() => { void bootstrap(); window.addEventListener('keydown', handleKeydown); window.addEventListener('click', () => { contextMenu.visible = false }) })
onBeforeUnmount(() => { window.clearTimeout(saveTimer); window.removeEventListener('keydown', handleKeydown) })
</script>

<style scoped lang="scss">
.novel-page { flex: 1; min-height: 0; :deep(.page-container), :deep(.page-content) { height: 100%; min-height: 0; padding: 0; } }
.novel-loading { padding: $spacing-xl; }
.novel-workspace { position: relative; display: grid; grid-template-columns: 224px minmax(0, 1fr) 280px; height: 100%; min-height: 640px; background: var(--cp-bg); }
.project-sidebar, .ai-panel { min-width: 0; padding: $spacing-md $spacing-sm; background: var(--cp-bg-elevated); }.project-sidebar { border-right: 1px solid var(--cp-border); }.ai-panel { border-left: 1px solid var(--cp-border); }
.sidebar-heading, .ai-panel__header, .workspace-header, .editor-footer, .editor-label, .chapter-title-row, .tool-entry__heading, .tool-toolbar { display: flex; align-items: center; justify-content: space-between; gap: $spacing-sm; }
.sidebar-heading { padding: 0 $spacing-sm $spacing-sm; color: var(--cp-text-secondary); font-size: $font-xs; }.sidebar-heading :deep(.el-button) { margin: -4px; }.chapters-heading { margin-top: $spacing-lg; }
.project-list, .chapter-list { display: flex; flex-direction: column; gap: 2px; }.project-item, .chapter-item { display: flex; width: 100%; align-items: center; gap: $spacing-sm; padding: 8px; color: var(--cp-text-secondary); text-align: left; cursor: pointer; background: transparent; border: 0; border-radius: $radius-sm; }.project-item:hover, .chapter-item:hover { background: var(--cp-bg-hover); }.project-item.active, .chapter-item.active { color: var(--cp-text); background: var(--cp-bg); box-shadow: $shadow-sm; }.project-item > span { min-width: 0; }.project-item strong, .project-item small, .chapter-item span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.project-item strong { font-size: $font-sm; font-weight: $font-medium; }.project-item small { margin-top: 2px; color: var(--cp-text-tertiary); font-size: 11px; }.chapter-item { font-size: $font-sm; }.chapter-item .app-icon { color: var(--cp-text-tertiary); }
.editor-workspace { min-width: 0; padding: 24px 28px 20px; overflow: auto; }.workspace-header { align-items: flex-start; }.workspace-header h1 { margin: 0; color: var(--cp-text); font-size: 20px; font-weight: $font-semibold; }.workspace-header p { margin: 5px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; }.workspace-actions { display: flex; align-items: center; gap: 2px; }.workspace-actions :deep(.el-button) { padding: 4px 6px; color: var(--cp-text-secondary); }.save-state { display: inline-flex; align-items: center; gap: 5px; margin-right: $spacing-xs; color: var(--cp-text-tertiary); font-size: $font-xs; white-space: nowrap; }.save-state i { width: 6px; height: 6px; background: var(--cp-success); border-radius: 50%; }.save-state.saving i { background: var(--cp-warning); }
.stage-tabs { display: flex; gap: $spacing-lg; margin: 24px 0 20px; border-bottom: 1px solid var(--cp-border); }.stage-tabs button { position: relative; padding: 0 2px 10px; color: var(--cp-text-secondary); cursor: pointer; background: transparent; border: 0; font: inherit; font-size: $font-sm; }.stage-tabs button.active { color: var(--cp-text); font-weight: $font-medium; }.stage-tabs button.active::after { position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; content: ''; background: var(--cp-primary); }
.stage-content { min-height: 0; }.setup-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: $spacing-lg; }.setup-grid label { display: flex; flex-direction: column; gap: $spacing-sm; color: var(--cp-text); font-size: $font-sm; font-weight: $font-medium; }.editor-label { margin-bottom: $spacing-sm; }.editor-label strong { color: var(--cp-text); font-size: $font-sm; }.editor-label span, .editor-footer > span { color: var(--cp-text-tertiary); font-size: $font-xs; }.writing-editor { display: block; width: 100%; min-height: 390px; padding: $spacing-md; color: var(--cp-text); resize: vertical; background: var(--cp-bg-elevated); border: 1px solid var(--cp-border); border-radius: $radius-md; outline: 0; font: inherit; font-size: $font-sm; line-height: 1.8; }.writing-editor:focus { border-color: var(--cp-primary); box-shadow: 0 0 0 3px var(--cp-primary-lighter); }.chapter-outline { min-height: 260px; }.content-editor { min-height: 480px; }.editor-footer { margin-top: $spacing-sm; }.editor-footer > div { display: flex; gap: $spacing-sm; }.chapter-title-row { margin-bottom: $spacing-lg; }.chapter-title-row :deep(.el-input) { max-width: 360px; }.chapter-title-row > div { display: flex; }
.ai-panel { display: flex; flex-direction: column; gap: $spacing-md; overflow: auto; }.ai-panel__header strong { color: var(--cp-text); font-size: $font-sm; font-weight: $font-semibold; }.ai-panel__header :deep(.el-select) { width: 112px; }.ai-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }.ai-actions button, .tool-links button { display: flex; align-items: center; gap: 7px; color: var(--cp-text-secondary); cursor: pointer; background: var(--cp-bg); border: 1px solid var(--cp-border); border-radius: $radius-sm; font: inherit; font-size: $font-xs; }.ai-actions button { min-height: 36px; padding: 0 8px; text-align: left; }.ai-actions button:hover, .tool-links button:hover { color: var(--cp-text); border-color: var(--cp-text-tertiary); }.assistant-output { flex: 1; min-height: 150px; padding: $spacing-sm $spacing-md; color: var(--cp-text-secondary); background: var(--cp-bg); border: 1px solid var(--cp-border); border-radius: $radius-md; font-size: $font-sm; line-height: 1.7; white-space: pre-wrap; }.assistant-output.empty { display: flex; align-items: center; color: var(--cp-text-tertiary); }.assistant-output__title { margin-bottom: $spacing-sm; color: var(--cp-text); font-size: $font-xs; font-weight: $font-medium; }.assistant-output p { margin: 0; }.assistant-output__actions { display: flex; justify-content: flex-end; margin-top: $spacing-sm; }.assistant-composer { display: flex; align-items: flex-end; gap: $spacing-xs; padding: $spacing-xs; background: var(--cp-bg); border: 1px solid var(--cp-border); border-radius: $radius-md; }.assistant-composer textarea { flex: 1; min-height: 46px; color: var(--cp-text); resize: none; background: transparent; border: 0; outline: 0; font: inherit; font-size: $font-sm; line-height: 1.5; }.tool-links { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }.tool-links button { padding: 7px; border-color: transparent; background: transparent; }
.context-menu { position: fixed; z-index: $z-popover; display: flex; flex-direction: column; min-width: 150px; padding: $spacing-xs; background: var(--cp-bg-overlay); border: 1px solid var(--cp-border); border-radius: $radius-md; box-shadow: $shadow-md; }.context-menu button { padding: 7px 8px; color: var(--cp-text); text-align: left; cursor: pointer; background: transparent; border: 0; border-radius: $radius-sm; font: inherit; font-size: $font-xs; }.context-menu button:hover { background: var(--cp-bg-hover); }
.tool-pane { display: flex; flex-direction: column; gap: $spacing-md; }.tool-description { margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.65; }.tool-entry, .idea-entry { display: flex; flex-direction: column; gap: $spacing-sm; padding: $spacing-md 0; border-bottom: 1px solid var(--cp-border-light); }.tool-entry__heading :deep(.el-input) { flex: 1; }.tool-entry :deep(.el-select) { width: 130px; }.mind-nodes { display: flex; flex-direction: column; gap: $spacing-sm; }.mind-node, .shortcut-row { display: flex; align-items: center; gap: $spacing-sm; }.mind-node :deep(.el-input), .shortcut-row :deep(.el-input) { flex: 1; }.idea-entry strong { color: var(--cp-text); font-size: $font-base; }.idea-entry p { margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.7; white-space: pre-wrap; }.file-input { display: none; }
@include media-max($breakpoint-lg) { .novel-workspace { grid-template-columns: 190px minmax(0, 1fr); }.ai-panel { grid-column: 1 / -1; display: grid; grid-template-columns: 190px 1fr 1fr; align-items: start; border-top: 1px solid var(--cp-border); border-left: 0; }.ai-panel__header { display: flex; flex-direction: column; align-items: flex-start; gap: $spacing-sm; }.assistant-output { min-height: 110px; }.assistant-composer, .tool-links { grid-column: span 1; } }
@include media-max($breakpoint-md) { .novel-workspace { display: block; min-height: 0; }.project-sidebar { border-right: 0; border-bottom: 1px solid var(--cp-border); }.project-list { flex-direction: row; overflow: auto; }.project-item { flex: 0 0 190px; }.chapters-heading, .chapter-list { display: none; }.editor-workspace { padding: $spacing-md; }.workspace-header, .editor-footer { align-items: flex-start; flex-direction: column; }.workspace-actions { flex-wrap: wrap; }.setup-grid { grid-template-columns: 1fr; }.ai-panel { display: flex; }.assistant-output { min-height: 150px; } }
</style>
