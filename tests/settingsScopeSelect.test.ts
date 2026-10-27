import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import Select from '../src/pages/backend/settings/components/SettingsScopeSelect.vue'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'

const ActualSelect = withVueClientRender(Select, new URL('../src/pages/backend/settings/components/SettingsScopeSelect.vue', import.meta.url))
const components = Object.fromEntries(['ElDropdown', 'ElDropdownMenu', 'ElDropdownItem', 'AppIcon'].map(name => [name, defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(name, attrs, [slots.default?.(), slots.dropdown?.()]) })]))
const mounted: Array<{ unmount(): void }> = []
afterEach(() => mounted.splice(0).forEach(app => app.unmount()))
function setup(props: Record<string, unknown> = {}) {
  const update = vi.fn(), renderer = createVueNodeRenderer()
  const { app } = renderer.mount(ActualSelect, { modelValue: 'global', 'onUpdate:modelValue': update, ...props }, components)
  mounted.push(app)
  for (const node of renderer.all().filter(node => node.type === 'button')) Object.assign(node, { focus: vi.fn() })
  const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
  return { nodes: renderer.all, text: () => text(renderer.root), update, choose: (value: string) => (renderer.all().find(node => node.type === 'ElDropdown')!.props.onCommand as Function)(value) }
}
describe('settings scope selector', () => {
  it('only offers global by default and marks it current', () => {
    const view = setup(), options = view.nodes().filter(node => node.type === 'ElDropdownItem')
    expect(options).toHaveLength(1)
    expect(options[0]!.props).toMatchObject({ command: 'global', 'aria-current': 'true' })
    expect(view.text()).not.toContain('工作区')
    view.choose('global'); expect(view.update).not.toHaveBeenCalled()
  })
  it('uses workspace names, groups them and emits the selected identity', () => {
    const view = setup({ modelValue: 'workspace-1', workspaces: [{ id: 'workspace-1', name: 'Mira-Harness' }, { id: 'workspace-2', name: '资料相关' }] })
    expect(view.nodes().find(node => node.type === 'button')!.props['aria-label']).toBe('设置范围：Mira-Harness')
    expect(view.text()).toContain('工作区')
    const options = view.nodes().filter(node => node.type === 'ElDropdownItem')
    expect(options.map(node => node.props.command)).toEqual(['global', 'workspace-1', 'workspace-2'])
    expect(options[1]!.props['aria-current']).toBe('true')
    view.choose('workspace-2'); expect(view.update).toHaveBeenLastCalledWith('workspace-2')
    view.choose('global'); expect(view.update).toHaveBeenLastCalledWith('global')
    expect(view.text()).not.toContain('本机')
  })
  it('does not emit unavailable or disabled selections', () => {
    const view = setup(); view.choose('missing'); expect(view.update).not.toHaveBeenCalled()
    const disabled = setup({ disabled: true, workspaces: [{ id: 'workspace', name: '工作区' }] })
    disabled.choose('workspace'); expect(disabled.update).not.toHaveBeenCalled()
    expect(disabled.nodes().find(node => node.type === 'button')!.props.disabled).toBe(true)
  })
  it('offers plugin scope outside the workspace group and uses its label and icon', () => {
    const view = setup({ modelValue: 'plugins', extraScopes: [{ id: 'plugins', name: '插件', icon: 'lucide:blocks' }], workspaces: [{ id: 'project-a', name: 'Project A' }] })
    expect(view.nodes().find(node => node.type === 'button')!.props['aria-label']).toBe('设置范围：插件')
    const options = view.nodes().filter(node => node.type === 'ElDropdownItem')
    expect(options.map(node => node.props.command)).toEqual(['global', 'plugins', 'project-a'])
    expect(options[1]!.props['aria-current']).toBe('true')
    expect(view.nodes().find(node => node.type === 'button')!.children[0]!.props.name).toBe('lucide:blocks')
    const global = setup({ extraScopes: [{ id: 'plugins', name: '插件', icon: 'lucide:blocks' }] })
    global.choose('plugins'); expect(global.update).toHaveBeenCalledExactlyOnceWith('plugins')
  })
})
