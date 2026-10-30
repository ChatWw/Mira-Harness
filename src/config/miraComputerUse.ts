/** Public summaries for the bundled platform computer backends. Never infer desktop tools from arbitrary MCP names. */
export const MIRA_COMPUTER_SERVER_ID = 'plugin:computer-use@mira-builtin:desktop'

export type MiraComputerPermission = 'screen-recording' | 'accessibility'
export interface MiraComputerStatus {
  platform: string
  engineAvailable: boolean
  cursorAvailable: boolean
  screenRecording: boolean | null
  accessibility: boolean | null
  showCursor: boolean
  error?: string
}
export interface MiraComputerSettingsHost {
  getComputerUseStatus(): Promise<MiraComputerStatus>
  setComputerUseCursor(showCursor: boolean): Promise<void>
  openComputerUsePermission(permission: MiraComputerPermission): Promise<void>
}

export interface MiraComputerUseStep {
  action: string
  target: string
  steps?: string[]
}

const ACTIONS: Record<string, string> = {
  health: '检查电脑控制', snapshot: '观察窗口', screenshot: '截图', accessibility_tree: '读取界面',
  find: '查找控件', element_info: '查看控件', ocr: '识别文字', observe: '查看编号界面',
  keypress: '按键', focus: '聚焦控件', invoke: '操作控件', activate_window: '切换窗口',
  close_window: '关闭窗口', move_window: '调整窗口', wait: '等待', wait_for: '检查操作结果',
  move: '移动鼠标', tools: '查看电脑控制能力',
  list_apps: '查看应用', list_windows: '查看窗口', get_window_state: '观察窗口',
  get_desktop_state: '观察桌面', get_accessibility_tree: '读取界面', verify_state: '检查操作结果',
  launch_app: '打开应用', kill_app: '关闭应用', bring_to_front: '切换窗口', set_window_frame: '调整窗口',
  invoke_menu: '选择菜单', click: '点击', double_click: '双击', right_click: '右键点击',
  drag: '拖动', type_text: '输入文字', press_key: '按键', hotkey: '快捷键', set_value: '填写控件',
  scroll: '滚动', move_cursor: '移动鼠标', get_cursor_position: '查看鼠标位置', get_screen_size: '查看屏幕尺寸',
  clipboard_read: '读取剪贴板', clipboard_write: '写入剪贴板', zoom: '放大查看',
  run_steps: '执行电脑操作步骤', run_script: '执行电脑操作脚本', replay_trajectory: '重放电脑操作',
  browser_navigate: '打开网页', browser_click: '点击网页', browser_type: '填写网页',
  get_browser_state: '观察网页', start_session: '开始电脑控制', end_session: '结束电脑控制',
}

export function miraComputerUseStep(name: string, args: Record<string, unknown> = {}): MiraComputerUseStep {
  name = name.replace(/^windows_computer_use_/, '').replace(/^desktop_/, '')
  name = ({ windows: 'list_windows', apps: 'list_apps', type: 'type_text', key: 'keypress', launch: 'launch_app', find_text: 'ocr' } as Record<string, string>)[name] ?? name
  const action = name === 'click' && args.button === 'right' ? '右键点击' : ACTIONS[name] ?? `电脑控制 · ${name}`
  const parts: string[] = []
  const destination = args.app ?? args.name ?? args.window ?? args.window_id ?? args.windowTitle ?? args.processId ?? args.pid ?? args.nativeWindowHandle
  if (destination !== undefined) parts.push(typeof destination === 'number' ? `窗口 ${destination}` : String(destination))
  const target = args.target
  if (target && typeof target === 'object') {
    const value = target as Record<string, unknown>
    if (value.name || value.role) parts.push(String(value.name ?? value.role))
  } else if (typeof target === 'string') parts.push(target)
  if (args.elementId) parts.push(`控件 ${args.elementId}`)
  if (args.index) parts.push(`编号 ${args.index}`)
  const lookup = ['find', 'ocr', 'click', 'wait_for'].includes(name) ? args.query ?? args.text : args.filter
  if (typeof lookup === 'string') parts.push(lookup)
  if (args.element_token) parts.push(`控件 ${args.element_token}`)
  if (typeof args.x === 'number' && typeof args.y === 'number') parts.push(`(${args.x}, ${args.y})`)
  if (name === 'drag') {
    const path = Array.isArray(args.path) ? args.path as Array<{ x: number; y: number }> : undefined
    const first = path?.[0], last = path?.[path.length - 1]
    parts.push(`(${first?.x ?? args.x1}, ${first?.y ?? args.y1}) → (${last?.x ?? args.x2}, ${last?.y ?? args.y2})`)
  }
  if (name === 'type_text' || name === 'set_value' || name === 'browser_type') {
    const text = args.text ?? args.value
    if (typeof text === 'string') parts.push(`${Array.from(text).length} 个字符`)
  }
  if (args.keycode !== undefined) parts.push([...(Array.isArray(args.flags) ? args.flags : []), `键码 ${args.keycode}`].join(' + '))
  if (args.key) parts.push([...(Array.isArray(args.modifiers) ? args.modifiers : []), args.key].join(' + '))
  if (Array.isArray(args.keys)) parts.push(args.keys.join(' + '))
  if (args.direction) parts.push(String(args.direction))
  if (name === 'scroll' && (args.dy !== undefined || args.deltaY !== undefined)) parts.push(`纵向 ${args.dy ?? args.deltaY}`)
  if (args.url) parts.push(String(args.url))
  if (name === 'launch_app' && !destination && !target) parts.push(String(args.path ?? args.launch_path ?? args.bundle_id ?? '应用'))
  if (name === 'invoke_menu' && Array.isArray(args.path)) parts.push(args.path.join(' → '))
  const steps = name === 'run_steps' && Array.isArray(args.steps) ? args.steps.map(step => {
    const value = step && typeof step === 'object' ? step as Record<string, unknown> : {}
    const summary = miraComputerUseStep(String(value.tool ?? 'unknown'), value.args && typeof value.args === 'object' ? value.args as Record<string, unknown> : value)
    return [summary.action, summary.target].filter(Boolean).join(' · ')
  }) : undefined
  return { action, target: parts.join(' · ').slice(0, 500), ...(steps ? { steps } : {}) }
}
