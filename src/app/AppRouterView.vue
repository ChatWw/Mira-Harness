<template>
  <AppRouteSurface :route="applicationRoute" :hidden="settingsOverlay" />
  <router-view v-if="settingsOverlay" />
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useRouter, type RouteLocationNormalizedLoaded } from 'vue-router'
import AppRouteSurface from './AppRouteSurface.vue'

const router = useRouter()
const harnessRoute = shallowRef<RouteLocationNormalizedLoaded>()
const isSettings = computed(() => router.currentRoute.value.path === '/settings' || router.currentRoute.value.path.startsWith('/settings/'))
watch(router.currentRoute, route => {
  if (route.name === 'HarnessReact') harnessRoute.value = route
  else if (!(route.path === '/settings' || route.path.startsWith('/settings/'))) harnessRoute.value = undefined
}, { immediate: true })
const settingsOverlay = computed(() => isSettings.value && Boolean(harnessRoute.value))
const applicationRoute = computed(() => settingsOverlay.value ? harnessRoute.value! : router.currentRoute.value)
</script>
