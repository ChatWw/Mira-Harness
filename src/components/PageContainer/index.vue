<template>
  <div class="page-container" :class="containerClass">
    <div v-if="$slots.header || title" class="page-header">
      <div class="page-header__left">
        <slot name="header">
          <h2 class="page-title">{{ title }}</h2>
          <p v-if="description" class="page-description">{{ description }}</p>
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
import { useLayoutStore } from '@/stores/layout'
import type { ContentWidth, ContentPadding } from '@/types'

interface Props {
  title?: string
  description?: string
  maxWidth?: ContentWidth
  padding?: ContentPadding
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  description: '',
})

const layoutStore = useLayoutStore()

const actualMaxWidth = computed(() => props.maxWidth || layoutStore.config.contentMaxWidth)
const actualPadding = computed(() => props.padding || layoutStore.config.contentPadding)

const containerClass = computed(() => ({
  'is-full': actualMaxWidth.value === 'full',
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
