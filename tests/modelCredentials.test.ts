import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import Component from '../src/pages/backend/modelConfig/components/ModelCredentials.vue'
import ModelCapabilities from '../src/pages/backend/modelConfig/components/ModelCapabilities.vue'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'
import type { ModelProviderInput } from '../src/config/harness'

const host = vi.hoisted(() => ({ api: undefined as any, confirm: vi.fn(async () => undefined) }))
vi.mock('vue', async original => ({ ...await original<typeof import('vue')>(), vModelCheckbox: {} }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: host.confirm }, ElMessage: { success: vi.fn() } }))
vi.mock('../src/pages/backend/settings/components/SettingsTooltip.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('tooltip', slots.default?.()) } }))
const Page = withVueClientRender(Component, new URL('../src/pages/backend/modelConfig/components/ModelCredentials.vue', import.meta.url))
Object.assign(ModelCapabilities, withVueClientRender(ModelCapabilities, new URL('../src/pages/backend/modelConfig/components/ModelCapabilities.vue', import.meta.url)))
Object.assign(Page, { directives: { loading: {} } })
const passthrough = (tag: string) => defineComponent({ setup: (_, { attrs, slots, expose }) => { expose({ focus() {} }); return () => h(tag, attrs, slots.default?.()) } })
const overlay = defineComponent({ props: ['modelValue', 'title'], setup: (props, { slots }) => () => props.modelValue ? h('dialog', { title: props.title }, [slots.default?.(), slots.footer?.()]) : null })
const components = { ...Object.fromEntries(['ElButton', 'ElInput', 'ElTooltip', 'ElSelect', 'ElOption', 'AppIcon'].map(name => [name, passthrough(name)])), ElDialog: overlay, ElDrawer: overlay }
let unmount: () => void
async function drain() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick() } }
const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
function setup(patch: Partial<ModelProviderInput> = {}, savedKey = '') {
  const renderer = createVueNodeRenderer()
  const state = reactive({ provider: { id: 'instance', name: 'Example', providerKey: 'deepseek', endpoint: 'https://example.com/v1', authMode: 'api-key', enabled: false, models: [], ...patch } as ModelProviderInput, savedKey })
  const saved = vi.fn((provider, key) => { state.provider = { ...state.provider, ...provider }; if (key !== undefined) state.savedKey = key })
  const instance = ref()
  const Root = defineComponent({ setup: () => () => h(Page, { ...state, ref: instance, onSaved: saved }) })
  const { app } = renderer.mount(Root, {}, components)
  unmount = () => app.unmount()
  const find = (predicate: (node: VueTestNode) => boolean) => { const value = renderer.all().find(predicate); if (!value) throw Error('Missing control'); return value }
  const button = (label: string) => find(node => node.type === 'ElButton' && text(node) === label)
  const click = async (label: string) => { await (button(label).props.onClick as Function)(); await drain() }
  const key = async (value: string) => { (find(node => node.props['aria-label'] === '输入 API 密钥').props['onUpdate:modelValue'] as Function)(value); await drain() }
  const pick = async (ids: string[]) => { (find(node => node.type === 'input' && node.props.type === 'checkbox').props['onUpdate:modelValue'] as Function)(ids); await drain() }
  return { instance: instance.value as any, find, click, key, pick, saved, all: renderer.all, button }
}
beforeEach(() => {
  host.api = {
    getModelProviderApiKeys: vi.fn(async () => []),
    saveModelProvider: vi.fn(async (input: ModelProviderInput) => ({ ...input, id: input.id || 'instance', hasApiKey: !input.clearApiKey, createdAt: 0, updatedAt: 0 })),
    listModelProviderModels: vi.fn(async () => ({ models: ['model-a', 'model-b'] })),
    testModelProvider: vi.fn(async () => ({ ok: true, text: '连接成功' })),
  }
  host.confirm.mockClear()
})
afterEach(() => unmount?.())

