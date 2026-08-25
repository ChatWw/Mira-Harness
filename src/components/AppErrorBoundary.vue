<template>
  <slot v-if="!error" />
  <main v-else class="app-error-boundary" role="alert">
    <AppIcon name="WarningFilled" />
    <h1>页面暂时无法显示</h1>
    <p>{{ error }}</p>
    <el-button type="primary" @click="retry">重新加载页面</el-button>
  </main>
</template>

<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

const error = ref('')
onErrorCaptured(cause => {
  error.value = cause instanceof Error ? cause.message : '发生未知错误'
  return false
})
function retry() { window.location.reload() }
</script>

<style scoped lang="scss">
.app-error-boundary { display: grid; min-height: 100%; place-content: center; justify-items: center; gap: 12px; padding: 32px; color: var(--cp-text-secondary); text-align: center; }.app-error-boundary :deep(.app-icon) { color: var(--cp-warning); font-size: 28px; }.app-error-boundary h1 { margin: 0; color: var(--cp-text); font-size: 18px; }.app-error-boundary p { max-width: 520px; margin: 0; font-size: 13px; }
</style>
