import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import Page from '../src/pages/backend/promptCommands/index.vue'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'
import type { MiraPromptCommandItem } from '../src/config/miraPromptCommands'

const host = vi.hoisted(() => ({ api: undefined as any, route: { query: {} as Record<string, string> }, leave: undefined as undefined | (() => Promise<boolean>), confirm: vi.fn(async () => undefined) }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api }))
vi.mock('vue-router', () => ({ useRoute: () => host.route, onBeforeRouteLeave: (guard: () => Promise<boolean>) => { host.leave = guard } }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: host.confirm } }))
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('main', slots.default?.()) } }))
const ActualPage = withVueClientRender(Page, new URL('../src/pages/backend/promptCommands/index.vue', import.meta.url))
const passthrough = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const components = Object.fromEntries(['ElSelect', 'ElOption', 'ElButton', 'ElTag', 'ElForm', 'ElFormItem', 'ElInput', 'AppIcon'].map(name => [name, passthrough(name)]))
const mounted: Array<{ unmount(): void }> = []
const command = (scope: 'global' | 'project' = 'global'): MiraPromptCommandItem => ({ id: `${scope}:review`, scope, name: 'review', description: '真实命令', revision: 'revision-1' })
async function drain() { for (let index = 0; index < 10; index++) { await Promise.resolve(); await nextTick() } }
function setup() {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(ActualPage, {}, components); mounted.push(app)
  const find = (predicate: (node: VueTestNode) => boolean) => { const value = renderer.all().find(predicate); if (!value) throw new Error('Missing real settings control'); return value }
  const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
  const click = async (label: string) => { const node = find(node => node.type === 'ElButton' && (node.props['aria-label'] === label || text(node) === label)); await (node.props.onClick as () => Promise<void>)(); await drain() }
  const input = async (label: string, value: string) => { const node = find(node => node.type === 'ElInput' && node.props['aria-label'] === label); (node.props['onUpdate:modelValue'] as (value: string) => void)(value); await drain() }
  return { renderer, click, input, find, text: () => text(renderer.root), app }
}
beforeEach(() => {
  host.route.query = {}; host.confirm.mockReset(); host.confirm.mockResolvedValue(undefined)
  host.api = { listHarnessProjects: vi.fn(async () => [{ id: 'project-a', name: 'Project A' }]), promptCommands: {
    list: vi.fn(async () => [command()]), read: vi.fn(async () => ({ command: command(), source: '原始提示词' })),
    save: vi.fn(async () => ({ ...command(), revision: 'revision-2' })), delete: vi.fn(async () => undefined),
  } }
})
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()) })

describe('real custom-command settings controls', () => {
  it('creates full Markdown in the selected project using a plain request and refreshes after save', async () => {
    host.route.query = { project: 'project-a' }; host.api.promptCommands.list.mockResolvedValue([])
    const view = setup(); await drain(); await view.click('新建命令')
    await view.input('命令名称', 'new-review'); await view.input('命令 Markdown 提示词', '---\ndescription: 审查\n---\n$ARGUMENTS')
    await view.click('保存命令')
    expect(host.api.promptCommands.save).toHaveBeenCalledExactlyOnceWith({ scope: 'project', name: 'new-review', source: '---\ndescription: 审查\n---\n$ARGUMENTS', projectId: 'project-a' })
    expect(host.api.promptCommands.list).toHaveBeenLastCalledWith({ projectId: 'project-a' })
    expect(view.text()).toContain('命令已保存'); expect(view.renderer.all().some(node => node.props['aria-label'] === '命令编辑器')).toBe(false)
  })

  it('retains edited Markdown and original revision after a save conflict for a safe retry', async () => {
    const view = setup(); await drain(); await view.click('编辑 review'); await view.input('命令 Markdown 提示词', '未保存修改')
    host.api.promptCommands.save.mockRejectedValueOnce(new Error("Error invoking remote method 'platform:prompt-commands': Error: 命令已被其他程序修改，请重新读取后再保存"))
    await view.click('保存命令')
    expect(view.text()).toContain('命令已被其他程序修改')
    expect(view.text()).not.toMatch(/Error invoking remote method|platform:prompt-commands/)
    expect(view.find(node => node.props['aria-label'] === '命令 Markdown 提示词').props.modelValue).toBe('未保存修改')
    await view.click('保存命令')
    expect(host.api.promptCommands.save.mock.calls[1]).toEqual([{ scope: 'global', name: 'review', source: '未保存修改', expectedRevision: 'revision-1' }])
  })

  it('keeps unsaved content when project switching or route leaving is cancelled and deletes only with revision', async () => {
    const view = setup(); await drain(); await view.click('编辑 review'); await view.input('命令 Markdown 提示词', '保留草稿')
    host.confirm.mockRejectedValueOnce(new Error('cancel'))
    await (view.find(node => node.props['aria-label'] === '命令作用范围').props.onChange as (value: string) => Promise<void>)('project-a'); await drain()
    expect(host.api.promptCommands.list).toHaveBeenCalledTimes(1)
    expect(view.find(node => node.props['aria-label'] === '命令 Markdown 提示词').props.modelValue).toBe('保留草稿')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); expect(await host.leave?.()).toBe(false)
    await view.click('取消'); await view.click('删除 review')
    expect(host.api.promptCommands.delete).toHaveBeenCalledExactlyOnceWith({ scope: 'global', name: 'review', expectedRevision: 'revision-1' })
  })
})
