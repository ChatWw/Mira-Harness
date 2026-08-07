<template>
  <el-sub-menu v-if="visibleChildren.length" :index="item.id">
    <template #title>
      <AppIcon v-if="item.icon" :name="item.icon" />
      <span>{{ item.title }}</span>
    </template>
    <SidebarMenuItem v-for="child in visibleChildren" :key="child.id" :item="child" />
  </el-sub-menu>

  <el-menu-item v-else-if="item.path && item.target" :index="item.path">
    <AppIcon v-if="item.icon" :name="item.icon" />
    <span>{{ item.title }}</span>
  </el-menu-item>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isMenuVisible } from '@/config/navigation'
import type { MenuItem } from '@/types'

defineOptions({ name: 'SidebarMenuItem' })

const props = defineProps<{ item: MenuItem }>()
const visibleChildren = computed(() => (props.item.children || []).filter(isMenuVisible))
</script>
