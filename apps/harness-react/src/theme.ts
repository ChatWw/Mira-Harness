/** 宿主主题上下文：模式 + 主色/对比色（均可缺省，缺省时用 tokens.css 默认值）。 */
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

/** 把宿主主题写到容器：data-theme 切换深浅，主色/对比色覆盖强调令牌。 */
export function applyHostTheme(container: HTMLElement | null | undefined, context: HostThemeContext) {
  if (!container) return
  container.dataset.theme = context.theme === 'dark' ? 'dark' : 'light'
  if (context.primaryColor) {
    container.style.setProperty('--accent', context.primaryColor)
    container.style.setProperty('--accent-strong', shiftColor(context.primaryColor, context.theme === 'dark' ? 22 : -12))
  } else {
    container.style.removeProperty('--accent')
    container.style.removeProperty('--accent-strong')
  }
  if (context.onPrimary) container.style.setProperty('--on-accent', context.onPrimary)
  else container.style.removeProperty('--on-accent')
}
