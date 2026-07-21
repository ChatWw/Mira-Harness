<template>
  <main class="app-main">
    <transition :name="transitionName" mode="out-in">
      <router-view :key="$route.fullPath" />
    </transition>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useLayoutStore } from '@/stores/layout'

const layoutStore = useLayoutStore()

const transitionName = computed(() => layoutStore.config.pageTransition)
</script>

<style scoped lang="scss">
.app-main {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: $spacing-lg;
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

// ==================== 淡入淡出 ====================
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// ==================== 滑动淡入（默认）====================
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
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
  transition: all 0.4s ease;
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
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
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
  transition: all 0.3s ease;
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
