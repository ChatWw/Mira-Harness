import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import Page from '../src/pages/backend/modelConfig/index.vue'
import { ModelConfigStore } from '../electron/storage/modelConfigStore'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'
import type { ModelProviderInput } from '../src/config/harness'
import ModelEditorDialog from '../src/pages/backend/modelConfig/components/ModelEditorDialog.vue'
import ModelCapabilities from '../src/pages/backend/modelConfig/components/ModelCapabilities.vue'
import AiBrandIcon from '../src/components/AiBrandIcon/index.vue'

const host = vi.hoisted(() => ({ api: undefined as any, preferences: {} as Record<string, any>, confirm: vi.fn(async () => undefined), openMenu: vi.fn() }))
vi.mock('vue', async importOriginal => ({ ...await importOriginal<typeof import('vue')>(), vModelText: {}, vModelCheckbox: {} }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api, getPreference: (key: string, fallback: unknown) => host.preferences[key] ?? fallback, savePreference: (key: string, value: unknown) => { host.preferences[key] = value } }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, ElMessageBox: { confirm: host.confirm } }))
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('main', slots.default?.()) } }))
vi.mock('../src/pages/backend/settings/components/SettingsTooltip.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('tooltip', slots.default?.()) } }))
vi.mock('../src/pages/backend/modelConfig/components/ModelCredentials.vue', () => ({ default: { render: () => null } }))
Object.assign(ModelEditorDialog, withVueClientRender(ModelEditorDialog, new URL('../src/pages/backend/modelConfig/components/ModelEditorDialog.vue', import.meta.url)))
Object.assign(ModelCapabilities, withVueClientRender(ModelCapabilities, new URL('../src/pages/backend/modelConfig/components/ModelCapabilities.vue', import.meta.url)))
Object.assign(AiBrandIcon, withVueClientRender(AiBrandIcon, new URL('../src/components/AiBrandIcon/index.vue', import.meta.url)))
const ActualPage = withVueClientRender(Page, new URL('../src/pages/backend/modelConfig/index.vue', import.meta.url))
Object.assign(ActualPage, { directives: { loading: {} } })
const passthrough = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, [slots.default?.(), slots.footer?.()]) })
const components = Object.fromEntries(['ElButton', 'ElButtonGroup', 'ElInput', 'ElSwitch', 'ElSelect', 'ElOption', 'ElDropdownMenu', 'ElDropdownItem', 'ElTooltip', 'AppIcon'].map(name => [name, passthrough(name)]))
Object.assign(components, {
  ElPopover: defineComponent({ props: ['visible'], emits: ['update:visible'], setup: (props, { slots, emit }) => () => h('popover', {}, [h('button', { 'aria-label': '打开头像选择器', onClick: () => emit('update:visible', !props.visible) }, slots.reference?.()), props.visible ? slots.default?.() : null]) }),
  ElDialog: defineComponent({ props: ['modelValue', 'title'], setup: (props, { slots }) => () => props.modelValue ? h('dialog', { title: props.title }, [slots.default?.(), slots.footer?.()]) : null }),
  ElDrawer: defineComponent({ props: ['modelValue', 'title'], emits: ['update:modelValue'], setup: (props, { slots, emit }) => () => props.modelValue ? h('drawer', { title: props.title }, [h('button', { 'aria-label': '关闭同步抽屉', onClick: () => emit('update:modelValue', false) }), slots.header?.({ titleId: 'drawer-title' }), slots.default?.(), slots.footer?.()]) : null }),
  ElDropdown: defineComponent({ setup: (_, { attrs, slots, expose }) => { expose({ handleOpen: host.openMenu, handleClose: vi.fn() }); return () => h('ElDropdown', attrs, slots.dropdown?.()) } }),
})
const mounted: Array<{ unmount(): void }> = []
let database: Database.Database, directory: string, store: ModelConfigStore
const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
const model = { id: 'test', enabled: true, reasoning: true, contextWindow: 128000 }
const original: ModelProviderInput = { id: 'default', providerKey: 'deepseek', slug: 'deepseek', builtin: true, name: '深度求索', endpoint: 'https://api.deepseek.com/v1', authMode: 'api-key', protocol: 'openai-completions', apiKey: 'original-key', enabled: true, models: [model] }
const addInstance = (patch: Partial<ModelProviderInput> = {}) => store.save({ providerKey: 'deepseek', slug: 'deepseek', asInstance: true, id: 'custom', name: '深度求索1', endpoint: 'https://api.deepseek.com', enabled: false, models: [], ...patch })
async function drain() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
function setup() {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(ActualPage, {}, components)
  mounted.push(app)
  const find = (predicate: (node: VueTestNode) => boolean) => { const node = renderer.all().find(predicate); if (!node) throw new Error('Missing model settings control'); return node }
  const click = async (node: VueTestNode) => { await (node.props.onClick as Function)({ currentTarget: {}, stopPropagation() {}, preventDefault() {} }); await drain() }
  const row = (name: string, level = 'provider') => find(node => String(node.props.class).includes(`row--${level}`) && node.children.some(child => child.props.class === 'row__name' && text(child) === name))
  const command = async (value: string) => { await (find(node => node.type === 'ElDropdown').props.onCommand as Function)(value); await drain() }
  const context = async (node: VueTestNode) => { await (node.props.onContextmenu as Function)({ currentTarget: {}, preventDefault() {} }); await drain() }
  const change = async (label: string, value: string) => { (find(node => node.props['aria-label'] === label).props['onUpdate:modelValue'] as Function)(value); await drain() }
  return { all: renderer.all, find, click, row, command, context, change, menuItems: () => renderer.all().filter(node => node.type === 'ElDropdownItem').map(text), children: () => renderer.all().filter(node => String(node.props.class).includes('row--instance')).map(node => text(node.children.find(child => child.props.class === 'row__name')!)) }
}
beforeEach(() => {
  vi.stubGlobal('window', { setTimeout, clearTimeout })
  directory = mkdtempSync(join(tmpdir(), 'mira-model-tree-'))
  database = new Database(':memory:')
  database.exec('CREATE TABLE model_role_bindings (role TEXT PRIMARY KEY, provider_id TEXT, model_id TEXT)')
  store = new ModelConfigStore(database, directory)
  store.save(original)
  host.preferences = { modelProviderExpanded: ['deepseek'] }
  host.confirm.mockClear(); host.openMenu.mockClear()
  vi.mocked(ElMessage.success).mockClear()
  vi.mocked(ElMessage.warning).mockClear(); vi.mocked(ElMessage.error).mockClear()
  host.api = {
    listModelProviders: vi.fn(async () => store.list()), listModelServices: vi.fn(async () => store.services()),
    getModelProviderApiKey: vi.fn(async (id: string) => store.getSecret(id)),
    listModelProviderModels: vi.fn(async () => ({ models: ['test', 'new-model'] })),
    saveModelProvider: vi.fn(async (input: ModelProviderInput) => store.save(structuredClone(input))),
    deleteModelProvider: vi.fn(async (id: string) => store.delete(id)),
    deleteModelService: vi.fn(async (id: string) => store.deleteService(id)),
  }
})
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); database.close(); rmSync(directory, { recursive: true, force: true }); vi.unstubAllGlobals() })

