<template>
  <el-breadcrumb separator="/" class="breadcrumb">
    <el-breadcrumb-item
      v-for="(item, index) in displayItems"
      :key="item.path || index"
      :to="item.path && index < displayItems.length - 1 ? item.path : undefined"
    >
      <component
        :is="item.icon"
        v-if="showIcon && item.icon && item.icon !== 'ellipsis'"
        class="breadcrumb-icon"
      />
      <span v-if="item.icon === 'ellipsis'">...</span>
      <span v-else>{{ item.title }}</span>
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useLayoutStore } from '@/stores/layout'

const route = useRoute()
const layoutStore = useLayoutStore()

const showIcon = computed(() => layoutStore.config.breadcrumbIcon)

interface BreadcrumbItem {
  title: string
  path?: string
  icon?: string
}

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const matched = route.matched.filter(r => r.meta && r.meta.title)
  return matched.map(r => ({
    title: r.meta.title as string,
    path: r.path,
    icon: r.meta.icon as string,
  }))
})

const displayItems = computed<BreadcrumbItem[]>(() => {
  const items = breadcrumbItems.value
  if (items.length <= 4) {
    return items
  }

  // 超过 4 级：首页 + ... + 倒数第二 + 最后一个
  return [
    items[0],
    { title: '...', icon: 'ellipsis' },
    items[items.length - 2],
    items[items.length - 1],
  ]
})
</script>

<style scoped lang="scss">
.breadcrumb {
  :deep(.el-breadcrumb__item) {
    display: inline-flex;
    align-items: center;

    .el-breadcrumb__inner {
      display: inline-flex;
      align-items: center;
      color: var(--cp-text-secondary);
      font-size: $font-sm;
      transition: color $transition-fast;

      &:hover {
        color: var(--cp-primary);
      }
    }

    &:last-child .el-breadcrumb__inner {
      color: var(--cp-text);
      font-weight: 500;
      cursor: default;

      &:hover {
        color: var(--cp-text);
      }
    }
  }

  :deep(.el-breadcrumb__separator) {
    color: var(--cp-text-tertiary);
    margin: 0 $spacing-xs;
  }
}

.breadcrumb-icon {
  width: 14px;
  height: 14px;
  margin-right: 4px;
}
</style>
