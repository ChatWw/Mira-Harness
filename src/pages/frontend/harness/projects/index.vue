<template>
  <PageContainer title="项目" description="管理 Mira 可以访问的本地工作目录。">
    <template #actions>
      <el-button type="primary" @click="openCreateDialog"><AppIcon name="Plus" />创建项目</el-button>
    </template>

    <section class="project-toolbar" aria-label="项目筛选与视图">
      <el-input ref="searchInputRef" v-model="query" clearable class="project-search" placeholder="搜索项目名或目录">
        <template #prefix><AppIcon name="Search" /></template>
      </el-input>
      <el-select v-model="statusFilter" aria-label="筛选项目状态" class="toolbar-select">
        <el-option label="全部状态" value="all" />
        <el-option label="活跃" value="active" />
        <el-option label="闲置" value="idle" />
      </el-select>
      <el-select v-model="sort" aria-label="项目排序方式" class="toolbar-select">
        <el-option label="最近活跃" value="lastActive" />
        <el-option label="创建时间" value="createdAt" />
        <el-option label="名称" value="name" />
      </el-select>
      <el-radio-group v-model="view" class="view-switch" aria-label="项目视图">
        <el-tooltip content="网格视图"><el-radio-button value="grid" aria-label="网格视图"><AppIcon name="Grid" /></el-radio-button></el-tooltip>
        <el-tooltip content="列表视图"><el-radio-button value="list" aria-label="列表视图"><AppIcon name="List" /></el-radio-button></el-tooltip>
      </el-radio-group>
    </section>

    <section class="project-stats" aria-label="项目统计">
      <div class="stat-card">
        <span class="stat-icon stat-icon--info"><AppIcon name="FolderOpened" /></span><span><small>项目总数</small><strong>{{ projects.length }}</strong></span>
      </div>
      <div class="stat-card">
        <span class="stat-icon stat-icon--success"><AppIcon name="CircleCheck" /></span><span><small>活跃项目</small><strong>{{ activeCount }}</strong></span>
      </div>
      <div class="stat-card">
        <span class="stat-icon stat-icon--warning"><AppIcon name="Clock" /></span><span><small>闲置项目</small><strong>{{ idleCount }}</strong></span>
      </div>
      <div class="stat-card">
        <span class="stat-icon stat-icon--purple"><AppIcon name="ChatDotRound" /></span><span><small>会话总数</small><strong>{{ totalSessions }}</strong></span>
      </div>
    </section>

    <section v-if="loading" class="project-grid project-grid--loading" aria-label="正在加载项目">
      <div v-for="item in 8" :key="item" class="project-card project-card--skeleton"><el-skeleton animated :rows="4" /></div>
    </section>

    <template v-else-if="projects.length">
      <div class="project-section-head"><strong>项目</strong><span>{{ filteredProjects.length }} 个</span></div>
      <section v-if="filteredProjects.length && view === 'grid'" class="project-grid">
        <article v-for="project in filteredProjects" :key="project.id" class="project-card" :class="{ 'is-missing': !project.directoryExists }" tabindex="0" @click="openProject(project)" @keydown.enter="openProject(project)">
          <div class="project-card__head">
            <span class="project-state" :class="projectStatus(project)"><i></i>{{ projectStatusLabel(project) }}</span>
            <el-tooltip content="Mira 文件回收站"><el-button circle text aria-label="Mira 文件回收站" @click.stop="openTrash(project)"><AppIcon name="Delete" /></el-button></el-tooltip>
          </div>
          <h3 :title="project.name">{{ project.name }}</h3>
          <div class="project-path" :class="{ 'is-missing': !project.directoryExists }" :title="project.directory">
            <AppIcon name="FolderOpened" /><span>{{ project.directory }}</span>
            <el-tooltip content="复制目录"><el-button text aria-label="复制目录" @click.stop="copyDirectory(project.directory)"><AppIcon name="CopyDocument" /></el-button></el-tooltip>
          </div>
          <p v-if="!project.directoryExists" class="project-warning">目录不存在，请移除注册或重新选择项目。</p>
          <dl class="project-meta"><div><dt>会话</dt><dd>{{ project.sessionCount }}</dd></div><div><dt>最近活跃</dt><dd>{{ formatTime(project.lastSessionAt || project.updatedAt) }}</dd></div></dl>
          <div class="project-actions">
            <el-button type="primary" :disabled="!project.directoryExists" @click.stop="openProject(project)"><AppIcon name="ChatDotRound" />打开对话</el-button>
            <el-tooltip content="重命名"><el-button circle aria-label="重命名项目" @click.stop="openRenameDialog(project)"><AppIcon name="EditPen" /></el-button></el-tooltip>
            <el-tooltip :content="project.directoryExists ? '移除项目注册' : '移除失效注册'"><el-button circle type="danger" plain aria-label="移除项目注册" @click.stop="confirmDelete(project)"><AppIcon name="Delete" /></el-button></el-tooltip>
          </div>
        </article>
        <button type="button" class="project-card project-card--new" @click="openCreateDialog"><span><AppIcon name="Plus" /></span><strong>创建项目</strong><small>Mira 仅注册目录，不复制或迁移文件</small></button>
      </section>

      <section v-else-if="filteredProjects.length" class="project-list-wrap">
        <div class="project-list project-list--head"><span>项目</span><span>目录</span><span>会话</span><span>状态</span><span>最近活跃</span><span>操作</span></div>
        <div v-for="project in filteredProjects" :key="project.id" class="project-list" :class="{ 'is-missing': !project.directoryExists }" @click="openProject(project)">
          <strong :title="project.name">{{ project.name }}</strong>
          <span class="project-list__path" :title="project.directory">{{ project.directory }}</span>
          <span>{{ project.sessionCount }}</span><span class="project-state" :class="projectStatus(project)"><i></i>{{ projectStatusLabel(project) }}</span><span>{{ formatTime(project.lastSessionAt || project.updatedAt) }}</span>
          <span class="project-list__actions"><el-tooltip content="打开对话"><el-button circle text aria-label="打开对话" :disabled="!project.directoryExists" @click.stop="openProject(project)"><AppIcon name="ChatDotRound" /></el-button></el-tooltip><el-tooltip content="复制目录"><el-button circle text aria-label="复制目录" @click.stop="copyDirectory(project.directory)"><AppIcon name="CopyDocument" /></el-button></el-tooltip><el-tooltip content="重命名"><el-button circle text aria-label="重命名项目" @click.stop="openRenameDialog(project)"><AppIcon name="EditPen" /></el-button></el-tooltip><el-tooltip content="Mira 文件回收站"><el-button circle text aria-label="Mira 文件回收站" @click.stop="openTrash(project)"><AppIcon name="Delete" /></el-button></el-tooltip><el-tooltip content="移除项目注册"><el-button circle text type="danger" aria-label="移除项目注册" @click.stop="confirmDelete(project)"><AppIcon name="Delete" /></el-button></el-tooltip></span>
        </div>
      </section>
      <el-empty v-else description="未找到匹配项目"><el-button @click="clearFilters">清除筛选</el-button></el-empty>
    </template>

    <el-empty v-else-if="!loading" class="project-empty" description="注册第一个项目目录，开始与 Mira 对话"><template #image><AppIcon name="FolderOpened" /></template></el-empty>

    <el-dialog v-model="trashVisible" :title="`Mira 文件回收站 · ${trashProject?.name || ''}`" width="min(520px, calc(100vw - 32px))" align-center><div v-loading="trashLoading" class="trash-list"><el-empty v-if="!trashLoading && !trashTokens.length" description="回收站为空" /><div v-for="token in trashTokens" :key="token" class="trash-item"><div><AppIcon name="Delete" /><span>{{ formatToken(token) }}</span></div><el-button size="small" @click="restore(token)">还原</el-button></div></div></el-dialog>
  </PageContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import PageContainer from '@/components/PageContainer/index.vue'
