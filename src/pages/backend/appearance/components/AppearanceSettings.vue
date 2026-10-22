<template>
  <div class="appearance-settings">
    <section class="theme-settings" aria-label="主题设置">
    <div class="theme-row">
      <div class="theme-row__copy">
        <span class="theme-row__label">界面主题</span>
        <span class="theme-row__hint">选择浅色、深色或跟随系统主题。</span>
      </div>
      <el-select ref="themePicker" class="theme-picker" :model-value="themeStore.themePreference" aria-label="界面主题" @update:model-value="setTheme">
        <template #prefix><AppIcon :name="selectedMode.icon" :size="16" /></template>
        <el-option v-for="mode in themeModes" :key="mode.value" :label="mode.label" :value="mode.value">
          <span class="theme-picker__option"><AppIcon :name="mode.icon" :size="16" />{{ mode.label }}</span>
        </el-option>
      </el-select>
    </div>
    <div class="theme-row">
      <div class="theme-row__copy">
        <span class="theme-row__label">主题切换动画</span>
        <span class="theme-row__hint">切换浅色与深色主题时显示过渡动画。</span>
      </div>
      <el-switch :model-value="layoutStore.config.themeTransitionAnimation" aria-label="主题切换动画" @update:model-value="layoutStore.setThemeTransitionAnimation" />
    </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLayoutStore } from '@/stores/layout'
import { useThemeStore } from '@/stores/theme'
import type { ThemePreference } from '@/types'

const themeStore = useThemeStore()
const layoutStore = useLayoutStore()
const themePicker = ref<{ $el: HTMLElement }>()
const themeModes: Array<{ value: ThemePreference, label: string, icon: string }> = [
  { value: 'system', label: '系统', icon: 'lucide:monitor' },
  { value: 'light', label: '浅色', icon: 'lucide:sun' },
  { value: 'dark', label: '深色', icon: 'lucide:moon' },
]
const selectedMode = computed(() => themeModes.find(mode => mode.value === themeStore.themePreference)!)
function setTheme(mode: ThemePreference) {
  const bounds = themePicker.value?.$el.getBoundingClientRect()
  const origin = bounds ? { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 } : undefined
  void themeStore.setThemeModeWithTransition(mode, origin, layoutStore.config.themeTransitionAnimation)
}
</script>

<style scoped lang="scss">
.appearance-settings { min-width: 0; }
.theme-settings { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.theme-row + .theme-row { border-top: 1px solid var(--cp-border-light); }
.theme-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 60px; padding: 10px 16px; }
.theme-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.theme-row__label { color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 450; }
.theme-row__hint { color: var(--cp-text-secondary); font-size: var(--settings-text-small); line-height: 18px; }
.theme-picker { width: 192px; }
.theme-picker__option { display: flex; align-items: center; gap: 8px; }
</style>
