<template>
  <PageContainer title="微应用管理" description="管理可嵌入平台的应用入口、运行方式与应用内菜单。" max-width="1600">
    <el-alert
      v-if="!desktopAvailable"
      type="warning"
      :closable="false"
      show-icon
      title="当前为浏览器模式，微应用只读；请在 Electron 桌面版中进行修改。"
      class="platform-alert"
    />

    <section class="management-panel">
      <div class="panel-toolbar">
        <div><strong>微应用列表</strong><span>{{ sortedApps.length }} 个应用</span></div>
        <el-button type="primary" :disabled="saving || !desktopAvailable" @click="openCreate">
          <el-icon><Plus /></el-icon>
          新增微应用
        </el-button>
      </div>
      <el-table :data="sortedApps" row-key="id" empty-text="暂无微应用，可新增第一个应用">
        <el-table-column label="应用" min-width="210">
          <template #default="{ row }">
            <div class="app-cell">
              <span class="app-icon"><el-icon><component :is="row.icon || 'Grid'" /></el-icon></span>
              <div><strong>{{ row.name }}</strong><span>{{ row.description || '暂无说明' }}</span></div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="编码" min-width="130" show-overflow-tooltip />
        <el-table-column label="集成方式" width="110">
          <template #default="{ row }">{{ row.integrationMode === 'wujie' ? 'Wujie' : 'Iframe' }}</template>
        </el-table-column>
        <el-table-column label="发布状态" width="100">
          <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small" effect="plain">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="运行状态" width="100">
          <template #default="{ row }"><el-tag :type="healthType(row.healthStatus)" size="small" effect="plain">{{ healthLabel(row.healthStatus) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="子菜单" width="82" align="center">
          <template #default="{ row }">{{ row.menus?.length || 0 }}</template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="72" align="center" />
        <el-table-column label="操作" width="118" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="saving || !desktopAvailable" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" :disabled="saving || !desktopAvailable" @click="removeApp(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <MicroAppEditorDrawer
      v-model="drawerVisible"
      :app="editingApp"
      :apps="runtimeNavigation.microApps"
      :saving="saving"
      @submit="saveApp"
    />
  </PageContainer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageContainer from '@/components/PageContainer/index.vue'
import { runtimeNavigation } from '@/config/runtime'
import { validateMicroApps } from '@/config/platformValidation'
import { getPlatformApi } from '@/platform'
import type { MicroApp, MicroAppHealthStatus, MicroAppStatus } from '@/types'
import MicroAppEditorDrawer from './components/MicroAppEditorDrawer.vue'
import { applyManagementSnapshot, requirePlatformApi } from './management'

const desktopAvailable = Boolean(getPlatformApi())
const drawerVisible = ref(false)
const saving = ref(false)
const editingApp = ref<MicroApp>()
const sortedApps = computed(() => [...runtimeNavigation.microApps].sort((a, b) => a.sort - b.sort))

function statusLabel(status: MicroAppStatus) {
  return ({ developing: '开发中', published: '已发布', offline: '已下线' } as const)[status]
}

function statusType(status: MicroAppStatus) {
  return status === 'published' ? 'success' : status === 'offline' ? 'info' : 'warning'
}

function healthLabel(status: MicroAppHealthStatus) {
  return ({ healthy: '正常', degraded: '降级', unavailable: '不可用' } as const)[status]
}

function healthType(status: MicroAppHealthStatus) {
  return status === 'healthy' ? 'success' : status === 'degraded' ? 'warning' : 'danger'
}

function openCreate() {
  editingApp.value = undefined
  drawerVisible.value = true
}

function openEdit(app: MicroApp) {
  editingApp.value = app
  drawerVisible.value = true
}

async function persistApps(apps: MicroApp[], successMessage: string) {
  saving.value = true
  try {
    validateMicroApps(apps)
    applyManagementSnapshot(await requirePlatformApi().updateMicroApps(apps))
    drawerVisible.value = false
    ElMessage.success(successMessage)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '微应用配置保存失败')
  } finally {
    saving.value = false
  }
}

function saveApp(app: MicroApp) {
  const apps = editingApp.value
    ? runtimeNavigation.microApps.map(item => item.id === editingApp.value?.id ? app : item)
    : [...runtimeNavigation.microApps, app]
  void persistApps(apps, editingApp.value ? '微应用已更新' : '微应用已创建')
}

async function removeApp(app: MicroApp) {
  try {
    const menuNotice = app.menus?.length ? `，其 ${app.menus.length} 个菜单也会删除` : ''
    await ElMessageBox.confirm(`确定删除“${app.name}”${menuNotice}吗？`, '删除微应用', { type: 'warning' })
    await persistApps(runtimeNavigation.microApps.filter(item => item.id !== app.id), '微应用已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}
</script>

<style scoped lang="scss">
.platform-alert { margin-bottom: $spacing-md; }
.management-panel { border: 1px solid var(--cp-border); border-radius: $radius-lg; overflow: hidden; }
.panel-toolbar {
  @include flex-between;
  gap: $spacing-md;
  padding: $spacing-md;
  background: var(--cp-bg-elevated);

  > div { display: flex; align-items: baseline; gap: $spacing-sm; min-width: 0; }
  strong { color: var(--cp-text); font-size: $font-base; }
  span { color: var(--cp-text-secondary); font-size: $font-xs; }
}
.app-cell {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  min-width: 0;

  .app-icon { width: 32px; height: 32px; flex: 0 0 32px; border-radius: $radius-md; background: var(--cp-bg-hover); @include flex-center; }
  > div { display: flex; flex-direction: column; min-width: 0; }
  strong, span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { color: var(--cp-text); }
  span { color: var(--cp-text-secondary); font-size: $font-xs; }
}

@include media-max($breakpoint-sm) {
  .panel-toolbar { align-items: flex-start; flex-direction: column; }
}
</style>
