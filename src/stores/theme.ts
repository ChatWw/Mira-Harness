import { defineStore } from 'pinia'
import { computed, nextTick, ref } from 'vue'
import type { ThemeMode, ThemePreference } from '@/types'
import {
  DEFAULT_PRIMARY_PRESET_ID,
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  LEGACY_PRIMARY_COLOR_STORAGE_KEY,
  PRIMARY_PRESET_STORAGE_KEY,
  PRESET_COLORS,
} from '@/config/theme'
import { getPreference, savePreference } from '@/platform'
import miraFavicon from '@/asset/mira-favicon.png'

type ViewTransitionController = {
  ready: Promise<void>
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void | Promise<void>) => ViewTransitionController
}

const THEME_TRANSITION_ATTR = 'data-theme-transition'

function resolveThemeMode(preference: ThemePreference): ThemeMode {
  return preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export const useThemeStore = defineStore('theme', () => {
  const storedThemePreference = getPreference('themeMode', localStorage.getItem(THEME_STORAGE_KEY))
  const themePreference = ref<ThemePreference>(
    isThemePreference(storedThemePreference) ? storedThemePreference : DEFAULT_THEME_MODE
  )
  const themeMode = ref<ThemeMode>(resolveThemeMode(themePreference.value))
  const presetColors = PRESET_COLORS
  localStorage.removeItem(LEGACY_PRIMARY_COLOR_STORAGE_KEY)
  const storedPresetId = getPreference('primaryPreset', localStorage.getItem(PRIMARY_PRESET_STORAGE_KEY))
  const primaryPresetId = ref(
    presetColors.some(preset => preset.id === storedPresetId)
      ? storedPresetId!
      : DEFAULT_PRIMARY_PRESET_ID
  )
  const activePreset = computed(
    () => presetColors.find(preset => preset.id === primaryPresetId.value) || presetColors[0]
  )
  const primaryColor = computed(() => activePreset.value[themeMode.value])

  // 在 store 创建时初始化主题
  applyTheme()
  const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemThemeQuery.addEventListener('change', () => {
    if (themePreference.value !== 'system') return
    themeMode.value = resolveThemeMode('system')
    applyTheme()
  })

  function toggleThemeMode() {
    const nextMode = themeMode.value === 'light' ? 'dark' : 'light'
    setThemePreference(nextMode)
  }

  function setPrimaryPreset(id: string) {
    if (!presetColors.some(preset => preset.id === id)) return

    primaryPresetId.value = id
    localStorage.setItem(PRIMARY_PRESET_STORAGE_KEY, id)
    savePreference('primaryPreset', id)
    applyTheme()
  }

  async function toggleThemeModeWithTransition(event?: MouseEvent, enabled = true) {
    const nextMode = themeMode.value === 'light' ? 'dark' : 'light'
    await setThemeModeWithTransition(nextMode, event, enabled)
  }

  async function setThemeModeWithTransition(
    nextMode: ThemePreference,
    event?: MouseEvent,
    enabled = true
  ) {
    const documentWithTransition = document as DocumentWithViewTransition
    const nextEffectiveMode = resolveThemeMode(nextMode)

    if (
      !enabled ||
      !documentWithTransition.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setThemePreference(nextMode)
      return
    }

    if (themePreference.value === nextMode || themeMode.value === nextEffectiveMode) {
      setThemePreference(nextMode)
      return
    }

    const root = document.documentElement
    const { cssValue: transitionDuration, milliseconds: transitionDurationMs } = getTransitionDuration(root)
    const { x, y } = resolveTransitionOrigin(event)
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )
    // DOM geometry and View Transition clip-path both use CSS pixels. Do not apply devicePixelRatio.
    const transitionX = x
    const transitionY = y
    const transitionRadius = endRadius
    const transitionStyle = document.createElement('style')
    transitionStyle.textContent = `
      @keyframes cp-theme-reveal {
        from { clip-path: circle(0px at ${transitionX}px ${transitionY}px); }
        to { clip-path: circle(${transitionRadius}px at ${transitionX}px ${transitionY}px); }
      }
      @keyframes cp-theme-conceal {
        from { clip-path: circle(${transitionRadius}px at ${transitionX}px ${transitionY}px); }
        to { clip-path: circle(0px at ${transitionX}px ${transitionY}px); }
      }
      [data-theme-transition='dark']::view-transition-new(root) {
        animation: cp-theme-reveal ${transitionDuration} ease-in-out both;
      }
      [data-theme-transition='light']::view-transition-old(root) {
        animation: cp-theme-conceal ${transitionDuration} ease-in-out both;
      }
    `

    // 先清理旧的状态，避免上一次的值残留
    root.removeAttribute(THEME_TRANSITION_ATTR)

    try {
      document.head.append(transitionStyle)

      const transition = documentWithTransition.startViewTransition(async () => {
        setThemePreference(nextMode)
        await nextTick()
      })

      await transition.ready

      // 标记当前切换方向，触发对应的 View Transition 伪元素动画
      root.setAttribute(THEME_TRANSITION_ATTR, nextEffectiveMode)

      // 等待 CSS 伪元素动画开始，避免第一帧闪现
      await new Promise(resolve => requestAnimationFrame(resolve))
      await new Promise(resolve => window.setTimeout(resolve, transitionDurationMs))
    } finally {
      root.removeAttribute(THEME_TRANSITION_ATTR)
      transitionStyle.remove()
    }
  }

  function setThemeMode(mode: ThemeMode) {
    setThemePreference(mode)
  }

  function setThemePreference(preference: ThemePreference) {
    const nextMode = resolveThemeMode(preference)
    if (themePreference.value === preference && themeMode.value === nextMode) return

    themePreference.value = preference
    localStorage.setItem(THEME_STORAGE_KEY, preference)
    savePreference('themeMode', preference)
    if (themeMode.value === nextMode) return
    themeMode.value = nextMode
    applyTheme()
  }

  function getTransitionDuration(root: HTMLElement) {
    const cssValue = getComputedStyle(root).getPropertyValue('--cp-animation-duration').trim() || '0.3s'
    const milliseconds = cssValue.endsWith('ms')
      ? Number.parseFloat(cssValue)
      : Number.parseFloat(cssValue) * 1000

    return { cssValue, milliseconds }
  }

  function resolveTransitionOrigin(event?: MouseEvent) {
    const fallback = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }

    if (!event) {
      return fallback
    }

    const trigger = event.currentTarget
    if (trigger instanceof HTMLElement) {
      const { left, top, width, height } = trigger.getBoundingClientRect()

      return {
        x: left + width / 2,
        y: top + height / 2,
      }
    }

    return {
      x: event.clientX,
      y: event.clientY,
    }
  }

  function applyTheme() {
    const root = document.documentElement
    const preset = activePreset.value
    const color = primaryColor.value
    const contrastColor = themeMode.value === 'light'
      ? preset.lightContrast || '#ffffff'
      : preset.darkContrast || '#ffffff'
    const lightVariantBase = themeMode.value === 'dark' ? '#000000' : '#ffffff'

    // 设置主题模式
    root.setAttribute('data-theme', themeMode.value)

    // 设置自定义主题色 CSS 变量
    root.style.setProperty('--cp-primary', color)
    root.style.setProperty('--cp-primary-contrast', contrastColor)

    // 计算 hover 颜色（稍微深一点）
    const hoverColor = adjustColor(color, -10)
    root.style.setProperty('--cp-primary-hover', hoverColor)
    root.style.setProperty('--cp-primary-active', adjustColor(color, -20))

    // 计算带透明度的浅色
    root.style.setProperty('--cp-primary-light', `${color}1a`)
    root.style.setProperty('--cp-primary-lighter', `${color}0d`)

    applyElementColor(root, 'primary', color, lightVariantBase)
    // Element Plus 将输入组、字数统计等中性组件标记为 info；这里跟随平台主题，避免残留默认蓝色。
    applyElementColor(root, 'info', color, lightVariantBase)

    updateFavicon()
  }

  function updateFavicon() {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!favicon) return

    favicon.href = miraFavicon
  }

  function applyElementColor(root: HTMLElement, name: 'primary' | 'info', color: string, lightVariantBase: string) {
    const variable = `--el-color-${name}`
    root.style.setProperty(variable, color)
    root.style.setProperty(`${variable}-rgb`, toRgb(color))
    root.style.setProperty(`${variable}-dark-2`, adjustColor(color, -20))
    root.style.setProperty(`${variable}-light-3`, mixColor(color, lightVariantBase, 0.3))
    root.style.setProperty(`${variable}-light-5`, mixColor(color, lightVariantBase, 0.5))
    root.style.setProperty(`${variable}-light-7`, mixColor(color, lightVariantBase, 0.7))
    root.style.setProperty(`${variable}-light-8`, mixColor(color, lightVariantBase, 0.8))
    root.style.setProperty(`${variable}-light-9`, mixColor(color, lightVariantBase, 0.9))
  }

  function toRgb(color: string) {
    const hex = color.replace('#', '')
    return `${parseInt(hex.substring(0, 2), 16)}, ${parseInt(hex.substring(2, 4), 16)}, ${parseInt(hex.substring(4, 6), 16)}`
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
    themePreference,
    primaryColor,
    primaryPresetId,
    presetColors,
    toggleThemeMode,
    toggleThemeModeWithTransition,
    setThemeModeWithTransition,
    setThemeMode,
    setThemePreference,
    setPrimaryPreset,
  }
})