import { getPreference, getPlatformApi, savePreference } from '@/platform'
import { OPEN_HARNESS_PROJECT_DIALOG_EVENT, type HarnessProject, type HarnessProjectDialogRequest } from '@/config/harness'
import { useHarnessStore } from '@/stores/harness'
import { filterProjects, projectStatus, type ProjectSort, type ProjectStatus } from './projectUtils'

type ProjectView = 'grid' | 'list'
type ProjectPagePreference = { view?: ProjectView, sort?: ProjectSort }

const preference = getPreference<ProjectPagePreference>('harnessProjectsPage', {})
const router = useRouter()
const store = useHarnessStore()
const projects = ref<HarnessProject[]>([])
const loading = ref(false)
const query = ref('')
const statusFilter = ref<ProjectStatus>('all')
const sort = ref<ProjectSort>(preference.sort === 'createdAt' || preference.sort === 'name' ? preference.sort : 'lastActive')
const view = ref<ProjectView>(preference.view === 'list' ? 'list' : 'grid')
const searchInputRef = ref()
const trashVisible = ref(false)
const trashProject = ref<HarnessProject>()
const trashTokens = ref<string[]>([])
const trashLoading = ref(false)

const activeCount = computed(() => projects.value.filter(project => projectStatus(project) === 'active').length)
const idleCount = computed(() => projects.value.length - activeCount.value)
const totalSessions = computed(() => projects.value.reduce((total, project) => total + project.sessionCount, 0))
const filteredProjects = computed(() => filterProjects(projects.value, query.value, statusFilter.value, sort.value))

