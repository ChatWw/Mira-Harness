<template>
  <main class="settings-page">
    <SettingsSiderMenu />

    <section class="settings-main">
      <div class="settings-main__content">
        <header class="settings-page-header">
          <h1>{{ title }}</h1>
        </header>
        <slot />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import SettingsSiderMenu from './SettingsSiderMenu.vue'

defineProps<{ title: string }>()
</script>

<style scoped lang="scss">
.settings-page {
  display: flex;
  width: 100%;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  background: var(--cp-bg);
  color: var(--cp-text);
}

.settings-main { flex: 1; min-width: 0; min-height: 0; overflow: auto; }
.settings-main__content { box-sizing: border-box; width: min(920px, 100%); margin: 0 auto; padding: 76px 48px 56px; }
.settings-page-header { margin-bottom: 38px; }
.settings-page-header h1 { margin: 0; font-size: 30px; line-height: 1.25; }
.settings-page-header p { margin: 10px 0 0; color: var(--cp-text-secondary); }

@media (max-width: 768px) {
  .settings-page { display: flex; flex-direction: column; }
  .settings-main { flex: 1; }
  .settings-main__content { padding: 32px 20px; }
}
</style>
