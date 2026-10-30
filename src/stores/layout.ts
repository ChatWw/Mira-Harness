import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { LayoutConfig } from '@/types'
import { getPreference, savePreference } from '@/platform'

export const APP_NAME = 'Mira Harness'
const ANIMATION_DURATION_MAP: Record<LayoutConfig['animationSpeed'], string> = {
  fast: '0.2s',
  normal: '0.3s',
  slow: '0.5s',
}

const CORNER_RADIUS_VALUES: Record<LayoutConfig['cornerRadius'], Record<string, string>> = {
  sharp: {
    small: '0px',
    base: '0px',
    large: '0px',
    extraLarge: '0px',
  },
  medium: {
    small: '4px',
    base: '8px',
    large: '12px',
    extraLarge: '16px',
  },
  rounded: {
    small: '8px',
    base: '12px',
    large: '16px',
    extraLarge: '20px',
  },
}

const DEFAULT_CONFIG: LayoutConfig = {
  contentMaxWidth: 'full',
  contentPadding: 'compact',
  pageTransition: 'fade-slide',
  animationSpeed: 'normal',
  themeTransitionAnimation: false,
  cornerRadius: 'medium',
  componentSize: 'default',
  dynamicTitle: true,
}

export const useLayoutStore = defineStore('layout', () => {
  // 布局配置
  const config = ref<LayoutConfig>({ ...DEFAULT_CONFIG, ...getPreference<Partial<LayoutConfig>>('layout', {}) })

  function setThemeTransitionAnimation(value: boolean) {
    config.value.themeTransitionAnimation = value
  }

  function applyCornerRadius(radius: LayoutConfig['cornerRadius']) {
    const values = CORNER_RADIUS_VALUES[radius]
    const root = document.documentElement

    root.dataset.cornerRadius = radius
    root.style.setProperty('--cp-radius-sm', values.small)
    root.style.setProperty('--cp-radius-md', values.base)
    root.style.setProperty('--cp-radius-lg', values.large)
    root.style.setProperty('--cp-radius-xl', values.extraLarge)
    root.style.setProperty('--el-border-radius-small', values.small)
    root.style.setProperty('--el-border-radius-base', values.base)
  }

  function applyAnimationSpeed(speed: LayoutConfig['animationSpeed']) {
    document.documentElement.style.setProperty('--cp-animation-duration', ANIMATION_DURATION_MAP[speed])
  }

  watch(
    () => config.value.cornerRadius,
    applyCornerRadius,
    { immediate: true }
  )

  watch(config, value => savePreference('layout', value), { deep: true })

  watch(
    () => config.value.animationSpeed,
    applyAnimationSpeed,
    { immediate: true }
  )

  return {
    config,
    setThemeTransitionAnimation,
  }
})
