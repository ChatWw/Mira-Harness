<template>
  <section class="workspace-navigation" :class="{ collapsed }" aria-label="Mira 工作台">
    <el-tooltip :disabled="!collapsed" content="新对话" placement="right">
      <button type="button" class="workspace-action workspace-action--primary" @click="newSession"><AppIcon name="EditPen" /><span v-if="!collapsed">新对话</span></button>
    </el-tooltip>
    <el-tooltip :disabled="!collapsed" content="自动化（待上线）" placement="right">
      <button type="button" class="workspace-action" :class="{ active: route.path === '/workspace/automations' }" @click="router.push('/workspace/automations')"><AppIcon name="Clock" /><span v-if="!collapsed">自动化</span><el-tag v-if="!collapsed" size="small" type="warning" effect="plain">待上线</el-tag></button>
    </el-tooltip>

    <template v-if="!collapsed">
      <section class="workspace-group">
        <div class="workspace-group__header">
          <button type="button" class="workspace-group__toggle" :aria-expanded="projectsExpanded" @click="toggleProjects"><span>项目</span><AppIcon class="workspace-group__chevron" :name="projectsExpanded ? 'ArrowDown' : 'ArrowRight'" /></button>
          <div class="workspace-group__actions"><el-popover trigger="click" placement="right-start" :width="214" popper-class="workspace-action-menu-popper"><template #reference><button type="button" class="workspace-group__tool" aria-label="项目操作"><AppIcon name="MoreFilled" /></button></template><div class="workspace-action-menu"><button type="button" @click="handleProjectGroupCommand('expand')"><AppIcon name="ArrowDown" /><span>展开全部项目</span></button><button type="button" @click="handleProjectGroupCommand('collapse')"><AppIcon name="ArrowUp" /><span>收起全部项目</span></button></div></el-popover><el-tooltip content="创建项目" placement="right"><button type="button" class="workspace-group__tool" aria-label="创建项目" @click="openProjectDialog"><AppIcon name="Plus" /></button></el-tooltip></div>
        </div>
        <div v-if="projectsExpanded" class="workspace-group__items workspace-group__items--projects">
          <div v-for="project in visibleProjects" :key="project.id" class="workspace-project">
            <div class="workspace-project__header">
              <button type="button" class="workspace-project__toggle" :aria-expanded="isProjectExpanded(project.id)" :title="project.directory" @click="toggleProject(project.id)"><AppIcon :name="project.icon" /><span>{{ project.name }}</span></button>
              <div class="workspace-project__actions"><el-popover trigger="click" placement="right-start" :width="218" popper-class="workspace-action-menu-popper"><template #reference><button type="button" class="workspace-project__tool" :aria-label="`${project.name} 项目操作`"><AppIcon name="MoreFilled" /></button></template><div class="workspace-action-menu"><button type="button" @click="handleProjectCommand('toggle', project.id)"><AppIcon :name="isProjectExpanded(project.id) ? 'ArrowUp' : 'ArrowDown'" /><span>{{ isProjectExpanded(project.id) ? '收起对话' : '展开对话' }}</span></button><button type="button" @click="createProjectSession(project.id)"><AppIcon name="EditPen" /><span>在项目中创建对话</span></button></div></el-popover><el-tooltip content="在项目中创建对话" placement="right"><button type="button" class="workspace-project__new" :aria-label="`在 ${project.name} 中创建对话`" @click="createProjectSession(project.id)"><AppIcon name="EditPen" /></button></el-tooltip></div>
            </div>
            <div v-if="isProjectExpanded(project.id)" class="workspace-project__sessions">
              <div v-for="session in visibleProjectSessions(project.id)" :key="session.id" class="workspace-session-row workspace-session-row--nested" :class="{ active: session.id === store.activeSession?.id }"><button type="button" class="workspace-item workspace-item--session" @click="openSession(session.id)"><span class="workspace-item__title">{{ session.title }}</span></button><el-popover trigger="click" placement="right-start" :width="196" popper-class="workspace-action-menu-popper"><template #reference><button type="button" class="workspace-session-row__tool" :aria-label="`${session.title} 对话操作`"><AppIcon name="MoreFilled" /></button></template><div class="workspace-action-menu"><button type="button" class="is-danger" @click="deleteSession(session.id)"><AppIcon name="Delete" /><span>删除对话</span></button></div></el-popover></div>
              <button v-if="hasMoreProjectSessions(project.id)" type="button" class="workspace-show-all workspace-show-all--nested" @click="expandProjectSessions(project.id)">展开显示</button>
              <p v-if="!sessionsForProject(project.id).length" class="workspace-empty workspace-empty--nested">还没有对话</p>
            </div>
          </div>
          <button v-if="store.projects.length > PROJECT_LIMIT && !showAllProjects" type="button" class="workspace-show-all workspace-show-all--projects" @click="showAllProjects = true">展开显示</button>
          <p v-if="!store.projects.length" class="workspace-empty">还没有项目</p>
        </div>
      </section>

      <section class="workspace-group workspace-group--sessions">
        <div class="workspace-group__header">
          <button type="button" class="workspace-group__toggle" :aria-expanded="sessionsExpanded" @click="toggleRecentSessions"><span>最近对话</span><AppIcon class="workspace-group__chevron" :name="sessionsExpanded ? 'ArrowDown' : 'ArrowRight'" /></button>
          <div class="workspace-group__actions"><el-popover trigger="click" placement="right-start" :width="196" popper-class="workspace-action-menu-popper"><template #reference><button type="button" class="workspace-group__tool" aria-label="对话操作"><AppIcon name="MoreFilled" /></button></template><div class="workspace-action-menu"><button type="button" @click="handleHistoryCommand('select')"><AppIcon name="Check" /><span>{{ selecting ? '完成选择' : '选择对话' }}</span></button><button v-if="selecting" type="button" @click="handleHistoryCommand('all')"><AppIcon name="Check" /><span>{{ allSelected ? '取消全选' : '全选' }}</span></button><button v-if="selecting" type="button" class="is-danger" :disabled="!selectedIds.length" @click="handleHistoryCommand('delete')"><AppIcon name="Delete" /><span>删除选中</span></button></div></el-popover></div>
        </div>
        <div v-if="sessionsExpanded" class="workspace-group__items workspace-group__items--sessions" :class="{ 'is-selecting': selecting }">
          <div v-for="session in visibleRecentSessions" :key="session.id" class="workspace-session-row" :class="{ active: session.id === store.activeSession?.id, 'is-selecting': selecting }"><button type="button" class="workspace-item workspace-item--session" @click="selecting ? toggleSelection(session.id) : openSession(session.id)"><el-checkbox v-if="selecting" :model-value="selectedIds.includes(session.id)" @click.stop @change="toggleSelection(session.id)" /><span class="workspace-item__title">{{ session.title }}</span></button><el-popover v-if="!selecting" trigger="click" placement="right-start" :width="196" popper-class="workspace-action-menu-popper"><template #reference><button type="button" class="workspace-session-row__tool" :aria-label="`${session.title} 对话操作`"><AppIcon name="MoreFilled" /></button></template><div class="workspace-action-menu"><button type="button" class="is-danger" @click="deleteSession(session.id)"><AppIcon name="Delete" /><span>删除对话</span></button></div></el-popover></div>
          <button v-if="recentSessions.length > RECENT_SESSION_LIMIT && !showAllSessions" type="button" class="workspace-show-all" @click="showAllSessions = true">展开显示</button>
          <p v-if="!recentSessions.length" class="workspace-empty">还没有临时对话</p>
        </div>
      </section>
    </template>

    <el-dialog v-model="projectDialogVisible" width="560px" :show-close="false" destroy-on-close class="project-dialog">
      <template #header><div class="project-dialog__header"><h2>创建项目</h2><button type="button" class="project-dialog__close" aria-label="关闭创建项目" @click="projectDialogVisible = false"><AppIcon name="Close" /></button></div></template>
      <form class="project-form" @submit.prevent="createProject">
        <div class="project-name-row"><el-popover trigger="click" placement="bottom-start" width="232"><template #reference><button type="button" class="project-icon-trigger" :aria-label="`选择项目图标，当前为 ${projectForm.icon}`"><AppIcon :name="projectForm.icon" /><AppIcon name="ArrowDown" /></button></template><div class="project-icons"><button v-for="icon in PROJECT_ICON_OPTIONS" :key="icon" type="button" class="project-icon-option" :class="{ active: projectForm.icon === icon }" :aria-label="`选择 ${icon} 图标`" @click="projectForm.icon = icon"><AppIcon :name="icon" /></button></div></el-popover><el-input v-model="projectForm.name" class="project-name-input" maxlength="60" placeholder="输入项目名称" /></div>
        <div class="project-folder-field"><span class="project-field-label">源文件夹</span><button type="button" class="project-folder-picker" :class="{ 'has-directory': projectForm.directory }" :disabled="selectingDirectory" @click="selectDirectory"><AppIcon name="FolderOpened" /><span>{{ projectForm.directory || '添加 Mira 可读取和编辑的文件夹' }}</span><AppIcon v-if="selectingDirectory" class="is-loading" name="Loading" /></button></div>
      </form>
      <template #footer><div class="project-dialog__footer"><button type="button" class="project-dialog__cancel" @click="projectDialogVisible = false">取消</button><button type="button" class="project-dialog__submit" :disabled="!canCreateProject || creatingProject" @click="createProject"><AppIcon v-if="creatingProject" name="Loading" />创建项目</button></div></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { DEFAULT_PROJECT_ICON, PROJECT_ICON_OPTIONS } from '@/config/harness'
