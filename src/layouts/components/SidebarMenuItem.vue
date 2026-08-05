<template>
  <el-sub-menu v-if="visibleChildren.length" :index="item.id">
    <template #title>
      <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
      <span>{{ item.title }}</span>
    </template>
    <SidebarMenuItem v-for="child in visibleChildren" :key="child.id" :item="child" />
  </el-sub-menu>

  <el-menu-item v-else-if="item.path" :index="item.path">
    <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
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
