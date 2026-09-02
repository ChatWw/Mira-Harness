<template>
  <section class="workspace-navigation" :class="{ collapsed }" aria-label="Mira 工作台">
    <el-tooltip :disabled="!collapsed" content="自动化" placement="right">
      <button type="button" class="workspace-action" :class="{ active: route.path === '/workspace/automations' }" @click="router.push('/workspace/automations')"><AppIcon name="Clock" /><span v-if="!collapsed">自动化</span></button>
    </el-tooltip>

    <template v-if="!collapsed">
      <section v-if="pinnedSessions.length" class="workspace-group workspace-group--pinned">
        <div class="workspace-group__label">置顶</div>
        <div class="workspace-group__items workspace-group__items--pinned">
          <div v-for="session in pinnedSessions" :key="session.id" class="workspace-session-row" :class="{ active: session.id === store.activeSession?.id }" @contextmenu.prevent="openSessionContextMenu($event, session.id)"><button type="button" class="workspace-item workspace-item--session" @click="openSession(session.id)"><span class="workspace-item__title">{{ session.title }}</span></button><span v-if="session.planStatus" class="workspace-session-row__status is-plan">{{ planStatusLabel(session.planStatus) }}</span><span v-else-if="store.pendingPermissionRequests[session.id]" class="workspace-session-row__status is-waiting"><AppIcon name="WarningFilled" /><span>等待审批</span></span><span v-else-if="store.runningSessionIds.includes(session.id)" class="workspace-session-row__status is-running"><AppIcon name="Loading" /></span><span v-else-if="store.unreadSessionIds.includes(session.id)" class="workspace-session-row__status is-unread" /></div>
        </div>
      </section>

      <section class="workspace-group">
        <div class="workspace-group__header">
          <button type="button" class="workspace-group__toggle" :aria-expanded="projectsExpanded" @click="toggleProjects"><span>项目</span><AppIcon class="workspace-group__chevron" :name="projectsExpanded ? 'ArrowDown' : 'ArrowRight'" /></button>
          <div class="workspace-group__actions"><el-popover v-model:visible="projectActionsVisible" trigger="click" placement="right-start" :width="214" popper-class="workspace-action-menu-popper"><template #reference><button type="button" class="workspace-group__tool" aria-label="项目操作"><AppIcon name="MoreFilled" /></button></template><div class="workspace-action-menu"><button type="button" @click="openProjectManagement"><AppIcon name="FolderOpened" /><span>项目管理</span></button></div></el-popover><el-tooltip content="创建项目" placement="right"><button type="button" class="workspace-group__tool" aria-label="创建项目" @click="openProjectDialog"><AppIcon name="Plus" /></button></el-tooltip></div>
        </div>
        <div v-if="projectsExpanded" class="workspace-group__items workspace-group__items--projects">
          <div v-for="project in visibleProjects" :key="project.id" class="workspace-project">
            <div class="workspace-project__header">
              <button type="button" class="workspace-project__toggle" :aria-expanded="isProjectExpanded(project.id)" :title="project.directory" @click="toggleProject(project.id)"><AppIcon :name="project.icon" /><span>{{ project.name }}</span></button>
              <div class="workspace-project__actions"><el-popover trigger="click" placement="right-start" :width="190" popper-class="workspace-action-menu-popper"><template #reference><button type="button" class="workspace-project__tool" :aria-label="`${project.name} 项目操作`"><AppIcon name="MoreFilled" /></button></template><div class="workspace-action-menu"><button type="button" @click="openProjectEditor(project)"><AppIcon name="tabler:edit" /><span>编辑项目</span></button><button type="button" @click="handleProjectCommand('open-directory', project.id)"><AppIcon name="FolderOpened" /><span>{{ projectDirectoryActionLabel }}</span></button><button type="button" class="is-danger" @click="handleProjectCommand('remove', project.id)"><AppIcon name="Delete" /><span>从列表中移除</span></button></div></el-popover><el-tooltip content="在项目中创建对话" placement="right"><button type="button" class="workspace-project__new" :aria-label="`在 ${project.name} 中创建对话`" @click="createProjectSession(project.id)"><AppIcon name="tabler:edit" /></button></el-tooltip></div>
            </div>
            <div v-if="isProjectExpanded(project.id)" class="workspace-project__sessions">
              <div v-for="session in visibleProjectSessions(project.id)" :key="session.id" class="workspace-session-row workspace-session-row--nested" :class="{ active: session.id === store.activeSession?.id }" @contextmenu.prevent="openSessionContextMenu($event, session.id)"><button type="button" class="workspace-item workspace-item--session" @click="openSession(session.id)"><span class="workspace-item__title">{{ session.title }}</span></button><span v-if="session.planStatus" class="workspace-session-row__status is-plan">{{ planStatusLabel(session.planStatus) }}</span><span v-else-if="store.pendingPermissionRequests[session.id]" class="workspace-session-row__status is-waiting"><AppIcon name="WarningFilled" /><span>等待审批</span></span><span v-else-if="store.runningSessionIds.includes(session.id)" class="workspace-session-row__status is-running"><AppIcon name="Loading" /></span><span v-else-if="store.unreadSessionIds.includes(session.id)" class="workspace-session-row__status is-unread" /></div>
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
          <div class="workspace-group__actions"><el-popover v-model:visible="historyActionsVisible" trigger="click" placement="right-start" :width="196" popper-class="workspace-action-menu-popper"><template #reference><button type="button" class="workspace-group__tool" aria-label="对话操作"><AppIcon name="MoreFilled" /></button></template><div class="workspace-action-menu"><button type="button" @click="openHistory"><AppIcon name="Clock" /><span>查看全部对话</span></button></div></el-popover></div>
        </div>
        <div v-if="sessionsExpanded" class="workspace-group__items workspace-group__items--sessions">
          <div v-for="session in visibleRecentSessions" :key="session.id" class="workspace-session-row" :class="{ active: session.id === store.activeSession?.id }" @contextmenu.prevent="openSessionContextMenu($event, session.id)"><button type="button" class="workspace-item workspace-item--session" @click="openSession(session.id)"><span class="workspace-item__title">{{ session.title }}</span></button><span v-if="session.planStatus" class="workspace-session-row__status is-plan">{{ planStatusLabel(session.planStatus) }}</span><span v-else-if="store.pendingPermissionRequests[session.id]" class="workspace-session-row__status is-waiting"><AppIcon name="WarningFilled" /><span>等待审批</span></span><span v-else-if="store.runningSessionIds.includes(session.id)" class="workspace-session-row__status is-running"><AppIcon name="Loading" /></span><span v-else-if="store.unreadSessionIds.includes(session.id)" class="workspace-session-row__status is-unread" /></div>
          <button v-if="recentSessions.length > RECENT_SESSION_LIMIT && !showAllSessions" type="button" class="workspace-show-all" @click="showAllSessions = true">展开显示</button>
          <p v-if="!recentSessions.length" class="workspace-empty">还没有临时对话</p>
        </div>
      </section>
    </template>

    <div v-if="contextMenu.visible && contextSession" class="session-context-menu" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop @contextmenu.prevent>
      <button type="button" @click="toggleSessionPinned"><AppIcon :name="contextSession.pinned ? 'lucide:pin-off' : 'lucide:pin'" /><span>{{ contextSession.pinned ? '取消置顶聊天' : '置顶聊天' }}</span></button>
      <button type="button" @click="openSessionRenameDialog"><AppIcon name="tabler:edit" /><span>重命名聊天</span></button>
    </div>
    <el-dialog v-model="sessionRenameVisible" width="420px" :show-close="false" destroy-on-close class="project-dialog session-rename-dialog" align-center>
      <template #header><div class="project-dialog__header"><h2>重命名聊天</h2><button type="button" class="project-dialog__close" aria-label="关闭重命名聊天" @click="closeSessionRenameDialog"><AppIcon name="Close" /></button></div></template>
      <form @submit.prevent="saveSessionRename"><el-input v-model="sessionRenameTitle" class="session-rename-input" maxlength="42" show-word-limit aria-label="聊天名称" /></form>
      <template #footer><div class="project-dialog__footer"><button type="button" class="project-dialog__cancel" @click="closeSessionRenameDialog">取消</button><button type="button" class="project-dialog__submit" :disabled="!canRenameSession || savingSessionRename" @click="saveSessionRename"><AppIcon v-if="savingSessionRename" name="Loading" />保存</button></div></template>
    </el-dialog>
    <el-dialog v-model="projectDialogVisible" width="460px" :show-close="false" destroy-on-close class="project-dialog" align-center>
      <template #header><div class="project-dialog__header"><h2>创建项目</h2><button type="button" class="project-dialog__close" aria-label="关闭创建项目" @click="closeProjectDialog"><AppIcon name="Close" /></button></div></template>
      <form class="project-form" @submit.prevent="createProject">
        <div class="project-name-row"><FormIconPicker v-model="projectForm.icon" compact /><el-input v-model="projectForm.name" class="project-name-input" maxlength="60" placeholder="输入项目名称" /></div>
        <div class="project-folder-field"><span class="project-field-label">源文件夹</span><button type="button" class="project-folder-picker" :class="{ 'has-directory': projectForm.directory }" :disabled="selectingDirectory" @click="selectDirectory"><AppIcon name="lucide:folder-plus" /><span>{{ projectForm.directory || '添加 Mira 可读取和编辑的文件夹' }}</span></button></div>
      </form>
      <template #footer><div class="project-dialog__footer"><button type="button" class="project-dialog__cancel" @click="closeProjectDialog">取消</button><button type="button" class="project-dialog__submit" :disabled="!canCreateProject || creatingProject" @click="createProject"><AppIcon v-if="creatingProject" name="Loading" />创建项目</button></div></template>
    </el-dialog>
    <el-dialog v-model="projectEditorVisible" width="460px" :show-close="false" destroy-on-close class="project-dialog project-edit-dialog" align-center>
      <template #header><div class="project-dialog__header"><h2>编辑项目</h2><button type="button" class="project-dialog__close" aria-label="关闭编辑项目" @click="closeProjectEditor"><AppIcon name="Close" /></button></div></template>
      <form class="project-form" @submit.prevent="saveProjectEditor">
        <div class="project-name-row"><FormIconPicker v-model="projectEditorIcon" compact /><el-input v-model="projectEditorName" class="project-name-input" maxlength="60" placeholder="输入项目名称" /></div>
        <div class="project-folder-field"><span class="project-field-label">源文件夹</span><button type="button" class="project-folder-picker has-directory" :title="editingProject?.directory" @click="editingProject && handleProjectCommand('open-directory', editingProject.id)"><AppIcon name="FolderOpened" /><span>{{ editingProject?.directory }}</span></button></div>
      </form>
      <template #footer><div class="project-dialog__footer project-dialog__footer--edit"><button type="button" class="project-dialog__remove" @click="removeEditingProject">移除项目</button><div><button type="button" class="project-dialog__cancel" @click="closeProjectEditor">取消</button><button type="button" class="project-dialog__submit" :disabled="!canSaveProjectEditor || savingProjectEditor" @click="saveProjectEditor"><AppIcon v-if="savingProjectEditor" name="Loading" />保存</button></div></div></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { DEFAULT_PROJECT_ICON, OPEN_HARNESS_PROJECT_DIALOG_EVENT, type HarnessProject } from '@/config/harness'
