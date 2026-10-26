// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ssrContextKey, type App } from 'vue'
import ElementPlus from 'element-plus'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import Select from '../src/pages/backend/agents/AgentModelSelect.vue'
import { withVueClientRender } from './helpers/vueNodeRenderer'

let app: App | undefined
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = '' })

it('closes the real Element Plus provider submenu with Escape and ArrowLeft without a render error', async () => {
  const errors = vi.fn(), changes = vi.fn(), root = document.createElement('div')
  document.body.append(root)
  const Actual = withVueClientRender(Select, pathToFileURL(resolve('src/pages/backend/agents/AgentModelSelect.vue')))
  app = createApp({ render: () => h(Actual, { modelValue: 'inherit', labelForControl: '模型', providers: [{ id: 'test', name: '供应商', endpoint: 'http://localhost:8000', authMode: 'none', enabled: true, models: [{ id: 'model', enabled: true }] }], onChange: changes }) })
  app.provide(ssrContextKey, {}); app.use(ElementPlus); app.component('AppIcon', { render: () => h('span') }); app.config.errorHandler = errors
  app.mount(root)
  root.querySelector<HTMLButtonElement>('button')!.click()
  await vi.waitFor(() => expect(document.querySelector('.agent-model-provider-trigger')).not.toBeNull())
  for (const key of ['Escape', 'ArrowLeft']) {
    document.querySelector<HTMLElement>('.agent-model-provider-trigger')!.click()
    await vi.waitFor(() => expect(document.querySelector('.agent-model-submenu .el-dropdown-menu')).not.toBeNull())
    await nextTick()
    document.querySelector('.agent-model-submenu .el-dropdown-menu')!.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }))
    await nextTick()
    expect(errors).not.toHaveBeenCalled()
  }
  expect(changes).not.toHaveBeenCalled()
})
