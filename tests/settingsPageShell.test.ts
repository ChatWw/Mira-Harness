// @vitest-environment happy-dom
import { createApp, defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsPageShell from '../src/pages/backend/settings/components/SettingsPageShell.vue'

vi.mock('../src/layouts/components/WindowsTitlebar.vue', () => ({ default: defineComponent(() => () => null) }))
vi.mock('../src/pages/backend/settings/components/SettingsSiderMenu.vue', () => ({ default: defineComponent(() => () => null) }))

const mounted: Array<() => void> = []
afterEach(() => mounted.splice(0).forEach(cleanup => cleanup()))
describe('settings page title visibility', () => {
  it.each([undefined, true, false])('shows the supplied page title unless explicitly hidden (%s)', showTitle => {
    const container = document.createElement('div'); document.body.append(container)
    const app = createApp({ render: () => h(SettingsPageShell, { title: '键盘快捷键', ...(showTitle === undefined ? {} : { showTitle }) }, { default: () => h('p', '快捷键内容') }) })
    app.mount(container); mounted.push(() => { app.unmount(); container.remove() })
    expect(container.querySelector('h1')?.textContent).toBe(showTitle === false ? undefined : '键盘快捷键')
    expect(container.textContent).toContain('快捷键内容')
  })
})
