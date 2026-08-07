<template>
  <PageContainer title="备份与偏好" description="导出完整配置快照，或在变更前恢复到已保存和默认状态。">
    <el-alert
      v-if="!desktopAvailable"
      type="warning"
      :closable="false"
      show-icon
      title="备份与恢复仅在 Electron 桌面版中可用。"
      class="platform-alert"
    />

    <section class="summary-list">
      <div class="summary-row">
        <div class="summary-icon"><AppIcon name="Coin" /></div>
        <div><strong>SQLite 本机存储</strong><span>菜单、微应用和界面偏好保存在应用用户数据目录中。</span></div>
      </div>
      <div class="summary-row">
        <div class="summary-icon"><AppIcon name="Setting" /></div>
        <div><strong>{{ preferenceCount }} 项界面偏好</strong><span>偏好随配置快照一起导出和恢复，本页不提供单项编辑。</span></div>
      </div>
    </section>

    <section class="action-section">
      <div><h3>配置快照</h3><p>导出当前全部配置，或导入此前保存的 JSON 快照。导入前会自动备份当前数据库。</p></div>
      <div class="action-buttons">
        <el-button :loading="action === 'export'" :disabled="busy || !desktopAvailable" @click="exportConfig">
          <AppIcon name="Download" />导出配置
        </el-button>
        <el-button :loading="action === 'import'" :disabled="busy || !desktopAvailable" @click="importInput?.click()">
          <AppIcon name="Upload" />导入配置
        </el-button>
        <input ref="importInput" class="file-input" type="file" accept="application/json,.json" @change="importConfig" />
      </div>
    </section>

    <section class="action-section danger-section">
      <div><h3>恢复默认配置</h3><p>覆盖当前菜单、微应用和界面偏好。执行前同样会自动创建数据库备份。</p></div>
      <el-button type="danger" plain :loading="action === 'restore'" :disabled="busy || !desktopAvailable" @click="restoreDefaults">
        恢复默认配置
      </el-button>
    </section>
  </PageContainer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageContainer from '@/components/PageContainer/index.vue'
import { platformPreferences } from '@/config/runtime'
import { getPlatformApi } from '@/platform'
import { applyManagementSnapshot, requirePlatformApi } from './management'

type Action = '' | 'export' | 'import' | 'restore'

const desktopAvailable = Boolean(getPlatformApi())
const importInput = ref<HTMLInputElement>()
const action = ref<Action>('')
const busy = computed(() => Boolean(action.value))
const preferenceCount = computed(() => Object.keys(platformPreferences).length)

async function exportConfig() {
  action.value = 'export'
  try {
    const text = await requirePlatformApi().exportSnapshot()
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: `mira-${Date.now()}.json` })
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('配置快照已导出')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败')
  } finally {
    action.value = ''
  }
}

async function importConfig(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  action.value = 'import'
  try {
    applyManagementSnapshot(await requirePlatformApi().importSnapshot(await file.text()))
    ElMessage.success('配置已导入，原数据库已自动备份')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入失败')
  } finally {
    action.value = ''
    input.value = ''
  }
}

async function restoreDefaults() {
  try {
    await ElMessageBox.confirm('这会覆盖当前菜单、微应用和界面偏好，是否继续？', '恢复默认配置', { type: 'warning' })
  } catch {
    return
  }
  action.value = 'restore'
  try {
    applyManagementSnapshot(await requirePlatformApi().restoreDefaults())
    ElMessage.success('已恢复默认配置')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '恢复失败')
  } finally {
    action.value = ''
  }
}
</script>

<style scoped lang="scss">
.platform-alert { margin-bottom: $spacing-md; }
.summary-list { border: 1px solid var(--cp-border); border-radius: $radius-lg; overflow: hidden; }
.summary-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-md;

  & + & { border-top: 1px solid var(--cp-border); }
  > div:last-child { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
  strong { color: var(--cp-text); font-size: $font-sm; }
  span { color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.6; }
}
.summary-icon { width: 36px; height: 36px; flex: 0 0 36px; border-radius: $radius-md; background: var(--cp-bg-hover); @include flex-center; }
.action-section {
  @include flex-between;
  gap: $spacing-xl;
  padding: $spacing-lg 0;
  border-bottom: 1px solid var(--cp-border);

  h3 { margin: 0 0 $spacing-xs; color: var(--cp-text); font-size: $font-base; }
  p { margin: 0; max-width: 70ch; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.7; }
}
.danger-section { border-bottom: 0; }
.action-buttons { display: flex; gap: $spacing-sm; flex-shrink: 0; }
.file-input { display: none; }

@include media-max($breakpoint-md) {
  .action-section { align-items: flex-start; flex-direction: column; gap: $spacing-md; }
  .action-buttons { flex-wrap: wrap; }
}
</style>
