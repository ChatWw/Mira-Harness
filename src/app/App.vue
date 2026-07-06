<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { useRouter } from 'vue-router'

const themeStore = useThemeStore()
const router = useRouter()

onMounted(() => {
  // 主题已在 store 初始化时应用
})
</script>