import { getPlatformApi } from '@/platform'
import { useHarnessStore } from '@/stores/harness'
import FormIconPicker from '@/components/IconPicker/FormIconPicker.vue'

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
const projectActionsVisible = ref(false)
const historyActionsVisible = ref(false)
let groupStatesInitialized = false
const sessionRenameVisible = ref(false)
const sessionRenameId = ref('')
const sessionRenameTitle = ref('')
const savingSessionRename = ref(false)
const projectDialogVisible = ref(false)
let projectCreatedCallback: ((projectId: string) => void) | undefined
let projectUpdatedCallback: (() => void) | undefined
const projectEditorVisible = ref(false)
const editingProject = ref<HarnessProject>()
const projectEditorName = ref('')
const projectEditorIcon = ref<string>(DEFAULT_PROJECT_ICON)
const savingProjectEditor = ref(false)
const selectingDirectory = ref(false)
const creatingProject = ref(false)
const projectForm = reactive<{ name: string, icon: string, directory: string }>({ name: '', icon: DEFAULT_PROJECT_ICON, directory: '' })
const pinnedSessions = computed(() => store.sessions.filter(session => session.pinned))
const recentSessions = computed(() => store.sessions.filter(session => !session.projectId && !session.pinned))
const visibleProjects = computed(() => showAllProjects.value ? store.projects : store.projects.slice(0, PROJECT_LIMIT))
const visibleRecentSessions = computed(() => showAllSessions.value ? recentSessions.value : recentSessions.value.slice(0, RECENT_SESSION_LIMIT))
const canRenameSession = computed(() => Boolean(sessionRenameTitle.value.trim()))
const canCreateProject = computed(() => Boolean(projectForm.name.trim() && projectForm.directory))
const canSaveProjectEditor = computed(() => Boolean(editingProject.value && projectEditorName.value.trim()))
const projectDirectoryActionLabel = computed(() => getPlatformApi()?.windowChrome === 'macos-overlay' ? '在 Finder 中显示' : (getPlatformApi()?.windowChrome === 'windows-overlay' ? '在资源管理器中查看' : '打开文件夹'))
const contextMenu = reactive({ visible: false, x: 0, y: 0, sessionId: '' })
const contextSession = computed(() => store.sessions.find(session => session.id === contextMenu.sessionId))
function planStatusLabel(status: NonNullable<import('@/config/harness').HarnessSessionSummary['planStatus']>) {
  return ({ needs_input: '需要用户输入', awaiting_confirmation: '等待确认', executing: '执行中', completed: '已完成', cancelled: '已取消' })[status]
}

