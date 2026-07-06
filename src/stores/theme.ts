import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ThemeMode } from '@/types'
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  PRIMARY_COLOR_STORAGE_KEY,
  PRESET_COLORS,
} from '@/config/theme'

export const useThemeStore = defineStore('theme', () => {
  const themeMode = ref<ThemeMode>(
    (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) || DEFAULT_THEME_MODE
  )
  const primaryColor = ref<string>(
    localStorage.getItem(PRIMARY_COLOR_STORAGE_KEY) || DEFAULT_PRIMARY_COLOR
  )

  const presetColors = PRESET_COLORS

  // 在 store 创建时初始化主题
  applyTheme()

  // 监听变化并应用主题
  watch([themeMode, primaryColor], () => {
    applyTheme()
  })

  function toggleThemeMode() {
    themeMode.value = themeMode.value === 'light' ? 'dark' : 'light'
    localStorage.setItem(THEME_STORAGE_KEY, themeMode.value)
  }

  function setPrimaryColor(color: string) {
    primaryColor.value = color
    localStorage.setItem(PRIMARY_COLOR_STORAGE_KEY, color)
  }

  function applyTheme() {
    const root = document.documentElement

    // 设置主题模式
    root.setAttribute('data-theme', themeMode.value)

    // 设置主题色
    root.style.setProperty('--cp-primary', primaryColor.value)

    // 计算 hover 颜色（稍微深一点）
    const hoverColor = adjustColor(primaryColor.value, -10)
    root.style.setProperty('--cp-primary-hover', hoverColor)

    // 计算带透明度的浅色
    root.style.setProperty('--cp-primary-light', `${primaryColor.value}1a`)
    root.style.setProperty('--cp-primary-lighter', `${primaryColor.value}0d`)

    // 更新登录页渐变色
    root.style.setProperty('--cp-login-left-bg-start', `${primaryColor.value}e6`)
    root.style.setProperty('--cp-login-left-bg-end', `${primaryColor.value}cc`)
  }

  function adjustColor(color: string, amount: number): string {
    const hex = color.replace('#', '')
    const num = parseInt(hex, 16)
    const r = Math.max(0, Math.min(255, (num >> 16) + amount))
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amount))
    const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amount))
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }

  return {
    themeMode,
    primaryColor,
    presetColors,
    toggleThemeMode,
    setPrimaryColor,
  }
})
