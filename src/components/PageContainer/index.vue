<template>
  <div class="page-container" :class="containerClass">
    <div v-if="showPageHeader && ($slots.header || pageTitle)" class="page-header">
      <div class="page-header__left">
        <slot name="header">
          <h2 class="page-title">{{ pageTitle }}</h2>
          <p v-if="pageDescription" class="page-description">{{ pageDescription }}</p>
        </slot>
      </div>
      <div v-if="$slots.actions" class="page-header__right">
        <slot name="actions" />
      </div>
    </div>
    <div class="page-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import { useRoute } from 'vue-router'
import { useLayoutStore } from '@/stores/layout'
import type { ContentWidth, ContentPadding } from '@/types'

const props = defineProps({
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  showHeader: { type: Boolean, default: undefined },
  fillContent: { type: Boolean, default: false },
  maxWidth: String as PropType<ContentWidth>,
  padding: String as PropType<ContentPadding>,
})

const layoutStore = useLayoutStore()
const route = useRoute()

const pageTitle = computed(() => typeof route.meta.pageTitle === 'string' ? route.meta.pageTitle : props.title)
const pageDescription = computed(() => typeof route.meta.pageDescription === 'string' ? route.meta.pageDescription : props.description)
const showPageHeader = computed(() => props.showHeader ?? route.meta.showPageHeader !== false)

const actualMaxWidth = computed(() => props.maxWidth || layoutStore.config.contentMaxWidth)
const actualPadding = computed(() => props.padding || layoutStore.config.contentPadding)

const containerClass = computed(() => ({
  'is-full': actualMaxWidth.value === 'full',
  'is-fill-content': props.fillContent,
  [`max-width-${actualMaxWidth.value}`]: actualMaxWidth.value !== 'full',
  [`padding-${actualPadding.value}`]: true,
}))
</script>

<style scoped lang="scss">
.page-container {
  width: 100%;
  margin: 0 auto;

  &.max-width-1200 {
    max-width: 1200px;
  }

  &.max-width-1400 {
    max-width: 1400px;
  }

  &.max-width-1600 {
    max-width: 1600px;
  }

  &.padding-compact {
    padding: $spacing-md;
  }

  &.padding-normal {
    padding: $spacing-lg;
  }

  &.padding-comfortable {
    padding: $spacing-xl;
  }

  &.is-fill-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0;

    .page-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  }
}

.page-header {
  @include flex-between;
  align-items: flex-start;
  margin-bottom: $spacing-lg;

  &__left {
    flex: 1;
  }

  &__right {
    margin-left: $spacing-lg;
  }
}

.page-title {
  margin: 0;
  font-size: $font-2xl;
  font-weight: 600;
  color: var(--cp-text);
}

.page-description {
  margin: $spacing-xs 0 0;
  font-size: $font-sm;
  color: var(--cp-text-secondary);
}

.page-content {
  background: var(--cp-bg);
}
</style>
