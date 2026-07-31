export type ThemeColorPreset = {
  id: string
  name: string
  light: string
  dark: string
  lightContrast?: string
  darkContrast?: string
}

export const PRESET_COLORS: ThemeColorPreset[] = [
  { id: 'monochrome', name: '黑白', light: '#080808', dark: '#f3f3f3', lightContrast: '#ffffff', darkContrast: '#080808' },
  { id: 'indigo', name: '靛蓝', light: '#4f46e5', dark: '#4f46e5' },
  { id: 'purple', name: '紫色', light: '#9333ea', dark: '#9333ea' },
  { id: 'blue', name: '蓝色', light: '#0ea5e9', dark: '#0ea5e9' },
  { id: 'cyan', name: '青色', light: '#06b6d4', dark: '#06b6d4' },
  { id: 'green', name: '绿色', light: '#10b981', dark: '#10b981' },
]

export const DEFAULT_PRIMARY_PRESET_ID = 'monochrome'
export const DEFAULT_THEME_MODE = 'light'

export const THEME_STORAGE_KEY = 'cp-theme-mode'
export const PRIMARY_PRESET_STORAGE_KEY = 'cp-primary-preset'
export const LEGACY_PRIMARY_COLOR_STORAGE_KEY = 'cp-primary-color'
