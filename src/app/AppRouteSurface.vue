<template>
  <div class="app-route-surface" :class="{ 'app-route-surface--hidden': hidden }" :inert="hidden || undefined" :aria-hidden="hidden || undefined">
    <router-view :route="displayedRoute" />
  </div>
</template>

<script setup lang="ts">
import { provide, shallowReactive, watch } from 'vue'
import { routeLocationKey, type RouteLocationNormalizedLoaded } from 'vue-router'

const props = defineProps<{ route: RouteLocationNormalizedLoaded; hidden: boolean }>()
// Both nested router views and useRoute() must see the retained application route.
const displayedRoute = shallowReactive({ ...props.route })
provide(routeLocationKey, displayedRoute)
watch(() => props.route, route => Object.assign(displayedRoute, route), { flush: 'sync' })
</script>

<style scoped>
.app-route-surface { width: 100%; height: 100%; }
/* Keep iframe/webview nodes in place and their layout intact while settings are open. */
.app-route-surface--hidden { position: fixed; inset: 0; visibility: hidden; pointer-events: none; }
</style>
