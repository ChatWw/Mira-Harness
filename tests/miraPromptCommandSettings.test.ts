import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import Page from '../src/pages/backend/promptCommands/index.vue'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'
import type { MiraPromptCommandItem } from '../src/config/miraPromptCommands'

const host = vi.hoisted(() => ({ api: undefined as any, route: { query: {} as Record<string, string> }, leave: undefined as undefined | (() => Promise<boolean>), confirm: vi.fn(async () => undefined) }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api }))
vi.mock('vue-router', () => ({ useRoute: () => host.route, onBeforeRouteLeave: (guard: () => Promise<boolean>) => { host.leave = guard } }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: host.confirm } }))
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('main', [slots.titlebar?.(), slots.default?.()]) } }))
vi.mock('../src/pages/backend/settings/components/SettingsScopeSelect.vue', () => ({ default: { props: ['modelValue', 'workspaces', 'disabled'], emits: ['update:modelValue'], setup: (props: any, { emit }: any) => () => h('ElSelect', { 'aria-label': '命令作用范围', 'model-value': props.modelValue, disabled: props.disabled, onChange: (value: string) => emit('update:modelValue', value) }) } }))
const ActualPage = withVueClientRender(Page, new URL('../src/pages/backend/promptCommands/index.vue', import.meta.url))
const passthrough = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const components = Object.fromEntries(['ElSelect', 'ElOption', 'ElButton', 'ElTag', 'ElForm', 'ElFormItem', 'ElInput', 'ElDropdown', 'ElDropdownMenu', 'ElDropdownItem', 'AppIcon'].map(name => [name, passthrough(name)]))
const mounted: Array<{ unmount(): void }> = []
const command = (scope: 'global' | 'project' = 'global'): MiraPromptCommandItem => ({ id: `${scope}:review`, scope, name: 'review', description: '真实命令', revision: 'revision-1' })
async function drain() { for (let index = 0; index < 10; index++) { await Promise.resolve(); await nextTick() } }
function setup() {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(ActualPage, {}, components); mounted.push(app)
  const find = (predicate: (node: VueTestNode) => boolean) => { const value = renderer.all().find(predicate); if (!value) throw new Error('Missing real settings control'); return value }
  const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
  const click = async (label: string) => { const node = find(node => ['ElButton', 'button'].includes(node.type) && (node.props['aria-label'] === label || text(node) === label)); await (node.props.onClick as () => Promise<void>)(); await drain() }
  const input = async (label: string, value: string) => { const node = find(node => ['ElInput', 'input'].includes(node.type) && node.props['aria-label'] === label); if (node.type === 'input') (node.props.onInput as any)({ target: { value } }); else (node.props['onUpdate:modelValue'] as (value: string) => void)(value); await drain() }
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
  it.each(['create', 'edit'])('uses a secondary page for %s and restores the directory on cancel', async mode => {
    const view = setup(); await drain(); await view.click(mode === 'create' ? '新建命令' : '编辑 review')
    expect(view.renderer.all().some(node => node.props.class === 'prompt-commands__toolbar' || node.props.class === 'prompt-commands__list')).toBe(false)
    expect(view.renderer.all().some(node => node.props['aria-label'] === '搜索命令' || node.props['aria-label'] === '重新加载命令')).toBe(false)
    expect(view.text()).toContain(mode === 'create' ? '新建命令' : '编辑命令')
    const breadcrumb = view.find(node => node.props['aria-label'] === '页面位置')
    expect(breadcrumb.children.map(node => node.text).join('')).toContain(mode === 'create' ? '新建命令' : 'review')
    expect(view.find(node => node.props['aria-label'] === '命令作用范围').props.disabled).toBe(mode === 'edit')
    await view.click('取消')
    expect(view.renderer.all().some(node => node.props['aria-label'] === '搜索命令')).toBe(true)
    expect(view.text()).toContain('/review'); expect(host.api.promptCommands.save).not.toHaveBeenCalled()
  })
  it('shows an actionable empty state and searches the directory', async () => {
    host.api.promptCommands.list.mockResolvedValue([])
    const empty = setup(); await drain(); expect(empty.text()).toContain('尚未安装命令')
    expect(empty.renderer.all().filter(node => node.props['aria-label'] === '新建命令')).toHaveLength(2)
    host.api.promptCommands.list.mockResolvedValue([command()]); await empty.click('重新加载命令')
    await empty.input('搜索命令', '真实命令'); expect(empty.text()).toContain('/review')
    await empty.input('搜索命令', 'no-match'); expect(empty.text()).toContain('没有找到匹配的命令')
    expect(empty.renderer.all().filter(node => node.props['aria-label'] === '新建命令')).toHaveLength(1)
  })
  it('creates empty structured fields and preserves them when selecting the destination', async () => {
    const view = setup(); await drain(); await view.click('新建命令')
    for (const label of ['命令名称', '命令说明', '命令参数提示', '命令提示词']) expect(view.find(node => node.props['aria-label'] === label).props.modelValue).toBe('')
    expect(view.find(node => node.props['aria-label'] === '保存命令').props.disabled).toBe(true)
    await view.input('命令名称', 'team:review'); await view.input('命令说明', '代码审查'); await view.input('命令参数提示', '<路径>'); await view.input('命令提示词', '审查 $ARGUMENTS')
    await (view.find(node => node.props['aria-label'] === '命令作用范围').props.onChange as any)('project-a'); await drain()
    await view.click('保存命令')
    expect(host.api.promptCommands.save).toHaveBeenCalledExactlyOnceWith({ scope: 'project', projectId: 'project-a', name: 'team:review', source: '---\ndescription: 代码审查\nargument-hint: <路径>\n---\n审查 $ARGUMENTS' })
    expect(host.api.promptCommands.list).toHaveBeenLastCalledWith({ projectId: 'project-a' })
  })
  it('keeps metadata comments and body lossless through modes and edits the original project revision', async () => {
    const source = '---\r\n# keep this\r\ndescription: 旧说明\r\ncustom: preserved\r\n---\r\n\r\n原文 $ARGUMENTS\r\n'
    host.route.query = { project: 'project-a' }; host.api.promptCommands.list.mockResolvedValue([command('project')])
    host.api.promptCommands.read.mockResolvedValue({ command: command('project'), source })
    const view = setup(); await drain(); await view.click('编辑 review')
    await view.click('编辑 Markdown'); expect(view.find(node => node.props['aria-label'] === '命令 Markdown 提示词').props.modelValue).toBe(source)
    await view.click('返回表单'); expect(view.find(node => node.props['aria-label'] === '保存命令').props.disabled).toBe(true)
    await view.input('命令说明', '新说明'); await view.click('保存命令')
    expect(host.api.promptCommands.save).toHaveBeenCalledExactlyOnceWith({ scope: 'project', projectId: 'project-a', name: 'review', expectedRevision: 'revision-1', source: source.replace('旧说明', '新说明') })
  })
  it('retains malformed Markdown for repair and keeps the draft when returning to the form fails', async () => {
    host.api.promptCommands.read.mockResolvedValue({ command: command(), source: '---\ndescription: [invalid\n---\n正文' })
    const view = setup(); await drain(); await view.click('编辑 review')
    expect(view.find(node => node.props['aria-label'] === '命令 Markdown 提示词').props.modelValue).toContain('[invalid')
    await view.click('返回表单'); expect(view.text()).toContain('配置无法用表单表示')
    expect(view.find(node => node.props['aria-label'] === '命令 Markdown 提示词').props.modelValue).toContain('[invalid')
    expect(host.api.promptCommands.save).not.toHaveBeenCalled()
  })
  it('imports a Markdown file as a reviewable new draft without writing until save', async () => {
    const view = setup(); await drain()
    const input = view.find(node => node.props['aria-label'] === '导入命令文件')
    await (input.props.onChange as any)({ target: { value: 'review.md', files: [{ name: 'imported.md', size: 20, text: async () => '导入的提示词' }] } }); await drain()
    expect(view.find(node => node.props['aria-label'] === '命令名称').props.modelValue).toBe('imported')
    expect(view.find(node => node.props['aria-label'] === '命令提示词').props.modelValue).toBe('导入的提示词')
    expect(host.api.promptCommands.save).not.toHaveBeenCalled()
    await view.click('保存命令'); expect(host.api.promptCommands.save).toHaveBeenCalledExactlyOnceWith({ scope: 'global', name: 'imported', source: '导入的提示词' })
  })
  it('rejects oversized import files before reading their content', async () => {
    const view = setup(); await drain(); const text = vi.fn()
    await (view.find(node => node.props['aria-label'] === '导入命令文件').props.onChange as any)({ target: { value: 'large.md', files: [{ name: 'large.md', size: 256 * 1024 + 1, text }] } }); await drain()
    expect(view.text()).toContain('不能超过 256KB'); expect(text).not.toHaveBeenCalled()
    expect(host.api.promptCommands.save).not.toHaveBeenCalled()
    expect(view.renderer.all().some(node => node.props['aria-label'] === '命令编辑器')).toBe(false)
  })
  it('creates full Markdown in the selected project using a plain request and refreshes after save', async () => {
    host.route.query = { project: 'project-a' }; host.api.promptCommands.list.mockResolvedValue([])
    const view = setup(); await drain(); await view.click('新建命令')
    await view.click('编辑 Markdown')
    await view.input('命令名称', 'new-review'); await view.input('命令 Markdown 提示词', '---\ndescription: 审查\n---\n$ARGUMENTS')
    await view.click('保存命令')
    expect(host.api.promptCommands.save).toHaveBeenCalledExactlyOnceWith({ scope: 'project', name: 'new-review', source: '---\ndescription: 审查\n---\n$ARGUMENTS', projectId: 'project-a' })
    expect(host.api.promptCommands.list).toHaveBeenLastCalledWith({ projectId: 'project-a' })
    expect(view.text()).toContain('命令已保存'); expect(view.renderer.all().some(node => node.props['aria-label'] === '命令编辑器')).toBe(false)
  })

  it('retains edited Markdown and original revision after a save conflict for a safe retry', async () => {
    const view = setup(); await drain(); await view.click('编辑 review'); await view.click('编辑 Markdown'); await view.input('命令 Markdown 提示词', '未保存修改')
    host.api.promptCommands.save.mockRejectedValueOnce(new Error("Error invoking remote method 'platform:prompt-commands': Error: 命令已被其他程序修改，请重新读取后再保存"))
    await view.click('保存命令')
    expect(view.text()).toContain('命令已被其他程序修改')
    expect(view.text()).not.toMatch(/Error invoking remote method|platform:prompt-commands/)
    expect(view.find(node => node.props['aria-label'] === '命令 Markdown 提示词').props.modelValue).toBe('未保存修改')
    await view.click('保存命令')
    expect(host.api.promptCommands.save.mock.calls[1]).toEqual([{ scope: 'global', name: 'review', source: '未保存修改', expectedRevision: 'revision-1' }])
  })

  it('keeps unsaved content when project switching or route leaving is cancelled and deletes only with revision', async () => {
    const view = setup(); await drain(); await view.click('编辑 review'); await view.click('编辑 Markdown'); await view.input('命令 Markdown 提示词', '保留草稿')
    expect(view.find(node => node.props['aria-label'] === '命令作用范围').props.disabled).toBe(true)
    host.confirm.mockRejectedValueOnce(new Error('cancel'))
    await view.click('自定义命令')
    expect(host.api.promptCommands.list).toHaveBeenCalledTimes(1)
    expect(view.find(node => node.props['aria-label'] === '命令 Markdown 提示词').props.modelValue).toBe('保留草稿')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); expect(await host.leave?.()).toBe(false)
    await view.click('取消'); await view.click('删除 review')
    expect(host.api.promptCommands.delete).toHaveBeenCalledExactlyOnceWith({ scope: 'global', name: 'review', expectedRevision: 'revision-1' })
  })
})
