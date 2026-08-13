<template>
  <aside class="project-sidebar">
    <div class="sidebar-heading"><span>我的作品</span><el-tooltip content="新建作品"><el-button circle text aria-label="新建作品" @click="$emit('create-project')"><AppIcon name="Plus" /></el-button></el-tooltip></div>
    <div class="project-list">
      <div v-for="item in projects" :key="item.id" class="project-item" :class="{ active: item.id === project.id }">
        <button type="button" class="project-item__open" @click="$emit('open-project', item.id)"><AppIcon name="lucide:book-marked" /><span><strong>{{ item.title }}</strong><small>{{ formatUpdatedAt(item.updatedAt) }}</small></span></button>
        <el-button circle text type="danger" aria-label="删除作品" @click="$emit('remove-project', item.id)"><AppIcon name="Delete" /></el-button>
      </div>
    </div>
    <div class="sidebar-heading chapters-heading"><span>创作结构</span></div>
    <nav class="chapter-list" aria-label="创作结构">
      <div v-for="item in stages" :key="item.key" class="chapter-item-row"><button type="button" class="chapter-item" :class="{ active: activeStage === item.key }" @click="$emit('stage-change', item.key)"><AppIcon :name="item.icon" /><span>{{ item.title }}</span></button><el-tooltip v-if="item.key === 'chapter'" content="新增章节"><el-button circle text aria-label="新增章节" @click="$emit('add-chapter')"><AppIcon name="Plus" /></el-button></el-tooltip></div>
      <button v-for="chapter in project.chapters" :key="chapter.id" type="button" class="chapter-item" :class="{ active: activeChapterId === chapter.id && activeStage === 'chapter' }" @click="$emit('select-chapter', chapter.id)"><AppIcon name="Document" /><span>{{ chapter.title }}</span></button>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import type { NovelProjectDocument, NovelProjectSummary } from '@/config/novel'
import type { Stage, StageDefinition } from '../types'

defineProps<{ project: NovelProjectDocument; projects: NovelProjectSummary[]; stages: StageDefinition[]; activeStage: Stage; activeChapterId: string }>()
defineEmits<{
  'create-project': []
  'open-project': [id: string]
  'remove-project': [id: string]
  'stage-change': [stage: Stage]
  'add-chapter': []
  'select-chapter': [id: string]
}>()

function formatUpdatedAt(time: number) {
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000))
  return minutes < 1 ? '刚刚保存' : minutes < 60 ? `${minutes} 分钟前` : new Date(time).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<style scoped lang="scss">
.project-sidebar { min-width: 0; padding: $spacing-md $spacing-sm; background: var(--cp-bg-elevated); border-right: 1px solid var(--cp-border); }
.sidebar-heading { display: flex; align-items: center; justify-content: space-between; gap: $spacing-sm; padding: 0 $spacing-sm $spacing-sm; color: var(--cp-text-secondary); font-size: $font-xs; }.sidebar-heading :deep(.el-button) { margin: -4px; }.chapters-heading { margin-top: $spacing-lg; }
.project-list, .chapter-list { display: flex; flex-direction: column; gap: 2px; }.project-item, .chapter-item { display: flex; width: 100%; align-items: center; gap: $spacing-sm; padding: 8px; color: var(--cp-text-secondary); text-align: left; cursor: pointer; background: transparent; border: 0; border-radius: $radius-sm; }.project-item:hover, .chapter-item:hover { background: var(--cp-bg-hover); }.project-item.active, .chapter-item.active { color: var(--cp-text); background: var(--cp-bg); box-shadow: $shadow-sm; }.project-item__open { display: flex; flex: 1; min-width: 0; align-items: center; gap: $spacing-sm; padding: 0; color: inherit; text-align: left; cursor: pointer; background: transparent; border: 0; font: inherit; }.project-item__open > span { min-width: 0; }.project-item :deep(.el-button) { flex: 0 0 auto; opacity: .45; }.project-item:hover :deep(.el-button), .project-item:focus-within :deep(.el-button) { opacity: 1; }.project-item strong, .project-item small, .chapter-item span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.project-item strong { font-size: $font-sm; font-weight: $font-medium; }.project-item small { margin-top: 2px; color: var(--cp-text-tertiary); font-size: 11px; }.chapter-item-row { display: flex; align-items: center; min-width: 0; }.chapter-item-row .chapter-item { flex: 1; min-width: 0; }.chapter-item-row :deep(.el-button) { flex: 0 0 auto; margin-right: 2px; opacity: .45; }.chapter-item-row:hover :deep(.el-button), .chapter-item-row:focus-within :deep(.el-button) { opacity: 1; }.chapter-item { font-size: $font-sm; }.chapter-item .app-icon { color: var(--cp-text-tertiary); }
@include media-max($breakpoint-md) { .project-sidebar { border-right: 0; border-bottom: 1px solid var(--cp-border); }.project-list { flex-direction: row; overflow: auto; }.project-item { flex: 0 0 190px; }.chapters-heading, .chapter-list { display: none; } }
</style>
