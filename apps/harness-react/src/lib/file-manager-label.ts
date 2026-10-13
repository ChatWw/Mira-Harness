export function fileManagerLabel() {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform
  return /Mac/i.test(platform) ? 'Finder' : /Win/i.test(platform) ? '文件资源管理器' : '文件管理器'
}
