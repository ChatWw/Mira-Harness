<template>
  <div class="appearance-settings">
    <section class="settings-section" aria-labelledby="theme-heading">
      <div class="section-heading">
        <h2 id="theme-heading">主题</h2>
        <p>选择 Mira 工作台的明暗模式。</p>
      </div>

      <div class="theme-options" role="radiogroup" aria-label="主题模式">
        <button
          v-for="mode in themeModes"
          :key="mode.value"
          type="button"
          class="theme-option"
          :class="{ 'is-selected': themeStore.themeMode === mode.value }"
          role="radio"
          :aria-checked="themeStore.themeMode === mode.value"
          @click="setTheme(mode.value, $event)"
        >
          <span class="theme-preview" :class="`is-${mode.value}`" aria-hidden="true">
            <span class="theme-preview__sidebar" />
            <span class="theme-preview__body"><i /><i /><i /></span>
          </span>
          <span class="theme-option__label">{{ mode.label }}</span>
          <AppIcon v-if="themeStore.themeMode === mode.value" name="CircleCheckFilled" class="theme-option__check" aria-hidden="true" />
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import type { ThemeMode } from '@/types'

const themeStore = useThemeStore()
const themeModes: Array<{ value: ThemeMode, label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

function setTheme(mode: ThemeMode, event: MouseEvent) {
  void themeStore.setThemeModeWithTransition(mode, event, true)
}
</script>

<style scoped lang="scss">
.appearance-settings { max-width: 720px; padding-bottom: 24px; }
.settings-section { min-width: 0; }
.section-heading { margin-bottom: 18px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: 18px; font-weight: $font-semibold; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }
.theme-options { display: grid; grid-template-columns: repeat(2, minmax(0, 240px)); gap: 12px; }
.theme-option { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 10px; border: 1px solid var(--cp-border-light); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-elevated); cursor: pointer; font: inherit; text-align: left; transition: border-color $transition-fast, background-color $transition-fast, box-shadow $transition-fast; }
.theme-option:hover { border-color: color-mix(in srgb, var(--cp-primary) 42%, var(--cp-border)); background: color-mix(in srgb, var(--cp-primary) 4%, var(--cp-bg-elevated)); }
.theme-option:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.theme-option.is-selected { border-color: var(--cp-primary); background: color-mix(in srgb, var(--cp-primary) 6%, var(--cp-bg-elevated)); box-shadow: 0 6px 16px rgb(24 24 27 / 8%); }
.theme-option__label { font-size: $font-sm; font-weight: $font-medium; }
.theme-option__check { position: absolute; top: 12px; right: 12px; color: var(--cp-primary); font-size: 17px; }
.theme-preview { display: flex; height: 112px; overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; }
.theme-preview__sidebar { width: 25%; background: #ececec; }
.theme-preview__body { display: flex; flex: 1; flex-direction: column; gap: 9px; justify-content: center; padding: 18px; background: #fff; }
.theme-preview__body i { display: block; height: 8px; border-radius: 3px; background: #d4d4d8; }
.theme-preview__body i:nth-child(2) { width: 76%; }
.theme-preview__body i:nth-child(3) { width: 54%; }
.theme-preview.is-dark .theme-preview__sidebar { background: #222327; }
.theme-preview.is-dark .theme-preview__body { background: #303136; }
.theme-preview.is-dark .theme-preview__body i { background: #686970; }

@media (max-width: 560px) {
  .theme-options { grid-template-columns: 1fr; }
}
</style>