import { getPlatformApi } from '@/platform'
import { useHarnessStore } from '@/stores/harness'

defineProps<{ collapsed: boolean }>()

const route = useRoute()
const router = useRouter()
const store = useHarnessStore()
const PROJECT_LIMIT = 6
const PROJECT_SESSION_INITIAL_LIMIT = 5
const PROJECT_SESSION_EXTENDED_LIMIT = 12
const RECENT_SESSION_LIMIT = 12
const projectsExpanded = ref(false)
const expandedProjectIds = ref<string[]>([])
const projectSessionVisibleCounts = ref<Record<string, number>>({})
const sessionsExpanded = ref(false)
const showAllProjects = ref(false)
const showAllSessions = ref(false)
let groupStatesInitialized = false
const selecting = ref(false)
const selectedIds = ref<string[]>([])
const projectDialogVisible = ref(false)
const selectingDirectory = ref(false)
const creatingProject = ref(false)
const projectForm = reactive<{ name: string, icon: string, directory: string }>({ name: '', icon: DEFAULT_PROJECT_ICON, directory: '' })
const recentSessions = computed(() => store.sessions.filter(session => !session.projectId))
const visibleProjects = computed(() => showAllProjects.value ? store.projects : store.projects.slice(0, PROJECT_LIMIT))
const visibleRecentSessions = computed(() => showAllSessions.value ? recentSessions.value : recentSessions.value.slice(0, RECENT_SESSION_LIMIT))
const allSelected = computed(() => recentSessions.value.length > 0 && recentSessions.value.every(session => selectedIds.value.includes(session.id)))
const canCreateProject = computed(() => Boolean(projectForm.name.trim() && projectForm.directory))

