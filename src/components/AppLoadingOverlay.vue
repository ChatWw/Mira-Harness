<template>
  <div class="loading-overlay-host" :class="{ 'is-global': global }" :aria-busy="active">
    <slot />
    <Transition name="loading-overlay-fade">
      <div v-if="active" class="loading-overlay" :class="{ 'is-global': global }" role="status" aria-live="polite">
        <div class="loading-overlay__indicator">
          <AppLoadingIndicator :variant="variant" />
          <span v-if="text" class="loading-overlay__text">{{ text }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { LoadingStyle } from '@/hooks/useLoading'
import AppLoadingIndicator from './AppLoadingIndicator.vue'

const props = defineProps({
  active: Boolean,
  text: { type: String, default: '正在加载…' },
  global: Boolean,
  variant: String as () => LoadingStyle | undefined,
})

</script>

<style scoped lang="scss">
.loading-overlay-host { position: relative; min-width: 0; }
.loading-overlay-host.is-global { position: static; }
.loading-overlay { position: absolute; z-index: 10; inset: 0; display: grid; place-items: center; min-height: 100%; background: color-mix(in srgb, var(--cp-bg-overlay) 82%, transparent); }
.loading-overlay.is-global { position: fixed; z-index: $z-modal; min-height: 100vh; background: color-mix(in srgb, var(--cp-bg-overlay) 88%, transparent); }
.loading-overlay__indicator { display: flex; min-width: 112px; align-items: center; flex-direction: column; gap: $spacing-sm; color: var(--cp-text-secondary); font-size: $font-sm; }
.loading-overlay__text { max-width: 20ch; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.loading-overlay-fade-enter-active, .loading-overlay-fade-leave-active { transition: opacity $transition-fast; }
.loading-overlay-fade-enter-from, .loading-overlay-fade-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .loading-overlay-fade-enter-active, .loading-overlay-fade-leave-active { transition: none; } }
</style>
