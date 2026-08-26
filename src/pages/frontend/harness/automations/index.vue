<template>
  <PageContainer fill-content class="automation-page" title="自动化" description="按时间或人工对话完成后，在本地项目中运行固定任务。">
    <template #header>
      <div class="automation-page-heading">
        <div class="automation-section-switch" role="tablist" aria-label="自动化视图">
          <button type="button" :class="{ active: activeSection === 'tasks' }" role="tab" :aria-selected="activeSection === 'tasks'" @click="activeSection = 'tasks'">定时任务</button>
          <button type="button" :class="{ active: activeSection === 'runs' }" role="tab" :aria-selected="activeSection === 'runs'" @click="activeSection = 'runs'">运行记录</button>
        </div>
        <p>{{ activeSection === 'tasks' ? '按时间或人工对话完成后，在本地项目中运行固定任务。' : '查看自动化任务的运行状态、结果与失败原因。' }}</p>
      </div>
    </template>
    <template v-if="activeSection === 'tasks'" #actions>
      <div class="page-actions"><el-button @click="openTemplateWizard"><AppIcon name="Collection" />从模板创建</el-button><el-button type="primary" @click="openBlankWizard"><AppIcon name="Plus" />新建自动化</el-button></div>
    </template>

    <template v-if="activeSection === 'tasks'">
    <div class="automation-task-content">
    <section class="automation-stats" aria-label="自动化状态">
      <article><span>已启用</span><strong>{{ overview.enabledCount }}</strong><small>共 {{ tasks.length }} 个任务</small></article>
      <article><span>运行中</span><strong>{{ overview.runningCount }}</strong><small>{{ runningTaskName || '暂无运行任务' }}</small></article>
      <article :class="{ 'is-danger': overview.failedLastDayCount }"><span>近 24 小时失败</span><strong>{{ overview.failedLastDayCount }}</strong><small>{{ failedTaskName || '运行状态良好' }}</small></article>
    </section>

    <p v-if="error" class="automation-error" role="alert">{{ error }}</p>
    <section class="automation-toolbar" aria-label="自动化筛选">
      <el-input v-model="query" clearable placeholder="搜索任务名称或 Prompt" class="automation-search"><template #prefix><AppIcon name="Search" /></template></el-input>
      <div class="status-filters" role="tablist" aria-label="任务状态"><button v-for="filter in filters" :key="filter.value" type="button" :class="{ active: statusFilter === filter.value }" role="tab" :aria-selected="statusFilter === filter.value" @click="statusFilter = filter.value">{{ filter.label }}<span>{{ filterCount(filter.value) }}</span></button></div>
      <div class="view-toggle" role="group" aria-label="视图切换"><button type="button" :class="{ active: viewMode === 'card' }" aria-label="卡片视图" @click="viewMode = 'card'"><AppIcon name="material-symbols:cards-stack-outline" /></button><button type="button" :class="{ active: viewMode === 'table' }" aria-label="表格视图" @click="viewMode = 'table'"><AppIcon name="material-symbols:table-view-outline" /></button></div>
    </section>

    <div class="automation-task-list">
      <section v-if="loading" v-loading="loading" class="automation-loading" aria-label="正在加载自动化任务" />
      <section v-else-if="!filteredTasks.length" class="automation-empty" aria-live="polite"><AppIcon name="Timer" /><h2>{{ tasks.length ? '没有匹配的自动化任务' : '还没有自动化任务' }}</h2><p>{{ tasks.length ? '换个搜索词或状态筛选试试。' : '从模板开始，30 秒内建立第一个自动化任务。' }}</p><div v-if="!tasks.length" class="automation-empty__actions"><el-button @click="openTemplateWizard"><AppIcon name="Collection" />从模板创建</el-button><el-button type="primary" @click="openBlankWizard"><AppIcon name="Plus" />新建空白任务</el-button></div></section>
      <section v-else-if="viewMode === 'card'" class="task-grid" aria-label="自动化任务列表"><TaskCard v-for="task in filteredTasks" :key="task.id" :task="task" :project-name="projectName(task.projectId)" :last-run="lastRun(task.id)" :next-run-at="taskNextRun(task)" :is-running="isTaskRunning(task.id)" @run="runNow(task)" @runs="openRuns(task)" @edit="openEdit(task)" @enabled="setEnabled(task, $event)" @action="handleAction($event, task)" /></section>
      <section v-else class="table-shell" aria-label="自动化任务表格"><el-table :data="filteredTasks" stripe><el-table-column prop="name" label="任务" min-width="200" show-overflow-tooltip /><el-table-column label="触发方式" min-width="190"><template #default="{ row }">{{ triggerLabel(row) }}</template></el-table-column><el-table-column label="目标" width="125"><template #default="{ row }">{{ targetLabel(row) }}</template></el-table-column><el-table-column label="下次运行" width="168"><template #default="{ row }">{{ rowNextLabel(row) }}</template></el-table-column><el-table-column label="上次结果" width="100"><template #default="{ row }"><span :class="['table-status', lastRun(row.id) ? `is-${lastRun(row.id)?.status}` : '']">{{ lastRunLabel(lastRun(row.id)) }}</span></template></el-table-column><el-table-column label="启用" width="82" align="center"><template #default="{ row }"><el-switch :model-value="row.enabled" :disabled="Boolean(row.endedAt)" size="small" @update:model-value="setEnabled(row, $event)" /></template></el-table-column><el-table-column label="操作" width="128" fixed="right"><template #default="{ row }"><div class="table-actions"><el-button text class="table-action" :class="{ 'is-loading': isTaskRunning(row.id) }" :disabled="isTaskRunning(row.id)" :aria-label="isTaskRunning(row.id) ? `${row.name} 正在运行` : `立即运行 ${row.name}`" @click="runNow(row)"><AppIcon :name="isTaskRunning(row.id) ? 'Loading' : 'VideoPlay'" /></el-button><el-button text class="table-action" aria-label="查看运行记录" @click="openRuns(row)"><AppIcon name="Document" /></el-button><el-button text class="table-action" aria-label="编辑任务" :disabled="Boolean(row.endedAt)" @click="openEdit(row)"><AppIcon name="EditPen" /></el-button></div></template></el-table-column></el-table></section>
    </div>
    </div>
    </template>

    <template v-else>
      <div class="automation-run-content">
      <section class="run-history-toolbar" aria-label="运行记录筛选">
        <el-select v-model="runTaskId" clearable placeholder="全部任务" aria-label="按任务筛选运行记录">
          <el-option v-for="task in tasks" :key="task.id" :label="task.name" :value="task.id" />
        </el-select>
        <div class="run-status-filters" role="tablist" aria-label="运行状态">
          <button v-for="filter in runFilters" :key="filter.value" type="button" :class="{ active: runStatusFilter === filter.value }" role="tab" :aria-selected="runStatusFilter === filter.value" @click="runStatusFilter = filter.value">{{ filter.label }}<span>{{ runFilterCount(filter.value) }}</span></button>
        </div>
      </section>
      <div class="automation-run-list">
      <section v-if="loading" v-loading="loading" class="automation-loading" aria-label="正在加载运行记录" />
      <section v-else-if="!filteredRuns.length" class="automation-empty" aria-live="polite"><AppIcon name="Document" /><h2>暂无符合条件的运行记录</h2><p>{{ tasks.length ? '调整任务或状态筛选后再试。' : '创建并运行自动化任务后，记录会显示在这里。' }}</p></section>
      <section v-else class="run-history-list" aria-label="运行记录列表">
        <article v-for="entry in filteredRuns" :key="entry.run.id" class="run-history-row" :class="`is-${entry.run.status}`">
          <header><div><span class="run-history-status" :class="`is-${entry.run.status}`">{{ runStatusLabel(entry.run.status) }}</span><strong>{{ entry.task.name }}</strong></div><time>{{ formatAutomationTime(runTime(entry.run)) }}</time></header>
          <p :class="{ error: entry.run.status === 'failed' }">{{ entry.run.error || entry.run.resultSummary || '任务正在运行。' }}</p>
          <details v-if="entry.run.status === 'failed' && entry.run.error"><summary>查看错误详情</summary><pre>{{ entry.run.error }}</pre></details>
          <footer><span>来源：{{ sourceLabel(entry.run.source) }} · 权限：{{ permissionLabel(entry.run.snapshot.permissionMode) }}</span><div><el-button v-if="entry.run.status === 'failed'" link type="primary" :loading="retryingRunId === entry.run.id" @click="retryRun(entry.run)">重试</el-button><el-button v-if="entry.run.status === 'running'" link type="danger" @click="stopRun(entry.task)">停止</el-button><el-button v-if="entry.run.sessionId && entry.run.sessionAvailable !== false" link type="primary" @click="openSession(entry.run.sessionId)">打开聊天</el-button><span v-else-if="entry.run.sessionId" class="run-session-missing"><AppIcon name="Warning" />聊天已删除</span></div></footer>
        </article>
      </section>
      </div>
      </div>
    </template>

    <CreateWizard v-model="wizardVisible" :projects="projects" :sessions="sessions" :providers="providers" :permission-config="permissionConfig" :editing-task="editingTask" :start-with-templates="startWithTemplates" @saved="load" />
  </PageContainer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import PageContainer from '@/components/PageContainer/index.vue'
