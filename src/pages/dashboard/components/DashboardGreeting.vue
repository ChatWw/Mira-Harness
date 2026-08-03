<template>
  <section class="dashboard-greeting">
    <p class="greeting-text">{{ greeting }} <span aria-hidden="true">👋</span></p>
    <h1>你想去哪儿？</h1>
    <button class="search-trigger" type="button" @click="emit('open-search')">
      <el-icon><Search /></el-icon>
      <span>搜索菜单、页面、应用...</span>
      <kbd>{{ shortcutModifier }}</kbd>
      <kbd>K</kbd>
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Search } from '@element-plus/icons-vue'

defineProps<{ greeting: string }>()

const emit = defineEmits<{ 'open-search': [] }>()
const shortcutModifier = computed(() => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘' : 'Ctrl')
</script>

<style scoped lang="scss">
.dashboard-greeting { padding: $spacing-xl 0 $spacing-lg; }
.greeting-text { margin: 0 0 $spacing-xs; color: var(--cp-text-secondary); font-size: $font-base; }
h1 { margin: 0; color: var(--cp-text); font-size: 28px; font-weight: 650; letter-spacing: 0; }

.search-trigger {
  display: flex;
  width: min(100%, 620px);
  height: 52px;
  align-items: center;
  gap: $spacing-sm;
  margin-top: $spacing-xl;
  padding: 0 $spacing-md;
  color: var(--cp-text-secondary);
  text-align: left;
  cursor: pointer;
  background: var(--cp-bg-elevated);
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-md);
  box-shadow: $shadow-sm;
  transition: border-color $transition-fast, box-shadow $transition-fast, color $transition-fast;

  &:hover, &:focus-visible {
    color: var(--cp-text);
    border-color: var(--cp-primary);
    box-shadow: 0 0 0 3px var(--cp-primary-lighter);
    outline: 0;
  }

  > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :deep(.el-icon) { color: var(--cp-primary); font-size: 19px; }
  kbd {
    min-width: 20px;
    padding: 2px 5px;
    color: var(--cp-text-tertiary);
    font: inherit;
    font-size: $font-xs;
    line-height: 16px;
    text-align: center;
    background: var(--cp-bg-hover);
    border: 1px solid var(--cp-border-light);
    border-radius: var(--cp-radius-sm);
  }
}

@include media-max($breakpoint-md) {
  .dashboard-greeting { padding-top: $spacing-lg; }
  h1 { font-size: 24px; }
  .search-trigger { margin-top: $spacing-lg; }
}
</style>
