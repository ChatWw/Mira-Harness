<template>
  <footer class="app-footer">
    <div class="footer-content">
      <span>© 2026 中台基座. All rights reserved.</span>
    </div>
  </footer>
</template>

<script setup lang="ts">
</script>

<style scoped lang="scss">
.app-footer {
  padding: $spacing-md $spacing-lg;
  background: var(--cp-bg);
  border-top: 1px solid var(--cp-border);
  @include flex-center;

  .footer-content {
    color: var(--cp-text-secondary);
    font-size: $font-sm;
  }

  @include media-max($breakpoint-md) {
    padding: $spacing-sm $spacing-md;
  }
}
</style>
