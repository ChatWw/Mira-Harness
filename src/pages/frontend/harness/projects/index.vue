<template>
  <PageContainer title="项目" description="管理 Mira 可以访问的本地工作目录。">
    <template #extra>
      <el-button type="primary" @click="create"><AppIcon name="Plus" />新建项目</el-button>
    </template>
    <div v-loading="loading" class="project-grid">
      <article v-for="project in projects" :key="project.id" class="project-card">
        <div class="project-card__title">
          <AppIcon name="FolderOpened" />
          <strong>{{ project.name }}</strong>
          <el-dropdown @command="(command: string) => handleCommand(command, project)">
            <el-button text aria-label="项目操作"><AppIcon name="MoreFilled" /></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="open">打开</el-dropdown-item>
                <el-dropdown-item command="rename">重命名</el-dropdown-item>
                <el-dropdown-item command="trash">回收站</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <p>{{ project.directory }}</p>
        <dl>
          <div><dt>会话</dt><dd>{{ project.sessionCount }}</dd></div>
          <div><dt>最近活跃</dt><dd>{{ formatTime(project.lastSessionAt || project.updatedAt) }}</dd></div>
        </dl>
      </article>
      <button class="project-card project-card--new" type="button" @click="create">
        <AppIcon name="Plus" /><span>选择本地目录创建项目</span>
      </button>
    </div>
    <el-empty v-if="!loading && !projects.length" description="选择一个本地目录，开始第一个 Agent 项目" />

    <el-dialog v-model="trashVisible" :title="`回收站 · ${trashProject?.name || ''}`" width="min(520px, calc(100vw - 32px))">
      <div v-loading="trashLoading" class="trash-list">
        <el-empty v-if="!trashLoading && !trashTokens.length" description="回收站为空" />
        <div v-for="token in trashTokens" :key="token" class="trash-item">
          <div class="trash-item__meta"><AppIcon name="Delete" /><span>{{ formatToken(token) }}</span></div>
          <el-button size="small" @click="restore(token)">还原</el-button>
        </div>
      </div>
    </el-dialog>
  </PageContainer>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import type { HarnessProject } from '@/config/harness'
import PageContainer from '@/components/PageContainer/index.vue'
import { useRouter } from 'vue-router'
import { useHarnessStore } from '@/stores/harness'

const router = useRouter()
const store = useHarnessStore()
const projects = ref<HarnessProject[]>([])
const loading = ref(false)
const trashVisible = ref(false)
const trashProject = ref<HarnessProject>()
const trashTokens = ref<string[]>([])
const trashLoading = ref(false)

async function load() {
  loading.value = true
  try {
    projects.value = await getPlatformApi()?.listHarnessProjects() || []
  } finally {
    loading.value = false
  }
}

async function create() {
  const project = await getPlatformApi()?.createHarnessProject()
  if (project) {
    ElMessage.success('项目已创建')
    await load()
  }
}

function formatTime(value: number) {
  return new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' }).format(Math.round((value - Date.now()) / 86400000), 'day')
}

function formatToken(token: string) {
  const ts = Number(token.split('-')[0])
  return ts ? new Date(ts).toLocaleString('zh-CN') : token
}

async function loadTrash(projectId: string) {
  trashLoading.value = true
  try {
    trashTokens.value = await getPlatformApi()?.listHarnessTrash(projectId) || []
  } finally {
    trashLoading.value = false
  }
}

async function restore(token: string) {
  const project = trashProject.value
  if (!project) return
  await getPlatformApi()?.restoreHarnessTrash(project.id, token)
  ElMessage.success('已还原到项目目录')
  await loadTrash(project.id)
}

async function handleCommand(command: string, project: HarnessProject) {
  if (command === 'open') {
    const draft = store.startDraft()
    await router.push({ path: '/workspace/chat', query: { draft } })
  }
  if (command === 'rename') {
    const { value } = await ElMessageBox.prompt('输入新的项目名称', '重命名项目', { inputValue: project.name })
    await getPlatformApi()?.renameHarnessProject(project.id, value)
    await load()
  }
  if (command === 'trash') {
    trashProject.value = project
    trashVisible.value = true
    await loadTrash(project.id)
  }
  if (command === 'delete') {
    await ElMessageBox.confirm('仅移除项目注册；源文件会保留。', '删除项目', { confirmButtonText: '移除注册', cancelButtonText: '取消', type: 'warning' })
    await getPlatformApi()?.deleteHarnessProject(project.id, false)
    await load()
  }
}

onMounted(load)
</script>

<style scoped lang="scss">
.project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: $spacing-md; }
.project-card { min-height: 155px; padding: $spacing-lg; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-elevated); text-align: left; }
.project-card__title { display: flex; align-items: center; gap: 8px; }
.project-card__title strong { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-card p { min-height: 36px; margin: 14px 0; color: var(--cp-text-tertiary); font-size: $font-xs; line-height: 1.5; overflow-wrap: anywhere; }
.project-card dl { display: flex; gap: 28px; margin: 0; }
.project-card dt { color: var(--cp-text-tertiary); font-size: 11px; }
.project-card dd { margin: 4px 0 0; font-size: $font-sm; }
.project-card--new { display: flex; align-items: center; justify-content: center; gap: 9px; border-style: dashed; color: var(--cp-text-secondary); cursor: pointer; }
.project-card--new:hover { color: var(--cp-primary); border-color: var(--cp-primary); }
.trash-list { min-height: 120px; }
.trash-item { display: flex; align-items: center; justify-content: space-between; gap: $spacing-md; padding: $spacing-sm 0; border-bottom: 1px solid var(--cp-border-light); }
.trash-item__meta { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--cp-text-secondary); font-size: $font-sm; }
.trash-item__meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