import { getPlatformApi } from '@/platform'
import { DEFAULT_PERMISSION_CONFIG, type AutomationRun, type AutomationTask, type HarnessProject, type HarnessSessionSummary, type ModelProviderSummary, type PermissionConfig } from '@/config/harness'
import TaskCard from './components/TaskCard.vue'
import CreateWizard from './components/CreateWizard.vue'
import { lastRunLabel, targetLabel, triggerLabel, taskState, formatAutomationTime, permissionLabel, runStatusLabel, sourceLabel } from './automationPresentation'

type StatusFilter = 'all' | 'active' | 'paused' | 'failed' | 'ended'
const router = useRouter(); const api = getPlatformApi(); const tasks = ref<AutomationTask[]>([]); const projects = ref<HarnessProject[]>([]); const sessions = ref<HarnessSessionSummary[]>([]); const providers = ref<ModelProviderSummary[]>([]); const taskRuns = ref<Record<string, AutomationRun[]>>({}); const launchingTaskIds = ref<string[]>([]); const loading = ref(false); const error = ref(''); const activeSection = ref<'tasks' | 'runs'>('tasks'); const query = ref(''); const statusFilter = ref<StatusFilter>('all'); const viewMode = ref<'card' | 'table'>('card'); const runTaskId = ref<string>(); const runStatusFilter = ref<'all' | AutomationRun['status']>('all'); const retryingRunId = ref(''); const wizardVisible = ref(false); const editingTask = ref<AutomationTask>(); const startWithTemplates = ref(false); const permissionConfig = reactive<PermissionConfig>({ ...DEFAULT_PERMISSION_CONFIG }); const overview = reactive({ enabledCount: 0, runningCount: 0, failedLastDayCount: 0 })
let runStateTimer: ReturnType<typeof setInterval> | undefined; let refreshingRunState = false
const filters: Array<{ value: StatusFilter, label: string }> = [{ value: 'all', label: '全部' }, { value: 'active', label: '启用' }, { value: 'paused', label: '暂停' }, { value: 'failed', label: '最近失败' }, { value: 'ended', label: '已结束' }]
const runFilters: Array<{ value: 'all' | AutomationRun['status'], label: string }> = [{ value: 'all', label: '全部' }, { value: 'running', label: '运行中' }, { value: 'completed', label: '成功' }, { value: 'failed', label: '失败' }, { value: 'skipped', label: '跳过' }, { value: 'interrupted', label: '中断' }]
const projectMap = computed(() => new Map(projects.value.map(project => [project.id, project.name])))
const filteredTasks = computed(() => tasks.value.filter(task => { const run = lastRun(task.id); const state = taskState(task, run).key; const matchesFilter = statusFilter.value === 'all' || (statusFilter.value === 'active' ? state === 'stable' || state === 'running' : statusFilter.value === state); const normalizedQuery = query.value.trim().toLocaleLowerCase(); const matchesQuery = !normalizedQuery || `${task.name} ${task.prompt}`.toLocaleLowerCase().includes(normalizedQuery); return matchesFilter && matchesQuery }))
const filteredRuns = computed(() => tasks.value.flatMap(task => (taskRuns.value[task.id] || []).map(run => ({ task, run }))).filter(entry => (!runTaskId.value || entry.task.id === runTaskId.value) && (runStatusFilter.value === 'all' || entry.run.status === runStatusFilter.value)).sort((left, right) => runTime(right.run) - runTime(left.run)))
const runningTaskName = computed(() => tasks.value.find(task => isTaskRunning(task.id))?.name); const failedTaskName = computed(() => tasks.value.find(task => lastRun(task.id)?.status === 'failed')?.name)
function projectName(id: string) { return projectMap.value.get(id) || '未命名项目' }
function lastRun(id: string) { return taskRuns.value[id]?.[0] }
function isTaskRunning(id: string) { return launchingTaskIds.value.includes(id) || taskRuns.value[id]?.some(run => run.status === 'running') || false }
function taskNextRun(task: AutomationTask) { return task.nextRunAt }
function rowNextLabel(task: AutomationTask) { return taskNextRun(task) ? formatAutomationTime(taskNextRun(task)) : task.endedAt ? '已结束' : task.trigger.type === 'session-completed' ? '事件触发' : '未计划' }
function filterCount(filter: StatusFilter) { return filter === 'all' ? tasks.value.length : tasks.value.filter(task => { const key = taskState(task, lastRun(task.id)).key; return filter === 'active' ? key === 'stable' || key === 'running' : key === filter }).length }
function runTime(run: AutomationRun) { return run.startedAt || run.completedAt || run.scheduledAt || 0 }
function runFilterCount(filter: 'all' | AutomationRun['status']) { return tasks.value.flatMap(task => taskRuns.value[task.id] || []).filter(run => (!runTaskId.value || run.taskId === runTaskId.value) && (filter === 'all' || run.status === filter)).length }
async function load() { if (!api) { error.value = '自动化仅支持 Mira 桌面端'; return }; loading.value = true; error.value = ''; try { const [nextTasks, nextOverview, nextProjects, nextSessions, nextProviders, nextPermission] = await Promise.all([api.listAutomationTasks(), api.getAutomationOverview(), api.listHarnessProjects(), api.listHarnessSessions(), api.listModelProviders(), api.getHarnessPermissionConfig()]); tasks.value = nextTasks; Object.assign(overview, nextOverview); projects.value = nextProjects; sessions.value = nextSessions; providers.value = nextProviders.filter(provider => provider.enabled && provider.hasApiKey); Object.assign(permissionConfig, nextPermission); taskRuns.value = Object.fromEntries(await Promise.all(nextTasks.map(async task => [task.id, await api.listAutomationRuns(task.id)] as const))) } catch (cause) { error.value = cause instanceof Error ? cause.message : '读取自动化任务失败' } finally { loading.value = false } }
async function refreshRunState() { if (!api || refreshingRunState || !tasks.value.length) return; refreshingRunState = true; try { const currentTasks = [...tasks.value]; const [nextOverview, nextRuns] = await Promise.all([api.getAutomationOverview(), Promise.all(currentTasks.map(async task => [task.id, await api.listAutomationRuns(task.id)] as const))]); Object.assign(overview, nextOverview); taskRuns.value = Object.fromEntries(nextRuns) } catch { /* Keep the last known state until the next refresh. */ } finally { refreshingRunState = false } }
function openBlankWizard() { editingTask.value = undefined; startWithTemplates.value = false; wizardVisible.value = true }
function openTemplateWizard() { editingTask.value = undefined; startWithTemplates.value = true; wizardVisible.value = true }
function openEdit(task: AutomationTask) { editingTask.value = task; startWithTemplates.value = false; wizardVisible.value = true }
async function setEnabled(task: AutomationTask, enabled: boolean) { if (!api) return; try { await api.setAutomationTaskEnabled(task.id, enabled); await load() } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : '更新任务状态失败') } }
async function runNow(task: AutomationTask) { if (!api || isTaskRunning(task.id)) return; launchingTaskIds.value = [...launchingTaskIds.value, task.id]; try { const run = await api.runAutomationNow(task.id); taskRuns.value = { ...taskRuns.value, [task.id]: [run, ...(taskRuns.value[task.id] || []).filter(item => item.id !== run.id)] }; if (run.status === 'running') ElMessage.success('任务已开始运行'); else ElMessage.warning(run.error || '本次任务未运行'); await refreshRunState() } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : '启动任务失败') } finally { launchingTaskIds.value = launchingTaskIds.value.filter(id => id !== task.id) } }
function openRuns(task: AutomationTask) { runTaskId.value = task.id; activeSection.value = 'runs' }
async function retryRun(run: AutomationRun) { if (!api) return; retryingRunId.value = run.id; try { await api.retryAutomationRun(run.id); ElMessage.success('已创建重试任务'); await load() } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : '重试失败') } finally { retryingRunId.value = '' } }
async function stopRun(task: AutomationTask) { if (!api) return; try { await api.abortAutomationRun(task.id); await load() } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : '停止任务失败') } }
async function handleAction(command: string, task: AutomationTask) { if (command === 'edit') return openEdit(task); if (command === 'stop') return stopTask(task); if (command === 'delete') return deleteTask(task) }
async function stopTask(task: AutomationTask) { if (!api) return; try { await api.abortAutomationRun(task.id); await load() } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : '停止任务失败') } }
async function deleteTask(task: AutomationTask) { if (!api) return; try { await ElMessageBox.confirm(`删除“${task.name}”及其运行记录？`, '删除自动化', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }); await api.deleteAutomationTask(task.id); ElMessage.success('已删除自动化任务'); await load() } catch (cause) { if (cause !== 'cancel' && cause !== 'close') ElMessage.error(cause instanceof Error ? cause.message : '删除任务失败') } }
function openSession(sessionId: string) { void router.push({ name: 'HarnessSession', params: { id: sessionId } }) }
onMounted(() => { void load(); runStateTimer = setInterval(() => { void refreshRunState() }, 2000) })
onBeforeUnmount(() => { if (runStateTimer) clearInterval(runStateTimer) })
</script>

