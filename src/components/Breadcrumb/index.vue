<template>
  <el-breadcrumb
    separator="/"
    class="breadcrumb"
    :class="`breadcrumb--${breadcrumbStyle}`"
  >
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
import { findMenuPath, resolveNavigation } from '@/config/navigation'
import { useLayoutStore } from '@/stores/layout'

const route = useRoute()
const layoutStore = useLayoutStore()

const showIcon = computed(() => layoutStore.config.breadcrumbIcon)
const breadcrumbStyle = computed(() => layoutStore.config.breadcrumbStyle || 'normal')

interface BreadcrumbItem {
  title: string
  path?: string
  icon?: string
}

const DASHBOARD_BREADCRUMB: BreadcrumbItem = {
  title: '概览',
  path: '/dashboard',
  icon: 'Odometer',
}

const navigation = computed(() => resolveNavigation(route.path))

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const menuPath = findMenuPath(navigation.value.menus, route.path)
  if (menuPath) {
    const items = menuPath.map(menu => ({
      title: menu.title,
      path: menu.target ? menu.path : undefined,
      icon: menu.icon,
    }))
    return items[0]?.path === DASHBOARD_BREADCRUMB.path
      ? items
      : [DASHBOARD_BREADCRUMB, ...items]
  }

  if (navigation.value.area === 'microapp' && navigation.value.app) {
    return [
      DASHBOARD_BREADCRUMB,
      {
        title: navigation.value.title,
        path: route.path,
        icon: navigation.value.icon,
      },
    ]
  }

  const matched = route.matched.filter(r => r.meta && r.meta.title)
  const items = matched.map(r => ({
    title: r.meta.title as string,
    path: r.path,
    icon: r.meta.icon as string,
  }))
  return items[0]?.path === DASHBOARD_BREADCRUMB.path
    ? items
    : [DASHBOARD_BREADCRUMB, ...items]
})

const displayItems = computed<BreadcrumbItem[]>(() => {
  const items = breadcrumbItems.value
  if (items.length <= 4) {
    return items
  }

  // 超过 4 级：工作台 + ... + 倒数第二 + 最后一个
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
      font-weight: 400;
      transition: color $transition-fast;

      &:hover {
        color: var(--cp-primary);
      }
    }

    &:last-child .el-breadcrumb__inner {
      color: var(--cp-text);
      font-weight: 400;
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

.breadcrumb--card {
  :deep(.el-breadcrumb__separator) {
    display: none;
  }

  :deep(.el-breadcrumb__item) {
    margin-right: 2px;

    .el-breadcrumb__inner {
      height: 30px;
      padding: 0 24px 0 18px;
      background: var(--cp-bg-hover);
      clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%, 6px 50%);
      font-size: $font-sm;
      font-weight: 400;
    }

    &:first-child .el-breadcrumb__inner {
      padding-left: 16px;
      clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%);
    }

    &:last-child .el-breadcrumb__inner {
      padding-right: 18px;
      clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 6px 50%);
    }
  }
}
</style>
