/** ZCode's workbench bindings, dispatched through Mira's existing owners. */
export function isMiraPrimaryModifier(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>, platform = typeof navigator === 'undefined' ? '' : navigator.platform) {
  // macOS 的 Ctrl 留给文本编辑和显式 Ctrl 命令；主快捷键沿 ZCode 按平台隔离。
  return platform ? /Mac/i.test(platform) ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey : event.metaKey !== event.ctrlKey
}

export function miraPrimaryKeyShortcuts(...keys: string[]) {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform
  const modifiers = platform ? [/Mac/i.test(platform) ? 'Meta' : 'Control'] : ['Meta', 'Control']
  return keys.flatMap(key => modifiers.map(modifier => `${modifier}+${key}`)).join(' ')
}

export function miraShortcutLabel(key: string, platform = typeof navigator === 'undefined' ? '' : navigator.platform) {
  return /Mac/i.test(platform) ? `⌘${key.replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥')}` : `Ctrl+${key}`
}

export function miraWorkbenchShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'repeat' | 'isComposing' | 'keyCode' | 'defaultPrevented'>): 'theme' | 'project' | undefined {
  if (event.defaultPrevented || !isMiraPrimaryModifier(event) || event.altKey || event.repeat || event.isComposing || event.keyCode === 229) return
  const key = event.key.toLowerCase()
  if (event.shiftKey && key === 'l') return 'theme'
  if (!event.shiftKey && key === 'o') return 'project'
}

/** Split display labels into individual keycaps on both desktop platforms. */
export function miraShortcutKeys(label: string): string[] {
  return label.replace(/⌘/g, '⌘+').replace(/⇧/g, 'Shift+').replace(/⌥/g, '⌥+').replace(/⌃/g, 'Ctrl+').split('+').filter(Boolean)
}