async function refresh() {
  await Promise.all([store.refreshProjects(), store.refreshSessions()])
  if (groupStatesInitialized) return
  projectsExpanded.value = store.projects.length > 0
  sessionsExpanded.value = recentSessions.value.length > 0
  groupStatesInitialized = true
}
async function newSession() { const draft = store.startDraft(); await router.push({ path: '/workspace/chat', query: { draft } }) }
function isProjectExpanded(id: string) { return expandedProjectIds.value.includes(id) }
function toggleProjects() {
  projectsExpanded.value = !projectsExpanded.value
  if (!projectsExpanded.value) showAllProjects.value = false
}
function toggleRecentSessions() {
  sessionsExpanded.value = !sessionsExpanded.value
  if (!sessionsExpanded.value) showAllSessions.value = false
}
function resetProjectSessions(projectId: string) {
  const next = { ...projectSessionVisibleCounts.value }
  delete next[projectId]
  projectSessionVisibleCounts.value = next
}
function toggleProject(id: string) {
  if (isProjectExpanded(id)) {
    expandedProjectIds.value = expandedProjectIds.value.filter(projectId => projectId !== id)
    resetProjectSessions(id)
    return
  }
  expandedProjectIds.value = [...expandedProjectIds.value, id]
}
function sessionsForProject(projectId: string) { return store.sessions.filter(session => session.projectId === projectId) }
function projectSessionVisibleCount(projectId: string) { return projectSessionVisibleCounts.value[projectId] || PROJECT_SESSION_INITIAL_LIMIT }
function visibleProjectSessions(projectId: string) { return sessionsForProject(projectId).slice(0, projectSessionVisibleCount(projectId)) }
function hasMoreProjectSessions(projectId: string) { return sessionsForProject(projectId).length > projectSessionVisibleCount(projectId) }
function expandProjectSessions(projectId: string) {
  const current = projectSessionVisibleCount(projectId)
  const total = sessionsForProject(projectId).length
  projectSessionVisibleCounts.value = { ...projectSessionVisibleCounts.value, [projectId]: current < PROJECT_SESSION_EXTENDED_LIMIT ? PROJECT_SESSION_EXTENDED_LIMIT : total }
}
async function createProjectSession(projectId: string) { const draft = store.startDraft(projectId); await router.push({ path: '/workspace/chat', query: { draft } }) }
async function openSession(id: string) { await store.openSession(id); await router.push(`/workspace/chat/${id}`) }

