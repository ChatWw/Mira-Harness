<template>
  <main class="app-main" :class="{ 'app-main--harness': isHarnessRoute }">
    <router-view v-slot="{ Component }">
      <transition :name="transitionName" mode="out-in">
        <keep-alive :include="cachedRouteNames">
          <component :is="Component" :key="viewKey" />
        </keep-alive>
      </transition>
    </router-view>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useLayoutStore } from '@/stores/layout'
import { cachedRouteNames } from '@/router/routeCache'

const layoutStore = useLayoutStore()
const route = useRoute()
const isHarnessRoute = computed(() => route.path === '/workspace/chat' || route.path.startsWith('/workspace/chat/'))

const transitionName = computed(() => layoutStore.config.pageTransition)
// 同一微应用的子路由只通知宿主切换，仅显式刷新时重建 Wujie 实例。
const viewKey = computed(() => {
  if (route.name === 'MicroAppHost') return `micro:${String(route.params.code)}:${String(route.query._t || '')}`
  if (route.meta.keepAlive === true) return `page:${route.path}:${String(route.query._t || '')}`
  return route.fullPath
})
</script>

<style scoped lang="scss">
.app-main {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: $spacing-sm;
  background: var(--cp-bg);
  overflow-y: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @include media-max($breakpoint-md) {
    padding: $spacing-md;
  }
}

.app-main--harness {
  padding: 0;
  overflow: hidden;
}

// ==================== 淡入淡出 ====================
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--cp-animation-duration) ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// ==================== 滑动淡入（默认）====================
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all var(--cp-animation-duration) ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

// ==================== 上滑进入 ====================
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all var(--cp-animation-duration) ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(30px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-30px);
}

// ==================== 右侧滑入 ====================
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all var(--cp-animation-duration) cubic-bezier(0.25, 0.8, 0.25, 1);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(-50px);
}

// ==================== 缩放 ====================
.zoom-enter-active,
.zoom-leave-active {
  transition: all var(--cp-animation-duration) ease;
}

.zoom-enter-from {
  opacity: 0;
  transform: scale(0.9);
}

.zoom-leave-to {
  opacity: 0;
  transform: scale(1.1);
}

// ==================== 无动画 ====================
.none-enter-active,
.none-leave-active {
  transition: none;
}
</style>