describe('two-level model service tree', () => {
  it('updates the more-settings arrow and expanded state in both directions', async () => {
    const view = setup(); await drain()
    await view.click(view.find(node => node.props.class === 'rail__add'))
    const toggle = () => view.find(node => node.props.class === 'adv__toggle')
    expect(toggle().props['aria-expanded']).toBe(false)
    expect(toggle().children[0].props.name).toBe('ArrowRight')
    await view.click(toggle())
    expect(toggle().props['aria-expanded']).toBe(true)
    expect(toggle().children[0].props.name).toBe('ArrowDown')
    expect(view.all().some(node => node.props.class === 'adv__body')).toBe(true)
    await view.click(toggle())
    expect(toggle().props['aria-expanded']).toBe(false)
    expect(toggle().children[0].props.name).toBe('ArrowRight')
    expect(view.all().some(node => node.props.class === 'adv__body')).toBe(false)
  })

  it.each([['deepseek', 'deepseek'], ['kimi', 'moonshot'], ['bailian', 'alibabacloud']])('applies and saves the %s preset avatar independently of the new provider name', async (key, brand) => {
    const view = setup(); await drain()
    await view.click(view.find(node => node.props.class === 'rail__add'))
    await view.click(view.find(node => node.props.class === 'adv__toggle'))
    const select = view.find(node => node.type === 'ElSelect' && node.props.placeholder === '从 Provider 预设创建…')
    ;(select.props['onUpdate:modelValue'] as Function)(key)
    ;(select.props.onChange as Function)(key); await drain()
    expect(view.find(node => node.props['aria-label'] === '服务商头像预览').children[0].props['data-brand']).toBe(brand)
    const slug = view.find(node => node.type === 'ElInput' && node.props.placeholder === 'siliconflow')
    ;(slug.props['onUpdate:modelValue'] as Function)('presetAvatar')
    ;(slug.props.onInput as Function)('presetAvatar')
    await view.change('服务商名称', '预设创建的服务商')
    await view.click(view.find(node => node.type === 'ElButton' && text(node) === '添加'))
    expect(store.services().find(service => service.id === 'presetAvatar')?.logo).toBe(`lobehub:${brand}`)
    expect(view.row('预设创建的服务商').children.find(node => node.props.class === 'row__logo')?.children[0].props['data-brand']).toBe(brand)
  })

  it('searches and persists a library avatar independently of the custom provider name', async () => {
    const view = setup(); await drain()
    await view.click(view.find(node => node.props.class === 'rail__add'))
    await view.change('服务商名称', '我的聚合平台')
    const slug = view.find(node => node.type === 'ElInput' && node.props.placeholder === 'siliconflow')
    ;(slug.props['onUpdate:modelValue'] as Function)('myicons')
    const endpoint = view.find(node => node.type === 'ElInput' && node.props.placeholder === 'https://api.example.com/v1')
    ;(endpoint.props['onUpdate:modelValue'] as Function)('https://proxy.example/v1')
    await view.click(view.find(node => node.props['aria-label'] === '打开头像选择器'))
    await view.change('搜索内置头像', 'DEEPSEEK')
    expect(view.all().filter(node => node.props.class === 'avatar-picker__option')).toHaveLength(1)
    await view.click(view.find(node => node.props['aria-label'] === '选择 deepseek 头像'))
    expect(view.all().some(node => node.props.class === 'avatar-picker__option')).toBe(false)
    const preview = view.find(node => node.props['aria-label'] === '服务商头像预览')
    expect(preview.children[0].props['data-brand']).toBe('deepseek')
    expect(preview.children[0].children.some(node => node.type === 'img' && String(node.props.src).includes('deepseek'))).toBe(true)
    await view.click(view.find(node => node.type === 'ElButton' && text(node) === '添加'))
    expect(store.services().find(service => service.id === 'myicons')?.logo).toBe('lobehub:deepseek')
    const row = view.row('我的聚合平台')
    expect(row.children.find(node => node.props.class === 'row__logo')?.children[0].props['data-brand']).toBe('deepseek')
    expect(new ModelConfigStore(database, directory).services().find(service => service.id === 'myicons')?.logo).toBe('lobehub:deepseek')
  })

  it('resets selected and uploaded avatars to the name initial and provides an empty search state', async () => {
    const view = setup(); await drain()
    await view.click(view.find(node => node.props.class === 'rail__add'))
    await view.change('服务商名称', 'Alpha')
    const preview = () => view.find(node => node.props['aria-label'] === '服务商头像预览')
    expect(text(preview())).toBe('A')
    const background = view.find(node => node.props.class === 'ai-brand-icon__avatar').props.style
    await view.change('服务商名称', 'Beta')
    expect(view.find(node => node.props.class === 'ai-brand-icon__avatar').props.style).not.toEqual(background)
    await view.click(view.find(node => node.props['aria-label'] === '打开头像选择器'))
    await view.change('搜索内置头像', 'no-such-brand-123')
    expect(text(view.find(node => node.props.class === 'avatar-picker__empty'))).toBe('没有匹配的图标')
    await view.change('搜索内置头像', 'ollama')
    await view.click(view.find(node => node.props['aria-label'] === '选择 ollama 头像'))
    expect(preview().children[0].props['data-brand']).toBe('ollama')
    await view.click(view.find(node => node.type === 'ElButton' && text(node) === '重置头像'))
    expect(text(preview())).toBe('B')
    vi.stubGlobal('FileReader', class { result = 'data:image/png;base64,AQID'; onload?: () => void; readAsDataURL() { this.onload?.() } })
    await (view.find(node => node.type === 'input' && node.props.type === 'file').props.onChange as Function)({ target: { files: [{}] } })
    await drain()
    expect(preview().children[0].children[0].props.src).toBe('data:image/png;base64,AQID')
    await view.click(view.find(node => node.type === 'ElButton' && text(node) === '重置头像'))
    expect(text(preview())).toBe('B')
  })

  it('changes only the built-in endpoint path on protocol selection and preserves instance credentials and models', async () => {
    const view = setup(); await drain()
    const changeProtocol = async (protocol: string) => {
      await view.change('请求协议', protocol)
      await (view.find(node => node.props['aria-label'] === '请求协议').props.onChange as Function)()
      await new Promise(done => setTimeout(done, 300)); await drain()
    }
    await changeProtocol('anthropic-messages')
    expect(store.get('default')).toMatchObject({ endpoint: 'https://api.deepseek.com/anthropic', protocol: 'anthropic-messages', models: [model] })
    expect(store.getSecret('default')).toBe('original-key')
    expect(text(view.find(node => node.props.class === 'url-preview'))).toContain('https://api.deepseek.com/anthropic/v1/messages')
    await changeProtocol('openai-responses')
    expect(store.get('default')?.endpoint).toBe('https://api.deepseek.com')
    await changeProtocol('openai-completions')
    expect(text(view.find(node => node.props.class === 'url-preview'))).toContain('https://api.deepseek.com/chat/completions')
  })

  it.each([
    ['硅基流动', 'openai-responses'],
    ['百川', 'anthropic-messages'],
  ])('disables unsupported %s protocols in both the configuration panel and instance dialog', async (name, disabled) => {
    const view = setup(); await drain()
    await view.click(view.row(name))
    const options = () => view.all().filter(node => node.type === 'ElOption' && node.props.value === disabled)
    expect(options().every(node => node.props.disabled)).toBe(true)
    await view.context(view.row(name)); await view.command('add')
    expect(options()).toHaveLength(2)
    expect(options().every(node => node.props.disabled)).toBe(true)
  })

  it('keeps all protocols selectable and addresses unchanged for custom services', async () => {
    store.save({ providerKey: 'custom', slug: 'mine', builtin: true, name: '自建代理', endpoint: 'https://proxy.example/v1', models: [], enabled: false })
    const view = setup(); await drain()
    await view.click(view.row('自建代理'))
    expect(view.all().filter(node => node.type === 'ElOption' && ['openai-completions', 'openai-responses', 'anthropic-messages'].includes(node.props.value)).every(node => node.props.disabled === false)).toBe(true)
    await view.change('请求协议', 'anthropic-messages')
    await (view.find(node => node.props['aria-label'] === '请求协议').props.onChange as Function)()
    expect(text(view.find(node => node.props.class === 'url-preview'))).toContain('https://proxy.example/v1/messages')
  })

  it.each([false, true])('places the added providers before Ollama with a saved order: %s', async savedOrder => {
    if (savedOrder) host.preferences.modelProviderOrder = ['kimi', 'deepseek', 'glm', 'minimax', 'qwen', 'ollama']
    const view = setup(); await drain()
    const names = view.all().filter(node => String(node.props.class).includes('row--provider')).map(node => text(node.children.find(child => child.props.class === 'row__name')!))
    const added = ['硅基流动', '百川', '阿里云百炼', '火山引擎(豆包)', 'modelscope魔搭', '腾讯云TokenHub', '百度云千帆', 'Xiaomi Mimo']
    expect(names.slice(names.indexOf('Ollama') - added.length, names.indexOf('Ollama'))).toEqual(added)
    expect(names.slice(0, 5)).toEqual(savedOrder ? ['月之暗面', '深度求索', '智谱', 'MiniMax', '阿里千问'] : ['深度求索', '智谱', '月之暗面', 'MiniMax', '阿里千问'])
  })

  it.each([
    ['siliconcloud', '硅基流动', 'https://api.siliconflow.cn/v1', 'https://cloud.siliconflow.cn/me/models'],
    ['baichuan', '百川', 'https://api.baichuan-ai.com/v1', 'https://platform.baichuan-ai.com/prices'],
    ['bailian', '阿里云百炼', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'https://bailian.console.aliyun.com/cn-beijing/model/market'],
    ['volcengine', '火山引擎(豆包)', 'https://ark.cn-beijing.volces.com/api/v3', 'https://console.volcengine.com/ark/region:cn-beijing/model?view=CARD_VIEW'],
    ['modelscope', 'modelscope魔搭', 'https://api-inference.modelscope.cn/v1', 'https://modelscope.cn/models'],
    ['tokenhub', '腾讯云TokenHub', 'https://tokenhub.tencentmaas.com/v1', 'https://cloud.tencent.com/document/product/1823/130079'],
    ['qianfan', '百度云千帆', 'https://qianfan.baidubce.com/v2', 'https://cloud.baidu.com/doc/qianfan/index.html'],
    ['xiaomimimo', 'Xiaomi Mimo', 'https://api.xiaomimimo.com/v1', 'https://mimo.mi.com/docs/zh-CN/quick-start/summary/model'],
  ])('opens and persists the built-in %s with its verified endpoint and documentation', async (providerKey, name, endpoint, docs) => {
    const view = setup(); await drain()
    await view.click(view.row(name))
    const saved = store.list().find(item => item.providerKey === providerKey)!
    expect(saved).toMatchObject({ name, slug: providerKey, endpoint, builtin: true, authMode: 'api-key', protocol: 'openai-completions', enabled: false, hasApiKey: false, models: [] })
    expect(text(view.find(node => node.props.class === 'url-preview'))).toContain(`${endpoint}/chat/completions`)
    const docsLink = view.find(node => node.type === 'a' && node.props['aria-label'] === '模型文档')
    expect(docsLink.props.href).toBe(docs)
    expect(text(docsLink)).toBe('')
    expect(new ModelConfigStore(database, directory).get(saved.id)).toEqual(saved)
    expect(() => store.deleteService(providerKey)).toThrow('内置服务商不能删除')
    expect(() => store.delete(saved.id)).toThrow('默认实例不能删除')
    await view.click(view.row(name))
    expect(store.list().filter(item => item.providerKey === providerKey)).toHaveLength(1)
  })

  it.each([
    ['baichuan', '百川', 'custom', 'https://platform.baichuan-ai.com/prices'],
    ['bailian', '阿里云百炼', 'qwen', 'https://bailian.console.aliyun.com/cn-beijing/model/market'],
    ['xiaomimimo', 'Xiaomi Mimo', 'custom', 'https://mimo.mi.com/docs/zh-CN/quick-start/summary/model'],
  ] as const)('keeps %s documentation available for connections normalized by an older host', async (slug, name, providerKey, docs) => {
    store.save({ id: `legacy-${slug}`, providerKey, slug, builtin: true, name, endpoint: 'https://proxy.example/v1', models: [], enabled: false })
    const view = setup(); await drain()
    await view.click(view.row(name))
    const docsLink = view.find(node => node.type === 'a' && node.props['aria-label'] === '模型文档')
    expect(docsLink.props.href).toBe(docs)
    expect(text(docsLink)).toBe('')
  })

  it('opens discovery immediately and shows loading until a slow model list arrives', async () => {
    let resolve!: (result: { models: string[] }) => void
    host.api.listModelProviderModels.mockReturnValue(new Promise(done => { resolve = done }))
    const view = setup(); await drain()
    const pending = view.click(view.find(node => node.type === 'ElButton' && text(node).includes('同步模型')))
    await drain()
    expect(view.find(node => node.type === 'drawer').props.title).toBe('深度求索 模型')
    expect(text(view.find(node => node.props.role === 'status'))).toContain('正在同步模型')
    expect(view.all().some(node => text(node) === '未获取到模型')).toBe(false)
    resolve({ models: ['slow-model'] }); await pending
    expect(view.all().some(node => node.props.role === 'status')).toBe(false)
    expect(view.find(node => node.props['aria-label'] === '添加 slow-model')).toBeDefined()
  })
  it.each(['result', 'rejection'])('shows a synchronization %s inline and supports retry without error popups', async failure => {
    if (failure === 'result') host.api.listModelProviderModels.mockResolvedValueOnce({ models: [], error: '查询超时（60 秒）' })
    else host.api.listModelProviderModels.mockRejectedValueOnce(new Error('网络连接失败'))
    const view = setup(); await drain()
    await view.click(view.find(node => node.type === 'ElButton' && text(node).includes('同步模型')))
    expect(view.find(node => node.type === 'drawer')).toBeDefined()
    expect(text(view.find(node => node.props.role === 'alert'))).toContain(failure === 'result' ? '查询超时（60 秒）' : '网络连接失败')
    expect(ElMessage.warning).not.toHaveBeenCalled(); expect(ElMessage.error).not.toHaveBeenCalled()
    await view.click(view.find(node => node.type === 'ElButton' && text(node) === '重试'))
    expect(view.all().some(node => node.props.role === 'alert')).toBe(false)
    expect(view.find(node => node.props['aria-label'] === '添加 new-model')).toBeDefined()
  })
  it('ignores a closed discovery request when a newer synchronization is still loading', async () => {
    const resolves: Array<(result: { models: string[] }) => void> = []
    host.api.listModelProviderModels.mockImplementation(() => new Promise(done => resolves.push(done)))
    const view = setup(); await drain()
    const button = () => view.find(node => node.type === 'ElButton' && text(node).includes('同步模型'))
    const first = view.click(button()); await drain()
    await view.click(view.find(node => node.props['aria-label'] === '关闭同步抽屉'))
    const second = view.click(button()); await drain()
    resolves[0]({ models: ['stale-model'] }); await first
    expect(view.find(node => node.props.role === 'status')).toBeDefined()
    expect(view.all().some(node => text(node).includes('stale-model'))).toBe(false)
    resolves[1]({ models: ['current-model'] }); await second
    expect(view.find(node => node.props['aria-label'] === '添加 current-model')).toBeDefined()
  })
  it('closes discovery when switching instances and discards the previous instance response', async () => {
    addInstance()
    let resolve!: (result: { models: string[] }) => void
    host.api.listModelProviderModels.mockReturnValue(new Promise(done => { resolve = done }))
    const view = setup(); await drain()
    const pending = view.click(view.find(node => node.type === 'ElButton' && text(node).includes('同步模型'))); await drain()
    await view.click(view.row('深度求索1', 'instance'))
    resolve({ models: ['stale-model'] }); await pending
    expect(view.all().some(node => node.type === 'drawer')).toBe(false)
    expect(view.all().some(node => node.props.role === 'status')).toBe(false)
  })
  it('saves models from the centered editor and displays their names while preserving request IDs', async () => {
    host.api.lookupModelMetadata = vi.fn(async () => ({}))
    const view = setup(); await drain()
    await view.click(view.find(node => node.type === 'ElButton' && node.props['aria-label'] === '添加模型'))
    const dialog = view.find(node => node.type === 'dialog')
    expect(dialog.props.title).toBe('添加模型')
    const id = view.find(node => node.type === 'ElInput' && node.props['aria-label'] === '模型 ID')
    ;(id.props['onUpdate:modelValue'] as Function)('manual-model'); await drain()
    await view.change('模型名称', '手动模型')
    await view.click(view.find(node => node.type === 'ElButton' && text(node) === '添加模型'))
    await new Promise(resolve => setTimeout(resolve, 300)); await drain()
    expect(store.get('default')?.models).toContainEqual(expect.objectContaining({ id: 'manual-model', name: '手动模型' }))
    expect(view.all().some(node => node.type === 'span' && text(node) === '手动模型' && node.props.title === 'manual-model')).toBe(true)
    expect(host.api.lookupModelMetadata).not.toHaveBeenCalled()
  })
  it('enables previously disabled models while keeping the instance switch independent and preserving model settings', async () => {
    store.save({ ...original, enabled: false, models: [{ ...model, enabled: false }] })
    const view = setup(); await drain()
    expect(view.all().filter(node => node.type === 'ElSwitch')).toHaveLength(1)
    expect(view.find(node => node.type === 'ElSwitch').props['aria-label']).toBe('启用服务商')
    expect(view.all().some(node => node.props.class === 'mrow__logo')).toBe(true)
    expect(view.all().some(node => node.props.class === 'mrow__model')).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 300)); await drain()
    expect(store.get('default')?.models).toEqual([model])
    expect(store.get('default')?.enabled).toBe(false)
  })

  it('adds and removes synchronized models directly and clears all instance models without losing remaining metadata', async () => {
    const metadata = { name: '自动模型', reasoning: true, multimodal: true, toolCall: true, audioInput: true, videoInput: true, contextWindow: 200000, maxTokens: 64000 }
    const existing = { ...model, multimodal: false, toolCall: false }
    const enriched = { ...existing, audioInput: true }
    host.api.listModelProviderModels.mockResolvedValue({ models: ['test', 'new-model'], metadata: { test: { reasoning: false, multimodal: true, toolCall: true, audioInput: true }, 'new-model': metadata } })
    store.save({ ...original, models: [existing, { ...model, id: 'manual-model' }] })
    const view = setup(); await drain()
    await view.click(view.find(node => node.type === 'ElButton' && text(node).includes('同步模型')))
    expect(view.find(node => node.type === 'drawer').props.title).toBe('深度求索 模型')
    expect(text(view.find(node => node.props.class === 'disc-count'))).toBe('2')
    expect(view.find(node => node.props['aria-label'] === '移除 test').props['aria-pressed']).toBe(true)
    const icons = (node: VueTestNode): string[] => node.props.role === 'img' ? [node.props['aria-label'] as string] : node.children.flatMap(icons)
    expect(icons(view.find(node => node.props['aria-label'] === '移除 test'))).toEqual(['文本', '音频', '推理'])
    expect(icons(view.find(node => node.props['aria-label'] === '添加 new-model'))).toEqual(['文本', '视觉', '音频', '视频', '推理', '工具'])
    await view.click(view.find(node => node.props['aria-label'] === '添加 new-model'))
    expect(view.find(node => node.props['aria-label'] === '移除 new-model').props['aria-pressed']).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 300)); await drain()
    expect(store.get('default')?.models).toEqual([enriched, { ...model, id: 'manual-model' }, { id: 'new-model', enabled: true, ...metadata }])
    const row = view.all().find(node => node.props.class === 'mrow' && text(node).includes('自动模型'))!
    expect(icons(row)).toEqual(['文本', '视觉', '音频', '视频', '推理', '工具'])
    await view.click(view.find(node => node.props['aria-label'] === '移除 new-model'))
    await new Promise(resolve => setTimeout(resolve, 300)); await drain()
    expect(store.get('default')?.models).toEqual([enriched, { ...model, id: 'manual-model' }])
    await view.click(view.find(node => node.props.class === 'disc-clear'))
    expect(view.find(node => node.props.class === 'disc-clear').props.disabled).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 300)); await drain()
    expect(store.get('default')?.models).toEqual([])
    expect(store.getSecret('default')).toBe('original-key')
    expect(host.api.listModelProviderModels).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['deepseek', 'https://api.deepseek.com', 'https://api-docs.deepseek.com/zh-cn/'],
    ['glm', 'https://open.bigmodel.cn/api/paas/v4', 'https://open.bigmodel.cn/console/modelcenter/square'],
    ['glm', 'https://api.z.ai/api/paas/v4', 'https://docs.z.ai/api-reference/introduction'],
    ['kimi', 'https://api.moonshot.cn/v1', 'https://platform.kimi.com/docs/get-api-key'],
    ['kimi', 'https://api.moonshot.ai/v1', 'https://platform.moonshot.ai/docs/'],
    ['minimax', 'https://api.minimaxi.com/v1', 'https://platform.minimax.io/document/Models'],
    ['qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'https://platform.qianwenai.com/docs/developer-guides/getting-started/introduction'],
    ['ollama', 'http://127.0.0.1:11434/v1', 'https://ollama.com/library'],
  ])('opens the corresponding model documentation for %s at %s', async (providerKey, endpoint, href) => {
    addInstance({ id: 'docs-case', name: 'Docs instance', providerKey: providerKey as ModelProviderInput['providerKey'], slug: providerKey, endpoint })
    host.preferences.modelProviderExpanded = [providerKey]
    const view = setup(); await drain()
    await view.click(view.row('Docs instance', 'instance'))
    expect(view.find(node => node.type === 'a' && node.props['aria-label'] === '模型文档').props).toMatchObject({ href, target: '_blank', rel: 'noopener noreferrer' })
    expect(view.all().some(node => node.props.class === 'mtoolbar')).toBe(false)
    expect(view.all().some(node => node.props['aria-label'] === '搜索模型' && node.type === 'input')).toBe(false)
  })

  it('shows domestic and international built-in instances with their own documentation', async () => {
    store.ensureBuiltinInstances()
    host.preferences.modelProviderExpanded = ['glm', 'kimi']
    const view = setup(); await drain()
    expect(view.children()).toEqual(['智谱开放平台', 'z.ai', '月之暗面', 'Moonshot'])
    expect(view.row('月之暗面')).toBeDefined()
    for (const [name, href] of [
      ['智谱开放平台', 'https://open.bigmodel.cn/console/modelcenter/square'],
      ['z.ai', 'https://docs.z.ai/api-reference/introduction'],
      ['月之暗面', 'https://platform.kimi.com/docs/get-api-key'],
      ['Moonshot', 'https://platform.moonshot.ai/docs/'],
    ]) {
      await view.click(view.row(name, 'instance'))
      expect(view.find(node => node.type === 'a' && node.props['aria-label'] === '模型文档').props.href).toBe(href)
    }
  })

  it('displays the provider name for a default instance with a legacy name', async () => {
    store.save({ ...original, name: '深度求索 / DeepSeek' })
    addInstance()
    const view = setup(); await drain()
    expect(view.children()).toEqual(['深度求索1', '深度求索'])
    await view.click(view.row('深度求索', 'instance'))
    expect(text(view.find(node => node.props.class === 'panel__ep'))).toBe('深度求索')
    expect(store.get('default')?.name).toBe('深度求索')
    expect(store.getSecret('default')).toBe('original-key')
    expect(store.get('default')?.models).toEqual([model])
  })

  it.each(['empty', 'flat', 'expanded'])('shows only add-instance on the %s provider menu', async kind => {
    if (kind === 'expanded') addInstance()
    const view = setup(); await drain()
    const name = kind === 'empty' ? '智谱' : '深度求索'
    await view.context(view.row(name))
    expect(host.openMenu).toHaveBeenCalled()
    expect(view.menuItems()).toEqual(['添加实例'])
    expect(view.all().some(node => node.type === 'dialog')).toBe(false)
    expect(host.api.saveModelProvider).not.toHaveBeenCalled()
    await view.command('delete')
    expect(host.confirm).not.toHaveBeenCalled()
    expect(host.api.deleteModelService).not.toHaveBeenCalled()
    await view.command('add')
    expect(view.find(node => node.type === 'dialog').props.title).toBe(`添加 ${name} 实例`)
  })

  it('uses vertical more buttons only on providers with no children', async () => {
    addInstance()
    const view = setup(); await drain()
    expect(view.row('深度求索').children.some(node => node.props['aria-label'] === '深度求索 操作')).toBe(false)
    expect(view.all().some(node => node.props['aria-label'] === '收起 深度求索')).toBe(true)
    const slot = view.row('深度求索').children.find(node => node.props.class === 'row__slot')!
    expect(slot.children.some(node => node.props.class === 'dot')).toBe(true)
    await view.click(view.find(node => node.props['aria-label'] === '智谱 操作'))
    expect(view.menuItems()).toEqual(['添加实例'])
    expect(view.all().filter(node => node.type === 'AppIcon' && node.props.name === 'lucide:ellipsis-vertical').length).toBeGreaterThan(0)
  })

  it('opens a flat provider but only toggles an expanded provider without changing the right panel', async () => {
    addInstance()
    const view = setup(); await drain()
    await view.click(view.row('智谱'))
    const title = text(view.find(node => node.props.class === 'panel__name'))
    await view.click(view.row('深度求索'))
    expect(view.children()).toEqual([])
    expect(text(view.find(node => node.props.class === 'panel__name'))).toBe(title)
    await view.click(view.row('深度求索'))
    expect(view.children()).toEqual(['深度求索1', '深度求索'])
    expect(text(view.find(node => node.props.class === 'panel__name'))).toBe(title)
    await view.click(view.row('深度求索1', 'instance'))
    expect(text(view.find(node => node.props.class === 'panel__name'))).toContain('深度求索1')
  })

  it('gives manual instances exactly edit/delete and preserves configuration on edit', async () => {
    const id = 'custom'
    addInstance()
    const before = store.get(id)!
    const view = setup(); await drain()
    await view.context(view.row(before.name, 'instance'))
    expect(view.menuItems()).toEqual(['编辑', '删除'])
    expect(host.confirm).not.toHaveBeenCalled()
    await view.command('edit')
    await view.change('实例名称', '改名')
    await view.click(view.find(node => node.type === 'ElButton' && text(node) === '保存实例'))
    expect(store.get(id)).toEqual({ ...before, name: '改名', updatedAt: expect.any(Number) })
    expect(store.services()[0].name).toBe('深度求索')
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('hides default instance operations and ignores edit/delete commands from its context menu', async () => {
    addInstance()
    const view = setup(); await drain()
    const before = store.get('default')
    expect(view.all().some(node => node.props['aria-label'] === '深度求索 操作')).toBe(false)
    await view.context(view.row('深度求索1', 'instance'))
    expect(view.menuItems()).toEqual(['编辑', '删除'])
    host.openMenu.mockClear()
    await view.context(view.row('深度求索', 'instance'))
    expect(host.openMenu).not.toHaveBeenCalled()
    expect(view.menuItems()).toEqual([])
    await view.command('edit'); await view.command('delete')
    expect(view.all().some(node => node.type === 'dialog')).toBe(false)
    expect(host.confirm).not.toHaveBeenCalled()
    expect(host.api.deleteModelProvider).not.toHaveBeenCalled()
    expect(store.get('default')).toEqual(before)
    expect(store.getSecret('default')).toBe('original-key')
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('returns to a flat provider after deleting all manual instances and restores the tree when adding again', async () => {
    addInstance()
    addInstance({ id: 'custom-2', name: '深度求索2' })
    const view = setup(); await drain()
    await view.context(view.row('深度求索2', 'instance'))
    await view.command('delete')
    expect(view.children()).toEqual(['深度求索1', '深度求索'])
    await view.context(view.row('深度求索1', 'instance'))
    await view.command('delete')
    expect(host.api.deleteModelProvider).toHaveBeenLastCalledWith('custom')
    expect(view.children()).toEqual([])
    expect(view.all().some(node => node.props['aria-label'] === '收起 深度求索')).toBe(false)
    expect(view.all().some(node => node.props['aria-label'] === '深度求索 操作')).toBe(true)
    await view.click(view.row('深度求索'))
    expect(view.row('深度求索').props.class).toContain('is-active')
    const title = view.find(node => node.props.class === 'panel__name')
    expect(text(title.children[0])).toBe('深度求索')
    expect(title.children.some(node => node.props.class === 'panel__ep')).toBe(false)
    expect(store.list().map(item => item.id)).toEqual(['default'])
    expect(store.getSecret('default')).toBe('original-key')
    expect(store.get('default')?.models).toEqual([model])
    store = new ModelConfigStore(database, directory)
    const reopened = setup(); await drain()
    expect(reopened.children()).toEqual([])
    await reopened.context(reopened.row('深度求索'))
    expect(reopened.menuItems()).toEqual(['添加实例'])
    await reopened.command('add')
    await reopened.change('实例名称', '重新添加')
    await reopened.click(reopened.find(node => node.type === 'ElButton' && text(node) === '添加实例'))
    expect(reopened.children()).toEqual(['重新添加', '深度求索'])
    expect(store.list()).toHaveLength(2)
    expect(store.getSecret('default')).toBe('original-key')
  })

  it('prepends the first and subsequent instances while retaining the original connection and saved order', async () => {
    const view = setup(); await drain()
    for (const name of ['123', '456']) {
      await view.context(view.row('深度求索'))
      await view.command('add')
      await view.change('实例名称', name)
      await view.click(view.find(node => node.type === 'ElButton' && text(node) === '添加实例'))
    }
    expect(view.children()).toEqual(['456', '123', '深度求索'])
    expect(store.get('default')?.models).toEqual([model])
    expect(store.getSecret('default')).toBe('original-key')
    expect(new Set(store.list().map(item => item.slug))).toEqual(new Set(['deepseek']))
    const reopened = setup(); await drain()
    expect(reopened.children()).toEqual(['456', '123', '深度求索'])
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('creates a default instance when the first addition comes from an untouched provider', async () => {
    const view = setup(); await drain()
    await view.context(view.row('智谱'))
    await view.command('add')
    await view.change('实例名称', '智谱1')
    await view.click(view.find(node => node.type === 'ElButton' && text(node) === '添加实例'))
    expect(view.children()).toEqual(['智谱1', '智谱'])
    expect(store.list().filter(item => item.slug === 'glm')).toHaveLength(2)
  })

  it('keeps custom service identity independent of preset addresses and instance names', async () => {
    const view = setup(); await drain()
    await view.click(view.find(node => node.type === 'button' && text(node) === '添加服务商'))
    const slug = view.find(node => node.type === 'ElInput' && node.props.placeholder === 'siliconflow')
    ;(slug.props['onUpdate:modelValue'] as Function)('myProvider'); (slug.props.onInput as Function)('myProvider')
    await view.change('服务商名称', '我的服务商')
    const endpoint = view.find(node => node.type === 'ElInput' && node.props.placeholder === 'https://api.example.com/v1')
    ;(endpoint.props['onUpdate:modelValue'] as Function)('https://api.deepseek.com/v1'); await drain()
    await view.click(view.find(node => node.type === 'ElButton' && text(node) === '添加'))
    expect(view.all().some(node => String(node.props.class).includes('row--instance'))).toBe(false)
    await view.context(view.row('我的服务商'))
    expect(view.menuItems()).toEqual(['添加实例', '删除'])
    await view.command('add')
    await view.change('实例名称', '独立实例')
    await view.click(view.find(node => node.type === 'ElButton' && text(node) === '添加实例'))
    expect(view.children()).toEqual(['独立实例', '我的服务商'])
    expect(store.list().filter(item => item.slug === 'myProvider').map(item => item.providerKey)).toEqual(['custom', 'custom'])
    await view.context(view.row('我的服务商', 'instance'))
    expect(view.menuItems()).toEqual([])
    await view.context(view.row('独立实例', 'instance'))
    expect(view.menuItems()).toEqual(['编辑', '删除'])
    await view.command('delete')
    expect(view.row('我的服务商')).toBeTruthy()
    expect(view.children()).toEqual([])
    expect(store.list().filter(item => item.slug === 'myProvider')).toHaveLength(1)
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it.each([false, true])('deletes a manual provider with expanded=%s only after confirmation', async expanded => {
    const root = store.save({ providerKey: 'custom', slug: 'myProvider', builtin: true, serviceName: '我的服务商', name: '我的服务商', endpoint: 'https://example.com', models: [], enabled: false })
    if (expanded) store.save({ providerKey: 'custom', slug: 'myProvider', asInstance: true, name: '项目实例', endpoint: root.endpoint, models: [], enabled: false })
    host.preferences.modelProviderExpanded.push('myProvider')
    const view = setup(); await drain()
    await view.click(view.row(expanded ? '项目实例' : '我的服务商', expanded ? 'instance' : 'provider'))
    await view.context(view.row('我的服务商'))
    expect(view.menuItems()).toEqual(['添加实例', '删除'])
    host.confirm.mockRejectedValueOnce(new Error('cancel'))
    await view.command('delete')
    expect(host.api.deleteModelService).not.toHaveBeenCalled()
    expect(store.get(root.id)).toBeDefined()
    await view.command('delete')
    expect(host.confirm).toHaveBeenLastCalledWith(expect.stringContaining('及其全部实例'), '删除服务商', expect.any(Object))
    expect(host.api.deleteModelService).toHaveBeenCalledExactlyOnceWith('myProvider')
    expect(view.all().some(node => node.props.class === 'row__name' && text(node) === '我的服务商')).toBe(false)
    expect(store.list().some(item => item.slug === 'myProvider')).toBe(false)
    expect(store.services().some(item => item.id === 'myProvider')).toBe(false)
    expect(store.get('default')).toBeDefined()
    expect(ElMessage.success).not.toHaveBeenCalled()
    store = new ModelConfigStore(database, directory)
    expect(store.services().some(item => item.id === 'myProvider')).toBe(false)
  })

  it('persists provider and instance drag ordering without success notifications', async () => {
    addInstance(); addInstance({ id: 'custom-2', name: '深度求索2' })
    const view = setup(); await drain()
    const event = { dataTransfer: { setData() {} }, preventDefault() {}, stopPropagation() {} }
    ;(view.row('深度求索').props.onDragstart as Function)(event)
    ;(view.row('智谱').props.onDrop as Function)(event)
    await drain()
    expect(host.preferences.modelProviderOrder.slice(0, 2)).toEqual(['glm', 'deepseek'])
    ;(view.row('深度求索1', 'instance').props.onDragstart as Function)(event)
    ;(view.row('深度求索2', 'instance').props.onDrop as Function)(event)
    await drain()
    expect(view.children()).toEqual(['深度求索1', '深度求索2', '深度求索'])
    expect(host.preferences['modelInstanceOrder:deepseek']).toEqual(['custom', 'custom-2', 'default'])
    expect(ElMessage.success).not.toHaveBeenCalled()
  })
})