function openProjectDialog() { Object.assign(projectForm, { name: '', icon: DEFAULT_PROJECT_ICON, directory: '' }); projectDialogVisible.value = true }
async function selectDirectory() {
  selectingDirectory.value = true
  try {
    const directory = await getPlatformApi()?.selectHarnessProjectDirectory()
    if (!directory) return
    projectForm.directory = directory
    if (!projectForm.name) projectForm.name = directory.split(/[\\/]/).filter(Boolean).pop() || ''
  } finally { selectingDirectory.value = false }
}
async function createProject() {
  if (!canCreateProject.value) return
  creatingProject.value = true
  try {
    const project = await store.createProject({ name: projectForm.name, icon: projectForm.icon, directory: projectForm.directory })
    if (project) { if (store.projects.length === 1) projectsExpanded.value = true; projectDialogVisible.value = false; ElMessage.success('项目已创建') }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '创建项目失败') } finally { creatingProject.value = false }
}

function toggleSelection(id: string) { selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(value => value !== id) : [...selectedIds.value, id] }
function handleProjectGroupCommand(command: string) {
  if (command === 'expand') { expandedProjectIds.value = store.projects.map(project => project.id); return }
  expandedProjectIds.value = []
  projectSessionVisibleCounts.value = {}
}
function handleProjectCommand(command: string, projectId: string) {
  if (command === 'toggle') toggleProject(projectId)
}
async function deleteSession(sessionId: string) {
  await ElMessageBox.confirm('将永久删除此对话，无法恢复。', '删除对话', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  await store.deleteSessions([sessionId])
  if (route.params.id === sessionId) await router.replace('/workspace/chat')
  ElMessage.success('对话已删除')
}
async function handleHistoryCommand(command: string) {
  if (command === 'select') { selecting.value = !selecting.value; if (selecting.value) showAllSessions.value = true; else selectedIds.value = []; return }
  if (command === 'all') { selectedIds.value = allSelected.value ? [] : recentSessions.value.map(session => session.id); return }
  if (command !== 'delete' || !selectedIds.value.length) return
  await ElMessageBox.confirm(`将永久删除 ${selectedIds.value.length} 个会话，无法恢复。`, '删除对话', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  await store.deleteSessions(selectedIds.value)
  selectedIds.value = []
  selecting.value = false
  ElMessage.success('会话已删除')
}

watch(() => store.projects.length, (count, previousCount) => {
  if (!groupStatesInitialized) return
  if (!count) { projectsExpanded.value = false; showAllProjects.value = false }
  else if (!previousCount) projectsExpanded.value = true
})
watch(() => recentSessions.value.length, (count, previousCount) => {
  if (!groupStatesInitialized) return
  if (!count) { sessionsExpanded.value = false; showAllSessions.value = false }
  else if (!previousCount) sessionsExpanded.value = true
})
watch(() => route.params.id, id => { if (typeof id === 'string') void store.openSession(id) })
onMounted(() => { void refresh() })
</script>

<style scoped lang="scss">
.workspace-navigation { padding: 10px 8px 12px; color: var(--cp-sidebar-menu-text); border-bottom: 1px solid var(--cp-border-light); margin-bottom: 6px }
.workspace-action, .workspace-group__toggle, .workspace-group__tool, .workspace-item, .workspace-show-all, .workspace-project__toggle, .workspace-project__tool, .workspace-project__new, .workspace-session-row__tool { display: flex; align-items: center; border: 0; color: inherit; background: transparent; font: inherit; cursor: pointer; }
.workspace-action { width: 100%; height: 32px; gap: 10px; padding: 0 10px; border-radius: $radius-md; font-size: 14px; font-weight: $font-medium; text-align: left; }
.workspace-action:hover, .workspace-action.active { color: var(--cp-sidebar-menu-text); background: var(--cp-sidebar-menu-hover-bg); }
.workspace-action--primary { margin-bottom: 2px; }
.workspace-action .el-tag { margin-left: auto; }
.workspace-group { margin: 18px 0 0; }
.workspace-group--sessions { margin-top: 20px; }
.workspace-group__header, .workspace-project__header, .workspace-session-row { display: flex; align-items: center; min-width: 0; }
.workspace-group__toggle { flex: 0 1 auto; min-width: 0; height: 34px; gap: 6px; padding: 0 10px; color: var(--cp-text-tertiary); border-radius: $radius-md; font-size: 14px; text-align: left; }
.workspace-group__toggle:hover { color: var(--cp-text-secondary); }
.workspace-group__chevron { flex: 0 0 auto; color: currentcolor; font-size: 13px; opacity: 0; transition: opacity $transition-fast; }
.workspace-group__header:hover .workspace-group__chevron, .workspace-group__header:focus-within .workspace-group__chevron { opacity: 1; }
.workspace-group__actions, .workspace-project__actions { display: flex; align-items: center; margin-left: auto; opacity: 0; pointer-events: none; transition: opacity var(--cp-animation-duration); }
.workspace-group__header:hover .workspace-group__actions, .workspace-group__header:focus-within .workspace-group__actions, .workspace-project__header:hover .workspace-project__actions, .workspace-project__header:focus-within .workspace-project__actions, .workspace-session-row:hover .workspace-session-row__tool, .workspace-session-row:focus-within .workspace-session-row__tool { opacity: 1; pointer-events: auto; }
.workspace-group__tool, .workspace-project__tool, .workspace-project__new, .workspace-session-row__tool { width: 28px; height: 28px; justify-content: center; border-radius: $radius-sm; color: var(--cp-text-tertiary); }
.workspace-group__tool:hover, .workspace-project__tool:hover, .workspace-project__new:hover, .workspace-session-row__tool:hover { color: var(--cp-text); background: var(--cp-sidebar-menu-hover-bg); }
.workspace-group__items { display: flex; max-height: 264px; flex-direction: column; gap: 2px; padding: 8px 0 2px; overflow-y: auto; }
.workspace-group__items--projects { max-height: 360px; }
.workspace-group__items--sessions { max-height: 290px; }
.workspace-project__header { min-height: 36px; border-radius: $radius-md;margin-bottom: 2px; }
.workspace-project__header:hover, .workspace-session-row:hover, .workspace-session-row.active { color: var(--cp-sidebar-menu-text); background: var(--cp-sidebar-menu-hover-bg); }
.workspace-project__toggle { flex: 1; min-width: 0; height: 36px; gap: 10px; padding: 0 10px; border-radius: $radius-md; font-size: 13px; text-align: left; }
.workspace-project__toggle > span, .workspace-item__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-project__toggle .app-icon { flex: 0 0 auto; color: var(--cp-sidebar-menu-text); font-size: 17px; }
.workspace-project__sessions { display: flex; flex-direction: column; gap: 2px; }
.workspace-session-row { min-width: 0; min-height: 34px; border-radius: $radius-md; }
.workspace-item { flex: 1; min-width: 0; height: 34px; gap: 8px; padding: 0 10px; border-radius: $radius-md; text-align: left; font-size: 13px; }
.workspace-item--session { color: var(--cp-sidebar-menu-text); }
.workspace-item__title { min-width: 0; }
.workspace-session-row--nested .workspace-item { padding-left: 48px; }
.workspace-session-row__tool { flex: 0 0 auto; margin-right: 2px; opacity: 0; pointer-events: none; }
.workspace-session-row.is-selecting .workspace-item { padding-right: 10px; }
.workspace-item :deep(.el-checkbox) { margin-right: 1px; }
.workspace-show-all { height: 32px; padding: 0 10px; color: var(--cp-text-tertiary); font-size: 13px; }
.workspace-show-all--projects { padding-left: 10px; }.workspace-show-all--nested { padding-left: 48px; }
.workspace-show-all:hover { color: var(--cp-text-secondary); }
.workspace-empty { margin: 2px 10px 6px; color: var(--cp-text-tertiary); font-size: 12px; }
.workspace-empty--nested { padding-left: 38px; }
.project-form { display: flex; flex-direction: column; gap: 22px; }
.project-name-row { display: flex; width: 100%; height: 48px; gap: 0; border: 1px solid var(--cp-border); border-radius: 12px; background: var(--cp-bg); transition: border-color var(--cp-animation-duration), box-shadow var(--cp-animation-duration); }
.project-name-row:focus-within { border-color: var(--cp-text-secondary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cp-text) 7%, transparent); }
.project-icon-trigger { display: flex; flex: 0 0 48px; align-items: center; justify-content: center; gap: 2px; color: var(--cp-text-secondary); background: transparent; border: 0; border-right: 1px solid var(--cp-border-light); border-radius: 11px 0 0 11px; cursor: pointer; }
.project-icon-trigger:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
.project-icon-trigger .app-icon:last-child { font-size: 12px; }
.project-name-input { flex: 1; }
.project-name-input :deep(.el-input__wrapper) { padding: 0 14px; background: transparent; box-shadow: none !important; }
.project-name-input :deep(.el-input__inner) { color: var(--cp-text); font-size: 15px; }
.project-icons { display: flex; gap: 8px; flex-wrap: wrap; }
.project-icon-option { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid var(--cp-border); border-radius: 9px; color: var(--cp-text-secondary); background: var(--cp-bg); cursor: pointer; }
.project-icon-option:hover, .project-icon-option.active { border-color: var(--cp-text-secondary); color: var(--cp-text); background: var(--cp-bg-hover); }
.project-folder-field { display: flex; flex-direction: column; gap: 9px; }
.project-field-label { color: var(--cp-text); font-size: 14px; font-weight: $font-medium; }
.project-folder-picker { display: flex; min-height: 112px; align-items: center; justify-content: center; gap: 10px; padding: 18px 26px; color: var(--cp-text-secondary); text-align: center; cursor: pointer; background: var(--cp-bg-hover); border: 1px solid transparent; border-radius: 12px; font: inherit; font-size: 14px; transition: border-color var(--cp-animation-duration), background var(--cp-animation-duration), color var(--cp-animation-duration); }
.project-folder-picker:hover { color: var(--cp-text); border-color: var(--cp-border); background: color-mix(in srgb, var(--cp-bg-hover) 72%, var(--cp-bg)); }
.project-folder-picker.has-directory { justify-content: flex-start; color: var(--cp-text); text-align: left; }
.project-folder-picker span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-folder-picker .app-icon { flex: 0 0 auto; font-size: 19px; }
.project-folder-picker .is-loading { margin-left: auto; animation: project-icon-spin 1s linear infinite; }
.project-folder-picker:disabled { cursor: wait; opacity: .68; }
.project-dialog__header { display: flex; align-items: center; justify-content: space-between; }
.project-dialog__header h2 { margin: 0; color: var(--cp-text); font-size: 20px; font-weight: $font-semibold; }
.project-dialog__close { display: grid; width: 30px; height: 30px; place-items: center; color: var(--cp-text-secondary); cursor: pointer; background: transparent; border: 0; border-radius: 8px; }
.project-dialog__close:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
.project-dialog__footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.project-dialog__cancel, .project-dialog__submit { min-width: 82px; height: 40px; padding: 0 15px; border-radius: 10px; font: inherit; font-size: 14px; font-weight: $font-medium; cursor: pointer; }
.project-dialog__cancel { color: var(--cp-text-secondary); background: transparent; border: 0; }
.project-dialog__cancel:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
.project-dialog__submit { display: inline-flex; align-items: center; justify-content: center; gap: 7px; color: var(--cp-bg); background: var(--cp-text); border: 0; }
.project-dialog__submit:hover:not(:disabled) { background: var(--cp-text-secondary); }
.project-dialog__submit:disabled { cursor: not-allowed; opacity: .42; }
.project-dialog__submit .app-icon { animation: project-icon-spin 1s linear infinite; }
:global(.project-dialog.el-dialog) { max-width: calc(100vw - 32px); overflow: hidden; background: var(--cp-bg-overlay); border: 1px solid var(--cp-border-light); border-radius: 18px; box-shadow: 0 18px 40px rgb(0 0 0 / 16%); }
:global(.project-dialog .el-dialog__header) { margin: 0; padding: 22px 24px 16px; border-bottom: 1px solid var(--cp-border-light); }
:global(.project-dialog .el-dialog__body) { padding: 20px 24px 12px; }
:global(.project-dialog .el-dialog__footer) { padding: 12px 24px 22px; }
:global([data-theme='dark'] .project-dialog.el-dialog) { background: #2d2e32; border-color: #505158; box-shadow: 0 20px 46px rgb(0 0 0 / 42%); }
:global([data-theme='dark'] .project-dialog .el-dialog__header) { border-color: #484950; }
:global([data-theme='dark']) .project-name-row { background: #1b1c20; border-color: #505158; }
:global([data-theme='dark']) .project-name-row:focus-within { border-color: #81828a; box-shadow: 0 0 0 3px rgb(129 130 138 / 20%); }
:global([data-theme='dark']) .project-icon-trigger { border-color: #45464c; }
:global([data-theme='dark']) .project-folder-picker { background: #292a2e; border-color: #4b4c53; }
:global([data-theme='dark']) .project-folder-picker:hover { border-color: #66676f; background: #303136; }
:global([data-theme='dark']) .project-dialog__close:hover, :global([data-theme='dark']) .project-dialog__cancel:hover { background: #3a3b41; }
@keyframes project-icon-spin { to { transform: rotate(360deg); } }
.workspace-navigation button:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: -2px; }
.workspace-navigation.collapsed { padding: 10px 4px; }
.workspace-navigation.collapsed .workspace-action { width: 38px; justify-content: center; padding: 0; margin: 2px auto 8px; border-radius: $radius-md; }
:global(.workspace-action-menu-popper.el-popover.el-popper) { padding: 6px; background: var(--cp-bg-overlay); border: 1px solid var(--cp-border); border-radius: 16px; box-shadow: 0 14px 30px rgb(0 0 0 / 12%); }
:global(.workspace-action-menu-popper .el-popper__arrow) { display: none; }
.workspace-action-menu { display: flex; flex-direction: column; gap: 2px; }
.workspace-action-menu button { display: flex; width: 100%; min-height: 38px; align-items: center; gap: 10px; padding: 0 10px; color: var(--cp-text); text-align: left; cursor: pointer; background: transparent; border: 0; border-radius: 10px; font: inherit; font-size: 14px; }
.workspace-action-menu button:hover { background: var(--cp-bg-hover); }
.workspace-action-menu button:disabled { color: var(--cp-text-tertiary); cursor: not-allowed; }
.workspace-action-menu button:disabled:hover { background: transparent; }
.workspace-action-menu button.is-danger:hover { color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 8%, var(--cp-bg-hover)); }
.workspace-action-menu .app-icon { flex: 0 0 auto; color: var(--cp-text-secondary); font-size: 17px; }
.workspace-action-menu button.is-danger:hover .app-icon { color: currentcolor; }
</style>
