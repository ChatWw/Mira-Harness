import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ThemeMode } from '@/types'
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  PRIMARY_COLOR_STORAGE_KEY,
  PRESET_COLORS,
} from '@/config/theme'

type ViewTransitionController = {
  ready: Promise<void>
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void | Promise<void>) => ViewTransitionController
}

const THEME_TRANSITION_ATTR = 'data-theme-transition'
const THEME_TRANSITION_DURATION = 450

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

  function toggleThemeMode() {
    const nextMode = themeMode.value === 'light' ? 'dark' : 'light'
    setThemeMode(nextMode)
  }

  function setPrimaryColor(color: string) {
    primaryColor.value = color
    localStorage.setItem(PRIMARY_COLOR_STORAGE_KEY, color)
    applyTheme()
  }

  async function toggleThemeModeWithTransition(event?: MouseEvent) {
    const documentWithTransition = document as DocumentWithViewTransition

    if (
      !documentWithTransition.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      toggleThemeMode()
      return
    }

    const nextMode = themeMode.value === 'light' ? 'dark' : 'light'
    const root = document.documentElement
    const { x, y } = resolveTransitionOrigin(event)
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )
    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`,
    ]

    root.setAttribute(THEME_TRANSITION_ATTR, nextMode)

    const transition = documentWithTransition.startViewTransition(() => {
      setThemeMode(nextMode)
    })

    try {
      await transition.ready

      const animation = root.animate(
        {
          clipPath: nextMode === 'dark' ? clipPath : [...clipPath].reverse(),
        },
        {
          duration: THEME_TRANSITION_DURATION,
          easing: 'ease-in-out',
          fill: 'both',
          pseudoElement:
            nextMode === 'dark' ? '::view-transition-new(root)' : '::view-transition-old(root)',
        }
      )

      await animation.finished.catch(() => undefined)
    } finally {
      root.removeAttribute(THEME_TRANSITION_ATTR)
    }
  }

  function setThemeMode(mode: ThemeMode) {
    if (themeMode.value === mode) {
      return
    }

    themeMode.value = mode
    localStorage.setItem(THEME_STORAGE_KEY, mode)
    applyTheme()
  }

  function resolveTransitionOrigin(event?: MouseEvent) {
    const fallback = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }

    if (!event) {
      return fallback
    }

    if (event.clientX === 0 && event.clientY === 0) {
      return fallback
    }

    return {
      x: event.clientX,
      y: event.clientY,
    }
  }

  function applyTheme() {
    const root = document.documentElement

    // 设置主题模式
    root.setAttribute('data-theme', themeMode.value)

    // 设置自定义主题色 CSS 变量
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

    // ========== 关键：设置 Element Plus 的 CSS 变量 ==========
    // Element Plus 使用 --el-color-primary 系列变量
    root.style.setProperty('--el-color-primary', primaryColor.value)
    root.style.setProperty('--el-color-primary-dark-2', adjustColor(primaryColor.value, -20))

    // Element Plus 的浅色变体（用于 hover、disabled 等状态）
    root.style.setProperty('--el-color-primary-light-3', mixColor(primaryColor.value, '#ffffff', 0.3))
    root.style.setProperty('--el-color-primary-light-5', mixColor(primaryColor.value, '#ffffff', 0.5))
    root.style.setProperty('--el-color-primary-light-7', mixColor(primaryColor.value, '#ffffff', 0.7))
    root.style.setProperty('--el-color-primary-light-8', mixColor(primaryColor.value, '#ffffff', 0.8))
    root.style.setProperty('--el-color-primary-light-9', mixColor(primaryColor.value, '#ffffff', 0.9))
  }

  /**
   * 调整颜色亮度
   */
  function adjustColor(color: string, amount: number): string {
    const hex = color.replace('#', '')
    const num = parseInt(hex, 16)
    const r = Math.max(0, Math.min(255, (num >> 16) + amount))
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amount))
    const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amount))
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }

  /**
   * 混合两个颜色（用于生成 Element Plus 的浅色变体）
   * @param color1 主颜色（hex）
   * @param color2 混合颜色（通常是白色）
   * @param weight color2 的权重（0-1）
   */
  function mixColor(color1: string, color2: string, weight: number): string {
    const hex1 = color1.replace('#', '')
    const hex2 = color2.replace('#', '')

    const r1 = parseInt(hex1.substring(0, 2), 16)
    const g1 = parseInt(hex1.substring(2, 4), 16)
    const b1 = parseInt(hex1.substring(4, 6), 16)

    const r2 = parseInt(hex2.substring(0, 2), 16)
    const g2 = parseInt(hex2.substring(2, 4), 16)
    const b2 = parseInt(hex2.substring(4, 6), 16)

    const r = Math.round(r1 * (1 - weight) + r2 * weight)
    const g = Math.round(g1 * (1 - weight) + g2 * weight)
    const b = Math.round(b1 * (1 - weight) + b2 * weight)

    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }

  return {
    themeMode,
    primaryColor,
    presetColors,
    toggleThemeMode,
    toggleThemeModeWithTransition,
    setThemeMode,
    setPrimaryColor,
  }
})
