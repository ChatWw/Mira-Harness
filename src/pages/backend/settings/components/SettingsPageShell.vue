<template>
  <main class="settings-page" :class="{ 'is-macos-overlay': isMacOverlay }">
    <SettingsSiderMenu />

    <section class="settings-main">
      <div class="settings-main__content" :class="{ 'is-wide': wide }">
        <header v-if="showTitle !== false" class="settings-page-header">
          <h1>{{ title }}</h1>
        </header>
        <slot />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import SettingsSiderMenu from './SettingsSiderMenu.vue'

defineProps<{ title: string, wide?: boolean, showTitle?: boolean }>()

const isMacOverlay = window.platform?.windowChrome === 'macos-overlay'
</script>

<style scoped lang="scss">
.settings-page {
  position: relative;
  display: flex;
  width: 100%;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  background: var(--cp-bg);
  color: var(--cp-text);
}

.settings-page.is-macos-overlay::before {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  left: 0;
  height: 34px;
  content: '';
  -webkit-app-region: drag;
}

.settings-main { flex: 1; min-width: 0; min-height: 0; overflow: auto; }
.settings-main__content { box-sizing: border-box; width: min(920px, 100%); margin: 0 auto; padding: 76px 48px 56px; }
.settings-main__content.is-wide { width: min(1280px, 100%); }
.settings-page-header { margin-bottom: 38px; }
.settings-page-header h1 { margin: 0; font-size: 30px; line-height: 1.25; }
.settings-page-header p { margin: 10px 0 0; color: var(--cp-text-secondary); }

// 抽屉会覆盖顶部拖拽区，必须明确退出 Electron 的窗口拖拽命中区域。
:global(.el-overlay),
:global(.el-drawer) { -webkit-app-region: no-drag; }

@media (max-width: 768px) {
  .settings-page { display: flex; flex-direction: column; }
  .settings-main { flex: 1; }
  .settings-main__content { padding: 32px 20px; }
}
</style>
