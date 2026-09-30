/** 宿主主题上下文：模式 + 主色/对比色（均可缺省，缺省时用令牌默认值）。 */
export interface HostThemeContext {
  theme: string
  primaryColor?: string
  onPrimary?: string
}

function shiftColor(color: string, amount: number): string {
  const hex = color.replace('#', '')
  const num = parseInt(hex, 16)
  if (Number.isNaN(num)) return color
  const r = Math.max(0, Math.min(255, (num >> 16) + amount))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amount))
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** 把宿主主题写到文档：<html> 切换 .dark（驱动 ZCode 令牌层），主色覆盖 --color-brand。 */
export function applyHostTheme(container: HTMLElement | null | undefined, context: HostThemeContext) {
  const dark = context.theme === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  if (container) container.dataset.theme = dark ? 'dark' : 'light'
  const target = container ?? document.documentElement
  if (context.primaryColor) {
    target.style.setProperty('--color-brand', context.primaryColor)
    target.style.setProperty('--accent', context.primaryColor)
    target.style.setProperty('--accent-strong', shiftColor(context.primaryColor, dark ? 22 : -12))
  } else {
    target.style.removeProperty('--color-brand')
    target.style.removeProperty('--accent')
    target.style.removeProperty('--accent-strong')
  }
  if (context.onPrimary) target.style.setProperty('--on-accent', context.onPrimary)
  else target.style.removeProperty('--on-accent')
}
