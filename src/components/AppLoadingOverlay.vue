<template>
  <div class="loading-overlay-host" :class="{ 'is-global': global }" :aria-busy="active">
    <slot />
    <Transition name="loading-overlay-fade">
      <div v-if="active" class="loading-overlay" :class="{ 'is-global': global }" role="status" aria-live="polite">
        <div class="loading-overlay__indicator">
          <l-orbit v-if="loaderStyle === 'orbit'" size="46" color="var(--cp-primary)" :speed="motionReduced ? 0 : 1.4" />
          <div v-else-if="loaderStyle === 'plane'" class="loading-overlay__spinkit sk-plane" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle" />
          <div v-else-if="loaderStyle === 'bounce'" class="loading-overlay__spinkit sk-bounce" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle">
            <div v-for="index in 2" :key="index" class="sk-bounce-dot" />
          </div>
          <div v-else-if="loaderStyle === 'wave'" class="loading-overlay__spinkit sk-wave" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle">
            <div v-for="index in 5" :key="index" class="sk-wave-rect" />
          </div>
          <div v-else-if="loaderStyle === 'pulse'" class="loading-overlay__spinkit sk-pulse" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle" />
          <div v-else-if="loaderStyle === 'flow'" class="loading-overlay__spinkit sk-flow" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle">
            <div v-for="index in 3" :key="index" class="sk-flow-dot" />
          </div>
          <div v-else-if="loaderStyle === 'swing'" class="loading-overlay__spinkit sk-swing" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle">
            <div v-for="index in 2" :key="index" class="sk-swing-dot" />
          </div>
          <div v-else-if="loaderStyle === 'circle'" class="loading-overlay__spinkit sk-circle" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle">
            <div v-for="index in 12" :key="index" class="sk-circle-dot" />
          </div>
          <div v-else-if="loaderStyle === 'circle-fade'" class="loading-overlay__spinkit sk-circle-fade" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle">
            <div v-for="index in 12" :key="index" class="sk-circle-fade-dot" />
          </div>
          <div v-else-if="loaderStyle === 'cube-grid'" class="loading-overlay__spinkit sk-grid" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle">
            <div v-for="index in 9" :key="index" class="sk-grid-cube" />
          </div>
          <div v-else-if="loaderStyle === 'wandering-cubes'" class="loading-overlay__spinkit sk-wander" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle">
            <div v-for="index in 3" :key="index" class="sk-wander-cube" />
          </div>
          <div v-else-if="loaderStyle === 'folding-cube'" class="loading-overlay__spinkit sk-fold" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle">
            <div v-for="index in 4" :key="index" class="sk-fold-cube" />
          </div>
          <div v-else-if="loaderStyle === 'chasing-dots'" class="loading-overlay__spinkit sk-chase" :class="{ 'is-motion-reduced': motionReduced }" :style="spinKitStyle">
            <div v-for="index in 6" :key="index" class="sk-chase-dot" />
          </div>
          <AppIcon v-else class="loading-overlay__element-icon is-loading" name="Loading" :size="28" />
          <span v-if="text" class="loading-overlay__text">{{ text }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { orbit } from 'ldrs'
import 'spinkit/spinkit.css'
import { useLoading } from '@/hooks/useLoading'
import type { LoadingStyle } from '@/hooks/useLoading'

orbit.register()

const props = defineProps({
  active: Boolean,
  text: { type: String, default: '正在加载…' },
  global: Boolean,
  variant: String as () => LoadingStyle | undefined,
})

const loading = useLoading()
const loaderStyle = computed(() => props.variant || loading.style.value)
const spinKitStyle = { '--sk-size': '46px', '--sk-color': 'var(--cp-primary)' }
const motionReduced = ref(false)
let motionQuery: MediaQueryList | undefined

function syncMotionPreference() {
  motionReduced.value = motionQuery?.matches || false
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncMotionPreference()
  motionQuery.addEventListener('change', syncMotionPreference)
})

onBeforeUnmount(() => motionQuery?.removeEventListener('change', syncMotionPreference))
</script>

<style scoped lang="scss">
.loading-overlay-host { position: relative; min-width: 0; }
.loading-overlay-host.is-global { position: static; }
.loading-overlay { position: absolute; z-index: 10; inset: 0; display: grid; place-items: center; min-height: 100%; background: color-mix(in srgb, var(--cp-bg-overlay) 82%, transparent); }
.loading-overlay.is-global { position: fixed; z-index: $z-modal; min-height: 100vh; background: color-mix(in srgb, var(--cp-bg-overlay) 88%, transparent); }
.loading-overlay__indicator { display: flex; min-width: 112px; align-items: center; flex-direction: column; gap: $spacing-sm; color: var(--cp-text-secondary); font-size: $font-sm; }
.loading-overlay__element-icon { color: var(--cp-primary); }
.loading-overlay__spinkit.is-motion-reduced :deep(*), .loading-overlay__spinkit.is-motion-reduced :deep(*::before), .loading-overlay__spinkit.is-motion-reduced :deep(*::after) { animation: none !important; }
.loading-overlay__text { max-width: 20ch; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.loading-overlay-fade-enter-active, .loading-overlay-fade-leave-active { transition: opacity $transition-fast; }
.loading-overlay-fade-enter-from, .loading-overlay-fade-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .loading-overlay-fade-enter-active, .loading-overlay-fade-leave-active { transition: none; }.loading-overlay__element-icon { animation: none; } }
</style>
