<template>
  <span class="app-loading-indicator" :class="{ 'is-motion-reduced': motionReduced }" :style="indicatorStyle" role="status">
    <l-orbit v-if="loaderStyle === 'orbit'" :size="size" :color="color" :speed="motionReduced ? 0 : 1.4" />
    <div v-else-if="loaderStyle === 'plane'" class="app-loading-indicator__spinkit sk-plane" />
    <div v-else-if="loaderStyle === 'bounce'" class="app-loading-indicator__spinkit sk-bounce"><div v-for="index in 2" :key="index" class="sk-bounce-dot" /></div>
    <div v-else-if="loaderStyle === 'wave'" class="app-loading-indicator__spinkit sk-wave"><div v-for="index in 5" :key="index" class="sk-wave-rect" /></div>
    <div v-else-if="loaderStyle === 'pulse'" class="app-loading-indicator__spinkit sk-pulse" />
    <div v-else-if="loaderStyle === 'flow'" class="app-loading-indicator__spinkit sk-flow"><div v-for="index in 3" :key="index" class="sk-flow-dot" /></div>
    <div v-else-if="loaderStyle === 'swing'" class="app-loading-indicator__spinkit sk-swing"><div v-for="index in 2" :key="index" class="sk-swing-dot" /></div>
    <div v-else-if="loaderStyle === 'circle'" class="app-loading-indicator__spinkit sk-circle"><div v-for="index in 12" :key="index" class="sk-circle-dot" /></div>
    <div v-else-if="loaderStyle === 'circle-fade'" class="app-loading-indicator__spinkit sk-circle-fade"><div v-for="index in 12" :key="index" class="sk-circle-fade-dot" /></div>
    <div v-else-if="loaderStyle === 'cube-grid'" class="app-loading-indicator__spinkit sk-grid"><div v-for="index in 9" :key="index" class="sk-grid-cube" /></div>
    <div v-else-if="loaderStyle === 'wandering-cubes'" class="app-loading-indicator__spinkit sk-wander"><div v-for="index in 3" :key="index" class="sk-wander-cube" /></div>
    <div v-else-if="loaderStyle === 'folding-cube'" class="app-loading-indicator__spinkit sk-fold"><div v-for="index in 4" :key="index" class="sk-fold-cube" /></div>
    <div v-else-if="loaderStyle === 'chasing-dots'" class="app-loading-indicator__spinkit sk-chase"><div v-for="index in 6" :key="index" class="sk-chase-dot" /></div>
    <AppIcon v-else class="app-loading-indicator__element-icon" :name="fallbackIcon" :size="size" />
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { orbit } from 'ldrs'
import 'spinkit/spinkit.css'
import { useLoading, type LoadingStyle } from '@/hooks/useLoading'

orbit.register()

const props = withDefaults(defineProps<{
  variant?: LoadingStyle
  size?: number
  color?: string
  fallbackIcon?: string
}>(), {
  size: 46,
  color: 'var(--cp-primary)',
  fallbackIcon: 'Loading',
})

const loading = useLoading()
const loaderStyle = computed(() => props.variant || loading.style.value)
const indicatorStyle = computed(() => ({ '--sk-size': `${props.size}px`, '--sk-color': props.color }))
const motionReduced = ref(false)
let motionQuery: MediaQueryList | undefined

function syncMotionPreference() { motionReduced.value = motionQuery?.matches || false }

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncMotionPreference()
  motionQuery.addEventListener('change', syncMotionPreference)
})

onBeforeUnmount(() => motionQuery?.removeEventListener('change', syncMotionPreference))
</script>

<style scoped lang="scss">
.app-loading-indicator { display: inline-grid; width: var(--sk-size); height: var(--sk-size); flex: 0 0 auto; place-items: center; color: var(--sk-color); }
.app-loading-indicator.is-motion-reduced :deep(*), .app-loading-indicator.is-motion-reduced :deep(*::before), .app-loading-indicator.is-motion-reduced :deep(*::after) { animation: none !important; }
.app-loading-indicator__element-icon { color: var(--sk-color); animation: app-loading-indicator-spin 1s linear infinite; }
@keyframes app-loading-indicator-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .app-loading-indicator__element-icon { animation: none; } }
</style>
