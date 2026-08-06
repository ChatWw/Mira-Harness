<template>
  <el-config-provider :size="layoutStore.config.componentSize">
    <router-view />
    <AppLoadingOverlay :active="globalLoading.active.value" :text="globalLoading.text.value" global />
  </el-config-provider>
</template>

<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import { useLayoutStore } from '@/stores/layout'
import AppLoadingOverlay from '@/components/AppLoadingOverlay.vue'
import { useLoading } from '@/hooks/useLoading'

const themeStore = useThemeStore()
const layoutStore = useLayoutStore()
const globalLoading = useLoading()
// 主题已在 store 初始化时应用
</script>
