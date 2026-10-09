/** 宿主主题上下文：模式 + 主色/对比色（均可缺省，缺省时用令牌默认值）。 */
export interface HostThemeContext {
  theme: string
  primaryColor?: string
  onPrimary?: string
}

/** 工作台只跟随宿主浅/深色，使用 Mira 的固定中性控件主题。 */
export function applyHostTheme(container: HTMLElement | null | undefined, context: HostThemeContext) {
  const dark = context.theme === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  if (container) container.dataset.theme = dark ? 'dark' : 'light'
  const target = container ?? document.documentElement
  for (const property of ['--color-brand', '--accent', '--accent-strong', '--on-accent']) target.style.removeProperty(property)
}