<style scoped lang="scss">
.automation-page :deep(.page-content) {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.automation-task-content,
.automation-run-content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.automation-task-list,
.automation-run-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.page-actions { display: flex; gap: 8px; }.automation-page-heading { display: grid; gap: 7px; }.automation-page-heading p { margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; }.automation-section-switch { display: inline-flex; width: fit-content; padding: 4px; border-radius: 12px; background: var(--cp-bg-hover); }.automation-section-switch button { min-width: 86px; height: 28px; padding: 0 16px; border: 0; border-radius: 9px; color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }.automation-section-switch button:hover { color: var(--cp-text); }.automation-section-switch button.active { color: var(--cp-text); background: var(--cp-bg); box-shadow: 0 1px 3px rgb(0 0 0 / 10%); }.automation-section-switch button:focus-visible, .run-status-filters button:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }.automation-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }.automation-stats article { min-height: 91px; padding: 15px 16px; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; background: var(--cp-bg); }.automation-stats span, .automation-stats small { display: block; color: var(--cp-text-secondary); font-size: 12px; }.automation-stats strong { display: block; margin: 7px 0 4px; color: var(--cp-text); font-size: 22px; line-height: 1; }.automation-stats small { overflow: hidden; color: var(--cp-text-tertiary); text-overflow: ellipsis; white-space: nowrap; }.automation-stats .is-danger strong { color: var(--cp-danger); }.automation-error { margin: 0 0 14px; color: var(--cp-danger); font-size: 13px; }.automation-toolbar, .run-history-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }.automation-search { width: 240px; flex: 0 0 240px; }.status-filters, .run-status-filters { display: flex; flex-wrap: wrap; gap: 6px; }.status-filters button, .run-status-filters button { padding: 6px 11px; border: 1px solid var(--cp-border); border-radius: 999px; color: var(--cp-text-secondary); background: var(--cp-bg); font: inherit; font-size: 12px; cursor: pointer; }.status-filters button:hover, .run-status-filters button:hover { background: var(--cp-bg-hover); }.status-filters button.active, .run-status-filters button.active { border-color: color-mix(in srgb, var(--cp-primary) 36%, var(--cp-border)); color: var(--cp-primary); background: var(--cp-primary-lighter); font-weight: 600; }.status-filters span, .run-status-filters span { margin-left: 4px; color: var(--cp-text-tertiary); font-size: 11px; }.run-history-toolbar :deep(.el-select) { width: 220px; }.view-toggle { display: flex; margin-left: auto; overflow: hidden; border: 1px solid var(--cp-border); border-radius: $radius-sm; }.view-toggle button { display: grid; width: 32px; height: 30px; padding: 0; place-items: center; border: 0; border-right: 1px solid var(--cp-border); color: var(--cp-text-secondary); background: var(--cp-bg); cursor: pointer; }.view-toggle button:last-child { border-right: 0; }.view-toggle button.active { color: var(--cp-primary); background: var(--cp-primary-lighter); }.automation-loading { min-height: 300px; }.task-grid { display: grid; grid-template-columns: repeat(3, minmax(260px, 1fr)); gap: 12px; }.table-shell { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; background: var(--cp-bg); }.table-status { color: var(--cp-text-secondary); font-size: 12px; }.table-status.is-completed { color: var(--cp-success); }.table-status.is-failed { color: var(--cp-danger); }.table-status.is-running { color: var(--cp-primary); }.table-actions { display: flex; align-items: center; gap: 4px; white-space: nowrap; }.table-action { width: 28px; height: 28px; min-height: 28px; padding: 0; margin: 0 !important; }.table-action.is-loading { color: var(--cp-primary); opacity: 1; }.table-action.is-loading .app-icon { animation: automation-table-action-spin 1s linear infinite; }.automation-empty { display: flex; min-height: 340px; align-items: center; justify-content: center; flex-direction: column; color: var(--cp-text-tertiary); text-align: center; }.automation-empty > .app-icon { margin-bottom: 14px; color: var(--cp-primary); font-size: 40px; }.automation-empty h2 { margin: 0; color: var(--cp-text); font-size: 18px; }.automation-empty p { margin: 8px 0 18px; color: var(--cp-text-secondary); font-size: 13px; }.automation-empty__actions { display: flex; gap: 8px; }.run-history-list { display: grid; max-width: 900px; gap: 10px; }.run-history-row { padding: 14px 16px; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; background: var(--cp-bg); box-shadow: $shadow-sm; }.run-history-row.is-failed { border-color: color-mix(in srgb, var(--cp-danger) 34%, var(--cp-border)); }.run-history-row header, .run-history-row footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.run-history-row header > div, .run-history-row footer > div { display: flex; align-items: center; gap: 8px; }.run-history-row strong { color: var(--cp-text); font-size: 14px; }.run-history-status { display: inline-flex; padding: 3px 7px; border-radius: 999px; color: var(--cp-text-secondary); background: var(--cp-bg-hover); font-size: 11px; font-weight: 600; }.run-history-status.is-completed { color: var(--cp-success); background: color-mix(in srgb, var(--cp-success) 10%, var(--cp-bg)); }.run-history-status.is-failed { color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 10%, var(--cp-bg)); }.run-history-status.is-running { color: var(--cp-primary); background: var(--cp-primary-lighter); }.run-history-status.is-skipped, .run-history-status.is-interrupted { color: var(--cp-warning); background: color-mix(in srgb, var(--cp-warning) 10%, var(--cp-bg)); }.run-history-row time, .run-history-row footer > span { color: var(--cp-text-tertiary); font-size: 12px; }.run-history-row p { display: -webkit-box; margin: 10px 0; overflow: hidden; color: var(--cp-text-secondary); font-size: 13px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; white-space: pre-wrap; }.run-history-row p.error { color: var(--cp-danger); }.run-history-row details { margin: 8px 0; color: var(--cp-text-secondary); font-size: 12px; }.run-history-row summary { cursor: pointer; }.run-history-row pre { margin: 7px 0 0; padding: 8px; overflow: auto; border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-hover); font: 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; }.run-history-row footer { padding-top: 10px; border-top: 1px solid var(--cp-border-light); }.run-history-row .run-session-missing { display: inline-flex; align-items: center; gap: 4px; color: var(--cp-text-tertiary); white-space: nowrap; }@keyframes automation-table-action-spin { to { transform: rotate(360deg); } }@media (max-width: 1100px) { .task-grid { grid-template-columns: repeat(2, minmax(260px, 1fr)); } }@media (max-width: 820px) { .automation-toolbar, .run-history-toolbar { flex-wrap: wrap; }.automation-search, .run-history-toolbar :deep(.el-select) { width: 100%; flex-basis: 100%; }.task-grid { grid-template-columns: 1fr; }.automation-stats { grid-template-columns: 1fr; } }
</style>