function projectStatusLabel(project: HarnessProject) { return projectStatus(project) === 'active' ? '活跃' : '闲置' }
function formatTime(value: number) { return new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' }).format(Math.round((value - Date.now()) / 3600000), 'hour') }
function formatToken(token: string) { const timestamp = Number(token.split('-')[0]); return timestamp ? new Date(timestamp).toLocaleString('zh-CN') : token }
function clearFilters() { query.value = ''; statusFilter.value = 'all' }

async function load() { loading.value = true; try { projects.value = await getPlatformApi()?.listHarnessProjects() || [] } finally { loading.value = false } }
async function openProject(project: HarnessProject) { if (!project.directoryExists) return; const draft = store.startDraft(project.id); await router.push({ path: '/workspace/chat', query: { draft } }) }
async function copyDirectory(directory: string) { try { await navigator.clipboard.writeText(directory); ElMessage.success('目录已复制') } catch { ElMessage.error('复制目录失败') } }
function dispatchProjectDialog(detail: HarnessProjectDialogRequest = {}) { window.dispatchEvent(new CustomEvent<HarnessProjectDialogRequest>(OPEN_HARNESS_PROJECT_DIALOG_EVENT, { detail })) }
function openCreateDialog() { dispatchProjectDialog({ onCreated: () => void load() }) }
function openRenameDialog(project: HarnessProject) { dispatchProjectDialog({ project, onUpdated: () => void load() }) }
function confirmDelete(project: HarnessProject) { dispatchProjectDialog({ removeProjectId: project.id, onRemoved: () => void load() }) }
async function loadTrash(projectId: string) { trashLoading.value = true; try { trashTokens.value = await getPlatformApi()?.listHarnessTrash(projectId) || [] } finally { trashLoading.value = false } }
async function openTrash(project: HarnessProject) { trashProject.value = project; trashVisible.value = true; await loadTrash(project.id) }
async function restore(token: string) { const project = trashProject.value; if (!project) return; try { await getPlatformApi()?.restoreHarnessTrash(project.id, token); await loadTrash(project.id); ElMessage.success('已还原到项目目录') } catch (error) { ElMessage.error(error instanceof Error ? error.message : '还原失败') } }
function handleKeydown(event: KeyboardEvent) { const target = event.target; if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || Boolean(document.querySelector('.el-overlay'))) return; event.preventDefault(); searchInputRef.value?.focus() }

