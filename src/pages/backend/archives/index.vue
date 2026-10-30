<template>
  <SettingsPageShell title="会话归档">
    <section class="archive-management" aria-label="会话归档">
      <div class="archive-heading"><h2>已归档的会话</h2><el-button class="archive-danger" :disabled="disabled || !visibleRows.length" @click="run(visibleRows, 'delete')"><AppIcon name="lucide:trash-2" />全部删除</el-button></div>
      <div class="archive-filters">
        <el-input v-model="query" clearable placeholder="搜索已归档的会话" aria-label="搜索已归档的会话"><template #prefix><AppIcon name="lucide:search" /></template></el-input>
        <div class="archive-sort"><label for="archive-sort">排序方式</label><el-select id="archive-sort" v-model="sort" aria-label="排序方式"><el-option value="updated" label="最近更新" /><el-option value="created" label="创建时间" /></el-select></div>
        <el-select v-model="project" aria-label="筛选项目"><el-option value="all" label="所有项目" /><el-option v-for="option in options" :key="option.key" :value="option.key" :label="option.name" /></el-select>
      </div>
      <div v-if="error" class="archive-error" role="alert"><span>{{ error }}</span><el-button :disabled="busy || loading" @click="refresh">重试</el-button></div>
      <p v-if="busy" role="status">正在处理…</p>
      <p v-if="result" role="status">{{ result }}</p>
      <p v-if="loading" class="archive-empty" role="status">正在读取归档会话…</p>
      <p v-else-if="!groups.length && !error" class="archive-empty">{{ rows.length ? '没有匹配的会话' : '没有已归档的会话' }}</p>
      <template v-else>
        <section v-for="group in groups" :key="group.key" class="archive-group">
          <div class="archive-group-heading">
            <button type="button" :aria-label="group.name" :aria-expanded="Boolean(expanded[group.key])" @click="expanded[group.key] = !expanded[group.key]"><AppIcon name="lucide:folder" /><span :title="group.name">{{ group.name }}</span><AppIcon name="lucide:chevron-right" :class="{ 'is-open': expanded[group.key] }" /></button>
            <span>{{ group.rows.length }} 个会话</span>
            <el-dropdown trigger="click" :disabled="disabled" @command="(command: 'restore' | 'delete') => run(group.rows, command)"><button type="button" class="archive-icon" :aria-label="`${group.name}的归档操作`" :disabled="disabled"><AppIcon name="lucide:ellipsis" /></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="restore">全部取消归档</el-dropdown-item><el-dropdown-item command="delete" class="archive-danger">全部删除</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
          </div>
          <div v-if="expanded[group.key]" class="archive-card">
            <div v-for="row in group.rows.slice(0, limits[group.key] || 50)" :key="row.id" class="archive-row">
              <div class="archive-row-title"><p :title="row.title">{{ row.title || '新会话' }}</p><time :datetime="new Date(sort === 'created' ? row.createdAt : row.updatedAt).toISOString()">{{ formatDate(sort === 'created' ? row.createdAt : row.updatedAt) }}</time></div>
              <button type="button" class="archive-icon" :aria-label="`删除会话 ${row.title}`" :disabled="disabled" @click="run([row], 'delete')"><AppIcon name="lucide:trash-2" /></button>
              <el-button :disabled="disabled" @click="run([row], 'restore')">取消归档</el-button>
            </div>
            <el-button v-if="group.rows.length > (limits[group.key] || 50)" text class="archive-more" @click="limits[group.key] = (limits[group.key] || 50) + 50">显示更多</el-button>
          </div>
        </section>
      </template>
    </section>
  </SettingsPageShell>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import { useArchiveManagement } from './useArchiveManagement'
const { rows, query, sort, project, options, groups, visibleRows, loading, busy, error, result, refresh, run } = useArchiveManagement()
const expanded = ref<Record<string, boolean>>({}), limits = ref<Record<string, number>>({})
const disabled = computed(() => busy.value || loading.value || Boolean(error.value))
const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const formatDate = (value: number) => dateFormat.format(value)
</script>
<style scoped lang="scss">
.archive-management { display: flex; min-width: 0; flex-direction: column; gap: 24px; font-size: var(--settings-text-base); }
.archive-heading, .archive-group-heading { display: flex; min-width: 0; align-items: center; gap: 12px; }
.archive-heading { justify-content: space-between; }
.archive-heading h2 { margin: 0; font-size: var(--settings-text-section); font-weight: 500; }
.archive-filters { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 208px); gap: 8px; }
.archive-filters :deep(.el-input__wrapper), .archive-filters :deep(.el-select__wrapper) { min-height: 36px; }
.archive-sort { display: flex; align-items: center; gap: 8px; }
.archive-sort label { flex: none; color: var(--cp-text-secondary); }
.archive-sort .el-select { width: 130px; }
.archive-group-heading > button { display: flex; min-width: 0; flex: 1; align-items: center; gap: 8px; padding: 8px 0; border: 0; background: transparent; color: var(--cp-text); font: inherit; font-weight: 500; text-align: left; cursor: pointer; }
.archive-group-heading > button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.archive-group-heading > span, .archive-row time { color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.archive-group-heading :deep(.app-icon) { flex: none; }
.archive-group-heading .is-open { transform: rotate(90deg); }
.archive-icon { display: grid; width: 28px; height: 28px; flex: none; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--cp-text-secondary); cursor: pointer; }
.archive-icon:hover { background: var(--cp-bg-hover); color: var(--cp-text); }
.archive-icon:disabled { opacity: .5; cursor: default; }
.archive-card { overflow: hidden; margin-top: 12px; padding: 0 16px; border: 1px solid var(--cp-border); border-radius: 12px; background: var(--cp-bg-elevated); }
.archive-row { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 12px 0; }
.archive-row + .archive-row { border-top: 1px solid var(--cp-border); }
.archive-row-title { min-width: 0; flex: 1; }
.archive-row p { overflow: hidden; margin: 0 0 4px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.archive-empty { padding: 48px 0; text-align: center; color: var(--cp-text-secondary); }
.archive-error { display: flex; align-items: center; gap: 12px; color: var(--cp-danger); }
.archive-management > p { margin: 0; color: var(--cp-text-secondary); }
.archive-danger { color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 10%, transparent); border-color: transparent; }
.archive-more { width: 100%; margin: 8px 0; }
.archive-management button:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
</style>
