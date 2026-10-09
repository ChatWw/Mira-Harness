<template>
  <SettingsPageShell title="文件搜索" :show-title="true">
    <section class="search-ignore" aria-labelledby="search-workspace-heading" :aria-busy="listing || busy">
      <div class="search-ignore__heading">
        <h2 id="search-workspace-heading">工作区</h2>
        <el-tooltip content="重新加载工作区" placement="top">
          <el-button class="search-ignore__icon" :disabled="busy || listing" aria-label="重新加载工作区" @click="reloadWorkspaces"><AppIcon name="lucide:refresh-cw" /></el-button>
        </el-tooltip>
      </div>
      <p v-if="listError" class="search-ignore__error" role="alert">{{ listError }}</p>
      <el-select class="search-ignore__selector" :model-value="selectedKey" :disabled="busy || listing || !workspaces.length" filterable aria-label="选择工作区" placeholder="选择工作区" @change="selectWorkspace">
        <el-option v-for="workspace in workspaces" :key="workspace.key" :value="workspace.key" :label="workspace.label" />
      </el-select>
      <p v-if="currentWorkspace" class="search-ignore__path" :title="currentWorkspace.directory">{{ currentWorkspace.directory }}</p>
      <p v-else-if="!listing && !listError" class="search-ignore__empty">暂无可用工作区</p>
    </section>

    <section v-if="selectedKey" class="search-ignore" aria-labelledby="search-rules-heading">
      <div class="search-ignore__heading">
        <h2 id="search-rules-heading">.miraignore</h2>
        <span class="search-ignore__status" role="status">{{ busy ? '处理中…' : dirty ? '未保存' : status || (loaded?.source === 'template' ? '尚未创建' : '') }}</span>
      </div>
      <div class="search-ignore__toolbar">
        <el-button :disabled="busy || !loaded" @click="transform('sync-gitignore')"><AppIcon name="lucide:git-pull-request-arrow" />从 .gitignore 同步</el-button>
        <el-button :disabled="busy || !loaded" @click="transform('reset-defaults')"><AppIcon name="lucide:rotate-ccw" />恢复默认规则</el-button>
        <el-tooltip content="重新读取规则" placement="top"><el-button class="search-ignore__icon" :disabled="busy" aria-label="重新读取规则" @click="reloadRules"><AppIcon name="lucide:refresh-cw" /></el-button></el-tooltip>
      </div>
      <el-input v-model="draft" class="search-ignore__editor" type="textarea" :rows="16" resize="vertical" :disabled="busy || !loaded" aria-label="搜索忽略规则" spellcheck="false" />
      <p v-if="error" class="search-ignore__error" role="alert">{{ error }}</p>
      <p v-if="byteLength > 256 * 1024" class="search-ignore__error" role="alert">规则内容不能超过 256 KiB</p>
      <div class="search-ignore__actions">
        <el-button :disabled="busy || !dirty" @click="revert"><AppIcon name="lucide:undo-2" />撤销修改</el-button>
        <el-button type="primary" :disabled="!canSave" :loading="busy" @click="save"><AppIcon name="lucide:save" />保存</el-button>
      </div>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import type { HarnessWorkspaceSearchIgnoreTarget } from '@/config/harness'
import { getPlatformApi } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import { useSearchIgnoreEditor } from './useSearchIgnoreEditor'

type Workspace = { key: string; label: string; directory: string; target: HarnessWorkspaceSearchIgnoreTarget }
const api = getPlatformApi()
const { loaded, draft, busy, error, status, dirty, byteLength, canSave, load, transform, save, revert } = useSearchIgnoreEditor(api)
const workspaces = ref<Workspace[]>([])
const selectedKey = ref('')
const listing = ref(false)
const listError = ref('')
const currentWorkspace = computed(() => workspaces.value.find(workspace => workspace.key === selectedKey.value))

async function mayDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('忽略规则尚未保存。放弃本次修改？', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' })
    return true
  } catch { return false }
}

async function selectWorkspace(key: string) {
  if (key === selectedKey.value || !await mayDiscard()) return
  const workspace = workspaces.value.find(workspace => workspace.key === key)
  if (!workspace) return
  selectedKey.value = key
  await load(workspace.target)
}

async function reloadRules() {
  if (await mayDiscard()) await load(currentWorkspace.value?.target)
}

async function reloadWorkspaces() {
  if (listing.value || !await mayDiscard()) return
  listing.value = true
  listError.value = ''
  try {
    if (!api) throw new Error()
    const [projects, sessions] = await Promise.all([api.listHarnessProjects(), api.listHarnessSessions()])
    workspaces.value = [
      ...projects.filter(project => project.directory).map(project => ({ key: `project:${project.id}`, label: project.name, directory: project.directory, target: { kind: 'project' as const, id: project.id } })),
      ...sessions.filter(session => !session.projectId && session.workingDirectory).map(session => ({ key: `session:${session.id}`, label: session.title || '个人工作区', directory: session.workingDirectory!, target: { kind: 'session' as const, id: session.id } })),
    ]
    const workspace = currentWorkspace.value ?? workspaces.value[0]
    selectedKey.value = workspace?.key ?? ''
    await load(workspace?.target)
  } catch { listError.value = '无法加载工作区，请重试' }
  finally { listing.value = false }
}

onBeforeRouteLeave(mayDiscard)
onMounted(() => { void reloadWorkspaces() })
</script>

<style scoped lang="scss">
.search-ignore { min-width: 0; }
.search-ignore + .search-ignore { margin-top: 36px; }
.search-ignore__heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.search-ignore__heading h2 { margin: 0; font-size: 18px; font-weight: $font-semibold; letter-spacing: 0; }
.search-ignore__selector { width: min(420px, 100%); }
.search-ignore__path { margin: 10px 0 0; color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.6; overflow-wrap: anywhere; }
.search-ignore__empty, .search-ignore__status { color: var(--cp-text-secondary); font-size: $font-sm; }
.search-ignore__toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.search-ignore__toolbar :deep(.el-button + .el-button) { margin-left: 0; }
.search-ignore__toolbar :deep(.app-icon), .search-ignore__actions :deep(.app-icon) { margin-right: 6px; }
.search-ignore__icon { flex: 0 0 32px; width: 32px; height: 32px; padding: 0; }
.search-ignore__icon :deep(.app-icon) { margin: 0; }
.search-ignore__editor :deep(textarea) { min-height: 320px; font: 12px/20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; tab-size: 2; caret-color: var(--cp-text); }
.search-ignore__error { color: color-mix(in srgb, var(--cp-danger) 75%, var(--cp-text)); font-size: $font-sm; line-height: 1.6; overflow-wrap: anywhere; }
.search-ignore__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.search-ignore__actions :deep(.el-button + .el-button) { margin-left: 0; }
</style>
