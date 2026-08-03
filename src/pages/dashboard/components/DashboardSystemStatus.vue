<template>
  <footer class="system-status">
    <span class="status-dot" aria-hidden="true"></span>
    <span>全部系统运行正常</span>
    <span class="status-separator">·</span>
    <span>{{ appCount }} 个应用在线</span>
  </footer>
</template>

<script setup lang="ts">
defineProps<{ appCount: number }>()
</script>

<style scoped lang="scss">
.system-status { display: flex; align-items: center; gap: 7px; padding: $spacing-lg 0 $spacing-xl; color: var(--cp-text-tertiary); font-size: $font-sm; }
.status-dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 0 3px color-mix(in srgb, #10b981 14%, transparent); }
.status-separator { color: var(--cp-border); }
</style>
