<template>
  <aside class="settings-sidebar">
    <button class="back-button" type="button" aria-label="返回应用" @click="returnToApplication">
      <AppIcon name="lucide:arrow-left" />
      <span>返回应用</span>
    </button>

    <nav class="settings-nav-group" aria-label="设置导航">
      <span class="settings-nav-label">个性化</span>
      <button
        class="settings-nav-item"
        :class="{ 'is-active': activeSection === 'appearance' }"
        type="button"
        :aria-current="activeSection === 'appearance' ? 'page' : undefined"
        @click="goToAppearance"
      >
        <AppIcon name="Brush" />
        <span>外观</span>
      </button>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const activeSection = computed(() => typeof route.params.section === 'string' ? route.params.section : '')

function getReturnPath() {
  const from = route.query.from
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/settings')) {
    return '/dashboard'
  }
  return from
}

function returnToApplication() {
  void router.replace(getReturnPath())
}

function goToAppearance() {
  if (activeSection.value !== 'appearance') {
    void router.replace({ path: '/settings/appearance', query: route.query })
  }
}
</script>

<style scoped lang="scss">
.settings-sidebar {
  box-sizing: border-box;
  display: flex;
  flex: 0 0 260px;
  flex-direction: column;
  gap: 30px;
  padding: 34px 8px 24px;
  border-right: 1px solid var(--cp-border-light);
  background: color-mix(in srgb, var(--cp-bg-elevated) 88%, transparent);
  min-height: 0;
  overflow-y: auto;
  position: relative;
  z-index: 1;
  box-shadow: inset -10px 0 16px -16px rgb(24 24 27 / 18%);
}

.back-button,
.settings-nav-item {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
  border: 0;
  border-radius: var(--cp-radius-md);
  color: var(--cp-text-secondary);
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.back-button {
  padding: 9px 12px;

  &:hover { color: var(--cp-text); background: var(--cp-hover-bg); }
}

.settings-nav-group { display: flex; flex-direction: column; gap: 8px; }
.settings-nav-label { padding: 0 12px; color: var(--cp-text-tertiary); font-size: 14px; }
.settings-nav-item { padding: 7px 12px; color: var(--cp-text); font-weight: 400; font-size: 12px; }
.back-button:hover,
.settings-nav-item:hover { background: var(--cp-bg-hover); }
.settings-nav-item.is-active { background: var(--cp-bg-hover); color: var(--cp-text); font-weight: 400; }

@media (max-width: 768px) {
  .settings-sidebar {
    position: sticky;
    top: 0;
    z-index: 1;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-right: 0;
    border-bottom: 1px solid var(--cp-border-light);
    background: var(--cp-bg-elevated);
    box-shadow: 0 2px 10px color-mix(in srgb, var(--cp-bg) 85%, transparent);
  }

  .back-button { width: auto; padding: 8px; }
  .back-button span,
  .settings-nav-label { display: none; }
  .settings-nav-group { flex: 1; }
  .settings-nav-item { justify-content: center; padding: 8px; }
}
</style>
