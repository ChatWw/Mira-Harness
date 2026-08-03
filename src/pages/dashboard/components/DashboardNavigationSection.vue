<template>
  <section class="navigation-section">
    <div class="section-heading">
      <h2>{{ title }}</h2>
      <el-button v-if="expandable" link size="small" @click="emit('toggle')">{{ expanded ? '收起' : '展开' }}</el-button>
    </div>

    <div class="shortcut-list" :class="`shortcut-list--${layout}`">
      <button
        v-for="item in items"
        :key="item.id"
        class="shortcut-item"
        type="button"
        @click="emit('select', item)"
      >
        <el-icon><component :is="item.icon || 'Grid'" /></el-icon>
        <span>{{ item.title }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
export interface DashboardNavigationItem {
  id: string
  title: string
  icon?: string
  path: string
}

withDefaults(defineProps<{
  title: string
  items: DashboardNavigationItem[]
  layout?: 'compact' | 'grid'
  expandable?: boolean
  expanded?: boolean
}>(), {
  layout: 'compact',
  expandable: false,
  expanded: false,
})

const emit = defineEmits<{
  select: [item: DashboardNavigationItem]
  toggle: []
}>()
</script>

<style scoped lang="scss">
.navigation-section { padding: $spacing-lg 0; border-top: 1px solid var(--cp-border-light); }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: $spacing-md; }
h2 { margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; font-weight: 600; letter-spacing: 0; }

.shortcut-list { display: flex; gap: $spacing-sm; }
.shortcut-list--compact { flex-wrap: wrap; }
.shortcut-list--grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }

.shortcut-item {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 11px;
  color: var(--cp-text-secondary);
  cursor: pointer;
  background: var(--cp-bg-hover);
  border: 1px solid transparent;
  border-radius: var(--cp-radius-sm);
  transition: color $transition-fast, background $transition-fast, border-color $transition-fast;

  &:hover, &:focus-visible { color: var(--cp-primary); background: var(--cp-primary-lighter); border-color: var(--cp-primary-light); outline: 0; }
  :deep(.el-icon) { flex: 0 0 auto; color: var(--cp-primary); font-size: 17px; }
  span { overflow: hidden; font-size: $font-sm; text-overflow: ellipsis; white-space: nowrap; }
}

.shortcut-list--grid .shortcut-item { min-height: 68px; flex-direction: column; gap: 6px; background: transparent; border-color: var(--cp-border-light); }

@include media-max($breakpoint-md) {
  .shortcut-list--grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
