<template>
  <SettingsPageShell title="文件回收站">
    <section class="trash-settings" aria-labelledby="trash-heading">
      <div class="section-heading"><h2 id="trash-heading">回收站</h2></div>
      <p v-if="settingsError" class="settings-error" role="alert">{{ settingsError }} <el-button text @click="load">重试</el-button></p>
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy"><span class="settings-row__label">启用回收站功能</span><span class="settings-row__hint">关闭后，Mira自主删除的项目文件不再移入回收站。</span></div>
          <el-switch :model-value="config.trashEnabled" :disabled="!loaded || saving" :loading="saving" aria-label="启用回收站功能" @update:model-value="setTrashEnabled" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy"><span class="settings-row__label">保留天数</span><span class="settings-row__hint">到期文件会自动清理。</span></div>
          <el-input-number v-if="loaded" :model-value="config.trashRetentionDays" :min="1" :max="30" :disabled="saving || !config.trashEnabled" controls-position="right" aria-label="回收站保留天数" @update:model-value="setTrashRetentionDays" />
          <span v-else class="settings-row__hint" role="status">正在读取设置…</span>
        </div>
      </div>
    </section>
    <section class="trash-management" aria-label="已删除的文件">
      <div class="trash-heading"><h2>已删除的文件</h2><el-button :disabled="disabled" @click="refresh"><AppIcon name="lucide:refresh-cw" />刷新</el-button></div>
      <div class="trash-filters">
        <el-input v-model="query" clearable placeholder="搜索回收站文件" aria-label="搜索回收站文件"><template #prefix><AppIcon name="lucide:search" /></template></el-input>
        <div class="trash-sort"><label for="trash-sort">排序方式</label><el-select id="trash-sort" v-model="sort" aria-label="排序方式"><el-option value="newest" label="最近删除" /><el-option value="oldest" label="最早删除" /></el-select></div>
        <el-select v-model="project" aria-label="筛选项目"><el-option value="all" label="所有项目" /><el-option v-for="option in options" :key="option.key" :value="option.key" :label="option.name" /></el-select>
      </div>
      <div v-if="error" class="trash-error" role="alert"><span>{{ error }}</span><el-button :disabled="disabled" @click="refresh">重试</el-button></div>
      <p v-if="busy" role="status">正在还原…</p>
      <p v-if="result" role="status">{{ result }}</p>
      <p v-if="loading" class="trash-empty" role="status">正在读取回收站…</p>
      <p v-else-if="!groups.length && !error" class="trash-empty">{{ rows.length ? '没有匹配的文件' : '回收站为空' }}</p>
      <template v-else>
        <section v-for="group in groups" :key="group.key" class="trash-group">
          <div class="trash-group-heading">
            <button type="button" :aria-label="group.name" :aria-expanded="expanded[group.key] !== false" @click="expanded[group.key] = expanded[group.key] === false"><AppIcon name="lucide:folder" /><span :title="group.name">{{ group.name }}</span><AppIcon name="lucide:chevron-right" :class="{ 'is-open': expanded[group.key] !== false }" /></button>
            <span>{{ group.rows.length }} 项</span><el-button text :disabled="disabled || Boolean(error)" @click="restore(group.rows)">全部还原</el-button>
          </div>
          <div v-if="expanded[group.key] !== false" class="trash-card">
            <div v-for="row in group.rows.slice(0, limits[group.key] || 50)" :key="row.token" class="trash-row">
              <div class="trash-row-title"><p v-for="path in row.paths" :key="path" :title="path">{{ path }}</p><time :datetime="new Date(row.deletedAt).toISOString()">{{ formatDate(row.deletedAt) }}</time></div>
              <el-button :disabled="disabled || Boolean(error)" :aria-label="`还原 ${row.paths.join('、')}`" @click="restore([row])">还原</el-button>
            </div>
            <el-button v-if="group.rows.length > (limits[group.key] || 50)" text class="trash-more" @click="limits[group.key] = (limits[group.key] || 50) + 50">显示更多</el-button>
          </div>
        </section>
      </template>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { usePermissionSettings } from '../settings/usePermissionSettings'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import { useTrashManagement } from './useTrashManagement'
const { config, loaded, saving, error: settingsError, load, save } = usePermissionSettings()
const { rows, query, sort, project, options, groups, loading, busy, error, result, refresh, restore } = useTrashManagement()
const expanded = ref<Record<string, boolean>>({}), limits = ref<Record<string, number>>({})
const disabled = computed(() => busy.value || loading.value)
const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const formatDate = (value: number) => dateFormat.format(value)
function setTrashEnabled(value: boolean) { void save({ trashEnabled: value }) }
async function setTrashRetentionDays(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 30) return
  await save({ trashRetentionDays: value })
  if (!settingsError.value) await refresh()
}
onBeforeRouteLeave(() => !saving.value && !busy.value)
</script>

<style scoped lang="scss">
.trash-settings { margin-bottom: 32px; }
.section-heading { margin-bottom: 12px; }
.section-heading h2 { margin: 0; font-size: var(--settings-text-section); font-weight: 550; }
.settings-list { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.settings-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 60px; padding: 10px 16px; }
.settings-row + .settings-row { border-top: 1px solid var(--cp-border-light); }
.settings-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.settings-row__label { font-size: var(--settings-text-base); font-weight: 450; }
.settings-row__hint { color: var(--cp-text-secondary); font-size: var(--settings-text-small); line-height: 18px; }
.trash-management { display: flex; min-width: 0; flex-direction: column; gap: 24px; font-size: var(--settings-text-base); }
.trash-heading, .trash-group-heading { display: flex; min-width: 0; align-items: center; gap: 12px; }
.trash-heading { justify-content: space-between; }
.trash-heading h2 { margin: 0; font-size: var(--settings-text-section); font-weight: 500; }
.trash-filters { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 208px); gap: 8px; }
.trash-filters :deep(.el-input__wrapper), .trash-filters :deep(.el-select__wrapper) { min-height: 36px; }
.trash-sort { display: flex; align-items: center; gap: 8px; }
.trash-sort label { flex: none; color: var(--cp-text-secondary); }
.trash-sort .el-select { width: 130px; }
.trash-group-heading > button:first-child { display: flex; min-width: 0; flex: 1; align-items: center; gap: 8px; padding: 8px 0; border: 0; background: transparent; color: var(--cp-text); font: inherit; font-weight: 500; text-align: left; cursor: pointer; }
.trash-group-heading > button:first-child span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trash-group-heading > span, .trash-row time { color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.trash-group-heading :deep(.app-icon) { flex: none; }
.trash-group-heading .is-open { transform: rotate(90deg); }
.trash-card { overflow: hidden; margin-top: 12px; padding: 0 16px; border: 1px solid var(--cp-border); border-radius: 12px; background: var(--cp-bg-elevated); }
.trash-row { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 12px 0; }
.trash-row + .trash-row { border-top: 1px solid var(--cp-border); }
.trash-row-title { min-width: 0; flex: 1; }
.trash-row p { overflow: hidden; margin: 0 0 4px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.trash-empty { padding: 48px 0; text-align: center; color: var(--cp-text-secondary); }
.trash-error { display: flex; align-items: center; gap: 12px; color: var(--cp-danger); }
.trash-management > p { margin: 0; color: var(--cp-text-secondary); }
.trash-more { width: 100%; margin: 8px 0; }
.trash-management button:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
</style>
