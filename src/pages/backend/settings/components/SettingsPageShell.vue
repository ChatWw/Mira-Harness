<template>
  <main
    class="settings-page"
    :class="{
      'is-macos-overlay': isMacOverlay,
      'is-windows-overlay': isWindowsOverlay,
    }"
  >
    <WindowsTitlebar v-if="isWindowsOverlay" />
    <SettingsSiderMenu />

    <section class="settings-main">
      <div class="settings-main__titlebar" :class="{ 'has-actions': $slots.titlebar }" :aria-hidden="$slots.titlebar ? undefined : true"><slot name="titlebar" /></div>
      <div class="settings-main__scroll" :class="{ 'is-workspace': workspace }">
        <div class="settings-main__content" :class="{ 'is-wide': wide, 'is-workspace': workspace }">
          <header v-if="showTitle !== false" class="settings-page-header">
            <h1>{{ title }}</h1>
          </header>
          <slot />
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import WindowsTitlebar from '@/layouts/components/WindowsTitlebar.vue'
import SettingsSiderMenu from './SettingsSiderMenu.vue'

withDefaults(defineProps<{ title: string, wide?: boolean, workspace?: boolean, showTitle?: boolean }>(), { showTitle: true })

const windowChrome = window.platform?.windowChrome ?? 'standard'
const isMacOverlay = windowChrome === 'macos-overlay'
const isWindowsOverlay = windowChrome === 'windows-overlay'
</script>

<style scoped lang="scss">
.settings-page {
  --cp-titlebar-height: 36px;
  position: relative;
  box-sizing: border-box;
  display: flex;
  width: 100%;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  background: var(--cp-bg-elevated);
  color: var(--cp-text);
}

.settings-page.is-windows-overlay {
  padding-top: var(--cp-titlebar-height);
}

.settings-page.is-windows-overlay .settings-main {
  margin: 6px 6px 6px 0;
  border-radius: 6px;
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

.settings-main { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; margin: 4px 4px 4px 0; overflow: hidden; border: 1px solid var(--cp-border); border-radius: 12px; background: var(--cp-bg); }
.settings-main__titlebar { flex: 0 0 48px; -webkit-app-region: drag; }
.settings-main__titlebar.has-actions { display: flex; flex-basis: 76px; align-items: center; padding: 28px 24px 8px; }
.settings-main__titlebar :deep(button) { -webkit-app-region: no-drag; }
.settings-main__scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-gutter: stable; }
.settings-main__scroll.is-workspace { overflow: hidden; }
.settings-main__content { box-sizing: border-box; width: min(896px, 100%); margin: 0 auto; padding: 0 32px 40px; }
.settings-main__content.is-wide { width: min(1280px, 100%); }
.settings-main__content.is-workspace { width: 100%; height: 100%; padding: 0; }
.settings-page-header { margin-bottom: 24px; }
.settings-page-header h1 { margin: 0; font-size: var(--settings-text-title); font-weight: 550; line-height: 1.333333; letter-spacing: -0.02em; }
.settings-page-header p { margin: 10px 0 0; color: var(--cp-text-secondary); }

// 只统一设置表单的尺寸与状态，不改变全局控件和浮层的动画。
.settings-main :deep(.el-button),
.settings-main :deep(.el-input),
.settings-main :deep(.el-select),
.settings-main :deep(.el-input-number) { --el-component-size: 32px; }
.settings-main :deep(.el-form-item__label) { color: var(--cp-text); }
.settings-main :deep(.el-select),
.settings-main :deep(.el-input-number),
.settings-main :deep(.el-switch),
.settings-main :deep(.el-radio-group) { flex-shrink: 0; }
.settings-main :deep(.settings-row__copy) { overflow-wrap: anywhere; }
.settings-main :deep(.settings-error) { margin-bottom: 16px; color: var(--cp-danger); font-size: $font-sm; line-height: 1.6; }
.settings-main :deep(button:focus-visible) { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.settings-main :deep(input),
.settings-main :deep(textarea) { caret-color: var(--cp-text); }

// 抽屉会覆盖顶部拖拽区，必须明确退出 Electron 的窗口拖拽命中区域。
:global(.el-overlay),
:global(.el-drawer) { -webkit-app-region: no-drag; }

</style>

<style lang="scss" src="./settings-typography.scss" />
<style lang="scss" src="./settings-controls.scss" />