describe('API key configuration flow', () => {
  it('saves a key, discovers models, tests the selection and only then enables', async () => {
    const view = setup(); await view.instance.openKey(); await drain()
    expect(view.button('下一步').props.disabled).toBe(true)
    await view.key('test-key'); await view.click('下一步')
    expect(host.api.listModelProviderModels).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'test-key' }))
    expect(view.all().filter(node => node.type === 'input' && node.props.type === 'checkbox')).toHaveLength(2)
    await view.pick(['model-b']); await view.click('添加所选模型')
    expect(host.api.testModelProvider).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'test-key', models: [expect.objectContaining({ id: 'model-b' })] }), 'model-b')
    expect(host.api.saveModelProvider).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }))
    expect(view.all().some(node => node.type === 'dialog')).toBe(false)
  })
  it('keeps the instance disabled and shows retry actions after verification fails', async () => {
    host.api.testModelProvider.mockResolvedValueOnce({ ok: false, text: 'HTTP 401' })
    const view = setup(); await view.instance.openKey(); await view.key('bad-key'); await view.click('下一步'); await view.pick(['model-a']); await view.click('添加所选模型')
    expect(view.find(node => node.props.role === 'alert').text).toBe('HTTP 401')
    expect(host.api.saveModelProvider.mock.calls.every(([input]: [ModelProviderInput]) => input.enabled === false)).toBe(true)
    await view.click('重新检测')
    expect(host.api.saveModelProvider).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }))
  })
  it('shows discovered capabilities and saves the catalog metadata before verification', async () => {
    const metadata = { name: '自动名称', reasoning: true, multimodal: true, toolCall: true, audioInput: true, videoInput: true, contextWindow: 200000, maxTokens: 64000 }
    host.api.listModelProviderModels.mockResolvedValue({ models: ['model-a', 'model-b'], metadata: { 'model-b': metadata } })
    const view = setup(); await view.instance.openKey(); await view.key('test-key'); await view.click('下一步')
    expect(view.all().filter(node => node.props.role === 'img').map(node => node.props['aria-label'])).toEqual(['文本', '文本', '视觉', '音频', '视频', '推理', '工具'])
    await view.pick(['model-b']); await view.click('添加所选模型')
    expect(host.api.testModelProvider).toHaveBeenCalledWith(expect.objectContaining({ models: [{ id: 'model-b', enabled: true, ...metadata }] }), 'model-b')
    expect(host.api.saveModelProvider).toHaveBeenLastCalledWith(expect.objectContaining({ models: [{ id: 'model-b', enabled: true, ...metadata }], enabled: true }))
  })
  it('preserves configured capabilities and token limits when selecting an existing model again', async () => {
    const existing = { id: 'model-a', name: '手动名称', enabled: true, reasoning: false, multimodal: false, contextWindow: 8192, maxTokens: 1234 }
    host.api.listModelProviderModels.mockResolvedValue({ models: ['model-a'], metadata: { 'model-a': { reasoning: true, multimodal: true, toolCall: true, audioInput: true, contextWindow: 200000, maxTokens: 64000 } } })
    const view = setup({ models: [existing] }); await view.instance.openKey(); await view.key('test-key'); await view.click('下一步')
    expect(view.all().filter(node => node.props.role === 'img').map(node => node.props['aria-label'])).toEqual(['文本', '音频', '工具'])
    await view.pick(['model-a']); await view.click('添加所选模型')
    expect(host.api.testModelProvider).toHaveBeenCalledWith(expect.objectContaining({ models: [{ ...existing, toolCall: true, audioInput: true }] }), 'model-a')
  })
  it('keeps a saved key when model selection is skipped', async () => {
    const view = setup(); await view.instance.openKey(); await view.key('test-key'); await view.click('下一步'); await view.click('跳过')
    expect(view.saved).toHaveBeenCalledWith(expect.anything(), 'test-key')
    expect(host.api.testModelProvider).not.toHaveBeenCalled()
    expect(host.api.saveModelProvider).toHaveBeenCalledTimes(1)
    expect(view.all().some(node => node.type === 'dialog')).toBe(false)
  })
  it('retains an entered key when discovery fails and supports retry and editing', async () => {
    host.api.listModelProviderModels.mockRejectedValueOnce(new Error('网络失败'))
    const view = setup(); await view.instance.openKey(); await view.key('test-key'); await view.click('下一步')
    expect(view.find(node => node.props.role === 'alert').text).toBe('网络失败')
    await view.click('重试'); expect(host.api.listModelProviderModels).toHaveBeenCalledTimes(2)
    await view.click('修改密钥'); await view.key('replacement'); await view.click('保存并关闭')
    expect(host.api.saveModelProvider).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: 'replacement' }))
  })
  it('replaces a key without changing models, and disables the instance until verification', async () => {
    const models = [{ id: 'existing', enabled: true, reasoning: false, contextWindow: 8192 }]
    const view = setup({ models, enabled: true }, 'old-key')
    await view.instance.openKey(); await drain()
    await view.key('new-key'); await view.click('保存并关闭')
    expect(host.api.saveModelProvider).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: 'new-key', enabled: false, models }))
  })
  it('supports selecting one model or testing all models with the saved key', async () => {
    const models = ['model-a', 'model-b'].map((id, index) => ({ id, enabled: true, reasoning: index === 1, multimodal: index === 1, contextWindow: 8192 }))
    const view = setup({ models }, 'saved-key'); await view.instance.openTest(); await drain()
    expect(view.all().filter(node => node.props.role === 'img').map(node => node.props['aria-label'])).toEqual(['文本', '文本', '视觉', '推理'])
    await view.click('开始')
    expect(host.api.testModelProvider).toHaveBeenCalledTimes(1)
    expect(host.api.testModelProvider).toHaveBeenLastCalledWith(expect.anything(), 'model-a')
    await view.click('检测所有模型')
    expect(host.api.testModelProvider).toHaveBeenCalledTimes(3)
    expect(view.all().filter(node => node.props.class === 'credential-result')).toHaveLength(2)
    expect(view.all().filter(node => node.props.role === 'img').map(node => node.props['aria-label'])).toEqual(['文本', '文本', '视觉', '推理', '文本', '文本', '视觉', '推理'])
  })
  it('shows the empty manager and explicitly clears a configured key on deletion', async () => {
    const view = setup({}, 'saved-key'); await view.instance.removeKey(); await drain()
    expect(host.confirm).toHaveBeenCalled()
    expect(host.api.saveModelProvider).toHaveBeenLastCalledWith(expect.objectContaining({ clearApiKey: true, enabled: false }))
    expect(view.saved).toHaveBeenCalledWith(expect.anything(), '')
  })
  it('discovers models without requesting a key for a keyless local instance', async () => {
    const view = setup({ authMode: 'none' }); await view.instance.openTest(); await drain()
    expect(host.api.listModelProviderModels).toHaveBeenCalled()
    expect(view.all().some(node => node.props['aria-label'] === '输入 API 密钥')).toBe(false)
  })
})
