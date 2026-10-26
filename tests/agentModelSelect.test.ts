import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import Select from '../src/pages/backend/agents/AgentModelSelect.vue'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'

const ActualSelect = withVueClientRender(Select, new URL('../src/pages/backend/agents/AgentModelSelect.vue', import.meta.url))
const components = Object.fromEntries(['ElDropdown', 'ElDropdownMenu', 'ElDropdownItem', 'AppIcon'].map(name => [name, defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots, expose }) => {
  expose({ handleClose: vi.fn(), handleOpen: vi.fn() })
  return () => h(name, attrs, [slots.default?.(), slots.dropdown?.()])
} })]))
const mounted: Array<{ unmount(): void }> = []
afterEach(() => mounted.splice(0).forEach(app => app.unmount()))
const provider = { id: 'one', name: '供应商 A', endpoint: 'http://localhost:8000', enabled: true, authMode: 'none', models: [{ id: 'vision-model', enabled: true, multimodal: true }, { id: 'off', enabled: false }] }
function setup(props: Record<string, unknown> = {}) {
  const change = vi.fn(), renderer = createVueNodeRenderer()
  const { app } = renderer.mount(ActualSelect, { modelValue: 'inherit', providers: [provider], labelForControl: '选择模型', onChange: change, ...props }, components)
  mounted.push(app)
  renderer.all().filter(node => node.type === 'button').forEach(node => Object.assign(node, { focus: vi.fn() }))
  const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
  return { nodes: renderer.all, text: () => text(renderer.root), change, choose: (value: string) => (renderer.all().find(node => node.type === 'ElDropdown')!.props.onCommand as Function)(value) }
}
describe('provider model menu', () => {
  it('groups available models under their provider and puts inheritance in the footer', () => {
    const view = setup()
    expect(view.text()).toContain('供应商 A'); expect(view.text()).toContain('视觉')
    expect(view.nodes().filter(node => node.type === 'ElDropdownItem').map(node => node.props.command)).toEqual(['one', JSON.stringify(['one', 'vision-model']), 'inherit'])
    view.choose('one'); expect(view.change).not.toHaveBeenCalled()
    view.choose(JSON.stringify(['one', 'vision-model'])); expect(view.change).toHaveBeenCalledExactlyOnceWith(JSON.stringify(['one', 'vision-model']))
  })
  it('shows the model name on the trigger, marks the selection and emits inheritance', () => {
    const key = JSON.stringify(['one', 'vision-model']), view = setup({ modelValue: key })
    const current = view.nodes().find(node => node.type === 'ElDropdownItem' && node.props.command === key)!
    expect(current.props['aria-current']).toBe('true')
    expect(view.nodes().find(node => node.type === 'button')!.props.title).toBe('vision-model')
    view.choose('inherit'); expect(view.change).toHaveBeenCalledWith('inherit')
  })
  it('keeps missing models visible and rejects disabled or unavailable choices', () => {
    const view = setup({ modelValue: 'missing', unavailableLabel: '旧模型', providers: [provider, { ...provider, id: 'off-provider', enabled: false }] })
    expect(view.text()).toContain('不可用 · 旧模型')
    expect(view.nodes().filter(node => node.type === 'ElDropdownItem' && node.props.disabled !== undefined)).toHaveLength(1)
    view.choose(JSON.stringify(['one', 'off'])); view.choose(JSON.stringify(['off-provider', 'vision-model']))
    expect(view.change).not.toHaveBeenCalled()
    view.choose('inherit'); expect(view.change).toHaveBeenCalledWith('inherit')
    const disabled = setup({ disabled: true }); disabled.choose(JSON.stringify(['one', 'vision-model'])); expect(disabled.change).not.toHaveBeenCalled()
  })
})
