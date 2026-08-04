import { defineStore } from 'pinia'
import { computed, nextTick, ref } from 'vue'
import type { ThemeMode } from '@/types'
import {
  DEFAULT_PRIMARY_PRESET_ID,
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  LEGACY_PRIMARY_COLOR_STORAGE_KEY,
  PRIMARY_PRESET_STORAGE_KEY,
  PRESET_COLORS,
} from '@/config/theme'

type ViewTransitionController = {
  ready: Promise<void>
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void | Promise<void>) => ViewTransitionController
}

const THEME_TRANSITION_ATTR = 'data-theme-transition'
const FAVICON_PATHS = `
  <path d="M508.16 940.48a22.08 22.08 0 0 1-11.84-3.2l-334.72-192a24 24 0 0 1-12.16-20.8V336.96a24 24 0 0 1 12.16-20.8l334.72-192a24.64 24.64 0 0 1 24 0l334.4 192a24 24 0 0 1 12.16 20.8V723.2a24 24 0 0 1-12.16 20.8l-334.4 192a24 24 0 0 1-12.16 4.48z m-310.72-231.04l310.72 179.2 310.72-179.2V352l-310.72-179.2L197.44 352z" fill="#fff"/>
  <path d="M508.16 552a22.72 22.72 0 0 1-11.84-3.2l-204.8-117.12a23.68 23.68 0 0 1-8.96-32 24 24 0 0 1 32-8.96l204.8 117.12a23.68 23.68 0 0 1 8.96 32 24.32 24.32 0 0 1-20.16 12.16zM508.16 552a24.32 24.32 0 0 1-20.8-12.16 23.68 23.68 0 0 1 8.96-32L704 388.48a24 24 0 0 1 32 8.96 24.32 24.32 0 0 1-8.96 32l-207.68 118.4a22.08 22.08 0 0 1-11.2 4.16zM508.16 764.8a24.32 24.32 0 0 1-24-24V528a24.24 24.24 0 0 1 48 0v212.8a24.32 24.32 0 0 1-24 24z" fill="#fff"/>
`
export const useThemeStore = defineStore('theme', () => {
  const themeMode = ref<ThemeMode>(
    (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) || DEFAULT_THEME_MODE
  )
  const presetColors = PRESET_COLORS
  localStorage.removeItem(LEGACY_PRIMARY_COLOR_STORAGE_KEY)
  const storedPresetId = localStorage.getItem(PRIMARY_PRESET_STORAGE_KEY)
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

  function toggleThemeMode() {
    const nextMode = themeMode.value === 'light' ? 'dark' : 'light'
    setThemeMode(nextMode)
  }

  function setPrimaryPreset(id: string) {
    if (!presetColors.some(preset => preset.id === id)) return

    primaryPresetId.value = id
    localStorage.setItem(PRIMARY_PRESET_STORAGE_KEY, id)
    applyTheme()
  }

  async function toggleThemeModeWithTransition(event?: MouseEvent, enabled = true) {
    const nextMode = themeMode.value === 'light' ? 'dark' : 'light'
    await setThemeModeWithTransition(nextMode, event, enabled)
  }

  async function setThemeModeWithTransition(
    nextMode: ThemeMode,
    event?: MouseEvent,
    enabled = true
  ) {
    const documentWithTransition = document as DocumentWithViewTransition

    if (
      !enabled ||
      !documentWithTransition.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setThemeMode(nextMode)
      return
    }

    if (themeMode.value === nextMode) {
      return
    }

    const root = document.documentElement
    const { cssValue: transitionDuration, milliseconds: transitionDurationMs } = getTransitionDuration(root)
    const { x, y } = resolveTransitionOrigin(event)
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )
    const transitionScale = window.devicePixelRatio
    const transitionX = x * transitionScale
    const transitionY = y * transitionScale
    const transitionRadius = endRadius * transitionScale
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
        setThemeMode(nextMode)
        await nextTick()
      })

      await transition.ready

      // 标记当前切换方向，触发对应的 View Transition 伪元素动画
      root.setAttribute(THEME_TRANSITION_ATTR, nextMode)

      // 等待 CSS 伪元素动画开始，避免第一帧闪现
      await new Promise(resolve => requestAnimationFrame(resolve))
      await new Promise(resolve => window.setTimeout(resolve, transitionDurationMs))
    } finally {
      root.removeAttribute(THEME_TRANSITION_ATTR)
      transitionStyle.remove()
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

    // ========== 关键：设置 Element Plus 的 CSS 变量 ==========
    // Element Plus 使用 --el-color-primary 系列变量
    root.style.setProperty('--el-color-primary', color)
    root.style.setProperty('--el-color-primary-dark-2', adjustColor(color, -20))

    // Element Plus 的浅色变体（用于 hover、disabled 等状态）
    root.style.setProperty('--el-color-primary-light-3', mixColor(color, lightVariantBase, 0.3))
    root.style.setProperty('--el-color-primary-light-5', mixColor(color, lightVariantBase, 0.5))
    root.style.setProperty('--el-color-primary-light-7', mixColor(color, lightVariantBase, 0.7))
    root.style.setProperty('--el-color-primary-light-8', mixColor(color, lightVariantBase, 0.8))
    root.style.setProperty('--el-color-primary-light-9', mixColor(color, lightVariantBase, 0.9))

    updateFavicon()
  }

  function updateFavicon() {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!favicon) return

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="192" fill="${primaryColor.value}"/>${FAVICON_PATHS}</svg>`
    favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
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
    primaryPresetId,
    presetColors,
    toggleThemeMode,
    toggleThemeModeWithTransition,
    setThemeModeWithTransition,
    setThemeMode,
    setPrimaryPreset,
  }
})
