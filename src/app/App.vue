<template>
  <el-config-provider :size="layoutStore.config.componentSize">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import { useLayoutStore } from '@/stores/layout'

const themeStore = useThemeStore()
const layoutStore = useLayoutStore()
// 主题已在 store 初始化时应用
</script>
