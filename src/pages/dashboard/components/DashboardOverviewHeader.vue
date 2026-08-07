<template>
  <header class="overview-header">
    <div>
      <time class="current-time">{{ time }}</time>
      <p class="current-date">{{ date }}</p>
    </div>
    <div class="system-summary">
      <span>{{ applicationCount }} 个应用在线</span>
      <span>系统运行正常</span>
    </div>
  </header>

  <div class="search-composer">
    <textarea
      aria-label="搜索应用、页面或输入命令"
      readonly
      placeholder="搜索应用、页面或输入命令..."
      @click="emit('open-search')"
      @focus="emit('open-search')"
    ></textarea>
    <span class="shortcut-hint"><kbd>{{ shortcutModifier }}</kbd><kbd>K</kbd></span>
    <button class="send-button" type="button" aria-label="打开全局搜索" title="打开全局搜索" @click="emit('open-search')">
      <AppIcon name="Promotion" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

defineProps<{
  time: string
  date: string
  applicationCount: number
}>()

const emit = defineEmits<{ 'open-search': [] }>()
const shortcutModifier = computed(() => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘' : 'Ctrl')
</script>

<style scoped lang="scss">
.overview-header { display: flex; align-items: center; justify-content: space-between; gap: $spacing-lg; padding: 0 0 $spacing-lg; border-bottom: 1px solid var(--cp-border-light); }
.current-time { display: block; color: var(--cp-text); font-size: 40px; font-weight: 400; letter-spacing: 0; line-height: 1; }
.current-date { margin: 6px 0 0; color: var(--cp-text-tertiary); font-size: $font-sm; }
.system-summary { display: flex; flex-direction: column; gap: 4px; color: var(--cp-text-secondary); font-size: $font-sm; white-space: nowrap; }

.search-composer {
  position: relative;
  width: 100%;
  margin: $spacing-lg 0 0;
  background: var(--cp-bg-hover);
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-md);
  transition: border-color $transition-fast, box-shadow $transition-fast;

  &:focus-within { border-color: var(--cp-primary); box-shadow: 0 0 0 3px var(--cp-primary-lighter); }
}

textarea {
  display: block;
  width: 100%;
  min-height: 104px;
  padding: $spacing-md 96px $spacing-md $spacing-md;
  color: var(--cp-text-secondary);
  resize: none;
  cursor: pointer;
  background: transparent;
  border: 0;
  outline: 0;
  font: inherit;
  font-size: $font-base;
  line-height: 1.6;

  &::placeholder { color: var(--cp-text-placeholder); opacity: 1; }
}

.shortcut-hint { position: absolute; right: 58px; bottom: 13px; display: inline-flex; gap: 2px; }
kbd { min-width: 20px; padding: 3px 5px; color: var(--cp-text-tertiary); font: inherit; font-size: $font-xs; line-height: 16px; text-align: center; background: var(--cp-bg-elevated); border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-sm); }
.send-button { position: absolute; right: 10px; bottom: 10px; display: grid; width: 32px; height: 32px; place-items: center; color: var(--cp-primary-contrast, #fff); cursor: pointer; background: var(--cp-primary); border: 0; border-radius: var(--cp-radius-sm); transition: background $transition-fast, transform $transition-fast; }
.send-button:hover, .send-button:focus-visible { background: var(--cp-primary-hover); outline: 0; transform: translateY(-1px); }
.send-button :deep(.el-icon) { font-size: 16px; }

@include media-max($breakpoint-md) {
  .overview-header { align-items: flex-start; flex-direction: column; gap: $spacing-sm; padding-bottom: $spacing-md; }
  .current-time { font-size: 34px; }
  .system-summary { font-size: $font-sm; white-space: normal; }
  textarea { min-height: 92px; }
  .shortcut-hint { right: 54px; bottom: 12px; }
}
</style>