function openSessionContextMenu(event: MouseEvent, sessionId: string) {
  Object.assign(contextMenu, { visible: true, x: event.clientX, y: event.clientY, sessionId })
}
function closeSessionContextMenu() { contextMenu.visible = false }
async function toggleSessionPinned() {
  const session = contextSession.value
  closeSessionContextMenu()
  if (!session) return
  try {
    await store.setSessionPinned(session.id, !session.pinned)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新置顶状态失败')
  }
}
function openSessionRenameDialog() {
  const session = contextSession.value
  closeSessionContextMenu()
  if (!session) return
  sessionRenameId.value = session.id
  sessionRenameTitle.value = session.title
  sessionRenameVisible.value = true
}
function closeSessionRenameDialog() {
  sessionRenameVisible.value = false
  sessionRenameId.value = ''
  sessionRenameTitle.value = ''
}
async function saveSessionRename() {
  const title = sessionRenameTitle.value.trim()
  if (!sessionRenameId.value || !title) return
  savingSessionRename.value = true
  try {
    await store.renameSession(sessionRenameId.value, title)
    closeSessionRenameDialog()
    ElMessage.success('聊天已重命名')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重命名聊天失败')
  } finally {
    savingSessionRename.value = false
  }
}
async function refresh() {
  await Promise.all([store.refreshProjects(), store.refreshSessions()])
  if (groupStatesInitialized) return
  projectsExpanded.value = store.projects.length > 0
  sessionsExpanded.value = recentSessions.value.length > 0
  groupStatesInitialized = true
}
function isProjectExpanded(id: string) { return expandedProjectIds.value.includes(id) }
function toggleProjects() {
  projectsExpanded.value = !projectsExpanded.value
  if (!projectsExpanded.value) showAllProjects.value = false
}
function toggleRecentSessions() {
  sessionsExpanded.value = !sessionsExpanded.value
  if (!sessionsExpanded.value) showAllSessions.value = false
}
async function openProjectManagement() {
  projectActionsVisible.value = false
  await router.push('/workspace/projects')
}
async function openHistory() {
  historyActionsVisible.value = false
  await router.push('/workspace/history')
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
function sessionsForProject(projectId: string) { return store.sessions.filter(session => session.projectId === projectId && !session.pinned) }
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

function showProjectDialog(onCreated?: (projectId: string) => void) { Object.assign(projectForm, { name: '', icon: DEFAULT_PROJECT_ICON, directory: '' }); projectCreatedCallback = onCreated; projectDialogVisible.value = true }
function openProjectDialog() { showProjectDialog() }
function closeProjectDialog() { projectDialogVisible.value = false; projectCreatedCallback = undefined }
function openProjectEditor(project: HarnessProject) { editingProject.value = project; projectEditorName.value = project.name; projectEditorIcon.value = project.icon; projectEditorVisible.value = true }
function closeProjectEditor() { projectEditorVisible.value = false; editingProject.value = undefined; projectEditorName.value = ''; projectEditorIcon.value = DEFAULT_PROJECT_ICON; projectUpdatedCallback = undefined }
async function saveProjectEditor() {
  const project = editingProject.value
  const name = projectEditorName.value.trim()
  const api = getPlatformApi()
  if (!project || !name || !api) return
  savingProjectEditor.value = true
  try {
    await api.renameHarnessProject(project.id, name, projectEditorIcon.value)
    await store.refreshProjects()
    const onUpdated = projectUpdatedCallback
    closeProjectEditor()
    onUpdated?.()
    ElMessage.success('项目已保存')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存项目失败') } finally { savingProjectEditor.value = false }
}
async function removeEditingProject() {
  const projectId = editingProject.value?.id
  closeProjectEditor()
  if (projectId) await handleProjectCommand('remove', projectId)
}
function handleProjectDialogRequest(event: Event) {
  const detail = (event as CustomEvent<import('@/config/harness').HarnessProjectDialogRequest>).detail
  if (detail?.project) {
    projectUpdatedCallback = detail.onUpdated
    openProjectEditor(detail.project)
    return
  }
  if (detail?.removeProjectId) {
    void handleProjectCommand('remove', detail.removeProjectId).then(removed => { if (removed) detail.onRemoved?.() })
    return
  }
  showProjectDialog(detail?.onCreated)
}
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
    if (project) { const onCreated = projectCreatedCallback; if (store.projects.length === 1) projectsExpanded.value = true; projectDialogVisible.value = false; onCreated?.(project.id); ElMessage.success('项目已创建') }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '创建项目失败') } finally { creatingProject.value = false }
}

