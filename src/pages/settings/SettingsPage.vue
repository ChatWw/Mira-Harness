<template>
  <main class="settings-page">
    <aside class="settings-sidebar">
      <button class="back-button" type="button" aria-label="返回应用" @click="returnToApplication">
        <AppIcon name="ArrowLeft" />
        <span>返回应用</span>
      </button>

      <div class="settings-nav-group">
        <span class="settings-nav-label">设置</span>
        <button class="settings-nav-item is-active" type="button" @click="goToAppearance">
          <AppIcon name="Brush" />
          <span>外观</span>
        </button>
      </div>
    </aside>

    <section class="settings-main">
      <div class="settings-main__content">
        <header class="settings-page-header">
          <h1>外观</h1>
          <p>个性化你的工作空间。所有更改会立即应用并自动保存。</p>
        </header>
        <AppSettings />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSettings from '@/layouts/components/AppSettings.vue'

const route = useRoute()
const router = useRouter()
const validSections = ['appearance']
const requestedSection = computed(() => typeof route.params.section === 'string' ? route.params.section : '')

watch(requestedSection, (section) => {
  if (!validSections.includes(section)) {
    void router.replace({ path: '/settings/appearance', query: route.query })
  }
}, { immediate: true })

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
  if (requestedSection.value !== 'appearance') {
    void router.replace({ path: '/settings/appearance', query: route.query })
  }
}
</script>

<style scoped lang="scss">
.settings-page {
  display: flex;
  width: 100%;
  min-height: 100vh;
  background: var(--cp-bg);
  color: var(--cp-text);
}

.settings-sidebar {
  box-sizing: border-box;
  display: flex;
  flex: 0 0 260px;
  flex-direction: column;
  gap: 30px;
  padding: 54px 18px 24px;
  border-right: 1px solid var(--cp-border-light);
  background: color-mix(in srgb, var(--cp-bg-elevated) 88%, transparent);
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
  padding: 9px 10px;

  &:hover { color: var(--cp-text); background: var(--cp-hover-bg); }
}

.settings-nav-group { display: flex; flex-direction: column; gap: 8px; }
.settings-nav-label { padding: 0 10px; color: var(--cp-text-tertiary); font-size: 12px; }
.settings-nav-item { padding: 10px; color: var(--cp-text); font-weight: 600; }
.settings-nav-item.is-active { background: color-mix(in srgb, var(--cp-primary) 12%, transparent); color: var(--cp-primary); }

.settings-main { flex: 1; min-width: 0; overflow: auto; }
.settings-main__content { box-sizing: border-box; width: min(920px, 100%); margin: 0 auto; padding: 76px 48px 56px; }
.settings-page-header { margin-bottom: 38px; }
.settings-page-header h1 { margin: 0; font-size: 30px; line-height: 1.25; }
.settings-page-header p { margin: 10px 0 0; color: var(--cp-text-secondary); }

@media (max-width: 768px) {
  .settings-page { display: block; }
  .settings-sidebar { position: sticky; top: 0; z-index: 1; flex-direction: row; align-items: center; gap: 12px; padding: 12px; border-right: 0; border-bottom: 1px solid var(--cp-border-light); background: var(--cp-bg-elevated); box-shadow: 0 2px 10px color-mix(in srgb, var(--cp-bg) 85%, transparent); }
  .back-button { width: auto; padding: 8px; }
  .back-button span, .settings-nav-label { display: none; }
  .settings-nav-group { flex: 1; }
  .settings-nav-item { justify-content: center; padding: 8px; }
  .settings-main__content { padding: 32px 20px; }
}
</style>