watch([view, sort], () => savePreference('harnessProjectsPage', { view: view.value, sort: sort.value }))
onMounted(() => { void load(); document.addEventListener('keydown', handleKeydown) })
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<style scoped lang="scss">
.project-toolbar { display: flex; align-items: center; gap: $spacing-sm; margin-bottom: $spacing-md; flex-wrap: wrap; }.project-search { width: min(100%, 360px); margin-right: auto; }.toolbar-select { width: 132px; }.view-switch { flex-shrink: 0; }.view-switch :deep(.el-radio-button__inner) { display: flex; align-items: center; justify-content: center; min-width: 36px; padding: 8px 10px; }
.project-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: $spacing-md; margin-bottom: $spacing-lg; }.stat-card { display: flex; align-items: center; gap: 12px; min-height: 76px; padding: 14px; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-elevated); color: var(--cp-text); text-align: left; }.stat-card small, .stat-card strong { display: block; }.stat-card small { color: var(--cp-text-secondary); font-size: 12px; }.stat-card strong { margin-top: 2px; font-size: 22px; line-height: 1.1; }.stat-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: $radius-md; font-size: 19px; }.stat-icon--info { color: var(--cp-stat-icon-info-color); background: var(--cp-stat-icon-info-bg); }.stat-icon--success { color: var(--cp-stat-icon-success-color); background: var(--cp-stat-icon-success-bg); }.stat-icon--warning { color: var(--cp-stat-icon-warning-color); background: var(--cp-stat-icon-warning-bg); }.stat-icon--purple { color: var(--cp-stat-icon-purple-color); background: var(--cp-stat-icon-purple-bg); }
.project-section-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 14px; }.project-section-head strong { font-size: 16px; }.project-section-head span { color: var(--cp-text-tertiary); font-size: 12px; }.project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: $spacing-md; }.project-card { display: flex; min-width: 0; min-height: 225px; flex-direction: column; padding: 18px; border: 1px solid var(--cp-border); border-radius: $radius-md; background: var(--cp-bg); cursor: pointer; outline: none; transition: border-color $transition-base, box-shadow $transition-base, background $transition-base; }.project-card:hover, .project-card:focus-visible { border-color: var(--cp-primary); box-shadow: $shadow-sm; }.project-card.is-new { animation: new-project 1.8s ease-out; }.project-card__head { display: flex; align-items: center; justify-content: space-between; min-height: 24px; }.project-card h3 { margin: 8px 0 10px; overflow: hidden; font-size: 16px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }.project-state { display: inline-flex; align-items: center; gap: 5px; color: var(--cp-text-secondary); font-size: 12px; }.project-state i { width: 7px; height: 7px; border-radius: 50%; background: var(--cp-text-placeholder); }.project-state.active { color: var(--cp-stat-icon-success-color); }.project-state.active i { background: var(--cp-success); }.project-path { display: flex; min-width: 0; align-items: center; gap: 5px; color: var(--cp-text-tertiary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }.project-path > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.project-path .el-button { margin-left: auto; }.project-path.is-missing, .project-warning { color: var(--cp-danger); }.project-warning { margin: 8px 0 0; font-size: 12px; }.project-meta { display: flex; gap: 26px; margin: auto 0 14px; padding-top: 14px; border-top: 1px solid var(--cp-border-light); }.project-meta dt { color: var(--cp-text-tertiary); font-size: 11px; }.project-meta dd { margin: 2px 0 0; font-size: 13px; font-weight: 500; }.project-actions { display: flex; align-items: center; gap: 6px; }.project-actions .el-button:first-child { margin-right: auto; }.project-card--new { align-items: center; justify-content: center; gap: 8px; border-style: dashed; color: var(--cp-text-secondary); text-align: center; }.project-card--new > span { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 50%; background: var(--cp-bg-hover); font-size: 18px; }.project-card--new strong { color: var(--cp-text); }.project-card--new small { color: var(--cp-text-tertiary); font-size: 12px; }.project-card--new:hover { background: var(--cp-primary-lighter); }.project-card--skeleton { min-height: 225px; cursor: default; }.project-grid--loading { pointer-events: none; }
.project-list-wrap { overflow-x: auto; border: 1px solid var(--cp-border); border-radius: $radius-md; }.project-list { display: grid; grid-template-columns: minmax(150px, 1.2fr) minmax(210px, 1.6fr) 70px 80px 105px 196px; gap: 12px; min-width: 850px; align-items: center; padding: 11px 16px; border-bottom: 1px solid var(--cp-border-light); background: var(--cp-bg); cursor: pointer; }.project-list:last-child { border-bottom: 0; }.project-list:not(.project-list--head):hover { background: var(--cp-bg-elevated); }.project-list--head { background: var(--cp-bg-elevated); color: var(--cp-text-tertiary); cursor: default; font-size: 12px; }.project-list > strong, .project-list__path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.project-list__path { color: var(--cp-text-tertiary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }.project-list__actions { display: flex; justify-content: flex-end; gap: 2px; }.project-list.is-missing .project-list__path { color: var(--cp-danger); }
.project-empty :deep(.el-empty__image) { display: grid; width: 84px; height: 84px; place-items: center; border-radius: 50%; background: var(--cp-bg-hover); color: var(--cp-text-secondary); font-size: 38px; }.project-empty :deep(.el-empty__image .app-icon), .project-empty :deep(.el-empty__description p) { color: var(--cp-text-secondary) !important; }.trash-list { min-height: 120px; }.trash-item { display: flex; align-items: center; justify-content: space-between; gap: $spacing-md; padding: $spacing-sm 0; border-bottom: 1px solid var(--cp-border-light); }.trash-item > div { display: flex; min-width: 0; align-items: center; gap: 8px; color: var(--cp-text-secondary); }.trash-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@keyframes new-project { 0%, 100% { box-shadow: none; } 18%, 60% { border-color: var(--cp-primary); box-shadow: 0 0 0 3px var(--cp-primary-light); } }
@media (max-width: 820px) { .project-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .project-search { width: 100%; } }
@media (max-width: 520px) { .project-stats { gap: $spacing-sm; }.stat-card { min-height: 68px; padding: 10px; }.stat-icon { width: 32px; height: 32px; font-size: 16px; }.stat-card strong { font-size: 18px; }.toolbar-select { flex: 1; width: 0; }.project-card { min-height: 215px; } }
</style>
