import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import General from '../src/pages/backend/general/index.vue'
import { platformPreferences } from '../src/config/runtime'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'

const host = vi.hoisted(() => ({ api: undefined as any, error: vi.fn() }))
vi.mock('@/platform', async () => {
  const { platformPreferences } = await import('../src/config/runtime')
  return { getPlatformApi: () => host.api, getPreference: (key: string, fallback: unknown) => platformPreferences[key] ?? fallback }
})
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: { error: host.error } }))
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('main', slots.default?.()) } }))
vi.mock('../src/pages/backend/appearance/components/AppearanceSettings.vue', () => ({ default: { render: () => null } }))
const Page = withVueClientRender(General, new URL('../src/pages/backend/general/index.vue', import.meta.url))
const components = Object.fromEntries(['ElSelect', 'ElOption', 'ElSwitch', 'ElButton', 'ElRadioGroup', 'ElRadioButton'].map(name => [name, defineComponent({ inheritAttrs: false, setup: (_: unknown, { attrs, slots }) => () => h(name, attrs, slots.default?.()) })]))
const mounted: { unmount(): void }[] = []
async function drain() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick() } }
function mount() {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(Page, {}, components); mounted.push(app)
  const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
  const find = (type: string, label: string) => renderer.all().find(node => node.type === type && (node.props['aria-label'] === label || text(node) === label))!
  return { renderer, text: () => text(renderer.root), find, change: async (type: string, label: string, value: unknown) => { (find(type, label).props['onUpdate:modelValue'] as any)(value); await drain() } }
}
beforeEach(() => {
  for (const key of Object.keys(platformPreferences)) delete platformPreferences[key]
  host.error.mockClear()
  host.api = { getSnapshot: vi.fn(async () => ({ preferences: {} })), getNotificationStatus: vi.fn(async () => ({ supported: true, settingsAvailable: true })), savePreference: vi.fn(async () => undefined), openNotificationSettings: vi.fn(async () => undefined) }
  vi.stubGlobal('window', new EventTarget())
})
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); vi.unstubAllGlobals() })

it('places working notification controls above Window, omits Dot, and saves the full preference', async () => {
  const view = mount(); await drain()
  const headings = view.renderer.all().filter(node => node.type === 'h2').map(node => node.text)
  expect(headings).toEqual(['外观', '通知', '窗口']); expect(view.text()).not.toContain('Dot')
  expect(view.find('ElSelect', '轮次完成通知').props['model-value']).toBe('unfocused')
  await view.change('ElSelect', '轮次完成通知', 'always')
  await view.change('ElSwitch', '启用权限通知', false)
  await view.change('ElSwitch', '启用问题通知', false)
  await view.change('ElSelect', '通知提示音', 'silent')
  expect(host.api.savePreference).toHaveBeenLastCalledWith('desktopNotifications', { completion: 'always', permissions: false, questions: false, sound: 'silent' })
  await (view.find('ElButton', '打开系统设置').props.onClick as any)()
  expect(host.api.openNotificationSettings).toHaveBeenCalledOnce()
})

it('keeps the previous value when saving fails and refreshes support after returning from system settings', async () => {
  const view = mount(); await drain()
  host.api.savePreference.mockRejectedValueOnce(new Error('磁盘写入失败'))
  await view.change('ElSelect', '轮次完成通知', 'never')
  expect(view.find('ElSelect', '轮次完成通知').props['model-value']).toBe('unfocused')
  expect(host.error).toHaveBeenCalledWith('磁盘写入失败')
  host.api.getNotificationStatus.mockResolvedValueOnce({ supported: false, settingsAvailable: true })
  window.dispatchEvent(new Event('focus')); await drain()
  expect(view.text()).toContain('系统不支持桌面通知')
  expect(view.find('ElSwitch', '启用问题通知').props.disabled).toBe(true)
})