async function handleProjectCommand(command: string, projectId: string) {
  if (command === 'open-directory') {
    const error = await getPlatformApi()?.openHarnessProjectDirectory(projectId)
    if (error) ElMessage.error(error)
    return false
  }
  if (command !== 'remove') return false
  const project = store.projects.find(item => item.id === projectId)
  if (!project) return false
  try {
    await ElMessageBox.confirm(`将从 Mira 移除“${project.name}”的项目注册，磁盘文件不受影响。`, '移除项目注册', { confirmButtonText: '移除注册', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger', type: 'warning' })
  } catch { return false }
  const wasActiveProject = store.activeSession?.projectId === projectId
  await store.removeProject(projectId)
  expandedProjectIds.value = expandedProjectIds.value.filter(id => id !== projectId)
  resetProjectSessions(projectId)
  if (wasActiveProject) await router.replace('/workspace/chat')
  ElMessage.success('项目已从列表中移除')
  return true
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
watch(projectDialogVisible, visible => { if (!visible) projectCreatedCallback = undefined })
onMounted(() => { void refresh(); document.addEventListener('click', closeSessionContextMenu); window.addEventListener(OPEN_HARNESS_PROJECT_DIALOG_EVENT, handleProjectDialogRequest) })
onBeforeUnmount(() => { document.removeEventListener('click', closeSessionContextMenu); window.removeEventListener(OPEN_HARNESS_PROJECT_DIALOG_EVENT, handleProjectDialogRequest) })
</script>

<style scoped lang="scss">
.workspace-navigation { padding: 0 8px 12px; color: var(--cp-sidebar-menu-text); border-bottom: 1px solid var(--cp-border-light); margin-bottom: 6px }
.workspace-action, .workspace-group__toggle, .workspace-group__tool, .workspace-item, .workspace-show-all, .workspace-project__toggle, .workspace-project__tool, .workspace-project__new, .workspace-session-row__tool { display: flex; align-items: center; border: 0; color: inherit; background: transparent; font: inherit; cursor: pointer; }
.workspace-action { width: 100%; height: 32px; gap: 10px; padding: 0 10px; border-radius: $radius-md; font-size: 14px; font-weight: $font-medium; text-align: left; }
.workspace-action:hover, .workspace-action.active { color: var(--cp-sidebar-menu-text); background: var(--cp-sidebar-menu-hover-bg); }
.workspace-action--primary { margin-bottom: 2px; }
.workspace-action .el-tag { margin-left: auto; }
.workspace-group { margin: 18px 0 0; }
.workspace-group--sessions { margin-top: 20px; }
.workspace-group__label { height: 34px; display: flex; align-items: center; padding: 0 10px; color: var(--cp-text-tertiary); font-size: 14px; }
.workspace-group__header, .workspace-project__header, .workspace-session-row { display: flex; align-items: center; min-width: 0; }
.workspace-group__toggle { flex: 0 1 auto; min-width: 0; height: 34px; gap: 6px; padding: 0 10px; color: var(--cp-text-tertiary); border-radius: $radius-md; font-size: 14px; text-align: left; }
.workspace-group__toggle:hover { color: var(--cp-text-secondary); }
.workspace-group__chevron { flex: 0 0 auto; color: currentcolor; font-size: 13px; opacity: 0; transition: opacity $transition-fast; }
.workspace-group__header:hover .workspace-group__chevron, .workspace-group__header:focus-within .workspace-group__chevron { opacity: 1; }
.workspace-group__actions, .workspace-project__actions { display: flex; align-items: center; margin-left: auto; opacity: 0; pointer-events: none; transition: opacity var(--cp-animation-duration); }
.workspace-group__header:hover .workspace-group__actions, .workspace-group__actions:focus-within, .workspace-project__header:hover .workspace-project__actions, .workspace-project__actions:focus-within, .workspace-session-row:hover .workspace-session-row__tool, .workspace-session-row:focus-within .workspace-session-row__tool { opacity: 1; pointer-events: auto; }
.workspace-group__tool, .workspace-project__tool, .workspace-project__new, .workspace-session-row__tool { width: 28px; height: 28px; justify-content: center; border-radius: $radius-sm; color: var(--cp-text-tertiary); }
.workspace-group__tool:hover, .workspace-project__tool:hover, .workspace-project__new:hover, .workspace-session-row__tool:hover { color: var(--cp-text); background: var(--cp-sidebar-menu-hover-bg); }
.workspace-group__items { display: flex; flex-direction: column; gap: 2px; padding: 8px 0 2px; }
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
.workspace-show-all { height: 32px; padding: 0 10px; color: var(--cp-text-tertiary); font-size: 13px; }
.workspace-show-all--projects { padding-left: 10px; }.workspace-show-all--nested { padding-left: 48px; }
.workspace-show-all:hover { color: var(--cp-text-secondary); }
.workspace-empty { margin: 2px 10px 6px; color: var(--cp-text-tertiary); font-size: 12px; }
.workspace-empty--nested { padding-left: 38px; }
.project-form { display: flex; flex-direction: column; gap: 14px; }
.project-name-row { display: flex; width: 100%; height: 40px; gap: 0; border: 1px solid var(--cp-border); border-radius: 10px; background: var(--cp-bg); transition: border-color var(--cp-animation-duration), box-shadow var(--cp-animation-duration); }
.project-name-row:focus-within { border-color: var(--cp-text-secondary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cp-text) 7%, transparent); }
.project-name-row :deep(.icon-picker-trigger.is-compact) { width: 40px; height: 38px; min-height: 38px; margin: 0; border: 0; border-right: 1px solid var(--cp-border-light); border-radius: 9px 0 0 9px; color: var(--cp-text-secondary); background: transparent; }
.project-name-row :deep(.icon-picker-trigger.is-compact:hover) { color: var(--cp-text); background: var(--cp-bg-hover); }
.project-name-input { flex: 1; }
.project-name-input :deep(.el-input__wrapper) { padding: 0 12px; background: transparent; box-shadow: none !important; }
.project-name-input :deep(.el-input__inner) { color: var(--cp-text); font-size: 14px; }
.session-rename-input :deep(.el-input__wrapper) { min-height: 40px; padding: 0 12px; background: var(--cp-bg); box-shadow: 0 0 0 1px var(--cp-border) inset !important; }
.session-rename-input :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px var(--cp-text-secondary) inset !important; }
.session-rename-input :deep(.el-input__inner) { color: var(--cp-text); font-size: 14px; }
.project-folder-field { display: flex; flex-direction: column; gap: 7px; }
.project-field-label { color: var(--cp-text); font-size: 13px; font-weight: $font-medium; }
.project-folder-picker { display: flex; min-height: 76px; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; color: var(--cp-text-secondary); text-align: center; cursor: pointer; background: var(--cp-bg-hover); border: 1px solid transparent; border-radius: 10px; font: inherit; font-size: 13px; transition: border-color var(--cp-animation-duration), background var(--cp-animation-duration), color var(--cp-animation-duration); }
.project-folder-picker:hover { color: var(--cp-text); border-color: var(--cp-border); background: color-mix(in srgb, var(--cp-bg-hover) 72%, var(--cp-bg)); }
.project-folder-picker.has-directory { justify-content: flex-start; color: var(--cp-text); text-align: left; }
.project-folder-picker span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-folder-picker .app-icon { flex: 0 0 auto; font-size: 17px; }
.project-folder-picker:disabled { cursor: wait; opacity: .68; }
.project-dialog__header { display: flex; align-items: center; justify-content: space-between; }
.project-dialog__header h2 { margin: 0; color: var(--cp-text); font-size: 18px; font-weight: $font-semibold; }
.project-dialog__close { display: grid; width: 28px; height: 28px; place-items: center; color: var(--cp-text-secondary); cursor: pointer; background: transparent; border: 0; border-radius: 7px; }
.project-dialog__close:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
.project-dialog__footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.project-dialog__footer--edit { justify-content: space-between; }
.project-dialog__footer--edit > div { display: flex; align-items: center; gap: 8px; }
.project-dialog__cancel, .project-dialog__submit { min-width: 76px; height: 34px; padding: 0 13px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: $font-medium; cursor: pointer; }
.project-dialog__cancel { color: var(--cp-text-secondary); background: transparent; border: 0; }
.project-dialog__cancel:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
.project-dialog__submit { display: inline-flex; align-items: center; justify-content: center; gap: 7px; color: var(--cp-bg); background: var(--cp-text); border: 0; }
.project-dialog__submit:hover:not(:disabled) { background: var(--cp-text-secondary); }
.project-dialog__submit:disabled { cursor: not-allowed; opacity: .42; }
.project-dialog__submit .app-icon { animation: project-icon-spin 1s linear infinite; }
.project-dialog__remove { height: 34px; padding: 0 13px; border: 0; border-radius: 8px; color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 10%, transparent); font: inherit; font-size: 13px; font-weight: $font-medium; cursor: pointer; }
.project-dialog__remove:hover { background: color-mix(in srgb, var(--cp-danger) 16%, transparent); }
:global(.project-dialog.el-dialog) { max-width: calc(100vw - 32px); overflow: hidden; background: var(--cp-bg-overlay); border: 1px solid var(--cp-border-light); border-radius: 18px; box-shadow: 0 18px 40px rgb(0 0 0 / 16%); }
:global(.project-dialog .el-dialog__header) { margin: 0; padding: 12px 0 0; border-bottom: 0 !important; }
:global(.project-dialog .el-dialog__body) { padding: 12px 0 0 ; }
:global(.project-dialog .el-dialog__footer) { padding: 12px 0 0; }
:global([data-theme='dark'] .project-dialog.el-dialog) { background: #2d2e32; border-color: #505158; box-shadow: 0 20px 46px rgb(0 0 0 / 42%); }
:global([data-theme='dark']) .project-name-row { background: #1b1c20; border-color: #505158; }
:global([data-theme='dark']) .project-name-row:focus-within { border-color: #81828a; box-shadow: 0 0 0 3px rgb(129 130 138 / 20%); }
:global([data-theme='dark']) .session-rename-input .el-input__wrapper { background: #1b1c20; box-shadow: 0 0 0 1px #505158 inset !important; }
:global([data-theme='dark']) .project-icon-trigger { border-color: #45464c; }
:global([data-theme='dark']) .project-folder-picker { background: #292a2e; border-color: #4b4c53; }
:global([data-theme='dark']) .project-folder-picker:hover { border-color: #66676f; background: #303136; }
:global([data-theme='dark']) .project-dialog__close:hover, :global([data-theme='dark']) .project-dialog__cancel:hover { background: #3a3b41; }
@keyframes project-icon-spin { to { transform: rotate(360deg); } }
.workspace-navigation button:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: -2px; }
.workspace-navigation.collapsed { padding: 10px 4px; }
.workspace-navigation.collapsed .workspace-action { width: 38px; justify-content: center; padding: 0; margin: 2px auto 8px; border-radius: $radius-md; }
:global(.workspace-action-menu-popper.el-popover.el-popper) { padding: 4px; background: var(--cp-bg-overlay); border: 1px solid var(--cp-border); border-radius: 12px; box-shadow: 0 14px 30px rgb(0 0 0 / 12%); }
:global(.workspace-action-menu-popper .el-popper__arrow) { display: none; }
.workspace-action-menu { display: flex; flex-direction: column; gap: 0; }
.workspace-action-menu button { display: flex; width: 100%; min-height: 32px; align-items: center; gap: 8px; padding: 0 8px; color: var(--cp-text); text-align: left; cursor: pointer; background: transparent; border: 0; border-radius: $radius-sm; font: inherit; font-size: 12px; }
.workspace-action-menu button:hover { background: var(--cp-bg-hover); }
.workspace-action-menu button:disabled { color: var(--cp-text-tertiary); cursor: not-allowed; }
.workspace-action-menu button:disabled:hover { background: transparent; }
.workspace-action-menu button.is-danger:hover { color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 8%, var(--cp-bg-hover)); }
.workspace-action-menu .app-icon { flex: 0 0 auto; color: var(--cp-text-secondary); font-size: 15px; }
.workspace-action-menu button.is-danger:hover .app-icon { color: currentcolor; }
.workspace-session-row__status { flex: 0 0 auto; display: inline-flex; align-items: center; margin-right: 8px; }
.workspace-session-row__status.is-running { color: var(--cp-primary); }
.workspace-session-row__status.is-running .app-icon { animation: session-status-spin 1s linear infinite; }
.workspace-session-row__status.is-waiting { gap: 4px; margin-right: 6px; padding: 2px 6px; border-radius: $radius-sm; color: var(--cp-warning); background: color-mix(in srgb, var(--cp-warning) 11%, transparent); font-size: 11px; white-space: nowrap; }.workspace-session-row__status.is-waiting .app-icon { font-size: 13px; }
.workspace-session-row__status.is-plan { margin-right: 6px; padding: 2px 6px; border-radius: $radius-sm; color: var(--cp-primary); background: color-mix(in srgb, var(--cp-primary) 11%, transparent); font-size: 11px; white-space: nowrap; }
.workspace-session-row__status.is-unread { width: 6px; height: 6px; margin-right: 10px; border-radius: 50%; background: var(--cp-primary); }
.session-context-menu { position: fixed; z-index: 3000; min-width: 154px; padding: 4px; background: var(--cp-bg-overlay); border: 1px solid var(--cp-border); border-radius: 12px; box-shadow: 0 14px 30px rgb(0 0 0 / 14%); }
.session-context-menu button { display: flex; width: 100%; min-height: 32px; align-items: center; gap: 8px; padding: 0 8px; color: var(--cp-text); text-align: left; cursor: pointer; background: transparent; border: 0; border-radius: $radius-sm; font: inherit; font-size: 12px; }
.session-context-menu button:hover { background: var(--cp-bg-hover); }
.session-context-menu .app-icon { color: var(--cp-text-secondary); font-size: 15px; }
@keyframes session-status-spin { to { transform: rotate(360deg); } }
</style>
